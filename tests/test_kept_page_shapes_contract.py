"""
A kept page draws with the room's shapes, and a pin remembers its shape
(P2S.3(g), was P2.k, 2026-09-17).

The owner, 2026-09-15, of a kept page drawn by the pre-P1.e renderer: "it
doesnt feel like its from the same app and its beacause its not, so make it."
What is held here is the server half of making it the same app:

  1. A PIN RUN RETURNS THE BOARD'S BLOCKS. `default_composition.pin_blocks`
     gives each call that came back with rows the block the board would give
     the same read — by the same rule, through the same `compose` gate.
  2. A PIN REMEMBERS ITS SHAPE. A call may carry `drawn_as`; the stored shape
     is validated against the vocabulary, never changes what runs, and is
     drawn as long as the rows can make it.
  3. KEEPING A CHART KEEPS ITS DRAWING. `pin_answer` stores the shape the read
     has on the board; a pie Bob names himself is held to "only when asked".
  4. "MAKE THAT ONE A PIE" ON A PAGE is `edit_page` `draw`: that pin's call and
     only that one, audited, and refused when nobody asked for a pie.

Pure: no database, no model.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import default_composition, vocabulary, write_tools  # noqa: E402
from agent.write_tools import PageRefused, WriteContext, call_key  # noqa: E402
from app.services import page_operations  # noqa: E402
from app.services.page_writer import PageValidationError  # noqa: E402
from app.services.pin_runner import PinValidationError, validate_calls  # noqa: E402
from test_page_writer_contract import ME, FakeSession, _page, _pin  # noqa: E402
from tools._common import load_defs  # noqa: E402

DEFS = load_defs()
READS = json.loads((Path(__file__).resolve().parents[1] / "frontend" / "src" / "room"
                    / "__fixtures__" / "vocab-reads.json").read_text(encoding="utf-8"))


def _run(coro):
    return asyncio.run(coro)


def result(name: str, status: str = "ok") -> dict:
    read = READS[name]
    return {"tool": read["tool"], "arguments": read["arguments"], "status": status,
            "rows": read["rows"] if status == "ok" else [], "meta": read["meta"], "notices": []}


# ------------------------------------------------------ 1. the board's blocks

def test_a_pin_run_draws_each_read_as_the_board_would():
    names = ["dumbbell", "heatmap", "line"]
    blocks = default_composition.pin_blocks([{} for _ in names], [result(n) for n in names],
                                            defs=DEFS)
    assert [b["kind"] for b in blocks] == [READS["_default"][n] for n in names]
    assert [b["seq"] for b in blocks] == [0, 1, 2]
    assert [b["weight"] for b in blocks] == ["lead", "supporting", "supporting"]
    # The same blocks the board's own default gives the same reads, through the
    # same gate — so a kept read and a board read are one drawing.
    calls = {i: {"tool": READS[n]["tool"], "arguments": READS[n]["arguments"], "is_read": True,
                 "error": None, "duplicate": False, "rows": READS[n]["rows"], "filters": {}}
             for i, n in enumerate(names)}
    board = default_composition.compose_default(calls, defs=DEFS, max_rows=10_000)
    assert [(b["kind"], b["seq"]) for b in blocks] == [(b["kind"], b["seq"]) for b in board]


def test_a_call_that_did_not_come_back_draws_no_block():
    blocks = default_composition.pin_blocks(
        [{}, {}], [result("ranked", status="failed"), result("ranked")], defs=DEFS)
    assert [b["seq"] for b in blocks] == [1]


# ------------------------------------------------------ 2. a pin remembers

def test_a_remembered_shape_is_drawn_while_the_rows_can_make_it():
    [pie] = default_composition.pin_blocks([{"drawn_as": {"kind": "pie"}}], [result("pie")], defs=DEFS)
    assert pie["kind"] == "pie"
    # The shape is remembered, not re-asked: no question named a pie here.
    [cal] = default_composition.pin_blocks([{"drawn_as": {"kind": "calendar"}}], [result("pie")],
                                           defs=DEFS)
    assert cal["kind"] == READS["_default"]["pie"]


def test_a_stored_shape_is_validated_and_never_changes_what_runs():
    calls = validate_calls([{"tool": "get_sales", "arguments": {"group_by": "store",
                                                                "date_range": "last_month"},
                             "drawn_as": "pie"}])
    assert calls == [{"tool": "get_sales",
                      "arguments": {"group_by": "store", "date_range": "last_month"},
                      "drawn_as": {"kind": "pie"}}]
    args = {"group_by": "store", "date_range": "last_month"}
    for bad in ("hologram", "draft", {"kind": "pie", "colour": "red"}, {"kind": "scatter", "field": 3}):
        with pytest.raises(PinValidationError):
            validate_calls([{"tool": "get_sales", "arguments": args, "drawn_as": bad}])
    assert validate_calls([{"tool": "get_sales", "arguments": args}]) == [
        {"tool": "get_sales", "arguments": args}]


# ------------------------------------------------- 3. keeping keeps the drawing

class _Writer:
    def __init__(self):
        self.spec = None

    async def __call__(self, spec):
        self.spec = spec
        return {"pin_id": "p1", "title": spec.title, "page": None, "pins_on_page": 1,
                "created_by": ME, "created_at": "2026-09-17T00:00:00Z"}


def _ctx(question: str, shapes: dict | None = None) -> tuple[WriteContext, _Writer, dict]:
    call = {"tool": "get_sales", "arguments": {"group_by": "store", "date_range": "last_month"}}
    key = call_key(call["tool"], call["arguments"])
    writer = _Writer()
    ctx = WriteContext(writer=writer, question=question, executed={key: call},
                       shapes={key: s for s in [shapes] if s} if shapes else {})
    return ctx, writer, call


def test_a_chart_kept_from_the_board_keeps_its_shape():
    ctx, writer, call = _ctx("keep this", shapes={"kind": "pie"})
    _run(write_tools.pin_answer([call], "Shops", ctx=ctx))
    assert writer.spec.tool_calls[0]["drawn_as"] == {"kind": "pie"}


def test_a_shape_bob_names_unasked_is_left_off_and_said():
    ctx, writer, call = _ctx("keep the shops")
    out = _run(write_tools.pin_answer([{**call, "drawn_as": "treemap"}], "Shops", ctx=ctx))
    assert "drawn_as" not in writer.spec.tool_calls[0]
    assert any("only when the person asks" in c for c in out["meta"]["coerced"])
    ctx, writer, call = _ctx("keep the shops as a treemap")
    _run(write_tools.pin_answer([{**call, "drawn_as": "treemap"}], "Shops", ctx=ctx))
    assert writer.spec.tool_calls[0]["drawn_as"] == {"kind": "treemap"}


def test_the_board_names_what_each_read_is_drawn_as():
    board = [{"key": "shops", "kind": "ranked", "read": {"tool": "get_sales",
                                                         "arguments": {"group_by": "store"}}},
             {"key": "order", "kind": "draft", "read": {"tool": "get_purchase_plan", "arguments": {}}}]
    composition = [{"op": "change", "key": "shops", "kind": "pie"},
                   {"op": "put", "key": "days", "kind": "calendar", "seq": 2}]
    calls = {2: {"tool": "get_sales", "arguments": {"group_by": "day"}}}
    shapes = vocabulary.board_shapes(board, composition, calls, DEFS, call_key)
    assert shapes == {call_key("get_sales", {"group_by": "store"}): {"kind": "pie"},
                      call_key("get_sales", {"group_by": "day"}): {"kind": "calendar"}}


# ------------------------------------------------ 4. "make that one a pie" on a page

class _PageWriter:
    def __init__(self):
        self.spec = None

    async def edit(self, spec):
        self.spec = spec
        return {"page_id": "pg", "title": "Shops", "purpose": None, "analyses": [],
                "analysis_count": 0, "operations": []}


def _edit(question: str, op: dict):
    writer = _PageWriter()
    ctx = WriteContext(question=question, page_writer=writer)
    _run(write_tools.edit_page([op], ctx=ctx))
    return writer.spec.operations[0]


def test_draw_is_an_edit_page_operation_held_to_only_when_asked():
    op = _edit("make that one a pie", {"op": "draw", "pin_id": "p1", "kind": "pie"})
    assert op == {"op": "draw", "shape": {"kind": "pie"}, "call": None, "pin_id": "p1"}
    with pytest.raises(PageRefused, match="only when"):
        _edit("what changed?", {"op": "draw", "pin_id": "p1", "kind": "pie"})
    with pytest.raises(PageRefused, match="not a shape"):
        _edit("as a draft", {"op": "draw", "pin_id": "p1", "kind": "draft"})
    with pytest.raises(PageRefused, match="call"):
        _edit("bars", {"op": "draw", "pin_id": "p1", "kind": "bar", "call": "first"})


def test_draw_changes_that_pin_and_only_that_one_and_is_audited():
    page = _page()
    pin = _pin(page=page)
    other = _pin(title="Other", page=page, position=1)
    before_other = json.dumps(other.tool_calls, sort_keys=True)
    s = FakeSession(pages=[page], pins=[pin, other])
    out = _run(page_operations.apply_edit(s, owner=ME, page_id=page.id, operations=[
        {"op": "draw", "pin_id": str(pin.id), "shape": {"kind": "bar"}, "call": None},
    ]))
    assert pin.tool_calls[0]["drawn_as"] == {"kind": "bar"}
    assert pin.tool_calls[0]["tool"] == "get_sales"
    assert json.dumps(other.tool_calls, sort_keys=True) == before_other
    [event] = [a for a in s.added if getattr(a, "operation", None) == "draw"]
    assert event.pin_id == pin.id and event.after == {"call": 0, "drawn_as": {"kind": "bar"}}
    assert out.operations[0]["op"] == "draw"


def test_draw_names_which_call_when_a_pin_has_several():
    page = _page()
    pin = _pin(page=page)
    pin.tool_calls = [{"tool": "get_sales", "arguments": {}}, {"tool": "get_sales", "arguments": {"a": 1}}]
    s = FakeSession(pages=[page], pins=[pin])
    with pytest.raises(PageValidationError, match="say which"):
        _run(page_operations.plan_edit(s, owner=ME, page_id=page.id, operations=[
            {"op": "draw", "pin_id": str(pin.id), "shape": {"kind": "bar"}}]))
    with pytest.raises(PageValidationError, match="not one of"):
        _run(page_operations.plan_edit(s, owner=ME, page_id=page.id, operations=[
            {"op": "draw", "pin_id": str(pin.id), "shape": {"kind": "bar"}, "call": 2}]))
