"""
George — inventory tool.

One public function: get_stock().

Architecture rules this module is built to (see CLAUDE.md):
  - No freehand SQL against raw tables. There is exactly ONE SELECT template
    below. Its WHERE clause is assembled only from predicates read out of
    definitions/metrics.yaml plus bound parameters. Nothing is interpolated
    from caller input.
  - Every return is {rows, meta}, and meta always carries source_table,
    filters_applied and snapshot_timestamp.
  - No business definition is hardcoded here. State predicates, the store
    scope, and the low-stock blocked reason are all READ from metrics.yaml.
    Missing keys raise rather than falling back to a default, because a
    silent fallback is how a definition gets reinvented in a tool.
  - Read-only Postgres role, enforced three ways (see _connect).
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
)


def _store_catalog(defs: dict) -> dict[str, dict]:
    """id -> entry for every store in the inventory scope (7 retail + AJI BARN)."""
    return _store_catalog_for(defs, _req(defs, "inventory.scope_store_ids"))


def _resolve_store(defs: dict, store: Optional[str]) -> list[str]:
    return _resolve_store_in(store, _store_catalog(defs))


def _states(defs: dict) -> list[dict]:
    """State definitions in their declared evaluation order."""
    return sorted(_req(defs, "inventory.states"), key=lambda s: s["order"])


def _state_case_sql(defs: dict) -> str:
    """
    Build the state label expression from the yaml, in `order`.

    Evaluating in order with first-match-wins is what keeps out_of_stock
    reachable. metrics.yaml records the bug this avoids: business_rules.yaml
    put the LOW STOCK branch first, so a row with quantity_on_hand = 0 and a
    non-null warning_stock was labelled LOW STOCK and never reached the
    OUT OF STOCK branch.
    """
    branches = " ".join(
        f"WHEN {s['sql']} THEN '{s['name']}'" for s in _states(defs)
    )
    return f"CASE {branches} ELSE 'unclassified' END"


# --------------------------------------------------------------------------
# The one query template
# --------------------------------------------------------------------------

# `i` is the stock source: either the live `inventory` table or a projection of
# `inventory_snapshots` that supplies the warning_stock column that table lacks
# (its columns are exactly product_id, store_id, snapshot_date,
# quantity_on_hand, created_at). Projecting NULL::int there lets the yaml's
# state predicates apply unchanged to both paths, so history and current state
# are classified by one definition rather than two.
_CURRENT_SOURCE = "inventory"
_HISTORY_SOURCE = """(
        SELECT product_id, store_id, quantity_on_hand, NULL::int AS warning_stock
        FROM inventory_snapshots
        WHERE snapshot_date = %(as_of)s
    )"""

_SELECT = """
SELECT i.store_id,
       i.product_id,
       p.sku,
       p.name AS product,
       i.quantity_on_hand,
       i.warning_stock,
       {state_case} AS state,
       (i.warning_stock IS NULL) AS missing_threshold
FROM {source} i
LEFT JOIN products p ON p.id = i.product_id
WHERE {predicates}
ORDER BY i.quantity_on_hand ASC, i.store_id, p.name
LIMIT {limit}
"""


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def get_stock(
    store: Optional[str] = None,
    sku: Optional[str] = None,
    state: Optional[str] = None,
    as_of: Optional[date | str] = None,
) -> dict:
    """
    Stock levels by store, product and state.

    Args:
        store: Store display name (case-insensitive) or store id. None = the
               full inventory scope from metrics.yaml (7 retail + AJI BARN).
        sku:   Exact products.sku, case-insensitive. No substring matching — a
               partial SKU match is a silently wrong answer.
        state: One of the state names in metrics.yaml (out_of_stock, low_stock,
               in_stock). None = all states, each row labelled.
        as_of: None = live `inventory`. A date = `inventory_snapshots` for that
               Manila calendar date.

    Returns:
        {"rows": [...], "meta": {...}} — meta always carries source_table,
        filters_applied and snapshot_timestamp. A non-empty meta["notice"] MUST
        be surfaced to the user; it means the result is not what it appears.
    """
    defs = _load_defs()
    catalog = _store_catalog(defs)
    store_ids = _resolve_store(defs, store)

    valid_states = [s["name"] for s in _states(defs)]
    if state is not None and state not in valid_states:
        raise ValueError(
            f"Unknown state {state!r}. Valid states: {', '.join(valid_states)}."
        )

    if isinstance(as_of, str):
        as_of = date.fromisoformat(as_of)

    source_table = "inventory_snapshots" if as_of else "inventory"
    filters: list[str] = []
    notice: Optional[dict] = None

    store_labels = [catalog[s].get("display_name") or catalog[s]["name"] for s in store_ids]
    filters.append(
        f"i.store_id IN ({len(store_ids)}: {', '.join(store_labels)})"
        f"   # metrics.yaml: inventory.scope_store_ids"
    )

    # ----------------------------------------------------------------------
    # low_stock is defined but not operational. Say so; never return a bare
    # empty list, which reads as "nothing is low on stock" — the opposite of
    # the truth, and the more expensive misreading.
    # ----------------------------------------------------------------------
    if state == "low_stock" and not _req(defs, "inventory.low_stock_operational"):
        reason = _req(defs, "inventory.low_stock_blocked_reason")
        notice = {
            "kind": "low_stock_not_operational",
            "state": "low_stock",
            "operational": False,
            "reason": reason,
            "message": (
                "Low-stock thresholds are not set, so no product can qualify as "
                f"low stock ({reason}). This is NOT an empty result meaning "
                "nothing is low — the thresholds have never been configured. "
                "Populate inventory.warning_stock, or agree a floor with the "
                "business and set it in definitions/metrics.yaml "
                "(inventory.low_stock_threshold_default)."
            ),
            "source": "definitions/metrics.yaml: inventory.low_stock_blocked_reason",
        }

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            # The read instant, taken from the server inside this transaction.
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # Resolve sku -> product ids first, so "SKU does not exist" and
            # "SKU exists but has no stock rows" are distinguishable in meta.
            product_ids: Optional[list[str]] = None
            sku_resolved: Optional[bool] = None
            sku_resolution: Optional[dict] = None
            if sku is not None:
                cur.execute(
                    "SELECT p.id, p.sku, p.name, p.unit_price, "
                    f"       {_req(defs, 'products.category_normalization.sql')} AS category "
                    "FROM products p WHERE lower(p.sku) = lower(%s) ORDER BY p.id",
                    (sku,),
                )
                matches = [dict(m) for m in cur.fetchall()]
                product_ids = [m["id"] for m in matches]
                sku_resolved = bool(matches)
                sku_resolution = {
                    "sku": sku,
                    "product_count": len(matches),
                    "product_ids": product_ids,
                }
                filters.append(
                    f"lower(p.sku) = lower({sku!r}) -> {len(product_ids)} product id(s)"
                    f"   # metrics.yaml: products.sku (SKU is not unique)"
                )
                # SKUs are NOT unique: 68 collide case-insensitively and the
                # colliding rows are UNRELATED products (metrics.yaml
                # products.sku). Stock rows are already one per (store,
                # product), so nothing is summed here — but without this notice
                # a caller reads three products' rows as one item across stores.
                if len(matches) > 1:
                    sku_resolution["products"] = matches
                    notice = {
                        "kind": "ambiguous_sku",
                        "message": (
                            f"SKU {sku!r} matches {len(matches)} DIFFERENT products, "
                            f"not one product with variants: "
                            + "; ".join(
                                f"{m['name']} ({m['category']}, PHP {m['unit_price']})"
                                for m in matches
                            )
                            + ". The rows below are per product per store and must "
                            "not be added together as one item — each row's "
                            "product_id says which product it belongs to."
                        ),
                        "source": "definitions/metrics.yaml: products.sku",
                    }

            # Snapshot coverage: report a gap explicitly rather than as no rows.
            coverage: Optional[dict] = None
            if as_of:
                filters.append(
                    f"snapshot_date = {as_of.isoformat()}"
                    f"   # metrics.yaml: inventory.history_table"
                )
                cur.execute(
                    "SELECT EXISTS (SELECT 1 FROM inventory_snapshots WHERE snapshot_date = %s)",
                    (as_of,),
                )
                if not cur.fetchone()["exists"]:
                    cur.execute(
                        "SELECT MIN(snapshot_date) AS lo, MAX(snapshot_date) AS hi "
                        "FROM inventory_snapshots"
                    )
                    bounds = cur.fetchone()
                    coverage = {
                        "requested": as_of.isoformat(),
                        "available_from": bounds["lo"].isoformat() if bounds["lo"] else None,
                        "available_to": bounds["hi"].isoformat() if bounds["hi"] else None,
                        "covered": False,
                    }
                    notice = notice or {
                        "kind": "snapshot_coverage_gap",
                        "message": (
                            f"No inventory snapshot exists for {as_of.isoformat()}. "
                            f"Snapshots cover "
                            f"{coverage['available_from']} to {coverage['available_to']}. "
                            f"This is a coverage gap, not an empty stock position."
                        ),
                        "source": "inventory_snapshots coverage check",
                    }
                else:
                    coverage = {"requested": as_of.isoformat(), "covered": True}

            # ----------------------------------------------------------------
            # Assemble predicates. Every fragment is either read from the yaml
            # or a bound parameter — none is built from caller input.
            # ----------------------------------------------------------------
            predicates = ["i.store_id = ANY(%(store_ids)s)"]
            params: dict[str, Any] = {"store_ids": store_ids, "as_of": as_of}

            if product_ids is not None:
                predicates.append("i.product_id = ANY(%(product_ids)s)")
                params["product_ids"] = product_ids

            if state is not None:
                state_sql = next(s["sql"] for s in _states(defs) if s["name"] == state)
                predicates.append(f"({state_sql})")
                filters.append(f"{state_sql}   # metrics.yaml: inventory.states.{state}")
            else:
                filters.append(
                    "state labelled, not filtered   # metrics.yaml: inventory.states"
                )

            # A snapshot date the coverage check already proved empty needs no
            # main query. Skipping is not just an optimisation: the indexes on
            # inventory_snapshots are (store_id, product_id, snapshot_date) and
            # (product_id, store_id, snapshot_date), both leading with a column
            # this predicate does not constrain, so a snapshot_date-only scan
            # reads all 4.88M rows and hits statement_timeout.
            if coverage is not None and not coverage["covered"]:
                rows = []
            else:
                sql = _SELECT.format(
                    state_case=_state_case_sql(defs),
                    source=_HISTORY_SOURCE if as_of else _CURRENT_SOURCE,
                    predicates="\n  AND ".join(predicates),
                    limit=_MAX_ROWS,
                )
                cur.execute(sql, params)
                rows = [dict(r) for r in cur.fetchall()]

            # Only pay for the count when the cap was actually hit.
            truncated = len(rows) == _MAX_ROWS
            total_matching: Optional[int] = None
            if truncated:
                cur.execute(
                    f"SELECT COUNT(*) AS n FROM {_HISTORY_SOURCE if as_of else _CURRENT_SOURCE} i "
                    f"WHERE {' AND '.join(predicates)}",
                    params,
                )
                total_matching = cur.fetchone()["n"]

            # How stale the data itself is, as distinct from when we read it.
            data_as_of: Any = None
            if as_of:
                data_as_of = as_of.isoformat()
            else:
                cur.execute(
                    "SELECT MAX(updated_at) AS m FROM inventory WHERE store_id = ANY(%s)",
                    (store_ids,),
                )
                m = cur.fetchone()["m"]
                data_as_of = m.isoformat() if m else None

    for r in rows:
        r["store"] = _label_store(catalog, r["store_id"])

    meta: dict[str, Any] = {
        "source_table": source_table,
        "filters_applied": filters,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "data_as_of": data_as_of,
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "row_count": len(rows),
        "truncated": truncated,
        "row_limit": _MAX_ROWS,
        # The net_sales / product_revenue discount tie governs money measures
        # only. get_stock returns no money column, so asserting it here would be
        # theatre. Recorded explicitly so a reader can see it was considered
        # rather than forgotten — this block goes live in the sales tools.
        "reconciliation": {
            "applicable": False,
            "reason": (
                "get_stock returns no money column. The discount tie "
                "(metrics.yaml: metrics.product_revenue.ties_only_while) governs "
                "net_sales vs product_revenue only."
            ),
        },
    }
    if total_matching is not None:
        meta["total_matching"] = total_matching
    if sku_resolution is not None:
        meta["sku_resolution"] = sku_resolution
    if sku_resolved is not None:
        meta["sku_resolved"] = sku_resolved
        if not sku_resolved:
            meta["notice"] = notice or {
                "kind": "sku_not_found",
                "message": (
                    f"No product exists with SKU {sku!r}. This is an unknown SKU, "
                    f"not a product that is out of stock."
                ),
                "source": "products.sku lookup",
            }
    if coverage is not None:
        meta["snapshot_coverage"] = coverage
    if notice is not None:
        meta["notice"] = notice

    return {"rows": rows, "meta": meta}
