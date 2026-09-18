"""
Bob reading his own mind, and his own systems.

WHY THIS HAS TO EXIST. Bob reads on `george_ro`, which has no access to the
`bob` schema at all. So the two things that are most his — what he currently
believes, and what the systems he built have been doing — are the two things he
cannot see. He is handed his beliefs as text before a turn starts, which is
enough to REASON with but not enough to put on the board: composing an object
needs a read with a seq behind it, and there was no read.

That gap is why an earlier pass hand-wrote a briefing composer in Python. The
composer was reaching into tables Bob could not reach. The fix is not to
compose for him; it is to let him see.

Both are READS, injected exactly the way the page reader is (CLAUDE.md rule 4):
bound to the authenticated user in the web process, holding no credential of
their own, calling the same service functions the HTTP routes call. The model
names no user and no scope, because there is no argument for either.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import belief_store, decisions

# What he believes is a short list by design — agent/beliefs.py caps what he
# may form in a turn, and a view he holds about everything is a view about
# nothing.
MAX_VIEWS = 20
# A week of runs. Longer and "what happened" stops being about now.
RUNS_WINDOW_DAYS = 7
MAX_RUNS = 20


async def read_memory(session: AsyncSession, *, username: str) -> dict:
    """
    What Bob currently believes about the business, as rows he can compose.

    Reuses `belief_store.current` so there is one definition of "the views that
    still stand" — superseded ones are excluded there, and this cannot drift
    from what the prompt was given at the start of the turn.

    A STORED VIEW CARRIES NO FIGURE (agent/beliefs.py refuses one), so these
    rows are safe beside measured numbers: nothing here can be read as a
    current figure, because there is no figure in it.

    FOUR THINGS PER ROW SINCE P2.f, because "what do you remember" is a
    question about the MEMORY and not only about the business: what he thinks,
    WHEN he formed it, what it RESTS ON — the reads, by name, or the sentence
    a person told him — and HOW OFTEN it has been carried into a question.

    THE COUNT SAYS WHAT IT MEASURED AND NOT A WORD MORE. `applied` counts the
    questions this view was attached to. It does not count answers it changed;
    nothing on this path can observe that, and a number that implied it would
    be the one thing this repo refuses everywhere else. The note says so, in
    the rows' own company, so it cannot be read off the figure alone.
    """
    held = await belief_store.current(session)
    latest_data = await belief_store.latest_data_at(session)
    read_at = datetime.now(timezone.utc)
    # What people did with what he raised, lately. In meta and not in rows:
    # a decision is not a view, and the agenda's own rows already carry
    # theirs. Here so "what have I been putting aside" has a read behind it.
    recent_decisions = await decisions.recent(session, window_days=RUNS_WINDOW_DAYS)

    carried = set(belief_store.in_prompt(held))

    rows: list[dict[str, Any]] = []
    for b in held[:MAX_VIEWS]:
        confirmed = b.get("confirmed_at")
        told = str(b.get("told") or "").strip()
        rows.append({
            "subject": b.get("subject"),
            "subject_kind": b.get("subject_kind"),
            "stance": b.get("stance"),
            "claim": b.get("claim"),
            "held_since": b.get("held_since"),
            "last_checked": confirmed,
            # WHAT IT RESTS ON, in one field, because there is exactly one
            # ground per view and a reader should not have to work out which
            # of two columns to look at. The reads by name, or their words.
            "rests_on": told or _reads(b.get("evidence")),
            # WHICH of the two, so the surface can say "you told me" without
            # guessing it from the stance.
            "told": told or None,
            # A view that has fallen out of the register is not attached to
            # anything any more, and stops counting. Said here rather than
            # inferred from the count, which cannot distinguish "dropped out"
            # from "formed this minute".
            "carried": b.get("id") in carried,
            "applied": int(b.get("applied_count") or 0),
            "last_applied": b.get("last_applied_at"),
            # A TAUGHT VIEW IS NEVER UNCONFIRMED. New data cannot make it less
            # true that this is what they meant, so the mark that means
            # "re-read before leaning on it" would be asking for a read that
            # settles nothing.
            "unconfirmed": bool(not told and latest_data and confirmed
                                and latest_data > confirmed),
            "id": str(b.get("id")) if b.get("id") else None,
        })

    return {
        "rows": rows,
        "meta": {
            "source_table": "george.beliefs",
            "filters_applied": [
                "superseded_by IS NULL   # only the views that still stand",
                "forgotten_at IS NULL    # and none a person has forgotten",
                f"limit {MAX_VIEWS}",
            ],
            # THE READ'S OWN TIME, not the business data's. These rows are the
            # state of george.beliefs as of now, and that is what a snapshot
            # timestamp is for: the surface draws a time under every figure
            # (UI rule 6), and under a count of applications the honest time
            # is when the count was read. When the DATA last landed is its own
            # key below, where the unconfirmed mark is computed from it.
            "snapshot_timestamp": read_at,
            "metric_label": "What I think right now",
            "held": len(held),
            "unconfirmed": sum(1 for r in rows if r["unconfirmed"]),
            "latest_data_at": latest_data,
            "recent_decisions": [
                {k: d.get(k) for k in ("what", "subject", "outcome", "decided_at", "decided_by")}
                for d in recent_decisions[:MAX_RUNS]
            ],
            "recent_decisions_window_days": RUNS_WINDOW_DAYS,
            "note": (
                "These are views, not figures — a stored view never carries a "
                "number. One marked unconfirmed has not been checked against "
                "data that has landed since; re-read before leaning on it. "
                "`applied` counts the questions a view was ATTACHED to, which "
                "is not how many answers it changed — nothing measures that. "
                "A view with `told` is one a person taught you: it rests on "
                "their words, never goes stale, and is not re-checkable."
            ),
        },
    }


def _reads(evidence: Any) -> str:
    """
    The calls a view rests on, by name, for a person reading the row.

    Names and not arguments: "from get_sales, get_stock" is what a reader
    needs to know it was measured; the arguments are in the evidence, which is
    what makes the view re-checkable. A view with no calls has words instead,
    and this is never reached for one.
    """
    if not isinstance(evidence, (list, tuple)):
        return ""
    names: list[str] = []
    for call in evidence:
        name = str((call or {}).get("tool") or "").strip() if isinstance(call, dict) else ""
        if name and name not in names:
            names.append(name)
    return ", ".join(names)


async def view_of(session: AsyncSession, *, subject_kinds: tuple[str, ...],
                  subject: str) -> Optional[dict]:
    """
    What Bob currently thinks about ONE thing, for the object view.

    WHY THIS IS NOT A SECTION OF get_object. Beliefs live in the `bob`
    schema, which the read-only role the tools run on cannot see at all. That
    boundary is right rather than inconvenient: it means a replay of a past
    morning can never accidentally show today's opinion, because the tool that
    replays it has no way to reach one.

    So the view is composed ON TOP, here, on the application role — and it
    carries its own provenance: when it was formed, when it was last checked,
    and whether data has landed since. A held view presented without those is
    an assertion with no expiry, which is the thing every receipts rule in this
    repo exists to prevent.

    Returns None when he has no view of this thing, and None is a real answer
    the caller must render as one: "Bob has not formed a view" is different
    from "Bob thinks nothing is wrong".
    """
    held = await belief_store.current(session)
    latest_data = await belief_store.latest_data_at(session)
    wanted = str(subject or "").strip().lower()

    for belief in held:
        if str(belief.get("subject_kind")) not in subject_kinds:
            continue
        if str(belief.get("subject") or "").strip().lower() != wanted:
            continue
        confirmed = belief.get("confirmed_at")
        return {
            "subject": belief.get("subject"),
            "subject_kind": belief.get("subject_kind"),
            "stance": belief.get("stance"),
            "claim": belief.get("claim"),
            "held_since": belief.get("held_since"),
            "last_checked": confirmed,
            # A view a person TAUGHT him does not go stale and is never asked
            # to be re-checked, here for the same reason as in read_memory.
            "told": str(belief.get("told") or "").strip() or None,
            "unconfirmed": bool(not belief.get("told") and latest_data
                                and confirmed and latest_data > confirmed),
            "id": str(belief.get("id")) if belief.get("id") else None,
            "source_table": "george.beliefs",
        }
    return None


async def read_automations(session: AsyncSession, *, username: str) -> dict:
    """
    What the systems have been doing, and what is waiting on somebody.

    Four things in one read on purpose. From the owner's side they are one
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

    # What he has been asked to keep an eye on. Owner-scoped like the standing
    # questions above, and in this same read for the same reason: from the
    # owner's side "what is going on with the things we set up" is one
    # question. A watch that has STOPPED needs him exactly as much as a
    # version awaiting promotion does, and its whole failure mode is looking
    # identical to a quiet one from outside.
    watching = (await session.execute(text("""
        SELECT id, condition, direction, stores, enabled, hour, minute, kind,
               days_of_week, backtest, last_checked_at, last_fired_at,
               last_status, last_state
        FROM george.watches
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
    for w in watching:
        where = ", ".join(w["stores"]) if w["stores"] else "any shop"
        way = "" if w["direction"] == "either" else f" {w['direction']}"
        firing = sorted((w["last_state"] or {}).keys())
        backtest = w["backtest"] or {}
        rows.append({
            "what": f"watching{way}: {w['condition']} — {where}",
            # A watch has four states and they are NOT interchangeable:
            # quiet means it looked and there was nothing; stopped means it is
            # not looking; and "never backtested" means it cannot start.
            "state": (
                ("firing: " + ", ".join(firing[:5])) if (w["enabled"] and firing)
                else "watching, quiet" if w["enabled"]
                else "ready — not switched on" if backtest
                else "not backtested yet"
            ),
            "when": w["last_checked_at"],
            "by": (
                f"would have fired {backtest.get('days_fired')} of the last "
                f"{backtest.get('days_checked')} days"
                if backtest else "no backtest, so it cannot be switched on"
            ),
            "id": str(w["id"]),
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
                            "+ george.standing_questions + george.watches",
            "filters_applied": [
                f"runs started_at > now() - interval '{RUNS_WINDOW_DAYS} days'",
                "standing questions and watches: owner = the signed-in user",
                "waiting: promoted_at IS NULL AND backtest_run_id IS NOT NULL",
                "archived rules excluded",
            ],
            "snapshot_timestamp": runs[0]["started_at"] if runs else None,
            "metric_label": "Running and waiting",
            "ran": len(runs),
            "standing": len(standing),
            "watching": sum(1 for w in watching if w["enabled"]),
            "standing_on": sum(1 for q in standing if q["enabled"]),
            "waiting": len(waiting),
            "scheduled": sum(1 for s in schedules if s["enabled"]),
            "note": (
                "A schedule that is switched off fires nothing, and a standing "
                "question that is not being asked produces no answer. A watch "
                "that is quiet looked and found nothing, which is its normal "
                "state; one that is not switched on is not looking at all. A version "
                "waiting on you has been backtested but not promoted, so the "
                "schedule is still firing the older one."
            ),
        },
    }
