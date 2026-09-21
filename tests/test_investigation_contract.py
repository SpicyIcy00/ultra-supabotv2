"""
Investigation V1 — the definitions Bob reasons with, held to the trusted
definitions they rest on.

NO DATABASE, NO API. Definitions and pure functions only.

WHY THIS EXISTS. An investigation is reasoning behaviour inside an ordinary
conversation, and the vocabulary for it lives in metrics.yaml so the prompt
is built from definitions rather than typed. Three things in that vocabulary
could drift from what they claim to rest on, and each is pinned here:

  1. metrics.net_sales.drivers claims a relationship. It is not asserted
     there; it is the ATP formula rearranged, so the list must be exactly the
     derived metric whose numerator is net_sales plus that metric's
     denominator. A driver list that named something else would be Bob
     decomposing a figure by a relationship nobody defined.
  2. comparisons.previous_period.valid_group_by grew by product and category.
     It must never grow by a time bucket — that is the lag series the file
     records as not built.
  3. The volunteering cap now says what it does NOT count. A limitation
     statement — what the reads establish, what they do not, the next check —
     is part of the answer, and the counter must not count it, while a marked
     extra fact still is.
"""

from __future__ import annotations

import pytest

pytest.importorskip("yaml", reason="metrics.yaml has to be read")

from tools._common import load_defs, req  # noqa: E402

DEFS = load_defs()
INV = req(DEFS, "investigation")
METRICS = req(DEFS, "metrics")
COMP = req(DEFS, "comparisons.previous_period")


# ---------------------------------------------------------------------------
# The section itself
# ---------------------------------------------------------------------------

def test_the_investigation_section_executes_nothing():
    assert INV["executes_nothing"] is True
    assert INV["introduced"] == "2026-09-08"


# ---------------------------------------------------------------------------
# What opens one (P2.m, 2026-09-16)
#
# The ladder was gated on the WORD "why". "analyze tradsnax per store" asks
# for exactly this work, got one read and one thing said, and the owner said
# "i feels very limited not limitless". These hold the gate to the INTENT, and
# they hold the other half too: a lookup is still a lookup.
# ---------------------------------------------------------------------------

OPENS = req(INV, "opens_when")


def test_an_investigation_is_opened_by_an_intent_and_not_by_a_word():
    assert OPENS["executes_nothing"] is True
    assert OPENS["not_gated_on_the_word"] == "why"
    verbs = [str(v) for v in req(OPENS, "asks_to_be_taken_apart")]
    # The word it used to be gated on is one example among several, not the
    # gate: if it is the only one, nothing has changed.
    assert "why" in verbs and len(verbs) > 1
    # Four since P2S.6 (2026-09-18): anything shown that moved is investigated
    # whether or not a verb asked, so these are examples, not the gate.
    for v in ("analyze", "dig into"):
        assert v in verbs, v
    assert "asked or not" in req(OPENS, "what_is_shown_that_moved")


def test_the_kinds_that_open_one_are_kinds_a_message_can_be():
    """A kind named here and nowhere else would be vocabulary Bob cannot use."""
    declared = set(req(INV, "message_kinds.kinds"))
    assert set(req(OPENS, "message_kinds")) <= declared
    # An intent and an observation carry the request without a verb, which is
    # the half a verb list cannot cover.
    assert {"intent", "observation"} <= set(req(OPENS, "message_kinds"))


def test_a_lookup_is_still_a_lookup():
    """
    A lookup is not widened for its own sake — and since P2S.6 (2026-09-18)
    one that shows a movement is investigated like anything else shown:
    STANDARD §1 names Rockwell as the shop whose fall arrives explained.
    """
    lookup = req(OPENS, "a_lookup_is_not_one")
    assert "one subject, one metric, one window" in lookup["means"]
    assert lookup["example"]
    assert "nothing under it" in lookup["answered_with"]
    assert "unless it moved" in lookup["answered_with"]


def test_anything_shown_that_moved_is_investigated_before_it_is_shown():
    """The opening of INVESTIGATING is what is SHOWN, not what is asked (P2S.6)."""
    moved = " ".join(req(OPENS, "what_is_shown_that_moved").split())
    assert "asked or not" in moved
    assert moved in _prompt()


def test_a_focused_message_asked_to_be_taken_apart_gets_a_second_read():
    """
    BROAD has named its second read since UNDERSTAND ("and then ONE
    localization"). FOCUSED named none, so "the smallest set that completely
    answers it" was one read and Bob was inside his allowance making it.
    """
    focused = req(INV, "scope.kinds.focused")
    apart = req(focused, "taken_apart")
    assert int(apart["min_reads"]) >= 2
    # A floor, not a quota, and still under the ceiling that scope sets.
    assert int(apart["min_reads"]) <= int(focused["max_reads"])
    assert "drivers" in apart["reads"] and "dimension under the one named" in apart["reads"]
    assert "the same read again" in apart["never"]


def test_the_ladder_is_the_five_rungs_in_order():
    # CHECK joined 2026-09-18 — the owner's "checks relevant explanations".
    assert list(req(INV, "ladder")) == ["verify", "decompose", "localize", "check", "explain", "next"]
    for rung in INV["ladder"].values():
        assert rung["establishes"], rung


def test_a_false_premise_stops_the_investigation():
    assert req(INV, "ladder.verify.on_false_premise") == "stop"


def test_driver_reading_is_qualitative_with_no_threshold():
    assert INV["driver_reading"] == "qualitative"
    assert INV["attribution_math"] == "not_supported"
    assert INV["dominance_threshold"] == "none"
    assert INV["dominance_threshold_reason"].strip()


def test_stopping_reasons_include_the_ones_that_matter():
    reasons = " ".join(req(INV, "stop_when")).lower()
    for needle in ("premise", "localized", "budget", "unsupported", "mixed", "repeat", "cause"):
        assert needle in reasons, needle


def test_a_dominant_driver_is_where_localizing_starts_not_a_reason_to_stop():
    """
    P2S.6, 2026-09-18. "one driver clearly dominates" was a stopping reason,
    so "it's transactions" ended the turn before LOCALIZE could run and the
    check that says WHEN they were lost went to the owner as `next`.
    """
    assert not any("dominates" in r.lower() for r in req(INV, "stop_when"))
    assert req(INV, "ladder.localize.one_round") is True


def test_localize_reads_only_from_dimensions_a_tool_supports():
    """
    Every localize read names a get_sales grouping that some metric allows,
    and the time read is explicitly WITHOUT a comparison.
    """
    reads = req(INV, "ladder.localize.reads")
    groupings = {g for m in METRICS.values() for g in m.get("valid_group_by", [])}
    for dim in ("store", "product", "category"):
        assert dim in groupings and f"group_by='{dim}'" in reads[dim]
    assert "WITHOUT compare_to" in reads["time"]


def test_explain_keeps_four_registers_and_says_localization_is_not_cause():
    registers = req(INV, "ladder.explain.registers")
    assert list(registers) == ["fact", "derived_fact", "inference", "recommendation"]
    assert "not cause" in req(INV, "ladder.explain.causality").lower()


def test_a_compared_pin_is_verified_evidence_and_not_reread_to_investigate():
    assert req(INV, "page_evidence.compared_pin_is_verified") is True
    assert req(INV, "page_evidence.reread_compared_pin") == "never_merely_to_investigate"


# ---------------------------------------------------------------------------
# 1. Drivers rest on the ATP formula, not on an assertion
# ---------------------------------------------------------------------------

def _metrics_with_drivers() -> list[tuple[str, dict]]:
    return [(name, m) for name, m in METRICS.items() if "drivers" in m]


def test_net_sales_is_the_only_metric_with_drivers_in_v1():
    assert [n for n, _ in _metrics_with_drivers()] == ["net_sales"]


@pytest.mark.parametrize("name,mdef", _metrics_with_drivers(), ids=[n for n, _ in _metrics_with_drivers()])
def test_drivers_are_exactly_the_derived_metric_and_its_denominator(name, mdef):
    """
    The relationship is the derived metric's formula rearranged. Exactly one
    driver is a derived ratio whose numerator is THIS metric; the other is
    that ratio's denominator; nothing else.
    """
    d = mdef["drivers"]
    comps = list(d["components"])
    assert len(comps) == 2, comps
    derived = [c for c in comps if METRICS[c]["kind"] == "derived"]
    assert len(derived) == 1, f"exactly one derived driver, got {derived}"
    ratio = METRICS[derived[0]]
    formula = req(ratio, "formula")
    assert formula["operation"] == "ratio"
    assert formula["numerator"] == name, "the derived driver must be a ratio OF this metric"
    other = [c for c in comps if c != derived[0]][0]
    assert other == formula["denominator"], "the other driver must be the ratio's denominator"
    assert d["derived_via"] == derived[0]
    assert d["relation"] == "product"


@pytest.mark.parametrize("name,mdef", _metrics_with_drivers(), ids=[n for n, _ in _metrics_with_drivers()])
def test_drivers_exist_in_the_same_domain_and_are_comparable(name, mdef):
    for c in mdef["drivers"]["components"]:
        assert c in METRICS, c
        assert METRICS[c]["domain"] == mdef["domain"]
        # A driver is read with the same compare_to as the primary fact, so
        # it must be a get_sales metric and grouping by store must be legal
        # for it (the store-localize rung).
        assert "store" in METRICS[c]["valid_group_by"]


@pytest.mark.parametrize("name,mdef", _metrics_with_drivers(), ids=[n for n, _ in _metrics_with_drivers()])
def test_driver_reading_is_qualitative_and_attribution_is_not_supported(name, mdef):
    d = mdef["drivers"]
    assert d["reading"] == "qualitative"
    assert d["attribution_math"] == "not_supported"
    assert d["attribution_reason"].strip()
    assert d["introduced"] == "2026-09-08"


# ---------------------------------------------------------------------------
# 2. Subjects may be compared; time buckets may not
# ---------------------------------------------------------------------------

def test_comparison_grouping_is_by_subject_and_never_by_time_bucket():
    allowed = list(req(COMP, "valid_group_by"))
    assert allowed == ["store", "product", "category"]
    buckets = set(req(DEFS, "sales_day.buckets"))
    assert not (buckets & set(allowed)), "a time bucket beside a comparison is a lag series"
    assert "per_bucket_lag" in req(DEFS, "comparisons.not_supported")


def test_a_transaction_grain_metric_still_cannot_be_compared_by_product():
    """The comparison's list widened; the metric's own list did not."""
    for name in ("net_sales", "average_transaction_value"):
        assert "product" not in METRICS[name]["valid_group_by"], name
        assert "category" not in METRICS[name]["valid_group_by"], name


def test_the_product_level_measures_can_be_compared_by_product():
    for name in ("product_revenue", "units_sold"):
        assert {"product", "category"} <= set(METRICS[name]["valid_group_by"]), name


def test_rank_by_modes_are_exactly_the_three_and_default_to_value():
    rb = req(COMP, "rank_by")
    assert list(rb["modes"]) == ["value", "biggest_drop", "biggest_gain"]
    assert rb["default"] == "value"
    assert rb["requires_compare_to"] is True
    assert rb["whole_set_required"] is True
    assert int(rb["not_ranked_max_named"]) > 0
    assert int(req(COMP, "incomplete_notice_max_named")) > 0


def test_change_rankings_say_which_statuses_participate_and_which_do_not():
    modes = req(COMP, "rank_by.modes")
    for mode in ("biggest_drop", "biggest_gain"):
        assert "ok" in modes[mode]["participates"]
        assert "zero_baseline" in modes[mode]["participates"]
        assert "no_current" in modes[mode]["not_ranked"]
        assert "no_baseline" in modes[mode]["not_ranked"]
        assert "nulls never ranked" in modes[mode]["order"]
    assert "change_pct" not in modes["biggest_drop"]["order"]
    assert "change_pct" not in modes["biggest_gain"]["order"]


# ---------------------------------------------------------------------------
# 3. The volunteering cap does not count a limitation statement
# ---------------------------------------------------------------------------

LIMITATION = (
    "These reads establish that ATP is the stronger measured driver, but not "
    "why ATP fell. Product-level comparison would be the next useful check."
)


def test_the_cap_declares_what_it_does_not_count():
    nc = req(DEFS, "volunteering.not_counted")
    assert nc["is_part_of_answer"] is True
    assert "next check" in nc["analytical_limitation"]
    assert req(INV, "limitation_statement_is_answer") is True


def test_a_limitation_statement_is_not_counted_and_a_marked_fact_still_is():
    pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
    pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
    from agent.loop import _volunteered

    assert _volunteered(LIMITATION, DEFS) == []
    marked = LIMITATION + " Worth knowing: 14 POs are open against that SKU."
    assert _volunteered(marked, DEFS) == ["Worth knowing"]


def test_no_marker_is_a_phrase_a_limitation_statement_would_naturally_use():
    """
    The distinction is what a sentence DOES, not a reserved phrase — so no
    marker may be a word a limitation statement reaches for.
    """
    markers = [m.lower() for m in req(DEFS, "volunteering.markers")]
    for phrase in ("establish", "next check", "cannot", "would be the next", "don't establish"):
        assert not any(phrase in m for m in markers), phrase


# ---------------------------------------------------------------------------
# 4. The prompt is built from these definitions, and says what they say
# ---------------------------------------------------------------------------

def _prompt() -> str:
    pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
    pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
    from agent.loop import SYSTEM_PROMPT
    return SYSTEM_PROMPT


def test_the_drivers_sentence_comes_from_the_yaml_not_from_typing():
    from agent.loop import _drivers_sentence
    sentence = _drivers_sentence(DEFS)
    d = METRICS["net_sales"]["drivers"]
    assert " and ".join(d["components"]) in sentence
    assert d["identity"] in sentence


def test_view_page_tells_the_model_a_compared_pin_is_verified_evidence():
    from agent.composite_tools import view_page
    assert "verified primary fact" in " ".join((view_page.__doc__ or "").split())


def test_the_get_sales_description_names_the_drivers_and_the_product_route():
    from tools.sales import get_sales
    doc = get_sales.__doc__ or ""
    assert "metrics.net_sales.drivers" in doc
    assert "rank_by='biggest_drop'" in doc
    assert "never net_sales or ATP" in doc


def test_the_prompt_no_longer_opens_the_ladder_on_the_word_why():
    """
    The defect, in one line of the prompt. It is not enough that the verbs are
    in the yaml: the sentence Bob reads has to name the intent.
    """
    prompt = _prompt()
    assert '"Why" is an investigation' not in prompt
    for v in req(OPENS, "asks_to_be_taken_apart"):
        assert f'"{v}"' in prompt, v
    assert '"why" is not the gate' in prompt


def test_the_opening_sentence_is_built_from_the_definitions_not_typed():
    import copy

    from agent.loop import _opening_sentence

    altered = copy.deepcopy(DEFS)
    altered["investigation"]["opens_when"]["asks_to_be_taken_apart"] = ["SENTINEL"]
    assert "SENTINEL" in _opening_sentence(altered)
    assert "SENTINEL" not in _prompt()


def test_the_second_read_is_taught_where_the_call_is_chosen():
    """
    On get_sales, by voice.budget's own route: a sentence that describes a
    TOOL lives on that tool. The prompt says a taken-apart message gets more
    than one read; get_sales says which read.
    """
    from agent.loop import build_tool_schemas

    desc = next(s for s in build_tool_schemas() if s["name"] == "get_sales")["description"]
    apart = req(INV, "scope.kinds.focused.taken_apart")
    assert "NOT ANSWERED BY ONE READ" in desc
    assert str(apart["min_reads"]) in desc
    assert "the metric's declared drivers in the same batch" in desc
    # The localizing call shapes moved here from INVESTIGATING with it.
    assert "rank_by='biggest_drop'" in desc and "WITHOUT compare_to" in desc


def test_the_lookup_guard_is_in_the_prompt_where_breadth_is_decided():
    prompt = _prompt()
    lookup = req(OPENS, "a_lookup_is_not_one")
    assert lookup["answered_with"] in prompt
    assert lookup["means"] in prompt
    apart = req(INV, "scope.kinds.focused.taken_apart")
    assert f"taken apart gets {apart['min_reads']}, not one" in prompt


# ---------------------------------------------------------------------------
# 5. Initiative (P2S.6, 2026-09-18): he reads without being asked, and `next`
#    is never a read he could have made
# ---------------------------------------------------------------------------

def test_the_persona_no_longer_waits():
    """
    "you tell the owner the one thing that matters, and wait" was the first
    thing the prompt said about who Bob is. The owner: "i shouldnt need to
    ask why, it has intiative".
    """
    prompt = _prompt()
    assert "and wait" not in prompt
    assert "You do the looking yourself" in prompt
    # The owner's identity, 2026-09-18: responsible for understanding the
    # business; an operator, not a reporter; nothing-concerns-me is an answer.
    assert "responsible for understanding this business" in prompt
    assert "An operator, not a reporter." in prompt
    assert "nothing here concerns me" in prompt
    assert "You read without asking and act on nothing alone" in prompt
    assert "UNDERSTANDING, NOT BREADCRUMBS" in prompt


def test_understanding_not_breadcrumbs_is_the_owners_principle_rendered():
    """
    The owner, 2026-09-18: "Bob brings me understanding, not breadcrumbs.
    I should ask follow-up questions because I want to steer, challenge,
    explore, decide or act". The prompt renders the yaml's sentence whole.
    """
    principle = " ".join(req(INV, "principle").split())
    assert principle in _prompt()
    assert "steer, challenge, decide or act" in principle


def test_explanations_the_data_can_test_are_tested_before_one_is_offered():
    """
    CHECK, 2026-09-18. The simulation that day: OPUS "fell 15.9%" against a
    week holding the 31 Aug holiday Monday, and nothing let Bob see it.
    Each explanation names a read that already exists, and the prompt says
    all of them, plus what to do with one it cannot test.
    """
    chk = req(INV, "ladder.check")
    assert set(req(chk, "explanations")) == {"estate_or_shop", "empty_shelf", "unusual_baseline"}
    prompt = _prompt()
    for text in req(chk, "explanations").values():
        assert text in prompt, text
    assert req(chk, "unchecked") in prompt
    assert req(INV, "ladder.explain.matters") in prompt
    # The baseline's own days are the ONE second window a broad read may make.
    assert "baseline's own" in req(INV, "scope.kinds.broad.never")


def test_the_morning_takes_apart_what_it_ranks_first():
    """
    The morning was "read get_attention ONCE and answer one line per thing",
    so it listed what moved with no why — STANDARD §1, unmet. The line the
    model reads is cut at the first comma, so the dig must be before it.
    """
    line = [l for l in _prompt().splitlines() if l.strip().startswith("MORNING")][0]
    assert "take apart the thing it ranks first" in line
    assert "ONCE" not in line


def test_next_is_never_a_read_he_could_have_made():
    """
    The slot was "the one thing to do or check", and the ladder filled it with
    "the one thing to check next" — so the localizing read the rule forbade
    him went to the owner as homework. Said in both places the model reads it.
    """
    from agent.compose import compose
    assert "never a read you could have made" in _prompt()
    doc = " ".join((compose.__doc__ or "").split())
    assert "never a read you could have made" in doc
    assert "never one this answer already settles" in doc
    assert "the one thing to check next" not in _prompt()


def test_the_localizing_round_is_one_round_on_the_tool_that_makes_it():
    from agent.loop import _tool_addenda
    assert "in ONE round" in _tool_addenda(DEFS)["get_sales"]


def test_the_answer_is_as_long_as_the_understanding_takes():
    """
    "One paragraph ... at most two [figures]" and "3 short sentences or fewer"
    were lengths; the owner: "don't artificially squeeze real understanding
    into one paragraph/two figures". The slots are places, not a length.
    """
    prompt = _prompt()
    assert "at most two in a paragraph" not in prompt
    assert "short sentences or fewer" not in prompt
    # "The slots are places, not a length." left the prompt on 2026-09-20
    # when the BODY gained a length (voice.body) — the slots are still
    # places, and the thing the sentence guarded against is now held by
    # the sentence that replaced it: the PAGE carries the reasoning, the
    # prose is the conclusion and never the page retold. ("the steps
    # retold" until P12, 2026-09-21, when the right of the screen stopped
    # being a stack of steps and became a page he writes.)
    assert "never the page retold" in prompt
    assert " ".join(req(DEFS, "surface.prose.words_carry").split()) in prompt


def test_the_schema_he_writes_with_says_what_the_prompt_says():
    """
    Found 2026-09-18: the prompt forbade a `next` that names a read, and the
    compose schema — read at the moment he writes — still said "the one thing
    you would do or check next … where an investigation stopped, this is where
    it says what to look at", and asked for `asks` "you could answer with a
    read or two". The schema Bob actually receives is checked, not the yaml.
    """
    import json as _json
    from agent.loop import build_tool_schemas
    compose = [t for t in build_tool_schemas() if t["name"] == "compose"][0]
    text = " ".join(_json.dumps(compose).split())
    assert "where it says what to look at" not in text
    assert "answer with a read or two" not in text
    assert "never a read you could have made" in text
    assert "steer, challenge, decide or act" in text
