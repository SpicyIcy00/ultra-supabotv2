"""
Where George's understanding is kept, and how it is read back.

WHY A SERVICE AND NOT A TOOL. Beliefs live in the `george` schema, which
george_ro cannot see, so the same rule that governs pins, workflows and page
reads governs this: the loop is handed a capability by whoever runs it, the
write happens on the application role, and agent/ never imports backend/.
agent/beliefs.py decides what is ADMISSIBLE; this file decides what is STORED
and what comes back.

THREE THINGS THIS FILE DOES THAT THE VALIDATOR CANNOT.

  RE-RECORDING A VIEW IS A CONFIRMATION, NOT A DUPLICATE. If George already
  holds the same stance about the same subject, `confirmed_at` moves and
  nothing else does. That is what makes "held since Friday, confirmed this
  morning" a true sentence rather than a decorative one, and it is why the
  table separates confirmed_at from created_at.

  A REVISION CARRIES ITS HISTORY FORWARD. Superseding a belief stamps the old
  row with `superseded_by` and copies its `held_since` onto the new one, so a
  change of wording does not reset the clock on a view somebody has held for
  two weeks.

  FRESHNESS IS COMPUTED AGAINST THE DATA, NOT ASSERTED. `as_block` marks a
  belief unconfirmed when business data has landed since it was last checked.
  Without that, memory is just an old answer with authority — the exact failure
  a stored figure would cause, arriving through a stored sentence instead.

BELIEFS ARE SHARED. Unlike a pin or a page there is no owner scope: there is
one Rockwell, and what George thinks about it is not one person's.
`created_by` is provenance and no query filters by it.

TWO MORE THINGS THIS FILE DOES, ADDED 2026-09-15 FOR P2.f.

  IT COUNTS WHAT IT HANDED OVER. `mark_applied` moves `applied_count` and
  `last_applied_at` for exactly the views that reached a question. That is the
  only thing the count means — not that a view changed an answer, which
  nothing here can observe — and `self_reader.read_memory` says so in its own
  note rather than letting the number imply more than it measured.

  IT FORGETS WITHOUT DELETING. `forget` stamps `forgotten_at` and the person
  who did it. The row stays, for the reason the migration gives: a belief that
  can vanish takes the reason it changed with it. A forgotten view is simply
  not current, so it leaves the prompt and `view_memory` in the same breath.
  Forgetting is NOT superseding: superseding says "I was wrong, here is what I
  think now" and carries a successor and a reason; forgetting says "stop
  holding this" and has neither.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

#: How many current beliefs reach the prompt. A view of the business somebody
#: can hold in their head is a handful, not a register; past this the block
#: stops being context and starts being a document.
MAX_IN_PROMPT = 12


async def current(session: AsyncSession) -> list[dict[str, Any]]:
    """
    Everything George currently believes.

    A belief is current until it is superseded OR forgotten, and those are two
    different endings: the first was replaced by a better view, the second was
    dropped by a person who said it was wrong to hold at all. Neither row
    leaves the table, and neither reaches a question again.
    """
    rows = await session.execute(text("""
        SELECT id, subject_kind, subject, stance, claim, evidence, told,
               confirmed_at, held_since, why, applied_count, last_applied_at
        FROM george.beliefs
        WHERE superseded_by IS NULL AND forgotten_at IS NULL
        ORDER BY confirmed_at DESC
    """))
    return [dict(r) for r in rows.mappings()]


async def latest_data_at(session: AsyncSession) -> Optional[datetime]:
    """
    When business data last landed.

    Deliberately the transaction stream and nothing else: it is the fastest
    moving source and the one every sales view rests on. A belief older than
    this has not been checked against what has arrived since, and `as_block`
    says so.
    """
    row = await session.execute(text(
        "SELECT MAX(transaction_time) AS t FROM new_transactions"))
    return row.scalar()


async def record(
    session: AsyncSession,
    accepted: list[dict[str, Any]],
    *,
    created_by: Optional[str],
    conversation_id: Optional[str],
) -> list[dict[str, Any]]:
    """
    Store admissible beliefs. Returns one row per belief, saying what happened.

    `accepted` has already been through agent/beliefs.validate, so every entry
    has a legal stance, a claim with no figure, and evidence naming calls that
    ran. What is decided here is whether each one is NEW, a CONFIRMATION of a
    view already held, or a REVISION of one.
    """
    out: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    for belief in accepted:
        # A FORGOTTEN VIEW IS NOT A VIEW HE HOLDS, so it is not what this
        # re-confirms. Without the second clause, forming the same view again
        # after somebody forgot it would quietly resurrect the row they
        # dropped — and it would come back with its old held_since, dated to
        # before the gesture that removed it.
        held = await session.execute(text("""
            SELECT id, held_since FROM george.beliefs
            WHERE superseded_by IS NULL AND forgotten_at IS NULL
              AND subject_kind = :kind AND subject = :subject AND stance = :stance
            ORDER BY confirmed_at DESC LIMIT 1
        """), {"kind": belief["subject_kind"], "subject": belief["subject"],
               "stance": belief["stance"]})
        same = held.mappings().first()

        # A view George already holds, read again and still true. Nothing new
        # is stored: the clock moves and what it rests on is refreshed.
        if same is not None and not belief.get("supersedes"):
            await session.execute(text("""
                UPDATE george.beliefs
                SET confirmed_at = :now, evidence = CAST(:evidence AS jsonb),
                    told = COALESCE(:told, told)
                WHERE id = :id
            """), {"now": now, "evidence": _json(belief["evidence"]),
                   "told": belief.get("told"), "id": same["id"]})
            out.append({"id": same["id"], "subject": belief["subject"],
                        "stance": belief["stance"], "claim": belief["claim"],
                        "outcome": "confirmed", "held_since": same["held_since"]})
            continue

        held_since = now
        if belief.get("supersedes"):
            prior = await session.execute(text("""
                SELECT id, held_since FROM george.beliefs
                WHERE id = :id AND superseded_by IS NULL AND forgotten_at IS NULL
            """), {"id": belief["supersedes"]})
            row = prior.mappings().first()
            if row is None:
                out.append({"subject": belief["subject"], "outcome": "refused",
                            "reason": ("the view being replaced is not one George "
                                       "currently holds")})
                continue
            # A change of wording does not reset the clock on a view held for
            # a fortnight.
            held_since = row["held_since"]

        new_id = uuid.uuid4().hex
        await session.execute(text("""
            INSERT INTO george.beliefs
                (id, subject_kind, subject, stance, claim, evidence, told,
                 confirmed_at, held_since, supersedes, why,
                 created_by, conversation_id)
            VALUES
                (:id, :kind, :subject, :stance, :claim, CAST(:evidence AS jsonb),
                 :told, :now, :held_since, :supersedes, :why, :created_by,
                 :conversation_id)
        """), {
            "id": new_id, "kind": belief["subject_kind"], "subject": belief["subject"],
            "stance": belief["stance"], "claim": belief["claim"],
            "told": belief.get("told"),
            "evidence": _json(belief["evidence"]), "now": now, "held_since": held_since,
            "supersedes": belief.get("supersedes"), "why": belief.get("why"),
            "created_by": created_by, "conversation_id": conversation_id,
        })
        if belief.get("supersedes"):
            await session.execute(text("""
                UPDATE george.beliefs SET superseded_by = :new WHERE id = :old
            """), {"new": new_id, "old": belief["supersedes"]})

        out.append({"id": new_id, "subject": belief["subject"],
                    "stance": belief["stance"], "claim": belief["claim"],
                    "outcome": "revised" if belief.get("supersedes") else "new",
                    "held_since": held_since})

    await session.commit()
    return out


class BeliefNotHeld(LookupError):
    """Forget was asked for a view George is not currently holding."""


async def mark_applied(session: AsyncSession, ids: list[str]) -> int:
    """
    Count the views that reached a question, and say when.

    WHAT THE NUMBER MEANS, EXACTLY: how many questions this view was attached
    to. Not how many answers it changed — nothing on this path can observe
    that, and a count that implied it would be a figure nobody measured. The
    read that shows it carries that sentence with it.

    It is a real distinction between views because the block is capped: only
    the newest `MAX_IN_PROMPT` are attached, so a view that has fallen out of
    the register stops counting while a live one keeps going.

    Never fatal. A turn must not be lost to a counter.
    """
    ids = [i for i in ids if i]
    if not ids:
        return 0
    result = await session.execute(text("""
        UPDATE george.beliefs
        SET applied_count = applied_count + 1, last_applied_at = now()
        WHERE id = ANY(:ids) AND superseded_by IS NULL AND forgotten_at IS NULL
    """), {"ids": ids})
    await session.commit()
    return int(result.rowcount or 0)


async def forget(session: AsyncSession, belief_id: str, *,
                 by: str) -> dict[str, Any]:
    """
    Drop a view, at a person's word. The row stays; it stops being current.

    THE GESTURE IS THEIRS AND THE RECORD SAYS SO. `forgotten_by` is not
    decoration: a view that disappeared with no hand behind it is
    indistinguishable from a bug that cleared the table, and the table refuses
    the row without it.

    NOT A SUPERSEDE. Nothing replaces this view and no reason is asked for —
    "stop holding that" is a complete instruction, and demanding an
    explanation for it would make the easiest gesture on the surface the one
    that costs the most.

    Raises BeliefNotHeld when the id is not a view George currently holds,
    which includes one already forgotten: telling somebody it worked twice is
    telling them something untrue once.
    """
    row = (await session.execute(text("""
        UPDATE george.beliefs
        SET forgotten_at = now(), forgotten_by = :by
        WHERE id = :id AND superseded_by IS NULL AND forgotten_at IS NULL
        RETURNING id, subject, stance, claim, forgotten_at
    """), {"id": belief_id, "by": by})).mappings().first()
    if row is None:
        raise BeliefNotHeld(
            "That is not a view George is currently holding — it was never "
            "formed, it has already been replaced, or it has already been "
            "forgotten."
        )
    await session.commit()
    return dict(row)


def _json(value: Any) -> str:
    import json
    return json.dumps(value)


def as_block(rows: list[dict[str, Any]], latest_data: Optional[datetime] = None,
             now: Optional[datetime] = None) -> Optional[str]:
    """
    What George currently believes, as the block attached to a question.

    THE FRESHNESS MARK IS THE POINT. A belief last confirmed before the newest
    data is labelled `UNCONFIRMED — data has landed since`, because a stored
    view with no age on it is an old answer wearing authority. That is the same
    reasoning as "no number displays without a timestamp", applied to a
    sentence instead of a figure.

    A TAUGHT VIEW IS MARKED AS ONE AND IS NOT DATED THE SAME WAY. A reading of
    data goes stale and says so; "we means the shops" does not, because no
    amount of new data can make it less true that this is what they meant. So
    a `told` view carries their words and when they said them, and never the
    unconfirmed mark — which would be the block asking George to re-read his
    way to a fact no read contains.

    Returns None when George believes nothing, so the first ever conversation
    carries no empty scaffolding.
    """
    if not rows:
        return None
    now = now or datetime.now(timezone.utc)

    lines: list[str] = []
    for row in rows[:MAX_IN_PROMPT]:
        held = _days(row.get("held_since"), now)
        confirmed = row.get("confirmed_at")
        age = f"held {held}" if held else "held since today"
        told = str(row.get("told") or "").strip()
        if told:
            lines.append(
                f"- [{row['stance']}] {row['subject']}: {row['claim']} "
                f"(you were told {_stamp(confirmed)} — {told!r}, {age}) "
                f"[id: {row['id']}]"
            )
            continue
        stale = bool(latest_data and confirmed and confirmed < latest_data)
        mark = " · UNCONFIRMED — data has landed since you last checked" if stale else ""
        lines.append(
            f"- [{row['stance']}] {row['subject']}: {row['claim']} "
            f"({age}, last confirmed {_stamp(confirmed)}{mark}) [id: {row['id']}]"
        )

    more = len(rows) - len(lines)
    tail = f"\n- …and {more} more not shown." if more > 0 else ""

    return (
        "[What you currently believe about this business, from earlier "
        "conversations. These are YOUR views, not tool results: they carry no "
        "figures, and every number you state still has to come from a tool call "
        "in THIS conversation. Say what you already think rather than "
        "rediscovering it, re-check anything marked unconfirmed before relying "
        "on it, and if a read contradicts one of these, say so and record the "
        "change with its id. A line saying YOU WERE TOLD is not a reading and "
        "is not up for re-checking: it is what this person means, so scope and "
        "word the answer their way from here on.]\n"
        + "\n".join(lines) + tail
    )


def in_prompt(rows: list[dict[str, Any]]) -> list[str]:
    """
    The ids `as_block` actually attaches, for the counter to move.

    ONE PLACE DECIDES WHICH VIEWS REACH A QUESTION. Reproducing the cap at the
    call site would let the count drift from the block — and a count of
    applications that did not happen is exactly the kind of unmeasured figure
    this repo refuses everywhere else.
    """
    return [str(r["id"]) for r in rows[:MAX_IN_PROMPT] if r.get("id")]


def _days(since: Any, now: datetime) -> Optional[str]:
    if not isinstance(since, datetime):
        return None
    delta = (now - since).days
    if delta <= 0:
        return None
    return "1 day" if delta == 1 else f"{delta} days"


def _stamp(when: Any) -> str:
    if not isinstance(when, datetime):
        return "unknown"
    return when.astimezone(timezone.utc).strftime("%a %d %b %Y")
