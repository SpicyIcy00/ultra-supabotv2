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
from agent import compose, loop


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


def with_coercions(blocks, defs, calls=None):
    """accepted, rejected, and what was adjusted rather than refused (P1.a)."""
    coerced = []
    accepted, rejected = compose.validate(
        {"blocks": blocks}, calls if calls is not None else CALLS, defs,
        coerced=coerced,
    )
    return accepted, rejected, coerced


# ------------------------------------------------------------- choices


def test_a_well_formed_composition_is_accepted(defs):
    accepted, rejected = only([
        {"kind": "hero", "key": "rockwell", "seq": 1, "subject": "Rockwell", "weight": "lead"},
        {"kind": "subject", "key": "opus", "seq": 1, "subject": "OPUS", "weight": "supporting"},
        {"kind": "table", "key": "shops", "seq": 1, "weight": "quiet"},
    ], defs)
    assert rejected == []
    assert [b["kind"] for b in accepted] == ["hero", "subject", "table"]
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


def test_only_one_block_leads_and_the_second_is_demoted_not_refused(defs):
    """
    ONE LEAD IS STILL THE RULE; breaking it no longer costs a round trip.

    Until P1.a the second block was refused and drew nothing, which is not
    what George meant by weighting it: he meant this matters, and the object
    already leading matters more by having arrived first. So it draws, one
    rank down, and the adjustment is named — nothing about a weight can change
    what a figure says.
    """
    accepted, rejected, coerced = with_coercions([
        {"kind": "figure", "key": "a", "seq": 1, "subject": "Rockwell", "weight": "lead"},
        {"kind": "figure", "key": "b", "seq": 1, "subject": "OPUS", "weight": "lead"},
    ], defs)
    assert rejected == []
    assert [b["weight"] for b in accepted] == ["lead", "supporting"]
    assert [b["key"] for b in accepted] == ["a", "b"]
    assert any("only one block leads" in c and "'b'" in c for c in coerced)


def test_a_second_hero_is_still_refused(defs):
    """
    The one weight that cannot be demoted, because demoting it draws the wrong
    OBJECT: a hero is the big expressive tile and "a hero is the lead by
    definition" is the widget's own rule, not a ranking.
    """
    accepted, rejected = only([
        {"kind": "hero", "key": "a", "seq": 1, "subject": "Rockwell", "weight": "lead"},
        {"kind": "hero", "key": "b", "seq": 1, "subject": "OPUS", "weight": "lead"},
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
    assert "hero" in voc["widgets"] and "draft" in voc["widgets"]
    # AND HIS PROSE IS NOT ONE OF THEM (P1.c, 2026-09-14). The reading is a
    # region above the board, drawn from the turn's own words, so there is no
    # block for it to be forgotten as and none for it to be boxed in. The
    # grammar's `prose` mark went with it, or the same answer could be drawn
    # twice — once as the region and once inside a composed shape.
    assert "text" not in voc["widgets"], "the reading is not a widget"
    assert "prose" not in req(voc, "grammar")["marks"], "nor is it a mark"


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


def test_quiet_and_drop_name_a_key_and_anything_else_is_ignored(defs):
    accepted, rejected = only([
        {"op": "quiet", "key": "shops"},
        {"op": "drop", "key": "old-thing"},
    ], defs)
    assert rejected == []
    assert accepted[0] == {"op": "quiet", "key": "shops", "weight": "quiet"}
    assert accepted[1] == {"op": "drop", "key": "old-thing"}

    # A quiet that restates the seq it is quieting says the same thing twice.
    # It used to be refused, and then nothing was quieted (P1.a).
    accepted, rejected, coerced = with_coercions(
        [{"op": "quiet", "key": "shops", "seq": 1}], defs)
    assert rejected == []
    assert accepted == [{"op": "quiet", "key": "shops", "weight": "quiet"}]
    assert any("names a key and nothing else" in c for c in coerced)


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


def test_a_change_that_changes_nothing_is_ignored_not_refused(defs):
    """
    The object stays exactly as it is either way, so the only thing the
    refusal ever changed was the round-trip count (P1.a). It is reported, so
    George does not describe an object as having moved.
    """
    accepted, rejected, coerced = with_coercions(
        [{"op": "change", "key": "shops"}], defs)
    assert accepted == [] and rejected == []
    assert any("nothing to change" in c for c in coerced)


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


def test_the_board_line_names_a_shape_george_composed(defs):
    """
    THE DEFECT THIS HOLDS (dogfood log, 2026-09-14; fixed in P1.d). The line
    skipped every kind that was not a widget, and a composed shape's kind is
    `spec` — so a board whose LEADING object was a shape George composed said
    nothing at all about it. "Why?" then resolved against whatever quiet table
    was beside it, and a follow-up could only put a second object next to the
    one meant.
    """
    from agent import surface
    kind = req(defs, "composition.composed_kind")
    line = surface.board_sentence(
        [{"key": "hours", "kind": kind, "weight": "lead", "about": "Rockwell"},
         {"key": "shops", "kind": "table", "weight": "quiet"}],
        defs,
    )
    assert "hours" in line
    assert line.index("hours") < line.index("shops"), "the leading object is the one it is about"
    assert "LEADING" in line


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


# ---------------------------------------------------------------------------
# THE SELF-READS (2026-09-11). George gained two reads for the things he could
# not otherwise see: what he believes, and what the saved rules have been
# doing. Both are COMPOSITES because they need injection — and `compose`
# decided "is a read" by excluding every composite, so the first time he used
# one he was refused for putting it on the board. Which is the only reason the
# tools exist.
# ---------------------------------------------------------------------------

def test_a_self_read_may_be_composed(defs):
    from agent import composite_tools
    calls = {
        1: {"tool": "view_memory", "arguments": {}, "error": None,
            "duplicate": False, "is_read": True,
            "rows": [{"subject": "AJI BARN", "stance": "needs_attention"}]},
        2: {"tool": "view_automations", "arguments": {}, "error": None,
            "duplicate": False, "is_read": True,
            "rows": [{"what": "weekly order", "state": "waiting on you"}]},
    }
    accepted, rejected = compose.validate(
        {"blocks": [
            {"kind": "table", "key": "what-i-think", "seq": 1},
            {"kind": "table", "key": "running", "seq": 2},
        ]}, calls, defs)
    assert rejected == []
    assert [b["tool"] for b in accepted] == ["view_memory", "view_automations"]
    assert set(composite_tools.COMPOSABLE_READS) == {"view_memory", "view_automations"}


def test_a_page_read_is_still_not_composable():
    """
    Its rows are several replayed pins, each with its own receipts. CLAUDE.md
    records that a page read is evidence rather than a figure, and the loop
    never charts it — so an object drawn over it would have no single source.
    """
    from agent import composite_tools
    assert composite_tools.PAGE_CONTEXT_TOOL not in composite_tools.COMPOSABLE_READS


def test_the_loop_agrees_with_the_declaration():
    """A read the loop marks unreadable is a tool George cannot compose over."""
    import ast
    import inspect
    from agent import loop as george_loop
    src = inspect.getsource(george_loop.run)
    assert "COMPOSABLE_READS" in src, "the loop no longer honours the declaration"
    ast.parse(src)


# ---------------------------------------------------------------------------
# The four widgets added 2026-09-11, against the owner's feature 1
# ---------------------------------------------------------------------------

def test_the_widget_vocabulary_covers_what_feature_one_names(defs):
    """
    The owner's feature 1 names what the workspace composes: widgets,
    visualizations, tables, comparisons, TIMELINES, documents, CONTROLS,
    BUSINESS OBJECTS, RECOMMENDATIONS and status objects. Four of those had no
    widget, so the interface could not change into them however the work went.

    `document` is still absent and that is recorded rather than forgotten: no
    document source exists, and a widget with nothing behind it is the failure
    the declined visuals describe.
    """
    widgets = set(req(defs, "composition.widgets"))
    for named in ("timeline", "recommendation", "control", "system"):
        assert named in widgets
    assert "document" not in widgets
    assert req(defs, "composition.documents_not_a_widget_because")


def test_a_recommendation_names_an_action_and_never_a_figure(defs):
    """
    George picks the VERB; the number comes off the read. A block has no field
    for a figure, so "order 806 units" is the tool's quantity beside his word
    and "order about 800" is unrepresentable.
    """
    actions = req(defs, "composition.recommendation_actions")
    calls = {0: {"tool": "get_purchase_plan", "is_read": True,
                 "rows": [{"product": "Aji Mix", "order_qty": 806}]}}

    ok, no = compose.validate({"blocks": [
        {"kind": "recommendation", "key": "a", "seq": 0,
         "subject": "Aji Mix", "action": actions[0]},
    ]}, calls, defs)
    assert len(ok) == 1 and ok[0]["action"] == actions[0]

    ok, no = compose.validate({"blocks": [
        {"kind": "recommendation", "key": "b", "seq": 0,
         "subject": "Aji Mix", "action": "buy_a_lot"},
    ]}, calls, defs)
    assert not ok and "recommendation_actions" in no[0]["reason"]


def test_a_recommendation_can_say_do_nothing(defs):
    """
    A vocabulary with no way to say "leave it" only ever recommends action,
    which makes every recommendation worth less.
    """
    assert "leave_it" in req(defs, "composition.recommendation_actions")


def test_a_control_changes_scope_and_can_never_change_a_threshold(defs):
    """
    The same rule a workflow parameter obeys: scope is which window and how
    many rows; a business threshold is a definition and lives in metrics.yaml
    where it was measured. There is no control that could move one.
    """
    calls = {0: {"tool": "get_sales", "is_read": True,
                 "rows": [{"store": "Rockwell", "value": 1}]}}

    ok, _ = compose.validate({"blocks": [
        {"kind": "control", "key": "w", "seq": 0, "argument": "date_range"},
    ]}, calls, defs)
    assert len(ok) == 1 and ok[0]["argument"] == "date_range"

    for forbidden in ("pct_threshold", "absolute_floor_fraction", "cover_days"):
        ok, no = compose.validate({"blocks": [
            {"kind": "control", "key": "x", "seq": 0, "argument": forbidden},
        ]}, calls, defs)
        assert not ok, f"a control was allowed to change {forbidden}"
        assert "threshold" in no[0]["reason"]


def test_the_new_fields_are_in_the_closed_set_and_a_drop_may_not_carry_them(defs):
    allowed = set(req(defs, "composition.allowed_fields"))
    assert {"action", "argument"} <= allowed

    calls = {0: {"tool": "get_sales", "is_read": True, "rows": [{"store": "Rockwell"}]}}
    coerced = []
    ok, no = compose.validate({"blocks": [
        {"op": "drop", "key": "a", "action": "order"},
    ]}, calls, defs, coerced=coerced)
    # The action is ignored and the drop still drops (P1.a): a drop takes the
    # object off the board, and no field on it could have said otherwise.
    assert no == [] and ok == [{"op": "drop", "key": "a"}]
    assert any("names a key and nothing else" in c for c in coerced)


def test_a_system_is_drawn_over_the_read_that_returns_one(defs):
    """
    Something that RUNS is an object like any other, and it is drawn over
    view_automations — the read that can see the george schema — rather than
    from a name George remembered.
    """
    calls = {0: {"tool": "view_automations", "is_read": True,
                 "rows": [{"what": "Seikyo PO", "state": "scheduled"}]}}
    ok, _ = compose.validate({"blocks": [
        {"kind": "system", "key": "po", "seq": 0, "subject": "Seikyo PO"},
    ]}, calls, defs)
    assert len(ok) == 1 and ok[0]["subject"] == "Seikyo PO"


def test_every_block_field_the_validator_accepts_is_in_the_schema(defs):
    """
    THE BUG THIS HOLDS. `action` and `argument` reached metrics.yaml and the
    validator without reaching the tool SCHEMA, so the model could not see
    them. Asked what to do about Seikyo it reached for a recommendation,
    guessed `label` — the nearest word it could see — and was refused for it.

    A field the validator accepts and the schema hides is a field that does not
    exist, and the refusal blames the model for the omission.
    """
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "compose")
    declared = set(schema["input_schema"]["properties"]["blocks"]["items"]["properties"])
    allowed = set(req(defs, "composition.allowed_fields"))
    assert allowed == declared, (
        f"in the schema but not allowed: {sorted(declared - allowed)}; "
        f"allowed but not in the schema: {sorted(allowed - declared)}"
    )


def test_every_widget_the_definitions_declare_is_offered_to_the_model(defs):
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "compose")
    kinds = schema["input_schema"]["properties"]["blocks"]["items"]["properties"]["kind"]
    assert set(kinds["enum"]) == set(req(defs, "composition.widgets"))


def test_a_control_must_name_an_argument_its_read_actually_takes(defs):
    """
    The closed list says which arguments a control MAY change. It does not say
    this read has one.

    Live, George put a window control on a get_purchase_plan draft and it was
    accepted: that tool's window is `lookback_days`, a number of days, so the
    four date presets drawn beside the order would each have been refused on
    click. A control whose every option fails is worse than no control, and it
    fails at the moment somebody trusts it.

    The per-tool map is the one already declared for backtesting, so a control
    and a backtest cannot disagree about what a tool's window is called.
    """
    windows = req(defs, "workflows.backtest.window_arguments")
    assert windows["get_sales"] == "date_range"
    assert windows["get_purchase_plan"] == "lookback_days"

    def control_over(tool):
        calls = {0: {"tool": tool, "is_read": True, "rows": [{"store": "Rockwell"}]}}
        return compose.validate({"blocks": [
            {"kind": "control", "key": "w", "seq": 0, "argument": "date_range"},
        ]}, calls, defs)

    ok, _ = control_over("get_sales")
    assert len(ok) == 1

    ok, no = control_over("get_purchase_plan")
    assert not ok and "lookback_days" in no[0]["reason"]

    ok, no = control_over("get_product")
    assert not ok and "no window at all" in no[0]["reason"]



# ---------------------------------------------------------------------------
# One read is one object (2026-09-12)
# ---------------------------------------------------------------------------

def test_a_put_of_a_read_already_on_the_board_becomes_a_change_of_that_object(defs):
    """
    THE BUG THIS HOLDS. 168 puts to 3 changes on the dogfood record: asked
    the same thing again, George put a twin beside the object he had. The
    board carries the read behind each object; a put of that read under a
    new key is rewritten — not refused — to a change of the existing key,
    and the rewrite is named so he uses that key from here on.
    """
    board = [{"key": "shops", "kind": "table", "weight": "supporting",
              "read": {"tool": "get_sales", "arguments": {}}}]
    ok, no = compose.validate({"blocks": [{"key": "shops-again", "kind": "table", "seq": 1}]},
                              CALLS, defs, board=board)
    assert not no
    assert ok[0]["op"] == "change" and ok[0]["key"] == "shops"
    assert ok[0]["rewritten_from"] == "shops-again"
    out = compose.compose([{"key": "shops-again", "kind": "table", "seq": 1}],
                          calls=CALLS, defs=defs, board=board)
    assert out["meta"]["rewritten"] == [{"from": "shops-again", "to": "shops"}]


def test_a_put_under_a_key_already_on_the_board_is_not_rewritten(defs):
    board = [{"key": "shops", "kind": "table", "weight": "supporting",
              "read": {"tool": "get_sales", "arguments": {}}}]
    ok, _ = compose.validate({"blocks": [{"key": "shops", "kind": "table", "seq": 1}]},
                             CALLS, defs, board=board)
    assert ok[0]["op"] == "put" and "rewritten_from" not in ok[0]


def test_a_different_read_is_a_different_object(defs):
    board = [{"key": "shops", "kind": "table", "weight": "supporting",
              "read": {"tool": "get_sales", "arguments": {"date_range": "last_month"}}}]
    ok, _ = compose.validate({"blocks": [{"key": "shops-week", "kind": "table", "seq": 1}]},
                             CALLS, defs, board=board)
    assert ok[0]["op"] == "put" and ok[0]["key"] == "shops-week"


# ---------------------------------------------------------------------------
# THE RENDERER DRAWS WHAT THE VOCABULARY PROMISES (P1.c, 2026-09-14)
#
# A widget the model may compose and the client cannot draw is a promise the
# model keeps and the screen does not — and the reverse, a kind the renderer
# still draws after it left the definitions, is how the reading would have
# gone on being a tile on one path while being a region on another.
# ---------------------------------------------------------------------------

def test_every_widget_has_a_case_in_the_renderer_and_nothing_else_does(defs):
    from pathlib import Path
    import re

    src = (Path(__file__).resolve().parents[1]
           / "frontend" / "src" / "room" / "render.tsx").read_text(encoding="utf-8")
    drawn = set(re.findall(r"case '([a-z]+)': return", src))
    declared = set(req(defs, "composition.widgets"))
    assert declared - drawn == set(), f"declared and never drawn: {sorted(declared - drawn)}"
    assert drawn - declared == set(), f"drawn and no longer declared: {sorted(drawn - declared)}"
    assert "text" not in drawn, "the reading is a region (Reading.tsx), never a tile"


# ---------------------------------------------------------------------------
# HOW THE BOARD TRAVELS WITH THE QUESTION (P1.d, 2026-09-14)
#
# The rule is a convention about what a question is ABOUT, so it belongs in the
# definitions; the board that applies it is the client's. These hold the two
# ends together — the same way expire_after_turns is held — because a rule
# written in one place and lived in another is a rule that drifts.
# ---------------------------------------------------------------------------

def _board_ts():
    from pathlib import Path
    return (Path(__file__).resolve().parents[1]
            / "frontend" / "src" / "room" / "board.ts").read_text(encoding="utf-8")


def test_the_travel_rule_is_declared_before_it_is_applied(defs):
    travel = req(defs, "composition.board_travel")
    assert travel["clears_when"] == "no_shared_subject"
    assert travel["kept_survives"] is True
    assert travel["fold_untouched"] is True


def test_the_board_mirrors_the_subject_filters_the_definitions_declare(defs):
    import re

    declared = list(req(defs, "composition.board_travel.subject_filters"))
    src = _board_ts()
    block = re.search(r"const SUBJECT_FILTERS = \[(.*?)\] as const;", src, re.S)
    assert block, "board.ts no longer names the subject filters"
    mirrored = re.findall(r"'([a-z_]+)'", block.group(1))
    assert mirrored == declared, (
        f"board.ts holds {mirrored}, the definitions declare {declared}")


def test_the_board_clears_and_folds_rather_than_accumulating():
    """
    THE COMPLAINT THIS HOLDS: "when i ask to look for problems all the rest of
    the widgets still stayed". Both halves are the client's, and both are
    exercised by board.travel.test.ts; this only asserts they still exist,
    because a deleted rule and a passing suite is how it came back last time.
    """
    src = _board_ts()
    assert "export function travel(" in src
    assert "export function folded(" in src
    assert "=== 'clears'" in src, "buildBoard no longer acts on the rule"
