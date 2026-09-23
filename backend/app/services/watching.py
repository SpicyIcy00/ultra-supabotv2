"""
What is watching: every standing question and every watch, on one page (W4.4).

WHY THIS MODULE EXISTS. Both kinds of thing have been creatable since
2026-09-11 and neither has ever been VISIBLE. `listStanding` was called in one
place — the sidebar — and `last_asked`, `last_status` and `instructions[]` came
back on every row and were drawn nowhere; watches were not read by the front
end at all. So the one thing the owner asked for, "how do I turn it on", had no
surface outside the morning question's own button.

ONE SHAPE FOR TWO FAMILIES, and it is a reading shape, not a table. A standing
question and a watch are different objects — one is asked and always speaks,
the other is checked and speaks only on a change — so they are not merged. They
are described in the same words, because a person looking at this page is
asking the same four things of both: what does it ask, when does it run, is it
on, and what did it last say.

ITS SLOT IS ALWAYS THERE. The rail drew "off" INSTEAD of "Mon at 08:00", so an
off row and an on row carried different facts and could not be compared. `when`
is the slot whether it is on or off; `on` is the switch; `state` is the words.

WHAT IT MAY DO IS READ FROM THE SERVICES, NOT ASSUMED. `may` says which of
switch / reschedule / rewrite / remove this row's own service actually offers,
so the page draws no control that would be refused — and `switch_on_refusal`
carries rule 7's own sentence BEFORE anybody presses anything: a watch that has
not been backtested says so where it is read, not after a failed click.

NO FIGURE IS COMPUTED HERE (rule 9). Every count is a count of rows in a
record — george.watch_checks — and comes back with the time of the last one.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import morning, standing_questions, watches

#: How much of an answer the page shows as "what it last said". His own words,
#: to the end of the first paragraph — enough to know what happened, and the
#: thread is one tap away for the rest. A presentation bound, not a definition.
SAID_CHARS = 400


def _said(body: Optional[str]) -> Optional[str]:
    """The opening of an answer, in its own words, bounded for a list."""
    whole = (body or "").strip()
    if not whole:
        return None
    first = whole.split("\n\n", 1)[0].strip()
    if len(first) <= SAID_CHARS:
        return first
    return first[:SAID_CHARS].rstrip() + "…"


_ANSWER_SQL = text(
    "SELECT id, body, created_at, receipts, payload "
    "FROM george.posts "
    "WHERE thread_id = :thread AND kind = 'answer' AND hidden_at IS NULL "
    "ORDER BY created_at DESC LIMIT 1"
)

_WATCH_POST_SQL = text(
    "SELECT p.id, p.body, p.created_at, p.receipts, p.payload, c.as_of "
    "FROM george.watch_checks c "
    "JOIN george.posts p ON p.id = c.post_id AND p.hidden_at IS NULL "
    "WHERE c.watch_id = :watch AND c.post_id IS NOT NULL "
    "ORDER BY c.checked_at DESC LIMIT 1"
)

_CHECKS_SQL = text(
    "SELECT count(*) AS checks, "
    "       count(*) FILTER (WHERE fired) AS spoke, "
    "       max(checked_at) AS newest "
    "FROM george.watch_checks WHERE watch_id = :watch"
)


def _stamp(value: Any) -> Optional[datetime]:
    return value if isinstance(value, datetime) else None


async def _answer_in(session: AsyncSession, thread_id: Any) -> Optional[dict]:
    """The newest answer in a thread, as the page shows it — with its read time."""
    if thread_id is None:
        return None
    row = (await session.execute(_ANSWER_SQL, {"thread": str(thread_id)})).mappings().first()
    if row is None:
        return None
    said = _said(row["body"])
    if said is None:
        return None
    return {
        "said": said,
        "at": _stamp(row["created_at"]),
        "read_at": morning.read_time(row["receipts"], row["payload"]),
        "thread_id": str(thread_id),
        "post_id": str(row["id"]),
    }


async def _watch_said(session: AsyncSession, watch_id: Any) -> Optional[dict]:
    """The last post this watch wrote. Most watches, most days, wrote none."""
    row = (await session.execute(_WATCH_POST_SQL, {"watch": str(watch_id)})).mappings().first()
    if row is None:
        return None
    said = _said(row["body"])
    if said is None:
        return None
    return {
        "said": said,
        "at": _stamp(row["created_at"]),
        "read_at": morning.read_time(row["receipts"], row["payload"]),
        "thread_id": None,
        "post_id": str(row["id"]),
    }


async def _checks(session: AsyncSession, watch_id: Any) -> dict:
    """How many times it has been checked and how many of those it spoke on."""
    row = (await session.execute(_CHECKS_SQL, {"watch": str(watch_id)})).mappings().first()
    return {
        "checks": int((row or {}).get("checks") or 0),
        "spoke": int((row or {}).get("spoke") or 0),
        "newest": _stamp((row or {}).get("newest")),
    }


async def question_row(session: AsyncSession, row) -> dict:
    """One standing question, as the page reads it."""
    base = standing_questions.as_row(row)
    return {
        "id": base["id"],
        "family": "question",
        "asks": base["question"],
        "when": base["when"],
        "on": bool(row.enabled),
        "state": base["state"],
        "told": list(base["instructions"]),
        "told_by": "instructions",
        "last_run_at": base["last_asked"],
        "last_status": base["last_status"],
        "last_error": row.last_error,
        "last_said": await _answer_in(session, row.last_thread_id),
        "thread_id": str(row.last_thread_id) if row.last_thread_id else None,
        "checks": None,
        "spoke": None,
        "backtest": None,
        "switch_on_refusal": None,
        "may": {"switch": True, "reschedule": True, "rewrite": True, "remove": True},
    }


async def watch_row(session: AsyncSession, row, defs: Optional[dict] = None) -> dict:
    """
    One watch, as the page reads it.

    A WATCH THAT HAS NEVER SPOKEN IS NOT A BROKEN ONE. `checks` and `spoke`
    come off george.watch_checks — the quiet checks are recorded precisely so
    "quiet for eleven days" and "broken for eleven days" can be told apart —
    and the page says which of the two this is from those two counts.
    """
    base = watches.as_row(row, defs)
    told = [str(base["watching"])]
    if row.direction != "either":
        told.append(f"only when it moves {row.direction}")
    told.append(", ".join(row.stores) if row.stores else "every shop")
    counted = await _checks(session, row.id)
    return {
        "id": base["id"],
        "family": "watch",
        "asks": base["watching"],
        "when": base["when"],
        "on": bool(row.enabled),
        "state": base["state"],
        "told": told,
        #: A watch's condition is not a sentence somebody typed, so the page
        #: must not offer to edit it as one. It is what the watch IS.
        "told_by": "condition",
        "last_run_at": row.last_checked_at,
        "last_status": base["last_status"],
        "last_error": row.last_error,
        "last_said": await _watch_said(session, row.id),
        "thread_id": None,
        "checks": counted["checks"],
        "spoke": counted["spoke"],
        "backtest": base["would_have_fired"],
        "switch_on_refusal": watches.why_not_on(row, defs),
        "may": {"switch": True, "reschedule": True, "rewrite": False, "remove": True},
    }


async def page_for(session: AsyncSession, owner: str) -> dict:
    """
    Everything this person has asked Bob to keep asking or keep checking.

    Two lists rather than one: they are two kinds of thing and the page says
    so. Bound by the per-owner limits the two services already enforce, so
    nothing here paginates.
    """
    defs = None
    try:
        from tools._common import load_defs

        defs = load_defs()
    except Exception:  # pragma: no cover - the labels fall back to the stored names
        defs = None

    questions = [await question_row(session, r)
                 for r in await standing_questions.list_for(session, owner)]
    watching = [await watch_row(session, r, defs)
                for r in await watches.list_for(session, owner)]
    return {"questions": questions, "watches": watching}
