"""
The behavioural evals' own checks, held as code.

NO DATABASE, NO API. A check that misreads prose would pass a bad answer or
fail a good one silently, so each is pinned here against the sentences the
evals are meant to tell apart.
"""

from __future__ import annotations

from tests.evals.checks import (
    attribution_claims,
    compared_windows,
    enumeration,
    limitation_statement,
    named_driver,
    stronger_from_rows,
    internal_vocabulary,
    ungrounded_numerals,
)

ROWS = [{"tool": "get_sales", "result": {
    "rows": [{"value": 1489194.8, "baseline": 1769190.1, "change": -279995.3,
              "change_pct": -15.8, "direction": "down", "baseline_status": "ok"}],
    "meta": {"window": {"start": "2026-08-24", "end": "2026-08-31"}, "row_count": 1,
             "full_row_count": 528, "zero_total_transactions": 110},
}}]


# ---------------------------------------------------------------------------
# Numeral grounding
# ---------------------------------------------------------------------------

def test_a_returned_figure_is_grounded_however_it_is_formatted():
    answer = ("Net sales were ₱1,489,194.80 in the week to 31 Aug 2026, down 15.8% "
              "from ₱1,769,190 — a fall of ₱279,995. That is ₱1.49M against ₱1.77M.")
    assert ungrounded_numerals(answer, [r["result"] for r in ROWS]) == []


def test_an_invented_figure_is_caught():
    answer = "Net sales were ₱1,489,195, and ATP was ₱435.82, so 82% of the fall is basket."
    found = ungrounded_numerals(answer, [r["result"] for r in ROWS])
    assert [f.value for f in found] == [435.82, 82.0]


def test_dates_counts_and_years_are_excused():
    answer = ("On 2026-08-24, in 3 of 7 stores, the 24 Aug 2026 week ran to 31 August 2026; "
              "two rounds, 12 products, 528 subjects.")
    assert ungrounded_numerals(answer, [r["result"] for r in ROWS]) == []


def test_a_percentage_is_never_excused_as_a_small_count():
    assert [f.value for f in ungrounded_numerals("Down 9%.", [r["result"] for r in ROWS])] == [9.0]


def test_a_rounded_representation_is_grounded_and_a_wrong_rounding_is_not():
    assert ungrounded_numerals("down 16%", [r["result"] for r in ROWS]) == []
    assert [f.value for f in ungrounded_numerals("down 15.9%", [r["result"] for r in ROWS])] == [15.9]


# ---------------------------------------------------------------------------
# Attribution
# ---------------------------------------------------------------------------

def test_attribution_shares_are_caught_and_qualitative_readings_are_not():
    assert attribution_claims("82% of the decline came from ATP.")
    assert attribution_claims("ATP accounts for about 80% of it.")
    assert attribution_claims("Most of the decline was ATP.")
    assert attribution_claims("Transactions explain 60% of the drop.")
    assert attribution_claims(
        "Transactions were down 2%, while ATP fell 9%. That makes lower basket value "
        "the stronger measured driver of the sales decline."
    ) == []


def test_a_share_the_read_itself_stated_is_not_attribution_math():
    """
    THE GATE FAILURE THIS CLOSES (dogfood log, 2026-09-14). P1.c's `caveats`
    scenario passed every other trust check and failed here on a sentence
    quoting `get_replenishment`'s own notice — "those account for 75% of the
    units the plan requests", against a notice reading "those lines account
    for 4,764 of the 6,344 units requested, 75% of the plan". A share of a
    TOTAL the read states is a figure with a receipt; a share of a CHANGE is
    the thing that has none, and no result can excuse one.
    """
    plan = [{"rows": [], "meta": {"notice": {
        "kind": "partial_plan",
        "message": "those lines account for 4,764 of the 6,344 units requested, "
                   "75% of the plan",
    }}}]
    quoted = "Twelve lines carry it — those account for 75% of the units the plan requests."
    assert attribution_claims(quoted), "without the receipt the phrase is still caught"
    assert attribution_claims(quoted, plan) == []
    # A figure that is not the one quoted does not excuse it either.
    other = [{"rows": [{"store": "OPUS", "value": 12.0}], "meta": {}}]
    assert attribution_claims(quoted, other)
    # A share of a CHANGE is arithmetic no tool performs, so the rows cannot
    # excuse it — not even when the same numeral is a figure they returned.
    invented = [{"rows": [{"store": "OPUS", "change_pct": 82.0}], "meta": {}}]
    assert attribution_claims("82% of the decline came from ATP.", invented)
    assert attribution_claims("ATP explains 82% of it.", invented)


# ---------------------------------------------------------------------------
# Driver naming
# ---------------------------------------------------------------------------

def test_the_named_driver_is_read_from_the_conclusion():
    assert named_driver(
        "Transactions were down 2.0%, while ATP fell 9.3%. That makes lower basket "
        "value the stronger measured driver."
    ) == "atp"
    assert named_driver(
        "Sales fell 18.6% at OPUS. Transactions dropped 21.2% while ATP rose 3.2%, "
        "so traffic is the driver, not basket size."
    ) == "transactions"
    assert named_driver(
        "Transactions fell 8.0% and ATP fell 8.3%: both moved by about the same amount, "
        "so neither is the stronger driver."
    ) == "both"
    assert named_driver("Sales were up 7.8%, so there is no decline to explain.") is None


def test_the_rows_decide_what_the_stronger_driver_should_be():
    assert stronger_from_rows(-21.2, 3.2) == "transactions"
    assert stronger_from_rows(5.0, -16.4) == "atp"
    assert stronger_from_rows(-8.0, -8.3) == "both"
    assert stronger_from_rows(None, -8.3) is None


# ---------------------------------------------------------------------------
# Calls
# ---------------------------------------------------------------------------

def test_compared_windows_are_normalised_and_refusals_ignored():
    calls = [
        {"tool": "get_sales", "arguments": {"date_range": ["2026-08-24", "2026-08-31"], "compare_to": "previous_period"}},
        {"tool": "get_sales", "arguments": {"date_range": ("2026-08-24", "2026-08-31"), "compare_to": "previous_period", "metric": "transaction_count"}},
        {"tool": "get_sales", "arguments": {"date_range": "this_week", "compare_to": "previous_period"}, "error": "refused"},
        {"tool": "get_sales", "arguments": {"date_range": ["2026-08-24", "2026-08-31"]}},
    ]
    assert len(compared_windows(calls)) == 1


def test_enumeration_is_the_same_call_over_three_subjects():
    per_store = [{"tool": "get_sales", "arguments": {"metric": "net_sales", "date_range": "last_week",
                                                     "filters": {"store": s}}}
                 for s in ("Rockwell", "OPUS", "Shang")]
    assert enumeration(per_store)
    two = per_store[:2]
    assert enumeration(two) == []
    different = per_store[:1] + [{"tool": "get_sales", "arguments": {"metric": "transaction_count", "date_range": "last_week", "filters": {"store": "OPUS"}}}]
    assert enumeration(different) == []


# ---------------------------------------------------------------------------
# Limitation
# ---------------------------------------------------------------------------

def test_a_limitation_statement_is_recognised():
    assert limitation_statement(
        "Basket value fell much more than transactions. I can establish that as the "
        "main measured driver, but the current reads don't establish why basket value fell."
    )
    assert limitation_statement("A product-level comparison would be the next useful check.")
    assert limitation_statement("Customers are buying fewer premium products.") is None


def test_a_half_rounded_up_is_grounded_and_a_notice_figure_counts():
    results = [{"rows": [{"value": 172918.5, "change": -25168.5}],
                "meta": {"notice": {"message": "disagree by 12,340.00 PHP"}}}]
    assert ungrounded_numerals("₱172,919 and ₱25,169 and ₱12,340", results) == []


def test_a_contrast_names_the_driver_without_the_word():
    assert named_driver(
        "It was footfall, not basket: transactions fell 21.2% while average "
        "transaction value actually rose 3.2%."
    ) == "transactions"
    assert named_driver("Basket value, not traffic, is what moved.") == "atp"


def test_george_s_own_phrasings_from_the_first_live_run_are_read_correctly():
    """Sentences George actually wrote on 2026-09-08, which the first checks missed."""
    assert named_driver(
        "It was traffic, not baskets. Transactions fell 21.2% (874 against 1,109); average "
        "transaction value actually rose 3.2%. So fewer people came in, and the ones who did spent slightly more each."
    ) == "transactions"
    assert named_driver(
        "Both, in near-equal measure — which is the honest answer, not a dodge. Traffic fell 8.0% and "
        "basket value fell 8.3%. Those are close enough that I won't name a dominant driver."
    ) == "both"
    assert limitation_statement(
        "What this establishes: cheaper mix, concentrated in tradsnax. What it doesn't: whether "
        "customers chose down or the shelf chose for them."
    )
    assert limitation_statement("The bev row makes me want the stock snapshots before anyone concludes it was demand.")


# ---------------------------------------------------------------------------
# Internal vocabulary (prompt rule 17) — an eval check, never a production gate
# ---------------------------------------------------------------------------


def test_a_business_answer_names_nothing_internal():
    answer = (
        "Rockwell took ₱48,210 last week, down 12.1% on the week before. "
        "Basket value fell much more than transactions did, so that is where "
        "the fall sits. Two categories had nothing to compare against, because "
        "they did not trade in the earlier week."
    )
    assert internal_vocabulary(answer) == []


def test_a_tool_name_is_caught():
    assert "get_sales" in internal_vocabulary("I ran get_sales for last week.")


def test_an_argument_name_is_caught_however_it_is_written():
    # Backticked, quoted, capitalised — the same leak either way.
    assert "rank_by" in internal_vocabulary("I used `rank_by='biggest_drop'` here.")
    assert "group_by" in internal_vocabulary('Grouped with GROUP_BY = "store".')


def test_a_result_field_is_caught():
    assert "change_pct" in internal_vocabulary("change_pct is null on two rows.")
    assert "baseline_status" in internal_vocabulary("Their baseline_status was no_baseline.")


def test_a_definitions_path_is_caught():
    assert "metrics.yaml" in internal_vocabulary("The threshold lives in metrics.yaml.")
    assert "definitions/" in internal_vocabulary("See definitions/metrics.yaml for the rule.")


def test_ordinary_business_words_are_not_mistaken_for_internals():
    # "compare", "ranked", "top" and "filter" are how a person talks about this
    # work, and rule 17 asks for exactly those words. Only the identifiers are
    # forbidden.
    answer = (
        "I compared the two weeks, ranked the products by the size of the fall, "
        "and filtered to Rockwell. The top three account for most of it."
    )
    assert internal_vocabulary(answer) == []


# ---------------------------------------------------------------------------
# The voice checks (plan phase A): pure, and held here so a false reading is
# a bug and not an argument.
# ---------------------------------------------------------------------------

def test_voice_restated_sentences_match_on_digits_whatever_the_format():
    from tests.evals import voice_checks as voice
    results = [{"rows": [{"hour": 15, "value": 110876.5}], "meta": {}}]
    answer = ("It's an afternoon shop. Peaking at 3pm (₱110,876.50) with a second push at six. "
              "Thirty days stacked on one clock, so this is the shape of a day.")
    restated = voice.restated_sentences(answer, results)
    assert len(restated) == 1 and "3pm" in restated[0]
    # A figure no result holds is not a restatement (it is an ungrounded numeral,
    # which checks.py catches).
    assert voice.restated_sentences("Trade only becomes real at ₱9,999.", results) == []


def test_voice_leads_with_reading_means_no_figure_in_the_first_sentence():
    from tests.evals import voice_checks as voice
    assert voice.leads_with_reading("Rockwell is an afternoon shop — nothing before eleven. Peak ₱110,877 at three.")
    assert not voice.leads_with_reading("Net sales were ₱1,777,622 last week. Up on the week before.")
    # A correction or a caveat as the opening is still a reading.
    assert voice.leads_with_reading("I was wrong last turn — the takings can be cut by hour. Here it is.")
    # Small counts and dates are not figures.
    assert voice.leads_with_reading("All 7 shops were up on Mon 7 Sep 2026. OPUS led.")


def test_voice_paragraphs_and_offers():
    from tests.evals import voice_checks as voice
    one = "Rockwell is an afternoon shop. Thirty days on one clock. Want the same for OPUS?"
    assert voice.paragraphs(one) == 1
    assert voice.closing_offers(one) == 1
    three = "First.\n\nSecond paragraph here.\n\nShall I draft it? Or hold it? Or both?"
    assert voice.paragraphs(three) == 3
    assert voice.closing_offers(three) == 3
    assert voice.closing_offers("No question at the end. None at all.") == 0


def test_voice_findings_carry_the_budget():
    from tests.evals import voice_checks as voice
    f = voice.voice_findings("One reading here.\n\nA caveat in its own paragraph.", [], notices=1)
    assert f["paragraphs"] == 2 and f["paragraph_budget"] == 2
    assert f["leads_with_reading"] and f["closing_offers"] == 0
