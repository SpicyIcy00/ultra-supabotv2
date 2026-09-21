"""
What `compose` adjusts rather than refuses, and the line it will not cross.

WHY THIS FILE EXISTS (P1.a, 2026-09-13). Half of every turn's tool calls were
Bob labelling his own work, and `compose` was refused in two questions out
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
scenario is the whole argument in one turn: Bob read transaction_count
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
    Rockwell whether or not a column carries the word, and Bob naming it
    is selection, not invention — which is the only thing rule 9 cares about.
    """
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "rockwell", "seq": 0, "subject": "Rockwell",
          "weight": "lead"}], defs)
    assert rejected == []
    assert accepted[0]["subject"] == "Rockwell"


def test_a_subject_neither_a_row_nor_the_scope_carries_is_still_refused(defs):
    """The half of the old rule that was about truth, kept whole."""
    _, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "subject": "Greenhills",
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
    subject and the client labels it off the row it drew. A label Bob
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


def test_a_ranking_of_the_same_rows_needs_no_subject_at_all(defs):
    """
    WHAT THE `comparison` REFUSAL BECAME (P1.f). It asked for two to four
    subjects off the read and named the values available so the next attempt
    would be right — five refusals in four recorded runs, every one of them
    over rows already on the screen. A ranking draws all of them, so there is
    nothing left to choose and nothing left to refuse; which one MATTERS is
    said with `emphasise`, which hides nothing.
    """
    accepted, rejected, _ = run(
        [{"kind": "ranked", "key": "k", "seq": 1, "weight": "supporting",
          "emphasise": "OPUS"}], defs)
    assert rejected == []
    assert accepted[0]["kind"] == "ranked" and accepted[0]["emphasise"] == "OPUS"


# ---------------------------------------------------------------------------
# 2. The spec's discriminator, under every name Bob reached for
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("synonym", ["type", "kind", "node", "as"])
def test_the_node_discriminator_is_renamed_not_refused(defs, synonym):
    """
    Eleven of the 46 recorded refusals are this, and Bob spent three round
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
    `type` and carrying `field: 203717` is a figure Bob typed, and it is
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


def test_the_reading_rides_the_compose_call(defs):
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        {"claim": "Rockwell is the one to look at", "next": "Check its baskets"},
        calls=CALLS, defs=defs)
    assert out["meta"]["reading"]["claim"] == "Rockwell is the one to look at"
    assert out["meta"]["rejected_slots"] == []
    assert out["rows"][0]["kind"] == "figure"


def test_a_bad_slot_is_dropped_without_touching_the_blocks(defs):
    """
    The two statements are checked independently, because they are two
    statements. A caveat with a figure in it does not cost the screen.
    """
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        {"caveat": "baskets fell 12% at Magnolia"},
        calls=CALLS, defs=defs)
    assert out["meta"]["reading"] == {}
    assert out["meta"]["rejected_slots"][0]["slot"] == "caveat"
    assert len(out["rows"]) == 1


def test_saying_nothing_in_the_slots_is_a_valid_composition(defs):
    """A confirmation has nothing to say in three parts, and must not be made to."""
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        calls=CALLS, defs=defs)
    assert out["meta"]["reading"] == {}
    assert out["meta"]["rejected_slots"] == []


def test_the_slots_are_the_same_rules_reading_owns(defs):
    """
    agent/reading.py owns every rule: this is one door into it, not a second
    set of checks.
    """
    from agent import reading as bob_reading

    said = {"claim": "Rockwell is down", "caveat": "the count fell 412,999 short"}
    returned = bob_reading.returned_numbers(CALLS.values())
    through_compose = compose.compose(None, said, calls=CALLS, defs=defs)
    accepted, rejected = bob_reading.validate(said, defs, returned)
    assert through_compose["meta"]["reading"] == accepted
    assert through_compose["meta"]["rejected_slots"] == rejected
    assert len(rejected) == 1


def test_the_figures_the_slots_may_carry_are_the_calls_own(defs):
    """
    THE DOOR CARRIES THE NUMBERS THROUGH (2026-09-14). `caveat` and `next` may
    say a figure one of this turn's reads returned, so compose has to hand the
    validator the calls it is already validating against — not a second source
    of truth, and not nothing, which would refuse every figure.
    """
    said = {"caveat": "Rockwell is 412,884 against the week before, and it is the only one"}
    out = compose.compose(None, said, calls=CALLS, defs=defs)
    assert out["meta"]["rejected_slots"] == []
    assert out["meta"]["reading"]["caveat"].startswith("Rockwell is 412,884")


def test_a_claim_with_a_digit_in_it_is_refused_not_stripped(defs):
    """
    Stripping the digits would leave a title that reads as though it had been
    checked. A claim states no figure, and the refusal says so. (It was
    `note` until P1.f gave the block-level title its own name.)
    """
    _, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "claim": "down 9 percent on the week"}], defs)
    assert "carries no digits" in rejected[0]["reason"]


def test_a_claim_titles_the_block_and_comes_back_flattened(defs):
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "subject": "Rockwell", "claim": "Rockwell  is\n the one to look at"}], defs)
    assert rejected == []
    assert accepted[0]["claim"] == "Rockwell is the one to look at"


# ---------------------------------------------------------------------------
# The question a block answers (P3.o, 2026-09-19): what makes it a STEP
# ---------------------------------------------------------------------------

def test_a_block_carries_the_question_it_answers(defs):
    """
    The design he approved (ops/ideal/bob-ahead-of-me.html) opens every block
    with a question in bold and its answer running on. The board had only the
    answer, so an investigation's four steps drew as four findings — the owner,
    2026-09-19: *"still some widgets not page"*.
    """
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "subject": "Rockwell",
          "question": "Fewer  visits,\n or smaller baskets?",
          "claim": "Smaller baskets"}], defs)
    assert rejected == []
    assert accepted[0]["question"] == "Fewer visits, or smaller baskets?"
    assert accepted[0]["claim"] == "Smaller baskets"


def test_a_question_with_a_digit_in_it_is_refused(defs):
    """
    It sits in the same line, over the same figure, as the claim — so a digit
    here is the same defect: a number with no receipt, stated above one that
    has. Held by the same rule and refused for the same reason.
    """
    _, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "question": "Is Rockwell down 9 percent?"}], defs)
    assert "carries no digits" in rejected[0]["reason"]


def test_a_board_that_asks_nothing_is_unchanged(defs):
    """
    The field is optional and its absence is the page as it was drawn before
    it existed — every board composed until today, and every default.
    """
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead",
          "subject": "Rockwell", "claim": "Rockwell is the one to look at"}], defs)
    assert rejected == []
    assert "question" not in accepted[0]


def test_every_coercion_is_named_on_the_result(defs):
    """
    Silent divergence is the thing that is not allowed. Bob has to be able
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
    did, that key is a value Bob supplied and the coercion is wrong.
    """
    allowed = set(req(defs, "composition.allowed_fields"))
    out = compose.compose(
        [{"kind": "figure", "key": "k", "seq": 0, "weight": "lead"}],
        calls=CALLS, defs=defs)
    drawn = set(out["rows"][0]) - {"op", "tool"}
    assert drawn <= allowed


# ---------------------------------------------------------------------------
# THE SHAPE THE TOOLS ACTUALLY RETURN (P2S.7, 2026-09-18)
# ---------------------------------------------------------------------------
#
# Every case above passes `filters` as a mapping, and no tool returns one:
# `meta.filters_applied` is a LIST of statements. So in production a read
# filtered to North Edsa was refused "read 0 has no row for 'North Edsa'"
# (verification/p2s6-gate-2.json, twice) while every test here passed.

STATED = [
    "t.is_cancelled = false   # metrics.yaml: filters.cancelled",
    "t.store_id IN (1: North Edsa)   # metrics.yaml: stores.active_retail",
]


def _stated_read(store="North Edsa"):
    return {0: {"tool": "get_sales", "error": None, "is_read": True, "rows": TOTAL,
                "arguments": {"group_by": [], "filters": {"store": store}},
                "filters": STATED}}


def test_a_subject_the_tools_statement_names_back_is_the_reads_scope(defs):
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "ne-week", "seq": 0, "subject": "North Edsa"}],
        defs, calls=_stated_read())
    assert rejected == []
    assert accepted[0]["subject"] == "North Edsa"


def test_an_argument_the_tool_did_not_state_back_is_not_scope(defs):
    """The argument proposes and the receipt confirms: a store the statement
    does not name is not what the read was about."""
    accepted, rejected, _ = run(
        [{"kind": "figure", "key": "x", "seq": 0, "subject": "Rockwell"}],
        defs, calls=_stated_read(store="Rockwell"))
    assert accepted == [] and "no row for 'Rockwell'" in rejected[0]["reason"]


def test_a_one_row_read_takes_its_caption_from_the_confirmed_argument(defs):
    accepted, rejected, coerced = run(
        [{"kind": "figure", "key": "ne", "seq": 0}], defs, calls=_stated_read())
    assert rejected == [] and accepted[0]["subject"] == "North Edsa"


# ---------------------------------------------------------------------------
# 7. WHAT A POINT HANGS OFF (P2S.8) — settled after the list, never refused
#
# `under` is the only field whose truth depends on the WHOLE composition: it
# names another block, which may arrive later in the same list. So it is
# resolved in a second pass, and every way of getting it wrong drops it and
# leaves the block standing on its own — which is the board exactly as it was
# drawn before the field existed. A layout hint that did not land must never
# cost a round trip; that is P1.a's whole finding, applied to a new field.
# ---------------------------------------------------------------------------


def _two(extra=None):
    """A lead and a second block that may name it."""
    return [{"kind": "ranked", "key": "shops", "seq": 1, "weight": "lead"},
            {"kind": "figure", "key": "total", "seq": 0, "subject": "Rockwell",
             **(extra or {})}]


def test_a_block_that_names_another_is_gathered_under_it(defs):
    accepted, rejected, _ = run(_two({"under": "shops"}), defs)
    assert rejected == []
    assert accepted[1]["under"] == "shops"


def test_naming_what_it_is_under_is_enough_to_say_it_is_evidence(defs):
    """
    SAID ONCE, NOT THREE TIMES (composition.relation.default).

    `weight: supporting` + `under: <the lead>` + `relation: evidence` states
    the same thing three ways in the common case. The default is what keeps
    the frequent case one field.
    """
    accepted, _, _ = run(_two({"under": "shops"}), defs)
    assert accepted[1]["relation"] == req(defs, "composition.relation.default")


def test_a_point_may_cut_the_other_way(defs):
    accepted, rejected, _ = run(_two({"under": "shops", "relation": "counter"}), defs)
    assert rejected == [] and accepted[1]["relation"] == "counter"


def test_the_relation_words_are_the_definitions(defs):
    """Not a list in this file, and none of them a causal claim."""
    values = list(req(defs, "composition.relation.values"))
    assert values == ["evidence", "counter", "scale"]
    assert "because" not in values, "a cause belongs in his prose, not in an enum"


def test_an_under_naming_nothing_leaves_the_block_standing_on_its_own(defs):
    accepted, rejected, coerced = run(_two({"under": "nowhere"}), defs)
    assert rejected == [], "a layout hint that did not land costs no round trip"
    assert "under" not in accepted[1]
    assert any("not a block of this composition" in c for c in coerced)


def test_a_block_may_not_hang_off_itself(defs):
    accepted, rejected, coerced = run(_two({"under": "total"}), defs)
    assert rejected == [] and "under" not in accepted[1]
    assert any("'total'" in c for c in coerced)


def test_evidence_hangs_off_a_point_and_not_off_other_evidence(defs):
    """
    ONE LEVEL. A tree of evidence is an outline, and an outline is a report —
    it is also a nested grid, which would break the one-grid invariant the
    room depends on to keep a figure from remounting.
    """
    accepted, rejected, coerced = run(
        [{"kind": "ranked", "key": "a", "seq": 1, "weight": "lead"},
         {"kind": "figure", "key": "b", "seq": 0, "subject": "Rockwell", "under": "a"},
         {"kind": "figure", "key": "c", "seq": 2, "under": "b"}], defs)
    assert rejected == []
    by = {b["key"]: b for b in accepted}
    assert by["b"]["under"] == "a", "the first level stands"
    assert "under" not in by["c"], "the second does not"
    assert any("not off other evidence" in x for x in coerced)


def test_a_cycle_leaves_both_standing_on_their_own(defs):
    """Falls out of the one-level rule: each target is itself hung."""
    accepted, rejected, _ = run(
        [{"kind": "ranked", "key": "a", "seq": 1, "weight": "lead", "under": "b"},
         {"kind": "figure", "key": "b", "seq": 0, "subject": "Rockwell", "under": "a"}],
        defs)
    assert rejected == []
    assert all("under" not in b for b in accepted)


def test_a_relation_with_nothing_to_relate_to_is_dropped(defs):
    accepted, rejected, coerced = run(_two({"relation": "counter"}), defs)
    assert rejected == [] and "relation" not in accepted[1]
    assert any("none was named" in c for c in coerced)


def test_an_empty_under_detaches_a_block_the_board_still_carries(defs):
    """
    THE ONLY WAY TO CLEAR IT. `board.carried()` copies every field an edit
    sets and nothing removes one, so without a detach a block that was ever
    gathered could never stand alone again without being dropped and re-put.
    """
    accepted, rejected, _ = run(_two({"under": ""}), defs)
    assert rejected == []
    assert accepted[1]["under"] == "" and "relation" not in accepted[1]


def test_a_composition_that_says_nothing_carries_nothing(defs):
    """The fallback is the default: no field, no gathering, today's board."""
    accepted, rejected, _ = run(_two(), defs)
    assert rejected == []
    assert all("under" not in b and "relation" not in b for b in accepted)


# ---------------------------------------------------------------------------
# The arrangement (P3.p, 2026-09-20): he lays the right-hand side out himself
# ---------------------------------------------------------------------------
#
# The owner, of the shipped board and of four template variants drawn for him
# the same day: *"i dont [want] it to just be text chart here this and heres
# that, i want it to use that space like its designing its own page or artifact
# for its answer … in that space its its playground."*
#
# It is the only one of `compose`'s four statements that cannot touch a figure,
# so it is coerced to the last and NEVER refuses the composition: a layout that
# cannot be understood is dropped and the blocks stand, packed as before.

def _arranged(arrangement, defs, blocks=None):
    calls = {0: {"seq": 0, "tool": "get_sales", "is_read": True,
                 "result": {"rows": [{"store": "OPUS", "value": 1}], "meta": {}}},
             1: {"seq": 1, "tool": "get_sales", "is_read": True,
                 "result": {"rows": [{"store": "Greenhills", "value": 2}], "meta": {}}}}
    out = compose.compose(blocks or [
        {"kind": "figure", "key": "a", "seq": 0, "weight": "lead", "claim": "one"},
        {"kind": "figure", "key": "b", "seq": 1, "weight": "supporting", "claim": "two"},
    ], None, None, arrangement, calls=calls, defs=defs)
    return out["meta"]["arrangement"], out["meta"]["coerced"], out["rows"]


def test_he_lays_the_space_out_and_it_comes_back_as_a_tree(defs):
    tree, _, rows = _arranged(
        {"layout": "stack", "children": [
            {"block": "a"},
            {"say": "and the two below take it apart"},
            {"layout": "row", "children": [{"block": "b"}]},
        ]}, defs)
    assert tree["layout"] == "stack"
    assert [c.get("block") or c.get("say") or c["layout"] for c in tree["children"]] == [
        "a", "and the two below take it apart", "row"]
    # The blocks themselves are untouched by it: an arrangement is presentation.
    assert [r["key"] for r in rows] == ["a", "b"]


def test_a_line_on_the_page_carries_no_digits(defs):
    # It sits in the same space as the figures, so it is held to the claim's
    # rule — and the LINE is dropped, never the arrangement and never the board.
    tree, coerced, rows = _arranged(
        {"layout": "stack", "children": [{"say": "down 15 percent"}, {"block": "a"}]}, defs)
    assert tree["children"] == [{"block": "a"}]
    assert any("carries no digits" in c for c in coerced)
    assert len(rows) == 2


def test_a_block_he_did_not_place_is_named_rather_than_lost(defs):
    tree, coerced, rows = _arranged({"layout": "stack", "children": [{"block": "a"}]}, defs)
    assert tree["children"] == [{"block": "a"}]
    assert any("'b'" in c and "not placed" in c for c in coerced)
    # It is still a block of the composition; the room draws it after the tree.
    assert [r["key"] for r in rows] == ["a", "b"]


def test_a_key_placed_twice_is_placed_once(defs):
    # One read is one object (board.readIdentity); twice would be the same
    # figure under two headings, which is the widget disease with extra steps.
    tree, coerced, _ = _arranged(
        {"layout": "row", "children": [{"block": "a"}, {"block": "a"}]}, defs)
    assert tree["children"] == [{"block": "a"}]
    assert any("already placed" in c for c in coerced)


def test_an_unusable_arrangement_drops_and_the_board_stands(defs):
    tree, _, rows = _arranged({"layout": "spiral", "children": [{"block": "a"}]}, defs)
    assert tree is None
    assert [r["key"] for r in rows] == ["a", "b"]


def test_no_arrangement_is_the_packing(defs):
    tree, coerced, rows = _arranged(None, defs)
    assert tree is None
    assert not [c for c in coerced if "arrangement" in c]
    assert len(rows) == 2


# ---------------------------------------------------------------------------
# A pointed annotation (composition.span, P6.a, 2026-09-20)
# ---------------------------------------------------------------------------

def _series(defs, span, thought="two weeks under last month"):
    calls = {0: {"seq": 0, "tool": "get_sales", "is_read": True,
                 "result": {"rows": [{"day": "2026-09-01", "value": 1, "baseline": 2},
                                     {"day": "2026-09-02", "value": 2, "baseline": 2},
                                     {"day": "2026-09-03", "value": 3, "baseline": 2}],
                            "meta": {}},
                 "rows": [{"day": "2026-09-01", "value": 1, "baseline": 2},
                          {"day": "2026-09-02", "value": 2, "baseline": 2},
                          {"day": "2026-09-03", "value": 3, "baseline": 2}]}}
    block = {"kind": "line", "key": "d", "seq": 0, "weight": "lead", "claim": "the hole"}
    if span is not None:
        block["span"] = span
    if thought:
        block["thought"] = thought
    out = compose.compose([block], None, None, calls=calls, defs=defs)
    return out["rows"], out["meta"]["coerced"]


def test_a_span_names_two_rows_of_the_read_and_stands(defs):
    rows, coerced = _series(defs, ["2026-09-01", "2026-09-02"])
    assert rows[0]["span"] == ["2026-09-01", "2026-09-02"]
    assert not [c for c in coerced if "span" in c]


def test_a_span_naming_a_row_the_read_does_not_hold_is_dropped_not_refused(defs):
    # Presentation cannot change a value, so it never costs a round trip.
    rows, coerced = _series(defs, ["2026-09-01", "2026-10-09"])
    assert "span" not in rows[0]
    assert any("span" in c and "left off" in c for c in coerced)
    assert rows[0]["claim"] == "the hole"


def test_a_span_with_nothing_to_point_with_is_dropped(defs):
    rows, coerced = _series(defs, ["2026-09-01", "2026-09-02"], thought=None)
    assert "span" not in rows[0]
    assert any("span" in c for c in coerced)


# The plan is a part of the page (P6.h, 2026-09-21)

def test_the_plan_is_placed_once_where_he_puts_it(defs):
    tree, coerced, _ = _arranged(
        {"layout": "stack", "children": [{"block": "a"}, {"next": True}, {"block": "b"}]}, defs)
    assert [c.get("block") or ("next" if c.get("next") else None) for c in tree["children"]] == ["a", "next", "b"]
    assert not [c for c in coerced if "plan" in c]


def test_a_second_plan_is_left_out_and_said(defs):
    tree, coerced, _ = _arranged(
        {"layout": "stack", "children": [{"next": True}, {"block": "a"}, {"next": True}]}, defs)
    assert sum(1 for c in tree["children"] if c.get("next")) == 1
    assert any("plan is already placed" in c for c in coerced)


# ---------------------------------------------------------------------------
# The page is a document (P7, 2026-09-21)
#
# The owner: "i want it like an artifact claude can make ... it feels like it
# has to fit the stuff in columns and rows or a grid but an artifact/page isnt
# like that." So the arrangement grew the parts of a page: a lede, heads,
# paragraphs with the figure INSIDE the sentence — by reference, never a digit
# — figures set beside their words, a margin note, tabs, a control on a figure.
# ---------------------------------------------------------------------------

def _doc(arrangement, defs, blocks=None):
    week = [{"value": 1621528.27, "baseline": 1698059.65, "change_pct": -4.5, "direction": "down"}]
    shops = [{"store": "OPUS", "value": 1, "baseline": 2}, {"store": "Greenhills", "value": 2, "baseline": 3}]
    # As the loop hands them over: the rows on the call, and on its result.
    calls = {0: {"seq": 0, "tool": "get_sales", "is_read": True, "rows": week,
                 "result": {"rows": week, "meta": {}}},
             1: {"seq": 1, "tool": "get_sales", "is_read": True, "rows": shops,
                 "result": {"rows": shops, "meta": {}}}}
    out = compose.compose(blocks or [
        {"kind": "figure", "key": "net", "seq": 0, "weight": "lead", "claim": "the week"},
        {"kind": "dumbbell", "key": "shops", "seq": 1, "weight": "supporting", "claim": "the shops"},
    ], None, None, arrangement, calls=calls, defs=defs)
    return out["meta"]["arrangement"], out["meta"]["coerced"]


def test_a_figure_sits_inside_the_sentence_by_reference(defs):
    tree, coerced = _doc({"layout": "stack", "children": [
        {"lede": "We took {net} last week, {net.change} on the week before; it was {net.was}."},
        {"block": "shops"}]}, defs)
    assert tree["children"][0] == {
        "lede": "We took {net} last week, {net.change} on the week before; it was {net.was}."}
    # Pointed at from a sentence, it is placed: it is not drawn again after the page.
    assert not [c for c in coerced if "not placed" in c]


def test_a_digit_of_his_own_still_drops_the_line(defs):
    tree, coerced = _doc({"layout": "stack", "children": [
        {"say": "We took 1,621,528 last week."}, {"block": "net"}, {"block": "shops"}]}, defs)
    assert [list(c)[0] for c in tree["children"]] == ["block", "block"]
    assert any("carries no digits" in c and "{key}" in c for c in coerced)


def test_a_reference_names_a_figure_block_or_the_line_goes(defs):
    tree, coerced = _doc({"layout": "stack", "children": [
        {"say": "The shops: {shops}."}, {"say": "And {nothing}."}, {"say": "Or {net.rank}."},
        {"block": "net"}, {"block": "shops"}]}, defs)
    assert [list(c)[0] for c in tree["children"]] == ["block", "block"]
    assert sum("names no `figure` block" in c for c in coerced) == 2
    assert any("is not a part of a figure" in c for c in coerced)


def test_the_parts_of_a_page_come_back_as_he_wrote_them(defs):
    tree, coerced = _doc({"layout": "stack", "children": [
        {"lede": "Down on the week: {net}."},
        {"head": "Three shops carry it"},
        {"block": "shops", "beside": True, "size": "medium"},
        {"say": "Greenhills gave back the most."},
        {"note": "The stock side cannot be trusted as read.", "label": "how far to trust it"},
        {"next": True}]}, defs)
    assert [list(c)[0] for c in tree["children"]] == ["lede", "head", "block", "say", "note", "next"]
    assert tree["children"][2] == {"block": "shops", "beside": True, "size": "medium"}
    assert tree["children"][4]["label"] == "how far to trust it"
    # Nothing about the PAGE was adjusted (a figure taking its one row's name is the block's).
    assert not [c for c in coerced if c.startswith("arrangement")]


def test_a_size_that_is_not_one_is_left_to_the_page(defs):
    tree, coerced = _doc({"layout": "stack", "children": [
        {"block": "shops", "size": "enormous"}, {"block": "net"}]}, defs)
    assert tree["children"][0] == {"block": "shops"}
    assert any("is not a size" in c for c in coerced)


def test_a_second_lede_is_a_paragraph(defs):
    tree, _ = _doc({"layout": "stack", "children": [
        {"lede": "Down on the week."}, {"lede": "And again."}, {"block": "net"}, {"block": "shops"}]}, defs)
    assert [list(c)[0] for c in tree["children"]][:2] == ["lede", "say"]


def test_tabs_take_a_label_for_each_view_or_become_a_stack(defs):
    good, _ = _doc({"layout": "tabs", "labels": ["the estate", "the shops"],
                    "children": [{"block": "net"}, {"block": "shops"}]}, defs)
    assert good["layout"] == "tabs" and good["labels"] == ["the estate", "the shops"]
    bad, coerced = _doc({"layout": "tabs", "labels": ["only one"],
                         "children": [{"block": "net"}, {"block": "shops"}]}, defs)
    assert bad["layout"] == "stack" and "labels" not in bad
    assert any("tabs take" in c for c in coerced)


def test_a_control_rides_on_the_figure_it_drives(defs):
    blocks = [
        {"kind": "dumbbell", "key": "shops", "seq": 1, "weight": "lead", "claim": "the shops"},
        {"kind": "control", "key": "window", "seq": 1, "argument": "date_range", "weight": "quiet"},
        {"kind": "figure", "key": "net", "seq": 0, "weight": "supporting", "claim": "the week"},
    ]
    tree, coerced = _doc({"layout": "stack", "children": [
        {"block": "shops", "control": "window"}, {"block": "net"}]}, defs, blocks)
    assert tree["children"][0] == {"block": "shops", "control": "window"}
    # Carried by the figure, the control is placed: not drawn again after the page.
    assert not [c for c in coerced if "not placed" in c]
    tree, coerced = _doc({"layout": "stack", "children": [
        {"block": "shops", "control": "net"}, {"block": "window"}]}, defs, blocks)
    assert tree["children"][0] == {"block": "shops"}
    assert any("is not a control block" in c for c in coerced)



def _many(defs, n_words, n_drawn, arrangement):
    """`n_words` figures and `n_drawn` tables, all of reads that ran, under one page."""
    week = [{"value": 1621528.27, "baseline": 1698059.65, "change_pct": -4.5, "direction": "down"}]
    shops = [{"store": "OPUS", "value": 1, "baseline": 2}, {"store": "Greenhills", "value": 2, "baseline": 3}]
    calls = {0: {"seq": 0, "tool": "get_sales", "is_read": True, "rows": week,
                 "result": {"rows": week, "meta": {}}}}
    blocks = [{"kind": "figure", "key": f"f{i}", "seq": 0, "weight": "supporting", "claim": "the week"}
              for i in range(n_words)]
    for i in range(n_drawn):
        # One read is one object, so each drawn block needs a read of its own.
        calls[i + 1] = {"seq": i + 1, "tool": "get_sales", "is_read": True, "rows": shops,
                        "arguments": {"group_by": "store", "date_range": f"w{i}"},
                        "result": {"rows": shops, "meta": {}}}
        blocks.append({"kind": "table", "key": f"t{i}", "seq": i + 1, "weight": "supporting",
                       "claim": "the shops"})
    return compose.compose(blocks, None, None, arrangement, calls=calls, defs=defs)


def test_a_figure_in_a_sentence_is_not_counted_as_a_block(defs):
    # The owner's page has eight things drawn AND a handful of figures inside
    # its sentences. Counted together the cap refused the ninth — a page Bob
    # could not write in one call. What is bounded is what is DRAWN.
    n = int(req(defs, "composition.max_blocks"))
    page = {"layout": "stack", "children": [
        {"lede": "We took {f0}{f0.change}, on {f1} tills and a basket of {f2}."},
        *[{"block": f"t{i}"} for i in range(n)]]}
    out = _many(defs, 3, n, page)
    assert len(out["rows"]) == n + 3 and out["meta"]["rejected"] == []
    # With no page naming them, the same figures are blocks, and the ninth is refused.
    out = _many(defs, 3, n, None)
    assert len(out["rows"]) == n
    assert all("not a report" in r["reason"] for r in out["meta"]["rejected"])


def test_a_figure_placed_as_a_block_counts_again(defs):
    n = int(req(defs, "composition.max_blocks"))
    page = {"layout": "stack", "children": [
        {"lede": "We took {f0}."}, {"block": "f0"}, *[{"block": f"t{i}"} for i in range(n)]]}
    out = _many(defs, 1, n, page)
    assert len(out["rows"]) == n
    assert any("not a report" in r["reason"] for r in out["meta"]["rejected"])


def test_the_figures_in_his_sentences_are_bounded_too(defs):
    cap = int(req(defs, "composition.arrangement.refs.max_in_words"))
    page = {"layout": "stack", "children": [
        {"say": " ".join(f"{{f{i}}}" for i in range(cap + 1))}]}
    out = _many(defs, cap + 1, 0, page)
    assert len(out["rows"]) == cap
    assert any("inside your sentences" in r["reason"] for r in out["meta"]["rejected"])


def test_a_heading_does_not_spend_the_prose_budget(defs):
    says = int(req(defs, "composition.arrangement.max_says"))
    heads = int(req(defs, "composition.arrangement.max_heads"))
    tree, coerced = _doc({"layout": "stack", "children": [
        *[{"head": "A section"} for _ in range(heads + 1)],
        *[{"say": "A paragraph of his."} for _ in range(says)]]}, defs)
    kinds = [next(iter(c)) for c in tree["children"]]
    assert kinds.count("head") == heads and kinds.count("say") == says
    assert any("headings on one page" in c for c in coerced)


def test_the_tool_schema_admits_the_page_the_validator_does(defs):
    # A page the validator accepts and the schema refuses never arrives.
    from agent import loop
    schema = next(t for t in loop.build_tool_schemas() if t["name"] == loop.COMPOSE_TOOL)
    assert schema["input_schema"]["properties"]["blocks"]["maxItems"] == int(
        req(defs, "composition.max_blocks")) + int(
        req(defs, "composition.arrangement.refs.max_in_words"))


def test_his_caveat_is_placed_once_where_he_puts_it(defs):
    # The owner: "still too much text on the left side". The caveat was the
    # longest thing there; placed, it is the margin note of the section it
    # qualifies and the left says only the answer.
    tree, coerced = _doc({"layout": "stack", "children": [
        {"head": "What moved on the shelf"}, {"caveat": True}, {"block": "shops"},
        {"caveat": True}]}, defs)
    assert sum(1 for c in tree["children"] if c.get("caveat")) == 1
    assert tree["children"][1] == {"caveat": True}
    assert any("caveat is already placed" in c for c in coerced)
