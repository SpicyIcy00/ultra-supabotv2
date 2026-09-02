"""
Contract tests for the three purchasing/movement tool surfaces.

NO DATABASE. These check the parts that are decidable without one: that the
definitions the tools read exist and say what the tools assume, that the
generated schemas expose the right closed vocabularies, and — the point of the
whole exercise — that the two movement bases and the three cost bases stay
separated.

Running the tools against real rows needs the imported tables and a connection;
that is the golden suite's job.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="tools/_common imports psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent.loop import build_tool_schemas, TOOL_FUNCTIONS   # noqa: E402
from tools._common import load_defs, req                    # noqa: E402


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def schemas():
    return {t["name"]: t for t in build_tool_schemas()}


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def test_new_tools_are_registered(schemas):
    for name in ("get_purchasing", "get_cost_history", "get_movement"):
        assert name in TOOL_FUNCTIONS
        assert name in schemas


def test_cost_history_is_its_own_tool_not_a_purchasing_parameter(schemas):
    """
    Cost history is a different grain — one row per document line, in date
    order — so it is its own surface rather than a mode of get_purchasing.
    """
    assert set(schemas["get_cost_history"]["input_schema"]["properties"]) == {"sku", "top_n"}
    assert "sku" in schemas["get_cost_history"]["input_schema"]["required"]


# ---------------------------------------------------------------------------
# The basis split — the thing most likely to be quietly undone
# ---------------------------------------------------------------------------

def test_movement_exposes_both_bases_and_forbids_blending(defs, schemas):
    bases = schemas["get_movement"]["input_schema"]["properties"]["basis"]["enum"]
    assert set(bases) == {"transfer_records", "balance_delta", "both"}
    assert req(defs, "movement.never_blend_bases") is True


def test_destination_attribution_is_scoped_by_basis_not_blanket(defs):
    """
    It was a flat `false`, correct when snapshots were the only basis. Transfers
    name both ends, so refusing there would be refusing an answerable question —
    and allowing it on snapshots would be answering an unanswerable one.
    """
    by_basis = req(defs, "movement.destination_attribution.supported_by_basis")
    assert by_basis["transfer_records"] is True
    assert by_basis["balance_delta"] is False
    # The original refusal text survives, still applying to the snapshot basis.
    assert "not answerable" in req(
        defs, "movement.destination_attribution.refusal_message"
    )


def test_recorded_ledger_now_exists_but_balance_delta_stays_inferred(defs):
    assert req(defs, "movement.recorded_ledger_exists") is True
    assert req(defs, "movement.bases.transfer_records.is_recorded_movement") is True
    assert req(defs, "movement.bases.balance_delta.is_recorded_movement") is False
    assert req(defs, "movement.bases.balance_delta.derived") is True


def test_moved_statuses_are_a_reference_not_a_second_copy(defs):
    """
    Restating the list here would let it drift from the importer's copy. It is a
    pointer, and it resolves.
    """
    ref = req(defs, "movement.moved_statuses_ref")
    assert req(defs, ref) == ["Shipped", "Completed"]
    assert "Created" not in req(defs, ref)      # raised is not moved


# ---------------------------------------------------------------------------
# Cost history: three bases, never blended
# ---------------------------------------------------------------------------

def test_cost_history_keeps_three_bases_apart(defs):
    bases = req(defs, "cost_history.bases")
    assert set(bases) == {"purchase_order", "transfer_valuation", "current_catalog"}
    # Only a supplier price is authoritative for cost.
    assert bases["purchase_order"]["authoritative_for_cost"] is True
    assert bases["transfer_valuation"]["authoritative_for_cost"] is False
    assert bases["current_catalog"]["authoritative_for_cost"] is False
    assert req(defs, "cost_history.never_blend_bases") is True
    assert req(defs, "cost_history.never_average_across_bases") is True


def test_zero_cost_means_not_entered_and_is_kept_out_of_statistics(defs):
    assert req(defs, "cost_history.zero_cost_means") == "not_entered"
    assert req(defs, "cost_history.zero_cost_excluded_from_statistics") is True


def test_cost_history_matches_sku_case_sensitively(defs):
    assert req(defs, "cost_history.sku_match") == "case_sensitive"
    assert req(defs, "products.sku.import_match") == "case_sensitive"


# ---------------------------------------------------------------------------
# Purchasing
# ---------------------------------------------------------------------------

def test_value_comes_from_lines_not_the_header_total(defs):
    """12 of 227 POs disagree with their own lines; PO0604 by PHP 90,000."""
    assert req(defs, "purchasing.value_basis") == "lines"
    assert req(defs, "purchasing.header_total_is_authoritative") is False
    assert req(defs, "purchasing.header_mismatch_notice_mandatory") is True


def test_completion_lead_days_is_labelled_as_not_delivery(defs):
    m = req(defs, "purchasing.measures.completion_lead_days")
    assert m["label_mandatory"] == "system completion latency, not delivery time"
    assert req(defs, "purchasing.delivery_lead_time_supported") is False
    assert "not answerable" in req(defs, "purchasing.delivery_lead_time_refusal")


def test_quantities_are_not_additive_across_products(defs):
    """Aji Mix moves in grams, Haw Flakes in packs, and the export records no unit."""
    assert req(defs, "purchasing.quantity_additive_across_products") is False
    assert req(defs, "purchasing.measures.ordered_qty.additive_across_products") is False
    # Value is the additive one.
    assert req(defs, "purchasing.measures.ordered_value.unit") == "PHP"


def test_open_status_is_not_treated_as_outstanding(defs):
    assert req(defs, "purchasing.open_is_not_outstanding") is True
    assert req(defs, "purchasing.open_notice_mandatory") is True


def test_purchasing_measures_declare_their_grain(defs, schemas):
    measures = req(defs, "purchasing.measures")
    for name, m in measures.items():
        assert m["grain"] in ("document", "line"), name
        assert m["valid_group_by"], name
    assert set(schemas["get_purchasing"]["input_schema"]["properties"]["measure"]["enum"]) == set(measures)


# ---------------------------------------------------------------------------
# Closed locations: history yes, current state no
# ---------------------------------------------------------------------------

def test_closed_location_is_offered_for_history_and_not_for_current_stock(schemas):
    stock = schemas["get_stock"]["input_schema"]["properties"]["store"]["enum"]
    movement = schemas["get_movement"]["input_schema"]["properties"]["store"]["enum"]
    purchasing = schemas["get_purchasing"]["input_schema"]["properties"]["store"]["enum"]

    assert not any("MACOPA" in s for s in stock), (
        "a closed warehouse must not be offered as somewhere to ask about today's stock"
    )
    assert any("MACOPA" in s for s in movement)
    assert any("MACOPA" in s for s in purchasing)


# ---------------------------------------------------------------------------
# The suppliers rewrite
# ---------------------------------------------------------------------------

def test_suppliers_subjects_flipped_only_where_the_data_supports_it(defs):
    s = req(defs, "suppliers")
    assert s["purchase_orders"]["supported"] is True
    assert s["last_cost"]["supported"] is True
    assert s["lead_times"]["supported"] == "partial"
    assert s["lead_times"]["completion_latency"]["supported"] is True

    # These did NOT change, and must not be quietly upgraded by the arrival of
    # purchase orders. Nothing records arrival, and no cost is captured per
    # sales line.
    assert s["lead_times"]["delivery"]["supported"] is False
    assert s["store_profit_supported"] is False
    assert s["store_profit_do_not_reintroduce"] is True


def test_original_survey_is_preserved_not_deleted(defs):
    """
    The pre-import survey is why these subjects were refused for so long.
    Deleting it would make those refusals look arbitrary in hindsight.
    """
    survey = req(defs, "suppliers.survey_2026_09_01")
    assert survey["any_supplier_data"] is False
    assert survey["purchase_orders"]["supported"] is False
    assert survey["lead_times"]["supported"] is False
    assert survey["last_cost"]["supported"] is False
