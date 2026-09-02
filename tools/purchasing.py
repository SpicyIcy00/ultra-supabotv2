"""
George — purchasing tool.

One public function: get_purchasing().

Answers questions about purchase orders imported from the StoreHub export.
Before that import existed this subject was refused outright; see
metrics.yaml suppliers.survey_2026_09_01 for what the database held instead.

THREE THINGS THIS TOOL REFUSES TO GET WRONG, all measured, all enforced here
rather than left to the caller:

  1. VALUE COMES FROM THE LINES. 12 of 227 purchase orders carry a header total
     that disagrees with their own lines — PO0604 says PHP 90,000.00 over 13
     lines summing to 0.00. Totals are summed from line subtotals, and any
     document in the result whose header disagrees raises a notice.

  2. "OPEN" IS NOT "NOT RECEIVED". 8 Open POs carry notes saying the goods
     arrived; nobody completed the document. Any answer scoped to Open status
     says so rather than presenting it as outstanding value.

  3. COMPLETION IS NOT DELIVERY. completion_lead_days measures the time until
     someone clicked Complete — PO0710's is two minutes, on a backdated
     correction. Delivery lead time is REFUSED, because the receipt date exists
     only as prose in a free-text notes field that is deliberately not parsed.

Architecture rules (CLAUDE.md): one SELECT template, predicates and expressions
from definitions/metrics.yaml plus bound parameters, {rows, meta} contract,
read-only role via tools/_common.connect().
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from ._common import (
    DICT_ROW,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    label_store as _label_store,
    load_defs as _load_defs,
    req as _req,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)

# The one template. Every clause below is either a literal join, a fragment read
# from metrics.yaml, or a bound parameter.
_SELECT = """
SELECT {select_list}
FROM purchase_orders po
{line_join}
WHERE {predicates}
{group_by}
ORDER BY {ordering}
LIMIT {limit}
"""

_COUNT = """
SELECT COUNT(*) AS n FROM (
  SELECT {group_list}
  FROM purchase_orders po
  {line_join}
  WHERE {predicates}
  {group_by}
) s
"""

# Groupings that need the line table joined. A document-grain measure grouped
# only by document attributes never pays for the join.
_LINE_GROUPINGS = {"product", "category"}
_LINE_MEASURES = {"ordered_value", "ordered_qty", "received_qty"}


def _resolve_window(defs: dict, date_range: Any) -> tuple[Optional[str], dict]:
    """Resolve date_range to a preset name or an explicit pair of Manila dates."""
    presets = _req(defs, "sales_day.presets")
    if date_range is None:
        return None, {"kind": "all_time", "note": "no date filter applied"}
    if isinstance(date_range, str):
        if date_range not in presets:
            raise ValueError(
                f"Unknown date_range {date_range!r}. Valid presets: "
                f"{', '.join(sorted(presets))}. Or pass an explicit (start, end) "
                f"pair of Manila dates."
            )
        return date_range, {"kind": "preset", "name": date_range}

    if isinstance(date_range, dict):
        start, end = date_range.get("start"), date_range.get("end")
    elif isinstance(date_range, (tuple, list)) and len(date_range) == 2:
        start, end = date_range
    else:
        raise ValueError(
            "date_range must be a preset name, a (start, end) pair, or "
            "{'start': ..., 'end': ...}."
        )
    start = date.fromisoformat(start) if isinstance(start, str) else start
    end = date.fromisoformat(end) if isinstance(end, str) else end
    if end <= start:
        raise ValueError(
            f"date_range end ({end}) must be after start ({start}). Ranges are "
            f"half-open: [start, end)."
        )
    return None, {
        "kind": "explicit",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "convention": "half-open [start, end)",
    }


def get_purchasing(
    measure: str = "ordered_value",
    group_by: Any = None,
    supplier: Optional[str] = None,
    store: Optional[str] = None,
    sku: Optional[str] = None,
    status: Optional[str] = None,
    external_id: Optional[str] = None,
    date_range: Any = None,
    include_cancelled: bool = False,
    top_n: Optional[int] = None,
) -> dict:
    """
    Purchase orders: what was ordered, from whom, for where, and how much of it.

    Args:
        measure:    which figure to compute. ordered_value (PHP, the default) is
                    the only measure additive across products; ordered_qty and
                    received_qty mix units and are only meaningful per product.
                    completion_lead_days measures time to being marked complete
                    in StoreHub, NOT delivery time.
        group_by:   one grouping or a list. supplier, store, status, product,
                    category, day, week, month.
        supplier:   free-text supplier name, matched exactly. There is no
                    supplier master and names are never deduplicated.
        store:      destination location.
        sku:        restrict to lines for one SKU (case-sensitive).
        status:     PO status. NOTE: 'Open' means nobody completed the document,
                    NOT that the goods have not arrived.
        external_id: one PO number, e.g. 'PO0710'.
        date_range: preset name from metrics.yaml, or an explicit (start, end)
                    pair of Manila dates, half-open. Filters on PO creation date.
                    Omit for all time.
        include_cancelled: cancelled POs are excluded by default.
        top_n:      return only the N largest rows by the measure.

    Returns:
        {"rows": [...], "meta": {...}}. meta carries source_table,
        filters_applied, snapshot_timestamp, and any notices that must be
        surfaced with the figure.
    """
    defs = _load_defs()
    pdefs = _req(defs, "purchasing")
    measures = _req(defs, "purchasing.measures")

    if measure not in measures:
        raise ValueError(
            f"Unknown measure {measure!r}. Valid: {', '.join(sorted(measures))}. "
            f"(metrics.yaml: purchasing.measures)"
        )
    mdef = measures[measure]

    groups = [group_by] if isinstance(group_by, str) else list(group_by or [])
    valid = mdef.get("valid_group_by", [])
    for g in groups:
        if g not in valid:
            raise ValueError(
                f"measure={measure!r} ({mdef['grain']} grain) cannot be grouped "
                f"by {g!r}. Valid: {', '.join(valid)}. "
                f"(metrics.yaml: purchasing.measures.{measure}.valid_group_by)"
            )

    top_n = _validate_top_n(defs, top_n)
    preset, window_meta = _resolve_window(defs, date_range)

    # Store scope for purchasing is every location a PO can be destined for,
    # including the closed warehouse — a historical question about MACOPA is
    # legitimate. See filters.closed_locations: closed locations are excluded
    # from CURRENT STATE, not from history.
    catalog: dict[str, dict] = {}
    for group in ("active_retail", "warehouse", "pending_retail", "closed"):
        for entry in _req(defs, f"stores.{group}"):
            catalog[entry["id"]] = entry

    notices: list[dict] = []
    exprs = _req(defs, "purchasing.group_expressions")

    needs_lines = measure in _LINE_MEASURES or bool(_LINE_GROUPINGS & set(groups)) or sku
    line_join = (
        "INNER JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id"
        if needs_lines else ""
    )

    # ---- predicates, every one either from the yaml or a bound parameter ----
    predicates: list[str] = ["TRUE"]
    params: dict[str, Any] = {}
    filters_applied: list[str] = []

    if not include_cancelled:
        cancelled = _req(defs, "purchasing.cancelled_statuses")
        predicates.append("po.status <> ALL(%(cancelled_statuses)s)")
        params["cancelled_statuses"] = list(cancelled)
        filters_applied.append(
            f"status NOT IN {tuple(cancelled)}   "
            f"# metrics.yaml: purchasing.cancelled_statuses"
        )

    if external_id is not None:
        predicates.append("po.external_id = %(external_id)s")
        params["external_id"] = external_id
        filters_applied.append(f"external_id = {external_id!r}")

    if supplier is not None:
        predicates.append("po.supplier_name = %(supplier)s")
        params["supplier"] = supplier
        filters_applied.append(
            f"supplier_name = {supplier!r}   "
            f"# exact match; no supplier master (metrics.yaml: "
            f"suppliers.purchase_orders.supplier_master_exists)"
        )

    if store is not None:
        wanted = str(store).strip().lower()
        matched = [
            sid for sid, e in catalog.items()
            if wanted in (sid.lower(),
                          str(e.get("display_name", "")).lower(),
                          str(e.get("name", "")).lower())
        ]
        if not matched:
            valid_names = sorted(e.get("display_name") or e["name"] for e in catalog.values())
            raise ValueError(
                f"Unknown store {store!r}. Valid: {', '.join(valid_names)}. "
                f"(Resolved from definitions/metrics.yaml, not from the stores "
                f"table.)"
            )
        predicates.append("po.target_store_id = ANY(%(store_ids)s)")
        params["store_ids"] = matched
        filters_applied.append(
            f"target_store_id IN ({', '.join(_label_store(catalog, s) for s in matched)})"
        )

    if sku is not None:
        # Case-sensitive, per metrics.yaml products.sku.import_match. TKY28 and
        # Tky28 are different products.
        predicates.append("pol.sku_raw = %(sku)s")
        params["sku"] = sku
        filters_applied.append(
            f"sku = {sku!r} (case-sensitive)   "
            f"# metrics.yaml: products.sku.import_match"
        )

    if status is not None:
        predicates.append("po.status = %(status)s")
        params["status"] = status
        filters_applied.append(f"status = {status!r}")
        if status == "Open" and _req(defs, "purchasing.open_is_not_outstanding"):
            notices.append({
                "kind": "open_is_not_unreceived",
                "message": (
                    "'Open' means the purchase order was never marked complete in "
                    "StoreHub. It does NOT mean the goods have not arrived — 8 Open "
                    "POs carry notes recording a delivery date, including one worth "
                    "PHP 327,320. This figure is not outstanding value."
                ),
                "source": "metrics.yaml: purchasing.open_is_not_outstanding",
            })

    if mdef.get("requires"):
        predicates.append(mdef["requires"])
        filters_applied.append(
            f"{mdef['requires']}   # required by measure {measure!r}"
        )

    date_col = _req(defs, "purchasing.date_column")
    if window_meta["kind"] == "preset":
        p = _req(defs, f"sales_day.presets.{preset}")
        predicates.append(f"{date_col} >= ({p['start']})")
        predicates.append(f"{date_col} <  ({p['end']})")
        filters_applied.append(
            f"{date_col} within {preset} (Asia/Manila, half-open)   "
            f"# metrics.yaml: sales_day.presets.{preset}"
        )
    elif window_meta["kind"] == "explicit":
        predicates.append(f"{date_col} >= (%(start)s)::timestamp AT TIME ZONE 'Asia/Manila'")
        predicates.append(f"{date_col} <  (%(end)s)::timestamp AT TIME ZONE 'Asia/Manila'")
        params["start"] = window_meta["start"]
        params["end"] = window_meta["end"]
        filters_applied.append(
            f"{date_col} >= {window_meta['start']} AND < {window_meta['end']} "
            f"(Asia/Manila, half-open)   # metrics.yaml: sales_day"
        )
    else:
        filters_applied.append("no date filter (all imported purchase orders)")

    # ---- select list and grouping -----------------------------------------
    group_sql = [exprs[g] for g in groups]
    select_parts = [f"{exprs[g]} AS {g}" for g in groups]
    select_parts.append(f"{mdef['sql']} AS value")
    # Always report how many documents stand behind a row, and how many of them
    # have a header total that disagrees with their lines.
    select_parts.append("COUNT(DISTINCT po.id) AS document_count")
    select_parts.append(
        "COUNT(DISTINCT po.id) FILTER (WHERE po.header_total_reconciles IS FALSE) "
        "AS documents_with_header_mismatch"
    )
    if measure == "received_qty":
        select_parts.append(
            "COUNT(*) FILTER (WHERE pol.received_qty IS NULL) AS lines_without_received_qty"
        )
        select_parts.append("COUNT(*) AS lines_total")

    group_clause = f"GROUP BY {', '.join(group_sql)}" if group_sql else ""
    ordering = (
        f"{group_sql[0]} ASC" if groups and groups[0] in ("day", "week", "month") and not top_n
        else "value DESC NULLS LAST"
    )

    sql = _SELECT.format(
        select_list=",\n       ".join(select_parts),
        line_join=line_join,
        predicates="\n  AND ".join(predicates),
        group_by=group_clause,
        ordering=ordering,
        limit=top_n or _MAX_ROWS,
    )

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            cur.execute(sql, params)
            raw = [dict(r) for r in cur.fetchall()]

            truncated = len(raw) == (top_n or _MAX_ROWS)
            if truncated and group_sql:
                cur.execute(
                    _COUNT.format(
                        group_list=", ".join(group_sql),
                        line_join=line_join,
                        predicates="\n  AND ".join(predicates),
                        group_by=group_clause,
                    ),
                    params,
                )
                full_row_count = cur.fetchone()["n"]
            else:
                full_row_count = len(raw)

            # Coverage of the imported window. Every record-backed answer states
            # what it can see, because "no POs in July" and "July was never
            # imported" are different answers.
            cur.execute(
                "SELECT MIN(created_at_source) AS first, MAX(created_at_source) AS last, "
                "       COUNT(*) AS documents FROM purchase_orders"
            )
            coverage = cur.fetchone()

    # ---- rows --------------------------------------------------------------
    rows: list[dict] = []
    header_mismatches = 0
    for r in raw:
        row: dict[str, Any] = {}
        for g in groups:
            v = r[g]
            row[g] = _label_store(catalog, v) if g == "store" and v else v
            if g == "store":
                row["store_id"] = r[g]
        row["value"] = float(r["value"]) if r["value"] is not None else None
        row["measure"] = measure
        row["unit"] = mdef["unit"]
        row["document_count"] = r["document_count"]
        if r["documents_with_header_mismatch"]:
            row["documents_with_header_mismatch"] = r["documents_with_header_mismatch"]
            header_mismatches += r["documents_with_header_mismatch"]
        if measure == "received_qty":
            row["lines_without_received_qty"] = r["lines_without_received_qty"]
            row["lines_total"] = r["lines_total"]
        rows.append(row)

    # ---- notices -----------------------------------------------------------
    if header_mismatches:
        notices.append({
            "kind": "header_total_mismatch",
            "message": (
                f"{header_mismatches} purchase order(s) behind this figure have a "
                f"document total that disagrees with the sum of their own lines. "
                f"This figure is summed from the LINES, which are itemised and "
                f"carry the quantity and unit cost that produced them. The header "
                f"totals were imported unchanged and were not used."
            ),
            "source": "metrics.yaml: purchasing.value_basis",
        })

    if measure in ("ordered_qty", "received_qty") and "product" not in groups:
        notices.append({
            "kind": "quantity_not_additive",
            "message": (
                "Quantities are not additive across products. Units differ per "
                "product — Aji Mix moves in grams while Haw Flakes moves in packs "
                "— and the export records no unit, so this total adds grams to "
                "packs. Group by product, or use ordered_value (PHP), which is "
                "additive."
            ),
            "source": "metrics.yaml: purchasing.quantity_additive_across_products",
        })

    if measure == "received_qty":
        missing = sum(r.get("lines_without_received_qty") or 0 for r in rows)
        total = sum(r.get("lines_total") or 0 for r in rows)
        if missing:
            notices.append({
                "kind": "received_quantity_coverage",
                "message": (
                    f"{missing} of {total} lines record no received quantity at all "
                    f"(blank in the export, stored NULL — not zero). Received "
                    f"quantity is sparse and is never reconciled to ordered: it is "
                    f"blank on Open POs and 0 on some Completed ones whose notes say "
                    f"the goods arrived. This total covers only the lines that "
                    f"recorded a figure."
                ),
                "source": "metrics.yaml: storehub.purchase_orders.received_quantity",
            })

    if measure == "completion_lead_days":
        notices.append({
            "kind": "completion_not_delivery",
            "message": (
                "This is SYSTEM COMPLETION LATENCY — the time until someone marked "
                "the purchase order complete in StoreHub — not delivery time. "
                "PO0710 was created and completed two minutes apart as a backdated "
                "inventory correction, and PO0707 shows nearly three days while its "
                "own note records the goods arriving on the day it was created. "
                "Delivery lead time is not answerable from this data."
            ),
            "source": "metrics.yaml: suppliers.lead_times.completion_latency",
        })

    meta: dict[str, Any] = {
        "source_table": (
            "purchase_orders + purchase_order_lines" if needs_lines else "purchase_orders"
        ),
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "measure": measure,
        "measure_grain": mdef["grain"],
        "measure_sql": mdef["sql"],
        "unit": mdef["unit"],
        "currency": _req(defs, "purchasing.currency"),
        "group_by": groups,
        "window": window_meta,
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "full_row_count_note": " ".join(_req(defs, "ranking.full_row_count_note").split()),
        "ordering": ordering,
        "truncated": truncated,
        "row_limit": top_n or _MAX_ROWS,

        # Mandatory: a record-backed answer states the window it can see, so
        # "no purchase orders in July" is distinguishable from "July was never
        # imported".
        "coverage": {
            "documents_imported": coverage["documents"],
            "first_created": coverage["first"].isoformat() if coverage["first"] else None,
            "last_created": coverage["last"].isoformat() if coverage["last"] else None,
            "note": (
                "Purchase orders exist only for windows that have been imported "
                "from the StoreHub export. An empty result outside this range "
                "means the data was never loaded, not that nothing was ordered."
            ),
        },

        "value_basis": _req(defs, "purchasing.value_basis"),
        "value_basis_note": (
            "Value is summed from line subtotals, never from the document header "
            "total: 12 of 227 purchase orders disagree with their own lines."
        ),
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
