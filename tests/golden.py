"""
Golden tests for George's tools.

Runs pytest directly against the tool functions — no agent, no LLM, no prompt.
Every assertion is a value a human can check against the database by hand.

WHAT THESE PROTECT

Four regressions have already happened in this codebase, and each class has a
dedicated test here:

  1. TIMEZONE CAST. `date AT TIME ZONE 'Asia/Manila'` selects the wrong Postgres
     overload and lands 8 hours late, so "August by day" returned 32 buckets
     ending 2026-09-01. See test_month_length_matches_calendar.
  2. PHANTOM ENUM. business_rules.yaml documents vending shipment_status 3 =
     FAILED; no row has status 3, so a failure report read "no failures"
     forever. See test_documented_enum_values_exist_in_data.
  3. SILENT CONFLATION. SKU is not unique — `tky105` is three unrelated
     products — and summing them produced a number belonging to none of them.
     See the refusal cases.
  4. EMPTY-MEANS-FINE. An empty result that actually means "not configured" or
     "not covered" reads as "nothing to report". See the notice cases.

WHY THE GOLDEN VALUES ARE STABLE

Every exact value below comes from a CLOSED window — historical transactions,
historical vending lines, or inventory_snapshots rows. Verified 2026-09-01: the
sync only appends rows for the current day and backdates nothing
(test_golden_windows_are_still_closed guards that assumption, so if the sync
behaviour changes this suite tells you why it broke instead of just failing).

Volatile figures — live `inventory` counts, catalog size, today's totals — are
asserted structurally or not at all.

CONNECTION

These call the tools through the real read-only guard in tools/_common.connect,
with no bypass. They need GEORGE_DATABASE_URL pointing at George's own
non-superuser role (see tools/george_ro_role.sql). Without it the whole module
skips rather than failing.
"""

from __future__ import annotations

import calendar
import os
from datetime import date

import pytest

from tools import (
    cost_history,
    dead_stock,
    inventory,
    movement,
    products,
    purchasing,
    sales,
    vending,
)
from tools._common import connect, load_defs, req

# --------------------------------------------------------------------------
# Windows. All closed — see module docstring.
# --------------------------------------------------------------------------
AUG_2026 = ("2026-08-01", "2026-09-01")
JUL_2026 = ("2026-07-01", "2026-08-01")
JUN_2026 = ("2026-06-01", "2026-07-01")
JUN_2024 = ("2024-06-01", "2024-07-01")
APR_2026 = ("2026-04-01", "2026-05-01")
VENDING_ALL = ("2025-06-01", "2026-09-01")
SNAPSHOT_DAY = "2026-08-31"

SH1 = "663c7869391c7c00079595a8"  # "Aji Mix", the traced AJI BARN product


def _val(result):
    """The single value from a grand-total (group_by=[]) result."""
    return result["rows"][0]["value"] if result["rows"] else None


# ==========================================================================
# 30 GOLDEN QUESTIONS ACROSS THE SIX TOOL SURFACES
#
# sales, inventory, products, movement, vending sales, vending stock.
# (suppliers is definitions-only by design — no tool — and is covered by
# test_suppliers_subjects_remain_unsupported.)
# ==========================================================================

GOLDEN = [
    # ---- sales (10) ------------------------------------------------------
    ("sales/aug-net-sales",
     lambda: _val(sales.get_sales([], AUG_2026, metric="net_sales")), 8069394.16),
    ("sales/aug-product-revenue",
     lambda: _val(sales.get_sales([], AUG_2026, metric="product_revenue")), 8069394.16),
    ("sales/jul-net-sales",
     lambda: _val(sales.get_sales([], JUL_2026, metric="net_sales")), 9140580.51),
    ("sales/jun-net-sales",
     lambda: _val(sales.get_sales([], JUN_2026, metric="net_sales")), 8449691.08),
    ("sales/aug-units-sold",
     lambda: _val(sales.get_sales([], AUG_2026, metric="units_sold")), 1574090.0),
    ("sales/aug-transaction-count",
     lambda: _val(sales.get_sales([], AUG_2026, metric="transaction_count")), 18268),
    ("sales/jul-returns-value",
     lambda: _val(sales.get_sales([], JUL_2026, metric="returns_value")), 299.0),
    ("sales/aug-store-count",
     lambda: sales.get_sales("store", AUG_2026, metric="net_sales")["meta"]["row_count"], 7),
    ("sales/aug-top-store",
     lambda: (lambda r: (r["rows"][0]["store"], r["rows"][0]["value"]))(
         sales.get_sales("store", AUG_2026, metric="net_sales")), ("OPUS", 2436641.59)),
    ("sales/rockwell-aug24-30",
     lambda: round(sum(x["value"] for x in sales.get_sales(
         "day", ("2026-08-24", "2026-08-31"),
         filters={"store": "Rockwell"}, metric="net_sales")["rows"]), 2), 179058.50),

    # ---- inventory (4) ---------------------------------------------------
    # as_of reads inventory_snapshots, which is immutable history.
    # meta.total_matching was replaced by meta.full_row_count when top_n landed:
    # the count is now reported whenever the result is limited, not only when the
    # hard cap is hit.
    ("inventory/barn-snapshot-products",
     lambda: inventory.get_stock(store="AJI BARN", as_of=SNAPSHOT_DAY)["meta"]["full_row_count"], 3493),
    ("inventory/rockwell-snapshot-in-stock",
     lambda: inventory.get_stock(store="Rockwell", as_of=SNAPSHOT_DAY,
                                 state="in_stock")["meta"]["row_count"], 494),
    ("inventory/scope-is-7-retail-plus-barn",
     lambda: len(req(load_defs(), "inventory.scope_store_ids")), 8),
    ("inventory/sh1-barn-is-negative",
     lambda: inventory.get_stock(store="AJI BARN", sku="SH1")["rows"][0]["state"], "out_of_stock"),

    # ---- products (6) ----------------------------------------------------
    ("products/uncategorized-count",
     lambda: products.get_product(category="Uncategorized")["meta"]["row_count"], 83),
    ("products/choco-count",
     lambda: products.get_product(category="choco")["meta"]["row_count"], 142),
    ("products/sh1-name",
     lambda: products.get_product(sku="SH1")["rows"][0]["name"], "Aji Mix"),
    ("products/tky105-is-three-products",
     lambda: products.get_product(sku="tky105")["meta"]["row_count"], 3),
    # Third element of a six-barcode comma list — an `=` match would miss it.
    ("products/multi-barcode-third-element",
     lambda: products.get_product(barcode="4902888269653")["rows"][0]["sku"], "TKY105"),
    # A barcode present only in product_barcodes, not in products.barcode.
    ("products/product-barcodes-only-source",
     lambda: products.get_product(barcode="2000000000008")["rows"][0]["sku"], "bulk01WR"),

    # ---- movement, INFERRED basis (4) ------------------------------------
    # These four values were measured against snapshot differencing, so they are
    # pinned to basis="balance_delta" and their figures are unchanged. The
    # headline numbers moved from meta[...] into meta["balance_delta"][...] when
    # the second basis arrived: a net_change at the top level would not say
    # WHICH kind of movement it counted, and the whole point of the split is
    # that recorded and inferred movement are never one unlabelled figure.
    ("movement/sh1-90d-net-change",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"),
                                   basis="balance_delta")["meta"]["balance_delta"]["net_change"],
     -4817082.0),
    ("movement/sh1-90d-row-count",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"),
                                   basis="balance_delta")["meta"]["row_count"], 90),
    ("movement/sh1-90d-nothing-explained",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"),
                                   basis="balance_delta")
     ["meta"]["balance_delta"]["reconciliation"]["explained_pct"], 0.0),
    # net_change is gap-immune (absolute balances); sum_of_observed_deltas is not.
    ("movement/gap-window-hides-665200g",
     lambda: round(
         movement.get_movement(sku="SH1", date_range=("2026-03-23", "2026-04-20"),
                               basis="balance_delta")["meta"]["balance_delta"]["net_change"]
         - movement.get_movement(sku="SH1", date_range=("2026-03-23", "2026-04-20"),
                                 basis="balance_delta")["meta"]["balance_delta"]["sum_of_observed_deltas"],
         0), -665200.0),

    # ---- movement, RECORDED basis (2) ------------------------------------
    # Unanswerable before the StoreHub transfer import: destination attribution
    # previously reconciled for 24 of 196 products, so "how much went from BARN
    # to Rockwell" was refused outright. These are now a direct read of recorded
    # documents, cross-checked against hand-written SQL on 2026-09-03.
    ("movement/sh1-barn-to-rockwell-qty",
     lambda: movement.get_movement(sku="SH1", store="AJI BARN", to_store="Rockwell",
                                   basis="transfer_records",
                                   date_range=("2025-01-01", "2026-09-03"))
     ["meta"]["transfer_records"]["moved_quantity"], 3856260.0),
    ("movement/sh1-barn-to-rockwell-value",
     lambda: movement.get_movement(sku="SH1", store="AJI BARN", to_store="Rockwell",
                                   basis="transfer_records",
                                   date_range=("2025-01-01", "2026-09-03"))
     ["meta"]["transfer_records"]["moved_value"], 3085008.0),

    # ---- purchasing (3) --------------------------------------------------
    # Nothing here was answerable before the StoreHub import; suppliers was
    # definitions-only. Both PO exports are loaded and disjoint: 227 documents,
    # 1,047 lines.
    # Cancelled documents are excluded BY DEFAULT, so the default count is not
    # the number of rows in the table. 206 completed + 12 open = 218; the 9
    # cancelled are only counted when asked for. Both are asserted so the
    # default can never quietly start including them.
    ("purchasing/po-count",
     lambda: _val(purchasing.get_purchasing(measure="po_count")), 218),
    ("purchasing/po-count-including-cancelled",
     lambda: _val(purchasing.get_purchasing(measure="po_count",
                                            include_cancelled=True)), 227),
    # 12 of those 227 disagree with their own line totals, so VALUE IS SUMMED
    # FROM LINES. PO0604 carries a 90,000.00 header over 13 lines summing to
    # 0.00; using headers would put that straight into the total.
    ("purchasing/documents-with-header-mismatch",
     lambda: sum(r.get("documents_with_header_mismatch", 0)
                 for r in purchasing.get_purchasing(measure="ordered_value",
                                                    group_by="supplier")["rows"]), 12),
    # "Open" does not mean "not received" — these carry notes recording a
    # delivery. Any outstanding-value figure built on status would be wrong.
    ("purchasing/open-pos",
     lambda: _val(purchasing.get_purchasing(measure="po_count", status="Open")), 12),

    # ---- cost history (2) ------------------------------------------------
    # A SKU whose cost was never entered. Zero means NOT ENTERED, not free, so
    # it is excluded from every statistic rather than dragging the series down.
    ("cost-history/kf27-all-costs-unentered",
     lambda: cost_history.get_cost_history("KF27")["meta"]["bases"]
     ["transfer_valuation"]["statistics"], None),
    ("cost-history/sh1145-supplier-series-is-authoritative",
     lambda: cost_history.get_cost_history("SH1145")["meta"]["bases"]
     ["purchase_order"]["authoritative_for_cost"], True),

    # ---- vending sales (5) -----------------------------------------------
    ("vending/lifetime-revenue-php",
     lambda: _val(vending.get_vending([], VENDING_ALL, metric="revenue")), 825615.00),
    ("vending/lifetime-units",
     lambda: _val(vending.get_vending([], VENDING_ALL, metric="units")), 11859),
    ("vending/lifetime-orders",
     lambda: _val(vending.get_vending([], VENDING_ALL, metric="orders")), 9184),
    ("vending/machines-with-sales",
     lambda: vending.get_vending("machine", VENDING_ALL, metric="revenue")["meta"]["row_count"], 9),
    ("vending/payment-method-breakdown",
     lambda: sorted((x["payment_method"], x["value"]) for x in vending.get_vending(
         "payment_method", VENDING_ALL, metric="orders")["rows"]),
     [("alipayaps", 12), ("gcashpay", 8116), ("unknown", 1056)]),

    # ---- vending stock (1) -----------------------------------------------
    # 10 machines x 54 aisles — a hardware fact, not a data volume.
    ("vending-stock/total-slots",
     lambda: vending.get_vending_stock()["meta"]["row_count"], 540),
]


@pytest.mark.parametrize("name,fn,expected", GOLDEN, ids=[g[0] for g in GOLDEN])
def test_golden(name, fn, expected):
    actual = fn()
    if isinstance(expected, float) and isinstance(actual, (int, float)):
        assert actual == pytest.approx(expected, abs=0.01), f"{name}: {actual} != {expected}"
    else:
        assert actual == expected, f"{name}: {actual!r} != {expected!r}"


# ==========================================================================
# 5 REFUSAL / NOTICE CASES
#
# An empty list is a correct answer to a different question. Each of these
# fails loudly or attaches a notice rather than returning a bare [].
# ==========================================================================

def test_refuse_ambiguous_sku_in_sales():
    """SKU tky105 is three unrelated products; summing them names no product."""
    with pytest.raises(ValueError) as e:
        sales.get_sales("store", AUG_2026, filters={"sku": "tky105"}, metric="product_revenue")
    msg = str(e.value)
    assert "3 DIFFERENT products" in msg
    # The collision must be named, not just counted.
    assert "Gudetama" in msg and "Pikachu" in msg
    assert "product_id" in msg, "must offer the disambiguation route"


def test_low_stock_returns_notice_not_empty_list():
    """warning_stock is NULL on every row: 'not configured', not 'nothing low'."""
    r = inventory.get_stock(state="low_stock")
    assert r["rows"] == []
    n = r["meta"]["notice"]
    assert n["kind"] == "low_stock_not_operational"
    assert "not set" in n["message"] or "never been configured" in n["message"]
    assert req(load_defs(), "inventory.low_stock_operational") is False


def test_refuse_destination_scoped_movement_on_the_inferred_basis():
    """
    The refusal is now SCOPED BY BASIS rather than blanket, and both halves
    matter.

    Differenced snapshots still cannot say where anything went, so asking them
    is still refused with the measured coverage. Recorded transfers name both
    ends, so refusing THEM would be refusing a question the data can now answer
    — which is the opposite failure and just as bad.
    """
    with pytest.raises(ValueError) as e:
        movement.get_movement(sku="SH1", to_store="Rockwell", basis="balance_delta")
    msg = str(e.value)
    assert "not answerable" in msg
    # The refusal must carry the measured coverage, not just say no.
    assert "32.8%" in msg and "26.2%" in msg
    # ...and point at the basis that CAN answer, rather than dead-ending.
    assert "transfer_records" in msg

    # The same question on records is answered, and says it is record-backed.
    r = movement.get_movement(sku="SH1", store="AJI BARN", to_store="Rockwell",
                              basis="transfer_records",
                              date_range=("2025-01-01", "2026-09-03"))
    assert r["meta"]["bases_returned"] == ["transfer_records"]
    tr = r["meta"]["transfer_records"]
    assert tr["provenance"]["is_recorded_movement"] is True
    assert tr["provenance"]["destination_attribution_supported"] is True


def test_movement_bases_are_never_summed():
    """
    Recorded and inferred movement describe the same goods from different
    sources. A field totalling across them would double-count and carry no
    single provenance, so none exists — every row says which basis produced it
    and each basis keeps its own block.
    """
    r = movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"))
    meta = r["meta"]
    assert meta["never_blend_bases"] is True
    assert set(meta["bases_returned"]) <= {"transfer_records", "balance_delta"}
    for row in r["rows"]:
        assert row["basis"] in ("transfer_records", "balance_delta")
    # No top-level headline that would silently mean "both".
    for leaked in ("net_change", "sum_of_observed_deltas", "moved_quantity"):
        assert leaked not in meta, (
            f"{leaked} is at the top of meta, where it does not say which kind "
            f"of movement it counted"
        )


def test_uncovered_as_of_reports_coverage_gap():
    """A date outside snapshot coverage is a gap, not an empty stock position."""
    r = inventory.get_stock(as_of="2025-01-01")
    assert r["rows"] == []
    cov = r["meta"]["snapshot_coverage"]
    assert cov["covered"] is False
    assert cov["available_from"] and cov["available_to"]
    assert r["meta"]["notice"]["kind"] == "snapshot_coverage_gap"


def test_vending_status_3_is_documented_as_absent():
    """business_rules.yaml documents 3 = FAILED. No row has it."""
    defs = load_defs()
    assert req(defs, "vending.documented_failure_status_exists") is False
    r = vending.get_vending("machine", VENDING_ALL, metric="non_success_vends")
    sem = r["meta"]["status_semantics"]
    assert sem["documented_failure_status_exists"] is False
    assert 3 not in sem["observed_distribution"]
    # And the metric must use <> 1, so it can actually return something.
    assert r["meta"]["row_count"] > 0, "non_success must not be empty-by-construction"


# ==========================================================================
# MONTH-LENGTH TEST — catches the timezone-cast family
#
# `date AT TIME ZONE` resolves to the timestamptz overload and lands 8 hours
# late, so a month window leaks into the following day and "by day" returns one
# bucket too many. Asserting bucket count against the calendar catches it for
# any month, including the 28-day one.
# ==========================================================================

# Months where every calendar day has at least one sale, so buckets == days.
DENSE_MONTHS = [(2026, 1), (2026, 2), (2026, 3), (2026, 5), (2026, 6), (2026, 7), (2026, 8)]

# April 2026 genuinely has three sales-free days. Absent buckets are NOT
# gap-filled (metrics.yaml: gap_filled false), so the honest expectation is 27.
SPARSE_MONTHS = {(2026, 4): 27}


@pytest.mark.parametrize("year,month", DENSE_MONTHS, ids=[f"{y}-{m:02d}" for y, m in DENSE_MONTHS])
def test_month_length_matches_calendar(year, month):
    days = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1)
    r = sales.get_sales("day", (start.isoformat(), end.isoformat()), metric="net_sales")

    assert r["meta"]["row_count"] == days, (
        f"{year}-{month:02d} returned {r['meta']['row_count']} day buckets for a "
        f"{days}-day month. A count one HIGHER than the calendar means the window "
        f"leaked into the next month — the `date AT TIME ZONE` cast bug."
    )
    # Every bucket must fall inside the month.
    buckets = [x["day"] for x in r["rows"]]
    assert buckets[0] == start.isoformat()
    assert buckets[-1] == date(year, month, days).isoformat()
    assert len(set(buckets)) == days, "duplicate day buckets"


@pytest.mark.parametrize("ym,expected", list(SPARSE_MONTHS.items()), ids=["2026-04-sparse"])
def test_sparse_month_is_not_gap_filled(ym, expected):
    year, month = ym
    start, end = date(year, month, 1), date(year, month + 1, 1)
    r = sales.get_sales("day", (start.isoformat(), end.isoformat()), metric="net_sales")
    assert r["meta"]["row_count"] == expected
    assert r["meta"]["gap_filled"] is False, "empty days must not be synthesised as zero"


# ==========================================================================
# ENUM TEST — catches the phantom-status family
#
# Every value metrics.yaml documents as existing must actually appear in the
# data, and values it documents as ABSENT must actually be absent. This is the
# test that would have caught shipment_status 3.
# ==========================================================================

def test_documented_enum_values_exist_in_data():
    defs = load_defs()
    missing: list[str] = []

    with connect() as conn:
        with conn.cursor() as cur:
            # -- vending shipment_status ---------------------------------
            cur.execute("SELECT DISTINCT shipment_status FROM vending_order_lines")
            actual_status = {r[0] for r in cur.fetchall()}
            for documented in req(defs, "vending.status_distribution"):
                if int(documented) not in actual_status:
                    missing.append(f"vending.status_distribution: {documented}")
            if req(defs, "vending.success_status") not in actual_status:
                missing.append("vending.success_status")
            # The converse: a value documented as absent must stay absent.
            assert (3 in actual_status) is req(defs, "vending.documented_failure_status_exists"), (
                "metrics.yaml says shipment_status 3 does not exist; the data now "
                "disagrees. Update vending.documented_failure_status_exists and the "
                "non_success definition."
            )

            # -- transaction_type ----------------------------------------
            cur.execute("SELECT DISTINCT transaction_type FROM new_transactions")
            actual_types = {r[0] for r in cur.fetchall()}
            for key in ("filters.returns.sale_sql", "filters.returns.return_sql"):
                literal = req(defs, key).split("'")[1]
                if literal not in actual_types:
                    missing.append(f"{key} -> {literal!r}")

            # -- store ids referenced anywhere in the definitions ---------
            cur.execute("SELECT id FROM stores")
            actual_stores = {r[0] for r in cur.fetchall()}
            referenced = (
                [s["id"] for s in req(defs, "stores.active_retail")]
                + [s["id"] for s in req(defs, "stores.warehouse")]
                + [s["id"] for s in req(defs, "stores.pending_retail")]
                + list(req(defs, "inventory.scope_store_ids"))
                + list(req(defs, "filters.excluded_from_sales.excluded_store_ids"))
            )
            for sid in referenced:
                if sid not in actual_stores:
                    missing.append(f"store id {sid}")

            # -- every active retail store must actually have sales -------
            cur.execute(
                "SELECT DISTINCT store_id FROM new_transactions "
                "WHERE is_cancelled = false AND transaction_type = 'Sale'"
            )
            selling = {r[0] for r in cur.fetchall()}
            for s in req(defs, "stores.active_retail"):
                if s["id"] not in selling:
                    missing.append(f"active_retail {s['display_name']} has no sales")

            # -- pending_retail must still have none, or it should be promoted
            for s in req(defs, "stores.pending_retail"):
                assert s["id"] not in selling, (
                    f"{s['name']} now has transactions and should move from "
                    f"stores.pending_retail to stores.active_retail."
                )

            # -- the uncategorized label must be producible ---------------
            cur.execute(
                f"SELECT COUNT(*) FROM products p "
                f"WHERE {req(defs, 'products.category_normalization.sql')} = %s",
                (req(defs, "products.category_normalization.uncategorized_label"),),
            )
            if cur.fetchone()[0] == 0:
                missing.append("products.category_normalization.uncategorized_label")

    assert not missing, "documented values absent from the data: " + "; ".join(missing)


def test_inventory_states_are_exclusive_and_total():
    """The three states must partition the table — no row unclassified, none double-counted."""
    defs = load_defs()
    states = sorted(req(defs, "inventory.states"), key=lambda s: s["order"])
    with connect() as conn:
        with conn.cursor() as cur:
            counts = []
            for s in states:
                cur.execute(f"SELECT COUNT(*) FROM inventory i WHERE {s['sql']}")
                counts.append(cur.fetchone()[0])
            cur.execute("SELECT COUNT(*) FROM inventory")
            total = cur.fetchone()[0]
    assert sum(counts) == total, (
        f"states sum to {sum(counts)} but inventory has {total} rows — the "
        f"predicates overlap or leave rows unclassified"
    )


def test_suppliers_subjects_match_the_data_that_exists():
    """
    THE TRIPWIRE FIRED, AND THIS IS THE DELIBERATE UPDATE.

    This test used to assert all three subjects were unsupported, with the note
    "if a procurement integration lands, these flags must be updated
    deliberately". One landed: the StoreHub import brought 227 purchase orders
    with 1,047 lines, each carrying a supplier, a product, a quantity, a unit
    cost and three dates.

    So the assertions flip for exactly the subjects the new data supports, and
    NOT for the two it does not — which is the whole point of the tripwire.
    """
    defs = load_defs()

    # Answerable now, because the documents exist.
    assert req(defs, "suppliers.purchase_orders.supported") is True
    assert req(defs, "suppliers.last_cost.supported") is True

    # Lead time is PARTIAL and the distinction is the substance: the time until
    # a PO was marked complete in StoreHub is measurable, the time until goods
    # arrived is not. PO0710 was created and completed two minutes apart on a
    # backdated correction; reporting that as supplier performance would be a
    # claim about a supplier that actually measures data entry.
    assert req(defs, "suppliers.lead_times.supported") == "partial"
    assert req(defs, "suppliers.lead_times.completion_latency.supported") is True
    assert req(defs, "suppliers.lead_times.completion_latency.label_mandatory") is True
    assert req(defs, "suppliers.lead_times.delivery.supported") is False

    # STILL FALSE, and must not be quietly upgraded by the arrival of purchase
    # orders: nothing captures a cost per SALES line, so a margin figure would
    # still value historical sales at today's cost.
    assert req(defs, "suppliers.store_profit_supported") is False
    assert req(defs, "suppliers.store_profit_do_not_reintroduce") is True
    assert "profit" not in req(defs, "metrics"), (
        "a store-side profit metric was added while "
        "suppliers.store_profit_supported is false — no per-line cost exists, so "
        "it would value historical sales at today's cost."
    )

    # The pre-import survey is kept, not deleted. It is the record of WHY these
    # subjects were refused for so long; without it the old refusals look
    # arbitrary in hindsight.
    assert req(defs, "suppliers.survey_2026_09_01.any_supplier_data") is False


# ==========================================================================
# PRECONDITION — keeps the golden values honest
# ==========================================================================

# A row may legitimately be written the day after it happened — a late-evening
# transaction syncing after midnight. Anything landing two or more days late is
# backdating, and backdating is what would silently invalidate the goldens.
MAX_SYNC_LAG_DAYS = 2


def test_sync_does_not_backdate():
    """
    The exact values above assume closed months never change. That holds only
    while the sync appends rows at roughly the time they occur.

    Measured 2026-09-01 over a 30-day window: 16,855 rows at lag 0, 12 at lag 1,
    and zero at lag 2 or more. If that changes, the goldens need re-baselining —
    and this test says so directly, instead of leaving a dozen confusing value
    mismatches elsewhere in the file.

    Note the comparison is row-relative (created_at vs that row's own
    transaction_time), not against "today": a row written yesterday for
    yesterday is normal appending, not backdating.
    """
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM new_transactions "
                "WHERE created_at > now() - interval '30 days' "
                "  AND (created_at::date - transaction_time::date) >= %s",
                (MAX_SYNC_LAG_DAYS,),
            )
            backdated = cur.fetchone()[0]
    assert backdated == 0, (
        f"{backdated} transaction(s) were written {MAX_SYNC_LAG_DAYS}+ days after "
        f"they occurred. Closed months are no longer immutable, so the exact "
        f"golden values in this file need re-baselining before they can be "
        f"trusted."
    )


# ==========================================================================
# top_n — ranking in SQL rather than shipping rows to the model
#
# 6 of 11 refusals in a 40-question coverage run were caused by the 200-row cap
# between the tools and the model, not by missing data. These assert the fix
# ranks server-side and reports the size of the set it did not send.
# ==========================================================================

def test_top_n_ranks_in_sql_and_reports_full_size():
    r = sales.get_sales("product", AUG_2026, metric="units_sold", top_n=5)
    assert r["meta"]["row_count"] == 5
    assert r["meta"]["full_row_count"] > 5, "full_row_count must describe the whole set"
    assert r["meta"]["top_n"] == 5
    vals = [x["value"] for x in r["rows"]]
    assert vals == sorted(vals, reverse=True), f"not ranked: {vals}"


def test_top_n_overrides_chronological_ordering():
    """top_n=3 by day means the three BIGGEST days, not the first three."""
    r = sales.get_sales("day", AUG_2026, metric="net_sales", top_n=3)
    assert r["meta"]["ordering"] == req(load_defs(), "ranking.sales.ordering_with_top_n")
    vals = [x["value"] for x in r["rows"]]
    assert vals == sorted(vals, reverse=True)
    assert r["meta"]["full_row_count"] == 31, "August has 31 days"


def test_full_row_count_equals_row_count_when_unlimited():
    """No extra COUNT is paid for when the result was never limited."""
    r = sales.get_sales("store", AUG_2026, metric="net_sales")
    assert r["meta"]["full_row_count"] == r["meta"]["row_count"] == 7
    assert r["meta"]["top_n"] is None


@pytest.mark.parametrize("bad", [0, -1, 1001, 2.5, "5"])
def test_top_n_rejects_out_of_range(bad):
    with pytest.raises(ValueError):
        sales.get_sales("store", AUG_2026, metric="net_sales", top_n=bad)


def test_stock_direction_picks_opposite_ends():
    """
    get_stock's natural order is emptiest-first. Without an explicit direction a
    caller asking for "the top 3" would silently get the three most negative.
    """
    lo = inventory.get_stock(store="Rockwell", top_n=3, direction="lowest")
    hi = inventory.get_stock(store="Rockwell", top_n=3, direction="highest")
    lo_q = [x["quantity_on_hand"] for x in lo["rows"]]
    hi_q = [x["quantity_on_hand"] for x in hi["rows"]]
    assert lo_q == sorted(lo_q), "lowest must ascend"
    assert hi_q == sorted(hi_q, reverse=True), "highest must descend"
    assert max(lo_q) < min(hi_q), "the two ends must not overlap"
    assert lo["meta"]["full_row_count"] == hi["meta"]["full_row_count"]
    assert lo["meta"]["direction"] == "lowest"
    assert hi["meta"]["direction"] == "highest"


def test_stock_rejects_unknown_direction():
    with pytest.raises(ValueError, match="direction"):
        inventory.get_stock(direction="sideways")


# ==========================================================================
# get_dead_stock — the anti-join the tool surface was missing
# ==========================================================================

def test_dead_stock_rows_are_genuinely_dead():
    """
    Verify the anti-join rather than trust it: every sampled product must hold
    stock AND have no sales in the same window, checked through get_sales.
    """
    window = ("2026-08-01", "2026-09-01")
    r = dead_stock.get_dead_stock(store="Fairview", window=window, top_n=5)
    assert r["rows"], "Fairview should hold some non-selling stock in August"

    for row in r["rows"]:
        assert row["quantity_on_hand"] > 0, "dead stock must still be held"
        check = sales.get_sales(
            [], window,
            filters={"product_id": row["product_id"], "store": "Fairview"},
            metric="units_sold",
        )
        sold = check["rows"][0]["value"] if check["rows"] else None
        assert not sold, f"{row['sku']} reported dead but sold {sold} units"


def test_dead_stock_window_widening_shrinks_the_list():
    """A longer window can only remove products — anything that sold is excluded."""
    short = dead_stock.get_dead_stock(store="Fairview", window=("2026-08-01", "2026-09-01"))
    long_ = dead_stock.get_dead_stock(store="Fairview", window=("2026-01-01", "2026-09-01"))
    assert long_["meta"]["full_row_count"] <= short["meta"]["full_row_count"]


def test_dead_stock_excludes_the_warehouse():
    """AJI BARN quantities are dispatch counters, not stock — out of scope."""
    with pytest.raises(ValueError):
        dead_stock.get_dead_stock(store="AJI BARN")


def test_dead_stock_reports_share_and_provenance():
    r = dead_stock.get_dead_stock(window="last_30_days")
    m = r["meta"]
    assert m["products_held_in_scope"] > m["full_row_count"] > 0
    assert m["notice"]["kind"] == "dead_stock_share"
    assert "stock_side" in m["temporal_mismatch"]
    assert m["reconciliation"]["applicable"] is False


def test_dead_stock_answers_never_sold_anywhere():
    """
    The Q8 shape that used to time out at 32.2s via a full product GROUP BY.
    The anti-join answers it in ~11s, inside the 30s statement_timeout.
    """
    import time
    started = time.perf_counter()
    r = dead_stock.get_dead_stock(window=("2024-01-01", "2026-09-03"))
    elapsed = time.perf_counter() - started
    assert r["meta"]["full_row_count"] > 0
    assert elapsed < 25.0, (
        f"all-time dead stock took {elapsed:.1f}s against a 30s statement_timeout"
    )


# ==========================================================================
# Retry classification — which failures are transient
#
# Exercises the decision, not the loop mechanics: no API call, no spend.
# ==========================================================================

@pytest.mark.parametrize("status,expected", [
    (400, False),   # includes credit-balance — retrying would triple a wasted run
    (401, False), (403, False), (404, False),
    (408, True), (409, True), (429, True),
    (500, True), (502, True), (503, True), (504, True), (529, True),  # 529 = overloaded
])
def test_retry_classifies_api_status(status, expected):
    import anthropic
    import httpx2
    from agent.loop import _is_transient
    exc = anthropic.APIStatusError(
        "x",
        response=httpx2.Response(status, request=httpx2.Request("POST", "https://x")),
        body=None,
    )
    assert _is_transient(exc) is expected


def test_retry_never_retries_tool_failures_or_refusals():
    """Tool refusals are correct answers. Repeating one cannot change it."""
    from agent.loop import _is_transient
    for exc in (
        ValueError("SKU matches 3 different products"),
        KeyError("metrics.yaml missing"),
        RuntimeError("Refusing to run: superuser"),
    ):
        assert _is_transient(exc) is False


# ==========================================================================
# The snapshot_date index
#
# Both pre-existing indexes lead with store_id/product_id, so a date-only
# predicate scanned all 4.88M rows (3.0-3.8s locally, ~3x that at CI latency).
# This fails if the index is dropped, rather than leaving a mysteriously slow suite.
# ==========================================================================

def test_snapshot_date_index_exists_and_is_fast():
    import time
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM pg_indexes WHERE tablename = 'inventory_snapshots' "
                "AND indexdef LIKE '%(snapshot_date)%'"
            )
            assert cur.fetchone()[0] >= 1, "idx_snapshots_date is missing"
            started = time.perf_counter()
            cur.execute("SELECT MIN(snapshot_date), MAX(snapshot_date) FROM inventory_snapshots")
            cur.fetchone()
            elapsed = time.perf_counter() - started
    assert elapsed < 2.0, (
        f"MIN/MAX(snapshot_date) took {elapsed:.2f}s - was 3.0s unindexed, 0.08s with "
        f"the index. A regression here means the index was dropped or is unused."
    )


# ==========================================================================
# The schema the MODEL sees — not the signature the tests call
#
# top_n shipped broken: the generator had no integer branch, so it declared
# {"type": "string"}, the model sent "10", and validate_top_n rejected it as a
# str. Every tool-level test passed because they call the functions directly
# with real ints. A 40-question run caught it only because George said so out
# loud: "top_n won't accept my value, so I'll omit it" — then made 25 calls.
# ==========================================================================

def test_schema_declares_integer_params_as_integers():
    from agent.loop import build_tool_schemas
    defs = load_defs()
    schemas = {t["name"]: t for t in build_tool_schemas(defs)}
    for name in ("get_sales", "get_stock", "get_dead_stock"):
        p = schemas[name]["input_schema"]["properties"]["top_n"]
        assert p["type"] == "integer", f"{name}.top_n is {p['type']}, not integer"
        assert p["minimum"] == req(defs, "ranking.min_top_n")
        assert p["maximum"] == req(defs, "ranking.max_top_n")


def test_schema_types_are_accepted_by_the_tools():
    """
    Round-trip: a value conforming to the declared schema type must not be
    rejected by the function. This is the gap that let top_n ship broken.
    """
    import json as _json
    from agent.loop import build_tool_schemas
    for tool in build_tool_schemas():
        for pname, spec in tool["input_schema"]["properties"].items():
            declared = spec.get("type") or "oneOf"
            assert declared in {"string", "integer", "boolean", "object", "array", "oneOf"}, (
                f"{tool['name']}.{pname} has unusable schema {_json.dumps(spec)[:80]}"
            )
    # The concrete case: an int within the declared bounds is accepted.
    r = sales.get_sales("store", AUG_2026, metric="net_sales", top_n=3)
    assert r["meta"]["row_count"] == 3


# ==========================================================================
# get_stock grouping — one call where N used to be needed
#
# A coverage run costed "which store has the most out-of-stock items" at 9
# calls: one per store plus a probe. top_n ranks WITHIN a result and cannot
# produce a per-store count; grouping can.
# ==========================================================================

def test_stock_group_by_store_answers_in_one_call():
    r = inventory.get_stock(state="out_of_stock", group_by="store")
    m = r["meta"]
    assert m["grain"] == "group", "grouped results must declare their grain"
    assert m["row_count"] == 8, "8 locations in the inventory scope"
    assert m["ordering"] == req(load_defs(), "ranking.stock_grouping.ordering")
    for row in r["rows"]:
        assert "product_count" in row and "total_quantity" in row
        assert "sku" not in row, "grouped rows are aggregates, not products"
    counts = [x["product_count"] for x in r["rows"]]
    assert counts == sorted(counts, reverse=True), "must rank by product_count"


def test_stock_group_by_store_labels_stores():
    """The grouped shape aliases i.store_id AS store; it must still be readable."""
    r = inventory.get_stock(state="out_of_stock", group_by="store")
    for row in r["rows"]:
        assert not row["store"].startswith("6"), f"raw id leaked: {row['store']}"
        assert row["store_id"], "the id must survive for joining"


def test_stock_grouped_counts_match_ungrouped():
    """A grouped count and a listed result must agree — same predicates."""
    grouped = inventory.get_stock(state="out_of_stock", store="Rockwell",
                                  group_by="store")
    listed = inventory.get_stock(state="out_of_stock", store="Rockwell", top_n=1)
    assert grouped["rows"][0]["product_count"] == listed["meta"]["full_row_count"]


def test_stock_group_by_state_uses_the_same_case_as_row_labels():
    """
    Grouping by state reuses the CASE the ungrouped path labels rows with, so a
    grouped count can never disagree with a listed row about a product's state.
    """
    r = inventory.get_stock(group_by="state")
    states = {x["state"] for x in r["rows"]}
    declared = {s["name"] for s in req(load_defs(), "inventory.states")}
    assert states <= declared | {"unclassified"}
    total = sum(x["product_count"] for x in r["rows"])
    assert total == inventory.get_stock()["meta"]["full_row_count"]


def test_stock_rejects_unknown_group_by():
    with pytest.raises(ValueError, match="cannot group by"):
        inventory.get_stock(group_by="colour")


def test_stock_group_by_is_in_the_schema_with_its_enum():
    """The model has to be able to see the valid groupings, not guess them."""
    from agent.loop import build_tool_schemas
    defs = load_defs()
    gs = {t["name"]: t for t in build_tool_schemas(defs)}["get_stock"]
    spec = gs["input_schema"]["properties"]["group_by"]
    enum = spec["oneOf"][0]["enum"]
    assert enum == req(defs, "ranking.stock_grouping.valid_group_by")


# ==========================================================================
# Convergence cap and the enumeration principle
# ==========================================================================

def test_convergence_cap_is_below_the_observed_worst_case():
    """
    The cap has to bite before the runaway cases seen in the coverage run:
    25, 23 and 20 calls on single questions.
    """
    from agent.loop import MAX_TOOL_CALLS, MAX_ITERATIONS
    assert MAX_TOOL_CALLS == 12
    assert MAX_TOOL_CALLS < 20, "must trigger before the observed worst case"
    assert MAX_ITERATIONS > 1


def test_system_prompt_tells_the_model_to_group_rather_than_enumerate():
    """
    top_n and group_by both existed and went unused: 0 of 14 logged calls
    passed top_n. The schema alone did not change behaviour, so the principle
    is stated in the prompt.
    """
    from agent.loop import SYSTEM_PROMPT
    lowered = SYSTEM_PROMPT.lower()
    assert "top_n" in lowered and "group_by" in lowered
    assert "full_row_count" in lowered
    for phrase in ("prefer one ranked or grouped query", "once per store"):
        assert phrase in lowered, f"missing guidance: {phrase!r}"
