"""
The vocabulary Bob draws with, reopened on purpose (P2S.3, 2026-09-17).

P1.f closed the catalogue at six marks so Bob was not choosing between
synonyms. The owner then asked for the rest — "it should have the ability to
make all those different kinds of charts and visualizations like pie and
others cause if it builds a dashboard it needs that". What is held here is
what keeps seventeen shapes from being the menu P1.f removed:

  1. EVERY SHAPE SAYS WHAT ITS ROWS MUST CARRY, and one rule on the server
     (agent/vocabulary.py) and one on the client (catalogue.ts `drawable`)
     give the same answer over the same recorded reads — the matrix written
     into `frontend/src/room/__fixtures__/vocab-reads.json`.
  2. A SHAPE THE ROWS CANNOT MAKE IS DRAWN AS WHAT THEY DO MAKE, and the
     coercion is named. A drawing changes; a value never does.
  3. THREE SHAPES ARE DRAWN ONLY WHEN ASKED — pie, treemap, gauge — and "make
     that one a pie" makes a pie that stays one.
  4. A READ THE LADDER RULED OUT is a flag on the block, never a sentence.
  5. MAP AND FUNNEL ARE DECLINED, each with what would change it.

Pure: no database, no model.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent import compose, default_composition, loop, vocabulary
from tools._common import load_defs, req

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "frontend" / "src" / "room" / "__fixtures__" / "vocab-reads.json"
DEFS = load_defs()
VOC = req(DEFS, "composition")
READS = json.loads(FIXTURE.read_text(encoding="utf-8"))
MARKS = [k for k, v in VOC["widgets"].items() if v.get("rows")]


def call(name: str) -> dict:
    read = READS[name]
    return {"tool": read["tool"], "arguments": read["arguments"], "error": None,
            "duplicate": False, "is_read": True, "rows": read["rows"],
            "filters": {}}


def compose_one(block: dict, read: str, *, question=None, board=None):
    coerced: list[str] = []
    accepted, rejected = compose.validate(
        {"blocks": [{"key": "k", "seq": 1, **block}]}, {1: call(read)}, DEFS,
        board=board, coerced=coerced, question=question)
    return accepted, rejected, coerced


# ------------------------------------------------------------ 1. the matrix

def test_every_shape_names_a_row_rule_that_exists():
    rules = set(VOC["shape_rows"])
    for kind in MARKS:
        assert VOC["widgets"][kind]["rows"] in rules, kind
        assert VOC["widgets"][kind].get("when"), f"{kind} has no rule that picks it unasked"
    for rule in rules:
        vocabulary.satisfies(rule, [{"store": "a", "value": 1}], {}, DEFS)  # implemented


def test_the_catalogue_is_the_six_and_the_eleven():
    assert set(MARKS) == {"figure", "dumbbell", "ranked", "contributors", "line", "table",
                          "bar", "multiples", "area", "stacked", "pie", "scatter", "heatmap",
                          "calendar", "waterfall", "treemap", "gauge"}


def test_the_server_rules_give_the_recorded_matrix():
    """The client's `drawable` is held to the same matrix in vocab.dom.test.tsx."""
    for name, read in READS.items():
        if name.startswith("_"):
            continue
        got = [k for k in MARKS if vocabulary.drawable(k, read["rows"], DEFS, read["channels"])]
        assert got == READS["_drawable"][name], name
        kind = default_composition.shape_for(
            {"tool": read["tool"], "rows": read["rows"]}, 0, "k", "lead")["kind"]
        assert kind == READS["_default"][name], name


def test_each_recorded_read_can_make_the_shape_it_was_recorded_for():
    for name in READS:
        if name.startswith("_"):
            continue
        assert name in READS["_drawable"][name], name


def test_a_read_grouped_by_two_things_is_no_longer_one_zigzag_line():
    # Until P2S.3 a read by store AND week fell to `line` and joined every
    # store's weeks into a series that does not exist.
    assert READS["_default"]["multiples"] == "multiples"
    assert READS["_default"]["heatmap"] == "heatmap"
    assert READS["_default"]["stacked"] == "stacked"


# ------------------------------------------------- 2. what the rows cannot make

def test_a_shape_the_rows_cannot_make_is_drawn_as_what_they_make_and_said():
    accepted, rejected, coerced = compose_one({"kind": "calendar"}, "ranked")
    assert rejected == []
    assert accepted[0]["kind"] == READS["_default"]["ranked"]
    assert any("calendar needs" in c for c in coerced)


def test_a_pie_of_signed_changes_is_never_drawn():
    rows = [{"product": "Aji Mix", "value": -230443.5}, {"product": "Kiamoy", "value": 4389.0}]
    assert not vocabulary.drawable("pie", rows, DEFS)


def test_a_scatter_names_two_measures_of_the_same_row():
    accepted, _, _ = compose_one({"kind": "scatter", "field": "value", "against": "baseline"},
                                 "scatter")
    assert accepted[0]["kind"] == "scatter"
    assert (accepted[0]["field"], accepted[0]["against"]) == ("value", "baseline")
    accepted, _, coerced = compose_one({"kind": "scatter"}, "scatter")
    assert accepted[0]["kind"] != "scatter" and coerced


def test_a_column_is_named_never_a_value():
    _, rejected, _ = compose_one({"kind": "scatter", "field": 12, "against": "baseline"}, "scatter")
    assert rejected and "names a column" in rejected[0]["reason"]


def test_a_measure_on_a_shape_that_draws_none_is_dropped_and_said():
    accepted, _, coerced = compose_one({"kind": "ranked", "field": "value"}, "ranked")
    assert "field" not in accepted[0]
    assert any("draws no field" in c for c in coerced)


def test_a_gauge_draws_one_row():
    accepted, _, coerced = compose_one({"kind": "gauge"}, "dumbbell", question="show it as a gauge")
    assert accepted[0]["kind"] != "gauge"
    assert any("one row" in c for c in coerced)
    accepted, _, _ = compose_one({"kind": "gauge"}, "gauge", question="put that on a gauge")
    assert accepted[0]["kind"] == "gauge"


# ------------------------------------------------------ 3. only when asked

def test_three_shapes_are_drawn_only_when_asked():
    asked = {k for k in MARKS if VOC["widgets"][k].get("only_when_asked")}
    assert asked == {"pie", "treemap", "gauge"}
    for kind in asked:
        assert VOC["widgets"][kind]["asked_by"], kind


def test_an_unasked_pie_is_drawn_as_the_ranking_the_rows_make():
    accepted, _, coerced = compose_one({"kind": "pie"}, "pie", question="how are the shops doing?")
    assert accepted[0]["kind"] == READS["_default"]["pie"]
    assert any("only when the person asks" in c for c in coerced)


def test_an_asked_pie_is_a_pie():
    for said in ("make that one a pie", "Show me a PIE chart", "as pies please", "a donut of it"):
        accepted, _, coerced = compose_one({"kind": "pie"}, "pie", question=said)
        assert accepted[0]["kind"] == "pie", said
        assert coerced == [], said
    # A word that merely contains it is not asking.
    accepted, _, _ = compose_one({"kind": "pie"}, "pie", question="the pies product line")
    assert accepted[0]["kind"] == "pie"  # "pies" is the plural — still asked
    accepted, _, _ = compose_one({"kind": "treemap"}, "treemap", question="spies and tree")
    assert accepted[0]["kind"] != "treemap"


def test_an_asked_shape_is_remembered_on_the_object():
    board = [{"key": "k", "kind": "pie", "weight": "supporting"}]
    accepted, _, coerced = compose_one({"kind": "pie", "op": "change"}, "pie",
                                       question="and last week?", board=board)
    assert accepted[0]["kind"] == "pie" and coerced == []


# --------------------------------------------------------- reshaping in place

BOARD = [
    {"key": "shops", "kind": "ranked", "weight": "lead",
     "read": {"tool": "get_sales", "arguments": {"group_by": "store"}}},
    {"key": "order", "kind": "draft", "weight": "supporting",
     "read": {"tool": "get_purchase_plan", "arguments": {}}},
]


def reshape(block: dict, question: str):
    coerced: list[str] = []
    accepted, rejected = compose.validate({"blocks": [block]}, {}, DEFS, board=BOARD,
                                          coerced=coerced, question=question)
    return accepted, rejected, coerced


def test_make_that_one_a_pie_redraws_that_object_and_reads_nothing():
    accepted, rejected, _ = reshape({"op": "change", "key": "shops", "kind": "pie"},
                                    "make that one a pie")
    assert rejected == []
    assert accepted == [{"op": "change", "key": "shops", "kind": "pie"}]


def test_an_unasked_reshape_leaves_the_object_as_it_was():
    accepted, rejected, coerced = reshape({"op": "change", "key": "shops", "kind": "pie"},
                                          "why did they fall?")
    assert accepted == [] and rejected == []
    assert any("stays as it was" in c for c in coerced)


def test_a_reshape_needs_a_drawing_of_a_read_on_the_board():
    _, rejected, _ = reshape({"op": "change", "key": "order", "kind": "table"}, "as a table")
    assert "not a drawing of a read" in rejected[0]["reason"]
    _, rejected, _ = reshape({"op": "change", "key": "nothing", "kind": "bar"}, "bars")
    assert "nothing on the board" in rejected[0]["reason"]
    _, rejected, _ = reshape({"op": "change", "key": "shops", "kind": "draft"}, "draft")
    assert "not a shape" in rejected[0]["reason"]


# ------------------------------------------------------------- 4. ruled out

def test_ruled_out_is_a_flag_on_the_block():
    accepted, rejected, _ = compose_one({"kind": "ranked", "ruled_out": True}, "ranked")
    assert rejected == [] and accepted[0]["ruled_out"] is True
    _, rejected, _ = compose_one({"kind": "ranked", "ruled_out": "the holiday"}, "ranked")
    assert rejected and "true or false" in rejected[0]["reason"]
    assert "ruled_out" in VOC["allowed_fields"]


# --------------------------------------------------------------- 5. declined

def test_map_and_funnel_are_declined_with_what_would_change_it():
    declined = VOC["declined"]
    assert set(declined) == {"map", "funnel"}
    for name, why in declined.items():
        assert name not in VOC["widgets"]
        assert why["because"] and why["until"]


# ------------------------------------------------------------ what he is taught

def test_the_compose_schema_teaches_the_rule_and_the_new_fields():
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == loop.COMPOSE_TOOL)
    block = schema["input_schema"]["properties"]["blocks"]["items"]["properties"]
    kind = block["kind"]["description"]
    assert "pie:" in kind and "(ONLY WHEN ASKED)" in kind
    assert "(when change over time" in kind
    assert set(block["kind"]["enum"]) == set(VOC["widgets"])
    for field in ("field", "against", "ruled_out"):
        assert field in block, field
