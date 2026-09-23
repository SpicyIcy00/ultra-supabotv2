"""
Bob — stock cover: what runs out, and where to get it.

One public function: get_stock_cover().

WHY THIS EXISTS (W1.5, 2026-09-22). Two things the owner asked for that Bob
could not do. "A warning per shop BEFORE a shelf empties — sales speed against
what is left": Bob could say a shelf had emptied (brief.stock_crossed_out) and
never that one was emptying. And "Handle the AJI BARN reorder": the capability
test's turn was refused — the warehouse is outside the replenishment read — and
then spent the twelve-call cap looking for another way in.

WHAT IT DOES.
  cover  one row per shop and product: how fast it sells, what is left, how
         many days that lasts, the window it is read against, the level a
         person set, and one state. `running_out` is the one that fires: a
         count above zero, a level set, and less cover than the window.
  draft  the lines that want stock, and where it could come from — AJI BARN
         first, then a shop that holds more than it needs, then an order for
         what no move covers. Each line carries its reason, written here from
         the figures on it. It is a DRAFT: nothing is written or sent, and the
         owner keys a move into StoreHub himself (its API has no transfer
         route).

Architecture rules (CLAUDE.md):
  - No freehand SQL. Fixed templates; every predicate is read from
    metrics.yaml `stock_cover` or bound as a parameter.
  - Every return is {rows, meta}; meta carries source_table, filters_applied
    and snapshot_timestamp.
  - Every definition — the window, the speed, the states, what a shop keeps,
    what the warehouse count means — is READ from metrics.yaml `stock_cover`.
  - Every figure is computed here, never by the model (rule 9). The draft's
    quantities come from `plan_moves`, which is pure and tested.
  - Read-only role, enforced by _connect().
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable, Optional

from ._common import (
    DICT_ROW,
    connect as _connect,
    estate as _estate,
    label_store as _label_store,
    load_defs as _load_defs,
    req as _req,
    resolve_store as _resolve_store_in,
    store_catalog as _store_catalog_for,
    validate_top_n as _validate_top_n,
)


# --------------------------------------------------------------------------
# Definitions
# --------------------------------------------------------------------------

def _sc(defs: dict) -> dict:
    return _req(defs, "stock_cover")


def _ids(defs: dict, group_key: str) -> list[str]:
    return [s["id"] for s in _req(defs, _req(_sc(defs), group_key))]


def shop_ids(defs: dict) -> list[str]:
    """The shops a line belongs to (stock_cover.shops -> a stores group)."""
    return _ids(defs, "shops")


def warehouse_ids(defs: dict) -> list[str]:
    """Where stock ships from (stock_cover.warehouse -> a stores group)."""
    return _ids(defs, "warehouse")


def lookback_days(defs: dict) -> int:
    return int(_req(defs, _req(_sc(defs), "demand.lookback_days_ref")))


def default_window_days(defs: dict) -> int:
    return int(_req(defs, _req(_sc(defs), "window.days_ref")))


def validate_window(defs: dict, window_days: Optional[int]) -> int:
    """The window a person bound, inside its declared bounds, or the default."""
    w = _req(_sc(defs), "window")
    if window_days is None:
        return default_window_days(defs)
    if not isinstance(window_days, int) or isinstance(window_days, bool):
        raise ValueError(f"window_days must be a whole number of days, got {window_days!r}.")
    lo, hi = int(_req(w, "min")), int(_req(w, "max"))
    if not lo <= window_days <= hi:
        raise ValueError(
            f"window_days must be between {lo} and {hi} (got {window_days}) — "
            f"metrics.yaml: stock_cover.window."
        )
    return window_days


def state_names(defs: dict) -> list[str]:
    return [s["name"] for s in _req(_sc(defs), "states")]


def _state_case_sql(defs: dict) -> str:
    """First match wins, in the declared order, so exactly one state applies."""
    parts = [f"WHEN {s['sql']} THEN '{s['name']}'" for s in _req(_sc(defs), "states")]
    return "CASE " + " ".join(parts) + " END"


def _rank_case_sql(defs: dict) -> str:
    order = _req(_sc(defs), "rank_order")
    known = set(state_names(defs))
    unknown = [s for s in order if s not in known]
    if unknown or set(order) != known:
        raise KeyError(
            f"metrics.yaml stock_cover.rank_order must name every state exactly once "
            f"(unknown: {unknown}, missing: {sorted(known - set(order))})."
        )
    parts = [f"WHEN '{name}' THEN {i}" for i, name in enumerate(order, 1)]
    return "CASE c.state " + " ".join(parts) + " END"


def _says(defs: dict) -> dict[str, str]:
    return {s["name"]: str(s["says"]) for s in _req(_sc(defs), "states")}


# --------------------------------------------------------------------------
# The query — one template, predicates from the definitions only
# --------------------------------------------------------------------------

_STOCK_DAY = """
SELECT MAX(s.snapshot_date) AS stock_day
FROM inventory_snapshots s
WHERE s.snapshot_date <= %(upto)s
  AND s.store_id = ANY(%(shop_ids)s)
"""

# One row per shop and product the shop counts, sells or has a level for.
# `recent` is MATERIALIZED for the reason purchase_plan's is: the window's
# transactions hashed once, then the line items joined to them, rather than
# the planner walking every line a product ever sold.
_LINES = """
WITH recent AS MATERIALIZED (
    SELECT t.ref_id, t.store_id
    FROM new_transactions t
    WHERE {guard}
      AND t.store_id = ANY(%(shop_ids)s)
      AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date >= %(since)s
      AND (t.transaction_time AT TIME ZONE 'Asia/Manila')::date <  %(before)s
),
demand AS (
    SELECT r.store_id, ti.product_id, SUM(ti.quantity) AS units_sold
    FROM new_transaction_items ti
    JOIN recent r ON r.ref_id = ti.transaction_ref_id
    WHERE ti.product_id IS NOT NULL {demand_products}
    GROUP BY 1, 2
),
stock AS (
    SELECT s.store_id, s.product_id, s.quantity_on_hand AS on_hand
    FROM inventory_snapshots s
    WHERE s.snapshot_date = %(stock_day)s
      AND s.store_id = ANY(%(shop_ids)s) {stock_products}
),
warehouse AS (
    SELECT s.product_id, SUM(s.quantity_on_hand) AS warehouse_on_hand
    FROM inventory_snapshots s
    WHERE s.snapshot_date = %(stock_day)s
      AND s.store_id = ANY(%(warehouse_ids)s)
    GROUP BY 1
),
lv AS (
    SELECT l.store_id, l.product_id,
           NULLIF(l.warning_level, 'NaN') AS warning_level,
           NULLIF(l.ideal_level, 'NaN')   AS ideal_level
    FROM product_stock_levels l
    WHERE l.store_id = ANY(%(shop_ids)s) {level_products}
),
keys AS (
    SELECT store_id, product_id FROM stock
    UNION SELECT store_id, product_id FROM demand
    UNION SELECT store_id, product_id FROM lv
),
joined AS (
    SELECT k.store_id, k.product_id, s.on_hand,
           COALESCE(d.units_sold, 0) AS units_sold,
           ROUND(COALESCE(d.units_sold, 0) / %(lookback)s::numeric, 3) AS units_per_day,
           lv.warning_level, lv.ideal_level, w.warehouse_on_hand
    FROM keys k
    LEFT JOIN stock  s  ON s.store_id = k.store_id AND s.product_id = k.product_id
    LEFT JOIN demand d  ON d.store_id = k.store_id AND d.product_id = k.product_id
    LEFT JOIN lv        ON lv.store_id = k.store_id AND lv.product_id = k.product_id
    LEFT JOIN warehouse w ON w.product_id = k.product_id
),
c AS (
    SELECT j.*,
           CASE WHEN j.on_hand > 0 AND j.units_per_day > 0
                THEN ROUND(j.on_hand / j.units_per_day, 1) END AS cover_days
    FROM joined j
),
lines AS (
    SELECT c.*, {state_case} AS state FROM c
),
counted AS (
    SELECT (SELECT json_object_agg(x.state, x.n)
              FROM (SELECT state, COUNT(*) AS n FROM lines GROUP BY 1) x) AS state_counts,
           (SELECT COUNT(*) FROM lines
             WHERE state = 'no_level' AND on_hand > 0
               AND cover_days < %(window_days)s)                        AS would_fire_without_a_level,
           (SELECT COUNT(*) FROM lines
             WHERE warning_level IS NOT NULL OR ideal_level IS NOT NULL) AS lines_with_a_level
),
picked AS (
    SELECT c.store_id, c.product_id, p.sku, p.name AS product,
           c.on_hand, c.units_sold, c.units_per_day, c.cover_days,
           c.warning_level, c.ideal_level, c.warehouse_on_hand, c.state,
           COUNT(*) OVER ()                                          AS full_row_count,
           ROW_NUMBER() OVER (ORDER BY {rank_case}, {tie_break})     AS rn
    FROM lines c
    LEFT JOIN products p ON p.id = c.product_id
    WHERE c.state = ANY(%(states)s) {level_predicate}
    ORDER BY {rank_case}, {tie_break}
    LIMIT {limit}
)
-- The counts ride on every row, and on one row of nulls when nothing was
-- picked, so an empty list still says how many lines stood in each state.
SELECT counted.*, picked.*
FROM counted
LEFT JOIN picked ON true
ORDER BY picked.rn
"""

# The suppliers on file for the products an order names, in the order the
# products export listed them (storehub.products: the first is usually the
# one they buy from).
_SUPPLIERS = """
SELECT ps.product_id, ps.supplier_name
FROM product_suppliers ps
WHERE ps.product_id = ANY(%(product_ids)s)
ORDER BY ps.product_id, ps.position
"""


def _guard(defs: dict) -> str:
    return (f"{_req(defs, 'filters.cancelled.sql')}\n"
            f"      AND {_req(defs, 'filters.returns.sale_sql')}")


def _num(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, Decimal):
        if v.is_nan():
            return None
        return float(v)
    f = float(v)
    return None if math.isnan(f) else f


def _clean(v: Any) -> Any:
    """Decimals to plain numbers; whole numbers as ints so a count reads as one."""
    f = _num(v) if isinstance(v, (Decimal, float)) else v
    if isinstance(f, float) and f.is_integer():
        return int(f)
    return f


def stock_day_for(cur, defs: dict, day: date) -> Optional[date]:
    """The newest stock count on or before the day before `day`."""
    cur.execute(_STOCK_DAY, {"upto": day - timedelta(days=1), "shop_ids": shop_ids(defs)})
    got = (cur.fetchone() or {}).get("stock_day")
    return got.date() if hasattr(got, "date") and not isinstance(got, date) else got


def cover_lines(cur, defs: dict, *, day: date, stock_day: date, shops: list[str],
                window_days: int, states: list[str], require_level: bool,
                product_ids: Optional[list[str]] = None, limit: int) -> dict:
    """
    The lines, ranked and counted, on an open cursor.

    WHAT IT COSTS, AND WHY IT IS NOT SMALLER (D3, measured 2026-09-23). The
    owner's `get_stock_cover(store="Greenhills", top_n=10)` took 12.3 s and was
    the slowest read of his day. The statement is not what took it: EXPLAIN
    ANALYZE puts this query at ~1.0 s server-side, the same call shapes measure
    0.60–1.89 s from here, and the LIVE record has the same call at 402 ms eight
    minutes later (2026-09-23 06:44:42). What was different is that it went out
    in a batch of five reads against the one shared instance.

    Nor can the work be pruned. `meta.states` counts every line in every state
    and `would_fire_without_a_level` counts the fast lines nobody set a level
    for — the estate has 39 lines with a level and ~24,700 without — so a
    demand figure is needed for every line even when ten rows come back. The
    90-day window's line items are read once, into a MATERIALIZED CTE, which is
    already the cheap shape for it.

    Shared by get_stock_cover and the brief's stock_running_out section, so the
    morning line and the read are the same statement with the same definitions.
    Returns {"rows", "state_counts", "full_row_count",
    "would_fire_without_a_level", "lines_with_a_level", "since", "before"}.
    """
    lb = lookback_days(defs)
    since, before = day - timedelta(days=lb), day
    params: dict[str, Any] = {
        "shop_ids": shops,
        "warehouse_ids": warehouse_ids(defs),
        "since": since,
        "before": before,
        "stock_day": stock_day,
        "lookback": lb,
        "window_days": window_days,
        "states": states,
    }
    prod = ""
    if product_ids is not None:
        params["product_ids"] = product_ids
        prod = "AND {a}.product_id = ANY(%(product_ids)s)"
    sql = _LINES.format(
        guard=_guard(defs),
        demand_products=prod.format(a="ti") if prod else "",
        stock_products=prod.format(a="s") if prod else "",
        level_products=prod.format(a="l") if prod else "",
        state_case=_state_case_sql(defs),
        level_predicate=("AND (c.warning_level IS NOT NULL OR c.ideal_level IS NOT NULL)"
                         if require_level else ""),
        rank_case=_rank_case_sql(defs),
        tie_break=_req(_sc(defs), "rank_tie_break_sql"),
        limit=int(limit),
    )
    cur.execute(sql, params)
    raw = [dict(r) for r in cur.fetchall()]
    head = dict(raw[0]) if raw else {}
    rows = []
    for r in raw:
        if r.get("store_id") is None:
            continue                      # the counts-only row: nothing was picked
        for k in ("state_counts", "would_fire_without_a_level", "lines_with_a_level",
                  "full_row_count", "rn"):
            r.pop(k, None)
        rows.append({k: _clean(v) for k, v in r.items()})
    counts = head.get("state_counts") or {}
    out = {
        "rows": rows,
        "state_counts": {s: int(counts.get(s, 0)) for s in state_names(defs)},
        "full_row_count": int(head.get("full_row_count") or 0),
        "would_fire_without_a_level": int(head.get("would_fire_without_a_level") or 0),
        "lines_with_a_level": int(head.get("lines_with_a_level") or 0),
        "since": since,
        "before": before,
    }
    return out


# --------------------------------------------------------------------------
# What a line wants, and where it could come from — pure, so it is tested
# --------------------------------------------------------------------------

def need_of(line: dict) -> Optional[int]:
    """Up to the ideal level (stock_cover.draft.target). None with no ideal level."""
    ideal = _num(line.get("ideal_level"))
    if ideal is None:
        return None
    have = max(_num(line.get("on_hand")) or 0.0, 0.0)
    return max(0, math.ceil(ideal - have))


def keeps_of(line: dict, window_days: int) -> int:
    """What a shop keeps before it gives: max(its ideal level, its speed over the window)."""
    ideal = _num(line.get("ideal_level")) or 0.0
    speed = (_num(line.get("units_per_day")) or 0.0) * window_days
    return int(math.ceil(max(ideal, speed)))


def _fmt(v: Any) -> str:
    f = _num(v) if not isinstance(v, (int, str)) else v
    if isinstance(f, float):
        return f"{f:,.0f}" if f.is_integer() else f"{f:,.1f}"
    return f"{f:,}" if isinstance(f, int) else str(f)


def _why_wanting(line: dict, window_days: int, shop: str) -> str:
    if line.get("state") == "out_of_stock":
        return (f"{shop} has none left, sells {_fmt(line.get('units_per_day'))} a day, "
                f"and its ideal level is {_fmt(line.get('ideal_level'))}")
    return (f"{shop} has {_fmt(line.get('on_hand'))} left — {_fmt(line.get('cover_days'))} days "
            f"at {_fmt(line.get('units_per_day'))} a day, under the {window_days}-day window; "
            f"its ideal level is {_fmt(line.get('ideal_level'))}")


def plan_moves(wanting: list[dict], donors: list[dict], warehouse_on_hand: dict[str, Any],
               *, window_days: int, label: dict[str, str], warehouse_name: str,
               wanting_states: Iterable[str], max_lines: int) -> dict:
    """
    The draft, from rows already read. No database, no clock.

    `wanting` are lines with a level set in a wanting state; `donors` every
    shop line for the same products; `warehouse_on_hand` the warehouse count
    per product. Allocation is in the declared order (emptiest first, then
    least cover), the warehouse before the shops, the largest surplus first,
    so scarce stock goes to the shelf that needs it most and the same stock is
    never offered twice.

    Returns {"lines", "unsized", "orders_by_product"}.
    """
    order_rank = {s: i for i, s in enumerate(wanting_states)}
    want = sorted(
        (w for w in wanting if w.get("state") in order_rank),
        key=lambda w: (order_rank[w["state"]],
                       _num(w.get("cover_days")) if w.get("cover_days") is not None else -1.0,
                       label.get(w["store_id"], w["store_id"]), str(w.get("product") or "")),
    )
    wanting_keys = {(w["store_id"], w["product_id"]) for w in want}

    barn_left: dict[str, int] = {
        pid: max(int(math.floor(_num(q) or 0.0)), 0) for pid, q in warehouse_on_hand.items()
    }
    surplus: dict[tuple[str, str], int] = {}
    donor_line: dict[tuple[str, str], dict] = {}
    for d in donors:
        key = (d["store_id"], d["product_id"])
        if key in wanting_keys:
            continue                      # a line that wants stock never gives
        have = _num(d.get("on_hand"))
        if have is None or have <= 0:
            continue                      # nothing, or a broken count, gives nothing
        spare = int(math.floor(have)) - keeps_of(d, window_days)
        if spare > 0:
            surplus[key] = spare
            donor_line[key] = d

    lines: list[dict] = []
    unsized: list[dict] = []
    remaining: dict[str, dict] = {}
    for w in want:
        shop = label.get(w["store_id"], w["store_id"])
        need = need_of(w)
        base = {
            "product_id": w["product_id"], "sku": w.get("sku"), "product": w.get("product"),
            "to": shop, "to_state": w.get("state"), "to_on_hand": w.get("on_hand"),
            "to_units_per_day": w.get("units_per_day"), "to_cover_days": w.get("cover_days"),
            "to_ideal_level": w.get("ideal_level"), "window_days": window_days,
        }
        if need is None:
            unsized.append({**base, "reason": f"{_why_wanting(w, window_days, shop).split('; its ideal')[0]}"
                                              f" — no ideal level is set, so there is no quantity to aim for"})
            continue
        if need <= 0:
            continue
        why = _why_wanting(w, window_days, shop)
        pid = w["product_id"]

        take = min(need, barn_left.get(pid, 0))
        if take > 0:
            before = barn_left[pid]
            barn_left[pid] -= take
            need -= take
            lines.append({**base, "kind": "move", "from": warehouse_name, "quantity": take,
                          "from_on_hand": before, "from_count_verified": False,
                          "reason": (f"{why}. {warehouse_name}'s count reads {_fmt(before)} — "
                                     f"check the shelf before keying it")})

        for key in sorted((k for k in surplus if k[1] == pid and surplus[k] > 0),
                          key=lambda k: (-surplus[k], label.get(k[0], k[0]))):
            if need <= 0:
                break
            give = min(need, surplus[key])
            d = donor_line[key]
            src = label.get(key[0], key[0])
            surplus[key] -= give
            need -= give
            lines.append({**base, "kind": "move", "from": src, "quantity": give,
                          "from_on_hand": d.get("on_hand"),
                          "from_cover_days": d.get("cover_days"),
                          "from_keeps": keeps_of(d, window_days),
                          "reason": (f"{why}. {src} holds {_fmt(d.get('on_hand'))} and keeps "
                                     f"{keeps_of(d, window_days)} after this")})

        if need > 0:
            r = remaining.setdefault(pid, {
                "product_id": pid, "sku": w.get("sku"), "product": w.get("product"),
                "quantity": 0, "for_shops": []})
            r["quantity"] += need
            r["for_shops"].append({"shop": shop, "quantity": need, "why": why})

    return {"lines": lines[:max_lines], "unsized": unsized,
            "orders_by_product": remaining, "lines_cut": max(0, len(lines) - max_lines)}


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------

def _resolve_scope(defs: dict, store: Optional[Any]) -> tuple[list[str], Optional[str]]:
    """
    Shops to read as destinations, and a note when the warehouse was named.

    The warehouse sells nothing and holds no line of its own here; naming it
    means the shops it supplies — every one of them — which is what "the AJI
    BARN reorder" is about. Never a refusal.
    """
    shops = shop_ids(defs)
    catalog = _store_catalog_for(defs, shops)
    wh = warehouse_ids(defs)
    names = store if isinstance(store, (list, tuple, set)) else ([store] if store else [])
    wanted_wh = False
    rest = []
    for n in names:
        s = str(n).strip().lower()
        if any(s in (sid.lower(), str(e.get("display_name", "")).lower(), str(e.get("name", "")).lower())
               for sid, (e, _g) in _estate(defs).items() if sid in wh):
            wanted_wh = True
        else:
            rest.append(n)
    if wanted_wh and not rest:
        wh_name = ", ".join(_label_store(_store_catalog_for(defs, wh), i) for i in wh)
        return shops, f"{wh_name}: every shop it supplies"
    ids = _resolve_store_in(rest or None, catalog, defs)
    return ids, None


def get_stock_cover(
    store: Optional[str] = None,
    sku: Optional[str] = None,
    view: str = "cover",
    state: Optional[str] = None,
    window_days: Optional[int] = None,
    as_of: Optional[date | str] = None,
    top_n: Optional[int] = None,
) -> dict:
    """
    What is running out at each shop, and where to get it: sales speed against what is left.

    view='cover' (default): one row per shop and product — units_per_day over the last closed days, on_hand from the newest stock count, cover_days (how long it lasts at that speed), the window it is read against, the warning and ideal level a person set in StoreHub, and one `state`. `running_out` is the warning: above zero, a level set, and less cover than the window — say BOTH numbers (cover_days and window_days). A count below zero is `broken_record` (what is left is unknown), a line with no level is `no_level` and does not fire; meta.states counts every state and meta.would_fire_without_a_level counts the fast lines nobody set a level for.
    view='draft': answers "handle the reorder", "restock", "what should I move" — including "the AJI BARN reorder" (name AJI BARN as the store; it means every shop it supplies). Returns the moves, ranked emptiest first, from AJI BARN to a shop and between shops, THEN what is left to order and from which suppliers — each line with its quantity and reason, all computed here. It is a draft the owner keys into StoreHub (no transfer can be sent from here); present it as that, one call, no further reads needed.

    Args:
        store: A shop name; None = every shop. AJI BARN means every shop it
               supplies.
        sku:   Exact products.sku, case-insensitive; narrows to that product.
        view:  'cover' (default) or 'draft'.
        state: cover view only — one state to list instead of the default
               (running_out, out_of_stock and broken_record lines with a level).
               'no_level' lists the lines nobody set a level for, least cover
               first.
        window_days: the days a shop must last; None = the replenishment
               review period in metrics.yaml. Named on every result.
        as_of: the Manila day to read as of (a past morning); None = today.
               Stock is the newest count before it, speed the closed days
               before it.
        top_n: return only N rows, ranked in SQL; meta.full_row_count is the
               size of the whole set.

    Returns:
        {"rows": [...], "meta": {...}} with source_table, filters_applied,
        snapshot_timestamp, the stock day, the window and the counts. A
        non-empty meta["notice"] must be surfaced.
    """
    defs = _load_defs()
    sc = _sc(defs)
    views = _req(sc, "views")
    if view not in views:
        raise ValueError(f"Unknown view {view!r}. Valid: {', '.join(views)} "
                         f"(metrics.yaml: stock_cover.views).")
    states_all = state_names(defs)
    if state is not None and state not in states_all:
        raise ValueError(f"Unknown state {state!r}. Valid: {', '.join(states_all)} "
                         f"(metrics.yaml: stock_cover.states).")
    if state is not None and view == "draft":
        raise ValueError("state applies to the cover view; the draft reads the lines that "
                         "want stock (metrics.yaml: stock_cover.draft.wanting_states).")
    window = validate_window(defs, window_days)
    top_n = _validate_top_n(defs, top_n)
    if isinstance(as_of, str):
        as_of = date.fromisoformat(as_of)

    shops, scope_note = _resolve_scope(defs, store)
    all_shops = shop_ids(defs)
    label_catalog = _store_catalog_for(defs, all_shops + warehouse_ids(defs))
    label = {sid: _label_store(label_catalog, sid) for sid in label_catalog}
    wh = warehouse_ids(defs)
    wh_name = ", ".join(label[i] for i in wh)
    filters: list[str] = []
    notices: list[dict] = []
    says = _says(defs)

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at, (now() AT TIME ZONE 'Asia/Manila')::date AS today")
            head = cur.fetchone()
            snapshot_timestamp = head["read_at"]
            day = as_of or head["today"]

            stock_day = stock_day_for(cur, defs, day)
            if stock_day is None:
                raise RuntimeError(f"No stock count exists on or before {day - timedelta(days=1)}.")

            product_ids = None
            if sku is not None:
                cur.execute("SELECT id FROM products WHERE lower(sku) = lower(%s) ORDER BY id", (sku,))
                product_ids = [r["id"] for r in cur.fetchall()]
                if not product_ids:
                    raise ValueError(f"No product has SKU {sku!r}.")
                filters.append(f"lower(sku) = lower({sku!r}) -> {len(product_ids)} product id(s)"
                               f"   # metrics.yaml: products.sku")

            limit = top_n or int(_req(sc, "max_rows"))
            if view == "cover":
                asked = [state] if state else list(_req(sc, "default_states"))
                require_level = state is None and bool(_req(sc, "default_requires_a_level"))
                got = cover_lines(cur, defs, day=day, stock_day=stock_day, shops=shops,
                                  window_days=window, states=asked, require_level=require_level,
                                  product_ids=product_ids, limit=limit)
                rows = got["rows"]
                if state is None:
                    filters.append(f"state IN ({', '.join(asked)}) with a level set"
                                   f"   # metrics.yaml: stock_cover.default_states")
                else:
                    filters.append(f"state = {state}   # metrics.yaml: stock_cover.states")
            else:
                wanting_states = list(_req(sc, "draft.wanting_states"))
                got = cover_lines(cur, defs, day=day, stock_day=stock_day, shops=shops,
                                  window_days=window, states=wanting_states, require_level=True,
                                  product_ids=product_ids,
                                  limit=int(_req(sc, "max_rows")))
                wanting = got["rows"]
                pids = sorted({w["product_id"] for w in wanting})
                donors_rows: list[dict] = []
                suppliers: dict[str, list[str]] = {}
                if pids:
                    donors = cover_lines(cur, defs, day=day, stock_day=stock_day, shops=all_shops,
                                         window_days=window, states=states_all, require_level=False,
                                         product_ids=pids, limit=len(pids) * len(all_shops) + 1)
                    donors_rows = donors["rows"]
                    cur.execute(_SUPPLIERS, {"product_ids": pids})
                    for r in cur.fetchall():
                        suppliers.setdefault(r["product_id"], []).append(r["supplier_name"])
                warehouse_on_hand = {w["product_id"]: w.get("warehouse_on_hand") or 0 for w in wanting}
                plan = plan_moves(wanting, donors_rows, warehouse_on_hand, window_days=window,
                                  label=label, warehouse_name=wh_name,
                                  wanting_states=wanting_states,
                                  max_lines=int(_req(sc, "draft.max_lines")))
                rows = list(plan["lines"])
                for pid, o in plan["orders_by_product"].items():
                    names = suppliers.get(pid) or []
                    rows.append({
                        "kind": "order", "product_id": pid, "sku": o["sku"], "product": o["product"],
                        "to": wh_name, "quantity": o["quantity"], "suppliers": names,
                        "for_shops": o["for_shops"], "window_days": window,
                        "reason": ("nothing left to move from " + wh_name + " or another shop; "
                                   + "; ".join(f"{f['shop']} still needs {f['quantity']}"
                                               for f in o["for_shops"])
                                   + (f". Suppliers on file: {', '.join(names)}" if names
                                      else ". No supplier is on file for it")),
                    })
                if top_n:
                    rows = rows[:top_n]
                filters.append(f"lines with a level set, state IN ({', '.join(wanting_states)})"
                               f"   # metrics.yaml: stock_cover.draft.wanting_states")
                filters.append(f"sources, in order: {wh_name}, then shops above what they keep"
                               f"   # metrics.yaml: stock_cover.draft.sources")

    for r in rows:
        if "store_id" in r:
            r["store"] = label.get(r["store_id"], r["store_id"])
            r["window_days"] = window
            r["says"] = says.get(r.get("state"), "")

    lb = lookback_days(defs)
    filters[:0] = [
        f"shops: {scope_note or ', '.join(label[s] for s in shops)}"
        f"   # metrics.yaml: {_req(sc, 'shops')}",
        f"on hand = the stock count of {stock_day}   # metrics.yaml: stock_cover.on_hand",
        f"speed = units sold {got['since']}..{got['before'] - timedelta(days=1)} / {lb} days, "
        f"cancelled and returns excluded   # metrics.yaml: stock_cover.demand",
        f"window = {window} days"
        + ("" if window_days is not None else " (the replenishment review period)")
        + "   # metrics.yaml: stock_cover.window",
    ]

    # ---- notices: only what says a figure may be wrong ---------------------
    stale_after = int(_req(defs, _req(sc, "on_hand.stale_after_days_ref")))
    age = (day - stock_day).days
    if age > stale_after:
        notices.append({
            "kind": _req(sc, "on_hand.stale_notice_kind"),
            "message": (f"The newest stock count is from {stock_day}, {age} days before "
                        f"{day}. Anything sold or delivered since is not in what is left, so "
                        f"the cover here is out of date."),
            "source": "metrics.yaml: stock_cover.on_hand",
        })
    broken = [r for r in rows if r.get("state") == "broken_record"
              or (r.get("to_state") == "broken_record")]
    if broken:
        notices.append({
            "kind": _req(defs, "inventory.history.negative_on_hand.notice_kind"),
            "message": (f"{len(broken)} of these lines have a stock count below zero. That is a "
                        f"broken record, not a shortage: what is left there is unknown, so no "
                        f"cover is given for them."),
            "source": "metrics.yaml: stock_cover.states (broken_record)",
        })
    if any(r.get("kind") == "move" and r.get("from") == wh_name for r in rows):
        notices.append({
            "kind": _req(sc, "draft.warehouse_count_notice_kind"),
            "message": (f"The moves from {wh_name} rest on its stock count, which behaves as a "
                        f"running dispatch tally rather than a count of the shelf. Check the "
                        f"shelf before keying a move from it."),
            "guidance": "metrics.yaml dead_stock.barn_excluded_reason; stock_cover.draft.warehouse_count_verified is false.",
            "source": "metrics.yaml: stock_cover.draft",
        })

    notice: Optional[dict] = None
    if len(notices) == 1:
        notice = notices[0]
    elif notices:
        notice = {"kind": "multiple", "items": notices}

    meta: dict[str, Any] = {
        "source_table": _req(sc, "source_table"),
        "filters_applied": filters,
        "snapshot_timestamp": snapshot_timestamp,
        "view": view,
        "grain": views[view],
        "stock_day": str(stock_day),
        "as_of": str(day),
        "window_days": window,
        "window_source": "bound" if window_days is not None else _req(sc, "window.days_ref"),
        "lookback_days": lb,
        "fires": _req(sc, "fires"),
        "states": got["state_counts"] if view == "cover" else None,
        "lines_with_a_level": got["lines_with_a_level"],
        "would_fire_without_a_level": got["would_fire_without_a_level"],
        "row_count": len(rows),
        "full_row_count": got["full_row_count"] if view == "cover" else len(rows),
        "definitions": {
            "cover_days": _req(sc, "cover_formula"),
            "units_per_day": _req(sc, "demand.rate"),
            "source": "definitions/metrics.yaml: stock_cover",
        },
    }
    if view == "cover" and got["state_counts"]:
        meta["states"] = got["state_counts"]
    if view == "draft":
        meta.pop("states")
        meta["is_a_draft"] = bool(_req(sc, "draft.is_a_draft"))
        meta["writes_anything"] = bool(_req(sc, "draft.writes_anything"))
        meta["keyed_into"] = _req(sc, "draft.keyed_into")
        meta["moves"] = sum(1 for r in rows if r.get("kind") == "move")
        meta["orders"] = sum(1 for r in rows if r.get("kind") == "order")
        meta["lines_wanting_stock"] = len(wanting)
        meta["unsized"] = plan["unsized"]
        meta["lines_cut"] = plan["lines_cut"]
        meta["definitions"].update({
            "need": _req(sc, "draft.need_formula"),
            "shop_keeps": _req(sc, "draft.sources")[1]["keeps"],
            "allocation": _req(sc, "draft.allocation_order"),
        })
    if notice:
        meta["notice"] = notice
    return {"rows": rows, "meta": meta}
