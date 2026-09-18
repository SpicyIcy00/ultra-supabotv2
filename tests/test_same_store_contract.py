"""
Same-store year over year (P2S.4), as definitions and as arithmetic.

NO DATABASE. The rule that decides which shops count is a pure function of
trading dates, and the window a year back is pure calendar arithmetic; both
are held here against metrics.yaml rather than against a copy of it. The
reads themselves are in tests/golden.py, against closed windows.

WHAT THE CARD ASKED. "A store that opened mid-window is excluded BY NAME in
the receipts" and "an excluded store is never silently dropped" — so every
shop judged is either counted or excluded with its reason, never neither.
"""

from __future__ import annotations

from datetime import date

import pytest

pytest.importorskip("yaml", reason="metrics.yaml has to be read")

from tools import sales, windows                            # noqa: E402
from tools._common import load_defs, req                    # noqa: E402

DEFS = load_defs()
COMPS = req(DEFS, "comparisons")
YOY = COMPS["same_period_last_year"]

# September 2025 against September 2024 — the window where North Edsa's
# first sale on record (2024-09-02) falls inside the earlier month.
SEP_25 = (date(2025, 9, 1), date(2025, 10, 1))
SEP_24 = (date(2024, 9, 1), date(2024, 10, 1))


def _t(first, last, base=1, cur=1):
    return {"first_sale": first, "last_sale": last,
            "baseline_sales": base, "current_sales": cur}


# ---------------------------------------------------------------------------
# The definitions
# ---------------------------------------------------------------------------

def test_year_over_year_is_a_supported_comparison_now():
    assert YOY["applies_to"] == ["get_sales"]
    assert YOY["inherits"] == "previous_period"
    assert YOY["window_rule"] == "shift_back_by_years"
    assert YOY["years_back"] == 1
    assert YOY["partial_window_policy"] == "refuse"
    assert "same_period_last_year" not in COMPS["not_supported"]


def test_it_reads_through_the_same_store_rule():
    assert YOY["population"] == "same_store"
    rule = req(DEFS, "same_store")
    assert rule["rule"].strip()
    # The card: the owner confirms the wording. Until he does, it says so.
    assert rule["confirmed_by_owner"] is False
    assert rule["none_counted"] == "refuse"
    assert rule["record"]["none_recorded"] == "refuse"


def test_the_model_is_offered_it():
    pytest.importorskip("anthropic")
    from agent.loop import _enum_sources
    assert "same_period_last_year" in _enum_sources(DEFS)[("get_sales", "compare_to")]


def test_both_new_notice_kinds_are_decided_and_fingerprinted():
    decided = req(DEFS, "surface.desk.notices")
    assert "same_store_scope" in decided["explains_only"]
    assert "sales_record_silent_days" in decided["data_may_be_wrong"]
    for kind in ("same_store_scope", "sales_record_silent_days"):
        assert req(DEFS, f"notices.{kind}.must_convey")


# ---------------------------------------------------------------------------
# The window a year back
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("start,end,expected", [
    # The card's question: last December against the year before.
    (date(2025, 12, 1), date(2026, 1, 1), (date(2024, 12, 1), date(2025, 1, 1))),
    # A week keeps its dates, not its weekdays.
    (date(2026, 8, 24), date(2026, 8, 31), (date(2025, 8, 24), date(2025, 8, 31))),
    # February 2025 against all 29 days of February 2024.
    (date(2025, 2, 1), date(2025, 3, 1), (date(2024, 2, 1), date(2024, 3, 1))),
    # February 2024 against the 28 of 2023.
    (date(2024, 2, 1), date(2024, 3, 1), (date(2023, 2, 1), date(2023, 3, 1))),
    # A window STARTING on the 29th starts on the 28th.
    (date(2024, 2, 29), date(2024, 3, 1), (date(2023, 2, 28), date(2023, 3, 1))),
    # A window whose last day is the 28th still ends on the 28th — it does
    # not collapse to nothing.
    (date(2024, 2, 28), date(2024, 2, 29), (date(2023, 2, 28), date(2023, 3, 1))),
])
def test_the_same_calendar_dates_a_year_earlier(start, end, expected):
    assert windows.shifted_back_by_years(start, end, 1) == expected


def test_an_empty_window_is_refused():
    with pytest.raises(ValueError, match="must be after start"):
        windows.shifted_back_by_years(date(2025, 12, 1), date(2025, 12, 1), 1)


def test_a_window_still_in_progress_is_refused_before_any_connection():
    for preset in ("this_month", "this_year", "today", "this_week"):
        with pytest.raises(ValueError, match="still in progress"):
            sales.get_sales([], preset, compare_to="same_period_last_year")


def test_it_is_never_grouped_by_time():
    with pytest.raises(ValueError, match="lag series"):
        sales.get_sales("month", ("2025-12-01", "2026-01-01"),
                        compare_to="same_period_last_year")


# ---------------------------------------------------------------------------
# The rule: who is counted, who is left out and why
# ---------------------------------------------------------------------------

LABELS = {"rw": "Rockwell", "ne": "North Edsa", "op": "OPUS", "pina": "AJI PINA",
          "new": "Robinsons", "gap": "Gap shop", "gone": "Gone shop"}


def _split(trading, candidates=None):
    return sales._same_store_split(DEFS, candidates or list(trading), LABELS,
                                   trading, SEP_25, SEP_24)


def test_a_shop_trading_through_both_windows_is_counted():
    counted, excluded = _split({"rw": _t(date(2024, 6, 4), date(2026, 9, 18))})
    assert counted == ["rw"] and excluded == []


def test_a_shop_that_opened_inside_the_earlier_window_is_excluded_by_name():
    counted, excluded = _split({"ne": _t(date(2024, 9, 2), date(2026, 9, 17))})
    assert counted == []
    [x] = excluded
    assert x["store"] == "North Edsa"
    assert x["reason"] == "first_sale_after_start"
    assert x["first_sale_on_record"] == "2024-09-02"
    assert "2024-09-02" in x["why"] and "2024-09-01" in x["why"]


def test_a_shop_that_opened_inside_the_later_window_is_excluded_by_name():
    _, [x] = _split({"op": _t(date(2025, 9, 30), date(2026, 9, 18), base=0)})
    assert (x["store"], x["reason"]) == ("OPUS", "first_sale_after_start")
    assert "2025-09-30" in x["why"]


def test_a_shop_that_shut_is_excluded_by_its_last_sale():
    _, [x] = _split({"pina": _t(date(2024, 1, 5), date(2025, 9, 20))})
    assert x["reason"] == "last_sale_before_end"
    assert "2025-09-20" in x["why"] and "2025-09-30" in x["why"]


def test_a_shop_with_no_sale_in_a_window_is_excluded():
    _, [x] = _split({"gap": _t(date(2024, 1, 5), date(2026, 9, 1), base=0)})
    assert x["reason"] == "no_sale_in_baseline"
    _, [y] = _split({"gone": _t(date(2024, 1, 5), date(2026, 9, 1), cur=0)})
    assert y["reason"] == "no_sale_in_current"


def test_a_shop_that_never_traded_is_excluded_not_skipped():
    counted, [x] = _split({}, candidates=["new"])
    assert counted == [] and x["reason"] == "never_traded"
    assert x["store"] == "Robinsons"


def test_the_first_day_and_the_last_day_are_inside_the_rule():
    # Opened ON the first day of the earlier window, still trading on the
    # last day of the later one: counted.
    counted, _ = _split({"rw": _t(date(2024, 9, 1), date(2025, 9, 30))})
    assert counted == ["rw"]


def test_every_shop_judged_is_counted_or_excluded_never_neither():
    trading = {
        "rw": _t(date(2024, 6, 4), date(2026, 9, 18)),
        "ne": _t(date(2024, 9, 2), date(2026, 9, 17)),
        "op": _t(date(2025, 9, 30), date(2026, 9, 18), base=0),
        "pina": _t(date(2024, 1, 5), date(2025, 9, 20)),
    }
    candidates = list(trading) + ["new"]
    counted, excluded = _split(trading, candidates)
    assert sorted(counted + [x["store_id"] for x in excluded]) == sorted(candidates)
    assert not set(counted) & {x["store_id"] for x in excluded}


def test_every_reason_the_rule_can_give_is_written_in_the_definitions():
    reasons = req(DEFS, "same_store.exclusion_reasons")
    assert set(reasons) == {"first_sale_after_start", "last_sale_before_end",
                            "no_sale_in_baseline", "no_sale_in_current",
                            "never_traded"}


# ---------------------------------------------------------------------------
# The record: silent days are the record's, not a shop's
# ---------------------------------------------------------------------------

def test_the_record_counts_silent_days_per_window():
    r = sales._record_days(SEP_25, SEP_24, {"baseline": 5, "current": 30})
    assert r["baseline"] == {"start": "2024-09-01", "last_day": "2024-09-30",
                             "days": 30, "days_with_a_sale": 5, "silent_days": 25}
    assert r["current"]["silent_days"] == 0


def test_a_window_with_nothing_recorded_has_every_day_silent():
    r = sales._record_days(SEP_25, SEP_24, {"baseline": None, "current": 30})
    assert r["baseline"]["days_with_a_sale"] == 0
    assert r["baseline"]["silent_days"] == 30
