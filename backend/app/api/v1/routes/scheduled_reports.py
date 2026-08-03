"""
Scheduled AI-chat report API routes.

CRUD for scheduling a chat-generated report (question + SQL) to re-run on future
days and deliver to Telegram, plus Telegram helper endpoints (status / chat-id
discovery / test send / run-now).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.scheduled_report_service import ScheduledReportService
from app.services import telegram_sender

router = APIRouter(tags=["scheduled-reports"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ScheduledReportCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    question: str = Field(..., min_length=1)
    sql: str = Field(..., min_length=1)
    frequency: str = Field("daily", pattern="^(daily|weekly|monthly)$")
    # Flexible schedule (Manila time).
    times: List[str] = Field(default_factory=lambda: ["08:00"])  # ["08:00","17:30"]
    days_of_week: List[int] = Field(default_factory=list)        # Mon=0..Sun=6 (weekly)
    days_of_month: List[int] = Field(default_factory=list)       # 1..31, 31 => last day (monthly)
    # Delivery — one or more Telegram chats.
    telegram_chat_ids: List[str] = Field(default_factory=list)
    telegram_chat_id: Optional[str] = Field(None, max_length=64)  # legacy single (optional)
    include_csv: bool = False
    enabled: bool = True


class ScheduledReportUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    question: Optional[str] = None
    sql: Optional[str] = None
    frequency: Optional[str] = Field(None, pattern="^(daily|weekly|monthly)$")
    times: Optional[List[str]] = None
    days_of_week: Optional[List[int]] = None
    days_of_month: Optional[List[int]] = None
    telegram_chat_ids: Optional[List[str]] = None
    telegram_chat_id: Optional[str] = Field(None, max_length=64)
    include_csv: Optional[bool] = None
    enabled: Optional[bool] = None


class TelegramTestRequest(BaseModel):
    telegram_chat_id: str = Field(..., min_length=1, max_length=64)


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------

@router.get("/telegram/status")
async def telegram_status():
    """Whether a bot token is configured (so the UI can guide setup)."""
    return {"configured": telegram_sender.is_configured()}


@router.get("/telegram/discover-chats")
async def discover_chats():
    """List chats that recently messaged the bot, to help the user pick a chat_id."""
    result = await telegram_sender.get_recent_chats()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Telegram error"))
    return {"chats": result["chats"]}


@router.post("/telegram/test")
async def telegram_test(request: TelegramTestRequest):
    """Send a test message so the user can confirm delivery works."""
    result = await telegram_sender.send_message(
        request.telegram_chat_id,
        "✅ Test message from your BI Dashboard. Scheduled reports will arrive here.",
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Send failed"))
    return {"success": True}


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

# Note: use "" (not "/") so the collection responds at the prefix with no
# trailing slash. The Vercel proxy rewrite (/api/v1/:path*) doesn't match a
# trailing slash and would fall through to the SPA (→ 405 on POST).
@router.get("")
async def list_reports(db: AsyncSession = Depends(get_db)):
    return await ScheduledReportService(db).list_reports()


@router.post("")
async def create_report(payload: ScheduledReportCreate, db: AsyncSession = Depends(get_db)):
    if not payload.telegram_chat_ids and not payload.telegram_chat_id:
        raise HTTPException(status_code=400, detail="At least one Telegram chat is required")
    return await ScheduledReportService(db).create_report(payload.model_dump())


@router.put("/{report_id}")
async def update_report(
    report_id: str, payload: ScheduledReportUpdate, db: AsyncSession = Depends(get_db)
):
    updated = await ScheduledReportService(db).update_report(
        report_id, payload.model_dump(exclude_unset=True)
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    return updated


@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    ok = await ScheduledReportService(db).delete_report(report_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    return {"success": True}


@router.post("/{report_id}/run-now")
async def run_now(report_id: str, db: AsyncSession = Depends(get_db)):
    """Deliver the report immediately (test the full run + delivery path)."""
    service = ScheduledReportService(db)
    report = await service.get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    return await service.run_one(report, triggered_by="manual")
