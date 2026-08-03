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

MANILA = ZoneInfo("Asia/Manila")
TICK_MINUTES = 15

_scheduler: AsyncIOScheduler | None = None
_run_lock = asyncio.Lock()


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
    _scheduler.start()
    print(f"Auto-report scheduler started (tick every {TICK_MINUTES} min)")


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        print("Auto-report scheduler shut down")
