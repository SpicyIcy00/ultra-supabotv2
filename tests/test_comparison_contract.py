"""
previous_period, as arithmetic and as rows.

NO DATABASE. The window arithmetic is pure; the row assembly is pure; both
are what a live comparison stands on, so both are held here against the
definitions in metrics.yaml rather than against a copy of them.

WHY THE ARITHMETIC IS TESTED SEPARATELY FROM THE RUNNER. tools/windows.py
is the one place a preset is anchored on a day, and two callers read it:
the workflow backtest (tests/test_workflows_contract.py keeps its own
assertions) and get_sales resolving a baseline. A change that satisfied one
caller and not the other would be a definition meaning two things.
"""

from __future__ import annotations

from datetime import date

import pytest

pytest.importorskip("yaml", reason="metrics.yaml has to be read")

from tools import windows                                   # noqa: E402
from tools._common import load_defs, req                    # noqa: E402

DEFS = load_defs()
# A Thursday, matching the anchor test_workflows_contract uses.
ANCHOR = date(2026, 9, 3)


# ---------------------------------------------------------------------------
# The shared arithmetic still says what the runner's tests say it says
# ---------------------------------------------------------------------------

def test_every_preset_still_resolves_here():
    for name in req(DEFS, "sales_day.presets"):
        start, end = windows.resolve_preset(DEFS, name, ANCHOR)
        assert start < end, name


def test_the_runner_and_the_tools_read_one_function():
    pytest.importorskip("sqlalchemy")
    from app.services import workflow_runner
    assert workflow_runner._resolve_preset is windows.resolve_preset


def test_an_unknown_unit_is_refused_by_name():
    with pytest.raises(ValueError, match="Unknown window unit"):
        windows.truncate_to(ANCHOR, "fortnight")
    with pytest.raises(ValueError, match="Unknown window unit"):
        windows.shift(ANCHOR, "fortnight", 1)


# ---------------------------------------------------------------------------
# Explicit windows: the equal-length window ending where this one starts
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("start,end,expected", [
    # The example the decision was written with.
    (date(2026, 8, 24), date(2026, 8, 31), (date(2026, 8, 17), date(2026, 8, 24))),
    # One day.
    (date(2026, 9, 2), date(2026, 9, 3), (date(2026, 9, 1), date(2026, 9, 2))),
    # A calendar month by explicit dates is DAY arithmetic: 31 days back, not
    # "the month before" — the caller said dates, not a unit.
    (date(2026, 8, 1), date(2026, 9, 1), (date(2026, 7, 1), date(2026, 8, 1))),
    (date(2026, 3, 1), date(2026, 4, 1), (date(2026, 1, 29), date(2026, 3, 1))),
    # Across a year boundary.
    (date(2026, 1, 1), date(2026, 1, 8), (date(2025, 12, 25), date(2026, 1, 1))),
])
def test_previous_explicit_window(start, end, expected):
    assert windows.previous_period_explicit(start, end) == expected


def test_previous_explicit_window_is_the_same_length_and_adjacent():
    for start, end in [(date(2026, 8, 24), date(2026, 8, 31)),
                       (date(2024, 2, 1), date(2024, 3, 1))]:
        b_start, b_end = windows.previous_period_explicit(start, end)
        assert b_end == start, "the baseline ends where the current window starts"
        assert (b_end - b_start) == (end - start), "equal duration"


def test_an_inverted_explicit_window_is_refused():
    with pytest.raises(ValueError, match="half-open"):
        windows.previous_period_explicit(date(2026, 8, 31), date(2026, 8, 24))


# ---------------------------------------------------------------------------
# Presets: both windows through the preset's own calendar definition
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("preset,current,baseline", [
    ("yesterday",    ("2026-09-02", "2026-09-03"), ("2026-09-01", "2026-09-02")),
    ("last_week",    ("2026-08-24", "2026-08-31"), ("2026-08-17", "2026-08-24")),
    ("last_7_days",  ("2026-08-27", "2026-09-03"), ("2026-08-20", "2026-08-27")),
    ("last_30_days", ("2026-08-04", "2026-09-03"), ("2026-07-05", "2026-08-04")),
    # August has 31 days and July has 31; the point is that it is the CALENDAR
    # month before, however many days either has.
    ("last_month",   ("2026-08-01", "2026-09-01"), ("2026-07-01", "2026-08-01")),
])
def test_previous_preset_window(preset, current, baseline):
    cur, base = windows.previous_period_preset(DEFS, preset, ANCHOR)
    assert tuple(d.isoformat() for d in cur) == current
    assert tuple(d.isoformat() for d in base) == baseline


def test_last_month_in_march_compares_february_to_january():
    """28 days against 31 — calendar months, not a day count."""
    cur, base = windows.previous_period_preset(DEFS, "last_month", date(2026, 3, 10))
    assert cur == (date(2026, 2, 1), date(2026, 3, 1))
    assert base == (date(2026, 1, 1), date(2026, 2, 1))


def test_last_month_in_january_reaches_back_a_year():
    cur, base = windows.previous_period_preset(DEFS, "last_month", date(2026, 1, 15))
    assert cur == (date(2025, 12, 1), date(2026, 1, 1))
    assert base == (date(2025, 11, 1), date(2025, 12, 1))


def test_the_preset_current_window_is_the_backtest_window():
    """
    The window a comparison calls "current" must be the exact window a
    backtest would rebind the same preset to on the same day — one definition.
    """
    for name, p in req(DEFS, "sales_day.presets").items():
        if p.get("includes_partial_day"):
            continue
        cur, _ = windows.previous_period_preset(DEFS, name, ANCHOR)
        assert [d.isoformat() for d in cur] == windows.resolve_preset(DEFS, name, ANCHOR), name


@pytest.mark.parametrize("preset", [
    n for n, p in req(DEFS, "sales_day.presets").items() if p.get("includes_partial_day")
])
def test_a_window_in_progress_is_refused_and_names_the_closed_alternative(preset):
    """comparisons.previous_period.partial_window_policy: refuse."""
    assert req(DEFS, "comparisons.previous_period.partial_window_policy") == "refuse"
    with pytest.raises(ValueError, match="still in progress") as e:
        windows.previous_period_preset(DEFS, preset, ANCHOR)
    alt = req(DEFS, "sales_day.presets")[preset].get("closed_alternative")
    if alt:
        assert repr(alt) in str(e.value)
        assert not req(DEFS, "sales_day.presets")[alt].get("includes_partial_day"), (
            f"{preset}'s closed_alternative {alt} is itself in progress"
        )
    else:
        assert "explicit" in str(e.value)


def test_every_partial_preset_declares_a_closed_alternative_key():
    for name, p in req(DEFS, "sales_day.presets").items():
        if p.get("includes_partial_day"):
            assert "closed_alternative" in p, name


# ---------------------------------------------------------------------------
# Rows: every status, every arithmetic rule, no database
# ---------------------------------------------------------------------------

pytest.importorskip("psycopg", reason="tools.sales imports psycopg")

from tools.sales import _compare_row, _compare_rows       # noqa: E402

CDEF = req(DEFS, "comparisons.previous_period")
LABELS = ["store_id", "store"]


def row(value, store="Rockwell"):
    return {"store_id": f"id-{store}", "store": store, "value": value}


def test_an_ordinary_comparison_carries_every_declared_field():
    r = _compare_row(row(179058.50), row(215567.00), LABELS, "PHP", CDEF)
    assert set(req(DEFS, "comparisons.previous_period.row_fields")) <= set(r)
    assert r["baseline_status"] == "ok"
    assert r["change"] == -36508.50
    assert r["change_pct"] == -16.9
    assert r["direction"] == "down"
    assert r["unit"] == "PHP"
    assert r["store"] == "Rockwell"


def test_change_pct_is_rounded_as_the_definition_says():
    places = req(DEFS, "comparisons.previous_period.change_pct_decimal_places")
    r = _compare_row(row(100.0), row(30.0), LABELS, "PHP", CDEF)
    assert r["change_pct"] == round(70 / 30 * 100, places)


def test_a_count_stays_an_integer():
    r = _compare_row(row(3417), row(4105), LABELS, "transactions", CDEF)
    assert r["change"] == -688 and isinstance(r["change"], int)
    assert r["change_pct"] == -16.8


def test_no_baseline_nulls_the_change_and_the_percentage():
    r = _compare_row(row(41242.0), None, LABELS, "PHP", CDEF)
    assert r["baseline_status"] == "no_baseline"
    assert r["baseline"] is None and r["change"] is None and r["change_pct"] is None
    assert r["direction"] is None
    assert r["value"] == 41242.0, "the current figure is still reported"


def test_a_null_baseline_row_is_no_baseline_too():
    """SUM over no rows is NULL: the row exists and says nothing."""
    r = _compare_row(row(41242.0), row(None), LABELS, "PHP", CDEF)
    assert r["baseline_status"] == "no_baseline"


def test_a_zero_baseline_keeps_the_change_and_nulls_the_percentage():
    """COUNT over no rows is 0: a percentage of nothing is undefined."""
    r = _compare_row(row(93), row(0), LABELS, "transactions", CDEF)
    assert r["baseline_status"] == "zero_baseline"
    assert r["change"] == 93 and r["change_pct"] is None
    assert r["direction"] == "up"


def test_no_current_reports_the_baseline_alone():
    r = _compare_row(None, row(3527, "Rockwell"), LABELS, "transactions", CDEF)
    assert r["baseline_status"] == "no_current"
    assert r["value"] is None and r["baseline"] == 3527
    assert r["change"] is None and r["change_pct"] is None and r["direction"] is None
    assert r["store"] == "Rockwell", "labels come from the baseline row when the current is absent"


def test_no_current_wins_over_no_baseline():
    r = _compare_row(row(None), row(None), LABELS, "PHP", CDEF)
    assert r["baseline_status"] == "no_current"


def test_flat_is_explicit_not_up():
    r = _compare_row(row(100.0), row(100.0), LABELS, "PHP", CDEF)
    assert r["change"] == 0 and r["change_pct"] == 0 and r["direction"] == "flat"


def test_a_negative_baseline_neither_crashes_nor_becomes_zero():
    """change / abs(baseline): the sign follows the change, always."""
    r = _compare_row(row(-50.0), row(-100.0), LABELS, "PHP", CDEF)
    assert r["baseline_status"] == "ok"
    assert r["change"] == 50.0 and r["change_pct"] == 50.0 and r["direction"] == "up"
    r = _compare_row(row(-150.0), row(-100.0), LABELS, "PHP", CDEF)
    assert r["change"] == -50.0 and r["change_pct"] == -50.0 and r["direction"] == "down"


def test_the_statuses_are_exactly_the_ones_the_definition_names():
    seen = {
        _compare_row(row(1.0), row(2.0), LABELS, "PHP", CDEF)["baseline_status"],
        _compare_row(row(1.0), None, LABELS, "PHP", CDEF)["baseline_status"],
        _compare_row(row(1.0), row(0), LABELS, "PHP", CDEF)["baseline_status"],
        _compare_row(None, row(1.0), LABELS, "PHP", CDEF)["baseline_status"],
    }
    assert seen == set(req(DEFS, "comparisons.previous_period.baseline_statuses"))


def test_rows_match_on_the_group_key_and_keep_the_current_order():
    current = [row(425131.65, "OPUS"), row(179058.5, "Rockwell")]
    baseline = [row(215567.0, "Rockwell"), row(522471.37, "OPUS")]
    out = _compare_rows(current, baseline, ["store_id"], LABELS, "PHP", CDEF)
    assert [r["store"] for r in out] == ["OPUS", "Rockwell"]
    assert out[1]["baseline"] == 215567.0


def test_a_subject_only_in_the_baseline_is_reported_not_dropped():
    out = _compare_rows([row(1.0, "OPUS")], [row(2.0, "OPUS"), row(3.0, "Shang")],
                        ["store_id"], LABELS, "PHP", CDEF)
    assert [(r["store"], r["baseline_status"]) for r in out] == [("OPUS", "ok"), ("Shang", "no_current")]


def test_a_ranked_result_compares_only_the_ranked_subjects():
    """
    top_n cut the others from the CURRENT period; they traded. Reporting them
    as no_current would be a false statement, so they are not reported at all.
    """
    out = _compare_rows([row(1.0, "OPUS")], [row(2.0, "OPUS"), row(3.0, "Shang")],
                        ["store_id"], LABELS, "PHP", CDEF, ranked=True)
    assert [r["store"] for r in out] == ["OPUS"]


def test_a_grand_total_is_one_row_with_no_subject():
    out = _compare_rows([{"value": 10.0}], [{"value": 8.0}], [], [], "PHP", CDEF)
    assert len(out) == 1 and out[0]["change_pct"] == 25.0 and "store" not in out[0]
