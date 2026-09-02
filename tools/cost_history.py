"""
George — cost history tool.

One public function: get_cost_history(sku).

SEPARATE FROM get_purchasing BECAUSE THE GRAIN IS DIFFERENT. get_purchasing
aggregates purchase orders; this returns one row per document line that recorded
a cost for one SKU, in date order. Folding a series into an aggregating tool
would mean either losing the series or giving that tool two grains.

THREE BASES, NEVER BLENDED
--------------------------
The same column name means three different things depending on where it came
from, so each series is returned separately and labelled:

  purchase_order      what a SUPPLIER charged, on a dated PO line.
  transfer_valuation  what an internal stock transfer VALUED the goods at. This
                      is not a purchase price and does not become one by sitting
                      in a column called cost.
  current_catalog     products.cost — one current scalar, no history. Its date
                      is products.updated_at, which is row-level and moves for
                      unrelated edits (15 distinct dates across 3,678 products).

Averaging a supplier price with an internal valuation produces a number that is
neither, and it would look like a cost trend. There is no combined series and no
combined statistic anywhere in this tool's output.

ZERO MEANS "NOT ENTERED", NOT "FREE"
------------------------------------
KF27 "aji hellboy plum" moves on transfer after transfer at 0.00, and PO0604
carries 13 lines at 0.00 under a PHP 90,000.00 header. A series that silently
includes those reports a collapsing price for an item whose price was never
typed in. Zero-cost rows are RETURNED and FLAGGED, and excluded from every
min/max/mean.

Architecture rules (CLAUDE.md): vetted parameterized queries only, definitions
from metrics.yaml, {rows, meta} contract, read-only role.
"""

from __future__ import annotations

from typing import Any, Optional

from ._common import (
    DICT_ROW,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    load_defs as _load_defs,
    req as _req,
)

# One template per basis. Each is fixed SQL with bound parameters — no string
# building against user input beyond the LIMIT, which is an integer from
# metrics.yaml.
_PO_SERIES = """
SELECT po.external_id                AS document,
       po.created_at_source          AS at,
       po.supplier_name              AS counterparty,
       po.status                     AS status,
       pol.unit_cost                 AS unit_cost,
       pol.ordered_qty               AS quantity,
       pol.subtotal                  AS subtotal,
       pol.product_id                AS product_id,
       pol.product_name_raw          AS product_name,
       pol.sku_match                 AS sku_match
FROM purchase_order_lines pol
INNER JOIN purchase_orders po ON po.id = pol.purchase_order_id
WHERE pol.sku_raw = %(sku)s
  AND po.status <> ALL(%(cancelled_statuses)s)
ORDER BY po.created_at_source DESC
LIMIT {limit}
"""

_TRANSFER_SERIES = """
SELECT st.external_id                AS document,
       st.created_at_source          AS at,
       st.source_location_raw        AS source_location,
       st.target_location_raw        AS target_location,
       st.status                     AS status,
       stl.unit_cost                 AS unit_cost,
       stl.ordered_qty               AS quantity,
       stl.subtotal                  AS subtotal,
       stl.product_id                AS product_id,
       stl.product_name_raw          AS product_name,
       stl.sku_match                 AS sku_match
FROM stock_transfer_lines stl
INNER JOIN stock_transfers st ON st.id = stl.stock_transfer_id
WHERE stl.sku_raw = %(sku)s
  AND st.status <> ALL(%(cancelled_statuses)s)
ORDER BY st.created_at_source DESC
LIMIT {limit}
"""

_CATALOG = """
SELECT p.id, p.sku, p.name, p.cost, p.updated_at
FROM products p
WHERE p.sku = %(sku)s
ORDER BY p.id
"""


def _stats(costs: list[float]) -> Optional[dict]:
    """Min/max/mean over entered costs only. None when nothing was entered."""
    if not costs:
        return None
    return {
        "min": min(costs),
        "max": max(costs),
        "mean": round(sum(costs) / len(costs), 6),
        "observations": len(costs),
        "note": "computed over entered costs only; zero-cost lines are excluded",
    }


def _build_series(raw: list[dict], basis: str, bdef: dict) -> tuple[list[dict], dict]:
    """Turn query rows into labelled series rows plus that series' summary."""
    rows: list[dict] = []
    entered: list[float] = []
    not_entered = 0

    for r in raw:
        cost = float(r["unit_cost"]) if r["unit_cost"] is not None else None
        # Zero is "never typed in", not a price of nothing.
        cost_not_entered = cost is None or cost == 0.0
        if cost_not_entered:
            not_entered += 1
        else:
            entered.append(cost)

        row = {
            "basis": basis,
            "basis_means": bdef["means"],
            "document": r["document"],
            "at": r["at"].isoformat() if r["at"] else None,
            "status": r.get("status"),
            "unit_cost": cost,
            "cost_not_entered": cost_not_entered,
            "quantity": float(r["quantity"]) if r.get("quantity") is not None else None,
            "subtotal": float(r["subtotal"]) if r.get("subtotal") is not None else None,
            "product_id": r.get("product_id"),
            "product_name": r.get("product_name"),
            "sku_match": r.get("sku_match"),
        }
        if basis == "purchase_order":
            row["supplier"] = r.get("counterparty")
        else:
            row["from"] = r.get("source_location")
            row["to"] = r.get("target_location")
        rows.append(row)

    summary = {
        "basis": basis,
        "means": bdef["means"],
        "authoritative_for_cost": bdef["authoritative_for_cost"],
        "observations": len(rows),
        "costs_not_entered": not_entered,
        "statistics": _stats(entered),
    }
    return rows, summary


def get_cost_history(sku: str, top_n: Optional[int] = None) -> dict:
    """
    Unit cost for one SKU over time, as separately labelled series.

    Returns what a supplier charged, what internal transfers valued the goods at,
    and the current catalog cost — as THREE series that are never blended,
    averaged together or joined into one trend, because they mean three different
    things.

    Args:
        sku:   the product SKU. Matched CASE-SENSITIVELY: TKY28 and Tky28 are
               different products, and blending their costs would invent a price
               series belonging to neither.
        top_n: cap the rows returned per series, most recent first.

    Returns:
        {"rows": [...], "meta": {...}}. Every row carries its own `basis`. There
        is no combined figure anywhere in the result.
    """
    defs = _load_defs()
    cdefs = _req(defs, "cost_history")
    bases = _req(defs, "cost_history.bases")

    policy = _req(defs, "cost_history.sku_match")
    if policy != "case_sensitive":
        raise RuntimeError(
            f"metrics.yaml cost_history.sku_match is {policy!r}; this tool "
            f"implements case-sensitive matching only."
        )

    limit = top_n or _MAX_ROWS
    params = {
        "sku": sku,
        "cancelled_statuses": list(
            set(_req(defs, "storehub.purchase_orders.cancelled_statuses"))
            | set(_req(defs, "storehub.stock_transfers.cancelled_statuses"))
        ),
    }

    notices: list[dict] = []

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            cur.execute(_PO_SERIES.format(limit=limit), params)
            po_raw = [dict(r) for r in cur.fetchall()]

            cur.execute(_TRANSFER_SERIES.format(limit=limit), params)
            tr_raw = [dict(r) for r in cur.fetchall()]

            cur.execute(_CATALOG, {"sku": sku})
            catalog_raw = [dict(r) for r in cur.fetchall()]

    rows: list[dict] = []
    summaries: dict[str, dict] = {}

    po_rows, summaries["purchase_order"] = _build_series(
        po_raw, "purchase_order", bases["purchase_order"]
    )
    tr_rows, summaries["transfer_valuation"] = _build_series(
        tr_raw, "transfer_valuation", bases["transfer_valuation"]
    )
    rows.extend(po_rows)
    rows.extend(tr_rows)

    # ---- current catalog: a scalar, not a series --------------------------
    cat_bdef = bases["current_catalog"]
    catalog_rows = []
    for c in catalog_raw:
        cost = float(c["cost"]) if c["cost"] is not None else None
        catalog_rows.append({
            "basis": "current_catalog",
            "basis_means": cat_bdef["means"],
            "document": None,
            "at": c["updated_at"].isoformat() if c["updated_at"] else None,
            "at_is_reliable": False,
            "unit_cost": cost,
            "cost_not_entered": cost is None or cost == 0.0,
            "product_id": c["id"],
            "product_name": c["name"],
            "sku_match": "exact",
        })
    rows.extend(catalog_rows)
    summaries["current_catalog"] = {
        "basis": "current_catalog",
        "means": cat_bdef["means"],
        "authoritative_for_cost": cat_bdef["authoritative_for_cost"],
        "observations": len(catalog_rows),
        "is_a_series": False,
        "date_caveat": " ".join(str(cat_bdef["date_caveat"]).split()),
    }

    # ---- notices -----------------------------------------------------------
    if not rows:
        notices.append({
            "kind": "sku_not_found",
            "message": (
                f"No purchase order line, stock transfer line or catalog product "
                f"exists with SKU {sku!r}. Matching is case-sensitive, so check the "
                f"case: TKY28 and Tky28 are different products. This is an unknown "
                f"SKU, not a product with no cost history."
            ),
            "source": "metrics.yaml: products.sku.import_match",
        })

    if len(catalog_rows) > 1:
        notices.append({
            "kind": "ambiguous_sku",
            "message": (
                f"SKU {sku!r} matches {len(catalog_rows)} different products in the "
                f"catalog even case-sensitively: "
                + "; ".join(f"{c['product_id']} = {c['product_name']!r}" for c in catalog_rows)
                + ". Their costs are listed separately and are NOT combined."
            ),
            "source": "metrics.yaml: products.sku.ambiguity_policy",
        })

    not_entered_total = sum(
        s.get("costs_not_entered", 0) for s in summaries.values() if "costs_not_entered" in s
    )
    if not_entered_total:
        notices.append({
            "kind": "cost_not_entered",
            "message": (
                f"{not_entered_total} line(s) for this SKU record a unit cost of "
                f"zero. Zero means the cost was never entered, NOT that the item is "
                f"free. Those lines are shown but are excluded from every minimum, "
                f"maximum and mean, because including them would report a "
                f"collapsing price for an item whose price was simply never typed "
                f"in."
            ),
            "source": "metrics.yaml: cost_history.zero_cost_means",
        })

    if po_rows and tr_rows:
        notices.append({
            "kind": "bases_not_comparable",
            "message": (
                "This SKU has both supplier costs (from purchase orders) and "
                "internal transfer valuations. They are different measures and are "
                "reported as separate series: a transfer valuation is what the "
                "business valued goods at when moving them between its own "
                "locations, not a price anyone paid. Do not compare or average "
                "across the two."
            ),
            "source": "metrics.yaml: cost_history.never_blend_bases",
        })

    meta: dict[str, Any] = {
        "source_table": "purchase_order_lines + stock_transfer_lines + products",
        "filters_applied": [
            f"sku = {sku!r} (CASE-SENSITIVE)   # metrics.yaml: cost_history.sku_match",
            f"status NOT IN {tuple(sorted(params['cancelled_statuses']))}   "
            f"# cancelled documents excluded",
        ],
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "grain": "one row per document line that recorded a cost",
        "sku": sku,
        "row_count": len(rows),
        "row_limit": limit,
        "truncated": len(po_raw) == limit or len(tr_raw) == limit,
        "currency": _req(defs, "purchasing.currency"),

        # The contract that keeps the three apart. Stated on every result, not
        # only when a caller might get it wrong.
        "bases": summaries,
        "never_blend_bases": _req(defs, "cost_history.never_blend_bases"),
        "blending_note": (
            "purchase_order costs are what a supplier charged; "
            "transfer_valuation costs are internal valuations on stock moved "
            "between the company's own locations; current_catalog is a single "
            "present-day scalar with no history. They are three different "
            "measures. There is deliberately no combined series and no combined "
            "statistic in this result."
        ),
        "zero_cost_policy": (
            "Zero unit cost means NOT ENTERED, not free. Such rows are returned "
            "and flagged with cost_not_entered, and excluded from all statistics."
        ),
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
