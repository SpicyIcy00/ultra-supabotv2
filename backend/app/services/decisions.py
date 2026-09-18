"""
What people did with what Bob raised, and how it is read back.

WHY A SERVICE AND NOT A TOOL. Decisions live in the `bob` schema, which
george_ro cannot see, so the rule that governs pins, beliefs and page reads
governs this: the room writes through `POST /bob/decisions` on the
application role; the agenda reads through an injected reader bound in the
web process or the standing runner; agent/ never imports backend/.

TWO THINGS THIS FILE HOLDS.

  A DECISION IS A GESTURE, NOT AN INFERENCE. `record` takes one outcome from
  the closed set for one attention row. There is no "auto-dismiss", no decay
  and no write for a row nobody touched: learning from silence is how a
  system starts deciding what you meant.

  THE READ IS A WINDOW, NOT THE TABLE. `recent` returns what happened in the
  last `window_days` (metrics.yaml attention.learning.window_days is the
  definition; the default here is held equal to it by the contract test), so
  a shop set aside in June does not rank last in September.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bob_decision import DECISION_OUTCOMES, BobDecision

#: Held equal to metrics.yaml attention.learning.window_days by the contract.
WINDOW_DAYS = 30
#: More than this in a month is a runaway client, not a record.
MAX_RECENT = 2000


class DecisionRefused(ValueError):
    """The gesture cannot be recorded as asked, and the message says why."""


async def record(session: AsyncSession, *, what: str, source: str, subject: str,
                 outcome: str, decided_by: str, raised_at: Optional[datetime] = None,
                 thread_id: Optional[str] = None) -> BobDecision:
    """One gesture on one attention row. Never updates; a change of mind is another row."""
    if outcome not in DECISION_OUTCOMES:
        raise DecisionRefused(
            f"'{outcome}' is not a decision. One of: {', '.join(DECISION_OUTCOMES)}."
        )
    what = (what or "").strip()
    if not what:
        raise DecisionRefused("A decision has to be about something: `what` is blank.")
    row = BobDecision(
        id=str(uuid.uuid4()),
        what=what[:500],
        source=(source or "").strip()[:100],
        subject=(subject or "").strip()[:300],
        outcome=outcome,
        raised_at=raised_at,
        decided_by=decided_by,
        thread_id=thread_id,
    )
    session.add(row)
    await session.flush()
    return row


async def recent(session: AsyncSession, *, window_days: int = WINDOW_DAYS) -> list[dict[str, Any]]:
    """Every decision in the window, newest first. Shared: no owner scope."""
    since = datetime.now(timezone.utc) - timedelta(days=int(window_days))
    rows = (await session.execute(
        select(BobDecision)
        .where(BobDecision.decided_at >= since)
        .order_by(BobDecision.decided_at.desc())
        .limit(MAX_RECENT)
    )).scalars().all()
    return [as_row(r) for r in rows]


def as_row(row: BobDecision) -> dict[str, Any]:
    return {
        "id": row.id,
        "what": row.what,
        "source": row.source,
        "subject": row.subject,
        "outcome": row.outcome,
        "raised_at": row.raised_at,
        "decided_at": row.decided_at,
        "decided_by": row.decided_by,
        "thread_id": row.thread_id,
    }
