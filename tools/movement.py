"""
George — stock movement tool.

One public function: get_movement().

TWO BASES, AND THEY ARE NEVER ADDED TOGETHER.

  transfer_records   RECORDED movement. StoreHub stock transfers, imported
                     2026-09-02: 2,034 documents and 40,141 lines, each naming a
                     source, a destination, a product, a quantity and a status.
                     A document says goods moved from A to B. Destination
                     questions ARE answerable here.

  balance_delta      INFERRED movement. Daily inventory snapshots differenced
                     per (store, product). Says a NUMBER changed — never that
                     goods moved, where they went, or why. Destination questions
                     are REFUSED here, and still are.

Adding a recorded transfer to an inferred balance change would count the same
movement twice under two names and produce a figure with no single provenance.
So: every row carries its own `basis`, each basis gets its own meta block with
its own provenance, and there is no summed field spanning both. A caller wanting
one number must pick a basis and get that basis's caveats with it.

WHAT CHANGED. Before the transfer import this module could only report balance
deltas, and its docstring said no movement ledger existed. That is no longer
true, but the balance_delta path and every one of its limits are unchanged — it
still covers products and windows the records do not, so it remains useful and
remains honest about being inferred.

Enforced in code rather than left to the caller:
  - Rows are `balance_delta`, never `transferred`, on the snapshot basis.
  - meta.balance_delta.provenance says derived: true, is_recorded_movement: false.
  - to_store is REFUSED on the balance_delta basis, with the measured coverage
    numbers, and ALLOWED on transfer_records where both ends are named.
  - Snapshot gaps are REPORTED, never differenced across.
  - Record-backed quantity answers default to statuses where goods actually
    moved: most transfers in a window are 'Created' and never shipped, including
    the largest single document in the file.
  - A closed location (AJI MACOPA) is answerable on records and NOT on
    snapshots; asking for it says so rather than returning an empty series.

Architecture rules (see CLAUDE.md): fixed SELECT templates, predicates from
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

# Recorded transfers touching one location and one product. Both ends are named,
# which is what makes destination scoping answerable on this basis.
_TRANSFER_SELECT = """
SELECT st.external_id           AS document,
       st.created_at_source     AS created_at,
       st.shipped_date          AS shipped_at,
       st.received_date         AS received_at,
       st.status                AS status,
       st.source_location_raw   AS source_location,
       st.source_store_id       AS source_store_id,
       st.target_location_raw   AS target_location,
       st.target_store_id       AS target_store_id,
       stl.product_id           AS product_id,
       stl.sku_raw              AS sku,
       stl.product_name_raw     AS product,
       stl.ordered_qty          AS quantity,
       stl.unit_cost            AS unit_cost,
       stl.subtotal             AS subtotal
FROM stock_transfer_lines stl
INNER JOIN stock_transfers st ON st.id = stl.stock_transfer_id
WHERE {predicates}
ORDER BY st.created_at_source DESC
LIMIT {limit}
"""

# Coverage of the imported transfer window, so an empty result is
# distinguishable from an unimported one.
_TRANSFER_COVERAGE = """
SELECT MIN(created_at_source) AS first,
       MAX(created_at_source) AS last,
       COUNT(*)               AS documents
FROM stock_transfers
"""


def _inventory_catalog(defs: dict) -> dict[str, dict]:
    return _store_catalog_for(defs, _req(defs, "inventory.scope_store_ids"))


def _all_locations(defs: dict) -> dict[str, dict]:
    """
    Every location a recorded transfer can name, including closed ones.

    Wider than the inventory catalog on purpose. AJI MACOPA closed in June and
    is out of every current-state scope, but 1,006 transfer documents reference
    it and those are real history — see filters.closed_locations, where the
    exclusion is scoped to current state rather than applied to everything.
    """
    catalog: dict[str, dict] = {}
    for group in ("active_retail", "warehouse", "pending_retail", "closed"):
        for entry in _req(defs, f"stores.{group}"):
            catalog[entry["id"]] = entry
    return catalog


def _resolve_any_location(name: str, catalog: dict[str, dict]) -> list[str]:
    """Resolve a location name to ids from the definitions only, never the table."""
    wanted = str(name).strip().lower()
    matched = [
        sid for sid, e in catalog.items()
        if wanted in (sid.lower(),
                      str(e.get("display_name", "")).lower(),
                      str(e.get("name", "")).lower())
    ]
    if not matched:
        valid = sorted(e.get("display_name") or e["name"] for e in catalog.values())
        raise ValueError(
            f"Unknown location {name!r}. Valid: {', '.join(valid)}. "
            f"(Resolved from definitions/metrics.yaml, not from the stores table.)"
        )
    return matched


def _moved_statuses(defs: dict) -> list[str]:
    """Follow movement.moved_statuses_ref rather than restating the list."""
    return list(_req(defs, _req(defs, "movement.moved_statuses_ref")))


def _closed_ids(defs: dict) -> set[str]:
    return set(_req(defs, "filters.closed_locations.excluded_store_ids"))


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
    basis: str = "both",
) -> dict:
    """
    Stock movement for one product at one location, from records and/or snapshots.

    Two bases that are never added together. transfer_records are recorded
    documents that name both ends; balance_delta is inferred by differencing
    daily snapshots and says only that a number changed. Every row is labelled
    with its basis and there is no combined total.

    Args:
        store:      location to report on. Defaults to AJI BARN.
        sku:        product SKU. One of sku or product_id is REQUIRED.
        product_id: unambiguous product id, preferred when a SKU collides.
        date_range: preset name from metrics.yaml, or an explicit (start, end)
                    pair of Manila calendar dates, half-open.
        to_store:   destination filter. Valid ONLY on the transfer_records basis,
                    where documents name their destination. Refused on
                    balance_delta, which cannot say where anything went.
        basis:      transfer_records, balance_delta, or both (default).

    Returns:
        {"rows": [...], "meta": {...}}. meta carries a separate block per basis,
        each with its own provenance, and both must be surfaced with any figure.
    """
    defs = _load_defs()

    valid_bases = list(_req(defs, "movement.bases")) + ["both"]
    if basis not in valid_bases:
        raise ValueError(
            f"Unknown basis {basis!r}. Valid: {', '.join(sorted(valid_bases))}. "
            f"(metrics.yaml: movement.bases)"
        )
    want_records = basis in ("transfer_records", "both")
    want_deltas = basis in ("balance_delta", "both")

    # ---- destination scoping: allowed on records, refused on snapshots -----
    # This used to be an unconditional refusal, which was right when snapshots
    # were the only basis. Transfers name both ends, so the refusal is now scoped
    # to the basis that genuinely cannot answer it.
    supported_by_basis = _req(defs, "movement.destination_attribution.supported_by_basis")
    if to_store is not None:
        if not supported_by_basis.get("transfer_records"):
            raise ValueError("Destination attribution is disabled in metrics.yaml.")
        if basis == "balance_delta":
            raise ValueError(
                " ".join(
                    _req(defs, "movement.destination_attribution.refusal_message").split()
                )
                + f" (requested destination: {to_store!r} on the balance_delta basis; "
                f"metrics.yaml: movement.destination_attribution.supported_by_basis). "
                f"Recorded transfers DO name a destination — ask for "
                f"basis='transfer_records'."
            )
        # On 'both', the destination filter applies to the record basis only and
        # the snapshot basis is dropped rather than silently ignoring the filter.
        if basis == "both":
            want_deltas = False

    if sku is None and product_id is None:
        raise ValueError(
            "get_movement requires sku or product_id. A balance series is only "
            "meaningful per product: AJI BARN alone carries 3,518 products, and "
            "summing their deltas would merge unrelated movements into one "
            "number. Pass product_id for an unambiguous key."
        )

    # Locations are resolved against EVERY known location, not just the
    # inventory scope, because a recorded transfer can name a place that holds
    # no current stock — a closed warehouse, a storefront that has never traded.
    catalog = _all_locations(defs)
    store_ids = _resolve_any_location(store, catalog)
    to_store_ids = _resolve_any_location(to_store, catalog) if to_store else None
    start, end, window_meta = _resolve_window(defs, date_range)

    notices: list[dict] = []

    # A location outside the inventory scope has no snapshots, so the snapshot
    # basis cannot answer for it. Say so rather than returning an empty series
    # that reads as "nothing moved".
    inventory_scope = set(_req(defs, "inventory.scope_store_ids"))
    snapshot_capable = [s for s in store_ids if s in inventory_scope]
    if want_deltas and not snapshot_capable:
        closed = _closed_ids(defs) & set(store_ids)
        label = _label_store(catalog, store_ids[0])
        entry = catalog.get(store_ids[0], {})
        notices.append({
            "kind": "location_closed" if closed else "no_snapshot_coverage",
            "message": (
                (f"{label} closed on {entry.get('closed_at')} and has no inventory "
                 f"snapshots, so its balance history cannot be differenced. "
                 if closed else
                 f"{label} is not in the inventory snapshot scope, so no balance "
                 f"history exists for it. ")
                + "Its RECORDED transfers are intact and are what this answer is "
                  "based on."
            ),
            "source": "metrics.yaml: inventory.scope_store_ids",
        })
        want_deltas = False
        if not want_records:
            # Asked for snapshots only, at a location that has none.
            raise ValueError(
                f"{label} has no inventory snapshots, so the balance_delta basis "
                f"cannot answer for it. Its recorded transfers are available — ask "
                f"for basis='transfer_records'."
            )

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

            # ---- recorded transfers ----------------------------------------
            transfer_raw: list[dict] = []
            transfer_coverage = None
            if want_records:
                tpreds = [
                    "(st.source_store_id = ANY(%(store_ids)s) "
                    " OR st.target_store_id = ANY(%(store_ids)s))",
                    "(stl.product_id = ANY(%(product_ids)s) OR stl.sku_raw = %(sku)s)",
                    "st.created_at_source >= (%(start)s)::timestamp AT TIME ZONE 'Asia/Manila'",
                    "st.created_at_source <  (%(end)s)::timestamp AT TIME ZONE 'Asia/Manila'",
                    "st.status <> ALL(%(cancelled)s)",
                ]
                tparams: dict[str, Any] = {
                    "store_ids": store_ids,
                    "product_ids": product_ids,
                    "sku": sku,
                    "start": start.isoformat(),
                    "end": end.isoformat(),
                    "cancelled": list(
                        _req(defs, "storehub.stock_transfers.cancelled_statuses")
                    ),
                }
                if to_store_ids:
                    # Destination scoping: this location shipped, that one received.
                    tpreds.append("st.source_store_id = ANY(%(store_ids)s)")
                    tpreds.append("st.target_store_id = ANY(%(to_store_ids)s)")
                    tparams["to_store_ids"] = to_store_ids

                cur.execute(
                    _TRANSFER_SELECT.format(
                        predicates="\n  AND ".join(tpreds), limit=_MAX_ROWS
                    ),
                    tparams,
                )
                transfer_raw = [dict(r) for r in cur.fetchall()]

                cur.execute(_TRANSFER_COVERAGE)
                transfer_coverage = cur.fetchone()

            # ---- the snapshot query ----------------------------------------
            raw: list[dict] = []
            if want_deltas:
                anchor_date = start - timedelta(days=_ANCHOR_LOOKBACK_DAYS)
                params = {
                    "store_ids": snapshot_capable or store_ids,
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
            disp = None
            if want_deltas:
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
            # Every row says which basis produced it, so a caller can never mix
            # an inferred delta with a recorded transfer by accident.
            "basis": "balance_delta",
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

    # ---- recorded transfer rows -------------------------------------------
    moved = set(_moved_statuses(defs))
    transfer_rows: list[dict] = []
    moved_qty = moved_value = 0.0
    unmoved_qty = unmoved_value = 0.0
    routes: dict[tuple, dict] = {}

    for r in transfer_raw:
        qty = float(r["quantity"]) if r["quantity"] is not None else 0.0
        val = float(r["subtotal"]) if r["subtotal"] is not None else 0.0
        goods_moved = r["status"] in moved
        # A transfer OUT of the queried location is negative to it; one IN is
        # positive. Direction is a fact of the document, not an inference.
        direction = "out" if r["source_store_id"] in store_ids else "in"

        transfer_rows.append({
            "basis": "transfer_records",
            "document": r["document"],
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "shipped_at": r["shipped_at"].isoformat() if r["shipped_at"] else None,
            "received_at": r["received_at"].isoformat() if r["received_at"] else None,
            "status": r["status"],
            "goods_moved": goods_moved,
            "direction": direction,
            "from": _label_store(catalog, r["source_store_id"]) if r["source_store_id"]
                    else r["source_location"],
            "to": _label_store(catalog, r["target_store_id"]) if r["target_store_id"]
                  else r["target_location"],
            "product_id": r["product_id"],
            "sku": r["sku"],
            "product": r["product"],
            "quantity": qty,
            "unit_cost": float(r["unit_cost"]) if r["unit_cost"] is not None else None,
            "value": val,
        })

        if goods_moved:
            moved_qty += qty
            moved_value += val
            key = (transfer_rows[-1]["from"], transfer_rows[-1]["to"])
            route = routes.setdefault(
                key, {"from": key[0], "to": key[1], "documents": set(),
                      "quantity": 0.0, "value": 0.0}
            )
            route["documents"].add(r["document"])
            route["quantity"] += qty
            route["value"] += val
        else:
            unmoved_qty += qty
            unmoved_value += val

    rows.extend(transfer_rows)
    route_rows = sorted(
        ({**v, "documents": len(v["documents"])} for v in routes.values()),
        key=lambda x: x["value"],
        reverse=True,
    )

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

    # ---- notices for the record basis -------------------------------------
    if want_records and unmoved_value:
        notices.append({
            "kind": "unmoved_transfer_value",
            "message": (
                f"PHP {unmoved_value:,.2f} across the transfers in this window sits "
                f"in documents whose status says the goods have NOT moved "
                f"(raised or not yet shipped). It is excluded from the moved "
                f"totals. A transfer that has only been created is a document, "
                f"not a movement."
            ),
            "source": "metrics.yaml: storehub.stock_transfers.moved_statuses",
        })

    if want_records and want_deltas and transfer_rows and rows:
        notices.append({
            "kind": "two_bases_not_summed",
            "message": (
                "This answer carries two kinds of number: recorded transfer "
                "documents and balance changes inferred from daily snapshots. "
                "They are not added together and must not be — they describe the "
                "same goods from different sources, so a combined figure would "
                "double-count. Compare them if you like; that is a "
                "reconciliation, not a total."
            ),
            "source": "metrics.yaml: movement.never_blend_bases",
        })

    # ---- meta: one block per basis, and nothing summed across them ---------
    bases_used = ([n for n in ("transfer_records",) if want_records]
                  + [n for n in ("balance_delta",) if want_deltas])

    source_tables = []
    if want_records:
        source_tables.append("stock_transfers + stock_transfer_lines")
    if want_deltas:
        source_tables.append(_req(defs, "movement.balance_delta.source_table"))

    filters_applied = [
        f"location IN ({len(store_ids)}: "
        f"{', '.join(_label_store(catalog, s) for s in store_ids)})"
        f"   # metrics.yaml: stores.*",
        f"product_id IN ({len(product_ids)})   # resolved via {sku_resolution['source']}",
        f"date >= {start} AND < {end} (Asia/Manila, half-open)   # metrics.yaml: sales_day",
    ]
    if to_store_ids:
        filters_applied.append(
            f"destination IN ({', '.join(_label_store(catalog, s) for s in to_store_ids)})"
            f"   # transfer_records basis only; balance_delta cannot scope by destination"
        )
    if want_records:
        filters_applied.append(
            f"transfer status NOT IN "
            f"{tuple(_req(defs, 'storehub.stock_transfers.cancelled_statuses'))}"
            f"   # metrics.yaml: storehub.stock_transfers.cancelled_statuses"
        )

    meta: dict[str, Any] = {
        "source_table": " ; ".join(source_tables),
        "filters_applied": filters_applied,
        "snapshot_timestamp": snapshot_timestamp.isoformat(),
        "definitions_version": _req(defs, "version"),
        "definitions_path": str(_DEFS_PATH),
        "window": window_meta,
        "row_count": len(rows),
        "row_limit": _MAX_ROWS,
        "sku_resolution": sku_resolution,

        # ---------------------------------------------------------------------
        # THE BASIS CONTRACT. Stated on every result, not only when a caller
        # might get it wrong. There is deliberately NO field here that sums
        # across the two bases: a recorded transfer and an inferred balance
        # change describe the same goods from different sources, and adding them
        # would double-count with no single provenance.
        # ---------------------------------------------------------------------
        "bases_returned": bases_used,
        "never_blend_bases": _req(defs, "movement.never_blend_bases"),
        "blending_note": (
            "transfer_records are documents stating that goods moved from a named "
            "source to a named destination. balance_delta is a number differenced "
            "from daily snapshots, which shows only that a stock figure changed. "
            "They are separate measures of overlapping reality: adding them "
            "double-counts, and comparing them is a reconciliation, not a total."
        ),
    }

    # ---- transfer_records block -------------------------------------------
    if want_records:
        meta["transfer_records"] = {
            "provenance": {
                "derived": False,
                "is_recorded_movement": True,
                "statement": (
                    "These are RECORDED stock transfer documents. Each names a "
                    "source, a destination, a product, a quantity and a status. "
                    "They state that goods were moved; they do not prove the "
                    "physical count matched."
                ),
                "destination_attribution_supported": True,
            },
            "documents": len({r["document"] for r in transfer_rows}),
            "lines": len(transfer_rows),
            "moved_quantity": moved_qty,
            "moved_value": moved_value,
            "unmoved_quantity": unmoved_qty,
            "unmoved_value": unmoved_value,
            "moved_statuses": _moved_statuses(defs),
            "moved_note": (
                "Quantity and value totals cover documents whose status says the "
                "goods actually moved. Documents merely raised are reported "
                "separately as unmoved_*, never folded in."
            ),
            "quantity_unit": (
                "per product; the export records no unit. This result is scoped to "
                "one product, so its quantities are comparable to each other and to "
                "nothing else."
            ),
            "routes": route_rows,
            "coverage": {
                "documents_imported": transfer_coverage["documents"] if transfer_coverage else 0,
                "first_created": (transfer_coverage["first"].isoformat()
                                  if transfer_coverage and transfer_coverage["first"] else None),
                "last_created": (transfer_coverage["last"].isoformat()
                                 if transfer_coverage and transfer_coverage["last"] else None),
                "note": (
                    "Recorded transfers exist only for windows imported from the "
                    "StoreHub export. An empty result outside this range means the "
                    "data was never loaded, not that nothing moved."
                ),
            },
            "truncated": len(transfer_raw) == _MAX_ROWS,
        }

    # ---- balance_delta block, unchanged in substance ----------------------
    if want_deltas:
        meta["balance_delta"] = {
            # MANDATORY. Must be surfaced with any figure from this basis.
            "provenance": {
                "derived": True,
                "is_recorded_movement": False,
                "method": _req(defs, "movement.balance_delta.method"),
                "statement": (
                    "These are BALANCE CHANGES differenced from daily inventory "
                    "snapshots, not recorded movements. They show that a stock "
                    "number changed. They do not show that goods moved, where they "
                    "went, or why."
                ),
                "destination_attribution_supported": False,
            },
            "unit": _req(defs, "movement.unit"),
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
            "truncated": len(raw) == _MAX_ROWS,
            "reconciliation": {
                "applicable": True,
                "corroborating_source": _req(defs, "movement.corroborating_source.table"),
                "authoritative": False,
                "recorded_dispatch_grams": disp_grams,
                "recorded_dispatch_rows": int(disp["rows"]) if disp else 0,
                "recorded_dispatch_rows_without_destination": (
                    int(disp["null_dest"]) if disp else 0
                ),
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
                    f"of its rows. It is corroborating, never authoritative. "
                    f"NOTE: this predates the stock-transfer import and is a "
                    f"different, weaker source than the transfer_records basis."
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
