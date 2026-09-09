"""
Purchase planning — the definitions the draft rests on, and the caveats it owes.

NO DATABASE. Definitions, SQL templates and argument validation only.

WHY THIS EXISTS. This tool replaces a chore: export sales from StoreHub, look
at them per supplier, order enough to last. Somebody acts on what it produces,
so the ways it could quietly be wrong all cost real money:

  1. WHO SUPPLIES A PRODUCT IS INFERRED, NOT DECLARED. Only 456 of the 1,130
     products that sold in the last 90 days can be traced to any supplier at
     all. A plan that omitted the rest in silence would read as a complete
     order for that supplier.
  2. THE COVER PERIOD IS A JUDGEMENT. Confirmed with the business 2026-09-09:
     there is no rule, it is decided each time. Inventing a default would be
     inventing a business rule and spending money on it.
  3. A NEGATIVE ON HAND IS NOT A DEFICIT. shipment_plans sizes against the raw
     figure and 62% of the units in its latest run come from broken readings —
     one line reads -174,877. This tool must never repeat that.
  4. A RATE MEASURED WHILE A PRODUCT WAS UNAVAILABLE UNDERSTATES DEMAND, and
     correcting it upward would be inventing a sale. It is flagged, never
     adjusted.

Verified live 2026-09-09: Seikyo SEK001's plan covers 50 products, and Aji
Assorted JP candy sold 1,459 units in 90 days while having nothing on the shelf
anywhere on all 90 of them.
"""

import pytest

from tools._common import load_defs, req
from tools import purchase_plan


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def plan(defs):
    return req(defs, "purchasing.plan")


# --------------------------------------------------------------- definitions


def test_the_supplier_link_is_inferred_and_says_so(plan):
    link = req(plan, "supplier_link")
    assert req(link, "is_declared") is False
    assert "purchase_orders.supplier_name" in req(link, "derived_from")
    # The coverage notice is mandatory: a partial plan that looks complete is
    # the failure mode that costs money.
    assert req(link, "coverage_notice_mandatory") is True


def test_a_cover_period_is_never_invented(plan):
    """
    There is no business rule for how long an order should last, so the tool
    has none. Without one it reports the picture; with one it suggests
    quantities. A default here would be a business rule nobody agreed, applied
    to a purchase.
    """
    cover = req(plan, "cover_days")
    assert req(cover, "is_a_business_rule") is False
    assert req(cover, "invent_a_default") is False
    assert req(cover, "supplied_by") == "caller"


def test_a_negative_on_hand_is_read_as_none_never_as_a_deficit(plan):
    """
    The lesson from shipment_plans, written down so it cannot be un-learned by
    a later tidy-up.
    """
    neg = req(plan, "negative_on_hand")
    assert req(neg, "read_as") == "none_at_that_location"
    assert req(neg, "never_as_a_deficit") is True
    assert req(neg, "raw_sum_also_reported") is True
    assert req(neg, "notice_mandatory") is True


def test_availability_is_flagged_and_never_adjusts_the_rate(plan):
    """
    Raising a measured sales figure to what it might have been if the product
    had been in stock is inventing a sale. The reader decides what to do about
    it, which is the same judgement the cover period already is.
    """
    av = req(plan, "availability")
    assert req(av, "flag_only") is True
    assert req(av, "adjusts_the_rate") is False


def test_lead_time_is_declared_unavailable(plan, defs):
    """
    Nothing records when goods arrive, so no plan can add cover for the wait.
    This must stay false unless arrival is actually captured somewhere.
    """
    assert req(plan, "lead_time_available") is False
    assert req(defs, "suppliers.lead_times.delivery.supported") is False


def test_demand_excludes_the_warehouse(plan):
    """AJI BARN does not sell; counting it as demand would double-count stock."""
    assert req(req(plan, "demand"), "scope") == "active_retail"
    assert req(req(plan, "demand"), "excludes_cancelled") is True


# ------------------------------------------------------------ the templates


def test_stock_is_floored_at_zero_in_sql():
    """
    The single line that stops this tool repeating shipment_plans' failure. If
    it ever becomes a bare SUM, a -174,877 reading turns into a 174,877-unit
    order.
    """
    assert "GREATEST(i.quantity_on_hand, 0)" in purchase_plan._SELECT_PLAN
    assert "GREATEST(s.quantity_on_hand, 0)" in purchase_plan._SELECT_STARVED


def test_the_raw_stock_figure_is_still_reported():
    """Flooring must not hide the fault; both figures travel on the row."""
    assert "on_hand_raw" in purchase_plan._SELECT_PLAN
    assert "negative_rows" in purchase_plan._SELECT_PLAN


def test_no_quantity_is_suggested_without_a_cover_period():
    """The suggestion is null unless cover_days was supplied — in SQL, not prose."""
    assert "%(cover_days)s::numeric IS NULL THEN NULL" in purchase_plan._SELECT_PLAN


def test_the_availability_window_never_includes_today():
    """
    Today's snapshot has not been taken, and counting it made the tool report
    91 days out of stock in a 90-day window — which reads as an error whatever
    the truth is.
    """
    assert "s.snapshot_date < CURRENT_DATE" in purchase_plan._SELECT_STARVED


def test_no_caller_input_is_interpolated_into_sql():
    for template in (
        purchase_plan._SELECT_PLAN,
        purchase_plan._SELECT_SUPPLIERS,
        purchase_plan._SELECT_STARVED,
    ):
        for field in ("{supplier}", "{cover_days}", "{days}", "{since}"):
            assert field not in template


def test_every_ranking_is_done_in_sql():
    assert set(purchase_plan._ORDER_BY) == {"running_out", "most_needed", "fastest_moving"}


# ------------------------------------------------------------- the refusals


@pytest.mark.parametrize("kwargs, expect", [
    ({"rank_by": "nope"}, "Unknown rank_by"),
    ({"cover_days": 0}, "at least 1 day"),
    ({"lookback_days": 3}, "between 7 and 365"),
    ({"lookback_days": 900}, "between 7 and 365"),
])
def test_bad_arguments_are_refused_before_any_connection(kwargs, expect):
    with pytest.raises(ValueError) as e:
        purchase_plan.get_purchase_plan(**kwargs)
    assert expect in str(e.value)


def test_the_tool_refuses_to_run_if_a_default_cover_is_ever_configured():
    """
    A guard on the definition itself. If somebody sets invent_a_default true,
    the tool stops rather than quietly starts sizing orders against a rule
    nobody agreed.
    """
    import inspect
    src = inspect.getsource(purchase_plan.get_purchase_plan)
    assert "invent_a_default" in src


# ------------------------------------------------------------- registration


def test_the_tool_is_on_the_read_surface():
    from agent.loop import TOOL_FUNCTIONS
    assert TOOL_FUNCTIONS["get_purchase_plan"] is purchase_plan.get_purchase_plan


def test_it_is_declared_only_partially_reproducible(defs):
    """
    Demand rebinds to a past window but stock and on-order are read live, so a
    backtest reports today's shelf against a past period's demand. Claiming
    full reproduction would attribute today's stock to a past morning.
    """
    partial = req(defs, "workflows.backtest.partially_reproducible")
    assert "get_purchase_plan" in partial
    assert "live" in partial["get_purchase_plan"].lower()


def test_it_writes_nothing():
    """
    The whole point of the agreed scope: a draft to review. No write tool, no
    StoreHub call, no purchase order created.
    """
    import inspect
    src = inspect.getsource(purchase_plan)
    for forbidden in ("INSERT", "UPDATE", "DELETE ", "COMMIT"):
        assert forbidden not in src.upper().replace("DELETED", "")
