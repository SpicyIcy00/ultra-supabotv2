"""
Watches: what one is, when it speaks, and how one is kept.

CLAUDE.md reserved the word on 2026-09-05 and left it unbuilt on purpose, so
that it could not be built under a different name in the meantime. The
definition there is the one implemented here: *a condition plus a channel;
George evaluates it on a schedule and posts only when the answer changes.
Silence is its normal state.*

THREE THINGS THIS FILE IS CAREFUL ABOUT, each of which is a way a watch turns
into noise or into a lie:

  IT POSTS ON CHANGE, NEVER ON TRUTH. A shop down five mornings running is one
  post, not five. Five identical alerts is how a signal stops meaning anything,
  and the fifth one is indistinguishable from the first for a reader deciding
  whether to look.

  "NOTHING FIRED" AND "I COULD NOT LOOK" ARE DIFFERENT ANSWERS. The brief says
  per section whether it `ran`; a section that could not run returns no rows,
  and treating that as an empty firing set would announce "back to normal" for
  every shop the moment a source went stale. Blindness is its own state, it is
  said once when it starts, and it never overwrites what was last actually
  seen.

  IT CARRIES NO NUMBERS. A watch names a condition from metrics.yaml
  `watches.conditions`; the thresholds are `brief:`'s, measured against a noise
  floor with the measurement recorded beside them. Evaluation is the brief TOOL
  rather than new SQL, so there is exactly one implementation of "Rockwell is
  down" and a watch cannot drift away from the morning brief.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_watch import GeorgeWatch, GeorgeWatchCheck
from app.services import slots
from tools._common import load_defs, req

TABLE = "george.watches"

DAY_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

# For a condition with no direction of its own, every subject stores this, so
# the state's shape does not depend on which condition it belongs to.
NO_DIRECTION = "—"


class WatchRefused(ValueError):
    """
    The watch cannot be created, changed or switched on as asked, and the
    message says why. A ValueError for the same reason PinRefused is one: the
    loop turns it into a real answer with a route out, never a crash.
    """


# ---------------------------------------------------------------------------
# The vocabulary, read from the definitions and never written here
# ---------------------------------------------------------------------------

def conditions(defs: Optional[dict] = None) -> dict[str, Any]:
    return req(defs or load_defs(), "watches.conditions")


def condition_or_refuse(name: str, defs: Optional[dict] = None) -> dict[str, Any]:
    known = conditions(defs)
    if name not in known:
        listed = ", ".join(f"{k} ({v['says']})" for k, v in known.items())
        raise WatchRefused(
            f"There is no condition called {name!r}. A watch names one of: "
            f"{listed}. If what is wanted is a different threshold, that is a "
            f"change to a definition, not a new watch."
        )
    return known[name]


def not_available(defs: Optional[dict] = None) -> dict[str, Any]:
    """What cannot be watched yet, and what would make it possible."""
    return req(defs or load_defs(), "watches.not_available")


# ---------------------------------------------------------------------------
# Evaluation — pure, so it can be tested without a database or a model
# ---------------------------------------------------------------------------

def _same(a: Any, b: Any) -> bool:
    return str(a or "").strip().lower() == str(b or "").strip().lower()


def in_scope(row: dict, *, subject_kind: str, stores: Optional[list[str]]) -> bool:
    """
    Whether one brief row is inside a watch's scope.

    A store condition scopes on the row's SUBJECT; a product condition scopes
    on the store the product sits in, because "tell me when something goes out
    of stock at Rockwell" is a scope over locations either way.
    """
    if not stores:
        return True
    where = row.get("subject") if subject_kind == "store" else row.get("store")
    return any(_same(where, s) for s in stores)


def firing_from(rows: list[dict], sections: dict[str, Any], *, condition: str,
                direction: str, stores: Optional[list[str]],
                defs: Optional[dict] = None
                ) -> tuple[Optional[dict[str, str]], list[dict], Optional[str]]:
    """
    What is firing right now, from one brief result.

    Returns `(state, detail, blind_reason)`. `state` is None — NOT an empty
    dict — when the section could not run: the caller must then leave the last
    known state alone, because "I could not look" is not "nothing is
    happening", and collapsing the two is how a watch announces that every
    shop recovered on the morning a source went stale.

    `state` maps subject to direction, which is the whole of what "has this
    changed?" is decided on. The figures live in `detail` and are used only to
    write the post — a watch that compared change_pct between days would fire
    every morning, because a percentage almost never repeats.
    """
    spec = condition_or_refuse(condition, defs)
    section = spec["section"]

    ran = (sections.get(section) or {}).get("ran")
    if ran is False:
        why = (sections.get(section) or {}).get("reason") or "the source could not be read"
        return None, [], str(why)

    state: dict[str, str] = {}
    detail: list[dict] = []
    for row in rows:
        if row.get("section") != section:
            continue
        if not in_scope(row, subject_kind=spec["subject"], stores=stores):
            continue
        way = str(row.get("direction") or NO_DIRECTION)
        if direction != "either" and way != direction:
            continue
        subject = str(row.get("subject") or "").strip()
        if not subject:
            continue
        state[subject] = way
        detail.append({
            "subject": subject,
            "direction": way,
            "change_pct": row.get("change_pct"),
            "value": row.get("value"),
            "store": row.get("store"),
            "sku": row.get("sku"),
        })
    return state, detail, None


def diff(previous: Optional[dict[str, str]],
         current: dict[str, str]) -> dict[str, list[str]]:
    """
    What started and what stopped since the last check.

    A subject whose DIRECTION flipped counts as started, not as unchanged: a
    shop that was down 40% yesterday and is up 40% today is news, and by
    subject alone it would look like more of the same.

    A first check has no previous state, and `previous is None` means every
    firing subject is new — which, with `first_check_posts_only_if_firing`,
    is what stops a watch switched on during a quiet week from announcing its
    own silence.
    """
    was = previous or {}
    added = [s for s, way in current.items() if was.get(s) != way]
    cleared = [s for s in was if s not in current]
    return {"added": sorted(added), "cleared": sorted(cleared)}


def label(watch: GeorgeWatch, defs: Optional[dict] = None) -> str:
    """
    What this watch is, in words, derived rather than stored.

    There is no name column on purpose: a watch's identity is what it watches,
    so a label built from the condition, direction and scope can never say
    something the watch does not do.
    """
    spec = conditions(defs).get(watch.condition) or {}
    says = str(spec.get("says") or watch.condition)
    where = ", ".join(watch.stores) if watch.stores else "any shop"
    way = "" if watch.direction == "either" else f" ({watch.direction} only)"
    return f"{says}{way} — {where}"


def when(watch: GeorgeWatch) -> str:
    at = f"{watch.hour:02d}:{watch.minute:02d}"
    if watch.kind == "weekly" and watch.days_of_week:
        days = ", ".join(DAY_NAMES[d] for d in sorted(watch.days_of_week) if 0 <= d <= 6)
        return f"{days} at {at}"
    return f"every day at {at}"


def as_row(watch: GeorgeWatch, defs: Optional[dict] = None) -> dict[str, Any]:
    """One watch as a row George can read and compose."""
    backtest = watch.backtest or {}
    return {
        "id": str(watch.id),
        "watching": label(watch, defs),
        "condition": watch.condition,
        "when": when(watch),
        "state": "watching" if watch.enabled else (
            "ready — not switched on" if backtest else "not backtested yet"
        ),
        "would_have_fired": (
            f"{backtest.get('days_fired')} of the last {backtest.get('days_checked')} days"
            if backtest else None
        ),
        "last_checked": watch.last_checked_at,
        "last_fired": watch.last_fired_at,
        "last_status": watch.last_status,
        "currently_firing": sorted((watch.last_state or {}).keys()),
    }


# ---------------------------------------------------------------------------
# Keeping one
# ---------------------------------------------------------------------------

async def list_for(session: AsyncSession, owner: str) -> list[GeorgeWatch]:
    return list((await session.execute(
        select(GeorgeWatch).where(GeorgeWatch.owner == owner)
        .order_by(GeorgeWatch.created_at.desc())
    )).scalars().all())


async def _owned(session: AsyncSession, owner: str,
                 which: Optional[str]) -> GeorgeWatch:
    """
    The one this operation is about, from the caller's own rows.

    Not found and not yours are the same answer, as everywhere else here.
    """
    rows = await list_for(session, owner)
    if not rows:
        raise WatchRefused("There are no watches yet. Set one up first.")
    if which:
        for row in rows:
            if str(row.id) == which:
                return row
        raise WatchRefused(
            "No watch of yours has that id. Read them first (view_automations "
            "lists them) and name one of those."
        )
    if len(rows) == 1:
        return rows[0]
    listed = "; ".join(f"{label(r)} [{r.id}]" for r in rows[:5])
    raise WatchRefused(
        f"There are {len(rows)} watches, so which one is not clear: {listed}. "
        f"Name one by its id."
    )


def _clean_stores(stores: Optional[list[str]], defs: Optional[dict] = None
                  ) -> Optional[list[str]]:
    """
    The shops in scope, checked against the store list and nothing else.

    NULL means every shop. An empty list would mean none — a watch that can
    never fire — so it is refused rather than stored.
    """
    if stores is None:
        return None
    names = [str(s).strip() for s in stores if str(s or "").strip()]
    if not names:
        raise WatchRefused(
            "A watch over no shops can never fire. Name the shops, or leave "
            "them out entirely to watch all of them."
        )
    defs = defs or load_defs()
    known = [str(s["display_name"] if isinstance(s, dict) else s)
             for group in ("stores.active_retail", "stores.warehouse")
             for s in (req(defs, group) or [])]
    resolved: list[str] = []
    for name in names:
        match = next((k for k in known if _same(k, name)), None)
        if match is None:
            raise WatchRefused(
                f"There is no shop called {name!r}. The shops are: "
                f"{', '.join(known)}."
            )
        if match not in resolved:
            resolved.append(match)
    return resolved


def _clean_slot(kind: Optional[str], hour: Optional[int], minute: Optional[int],
                days: Optional[list[int]]) -> dict:
    if hour is None:
        raise WatchRefused("What time should it check? An hour is required.")
    try:
        hour, minute = int(hour), int(minute or 0)
    except (TypeError, ValueError):
        raise WatchRefused("The time has to be an hour and a minute.") from None
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise WatchRefused("The time has to be a real one, in Manila time.")
    if days:
        try:
            cleaned = sorted({int(d) for d in days})
        except (TypeError, ValueError):
            raise WatchRefused("Days are 0–6, Monday to Sunday.") from None
        if any(d < 0 or d > 6 for d in cleaned):
            raise WatchRefused("Days are 0–6, Monday to Sunday.")
        return {"kind": "weekly", "hour": hour, "minute": minute,
                "days_of_week": cleaned}
    if kind == "weekly":
        raise WatchRefused("A weekly watch needs the days it runs on.")
    return {"kind": "daily", "hour": hour, "minute": minute, "days_of_week": None}


async def create(session: AsyncSession, *, owner: str, condition: str,
                 hour: int, minute: Optional[int] = None,
                 direction: str = "either",
                 stores: Optional[list[str]] = None,
                 kind: Optional[str] = None,
                 days_of_week: Optional[list[int]] = None) -> GeorgeWatch:
    """
    Set a watch up. It is NOT switched on, and it cannot be until it has been
    backtested (architecture rule 7, and the CHECK constraint on the table).
    """
    defs = load_defs()
    spec = condition_or_refuse(condition, defs)

    allowed = list(spec.get("directions") or ["either"])
    if direction not in allowed:
        raise WatchRefused(
            f"{condition} does not have a {direction!r} direction — it takes "
            f"{', '.join(allowed)}."
        )

    existing = await list_for(session, owner)
    limit = int(req(defs, "watches.max_per_owner"))
    if len(existing) >= limit:
        raise WatchRefused(
            f"There are already {len(existing)} watches, which is the limit "
            f"({limit}). Remove one first."
        )

    watch = GeorgeWatch(
        id=uuid.uuid4(), owner=owner, condition=condition, direction=direction,
        stores=_clean_stores(stores, defs), enabled=False,
        **_clean_slot(kind, hour, minute, days_of_week),
    )
    session.add(watch)
    await session.flush()
    return watch


async def reschedule(session: AsyncSession, *, owner: str, which: Optional[str],
                     hour: int, minute: Optional[int] = None,
                     kind: Optional[str] = None,
                     days_of_week: Optional[list[int]] = None) -> GeorgeWatch:
    watch = await _owned(session, owner, which)
    for key, value in _clean_slot(kind, hour, minute, days_of_week).items():
        setattr(watch, key, value)
    watch.last_slot = None
    watch.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return watch


async def rescope(session: AsyncSession, *, owner: str, which: Optional[str],
                  stores: Optional[list[str]] = None,
                  direction: Optional[str] = None,
                  all_shops: bool = False) -> GeorgeWatch:
    """
    Point an existing watch at different shops, or at a different direction.

    THIS THROWS THE BACKTEST AWAY, and switches the watch off if it was on.
    That is not tidiness: a backtest measures what THIS watch would have done,
    and a watch over Rockwell is a different watch from one over seven shops —
    47 firing mornings becomes 4. Keeping the old number would leave somebody
    holding evidence for a rule that no longer exists, which is the exact
    failure the gate exists to prevent.

    `all_shops` is how "watch all of them again" is said, because `stores=None`
    already means "leave the scope alone" — an omitted argument and a
    deliberate clearing cannot be the same value.
    """
    watch = await _owned(session, owner, which)
    defs = load_defs()

    if all_shops:
        watch.stores = None
    elif stores is not None:
        watch.stores = _clean_stores(stores, defs)

    if direction is not None:
        allowed = list((conditions(defs).get(watch.condition) or {})
                       .get("directions") or ["either"])
        if direction not in allowed:
            raise WatchRefused(
                f"{watch.condition} does not have a {direction!r} direction — "
                f"it takes {', '.join(allowed)}."
            )
        watch.direction = direction

    watch.backtest = None
    watch.enabled = False
    watch.last_state = None
    watch.last_slot = None
    watch.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return watch


async def switch(session: AsyncSession, *, owner: str, which: Optional[str],
                 on: bool) -> GeorgeWatch:
    """
    Start or stop checking.

    SWITCHING ON REQUIRES A BACKTEST, and the refusal says so in the terms a
    person cares about: not "policy requires approval" but "you have not seen
    what this would have done".
    """
    watch = await _owned(session, owner, which)
    if on:
        if not watch.backtest:
            raise WatchRefused(
                "This watch has not been backtested, so nobody knows how often "
                "it would speak. Back it over the last 60 days first — that "
                "says how many days it would have fired, and on which."
            )
        current = str(req(load_defs(), "version"))
        measured = str((watch.backtest or {}).get("definitions_version"))
        if measured != current:
            raise WatchRefused(
                f"The backtest was measured under definitions version "
                f"{measured} and the current one is {current}, so it describes "
                f"a rule that has changed. Back it again before switching it on."
            )
        watch.last_slot = None
    watch.enabled = bool(on)
    watch.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return watch


async def remove(session: AsyncSession, *, owner: str,
                 which: Optional[str]) -> GeorgeWatch:
    """
    Forget the watch. Its posts and its checks are untouched — what it once
    told somebody is a record, and deleting the watch must not rewrite it.
    """
    watch = await _owned(session, owner, which)
    await session.delete(watch)
    await session.flush()
    return watch


async def record_backtest(session: AsyncSession, *, owner: str,
                          which: Optional[str], result: dict) -> GeorgeWatch:
    watch = await _owned(session, owner, which)
    watch.backtest = result
    watch.updated_at = datetime.now(slots.MANILA)
    await session.flush()
    return watch


# ---------------------------------------------------------------------------
# The tick's side
# ---------------------------------------------------------------------------

async def due(session: AsyncSession, now: datetime) -> list[dict]:
    rows = (await session.execute(
        select(GeorgeWatch).where(GeorgeWatch.enabled.is_(True))
        .order_by(GeorgeWatch.last_slot.asc().nulls_first())
    )).scalars().all()

    candidates = []
    for row in rows:
        slot = slots.slot_for(kind=row.kind, hour=row.hour, minute=row.minute,
                              days_of_week=row.days_of_week, now=now)
        if slot is None:
            continue
        if row.last_slot is not None and row.last_slot.astimezone(slots.MANILA) >= slot:
            continue
        candidates.append({"id": row.id, "slot": slot})
    return candidates


async def claim(session: AsyncSession, *, row_id, slot: datetime) -> bool:
    return await slots.claim(session, table=TABLE, row_id=row_id, slot=slot)


async def record_check(session: AsyncSession, *, watch_id, as_of, fired: bool,
                       state: Optional[dict], changed: Optional[dict],
                       post_id=None, error: Optional[str] = None) -> None:
    """
    One check, written down whether or not it spoke.

    THE QUIET ONES ARE THE POINT. Without them "quiet for eleven days" and
    "broken for eleven days" look identical from outside, and the second is
    the one somebody needs to know.
    """
    session.add(GeorgeWatchCheck(
        id=uuid.uuid4(), watch_id=watch_id, as_of=as_of, fired=fired,
        state=state, changed=changed, post_id=post_id,
        definitions_version=str(req(load_defs(), "version")),
        error=(error or None) and str(error)[:2000],
    ))
    await session.flush()
