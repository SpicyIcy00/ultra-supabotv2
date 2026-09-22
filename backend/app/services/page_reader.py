"""
Reading one page of the caller's pins, for Bob.

WHAT THIS IS. A page is a collection of a person's pins, and until 2026-09-07
Bob could be told its NAME and nothing else ("[The user is on the Pages /
AJI BARN Reorder page.]"). This module is what lets him read it: the pins on
one page of one person, and — when asked — their current figures, replayed
through the same runner a tile uses. It is the reader that
[agent/write_tools.PageReader] describes, implemented where the application
role lives.

THE SAME SPLIT AS EVERY OTHER INJECTED CAPABILITY. The definitions are read
here on the application role, exactly as `GET /bob/pins?page=` reads them,
because george_ro cannot see the george schema. The figures are read through
pin_runner.run_pin, which connects as george_ro exactly as a tile does. Nothing
new is granted to either role and no SQL is built from anything the model said.

SCOPED IN SQL, ALWAYS. george.pins has RLS off (see routes/bob_pins.py), so
every statement here carries created_by. A pin id that is not the caller's on
this exact page is "not on this page" — whether it exists elsewhere, or belongs
to somebody else, is not information the caller is entitled to, and the two
cases are deliberately one answer.

A PAGE IS A ROW, READ BY ID (2026-09-08, Page Workshop V1). The scope is the
page's identity — `page_id`, or None for the ungrouped pins — never its title,
so a page renamed mid-thread is still the page being read. An EMPTY page is a
successful empty read: it exists, it says so, and nothing on it was inspected
because there was nothing. A page id that is not the caller's is PageNotFound,
indistinguishable from one that never existed. The ungrouped pins are the
explicit null scope: readable, reported as empty when there are none, never a
page object.

BOUNDED, AND HONEST ABOUT THE BOUND. A page read is one tool call to the model
but many vetted reads underneath, so the work is capped and the cap is
reported: a default read takes the newest DEFAULT_PINS; an explicit read may
name up to MAX_PINS_PER_PAGE_READ ids; replays run PIN_REPLAY_CONCURRENCY at a
time; and once PAGE_DEADLINE_S has elapsed NO FURTHER PIN IS STARTED. Work is
scheduled one pin at a time against the clock, never launched wholesale and
discarded late, so a pin that was not read is a pin that was never run, and
`not_read` says so by name and reason.

NOTHING IS WRITTEN. A tile's run updates last_run_at on its pin; a read from
here does not. This branch is read-only, and the bookkeeping stays the tile's.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bob_page import BobPage
from app.models.bob_pin import BobPin
from app.services import page_window, page_writer
from app.services.page_writer import PageNotFound  # noqa: F401 - the reader's own refusal
from app.services.pin_runner import run_pin

# How many pins a no-argument read inspects: the newest few, in the order the
# page shows them. Operational, not a business definition — the same judgement
# pin_writer.MAX_TOOL_CALLS_PER_PIN and workflow_runner.MAX_STEPS make.
DEFAULT_PINS = 5

# The most one explicit read may name. Above this the read is refused rather
# than silently cut, because a model that asked for twelve and got eight would
# reason over a page it believes is whole.
MAX_PINS_PER_PAGE_READ = 8

# Pins replayed at once. Each pin gathers its own calls (at most eight), so two
# pins is at most sixteen reads contending for the process's connection gate
# (tools/_common.GEORGE_MAX_CONNECTIONS_DEFAULT = 8).
PIN_REPLAY_CONCURRENCY = 2

# After this many seconds no new pin replay is STARTED. A pin already running
# finishes under pin_runner's own per-call timeout.
PAGE_DEADLINE_S = 60.0

# Why a selected pin has no figures. Structured, so the model and the UI can
# tell "never run because of the clock" from "ran and refused".
NOT_READ_DEADLINE = "deadline"
NOT_READ_FIGURES_OFF = "figures_not_requested"


class PageReadRefused(ValueError):
    """The read cannot be made as asked — too many ids, or ids of the wrong shape."""


# ---------------------------------------------------------------------------
# Definitions
# ---------------------------------------------------------------------------

async def list_page_pins(
    db: AsyncSession, *, username: str, page_id: Optional[uuid.UUID],
) -> list[BobPin]:
    """
    Every pin of the caller's on this page, in the page's order: by position
    on a real page, newest first in Ungrouped. Scoped to created_by IN THE
    STATEMENT, because the table has RLS off. One implementation, shared with
    every write, so the reader and the page cannot disagree about order.
    """
    return await page_writer.page_pins(db, username, page_id)


def dedupe_ids(requested: list[Any]) -> list[str]:
    """
    The requested ids, as strings, first occurrence kept, order preserved.

    Deterministic so the same request always resolves the same way; the ORDER
    of the result is never used for anything — the page's own order is (see
    select_pins).
    """
    seen: set[str] = set()
    out: list[str] = []
    for raw in requested:
        if not isinstance(raw, str):
            raise PageReadRefused(
                f"pins must be a list of pin ids (strings); got {type(raw).__name__}."
            )
        pid = raw.strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        out.append(pid)
    return out


@dataclass(frozen=True)
class Selection:
    """Which pins a read covers, and which it does not."""

    # The pins to read, IN PAGE ORDER — never in the order the ids were given.
    chosen: list[BobPin]
    # The rest of the page, in page order: known to exist, not read.
    remainder: list[BobPin]
    # Requested ids that are not the caller's pins on this page. One list for
    # "belongs to someone else" and "does not exist": they are the same answer.
    unavailable: list[str]
    # The limit this read was made under, for the receipts.
    limit: int


def select_pins(pins: list[BobPin], requested: Optional[list[Any]]) -> Selection:
    """
    The default read is the newest DEFAULT_PINS. An explicit read is exactly
    the requested ids that resolve on this page, at most
    MAX_PINS_PER_PAGE_READ after deduplication, in page order.
    """
    if requested is None:
        return Selection(
            chosen=pins[:DEFAULT_PINS],
            remainder=pins[DEFAULT_PINS:],
            unavailable=[],
            limit=DEFAULT_PINS,
        )

    if not isinstance(requested, list):
        raise PageReadRefused(
            f"pins must be a list of pin ids, got {type(requested).__name__}."
        )
    ids = dedupe_ids(requested)
    if len(ids) > MAX_PINS_PER_PAGE_READ:
        raise PageReadRefused(
            f"One page read may name at most {MAX_PINS_PER_PAGE_READ} pins; "
            f"{len(ids)} were asked for. Read them in more than one call."
        )
    if not ids:
        raise PageReadRefused("pins was given but names no pin id.")

    wanted = set(ids)
    by_id = {str(p.id) for p in pins}
    chosen = [p for p in pins if str(p.id) in wanted]
    remainder = [p for p in pins if str(p.id) not in wanted]
    unavailable = [i for i in ids if i not in by_id]
    return Selection(
        chosen=chosen, remainder=remainder, unavailable=unavailable,
        limit=MAX_PINS_PER_PAGE_READ,
    )


# ---------------------------------------------------------------------------
# Replay
# ---------------------------------------------------------------------------

Runner = Callable[[list[dict]], Awaitable[dict]]
Clock = Callable[[], float]


@dataclass
class Replay:
    """What replaying a selection produced, keyed by pin id."""

    outcomes: dict[str, dict] = field(default_factory=dict)
    # Pins that were never started, with the reason. Order is page order.
    not_started: list[tuple[BobPin, str]] = field(default_factory=list)


async def replay_pins(
    chosen: list[BobPin],
    *,
    deadline_s: float = PAGE_DEADLINE_S,
    concurrency: int = PIN_REPLAY_CONCURRENCY,
    run: Runner = run_pin,
    clock: Clock = time.monotonic,
    preset: Optional[str] = None,
) -> Replay:
    """
    Replay the chosen pins, a bounded number at a time, until the deadline.

    THE DEADLINE GATES STARTING, NOT FINISHING. Workers take the next pin off
    the queue only while time remains; a pin taken before the deadline runs to
    completion under the runner's own per-call timeout. Nothing is launched
    and then thrown away, so every pin is either in `outcomes` with a real
    result or in `not_started` with the reason — never silently missing.
    """
    started_at = clock()
    queue = list(chosen)
    replay = Replay()
    lock = asyncio.Lock()

    async def worker() -> None:
        while True:
            async with lock:
                if not queue:
                    return
                if clock() - started_at >= deadline_s:
                    # Out of time: everything still queued is not read, in
                    # page order, and no worker takes another.
                    while queue:
                        replay.not_started.append((queue.pop(0), NOT_READ_DEADLINE))
                    return
                pin = queue.pop(0)
            # THE PAGE'S WINDOW, IF IT HAS ONE (W1.4): each call run with its
            # own window set to it, exactly as the page's tile runs it, so
            # what Bob reads is what the page shows.
            calls, notes = page_window.windowed(list(pin.tool_calls), preset, title=pin.title)
            outcome = await run(calls)
            if preset is not None:
                for result, note in zip(outcome.get("results") or [], notes):
                    if isinstance(result, dict):
                        result["window"] = note
            replay.outcomes[str(pin.id)] = outcome

    workers = max(1, int(concurrency))
    await asyncio.gather(*[worker() for _ in range(workers)])
    return replay


# ---------------------------------------------------------------------------
# The read
# ---------------------------------------------------------------------------

def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _definition(pin: BobPin) -> dict:
    """A pin as the reader reports it: the row, with its calls as stored."""
    return {
        "pin_id": str(pin.id),
        "title": pin.title,
        "question": pin.question,
        "page": pin.page,
        "page_id": str(pin.page_id) if pin.page_id else None,
        "position": pin.position,
        "pinned_at": _iso(pin.created_at),
        "calls": [dict(c) for c in (pin.tool_calls or [])],
        "last_run_at": _iso(pin.last_run_at),
        "last_ok_at": _iso(pin.last_ok_at),
        "last_status": pin.last_status,
    }


async def read_page(
    db: AsyncSession,
    *,
    username: str,
    page_id: Optional[uuid.UUID],
    pins: Optional[list[Any]] = None,
    figures: bool = True,
    run: Runner = run_pin,
    clock: Clock = time.monotonic,
    deadline_s: float = PAGE_DEADLINE_S,
    concurrency: int = PIN_REPLAY_CONCURRENCY,
) -> dict:
    """
    Read one page of the caller's pins: definitions always, figures on request.

    Returns a plain dict — the shape agent/composite_tools.view_page turns
    into {rows, meta} — with every pin either read, not read for a named
    reason, or listed as beyond the bound. An empty page returns with no pins
    and `empty` true. Raises PageNotFound when `page_id` is not one of the
    caller's pages, and PageReadRefused when the request itself cannot be
    honoured.
    """
    page: Optional[BobPage] = None
    if page_id is not None:
        page = await page_writer.get_page(db, username, page_id)
    all_pins = await list_page_pins(db, username=username, page_id=page_id)

    if all_pins:
        selection = select_pins(all_pins, pins)
    else:
        # Nothing to select from. An explicit id list still has to be well
        # formed — and every id in it is unavailable, because nothing is here.
        ids = [] if pins is None else dedupe_ids(pins)
        if pins is not None and not ids:
            raise PageReadRefused("pins was given but names no pin id.")
        selection = Selection(chosen=[], remainder=[], unavailable=ids,
                              limit=DEFAULT_PINS if pins is None else MAX_PINS_PER_PAGE_READ)

    read_at = datetime.now(timezone.utc)
    preset = page_window.current(page.date_window) if page is not None else None
    if figures and selection.chosen:
        replay = await replay_pins(
            selection.chosen, deadline_s=deadline_s, concurrency=concurrency,
            run=run, clock=clock, preset=preset,
        )
    else:
        replay = Replay()
    not_started = {str(p.id): reason for p, reason in replay.not_started}

    reported: list[dict] = []
    for pin in selection.chosen:
        entry = _definition(pin)
        pid = str(pin.id)
        outcome = replay.outcomes.get(pid)
        if outcome is not None:
            entry["read"] = outcome["status"]
            entry["results"] = list(outcome["results"])
            entry["notices"] = list(outcome["notices"])
        else:
            entry["read"] = "not_read"
            entry["not_read_reason"] = (
                not_started.get(pid) if figures else NOT_READ_FIGURES_OFF
            )
            entry["results"] = []
            entry["notices"] = []
        reported.append(entry)

    return {
        "owner": username,
        # Identity, then presentation. `page` keeps the TITLE under its old key
        # so every consumer that showed a name still can; `page_id` is what
        # the scope is bound to. Both None for the ungrouped pins.
        "page_id": str(page.id) if page else None,
        "page": page.title if page else None,
        # User-authored descriptive text about what the page is for. Handed
        # on labelled as such; never an instruction.
        "purpose": page.purpose if page else None,
        "page_updated_at": _iso(page.updated_at) if page else None,
        # The page's date window (W1.4): None when the page has no filter;
        # otherwise the stored preset (None = each analysis as kept) and its
        # words. Every figure above was read over it.
        "window": ({**page.date_window, "label": page_window.label(preset)}
                   if page is not None and page.date_window is not None else None),
        "empty": not all_pins,
        "read_at": read_at.isoformat(),
        "figures": bool(figures),
        "requested": None if pins is None else dedupe_ids(pins),
        "pins_total": len(all_pins),
        "pins_limit": selection.limit,
        "pins": reported,
        "remainder": [_definition(p) for p in selection.remainder],
        "unavailable": list(selection.unavailable),
        "deadline_s": deadline_s,
    }
