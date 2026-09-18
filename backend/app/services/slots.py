"""
Slots and claims, in one place, for every schedule in this system.

WHY THIS IS ONE MODULE AND NOT THREE COPIES. Three things now fire on their
own: the weekly auto-report, Bob's saved workflows, and — as of today — his
standing questions. All three need the same two answers, and getting either
wrong is invisible until a morning goes missing:

  WHICH SLOT IS DUE?  Computed from now, never registered as a cron trigger. A
  registered trigger silently loses any slot the process was not up for, so a
  restart at 05:58 drops the 06:00 run and nothing anywhere says so. Each tick
  recomputes the most recent slot at or before now and runs only if that slot
  has not already run.

  WHO GETS IT?  A conditional UPDATE on `last_slot < :slot`, so a second
  process attempting the same slot updates zero rows. A module-level lock holds
  for exactly one process; with two replicas both tick and both fire. Losing
  the race is a no-op, not an error.

CATCH-UP IS BOUNDED TO ONE (metrics.yaml workflows.schedule.catch_up). If the
process was down for three days, the most recent due slot runs and the ones
that were missed are REPORTED on it. Three briefs arriving on Thursday is three
numbers wearing the wrong timestamp, which is what every receipts rule in this
repo exists to prevent.

This module was extracted from workflow_scheduler.py unchanged, on the day the
third schedule arrived — the behaviour is identical and the workflow tests are
the proof, which is why the extraction came before the new feature and not
after it.
"""

from __future__ import annotations

import calendar
import os
import socket
from datetime import date, datetime, timedelta
from typing import Optional, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

MANILA = ZoneInfo("Asia/Manila")

# How many missed slots are worth counting before the message just says "many".
# A schedule that has been off for a year should not enumerate 365 of them.
MAX_SKIPPED_COUNTED = 60

# Every table a slot may be claimed in. The claim's SQL names a table, and a
# table name is the one thing in it that is not a bound parameter — so the set
# of names is closed HERE, in code, rather than being whatever a caller passes.
CLAIMABLE = frozenset({
    "george.workflow_schedules",
    "george.standing_questions",
    "george.watches",
})


def who() -> str:
    """Which process claimed a slot. Only ever read by a human debugging a race."""
    return f"{socket.gethostname()}:{os.getpid()}"


def at(day: date, hour: int, minute: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=MANILA)


def month_day(year: int, month: int, day_of_month: int) -> date:
    """day_of_month 31 means the last day of the month, as scheduled_reports uses."""
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def slot_for(*, kind: str, hour: int, minute: int,
             days_of_week: Optional[Sequence[int]] = None,
             day_of_month: Optional[int] = None,
             now: datetime) -> Optional[datetime]:
    """
    The most recent occurrence of this schedule's slot at or before `now`.

    Returns None only for a schedule that can never fire — a weekly one with no
    weekdays, which every writer already refuses — or an unknown kind.
    """
    now = now.astimezone(MANILA)
    today = now.date()

    if kind == "daily":
        slot = at(today, hour, minute)
        return slot if slot <= now else slot - timedelta(days=1)

    if kind == "weekly":
        days = [int(d) for d in (days_of_week or []) if 0 <= int(d) <= 6]
        if not days:
            return None
        # Walk back at most a week; the first matching weekday whose time has
        # passed is the slot.
        for back in range(0, 8):
            day = today - timedelta(days=back)
            if day.weekday() in days:
                slot = at(day, hour, minute)
                if slot <= now:
                    return slot
        return None

    if kind == "monthly":
        dom = day_of_month or 1
        slot = at(month_day(today.year, today.month, dom), hour, minute)
        if slot <= now:
            return slot
        year, month = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
        return at(month_day(year, month, dom), hour, minute)

    return None


def previous_slot(*, kind: str, hour: int, minute: int,
                  days_of_week: Optional[Sequence[int]] = None,
                  day_of_month: Optional[int] = None,
                  slot: datetime) -> Optional[datetime]:
    """The slot immediately before `slot`. Used only to count what was missed."""
    slot = slot.astimezone(MANILA)

    if kind == "daily":
        return slot - timedelta(days=1)

    if kind == "weekly":
        days = [int(d) for d in (days_of_week or []) if 0 <= int(d) <= 6]
        if not days:
            return None
        for back in range(1, 8):
            day = (slot - timedelta(days=back)).date()
            if day.weekday() in days:
                return at(day, hour, minute)
        return None

    if kind == "monthly":
        dom = day_of_month or 1
        year, month = (slot.year - 1, 12) if slot.month == 1 else (slot.year, slot.month - 1)
        return at(month_day(year, month, dom), hour, minute)

    return None


def skipped_slots(*, kind: str, hour: int, minute: int,
                  days_of_week: Optional[Sequence[int]] = None,
                  day_of_month: Optional[int] = None,
                  slot: datetime,
                  last_slot: Optional[datetime]) -> list[datetime]:
    """
    The slots between the last one that ran and this one — the ones nobody got.

    Empty on the first ever run: a schedule that has never fired has not missed
    anything, it has simply not started.
    """
    if last_slot is None:
        return []
    shape = dict(kind=kind, hour=hour, minute=minute,
                 days_of_week=days_of_week, day_of_month=day_of_month)
    missed: list[datetime] = []
    cursor = previous_slot(slot=slot, **shape)
    while cursor is not None and cursor > last_slot.astimezone(MANILA):
        missed.append(cursor)
        if len(missed) >= MAX_SKIPPED_COUNTED:
            break
        cursor = previous_slot(slot=cursor, **shape)
    return missed


async def claim(db: AsyncSession, *, table: str, row_id, slot: datetime) -> bool:
    """
    Take ownership of one slot, or report that somebody else already has it.

    ONE STATEMENT, and the condition is the whole point: `last_slot < :slot`
    means a second process attempting the same slot updates zero rows. Reading
    then writing would leave the window between the two open, which on two
    replicas is exactly where a duplicate 06:00 message comes from.

    last_slot moves HERE, before the run, so a slot that fails is not quietly
    re-delivered an hour later as though it were the 06:00 one. The failure is
    recorded on the row and — this is the part that is not optional — it is
    DELIVERED by the caller. A job that fails silently is indistinguishable
    from a quiet morning.
    """
    if table not in CLAIMABLE:
        raise ValueError(f"{table} is not a claimable schedule table")
    result = await db.execute(
        text(
            f"UPDATE {table} "  # noqa: S608 - closed set above, never a caller's string
            "   SET last_slot = :slot, claimed_at = now(), claimed_by = :who "
            " WHERE id = :id "
            "   AND enabled "
            "   AND (last_slot IS NULL OR last_slot < :slot)"
        ),
        {"slot": slot, "who": who()[:200], "id": row_id},
    )
    return (result.rowcount or 0) > 0


def describe_skipped(missed: list[datetime], *, source: str) -> dict:
    """
    The notice a run carries when slots were missed before it.

    Reported on the run that DID happen, because a run that did not happen
    leaves no row to carry a notice.
    """
    listed = ", ".join(m.strftime("%Y-%m-%d %H:%M") for m in missed[:5])
    more = f" and {len(missed) - 5} others" if len(missed) > 5 else ""
    capped = " (at least)" if len(missed) >= MAX_SKIPPED_COUNTED else ""
    return {
        "kind": "schedule_slots_skipped",
        "message": (
            f"{len(missed)}{capped} scheduled slots were skipped before this "
            f"run: {listed}{more}. Only the most recent slot runs after an "
            f"outage, so those results were never produced and are not "
            f"included below."
        ),
        "source": source,
    }
