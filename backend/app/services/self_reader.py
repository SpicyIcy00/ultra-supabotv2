"""
George reading his own mind, and his own systems.

WHY THIS HAS TO EXIST. George reads on `george_ro`, which has no access to the
`george` schema at all. So the two things that are most his — what he currently
believes, and what the systems he built have been doing — are the two things he
cannot see. He is handed his beliefs as text before a turn starts, which is
enough to REASON with but not enough to put on the board: composing an object
needs a read with a seq behind it, and there was no read.

That gap is why an earlier pass hand-wrote a briefing composer in Python. The
composer was reaching into tables George could not reach. The fix is not to
compose for him; it is to let him see.

Both are READS, injected exactly the way the page reader is (CLAUDE.md rule 4):
bound to the authenticated user in the web process, holding no credential of
their own, calling the same service functions the HTTP routes call. The model
names no user and no scope, because there is no argument for either.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import belief_store

# What he believes is a short list by design — agent/beliefs.py caps what he
# may form in a turn, and a view he holds about everything is a view about
# nothing.
MAX_VIEWS = 20
# A week of runs. Longer and "what happened" stops being about now.
RUNS_WINDOW_DAYS = 7
MAX_RUNS = 20


async def read_memory(session: AsyncSession, *, username: str) -> dict:
    """
    What George currently believes about the business, as rows he can compose.

    Reuses `belief_store.current` so there is one definition of "the views that
    still stand" — superseded ones are excluded there, and this cannot drift
    from what the prompt was given at the start of the turn.

    A STORED VIEW CARRIES NO FIGURE (agent/beliefs.py refuses one), so these
    rows are safe beside measured numbers: nothing here can be read as a
    current figure, because there is no figure in it.
    """
    held = await belief_store.current(session)
    latest_data = await belief_store.latest_data_at(session)

    rows: list[dict[str, Any]] = []
    for b in held[:MAX_VIEWS]:
        confirmed = b.get("confirmed_at")
        rows.append({
            "subject": b.get("subject"),
            "subject_kind": b.get("subject_kind"),
            "stance": b.get("stance"),
            "claim": b.get("claim"),
            "held_since": b.get("held_since"),
            "last_checked": confirmed,
            # The one thing that makes a held view safe to lean on: whether
            # anything has landed since it was last checked.
            "unconfirmed": bool(latest_data and confirmed and latest_data > confirmed),
            "id": str(b.get("id")) if b.get("id") else None,
        })

    return {
        "rows": rows,
        "meta": {
            "source_table": "george.beliefs",
            "filters_applied": [
                "superseded_by IS NULL   # only the views that still stand",
                f"limit {MAX_VIEWS}",
            ],
            "snapshot_timestamp": latest_data,
            "metric_label": "What I think right now",
            "held": len(held),
            "unconfirmed": sum(1 for r in rows if r["unconfirmed"]),
            "latest_data_at": latest_data,
            "note": (
                "These are views, not figures — a stored view never carries a "
                "number. One marked unconfirmed has not been checked against "
                "data that has landed since; re-read before leaning on it."
            ),
        },
    }


async def read_automations(session: AsyncSession, *, username: str) -> dict:
    """
    What the systems have been doing, and what is waiting on somebody.

    Three things in one read on purpose. From the owner's side they are one
    question — "what is going on with the things we built" — and a run that
    failed and a version awaiting promotion both end the same way: needing him.

    Every row says which of the two it is in `state`, so nothing has to be
    inferred from its shape.
    """
    runs = (await session.execute(text(f"""
        SELECT w.name, r.status, r.mode, r.started_at, r.finished_at,
               r.schedule_id IS NOT NULL AS scheduled
        FROM george.workflow_runs r
        JOIN george.workflows w ON w.id = r.workflow_id
        WHERE r.started_at > now() - interval '{RUNS_WINDOW_DAYS} days'
        ORDER BY r.started_at DESC
        LIMIT {MAX_RUNS}
    """))).mappings().all()

    waiting = (await session.execute(text("""
        SELECT w.name, v.version, v.created_at, v.created_by
        FROM george.workflow_versions v
        JOIN george.workflows w ON w.id = v.workflow_id
        WHERE v.promoted_at IS NULL
          AND v.backtest_run_id IS NOT NULL
          AND w.status <> 'archived'
        ORDER BY v.created_at DESC
        LIMIT 20
    """))).mappings().all()

    schedules = (await session.execute(text("""
        SELECT w.name, s.kind, s.hour, s.minute, s.enabled, s.last_run_at, s.last_status
        FROM george.workflow_schedules s
        JOIN george.workflows w ON w.id = s.workflow_id
        WHERE w.status <> 'archived'
        ORDER BY s.enabled DESC, w.name
        LIMIT 20
    """))).mappings().all()

    # The questions he has been asked to keep asking. They belong in THIS read
    # rather than a fourth one: from the owner's side "what is going on with
    # the things we set up" is one question, and a standing question that has
    # been failing every morning needs him exactly as much as a workflow
    # version waiting to be promoted does. Owner-scoped, unlike the rest of
    # this read: a workflow is the company's rule and a standing question is
    # one person's.
    standing = (await session.execute(text("""
        SELECT id, question, instructions, kind, hour, minute, days_of_week,
               enabled, last_run_at, last_status
        FROM george.standing_questions
        WHERE owner = :owner
        ORDER BY enabled DESC, hour, minute
        LIMIT 20
    """), {"owner": username})).mappings().all()

    rows: list[dict[str, Any]] = []
    for q in standing:
        instructions = list(q["instructions"] or [])
        when = f"{q['hour']:02d}:{q['minute']:02d}"
        if q["kind"] == "weekly" and q["days_of_week"]:
            names = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
            days = ", ".join(names[d] for d in sorted(q["days_of_week"]) if 0 <= d <= 6)
            when = f"{days} at {when}"
        else:
            when = f"every day at {when}"
        rows.append({
            "what": q["question"],
            # A standing question is not a workflow run and must not read like
            # one: "asked" says a model answered it, "ran" says steps replayed.
            "state": ("asked " + when) if q["enabled"] else "not being asked",
            "when": q["last_run_at"],
            "by": ("; ".join(instructions) if instructions
                   else ("last time: " + q["last_status"] if q["last_status"]
                         else "never asked yet")),
            # The id, so a change to this question can name which one it means.
            "id": str(q["id"]),
        })
    for r in runs:
        rows.append({
            "what": r["name"],
            "state": "ran" if r["status"] == "ok" else r["status"],
            "when": r["started_at"],
            "by": "on its own" if r["scheduled"] else r["mode"],
        })
    for v in waiting:
        rows.append({
            "what": f"{v['name']} v{v['version']}",
            "state": "waiting on you",
            "when": v["created_at"],
            "by": "backtested, not promoted",
        })
    for s in schedules:
        rows.append({
            "what": s["name"],
            "state": "scheduled" if s["enabled"] else "switched off",
            "when": s["last_run_at"],
            "by": f"{s['kind']} at {s['hour']:02d}:{s['minute']:02d}",
        })

    return {
        "rows": rows,
        "meta": {
            "source_table": "george.workflow_runs + george.workflow_versions "
                            "+ george.workflow_schedules "
                            "+ george.standing_questions",
            "filters_applied": [
                f"runs started_at > now() - interval '{RUNS_WINDOW_DAYS} days'",
                "standing questions: owner = the signed-in user",
                "waiting: promoted_at IS NULL AND backtest_run_id IS NOT NULL",
                "archived rules excluded",
            ],
            "snapshot_timestamp": runs[0]["started_at"] if runs else None,
            "metric_label": "Running and waiting",
            "ran": len(runs),
            "standing": len(standing),
            "standing_on": sum(1 for q in standing if q["enabled"]),
            "waiting": len(waiting),
            "scheduled": sum(1 for s in schedules if s["enabled"]),
            "note": (
                "A schedule that is switched off fires nothing, and a standing "
                "question that is not being asked produces no answer. A version "
                "waiting on you has been backtested but not promoted, so the "
                "schedule is still firing the older one."
            ),
        },
    }
