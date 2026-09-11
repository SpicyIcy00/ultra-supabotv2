"""
Asking a standing question when its slot comes round.

WHAT THIS IS NOT. It is not a briefing generator. Nothing in this file decides
what goes on the board, which shops matter, or what the morning means — it asks
George a question and keeps what he says. The composition, the reading and the
judgment are his, made with the same tools and the same prompt as a question
typed at 11pm. That is the whole point of the correction that produced it:
*"we're supposed to make George able to make those briefs on its own"*.

WHAT AN UNATTENDED GEORGE MAY DO, AND WHY THE LIST IS SHORT.

Architecture rule 7 gates unattended WORKFLOWS behind a backtest and a
promotion, because a workflow computes: its steps are fixed, so a backtest
proves what it would have said and a person approves that. A question has no
steps to backtest — the answer is whatever the morning's data makes true — so
the same gate here would be a ceremony with nothing behind it, and pretending
otherwise would be worse than not having one.

What stands in its place is capability, which is real:

    given     every read tool, `compose`, view_memory, view_automations,
              record_belief
    withheld  pin_answer, save_workflow, create_page, edit_page, run_workflow,
              view_page, set_standing_question

So an unattended turn can read, think, answer and REMEMBER — and it cannot
change the shape of the system while nobody is watching. It cannot pin a tile,
build a page, save a rule, or touch its own schedule; a question that could
reschedule itself is a thing that gets away from you. The withheld half is
enforced by absence, not by refusal: a tool with no injected capability is not
in the model's schema at all (CLAUDE.md rule 4), so there is nothing to decline.

REMEMBERING IS DELIBERATELY ON THE GIVEN SIDE. A morning read that settles what
George thinks and then forgets it is the exact failure the beliefs table was
built to end, and the mornings are when most of his views will form. A belief
is append-only, carries no figure, and names the calls behind it, so the worst
an unattended one can do is be wrong in a sentence that is dated, attributable
and superseded by the next read.

ONE ANSWER PER SLOT, AND A FAILURE IS LOUD. The slot is claimed before the run
(app.services.slots), so a crash is recorded rather than quietly re-delivered
an hour later wearing the 06:00 timestamp. `last_thread_id` moves only on
success, because the room opens on it: a morning that broke must not blank the
screen or point at an empty thread.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent import loop as george_loop
from app.models.george_standing import GeorgeStandingQuestion
from app.services import belief_store as beliefs_service
from app.services import self_reader, slots, standing_questions

# A scheduled ask is bounded harder than a live one. A person can watch a long
# turn and stop it; nobody is watching this one.
MAX_SECONDS = 300


def instructions_block(row: GeorgeStandingQuestion) -> Optional[str]:
    """
    The owner's standing instructions, labelled as his words.

    LABELLED, because the model has to be able to tell the difference between
    what a person wants emphasised and what is true. "Show more of Rockwell" is
    an instruction about attention; it is not evidence, and it cannot make a
    figure exist. Said plainly here so it cannot be read as a definition.
    """
    lines = [str(i) for i in (row.instructions or []) if str(i).strip()]
    if not lines:
        return None
    listed = "\n".join(f"- {line}" for line in lines)
    return (
        "[Standing instructions for this question, written by the person who "
        "asked it]\n"
        "These say how they want it answered — what to show more of, what to "
        "leave out, what to lead with. They are preferences about ATTENTION, "
        "not definitions and not evidence: they cannot make a figure true, "
        "change what a metric means, or stand in for a read. Every number in "
        "your answer still comes from a tool result in this turn.\n"
        f"{listed}"
    )


def _belief_store(owner: str):
    """
    Where a scheduled turn's views are kept.

    The SAME service function the /george/ask route binds (belief_store.record)
    — this one is bound to the standing question's owner rather than to an
    authenticated session, because there is no session. George holds no
    credential either way.
    """
    from app.core.database import AsyncSessionLocal

    class _Store:
        async def record(self, accepted: list[dict]) -> list[dict]:
            async with AsyncSessionLocal() as session:
                rows = await beliefs_service.record(
                    session, accepted, created_by=owner, conversation_id=None
                )
                await session.commit()
                return rows

    return _Store()


def _memory_reader(owner: str):
    """What George currently believes. Same service function the route binds."""
    from app.core.database import AsyncSessionLocal

    async def read() -> dict:
        async with AsyncSessionLocal() as session:
            return await self_reader.read_memory(session, username=owner)

    return read


def _decisions_reader():
    """What people did with what George raised. Same service function the route binds."""
    from app.core.database import AsyncSessionLocal
    from app.services import decisions as decisions_service

    async def read() -> list[dict]:
        async with AsyncSessionLocal() as session:
            return await decisions_service.recent(session)

    return read


def _automations_reader(owner: str):
    """What the systems have been doing. Same service function the route binds."""
    from app.core.database import AsyncSessionLocal

    async def read() -> dict:
        async with AsyncSessionLocal() as session:
            return await self_reader.read_automations(session, username=owner)

    return read


async def _beliefs_block() -> Optional[str]:
    """
    What he already thinks, as the frame the question is read in.

    Never fatal: a lookup that fails costs the block, not the morning. George
    without his beliefs is the George of a fortnight ago, which is worse than
    this morning's George and better than no answer.
    """
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            rows = await beliefs_service.current(session)
            latest = await beliefs_service.latest_data_at(session)
        return beliefs_service.as_block(rows, latest_data=latest)
    except Exception as exc:  # noqa: BLE001 - a missing frame must not cost the answer
        print(f"[standing] beliefs unavailable: {type(exc).__name__}: {exc}")
        return None


def silent_in(event: Optional[str], data: dict) -> bool:
    """
    Whether a frame says the morning found nothing.

    get_attention's meta.silent is the judgement layer saying "nothing
    crossed"; a scheduled answer that read it is recorded as `silent` rather
    than `ok`, and latest_answer offers only `ok` — so the room does not open
    on a morning with nothing in it (management by exception: silence is the
    normal state, and an opening that said "nothing" would be an alarm clock).
    """
    if event != "tool_result" or data.get("tool") != "get_attention":
        return False
    meta = data.get("meta") or {}
    return bool(meta.get("silent"))


def _parse(frame: str) -> tuple[Optional[str], dict]:
    """One SSE frame back into (event, data). The loop's only output shape."""
    event, data = None, {}
    for line in frame.splitlines():
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            try:
                data = json.loads(line[5:].strip())
            except json.JSONDecodeError:
                data = {}
    return event, data


async def ask(row: GeorgeStandingQuestion, *, slot: datetime,
              missed: Optional[list[datetime]] = None) -> dict[str, Any]:
    """
    Ask one standing question and keep what comes back.

    Returns {status, thread_id, error, tool_calls}. Never raises: a scheduler
    that lets one question's exception escape stops ticking for every other one.
    """
    standing = instructions_block(row)
    if missed:
        notice = slots.describe_skipped(
            missed, source="app.services.standing_runner"
        )
        # Told to George rather than rendered around him: he is writing the
        # answer, so the caveat has to be in his hands, above the figures,
        # exactly as UI rule 4 requires of every other surface.
        standing = "\n\n".join(filter(None, [
            standing,
            "[About this run]\n" + notice["message"] +
            " Say this at the top of your answer.",
        ]))

    thread_id: Optional[str] = None
    status = "failed"
    error: Optional[str] = None
    calls = 0
    silent = False

    try:
        async for frame in george_loop.run(
            row.question,
            user_id=row.owner,
            history=[],
            standing=standing,
            beliefs=await _beliefs_block(),
            belief_store=_belief_store(row.owner),
            memory_reader=_memory_reader(row.owner),
            automations_reader=_automations_reader(row.owner),
            # A read, not a write: the morning learns from what was done with
            # the last one. Nothing here lets a scheduled turn change what
            # else runs unattended.
            decisions_reader=_decisions_reader(),
            # Everything else is withheld on purpose — see the module
            # docstring. Absent capability means absent tool, not a refusal.
        ):
            event, data = _parse(frame)
            if event == "start":
                thread_id = data.get("thread_id")
            elif event == "tool_call":
                calls += 1
            elif silent_in(event, data):
                silent = True
            elif event == "error":
                error = str(data.get("message"))[:2000]
            elif event == "done":
                thread_id = data.get("thread_id") or thread_id
                status = "ok" if data.get("status") == "ok" else "failed"
    except Exception as exc:  # noqa: BLE001 - one question must not stop the tick
        status, error = "failed", f"{type(exc).__name__}: {exc}"
    if status == "ok" and silent:
        # Answered, and the answer was "nothing crossed". Recorded as its own
        # outcome: not a failure, and not an answer the room opens on.
        status = "silent"

    return {"status": status, "thread_id": thread_id, "error": error,
            "tool_calls": calls}


async def run_due(session: AsyncSession, row_id, slot: datetime,
                  missed: list[datetime]) -> str:
    """Ask one claimed question and write down what happened."""
    row = (await session.execute(
        select(GeorgeStandingQuestion).where(GeorgeStandingQuestion.id == row_id)
    )).scalars().first()
    if row is None or not row.enabled:
        return "gone"

    outcome = await ask(row, slot=slot, missed=missed)
    await standing_questions.record_outcome(
        session, row_id=row_id, status=outcome["status"],
        thread_id=outcome["thread_id"], error=outcome["error"],
    )
    return outcome["status"]


# ---------------------------------------------------------------------------
# The tick
# ---------------------------------------------------------------------------

async def tick() -> None:
    """
    Runs every minute. Asks each due question at most once per slot.

    Each question gets its OWN session and its own try/except, for the reason
    workflow_scheduler gives: one failure must not roll back another's record,
    and must not stop the tick.
    """
    from app.core.database import AsyncSessionLocal

    now = datetime.now(slots.MANILA)
    async with AsyncSessionLocal() as session:
        candidates = await standing_questions.due(session, now)

    for candidate in candidates:
        async with AsyncSessionLocal() as session:
            try:
                row = (await session.execute(
                    select(GeorgeStandingQuestion)
                    .where(GeorgeStandingQuestion.id == candidate["id"])
                )).scalars().first()
                if row is None or not row.enabled:
                    continue

                missed = slots.skipped_slots(
                    kind=row.kind, hour=row.hour, minute=row.minute,
                    days_of_week=row.days_of_week,
                    slot=candidate["slot"], last_slot=row.last_slot,
                )

                if not await standing_questions.claim(
                    session, row_id=candidate["id"], slot=candidate["slot"]
                ):
                    # Another process has this slot. Not an error.
                    await session.rollback()
                    continue
                await session.commit()

                status = await run_due(session, candidate["id"],
                                       candidate["slot"], missed)
                await session.commit()
                print(f"[standing] {candidate['id']} slot "
                      f"{candidate['slot'].isoformat()} -> {status}")
            except Exception as exc:  # noqa: BLE001 - one must not stop the tick
                await session.rollback()
                print(f"[standing] tick error on {candidate['id']}: "
                      f"{type(exc).__name__}: {exc}")


async def tick_safely() -> None:
    """Wrapper for APScheduler, which swallows nothing usefully on its own."""
    try:
        await tick()
    except Exception as exc:  # noqa: BLE001
        print(f"[standing] tick failed: {type(exc).__name__}: {exc}")


TICK_MINUTES = 1
