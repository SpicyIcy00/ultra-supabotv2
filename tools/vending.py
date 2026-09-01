"""
George — vending tool (AJI CMG / Weimi machines, brand "Hello Aji").

Two public functions:
    get_vending()        — sales from the order-line fact table
    get_vending_stock()  — live machine planogram (different shape, own function)

This is a SEPARATE DATA SOURCE from the StoreHub store tables. goods_id has
nothing to do with products.id and machines are not rows in `stores`. Nothing
here joins, unions or compares the two domains. Note that "AJI CMG" also exists
as a `stores` row with its own store-side inventory — that is NOT this data.

Two traps this module is built around, both confirmed against live data:
  - Raw Weimi money columns are INTEGER CENTS (2000 = PHP 20.00). This module
    reads the _php views, which are already pesos, so the trap cannot be hit.
    Never divide a _php column by 100.
  - vending_orders.currency says 'CNY' on all 9,219 rows. That is a Weimi
    hardcoding bug; the real currency is PHP. The raw column is never passed
    through to a caller.

Architecture rules (see CLAUDE.md): one SELECT template per function,
definitions read from definitions/metrics.yaml, {rows, meta} contract,
read-only role via tools/_common.connect().
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional


from ._common import (
    DICT_ROW,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    load_defs as _load_defs,
    req as _req,
)

# Groupings that need the orders view joined (payment method lives there).
_ORDER_GROUPINGS = {"payment_method"}


def _resolve_window(defs: dict, date_range: Any) -> tuple[str, str, dict, dict]:
    """
    Resolve date_range to half-open [start, end) timestamptz, Manila.

    Reuses sales_day.presets so "last_30_days" means the same thing here as in
    the sales tool rather than acquiring a second, vending-specific definition.
    """
    presets = _req(defs, "sales_day.presets")

    if isinstance(date_range, str):
        if date_range not in presets:
            raise ValueError(
                f"Unknown date_range {date_range!r}. Valid presets: "
                f"{', '.join(sorted(presets))}. Or pass an explicit "
                f"(start, end) pair of Manila dates."
            )
        p = presets[date_range]
        return p["start"], p["end"], {}, {
            "kind": "preset",
            "name": date_range,
            "includes_partial_day": p.get("includes_partial_day"),
        }

    if isinstance(date_range, dict):
        start, end = date_range.get("start"), date_range.get("end")
    elif isinstance(date_range, (tuple, list)) and len(date_range) == 2:
        start, end = date_range
    else:
        raise ValueError(
            "date_range must be a preset name, a (start, end) pair, or "
            "{'start': ..., 'end': ...}."
        )
    if start is None or end is None:
        raise ValueError("date_range needs both a start and an end.")
    start = date.fromisoformat(start) if isinstance(start, str) else start
    end = date.fromisoformat(end) if isinstance(end, str) else end
    if end <= start:
        raise ValueError(
            f"date_range end ({end}) must be after start ({start}). Ranges are "
            f"half-open: [start, end)."
        )
    # The ::timestamp cast is load-bearing — metrics.yaml
    # sales_day.expressions.date_start explains why `date AT TIME ZONE` is wrong.
    return (
        "(%(win_start)s)::timestamp AT TIME ZONE 'Asia/Manila'",
        "(%(win_end)s)::timestamp AT TIME ZONE 'Asia/Manila'",
        {"win_start": start, "win_end": end},
        {
            "kind": "explicit",
            "start": start.isoformat(),
            "end": end.isoformat(),
            "convention": "half-open [start, end)",
        },
    )


def _group_expressions(defs: dict, group_by: list[str]) -> tuple[list, list]:
    buckets = _req(defs, "vending.buckets")
    select_terms: list[tuple[str, str]] = []
    group_terms: list[str] = []
    for g in group_by:
        if g == "machine":
            expr = _req(defs, "vending.machine_label_sql")
            select_terms.append(("machine", expr))
            select_terms.append(("device_code", "l.device_code"))
            group_terms.extend([expr, "l.device_code"])
        elif g in buckets:
            select_terms.append((g, buckets[g]))
            group_terms.append(buckets[g])
        elif g == "product":
            select_terms.append(("goods_id", "l.goods_id"))
            select_terms.append(("product", "l.goods_name"))
            group_terms.extend(["l.goods_id", "l.goods_name"])
        elif g == "category":
            expr = _req(defs, "vending.category_normalization.sql")
            select_terms.append(("category", expr))
            group_terms.append(expr)
        elif g == "payment_method":
            # ext is TEXT, not JSON, despite the docs — the ::jsonb cast is
            # required. See metrics.yaml vending.payment_method_sql.
            expr = _req(defs, "vending.payment_method_sql")
            select_terms.append(("payment_method", expr))
            group_terms.append(expr)
        else:
            raise ValueError(f"Unknown group_by {g!r}.")
    return select_terms, group_terms


def get_vending(
    group_by: Any = None,
    date_range: Any = "last_30_days",
    machine: Optional[str] = None,
    metric: str = "revenue",
) -> dict:
    """
    Vending sales figures.

    Args:
        group_by:   str or list of: machine, day, week, month, product,
                    category, payment_method. [] gives a grand total.
        date_range: preset name from metrics.yaml, or an explicit (start, end)
                    pair of Manila calendar dates. Half-open.
        machine:    device_name (case-insensitive substring) or exact
                    device_code. None = all machines.
        metric:     revenue, units, orders, profit, non_success_vends.

    Returns:
        {"rows": [...], "meta": {...}}. Money is PHP — never CNY, whatever the
        raw currency column says. A non-empty meta["notice"] MUST be surfaced.
    """
    defs = _load_defs()
    all_metrics = _req(defs, "vending.metrics")
    if metric not in all_metrics:
        raise ValueError(
            f"Unknown vending metric {metric!r}. Valid: "
            f"{', '.join(sorted(all_metrics))}."
        )
    mdef = all_metrics[metric]

    if group_by is None:
        group_by = []
    elif isinstance(group_by, str):
        group_by = [group_by]
    group_by = list(group_by)

    valid = _req(mdef, "valid_group_by")
    for g in group_by:
        if g not in valid:
            raise ValueError(
                f"vending metric={metric!r} cannot be grouped by {g!r}. "
                f"metrics.yaml allows: {', '.join(valid)}."
            )

    notices: list[dict] = []
    start_sql, end_sql, win_params, window_meta = _resolve_window(defs, date_range)

    # ---- status predicate ------------------------------------------------
    # The documented failure code 3 does not exist in this data (measured
    # distribution: 1 -> 11,900, 2 -> 5, 64 -> 2, 3 -> 0). Non-success is
    # therefore `<> 1`, not `= 3`, or the report is empty forever.
    if mdef.get("non_success_only"):
        status_sql = _req(defs, "vending.non_success_sql")
        status_note = "shipment_status <> 1 (the documented '3' does not exist)"
    else:
        status_sql = _req(defs, "vending.success_sql")
        status_note = "successful vends only"

    predicates = [
        status_sql,
        f"{_req(defs, 'vending.time_column')} >= {start_sql}",
        f"{_req(defs, 'vending.time_column')} <  {end_sql}",
    ]
    params: dict[str, Any] = dict(win_params)

    filters_applied = [
        f"{status_sql}   # metrics.yaml: vending ({status_note})",
    ]
    if window_meta["kind"] == "explicit":
        filters_applied.append(
            f"shipment_time >= {window_meta['start']} AND < {window_meta['end']} "
            f"(Asia/Manila, half-open)   # metrics.yaml: sales_day"
        )
    else:
        filters_applied.append(
            f"shipment_time within preset {window_meta['name']!r} "
            f"(Asia/Manila, half-open)   # metrics.yaml: sales_day.presets"
        )

    if machine is not None:
        predicates.append(
            "(l.device_code = %(machine)s OR l.device_name ILIKE %(machine_like)s)"
        )
        params["machine"] = str(machine).strip()
        params["machine_like"] = f"%{machine}%"
        filters_applied.append(
            f"device_code = {machine!r} OR device_name ILIKE '%{machine}%'   # caller"
        )

    needs_orders = bool(_ORDER_GROUPINGS & set(group_by))
    from_sql = f"{_req(defs, 'vending.source_view')} l"
    source_table = _req(defs, "vending.source_view")
    if needs_orders:
        from_sql += (
            f"\n  LEFT JOIN {_req(defs, 'vending.orders_view')} o "
            f"ON o.trade_no_in = l.order_trade_no_in"
        )
        source_table += f" + {_req(defs, 'vending.orders_view')}"

    select_terms, group_terms = _group_expressions(defs, group_by)
    metric_sql = _req(mdef, "sql")
    select_sql = ",\n       ".join(
        [f"{expr} AS {alias}" for alias, expr in select_terms]
        + [f"{metric_sql} AS value"]
    )
    where_sql = "\n  AND ".join(predicates)
    group_sql = f"\nGROUP BY {', '.join(group_terms)}" if group_terms else ""
    time_cols = [a for a, _ in select_terms if a in ("day", "week", "month")]
    if time_cols:
        order_sql = f"\nORDER BY {', '.join(time_cols)} ASC"
    elif group_terms:
        order_sql = "\nORDER BY value DESC NULLS LAST"
    else:
        order_sql = ""

    sql = (
        f"SELECT {select_sql}\n"
        f"FROM {from_sql}\n"
        f"WHERE {where_sql}"
        f"{group_sql}{order_sql}\n"
        f"LIMIT {_MAX_ROWS}"
    )

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            truncated = len(rows) == _MAX_ROWS

            # ---- cost coverage --------------------------------------------
            # Mandatory whenever profit is returned: cost is missing on 72.7%
            # of lines database-wide, and a profit figure without that number
            # beside it is misleading rather than merely incomplete.
            cost_coverage: Optional[dict] = None
            if metric == "profit" or _req(defs, "vending.profit_flag_mandatory"):
                cur.execute(
                    f"SELECT COUNT(*) AS lines, "
                    f"       COUNT(*) FILTER (WHERE l.missing_cost) AS missing, "
                    f"       COALESCE(SUM(l.real_price_php) FILTER (WHERE l.missing_cost), 0) AS uncosted_revenue "
                    f"FROM {_req(defs, 'vending.source_view')} l WHERE {where_sql}",
                    params,
                )
                cc = cur.fetchone()
                pct = round(100.0 * cc["missing"] / cc["lines"], 1) if cc["lines"] else None
                cost_coverage = {
                    "lines": cc["lines"],
                    "lines_missing_cost": cc["missing"],
                    "missing_cost_pct": pct,
                    "revenue_with_no_cost": float(cc["uncosted_revenue"]),
                    "note": (
                        "goods_purchase_cost = 0 means the cost was never entered "
                        "in Weimi, NOT that the item is free — profit equals "
                        "revenue on those lines and is overstated. Database-wide "
                        "this affects 8,659 of 11,907 lines (72.7%)."
                    ),
                }
                if metric == "profit" and cc["missing"]:
                    notices.append({
                        "kind": "profit_overstated",
                        "message": (
                            f"Profit is OVERSTATED: {cc['missing']} of {cc['lines']} "
                            f"lines ({pct}%) in this window have no purchase cost "
                            f"recorded, covering PHP "
                            f"{float(cc['uncosted_revenue']):,.2f} of revenue that "
                            f"is counted as pure profit."
                        ),
                        "source": "definitions/metrics.yaml: vending.profit_overstated_pct",
                    })

            # ---- category coverage ----------------------------------------
            category_coverage: Optional[dict] = None
            if "category" in group_by:
                cur.execute(
                    f"SELECT COUNT(*) AS lines, "
                    f"       COUNT(*) FILTER (WHERE g.goods_id IS NULL) AS orphan_lines, "
                    f"       COUNT(DISTINCT l.goods_id) FILTER (WHERE g.goods_id IS NULL) AS orphan_goods, "
                    f"       COUNT(*) FILTER (WHERE g.goods_id IS NOT NULL "
                    f"                          AND NULLIF(g.category_name,'') IS NULL) AS untagged_lines "
                    f"FROM {_req(defs, 'vending.source_view')} l "
                    f"LEFT JOIN vending_goods g ON g.goods_id = l.goods_id "
                    f"WHERE {where_sql}",
                    params,
                )
                cvg = cur.fetchone()
                known = cvg["lines"] - cvg["orphan_lines"] - cvg["untagged_lines"]
                category_coverage = {
                    "lines": cvg["lines"],
                    "lines_with_a_category": known,
                    "coverage_pct": round(100.0 * known / cvg["lines"], 1) if cvg["lines"] else None,
                    "orphan_lines": cvg["orphan_lines"],
                    "orphan_goods_ids": cvg["orphan_goods"],
                    "untagged_lines": cvg["untagged_lines"],
                    "note": (
                        "Two independent gaps, both landing in 'Uncategorized': "
                        "goods_ids with no row in vending_goods at all (orphans), "
                        "and catalog products with no category_name. Database-wide, "
                        "38 goods_ids covering 29.7% of lines are orphans, and 98 "
                        "of 151 catalog products are untagged."
                    ),
                }
                if cvg["lines"] and known / cvg["lines"] < 0.75:
                    notices.append({
                        "kind": "low_category_coverage",
                        "message": (
                            f"Only {category_coverage['coverage_pct']}% of lines in "
                            f"this window have a real category "
                            f"({cvg['orphan_lines']} lines from "
                            f"{cvg['orphan_goods']} goods_ids are not in the "
                            f"catalog at all; {cvg['untagged_lines']} are catalogued "
                            f"but untagged). This breakdown speaks for a minority "
                            f"of sales."
                        ),
                        "source": "definitions/metrics.yaml: vending.orphan_lines_pct",
                    })

    for r in rows:
        if isinstance(r.get("value"), Decimal):
            r["value"] = float(r["value"])
        for k in ("day", "week", "month"):
            if isinstance(r.get(k), date):
                r[k] = r[k].isoformat()

    meta: dict[str, Any] = {
        "source_table": source_table,
        "domain": "vending (Weimi / AJI CMG) — NOT the StoreHub store domain",
        "metric": metric,
        "metric_sql": metric_sql,
        "metric_unit": _req(mdef, "unit"),
        "group_by": group_by,
        "window": window_meta,
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "row_count": len(rows),
        "truncated": truncated,
        "row_limit": _MAX_ROWS,
        "currency": _req(defs, "vending.currency"),
        "currency_note": (
            "PHP. The raw vending_orders.currency column says 'CNY' on all 9,219 "
            "rows — a Weimi hardcoding bug. It is never passed through."
        ),
        "money_source": (
            f"{_req(defs, 'vending.source_view')} — already pesos, never divided "
            f"again. Raw Weimi money columns are integer cents."
        ),
        "status_semantics": {
            "success_status": _req(defs, "vending.success_status"),
            "documented_failure_status_exists": _req(
                defs, "vending.documented_failure_status_exists"
            ),
            "observed_distribution": _req(defs, "vending.status_distribution"),
            "note": (
                "business_rules.yaml documents 3 = FAILED, but no row has status 3. "
                "Non-success is defined as <> 1. The 5 status-2 lines have NULL "
                "shipment_time and are dropped by any time-bounded query."
            ),
        },
        "gap_filled": False,
    }
    if cost_coverage is not None:
        meta["cost_coverage"] = cost_coverage
    if category_coverage is not None:
        meta["category_coverage"] = category_coverage
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}


def get_vending_stock(machine: Optional[str] = None, empty_only: bool = False) -> dict:
    """
    Current stock in the vending machines (live planogram).

    Separate from get_vending() because the shape is genuinely different:
    vending_aisles is current state with NO history and no sales, so it cannot
    be date-filtered at all. Forcing it into a date_range signature would invite
    a caller to ask for "stock last month", which this data cannot answer.

    Args:
        machine:    device_name (case-insensitive substring) or exact device_code.
        empty_only: restrict to slots with curr_stock = 0.

    Returns:
        {"rows": [...], "meta": {...}}. meta.staleness is always present.
    """
    defs = _load_defs()
    predicates = ["true"]
    params: dict[str, Any] = {}
    filters_applied: list[str] = []

    if machine is not None:
        predicates.append(
            "(a.device_code = %(machine)s OR d.device_name ILIKE %(machine_like)s)"
        )
        params["machine"] = str(machine).strip()
        params["machine_like"] = f"%{machine}%"
        filters_applied.append(
            f"device_code = {machine!r} OR device_name ILIKE '%{machine}%'   # caller"
        )
    if empty_only:
        predicates.append("a.curr_stock = 0")
        filters_applied.append("a.curr_stock = 0   # caller")
    if not filters_applied:
        filters_applied.append("none — all slots")

    where_sql = " AND ".join(predicates)

    # vending_aisles.price is CENTS and is NOT covered by any _php view, so it is
    # the one place in this module where the division is done here. Everything
    # else reads a view.
    sql = f"""
SELECT COALESCE(NULLIF(d.device_name, ''), 'Unnamed machine ' || a.device_code) AS machine,
       a.device_code,
       a.aisle_code,
       a.goods_id,
       a.goods_name,
       a.curr_stock,
       a.max_stock,
       ROUND(a.price / 100.0, 2) AS price_php,
       a.updated_at
FROM vending_aisles a
LEFT JOIN vending_devices d ON d.device_code = a.device_code
WHERE {where_sql}
ORDER BY a.curr_stock ASC, machine, a.aisle_code
LIMIT {_MAX_ROWS}
"""

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            cur.execute(
                "SELECT MAX(a.updated_at) AS aisles, MAX(d.last_synced_at) AS devices, "
                "       (now()::date - MAX(a.updated_at)::date) AS age_days "
                "FROM vending_aisles a, vending_devices d"
            )
            age = cur.fetchone()

    for r in rows:
        if isinstance(r.get("price_php"), Decimal):
            r["price_php"] = float(r["price_php"])
        if r.get("updated_at") is not None:
            r["updated_at"] = r["updated_at"].isoformat()

    staleness = {
        "aisles_last_updated": age["aisles"].isoformat() if age["aisles"] else None,
        "devices_last_synced": age["devices"].isoformat() if age["devices"] else None,
        "age_days": int(age["age_days"]) if age["age_days"] is not None else None,
        "has_history": False,
        "note": (
            "vending_aisles is a live planogram with NO history — there is no "
            "earlier state to compare against and no way to ask what stock was "
            "on a past date. If the age below is large, these numbers describe "
            "the machines as of the last Weimi sync, not as of today."
        ),
    }

    notice = None
    if staleness["age_days"] and staleness["age_days"] > 7:
        notice = {
            "kind": "stale_stock",
            "message": (
                f"Vending stock is {staleness['age_days']} days old (last synced "
                f"{staleness['aisles_last_updated']}). Sales data for the same "
                f"machines is current, so stock and sales in this system are NOT "
                f"as of the same moment. Treat these levels as the last known "
                f"position, not today's."
            ),
            "source": "vending_aisles.updated_at",
        }

    meta: dict[str, Any] = {
        "source_table": _req(defs, "vending.stock.source_table"),
        "domain": "vending (Weimi / AJI CMG) — NOT the StoreHub store domain",
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "row_count": len(rows),
        "truncated": len(rows) == _MAX_ROWS,
        "row_limit": _MAX_ROWS,
        "currency": _req(defs, "vending.currency"),
        "currency_note": (
            "PHP. vending_aisles.price is raw CENTS and is divided by 100 here — "
            "it is the one vending money column with no _php view."
        ),
        "date_filterable": False,
        "staleness": staleness,
    }
    if notice:
        meta["notice"] = notice

    return {"rows": rows, "meta": meta}
