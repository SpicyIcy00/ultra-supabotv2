"""
The morning, answered before you ask (W2.1, 2026-09-22).

WHAT THIS IS NOT. It is not a briefing generator and holds no business logic:
the morning is a standing question ("how are we doing?") the ordinary loop
answers, on get_overview, with the same tools and prompt as a typed one
(app.services.standing_runner). This module does three small things around it:

  ensure    the person has the morning as a standing question, at the slot
            metrics.yaml `morning` names, BORN OFF (rule 7) — they switch it on.
  today     the answer given today, to the morning question, by this person —
            scheduled or typed, it is the same question and the same answer —
            with its READ TIME: the earliest snapshot_timestamp its reads
            carried.
  reusable  that answer, when the question now asked is the morning question
            and nothing has landed since its read time that its reads cover
            (tools/morning.data_landed_since). The caller then shows it again
            and costs no model turn.

Everything that decides — what is asked, when, what counts as asking it again,
what counts as the data changing — is in metrics.yaml `morning`, read here.
"""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import slots, standing_questions


def _spec() -> dict:
    from tools._common import load_defs, req

    return req(load_defs(), "morning")


def normalise(question: Any) -> str:
    """Lower case, letters digits and spaces only, spaces collapsed."""
    return " ".join(re.sub(r"[^a-z0-9 ]", "", str(question or "").lower()).split())


def is_morning(question: Any, spec: Optional[dict] = None) -> bool:
    """Whether a question IS the morning question (metrics.yaml morning.asks)."""
    spec = spec or _spec()
    said = normalise(question)
    return bool(said) and (said == normalise(spec["question"])
                           or said in {normalise(a) for a in spec["asks"]})


# ---------------------------------------------------------------------------
# The standing question
# ---------------------------------------------------------------------------

async def find(session: AsyncSession, owner: str,
               spec: Optional[dict] = None) -> Optional[Any]:
    """This person's morning: their standing question that asks it, newest first."""
    spec = spec or _spec()
    for row in await standing_questions.list_for(session, owner):
        if is_morning(row.question, spec):
            return row
    return None


async def ensure(session: AsyncSession, owner: str) -> Optional[Any]:
    """
    The person's morning, created if they have none — SWITCHED OFF.

    Created through standing_questions.create, the one write path every
    standing question takes, which creates every one off; `born_enabled` in
    the yaml is asserted rather than obeyed, so a yaml edit cannot make a
    question start firing on its own. A person already at the standing
    question limit gets None: the morning is not worth deleting their own.
    """
    spec = _spec()
    if spec.get("born_enabled") is not False:
        raise ValueError("metrics.yaml morning.born_enabled must be false (rule 7).")
    row = await find(session, owner, spec)
    if row is not None:
        return row
    try:
        return await standing_questions.create(
            session, owner=owner, question=spec["question"],
            hour=int(spec["at"]["hour"]), minute=int(spec["at"]["minute"]),
            kind=spec["kind"], instructions=list(spec.get("instructions") or []),
        )
    except standing_questions.StandingRefused:
        return None


def describe(row: Optional[Any]) -> Optional[dict]:
    """The morning's state as the room shows it — or None when there is none."""
    if row is None:
        return None
    return {
        "standing_question_id": str(row.id),
        "question": row.question,
        "when": standing_questions.when(row),
        "enabled": bool(row.enabled),
    }


# ---------------------------------------------------------------------------
# Today's answer, and its read time
# ---------------------------------------------------------------------------

def _stamps(node: Any) -> list[datetime]:
    """Every snapshot_timestamp anywhere in a stored answer's receipts or payload."""
    out: list[datetime] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "snapshot_timestamp" and isinstance(v, str):
                try:
                    t = datetime.fromisoformat(v.replace("Z", "+00:00"))
                except ValueError:
                    continue
                out.append(t if t.tzinfo else t.replace(tzinfo=timezone.utc))
            else:
                out.extend(_stamps(v))
    elif isinstance(node, list):
        for v in node:
            out.extend(_stamps(v))
    return out


def read_time(receipts: Any, payload: Any) -> Optional[datetime]:
    """The EARLIEST read behind an answer — it is as old as its oldest read."""
    stamps = _stamps(receipts) + _stamps(payload)
    return min(stamps) if stamps else None


def _day(now: datetime) -> tuple[datetime, datetime]:
    local = now.astimezone(slots.MANILA)
    start = datetime(local.year, local.month, local.day, tzinfo=slots.MANILA)
    return start, start + timedelta(days=1)


_TODAY_SQL = text(
    "SELECT q.body AS question, q.thread_id, a.id AS answer_id, "
    "       a.created_at AS answered_at, a.receipts, a.payload "
    "FROM george.posts q "
    "JOIN george.posts a ON a.parent_id = q.id AND a.kind = 'answer' "
    "                   AND a.hidden_at IS NULL "
    "JOIN george.conversations c ON c.id = a.conversation_id AND c.status = 'ok' "
    "WHERE q.kind = 'question' AND q.author_user = :owner AND q.hidden_at IS NULL "
    "  AND q.created_at >= :start AND q.created_at < :end "
    "ORDER BY a.created_at DESC LIMIT 50"
)


async def today(session: AsyncSession, owner: str, *,
                now: Optional[datetime] = None) -> Optional[dict]:
    """
    The newest answer today (Manila) to the morning question, by this person.

    Scheduled or typed is not distinguished: both are the question asked and
    answered by the same loop, and whichever is newest is the morning's page.
    """
    spec = _spec()
    start, end = _day(now or datetime.now(timezone.utc))
    rows = (await session.execute(_TODAY_SQL, {"owner": owner, "start": start,
                                               "end": end})).mappings().all()
    for r in rows:
        if not is_morning(r["question"], spec):
            continue
        read_at = read_time(r["receipts"], r["payload"])
        return {
            "thread_id": str(r["thread_id"]),
            "question": r["question"],
            "answered_at": r["answered_at"],
            "read_at": read_at,
            "answer_post_id": str(r["answer_id"]),
        }
    return None


async def reusable(session: AsyncSession, owner: str, question: str, *,
                   now: Optional[datetime] = None,
                   landed: Optional[Callable[[datetime], dict]] = None) -> Optional[dict]:
    """
    Today's morning answer, if `question` is the morning question and nothing
    has landed since its read time that its reads cover — else None, and the
    question is asked as any other.

    `landed` is tools/morning.data_landed_since, a synchronous read on Bob's
    read-only role, run in a worker thread. An answer with no read time is
    never reused: "nothing changed since" needs a since.
    """
    spec = _spec()
    if not spec["reuse"].get("same_day") or not is_morning(question, spec):
        return None
    found = await today(session, owner, now=now)
    if found is None or found["read_at"] is None:
        return None
    if landed is None:
        from tools.morning import data_landed_since as landed
    check = await asyncio.to_thread(landed, found["read_at"])
    if (check.get("meta") or {}).get("changed"):
        return None
    return {**found, "checked_at": (check.get("meta") or {}).get("snapshot_timestamp")}
