"""
Stock history — the definitions the tool rests on, and the refusals it owes.

NO DATABASE. Definitions, SQL templates and argument validation only; the live
behaviour is exercised separately against the real table.

WHY THIS EXISTS. inventory_snapshots is the largest table in the business and
the messiest, and three properties of it decide whether a stockout figure is
true or invented. Each is a DEFINITION in metrics.yaml rather than a decision
in the tool, and each is pinned here, because a later change that looks like a
tidy-up — reading an absent day as zero, letting a run cross a gap, summing a
column that contains -24,734,969 — would silently turn a trustworthy figure
into a plausible lie.

  1. An absent day is UNOBSERVED, never zero. The average (store, product) pair
     is absent on 26 of 188 days, so reading absence as "no stock" would invent
     more stockouts than exist.
  2. A run of days out of stock counts consecutive OBSERVED days. Five gaps in
     the file, the longest fourteen days; a run that crossed one would report a
     fortnight nobody measured.
  3. A negative quantity is a fault, not a level, and is never summed.

Verified against the real table on 2026-09-09: 200 days at one shop returns
observed_days=189 with longest_stockout_run=156. The run is shorter than the
observed days precisely BECAUSE the gaps broke it, which is rule 2 working.
"""

import pytest

from tools._common import load_defs, req
from tools import stock_history


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def hist(defs):
    return req(defs, "inventory.history")


# --------------------------------------------------------------- definitions


def test_history_is_defined_where_the_old_note_said_it_had_to_be(hist):
    """
    The note that stood here said a stockout duration needs a definition built
    on inventory_snapshots and must not be improvised in a tool. This is that
    definition, and the tool reads it rather than carrying its own.
    """
    assert req(hist, "table") == "inventory_snapshots"
    assert req(hist, "grain") == ["store_id", "product_id", "snapshot_date"]


def test_an_absent_day_is_unobserved_and_never_zero(hist):
    assert req(hist, "absent_day_means") == "unobserved"


def test_a_run_never_crosses_a_gap(hist):
    """
    The single property that keeps a stockout length honest. The file has five
    gaps, the longest fourteen days; a run allowed to span one would report a
    fortnight of stockout that was never measured.
    """
    assert req(hist, "run_spans_gaps") is False
    # The predicate must compare against the PREVIOUS CALENDAR DAY. Comparing
    # against the previous observed row instead would bridge every gap.
    assert "snapshot_date - 1" in req(hist, "run_break_sql")


def test_negative_quantities_are_a_fault_and_are_never_summed(hist):
    neg = req(hist, "negative_on_hand")
    assert req(neg, "is_a_fault") is True
    assert req(neg, "exclude_from_sums") is True
    assert req(neg, "counts_as") == "out_of_stock"
    # The notice is mandatory: a reader has to know a "stockout" here may be a
    # broken record rather than an empty shelf.
    assert req(neg, "notice_mandatory") is True


def test_coverage_is_mandatory(hist):
    """A count of days out means nothing without the days actually observed."""
    assert req(hist, "coverage_mandatory") is True
    assert req(hist, "coverage_notice_kind")


def test_out_of_stock_is_defined_here_and_not_borrowed(defs, hist):
    """
    inventory.states cannot be reused: its low_stock branch keys off
    warning_stock, and inventory_snapshots has no such column. Sharing the
    predicate would silently classify every history row as unclassified.
    """
    sql = req(hist, "out_of_stock_sql")
    assert "quantity_on_hand" in sql
    assert "warning_stock" not in sql


def test_the_bound_is_on_work_not_on_calendar(hist):
    """
    A long window over one shop is cheap; the same window over the estate reads
    millions of rows and is killed by the statement timeout, which reaches the
    caller as a crash rather than an answer.
    """
    assert int(req(hist, "max_store_days")) > 0
    assert int(req(hist, "default_window_days")) <= int(req(hist, "max_window_days"))


def test_stockout_duration_is_now_supported(defs):
    assert req(defs, "inventory.stockout_duration_supported") is True


# ------------------------------------------------- the low-stock correction


def test_low_stock_still_means_the_column_it_always_meant(defs):
    """
    The 2026-09-09 correction records that shipment_plans holds populated stock
    levels. It must NOT quietly redefine low_stock to mean them: an algorithm's
    replenishment level is not a threshold the business agreed as "low", and
    redefining it here would be inventing a business rule.
    """
    assert req(defs, "inventory.low_stock_operational") is False
    elsewhere = req(defs, "inventory.low_stock_thresholds_elsewhere")
    assert req(elsewhere, "table") == "shipment_plans"
    assert req(elsewhere, "is_a_low_stock_definition") is False
    assert "min_level" in req(elsewhere, "columns")


# ------------------------------------------------------------ the templates


def test_no_caller_input_is_interpolated_into_sql():
    """
    Every template is formatted with definitions and bound-parameter names
    only. A caller-supplied store, sku or date reaches the database as a bound
    parameter, never as text in the statement.
    """
    for template in (
        stock_history._SELECT_STOCKOUTS,
        stock_history._SELECT_SERIES,
        stock_history._SELECT_COVERAGE,
    ):
        for field in ("{store}", "{sku}", "{start}", "{end}", "{days}"):
            assert field not in template


def test_every_ranking_is_done_in_sql(hist):
    """
    The model never sorts rows. Each ranking is an ORDER BY the database
    applies over the whole set before the LIMIT — and the clauses live in the
    definitions, not in the tool, so a ranking cannot be invented in code.
    """
    modes = req(hist, "rank_modes")
    assert set(modes) == {"longest_out", "still_out", "most_days_out"}
    for clause in modes.values():
        assert "DESC" in clause
        # Ranked by DAY COUNTS, never a percentage: a product observed twice
        # would otherwise outrank one observed every day.
        assert "%" not in clause


def test_the_stockout_view_carries_observed_days_beside_days_out():
    """
    They must arrive together on every row. "Out for 30 days" read without
    "observed for 30 days" is the misreading this whole module exists to
    prevent.
    """
    sql = stock_history._SELECT_STOCKOUTS
    assert "observed_days" in sql
    assert "days_out_of_stock" in sql


# ------------------------------------------------------------- the refusals


@pytest.mark.parametrize("kwargs, expect", [
    ({"view": "nonsense"}, "Unknown view"),
    ({"rank_by": "nonsense"}, "Unknown rank_by"),
    ({"view": "series"}, "needs a sku"),
    ({"days": 0}, "days must be between"),
    ({"days": 100000}, "days must be between"),
])
def test_bad_arguments_are_refused_before_any_connection(kwargs, expect):
    """
    Each of these raises during validation, so none of them opens a connection.
    A tool that raises is not a failure to work around — it is the tool
    declining to answer a question it cannot answer honestly.
    """
    with pytest.raises(ValueError) as e:
        stock_history.get_stock_history(**kwargs)
    assert expect in str(e.value)


def test_refusals_name_where_the_rule_lives():
    """A refusal a user cannot act on is an obstacle, not an answer."""
    with pytest.raises(ValueError) as e:
        stock_history.get_stock_history(view="nonsense")
    assert "metrics.yaml" in str(e.value)


# ------------------------------------------------------------- registration


def test_the_tool_is_on_the_read_surface():
    """
    TOOL_FUNCTIONS is what a pin and a workflow step may contain, so a read
    tool that is absent from it can be called in conversation and then never
    pinned — the answer would exist and be unrepeatable.
    """
    from agent.loop import TOOL_FUNCTIONS
    assert TOOL_FUNCTIONS["get_stock_history"] is stock_history.get_stock_history


def test_vending_is_not_in_this_tools_scope(defs):
    """
    AJI CMG has snapshot rows, and vending is a separate domain that must never
    be mixed with store data. Its stock is get_vending_stock's.
    """
    scope = req(defs, "inventory.scope_store_ids")
    cmg = [s["id"] for s in req(defs, "stores.warehouse") if "CMG" in s["name"].upper()]
    for bad in cmg:
        assert bad not in scope
