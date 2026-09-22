"""
A kept page's date window (W1.4, 2026-09-22) — "add date filters to this".

NO DATABASE. What holds:

  1. THE OPTIONS ARE THE YAML'S. A page's window is a sales-day preset
     (`pages.window.options_from`) or None — each analysis as it was kept.
     Anything else is refused naming the options, by the service, by Bob's
     tool and by the tool schema.
  2. THE FIGURE IS THE PIN'S OWN READ. The window is substituted into each
     stored call where that tool keeps its window, and the call is run as a
     tile runs it; the stored calls are never rewritten.
  3. A READ THAT TAKES NO DATE RANGE SAYS SO, in the yaml's words, and runs
     as it was kept.
  4. EVERY CHANGE IS AUDITED — `set_window` / `remove_window` in page_events,
     before and after, from a button or from Bob's edit_page alike.
  5. THE TILE AND BOB READ THE SAME THING: the pin-run route and view_page's
     reader both run the windowed calls.
"""

from __future__ import annotations

import asyncio
import copy
import uuid

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop, write_tools                         # noqa: E402
from agent.write_tools import PageRefused                                # noqa: E402
from app.models.bob_page import BobPageEvent, PAGE_OPERATIONS            # noqa: E402
from app.services import page_operations, page_reader, page_window, page_writer  # noqa: E402
from app.services.page_writer import PageValidationError                 # noqa: E402
from tools._common import load_defs, req                                 # noqa: E402
from tests.test_page_writer_contract import ME, FakeSession, _page, _pin  # noqa: E402
from tests.test_page_workshop_contract import FakeWriter, _ctx, _schema  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


SALES = {"tool": "get_sales", "arguments": {
    "metric": "net_sales", "group_by": "store", "filters": {"store": "Rockwell"},
    "date_range": ["2026-08-24", "2026-08-31"], "compare_to": "previous_period"}}
DEAD = {"tool": "get_dead_stock", "arguments": {}}


def _events(s: FakeSession) -> list[BobPageEvent]:
    return [o for o in s.added if isinstance(o, BobPageEvent)]


# ---------------------------------------------------------------------------
# 1. The options are the yaml's
# ---------------------------------------------------------------------------

def test_the_options_are_the_sales_day_presets_with_unset_first():
    defs = load_defs()
    presets = list(req(defs, "sales_day.presets"))
    assert req(defs, "pages.window.options_from") == "sales_day.presets"
    assert page_window.presets() == presets
    options = page_window.options()
    assert options[0]["value"] is None and options[0]["label"] == req(defs, "pages.window.unset_label")
    assert [o["value"] for o in options[1:]] == presets


def test_a_window_that_is_not_a_preset_is_refused_naming_them():
    assert page_window.check(None) is None
    assert page_window.check("last_month") == "last_month"
    with pytest.raises(page_window.WindowRefused, match="last_month"):
        page_window.check("fortnight")


def test_the_tool_schema_offers_exactly_the_presets_and_null():
    items = _schema("edit_page")["input_schema"]["properties"]["operations"]["items"]
    assert {"set_window", "remove_window"} <= set(items["properties"]["op"]["enum"])
    assert items["properties"]["window"]["enum"] == [*page_window.presets(), None]


# ---------------------------------------------------------------------------
# 2 & 3. The pin's own read, over the window — or said to take none
# ---------------------------------------------------------------------------

def test_a_windowed_call_is_the_stored_call_with_its_own_window_set():
    stored = [copy.deepcopy(SALES)]
    calls, notes = page_window.windowed(stored, "last_month", title="Net sales")
    assert calls[0]["arguments"]["date_range"] == "last_month"
    # Everything else is the stored call's, untouched.
    assert {k: v for k, v in calls[0]["arguments"].items() if k != "date_range"} == \
        {k: v for k, v in SALES["arguments"].items() if k != "date_range"}
    assert notes == [{"applied": "last_month", "argument": "date_range",
                      "was": ["2026-08-24", "2026-08-31"]}]
    assert stored == [SALES], "the stored call was rewritten"


def test_no_preset_runs_every_call_as_it_was_kept():
    calls, notes = page_window.windowed([copy.deepcopy(SALES), DEAD], None)
    assert calls == [SALES, DEAD] and notes == [None, None]


def test_a_read_that_takes_no_date_range_says_so_and_runs_as_kept():
    # get_dead_stock's window is a count of days, not a date range; get_stock
    # has none at all. Neither is drawn under a window it ignored.
    for call in (DEAD, {"tool": "get_stock", "arguments": {}}):
        calls, notes = page_window.windowed([call], "last_month", title="Slow lines")
        assert calls == [call]
        assert notes[0]["applied"] is None
        assert notes[0]["says"] == req(load_defs(), "pages.window.no_window_says").format(
            analysis="Slow lines")


def test_a_multi_read_analysis_names_only_the_read_the_window_missed():
    _, notes = page_window.windowed([SALES, DEAD], "last_week", title="Rockwell")
    assert notes[0]["applied"] == "last_week"
    assert notes[1]["says"].startswith("Rockwell (get_dead_stock)")


# ---------------------------------------------------------------------------
# 4. Audited, from a button or from Bob
# ---------------------------------------------------------------------------

def test_setting_the_window_is_audited_and_a_repeat_writes_nothing():
    page = _page()
    s = FakeSession(pages=[page])
    _run(page_writer.set_window(s, owner=ME, page_id=page.id, preset="last_month"))
    assert page.date_window["preset"] == "last_month" and page.date_window["set_by"] == "user"
    [event] = _events(s)
    assert event.operation == "set_window" and event.operation in PAGE_OPERATIONS
    assert event.before == {"window": None} and event.after["window"]["preset"] == "last_month"

    _run(page_writer.set_window(s, owner=ME, page_id=page.id, preset="last_month"))
    assert len(_events(s)) == 1, "the same window again is no write"


def test_putting_the_control_on_moves_nothing():
    page = _page()
    s = FakeSession(pages=[page])
    _run(page_writer.set_window(s, owner=ME, page_id=page.id, preset=None))
    assert page.date_window is not None and page.date_window["preset"] is None
    assert page_window.current(page.date_window) is None
    assert [e.operation for e in _events(s)] == ["set_window"]


def test_a_bad_window_is_refused_before_anything_is_written():
    page = _page()
    s = FakeSession(pages=[page])
    with pytest.raises(PageValidationError):
        _run(page_writer.set_window(s, owner=ME, page_id=page.id, preset="fortnight"))
    assert page.date_window is None and _events(s) == []


def test_taking_it_off_is_audited_and_taking_off_nothing_is_no_write():
    page = _page()
    s = FakeSession(pages=[page])
    _run(page_writer.remove_window(s, owner=ME, page_id=page.id))
    assert _events(s) == []
    page.date_window = page_window.stored("last_week", "user")
    _run(page_writer.remove_window(s, owner=ME, page_id=page.id))
    assert page.date_window is None
    [event] = _events(s)
    assert event.operation == "remove_window" and event.before["window"]["preset"] == "last_week"


def test_bobs_edit_sets_it_through_the_same_service_and_says_what_it_moves():
    page = _page()
    sales = _pin("Net sales", page, 0)
    sales.tool_calls = [SALES]
    dead = _pin("Slow lines", page, 1)
    dead.tool_calls = [DEAD]
    s = FakeSession(pages=[page], pins=[sales, dead])
    actor = page_writer.bob_actor(str(uuid.uuid4()))
    result = _run(page_operations.apply_edit(
        s, owner=ME, page_id=page.id, actor=actor,
        operations=[{"op": "set_window", "window": None}]))
    [op] = result.operations
    assert op["op"] == "set_window" and op["to"] is None and op["on"] is True
    assert op["moves"] == ["Net sales"] and op["reads_no_window"] == ["Slow lines"]
    assert op["options"] == page_window.presets()
    [event] = _events(s)
    assert event.operation == "set_window" and event.actor == "bob"
    assert event.after["window"]["set_by"] == "bob"
    assert result.page["window"]["preset"] is None


def test_the_service_refuses_a_window_that_is_not_a_preset():
    page = _page()
    s = FakeSession(pages=[page])
    with pytest.raises(PageValidationError, match="set_window"):
        _run(page_operations.apply_edit(s, owner=ME, page_id=page.id,
                                        operations=[{"op": "set_window", "window": "fortnight"}]))
    assert _events(s) == []


def test_the_operation_vocabulary_carries_the_window_everywhere():
    for op in ("set_window", "remove_window"):
        assert op in write_tools.PAGE_EDIT_OPERATIONS
        assert op in page_operations.EDIT_OPERATIONS
        assert op in PAGE_OPERATIONS
        # A confirmation of it is not corrected as an unbacked claim.
        assert op in req(load_defs(), "pages.claim_check.operation_phrases")


def test_edit_page_passes_a_date_filter_on_and_refuses_a_made_up_window():
    w = FakeWriter()
    ctx = _ctx(w)
    _run(write_tools.edit_page([{"op": "set_window"}], ctx=ctx))
    [spec] = w.edits
    assert spec.page_id is None, "the page in scope"
    assert spec.operations == [{"op": "set_window", "window": None}]
    _run(write_tools.edit_page([{"op": "set_window", "window": "last_month"}], ctx=ctx))
    assert w.edits[-1].operations == [{"op": "set_window", "window": "last_month"}]
    with pytest.raises(PageRefused, match="not a date window"):
        _run(write_tools.edit_page([{"op": "set_window", "window": "fortnight"}], ctx=ctx))


def test_the_tool_tells_him_a_date_filter_is_the_pages_own():
    doc = " ".join((_schema("edit_page")["description"] or "").split())
    assert "Add date filters to this" in doc and "set_window" in doc
    assert "never a control on your answer" in doc


# ---------------------------------------------------------------------------
# 5. The tile and Bob read the same thing
# ---------------------------------------------------------------------------

def test_view_pages_reader_runs_the_windowed_calls_and_reports_the_window():
    page = _page()
    page.date_window = page_window.stored("last_month", "user")
    pin = _pin("Net sales", page, 0)
    pin.tool_calls = [SALES]
    s = FakeSession(pages=[page], pins=[pin])
    ran: list[list[dict]] = []

    async def fake_run(calls):
        ran.append(calls)
        return {"status": "ok", "notices": [],
                "results": [{"tool": c["tool"], "arguments": c["arguments"], "status": "ok",
                             "rows": [], "meta": {}, "notices": []} for c in calls]}

    read = _run(page_reader.read_page(s, username=ME, page_id=page.id, run=fake_run))
    assert ran[0][0]["arguments"]["date_range"] == "last_month"
    assert pin.tool_calls == [SALES], "reading rewrote the stored call"
    assert read["window"]["preset"] == "last_month" and read["window"]["label"] == "last month"
    assert read["pins"][0]["results"][0]["window"]["applied"] == "last_month"


def test_the_tile_runs_over_the_pages_window(monkeypatch):
    from app.api.v1.routes import bob_pins

    page = _page()
    page.date_window = page_window.stored("last_week", "bob")
    pin = _pin("Net sales", page, 0)
    pin.tool_calls = [SALES, DEAD]
    s = FakeSession(pages=[page], pins=[pin])
    ran: list[list[dict]] = []

    async def fake_run(calls):
        ran.append(calls)
        return {"status": "ok", "notices": [],
                "results": [{"tool": c["tool"], "arguments": c["arguments"], "status": "ok",
                             "rows": [], "meta": {}, "notices": []} for c in calls]}

    monkeypatch.setattr(bob_pins, "run_pin", fake_run)

    class _User:
        username = ME

    out = _run(bob_pins.run_pinned(pin.id, db=s, user=_User()))
    assert ran[0][0]["arguments"]["date_range"] == "last_week"
    assert ran[0][1] == DEAD
    assert out.window == {"preset": "last_week", "label": "last week"}
    assert out.results[0]["window"]["applied"] == "last_week"
    assert "reads no date range" in out.results[1]["window"]["says"]
    assert pin.tool_calls == [SALES, DEAD], "a run rewrote the stored calls"


def test_a_page_without_a_window_runs_its_tiles_exactly_as_before(monkeypatch):
    from app.api.v1.routes import bob_pins

    page = _page()
    pin = _pin("Net sales", page, 0)
    pin.tool_calls = [SALES]
    s = FakeSession(pages=[page], pins=[pin])
    ran: list[list[dict]] = []

    async def fake_run(calls):
        ran.append(calls)
        return {"status": "ok", "notices": [], "results": [
            {"tool": c["tool"], "arguments": c["arguments"], "status": "ok",
             "rows": [], "meta": {}, "notices": []} for c in calls]}

    monkeypatch.setattr(bob_pins, "run_pin", fake_run)

    class _User:
        username = ME

    out = _run(bob_pins.run_pinned(pin.id, db=s, user=_User()))
    assert ran == [[SALES]] and out.window is None and "window" not in out.results[0]
