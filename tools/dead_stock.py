"""
George — dead stock tool.

One public function: get_dead_stock().

THE ANTI-JOIN THE TOOL SURFACE WAS MISSING. A 40-question coverage run found
George attempting this shape three times and unable to complete it:
  - "Which products are dead at Fairview?"          -> refused
  - "Are there products in stock everywhere but selling nowhere?" -> refused
  - "Which products have never sold anywhere?"      -> timed out at 32.2s,
    because the only route available was a full product GROUP BY over all
    history.

Every other tool answers "what IS". None answered "what is in A but not in B",
so George kept fetching both sides and trying to intersect them in its head —
which the 200-row cap then made impossible.

Architecture rules (see CLAUDE.md): one SELECT template, predicates read from
definitions/metrics.yaml, {rows, meta} contract, read-only role via
tools/_common.connect().
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
    resolve_store as _resolve_store_in,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)

# The window is scanned ONCE into a CTE and hash-anti-joined against inventory.
# A correlated NOT EXISTS per inventory row would re-scan 891,714 line items
# once for each of 31,617 inventory rows, which is what makes the naive form of
# this question time out.
_SELECT = """
WITH sold AS (
    SELECT DISTINCT t.store_id, ti.product_id
    FROM new_transaction_items ti
    INNER JOIN new_transactions t ON t.ref_id = ti.transaction_ref_id
    WHERE {sales_guard}
      AND t.transaction_time >= {win_start}
      AND t.transaction_time <  {win_end}
)
SELECT i.store_id,
       i.product_id,
       p.sku,
       p.name  AS product,
       {category} AS category,
       i.quantity_on_hand,
       p.unit_price
FROM inventory i
LEFT JOIN products p ON p.id = i.product_id
WHERE i.store_id = ANY(%(store_ids)s)
  AND {stock_predicate}
  AND NOT EXISTS (
        SELECT 1 FROM sold
        WHERE sold.store_id = i.store_id AND sold.product_id = i.product_id
  )
ORDER BY i.quantity_on_hand DESC, i.store_id, p.name
LIMIT {limit}
"""


def _scope(defs: dict) -> dict[str, dict]:
    """Active retail only. AJI BARN is excluded — see metrics.yaml dead_stock."""
    return _store_catalog_for(
        defs, [s["id"] for s in _req(defs, "stores.active_retail")]
    )


def get_dead_stock(
    store: Optional[str] = None,
    window: Any = "last_30_days",
    top_n: Optional[int] = None,
) -> dict:
    """
    Products a store is holding that recorded no sale in the window.

    Args:
        store:  store display name or id. None = all 7 active retail stores.
                AJI BARN is out of scope: its quantities are accumulated
                dispatch counters, not stock, so "held but not selling" is
                meaningless there.
        window: preset name from metrics.yaml (sales_day.presets), or an
                explicit (start, end) pair of Manila calendar dates. Half-open.
                A LONGER window means FEWER dead products — anything that sold
                even once inside it is excluded.
        top_n:  return only the N largest holdings. meta.full_row_count reports
                how many dead products there are in total.

    Returns:
        {"rows": [...], "meta": {...}}. Stock is live and sales are a window, so
        the two sides are read at different times — meta says so explicitly
        rather than implying a single consistent snapshot.
    """
    defs = _load_defs()
    top_n = _validate_top_n(defs, top_n)

    catalog = _scope(defs)
    store_ids = _resolve_store_in(store, catalog)

    # Window: reuse the sales tool's resolver so "last_30_days" means exactly
    # what it means everywhere else, rather than acquiring a second definition.
    from .sales import _resolve_window  # noqa: PLC0415 - avoids a cycle at import

    win_start, win_end, win_params, window_meta = _resolve_window(defs, window)

    guard = [
        _req(defs, "filters.cancelled.sql"),
        _req(defs, "filters.returns.sale_sql"),
        "t.store_id = ANY(%(store_ids)s)",
    ]

    sql = _SELECT.format(
        sales_guard="\n      AND ".join(guard),
        win_start=win_start,
        win_end=win_end,
        category=_req(defs, "products.category_normalization.sql"),
        stock_predicate=_req(defs, "dead_stock.stock_predicate"),
        limit=top_n or _MAX_ROWS,
    )
    params: dict[str, Any] = {"store_ids": store_ids, **win_params}

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            truncated = len(rows) == _MAX_ROWS
            if truncated or (top_n is not None and len(rows) == top_n):
                cur.execute(
                    "SELECT COUNT(*) AS n FROM ("
                    + sql.replace(f"LIMIT {top_n or _MAX_ROWS}", "")
                    + ") x",
                    params,
                )
                full_row_count = cur.fetchone()["n"]
            else:
                full_row_count = len(rows)

            # How many products the store holds at all, so "42 dead" can be read
            # against "of 1,204 held" rather than floating free.
            cur.execute(
                f"SELECT COUNT(*) AS n FROM inventory i "
                f"WHERE i.store_id = ANY(%(store_ids)s) "
                f"AND {_req(defs, 'dead_stock.stock_predicate')}",
                {"store_ids": store_ids},
            )
            held_total = cur.fetchone()["n"]

    for r in rows:
        r["store"] = _label_store(catalog, r["store_id"])
        if r.get("unit_price") is not None:
            r["unit_price"] = float(r["unit_price"])

    meta: dict[str, Any] = {
        "source_table": "inventory ⟕ products ⟂ new_transaction_items",
        "method": "anti-join: held with quantity > 0, no sale in the window",
        "filters_applied": [
            f"i.store_id IN ({len(store_ids)}: "
            f"{', '.join(_label_store(catalog, s) for s in store_ids)})"
            f"   # metrics.yaml: dead_stock.scope (AJI BARN excluded)",
            f"{_req(defs, 'dead_stock.stock_predicate')}"
            f"   # metrics.yaml: dead_stock.stock_predicate",
            f"{_req(defs, 'filters.cancelled.sql')}   # metrics.yaml: filters.cancelled",
            f"{_req(defs, 'filters.returns.sale_sql')}   # metrics.yaml: filters.returns",
            f"no sale within {window_meta.get('start')} .. {window_meta.get('end')} "
            f"(Asia/Manila, half-open)   # metrics.yaml: sales_day",
        ],
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "window": window_meta,
        "row_count": len(rows),
        "full_row_count": full_row_count,
        "full_row_count_note": " ".join(
            _req(defs, "ranking.full_row_count_note").split()
        ),
        "products_held_in_scope": held_total,
        "top_n": top_n,
        "truncated": truncated,
        "row_limit": top_n or _MAX_ROWS,
        "ordering": "quantity_on_hand DESC",
        # The two sides of this answer are not read as of the same moment, and
        # pretending otherwise would be the kind of quiet wrongness these tools
        # exist to avoid.
        "temporal_mismatch": {
            "stock_side": "live `inventory`, as of now",
            "sales_side": f"window {window_meta.get('start')} .. {window_meta.get('end')}",
            "note": (
                "Stock is current; sales are a window. A product restocked "
                "yesterday appears dead if it sold nothing in the window, which "
                "is usually the intended reading but is not the same as 'never "
                "sold'. Widen the window to test that."
            ),
        },
        "reconciliation": {
            "applicable": False,
            "reason": (
                "get_dead_stock aggregates no money measure; unit_price is a "
                "per-product attribute, not a sum."
            ),
        },
    }

    if rows and full_row_count and held_total:
        meta["notice"] = {
            "kind": "dead_stock_share",
            "message": (
                f"{full_row_count} of {held_total} products held in scope "
                f"({100.0 * full_row_count / held_total:.1f}%) recorded no sale "
                f"in this window. A longer window would shrink this list; a "
                f"shorter one would grow it."
            ),
            "source": "definitions/metrics.yaml: dead_stock",
        }

    return {"rows": rows, "meta": meta}
