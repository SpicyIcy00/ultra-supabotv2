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
    """Everything George currently believes. A belief is current until superseded."""
    rows = await session.execute(text("""
        SELECT id, subject_kind, subject, stance, claim, evidence,
               confirmed_at, held_since, why
        FROM george.beliefs
        WHERE superseded_by IS NULL
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
        held = await session.execute(text("""
            SELECT id, held_since FROM george.beliefs
            WHERE superseded_by IS NULL
              AND subject_kind = :kind AND subject = :subject AND stance = :stance
            ORDER BY confirmed_at DESC LIMIT 1
        """), {"kind": belief["subject_kind"], "subject": belief["subject"],
               "stance": belief["stance"]})
        same = held.mappings().first()

        # A view George already holds, read again and still true. Nothing new
        # is stored: the clock moves and the evidence is refreshed.
        if same is not None and not belief.get("supersedes"):
            await session.execute(text("""
                UPDATE george.beliefs
                SET confirmed_at = :now, evidence = CAST(:evidence AS jsonb)
                WHERE id = :id
            """), {"now": now, "evidence": _json(belief["evidence"]), "id": same["id"]})
            out.append({"id": same["id"], "subject": belief["subject"],
                        "stance": belief["stance"], "claim": belief["claim"],
                        "outcome": "confirmed", "held_since": same["held_since"]})
            continue

        held_since = now
        if belief.get("supersedes"):
            prior = await session.execute(text("""
                SELECT id, held_since FROM george.beliefs
                WHERE id = :id AND superseded_by IS NULL
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
                (id, subject_kind, subject, stance, claim, evidence,
                 confirmed_at, held_since, supersedes, why,
                 created_by, conversation_id)
            VALUES
                (:id, :kind, :subject, :stance, :claim, CAST(:evidence AS jsonb),
                 :now, :held_since, :supersedes, :why, :created_by, :conversation_id)
        """), {
            "id": new_id, "kind": belief["subject_kind"], "subject": belief["subject"],
            "stance": belief["stance"], "claim": belief["claim"],
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
        stale = bool(latest_data and confirmed and confirmed < latest_data)
        age = f"held {held}" if held else "held since today"
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
        "change with its id.]\n"
        + "\n".join(lines) + tail
    )


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
