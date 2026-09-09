"""
Replenishment — the definitions the tool rests on, and the caveats it owes.

NO DATABASE. Definitions, SQL templates and argument validation only.

WHY THIS EXISTS. shipment_plans is not George's figure: it is written by
backend/app/services/replenishment_service.py, and this tool reads it back.
That makes a particular failure easy — restating the engine's arithmetic
slightly differently, or reporting a stored number without the condition that
makes it mean something. Five properties are pinned here because each one, if
it drifted, would turn a plan somebody acts on into a plan somebody trusts
wrongly.

The one that matters most: ON HAND CAN BE NEGATIVE AND THE SIZING USES IT
DIRECTLY. Measured on the 2026-09-06 run — 662 of 3,076 lines carry a negative
on hand and account for 59,715 of the 95,799 units requested, 62% of the plan.
The biggest lines in the plan are the biggest because the stock records behind
them are broken. A tool that reported those quantities as need would be sending
real goods against a data fault.
"""

import pytest

from tools._common import load_defs, req
from tools import replenishment


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def rep(defs):
    return req(defs, "replenishment")


# --------------------------------------------------------------- definitions


def test_the_plan_is_read_not_recalculated(rep):
    """
    The formulas are transcribed from the service so a reader can see how a
    line was sized. They exist to be QUOTED, never to be evaluated here: the
    moment this tool computes one, two definitions of a shipment exist.
    """
    assert req(rep, "source_table") == "shipment_plans"
    assert "replenishment_service" in req(rep, "generated_by")
    formulas = req(rep, "formulas")
    assert "min_level - on_hand" in req(formulas, "requested_ship_qty")


def test_negative_on_hand_inflates_the_request_and_must_be_said(rep):
    """
    The single most important caveat in this domain. requested_ship_qty is the
    target level minus what is on hand, so a broken negative adds its own
    magnitude to the order.
    """
    neg = req(rep, "negative_on_hand")
    assert req(neg, "inflates_request") is True
    assert req(neg, "notice_mandatory") is True
    assert "min_level - on_hand" in req(neg, "formula_note")


def test_a_run_is_an_event_not_a_day(rep):
    """
    Runs are irregular and two of them covered a single shop. A single-store
    run reported as the estate's plan would be wrong about six shops.
    """
    assert req(rep, "runs_are_regular") is False
    assert req(rep, "partial_run_notice_kind")
    assert req(rep, "stale_run_notice_kind")
    assert int(req(rep, "stale_after_days")) > 0


def test_allocation_is_never_evidence_of_a_shipment(rep):
    """
    The service sets allocated = requested as its default, so the two matching
    means nothing was allocated away — never that goods moved. What moved is
    stock_transfers.
    """
    alloc = req(rep, "allocation")
    assert req(alloc, "defaults_to_requested") is True
    assert req(alloc, "is_evidence_of_shipment") is False
    assert req(alloc, "notice_kind")


def test_the_velocity_depends_on_the_calculation_mode(rep):
    """
    The engine normally measures demand over days a product was actually
    available, so being out of stock does not make it look slow. `fallback` is
    the path when snapshot history is too thin for that — and it is the
    majority of rows, which understates demand for exactly the products that
    were starved.
    """
    cm = req(rep, "calculation_modes")
    assert "fallback" in req(cm, "understates_stockouts")
    assert "snapshot" in req(cm, "uses_active_days")
    assert "fallback" not in req(cm, "uses_active_days")
    # Every known mode is classified one way or the other.
    known = set(req(cm, "known"))
    classified = set(req(cm, "uses_active_days")) | set(req(cm, "understates_stockouts"))
    assert not (known - classified)


def test_days_of_stock_is_never_ranked_on(rep):
    """
    Median 13.9 in the latest run, maximum 419,916. A product with a trickle of
    sales and any stock produces an enormous cover figure, so ranking on it
    would put the least interesting lines first.
    """
    dos = req(rep, "days_of_stock")
    assert req(dos, "rankable") is False
    assert req(dos, "trustworthy_at_tail") is False
    for clause in req(rep, "rank_modes").values():
        assert "days_of_stock" not in clause


def test_the_two_algorithms_are_declared_with_what_only_one_of_them_carries(rep):
    """
    Only `percentile` records an ABC class, a segment and a service level. On a
    legacy row those are NULL rather than unknown-but-existing, and a result
    mixing both must say so instead of showing four mostly-empty columns.
    """
    algos = req(rep, "algorithms")
    assert set(req(algos, "known")) == {"legacy", "percentile"}
    assert "abc_class" in req(algos, "percentile_only_columns")
    assert req(algos, "mixed_notice_kind")


# ------------------------------------------------------------ the templates


def test_no_caller_input_is_interpolated_into_sql():
    for template in (
        replenishment._SELECT_PLAN,
        replenishment._SELECT_SUMMARY,
        replenishment._SELECT_RUNS,
    ):
        for field in ("{store}", "{sku}", "{run_date}", "{store_ids}"):
            assert field not in template


def test_the_plan_carries_what_makes_its_quantity_readable():
    """
    on_hand, min_level and calculation_mode travel with every requested
    quantity. Without them the number is a bare demand with no way to tell a
    real need from a broken stock record.
    """
    sql = replenishment._SELECT_PLAN
    for column in ("on_hand", "min_level", "requested_ship_qty", "calculation_mode", "algorithm"):
        assert column in sql


def test_the_warehouse_is_not_a_destination(defs):
    """
    AJI BARN is where stock ships FROM. Offering it as a store would invite a
    question with no rows behind it.
    """
    barn = req(defs, "replenishment.warehouse_store_id")
    retail = [s["id"] for s in req(defs, "stores.active_retail")]
    assert barn not in retail


# ------------------------------------------------------------- the refusals


@pytest.mark.parametrize("kwargs, expect", [
    ({"view": "nope"}, "Unknown view"),
    ({"rank_by": "days_of_stock"}, "Unknown rank_by"),
    ({"rank_by": "nope"}, "Unknown rank_by"),
])
def test_bad_arguments_are_refused_before_any_connection(kwargs, expect):
    with pytest.raises(ValueError) as e:
        replenishment.get_replenishment(**kwargs)
    assert expect in str(e.value)
    assert "metrics.yaml" in str(e.value)


# ------------------------------------------------------------- registration


def test_the_tool_is_on_the_read_surface():
    from agent.loop import TOOL_FUNCTIONS
    assert TOOL_FUNCTIONS["get_replenishment"] is replenishment.get_replenishment


def test_a_missing_grant_is_reported_as_configuration_not_as_a_crash():
    """
    George's role is granted table by table on purpose, so a new table is
    unreadable until somebody decides to expose it. The tool names the grant
    and the file rather than letting a driver permission error reach the user.
    """
    import inspect
    src = inspect.getsource(replenishment)
    assert "InsufficientPrivilege" in src
    assert "GRANT SELECT ON shipment_plans TO george_ro" in src
    assert "george_ro_role.sql" in src
