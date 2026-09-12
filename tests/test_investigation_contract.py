"""
Investigation V1 — the definitions George reasons with, held to the trusted
definitions they rest on.

NO DATABASE, NO API. Definitions and pure functions only.

WHY THIS EXISTS. An investigation is reasoning behaviour inside an ordinary
conversation, and the vocabulary for it lives in metrics.yaml so the prompt
is built from definitions rather than typed. Three things in that vocabulary
could drift from what they claim to rest on, and each is pinned here:

  1. metrics.net_sales.drivers claims a relationship. It is not asserted
     there; it is the ATP formula rearranged, so the list must be exactly the
     derived metric whose numerator is net_sales plus that metric's
     denominator. A driver list that named something else would be George
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


def test_the_ladder_is_the_five_rungs_in_order():
    assert list(req(INV, "ladder")) == ["verify", "decompose", "localize", "explain", "next"]
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
    for needle in ("premise", "dominates", "unsupported", "mixed", "repeat", "cause"):
        assert needle in reasons, needle


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
