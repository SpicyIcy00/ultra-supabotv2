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

from tools import inventory, movement, products, sales, vending
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
    ("inventory/barn-snapshot-products",
     lambda: inventory.get_stock(store="AJI BARN", as_of=SNAPSHOT_DAY)["meta"]["total_matching"], 3493),
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

    # ---- movement (4) ----------------------------------------------------
    ("movement/sh1-90d-net-change",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"))["meta"]["net_change"],
     -4817082.0),
    ("movement/sh1-90d-row-count",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"))["meta"]["row_count"], 90),
    ("movement/sh1-90d-nothing-explained",
     lambda: movement.get_movement(sku="SH1", date_range=("2026-06-03", "2026-09-01"))
     ["meta"]["reconciliation"]["explained_pct"], 0.0),
    # net_change is gap-immune (absolute balances); sum_of_observed_deltas is not.
    ("movement/gap-window-hides-665200g",
     lambda: round(
         movement.get_movement(sku="SH1", date_range=("2026-03-23", "2026-04-20"))["meta"]["net_change"]
         - movement.get_movement(sku="SH1", date_range=("2026-03-23", "2026-04-20"))["meta"]["sum_of_observed_deltas"],
         0), -665200.0),

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


def test_refuse_destination_scoped_movement():
    """No movement ledger exists; destination attribution is inference."""
    with pytest.raises(ValueError) as e:
        movement.get_movement(sku="SH1", to_store="Rockwell")
    msg = str(e.value)
    assert "not answerable" in msg
    # The refusal must carry the measured coverage, not just say no.
    assert "32.8%" in msg and "26.2%" in msg


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
                + list(req(defs, "filters.aji_barn.excluded_store_ids"))
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


def test_suppliers_subjects_remain_unsupported():
    """
    suppliers is definitions-only. If a procurement integration lands, these
    flags must be updated deliberately — this test is the tripwire.
    """
    defs = load_defs()
    for subject in ("purchase_orders", "lead_times", "last_cost"):
        assert req(defs, f"suppliers.{subject}.supported") is False
    assert req(defs, "suppliers.store_profit_supported") is False
    # And no profit metric may appear on the store side while that holds.
    assert "profit" not in req(defs, "metrics"), (
        "a store-side profit metric was added while "
        "suppliers.store_profit_supported is false — no per-line cost exists, so "
        "it would value historical sales at today's cost."
    )


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
