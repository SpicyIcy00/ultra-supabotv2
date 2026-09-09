"""
George — replenishment tool.

One public function: get_replenishment().

WHY THIS EXISTS. `shipment_plans` holds 125,283 rows across 59 runs — computed
min and max levels, safety stock and a requested shipment quantity per SKU per
store — and nothing in George could read a single one of them. That absence had
a cost beyond the missing figures: this repository recorded "no low-stock
threshold has ever been set" as a fact about the business, which is true of
`inventory.warning_stock` and false about the company, because a replenishment
engine has been setting levels since January.

WHAT THIS TOOL IS NOT. It is not the replenishment engine and it never
recalculates one. Every figure here was computed by
backend/app/services/replenishment_service.py and is read back exactly as
stored; the formulas in metrics.yaml `replenishment.formulas` are transcribed
from that service so a reader can see how a line was sized without this module
ever sizing one.

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL against raw tables. Three SELECT templates, one per view,
    with predicates assembled from definitions plus bound parameters only.
  - Every return is {rows, meta}, and meta always carries source_table,
    filters_applied and snapshot_timestamp.
  - No business definition is hardcoded. What a run is, which columns exist on
    which algorithm, what allocation means and what makes a cover figure
    untrustworthy are all READ from metrics.yaml `replenishment`.
  - Read-only Postgres role, enforced by _connect().

FOUR THINGS THAT WOULD MAKE A PLAN READ WRONG, each a definition rather than a
decision in this file:

  1. A RUN IS AN EVENT, NOT A DAY. Runs are irregular and some covered a single
     store. Reporting one of those as the estate's plan would be wrong, so
     every result names its run and how much of the estate that run covered.
  2. ALLOCATION IS NOT A SHIPMENT. The service sets allocated = requested by
     default, so the two matching means nothing was allocated away — never that
     anything shipped. What moved is stock_transfers, and a different question.
  3. THE VELOCITY DEPENDS ON THE MODE. The engine normally measures demand over
     days a product was actually available, so being out of stock does not make
     it look slow. `fallback` is the path when snapshot history is too thin for
     that, and it is the majority of rows — which understates demand for
     precisely the products that were out of stock.
  4. days_of_stock IS NOT TRUSTWORTHY AT THE TAIL. Median 13.9 in the latest
     run, maximum 419,916. It is reported as computed and never ranked on.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

import psycopg

from ._common import (
    DICT_ROW,
    connect as _connect,
    load_defs as _load_defs,
    req as _req,
    resolve_store as _resolve_store_in,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)


def _rep(defs: dict) -> dict:
    return _req(defs, "replenishment")


def _store_catalog(defs: dict) -> dict[str, dict]:
    """
    id -> entry for the shops a plan is written FOR.

    The retail scope only. AJI BARN is the warehouse the plan ships FROM
    (replenishment.warehouse_store_id) and is never a destination, so offering
    it as a store here would invite a question with no rows behind it.
    """
    return _store_catalog_for(
        defs, [s["id"] for s in _req(defs, "stores.active_retail")]
    )


# --------------------------------------------------------------------------
# The query templates — one per view, and no others
# --------------------------------------------------------------------------

# One row per store and SKU. Every figure is read back as the engine stored it;
# `shortfall` is the only derived column and it is the engine's own sizing
# expression (min_level - on_hand), not a new definition.
_SELECT_PLAN = """
SELECT p.store_id,
       p.sku_id,
       pr.sku,
       pr.name                       AS product,
       p.on_hand,
       p.on_order,
       p.inventory_position,
       p.min_level,
       p.max_level,
       p.final_max,
       p.safety_stock,
       p.avg_daily_sales,
       p.season_adjusted_daily_sales,
       p.days_of_stock,
       p.requested_ship_qty,
       p.allocated_ship_qty,
       p.priority_score,
       p.calculation_mode,
       p.algorithm,
       p.abc_class,
       p.segment,
       (p.min_level - p.on_hand)     AS shortfall,
       COUNT(*) OVER ()              AS full_row_count
FROM shipment_plans p
LEFT JOIN products pr ON pr.id = p.sku_id
WHERE p.run_date = %(run_date)s
  AND p.store_id = ANY(%(store_ids)s)
  {product_predicate}
  {wanting_predicate}
ORDER BY {order_by}
LIMIT {limit}
"""

# One row per store in the run.
_SELECT_SUMMARY = """
SELECT p.store_id,
       COUNT(*)                                              AS lines,
       COUNT(*) FILTER (WHERE p.requested_ship_qty > 0)      AS lines_wanting_stock,
       SUM(p.requested_ship_qty)                             AS units_requested,
       SUM(p.allocated_ship_qty)                             AS units_allocated,
       COUNT(*) FILTER (WHERE p.on_hand <= 0)                AS lines_with_nothing_on_hand
FROM shipment_plans p
WHERE p.run_date = %(run_date)s
  AND p.store_id = ANY(%(store_ids)s)
GROUP BY 1
ORDER BY units_requested DESC NULLS LAST
"""

# One row per run. This is how a caller sees that runs are irregular and that
# some of them covered a single shop.
_SELECT_RUNS = """
SELECT p.run_date,
       COUNT(*)                        AS lines,
       COUNT(DISTINCT p.store_id)      AS stores,
       COUNT(DISTINCT p.sku_id)        AS skus,
       SUM(p.requested_ship_qty)       AS units_requested
FROM shipment_plans p
GROUP BY 1
ORDER BY p.run_date DESC
LIMIT {limit}
"""


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def get_replenishment(
    store: Optional[str] = None,
    sku: Optional[str] = None,
    view: str = "plan",
    run_date: Optional[date | str] = None,
    wanting_stock_only: bool = True,
    rank_by: str = "most_requested",
    top_n: Optional[int] = None,
) -> dict:
    """
    The replenishment plan: what the engine wants shipped to each shop, and why.

    Reads the plan that already exists. It never recalculates one — every level
    and quantity here was computed by the replenishment service and is reported
    exactly as stored.

    Args:
        store: Store display name (case-insensitive) or store id. None = all
               seven retail shops. AJI BARN is where stock ships FROM and is
               never a destination in a plan.
        sku:   Exact products.sku, case-insensitive. No substring matching.
        view:  'plan' (default) one row per store and SKU with the levels
               behind it; 'summary' one row per store; 'runs' one row per run,
               which is how you see that runs are irregular.
        run_date: Which run to read. None = the most recent one. Runs are NOT
               daily and some covered a single shop, so the run actually used
               is always named in meta.
        wanting_stock_only: True (default) returns only lines the engine wants
               stock for. False returns every line in the run, including
               products it is not asking to ship.
        rank_by: 'most_requested' (units), 'highest_priority' (the engine's own
               priority score), 'biggest_shortfall' (min level less on hand).
               Never days_of_stock — that figure is not trustworthy at the tail.
        top_n: Return only N rows, ranked in SQL. meta.full_row_count reports
               the size of the whole set.

    Returns:
        {"rows": [...], "meta": {...}} — meta always carries source_table,
        filters_applied, snapshot_timestamp and `run`. A non-empty
        meta["notice"] MUST be surfaced to the user; it means the result is not
        what it appears.
    """
    defs = _load_defs()
    rep = _rep(defs)
    catalog = _store_catalog(defs)
    store_ids = _resolve_store_in(store, catalog)
    top_n = _validate_top_n(defs, top_n)

    views = _req(rep, "views")
    if view not in views:
        raise ValueError(
            f"Unknown view {view!r}. Valid: {', '.join(sorted(views))} "
            f"(metrics.yaml: replenishment.views)."
        )
    rank_modes = _req(rep, "rank_modes")
    if rank_by not in rank_modes:
        raise ValueError(
            f"Unknown rank_by {rank_by!r}. Valid: {', '.join(sorted(rank_modes))} "
            f"(metrics.yaml: replenishment.rank_modes)."
        )
    if isinstance(run_date, str):
        run_date = date.fromisoformat(run_date)

    limit = top_n or int(_req(rep, "max_rows"))
    filters: list[str] = []
    notices: list[dict] = []

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # George's role is granted table by table on purpose, so a new
            # table is unreadable until somebody decides to expose it. Say that
            # plainly instead of letting a driver-level permission error reach
            # the user as a crash.
            try:
                cur.execute("SELECT 1 FROM shipment_plans LIMIT 1")
            except psycopg.errors.InsufficientPrivilege as exc:
                raise RuntimeError(
                    "George cannot read the replenishment plan: his read-only role has "
                    "not been granted SELECT on shipment_plans. Apply "
                    "`GRANT SELECT ON shipment_plans TO george_ro;` — see "
                    "tools/george_ro_role.sql, which is applied by hand and never by "
                    "the agent."
                ) from exc

            # ---------------------------------------------------------------
            # WHICH RUN. Named on every result, because runs are irregular and
            # a single-store run reported as the estate's plan would be wrong.
            # ---------------------------------------------------------------
            if view == "runs":
                cur.execute(_SELECT_RUNS.format(limit=limit))
                rows = [dict(r) for r in cur.fetchall()]
                for r in rows:
                    r["run_date"] = r["run_date"].date() if hasattr(r["run_date"], "date") else r["run_date"]
                meta = {
                    "source_table": _req(rep, "source_table"),
                    "filters_applied": ["every run in the file"],
                    "snapshot_timestamp": snapshot_timestamp,
                    "view": view,
                    "grain": views[view],
                    "row_count": len(rows),
                    "full_row_count": len(rows),
                    "runs_are_regular": _req(rep, "runs_are_regular"),
                    "generated_by": _req(rep, "generated_by"),
                }
                return {"rows": rows, "meta": meta}

            # WHICH RUN WAS IN FORCE. Runs are irregular, so a date almost
            # never IS a run date. `run_date` therefore selects the latest run
            # on or before it — the plan that was actually in force that day —
            # and meta reports both, so asking for the 5th and reading the 1st
            # is visible rather than silent.
            asked_for = run_date
            if run_date is None:
                cur.execute("SELECT MAX(run_date) AS latest FROM shipment_plans")
                chosen = cur.fetchone()["latest"]
                if chosen is None:
                    raise RuntimeError("shipment_plans is empty — no run has ever been recorded.")
            else:
                cur.execute(
                    "SELECT MAX(run_date) AS latest FROM shipment_plans WHERE run_date <= %(d)s",
                    {"d": run_date},
                )
                chosen = cur.fetchone()["latest"]
                if chosen is None:
                    cur.execute("SELECT MIN(run_date) AS first FROM shipment_plans")
                    first = cur.fetchone()["first"]
                    raise ValueError(
                        f"No replenishment plan existed on {run_date}. The first run is "
                        f"{first}. Ask for the 'runs' view to see which exist."
                    )
            run_date = chosen.date() if hasattr(chosen, "date") else chosen

            cur.execute(
                "SELECT COUNT(*) AS lines, COUNT(DISTINCT store_id) AS stores, "
                "COUNT(DISTINCT sku_id) AS skus FROM shipment_plans WHERE run_date = %(d)s",
                {"d": run_date},
            )
            run_stats = dict(cur.fetchone())
            if not run_stats["lines"]:
                raise RuntimeError(
                    f"The run dated {run_date} has no lines, which should not be possible: "
                    f"it was chosen because it exists."
                )

            store_labels = [catalog[s].get("display_name") or catalog[s]["name"] for s in store_ids]
            filters.append(
                f"run_date = {run_date}   # metrics.yaml: replenishment.source_table"
            )
            filters.append(
                f"store_id IN ({len(store_ids)}: {', '.join(store_labels)})"
                f"   # metrics.yaml: stores.active_retail"
            )

            # A run covering fewer shops than were asked about is a partial plan.
            covered = run_stats["stores"]
            estate = len(catalog)
            if covered < estate:
                notices.append({
                    "kind": _req(rep, "partial_run_notice_kind"),
                    "message": (
                        f"This plan was run for {covered} of the {estate} shops, not the whole "
                        f"estate. Shops it did not cover have no line in it, which is not the "
                        f"same as needing nothing."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.runs_are_regular",
                })

            # A plan old enough that the shop has traded past it.
            cur.execute("SELECT (CURRENT_DATE - %(d)s::date) AS age", {"d": run_date})
            age_days = cur.fetchone()["age"]
            stale_after = int(_req(rep, "stale_after_days"))
            if age_days is not None and age_days > stale_after:
                notices.append({
                    "kind": _req(rep, "stale_run_notice_kind"),
                    "message": (
                        f"This plan was calculated {age_days} days ago, and the shops have "
                        f"traded since. The quantities are what the engine wanted then, not "
                        f"what it would ask for today."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.stale_after_days",
                })

            # ---------------------------------------------------------------
            # SKU -> product ids.
            # ---------------------------------------------------------------
            product_predicate = ""
            sku_resolution: Optional[dict] = None
            params: dict[str, Any] = {"run_date": run_date, "store_ids": store_ids}
            if sku is not None:
                cur.execute(
                    "SELECT p.id, p.sku, p.name FROM products p "
                    "WHERE lower(p.sku) = lower(%s) ORDER BY p.id",
                    (sku,),
                )
                matches = [dict(m) for m in cur.fetchall()]
                params["product_ids"] = [m["id"] for m in matches]
                product_predicate = "AND p.sku_id = ANY(%(product_ids)s)"
                sku_resolution = {"sku": sku, "product_count": len(matches),
                                  "product_ids": params["product_ids"]}
                filters.append(
                    f"lower(p.sku) = lower({sku!r}) -> {len(matches)} product id(s)"
                    f"   # metrics.yaml: products.sku (SKU is not unique)"
                )
                if len(matches) > 1:
                    sku_resolution["products"] = matches
                    notices.append({
                        "kind": "ambiguous_sku",
                        "message": (
                            f"SKU {sku!r} matches {len(matches)} DIFFERENT products, not one "
                            "product with variants. The lines below cover all of them."
                        ),
                        "source": "definitions/metrics.yaml: products.sku",
                    })

            # ---------------------------------------------------------------
            # The read.
            # ---------------------------------------------------------------
            if view == "summary":
                cur.execute(_SELECT_SUMMARY, params)
                rows = [dict(r) for r in cur.fetchall()]
                full_row_count = len(rows)
            else:
                wanting = "AND p.requested_ship_qty > 0" if wanting_stock_only else ""
                if wanting_stock_only:
                    filters.append(
                        "requested_ship_qty > 0 (lines the engine wants stock for)"
                    )
                cur.execute(
                    _SELECT_PLAN.format(
                        product_predicate=product_predicate,
                        wanting_predicate=wanting,
                        order_by=rank_modes[rank_by],
                        limit=limit,
                    ),
                    params,
                )
                rows = [dict(r) for r in cur.fetchall()]
                full_row_count = rows[0].pop("full_row_count") if rows else 0
                for r in rows[1:]:
                    r.pop("full_row_count", None)

            for r in rows:
                sid = r.get("store_id")
                if sid:
                    r["store"] = (catalog[sid].get("display_name") or catalog[sid]["name"]) \
                        if sid in catalog else sid

            # ---------------------------------------------------------------
            # WHAT THE FIGURES MEAN. Three caveats that change the reading, and
            # every one of them is measured on the rows actually returned.
            # ---------------------------------------------------------------
            cur.execute(
                "SELECT calculation_mode, algorithm, COUNT(*) AS n "
                "FROM shipment_plans p WHERE p.run_date = %(run_date)s "
                "  AND p.store_id = ANY(%(store_ids)s) GROUP BY 1, 2",
                {"run_date": run_date, "store_ids": store_ids},
            )
            mix = [dict(m) for m in cur.fetchall()]
            modes = {}
            algos = {}
            for m in mix:
                modes[m["calculation_mode"]] = modes.get(m["calculation_mode"], 0) + m["n"]
                algos[m["algorithm"]] = algos.get(m["algorithm"], 0) + m["n"]

            cm = _req(rep, "calculation_modes")
            understates = set(_req(cm, "understates_stockouts"))
            weak = sum(n for k, n in modes.items() if k in understates)
            total_lines = sum(modes.values()) or 1
            if weak:
                notices.append({
                    "kind": _req(cm, "notice_kind"),
                    "message": (
                        f"{weak:,} of the {total_lines:,} lines in this plan had their demand "
                        f"measured without enough stock history to exclude the days a product "
                        f"was unavailable. For those lines a product that was out of stock can "
                        f"look slow rather than starved, so the quantity asked for may be low."
                    ),
                    "guidance": (
                        "calculation_mode on each row says which path produced it; "
                        "metrics.yaml replenishment.calculation_modes lists which use active days."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.calculation_modes",
                })

            if len(algos) > 1:
                notices.append({
                    "kind": _req(_req(rep, "algorithms"), "mixed_notice_kind"),
                    "message": (
                        "This plan was produced by more than one method ("
                        + ", ".join(f"{k}: {n:,}" for k, n in sorted(algos.items()))
                        + "). Only the newer one records an ABC class, a segment and a service "
                        "level, so those are blank on the older lines rather than missing."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.algorithms",
                })

            # ON HAND CAN BE NEGATIVE, AND IT INFLATES THE REQUEST. This is
            # the single most important thing to say about this plan: the
            # largest lines are largest BECAUSE the shop's recorded stock is
            # broken, not because the shop needs that much.
            neg = _req(rep, "negative_on_hand")
            if _req(neg, "notice_mandatory"):
                cur.execute(
                    "SELECT COUNT(*) FILTER (WHERE on_hand < 0) AS neg_lines, "
                    "       COUNT(*) AS lines, "
                    "       COALESCE(SUM(requested_ship_qty) FILTER (WHERE on_hand < 0), 0) AS neg_units, "
                    "       COALESCE(SUM(requested_ship_qty), 0) AS units, "
                    "       MIN(on_hand) AS worst "
                    "FROM shipment_plans p WHERE p.run_date = %(run_date)s "
                    "  AND p.store_id = ANY(%(store_ids)s)",
                    {"run_date": run_date, "store_ids": store_ids},
                )
                nq = dict(cur.fetchone())
                if nq["neg_lines"]:
                    share = (nq["neg_units"] / nq["units"] * 100) if nq["units"] else 0
                    notices.append({
                        "kind": _req(neg, "notice_kind"),
                        "message": (
                            f"{nq['neg_lines']:,} of the {nq['lines']:,} lines in this plan are for "
                            f"products whose recorded stock is NEGATIVE, the worst "
                            f"{nq['worst']:,}. The quantity to ship is worked out as the target "
                            f"level minus what is on hand, so a negative reading adds its own "
                            f"size to the order: those lines account for {nq['neg_units']:,} of "
                            f"the {nq['units']:,} units requested, {share:.0f}% of the plan. The "
                            f"biggest lines here are the ones with the most broken stock records."
                        ),
                        "guidance": (
                            "on_hand is on every row. Do not present a requested quantity from a "
                            "negative-on-hand line as a real need without saying so."
                        ),
                        "source": "definitions/metrics.yaml: replenishment.negative_on_hand",
                    })

            # A cover figure in the thousands is not a cover figure. Say so
            # when one is on screen rather than letting it read as 419,916
            # days of stock.
            dos = _req(rep, "days_of_stock")
            absurd_above = int(_req(dos, "absurd_above"))
            wild = [r for r in rows if (r.get("days_of_stock") or 0) > absurd_above]
            if wild:
                notices.append({
                    "kind": _req(dos, "notice_kind"),
                    "message": (
                        f"{len(wild)} of these lines show more than {absurd_above:,} days of "
                        f"cover. That is a product with a trickle of sales and some stock, not a "
                        f"real cover figure, and nothing here is ranked or averaged on it."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.days_of_stock",
                })

            alloc = _req(rep, "allocation")
            if view == "plan" and rows and _req(alloc, "defaults_to_requested"):
                notices.append({
                    "kind": _req(alloc, "notice_kind"),
                    "message": (
                        "The allocated quantity defaults to the requested one, so the two "
                        "matching does not mean a shipment was confirmed or sent. What actually "
                        "moved is recorded separately, in the stock transfers."
                    ),
                    "source": "definitions/metrics.yaml: replenishment.allocation",
                })

    notice: Optional[dict] = None
    if len(notices) == 1:
        notice = notices[0]
    elif notices:
        notice = {"kind": "multiple", "items": notices}

    meta: dict[str, Any] = {
        "source_table": _req(rep, "source_table"),
        "filters_applied": filters,
        "snapshot_timestamp": snapshot_timestamp,
        "view": view,
        "grain": views[view],
        "run": {
            "run_date": str(run_date),
            "asked_for": str(asked_for) if asked_for else None,
            "is_the_plan_in_force_for": str(asked_for) if asked_for else "now",
            "age_days": age_days,
            "lines": run_stats["lines"],
            "stores_covered": run_stats["stores"],
            "skus": run_stats["skus"],
            "runs_are_regular": _req(rep, "runs_are_regular"),
        },
        "calculation_modes": modes,
        "algorithms": algos,
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "definitions": {
            "requested_ship_qty": _req(_req(rep, "formulas"), "requested_ship_qty"),
            "min_level": _req(_req(rep, "formulas"), "min_level"),
            "generated_by": _req(rep, "generated_by"),
            "source": "definitions/metrics.yaml: replenishment",
        },
    }
    if view == "plan":
        meta["ranked_by"] = rank_by
        meta["days_of_stock_rankable"] = _req(_req(rep, "days_of_stock"), "rankable")
    if sku_resolution:
        meta["sku_resolution"] = sku_resolution
    if notice:
        meta["notice"] = notice

    return {"rows": rows, "meta": meta}
