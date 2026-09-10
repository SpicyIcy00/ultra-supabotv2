"""
Pure tests for the grammar — shapes George composes that nobody listed.

NO DATABASE, NO MODEL. The whole of what makes an unbounded space of shapes
safe is a validator, and a validator is decidable from its inputs.

THE ONE PROPERTY EVERYTHING HERE PROTECTS. A mark names a READ and a COLUMN;
the renderer resolves the value from the rows. There is nowhere in the grammar
to type a figure, a word, a colour or a size — so a composition may be as
elaborate as the work needs and every number on screen is still a number a
tool returned, with its receipts.

That property is what the fourteen named widgets bought by being a closed
menu, and the point of this file is that the menu was never what bought it.
"""

from __future__ import annotations

import pytest

from agent import compose, grammar, loop
from tools._common import load_defs, req

DEFS = load_defs()
GRAMMAR = req(DEFS, "composition.grammar")

ROWS = [
    {"store": "Rockwell", "value": 203717.0, "change_pct": 13.8, "direction": "up"},
    {"store": "OPUS", "value": 555147.0, "change_pct": 30.6, "direction": "up"},
]
CALLS = {0: {"tool": "get_sales", "is_read": True, "rows": ROWS}}


def valid(spec):
    return grammar.validate_spec(spec, calls=CALLS, defs=DEFS)


def refused(spec) -> str:
    with pytest.raises(grammar.Rejected) as caught:
        grammar.validate_spec(spec, calls=CALLS, defs=DEFS)
    return str(caught.value)


# ---------------------------------------------------------------------------
# 1. A figure can never be typed
# ---------------------------------------------------------------------------

def test_a_channel_names_a_column_and_can_never_carry_a_value():
    """
    The door the whole grammar exists to keep shut. `field: 203717` would put
    a figure on screen that no tool returned, and it would look exactly like
    one that did.
    """
    for typed in (203717, 12.5, True):
        why = refused({"mark": "value", "seq": 0, "field": typed})
        assert "not carry a value" in why or "must name a column" in why


def test_a_column_the_read_does_not_have_is_refused():
    """
    A name that resolves to nothing renders as blank authority — an empty
    space where a figure should be, with the receipts still under it.
    """
    why = refused({"mark": "value", "seq": 0, "field": "profit"})
    assert "no column 'profit'" in why
    # And it names what the read DOES have, so the next attempt can be right.
    assert "store" in why and "value" in why


def test_a_colour_is_a_column_never_a_colour():
    """
    A hue George picked would be a figure by another route: it would mean
    whatever he felt rather than what a row says. `colour` names the column
    whose VALUE chooses the hue — an identity or a direction.
    """
    assert "no column '#ff0000'" in refused(
        {"mark": "bar", "seq": 0, "field": "value", "colour": "#ff0000"})
    assert valid({"mark": "bar", "seq": 0, "field": "value",
                  "colour": "direction"})["colour"] == "direction"
    assert req(DEFS, "composition.grammar.channels.colour.from_field_only") is True


def test_a_node_may_carry_nothing_but_the_declared_fields():
    """
    The closed field set is the guarantee. `text`, `value`, `title`, `style` —
    each would be somewhere for words or figures to arrive from George.
    """
    for smuggled in ("text", "value", "title", "style", "html"):
        why = refused({"mark": "value", "seq": 0, "field": "value", smuggled: "x"})
        assert "may not carry" in why


def test_the_allowed_fields_are_the_ones_the_validator_enforces():
    declared = set(req(DEFS, "composition.grammar.allowed_fields"))
    # Every channel and every structural key the validator reads is declared.
    for needed in ("layout", "mark", "children", "seq", "field", "by",
                   "colour", "order", "label", "cols", "heading", "weight"):
        assert needed in declared


# ---------------------------------------------------------------------------
# 2. A shape still rests on a real read
# ---------------------------------------------------------------------------

def test_a_mark_draws_a_read_that_ran_and_returned():
    assert "did not run" in refused({"mark": "value", "seq": 9, "field": "value"})

    failed = {0: {"tool": "get_sales", "is_read": True, "rows": [], "error": "boom"}}
    with pytest.raises(grammar.Rejected) as caught:
        grammar.validate_spec({"mark": "value", "seq": 0, "field": "value"},
                              calls=failed, defs=DEFS)
    assert "failed" in str(caught.value)


def test_a_mark_cannot_draw_a_write():
    write = {0: {"tool": "save_workflow", "is_read": False, "rows": [{"a": 1}]}}
    with pytest.raises(grammar.Rejected) as caught:
        grammar.validate_spec({"mark": "value", "seq": 0, "field": "a"},
                              calls=write, defs=DEFS)
    assert "not a read" in str(caught.value)


def test_prose_names_no_read_because_it_came_from_no_read():
    """George's words are his. Naming a read would imply they came out of it."""
    assert valid({"mark": "prose"})["mark"] == "prose"
    assert "draws no read" in refused({"mark": "prose", "seq": 0})


def test_a_panel_heading_is_a_column_too():
    """
    A title George wrote is a label nobody measured. A heading names a column,
    for the same reason a mark does.
    """
    ok = valid({"layout": "panel", "heading": {"seq": 0, "field": "store"},
                "children": [{"mark": "prose"}]})
    assert ok["heading"] == {"seq": 0, "field": "store"}
    assert "no column" in refused(
        {"layout": "panel", "heading": {"seq": 0, "field": "My Title"},
         "children": [{"mark": "prose"}]})


# ---------------------------------------------------------------------------
# 3. A node is one thing, and a tree is bounded
# ---------------------------------------------------------------------------

def test_a_node_is_a_layout_or_a_mark_never_both_and_never_neither():
    assert "never both and never neither" in refused(
        {"layout": "stack", "mark": "value", "children": []})
    assert "never both and never neither" in refused({"seq": 0, "field": "value"})


def test_a_layout_holds_children():
    assert "holds children" in refused({"layout": "stack"})
    assert "holds children" in refused({"layout": "grid", "cols": 2, "children": []})


def test_a_workspace_is_not_a_document():
    """
    Bounds so a composition stays something a person can take in, and so a
    runaway tree cannot become the answer.
    """
    deep = {"mark": "prose"}
    for _ in range(int(GRAMMAR["max_depth"]) + 2):
        deep = {"layout": "stack", "children": [deep]}
    assert "nested deeper" in refused(deep)

    wide = {"layout": "stack",
            "children": [{"mark": "prose"} for _ in range(int(GRAMMAR["max_nodes"]) + 5)]}
    assert "more than" in refused(wide)

    assert "cols is a whole number" in refused(
        {"layout": "grid", "cols": 99, "children": [{"mark": "prose"}]})


def test_a_composed_shape_reports_every_read_it_draws():
    """
    The loop charts what a composition rests on. A widget names one read; a
    tree may name several, and every one of them has to travel.
    """
    spec = valid({"layout": "row", "children": [
        {"mark": "value", "seq": 0, "field": "value"},
        {"layout": "panel", "heading": {"seq": 0, "field": "store"},
         "children": [{"mark": "bar", "seq": 0, "field": "value", "by": "store"}]},
    ]})
    assert grammar.reads_in(spec) == [0]


# ---------------------------------------------------------------------------
# 4. It reaches the model, and it lives beside the widgets
# ---------------------------------------------------------------------------

def test_a_block_carries_a_kind_or_a_spec_never_both():
    ok, no = compose.validate({"blocks": [
        {"key": "a", "kind": "table", "seq": 0, "spec": {"mark": "prose"}},
    ]}, CALLS, DEFS)
    assert not ok and "never both" in no[0]["reason"]


def test_a_composed_block_is_accepted_and_keeps_its_reads():
    ok, no = compose.validate({"blocks": [
        {"key": "shaped", "weight": "lead", "spec": {
            "layout": "row", "children": [
                {"mark": "value", "seq": 0, "field": "value"},
                {"mark": "delta", "seq": 0, "field": "change_pct"}]}},
    ]}, CALLS, DEFS)
    assert not no
    assert ok[0]["key"] == "shaped" and ok[0]["seqs"] == [0]
    assert "kind" not in ok[0]


def test_the_refusal_names_the_node_that_was_wrong():
    """
    A tree has many places to be wrong. "invalid composition" would send
    George back to redo all of it; naming the node lets him fix the part.
    """
    ok, no = compose.validate({"blocks": [
        {"key": "shaped", "spec": {"layout": "row", "children": [
            {"mark": "prose"},
            {"mark": "value", "seq": 0, "field": "nope"}]}},
    ]}, CALLS, DEFS)
    assert not ok
    assert "spec.1" in no[0]["reason"]


def test_the_grammar_is_offered_to_the_model():
    """
    THE BUG THIS HOLDS, twice made. `action` and `argument` reached the
    definitions and the validator without reaching the tool schema, so the
    model could not see them and guessed. A grammar nobody is told about is a
    grammar nobody uses.
    """
    schema = next(s for s in loop.build_tool_schemas() if s["name"] == "compose")
    props = schema["input_schema"]["properties"]["blocks"]["items"]["properties"]
    assert "spec" in props
    described = props["spec"]["description"]
    for word in list(GRAMMAR["layouts"]) + list(GRAMMAR["marks"]):
        assert word in described, f"the schema never mentions {word}"
    for channel in GRAMMAR["channels"]:
        assert channel in described


def test_the_named_widgets_survive():
    """
    The fourteen are shorthand, not deprecated: most answers want an ordinary
    shape, and they are proven. The grammar is for when nothing named fits.
    """
    widgets = req(DEFS, "composition.widgets")
    assert len(widgets) >= 14
    ok, no = compose.validate({"blocks": [
        {"key": "plain", "kind": "table", "seq": 0},
    ]}, CALLS, DEFS)
    assert ok and not no


# ---------------------------------------------------------------------------
# 5. Which row — the bug the first live use found
# ---------------------------------------------------------------------------

def test_a_subject_says_which_row_and_is_checked_against_them():
    """
    THE BUG THIS HOLDS, found the first time George used the grammar. He
    composed a panel per shop, and every panel drew the FIRST row: seven
    panels, identical figures, each headed with the same shop's name.
    Plausible and wrong, which is worse than not drawing at all.

    `subject` is the one channel naming a VALUE rather than a column, and it
    is not a hole in the rule: a selector is not a figure. It is checked
    against the rows exactly as a named widget's subject is, so a value no row
    carries is refused rather than silently falling back to row one.
    """
    ok = valid({"layout": "panel", "subject": "OPUS",
                "heading": {"seq": 0, "field": "store"},
                "children": [{"mark": "value", "seq": 0, "field": "value"}]})
    assert ok["subject"] == "OPUS"
    # Inherited downward, so a scoped panel scopes everything inside it.
    assert ok["children"][0]["subject"] == "OPUS"

    assert "no row for 'Fairview'" in refused(
        {"layout": "panel", "subject": "Fairview",
         "heading": {"seq": 0, "field": "store"},
         "children": [{"mark": "value", "seq": 0, "field": "value"}]})


def test_a_child_may_narrow_the_subject_it_inherited():
    ok = valid({"layout": "stack", "subject": "OPUS", "children": [
        {"mark": "value", "seq": 0, "field": "value", "subject": "Rockwell"},
    ]})
    assert ok["children"][0]["subject"] == "Rockwell"


def test_a_subject_is_still_never_a_figure():
    """It selects a row; it can never BE one."""
    assert "names a value a row carries" in refused(
        {"mark": "value", "seq": 0, "field": "value", "subject": ""})
    assert "names a value a row carries" in refused(
        {"mark": "value", "seq": 0, "field": "value", "subject": 203717})


def test_a_refusal_teaches_the_fix_rather_than_stating_the_failure():
    """
    Live, George passed `subject: "store"` — the NAME of a column where a
    value belongs. "read 0 has no row for 'store'" is true and useless. A
    refusal that names the mistake and shows values that would have worked is
    the difference between a retry and a correct retry.
    """
    column = refused({"mark": "value", "seq": 0, "field": "value", "subject": "store"})
    assert "names a VALUE" in column and "is a column" in column
    assert "by: 'store'" in column

    missing = refused({"mark": "value", "seq": 0, "field": "value", "subject": "Fairview"})
    assert "Rockwell" in missing and "OPUS" in missing


# ---------------------------------------------------------------------------
# 6. Making the picture carry what the prose used to
# ---------------------------------------------------------------------------

def test_a_note_may_characterise_and_may_never_state_a_figure():
    """
    CLAUDE.md's rule on annotations, enforced: "An annotation may point at rows
    and may characterise them in prose. It may never introduce a number."

    That is what lets a picture take over from a sentence. "carries the whole
    order" beside the bar deletes the paragraph under the chart; "carries 40%
    of the order" would be George putting a figure on screen that no tool
    computed, which is the one thing none of this may ever do.
    """
    ok = valid({"mark": "bar", "seq": 0, "field": "value", "by": "store",
                "note": "carries the whole week"})
    assert ok["note"] == "carries the whole week"

    assert "carries no digits" in refused(
        {"mark": "bar", "seq": 0, "field": "value", "note": "40% of the week"})
    assert "at most" in refused(
        {"mark": "bar", "seq": 0, "field": "value",
         "note": "this line carries the whole order and has been off the shelf all window"})


def test_notes_are_capped_so_they_point_rather_than_narrate():
    many = {"layout": "stack", "children": [
        {"mark": "bar", "seq": 0, "field": "value", "note": f"note {'x' * n}"}
        for n in range(6)
    ]}
    assert "stop pointing and start narrating" in refused(many)


def test_emphasis_lights_one_row_and_hides_none():
    """
    The difference from `subject`, and why both exist. A subject SCOPES — the
    other rows go. An emphasis RANKS — they stay, cooled. "One line dominates"
    needs the others visible or there is nothing to dominate.
    """
    ok = valid({"mark": "bar", "seq": 0, "field": "value", "by": "store",
                "emphasise": "OPUS"})
    assert ok["emphasise"] == "OPUS"
    assert "subject" not in ok

    assert "no row for 'Fairview'" in refused(
        {"mark": "bar", "seq": 0, "field": "value", "emphasise": "Fairview"})


def test_the_prompt_tells_him_the_shape_can_say_it():
    """
    The grammar existing is not the same as him using it. Half the point of
    this work is the instruction to try the picture before the sentence.
    """
    from agent import loop as george_loop

    assert "SAY IT WITH THE SHAPE" in george_loop.SYSTEM_PROMPT
    assert "restates what is drawn" in george_loop.SYSTEM_PROMPT
    # And what prose is still for, so this does not read as "stop explaining".
    assert "WHAT PROSE IS STILL FOR" in george_loop.SYSTEM_PROMPT
