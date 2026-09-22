"""
Stock cover: what runs out, and where to get it (W1.5, 2026-09-22).

NO DATABASE. The definitions, the schema Bob is offered, and the pure half of
the draft (plan_moves) — which is where every quantity a move or an order
carries is computed, so it is where the rules about them are held.

The card's two targets, as far as they can be held without a database:
  - a line above zero whose cover is under its window is flagged, and both
    numbers travel on it (the brief's row, and every draft reason);
  - "the AJI BARN reorder" is a read, not a refusal (get_stock_cover and
    get_replenishment both take the warehouse).
The live half is tests/test_stock_cover_live.py.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from agent import loop
from tools import replenishment, stock_cover
from tools._common import load_defs, req

DEFS = load_defs()
SC = req(DEFS, "stock_cover")
ROOT = Path(__file__).resolve().parent.parent

LABEL = {"a": "Rockwell", "b": "Magnolia", "c": "Fairview"}
STATES = ["out_of_stock", "running_out"]


def _line(store, pid="p1", *, state="running_out", on_hand=2, rate=1.0, cover=2.0,
          warning=10, ideal=30, product="Aji Dilis"):
    return {"store_id": store, "product_id": pid, "sku": "SH1", "product": product,
            "on_hand": on_hand, "units_per_day": rate, "cover_days": cover,
            "warning_level": warning, "ideal_level": ideal, "state": state}


def _plan(wanting, donors, barn, window=7):
    return stock_cover.plan_moves(wanting, donors, barn, window_days=window, label=LABEL,
                                  warehouse_name="AJI BARN", wanting_states=STATES,
                                  max_lines=60)


# ---------------------------------------------------------------------------
# 1. The definitions
# ---------------------------------------------------------------------------

def test_the_window_and_the_speed_are_references_not_numbers():
    """No threshold is invented: the window is the replenishment engine's own
    review period, the speed window the purchase plan's."""
    assert stock_cover.default_window_days(DEFS) == req(DEFS, "replenishment.review_period_days")
    assert stock_cover.lookback_days(DEFS) == req(DEFS, "purchasing.plan.demand.lookback_days")
    assert stock_cover.validate_window(DEFS, None) == req(DEFS, "replenishment.review_period_days")
    with pytest.raises(ValueError):
        stock_cover.validate_window(DEFS, int(req(SC, "window.max")) + 1)


def test_the_states_are_ordered_so_a_broken_count_and_a_missing_level_never_fire():
    names = stock_cover.state_names(DEFS)
    assert names.index("broken_record") < names.index("running_out")
    assert names.index("no_level") < names.index("running_out")
    assert names.index("out_of_stock") < names.index("running_out")
    assert req(SC, "fires") == "running_out"
    assert req(SC, "levels.required_to_fire") is True
    # Every state is ranked exactly once, running out first.
    assert sorted(req(SC, "rank_order")) == sorted(names)
    assert req(SC, "rank_order")[0] == "running_out"
    case = stock_cover._state_case_sql(DEFS)
    for s in req(SC, "states"):
        assert s["sql"] in case


def test_the_shops_and_the_warehouse_come_from_the_store_groups():
    assert stock_cover.shop_ids(DEFS) == [s["id"] for s in req(DEFS, "stores.active_retail")]
    assert stock_cover.warehouse_ids(DEFS) == [s["id"] for s in req(DEFS, "stores.warehouse")]
    source = (ROOT / "tools" / "stock_cover.py").read_text(encoding="utf-8")
    for group in ("active_retail", "warehouse"):
        for s in req(DEFS, f"stores.{group}"):
            assert s["id"] not in source, f"a store id is written into the tool: {s['id']}"


def test_the_draft_is_a_draft():
    assert req(SC, "draft.is_a_draft") is True
    assert req(SC, "draft.writes_anything") is False
    assert req(SC, "draft.warehouse_count_verified") is False
    kind = req(SC, "draft.warehouse_count_notice_kind")
    assert "must_convey" in req(DEFS, f"notices.{kind}")
    assert kind in req(DEFS, "surface.desk.notices.data_may_be_wrong")


def test_the_morning_and_the_watch_read_the_same_section():
    cond = req(DEFS, "watches.conditions.stock_running_out")
    assert cond["section"] == "stock_running_out"
    assert req(DEFS, cond["thresholds_ref"])["definition_ref"] == "stock_cover"
    assert "stock_running_out" in req(DEFS, "attention.order")
    assert req(DEFS, "brief.notability.measure.stock_running_out") == "days_short"


# ---------------------------------------------------------------------------
# 2. What Bob is offered
# ---------------------------------------------------------------------------

def _schema(name):
    return next(s for s in loop.build_tool_schemas() if s["name"] == name)


def test_the_read_is_offered_and_takes_the_warehouse():
    assert loop.TOOL_FUNCTIONS["get_stock_cover"] is stock_cover.get_stock_cover
    props = _schema("get_stock_cover")["input_schema"]["properties"]
    warehouse = [s["display_name"] for s in req(DEFS, "stores.warehouse")]
    for name in warehouse:
        assert name in props["store"]["enum"]
    assert props["view"]["enum"] == list(req(SC, "views"))
    text = _schema("get_stock_cover")["description"]
    # The description is what tells him the reorder is ONE call (SYSTEM_PROMPT
    # is W1.1's), and that both numbers go in the warning.
    assert "AJI BARN reorder" in text and "one call" in text
    assert "BOTH numbers" in text


def test_the_replenishment_plan_reads_the_warehouse_instead_of_refusing_it():
    props = _schema("get_replenishment")["input_schema"]["properties"]
    for s in req(DEFS, "stores.warehouse"):
        assert s["display_name"] in props["store"]["enum"]
        assert replenishment._names_warehouse(DEFS, s["display_name"])
        assert replenishment._names_warehouse(DEFS, s["display_name"].lower())
    assert not replenishment._names_warehouse(DEFS, "Rockwell")
    assert not replenishment._names_warehouse(DEFS, None)
    assert req(DEFS, "replenishment.warehouse_reads_as")


# ---------------------------------------------------------------------------
# 3. The draft — every quantity is computed here
# ---------------------------------------------------------------------------

def test_the_warehouse_is_tried_first_and_says_its_count_is_unverified():
    out = _plan([_line("a", on_hand=2, cover=2.0)], [], {"p1": 100})
    [move] = out["lines"]
    assert move["kind"] == "move" and move["from"] == "AJI BARN" and move["to"] == "Rockwell"
    assert move["quantity"] == 28                     # ideal 30 - on hand 2
    assert move["from_count_verified"] is False
    assert "check the shelf" in move["reason"]
    # Both numbers of the warning are in the reason: the cover and the window.
    assert "2 days" in move["reason"] and "7-day window" in move["reason"]
    assert not out["orders_by_product"]


def test_a_shop_gives_only_above_what_it_keeps_and_never_when_it_wants_stock():
    wanting = [_line("a", on_hand=0, state="out_of_stock", cover=None)]
    donors = [
        # Magnolia: 50 on hand, ideal 30, sells 2 a day -> keeps max(30, 14) = 30, gives 20.
        _line("b", on_hand=50, rate=2.0, cover=25.0, state="covered"),
        # Fairview wants the product itself -> gives nothing.
        _line("c", on_hand=40, rate=10.0, cover=4.0, state="running_out"),
    ]
    out = _plan(wanting + [donors[1]], donors, {"p1": 0})
    moves = [m for m in out["lines"] if m["to"] == "Rockwell"]
    assert [(m["from"], m["quantity"]) for m in moves] == [("Magnolia", 20)]
    assert moves[0]["from_keeps"] == 30
    # Rockwell still needs 10, which is ordered; Fairview holds more than its
    # ideal level, so it needs nothing and is not in the order.
    order = out["orders_by_product"]["p1"]
    assert order["quantity"] == 10
    assert {f["shop"]: f["quantity"] for f in order["for_shops"]} == {"Rockwell": 10}


def test_a_broken_count_gives_nothing_and_the_same_stock_is_never_offered_twice():
    wanting = [_line("a", on_hand=0, state="out_of_stock", cover=None),
               _line("b", on_hand=1, cover=1.0)]
    out = _plan(wanting, [_line("c", on_hand=-40, rate=0.0, cover=None, state="broken_record")],
                {"p1": 35})
    barn = [m for m in out["lines"] if m["from"] == "AJI BARN"]
    # Emptiest first: Rockwell (none left) takes 30, Magnolia the 5 that remain.
    assert [(m["to"], m["quantity"]) for m in barn] == [("Rockwell", 30), ("Magnolia", 5)]
    assert sum(m["quantity"] for m in barn) == 35
    assert out["orders_by_product"]["p1"]["quantity"] == 29 - 5


def test_a_negative_warehouse_count_gives_nothing():
    out = _plan([_line("a")], [], {"p1": -500})
    assert not out["lines"]
    assert out["orders_by_product"]["p1"]["quantity"] == 28


def test_no_ideal_level_is_no_quantity_and_says_so():
    out = _plan([_line("a", ideal=None)], [], {"p1": 100})
    assert not out["lines"] and not out["orders_by_product"]
    [u] = out["unsized"]
    assert "no ideal level" in u["reason"]


def test_the_order_is_one_line_per_product_summed_by_code():
    wanting = [_line("a", on_hand=2), _line("b", on_hand=5, cover=5.0)]
    out = _plan(wanting, [], {"p1": 0})
    order = out["orders_by_product"]["p1"]
    assert order["quantity"] == 28 + 25
    assert [f["shop"] for f in order["for_shops"]] == ["Rockwell", "Magnolia"]


def test_the_brief_row_carries_both_numbers():
    source = (ROOT / "tools" / "brief.py").read_text(encoding="utf-8")
    block = source[source.index('"section": "stock_running_out"'):]
    block = block[: block.index("})")]
    for field in ('"cover_days"', '"window_days"', '"days_short"', '"on_hand"', '"units_per_day"'):
        assert field in block, field


def test_no_figure_in_the_tool_is_left_for_the_model():
    """Rule 9: the reasons are written from the row's own figures, by code."""
    source = (ROOT / "tools" / "stock_cover.py").read_text(encoding="utf-8")
    assert "math.ceil" in source and "need_of" in source
    assert re.search(r"def plan_moves\(", source)


def test_the_morning_line_names_both_numbers_and_asks_where_from():
    from app.services import bob_greeting

    row = {"section": "stock_running_out", "subject": "Aji Kiamoy Strips", "sku": "SH1145",
           "store": "North Edsa", "on_hand": 1.0, "units_per_day": 4.044,
           "cover_days": 0.2, "window_days": 7, "days_short": 6.8}
    line = bob_greeting._sentence(row, {})
    assert "0.2 days" in line and "7-day window" in line and "North Edsa" in line
    chip = bob_greeting._follow_up(row, {})
    assert chip and "Where can I get Aji Kiamoy Strips for North Edsa" in chip["question"]
