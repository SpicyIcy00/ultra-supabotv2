"""
Pure tests for the page reader: what George is allowed to read of a page.

NO DATABASE, NO API. What makes a page read safe is decidable from the
statement it emits, the selection it makes and the way it schedules work:

  1. The statement is scoped to the caller AND the exact page. Somebody else's
     page of the same name is unreachable because the SQL cannot reach it.
  2. A default read is the newest DEFAULT_PINS; an explicit read names at most
     MAX_PINS_PER_PAGE_READ ids, deduplicated, and comes back in the PAGE'S
     order whatever order the ids were given in. An id that is not the
     caller's on this page is "unavailable" — and "belongs to someone else"
     and "does not exist" are one answer, by construction.
  3. Replay is scheduled against the clock: once the deadline passes no new
     pin is started, and a pin that was not started is named with its reason.
     Nothing is launched and then discarded.
  4. The reader is BOUND in the web process to the verified user and the exact
     page; the callable the loop receives takes neither.

test_page_reader_live.py exercises the same functions against the real
database inside a rolled-back transaction.
"""

from __future__ import annotations

import asyncio
import inspect
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import Select
from sqlalchemy.dialects import postgresql

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent.write_tools import PageReadRefused as AgentPageReadRefused, WriteContext  # noqa: E402
from app.models.george_pin import GeorgePin                                       # noqa: E402
from app.services.page_reader import (                                            # noqa: E402
    DEFAULT_PINS,
    MAX_PINS_PER_PAGE_READ,
    NOT_READ_DEADLINE,
    NOT_READ_FIGURES_OFF,
    PIN_REPLAY_CONCURRENCY,
    PageNotFound,
    PageReadRefused,
    dedupe_ids,
    list_page_pins,
    read_page,
    replay_pins,
    select_pins,
)

_ROOT = Path(__file__).resolve().parents[1]
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "george.py"

ME = "ice"
SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
STOCK = {"tool": "get_stock", "arguments": {"location": "AJI BARN"}}

T0 = datetime(2026, 9, 7, tzinfo=timezone.utc)


def _run(coro):
    return asyncio.run(coro)


def _pin(i: int, page: str | None = "AJI BARN Reorder", calls=(SALES,)) -> GeorgePin:
    """Pin number i, created i hours after T0 — so a higher i is newer."""
    return GeorgePin(
        id=uuid.UUID(int=i + 1),
        created_by=ME,
        created_at=T0 + timedelta(hours=i),
        title=f"Pin {i}",
        question=f"Question {i}?",
        conversation_id=None,
        page=page,
        tool_calls=[dict(c) for c in calls],
        last_run_at=None,
        last_ok_at=None,
        last_status=None,
    )


def _page(n: int, **kw) -> list[GeorgePin]:
    """n pins in PAGE ORDER: newest first, as the list statement returns them."""
    return [_pin(i, **kw) for i in range(n - 1, -1, -1)]


class _Scalars:
    def __init__(self, rows): self._rows = rows

    def scalars(self): return self

    def all(self): return list(self._rows)


class FakeSession:
    """Answers the one read the reader makes and records the statement."""

    def __init__(self, pins: list[GeorgePin]) -> None:
        self.pins = pins
        self.statements: list = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        assert isinstance(stmt, Select), type(stmt)
        return _Scalars(self.pins)


def _compiled(stmt) -> str:
    return str(stmt.compile(dialect=postgresql.dialect()))


def _ok(calls: list[dict]) -> dict:
    return {
        "status": "ok",
        "results": [{"tool": c["tool"], "arguments": c["arguments"], "status": "ok",
                     "duration_ms": 1, "rows": [{"value": 1}], "meta": {}, "notices": []}
                    for c in calls],
        "notices": [],
    }


# ---------------------------------------------------------------------------
# 1. The statement
# ---------------------------------------------------------------------------

def test_the_list_is_scoped_to_the_caller_and_the_exact_page():
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page="AJI BARN Reorder"))
    sql = _compiled(s.statements[0])
    assert "pins.created_by = " in sql
    assert "pins.page = " in sql
    # Exact, not LIKE, not lower(): case is the user's and is not evidence of
    # a different page — but it is not the same page either.
    assert "lower(" not in sql.lower()
    assert "like" not in sql.lower()


def test_the_ungrouped_scope_is_page_is_null_not_a_name():
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page=None))
    sql = _compiled(s.statements[0])
    assert "pins.created_by = " in sql
    assert "pins.page IS NULL" in sql
    assert "Ungrouped" not in sql


def test_the_order_is_the_page_s_order_and_it_is_total():
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page="X"))
    sql = _compiled(s.statements[0])
    assert re.search(r"ORDER BY .*created_at DESC, .*id DESC", sql), sql


# ---------------------------------------------------------------------------
# 2. Selection
# ---------------------------------------------------------------------------

def test_a_default_read_stops_at_the_newest_default_pins():
    pins = _page(9)
    sel = select_pins(pins, None)
    assert DEFAULT_PINS == 5
    assert [p.title for p in sel.chosen] == [f"Pin {i}" for i in (8, 7, 6, 5, 4)]
    assert [p.title for p in sel.remainder] == [f"Pin {i}" for i in (3, 2, 1, 0)]
    assert sel.unavailable == []
    assert sel.limit == DEFAULT_PINS


def test_an_explicit_subset_can_read_up_to_the_hard_maximum():
    pins = _page(12)
    ids = [str(p.id) for p in pins[2:10]]              # eight of twelve
    sel = select_pins(pins, ids)
    assert MAX_PINS_PER_PAGE_READ == 8
    assert len(sel.chosen) == 8
    assert sel.limit == MAX_PINS_PER_PAGE_READ


def test_more_than_the_hard_maximum_is_refused_not_cut():
    pins = _page(12)
    with pytest.raises(PageReadRefused) as exc:
        select_pins(pins, [str(p.id) for p in pins[:9]])
    assert "at most 8" in str(exc.value)


def test_duplicate_ids_are_deduplicated_deterministically():
    pins = _page(4)
    a, b = str(pins[0].id), str(pins[1].id)
    assert dedupe_ids([b, a, b, " a ".replace("a", a), b]) == [b, a]
    sel = select_pins(pins, [b, a, b, a, b, a, b, a, b, a])   # ten entries, two ids
    assert [str(p.id) for p in sel.chosen] == [a, b]


def test_model_supplied_ordering_cannot_change_page_ordering():
    pins = _page(6)
    reversed_ids = [str(p.id) for p in reversed(pins)]
    sel = select_pins(pins, reversed_ids)
    assert [p.title for p in sel.chosen] == [p.title for p in pins]


def test_foreign_and_missing_ids_are_indistinguishable():
    """
    The reader only ever sees the caller's own pins on this page, so an id
    that is somebody else's and an id that never existed take the same path
    and produce the same answer: unavailable, nothing more.
    """
    pins = _page(3)
    someone_elses = str(uuid.UUID(int=999))   # exists — for another user
    never_existed = str(uuid.UUID(int=998))
    sel = select_pins(pins, [someone_elses, str(pins[1].id), never_existed])
    assert sel.unavailable == [someone_elses, never_existed]
    assert [p.title for p in sel.chosen] == [pins[1].title]
    # Same shape, same words, whichever it was.
    assert type(sel.unavailable[0]) is type(sel.unavailable[1]) is str


def test_a_subset_that_names_no_id_is_refused():
    with pytest.raises(PageReadRefused):
        select_pins(_page(2), [])
    with pytest.raises(PageReadRefused):
        select_pins(_page(2), ["", "  "])


def test_non_string_ids_are_refused_with_a_reason():
    with pytest.raises(PageReadRefused) as exc:
        select_pins(_page(2), [1, 2])
    assert "pin ids" in str(exc.value)


# ---------------------------------------------------------------------------
# 3. Scheduling against the clock
# ---------------------------------------------------------------------------

class _Clock:
    """A clock the test advances by hand: each run() call costs `step` seconds."""

    def __init__(self, step: float) -> None:
        self.now, self.step = 0.0, step

    def __call__(self) -> float:
        return self.now


def test_the_reader_stops_scheduling_work_after_the_deadline():
    pins = _page(6)
    clock = _Clock(step=10.0)
    ran: list[str] = []

    async def run(calls):
        ran.append(calls[0]["tool"])
        clock.now += clock.step
        return _ok(calls)

    # Concurrency 1 and 25 seconds: pins start at t=0, 10, 20; at t=30 the
    # deadline has passed and the remaining three are never started.
    replay = _run(replay_pins(pins, deadline_s=25.0, concurrency=1, run=run, clock=clock))
    assert len(ran) == 3
    assert set(replay.outcomes) == {str(p.id) for p in pins[:3]}
    assert [(p.title, why) for p, why in replay.not_started] == [
        ("Pin 2", NOT_READ_DEADLINE), ("Pin 1", NOT_READ_DEADLINE), ("Pin 0", NOT_READ_DEADLINE),
    ]


def test_nothing_is_launched_and_then_discarded():
    """Every pin the runner was asked to run has its outcome kept."""
    pins = _page(4)
    clock = _Clock(step=100.0)
    ran: list[str] = []

    async def run(calls):
        ran.append("x")
        await asyncio.sleep(0)          # let the other worker take its pin
        clock.now += clock.step
        return _ok(calls)

    replay = _run(replay_pins(pins, deadline_s=50.0, concurrency=2, run=run, clock=clock))
    # Two workers each took one pin before the clock moved, then both found
    # the deadline gone.
    assert len(ran) == len(replay.outcomes) == 2
    assert len(replay.not_started) == 2


def test_at_most_the_concurrency_is_in_flight():
    pins = _page(7)
    in_flight = 0
    peak = 0

    async def run(calls):
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        in_flight -= 1
        return _ok(calls)

    assert PIN_REPLAY_CONCURRENCY == 2
    replay = _run(replay_pins(pins, deadline_s=60.0, concurrency=2, run=run))
    assert peak == 2
    assert len(replay.outcomes) == 7
    assert replay.not_started == []


# ---------------------------------------------------------------------------
# 4. The read as a whole
# ---------------------------------------------------------------------------

def test_a_missing_page_is_a_clear_condition():
    with pytest.raises(PageNotFound) as exc:
        _run(read_page(FakeSession([]), username=ME, page="Nowhere"))
    assert "no page called 'Nowhere'" in str(exc.value)


def test_an_empty_ungrouped_scope_is_reported_not_invented():
    with pytest.raises(PageNotFound) as exc:
        _run(read_page(FakeSession([]), username=ME, page=None))
    assert "no ungrouped pins" in str(exc.value)


def test_definitions_only_runs_nothing():
    pins = _page(3)
    calls: list = []

    async def run(c):
        calls.append(c)
        return _ok(c)

    out = _run(read_page(FakeSession(pins), username=ME, page="AJI BARN Reorder",
                         figures=False, run=run))
    assert calls == []
    assert out["figures"] is False
    assert [p["read"] for p in out["pins"]] == ["not_read"] * 3
    assert {p["not_read_reason"] for p in out["pins"]} == {NOT_READ_FIGURES_OFF}
    # Definitions are whole: the calls are there for the reader's own use.
    assert out["pins"][0]["calls"] == [SALES]


def test_a_page_with_one_pin_reads_it_whole():
    pins = _page(1)
    out = _run(read_page(FakeSession(pins), username=ME, page="AJI BARN Reorder",
                         run=lambda c: _coro(_ok(c))))
    assert out["pins_total"] == 1
    assert len(out["pins"]) == 1
    assert out["pins"][0]["read"] == "ok"
    assert out["pins"][0]["results"][0]["status"] == "ok"
    assert out["remainder"] == [] and out["unavailable"] == []


def test_a_large_page_reports_what_was_read_and_what_remains():
    pins = _page(7)
    out = _run(read_page(FakeSession(pins), username=ME, page="AJI BARN Reorder",
                         run=lambda c: _coro(_ok(c))))
    assert out["pins_total"] == 7 and out["pins_limit"] == 5
    assert [p["title"] for p in out["pins"]] == [f"Pin {i}" for i in (6, 5, 4, 3, 2)]
    assert [p["title"] for p in out["remainder"]] == ["Pin 1", "Pin 0"]


def test_mixed_outcomes_are_kept_per_pin_not_rolled_up():
    pins = _page(3)

    async def run(calls):
        if calls[0]["tool"] == "get_stock":
            return {"status": "refused",
                    "results": [{"tool": "get_stock", "arguments": {}, "status": "refused",
                                 "duration_ms": 1, "rows": [], "meta": {}, "notices": [],
                                 "error": "low stock is not configured"}],
                    "notices": []}
        return _ok(calls)

    pins[1].tool_calls = [dict(STOCK)]
    out = _run(read_page(FakeSession(pins), username=ME, page="AJI BARN Reorder", run=run))
    assert [p["read"] for p in out["pins"]] == ["ok", "refused", "ok"]
    assert out["pins"][1]["results"][0]["error"] == "low stock is not configured"


def test_a_pin_the_deadline_stopped_is_named_with_its_reason():
    pins = _page(3)
    clock = _Clock(step=100.0)

    async def run(calls):
        clock.now += clock.step
        return _ok(calls)

    out = _run(read_page(FakeSession(pins), username=ME, page="P", run=run,
                         clock=clock, deadline_s=50.0, concurrency=1))
    assert [(p["read"], p.get("not_read_reason")) for p in out["pins"]] == [
        ("ok", None), ("not_read", NOT_READ_DEADLINE), ("not_read", NOT_READ_DEADLINE),
    ]


def test_the_requested_ids_are_recorded_deduplicated():
    pins = _page(3)
    a = str(pins[0].id)
    out = _run(read_page(FakeSession(pins), username=ME, page="P", pins=[a, a],
                         run=lambda c: _coro(_ok(c))))
    assert out["requested"] == [a]
    assert [p["pin_id"] for p in out["pins"]] == [a]


def test_the_read_writes_nothing():
    """No flush, no commit, no update: the reader has none of those to call."""
    pins = _page(2)
    s = FakeSession(pins)
    _run(read_page(s, username=ME, page="P", run=lambda c: _coro(_ok(c))))
    assert all(isinstance(st, Select) for st in s.statements)
    assert not hasattr(s, "flush") and not hasattr(s, "commit")
    assert pins[0].last_run_at is None and pins[0].last_status is None


async def _coro(value):
    return value


# ---------------------------------------------------------------------------
# 5. The binding in the web process
# ---------------------------------------------------------------------------

def test_the_reader_is_bound_to_the_user_and_the_page_and_takes_neither():
    src = _ROUTE.read_text(encoding="utf-8")
    m = re.search(r"def _page_reader\(username: str, page: Optional\[str\]\).*?return read\n",
                  src, re.S)
    assert m, "_page_reader is missing from the route"
    body = m.group(0)
    assert "async def read(pins: Optional[list[str]], figures: bool)" in body
    assert "username=username" in body and "page=page" in body
    # The route builds it only from the request's page_scope, never from the
    # display string.
    ask = src[src.index("async def ask("):]
    assert "_page_reader(user.username, request.page_scope.name)" in ask
    assert "page_context" not in ask[ask.index("page_reader"):ask.index("_page_reader(")]


def test_the_context_carries_the_reader_and_defaults_to_none():
    ctx = WriteContext()
    assert ctx.page_reader is None
    sig = inspect.signature(WriteContext)
    assert "page_reader" in sig.parameters


def test_the_agent_side_refusal_is_a_value_error():
    """So the loop returns it to the model as a refusal, never a crash."""
    assert issubclass(AgentPageReadRefused, ValueError)
    assert issubclass(PageReadRefused, ValueError)
    assert issubclass(PageNotFound, LookupError)


def test_the_request_accepts_a_scope_and_legacy_callers_still_work():
    from app.api.v1.routes.george import AskRequest, PageScope

    legacy = AskRequest(question="hi", page_context="warehouse")
    assert legacy.page_scope is None

    scoped = AskRequest(question="hi", page_scope={"name": "AJI BARN Reorder"})
    assert scoped.page_scope == PageScope(name="AJI BARN Reorder")

    ungrouped = AskRequest(question="hi", page_scope={"name": None})
    assert ungrouped.page_scope is not None and ungrouped.page_scope.name is None
    # Both may travel together: the string is what the loop says, the scope
    # is what the reader is bound to.
    both = AskRequest(question="hi", page_context="Pages / X", page_scope={"name": "X"})
    assert both.page_scope.name == "X"
