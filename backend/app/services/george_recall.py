"""
What George already told this person, in other chats.

THE PROBLEM THIS SOLVES, AND THE ONE IT DOES NOT. Inside a chat George already
has everything: the client replays up to twenty turns, each with the calls
behind it, and the figure he quoted three turns ago is in the prompt whether or
not he uses it. Across chats he has nothing at all — the loop's read role
cannot see the `george` schema, and its log role has INSERT without SELECT, so
neither of George's identities can read a past conversation. The only reader is
the application role, in this process, which /george/chats already uses.

SO THIS IS A LOOKUP, NOT A RETRIEVAL SYSTEM. One indexed SELECT over the
caller's own rows. No embedding, no index of its own, no ranking beyond
recency: the question "what did I say about this last week" is answered well
enough by the last handful of things said, and anything cleverer would be a
system to maintain in exchange for a nicer adverb.

BUILT FROM `receipts`, NOT FROM THE PROSE. Every turn stores the last tool's
whole meta — the metric, the window's start and end, the source table, the
snapshot timestamp — so a figure's identity and its window are already on disk
in machine-readable form. A regex hunting numbers in an answer would eventually
surface one no tool ever returned, which is the single failure this whole
system exists to prevent. The answer text is included only as a short opening
fragment, and it is quoted as an opening fragment, so nothing in it can be
mistaken for a current figure.

IT IS CONTEXT, NEVER EVIDENCE. The prompt rule that goes with this (agent/loop
SYSTEM_PROMPT rule 13) says a recalled figure may be REFERENCED with its date
and may never be restated as current or used in a calculation. Rule 1 is
untouched: every number George states comes from a tool result in the
conversation he is having.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Bounded like the history replay is bounded, and for the same reason: this
# lands in the prompt, so its size is a bill. Six turns is enough to cover
# "what did I ask on Thursday" without becoming a second conversation.
MAX_RECALL_TURNS = 6
MAX_ANSWER_HEAD = 160
MAX_QUESTION = 80

_SQL = """
SELECT c.asked_at,
       c.question,
       c.final_answer,
       c.receipts
FROM george.conversations c
WHERE c.user_id = :u
  AND c.hidden_at IS NULL
  AND c.final_answer IS NOT NULL
  AND COALESCE(c.thread_id, c.id) <> COALESCE(CAST(:exclude AS uuid), '00000000-0000-0000-0000-000000000000'::uuid)
ORDER BY c.asked_at DESC
LIMIT :limit
"""


def _clip(value: Optional[str], limit: int) -> str:
    s = " ".join(str(value or "").split())
    return s if len(s) <= limit else f"{s[:limit].rstrip()}…"


def _figure(receipts: Optional[dict]) -> str:
    """
    What the answer was ABOUT, from its receipts: the metric and the window.

    Deliberately not the number itself. The number lives in the answer text,
    which is quoted as a fragment; what makes a reference possible is knowing
    which measure over which window — without that, "up from ₱179k" could be
    comparing a week against a day.
    """
    if not receipts:
        return ""
    parts: list[str] = []
    metric = receipts.get("metric")
    if metric:
        parts.append(str(metric))
    window = receipts.get("window") or {}
    start, end = window.get("start"), window.get("end")
    if start and end:
        parts.append(f"over {start}→{end}")
    elif window.get("name"):
        parts.append(f"over {window['name']}")
    return " ".join(parts)


def _line(row: dict[str, Any]) -> str:
    """One recalled turn: when, what was asked, what it measured, how it began."""
    asked_at = row.get("asked_at")
    day = asked_at.date().isoformat() if asked_at else "an unknown day"
    parts = [day, f'"{_clip(row.get("question"), MAX_QUESTION)}"']
    receipts = row.get("receipts")
    figure = _figure(dict(receipts) if receipts else None)
    if figure:
        parts.append(figure)
    # Quoted as an opening fragment and labelled as one, so it cannot be read
    # as a standing figure.
    parts.append(f'answer began "{_clip(row.get("final_answer"), MAX_ANSWER_HEAD)}"')
    return " · ".join(parts)


async def recent_figures(
    session: AsyncSession,
    username: str,
    exclude_thread: Optional[str] = None,
    limit: int = MAX_RECALL_TURNS,
) -> list[str]:
    """
    The caller's most recent answered turns outside the current chat, one line
    each, newest first.

    Args:
        session: the application session. This reads the `george` schema, which
            George's own roles cannot.
        username: whose chats. Never taken from a request body — the caller
            passes the identity it verified.
        exclude_thread: the chat being continued. Its own turns are replayed as
            history already, and repeating them here would spend tokens saying
            the same thing twice.
        limit: how many turns. Bounded because this lands in the prompt.
    """
    rows = (
        await session.execute(
            text(_SQL),
            {"u": username, "exclude": exclude_thread, "limit": limit},
        )
    ).mappings().all()

    return [_line(dict(r)) for r in rows]


def as_block(lines: list[str]) -> Optional[str]:
    """
    The lines as the paragraph the loop appends to the question, or None when
    there is nothing to recall.

    The framing is part of the guarantee: it says what these are and what may
    be done with them, right next to them, rather than relying on the system
    prompt alone to be remembered thirty turns later.
    """
    if not lines:
        return None
    body = "\n".join(f"- {line}" for line in lines)
    return (
        "[Earlier conversations with this user, most recent first. These are for "
        "REFERENCE ONLY — you may mention one with its date to show how a figure "
        "has moved, but you may not restate it as a current number, use it in a "
        "calculation, or treat it as a tool result. Any number you state still "
        "has to come from a tool call in this conversation.]\n"
        f"{body}"
    )


def build_recall_context(rows: list[dict[str, Any]]) -> Optional[str]:
    """Rows straight to the block, with no session involved — what the tests use."""
    return as_block([_line(r) for r in rows])
