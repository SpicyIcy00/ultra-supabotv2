"""
George's own scheduler: saved workflows fired on their slots.

SLOTS, NOT CRON TRIGGERS. Each tick computes the most recent slot at or before
now and runs only if the schedule has not already run for it. That is the
pattern app/services/scheduler.py already uses for the weekly auto-report, and
the reason is the same: a registered cron trigger silently loses any slot the
process was not up for, so a restart at 05:58 drops the 06:00 Monday run and
nothing anywhere says so.

THE CLAIM, BECAUSE THERE MAY BE MORE THAN ONE PROCESS. The existing scheduler
guards overlap with a module-level asyncio.Lock, which holds for exactly one
process; with two replicas both tick and both fire. Here the slot is claimed in
the DATABASE — a conditional UPDATE on (id, last_slot < slot) — so whichever
process wins runs it and the other finds nothing to do. Losing that race is a
no-op, not an error.

CATCH-UP IS BOUNDED TO ONE (metrics.yaml workflows.schedule.catch_up). If the
process was down for three days, the most recent due slot runs and the ones that
were missed are REPORTED on it. Three Monday briefs arriving on Thursday is three
numbers wearing the wrong timestamp, which is what every receipts rule in this
repo exists to prevent.

A CLAIMED SLOT IS NOT RETRIED. last_slot moves at claim time, before the run, so
a slot that fails is not quietly re-delivered an hour later as though it were the
06:00 one. The failure is recorded on the run and on the schedule, and — this is
the part that is not optional — it is DELIVERED. A job that fails silently is
indistinguishable from a quiet morning: nobody notices a message that did not
arrive, and they notice one that says it broke.

NO MODEL CALL, AND NO USER. A scheduled run replays vetted tools; there is no
prompt, no tool schema, and therefore no write tool to be in one. The only write
is the run record, made on the application role as the schedule's created_by —
an identity captured from a token when the schedule was made, never from
anything a model said.
"""

from __future__ import annotations

import calendar
import os
import socket
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.george_workflow import (
    GeorgeWorkflow,
    GeorgeWorkflowSchedule,
    GeorgeWorkflowVersion,
)
from app.services import telegram_sender, workflow_telegram
from app.services.workflow_runner import (
    WorkflowValidationError,
    run_version,
)
from app.services.river_writer import post_workflow_run
from app.services.workflow_writer import record_run

MANILA = ZoneInfo("Asia/Manila")

# Slots are minute-granular, so the tick has to be at least that fine to hit
# 06:00 rather than 06:04. The work per tick is one indexed query returning
# almost always zero rows.
TICK_MINUTES = 1

# How many missed slots are worth counting before the message just says "many".
# A schedule that has been off for a year should not enumerate 365 of them.
MAX_SKIPPED_COUNTED = 60


def _who() -> str:
    """Which process claimed a slot. Only ever read by a human debugging a race."""
    return f"{socket.gethostname()}:{os.getpid()}"


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

def _at(day: date, hour: int, minute: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


def _month_day(year: int, month: int, day_of_month: int) -> date:
    """day_of_month 31 means the last day of the month, as scheduled_reports uses."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def slot_for(schedule: GeorgeWorkflowSchedule, now: datetime) -> Optional[datetime]:
    """
    The most recent occurrence of this schedule's slot at or before `now`.

    Returns None only for a schedule that can never fire — a weekly one with no
    weekdays, which create_schedule already refuses.
    """
    now = now.astimezone(MANILA)
    today = now.date()

    if schedule.kind == "daily":
        slot = _at(today, schedule.hour, schedule.minute)
        return slot if slot <= now else slot - timedelta(days=1)

    if schedule.kind == "weekly":
        days = [int(d) for d in (schedule.days_of_week or []) if 0 <= int(d) <= 6]
        if not days:
            return None
        # Walk back at most a week; the first matching weekday whose time has
        # passed is the slot.
        for back in range(0, 8):
            day = today - timedelta(days=back)
            if day.weekday() in days:
                slot = _at(day, schedule.hour, schedule.minute)
                if slot <= now:
                    return slot
        return None

    if schedule.kind == "monthly":
        dom = schedule.day_of_month or 1
        slot = _at(_month_day(today.year, today.month, dom),
                   schedule.hour, schedule.minute)
        if slot <= now:
            return slot
        year, month = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
        return _at(_month_day(year, month, dom), schedule.hour, schedule.minute)

    return None


def _previous_slot(schedule: GeorgeWorkflowSchedule,
                   slot: datetime) -> Optional[datetime]:
    """The slot immediately before `slot`. Used only to count what was missed."""
    slot = slot.astimezone(MANILA)
    if schedule.kind == "daily":
        return slot - timedelta(days=1)

    if schedule.kind == "weekly":
        days = [int(d) for d in (schedule.days_of_week or []) if 0 <= int(d) <= 6]
        if not days:
            return None
        for back in range(1, 8):
            day = (slot - timedelta(days=back)).date()
            if day.weekday() in days:
                return _at(day, schedule.hour, schedule.minute)
        return None

    if schedule.kind == "monthly":
        dom = schedule.day_of_month or 1
        year, month = (slot.year - 1, 12) if slot.month == 1 else (slot.year, slot.month - 1)
        return _at(_month_day(year, month, dom), schedule.hour, schedule.minute)

    return None


def skipped_slots(schedule: GeorgeWorkflowSchedule, slot: datetime,
                  last_slot: Optional[datetime]) -> list[datetime]:
    """
    The slots between the last one that ran and this one — the ones nobody got.

    Empty on the first ever run: a schedule that has never fired has not missed
    anything, it has simply not started.
    """
    if last_slot is None:
        return []
    missed: list[datetime] = []
    cursor = _previous_slot(schedule, slot)
    while cursor is not None and cursor > last_slot.astimezone(MANILA):
        missed.append(cursor)
        if len(missed) >= MAX_SKIPPED_COUNTED:
            break
        cursor = _previous_slot(schedule, cursor)
    return missed


# ---------------------------------------------------------------------------
# The claim
# ---------------------------------------------------------------------------

async def claim_slot(db: AsyncSession, schedule_id, slot: datetime) -> bool:
    """
    Take ownership of one slot, or report that somebody else already has it.

    ONE STATEMENT, and the condition is the whole point: `last_slot < :slot`
    means a second process attempting the same slot updates zero rows. Reading
    then writing would leave the window between the two open, which on two
    replicas is exactly where a duplicate 06:00 message comes from.

    last_slot moves HERE, before the run — see the module docstring on why a
    failed slot is reported rather than retried.
    """
    result = await db.execute(
        text(
            "UPDATE george.workflow_schedules "
            "   SET last_slot = :slot, claimed_at = now(), claimed_by = :who "
            " WHERE id = :id "
            "   AND enabled "
            "   AND (last_slot IS NULL OR last_slot < :slot)"
        ),
        {"slot": slot, "who": _who()[:200], "id": schedule_id},
    )
    return (result.rowcount or 0) > 0


# ---------------------------------------------------------------------------
# Running one due schedule
# ---------------------------------------------------------------------------

async def run_due_schedule(db: AsyncSession, schedule: GeorgeWorkflowSchedule,
                           slot: datetime, missed: list[datetime]) -> str:
    """
    Run one claimed slot: execute, record, deliver. Returns the run status.

    Never raises. A scheduler that lets one workflow's exception escape stops
    ticking for every other one.
    """
    workflow = (
        await db.execute(
            select(GeorgeWorkflow).where(GeorgeWorkflow.id == schedule.workflow_id)
        )
    ).scalar_one()
    version = (
        await db.execute(
            select(GeorgeWorkflowVersion).where(
                GeorgeWorkflowVersion.id == schedule.version_id
            )
        )
    ).scalar_one()

    started = datetime.now(timezone.utc)
    try:
        outcome = await run_version(
            steps=version.steps,
            parameters=version.parameters or [],
            bindings=schedule.bindings or {},
            as_of=None,
            mode="scheduled",
            saved_definitions_version=version.definitions_version,
        )
    except (WorkflowValidationError, ValueError, KeyError, RuntimeError) as exc:
        # The rule itself could not be bound or validated — a rot that
        # run_version could not turn into a per-step state. Delivered, because
        # the alternative is silence indistinguishable from a quiet morning.
        reason = f"{type(exc).__name__}: {exc}"
        messages = workflow_telegram.render_failure(
            workflow_name=workflow.name, version=version.version,
            slot=slot, reason=reason,
        )
        delivery = await _deliver(schedule.telegram_chat_ids or [], messages)
        outcome = {
            "status": "failed", "mode": "scheduled", "as_of": None,
            "bindings": schedule.bindings or {}, "steps": [],
            "run_notices": [], "notices": [{
                "kind": "workflow_step_failed",
                "message": f"The workflow could not run at all: {reason}",
                "source": "app.services.workflow_scheduler",
            }],
            "definitions_version": None,
            "ran_at": datetime.now(timezone.utc).isoformat(),
        }
        run = await record_run(
            db, workflow=workflow, version=version, outcome=outcome,
            mode="scheduled", requested_by=schedule.created_by,
            schedule_id=schedule.id, started_at=started, delivery=delivery,
        )
        # A failure is posted like a success. A job that fails silently is
        # indistinguishable from a quiet morning — the same reason this branch
        # delivers to Telegram rather than returning.
        await _post_run(db, run, workflow, version, outcome, slot)
        schedule.last_run_at = datetime.now(timezone.utc)
        schedule.last_status = "failed"
        schedule.last_error = reason[:2000]
        await db.flush()
        return "failed"

    if missed:
        # Reported on the run that DID happen, because a run that did not happen
        # leaves no row to carry a notice.
        listed = ", ".join(m.strftime("%Y-%m-%d %H:%M") for m in missed[:5])
        more = f" and {len(missed) - 5} others" if len(missed) > 5 else ""
        capped = " (at least)" if len(missed) >= MAX_SKIPPED_COUNTED else ""
        notice = {
            "kind": "schedule_slots_skipped",
            "message": (
                f"{len(missed)}{capped} scheduled slots were skipped before this "
                f"run: {listed}{more}. Only the most recent slot runs after an "
                f"outage, so those results were never produced and are not "
                f"included below."
            ),
            "source": "metrics.yaml: workflows.schedule.catch_up",
        }
        outcome["run_notices"] = [notice] + list(outcome.get("run_notices") or [])
        outcome["notices"] = [notice] + list(outcome.get("notices") or [])

    messages = workflow_telegram.render(
        outcome, workflow_name=workflow.name, version=version.version, slot=slot
    )
    delivery = await _deliver(schedule.telegram_chat_ids or [], messages)

    run = await record_run(
        db, workflow=workflow, version=version, outcome=outcome,
        mode="scheduled", requested_by=schedule.created_by,
        schedule_id=schedule.id, started_at=started, delivery=delivery,
    )
    await _post_run(db, run, workflow, version, outcome, slot)
    schedule.last_run_at = datetime.now(timezone.utc)
    schedule.last_status = outcome["status"]
    schedule.last_error = None if delivery["ok"] else "delivery failed"
    await db.flush()
    return outcome["status"]


async def _post_run(db, run, workflow, version, outcome: dict,
                    slot: datetime) -> None:
    """
    The run in the river, beside the Telegram message rather than instead of it.

    SCHEDULED RUNS ONLY — this function is only reachable from the tick. A
    manual run in conversation already becomes an `answer` post with the whole
    exchange around it, and posting it again here would say the same thing
    twice under a different heading.

    Never raises. The run has already happened and its record is already
    written; losing the river copy must not roll that back or stop the tick,
    for the same reason _deliver's failure does not.
    """
    try:
        await post_workflow_run(
            db, run_id=run.id, workflow_name=workflow.name,
            version=version.version, outcome=outcome, slot=slot,
        )
    except Exception as exc:  # noqa: BLE001 - a post must not cost a run
        print(f"[workflows] river post failed for run {run.id}: "
              f"{type(exc).__name__}: {exc}")


async def _deliver(chat_ids: list[str], messages: list[str]) -> dict:
    """
    Send the rendered messages, in order, stopping on the first failure per chat.

    A run split across three messages that lost the middle one reads as complete
    with items silently missing, which is worse than not arriving — the same
    rule POST /brief/send follows.
    """
    if not chat_ids:
        return {"ok": False, "sent": 0, "results": [],
                "error": "no chat ids configured"}
    if not telegram_sender.is_configured():
        return {"ok": False, "sent": 0, "results": [],
                "error": "TELEGRAM_BOT_TOKEN is not configured"}

    results = []
    for chat_id in chat_ids:
        sent = failed = 0
        errors: list[str] = []
        for message in messages:
            outcome = await telegram_sender.send_message(
                chat_id, message, parse_mode="HTML"
            )
            if outcome.get("success"):
                sent += 1
            else:
                failed += 1
                errors.append(str(outcome.get("error"))[:300])
                break
        results.append({"chat_id": chat_id, "sent": sent, "failed": failed,
                        "errors": errors})

    return {
        "ok": all(r["failed"] == 0 for r in results),
        "sent": sum(r["sent"] for r in results),
        "messages": len(messages),
        "results": results,
    }


# ---------------------------------------------------------------------------
# The tick
# ---------------------------------------------------------------------------

async def tick() -> None:
    """
    Runs every TICK_MINUTES. Fires each enabled schedule at most once per slot.

    Each schedule gets its OWN session and its own try/except: one workflow's
    failure must not roll back another's run record, and must not stop the tick.
    """
    now = datetime.now(MANILA)

    async with AsyncSessionLocal() as session:
        due = (
            await session.execute(
                select(GeorgeWorkflowSchedule)
                .where(GeorgeWorkflowSchedule.enabled.is_(True))
                .order_by(GeorgeWorkflowSchedule.last_slot.asc().nulls_first())
            )
        ).scalars().all()
        candidates = [(s.id, slot_for(s, now), s.last_slot) for s in due]

    for schedule_id, slot, last_slot in candidates:
        if slot is None:
            continue
        if last_slot is not None and last_slot.astimezone(MANILA) >= slot:
            continue

        async with AsyncSessionLocal() as session:
            try:
                schedule = (
                    await session.execute(
                        select(GeorgeWorkflowSchedule)
                        .where(GeorgeWorkflowSchedule.id == schedule_id)
                    )
                ).scalar_one_or_none()
                if schedule is None or not schedule.enabled:
                    continue

                missed = skipped_slots(schedule, slot, schedule.last_slot)

                if not await claim_slot(session, schedule_id, slot):
                    # Another process has this slot. Not an error.
                    await session.rollback()
                    continue
                await session.commit()

                status = await run_due_schedule(session, schedule, slot, missed)
                await session.commit()
                print(f"[workflows] {schedule_id} slot {slot.isoformat()} -> {status}")
            except Exception as exc:  # noqa: BLE001 - one schedule must not stop the tick
                await session.rollback()
                print(f"[workflows] tick error on {schedule_id}: "
                      f"{type(exc).__name__}: {exc}")


async def tick_safely() -> None:
    """Wrapper for APScheduler, which swallows nothing usefully on its own."""
    try:
        await tick()
    except Exception as exc:  # noqa: BLE001
        print(f"[workflows] tick failed: {type(exc).__name__}: {exc}")


# Kept so a caller can await the tick in a test or a one-off script without
# reaching into APScheduler.
__all__ = [
    "MANILA",
    "TICK_MINUTES",
    "claim_slot",
    "run_due_schedule",
    "skipped_slots",
    "slot_for",
    "tick",
    "tick_safely",
]