"""
Scheduled AI-chat report orchestration.

CRUD for scheduled reports plus the run logic: re-execute the saved SQL, format
the answer, build a CSV, and deliver both to Telegram. Also owns the "is this
report due?" calculation used by the scheduler tick.
"""
import calendar
import csv
import html
import io
import json
import re
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduled_report import ScheduledReport
from app.services.query_executor import QueryExecutor
from app.services.response_formatter import ResponseFormatter
from app.services.presentation_intelligence import PresentationIntelligence
from app.services import telegram_sender

MANILA = ZoneInfo("Asia/Manila")

# Columns that are position indexes / ids — never shown as a headline metric.
# Token-aware + search so "store_rank"/"sales_rank"/"row_number" are caught.
_NON_METRIC = re.compile(
    r'(?:^|_)(rank|ranking|position|index|idx|id|rownum|seq|sequence|ordinal|row)(?:_|$)',
    re.IGNORECASE,
)

# Editable fields accepted from the API (everything else is server-managed).
_SIMPLE_FIELDS = {"title", "question", "sql", "frequency", "include_csv", "enabled"}


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
        payload = self._normalize_payload(data)
        report = ScheduledReport(id=str(uuid.uuid4()), **payload)
        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)
        return self._to_dict(report)

    async def update_report(self, report_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        report = await self.get_report(report_id)
        if not report:
            return None
        for key, value in self._normalize_payload(data, partial=True).items():
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

    # ---- payload normalization (API list-fields -> model columns) ----

    @staticmethod
    def _fmt_time(t: Any) -> Optional[str]:
        try:
            h, m = str(t).split(":")
            h, m = int(h), int(m)
            if 0 <= h <= 23 and 0 <= m <= 59:
                return f"{h:02d}:{m:02d}"
        except Exception:
            pass
        return None

    def _normalize_payload(self, data: Dict[str, Any], partial: bool = False) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for k in _SIMPLE_FIELDS:
            if k in data and data[k] is not None:
                out[k] = data[k]

        # times -> JSON list of "HH:MM"; keep legacy hour/minute in sync.
        times = data.get("times")
        if isinstance(times, list):
            norm = [self._fmt_time(t) for t in times]
            norm = [t for t in norm if t]
            if norm:
                out["times"] = json.dumps(norm)
                h, m = norm[0].split(":")
                out["hour"], out["minute"] = int(h), int(m)
        elif not partial and ("hour" in data or "minute" in data):
            h, m = int(data.get("hour", 8)), int(data.get("minute", 0))
            out["hour"], out["minute"] = h, m
            out["times"] = json.dumps([f"{h:02d}:{m:02d}"])

        # days_of_week -> JSON list of ints (Mon=0..Sun=6); keep legacy in sync.
        dow = data.get("days_of_week")
        if isinstance(dow, list):
            vals = sorted({int(x) for x in dow if 0 <= int(x) <= 6})
            if vals:
                out["days_of_week"] = json.dumps(vals)
                out["day_of_week"] = vals[0]
        elif not partial and data.get("day_of_week") is not None:
            out["day_of_week"] = int(data["day_of_week"])
            out["days_of_week"] = json.dumps([out["day_of_week"]])

        # days_of_month -> JSON list of ints 1..31 (31 => last day of month).
        dom = data.get("days_of_month")
        if isinstance(dom, list):
            vals = sorted({int(x) for x in dom if 1 <= int(x) <= 31})
            if vals:
                out["days_of_month"] = json.dumps(vals)

        # day_times -> {"0": ["08:00"], "5": ["10:00","16:00"]} per-weekday times.
        dt = data.get("day_times")
        if isinstance(dt, dict):
            norm_dt: Dict[str, List[str]] = {}
            for k, v in dt.items():
                try:
                    wd = int(k)
                except (ValueError, TypeError):
                    continue
                if not (0 <= wd <= 6) or not isinstance(v, list):
                    continue
                ts = sorted({t for t in (self._fmt_time(x) for x in v) if t})
                if ts:
                    norm_dt[str(wd)] = ts
            if norm_dt:
                out["day_times"] = json.dumps(norm_dt)
                # Keep legacy hour/minute in sync with the earliest configured time.
                earliest = min(t for ts in norm_dt.values() for t in ts)
                h, m = earliest.split(":")
                out["hour"], out["minute"] = int(h), int(m)

        # telegram_chat_ids -> JSON list; keep legacy single chat in sync.
        cids = data.get("telegram_chat_ids")
        if isinstance(cids, list):
            vals = [str(c).strip() for c in cids if str(c).strip()]
            if vals:
                out["telegram_chat_ids"] = json.dumps(vals)
                out["telegram_chat_id"] = vals[0]
        elif data.get("telegram_chat_id"):
            cid = str(data["telegram_chat_id"]).strip()
            out["telegram_chat_id"] = cid
            out["telegram_chat_ids"] = json.dumps([cid])

        return out

    # ---- schedule accessors (new JSON columns, legacy fallback) ----

    @staticmethod
    def _json_list(raw: Optional[str]) -> Optional[list]:
        if not raw:
            return None
        try:
            v = json.loads(raw)
            return v if isinstance(v, list) else None
        except Exception:
            return None

    def _times(self, r: ScheduledReport) -> List[Tuple[int, int]]:
        raw = self._json_list(r.times)
        if raw:
            out = []
            for t in raw:
                fmt = self._fmt_time(t)
                if fmt:
                    h, m = fmt.split(":")
                    out.append((int(h), int(m)))
            if out:
                return sorted(set(out))
        return [(r.hour or 0, r.minute or 0)]

    def _dow(self, r: ScheduledReport) -> Set[int]:
        raw = self._json_list(r.days_of_week)
        if raw:
            vals = {int(x) for x in raw if 0 <= int(x) <= 6}
            if vals:
                return vals
        return {r.day_of_week or 0}

    def _dom(self, r: ScheduledReport) -> Set[int]:
        raw = self._json_list(r.days_of_month)
        if raw:
            vals = {int(x) for x in raw if 1 <= int(x) <= 31}
            if vals:
                return vals
        return {1}

    def _chat_ids(self, r: ScheduledReport) -> List[str]:
        raw = self._json_list(r.telegram_chat_ids)
        if raw:
            vals = [str(c).strip() for c in raw if str(c).strip()]
            if vals:
                return list(dict.fromkeys(vals))  # dedupe, keep order
        return [r.telegram_chat_id] if r.telegram_chat_id else []

    def _day_times(self, r: ScheduledReport) -> Dict[int, List[Tuple[int, int]]]:
        """Parsed per-weekday times: {weekday -> [(h, m), ...]}."""
        raw = getattr(r, "day_times", None)
        if not raw:
            return {}
        try:
            obj = json.loads(raw)
        except Exception:
            return {}
        out: Dict[int, List[Tuple[int, int]]] = {}
        if isinstance(obj, dict):
            for k, v in obj.items():
                try:
                    wd = int(k)
                except (ValueError, TypeError):
                    continue
                if not isinstance(v, list):
                    continue
                slots = []
                for t in v:
                    fmt = self._fmt_time(t)
                    if fmt:
                        h, m = fmt.split(":")
                        slots.append((int(h), int(m)))
                if 0 <= wd <= 6 and slots:
                    out[wd] = sorted(set(slots))
        return out

    def _times_for_day(self, r: ScheduledReport, d: date) -> List[Tuple[int, int]]:
        """Times that apply on a specific date (per-weekday for 'custom')."""
        if (r.frequency or "") == "custom":
            return self._day_times(r).get(d.weekday(), [])
        return self._times(r)

    def _times_str(self, r: ScheduledReport) -> List[str]:
        return [f"{h:02d}:{m:02d}" for (h, m) in self._times(r)]

    def _day_times_str(self, r: ScheduledReport) -> Dict[str, List[str]]:
        return {str(wd): [f"{h:02d}:{m:02d}" for (h, m) in ts]
                for wd, ts in self._day_times(r).items()}

    def _to_dict(self, r: ScheduledReport) -> Dict[str, Any]:
        return {
            "id": r.id,
            "title": r.title,
            "question": r.question,
            "sql": r.sql,
            "frequency": r.frequency,
            # Flexible schedule
            "times": self._times_str(r),
            "days_of_week": sorted(self._dow(r)),
            "days_of_month": sorted(self._dom(r)),
            "day_times": self._day_times_str(r),
            "telegram_chat_ids": self._chat_ids(r),
            # Legacy (kept for compatibility)
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
    # Due calculation (daily / weekly / monthly, multiple times & days)
    # ----------------------------------------------------------------

    def _matches_day(self, r: ScheduledReport, d: date) -> bool:
        freq = r.frequency or "daily"
        if freq == "custom":
            return bool(self._times_for_day(r, d))  # weekday has configured times
        if freq == "weekly":
            return d.weekday() in self._dow(r)
        if freq == "monthly":
            last = calendar.monthrange(d.year, d.month)[1]
            for dom in self._dom(r):
                if d.day == dom or (dom >= last and d.day == last):  # 31 -> last day
                    return True
            return False
        return True  # daily

    def _most_recent_slot(self, r: ScheduledReport, now: datetime) -> Optional[datetime]:
        """Latest scheduled datetime <= now across all configured days/times."""
        for back in range(0, 62):  # up to ~2 months of catch-up
            d = (now - timedelta(days=back)).date()
            if not self._matches_day(r, d):
                continue
            day_slots = [
                datetime(d.year, d.month, d.day, h, m, tzinfo=MANILA)
                for (h, m) in self._times_for_day(r, d)  # per-day times for 'custom'
            ]
            past = [s for s in day_slots if s <= now]
            if past:
                return max(past)
        return None

    def is_due(self, report: ScheduledReport, now: datetime) -> bool:
        if not report.enabled:
            return False
        slot = self._most_recent_slot(report, now)
        if slot is None:
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

    async def _send_all(self, chat_ids: List[str], message: str) -> Tuple[int, Optional[str]]:
        """Send the same message to every recipient. Returns (ok_count, first_error)."""
        ok = 0
        first_error = None
        for cid in chat_ids:
            res = await telegram_sender.send_message(cid, message, parse_mode="HTML")
            if res.get("success"):
                ok += 1
            elif first_error is None:
                first_error = f"{cid}: {res.get('error')}"
        return ok, first_error

    async def run_one(self, report: ScheduledReport, triggered_by: str = "schedule") -> Dict[str, Any]:
        """Re-run the saved SQL and deliver one complete Telegram message to every
        configured chat (all info in the text — no image, no CSV). Records last_run_*."""
        run_date = date.today().isoformat()
        chat_ids = self._chat_ids(report)
        if not chat_ids:
            await self._record(report, "failed", f"{triggered_by}: no recipients")
            return {"status": "failed", "error": "no recipients"}
        try:
            executor = QueryExecutor(self.db)
            execution = await executor.execute_query(report.sql, timeout=30, validate=True)
            rows = execution["results"]
            row_count = execution["row_count"]

            if not rows:
                message = f"📊 <b>{html.escape(report.title)}</b>\n{run_date} — no data today."
            else:
                presenter = PresentationIntelligence()
                spec = await presenter.analyze(report.question, rows)
                message = self._build_telegram_html(report.title, run_date, row_count, rows, spec)

            ok, err = await self._send_all(chat_ids, message)
            total = len(chat_ids)
            if ok == 0:
                await self._record(report, "failed", f"Telegram send failed: {err}")
                return {"status": "failed", "error": err}
            if ok < total:
                await self._record(report, "partial",
                                   f"{triggered_by}: delivered to {ok}/{total} chats ({err})")
                return {"status": "partial", "row_count": row_count, "delivered": ok, "total": total}

            await self._record(report, "success",
                               f"{triggered_by}: {row_count} rows -> {ok} chat(s)")
            return {"status": "success", "row_count": row_count, "delivered": ok}

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
        # Label = the name/time column. Fall back to a time column, then the
        # first column, so time series ("hour") and label-less results still
        # anchor each row instead of showing a bare index.
        label = ((spec or {}).get("label_column")
                 or self._first_text_col(rows)
                 or self._first_time_col(cols)
                 or cols[0])
        value_cols = [c for c in ((spec or {}).get("value_columns") or cols) if c != label]

        head = f"📊 <b>{html.escape(title)}</b>\n{run_date} · {row_count} row{'s' if row_count != 1 else ''}"

        # Single-row summary -> key/value lines for EVERY field (no label column
        # is excluded — a one-row result has no "rows" to name).
        if row_count == 1:
            display_cols = (spec or {}).get("value_columns") or cols
            lines = [head, ""]
            for c in display_cols:
                val = formatter._format_value(rows[0].get(c), c)
                lines.append(f"• <b>{html.escape(self._label(c))}</b>: {html.escape(str(val))}")
            return "\n".join(lines)

        # Multi-row. Narrow results -> aligned monospace table. Wide results ->
        # one block per row so EVERY metric is included and stays readable.
        if len(value_cols) <= 3:
            table = self._monospace_table(rows, label, value_cols, formatter)
            body = f"{head}\n\n<pre>{html.escape(table)}</pre>"
        else:
            body = f"{head}\n\n" + self._render_blocks(rows, label, value_cols, formatter)

        # Insights: a total+peak summary for time series (ranking-style insights
        # like "top 3 account for X%" don't make sense across time), otherwise
        # the ranking insights.
        summary = (self._time_series_summary(rows, label, value_cols, formatter)
                   if self._is_time_col(label)
                   else [self._strip_md(i) for i in formatter._generate_insights_ranking(rows)])
        if summary:
            body += "\n\n<b>Key insights</b>"
            for ins in summary[:3]:
                body += f"\n• {html.escape(ins)}"
        return body

    # Time helpers ----------------------------------------------------

    @staticmethod
    def _is_time_col(col: Optional[str]) -> bool:
        if not col:
            return False
        toks = set(re.split(r'[^a-z]+', col.lower()))
        return bool(toks & {'date', 'time', 'hour', 'day', 'month', 'year', 'week', 'quarter', 'period'})

    def _first_time_col(self, cols: List[str]) -> Optional[str]:
        return next((c for c in cols if self._is_time_col(c)), None)

    def _time_series_summary(
        self, rows: List[Dict[str, Any]], label: str,
        value_cols: List[str], formatter: ResponseFormatter,
    ) -> List[str]:
        """Total + peak period for the primary measure of a time series."""
        metric = next(
            (c for c in value_cols
             if self._is_numeric(rows, c) and not _NON_METRIC.search(c)
             and not any(k in c.lower() for k in ('pct', 'percent', 'change', 'ratio'))),
            None,
        )
        if not metric:
            return []
        total = sum(float(r.get(metric) or 0) for r in rows)
        peak = max(rows, key=lambda r: float(r.get(metric) or 0))
        m_label = self._short_label(metric)
        return [
            f"Total {m_label}: {formatter._format_value(total, metric)}",
            f"Peak: {peak.get(label)} ({formatter._format_value(peak.get(metric), metric)})",
        ]

    @staticmethod
    def _is_numeric(rows: List[Dict[str, Any]], col: str) -> bool:
        for r in rows:
            v = r.get(col)
            if v is None:
                continue
            return isinstance(v, (int, float, Decimal)) and not isinstance(v, bool)
        return False

    def _render_blocks(
        self, rows: List[Dict[str, Any]], label: Optional[str],
        value_cols: List[str], formatter: ResponseFormatter, max_rows: int = 40,
    ) -> str:
        """One block per row: bold name (+ any alert badge), then all metrics as
        'Label: value' pairs, two per line. Includes every important field."""
        alert_col = next((c for c in value_cols if 'alert' in c.lower() or 'flag' in c.lower()), None)
        detail_cols = [c for c in value_cols if c != alert_col]

        blocks: List[str] = []
        for idx, row in enumerate(rows[:max_rows], 1):
            name = html.escape(str(row.get(label, ""))) if label else str(idx)
            header = f"<b>{idx}. {name}</b>"
            if alert_col:
                av = row.get(alert_col)
                avs = str(av).strip() if av is not None else ""
                if avs and avs.lower() not in ("n/a", "none", "-", "", "0", "false"):
                    header += f"  {html.escape(avs)}"

            pairs: List[str] = []
            for c in detail_cols:
                val = formatter._format_value(row.get(c), c)
                if val is None or str(val) == "N/A":
                    continue
                pairs.append(f"{html.escape(self._short_label(c))}: {html.escape(str(val))}")

            block_lines = [header]
            for j in range(0, len(pairs), 2):
                block_lines.append(" · ".join(pairs[j:j + 2]))
            blocks.append("\n".join(block_lines))

        if len(rows) > max_rows:
            blocks.append(f"<i>… +{len(rows) - max_rows} more</i>")
        return "\n\n".join(blocks)

    def _monospace_table(
        self, rows: List[Dict[str, Any]], label: Optional[str],
        show_cols: List[str], formatter: ResponseFormatter, max_rows: int = 40,
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
            lines.append(f"… +{len(rows) - max_rows} more")
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

    # Clear, human labels for common retail columns (no cryptic symbols).
    _LABEL_MAP = {
        'today_net_sales': 'Sales', 'yesterday_net_sales': 'Sales', 'net_sales': 'Sales',
        'total_sales': 'Sales', 'yesterday_sales': 'Sales', 'sales': 'Sales', 'revenue': 'Revenue',
        'today_txn_count': 'Txns', 'yesterday_txn_count': 'Txns', 'txn_count': 'Txns',
        'transaction_count': 'Txns', 'today_avg_basket': 'Avg basket',
        'yesterday_avg_basket': 'Avg basket', 'avg_basket': 'Avg basket',
        'sales_change_pct': 'Sales change', 'txn_count_change_pct': 'Txn change',
        'basket_change_pct': 'Basket change', 'basket_size_change_pct': 'Basket change',
        'quantity': 'Qty', 'units': 'Units', 'profit': 'Profit', 'margin': 'Margin',
    }

    def _short_label(self, col: str) -> str:
        """Readable label for a column — clear words, no cryptic symbols, and no
        blind truncation. Works for any column, not just the curated ones."""
        c = col.lower()
        if c in self._LABEL_MAP:
            return self._LABEL_MAP[c]
        # Generic: drop the redundant '%'/'pct' noise (the value already shows %),
        # keep 'change' as a word, title-case the rest. Never truncate mid-word.
        tokens = [t for t in re.split(r'[^a-z0-9]+', c)
                  if t and t not in ('pct', 'percent', 'percentage')]
        label = ' '.join(tokens).title().replace(' Chg', ' Change')
        return label or col

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
