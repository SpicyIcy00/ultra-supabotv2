"""
What `compose` adjusts rather than refuses, and the line it will not cross.

WHY THIS FILE EXISTS (P1.a, 2026-09-13). Half of every turn's tool calls were
George labelling his own work, and `compose` was refused in two questions out
of three. Each refusal cost a whole model round trip — the slowest thing a
turn does — and the four recorded runs of the twelve are unanimous about what
was being refused:

    15  a figure/hero named no subject, over a read of ONE row
    11  a spec node said `type`/`kind`/`node` where the grammar says
        `layout`/`mark`, carrying the grammar's OWN words as the value
     5  a comparison named no subjects
     1  a quiet restated the seq it was quieting
     1  a note carried a digit

Not one of them would have put a wrong figure on screen. The `cannot`
scenario is the whole argument in one turn: George read transaction_count
filtered to Rockwell, composed a hero of it subject "Rockwell", and was
refused — because `group_by: []` had left no column carrying the word. He
dropped the subject: refused. Tried a figure: refused. Re-read the identical
number grouped by store so the word would appear in a cell, and finally drew
it. Eight iterations and four composes, to say "I can't see foot traffic."

SO THE LINE IS DRAWN HERE, in one sentence, and every test below is a case of
it: **a coercion may change which WORD holds a value; it may never change
which value is drawn, or introduce one.** A rename is a coercion. A demotion
is a coercion. Choosing which of seven rows a figure draws is NOT, and is
still refused — as is a colour, a width, a title, a typed figure, and a note
with a number in it.

The other half of the file is the fold: the roles and the blocks are one call
now, because they were always one statement.
"""

from __future__ import annotations

import pytest

from agent import compose, grammar
from tools._common import load_defs, req


@pytest.fixture(scope="module")
def defs():
    return load_defs()


# One shop, seven rows: which one a figure draws is a judgement.
MANY = [
    {"store": "Rockwell", "value": 412884.0, "change_pct": -9.4},
    {"store": "OPUS", "value": 121451.0, "change_pct": 30.6},
    {"store": "Fairview", "value": 288110.0, "change_pct": 2.1},
]
# The shape that caused the trouble: filtered to one shop, grouped by nothing,
# so the totals row carries no column with the shop's name in it.
TOTAL = [{"value": 412884.0, "change_pct": -9.4, "unit": "PHP"}]

CALLS = {
    0: {"tool": "get_sales", "arguments": {"filters": {"store": "Rockwell"}},
        "error": None, "is_read": True, "rows": TOTAL,
        "filters": {"store": "Rockwell"}},
    1: {"tool": "get_sales", "arguments": {"group_by": "store"}, "error": None,
        "is_read": True, "rows": MANY, "filters": {}},
    2: {"tool": "get_sales", "arguments": {}, "error": None, "is_read": True,
        "rows": TOTAL, "filters": {}},
}


def run(blocks, defs, calls=None, board=None):
    coerced: list[str] = []
    accepted, rejected = compose.validate(
        {"blocks": blocks}, calls if calls is not None else CALLS, defs,
        board=board, coerced=coerced,
    )
    return accepted, rejected, coerced


# ---------------------------------------------------------------------------
# 1. A subject the READ declares, even where no column survived the grouping
# ---------------------------------------------------------------------------


def test_a_subject_the_read_is_filtered_to_is_backed_by_the_read(defs):
    """
    THE `cannot` SCENARIO, IN ONE ASSERTION.

    `filters_applied` is the tool's own statement of what it read, in meta,
    beside the snapshot timestamp. A read scoped to Rockwell is about
    Rockwell whether or not a column carries the word, and George naming it
    is selection, not invention — which is the only thing rule 9 cares about.
    """
    accepted, rejected, _ = run(
        [{"kind": "hero", "key": "rockwell", "seq": 0, "subject": "Rockwell",
          "weight": "lead"}], defs)
    assert rejected == []
    assert accepted[0]["subject"] == "Rockwell"


def test_a_subject_neither_a_row_nor_the_scope_carries_is_still_refused(defs):
    """The half of the old rule that was about truth, kept whole."""
    _, rejected, _ = run(
        [{"kind": "hero", "key": "k", "seq": 0, "subject": "Greenhills",
          "weight": "lead"}], defs)
    assert "no row for 'Greenhills'" in rejected[0]["reason"]


def test_a_one_row_read_takes_its_subject_from_its_own_scope(defs):
    """
    No subject on a read that returned one row: there is nothing to choose.
    The client draws that row either way (`rowFor(rows, subject) ?? rows[0]`),
    so the subject is a caption here — and it comes from the read's filter,
    never from anything the model supplied.
    """
    accepted, rejected, coerced = run(
        [{"kind": "figure", "key": "atv", "seq": 0, "weight": "supporting"}], defs)
    assert rejected == []
    assert accepted[0]["subject"] == "Rockwell"
    assert any("filtered to 'Rockwell'" in c for c in coerced)


def test_a_one_row_read_with_no_scope_draws_the_row_and_names_no_subject(defs):
    """
    Nothing declares a caption, so none is invented: the block stands with no
    subject and the client labels it off the row it drew. A label George
    supplied would be exactly the thing Selection forbids.
    """
    accepted, rejected, coerced = run(
        [{"kind": "figure", "key": "total", "seq": 2, "weight": "supporting"}], defs)
    assert rejected == []
    assert "subject" not in accepted[0]
    assert any("takes its name from it" in c for c in coerced)


def test_a_many_row_read_with_no_subject_is_still_refused(defs):
    """
    THE COERCION THAT IS NOT ALLOWED. Three shops, and which one a figure
    draws changes what the figure SAYS. Defaulting to row zero would be a
    judgement made by accident — grammar.py refuses a panel-per-shop for the
    same reason — so this stays a refusal, and the refusal says how many rows
    there were so the next attempt is the right one.
    """
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 1, "weight": "supporting"}], defs)
    assert accepted == []
    assert "which one this draws is yours to say" in rejected[0]["reason"]
    assert "3 rows" in rejected[0]["reason"]


def test_a_comparison_with_no_subjects_is_refused_and_names_what_is_there(defs):
    """
    Which two to compare is George's to say. Which two are AVAILABLE is the
    read's, and he should not spend a round trip finding out — the same
    reason grammar._no_row names the values it has.
    """
    _, rejected, _ = run(
        [{"kind": "comparison", "key": "k", "seq": 1, "weight": "supporting"}], defs)
    reason = rejected[0]["reason"]
    assert "names two to 4 subjects" in reason
    assert "Rockwell" in reason and "OPUS" in reason


# ---------------------------------------------------------------------------
# 2. The spec's discriminator, under every name George reached for
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("synonym", ["type", "kind", "node", "as"])
def test_the_node_discriminator_is_renamed_not_refused(defs, synonym):
    """
    Eleven of the 46 recorded refusals are this, and George spent three round
    trips per run cycling `type` → `kind` → bare key → `layout`. The VALUES
    were the grammar's own words the whole time.
    """
    spec = {synonym: "row", "children": [
        {synonym: "value", "seq": 1, "field": "value"},
        {synonym: "delta", "seq": 1, "field": "change_pct"},
    ]}
    coerced: list[str] = []
    out = grammar.validate_spec(spec, calls=CALLS, defs=defs, coerced=coerced)
    assert out["layout"] == "row"
    assert [c["mark"] for c in out["children"]] == ["value", "delta"]
    assert len(coerced) == 3


def test_the_discriminator_as_the_key_is_unwrapped(defs):
    """`{"stack": {...}}` — the third spelling, and the third round trip."""
    spec = {"stack": {"children": [
        {"value": {"seq": 1, "field": "value"}},
        {"delta": {"seq": 1, "field": "change_pct"}},
    ]}}
    coerced: list[str] = []
    out = grammar.validate_spec(spec, calls=CALLS, defs=defs, coerced=coerced)
    assert out["layout"] == "stack"
    assert [c["mark"] for c in out["children"]] == ["value", "delta"]


def test_a_synonym_carrying_a_word_that_is_neither_is_left_alone(defs):
    """
    THE RENAME CANNOT INVENT A LAYOUT. The value is what selects, and it is
    checked against the same closed sets the refusal checked — so a node
    saying `type: "sparkline"` is refused exactly as it always was.
    """
    with pytest.raises(grammar.Rejected) as caught:
        grammar.validate_spec({"type": "sparkline", "children": []},
                              calls=CALLS, defs=defs)
    assert "may not carry ['type']" in str(caught.value)


def test_a_field_set_to_nothing_is_not_a_field(defs):
    """`heading: null` is a heading the model declined to write."""
    spec = {"layout": "panel", "heading": None, "children": [
        {"mark": "value", "seq": 1, "field": "value"},
    ]}
    coerced: list[str] = []
    out = grammar.validate_spec(spec, calls=CALLS, defs=defs, coerced=coerced)
    assert "heading" not in out
    assert any("set to nothing" in c for c in coerced)


def test_a_typed_figure_inside_a_renamed_node_is_still_refused(defs):
    """
    The rename happens BEFORE the checks, not instead of them. A node spelled
    `type` and carrying `field: 203717` is a figure George typed, and it is
    refused in exactly the words it always was.
    """
    with pytest.raises(grammar.Rejected) as caught:
        grammar.validate_spec({"type": "value", "seq": 1, "field": 203717},
                              calls=CALLS, defs=defs)
    assert "must name a column, not carry a value" in str(caught.value)


def test_the_spec_path_reports_its_renames_through_compose(defs):
    """A coercion the model cannot see is a board it will describe wrongly."""
    out = compose.compose(
        [{"key": "shape", "weight": "lead",
          "spec": {"type": "row", "children": [
              {"type": "value", "seq": 1, "field": "value"}]}}],
        calls=CALLS, defs=defs)
    assert out["meta"]["rejected"] == []
    assert any("became layout" in c for c in out["meta"]["coerced"])
    assert out["rows"][0]["spec"]["layout"] == "row"


# ---------------------------------------------------------------------------
# 3. One call, two statements
# ---------------------------------------------------------------------------


def test_the_roles_ride_the_compose_call(defs):
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        [{"seq": 0, "role": "primary"}],
        calls=CALLS, defs=defs)
    assert [f["role"] for f in out["meta"]["findings"]] == ["primary"]
    assert out["meta"]["findings_rejected"] == []
    assert out["rows"][0]["kind"] == "figure"


def test_a_bad_role_is_dropped_without_touching_the_blocks(defs):
    """
    The two statements are checked independently, because they are two
    statements. A role naming a call that never ran does not cost the screen.
    """
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        [{"seq": 42, "role": "primary"}],
        calls=CALLS, defs=defs)
    assert out["meta"]["findings"] == []
    assert out["meta"]["findings_rejected"][0]["seq"] == 42
    assert len(out["rows"]) == 1


def test_naming_no_roles_is_a_valid_composition(defs):
    """A single figure has nothing to label, and must not be made to."""
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        calls=CALLS, defs=defs)
    assert out["meta"]["findings"] == []
    assert out["meta"]["findings_rejected"] == []


def test_the_roles_are_the_same_rules_findings_always_had(defs):
    """
    agent/findings.py is untouched: this is one door into it, not a second
    set of checks. A driver over a different window is still not a
    decomposition of the primary.
    """
    from agent import findings as george_findings

    calls = {
        0: {"tool": "get_sales", "error": None, "is_read": True, "rows": TOTAL,
            "arguments": {"metric": "net_sales", "group_by": [],
                          "date_range": "last_week", "compare_to": "previous_period",
                          "filters": {"store": "Rockwell"}}},
        1: {"tool": "get_sales", "error": None, "is_read": True, "rows": TOTAL,
            "arguments": {"metric": "transaction_count", "group_by": [],
                          "date_range": "last_month", "compare_to": "previous_period",
                          "filters": {"store": "Rockwell"}}},
    }
    through_compose = compose.compose(
        None, [{"seq": 0, "role": "primary"}, {"seq": 1, "role": "driver", "of": 0}],
        calls=calls, defs=defs)
    direct = george_findings.record_findings(
        [{"seq": 0, "role": "primary"}, {"seq": 1, "role": "driver", "of": 0}],
        calls=calls, defs=defs)
    assert through_compose["meta"]["findings"] == direct["rows"]
    assert (len(through_compose["meta"]["findings_rejected"])
            == len(direct["meta"]["rejected"]) == 1)


# ---------------------------------------------------------------------------
# 4. What a coercion may never do
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("field,value", [
    ("colour", "orange"), ("value", 412884), ("title", "Rockwell is down"),
    ("width", 300),
])
def test_no_coercion_lets_a_pixel_or_a_figure_through(defs, field, value):
    """
    THE ONE COERCION THAT CAME BACK OFF THE LIST. Dropping the stray field and
    drawing the rest was on the plan; it came off on 2026-09-13. A block
    carrying `value: 412884` is not a misspelling, it is the attempt this
    module exists to stop, and it costs no round trip to refuse it — the tool
    schema is additionalProperties:false, and four recorded runs contain zero
    of them.
    """
    _, rejected, coerced = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead", field: value}],
        defs)
    assert "a block may not carry" in rejected[0]["reason"]
    assert coerced == []


def test_a_note_with_a_digit_in_it_is_refused_not_stripped(defs):
    """
    Stripping the digits would leave a sentence that reads as though it had
    been checked. A note states no figure, and the refusal says so.
    """
    _, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "note": "down 9 percent on the week"}], defs)
    assert "carries no digits" in rejected[0]["reason"]


def test_every_coercion_is_named_on_the_result(defs):
    """
    Silent divergence is the thing that is not allowed. George has to be able
    to describe the board he actually got, so every adjustment comes back in
    words on `meta.coerced`, and the note tells him to describe THAT one.
    """
    out = compose.compose([
        {"kind": "figure", "key": "a", "seq": 0, "weight": "lead"},
        {"kind": "table", "key": "b", "seq": 1, "weight": "lead"},
        {"op": "quiet", "key": "c", "seq": 1},
        {"op": "change", "key": "d"},
    ], calls=CALLS, defs=defs)
    assert out["meta"]["rejected"] == []
    assert len(out["meta"]["coerced"]) == 4
    assert "COERCED edit did happen" in out["meta"]["note"]


def test_the_allowed_fields_are_still_the_closed_set(defs):
    """
    The coercions add no field. If one ever needs a new key to hold what it
    did, that key is a value George supplied and the coercion is wrong.
    """
    allowed = set(req(defs, "composition.allowed_fields"))
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        calls=CALLS, defs=defs)
    drawn = set(out["rows"][0]) - {"op", "tool"}
    assert drawn <= allowed
