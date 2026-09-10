"""
What George may compose, and — mostly — what he may not.

NO DATABASE. The vocabulary and the validator.

The whole point of `compose` is that the model chooses the screen. The whole
danger of it is the same sentence. These tests spend their effort on the line
between a CHOICE and a VALUE: a block that carries a colour, a width or a
figure is refused with its reason, and a subject that is not a row of the read
it points at is refused too. What survives is a choice among things that
already exist.
"""

import pytest

from tools._common import load_defs, req
from agent import compose


@pytest.fixture(scope="module")
def defs():
    return load_defs()


ROWS = [
    {"store": "Rockwell", "net_sales": 412884, "direction": "down"},
    {"store": "OPUS", "net_sales": 121451, "direction": "up"},
    {"store": "Fairview", "net_sales": 288110, "direction": "up"},
]

CALLS = {
    1: {"tool": "get_sales", "arguments": {}, "error": None, "duplicate": False,
        "is_read": True, "rows": ROWS},
    2: {"tool": "get_sales", "arguments": {}, "error": "refused", "duplicate": False,
        "is_read": True, "rows": []},
    3: {"tool": "pin_answer", "arguments": {}, "error": None, "duplicate": False,
        "is_read": False, "rows": []},
}


def only(blocks, defs):
    return compose.validate({"blocks": blocks}, CALLS, defs)


# ------------------------------------------------------------- choices


def test_a_well_formed_composition_is_accepted(defs):
    accepted, rejected = only([
        {"kind": "hero", "key": "rockwell", "seq": 1, "subject": "Rockwell", "weight": "lead"},
        {"kind": "text", "key": "reading", "weight": "supporting"},
        {"kind": "table", "key": "shops", "seq": 1, "weight": "quiet"},
    ], defs)
    assert rejected == []
    assert [b["kind"] for b in accepted] == ["hero", "text", "table"]
    assert accepted[0]["subject"] == "Rockwell"
    assert accepted[0]["tool"] == "get_sales"


def test_a_comparison_names_rows_of_the_read(defs):
    accepted, rejected = only([
        {"kind": "comparison", "key": "two", "seq": 1, "subjects": ["Rockwell", "OPUS"]},
    ], defs)
    assert rejected == []
    assert accepted[0]["subjects"] == ["Rockwell", "OPUS"]


def test_subject_match_is_case_insensitive(defs):
    accepted, _ = only([{"kind": "subject", "key": "r", "seq": 1, "subject": "rockwell"}], defs)
    assert accepted and accepted[0]["subject"] == "rockwell"


# ------------------------------------------------------------- values


@pytest.mark.parametrize("field, value", [
    ("colour", "orange"),
    ("color", "#fff"),
    ("width", 300),
    ("value", 412884),
    ("title", "Rockwell is down"),
    ("figure", "9.4%"),
])
def test_anything_that_is_a_pixel_or_a_figure_is_refused(defs, field, value):
    """The line between composing and drawing."""
    accepted, rejected = only([
        {"kind": "figure", "key": "r", "seq": 1, "subject": "Rockwell", field: value},
    ], defs)
    assert accepted == []
    assert "George composes, the system draws" in rejected[0]["reason"]


def test_a_subject_that_is_not_a_row_is_refused(defs):
    """George may choose which row leads; he may not introduce one."""
    accepted, rejected = only([
        {"kind": "hero", "key": "x", "seq": 1, "subject": "Shangri-La", "weight": "lead"},
    ], defs)
    assert accepted == []
    assert "no row for 'Shangri-La'" in rejected[0]["reason"]


def test_a_block_over_a_failed_read_is_refused(defs):
    accepted, rejected = only([{"kind": "table", "key": "t", "seq": 2}], defs)
    assert accepted == []
    assert "failed" in rejected[0]["reason"]


def test_a_block_over_a_write_is_refused(defs):
    accepted, rejected = only([{"kind": "table", "key": "t", "seq": 3}], defs)
    assert accepted == []
    assert "not a read" in rejected[0]["reason"]


def test_a_block_over_a_read_that_never_ran_is_refused(defs):
    accepted, rejected = only([{"kind": "table", "key": "t", "seq": 99}], defs)
    assert accepted == []
    assert "did not run" in rejected[0]["reason"]


# ------------------------------------------------------------- weight


def test_only_one_block_leads(defs):
    accepted, rejected = only([
        {"kind": "figure", "key": "a", "seq": 1, "subject": "Rockwell", "weight": "lead"},
        {"kind": "figure", "key": "b", "seq": 1, "subject": "OPUS", "weight": "lead"},
    ], defs)
    assert len(accepted) == 1
    assert "only one block leads" in rejected[0]["reason"]


def test_a_hero_must_lead(defs):
    accepted, rejected = only([
        {"kind": "hero", "key": "r", "seq": 1, "subject": "Rockwell", "weight": "quiet"},
    ], defs)
    assert accepted == []
    assert "lead by definition" in rejected[0]["reason"]


def test_weight_defaults_to_supporting(defs):
    accepted, _ = only([{"kind": "table", "key": "t", "seq": 1}], defs)
    assert accepted[0]["weight"] == "supporting"


# ------------------------------------------------------------- keys


def test_every_block_has_a_key_and_keys_are_unique(defs):
    _, rejected = only([{"kind": "table", "seq": 1}], defs)
    assert "needs a short key" in rejected[0]["reason"]
    _, rejected = only([
        {"kind": "table", "key": "same", "seq": 1},
        {"kind": "table", "key": "same", "seq": 1},
    ], defs)
    assert any("edited twice" in r["reason"] for r in rejected)


def test_a_key_is_a_slug(defs):
    _, rejected = only([{"kind": "table", "key": "Rockwell Store!", "seq": 1}], defs)
    assert "short key" in rejected[0]["reason"]


# ------------------------------------------------------------- bounds


def test_a_composition_is_bounded(defs):
    n = int(req(defs, "composition.max_blocks"))
    accepted, rejected = only([
        {"kind": "table", "key": f"t{i}", "seq": 1} for i in range(n + 2)
    ], defs)
    assert len(accepted) == n
    assert any("not a report" in r["reason"] for r in rejected)


def test_a_chart_needs_a_known_form(defs):
    _, rejected = only([{"kind": "chart", "key": "c", "seq": 1, "form": "pie"}], defs)
    assert "chart form" in rejected[0]["reason"]


def test_a_state_needs_a_known_label(defs):
    accepted, rejected = only([{"kind": "state", "key": "s", "label": "exploding"}], defs)
    assert accepted == [] and "state label" in rejected[0]["reason"]
    accepted, _ = only([{"kind": "state", "key": "s", "label": "pending"}], defs)
    assert accepted[0]["label"] == "pending"


def test_nothing_submitted_is_not_an_error(defs):
    assert compose.validate(None, CALLS, defs) == ([], [])
    assert compose.validate({"blocks": []}, CALLS, defs) == ([], [])


# ------------------------------------------------------------- the body


def test_the_result_names_no_source_table(defs):
    out = compose.compose({"blocks": [{"kind": "table", "key": "t", "seq": 1}]}, calls=CALLS, defs=defs)
    assert "source_table" not in out["meta"]
    assert out["meta"]["accepted"] == 1


def test_the_vocabulary_is_the_definitions(defs):
    voc = req(defs, "composition")
    for kind, spec in voc["widgets"].items():
        assert spec["about"], f"{kind} has no meaning"
        assert isinstance(spec["needs"], list)
    assert "hero" in voc["widgets"] and "draft" in voc["widgets"] and "text" in voc["widgets"]


# ---------------------------------------------------------------------------
# THE BOARD (2026-09-10). A composition is a set of edits to something that
# persists, so most of what a follow-up does is change one object rather than
# redraw a screen. The rules that matter are the ones that stop a partial edit
# from becoming a lie: a quiet or a drop may not smuggle a figure, and a change
# of subject must name the read the subject comes from.
# ---------------------------------------------------------------------------

def test_put_is_what_an_edit_is_when_nothing_says_otherwise(defs):
    accepted, rejected = only([{"kind": "table", "key": "shops", "seq": 1}], defs)
    assert rejected == []
    assert accepted[0]["op"] == "put"


def test_quiet_and_drop_name_a_key_and_nothing_else(defs):
    accepted, rejected = only([
        {"op": "quiet", "key": "shops"},
        {"op": "drop", "key": "old-thing"},
    ], defs)
    assert rejected == []
    assert accepted[0] == {"op": "quiet", "key": "shops", "weight": "quiet"}
    assert accepted[1] == {"op": "drop", "key": "old-thing"}

    _, rejected = only([{"op": "quiet", "key": "shops", "seq": 1}], defs)
    assert "names a key and nothing else" in rejected[0]["reason"]


def test_a_change_may_move_prominence_alone(defs):
    accepted, rejected = only([{"op": "change", "key": "shops", "weight": "lead"}], defs)
    assert rejected == []
    assert accepted[0] == {"op": "change", "key": "shops", "weight": "lead"}


def test_a_change_of_subject_must_name_the_read_it_comes_from(defs):
    """Otherwise the object claims to be about something its rows never carried."""
    accepted, rejected = only([{"op": "change", "key": "shops", "subject": "OPUS"}], defs)
    assert accepted == []
    assert "name the read it comes from" in rejected[0]["reason"]

    accepted, rejected = only([{"op": "change", "key": "shops", "seq": 1, "subject": "OPUS"}], defs)
    assert rejected == []
    assert accepted[0]["subject"] == "OPUS" and accepted[0]["seq"] == 1

    # And the subject still has to be a row of that read.
    accepted, rejected = only([{"op": "change", "key": "s", "seq": 1, "subject": "Shangri-La"}], defs)
    assert accepted == [] and "no row for" in rejected[0]["reason"]


def test_a_change_has_to_change_something(defs):
    accepted, rejected = only([{"op": "change", "key": "shops"}], defs)
    assert accepted == [] and "change something" in rejected[0]["reason"]


def test_one_object_is_edited_once_per_turn(defs):
    accepted, rejected = only([
        {"op": "quiet", "key": "a"},
        {"op": "drop", "key": "a"},
    ], defs)
    assert len(accepted) == 1
    assert "edited twice in one turn" in rejected[0]["reason"]


def test_an_unknown_op_is_refused(defs):
    accepted, rejected = only([{"op": "explode", "key": "a"}], defs)
    assert accepted == [] and "is not one of" in rejected[0]["reason"]


def test_the_ops_are_the_definitions(defs):
    voc = req(defs, "composition")
    assert set(voc["ops"]) == {"put", "change", "quiet", "drop"}
    assert voc["default_op"] == "put"
    assert voc["change_subject_requires_seq"] is True
    assert int(voc["max_objects"]) >= 8
    for name, spec in voc["ops"].items():
        assert spec["about"], f"{name} has no meaning"


# ---------------------------------------------------------------------------
# THE BOARD LINE (2026-09-10). "Why?" "Products." "These two." were resolved
# against the transcript, because that was all George could see. That worked
# while the screen was the last answer and broke the moment the board could
# hold six things: "why?" meant the last thing SAID, not the thing being
# LOOKED at. So what is on the board travels with the question — as names,
# keys and closed vocabulary, and never as a figure.
# ---------------------------------------------------------------------------

BOARD = [
    {"key": "rockwell", "kind": "hero", "weight": "lead", "about": "Rockwell",
     "measure": "Net sales", "window": "last week"},
    {"key": "seikyo-order", "kind": "draft", "weight": "supporting", "about": "Seikyo SEK001",
     "measure": "Purchase plan"},
    {"key": "shops", "kind": "table", "weight": "quiet", "measure": "Net sales"},
]


def test_the_board_line_names_every_object_by_its_key(defs):
    from agent import surface
    line = surface.board_sentence(BOARD, defs)
    for key in ("rockwell", "seikyo-order", "shops"):
        assert key in line, f"{key} is how a follow-up changes that object instead of adding one"
    assert "Rockwell" in line and "Seikyo SEK001" in line
    assert "Net sales" in line and "last week" in line


def test_the_board_line_says_which_object_leads(defs):
    from agent import surface
    line = surface.board_sentence(BOARD, defs)
    assert "LEADING" in line
    assert line.index("LEADING") < line.index("seikyo-order")
    assert "quiet" in line


def test_the_board_line_carries_no_figure(defs):
    """The same rule as the desk line, and the reason both can be trusted."""
    from agent import surface
    poisoned = [dict(BOARD[0], value=412884, change_pct=-9.3, rows=515)]
    line = surface.board_sentence(poisoned, defs)
    for leak in ("412884", "412,884", "9.3", "515"):
        assert leak not in line, f"{leak!r} is a figure and reached the prompt"


def test_the_board_line_ignores_what_is_not_a_widget(defs):
    from agent import surface
    line = surface.board_sentence([{"key": "x", "kind": "iframe", "weight": "lead"}], defs)
    assert line is None


def test_nothing_on_the_board_is_no_line_at_all(defs):
    from agent import surface
    assert surface.board_sentence([], defs) is None
    assert surface.board_sentence(None, defs) is None
    assert surface.board_sentence("nonsense", defs) is None


def test_the_board_line_is_bounded_by_the_definitions(defs):
    from agent import surface
    limit = int(req(defs, "composition.max_objects"))
    many = [{"key": f"k{i}", "kind": "table", "weight": "quiet"} for i in range(limit + 6)]
    line = surface.board_sentence(many, defs)
    assert f"k{limit - 1}" in line
    assert f"k{limit}" not in line


def test_the_loop_puts_the_board_line_on_the_question():
    """Held here because a line George never receives is a line that does nothing."""
    import ast
    import inspect
    from agent import loop as george_loop
    tree = ast.parse(inspect.getsource(george_loop.run))
    calls = [n for n in ast.walk(tree)
             if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
             and n.func.attr == "board_sentence"]
    assert calls, "run() never builds the board line"
