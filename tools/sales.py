"""
George — sales tool.

One public function: get_sales().

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL. There is ONE SELECT template. Its measure, its grouping
    expressions, its date windows and its guard clauses are all read out of
    definitions/metrics.yaml. Caller input is bound as parameters, never
    interpolated.
  - Every return is {rows, meta}, with source_table, filters_applied and
    snapshot_timestamp.
  - No business definition is hardcoded here. Metric SQL, valid groupings, date
    presets, bucket expressions and the guard all come from the yaml. Missing
    keys raise.
  - Read-only Postgres role, enforced in tools/_common.connect().
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional, Sequence


from ._common import (
    DICT_ROW,
    validate_top_n as _validate_top_n,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    label_store as _label_store,
    load_defs as _load_defs,
    req as _req,
    resolve_store as _resolve_store_in,
    store_catalog as _store_catalog_for,
)

# Filter keys the caller may pass. Anything else raises rather than being
# ignored — a silently dropped filter returns a number for the wrong question.
_ALLOWED_FILTERS = {"store", "sku", "product_id", "category", "tag"}

# Filters that reach below transaction grain. A transaction-grain measure
# (SUM(t.total)) cannot be filtered by these without joining line items, which
# would multiply the header total across the basket.
_LINE_LEVEL_FILTERS = {"sku", "product_id", "category", "tag"}

# Groupings that need the products table joined.
_PRODUCT_GROUPINGS = {"product", "category"}

# Money-valued metrics that the net_sales/product_revenue reconciliation covers.
_RECONCILABLE = {"net_sales", "product_revenue"}


def _active_retail_catalog(defs: dict) -> dict[str, dict]:
    """id -> entry for the 7 active retail stores. Excludes AJI BARN and PINA."""
    return _store_catalog_for(
        defs, [s["id"] for s in _req(defs, "stores.active_retail")]
    )


def _resolve_window(defs: dict, date_range: Any) -> tuple[str, str, dict, dict]:
    """
    Resolve date_range to half-open [start, end) SQL plus bound params.

    Accepts a preset name from sales_day.presets, or an explicit (start, end)
    pair / {"start":…, "end":…} of Manila calendar dates. Never CURRENT_DATE:
    the preset SQL is built on the Manila primitive, and explicit dates are
    converted with the yaml's date_start / date_end expressions.
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
    # The ::timestamp cast is load-bearing — see metrics.yaml
    # sales_day.expressions.date_start. `date AT TIME ZONE` selects the wrong
    # Postgres overload and lands 8 hours late.
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


def _group_expressions(defs: dict, group_by: Sequence[str]) -> tuple[list, list]:
    """(select_terms, group_terms) for the requested groupings, from the yaml."""
    buckets = _req(defs, "sales_day.buckets")
    select_terms: list[tuple[str, str]] = []
    group_terms: list[str] = []

    for g in group_by:
        if g == "store":
            select_terms.append(("store_id", "t.store_id"))
            group_terms.append("t.store_id")
        elif g in buckets:
            select_terms.append((g, buckets[g]))
            group_terms.append(buckets[g])
        elif g == "product":
            select_terms.append(("product_id", "ti.product_id"))
            select_terms.append(("sku", "p.sku"))
            select_terms.append(("product", "p.name"))
            group_terms.extend(["ti.product_id", "p.sku", "p.name"])
        elif g == "category":
            # Read from the yaml, never inlined — metrics.yaml
            # products.category_normalization.
            expr = _req(defs, "products.category_normalization.sql")
            select_terms.append(("category", expr))
            group_terms.append(expr)
        else:
            raise ValueError(f"Unknown group_by {g!r}.")
    return select_terms, group_terms


def get_sales(
    group_by: Any,
    date_range: Any,
    filters: Optional[dict] = None,
    metric: str = "net_sales",
    top_n: Optional[int] = None,
) -> dict:
    """
    Sales figures grouped as requested.

    Args:
        group_by:   str or list of: store, day, week, month, product, category.
                    [] gives a grand total.
        date_range: a preset name from metrics.yaml (sales_day.presets), or an
                    explicit (start, end) pair of Manila calendar dates.
                    Half-open: [start, end). Required — an unbounded sales query
                    is never what is meant.
        filters:    optional dict, keys limited to store, sku, category, tag.
        metric:     net_sales, product_revenue, units_sold, transaction_count,
                    returns_value.
        top_n:      return only the N largest by the metric, ranked in SQL.
                    OVERRIDES chronological ordering for day/week/month, so
                    top_n=5 with group_by='day' gives the five biggest days.
                    meta.full_row_count reports the size of the whole set.

    Returns:
        {"rows": [...], "meta": {...}}. A non-empty meta["notice"] MUST be
        surfaced to the user; it means the result is not what it appears.
    """
    defs = _load_defs()

    # ---- metric ----------------------------------------------------------
    all_metrics = _req(defs, "metrics")
    if metric not in all_metrics:
        raise ValueError(
            f"Unknown metric {metric!r}. Valid: {', '.join(sorted(all_metrics))}."
        )
    mdef = all_metrics[metric]
    top_n = _validate_top_n(defs, top_n)

    # ---- group_by --------------------------------------------------------
    if group_by is None:
        group_by = []
    elif isinstance(group_by, str):
        group_by = [group_by]
    group_by = list(group_by)

    valid = _req(mdef, "valid_group_by")
    for g in group_by:
        if g not in valid:
            # Refuse rather than answer. Grouping a transaction-grain measure by
            # product would mean splitting a basket total across its lines —
            # inventing a definition nobody agreed.
            better = [
                m for m, d in all_metrics.items() if g in d.get("valid_group_by", [])
            ]
            raise ValueError(
                f"metric={metric!r} cannot be grouped by {g!r}. "
                f"{mdef.get('description', '').strip().splitlines()[0] if mdef.get('description') else ''} "
                f"metrics.yaml allows: {', '.join(valid)}. "
                f"For a {g!r} breakdown use: {', '.join(better) or 'no available metric'}."
            )

    notices: list[dict] = []
    redefined_by = set(mdef.get("redefined_when_grouped_by", []))
    if redefined_by & set(group_by):
        notices.append({
            "kind": "metric_redefined",
            "message": " ".join(mdef["redefinition_note"].split()),
            "source": f"definitions/metrics.yaml: metrics.{metric}.redefinition_note",
        })

    # ---- filters ---------------------------------------------------------
    filters = dict(filters or {})
    unknown = set(filters) - _ALLOWED_FILTERS
    if unknown:
        raise ValueError(
            f"Unknown filter key(s): {', '.join(sorted(unknown))}. "
            f"Allowed: {', '.join(sorted(_ALLOWED_FILTERS))}."
        )

    catalog = _active_retail_catalog(defs)
    store_ids = _resolve_store_in(filters.get("store"), catalog)

    # AJI BARN / AJI PINA are excluded by construction — the guard is a positive
    # allowlist of active retail, and neither appears in it. Assert it anyway:
    # a future edit that added a warehouse id to active_retail would otherwise
    # fold ₱22.1M of zero-total BARN adjustments into revenue silently.
    excluded_ids = list(_req(defs, "filters.excluded_from_sales.excluded_store_ids"))
    leaked = set(excluded_ids) & set(store_ids)
    if leaked:
        raise RuntimeError(
            f"Refusing to run: excluded store id(s) {sorted(leaked)} are present "
            f"in the active retail sales scope. See metrics.yaml "
            f"filters.excluded_from_sales.excluded_store_ids."
        )

    # ---- window ----------------------------------------------------------
    start_sql, end_sql, win_params, window_meta = _resolve_window(defs, date_range)

    # ---- shape of the query ---------------------------------------------
    grain = _req(mdef, "grain")
    line_grain = grain == "transaction_item"
    needs_products = bool(_PRODUCT_GROUPINGS & set(group_by)) or bool(
        _LINE_LEVEL_FILTERS & set(filters)
    )
    if needs_products and not line_grain and metric != "transaction_count":
        raise ValueError(
            f"metric={metric!r} is {grain}-grain and cannot be filtered or "
            f"grouped by product attributes."
        )

    if line_grain or needs_products:
        from_sql = (
            "new_transaction_items ti\n"
            "  INNER JOIN new_transactions t ON ti.transaction_ref_id = t.ref_id"
        )
        source_table = "new_transaction_items + new_transactions"
    else:
        from_sql = "new_transactions t"
        source_table = "new_transactions"

    if needs_products:
        # LEFT, never INNER: line items exist whose product_id has no row in
        # products. INNER would drop them and understate every total.
        from_sql += "\n  LEFT JOIN products p ON p.id = ti.product_id"
        source_table += " + products"

    # ---- guard clauses, all from the yaml --------------------------------
    type_sql = (
        _req(defs, "filters.returns.return_sql")
        if metric == "returns_value"
        else _req(defs, "filters.returns.sale_sql")
    )
    predicates = [
        _req(defs, "filters.cancelled.sql"),
        type_sql,
        "t.store_id = ANY(%(store_ids)s)",
        f"t.transaction_time >= {start_sql}",
        f"t.transaction_time <  {end_sql}",
    ]
    params: dict[str, Any] = {"store_ids": store_ids, **win_params}

    filters_applied = [
        f"{_req(defs, 'filters.cancelled.sql')}   # metrics.yaml: filters.cancelled",
        f"{type_sql}   # metrics.yaml: filters.returns",
        f"t.store_id IN ({len(store_ids)}: "
        f"{', '.join(_label_store(catalog, s) for s in store_ids)})"
        f"   # metrics.yaml: stores.active_retail",
        # Built from the definitions, never written out here. The literal
        # "excluded: AJI BARN, AJI PINA" used to sit in this line and would have
        # become a false receipt the moment a third id was added to the yaml.
        f"excluded: "
        f"{', '.join(_req(defs, 'filters.excluded_from_sales.excluded_labels')[i] for i in excluded_ids)}"
        f"   # metrics.yaml: filters.excluded_from_sales.excluded_store_ids",
    ]
    if window_meta["kind"] == "explicit":
        filters_applied.append(
            f"transaction_time >= {window_meta['start']} AND < {window_meta['end']} "
            f"(Asia/Manila, half-open)"
            f"   # metrics.yaml: sales_day.expressions.date_start/date_end"
        )
    else:
        filters_applied.append(
            f"transaction_time within preset {window_meta['name']!r} "
            f"(Asia/Manila, half-open; includes_partial_day="
            f"{window_meta['includes_partial_day']})"
            f"   # metrics.yaml: sales_day.presets.{window_meta['name']}"
        )

    if "product_id" in filters:
        predicates.append("ti.product_id = %(product_id)s")
        params["product_id"] = filters["product_id"]
        filters_applied.append(
            f"ti.product_id = {filters['product_id']!r}   # caller (unambiguous key)"
        )
    if "category" in filters:
        predicates.append(f"{_req(defs, 'products.category_normalization.sql')} = %(category)s")
        params["category"] = filters["category"]
        filters_applied.append(
            f"{_req(defs, 'products.category_normalization.sql')} = {filters['category']!r}"
            f"   # metrics.yaml: products.category_normalization"
        )
    if "tag" in filters:
        # p.tags, never p.name — business_rules.yaml:1260.
        predicates.append("p.tags ILIKE %(tag)s")
        params["tag"] = f"%{filters['tag']}%"
        filters_applied.append(
            f"p.tags ILIKE '%{filters['tag']}%'   # business_rules.yaml:1260"
        )

    metric_sql = _req(mdef, "sql")

    # ---- execute ---------------------------------------------------------
    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # A preset resolves to Manila calendar dates HERE, with the same SQL
            # the query binds, and they go on the receipt. Without this the
            # model saw only the preset's name and had to derive the date of
            # "yesterday" itself — and wrote the wrong year. A date in an
            # answer must come from a tool result like any other number.
            if window_meta["kind"] == "preset":
                cur.execute(
                    f"SELECT ({start_sql} AT TIME ZONE 'Asia/Manila')::date AS s, "
                    f"       ({end_sql}   AT TIME ZONE 'Asia/Manila')::date AS e"
                )
                r = cur.fetchone()
                window_meta.update(
                    start=r["s"].isoformat(),
                    end=r["e"].isoformat(),
                    convention="half-open [start, end)",
                )

            # ---- SKU resolution --------------------------------------------
            # SKUs are NOT unique: 68 collide case-insensitively, and the
            # colliding rows are UNRELATED products (metrics.yaml products.sku).
            # Resolve to product ids and refuse to aggregate a collision — the
            # policy is separate_or_refuse, never a silent sum.
            sku_resolution: Optional[dict] = None
            if "sku" in filters:
                cur.execute(
                    "SELECT p.id, p.sku, p.name, p.unit_price, "
                    f"       {_req(defs, 'products.category_normalization.sql')} AS category "
                    "FROM products p WHERE lower(p.sku) = lower(%s) ORDER BY p.id",
                    (filters["sku"],),
                )
                matches = [dict(m) for m in cur.fetchall()]
                pids = [m["id"] for m in matches]
                sku_resolution = {
                    "sku": filters["sku"],
                    "product_count": len(matches),
                    "product_ids": pids,
                }

                if len(matches) > 1 and "product" not in group_by:
                    raise ValueError(
                        f"SKU {filters['sku']!r} matches {len(matches)} DIFFERENT "
                        f"products, and metric={metric!r} grouped by "
                        f"{group_by or 'nothing'} would sum them into one figure "
                        f"that belongs to no product. The collision: "
                        + "; ".join(
                            f"{m['id']} = {m['name']!r} ({m['category']}, "
                            f"PHP {m['unit_price']})"
                            for m in matches
                        )
                        + ". Either add 'product' to group_by to see them "
                        "separately, or pass filters={'product_id': '<id>'} to "
                        "pick one. (metrics.yaml: products.sku.ambiguity_policy)"
                    )

                if len(matches) > 1:
                    sku_resolution["products"] = matches
                    notices.append({
                        "kind": "ambiguous_sku",
                        "message": (
                            f"SKU {filters['sku']!r} matches {len(matches)} "
                            f"different products. They appear as separate rows "
                            f"because group_by includes 'product'; their values "
                            f"must not be added together."
                        ),
                        "source": "definitions/metrics.yaml: products.sku",
                    })
                elif not matches:
                    notices.append({
                        "kind": "sku_not_found",
                        "message": (
                            f"No product exists with SKU {filters['sku']!r}. This "
                            f"is an unknown SKU, not a product with zero sales."
                        ),
                        "source": "products.sku lookup",
                    })

                predicates.append("ti.product_id = ANY(%(sku_product_ids)s)")
                params["sku_product_ids"] = pids
                filters_applied.append(
                    f"lower(p.sku) = lower({filters['sku']!r}) -> "
                    f"{len(pids)} product id(s)"
                    f"   # metrics.yaml: products.sku (resolved, never summed)"
                )

            # ---- build the one statement ---------------------------------
            select_terms, group_terms = _group_expressions(defs, group_by)
            select_sql = ",\n       ".join(
                [f"{expr} AS {alias}" for alias, expr in select_terms]
                + [f"{metric_sql} AS value"]
            )
            where_sql = "\n  AND ".join(predicates)
            group_sql = f"\nGROUP BY {', '.join(group_terms)}" if group_terms else ""

            # Time series read chronologically; everything else ranks by measure.
            time_cols = [a for a, _ in select_terms if a in ("day", "week", "month")]
            if top_n is not None and group_terms:
                # "Top N" means the N largest by the metric. This deliberately
                # OVERRIDES chronological ordering for time buckets, so
                # top_n=5 with group_by='day' gives the five biggest days, not
                # the first five. metrics.yaml: ranking.sales.ordering_with_top_n
                order_sql = "\nORDER BY value DESC NULLS LAST"
                ordering = _req(defs, "ranking.sales.ordering_with_top_n")
            elif time_cols:
                order_sql = f"\nORDER BY {', '.join(time_cols)} ASC"
                ordering = _req(defs, "ranking.sales.ordering_default_time")
            elif group_terms:
                order_sql = "\nORDER BY value DESC NULLS LAST"
                ordering = _req(defs, "ranking.sales.ordering_default_other")
            else:
                order_sql = ""
                ordering = "single row"

            sql = (
                f"SELECT {select_sql}\n"
                f"FROM {from_sql}\n"
                f"WHERE {where_sql}"
                f"{group_sql}{order_sql}\n"
                f"LIMIT {top_n or _MAX_ROWS}"
            )

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            truncated = len(rows) == _MAX_ROWS
            # full_row_count costs a query, so only pay for it when the result
            # was actually limited. When it was not, what came back IS the set.
            if truncated or (top_n is not None and len(rows) == top_n):
                cur.execute(
                    f"SELECT COUNT(*) AS n FROM (\n"
                    f"SELECT 1 FROM {from_sql}\nWHERE {where_sql}{group_sql}\n) x",
                    params,
                )
                full_row_count = cur.fetchone()["n"]
            else:
                full_row_count = len(rows)

            # ---- reconciliation ------------------------------------------
            # The real test: compute BOTH money measures over this same window
            # and scope, and compare. SUM(t.discount) is reported as a
            # diagnostic only — it is necessary but not sufficient, and the
            # 2024 data proves it (gap != discount, and once negative).
            recon: dict[str, Any]
            line_level_filter = bool(_LINE_LEVEL_FILTERS & set(filters))
            if metric not in _RECONCILABLE:
                recon = {
                    "applicable": False,
                    "reason": (
                        f"metric {metric!r} is not one of the two money measures "
                        f"the reconciliation governs (net_sales, product_revenue)."
                    ),
                }
            elif line_level_filter:
                recon = {
                    "applicable": False,
                    "reason": (
                        "a product-level filter is active, so net_sales (which "
                        "cannot be filtered by product) is not comparable to "
                        "product_revenue for this window."
                    ),
                }
            else:
                cur.execute(
                    f"""
                    SELECT (SELECT {_req(defs, 'metrics.net_sales.sql')}
                              FROM new_transactions t
                             WHERE {where_sql}) AS net_sales,
                           (SELECT {_req(defs, 'metrics.product_revenue.sql')}
                              FROM new_transaction_items ti
                              INNER JOIN new_transactions t
                                      ON ti.transaction_ref_id = t.ref_id
                             WHERE {where_sql}) AS product_revenue,
                           (SELECT {_req(defs, 'metrics.product_revenue.discount_diagnostic_sql')}
                              FROM new_transactions t
                             WHERE {where_sql}) AS discount_total
                    """,
                    params,
                )
                r = cur.fetchone()
                ns = r["net_sales"] or Decimal(0)
                pr = r["product_revenue"] or Decimal(0)
                disc = r["discount_total"] or Decimal(0)
                gap = ns - pr
                holds = gap == 0
                recon = {
                    "applicable": True,
                    "method": _req(defs, "metrics.product_revenue.reconciliation_method"),
                    "net_sales": float(ns),
                    "product_revenue": float(pr),
                    "gap": float(gap),
                    "gap_pct": float(round(abs(gap) / ns * 100, 4)) if ns else None,
                    "discount_total": float(disc),
                    "holds": holds,
                    "explained_by_discount": bool(abs(gap) == abs(disc)) if gap else None,
                }
                if not holds:
                    explained = recon["explained_by_discount"]
                    recon["note"] = (
                        f"The two money measures disagree for this window by "
                        f"{gap:,.2f} PHP"
                        + (f" ({recon['gap_pct']}%)" if recon["gap_pct"] is not None else "")
                        + ". Header discount over the same window totals "
                        f"{disc:,.2f} PHP and "
                        + (
                            "accounts for the whole difference: net_sales is "
                            "after header discount, product_revenue is not."
                            if explained
                            else "does NOT account for it, so the cause is "
                                 "something other than discounting."
                        )
                        + " Store-level and product-level totals for this window "
                        "are NOT comparable — do not present them side by side "
                        "as though they sum to the same thing."
                    )
                    notices.append({
                        "kind": "reconciliation_failed",
                        "message": recon["note"],
                        "source": "tools/sales.py reconciliation",
                    })

            # ---- data quality, when grouping by product or category -------
            data_quality: Optional[dict] = None
            if _PRODUCT_GROUPINGS & set(group_by):
                cur.execute(
                    f"""
                    SELECT COUNT(*) FILTER (WHERE p.id IS NULL)            AS orphan_line_items,
                           COUNT(DISTINCT ti.product_id)
                             FILTER (WHERE p.id IS NOT NULL
                                       AND NULLIF(p.category, '') IS NULL) AS uncategorized_products,
                           COUNT(*) FILTER (WHERE p.id IS NOT NULL
                                       AND NULLIF(p.category, '') IS NULL) AS uncategorized_line_items
                    FROM new_transaction_items ti
                    INNER JOIN new_transactions t ON ti.transaction_ref_id = t.ref_id
                    LEFT JOIN products p ON p.id = ti.product_id
                    WHERE {where_sql}
                    """,
                    params,
                )
                dq = cur.fetchone()
                data_quality = {
                    "orphan_line_items": dq["orphan_line_items"],
                    "orphan_line_items_note": (
                        "Line items whose product_id has no row in `products`. "
                        "They are RETAINED via LEFT JOIN — an INNER JOIN would "
                        "drop them and understate every total. Database-wide "
                        "there are 4 such rows out of 891,714."
                    ),
                    "uncategorized_products": dq["uncategorized_products"],
                    "uncategorized_line_items": dq["uncategorized_line_items"],
                    "uncategorized_note": (
                        "Products with a NULL or blank category, grouped under "
                        "'Uncategorized' rather than dropped. Database-wide, 83 "
                        "of 3,678 products have no category."
                    ),
                }
                if dq["orphan_line_items"]:
                    notices.append({
                        "kind": "orphan_line_items",
                        "message": (
                            f"{dq['orphan_line_items']} line item(s) in this window "
                            f"reference a product that does not exist in `products`. "
                            f"They are included in totals but have no name, SKU or "
                            f"category."
                        ),
                        "source": "LEFT JOIN products data-quality check",
                    })

    # ---- label and shape rows -------------------------------------------
    for r in rows:
        if "store_id" in r:
            r["store"] = _label_store(catalog, r["store_id"])
        if isinstance(r.get("value"), Decimal):
            r["value"] = float(r["value"])
        for k in ("day", "week", "month"):
            if isinstance(r.get(k), date):
                r[k] = r[k].isoformat()

    meta: dict[str, Any] = {
        "source_table": source_table,
        "metric": metric,
        "metric_sql": metric_sql,
        "metric_unit": _req(mdef, "unit"),
        "metric_grain": grain,
        "group_by": group_by,
        "window": window_meta,
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "full_row_count_note": " ".join(_req(defs, "ranking.full_row_count_note").split()),
        "ordering": ordering,
        "top_n": top_n,
        "truncated": truncated,
        "row_limit": top_n or _MAX_ROWS,
        "reconciliation": recon,
        "gap_filled": False,
        "gap_filled_note": (
            "Buckets with no transactions are absent, not zero. No row is "
            "synthesised for an empty day — that would fabricate data."
        ),
    }
    if data_quality is not None:
        meta["data_quality"] = data_quality
    if sku_resolution is not None:
        meta["sku_resolution"] = sku_resolution
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
