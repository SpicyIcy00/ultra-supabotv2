"""
George — stock history tool.

One public function: get_stock_history().

WHY THIS EXISTS. `inventory` is point-in-time state: it can say a product is
out of stock now, and nothing at all about how long it has been, when it went,
or how often it happens. `inventory_snapshots` holds 5,133,521 rows of daily
stock — 188 days across 9 locations — and until this module the only thing
reading it was the brief, which compares the two most recent days. Ninety-nine
percent of the history was unreachable, which is why every "why did sales move"
answer was given without knowing whether the product was on the shelf.

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL against raw tables. There are exactly THREE SELECT
    templates below, one per view. Their predicates are assembled only from
    definitions read out of definitions/metrics.yaml plus bound parameters.
    Nothing is interpolated from caller input.
  - Every return is {rows, meta}, and meta always carries source_table,
    filters_applied and snapshot_timestamp.
  - No business definition is hardcoded here. What "out of stock" means, what
    an absent day means, whether a run may span a gap, and how a negative
    quantity is read are all READ from metrics.yaml `inventory.history`.
  - Read-only Postgres role, enforced by _connect().

THREE THINGS ABOUT THIS TABLE THAT WOULD MAKE A NAIVE ANSWER A LIE, all
measured on 2026-09-09 and all recorded in metrics.yaml `inventory.history`:

  1. A DAY WITH NO ROW IS NOT A ZERO. The average (store, product) pair appears
     on 162 of 188 days; only 2,170 of 31,767 pairs appear on all of them.
     Reading absence as "no stock" would invent more stockouts than exist.
     Absence is never counted as a stockout here — it ends a run.

  2. THE DAYS ARE NOT CONTINUOUS. Five gaps, the longest fourteen days. A run
     of consecutive OBSERVED days is not a run of consecutive calendar days, so
     a run is broken whenever the previous observation is not the previous
     calendar day, and coverage travels on every result.

  3. NEGATIVE QUANTITIES ARE A FAULT, NOT A LEVEL. 370,703 rows (7.2%) are
     negative and the lowest is -24,734,969 at AJI BARN. They are counted as
     not-in-stock, never summed, and always named in a notice.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from ._common import (
    DICT_ROW,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    LEFT_OUT as _LEFT_OUT,
    connect as _connect,
    left_out as _left_out,
    load_defs as _load_defs,
    req as _req,
    resolve_store as _resolve_store_in,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)


def _hist(defs: dict) -> dict:
    return _req(defs, "inventory.history")


def _store_catalog(defs: dict) -> dict[str, dict]:
    """
    id -> entry for every store this tool will answer about.

    The inventory scope (7 retail + AJI BARN), NOT every store present in
    inventory_snapshots. AJI CMG also has snapshot rows, and vending is a
    separate domain that must never be mixed with store data (CLAUDE.md rule 7);
    its stock is get_vending_stock's.
    """
    return _store_catalog_for(defs, _req(defs, "inventory.scope_store_ids"))


# --------------------------------------------------------------------------
# The query templates — one per view, and no others
# --------------------------------------------------------------------------

# Runs of consecutive OBSERVED days. `breaks` starts a new island whenever the
# previous row for this pair is not the previous calendar day, or the
# out-of-stock flag changed. Summing it gives each run its own island id, so a
# gap can never be bridged — which is metrics.yaml `history.run_spans_gaps:
# false` expressed in SQL.
_ISLANDS = """
WITH obs AS (
    SELECT s.store_id,
           s.product_id,
           s.snapshot_date,
           s.quantity_on_hand,
           ({out_of_stock})       AS is_out,
           (s.quantity_on_hand < 0) AS is_negative,
           LAG(s.snapshot_date)  OVER w AS prev_day,
           LAG(({out_of_stock})) OVER w AS prev_out
    FROM inventory_snapshots s
    WHERE s.snapshot_date >= %(start)s
      AND s.snapshot_date <= %(end)s
      AND s.store_id = ANY(%(store_ids)s)
      {product_predicate}
    WINDOW w AS (PARTITION BY s.store_id, s.product_id ORDER BY s.snapshot_date)
),
marked AS (
    SELECT obs.*,
           CASE WHEN {run_break} OR prev_out IS DISTINCT FROM is_out
                THEN 1 ELSE 0 END AS breaks
    FROM obs
),
islands AS (
    SELECT marked.*,
           SUM(breaks) OVER (PARTITION BY store_id, product_id
                             ORDER BY snapshot_date
                             ROWS UNBOUNDED PRECEDING) AS island
    FROM marked
)
"""

# One row per store and product. `days_out_of_stock` counts observed days only;
# `observed_days` sits beside it on every row so the two are always read
# together.
_SELECT_STOCKOUTS = _ISLANDS + """,
agg AS (
    SELECT store_id, product_id,
           COUNT(*)                             AS observed_days,
           COUNT(*) FILTER (WHERE is_out)       AS days_out_of_stock,
           COUNT(*) FILTER (WHERE is_negative)  AS days_negative,
           MIN(snapshot_date)                   AS first_observed,
           MAX(snapshot_date)                   AS last_observed
    FROM islands
    GROUP BY 1, 2
),
runs AS (
    SELECT store_id, product_id, island, is_out,
           COUNT(*)           AS run_days,
           MAX(snapshot_date) AS run_to
    FROM islands
    GROUP BY 1, 2, 3, 4
),
runstat AS (
    SELECT r.store_id, r.product_id,
           MAX(r.run_days) AS longest_stockout_run,
           MAX(CASE WHEN r.run_to = a.last_observed THEN r.run_days ELSE 0 END)
               AS current_stockout_run
    FROM runs r
    JOIN agg a ON a.store_id = r.store_id AND a.product_id = r.product_id
    WHERE r.is_out
    GROUP BY 1, 2
)
SELECT COUNT(*) OVER () AS full_row_count,
       a.store_id,
       a.product_id,
       p.sku,
       p.name AS product,
       a.observed_days,
       a.days_out_of_stock,
       a.days_negative,
       COALESCE(rs.longest_stockout_run, 0) AS longest_stockout_run,
       COALESCE(rs.current_stockout_run, 0) AS current_stockout_run,
       a.first_observed,
       a.last_observed
FROM agg a
LEFT JOIN runstat rs ON rs.store_id = a.store_id AND rs.product_id = a.product_id
LEFT JOIN products p ON p.id = a.product_id
WHERE a.days_out_of_stock >= %(min_days)s
  {left_out_predicate}
ORDER BY {order_by}
LIMIT {limit}
"""

# One row per observed day, for a single product at a single store. Absent days
# are simply not here — they are reported as coverage, never drawn as zero.
_SELECT_SERIES = """
SELECT s.store_id,
       s.product_id,
       p.sku,
       p.name AS product,
       s.snapshot_date,
       s.quantity_on_hand,
       ({out_of_stock})         AS out_of_stock,
       (s.quantity_on_hand < 0) AS negative_on_hand
FROM inventory_snapshots s
LEFT JOIN products p ON p.id = s.product_id
WHERE s.snapshot_date >= %(start)s
  AND s.snapshot_date <= %(end)s
  AND s.store_id = ANY(%(store_ids)s)
  {product_predicate}
ORDER BY s.snapshot_date
LIMIT {limit}
"""

# Which days exist, per store. This is the answer to "how much of this window
# do we actually have", and it is what makes every other number here readable.
_SELECT_COVERAGE = """
SELECT s.store_id,
       COUNT(DISTINCT s.snapshot_date) AS observed_days,
       MIN(s.snapshot_date)            AS first_observed,
       MAX(s.snapshot_date)            AS last_observed,
       COUNT(DISTINCT s.product_id)    AS products_seen
FROM inventory_snapshots s
WHERE s.snapshot_date >= %(start)s
  AND s.snapshot_date <= %(end)s
  AND s.store_id = ANY(%(store_ids)s)
GROUP BY 1
ORDER BY observed_days DESC
"""

# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def get_stock_history(
    store: Optional[str] = None,
    sku: Optional[str] = None,
    view: str = "stockouts",
    start: Optional[date | str] = None,
    end: Optional[date | str] = None,
    days: Optional[int] = None,
    rank_by: str = "longest_out",
    min_days_out: int = 1,
    top_n: Optional[int] = None,
    *,
    left_out: Any = None,
) -> dict:
    """
    Stock levels over time: how long products have been out of stock, and when.

    Answers what `get_stock` cannot, because that tool reads current state only:
    how long something has been out, how often it goes out, and whether it was
    on the shelf during a period whose sales you are asking about.

    Args:
        store: Store display name (case-insensitive) or store id. None = the
               whole inventory scope (7 retail shops + AJI BARN). Vending is a
               separate domain — AJI CMG stock is get_vending_stock's.
        sku:   Exact products.sku, case-insensitive. Required for the 'series'
               view. No substring matching — a partial SKU match is a silently
               wrong answer.
        view:  'stockouts' (default) one row per store and product, with days
               out and run lengths. 'series' one row per observed day for a
               single product. 'coverage' which days exist per store.
        start: First calendar date to consider. None = derived from `days`.
        end:   Last calendar date to consider. None = the latest day in the
               file, which is not necessarily today.
        days:  Window length in OBSERVED days back from `end`, when `start` is
               not given. None = the default in metrics.yaml.
        rank_by: How the stockout view is ranked, in SQL: 'longest_out' (the
               longest single run), 'still_out' (out right now, longest first),
               'most_days_out' (most days out in total).
        min_days_out: Only return products out of stock at least this many
               observed days. 1 = anything that went out at all; 0 = every
               product including ones that never did.
        top_n: Return only N rows, ranked in SQL. meta.full_row_count reports
               the size of the whole set.

    Returns:
        {"rows": [...], "meta": {...}} — meta always carries source_table,
        filters_applied, snapshot_timestamp and `coverage`. A non-empty
        meta["notice"] MUST be surfaced to the user; it means the result is not
        what it appears.

    `left_out` is supplied by the loop, never the model: the categories a
    person said to leave out (metrics.yaml settings.declared
    .left_out_categories). The stockouts view leaves them out and its
    receipt says so; one product's series and the coverage view do not.
    """
    defs = _load_defs()
    hist = _hist(defs)
    catalog = _store_catalog(defs)
    store_ids = _resolve_store_in(store, catalog)
    top_n = _validate_top_n(defs, top_n)

    views = _req(hist, "views")
    if view not in views:
        raise ValueError(
            f"Unknown view {view!r}. Valid: {', '.join(sorted(views))} "
            f"(metrics.yaml: inventory.history.views)."
        )
    rank_modes = _req(hist, "rank_modes")
    if rank_by not in rank_modes:
        raise ValueError(
            f"Unknown rank_by {rank_by!r}. Valid: {', '.join(sorted(rank_modes))} "
            f"(metrics.yaml: inventory.history.rank_modes)."
        )
    if view == "series" and not sku:
        raise ValueError(
            "The 'series' view needs a sku: it returns one row per day for one "
            "product. Ask for the 'stockouts' view to rank products instead."
        )

    if isinstance(start, str):
        start = date.fromisoformat(start)
    if isinstance(end, str):
        end = date.fromisoformat(end)

    max_days = int(_req(hist, "max_window_days"))
    if days is not None and (days < 1 or days > max_days):
        raise ValueError(
            f"days must be between 1 and {max_days} "
            f"(metrics.yaml: inventory.history.max_window_days)."
        )
    budget = int(_req(hist, "max_store_days"))

    out_of_stock_sql = _req(hist, "out_of_stock_sql")
    run_break_sql = _req(hist, "run_break_sql")
    limit = top_n or _MAX_ROWS

    filters: list[str] = []
    notices: list[dict] = []

    store_labels = [catalog[s].get("display_name") or catalog[s]["name"] for s in store_ids]
    filters.append(
        f"store_id IN ({len(store_ids)}: {', '.join(store_labels)})"
        f"   # metrics.yaml: inventory.scope_store_ids"
    )
    # What a person said to leave out (P2S.11): the stockouts view is a list
    # of products; a series of one product and the coverage view are not.
    left = _left_out(defs, left_out, lists=view == "stockouts",
                     names_product=sku is not None)
    filters.extend(left["filters_applied"])

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # ---------------------------------------------------------------
            # The window, in OBSERVED days. `end` defaults to the latest day in
            # the file and not to today, because the file is a day or two
            # behind and a window ending today would report its own lag as a
            # gap.
            # ---------------------------------------------------------------
            cur.execute("SELECT MIN(snapshot_date) AS lo, MAX(snapshot_date) AS hi "
                        "FROM inventory_snapshots")
            span = cur.fetchone()
            if span["hi"] is None:
                raise RuntimeError("inventory_snapshots is empty.")
            file_first, file_last = span["lo"], span["hi"]

            if end is None:
                end = file_last
            if start is None:
                want = days or int(_req(hist, "default_window_days"))
                cur.execute(
                    "SELECT MIN(d) AS lo FROM (SELECT DISTINCT snapshot_date AS d "
                    "FROM inventory_snapshots WHERE snapshot_date <= %(end)s "
                    "ORDER BY d DESC LIMIT %(want)s) x",
                    {"end": end, "want": want},
                )
                start = cur.fetchone()["lo"] or file_first

            if start > end:
                raise ValueError(f"start {start} is after end {end}.")

            filters.append(
                f"snapshot_date BETWEEN {start.isoformat()} AND {end.isoformat()}"
                f"   # metrics.yaml: inventory.history.table"
            )

            # A run has to be computed over every row in the window, so the
            # cost is days x stores. Past the budget the server kills the
            # statement, and a timeout reaches the caller as a crash rather
            # than as an answer — so refuse first, and say what to narrow.
            store_days = ((end - start).days + 1) * len(store_ids)
            if view != "coverage" and sku is None and store_days > budget:
                raise ValueError(
                    f"That window is too wide to compute runs over: "
                    f"{(end - start).days + 1} days across {len(store_ids)} locations is "
                    f"{store_days} store-days, and the limit is {budget} "
                    f"(metrics.yaml: inventory.history.max_store_days). "
                    f"Narrow it to one shop, name a sku, or shorten the window."
                )

            # ---------------------------------------------------------------
            # SKU -> product ids, so "SKU does not exist" and "SKU exists but
            # has no snapshot rows" stay distinguishable.
            # ---------------------------------------------------------------
            product_ids: Optional[list[str]] = None
            sku_resolution: Optional[dict] = None
            product_predicate = ""
            params: dict[str, Any] = {
                "start": start, "end": end, "store_ids": store_ids,
                "min_days": max(0, int(min_days_out)),
                **left["params"],
            }
            if sku is not None:
                cur.execute(
                    "SELECT p.id, p.sku, p.name, p.unit_price, "
                    f"       {_req(defs, 'products.category_normalization.sql')} AS category "
                    "FROM products p WHERE lower(p.sku) = lower(%s) ORDER BY p.id",
                    (sku,),
                )
                matches = [dict(m) for m in cur.fetchall()]
                product_ids = [m["id"] for m in matches]
                sku_resolution = {
                    "sku": sku, "product_count": len(matches), "product_ids": product_ids,
                }
                product_predicate = "AND s.product_id = ANY(%(product_ids)s)"
                params["product_ids"] = product_ids
                filters.append(
                    f"lower(p.sku) = lower({sku!r}) -> {len(product_ids)} product id(s)"
                    f"   # metrics.yaml: products.sku (SKU is not unique)"
                )
                # SKUs are NOT unique and colliding rows are unrelated products.
                if len(matches) > 1:
                    sku_resolution["products"] = matches
                    notices.append({
                        "kind": "ambiguous_sku",
                        "message": (
                            f"SKU {sku!r} matches {len(matches)} DIFFERENT products, not "
                            "one product with variants: "
                            + "; ".join(f"{m['name']} ({m['category']})" for m in matches)
                            + ". The rows below cover all of them."
                        ),
                        "source": "definitions/metrics.yaml: products.sku",
                    })

            # ---------------------------------------------------------------
            # COVERAGE, ALWAYS. A stockout count is unreadable without the
            # number of days actually observed behind it.
            # ---------------------------------------------------------------
            cur.execute(
                "SELECT COUNT(DISTINCT snapshot_date) AS observed FROM inventory_snapshots "
                "WHERE snapshot_date >= %(start)s AND snapshot_date <= %(end)s",
                {"start": start, "end": end},
            )
            observed_days = cur.fetchone()["observed"]
            calendar_days = (end - start).days + 1
            missing_days = calendar_days - observed_days
            coverage = {
                "window": {"start": start.isoformat(), "end": end.isoformat()},
                "calendar_days": calendar_days,
                "observed_days": observed_days,
                "missing_days": missing_days,
                "file_span": {"first": file_first.isoformat(), "last": file_last.isoformat()},
                "absent_day_means": _req(hist, "absent_day_means"),
                "runs_span_gaps": _req(hist, "run_spans_gaps"),
            }
            if missing_days > 0:
                notices.append({
                    "kind": _req(hist, "coverage_notice_kind"),
                    "message": (
                        f"{missing_days} of the {calendar_days} days in this window have no "
                        f"stock record at all, so {observed_days} days were actually read. "
                        "A day with no record is not a day with no stock, and a run of days "
                        "out of stock is never counted across a missing day."
                    ),
                    "source": "definitions/metrics.yaml: inventory.history",
                })

            # ---------------------------------------------------------------
            # The read.
            # ---------------------------------------------------------------
            if view == "coverage":
                cur.execute(
                    _SELECT_COVERAGE,
                    {"start": start, "end": end, "store_ids": store_ids},
                )
                rows = [dict(r) for r in cur.fetchall()]
                full_row_count = len(rows)
            elif view == "series":
                cur.execute(
                    _SELECT_SERIES.format(
                        out_of_stock=out_of_stock_sql,
                        product_predicate=product_predicate,
                        limit=limit,
                    ),
                    params,
                )
                rows = [dict(r) for r in cur.fetchall()]
                full_row_count = len(rows)
            else:
                sql = _SELECT_STOCKOUTS.format(
                    out_of_stock=out_of_stock_sql,
                    run_break=run_break_sql,
                    product_predicate=product_predicate,
                    left_out_predicate=(f"AND {left['predicate']}"
                                        if left["predicate"] else ""),
                    order_by=rank_modes[rank_by],
                    limit=limit,
                )
                cur.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]
                # The size of the WHOLE set travels on the rows, so "the six
                # longest of 24,838" is sayable without paying for the island
                # computation a second time.
                full_row_count = rows[0].pop("full_row_count") if rows else 0
                for r in rows[1:]:
                    r.pop("full_row_count", None)

            for r in rows:
                if "store_id" in r:
                    sid = r["store_id"]
                    r["store"] = (catalog[sid].get("display_name") or catalog[sid]["name"]) \
                        if sid in catalog else sid

            # ---------------------------------------------------------------
            # NEGATIVE ON HAND. Named whenever any is in scope, because a
            # negative is a fault rather than a level and the reader has to
            # know a "stockout" here may be a broken record.
            # ---------------------------------------------------------------
            neg = _req(hist, "negative_on_hand")
            if neg.get("notice_mandatory"):
                cur.execute(
                    "SELECT COUNT(*) AS n, MIN(quantity_on_hand) AS lowest "
                    "FROM inventory_snapshots s "
                    "WHERE s.snapshot_date >= %(start)s AND s.snapshot_date <= %(end)s "
                    "  AND s.store_id = ANY(%(store_ids)s) AND s.quantity_on_hand < 0"
                    + (" AND s.product_id = ANY(%(product_ids)s)" if product_ids else ""),
                    params,
                )
                nrow = cur.fetchone()
                if nrow["n"]:
                    notices.append({
                        "kind": _req(neg, "notice_kind"),
                        "message": (
                            f"{nrow['n']:,} stock records in this window are NEGATIVE, the "
                            f"lowest {nrow['lowest']:,}. A negative quantity is a broken "
                            "record rather than a stock level, so a product shown as out of "
                            "stock here may have a faulty record rather than an empty shelf."
                        ),
                        "guidance": (
                            "Negative rows count as out of stock and are excluded from "
                            "every quantity total; do not add them into one."
                        ),
                        "source": "definitions/metrics.yaml: inventory.history.negative_on_hand",
                    })

    notice: Optional[dict] = None
    if len(notices) == 1:
        notice = notices[0]
    elif notices:
        notice = {"kind": "multiple", "items": notices}

    meta: dict[str, Any] = {
        "source_table": _req(hist, "table"),
        "filters_applied": filters,
        "snapshot_timestamp": snapshot_timestamp,
        "view": view,
        "grain": {
            "stockouts": "one row per store and product",
            "series": "one row per observed day",
            "coverage": "one row per store",
        }[view],
        "window": coverage["window"],
        "coverage": coverage,
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "definitions": {
            "out_of_stock": out_of_stock_sql,
            "source": "definitions/metrics.yaml: inventory.history",
        },
    }
    if view == "stockouts":
        meta["ranked_by"] = rank_by
    if sku_resolution:
        meta["sku_resolution"] = sku_resolution
    if left["setting"] is not None:
        meta["settings"] = {_LEFT_OUT: left["setting"]}
    if notice:
        meta["notice"] = notice

    return {"rows": rows, "meta": meta}
