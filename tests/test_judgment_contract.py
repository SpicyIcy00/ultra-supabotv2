"""
Judgment — what Bob may think, held apart from what he may compute.

NO DATABASE. Definitions and the prompt section built from them.

WHY THIS EXISTS. Preventing invented figures worked, and it went one step too
far: the rules that stop Bob inventing a number were being read as stopping
him forming a view, so he would report that seven shops moved and leave the
reader to work out which one mattered. This section lets him say which one
matters — and the danger of that change is obvious, which is why the tests
below spend more effort on what is STILL FORBIDDEN than on what is now allowed.

The boundary in one line: **you may not invent a FIGURE, and you may form a
VIEW.** A view names the fact that produced it. That is the whole difference,
and if these tests ever pass while `may_not` has shrunk, the difference is gone.
"""

import pytest

from tools._common import load_defs, req
from agent import loop as bob_loop


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def j(defs):
    return req(defs, "judgment")


# ------------------------------------------------ what is STILL forbidden


def test_nothing_about_inventing_a_figure_is_softened(j):
    """
    The six prohibitions are the reason a view is safe. Each must survive, and
    each must reach the prompt verbatim — a rule relaxed silently here would
    look exactly like a rule nobody noticed.
    """
    may_not = req(j, "may_not")
    for rule in ("invent_a_figure", "invent_a_score", "invent_a_threshold",
                 "attribute_a_share", "assert_an_unevidenced_cause",
                 "rank_by_something_uncomputed"):
        assert rule in may_not, f"{rule} was dropped from judgment.may_not"
        assert may_not[rule].strip(), f"{rule} has no reason"


def test_the_composer_still_refuses_to_score_anything(defs):
    """
    THE BOUNDARY. `surface.attention` is a pure function over rows and must
    never invent an ordering the data does not carry. Judgment is about
    BOB's prose. If this test ever fails, the change leaked from the place
    where a view is a reading into the place where it would be arithmetic in
    the presentation layer.
    """
    attention = req(defs, "surface.attention")
    assert req(attention, "score") == "not_supported"
    assert req(attention, "threshold") == "not_supported"
    assert req(attention, "severity") == "not_supported"


def test_attribution_math_is_still_unsupported(defs):
    """Splitting a change between factors still has no unique answer."""
    assert req(defs, "investigation.attribution_math") == "not_supported"


# ------------------------------------------------------ what is now allowed


def test_bob_may_rank_importance_declare_nothing_and_admit_ignorance(j):
    may = req(j, "may")
    for allowed in ("rank_importance", "declare_unimportance", "declare_uncertainty",
                    "declare_ignorance", "disagree_with_the_framing", "change_his_mind"):
        assert allowed in may


def test_a_view_must_name_the_fact_behind_it(j):
    """
    The only thing standing between a view and an invention. A judgment rests
    on something a tool established and never on a score or an impression.
    """
    g = req(j, "grounding")
    assert req(g, "required") is True
    assert req(g, "ungrounded_judgment_is") == "an invention"
    assert "a score" in req(g, "never_rests_on")
    assert "an impression" in req(g, "never_rests_on")


def test_the_stances_are_a_closed_set(j):
    """
    These words are the vocabulary a persistent understanding will store, so
    they are settled here before anything keeps them. Adding one later is a
    decision; drifting into one is not.
    """
    assert set(req(j, "stances")) == {
        "needs_attention", "unremarkable", "unexplained", "not_visible", "waiting",
        # THE SIXTH, ADDED 2026-09-15 (P2.f), and it is a different KIND of
        # word from the five above it. Those describe a business situation
        # Bob read; `means` describes something a person TOLD him, and
        # there was no stance at all for that — so "we means the shops" could
        # not be kept, because `record_belief` refuses a view with no read
        # behind it and a correction has none. It is here rather than in the
        # five because it names its own ground: metrics.yaml judgment.taught.
        "means",
        # THE SEVENTH, 2026-09-18 (P2S.11): also something a person told him,
        # and the first stance that changes what is READ — it binds
        # settings.declared.left_out_categories, which the reads apply.
        "leave_out",
    }


def test_a_view_is_owed_and_not_merely_permitted(j):
    """
    P2.m, 2026-09-16. `may.rank_importance` has permitted a view since this
    section was written, and the owner still got an answer that described the
    rows: "i thought i would go in depth products per store AND WHAT I
    THINKS". Permission is not a request, so the definitions now say when one
    is OWED — and say it without widening what a view may rest on.
    """
    owed = req(j, "a_view_is_owed")
    assert owed["when"]
    assert len(req(owed, "is")) >= 3
    assert "a restatement of the rows" in req(owed, "is_not")
    # NOTHING IS RELAXED. A view is owed more often; it is held to the same
    # ground and the same prohibitions.
    assert req(j, "grounding.required") is True
    assert "a score" in req(owed, "is_not")
    assert "invent_a_figure" in req(j, "may_not")


def test_the_prompt_asks_for_the_view_rather_than_permitting_it(j):
    owed = req(j, "a_view_is_owed")
    section = bob_loop.JUDGMENT_SECTION
    assert "A VIEW IS OWED" in section
    assert req(owed, "when") in section
    for phrase in req(owed, "is"):
        assert phrase in section, phrase
    # And the sentence that was already there, which is not the same sentence.
    assert "you may absolutely form a VIEW" in section


def test_a_view_is_held_about_a_subject(j):
    """A view attached to a conversation dies with it; one attached to a thing does not."""
    kinds = req(j, "subject_kinds")
    for kind in ("store", "warehouse", "supplier", "estate"):
        assert kind in kinds


# ------------------------------------------------------------- the prompt


def test_the_section_is_built_from_the_definitions_not_typed():
    """
    A typed paragraph would drift from the vocabulary the rest of the system
    reads. Rebuilding it from a modified copy must change the text.
    """
    defs = load_defs()
    import copy
    altered = copy.deepcopy(defs)
    altered["judgment"]["stances"]["needs_attention"] = "SENTINEL VALUE"
    rebuilt = bob_loop._judgment_section(altered)
    assert "SENTINEL VALUE" in rebuilt
    assert "SENTINEL VALUE" not in bob_loop.JUDGMENT_SECTION


def test_the_section_is_in_the_system_prompt():
    assert bob_loop.JUDGMENT_SECTION in bob_loop.SYSTEM_PROMPT
