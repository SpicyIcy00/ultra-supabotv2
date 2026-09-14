"""
The board fills when the data lands (P1.b, 2026-09-13).

WHAT IS BEING HELD. The loop composes a default the moment reads return, so
the screen is not empty for the round trip it takes George to say what the
rows are. Two things have to be true of it or it is not worth having:

  1. IT CANNOT SAY ANYTHING GEORGE COULD NOT. Every block goes through
     `compose.validate` — the same gate, the same closed field list, the same
     refusals. The tests below assert the output of the default composer
     survives that gate unchanged, which is the only guarantee that matters:
     if it does, a default block and one of his are the same object.

  2. IT DECIDES A NOUN, NOT A READING. It picks the shape `inferShape` has
     always picked in the client and nothing else. No note, no emphasis, no
     finding, no recommendation — those are readings, and a machine that
     annotated a chart would be characterising rows nobody looked at.

And one it must NOT do: a default never discharges a caveat. The notice gate
(`_drawn_on_the_board`) is fed George's composition alone, because a caveat is
surfaced by a person deciding to draw the read that raised it. That is asserted
here against the loop, not left to the reader.
"""

from __future__ import annotations

import pytest

from agent import compose, default_composition, loop
from tools._common import load_defs


@pytest.fixture(scope="module")
def defs():
    return load_defs()


def read(tool="get_sales", arguments=None, rows=None, **over):
    call = {
        "tool": tool,
        "arguments": arguments if arguments is not None else {},
        "error": None,
        "duplicate": False,
        "rows": rows or [],
        "filters": {},
        "is_read": True,
    }
    call.update(over)
    return call


TOTAL = [{"value": 412884.0, "unit": "PHP"}]
COMPARED_ONE = [{"value": 412884.0, "change_pct": -9.4, "direction": "down"}]
COMPARED_THREE = [
    {"store": "Rockwell", "value": 412884.0, "change_pct": -9.4},
    {"store": "OPUS", "value": 121451.0, "change_pct": 30.6},
    {"store": "Fairview", "value": 288110.0, "change_pct": 2.1},
]
BY_DAY = [{"day": f"2026-09-{d:02d}", "value": 1000.0 + d} for d in range(1, 9)]
BY_DAY_LONG = [{"day": f"2026-08-{d:02d}", "value": 1000.0 + d} for d in range(1, 21)]
MIXED = [
    {"section": "stock", "product": "Aji Mix", "days_of_cover": 3},
    {"section": "sales", "product": "G35", "days_of_cover": 11},
    {"section": "orders", "product": "OPUS", "days_of_cover": 0},
]


# ------------------------------------------------------------------ the shape

def test_one_row_is_a_figure():
    block = default_composition.shape_for(read(rows=TOTAL), 0, "read-0", "lead")
    assert block["kind"] == "figure"
    # No subject from here. On a one-row read the validator fills it from the
    # read's own scope, or says the block draws that row and takes its name
    # from it — either way the caption comes from the read.
    assert "subject" not in block


def test_a_declared_delta_over_one_row_is_still_a_figure():
    block = default_composition.shape_for(read(rows=COMPARED_ONE), 0, "read-0", "lead")
    assert block["kind"] == "figure"


def test_compared_named_rows_are_ranked_however_many_there_are():
    # P1.f: `comparison` capped at four subjects and everything wider fell to a
    # table, so seven shops — the commonest read there is — drew as rows of
    # digits. A ranking holds any number of them and lights the one that
    # matters, which is what the renderer was already doing with a comparison.
    block = default_composition.shape_for(read(rows=COMPARED_THREE), 1, "read-1", "quiet")
    assert block["kind"] == "ranked"
    rows = COMPARED_THREE + [
        {"store": "North Edsa", "value": 91000.0, "change_pct": 1.0},
        {"store": "Katipunan", "value": 70000.0, "change_pct": -3.0},
    ]
    assert default_composition.shape_for(read(rows=rows), 0, "read-0", "lead")["kind"] == "ranked"


def test_a_baseline_on_every_row_is_a_dumbbell_and_a_change_is_contributors():
    # THE SAME RULE catalogue.ranking applies on the client, from the same
    # columns: a before on every row has two ends; a signed change with no
    # before is a decomposition of one.
    with_baseline = [{**r, "baseline": r["value"] * 1.1} for r in COMPARED_THREE]
    assert default_composition.shape_for(
        read(rows=with_baseline), 0, "read-0", "lead")["kind"] == "dumbbell"
    with_change = [{**r, "change": -100.0} for r in COMPARED_THREE]
    assert default_composition.shape_for(
        read(rows=with_change), 0, "read-0", "lead")["kind"] == "contributors"


def test_a_series_over_time_is_a_line_whatever_its_length():
    # The bar/line split went with `form`: a series is a line, and eight days
    # drawn as bars was a second shape for the same fact.
    for rows in (BY_DAY, BY_DAY_LONG):
        assert default_composition.shape_for(read(rows=rows), 0, "read-0", "lead")["kind"] == "line"


def test_a_categorical_series_is_never_a_line():
    rows = [{"store": s, "value": v} for s, v in
            [("Rockwell", 4.0), ("OPUS", 2.0), ("Fairview", 3.0)]]
    assert default_composition.shape_for(read(rows=rows), 0, "read-0", "lead")["kind"] == "ranked"


def test_a_ragged_result_is_a_table_not_a_chart():
    # get_brief with several sections firing: a list of different facts, which
    # is exactly what inferShape refuses to chart.
    assert default_composition.shape_for(read(rows=MIXED), 0, "read-0", "lead")["kind"] == "table"


def test_two_rows_of_one_name_are_not_a_comparison():
    rows = [{"store": "Rockwell", "value": 1.0}, {"store": "Rockwell", "value": 2.0}]
    assert default_composition.shape_for(read(rows=rows), 0, "read-0", "lead")["kind"] == "table"


def test_no_rows_composes_nothing():
    assert default_composition.shape_for(read(rows=[]), 0, "read-0", "lead") is None


# --------------------------------------------------------------- the selection

def test_the_first_composable_read_leads_and_the_rest_are_quiet():
    calls = {0: read(rows=TOTAL), 1: read(rows=BY_DAY), 2: read(rows=COMPARED_THREE)}
    out = default_composition.blocks(calls, max_rows=120)
    assert [b["weight"] for b in out] == ["lead", "quiet", "quiet"]
    assert [b["key"] for b in out] == ["read-0", "read-1", "read-2"]


def test_what_is_never_drawn():
    calls = {
        0: read(rows=TOTAL, error="boom"),
        1: read(rows=TOTAL, duplicate=True),
        2: read(rows=TOTAL, is_read=False),      # a write, or a composite
        3: read(rows=[]),
    }
    assert default_composition.blocks(calls, max_rows=120) == []


def test_a_read_the_client_never_received_whole_is_not_drawn():
    # The loop sends no rows at all past MAX_ROWS_TO_CLIENT, so an object over
    # one would be an empty frame with a receipts line under it.
    big = [{"store": f"s{i}", "value": float(i)} for i in range(200)]
    assert default_composition.blocks({0: read(rows=big)}, max_rows=120) == []
    assert len(default_composition.blocks({0: read(rows=big)}, max_rows=400)) == 1


def test_a_default_is_a_holding_shape_not_a_report():
    calls = {i: read(rows=TOTAL) for i in range(8)}
    out = default_composition.blocks(calls, max_rows=120)
    assert len(out) == default_composition.MAX_DEFAULT_BLOCKS <= 4


def test_it_composes_no_reading():
    calls = {0: read(rows=COMPARED_THREE), 1: read(rows=BY_DAY)}
    for block in default_composition.blocks(calls, max_rows=120):
        assert not ({"note", "emphasise", "action", "spec", "label"} & set(block))


# ------------------------------------------------------------------- the gate

def test_everything_it_composes_survives_the_same_validator(defs):
    calls = {0: read(rows=TOTAL), 1: read(rows=COMPARED_THREE), 2: read(rows=BY_DAY)}
    proposed = default_composition.blocks(calls, max_rows=120)
    accepted, rejected = compose.validate(proposed, calls, defs)
    assert rejected == []
    assert len(accepted) == len(proposed)


def test_it_goes_through_compose_and_not_beside_it(defs):
    calls = {0: read(rows=TOTAL, filters={"store": "Rockwell"})}
    out = default_composition.compose_default(calls, defs=defs, max_rows=120)
    # The validator's coercion supplied the caption, from the read's own scope.
    assert out[0]["subject"] == "Rockwell"


def test_a_read_it_cannot_compose_honestly_is_dropped_silently(defs):
    # Nothing to say and nobody asked: no warning, no frame, no round trip.
    assert default_composition.compose_default({}, defs=defs, max_rows=120) == []


def test_a_put_of_a_read_already_on_the_board_becomes_a_change(defs):
    # One read is one object, and the default obeys it like any composition.
    calls = {0: read(rows=TOTAL, arguments={"metric": "net_sales"})}
    board = [{"key": "sales", "read": {"tool": "get_sales",
                                       "arguments": {"metric": "net_sales"}}}]
    out = default_composition.compose_default(calls, defs=defs, board=board, max_rows=120)
    assert out[0]["op"] == "change"
    assert out[0]["key"] == "sales"


# -------------------------------------------------------------- the trust line

def test_a_default_never_discharges_a_caveat():
    """
    UI rule 4 is surfaced by an object GEORGE composed over the read that
    raised the notice. A default drawing that read would discharge the check
    with nobody having decided anything, so the loop feeds the notice gate his
    blocks alone.
    """
    charted = [{"seq": 0, "tool": "get_sales", "meta": {"notice": {"kind": "partial_window"}}}]
    seeded = [{"op": "put", "kind": "figure", "key": "read-0", "seq": 0, "weight": "lead"}]
    assert loop._drawn_on_the_board([], charted) == set()
    # And it is his blocks, not the default's, that the loop passes in: the
    # source says `_drawn_on_the_board(composition_recorded, charted)` and
    # `default_composition_recorded` is a separate name that reaches the frame
    # and the post and nothing else.
    source = open("agent/loop.py", encoding="utf-8").read()
    assert "_drawn_on_the_board(composition_recorded, charted)" in source
    assert "_drawn_on_the_board(default_composition_recorded" not in source
    # The default would have discharged it, which is why it is kept out.
    assert loop._drawn_on_the_board(seeded, charted) != set()


def test_the_frame_says_it_is_a_default():
    source = open("agent/loop.py", encoding="utf-8").read()
    assert '"default": True,' in source


def test_the_one_chance_is_spent_on_drawing_and_not_on_trying():
    """
    A turn whose first batch is a write, or a read like get_object that returns
    sections rather than a figure, composes nothing. If that spent the turn's
    one default, the board would stay empty for every read that followed — and
    nothing was put on screen, so nothing moves when the next batch gets its
    turn. Measured on the twelve, 2026-09-13: `shop` and `product` both open on
    get_object.
    """
    source = open("agent/loop.py", encoding="utf-8").read()
    body = source.split("if not default_composed and not composition_recorded:")[1][:900]
    latch = body.index("default_composed = True")
    emitted = body.index("if default_composition_recorded:")
    assert emitted < latch, "the latch must sit inside the branch that drew something"


def test_the_model_is_never_told_a_default_was_composed():
    """
    It reaches the client and the answer post. If it reached the messages, it
    would be a round trip's worth of tokens spent describing a board George
    did not compose — and he would describe it as his.
    """
    source = open("agent/loop.py", encoding="utf-8").read()
    for line in source.splitlines():
        if "default_composition_recorded" in line and "messages" in line:
            raise AssertionError(line)
