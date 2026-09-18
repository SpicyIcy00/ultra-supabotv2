"""
Standing questions: create them, change them, find the ones that are due.

THE OWNER'S WORDS ARE THE FEATURE. "Make it 9am instead of 8" and "show more of
Rockwell" are the two things he asked to be able to say, and they are the two
things this module does — one moves a slot, one appends a sentence. Everything
else here exists so those two cannot become something else.

WHAT CANNOT BE WRITTEN HERE, STATED AS CODE RATHER THAN AS A COMMENT. There is
no argument on any function below that takes a threshold, a metric, a window or
a comparison. `hour` and `minute` are the only numbers that reach the table, and
`days_of_week` the only list of them. So "alert me when Rockwell drops 10%
instead of 30%" cannot be half-written and half-refused: it has nowhere to go,
and the refusal says which comparison already exists instead.

ONE WRITE PATH. Bob's injected tool and any manual control call the SAME
functions, exactly as pins and pages already work (CLAUDE.md rule 4). Bob
holds no credential; the web process binds `owner` from the authenticated user,
which is why no function here takes an owner from anything a model said.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bob_standing import (
    MAX_INSTRUCTION_LENGTH,
    MAX_INSTRUCTIONS,
    MAX_PER_OWNER,
    BobStandingQuestion,
)
from app.services import slots

TABLE = "george.standing_questions"

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


class StandingRefused(ValueError):
    """
    The question cannot be created or changed as asked, and the message says
    why. A ValueError for the same reason PinRefused is one: the loop turns it
    into a real answer with a route out, never a crash.
    """


# ---------------------------------------------------------------------------
# Reading
# ---------------------------------------------------------------------------

def when(row: BobStandingQuestion) -> str:
    """The slot in words. Manila, like everything else that fires on its own."""
    at = f"{row.hour:02d}:{row.minute:02d}"
    if row.kind == "weekly" and row.days_of_week:
        days = ", ".join(DAY_NAMES[d] for d in sorted(row.days_of_week) if 0 <= d <= 6)
        return f"{days} at {at}"
    return f"every day at {at}"


def as_row(row: BobStandingQuestion) -> dict[str, Any]:
    """One standing question as a row Bob can read and compose."""
    return {
        "id": str(row.id),
        "question": row.question,
        "instructions": list(row.instructions or []),
        "when": when(row),
        "state": "asked on schedule" if row.enabled else "switched off",
        "last_asked": row.last_run_at,
        "last_status": row.last_status,
    }


async def list_for(session: AsyncSession, owner: str) -> list[BobStandingQuestion]:
    return list((await session.execute(
        select(BobStandingQuestion)
        .where(BobStandingQuestion.owner == owner)
        .order_by(BobStandingQuestion.created_at.desc())
    )).scalars().all())


async def latest_answer(session: AsyncSession, owner: str) -> Optional[dict]:
    """
    The newest standing answer waiting for this person, if there is one.

    This is what the room opens on: not "the briefing", which is a thing nobody
    built, but the most recent answer to a question he asked Bob to keep
    answering. A question that has never run has no thread and is not offered.
    """
    row = (await session.execute(
        select(BobStandingQuestion)
        .where(BobStandingQuestion.owner == owner,
               BobStandingQuestion.last_thread_id.is_not(None),
               BobStandingQuestion.last_status == "ok")
        .order_by(BobStandingQuestion.last_run_at.desc())
        .limit(1)
    )).scalars().first()
    if row is None:
        return None
    return {
        "thread_id": str(row.last_thread_id),
        "question": row.question,
        "answered_at": row.last_run_at,
        "standing_question_id": str(row.id),
    }


async def _owned(session: AsyncSession, owner: str,
                 which: Optional[str]) -> BobStandingQuestion:
    """
    The one this operation is about, resolved from the caller's own rows.

    `which` is an id from a read Bob has already done. Not found and not
    yours are the SAME answer, as everywhere else in this system: a message
    that distinguishes them tells a stranger their guess was a real id.

    With one question and no `which`, that question is meant — saying "make it
    9am" when there is exactly one thing it could refer to is not ambiguous.
    With several, it is, and asking is better than picking.
    """
    rows = await list_for(session, owner)
    if not rows:
        raise StandingRefused(
            "There are no standing questions yet. Create one first — say what "
            "should be asked and when."
        )
    if which:
        for row in rows:
            if str(row.id) == which:
                return row
        raise StandingRefused(
            "No standing question of yours has that id. Read them first "
            "(view_automations lists them) and name one of those."
        )
    if len(rows) == 1:
        return rows[0]
    listed = "; ".join(f'"{r.question}" ({when(r)}) [{r.id}]' for r in rows[:5])
    raise StandingRefused(
        f"There are {len(rows)} standing questions, so which one is not clear: "
        f"{listed}. Name one by its id."
    )


# ---------------------------------------------------------------------------
# Writing — and every bound it obeys
# ---------------------------------------------------------------------------

def _clean_question(question: Any) -> str:
    text = str(question or "").strip()
    if len(text) < 3:
        raise StandingRefused("A standing question needs to be an actual question.")
    if len(text) > 500:
        raise StandingRefused(
            "That question is too long to keep as a standing one (500 characters). "
            "Say the short version and put the detail in a standing instruction."
        )
    if "\n" in text:
        raise StandingRefused("A standing question is one line.")
    return text


def _clean_instruction(instruction: Any) -> str:
    text = str(instruction or "").strip()
    if not text:
        raise StandingRefused("An instruction needs some words in it.")
    if len(text) > MAX_INSTRUCTION_LENGTH:
        raise StandingRefused(
            f"A standing instruction is at most {MAX_INSTRUCTION_LENGTH} characters. "
            "Several short ones beat one long one — they can be removed separately."
        )
    return " ".join(text.split())


def _clean_slot(kind: Optional[str], hour: Optional[int], minute: Optional[int],
                days: Optional[list[int]]) -> dict:
    if hour is None:
        raise StandingRefused("What time should it be asked? An hour is required.")
    try:
        hour, minute = int(hour), int(minute or 0)
    except (TypeError, ValueError):
        raise StandingRefused("The time has to be an hour and a minute.") from None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise StandingRefused("The time has to be a real one, in Manila time.")

    if days:
        try:
            cleaned = sorted({int(d) for d in days})
        except (TypeError, ValueError):
            raise StandingRefused(
                "Days are 0–6, Monday to Sunday."
            ) from None
        if any(d < 0 or d > 6 for d in cleaned):
            raise StandingRefused("Days are 0–6, Monday to Sunday.")
        return {"kind": "weekly", "hour": hour, "minute": minute,
                "days_of_week": cleaned}

    if kind == "weekly":
        raise StandingRefused("A weekly question needs the days it runs on.")
    return {"kind": "daily", "hour": hour, "minute": minute, "days_of_week": None}


async def create(session: AsyncSession, *, owner: str, question: str,
                 hour: int, minute: Optional[int] = None,
                 kind: Optional[str] = None,
                 days_of_week: Optional[list[int]] = None,
                 instructions: Optional[list[str]] = None) -> BobStandingQuestion:
    """
    Keep a question and ask it on a schedule. Created SWITCHED OFF.

    Off by default is the deliberate half, and it is the same reasoning as
    architecture rule 7's "Bob may accept 'every Monday at 6' in
    conversation — the schedule is created switched off". A thing that starts
    firing the moment it is described means a model gave itself a schedule
    mid-sentence. The owner turns it on, which takes one more sentence and is
    the sentence that matters.
    """
    existing = await list_for(session, owner)
    if len(existing) >= MAX_PER_OWNER:
        raise StandingRefused(
            f"There are already {len(existing)} standing questions, which is the "
            f"limit ({MAX_PER_OWNER}). Remove one first, or fold this into an "
            f"instruction on one that already runs."
        )

    clean = _clean_question(question)
    lines = [_clean_instruction(i) for i in (instructions or [])]
    if len(lines) > MAX_INSTRUCTIONS:
        raise StandingRefused(
            f"That is more than {MAX_INSTRUCTIONS} standing instructions."
        )

    row = BobStandingQuestion(
        id=uuid.uuid4(), owner=owner, question=clean, instructions=lines,
        enabled=False, **_clean_slot(kind, hour, minute, days_of_week),
    )
    session.add(row)
    await session.flush()
    return row


async def reschedule(session: AsyncSession, *, owner: str, which: Optional[str],
                     hour: int, minute: Optional[int] = None,
                     kind: Optional[str] = None,
                     days_of_week: Optional[list[int]] = None) -> BobStandingQuestion:
    """
    "Make it 9am instead of 8."

    last_slot is CLEARED, and that is not housekeeping. It records which slot
    was last claimed; a question moved from 08:00 to 09:00 on a morning that
    already ran at 08:00 would otherwise find today's 09:00 slot already
    claimed and skip a day with no explanation.
    """
    row = await _owned(session, owner, which)
    for key, value in _clean_slot(kind, hour, minute, days_of_week).items():
        setattr(row, key, value)
    row.last_slot = None
    row.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return row


async def add_instruction(session: AsyncSession, *, owner: str,
                          which: Optional[str],
                          instruction: str) -> BobStandingQuestion:
    """"Show more of Rockwell." Appended, never merged into the question."""
    row = await _owned(session, owner, which)
    lines = list(row.instructions or [])
    clean = _clean_instruction(instruction)
    if clean.lower() in [line.lower() for line in lines]:
        raise StandingRefused("That instruction is already on this question.")
    if len(lines) >= MAX_INSTRUCTIONS:
        raise StandingRefused(
            f"This question already carries {MAX_INSTRUCTIONS} standing "
            f"instructions, which is the limit. Remove one first — or say it as "
            f"part of the question itself, which is what it has become."
        )
    row.instructions = lines + [clean]
    row.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return row


async def remove_instruction(session: AsyncSession, *, owner: str,
                             which: Optional[str],
                             instruction: str) -> BobStandingQuestion:
    """Drop one standing instruction, matched on its text, case-insensitively."""
    row = await _owned(session, owner, which)
    lines = list(row.instructions or [])
    target = " ".join(str(instruction or "").split()).lower()
    kept = [line for line in lines if line.lower() != target]
    if len(kept) == len(lines):
        listed = "; ".join(lines) or "none"
        raise StandingRefused(
            f"No standing instruction on this question reads like that. It "
            f"carries: {listed}."
        )
    row.instructions = kept
    row.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return row


async def rewrite(session: AsyncSession, *, owner: str, which: Optional[str],
                  question: str) -> BobStandingQuestion:
    """Change what is asked. The schedule and the instructions stay."""
    row = await _owned(session, owner, which)
    row.question = _clean_question(question)
    row.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return row


async def switch(session: AsyncSession, *, owner: str, which: Optional[str],
                 on: bool) -> BobStandingQuestion:
    """
    Start or stop asking it.

    Switching ON clears last_slot for the same reason rescheduling does: a
    question switched off for a fortnight and back on would otherwise count
    fourteen missed slots and say so, when nothing was missed — it was off.
    """
    row = await _owned(session, owner, which)
    row.enabled = bool(on)
    if on:
        row.last_slot = None
    row.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return row


async def remove(session: AsyncSession, *, owner: str,
                 which: Optional[str]) -> BobStandingQuestion:
    """
    Forget the question entirely.

    The ANSWERS it produced are untouched: they are posts in the river, and a
    thread is a record of something Bob actually said. Deleting the question
    must not rewrite history.
    """
    row = await _owned(session, owner, which)
    await session.delete(row)
    await session.flush()
    return row


# ---------------------------------------------------------------------------
# The tick's side
# ---------------------------------------------------------------------------

async def due(session: AsyncSession, now: datetime) -> list[dict]:
    """
    Every enabled question whose slot has arrived and has not been claimed.

    Returns plain values, not rows: the tick re-reads each one in its own
    session before claiming it, so nothing here may be held across that.
    """
    rows = (await session.execute(
        select(BobStandingQuestion)
        .where(BobStandingQuestion.enabled.is_(True))
        .order_by(BobStandingQuestion.last_slot.asc().nulls_first())
    )).scalars().all()

    candidates = []
    for row in rows:
        slot = slots.slot_for(kind=row.kind, hour=row.hour, minute=row.minute,
                              days_of_week=row.days_of_week, now=now)
        if slot is None:
            continue
        if row.last_slot is not None and row.last_slot.astimezone(slots.MANILA) >= slot:
            continue
        candidates.append({"id": row.id, "slot": slot, "last_slot": row.last_slot})
    return candidates


async def claim(session: AsyncSession, *, row_id, slot: datetime) -> bool:
    """One slot, one process. See app.services.slots."""
    return await slots.claim(session, table=TABLE, row_id=row_id, slot=slot)


async def record_outcome(session: AsyncSession, *, row_id, status: str,
                         thread_id: Optional[str] = None,
                         error: Optional[str] = None) -> None:
    """
    What happened, on the row, so the next open can find the answer.

    A FAILED RUN KEEPS THE PREVIOUS THREAD. `last_thread_id` moves only on a
    successful answer, because the room opens on it: a morning that broke must
    not blank the screen, and must not point at a thread with nothing in it.
    The failure is still recorded and still visible on the row.
    """
    row = (await session.execute(
        select(BobStandingQuestion).where(BobStandingQuestion.id == row_id)
    )).scalars().first()
    if row is None:
        return
    row.last_run_at = datetime.now(slots.MANILA)
    row.last_status = status
    row.last_error = (error or None) and str(error)[:2000]
    if status == "ok" and thread_id:
        row.last_thread_id = uuid.UUID(str(thread_id))
    await session.flush()
