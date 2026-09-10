"""
Running a watch: checking it, and showing what it would have done.

NO MODEL CALL. A check runs one vetted read, applies a named condition whose
thresholds are metrics.yaml's, compares the result to the last one, and writes
a post only if it changed. There is nothing here for a model to decide, which
is why a watch is safe to run unattended in a way a free-form question is not —
and why replying "investigate this" is where George actually thinks. The post
carries the exact call behind it, so that reply re-runs a fact rather than
prose (CLAUDE.md architecture rule 10: an investigation is behaviour in an
ordinary conversation, not an object).

THE BACKTEST IS THE FEATURE, NOT THE GATE. Architecture rule 7 says nothing
runs unattended until it has been backtested, and here that requirement pays
for itself immediately: replaying the last 60 closed mornings answers "how
often would this have bothered me", which is the number you want before
deciding whether to want the watch at all. It replays through get_brief — the
same code path a live check takes — because a backtest that ran different code
would be measuring a rule nobody is going to run.

AND IT SIMULATES THE SILENCE. The backtest counts POSTS, not days with
something firing: it walks the days in order carrying the state forward, so a
shop down nine mornings running counts once, exactly as it would have in life.
Counting firing days instead would have promised nine alerts and delivered one,
which is the wrong way round for a number somebody is using to decide.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_watch import GeorgeWatch
from app.services import river_writer, slots, watches
from tools._common import load_defs, req

# How many mornings are replayed at once. The read-only role is capped and
# tools/_common.connect() gates at 8 per process; three keeps a backtest brisk
# without competing with whatever else the web process is serving.
BACKTEST_CONCURRENCY = 3

TICK_MINUTES = 1


def _brief(as_of: Optional[date]) -> dict:
    """One morning, through the ordinary tool. Sync — callers use to_thread."""
    from tools.brief import get_brief

    return get_brief(as_of=as_of)


# ---------------------------------------------------------------------------
# The backtest
# ---------------------------------------------------------------------------

async def backtest(watch: GeorgeWatch, *, window_days: Optional[int] = None,
                   today: Optional[date] = None) -> dict[str, Any]:
    """
    What this watch would have done over the last N closed mornings.

    Returns the record stored on the watch: how many days were checked, how
    many produced a post, which days those were and who was named. Days the
    brief could not evaluate are counted separately and never silently treated
    as quiet — a window half of which was unreadable must say so, or the
    signal rate it reports is measured against the wrong denominator.
    """
    defs = load_defs()
    window = int(window_days or req(defs, "watches.backtest.window_days"))
    end = (today or datetime.now(slots.MANILA).date())
    # Closed mornings only: today's brief describes yesterday and is still
    # moving. A backtest that included it would be measuring an open window.
    days = [end - timedelta(days=n) for n in range(1, window + 1)][::-1]

    semaphore = asyncio.Semaphore(BACKTEST_CONCURRENCY)

    async def one(day: date) -> tuple[date, Optional[dict], list[dict], Optional[str]]:
        async with semaphore:
            try:
                out = await asyncio.to_thread(_brief, day)
            except Exception as exc:  # noqa: BLE001 - one bad morning is data
                return day, None, [], f"{type(exc).__name__}: {exc}"
        state, detail, blind = watches.firing_from(
            out["rows"], out["meta"].get("sections") or {},
            condition=watch.condition, direction=watch.direction,
            stores=watch.stores, defs=defs,
        )
        return day, state, detail, blind

    results = await asyncio.gather(*(one(d) for d in days))

    # THE STATE MACHINE, WALKED IN ORDER. This is what makes the number
    # honest: it counts what would have been SAID, carrying yesterday's state
    # into today exactly as the live check does.
    previous: Optional[dict[str, str]] = None
    fired_on: list[str] = []
    named: dict[str, int] = {}
    blind_days = 0
    for day, state, detail, blind in results:
        if state is None:
            blind_days += 1
            continue
        changed = watches.diff(previous, state)
        first = previous is None
        speaks = bool(changed["added"] or changed["cleared"])
        if first and not state:
            speaks = False           # a first check with nothing firing is silence
        if speaks:
            fired_on.append(day.isoformat())
            for subject in changed["added"]:
                named[subject] = named.get(subject, 0) + 1
        previous = state

    checked = len(days) - blind_days
    return {
        "window_days": window,
        "from": days[0].isoformat(),
        "to": days[-1].isoformat(),
        "days_checked": checked,
        "days_fired": len(fired_on),
        "dates": fired_on,
        # Who it would have been about, most often first. The shape of the
        # noise matters as much as its volume: one shop eleven times is a
        # different decision from eleven shops once.
        "subjects": sorted(named.items(), key=lambda kv: (-kv[1], kv[0]))[:12],
        "days_unreadable": blind_days,
        "definitions_version": str(req(defs, "version")),
        "measured_at": datetime.now(slots.MANILA).isoformat(),
    }


# ---------------------------------------------------------------------------
# One check
# ---------------------------------------------------------------------------

async def check(session: AsyncSession, watch: GeorgeWatch, *,
                as_of: Optional[date] = None) -> dict[str, Any]:
    """
    Evaluate one watch and post only if the answer changed.

    Never raises: a scheduler that lets one watch's exception escape stops
    checking every other one.
    """
    defs = load_defs()
    day = as_of or datetime.now(slots.MANILA).date()

    # THE BACKTEST IS THE LICENCE, AND IT EXPIRES. If the thresholds moved, the
    # evidence somebody switched this on with describes a rule that no longer
    # exists. It stops — and it SAYS it has stopped, once, because silence is
    # a watch's normal state and can never carry that news by itself.
    measured = str((watch.backtest or {}).get("definitions_version"))
    if measured != str(req(defs, "version")):
        if watch.last_status != "stale_backtest":
            await river_writer.post_watch(
                session, watch_id=watch.id, as_of=day,
                label=watches.label(watch, defs), added=[], cleared=[], calls=[],
                notices=[{
                    "kind": "watch_backtest_stale",
                    "message": (
                        "This watch has stopped. The definitions behind its "
                        f"condition changed (backtested under version {measured}, "
                        f"now {req(defs, 'version')}), so what it would do is no "
                        "longer what it was measured doing. Back it again to "
                        "start it."
                    ),
                    "source": "metrics.yaml: watches.backtest",
                }],
            )
        watch.last_status = "stale_backtest"
        # Recorded on the ROW, not only on the check: this is what the
        # exception report reads, and a watch that stopped without saying why
        # is only half-escalated.
        watch.last_error = (
            f"backtested under definitions version {measured}, now "
            f"{req(defs, 'version')}"
        )[:2000]
        watch.last_checked_at = datetime.now(slots.MANILA)
        await watches.record_check(session, watch_id=watch.id, as_of=day,
                                   fired=False, state=watch.last_state,
                                   changed=None, error="stale backtest")
        return {"status": "stale_backtest", "posted": None}

    try:
        out = await asyncio.to_thread(_brief, day)
    except Exception as exc:  # noqa: BLE001 - reported, never raised
        reason = f"{type(exc).__name__}: {exc}"
        watch.last_status, watch.last_error = "failed", reason[:2000]
        watch.last_checked_at = datetime.now(slots.MANILA)
        await watches.record_check(session, watch_id=watch.id, as_of=day,
                                   fired=False, state=None, changed=None,
                                   error=reason)
        return {"status": "failed", "posted": None, "error": reason}

    state, detail, blind = watches.firing_from(
        out["rows"], out["meta"].get("sections") or {},
        condition=watch.condition, direction=watch.direction,
        stores=watch.stores, defs=defs,
    )

    # COULD NOT LOOK. The last known state is left exactly as it was — saying
    # "back to normal" because a source went stale is the worst thing a watch
    # can do, since it is indistinguishable from good news.
    if state is None:
        if watch.last_status != "failed":
            await river_writer.post_watch(
                session, watch_id=watch.id, as_of=day,
                label=watches.label(watch, defs), added=[], cleared=[], calls=[],
                notices=[{
                    "kind": "watch_could_not_look",
                    "message": (
                        f"This watch could not check today: {blind}. It has not "
                        f"gone quiet — it is blind, and what it last saw is "
                        f"unchanged below."
                    ),
                    "source": "app.services.watch_runner",
                }],
            )
        watch.last_status, watch.last_error = "failed", str(blind)[:2000]
        watch.last_checked_at = datetime.now(slots.MANILA)
        await watches.record_check(session, watch_id=watch.id, as_of=day,
                                   fired=False, state=watch.last_state,
                                   changed=None, error=str(blind))
        return {"status": "blind", "posted": None}

    changed = watches.diff(watch.last_state, state)
    first = watch.last_state is None
    speaks = bool(changed["added"] or changed["cleared"])
    if first and not state:
        speaks = False

    posted = None
    if speaks:
        by_subject = {d["subject"]: d for d in detail}
        posted = await river_writer.post_watch(
            session,
            watch_id=watch.id, as_of=day, label=watches.label(watch, defs),
            added=[by_subject[s] for s in changed["added"] if s in by_subject],
            cleared=[{"subject": s} for s in changed["cleared"]],
            # WHAT A REPLY RE-RUNS. The exact read behind this, so "investigate
            # this" starts from the fact rather than from the sentence.
            calls=[{"tool": "get_brief", "arguments": {"as_of": day.isoformat()}}],
            receipts=out["meta"],
            notices=[n for n in [out["meta"].get("notice")] if n],
        )
        watch.last_fired_at = datetime.now(slots.MANILA)

    watch.last_state = state
    watch.last_status = "fired" if speaks else "quiet"
    watch.last_error = None
    watch.last_checked_at = datetime.now(slots.MANILA)
    await watches.record_check(session, watch_id=watch.id, as_of=day,
                               fired=bool(speaks), state=state, changed=changed,
                               post_id=posted)
    await session.flush()
    return {"status": "fired" if speaks else "quiet", "posted": posted,
            "firing": sorted(state), "changed": changed}


# ---------------------------------------------------------------------------
# The tick
# ---------------------------------------------------------------------------

async def tick() -> None:
    """
    Runs every minute. Checks each due watch at most once per slot.

    Each watch gets its own session and its own try/except, for the reason the
    workflow scheduler gives: one failure must not roll back another's record,
    and must not stop the tick.
    """
    from app.core.database import AsyncSessionLocal

    now = datetime.now(slots.MANILA)
    async with AsyncSessionLocal() as session:
        candidates = await watches.due(session, now)

    for candidate in candidates:
        async with AsyncSessionLocal() as session:
            try:
                watch = (await session.execute(
                    select(GeorgeWatch).where(GeorgeWatch.id == candidate["id"])
                )).scalars().first()
                if watch is None or not watch.enabled:
                    continue

                if not await watches.claim(session, row_id=candidate["id"],
                                           slot=candidate["slot"]):
                    await session.rollback()
                    continue
                await session.commit()

                outcome = await check(session, watch,
                                      as_of=candidate["slot"].date())
                await session.commit()
                # Printed even when quiet: a scheduler whose logs only show
                # the interesting days cannot be told from one that stopped.
                print(f"[watches] {candidate['id']} slot "
                      f"{candidate['slot'].isoformat()} -> {outcome['status']}")
            except Exception as exc:  # noqa: BLE001 - one must not stop the tick
                await session.rollback()
                print(f"[watches] tick error on {candidate['id']}: "
                      f"{type(exc).__name__}: {exc}")


async def tick_safely() -> None:
    """Wrapper for APScheduler, which swallows nothing usefully on its own."""
    try:
        await tick()
    except Exception as exc:  # noqa: BLE001
        print(f"[watches] tick failed: {type(exc).__name__}: {exc}")
