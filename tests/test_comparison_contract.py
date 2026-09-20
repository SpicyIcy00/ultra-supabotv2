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


# ---------------------------------------------------------------------------
# Ranking a compared result by CHANGE (Investigation V1, 2026-09-08)
#
# The ranking happens in the tool after both windows are matched, and the
# nulls are where a ranking lies: a subject that did not trade has no change
# and must never sit at the top of "biggest drop" because None sorted first.
# ---------------------------------------------------------------------------

from tools.sales import _describe_incomplete, _rank_compared, _subject_label   # noqa: E402

RANK_MAX_NAMED = int(req(CDEF, "rank_by.not_ranked_max_named"))


def prow(name, value, baseline, sku=None):
    return _compare_row(
        {"product_id": f"id-{name}", "sku": sku or name, "product": name, "value": value}
        if value is not None else None,
        {"product_id": f"id-{name}", "sku": sku or name, "product": name, "value": baseline}
        if baseline is not None else None,
        ["product_id", "sku", "product"], "PHP", CDEF,
    )


MIXED = [
    prow("steady", 100.0, 100.0),          # ok, flat
    prow("fell", 50.0, 250.0),             # ok, -200
    prow("fell-less", 900.0, 1000.0),      # ok, -100 from a bigger base
    prow("rose", 400.0, 100.0),            # ok, +300
    prow("vanished", None, 5000.0),        # no_current — the biggest baseline of all
    prow("new", 800.0, None),              # no_baseline — the biggest value of all
    prow("from-zero", 120.0, 0),           # zero_baseline — a real gain of 120
]


def test_biggest_drop_ranks_measured_changes_only_most_negative_first():
    rows, not_ranked = _rank_compared(MIXED, "biggest_drop", None, RANK_MAX_NAMED)
    assert [r["product"] for r in rows] == ["fell", "fell-less", "steady", "from-zero", "rose"]
    assert all(r["change"] is not None for r in rows)
    assert not_ranked["ranked_subjects"] == 5


def test_biggest_gain_ranks_measured_changes_only_most_positive_first():
    rows, _ = _rank_compared(MIXED, "biggest_gain", None, RANK_MAX_NAMED)
    assert [r["product"] for r in rows] == ["rose", "from-zero", "steady", "fell-less", "fell"]


def test_a_vanished_subject_never_tops_biggest_drop_and_a_new_one_never_tops_biggest_gain():
    """The largest baseline and the largest value in the set both have a null change."""
    drops, nr = _rank_compared(MIXED, "biggest_drop", 1, RANK_MAX_NAMED)
    assert drops[0]["product"] == "fell"
    gains, _ = _rank_compared(MIXED, "biggest_gain", 1, RANK_MAX_NAMED)
    assert gains[0]["product"] == "rose"
    assert nr["counts"] == {"no_current": 1, "no_baseline": 1}
    assert nr["no_current"][0] == {"subject": "vanished (vanished)", "baseline": 5000.0, "unit": "PHP"}
    assert nr["no_baseline"][0] == {"subject": "new (new)", "value": 800.0, "unit": "PHP"}


def test_zero_baseline_participates_because_its_change_is_numeric():
    rows, _ = _rank_compared([prow("from-zero", 120.0, 0), prow("fell", 50.0, 250.0)],
                             "biggest_gain", None, RANK_MAX_NAMED)
    assert rows[0]["product"] == "from-zero" and rows[0]["change"] == 120.0
    assert rows[0]["change_pct"] is None, "still undefined; ranked by change, not by change_pct"


def test_ranking_is_by_absolute_change_never_by_change_pct():
    """PHP 40 -> 400 is +900% and irrelevant; PHP 10,000 -> 12,000 is +20% and the real gain."""
    rows, _ = _rank_compared([prow("tiny", 400.0, 40.0), prow("real", 12000.0, 10000.0)],
                             "biggest_gain", 1, RANK_MAX_NAMED)
    assert rows[0]["product"] == "real"


def test_ties_break_by_the_bigger_baseline_for_drops_and_bigger_value_for_gains():
    tied = [prow("small-base", 0.0, 100.0), prow("big-base", 900.0, 1000.0)]
    drops, _ = _rank_compared(tied, "biggest_drop", None, RANK_MAX_NAMED)
    assert [r["product"] for r in drops] == ["big-base", "small-base"]
    tied = [prow("small", 200.0, 100.0), prow("big", 1100.0, 1000.0)]
    gains, _ = _rank_compared(tied, "biggest_gain", None, RANK_MAX_NAMED)
    assert [r["product"] for r in gains] == ["big", "small"]


def test_top_n_cuts_after_ranking_and_the_not_ranked_list_is_capped_and_ordered():
    many = [prow(f"gone-{i}", None, float(i)) for i in range(RANK_MAX_NAMED + 5)]
    rows, nr = _rank_compared(many + [prow("fell", 1.0, 2.0)], "biggest_drop", 1, RANK_MAX_NAMED)
    assert [r["product"] for r in rows] == ["fell"]
    assert nr["counts"] == {"no_current": RANK_MAX_NAMED + 5}
    assert len(nr["no_current"]) == RANK_MAX_NAMED
    baselines = [x["baseline"] for x in nr["no_current"]]
    assert baselines == sorted(baselines, reverse=True), "largest baseline first"


def test_an_unknown_change_ranking_is_refused():
    with pytest.raises(ValueError, match="Unknown change ranking"):
        _rank_compared(MIXED, "change_pct", None, RANK_MAX_NAMED)


def test_the_incomplete_notice_names_a_few_per_status_and_counts_the_rest():
    described = req(CDEF, "baseline_statuses")
    gone = [prow(f"gone-{i}", None, 1.0, sku=f"g{i}") for i in range(7)]
    new = [prow("fresh", 1.0, None, sku="f1")]
    text = _describe_incomplete(gone + new, described, 5)
    assert "7 no_current" in text and "and 2 more" in text
    assert "1 no_baseline" in text and "fresh (f1)" in text
    assert text.count("gone-") == 5, "five named, two counted"


def test_subject_labels_cover_every_grouping():
    assert _subject_label({"store": "Rockwell"}) == "Rockwell"
    assert _subject_label({"category": "tradsnax"}) == "tradsnax"
    assert _subject_label({"product": "Aji Mix", "sku": "SH1"}) == "Aji Mix (SH1)"
    assert _subject_label({}) == "the total"


# ---------------------------------------------------------------------------
# Two more window rules (2026-09-12): the period so far against the same
# point last period, and a day against the same weekday last week. Each
# inherits previous_period and owns only where its windows sit.
# ---------------------------------------------------------------------------

from datetime import datetime                                # noqa: E402

SAT_AFTERNOON = datetime(2026, 9, 12, 14, 30)   # Saturday, 14:30 Manila
DAY_OFFSET = int(req(DEFS, "brief.sales_vs_same_weekday.baseline_offset_days"))


def _supported():
    comps = req(DEFS, "comparisons")
    return {k: v for k, v in comps.items()
            if k != "not_supported" and isinstance(v, dict) and "applies_to" in v}


def test_the_new_modes_inherit_and_own_only_a_window_rule():
    sup = _supported()
    for name in ("to_date_same_elapsed", "same_weekday_last_week"):
        child = sup[name]
        assert child["inherits"] == "previous_period"
        assert "window_rule" in child
        # Nothing the parent defines is typed again on the child.
        for field in ("row_fields", "baseline_statuses", "rank_by", "valid_group_by",
                      "change_pct_formula", "incomplete_notice_kind"):
            assert field not in child, f"{name} restates {field}"
    assert "to_date_same_elapsed" not in req(DEFS, "comparisons.not_supported")
    assert "full_period_extrapolation" in req(DEFS, "comparisons.not_supported")


def test_the_day_offset_is_a_reference_to_the_briefs_measured_definition():
    for name, key in (("to_date_same_elapsed", "day_baseline_offset"),
                      ("same_weekday_last_week", "offset_days")):
        ref = req(DEFS, f"comparisons.{name}.{key}")
        assert isinstance(ref, str) and ref.startswith("brief."), f"{name}: a number typed here"
        assert req(DEFS, ref) == DAY_OFFSET


def test_this_week_so_far_is_monday_to_now_against_last_monday_to_the_same_hour():
    (cs, ce), (bs, be), meta = windows.same_elapsed(DEFS, "this_week", SAT_AFTERNOON, DAY_OFFSET)
    assert (cs, ce) == (datetime(2026, 9, 7), SAT_AFTERNOON)
    assert (bs, be) == (datetime(2026, 8, 31), datetime(2026, 9, 5, 14, 30))
    assert be - bs == ce - cs, "the same elapsed portion"
    assert meta["of"] == "week" and meta["baseline_clamped"] is False
    assert meta["elapsed_fraction"] == round((ce - cs) / (datetime(2026, 9, 14) - cs), 3)
    assert meta["day_baseline_offset_days"] is None


def test_today_so_far_is_against_the_same_weekday_last_week_not_yesterday():
    (cs, ce), (bs, be), meta = windows.same_elapsed(DEFS, "today", SAT_AFTERNOON, DAY_OFFSET)
    assert (cs, ce) == (datetime(2026, 9, 12), SAT_AFTERNOON)
    assert (bs, be) == (datetime(2026, 9, 5), datetime(2026, 9, 5, 14, 30))
    assert meta["day_baseline_offset_days"] == DAY_OFFSET


def test_the_end_of_march_against_february_is_clamped_to_the_whole_of_february():
    now = datetime(2026, 3, 30, 14, 0)
    (cs, ce), (bs, be), meta = windows.same_elapsed(DEFS, "this_month", now, DAY_OFFSET)
    assert (cs, ce) == (datetime(2026, 3, 1), now)
    assert (bs, be) == (datetime(2026, 2, 1), datetime(2026, 3, 1))
    assert meta["baseline_clamped"] is True


def test_a_closed_preset_is_refused_by_name_and_sent_to_previous_period():
    with pytest.raises(ValueError, match="closed") as e:
        windows.same_elapsed(DEFS, "last_week", SAT_AFTERNOON, DAY_OFFSET)
    assert "previous_period" in str(e.value)


def test_a_period_that_has_just_begun_is_refused():
    with pytest.raises(ValueError, match="just begun"):
        windows.same_elapsed(DEFS, "this_week", datetime(2026, 9, 7, 0, 0), DAY_OFFSET)


def test_a_period_that_began_today_is_refused_and_names_the_closed_alternative():
    # 2026-09-21 00:25, a Monday: the live turn read `this_week` at the same
    # point last week — twenty-five minutes of nothing — and drew the zeros.
    assert int(req(DEFS, "comparisons.to_date_same_elapsed.min_closed_days")) >= 1
    with pytest.raises(ValueError, match="no closed day yet") as e:
        windows.same_elapsed(DEFS, "this_week", datetime(2026, 9, 21, 0, 25), DAY_OFFSET)
    assert "'last_week'" in str(e.value)
    # A day is its own hours: today at 00:25 still compares.
    (cs, ce), _, _ = windows.same_elapsed(DEFS, "today", datetime(2026, 9, 21, 0, 25), DAY_OFFSET)
    assert cs < ce


def test_every_partial_preset_has_a_same_elapsed_reading():
    for name, p in req(DEFS, "sales_day.presets").items():
        if p.get("includes_partial_day"):
            (cs, ce), (bs, be), _ = windows.same_elapsed(DEFS, name, SAT_AFTERNOON, DAY_OFFSET)
            assert cs < ce and bs < be and be - bs <= ce - cs, name


def test_same_weekday_last_week_shifts_the_whole_window_back_by_the_offset():
    start, end = date(2026, 9, 10), date(2026, 9, 11)     # one Thursday
    assert windows.shifted_back_by_days(start, end, DAY_OFFSET) == (date(2026, 9, 3), date(2026, 9, 4))
    assert date(2026, 9, 3).weekday() == start.weekday()
    with pytest.raises(ValueError, match="half-open"):
        windows.shifted_back_by_days(end, start, DAY_OFFSET)


def test_the_tool_merges_the_parent_under_the_child_and_binds_the_windows():
    """
    The ONE place a mode is looked up: nothing after it knows which mode it
    is reading. Held on the source because the merge decides every field
    below it.
    """
    import inspect
    from tools import sales
    src = inspect.getsource(sales.get_sales)
    assert 'cdef.get("inherits")' in src
    assert "cdef = {**supported[parent], **cdef}" in src
    assert "_windows.same_elapsed(" in src and "_windows.shifted_back_by_days(" in src
    assert "manila_now" in src, "the elapsed rule binds timestamps, not dates"


# ---------------------------------------------------------------------------
# A TIME BUCKET BESIDE A COMPARISON (2026-09-20)
# ---------------------------------------------------------------------------
#
# The owner, having watched a session refused mid-investigation: *"find out why
# that tool didnt work and fix it."*
#
# THE REFUSAL WAS RIGHT AND ITS REASON WAS WRONG. It said a time bucket beside a
# comparison means "each bucket against its own predecessor — a lag series". It
# does not: `compare_to` runs the same query over two windows and matches rows
# on the group key, and for a bucket that key was the DATE, which the two
# windows never share. Every row would have come back `no_baseline`. The
# refusal was covering a broken join and describing it as a design choice, and
# it made "is OPUS declining, or is the week it is measured against unusual?"
# unanswerable except by a subtraction in prose.
#
# Matched on the offset from each window's own start, the first day of one
# window meets the first day of the other — over two calendar weeks, the same
# weekday.

def test_a_time_bucket_is_matched_on_its_offset_not_its_date():
    cdef = req(DEFS, "comparisons.previous_period")
    assert set(cdef["valid_time_buckets"]) == {"day", "week", "month"}
    align = req(cdef, "time_bucket_alignment")
    assert align["key"] == "offset_from_window_start"
    assert align["requires_equal_length"] is True
    # The row carries the baseline's own date: "7 Sep against 31 Aug" is the
    # receipt, and an offset is a position nobody can look up.
    assert align["carries_baseline_bucket"] is True


def test_hour_is_still_not_comparable():
    """
    Thirty days grouped by hour is one set of twenty-four figures, not a
    series — the bucket has no position in a window to align on. It is absent
    from both lists, which is what keeps it refused.
    """
    cdef = req(DEFS, "comparisons.previous_period")
    assert "hour" not in cdef["valid_time_buckets"]
    assert "hour" not in cdef["valid_group_by"]


def test_the_lag_series_is_still_refused_and_now_says_what_it_is_not():
    """
    Day N against day N-1 INSIDE one window is still not built. What changed is
    that the definition no longer describes the aligned comparison as though it
    were this one — the conflation is what hid a real capability.
    """
    lag = req(DEFS, "comparisons.not_supported.per_bucket_lag")
    assert lag["supported"] is False
    assert lag["not_the_same_as"] == "previous_period.valid_time_buckets"


def test_the_offset_key_is_a_position_and_never_reaches_a_row():
    """
    `_offset` keys the match and is dropped: a row carries dates and figures,
    never the bookkeeping that matched it.
    """
    from datetime import datetime
    from tools import sales

    cdef = req(DEFS, "comparisons.previous_period")
    current = [{"day": "2026-09-07", "value": 10.0}, {"day": "2026-09-08", "value": 20.0}]
    baseline = [{"day": "2026-08-31", "value": 40.0}, {"day": "2026-09-01", "value": 5.0}]
    sales._offset_rows(current, "day", datetime(2026, 9, 7))
    sales._offset_rows(baseline, "day", datetime(2026, 8, 31))
    assert [r["_offset"] for r in current] == [0, 1]

    out = sales._compare_rows(current, baseline, ["_offset"], ["day"], "PHP", cdef,
                              bucket="day")
    assert all("_offset" not in r for r in out)
    # Monday met Monday, and each row says which day it was measured against.
    assert [(r["day"], r["baseline_day"], r["change"]) for r in out] == [
        ("2026-09-07", "2026-08-31", -30.0), ("2026-09-08", "2026-09-01", 15.0)]


def test_the_offset_is_counted_in_buckets_not_in_days():
    """
    FOUND THE FIRST TIME THE FIXED TOOL WAS USED IN ANGER (2026-09-20), on
    `last_30_days` grouped by week: 10 of 10 rows came back uncomparable — the
    exact failure the fix existed to remove.

    A bucket's date is truncated to its own boundary (a week to its Monday), so
    the number of DAYS between that truncated date and an arbitrary window
    start depends on where inside its bucket the window began. Two windows of
    the same length starting on different weekdays then give different
    day-offsets for the same position, and nothing matches. Counted in BUCKETS
    it lines up, which is what the alignment always meant.
    """
    from datetime import date as D
    from tools.sales import _bucket_index

    # A window that starts mid-week, and the week bucket it starts inside.
    assert _bucket_index("week", D(2026, 8, 17), D(2026, 8, 21)) == 0
    assert _bucket_index("week", D(2026, 8, 24), D(2026, 8, 21)) == 1
    # The baseline window starts on a different weekday, and its first bucket
    # is still bucket zero — which is the whole point.
    assert _bucket_index("week", D(2026, 7, 20), D(2026, 7, 22)) == 0
    assert _bucket_index("week", D(2026, 7, 27), D(2026, 7, 22)) == 1

    # Days are their own buckets, and months count in months.
    assert _bucket_index("day", D(2026, 9, 8), D(2026, 9, 7)) == 1
    assert _bucket_index("month", D(2026, 1, 1), D(2025, 11, 14)) == 2
