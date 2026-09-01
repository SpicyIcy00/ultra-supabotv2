"""
George — stock movement tool.

One public function: get_movement().

READ THIS BEFORE USING THE OUTPUT. There is no movement ledger in this
database. Nothing records a transfer as an event. This tool reports BALANCE
CHANGES derived by differencing daily inventory snapshots — it says the number
moved, never that goods moved, where they went, or why.

Consequences, all enforced in code rather than left to the caller:
  - Rows are `balance_delta`, never `transferred`.
  - meta.provenance is mandatory and says derived: true,
    is_recorded_movement: false.
  - Destination-scoped queries (to_store=...) are REFUSED with the measured
    coverage numbers, because destination attribution reconciles for 24 of 196
    products and is absent on 26% of the only source that names one.
  - Snapshot gaps are REPORTED, never differenced across. AJI BARN has 14
    missing days in a 162-day span; a delta spanning a gap would silently merge
    several days of movement into one number.

Architecture rules (see CLAUDE.md): one SELECT template, predicates from
definitions/metrics.yaml plus bound parameters, {rows, meta} contract,
read-only role via tools/_common.connect().
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
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

# Days of lookback used only to find an anchor snapshot before the window, so
# the first in-window day can have a delta. Never widens what is returned.
_ANCHOR_LOOKBACK_DAYS = 7

_SELECT = """
SELECT s.snapshot_date,
       s.store_id,
       s.product_id,
       p.sku,
       p.name AS product,
       s.quantity_on_hand,
       s.quantity_on_hand - LAG(s.quantity_on_hand) OVER w AS raw_delta,
       LAG(s.snapshot_date) OVER w                        AS prev_date
FROM inventory_snapshots s
LEFT JOIN products p ON p.id = s.product_id
WHERE s.store_id = ANY(%(store_ids)s)
  AND s.product_id = ANY(%(product_ids)s)
  AND s.snapshot_date >= %(anchor_date)s
  AND s.snapshot_date <  %(end_date)s
WINDOW w AS (PARTITION BY s.store_id, s.product_id ORDER BY s.snapshot_date)
ORDER BY s.store_id, s.product_id, s.snapshot_date
LIMIT {limit}
"""


def _inventory_catalog(defs: dict) -> dict[str, dict]:
    return _store_catalog_for(defs, _req(defs, "inventory.scope_store_ids"))


def _resolve_window(defs: dict, date_range: Any) -> tuple[date, date, dict]:
    """
    Resolve date_range to Manila calendar dates, half-open [start, end).

    Snapshots are keyed by snapshot_date (a DATE), so the presets — which are
    timestamptz instants — are converted back to Manila calendar dates. Doing
    that conversion here keeps one definition of "last_30_days" rather than a
    second, snapshot-specific one.
    """
    presets = _req(defs, "sales_day.presets")

    if isinstance(date_range, str):
        if date_range not in presets:
            raise ValueError(
                f"Unknown date_range {date_range!r}. Valid presets: "
                f"{', '.join(sorted(presets))}. Or pass an explicit "
                f"(start, end) pair of Manila dates."
            )
        return None, None, {"kind": "preset", "name": date_range}

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
    return start, end, {
        "kind": "explicit",
        "start": start.isoformat(),
        "end": end.isoformat(),
        "convention": "half-open [start, end)",
    }


def get_movement(
    store: str = "AJI BARN",
    sku: Optional[str] = None,
    product_id: Optional[str] = None,
    date_range: Any = "last_30_days",
    to_store: Optional[str] = None,
) -> dict:
    """
    Observed balance changes for one product at one location.

    THIS IS NOT A TRANSFER REPORT. It reports how a stock balance changed, as
    differenced from daily snapshots. See module docstring.

    Args:
        store:      location whose balance is being read. Defaults to AJI BARN.
        sku:        product SKU. One of sku or product_id is REQUIRED.
        product_id: unambiguous product id, preferred when a SKU collides.
        date_range: preset name from metrics.yaml, or an explicit (start, end)
                    pair of Manila calendar dates, half-open.
        to_store:   NOT SUPPORTED. Passing it raises with the measured coverage
                    figures, because destination attribution is not answerable
                    from this data.

    Returns:
        {"rows": [...], "meta": {...}}. meta.provenance is always present and
        must be surfaced with any figure taken from this tool.
    """
    defs = _load_defs()

    # ---- refuse destination scoping, before touching the database ----------
    if to_store is not None:
        raise ValueError(
            " ".join(
                _req(defs, "movement.destination_attribution.refusal_message").split()
            )
            + f" (requested destination: {to_store!r}; "
            f"metrics.yaml: movement.destination_attribution)"
        )

    if sku is None and product_id is None:
        raise ValueError(
            "get_movement requires sku or product_id. A balance series is only "
            "meaningful per product: AJI BARN alone carries 3,518 products, and "
            "summing their deltas would merge unrelated movements into one "
            "number. Pass product_id for an unambiguous key."
        )

    catalog = _inventory_catalog(defs)
    store_ids = _resolve_store_in(store, catalog)
    start, end, window_meta = _resolve_window(defs, date_range)

    notices: list[dict] = []

    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute("SELECT now() AS read_at")
            snapshot_timestamp = cur.fetchone()["read_at"]

            # Preset windows resolve to Manila calendar dates here, using the
            # same preset SQL the sales tool uses.
            if start is None:
                p = _req(defs, f"sales_day.presets.{window_meta['name']}")
                cur.execute(
                    f"SELECT ({p['start']} AT TIME ZONE 'Asia/Manila')::date AS s, "
                    f"       ({p['end']}   AT TIME ZONE 'Asia/Manila')::date AS e"
                )
                r = cur.fetchone()
                start, end = r["s"], r["e"]
                window_meta.update(
                    start=start.isoformat(),
                    end=end.isoformat(),
                    convention="half-open [start, end)",
                )

            # ---- resolve the product ---------------------------------------
            # SKUs are not unique (metrics.yaml products.sku). A balance series
            # for three unrelated products interleaved is meaningless, so a
            # collision is refused rather than merged.
            if product_id is not None:
                product_ids = [product_id]
                sku_resolution = {"product_ids": product_ids, "source": "product_id"}
            else:
                cur.execute(
                    "SELECT p.id, p.sku, p.name, p.unit_price, "
                    f"       {_req(defs, 'products.category_normalization.sql')} AS category "
                    "FROM products p WHERE lower(p.sku) = lower(%s) ORDER BY p.id",
                    (sku,),
                )
                matches = [dict(m) for m in cur.fetchall()]
                product_ids = [m["id"] for m in matches]
                sku_resolution = {
                    "sku": sku,
                    "product_count": len(matches),
                    "product_ids": product_ids,
                    "source": "sku",
                }
                if len(matches) > 1:
                    raise ValueError(
                        f"SKU {sku!r} matches {len(matches)} DIFFERENT products, and "
                        f"a balance series interleaving them would be meaningless. "
                        f"The collision: "
                        + "; ".join(
                            f"{m['id']} = {m['name']!r} ({m['category']})"
                            for m in matches
                        )
                        + ". Pass product_id to pick one. "
                        "(metrics.yaml: products.sku.ambiguity_policy)"
                    )
                if not matches:
                    notices.append({
                        "kind": "sku_not_found",
                        "message": (
                            f"No product exists with SKU {sku!r}. This is an unknown "
                            f"SKU, not a product with no movement."
                        ),
                        "source": "products.sku lookup",
                    })

            # ---- the one query ---------------------------------------------
            anchor_date = start - timedelta(days=_ANCHOR_LOOKBACK_DAYS)
            params = {
                "store_ids": store_ids,
                "product_ids": product_ids,
                "anchor_date": anchor_date,
                "end_date": end,
            }
            cur.execute(_SELECT.format(limit=_MAX_ROWS), params)
            raw = [dict(r) for r in cur.fetchall()]

            # ---- corroborating source --------------------------------------
            # How much of the observed movement any RECORDED dispatch explains.
            # Never authoritative — attached so every answer states its own
            # explanatory power instead of implying completeness.
            cs = _req(defs, "movement.corroborating_source")
            cur.execute(
                f"SELECT COALESCE(SUM({cs['quantity_column']}), 0) AS grams, "
                f"       COUNT(*) AS rows, "
                f"       COUNT(*) FILTER (WHERE destination_store IS NULL) AS null_dest "
                f"FROM {cs['table']} "
                f"WHERE product_id = ANY(%(product_ids)s) "
                f"  AND ({cs['time_column']} AT TIME ZONE 'Asia/Manila')::date >= %(start)s "
                f"  AND ({cs['time_column']} AT TIME ZONE 'Asia/Manila')::date <  %(end)s",
                {"product_ids": product_ids, "start": start, "end": end},
            )
            disp = cur.fetchone()

    # ---- build rows, never differencing across a gap ----------------------
    rows: list[dict] = []
    gaps: list[dict] = []
    for r in raw:
        if r["snapshot_date"] < start:
            continue  # anchor row: used for the first delta, not reported
        prev = r["prev_date"]
        gap_days = 0
        delta: Optional[float] = None
        if prev is None:
            reason = "no prior snapshot within lookback"
        else:
            gap_days = (r["snapshot_date"] - prev).days - 1
            if gap_days > 0:
                reason = f"{gap_days} snapshot day(s) missing before this date"
                gaps.append({
                    "after": prev.isoformat(),
                    "before": r["snapshot_date"].isoformat(),
                    "missing_days": gap_days,
                })
            else:
                reason = None
                delta = float(r["raw_delta"]) if r["raw_delta"] is not None else None

        rows.append({
            "snapshot_date": r["snapshot_date"].isoformat(),
            "store_id": r["store_id"],
            "store": _label_store(catalog, r["store_id"]),
            "product_id": r["product_id"],
            "sku": r["sku"],
            "product": r["product"],
            "quantity_on_hand": r["quantity_on_hand"],
            # Deliberately named balance_delta, not "transferred".
            "balance_delta": delta,
            "delta_unavailable_reason": reason,
            "preceded_by_gap": gap_days > 0,
            "gap_days": gap_days,
        })

    # ---- headline numbers -------------------------------------------------
    # net_change is first-to-last BALANCE, which is exact even across gaps
    # because these are absolute positions, not flows. sum_of_observed_deltas
    # omits whatever happened inside a gap, so the two differ when gaps exist —
    # that difference is itself the measure of what the gaps hide.
    observed = [r["balance_delta"] for r in rows if r["balance_delta"] is not None]
    net_change = None
    if rows:
        net_change = float(rows[-1]["quantity_on_hand"]) - float(rows[0]["quantity_on_hand"])
    sum_observed = sum(observed) if observed else 0.0
    decline = -sum(d for d in observed if d < 0) if observed else 0.0
    disp_grams = float(disp["grams"]) if disp else 0.0

    explained_pct = round(100.0 * disp_grams / decline, 1) if decline else None

    if gaps:
        notices.append({
            "kind": "snapshot_gaps",
            "message": (
                f"{len(gaps)} gap(s) in the snapshot series over this window, "
                f"totalling {sum(g['missing_days'] for g in gaps)} missing day(s). "
                f"No delta is reported across a gap — movement inside one is "
                f"unobservable, so sum_of_observed_deltas understates activity. "
                f"net_change (first-to-last balance) remains exact."
            ),
            "source": "metrics.yaml: movement.balance_delta.difference_across_gaps",
        })

    if decline and disp_grams == 0:
        notices.append({
            "kind": "no_recorded_dispatch",
            "message": (
                f"The balance declined by {decline:,.0f} grams over this window "
                f"and NO recorded dispatch explains any of it (0 rows in "
                f"{_req(defs, 'movement.corroborating_source.table')}). The "
                f"movement is real; the record of it does not exist."
            ),
            "source": "movement.corroborating_source",
        })

    meta: dict[str, Any] = {
        "source_table": _req(defs, "movement.balance_delta.source_table"),
        "filters_applied": [
            f"store_id IN ({len(store_ids)}: "
            f"{', '.join(_label_store(catalog, s) for s in store_ids)})"
            f"   # metrics.yaml: inventory.scope_store_ids",
            f"product_id IN ({len(product_ids)})   # resolved via {sku_resolution['source']}",
            f"snapshot_date >= {start} AND < {end} (Asia/Manila, half-open)"
            f"   # metrics.yaml: sales_day",
        ],
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "window": window_meta,
        "unit": _req(defs, "movement.unit"),
        "row_count": len(rows),
        "truncated": len(raw) == _MAX_ROWS,
        "row_limit": _MAX_ROWS,
        "sku_resolution": sku_resolution,

        # ---- MANDATORY. Must be surfaced with any figure from this tool. ----
        "provenance": {
            "derived": True,
            "is_recorded_movement": False,
            "method": _req(defs, "movement.balance_delta.method"),
            "recorded_ledger_exists": _req(defs, "movement.recorded_ledger_exists"),
            "statement": (
                "These are BALANCE CHANGES differenced from daily inventory "
                "snapshots, not recorded movements. They show that a stock "
                "number changed. They do not show that goods moved, where they "
                "went, or why. No movement ledger exists in this database."
            ),
            "destination_attribution_supported": False,
        },

        "net_change": net_change,
        "net_change_note": (
            "First-to-last balance over the window. Exact even where the "
            "snapshot series has gaps, because snapshots are absolute positions."
        ),
        "sum_of_observed_deltas": sum_observed,
        "sum_of_observed_deltas_note": (
            "Sum of day-to-day deltas that do not span a gap. Understates "
            "activity when gaps exist; compare against net_change."
        ),
        "observed_decline": decline,

        "snapshot_gaps": gaps,
        "snapshot_gap_days": sum(g["missing_days"] for g in gaps),

        "reconciliation": {
            "applicable": True,
            "corroborating_source": _req(defs, "movement.corroborating_source.table"),
            "authoritative": False,
            "recorded_dispatch_grams": disp_grams,
            "recorded_dispatch_rows": int(disp["rows"]) if disp else 0,
            "recorded_dispatch_rows_without_destination": int(disp["null_dest"]) if disp else 0,
            "observed_decline_grams": decline,
            "explained_pct": explained_pct,
            "note": (
                f"Recorded dispatches explain "
                f"{explained_pct if explained_pct is not None else 0}% of the "
                f"observed decline for this product and window. The source is a "
                f"view inferring dispatches from zero-total BARN transactions; "
                f"database-wide it covers "
                f"{_req(defs, 'movement.destination_attribution.coverage_pct')}% "
                f"of outflow and has no destination on "
                f"{_req(defs, 'movement.destination_attribution.null_destination_pct')}% "
                f"of its rows. It is corroborating, never authoritative."
            ),
        },
    }
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
