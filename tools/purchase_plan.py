"""
Bob — purchase planning tool.

One public function: get_purchase_plan().

WHY THIS EXISTS. It replaces a chore done by hand: export sales from StoreHub,
look at them per supplier, and order enough of each product to last. Everything
that chore needs is already in the database and none of it was reachable —
there was no way to ask "what do I buy from Seikyo, and how long will what I
have last?"

WHAT IT IS AND IS NOT. It produces a DRAFT to read and change. It writes
nothing, sends nothing, and creates no purchase order; Bob has no write
access to StoreHub and none is needed for this.

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL. Two SELECT templates, predicates from definitions plus
    bound parameters only.
  - Every return is {rows, meta} with source_table, filters_applied and
    snapshot_timestamp.
  - No business definition is hardcoded: who supplies a product, how demand is
    measured, how a negative stock reading is treated and whether a cover
    period may be invented are all READ from metrics.yaml `purchasing.plan`.
  - Read-only role, enforced by _connect().

FOUR THINGS THAT DECIDE WHETHER THIS DRAFT IS HONEST:

  1. WHO SUPPLIES A PRODUCT IS INFERRED, NOT DECLARED. There is no supplier
     column on products. The link is what was bought from whom before, and it
     reaches 456 of the 1,130 products that sold in the last 90 days. A plan
     that quietly omitted the other three fifths would read as a complete
     order, so the coverage is on every result.

  2. THE COVER PERIOD IS THE READER'S JUDGEMENT. There is no rule for it and
     this tool never invents one. Without `cover_days` it reports demand, stock
     and how long the stock lasts. Only when given one does it suggest a
     quantity.

  3. A NEGATIVE ON HAND IS READ AS NONE, NEVER AS A DEFICIT. shipment_plans
     sizes against the raw figure, and 62% of the units in its latest run come
     from lines whose stock reading is broken — a -174,877 adds its own
     magnitude to the order. That failure is not repeated here.

  4. A RATE MEASURED WHILE A PRODUCT WAS UNAVAILABLE UNDERSTATES DEMAND. Days
     with nothing sellable anywhere are counted and shown, and they never
     adjust the rate: inflating a measured figure to what it might have been is
     inventing a sale.

And one thing this cannot do at all: nothing in the data records when goods
actually arrived, so no plan here can add cover for the wait.
"""

from __future__ import annotations

import pathlib
from typing import Any, Optional

import yaml

from ._common import (
    DICT_ROW,
    connect as _connect,
    load_defs as _load_defs,
    req as _req,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)


def _plan(defs: dict) -> dict:
    return _req(defs, "purchasing.plan")


def _retail_ids(defs: dict) -> list[str]:
    return [s["id"] for s in _req(defs, "stores.active_retail")]


_MAP: Optional[dict] = None


def _load_map(defs: dict) -> dict:
    """
    The product -> supplier mapping, and whether anybody has approved it.

    Always returns a dict with `status`. A missing file is `absent`, which is a
    real state and not an error: this tool worked before the file existed and
    still does.
    """
    global _MAP
    if _MAP is None:
        link = _req(defs, "purchasing.plan.supplier_link")
        path = pathlib.Path(__file__).resolve().parent.parent / _req(link, "map_file")
        if not path.exists():
            _MAP = {"status": "absent", "confident": {}, "overrides": {}}
        else:
            with path.open(encoding="utf-8") as fh:
                _MAP = yaml.safe_load(fh) or {}
            _MAP.setdefault("status", "proposed")
            _MAP.setdefault("confident", {})
            _MAP.setdefault("overrides", {})
    return _MAP


def _mapped_products(defs: dict, supplier: str) -> Optional[list[str]]:
    """
    Product ids this supplier supplies according to the APPROVED map, or None.

    None means "no approved map" and the caller falls back to purchase history.
    An override beats a proposal for the same product, which is what makes the
    file correctable by hand without the generator undoing it.
    """
    link = _req(defs, "purchasing.plan.supplier_link")
    m = _load_map(defs)
    if m.get("status") != _req(link, "map_authoritative_when"):
        return None
    want = supplier.strip().lower()
    chosen: dict[str, str] = {}
    for pid, entry in (m.get(_req(link, "map_confident_key")) or {}).items():
        if isinstance(entry, dict) and entry.get("supplier"):
            chosen[pid] = str(entry["supplier"])
    for pid, entry in (m.get(_req(link, "map_override_key")) or {}).items():
        if isinstance(entry, dict) and entry.get("supplier"):
            chosen[pid] = str(entry["supplier"])
        elif isinstance(entry, str):
            chosen[pid] = entry
    return [pid for pid, name in chosen.items() if name.strip().lower() == want]


# --------------------------------------------------------------------------
# The query templates
# --------------------------------------------------------------------------

# Every supplier on record, with how much of what they supply is traceable.
# This is how a caller finds the name to ask about, since supplier is free text
# and is never normalised (suppliers.purchase_orders.supplier_is_free_text).
_SELECT_SUPPLIERS = """
SELECT o.supplier_name                         AS supplier,
       COUNT(DISTINCT o.id)                    AS purchase_orders,
       COUNT(DISTINCT l.product_id)            AS products,
       MIN(o.created_at_source)::date          AS first_order,
       MAX(o.created_at_source)::date          AS last_order
FROM purchase_orders o
JOIN purchase_order_lines l ON l.purchase_order_id = o.id
WHERE o.supplier_name IS NOT NULL
GROUP BY 1
ORDER BY last_order DESC NULLS LAST
"""

# Days the estate had nothing sellable, for SPECIFIC products.
#
# Deliberately a second statement rather than a join in the plan above. Over a
# supplier's whole range this scan takes twelve seconds — most of it spent on
# products that the ranking then discards — and Bob's role is capped at
# thirty. Asked only about the rows being returned it is immediate.
_SELECT_STARVED = """
SELECT d.product_id, COUNT(*) AS days_with_nothing
FROM (
    SELECT s.product_id, s.snapshot_date, SUM(GREATEST(s.quantity_on_hand, 0)) AS q
    FROM inventory_snapshots s
    WHERE s.snapshot_date >= %(since_date)s
      AND s.snapshot_date < CURRENT_DATE
      AND s.store_id = ANY(%(retail_ids)s)
      AND s.product_id = ANY(%(product_ids)s)
    GROUP BY 1, 2
) d
WHERE d.q <= 0
GROUP BY 1
"""

# The plan for one supplier.
#
# `on_hand` uses GREATEST(quantity_on_hand, 0): a negative is a broken record
# meaning the stock is unknown, and treating it as a deficit is what puts 62%
# of shipment_plans' units behind faulty readings. The raw sum travels beside
# it so nothing is hidden.
_SELECT_PLAN = """
WITH mine AS (
    {mine}
),
-- THE WINDOW FIRST, THEN THE PRODUCTS (2026-09-16). Written the other way
-- round, the planner drove from the product index, walked every line those
-- products ever sold (28,377 rows for 18 products) and then looked each
-- transaction up by primary key to throw most of them away: 133,879 buffers,
-- 25 s cold, over the role's 30 s cap under load — and the answer the owner
-- saw was the raw timeout. MATERIALIZED stops the planner inlining this set
-- and choosing that plan again: the 56-day set of transactions is ~33,000
-- ref_ids, hashed once, and the same read is 35,059 buffers. Measured with
-- EXPLAIN (ANALYZE, BUFFERS) on production, read-only.
recent AS MATERIALIZED (
    SELECT t.ref_id
    FROM new_transactions t
    WHERE t.is_cancelled = false
      AND t.store_id = ANY(%(retail_ids)s)
      AND t.transaction_time >= %(since)s
),
demand AS (
    SELECT ti.product_id, SUM(ti.quantity) AS units_sold
    FROM new_transaction_items ti
    JOIN recent r ON r.ref_id = ti.transaction_ref_id
    WHERE ti.product_id IN (SELECT product_id FROM mine)
    GROUP BY 1
),
stock AS (
    SELECT i.product_id,
           SUM(GREATEST(i.quantity_on_hand, 0)) AS on_hand,
           SUM(i.quantity_on_hand)              AS on_hand_raw,
           COUNT(*) FILTER (WHERE i.quantity_on_hand < 0) AS negative_rows
    FROM inventory i
    WHERE i.store_id = ANY(%(scope_ids)s)
      AND i.product_id IN (SELECT product_id FROM mine)
    GROUP BY 1
),
incoming AS (
    SELECT l.product_id, SUM(l.ordered_qty) AS on_order
    FROM purchase_order_lines l
    JOIN purchase_orders o ON o.id = l.purchase_order_id
    WHERE l.product_id IN (SELECT product_id FROM mine)
      AND o.status = ANY(%(open_statuses)s)
    GROUP BY 1
)
SELECT m.product_id,
       p.sku,
       p.name                                        AS product,
       COALESCE(d.units_sold, 0)                     AS units_sold,
       ROUND(COALESCE(d.units_sold, 0) / %(days)s::numeric, 3) AS units_per_day,
       COALESCE(s.on_hand, 0)                        AS on_hand,
       COALESCE(s.on_hand_raw, 0)                    AS on_hand_raw,
       COALESCE(s.negative_rows, 0)                  AS negative_stock_rows,
       COALESCE(i.on_order, 0)                       AS on_order,
       CASE WHEN COALESCE(d.units_sold, 0) > 0
            THEN ROUND(COALESCE(s.on_hand, 0) / (d.units_sold / %(days)s::numeric), 1)
            END                                      AS days_of_cover,
       CASE WHEN COALESCE(d.units_sold, 0) > 0
            THEN %(today)s::date
                 + FLOOR(COALESCE(s.on_hand, 0) / (d.units_sold / %(days)s::numeric))::int
            END                                      AS run_out_date,
       CASE WHEN %(cover_days)s::numeric IS NULL THEN NULL
            ELSE GREATEST(0, CEIL(
                (COALESCE(d.units_sold, 0) / %(days)s::numeric) * %(cover_days)s::numeric
                - COALESCE(s.on_hand, 0) - COALESCE(i.on_order, 0)))
            END                                      AS suggested_order_qty,
       COUNT(*) OVER ()                              AS full_row_count
FROM mine m
LEFT JOIN products p  ON p.id = m.product_id
LEFT JOIN demand   d  ON d.product_id = m.product_id
LEFT JOIN stock    s  ON s.product_id = m.product_id
LEFT JOIN incoming i  ON i.product_id = m.product_id
{selling_predicate}
ORDER BY {order_by}
LIMIT {limit}
"""

# Where the product list comes from. The approved map when there is one, and
# otherwise what has been bought from them before — which is the same evidence
# the map was proposed from, minus anybody having agreed to it.
_MINE_FROM_HISTORY = """SELECT DISTINCT l.product_id
    FROM purchase_order_lines l
    JOIN purchase_orders o ON o.id = l.purchase_order_id
    WHERE lower(o.supplier_name) = lower(%(supplier)s)
      AND l.product_id IS NOT NULL"""

_MINE_FROM_MAP = """SELECT UNNEST(%(mapped_ids)s::text[]) AS product_id"""

_ORDER_BY = {
    "most_needed": "suggested_order_qty DESC NULLS LAST, units_per_day DESC NULLS LAST",
    "running_out": "days_of_cover ASC NULLS FIRST, units_per_day DESC NULLS LAST",
    "fastest_moving": "units_per_day DESC NULLS LAST",
}


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def get_purchase_plan(
    supplier: Optional[str] = None,
    cover_days: Optional[int] = None,
    lookback_days: Optional[int] = None,
    selling_only: bool = True,
    rank_by: str = "running_out",
    top_n: Optional[int] = None,
) -> dict:
    """
    A draft order for one supplier: what sells, what is left, and how long it lasts.

    Replaces exporting sales from StoreHub and going through them per supplier.
    Produces a draft to read and change — it writes nothing and sends nothing.
    Every row carries days_of_cover and run_out_date — the day the shelf
    empties at the measured rate, computed here from today's date, with what
    is on order NOT counted because it may already have arrived. Null with no
    sales in the window: no rate, no date.

    Args:
        supplier: The supplier's name as it appears on their purchase orders,
               case-insensitive. Supplier names are free text and are never
               normalised, so "Seikyo SEK001" and "Supplies" are both real
               names. Omit to list every supplier instead of planning one.
        cover_days: How long the order should last, in days. There is no
               business rule for this and none is invented: WITHOUT it the plan
               reports demand, stock and days of cover; WITH it, and only then,
               it suggests a quantity to order.
        lookback_days: How many days of sales to measure demand over. None uses
               the default in metrics.yaml.
        selling_only: True (default) covers only products that sold in the
               window. False includes everything ever bought from them,
               including products with no recent sales.
        rank_by: 'running_out' (least cover first, the default), 'most_needed'
               (largest suggested quantity), 'fastest_moving' (highest daily
               rate).
        top_n: Return only N rows, ranked in SQL. meta.full_row_count reports
               the size of the whole set.

    Returns:
        {"rows": [...], "meta": {...}} — meta always carries source_table,
        filters_applied, snapshot_timestamp and `coverage`. A non-empty
        meta["notice"] MUST be surfaced; it means the result is not what it
        appears.
    """
    defs = _load_defs()
    plan = _plan(defs)
    top_n = _validate_top_n(defs, top_n)

    if rank_by not in _ORDER_BY:
        raise ValueError(
            f"Unknown rank_by {rank_by!r}. Valid: {', '.join(sorted(_ORDER_BY))}."
        )
    if cover_days is not None and cover_days < 1:
        raise ValueError("cover_days must be at least 1 day.")
    if _req(_req(plan, "cover_days"), "invent_a_default") is not False:
        raise RuntimeError(
            "metrics.yaml purchasing.plan.cover_days.invent_a_default must stay false: "
            "the cover period is the reader's judgement, not a business rule."
        )

    days = int(lookback_days or _req(_req(plan, "demand"), "lookback_days"))
    if days < 7 or days > 365:
        raise ValueError("lookback_days must be between 7 and 365.")

    retail = _retail_ids(defs)
    scope_ids = list(_req(defs, "inventory.scope_store_ids"))   # retail + AJI BARN
    catalog = _store_catalog_for(defs, scope_ids)
    limit = top_n or int(_req(plan, "max_rows"))

    filters: list[str] = []
    notices: list[dict] = []

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # ---------------------------------------------------------------
            # No supplier named: list them. Supplier names are free text with
            # no master list, so this is how a caller learns the real spelling.
            # ---------------------------------------------------------------
            if not supplier:
                cur.execute(_SELECT_SUPPLIERS)
                rows = [dict(r) for r in cur.fetchall()]
                return {
                    "rows": rows,
                    "meta": {
                        "source_table": "purchase_orders",
                        "filters_applied": ["every supplier that appears on a purchase order"],
                        "snapshot_timestamp": snapshot_timestamp,
                        "view": "suppliers",
                        "grain": "one row per supplier name",
                        "row_count": len(rows),
                        "full_row_count": len(rows),
                        "supplier_master_exists": _req(
                            defs, "suppliers.purchase_orders.supplier_master_exists"),
                        "note": (
                            "Supplier is free text on the purchase order and is never "
                            "normalised or merged. Name one of these to plan an order."
                        ),
                    },
                }

            cur.execute(
                "SELECT COUNT(DISTINCT o.id) AS pos, MAX(o.created_at_source)::date AS last_order "
                "FROM purchase_orders o WHERE lower(o.supplier_name) = lower(%(s)s)",
                {"s": supplier},
            )
            found = dict(cur.fetchone())
            if not found["pos"]:
                cur.execute(
                    "SELECT DISTINCT supplier_name FROM purchase_orders "
                    "WHERE supplier_name ILIKE %(like)s ORDER BY 1 LIMIT 5",
                    {"like": f"%{supplier}%"},
                )
                near = [r["supplier_name"] for r in cur.fetchall()]
                raise ValueError(
                    f"No purchase orders recorded for supplier {supplier!r}."
                    + (f" Did you mean: {', '.join(near)}?" if near else
                       " Call this without a supplier to list every name on record.")
                )

            since_sql = (
                "((now() AT TIME ZONE 'Asia/Manila')::date - %(days)s * INTERVAL '1 day')"
            )
            cur.execute(
                f"SELECT {since_sql} AS since, (now() AT TIME ZONE 'Asia/Manila')::date AS today",
                {"days": days},
            )
            _head = cur.fetchone()
            since, today = _head["since"], _head["today"]

            filters.append(
                f"supplier = {supplier!r} (free text on the purchase order; never normalised)"
                f"   # metrics.yaml: suppliers.purchase_orders.supplier_is_free_text"
            )
            filters.append(
                f"demand = {days} days of sales across {len(retail)} retail shops, "
                f"cancelled excluded   # metrics.yaml: purchasing.plan.demand"
            )
            filters.append(
                f"stock = on hand across {len(scope_ids)} locations including AJI BARN"
                f"   # metrics.yaml: inventory.scope_store_ids"
            )

            params: dict[str, Any] = {
                "supplier": supplier,
                "retail_ids": retail,
                "scope_ids": scope_ids,
                "since": since,
                # The availability window is exactly `days` COMPLETE days and
                # never includes today, whose snapshot has not been taken.
                "since_date": (since.date() if hasattr(since, "date") else since),
                # run_out_date counts forward from the Manila date read in
                # this transaction (purchasing.plan.run_out_date.today).
                "today": today,
                "days": days,
                "cover_days": cover_days,
                "open_statuses": ["Open"],
            }
            # The approved map is authoritative when it exists; otherwise the
            # history it was proposed from.
            mapped = _mapped_products(defs, supplier)
            map_status = _load_map(defs).get("status")
            if mapped is not None:
                params["mapped_ids"] = mapped
                mine_sql = _MINE_FROM_MAP
                filters.append(
                    f"products = the approved supplier mapping ({len(mapped)} products)"
                    f"   # definitions/product_suppliers.yaml"
                )
            else:
                mine_sql = _MINE_FROM_HISTORY

            selling = "WHERE COALESCE(d.units_sold, 0) > 0" if selling_only else ""
            if selling_only:
                filters.append("only products that sold in the window")

            cur.execute(
                _SELECT_PLAN.format(
                    mine=mine_sql,
                    selling_predicate=selling,
                    order_by=_ORDER_BY[rank_by],
                    limit=limit,
                ),
                params,
            )
            rows = [dict(r) for r in cur.fetchall()]
            full_row_count = rows[0].pop("full_row_count") if rows else 0
            for r in rows[1:]:
                r.pop("full_row_count", None)

            # Availability, for the rows that came back. Not a calculation:
            # each product's own count of days with nothing, attached to it.
            starved_by_product: dict[str, int] = {}
            if rows:
                cur.execute(_SELECT_STARVED, {
                    "since_date": params["since_date"],
                    "retail_ids": retail,
                    "product_ids": [r["product_id"] for r in rows],
                })
                starved_by_product = {r["product_id"]: r["days_with_nothing"]
                                      for r in cur.fetchall()}
            for r in rows:
                r["days_with_nothing"] = starved_by_product.get(r["product_id"], 0)
                if hasattr(r.get("run_out_date"), "isoformat"):
                    r["run_out_date"] = r["run_out_date"].isoformat()

            # ---------------------------------------------------------------
            # COVERAGE. How much of what this supplier actually supplies could
            # be traced at all — the plan is a fraction of their range, and a
            # plan that hid that would read as a complete order.
            # ---------------------------------------------------------------
            link = _req(plan, "supplier_link")
            cur.execute(
                "WITH traceable AS ("
                "  SELECT DISTINCT l.product_id FROM purchase_order_lines l"
                "  JOIN purchase_orders o ON o.id = l.purchase_order_id"
                "  WHERE l.product_id IS NOT NULL AND o.supplier_name IS NOT NULL), "
                "sold AS ("
                "  SELECT DISTINCT ti.product_id FROM new_transaction_items ti"
                "  JOIN new_transactions t ON t.ref_id = ti.transaction_ref_id"
                "  WHERE t.is_cancelled = false AND t.store_id = ANY(%(retail_ids)s)"
                "    AND t.transaction_time >= %(since)s) "
                "SELECT (SELECT COUNT(*) FROM sold) AS sold_products, "
                "       (SELECT COUNT(*) FROM sold s WHERE s.product_id IN "
                "          (SELECT product_id FROM traceable)) AS traceable_products",
                {"retail_ids": retail, "since": since},
            )
            cov = dict(cur.fetchone())
            coverage = {
                "supplier_purchase_orders": found["pos"],
                "supplier_last_order": str(found["last_order"]) if found["last_order"] else None,
                "products_in_this_plan": full_row_count,
                "selling_products_estate_wide": cov["sold_products"],
                "selling_products_traceable_to_any_supplier": cov["traceable_products"],
                "supplier_is_declared_on_products": _req(link, "is_declared"),
            }
            if _req(link, "coverage_notice_mandatory"):
                untraceable = cov["sold_products"] - cov["traceable_products"]
                notices.append({
                    "kind": _req(link, "coverage_notice_kind"),
                    "message": (
                        f"Nothing records who supplies a product. This plan is built from what "
                        f"has been bought from {supplier} before, and across the whole business "
                        f"{untraceable:,} of the {cov['sold_products']:,} products that sold in "
                        f"the last {days} days cannot be traced to any supplier at all. This is "
                        f"part of an order, not all of one."
                    ),
                    "guidance": (
                        "The link is purchase_order_lines -> purchase_orders.supplier_name. "
                        "A declared supplier per product would close the gap."
                    ),
                    "source": "definitions/metrics.yaml: purchasing.plan.supplier_link",
                })

            if mapped is None and map_status == "proposed":
                m = _load_map(defs)
                measured = m.get("measured") or {}
                notices.append({
                    "kind": _req(link, "unapproved_notice_kind"),
                    "message": (
                        f"A product-to-supplier mapping has been proposed — "
                        f"{measured.get('proposed', 0)} products where the purchase history "
                        f"names exactly one supplier, and {measured.get('ambiguous', 0)} where it "
                        f"names several — and nobody has approved it yet. Until somebody does, "
                        f"this plan is built from purchase history alone."
                    ),
                    "guidance": (
                        "definitions/product_suppliers.yaml, status: proposed. A person sets it "
                        "to approved after reading it."
                    ),
                    "source": "definitions/metrics.yaml: purchasing.plan.supplier_link",
                })

            # Products this supplier shares with another supplier.
            cur.execute(
                "SELECT COUNT(*) AS n FROM ("
                "  SELECT l.product_id FROM purchase_order_lines l"
                "  JOIN purchase_orders o ON o.id = l.purchase_order_id"
                "  WHERE l.product_id IN ("
                "    SELECT DISTINCT l2.product_id FROM purchase_order_lines l2"
                "    JOIN purchase_orders o2 ON o2.id = l2.purchase_order_id"
                "    WHERE lower(o2.supplier_name) = lower(%(s)s))"
                "  GROUP BY l.product_id HAVING COUNT(DISTINCT o.supplier_name) > 1) x",
                {"s": supplier},
            )
            shared = cur.fetchone()["n"]
            if shared:
                notices.append({
                    "kind": _req(link, "ambiguous_notice_kind"),
                    "message": (
                        f"{shared} of these products have also been bought from a different "
                        f"supplier. They are included here because {supplier} has supplied them "
                        f"too, not because they can only come from them."
                    ),
                    "source": "definitions/metrics.yaml: purchasing.plan.supplier_link",
                })

    # ------------------------------------------------------------------
    # The caveats that change what the numbers mean.
    # ------------------------------------------------------------------
    neg_rows = sum(int(r.get("negative_stock_rows") or 0) for r in rows)
    if neg_rows and _req(_req(plan, "negative_on_hand"), "notice_mandatory"):
        notices.append({
            "kind": _req(_req(plan, "negative_on_hand"), "notice_kind"),
            "message": (
                f"{neg_rows} stock records behind these figures are negative, which is a broken "
                f"record rather than a shortage. Stock has been counted as none at those "
                f"locations rather than as a debt, so the quantities here are not inflated by "
                f"them. The raw figure is on each row as on_hand_raw."
            ),
            "source": "definitions/metrics.yaml: purchasing.plan.negative_on_hand",
        })

    starved_rows = [r for r in rows if (r.get("days_with_nothing") or 0) > 0]
    if starved_rows:
        worst = max(starved_rows, key=lambda r: r["days_with_nothing"])
        notices.append({
            "kind": _req(_req(plan, "availability"), "notice_kind"),
            "message": (
                f"{len(starved_rows)} of these products had nothing on the shelf anywhere for at "
                f"least one day in the window — the worst, {worst.get('product') or worst['product_id']}, "
                f"for {worst['days_with_nothing']} days. Their sales rate is what they sold while "
                f"available, so it understates what they would have sold. The rate has not been "
                f"adjusted: raising a measured figure to what it might have been would be inventing "
                f"a sale."
            ),
            "source": "definitions/metrics.yaml: purchasing.plan.availability",
        })

    if any((r.get("on_order") or 0) > 0 for r in rows):
        notices.append({
            "kind": "purchasing_open_not_outstanding",
            "message": (
                "What is shown as on order comes from purchase orders still marked Open, and "
                "Open does not mean not received — some carry notes saying the goods arrived. "
                "Some of that quantity may already be on the shelf."
            ),
            "source": "definitions/metrics.yaml: purchasing.open_is_not_outstanding",
        })

    if not _req(plan, "lead_time_available"):
        notices.append({
            "kind": "delivery_lead_time_unsupported",
            "message": (
                "Nothing records when goods actually arrive, so none of this allows for the "
                "wait between ordering and delivery. Whatever cover you choose starts from "
                "today, not from the day the stock lands."
            ),
            "source": "definitions/metrics.yaml: suppliers.lead_times.delivery",
        })

    if cover_days is None:
        notices.append({
            "kind": "cover_period_not_chosen",
            "message": (
                "No quantity is suggested because no cover period was given. There is no rule "
                "for how long an order should last — say how many days you want it to cover and "
                "the quantities follow."
            ),
            "source": "definitions/metrics.yaml: purchasing.plan.cover_days",
        })

    notice: Optional[dict] = None
    if len(notices) == 1:
        notice = notices[0]
    elif notices:
        notice = {"kind": "multiple", "items": notices}

    meta: dict[str, Any] = {
        "source_table": "purchase_orders + new_transactions + inventory",
        "filters_applied": filters,
        "snapshot_timestamp": snapshot_timestamp,
        "view": "plan",
        "grain": "one row per product supplied by this supplier",
        "supplier": supplier,
        "window": {"lookback_days": days, "since": str(since)},
        "cover_days": cover_days,
        "locations_counted": [
            catalog[s].get("display_name") or catalog[s]["name"]
            for s in scope_ids if s in catalog
        ],
        "coverage": coverage,
        "supplier_map": {
            "status": map_status,
            "authoritative": mapped is not None,
            "products_from_map": len(mapped) if mapped is not None else None,
        },
        "ranked_by": rank_by,
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "is_a_draft": True,
        "writes_anything": False,
        "definitions": {
            "suggested_order_qty":
                "ceil(units_per_day * cover_days) - on_hand - on_order, floored at zero",
            "on_hand": "negative readings counted as none at that location, never as a deficit",
            "run_out_date": (
                f"{_req(_req(plan, 'run_out_date'), 'formula')}; on order not counted "
                f"(it may already have arrived); null with no sales in the window"
            ),
            "source": "definitions/metrics.yaml: purchasing.plan",
        },
    }
    if notice:
        meta["notice"] = notice

    return {"rows": rows, "meta": meta}
