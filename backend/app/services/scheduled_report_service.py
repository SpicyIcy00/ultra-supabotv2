"""
Scheduled AI-chat report orchestration.

CRUD for scheduled reports plus the run logic: re-execute the saved SQL, format
the answer, build a CSV, and deliver both to Telegram. Also owns the "is this
report due?" calculation used by the scheduler tick.
"""
import csv
import html
import io
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduled_report import ScheduledReport
from app.services.query_executor import QueryExecutor
from app.services.response_formatter import ResponseFormatter
from app.services.presentation_intelligence import PresentationIntelligence
from app.services import telegram_sender
from app.services import chart_image

MANILA = ZoneInfo("Asia/Manila")

# Columns that are position indexes / ids — never shown as a headline metric.
_NON_METRIC = re.compile(r'^(rank|position|row_number|row_num|index|idx|.*_id|id)$', re.IGNORECASE)

# Editable fields accepted from the API (everything else is server-managed).
_EDITABLE = {
    "title", "question", "sql", "frequency", "day_of_week",
    "hour", "minute", "telegram_chat_id", "include_csv", "enabled",
}


class ScheduledReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ----------------------------------------------------------------
    # CRUD
    # ----------------------------------------------------------------

    async def list_reports(self) -> List[Dict[str, Any]]:
        result = await self.db.execute(
            select(ScheduledReport).order_by(ScheduledReport.created_at.desc())
        )
        return [self._to_dict(r) for r in result.scalars().all()]

    async def get_report(self, report_id: str) -> Optional[ScheduledReport]:
        result = await self.db.execute(
            select(ScheduledReport).where(ScheduledReport.id == report_id)
        )
        return result.scalar_one_or_none()

    async def create_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        payload = {k: v for k, v in data.items() if k in _EDITABLE}
        report = ScheduledReport(id=str(uuid.uuid4()), **payload)
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)
        return self._to_dict(report)

    async def update_report(self, report_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        report = await self.get_report(report_id)
        if not report:
            return None
        for key, value in data.items():
            if key in _EDITABLE and value is not None:
                setattr(report, key, value)
        await self.db.commit()
        await self.db.refresh(report)
        return self._to_dict(report)

    async def delete_report(self, report_id: str) -> bool:
        report = await self.get_report(report_id)
        if not report:
            return False
        await self.db.delete(report)
        await self.db.commit()
        return True

    @staticmethod
    def _to_dict(r: ScheduledReport) -> Dict[str, Any]:
        return {
            "id": r.id,
            "title": r.title,
            "question": r.question,
            "sql": r.sql,
            "frequency": r.frequency,
            "day_of_week": r.day_of_week,
            "hour": r.hour,
            "minute": r.minute,
            "telegram_chat_id": r.telegram_chat_id,
            "include_csv": r.include_csv,
            "enabled": r.enabled,
            "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
            "last_run_status": r.last_run_status,
            "last_run_detail": r.last_run_detail,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }

    # ----------------------------------------------------------------
    # Due calculation
    # ----------------------------------------------------------------

    @staticmethod
    def _slot_start(now: datetime, report: ScheduledReport) -> datetime:
        """Most recent scheduled slot (<= now) for this report, in Manila time."""
        if report.frequency == "weekly":
            days_since = (now.weekday() - report.day_of_week) % 7
            slot = (now - timedelta(days=days_since)).replace(
                hour=report.hour, minute=report.minute, second=0, microsecond=0
            )
            if slot > now:
                slot -= timedelta(days=7)
            return slot
        # daily
        slot = now.replace(hour=report.hour, minute=report.minute, second=0, microsecond=0)
        if slot > now:
            slot -= timedelta(days=1)
        return slot

    def is_due(self, report: ScheduledReport, now: datetime) -> bool:
        if not report.enabled:
            return False
        slot = self._slot_start(now, report)
        if now < slot:
            return False
        last = report.last_run_at
        if last is not None:
            if last.tzinfo is None:
                last = last.replace(tzinfo=MANILA)
            if last >= slot:
                return False  # already ran for this slot
        return True

    # ----------------------------------------------------------------
    # Run + deliver
    # ----------------------------------------------------------------

    @staticmethod
    def _build_csv(rows: List[Dict[str, Any]]) -> bytes:
        output = io.StringIO()
        headers = list(rows[0].keys())
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([row.get(h, "") for h in headers])
        return output.getvalue().encode("utf-8-sig")  # BOM so Excel opens UTF-8 cleanly

    async def run_one(self, report: ScheduledReport, triggered_by: str = "schedule") -> Dict[str, Any]:
        """Re-run the saved SQL and deliver to Telegram (chart image + clean
        message + CSV). Records last_run_* on the report."""
        run_date = date.today().isoformat()
        chat_id = report.telegram_chat_id
        try:
            executor = QueryExecutor(self.db)
            execution = await executor.execute_query(report.sql, timeout=30, validate=True)
            rows = execution["results"]
            row_count = execution["row_count"]

            if not rows:
                await telegram_sender.send_message(
                    chat_id, f"📊 <b>{html.escape(report.title)}</b>\n{run_date} — no data today.",
                    parse_mode="HTML",
                )
                await self._record(report, "success", f"{triggered_by}: 0 rows")
                return {"status": "success", "row_count": 0}

            presenter = PresentationIntelligence()
            spec = await presenter.analyze(report.question, rows)

            # 1) Chart image (best-effort — text still delivers if this fails).
            chart_cfg = presenter.build_chart(report.question, rows, spec)
            png = await chart_image.render_chart_png(chart_cfg)
            if png:
                await telegram_sender.send_photo(chat_id, png, caption=f"{report.title} — {run_date}")

            # 2) Clean, Telegram-native message (no raw markdown).
            message = self._build_telegram_html(report.title, run_date, row_count, rows, spec)
            msg_result = await telegram_sender.send_message(chat_id, message, parse_mode="HTML")
            if not msg_result.get("success"):
                await self._record(report, "failed", f"Telegram send failed: {msg_result.get('error')}")
                return {"status": "failed", "error": msg_result.get("error")}

            # 3) CSV attachment with the full detail.
            if report.include_csv:
                csv_bytes = self._build_csv(rows)
                filename = f"{report.title.replace(' ', '_')[:40]}_{run_date}.csv"
                doc = await telegram_sender.send_document(
                    chat_id, filename, csv_bytes, caption=f"{report.title} — {run_date}",
                )
                if not doc.get("success"):
                    await self._record(report, "partial", f"Message sent; CSV failed: {doc.get('error')}")
                    return {"status": "partial", "row_count": row_count, "error": doc.get("error")}

            await self._record(report, "success", f"{triggered_by}: {row_count} rows delivered")
            return {"status": "success", "row_count": row_count}

        except Exception as e:
            await self._record(report, "failed", f"{triggered_by}: {str(e)[:400]}")
            return {"status": "failed", "error": str(e)}

    # ----------------------------------------------------------------
    # Telegram-native formatting (HTML parse mode, monospace table)
    # ----------------------------------------------------------------

    def _build_telegram_html(
        self, title: str, run_date: str, row_count: int,
        rows: List[Dict[str, Any]], spec: Optional[Dict[str, Any]],
    ) -> str:
        formatter = ResponseFormatter()
        cols = list(rows[0].keys())
        label = (spec or {}).get("label_column") or self._first_text_col(rows)
        value_cols = [c for c in ((spec or {}).get("value_columns") or cols) if c != label]

        head = f"📊 <b>{html.escape(title)}</b>\n{run_date} · {row_count} row{'s' if row_count != 1 else ''}"

        # Single-row summary -> key/value lines.
        if row_count == 1:
            lines = [head, ""]
            for c in (value_cols or cols):
                val = formatter._format_value(rows[0].get(c), c)
                lines.append(f"• <b>{html.escape(self._label(c))}</b>: {html.escape(str(val))}")
            return "\n".join(lines)

        # Multi-row -> compact monospace table of label + up to 3 key metrics.
        metric_cols = [c for c in value_cols if not _NON_METRIC.match(c)]
        show_cols = metric_cols[:3] if metric_cols else value_cols[:3]
        table = self._monospace_table(rows, label, show_cols, formatter)

        parts = [head, "", f"<pre>{html.escape(table)}</pre>"]

        # A couple of plain insights (stripped of markdown).
        insights = formatter._generate_insights_ranking(rows)
        if insights:
            parts.append("")
            parts.append("<b>Key insights</b>")
            for ins in insights[:3]:
                parts.append(f"• {html.escape(self._strip_md(ins))}")

        if len(show_cols) < len(value_cols):
            parts.append("")
            parts.append("<i>Full detail in the attached CSV.</i>")
        return "\n".join(parts)

    def _monospace_table(
        self, rows: List[Dict[str, Any]], label: Optional[str],
        show_cols: List[str], formatter: ResponseFormatter, max_rows: int = 15,
    ) -> str:
        headers = ([self._label(label)] if label else ["#"]) + [self._short_label(c) for c in show_cols]
        table_rows: List[List[str]] = []
        for idx, row in enumerate(rows[:max_rows], 1):
            name = str(row.get(label, "")) if label else str(idx)
            if len(name) > 12:
                name = name[:11] + "…"
            cells = [name]
            for c in show_cols:
                cells.append(self._compact_value(row.get(c), c, formatter))
            table_rows.append(cells)

        # Column widths.
        widths = [len(h) for h in headers]
        for r in table_rows:
            for i, cell in enumerate(r):
                widths[i] = max(widths[i], len(cell))

        def fmt_row(cells: List[str]) -> str:
            # Left-align the label column, right-align numeric columns.
            out = [cells[0].ljust(widths[0])]
            out += [cells[i].rjust(widths[i]) for i in range(1, len(cells))]
            return "  ".join(out)

        lines = [fmt_row(headers), "-" * (sum(widths) + 2 * (len(widths) - 1))]
        lines += [fmt_row(r) for r in table_rows]
        if len(rows) > max_rows:
            lines.append(f"… +{len(rows) - max_rows} more (see CSV)")
        return "\n".join(lines)

    @staticmethod
    def _compact_value(value: Any, col: str, formatter: ResponseFormatter) -> str:
        """Short value for a narrow mobile column (₱13.0k, +32.5%, 29)."""
        if value is None:
            return "-"
        col_l = col.lower()
        is_pct = any(k in col_l for k in ('pct', 'percent', 'ratio', 'change', 'margin'))
        is_ccy = any(k in col_l for k in ('sales', 'revenue', 'amount', 'cost', 'profit', 'price', 'basket'))
        if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
            v = float(value)
            if is_pct:
                return f"{'+' if v > 0 else ''}{v:.1f}%"
            if is_ccy:
                if abs(v) >= 1_000_000:
                    return f"₱{v/1_000_000:.1f}M"
                if abs(v) >= 1_000:
                    return f"₱{v/1_000:.1f}k"
                return f"₱{v:,.0f}"
            if v == int(v):
                return f"{int(v):,}"
            return f"{v:,.1f}"
        return str(value)

    @staticmethod
    def _label(col: Optional[str]) -> str:
        return (col or "").replace('_', ' ').title()

    @staticmethod
    def _short_label(col: str) -> str:
        """Abbreviate common column names for narrow table headers."""
        c = col.lower()
        table = {
            'sales_change_pct': 'Δ%', 'txn_count_change_pct': 'Txn Δ%',
            'basket_size_change_pct': 'Bskt Δ%', 'today_net_sales': 'Sales',
            'yesterday_sales': 'Sales', 'today_txn_count': 'Txns',
            'yesterday_txn_count': 'Txns', 'today_avg_basket': 'Basket',
            'yesterday_avg_basket': 'Basket', 'revenue': 'Revenue',
            'total_sales': 'Sales', 'quantity': 'Qty', 'units': 'Units',
        }
        if c in table:
            return table[c]
        short = col.replace('_', ' ').title()
        return short if len(short) <= 8 else short[:8]

    @staticmethod
    def _strip_md(text: str) -> str:
        return re.sub(r'[*_`#]+', '', text)

    @staticmethod
    def _first_text_col(rows: List[Dict[str, Any]]) -> Optional[str]:
        for c, v in rows[0].items():
            if isinstance(v, str) and v.strip():
                return c
        return None

    async def _record(self, report: ScheduledReport, status: str, detail: str) -> None:
        try:
            report.last_run_at = datetime.now(MANILA)
            report.last_run_status = status
            report.last_run_detail = detail[:500]
            await self.db.commit()
        except Exception:
            await self.db.rollback()

    async def run_due(self) -> Dict[str, Any]:
        """Run every report that is currently due. Called by the scheduler tick."""
        now = datetime.now(MANILA)
        result = await self.db.execute(
            select(ScheduledReport).where(ScheduledReport.enabled == True)  # noqa: E712
        )
        reports = result.scalars().all()
        ran = 0
        for report in reports:
            if self.is_due(report, now):
                await self.run_one(report, triggered_by="schedule")
                ran += 1
        return {"checked": len(reports), "ran": ran}
