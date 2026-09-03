"""
In-process weekly scheduler for the auto-report job.

Uses APScheduler's AsyncIOScheduler with a single interval job (tick) rather than a
fixed cron trigger, so a process restart can never drop the weekly slot: each tick
recomputes whether this week's configured slot has passed and whether it already ran,
making it idempotent and catch-up safe. A module-level lock prevents overlap.
"""
import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import AsyncSessionLocal
from app.services.auto_report_service import AutoReportService
from app.services.scheduled_report_service import ScheduledReportService
from app.services.workflow_scheduler import (
    TICK_MINUTES as WORKFLOW_TICK_MINUTES,
    tick_safely as workflow_tick,
)

MANILA = ZoneInfo("Asia/Manila")
TICK_MINUTES = 15
# Scheduled AI-chat reports honour minute-level times, so tick more often.
CHAT_REPORT_TICK_MINUTES = 5

_scheduler: AsyncIOScheduler | None = None
_run_lock = asyncio.Lock()
_chat_report_lock = asyncio.Lock()


def _slot_start_this_week(now: datetime, day_of_week: int, hour: int, minute: int) -> datetime:
    """The most recent occurrence (<= now) of the weekly slot, in Manila time."""
    # Monday=0 … Sunday=6 (matches Python's weekday()).
    days_since = (now.weekday() - day_of_week) % 7
    slot = (now - timedelta(days=days_since)).replace(
        hour=hour, minute=minute, second=0, microsecond=0
    )
    if slot > now:
        # The slot's weekday is later this week than today's position → last week's slot.
        slot -= timedelta(days=7)
    return slot


async def tick() -> None:
    """Runs every TICK_MINUTES. Fires the report once per weekly slot when due."""
    if _run_lock.locked():
        return
    async with _run_lock:
        async with AsyncSessionLocal() as session:
            try:
                service = AutoReportService(session)
                settings = await service.get_settings()
                if not settings.get("enabled"):
                    return

                now = datetime.now(MANILA)
                slot = _slot_start_this_week(
                    now, settings["day_of_week"], settings["hour"], settings["minute"]
                )
                if now < slot:
                    return  # slot hasn't arrived yet this week

                last_run_at = settings.get("last_run_at")
                if last_run_at:
                    last = datetime.fromisoformat(last_run_at)
                    if last.tzinfo is None:
                        last = last.replace(tzinfo=MANILA)
                    if last >= slot:
                        return  # already ran for this week's slot

                print(f"[auto-report] slot due ({slot.isoformat()}); running…")
                result = await service.run_all(triggered_by="schedule")
                print(f"[auto-report] done: {result['status']} — "
                      f"{result['stores_ok']}/{result['stores_total']} stores, "
                      f"{result['total_rows']} rows")
            except Exception as e:
                print(f"[auto-report] tick error: {e}")


async def chat_report_tick() -> None:
    """Runs every CHAT_REPORT_TICK_MINUTES. Delivers any due scheduled chat reports."""
    if _chat_report_lock.locked():
        return
    async with _chat_report_lock:
        async with AsyncSessionLocal() as session:
            try:
                service = ScheduledReportService(session)
                result = await service.run_due()
                if result["ran"]:
                    print(f"[chat-report] delivered {result['ran']}/{result['checked']} due report(s)")
            except Exception as e:
                print(f"[chat-report] tick error: {e}")


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = AsyncIOScheduler(timezone=MANILA)
    _scheduler.add_job(
        tick,
        "interval",
        minutes=TICK_MINUTES,
        id="auto_report_tick",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(MANILA) + timedelta(seconds=30),
    )
    _scheduler.add_job(
        chat_report_tick,
        "interval",
        minutes=CHAT_REPORT_TICK_MINUTES,
        id="chat_report_tick",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(MANILA) + timedelta(seconds=45),
    )
    # George's saved workflows. A third job on the SAME scheduler rather than a
    # third scheduler: one process, one event loop, one place to look when
    # something did not fire. It guards overlap in the DATABASE rather than with
    # a module-level lock like the two jobs above, because a claim in the row is
    # the only guard that survives a second replica — see workflow_scheduler.
    _scheduler.add_job(
        workflow_tick,
        "interval",
        minutes=WORKFLOW_TICK_MINUTES,
        id="workflow_tick",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(MANILA) + timedelta(seconds=60),
    )
    _scheduler.start()
    print(f"Schedulers started (auto-report every {TICK_MINUTES} min, "
          f"chat-reports every {CHAT_REPORT_TICK_MINUTES} min, "
          f"workflows every {WORKFLOW_TICK_MINUTES} min)")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        print("Auto-report scheduler shut down")
