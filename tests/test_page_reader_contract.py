"""
Pure tests for the page reader: what Bob is allowed to read of a page.

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
from app.models.bob_page import BobPage                                     # noqa: E402
from app.models.bob_pin import BobPin                                       # noqa: E402
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
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "bob.py"

ME = "ice"
SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
STOCK = {"tool": "get_stock", "arguments": {"location": "AJI BARN"}}

T0 = datetime(2026, 9, 7, tzinfo=timezone.utc)

# The page every fixture pin sits on. A row, with an id: that id is the scope.
PAGE = BobPage(id=uuid.UUID(int=0xA11), owner=ME, title="AJI BARN Reorder",
                  purpose=None, created_at=T0, updated_at=T0)
PAGE_ID = PAGE.id


def _run(coro):
    return asyncio.run(coro)


def _pin(i: int, page: BobPage | None = PAGE, calls=(SALES,)) -> BobPin:
    """Pin number i, created i hours after T0 — so a higher i is newer."""
    pin = BobPin(
        id=uuid.UUID(int=i + 1),
        created_by=ME,
        created_at=T0 + timedelta(hours=i),
        title=f"Pin {i}",
        question=f"Question {i}?",
        conversation_id=None,
        page_id=page.id if page else None,
        position=0,
        tool_calls=[dict(c) for c in calls],
        last_run_at=None,
        last_ok_at=None,
        last_status=None,
    )
    pin.page_obj = page
    return pin


def _page(n: int, **kw) -> list[BobPin]:
    """n pins in PAGE ORDER, as the list statement returns them."""
    pins = [_pin(i, **kw) for i in range(n - 1, -1, -1)]
    for pos, pin in enumerate(pins):
        pin.position = pos
    return pins


class _Scalars:
    def __init__(self, rows): self._rows = rows

    def scalars(self): return self

    def all(self): return list(self._rows)

    def scalar_one_or_none(self): return self._rows[0] if self._rows else None


class FakeSession:
    """
    Answers the two reads the reader makes — the page row, then its pins —
    and records every statement. Which is which is decided from the
    statement's own entity, never from call order.
    """

    def __init__(self, pins: list[BobPin], page: BobPage | None = PAGE) -> None:
        self.pins = pins
        self.page = page
        self.statements: list = []

    async def execute(self, stmt):
        self.statements.append(stmt)
        assert isinstance(stmt, Select), type(stmt)
        first = stmt.column_descriptions[0]
        if first.get("entity") is BobPage:
            return _Scalars([self.page] if self.page is not None else [])
        return _Scalars(self.pins)

    def pin_statements(self) -> list:
        return [st for st in self.statements
                if st.column_descriptions[0].get("entity") is BobPin]


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
    _run(list_page_pins(s, username=ME, page_id=PAGE_ID))
    sql = _compiled(s.pin_statements()[0])
    assert "pins.created_by = " in sql
    assert "pins.page_id = " in sql
    # By identity: no title anywhere in the statement, so a rename cannot
    # change which page is read.
    assert "title" not in sql.split("WHERE")[1]
    assert "lower(" not in sql.lower()
    assert "like" not in sql.lower()


def test_the_ungrouped_scope_is_page_is_null_not_a_name():
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page_id=None))
    sql = _compiled(s.pin_statements()[0])
    assert "pins.created_by = " in sql
    assert "pins.page_id IS NULL" in sql
    assert "Ungrouped" not in sql


def test_the_order_is_the_page_s_order_and_it_is_total():
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page_id=PAGE_ID))
    sql = _compiled(s.pin_statements()[0])
    assert re.search(r"ORDER BY .*position ASC, .*created_at DESC, .*id DESC", sql), sql
    # Ungrouped keeps no positions: newest first, id as the tie-break.
    s = FakeSession([])
    _run(list_page_pins(s, username=ME, page_id=None))
    sql = _compiled(s.pin_statements()[0])
    assert re.search(r"ORDER BY .*created_at DESC, .*id DESC", sql), sql
    assert "position" not in sql.split("ORDER BY")[1]


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

def test_a_missing_or_foreign_page_is_one_clear_condition():
    """The page row is looked up by id, scoped to the caller; nothing is one answer."""
    with pytest.raises(PageNotFound) as exc:
        _run(read_page(FakeSession([], page=None), username=ME, page_id=uuid.UUID(int=77)))
    assert str(exc.value) == "Page not found."


def test_an_empty_page_is_a_successful_empty_read():
    """A page exists before anything is on it; reading it says so, and reads nothing."""
    out = _run(read_page(FakeSession([]), username=ME, page_id=PAGE_ID))
    assert out["empty"] is True
    assert out["pins_total"] == 0 and out["pins"] == [] and out["remainder"] == []
    assert out["page_id"] == str(PAGE_ID) and out["page"] == "AJI BARN Reorder"


def test_an_empty_ungrouped_scope_is_reported_not_invented():
    out = _run(read_page(FakeSession([]), username=ME, page_id=None))
    assert out["empty"] is True and out["pins_total"] == 0
    assert out["page_id"] is None and out["page"] is None


def test_the_read_carries_identity_and_the_users_own_purpose():
    page = BobPage(id=uuid.UUID(int=0xB22), owner=ME, title="Rockwell Weekly",
                      purpose="Watch Rockwell.", created_at=T0, updated_at=T0)
    pins = _page(2, page=page)
    out = _run(read_page(FakeSession(pins, page=page), username=ME, page_id=page.id,
                         figures=False))
    assert out["page_id"] == str(page.id)
    assert out["page"] == "Rockwell Weekly"
    assert out["purpose"] == "Watch Rockwell."
    assert out["page_updated_at"] == T0.isoformat()
    assert out["pins"][0]["page_id"] == str(page.id)
    assert out["pins"][0]["position"] == 0


def test_definitions_only_runs_nothing():
    pins = _page(3)
    calls: list = []

    async def run(c):
        calls.append(c)
        return _ok(c)

    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID,
                         figures=False, run=run))
    assert calls == []
    assert out["figures"] is False
    assert [p["read"] for p in out["pins"]] == ["not_read"] * 3
    assert {p["not_read_reason"] for p in out["pins"]} == {NOT_READ_FIGURES_OFF}
    # Definitions are whole: the calls are there for the reader's own use.
    assert out["pins"][0]["calls"] == [SALES]


def test_a_page_with_one_pin_reads_it_whole():
    pins = _page(1)
    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID,
                         run=lambda c: _coro(_ok(c))))
    assert out["pins_total"] == 1
    assert len(out["pins"]) == 1
    assert out["pins"][0]["read"] == "ok"
    assert out["pins"][0]["results"][0]["status"] == "ok"
    assert out["remainder"] == [] and out["unavailable"] == []


def test_a_large_page_reports_what_was_read_and_what_remains():
    pins = _page(7)
    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID,
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
    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID, run=run))
    assert [p["read"] for p in out["pins"]] == ["ok", "refused", "ok"]
    assert out["pins"][1]["results"][0]["error"] == "low stock is not configured"


def test_a_pin_the_deadline_stopped_is_named_with_its_reason():
    pins = _page(3)
    clock = _Clock(step=100.0)

    async def run(calls):
        clock.now += clock.step
        return _ok(calls)

    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID, run=run,
                         clock=clock, deadline_s=50.0, concurrency=1))
    assert [(p["read"], p.get("not_read_reason")) for p in out["pins"]] == [
        ("ok", None), ("not_read", NOT_READ_DEADLINE), ("not_read", NOT_READ_DEADLINE),
    ]


def test_the_requested_ids_are_recorded_deduplicated():
    pins = _page(3)
    a = str(pins[0].id)
    out = _run(read_page(FakeSession(pins), username=ME, page_id=PAGE_ID, pins=[a, a],
                         run=lambda c: _coro(_ok(c))))
    assert out["requested"] == [a]
    assert [p["pin_id"] for p in out["pins"]] == [a]


def test_the_read_writes_nothing():
    """No flush, no commit, no update: the reader has none of those to call."""
    pins = _page(2)
    s = FakeSession(pins)
    _run(read_page(s, username=ME, page_id=PAGE_ID, run=lambda c: _coro(_ok(c))))
    assert all(isinstance(st, Select) for st in s.statements)
    assert not hasattr(s, "flush") and not hasattr(s, "commit")
    assert pins[0].last_run_at is None and pins[0].last_status is None


async def _coro(value):
    return value


# ---------------------------------------------------------------------------
# 5. The binding in the web process
# ---------------------------------------------------------------------------

def test_the_reader_is_bound_to_the_user_and_the_page_id_and_takes_neither():
    src = _ROUTE.read_text(encoding="utf-8")
    m = re.search(r"def _page_reader\(username: str, page_id: Optional\[uuid\.UUID\]\).*?return read\n",
                  src, re.S)
    assert m, "_page_reader is missing from the route"
    body = m.group(0)
    assert "async def read(pins: Optional[list[str]], figures: bool)" in body
    assert "username=username" in body and "page_id=page_id" in body
    # The route builds it only from the RESOLVED page_scope — an id the caller
    # owns — never from the display string and never from a bare title.
    ask = src[src.index("async def ask("):]
    assert '_page_reader(user.username, page_scope["page_id"])' in ask
    assert "page_context" not in ask[ask.index("page_reader"):ask.index("_page_reader(")]
    assert "_resolve_scope(user.username, request.page_scope)" in ask


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


def test_the_request_accepts_a_scope_by_id_and_legacy_callers_still_work():
    from app.api.v1.routes.bob import AskRequest, PageScope

    legacy = AskRequest(question="hi", page_context="warehouse")
    assert legacy.page_scope is None

    pid = uuid.uuid4()
    scoped = AskRequest(question="hi", page_scope={"page_id": str(pid)})
    assert scoped.page_scope == PageScope(page_id=pid)

    ungrouped = AskRequest(question="hi", page_scope={"page_id": None})
    assert ungrouped.page_scope is not None and ungrouped.page_scope.page_id is None
    assert "page_id" in ungrouped.page_scope.model_fields_set

    # A pre-2026-09-08 client sends a title. Accepted, resolved server-side,
    # never the identity the writer or reader is closed over.
    old = AskRequest(question="hi", page_scope={"name": "AJI BARN Reorder"})
    assert old.page_scope.page_id is None and old.page_scope.name == "AJI BARN Reorder"
    # Both may travel together: the string is what the loop says, the scope
    # is what the reader is bound to.
    both = AskRequest(question="hi", page_context="Pages / X", page_scope={"page_id": str(pid)})
    assert both.page_scope.page_id == pid


def test_scope_resolution_prefers_the_id_and_never_guesses_from_a_title():
    """
    The resolver in the route: an owned id binds; a title binds only when it
    resolves exactly; anything else binds nothing rather than something.
    """
    src = _ROUTE.read_text(encoding="utf-8")
    m = re.search(r"async def _resolve_scope\(.*?\n\n\nasync def ", src, re.S)
    assert m, "_resolve_scope is missing from the route"
    body = m.group(0)
    assert "page_writer.get_page(session, username, scope.page_id)" in body
    assert "find_page_by_title(session, username, scope.name)" in body
    assert "return None" in body
    # The ungrouped scope is the null id, and a null title on its own is
    # still the legacy ungrouped scope.
    assert '{"page_id": None, "name": None}' in body
