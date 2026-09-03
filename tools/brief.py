"""
George — the morning brief.

One public function: get_brief().

WHAT MAKES A BRIEF DANGEROUS. It is short, read in a hurry, and every source it
touches has a different age. The sources it would naturally mix are between 0
and 64 days old, so a brief that says "since yesterday" over all of them is
lying about most of them. Omission is the lie a brief tells most easily: a
section quietly left out reads as "nothing happened there".

So this tool does three things other tools do not have to:

  1. NAMES EVERY SOURCE, including the ones too stale or too frozen to speak.
     A source that cannot answer is an ITEM, with its age and the reason.
  2. GIVES EVERY ITEM ITS OWN as-of. A brief-level timestamp would lend the
     freshest source's credibility to the stalest source's facts.
  3. DISTINGUISHES EMPTY FROM QUIET. "Nothing crossed the threshold" and "the
     data never arrived" look identical on a phone at 6am and mean opposite
     things.

COMPARISON IS AGAINST THE SAME WEEKDAY LAST WEEK, NOT YESTERDAY. Measured over
120 closed days: day-over-day swings a median 21.3%, the same weekday a week
earlier 12.5%, and Sunday averages three times Monday. A day-over-day brief
would report a catastrophe every Monday by construction. See
metrics.yaml brief.sales_vs_same_weekday.

A DELIBERATE DEPARTURE FROM THE {rows, meta} CONTRACT: every ROW carries its own
`receipts`. A brief is multi-source by nature and UI rule 6 wants a timestamp
per figure, not one for the page. meta still carries the brief-level filters,
the source table and the thresholds as applied.

Architecture rules (CLAUDE.md): vetted parameterized queries only, every
threshold read from definitions/metrics.yaml, read-only role.
"""

from __future__ import annotations

import statistics
from datetime import date, timedelta
from typing import Any, Optional

from ._common import (
    DICT_ROW,
    DEFS_PATH as _DEFS_PATH,
    connect as _connect,
    label_store as _label_store,
    load_defs as _load_defs,
    req as _req,
    store_catalog as _store_catalog_for,
)

# --------------------------------------------------------------------------
# Queries. One per section, all fixed SQL with bound parameters.
# --------------------------------------------------------------------------

# Net sales per store for two specific Manila calendar days, plus that store's
# median day over the trailing window that sets its own noise floor.
_SALES_TWO_DAYS = """
SELECT t.store_id,
       (t.transaction_time AT TIME ZONE 'Asia/Manila')::date AS day,
       SUM(t.total) AS value
FROM new_transactions t
WHERE {guard}
  AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date = ANY(%(days)s)
GROUP BY 1, 2
"""

_SALES_DAILY_HISTORY = """
SELECT t.store_id,
       (t.transaction_time AT TIME ZONE 'Asia/Manila')::date AS day,
       SUM(t.total) AS value
FROM new_transactions t
WHERE {guard}
  AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date >= %(since)s
  AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date <  %(before)s
GROUP BY 1, 2
"""

# Products that were positive on the earlier snapshot day and non-positive on
# the later one. Negative counts as out (inventory.states.out_of_stock).
_CROSSED_OUT = """
SELECT s_new.store_id,
       s_new.product_id,
       p.sku,
       p.name AS product,
       s_old.quantity_on_hand AS was,
       s_new.quantity_on_hand AS now
FROM inventory_snapshots s_new
JOIN inventory_snapshots s_old
  ON s_old.store_id = s_new.store_id
 AND s_old.product_id = s_new.product_id
 AND s_old.snapshot_date = %(old_day)s
LEFT JOIN products p ON p.id = s_new.product_id
WHERE s_new.snapshot_date = %(new_day)s
  AND s_new.store_id = ANY(%(store_ids)s)
  AND s_old.quantity_on_hand > 0
  AND s_new.quantity_on_hand <= 0
ORDER BY s_old.quantity_on_hand DESC
LIMIT {limit}
"""

# The two most recent snapshot days available at all.
_SNAPSHOT_DAYS = """
SELECT DISTINCT snapshot_date
FROM inventory_snapshots
WHERE snapshot_date <= %(upto)s
ORDER BY snapshot_date DESC
LIMIT 2
"""

# Products still held that crossed the no-sale window overnight: no sale in the
# window ending today, but a sale in the window ending yesterday — i.e. their
# last sale fell out of the window while nobody was looking.
#
# One scan of the line items into a CTE, then anti-joined, for the same reason
# dead_stock does it: a correlated NOT EXISTS per inventory row would re-scan
# 891,714 line items once per product.
_NEWLY_DEAD = """
WITH sold AS (
    SELECT ti.product_id,
           MAX((t.transaction_time AT TIME ZONE 'Asia/Manila')::date) AS last_sold
    FROM new_transaction_items ti
    INNER JOIN new_transactions t ON ti.transaction_ref_id = t.ref_id
    WHERE {guard}
      AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date >= %(window_start_prev)s
    GROUP BY ti.product_id
)
SELECT i.store_id,
       i.product_id,
       p.sku,
       p.name AS product,
       i.quantity_on_hand,
       sold.last_sold
FROM inventory i
LEFT JOIN products p ON p.id = i.product_id
INNER JOIN sold ON sold.product_id = i.product_id
WHERE i.store_id = ANY(%(store_ids)s)
  AND {held}
  AND sold.last_sold = %(fell_out_on)s
ORDER BY i.quantity_on_hand DESC
LIMIT {limit}
"""

# Freshness of every source the brief either uses or has to explain away.
_FRESHNESS = """
SELECT 'transactions'        AS source, MAX(transaction_time)::date AS latest FROM new_transactions
UNION ALL SELECT 'inventory_snapshots', MAX(snapshot_date)          FROM inventory_snapshots
UNION ALL SELECT 'vending_lines',       MAX(shipment_time)::date    FROM vending_order_lines
UNION ALL SELECT 'vending_aisles',      MAX(updated_at)::date       FROM vending_aisles
UNION ALL SELECT 'stock_transfers',     MAX(created_at_source)::date FROM stock_transfers
UNION ALL SELECT 'purchase_orders',     MAX(created_at_source)::date FROM purchase_orders
"""

_NEWEST_TXN = "SELECT MAX(transaction_time) AS newest FROM new_transactions"


def _guard(defs: dict) -> tuple[str, list[str]]:
    """The standard sales guard, with the retail scope bound as a parameter."""
    store_ids = [s["id"] for s in _req(defs, "stores.active_retail")]
    sql = (
        f"{_req(defs, 'filters.cancelled.sql')}\n"
        f"  AND {_req(defs, 'filters.returns.sale_sql')}\n"
        f"  AND t.store_id = ANY(%(store_ids)s)"
    )
    return sql, store_ids


def _fmt_day(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def get_brief(as_of: Optional[date | str] = None) -> dict:
    """
    What changed since yesterday, across the sources that can actually say.

    Three sections — sales against the same weekday last week, products that
    crossed into out of stock, and products that crossed 30 days without a sale
    — plus an explicit account of every source that is too stale or too frozen
    to contribute.

    Args:
        as_of: the Manila calendar day the brief is written ON. Yesterday is the
               day before it. Defaults to today; pass a date to reproduce a past
               morning.

    Returns:
        {"rows": [...], "meta": {...}}. Each row carries its own `receipts` —
        a brief mixes sources of different ages, so one timestamp for the page
        would be a lie about most of them.
    """
    defs = _load_defs()
    bdefs = _req(defs, "brief")
    limit = _req(defs, "brief.max_items_per_section")
    guard_sql, retail_ids = _guard(defs)

    rows: list[dict] = []
    notices: list[dict] = []
    sections: dict[str, dict] = {}

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at, (now() AT TIME ZONE 'Asia/Manila')::date AS manila_today")
            head = cur.fetchone()
            snapshot_timestamp = head["read_at"]

            today = as_of or head["manila_today"]
            if isinstance(today, str):
                today = date.fromisoformat(today)
            yesterday = today - timedelta(days=1)
            baseline_day = yesterday - timedelta(
                days=_req(defs, "brief.sales_vs_same_weekday.baseline_offset_days")
            )

            # ---- freshness, first: it decides what may speak at all --------
            cur.execute(_FRESHNESS)
            freshness = {r["source"]: r["latest"] for r in cur.fetchall()}
            max_age = _req(defs, "brief.freshness.max_age_days")
            frozen = set(_req(defs, "brief.freshness.frozen_sources"))

            sources = []
            for name, latest in freshness.items():
                age = (today - latest).days if latest else None
                limit_days = max_age.get(name)
                stale = age is None or (limit_days is not None and age > limit_days)
                sources.append({
                    "source": name,
                    "latest": _fmt_day(latest),
                    "age_days": age,
                    "fresh": not stale,
                    "frozen": name in frozen,
                })

            cur.execute(_NEWEST_TXN)
            newest_txn = cur.fetchone()["newest"]

            # ---- 1. sales vs the same weekday last week --------------------
            cur.execute(
                _SALES_TWO_DAYS.format(guard=guard_sql),
                {"store_ids": retail_ids, "days": [yesterday, baseline_day]},
            )
            by_store_day: dict[tuple, float] = {
                (r["store_id"], r["day"]): float(r["value"]) for r in cur.fetchall()
            }

            lookback = _req(defs, "brief.sales_vs_same_weekday.median_lookback_days")
            cur.execute(
                _SALES_DAILY_HISTORY.format(guard=guard_sql),
                {"store_ids": retail_ids,
                 "since": today - timedelta(days=lookback),
                 "before": today},
            )
            history: dict[str, list[float]] = {}
            for r in cur.fetchall():
                history.setdefault(r["store_id"], []).append(float(r["value"]))

            # ---- 2. stock crossings ----------------------------------------
            cur.execute(_SNAPSHOT_DAYS, {"upto": yesterday})
            snap_days = [r["snapshot_date"] for r in cur.fetchall()]
            crossed: list[dict] = []
            if len(snap_days) == 2:
                new_day, old_day = snap_days[0], snap_days[1]
                cur.execute(
                    _CROSSED_OUT.format(limit=limit),
                    {"new_day": new_day, "old_day": old_day,
                     "store_ids": _req(defs, "inventory.scope_store_ids")},
                )
                crossed = [dict(r) for r in cur.fetchall()]
            else:
                new_day = old_day = None

            # ---- 3. crossed 30 days without a sale -------------------------
            window_days = _req(defs, "brief.newly_dead.window_days")
            # The last sale that has just fallen out of the window.
            fell_out_on = today - timedelta(days=window_days + 1)
            cur.execute(
                _NEWLY_DEAD.format(
                    guard=guard_sql,
                    held=_req(defs, "dead_stock.stock_predicate"),
                    limit=limit,
                ),
                {"store_ids": retail_ids,
                 "window_start_prev": fell_out_on,
                 "fell_out_on": fell_out_on},
            )
            newly_dead = [dict(r) for r in cur.fetchall()]

    catalog = _store_catalog_for(defs, retail_ids)
    inv_catalog = _store_catalog_for(defs, _req(defs, "inventory.scope_store_ids"))

    # ---- build the sales rows ---------------------------------------------
    pct_threshold = _req(defs, "brief.sales_vs_same_weekday.pct_threshold")
    floor_fraction = _req(defs, "brief.sales_vs_same_weekday.absolute_floor_fraction")
    sales_receipts = {
        "source_table": _req(defs, "metrics.net_sales.source_table"),
        "filters_applied": [
            f"{_req(defs, 'filters.cancelled.sql')}   # metrics.yaml: filters.cancelled",
            f"{_req(defs, 'filters.returns.sale_sql')}   # metrics.yaml: filters.returns",
            f"t.store_id IN ({len(retail_ids)} active retail)   # metrics.yaml: stores.active_retail",
        ],
        "as_of": {"day": _fmt_day(yesterday), "baseline": _fmt_day(baseline_day),
                  "comparison": "same weekday last week"},
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
    }

    sales_considered = 0
    for sid in retail_ids:
        value = by_store_day.get((sid, yesterday))
        baseline = by_store_day.get((sid, baseline_day))
        if value is None or not baseline:
            continue
        sales_considered += 1
        change = value - baseline
        pct = change / baseline * 100.0
        days = history.get(sid) or []
        median_day = statistics.median(days) if days else 0.0
        floor = median_day * floor_fraction

        if abs(pct) < pct_threshold or abs(change) < floor:
            continue

        rows.append({
            "section": "sales_vs_same_weekday",
            "subject": _label_store(catalog, sid),
            "store_id": sid,
            "value": round(value, 2),
            "baseline": round(baseline, 2),
            "change": round(change, 2),
            "change_pct": round(pct, 1),
            "direction": "up" if change > 0 else "down",
            "unit": "PHP",
            "threshold_applied": {
                "pct_threshold": pct_threshold,
                "absolute_floor": round(floor, 2),
                "floor_basis": (
                    f"{floor_fraction:.0%} of this store's median day "
                    f"({median_day:,.0f}) over {lookback} days"
                ),
            },
            "receipts": sales_receipts,
        })
    sections["sales_vs_same_weekday"] = {
        "items": sum(1 for r in rows if r["section"] == "sales_vs_same_weekday"),
        "stores_considered": sales_considered,
        "compared": f"{yesterday} vs {baseline_day} (same weekday)",
    }

    # ---- stock crossings ---------------------------------------------------
    stock_receipts = {
        "source_table": _req(defs, "inventory.history_table"),
        "filters_applied": [
            "was quantity_on_hand > 0, now <= 0   # metrics.yaml: brief.stock_crossed_out",
            f"store_id IN ({len(_req(defs, 'inventory.scope_store_ids'))})   "
            f"# metrics.yaml: inventory.scope_store_ids",
        ],
        "as_of": {"compared": [_fmt_day(old_day), _fmt_day(new_day)]},
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
    }
    for r in crossed:
        rows.append({
            "section": "stock_crossed_out",
            "subject": r["product"] or r["sku"] or r["product_id"],
            "sku": r["sku"],
            "store": _label_store(inv_catalog, r["store_id"]),
            "was": float(r["was"]),
            "now": float(r["now"]),
            "receipts": stock_receipts,
        })
    gap_days = (new_day - old_day).days - 1 if new_day and old_day else None
    sections["stock_crossed_out"] = {
        "items": len(crossed),
        "compared": [_fmt_day(old_day), _fmt_day(new_day)],
        "snapshot_gap_days": gap_days,
    }

    # ---- crossed 30 days without a sale ------------------------------------
    dead_receipts = {
        "source_table": "inventory + new_transaction_items",
        "filters_applied": [
            f"{_req(defs, 'dead_stock.stock_predicate')}   # metrics.yaml: dead_stock.stock_predicate",
            f"last sale on {fell_out_on} — the day that fell out of the "
            f"{window_days}-day window   # metrics.yaml: brief.newly_dead",
            f"store_id IN ({len(retail_ids)} active retail)   # metrics.yaml: dead_stock.scope",
        ],
        "as_of": {"window_days": window_days, "fell_out_on": _fmt_day(fell_out_on)},
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
    }
    for r in newly_dead:
        rows.append({
            "section": "newly_dead",
            "subject": r["product"] or r["sku"] or r["product_id"],
            "sku": r["sku"],
            "store": _label_store(catalog, r["store_id"]),
            "quantity_on_hand": float(r["quantity_on_hand"]),
            "last_sold": _fmt_day(r["last_sold"]),
            "receipts": dead_receipts,
        })
    sections["newly_dead"] = {"items": len(newly_dead), "window_days": window_days}

    # ---- notices -----------------------------------------------------------
    # Stale and frozen sources are reported, never omitted. A section quietly
    # left out reads as "nothing happened there".
    stale = [s for s in sources if not s["fresh"]]
    if stale:
        notices.append({
            "kind": "stale_sources",
            "message": (
                "These sources are too old to say what changed since yesterday, so "
                "the brief covers nothing from them: "
                + "; ".join(
                    f"{s['source']} last has data from {s['latest']} "
                    f"({s['age_days']} days ago"
                    + (", frozen — loaded once from a CSV import and cannot change "
                       "until someone imports again" if s["frozen"] else "")
                    + ")"
                    for s in stale
                )
                + "."
            ),
            "source": "metrics.yaml: brief.freshness",
        })

    if gap_days:
        notices.append({
            "kind": "snapshot_gaps",
            "message": (
                f"The two most recent stock snapshots are {old_day} and {new_day}, "
                f"{gap_days} day(s) apart — not consecutive. Anything that went out "
                f"of stock and came back inside that gap is invisible here."
            ),
            "source": "metrics.yaml: brief.stock_crossed_out.compare",
        })

    # Empty is not quiet. Say WHICH, per section.
    for name, s in sections.items():
        if s["items"] == 0:
            reason = (
                "no stock snapshots were available to compare"
                if name == "stock_crossed_out" and not new_day
                else "no store had both days of sales to compare"
                if name == "sales_vs_same_weekday" and not sales_considered
                else "nothing crossed the threshold"
            )
            notices.append({
                "kind": "empty_section",
                "message": (
                    f"{name}: nothing to report, because {reason}. That is not the "
                    f"same as the data being missing — this section ran."
                    if reason == "nothing crossed the threshold" else
                    f"{name}: nothing to report because {reason}. The section could "
                    f"not run, which is different from a quiet morning."
                ),
                "source": "metrics.yaml: brief.empty_section_must_distinguish",
            })

    if not _req(defs, "brief.stock_crossed_out.low_stock_available"):
        notices.append({
            "kind": "low_stock_not_operational",
            "message": (
                "There is no 'newly low on stock' section. Low-stock thresholds "
                "(inventory.warning_stock) have never been set — they are null on "
                "100% of rows — so nothing can ever be low. Only the crossing into "
                "out-of-stock is reported."
            ),
            "source": "metrics.yaml: inventory.low_stock_operational",
        })

    meta: dict[str, Any] = {
        "source_table": "multiple — each row carries its own receipts",
        "filters_applied": [
            f"brief written on {today} (Asia/Manila); yesterday = {yesterday}",
            f"sales compared against {baseline_day}, the same weekday   "
            f"# metrics.yaml: brief.sales_vs_same_weekday.comparison",
            f"max {limit} items per section   # metrics.yaml: brief.max_items_per_section",
        ],
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "as_of": {"today": _fmt_day(today), "yesterday": _fmt_day(yesterday),
                  "sales_baseline": _fmt_day(baseline_day)},
        "sections": sections,
        "sources": sources,
        "row_count": len(rows),
        "thresholds": {
            "sales_pct": pct_threshold,
            "sales_absolute_floor_fraction": floor_fraction,
            "sales_median_lookback_days": lookback,
        },
        # Yesterday closed six hours before a 6am brief and the sync can lag, so
        # the reader is shown the newest transaction and can judge for themselves
        # whether yesterday looks complete.
        "newest_transaction": newest_txn.isoformat() if newest_txn else None,
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
