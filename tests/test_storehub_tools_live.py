"""
Live tests for the purchasing and movement tools against imported StoreHub data.

NEEDS THE DATABASE. Skipped by conftest when GEORGE_DATABASE_URL is unset, like
the rest of the golden suite. These exist because the bugs this code has actually
shipped were all invisible without real rows:

  - a multi-row INSERT that only broke past 32,767 bind parameters
  - header dicts that only diverged on documents with no lines
  - a KeyError raised the first time a records-only movement query ran, because
    the snapshot headline maths iterated the merged row list

They also assert the two things this whole exercise was for: that a
destination-scoped movement question is now ANSWERABLE from records, and that
the same question is still REFUSED on the inferred basis.
"""

from __future__ import annotations

import pytest

from tools.movement import get_movement
from tools.purchasing import get_purchasing

BARN = "AJI BARN"
AJI_MIX = "SH1"


def _skip_if_empty(result, what):
    if not result["rows"]:
        pytest.skip(f"no {what} imported into this database")


# ---------------------------------------------------------------------------
# Movement — the basis split, live
# ---------------------------------------------------------------------------

def test_records_only_query_does_not_touch_snapshot_headlines():
    """
    Regression: the balance_delta headline maths ran over the MERGED row list,
    and a transfer row has no balance_delta key, so any records-only query died
    with KeyError before returning anything.
    """
    r = get_movement(store=BARN, sku=AJI_MIX, basis="transfer_records",
                     date_range=["2025-01-01", "2026-09-03"])
    assert r["meta"]["bases_returned"] == ["transfer_records"]
    assert "balance_delta" not in r["meta"]
    assert all(row["basis"] == "transfer_records" for row in r["rows"])


def test_destination_scoped_movement_is_answerable_from_records():
    """The question this import existed to make answerable."""
    r = get_movement(store=BARN, to_store="Rockwell", sku=AJI_MIX,
                     basis="transfer_records",
                     date_range=["2025-01-01", "2026-09-03"])
    _skip_if_empty(r, "BARN->Rockwell transfers")

    tr = r["meta"]["transfer_records"]
    assert tr["provenance"]["is_recorded_movement"] is True
    assert tr["provenance"]["destination_attribution_supported"] is True

    # Every row really is on the requested route, and every route in the summary
    # is the one asked for — no leakage from the OR in the location predicate.
    for row in r["rows"]:
        assert row["from"] == "AJI BARN" and row["to"] == "Rockwell"
    assert [(x["from"], x["to"]) for x in tr["routes"]] == [("AJI BARN", "Rockwell")]

    # Quantity and value are only counted for documents where goods moved.
    assert tr["moved_quantity"] > 0
    assert tr["moved_value"] > 0


def test_destination_scoping_still_refused_on_the_inferred_basis():
    """
    Records name both ends; differenced snapshots never can. The refusal that
    predates the import must survive it.
    """
    with pytest.raises(ValueError, match="not answerable"):
        get_movement(store=BARN, to_store="Rockwell", sku=AJI_MIX,
                     basis="balance_delta")


def test_both_bases_are_labelled_and_never_summed():
    r = get_movement(store=BARN, sku=AJI_MIX, basis="both",
                     date_range=["2026-06-01", "2026-07-01"])
    meta = r["meta"]
    assert meta["never_blend_bases"] is True
    for row in r["rows"]:
        assert row["basis"] in ("transfer_records", "balance_delta")
    # No key anywhere in meta claims a total across the two.
    for block in ("transfer_records", "balance_delta"):
        if block in meta:
            assert "combined" not in str(meta[block]).lower()


def test_closed_warehouse_answers_history_and_says_so_for_current_state():
    """MACOPA shut in June; its 1,006 documents are still real."""
    r = get_movement(store="AJI MACOPA", sku=AJI_MIX, basis="transfer_records",
                     date_range=["2025-01-01", "2026-09-03"])
    assert r["meta"]["bases_returned"] == ["transfer_records"]

    # The snapshot basis cannot answer for it, and says why rather than
    # returning an empty series that reads as "nothing moved".
    with pytest.raises(ValueError, match="no inventory snapshots"):
        get_movement(store="AJI MACOPA", sku=AJI_MIX, basis="balance_delta",
                     date_range=["2025-01-01", "2026-09-03"])


# ---------------------------------------------------------------------------
# Purchasing
# ---------------------------------------------------------------------------

def test_completion_lead_days_answers_and_carries_its_caveat():
    r = get_purchasing(measure="completion_lead_days", group_by="supplier", top_n=5)
    _skip_if_empty(r, "purchase orders")

    assert r["meta"]["measure_grain"] == "document"
    assert r["meta"]["unit"] == "days"
    assert all(row["value"] is not None for row in r["rows"])

    # The caveat is mandatory: this measures paperwork, not suppliers.
    notice = r["meta"]["notice"]
    kinds = {i["kind"] for i in notice.get("items", [notice])}
    assert "completion_not_delivery" in kinds


def test_purchasing_value_comes_from_lines_and_flags_disagreeing_headers():
    r = get_purchasing(measure="ordered_value", group_by="supplier", top_n=10)
    _skip_if_empty(r, "purchase orders")

    assert r["meta"]["value_basis"] == "lines"
    # Some POs disagree with their own lines (12 of 227 at the first load, and
    # the count grows with imports); where any appear in a result the row says
    # how many, so the figure is never silently clean.
    flagged = sum(row.get("documents_with_header_mismatch", 0) for row in r["rows"])
    if flagged:
        notice = r["meta"]["notice"]
        kinds = {i["kind"] for i in notice.get("items", [notice])}
        assert "header_total_mismatch" in kinds


def test_open_purchase_orders_carry_the_not_outstanding_caveat():
    r = get_purchasing(measure="ordered_value", status="Open")
    notice = r["meta"].get("notice")
    assert notice is not None
    kinds = {i["kind"] for i in notice.get("items", [notice])}
    assert "open_is_not_unreceived" in kinds


def test_every_result_carries_coverage_so_empty_is_not_mistaken_for_zero():
    r = get_purchasing(measure="po_count", date_range=["2020-01-01", "2020-02-01"])
    cov = r["meta"]["coverage"]
    assert cov["documents_imported"] > 0        # data exists...
    assert r["rows"] == [] or r["rows"][0]["value"] == 0   # ...just not in 2020
    assert "never loaded" in cov["note"]


def test_no_recorded_dispatch_never_contradicts_the_records():
    """
    Regression. This notice predates the transfer import, when the inference
    view was the only thing naming a dispatch. Ungated it produced an answer
    that reported 56 recorded transfer documents moving 1,646,478 g AND a caveat
    insisting "the record of it does not exist" — both in the same result.

    A caveat that contradicts the figures beside it is worse than none: it
    teaches the reader to stop believing the caveats.
    """
    r = get_movement(sku=AJI_MIX, date_range=["2026-06-03", "2026-09-01"], basis="both")
    meta = r["meta"]
    notice = meta.get("notice")
    kinds = {i["kind"] for i in (notice.get("items", [notice]) if notice else [])}

    recorded = meta.get("transfer_records", {}).get("moved_quantity", 0)
    if recorded:
        assert "no_recorded_dispatch" not in kinds, (
            f"{recorded:,.0f} units are recorded as moved, so the answer must not "
            f"also claim no record of the movement exists"
        )


def test_no_recorded_dispatch_still_fires_when_nothing_records_the_move():
    """
    The other half: gating it must not silence it. On the snapshot basis alone
    there are no transfer records to consult, so a decline the view cannot
    explain is still reported as unrecorded — which is the fact that made this
    notice worth having.
    """
    r = get_movement(sku=AJI_MIX, date_range=["2026-06-03", "2026-09-01"],
                     basis="balance_delta")
    bd = r["meta"]["balance_delta"]
    if bd["observed_decline"] and bd["reconciliation"]["recorded_dispatch_grams"] == 0:
        notice = r["meta"].get("notice")
        kinds = {i["kind"] for i in (notice.get("items", [notice]) if notice else [])}
        assert "no_recorded_dispatch" in kinds
