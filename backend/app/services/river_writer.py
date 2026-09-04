"""
George's own posts, written into the river.

ONE FUNCTION PER KIND, and one place that decides ids and visibility, so the
brief route, the scheduler and the workflow writer cannot each answer those
questions differently. The loop writes its own two kinds through
ConversationLog (INSERT-only, george_log); everything here runs on the
APPLICATION role, which already writes workflow_runs and pins.

IDEMPOTENT BY CONSTRUCTION. Every id is derived from something that identifies
the event exactly once — the brief's Manila date, a run's id, a version's id —
so a second write of the same event collides on the primary key and is skipped.
That is not a nicety:

  - POST /brief/send has no claim mechanism at all. n8n retrying a timed-out
    send would post the morning brief twice.
  - The workflow scheduler claims a slot in the database, but the claim covers
    the RUN, not this write; a retry after a partial failure could still arrive
    here twice.

`ON CONFLICT DO NOTHING` rather than a check-then-insert, because the check and
the insert are two statements and the race lives between them.

VISIBILITY IS NOT DECIDED HERE. It comes from default_visibility() in the
model, which is the single place the asymmetry lives (CLAUDE.md, "The river").
Everything in this module is one of George's own kinds, so all of it is org.

THE NOTICE KIND IS DELIBERATELY ABSENT. `notice` means George noticed something
BETWEEN briefs, which is what a Watch is (CLAUDE.md vocabulary, added
2026-09-05). Filling it with the brief's other items would make a one-post
morning into seven and would spend the word before the concept it was reserved
for arrives. The brief post already says how many other items there are, and
the chips make them reachable.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_post import default_visibility

# The columns every post carries. Written once so a new writer cannot quietly
# omit receipts or notices — UI rules 3, 4 and 6 apply to all eight kinds.
_INSERT = """
INSERT INTO george.posts
    (id, thread_id, parent_id, kind, author, author_user, owner_user,
     visibility, body, payload, receipts, notices, conversation_id, created_at)
VALUES
    (:id, :thread_id, NULL, :kind, 'george', NULL, NULL,
     :visibility, :body, CAST(:payload AS jsonb), CAST(:receipts AS jsonb),
     CAST(:notices AS jsonb), NULL, :created_at)
ON CONFLICT (id) DO NOTHING
"""


def post_id(kind: str, key: str) -> uuid.UUID:
    """
    The id an event's post has, derived from the event rather than from a clock.

    Same md5-to-uuid rule ConversationLog.post_ids() and the backfill use, so
    every deterministic id in this system is produced one way. `kind` is part
    of the key so two different events can never collide by sharing a key.
    """
    digest = hashlib.md5(f"{kind}:{key}".encode()).hexdigest()
    return uuid.UUID(digest)


async def _write(
    db: AsyncSession,
    *,
    kind: str,
    key: str,
    body: str,
    payload: Optional[dict[str, Any]] = None,
    receipts: Optional[dict[str, Any]] = None,
    notices: Optional[list[dict[str, Any]]] = None,
    created_at: Optional[datetime] = None,
) -> Optional[uuid.UUID]:
    """
    One post, or None if this event already has one.

    Returns the id when a row was inserted and None when the conflict clause
    swallowed it, so a caller can tell "posted" from "already posted" without
    reading the table back.
    """
    import json

    pid = post_id(kind, key)
    result = await db.execute(
        text(_INSERT),
        {
            "id": pid,
            # A George post with no replies is its own thread. A reply to it
            # carries this id forward, which is how a thread emerges.
            "thread_id": pid,
            "kind": kind,
            "visibility": default_visibility(kind),
            "body": body,
            "payload": json.dumps(payload) if payload is not None else None,
            "receipts": json.dumps(receipts) if receipts is not None else None,
            "notices": json.dumps(notices or []),
            "created_at": created_at or datetime.now(tz=None).astimezone(),
        },
    )
    return pid if (result.rowcount or 0) > 0 else None


# ---------------------------------------------------------------------------
# The brief
# ---------------------------------------------------------------------------

async def post_brief(
    db: AsyncSession, *, greeting: dict[str, Any], as_of: date,
) -> Optional[uuid.UUID]:
    """
    This morning's brief, as a post.

    THE BODY IS THE GREETING, unchanged. build_greeting() already produces the
    one thing a brief post needs and produces it under the same constraints: a
    standalone sentence a voice layer could speak, the ITEM's own receipts
    rather than the brief's (a brief mixes sources of different ages, and the
    brief-level timestamp would lend the freshest source's credibility to the
    stalest source's facts), and every notice flattened with none dropped.

    So this does not render a brief. It persists the rendering that exists, and
    the three shapes come with it — including `could_not_look`, which is the
    one that must never be collapsed into "nothing moved".

    Keyed on the Manila date the brief is written ON, so the morning has
    exactly one brief however many times it is sent.
    """
    return await _write(
        db,
        kind="brief",
        key=as_of.isoformat(),
        body=greeting["headline"],
        payload={
            "shape": greeting["kind"],
            "as_of": as_of.isoformat(),
            "follow_ups": greeting.get("follow_ups") or [],
            "blind_sections": greeting.get("blind_sections") or [],
        },
        # The item's own receipts where there is an item; the brief's otherwise
        # — the same choice Greeting.tsx makes, for the same reason.
        receipts=(greeting.get("item") or {}).get("receipts") or greeting.get("meta"),
        notices=greeting.get("notices") or [],
    )


# ---------------------------------------------------------------------------
# A scheduled workflow run
# ---------------------------------------------------------------------------

async def post_workflow_run(
    db: AsyncSession, *, run_id: uuid.UUID, workflow_name: str, version: int,
    outcome: dict[str, Any], slot: Optional[datetime] = None,
) -> Optional[uuid.UUID]:
    """
    A saved rule that fired, as a post.

    SCHEDULED RUNS ONLY. A manual run in conversation already becomes an
    `answer` post with the whole exchange around it; posting it again here
    would say the same thing twice under a different heading.

    The notices are the run's own, and they matter more than the figures: a
    `version_divergence` notice says the numbers above are NOT the ones the
    schedule sends, and a `schedule_slots_skipped` notice says results nobody
    ever got are missing from the list. Both travel with the post.
    """
    status = outcome.get("status", "unknown")
    steps = outcome.get("steps") or []
    when = f" at {slot.strftime('%H:%M')}" if slot else ""
    if status == "ok":
        body = (f"**{workflow_name} v{version}** ran{when}. "
                f"{len(steps)} step{'s' if len(steps) != 1 else ''}.")
    else:
        body = f"**{workflow_name} v{version}** {status}{when}."

    return await _write(
        db,
        kind="workflow_run",
        key=str(run_id),
        body=body,
        payload={
            "run_id": str(run_id), "workflow": workflow_name,
            "version": version, "status": status, "steps": len(steps),
        },
        # A run reads several sources at several moments, so there is no single
        # snapshot for the whole of it; each step carries its own and the run
        # record holds them. What goes here is the run's identity.
        receipts={
            "source_table": "george.workflow_runs",
            "filters_applied": [f"version = {version}   # metrics.yaml: workflows.promotion"],
            "snapshot_timestamp": outcome.get("ran_at"),
        },
        notices=outcome.get("notices") or [],
        created_at=slot,
    )


# ---------------------------------------------------------------------------
# A version waiting on a person
# ---------------------------------------------------------------------------

async def post_approval(
    db: AsyncSession, *, version_id: uuid.UUID, workflow_name: str, version: int,
    created_by: str, backtested: bool,
) -> Optional[uuid.UUID]:
    """
    A version that entered the approval queue, as a post.

    THE POST DOES NOT WEAR THE APPROVALS COLOUR, and that is the point of
    having both. The queue in the rail is where "needs you" lives and where the
    reserved colour belongs; this is the historical record that it happened, in
    the same timeline as everything else. The same fact shouting in two places
    is how a signal stops meaning anything — see postShape.ACCENT_KINDS, which
    is empty for exactly this reason.

    Keyed on the version, so a version announces itself once however many times
    it is saved against.
    """
    blocked = (
        "Backtested and waiting for an administrator to promote it."
        if backtested else
        "Never backtested. Run it against a past window and look at what it "
        "would have produced."
    )
    return await _write(
        db,
        kind="approval",
        key=str(version_id),
        body=f"**{workflow_name} v{version}** is waiting to be promoted. {blocked}",
        payload={
            "version_id": str(version_id), "workflow": workflow_name,
            "version": version, "created_by": created_by,
            "backtested": backtested,
        },
        # No receipts: an approval states no figure, and the receipts rules
        # govern numbers. Its times are its own — see the C.1 decision.
        receipts=None,
        notices=[],
    )
