"""
Scheduled AI-chat report orchestration.

CRUD for scheduled reports plus the run logic: re-execute the saved SQL, format
the answer, build a CSV, and deliver both to Telegram. Also owns the "is this
report due?" calculation used by the scheduler tick.
"""
import csv
import io
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scheduled_report import ScheduledReport
from app.services.query_executor import QueryExecutor
from app.services.response_formatter import ResponseFormatter
from app.services import telegram_sender

MANILA = ZoneInfo("Asia/Manila")

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
        """Re-run the saved SQL and deliver to Telegram. Records last_run_* on the report."""
        run_date = date.today().isoformat()
        try:
            executor = QueryExecutor(self.db)
            execution = await executor.execute_query(report.sql, timeout=30, validate=True)
            rows = execution["results"]
            row_count = execution["row_count"]

            formatter = ResponseFormatter()
            body = formatter.format_response(user_question=report.question, results=rows)

            header = f"📊 {report.title}\n🗓 {run_date} • {row_count} rows\n\n"
            await telegram_sender.send_message(report.telegram_chat_id, header + body)

            if report.include_csv and rows:
                csv_bytes = self._build_csv(rows)
                filename = f"{report.title.replace(' ', '_')[:40]}_{run_date}.csv"
                doc = await telegram_sender.send_document(
                    report.telegram_chat_id, filename, csv_bytes,
                    caption=f"{report.title} — {run_date}",
                )
                if not doc.get("success"):
                    await self._record(report, "partial", f"Message sent; CSV failed: {doc.get('error')}")
                    return {"status": "partial", "row_count": row_count, "error": doc.get("error")}

            await self._record(report, "success", f"{triggered_by}: {row_count} rows delivered")
            return {"status": "success", "row_count": row_count}

        except Exception as e:
            await self._record(report, "failed", f"{triggered_by}: {str(e)[:400]}")
            return {"status": "failed", "error": str(e)}

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
