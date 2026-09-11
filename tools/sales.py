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


from . import windows as _windows
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

# The half-open bounds for an explicit Manila calendar date bound as a
# parameter. The ::timestamp cast is load-bearing — see metrics.yaml
# sales_day.expressions.date_start. `date AT TIME ZONE` selects the wrong
# Postgres overload and lands 8 hours late.
_EXPLICIT_START = "(%(win_start)s)::timestamp AT TIME ZONE 'Asia/Manila'"
_EXPLICIT_END = "(%(win_end)s)::timestamp AT TIME ZONE 'Asia/Manila'"

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


def _reconcile(cur, defs: dict, metric: str, filters: dict, where_sql: str,
               params: dict, notices: list[dict], window_label: Optional[str]) -> dict:
    """
    The net_sales / product_revenue reconciliation over ONE window.

    The real test: compute BOTH money measures over this same window and scope,
    and compare. SUM(t.discount) is reported as a diagnostic only — it is
    necessary but not sufficient, and the 2024 data proves it (gap != discount,
    and once negative). A failure becomes a reconciliation_failed notice naming
    the window when there is more than one (a comparison reconciles both).
    """
    if metric not in _RECONCILABLE:
        return {
            "applicable": False,
            "reason": (
                f"metric {metric!r} is not one of the two money measures "
                f"the reconciliation governs (net_sales, product_revenue)."
            ),
        }
    if _LINE_LEVEL_FILTERS & set(filters):
        return {
            "applicable": False,
            "reason": (
                "a product-level filter is active, so net_sales (which "
                "cannot be filtered by product) is not comparable to "
                "product_revenue for this window."
            ),
        }
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
    recon: dict[str, Any] = {
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
        which = f"the {window_label} window" if window_label else "this window"
        recon["note"] = (
            f"The two money measures disagree for {which} by "
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
    return recon


def _compare_row(current: Optional[dict], baseline: Optional[dict],
                 label_fields: Sequence[str], unit: str, cdef: dict) -> dict:
    """
    One compared subject, from its current row and its baseline row — either
    of which may be absent. Pure: every number here is subtraction and one
    division that metrics.yaml comparisons.previous_period specifies, and the
    row says in `baseline_status` exactly which of them could be done.

    Precedence when several apply: no_current, then no_baseline, then
    zero_baseline (comparisons.previous_period.baseline_statuses).
    """
    src = current if current is not None else (baseline or {})
    row: dict[str, Any] = {f: src.get(f) for f in label_fields}

    value = current.get("value") if current is not None else None
    base = baseline.get("value") if baseline is not None else None

    if value is None:
        status = "no_current"
    elif base is None:
        status = "no_baseline"
    elif base == 0:
        status = "zero_baseline"
    else:
        status = "ok"

    change: Optional[float] = None
    change_pct: Optional[float] = None
    if status in ("ok", "zero_baseline"):
        raw = value - base
        change = raw if isinstance(raw, int) else round(raw, int(_req(cdef, "change_decimal_places")))
    if status == "ok":
        # Against the ABSOLUTE baseline so the sign always agrees with
        # `change`; a negative baseline neither crashes nor becomes zero.
        change_pct = round(change / abs(base) * 100.0, int(_req(cdef, "change_pct_decimal_places")))

    direction: Optional[str] = None
    if change is not None:
        direction = "up" if change > 0 else "down" if change < 0 else "flat"

    row.update({
        "value": value,
        "baseline": base,
        "change": change,
        "change_pct": change_pct,
        "direction": direction,
        "unit": unit,
        "baseline_status": status,
    })
    return row


def _compare_rows(current: list[dict], baseline: list[dict], key_fields: Sequence[str],
                  label_fields: Sequence[str], unit: str, cdef: dict,
                  ranked: bool = False) -> list[dict]:
    """
    Current rows matched to baseline rows on the group key, in the current
    result's order; subjects that exist only in the baseline follow, so a
    store that traded last period and not this one is reported rather than
    dropped. With no grouping both sides are one row and the key is empty.

    `ranked` — top_n was applied to the current period, so a subject absent
    from `current` was CUT BY THE RANKING, not absent from trade. Reporting
    it as no_current would be a false statement about the world; those
    subjects are left out, and meta.comparison says the ranking applied.
    """
    def key(r: dict) -> tuple:
        return tuple(r.get(k) for k in key_fields)

    by_key = {key(b): b for b in baseline}
    seen: set[tuple] = set()
    out: list[dict] = []
    for c in current:
        k = key(c)
        seen.add(k)
        out.append(_compare_row(c, by_key.get(k), label_fields, unit, cdef))
    if not ranked:
        for b in baseline:
            if key(b) not in seen:
                seen.add(key(b))
                out.append(_compare_row(None, b, label_fields, unit, cdef))
    return out


def _subject_label(r: dict) -> str:
    """What a compared row is about, for a notice or a not_ranked list."""
    if r.get("product"):
        return f"{r['product']} ({r.get('sku') or r.get('product_id')})"
    return r.get("store") or r.get("category") or "the total"


def _describe_incomplete(incomplete: list[dict], described: dict, max_named: int) -> str:
    """
    The rows that could not be compared, by status, naming at most `max_named`
    per status and counting the rest — a product comparison can have dozens
    of new or vanished products, and a notice that lists every one buries the
    figures it qualifies (comparisons.<kind>.incomplete_notice_max_named).
    """
    by_status: dict[str, list[dict]] = {}
    for r in incomplete:
        by_status.setdefault(r["baseline_status"], []).append(r)
    parts = []
    for status, group in by_status.items():
        names = ", ".join(_subject_label(r) for r in group[:max_named])
        more = len(group) - max_named
        parts.append(
            f"{len(group)} {status} ({described.get(status, '')}): {names}"
            + (f" and {more} more" if more > 0 else "")
        )
    return "; ".join(parts)


def _rank_compared(compared: list[dict], mode: str, top_n: Optional[int],
                   max_named: int) -> tuple[list[dict], dict]:
    """
    Rank matched comparison rows by CHANGE, deterministically, after both
    windows have been matched per subject. Pure. Returns (rows, not_ranked).

    THE NULLS ARE THE POINT. A row whose change is null — no_current (traded
    in the baseline, not now) or no_baseline (new this window) — has nothing
    to rank by, and a null sorting first or last by accident would put a
    product that simply did not trade at the top of "biggest drop". So only
    rows with a numeric change are ranked (ok, and zero_baseline, whose change
    is the whole current value — a real gain from nothing). The rest are
    counted by status and the largest of them named: by baseline for
    no_current, by value for no_baseline. Definitions in metrics.yaml
    comparisons.<kind>.rank_by.modes; the order strings there are what this
    implements.
    """
    ranked = [r for r in compared if r.get("change") is not None]
    if mode == "biggest_drop":
        # Most negative first; ties broken by the larger baseline, so a drop
        # from more money ranks ahead of the same drop from less.
        ranked.sort(key=lambda r: (r["change"], -(r.get("baseline") or 0)))
    elif mode == "biggest_gain":
        ranked.sort(key=lambda r: (-r["change"], -(r.get("value") or 0)))
    else:
        raise ValueError(f"Unknown change ranking {mode!r}.")

    unranked = [r for r in compared if r.get("change") is None]
    counts: dict[str, int] = {}
    for r in unranked:
        counts[r["baseline_status"]] = counts.get(r["baseline_status"], 0) + 1
    no_current = sorted((r for r in unranked if r["baseline_status"] == "no_current"),
                        key=lambda r: -(r.get("baseline") or 0))
    no_baseline = sorted((r for r in unranked if r["baseline_status"] == "no_baseline"),
                         key=lambda r: -(r.get("value") or 0))
    not_ranked = {
        "counts": counts,
        "note": (
            "Subjects with no numeric change are not ranked by change. "
            "no_current traded in the baseline and not in this window (named "
            "largest baseline first); no_baseline is new this window (named "
            "largest value first). Their change_pct is null and must not be "
            "filled in."
        ),
        "no_current": [
            {"subject": _subject_label(r), "baseline": r.get("baseline"), "unit": r.get("unit")}
            for r in no_current[:max_named]
        ],
        "no_baseline": [
            {"subject": _subject_label(r), "value": r.get("value"), "unit": r.get("unit")}
            for r in no_baseline[:max_named]
        ],
        "ranked_subjects": len(ranked),
    }
    if top_n is not None:
        ranked = ranked[:top_n]
    return ranked, not_ranked


def get_sales(
    group_by: Any,
    date_range: Any,
    filters: Optional[dict] = None,
    metric: str = "net_sales",
    top_n: Optional[int] = None,
    compare_to: Optional[str] = None,
    rank_by: Optional[str] = None,
) -> dict:
    """
    Sales figures grouped as requested.

    Args:
        group_by:   str or list of: store, hour, day, week, month, product,
                    category. [] gives a grand total. `hour` is the hour of
                    the day (0-23, Manila) summed across every day in the
                    window — "when does the day sell" — and is never
                    compared, because thirty days by hour is one set of
                    figures, not a series.
        date_range: a preset name from metrics.yaml (sales_day.presets), or an
                    explicit (start, end) pair of Manila calendar dates.
                    Half-open: [start, end). Required — an unbounded sales query
                    is never what is meant.
        filters:    optional dict, keys limited to store, sku, category, tag.
        metric:     net_sales, product_revenue, units_sold, transaction_count,
                    returns_value, average_transaction_value (net_sales over
                    transaction_count, computed here — never divide the two
                    yourself). "How did <store> do?" is net_sales,
                    transaction_count and average_transaction_value together,
                    each with the same date_range, filters and compare_to
                    (metrics.yaml metric_sets.sales_headline).
        top_n:      return only the N largest by the metric, ranked in SQL.
                    OVERRIDES chronological ordering for day/week/month, so
                    top_n=5 with group_by='day' gives the five biggest days.
                    meta.full_row_count reports the size of the whole set.
        compare_to: 'previous_period' adds a baseline to every row — the
                    equal-length window immediately before date_range, or for
                    a preset the period before it by its own calendar (last_week
                    against the week before, last_month against the month
                    before). Rows then carry value, baseline, change,
                    change_pct, direction and baseline_status, all computed
                    here; read change_pct, never derive it. With no grouping,
                    or grouped by a SUBJECT — store, product or category —
                    where the metric allows that grouping (product_revenue
                    or units_sold by product; never net_sales or ATP, which
                    are transaction grain). Never by day/week/month. Refused
                    on a window still in progress (this_week, this_month,
                    today): use the closed preset it names instead. To
                    explain a change in net_sales, read its drivers —
                    transaction_count and average_transaction_value — with
                    the same date_range, filters and compare_to (metrics.yaml
                    metrics.net_sales.drivers).
        rank_by:    with compare_to and top_n, which end to return:
                    'value' (default: largest current value, as top_n always
                    ranked), 'biggest_drop' (most negative change first) or
                    'biggest_gain' (most positive first). Ranked here, after
                    both windows are matched per subject, by absolute change
                    in the metric's unit — never by change_pct. Rows with no
                    numeric change (no_current, no_baseline) are not ranked
                    by change; meta.comparison.not_ranked counts and names
                    them. "Which products are driving the decline?" is
                    product_revenue, group_by='product', compare_to=
                    'previous_period', top_n, rank_by='biggest_drop'.

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
    metric_kind = _req(mdef, "kind")
    top_n = _validate_top_n(defs, top_n)

    # ---- comparison ------------------------------------------------------
    # Which baseline is a DEFINITION (metrics.yaml comparisons), so the kind
    # is looked up there and a kind the file lists as not supported is refused
    # with the file's own reason rather than approximated.
    cdef: Optional[dict] = None
    if compare_to is not None:
        comps = _req(defs, "comparisons")
        supported = {
            k: v for k, v in comps.items()
            if k != "not_supported" and isinstance(v, dict) and "applies_to" in v
        }
        if compare_to not in supported:
            reasons = comps.get("not_supported") or {}
            why = (reasons.get(compare_to) or {}).get("reason") if isinstance(reasons, dict) else None
            raise ValueError(
                f"Unknown compare_to {compare_to!r}. Supported: "
                f"{', '.join(sorted(supported))}."
                + (f" {compare_to!r} is deliberately not supported: {' '.join(why.split())}"
                   if why else "")
            )
        cdef = supported[compare_to]
        if "get_sales" not in _req(cdef, "applies_to"):
            raise ValueError(
                f"compare_to={compare_to!r} does not apply to get_sales "
                f"(metrics.yaml comparisons.{compare_to}.applies_to)."
            )

    # ---- rank_by ---------------------------------------------------------
    # Which end of a COMPARED result top_n returns. Its modes and its null
    # handling are definitions (comparisons.<kind>.rank_by), and the ranking
    # itself happens below, after both windows are matched — never by the
    # model over two lists.
    rank_mode: Optional[str] = None
    if rank_by is not None:
        if cdef is None:
            raise ValueError(
                f"rank_by={rank_by!r} needs compare_to: it ranks a comparison. "
                f"Without one, top_n already ranks by the current value."
            )
        modes = _req(cdef, "rank_by.modes")
        if rank_by not in modes:
            raise ValueError(
                f"Unknown rank_by {rank_by!r}. Valid: {', '.join(modes)}."
            )
        rank_mode = rank_by
    elif cdef is not None:
        rank_mode = _req(cdef, "rank_by.default")
    change_ranked = rank_mode is not None and rank_mode != "value"

    # ---- group_by --------------------------------------------------------
    if group_by is None:
        group_by = []
    elif isinstance(group_by, str):
        group_by = [group_by]
    group_by = list(group_by)

    if cdef is not None:
        allowed_with_comparison = set(_req(cdef, "valid_group_by"))
        lagged = [g for g in group_by if g not in allowed_with_comparison]
        if lagged:
            raise ValueError(
                f"compare_to={compare_to!r} cannot be grouped by "
                f"{', '.join(lagged)}: each bucket against its own predecessor "
                f"is a lag series, which is not built (metrics.yaml "
                f"comparisons.not_supported.per_bucket_lag). Group by "
                f"{', '.join(sorted(allowed_with_comparison))} or by nothing, "
                f"or drop compare_to and read the series as a chart."
            )

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
    # Without a comparison, a preset stays the SQL expression metrics.yaml
    # gives it, anchored on now() in the statement. With one, BOTH windows are
    # explicit Manila dates bound as parameters: a preset resolves through its
    # `relative` block against the Manila date read in the same transaction
    # (tools/windows.py), so the current window is exactly the one a backtest
    # would rebind the preset to, and the baseline is one preset-length
    # before it. One statement, two parameter sets — identical shape.
    baseline_meta: Optional[dict] = None
    base_win: dict[str, Any] = {}
    preset_to_compare: Optional[str] = None
    if cdef is None:
        start_sql, end_sql, win_params, window_meta = _resolve_window(defs, date_range)
    else:
        start_sql, end_sql = _EXPLICIT_START, _EXPLICIT_END
        if isinstance(date_range, str):
            # Refused HERE, before a connection is opened, when the preset is
            # unknown or still in progress. The dates come once today's Manila
            # date has been read.
            _windows.check_preset_comparable(defs, date_range)
            preset_to_compare = date_range
            win_params = {}
            window_meta = {"kind": "preset", "name": date_range,
                           "includes_partial_day": False}
        else:
            _, _, win_params, window_meta = _resolve_window(defs, date_range)
            b_start, b_end = _windows.previous_period_explicit(
                win_params["win_start"], win_params["win_end"]
            )
            base_win = {"win_start": b_start, "win_end": b_end}
            baseline_meta = {"kind": "explicit", "start": b_start.isoformat(),
                             "end": b_end.isoformat(),
                             "convention": "half-open [start, end)"}

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
            cur.execute(
                "SELECT now() AS read_at, "
                "       (now() AT TIME ZONE 'Asia/Manila')::date AS manila_today"
            )
            head = cur.fetchone()
            snapshot_timestamp = head["read_at"]

            # A preset resolves to Manila calendar dates HERE, with the same SQL
            # the query binds, and they go on the receipt. Without this the
            # model saw only the preset's name and had to derive the date of
            # "yesterday" itself — and wrote the wrong year. A date in an
            # answer must come from a tool result like any other number.
            if window_meta["kind"] == "preset" and preset_to_compare is None:
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

            # A compared preset: both windows from the preset's own calendar
            # definition, anchored on the Manila date this transaction read.
            if preset_to_compare is not None:
                (c_start, c_end), (b_start, b_end) = _windows.previous_period_preset(
                    defs, preset_to_compare, head["manila_today"]
                )
                window_meta.update(
                    start=c_start.isoformat(), end=c_end.isoformat(),
                    convention="half-open [start, end)",
                    resolved_against=head["manila_today"].isoformat(),
                )
                baseline_meta = {"kind": "preset", "name": preset_to_compare,
                                 "periods_back": 1,
                                 "start": b_start.isoformat(), "end": b_end.isoformat(),
                                 "convention": "half-open [start, end)"}
                win_params = {"win_start": c_start, "win_end": c_end}
                base_win = {"win_start": b_start, "win_end": b_end}
                params.update(win_params)

            if cdef is not None:
                filters_applied.append(
                    f"baseline: transaction_time >= {baseline_meta['start']} AND "
                    f"< {baseline_meta['end']} (Asia/Manila, half-open; "
                    f"{compare_to}, same metric, grouping, stores and guards)"
                    f"   # metrics.yaml: comparisons.{compare_to}"
                )
            # base_params IS BUILT WHERE IT IS USED, not here. It used to be
            # snapshotted at this line — before the SKU resolution below adds
            # `sku_product_ids` to `params` — so a compared read with a sku
            # filter bound the current window's parameter and not the
            # baseline's, and psycopg refused the statement outright:
            # "query parameter missing: sku_product_ids". Every
            # get_sales(filters={'sku': ...}, compare_to=...) raised, for a
            # VALID sku as much as an unknown one, so "how did Aji Mix do
            # against last week" could not be answered at all. Found
            # 2026-09-11 by tools/objects.py, which makes exactly that call
            # for a product. A snapshot of a dict that is still being built
            # is a bug waiting for the next parameter.

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
                            f"different products. They appear as separate rows, "
                            f"one per product."
                        ),
                        "guidance": (
                            "They are separate because group_by includes "
                            "'product'; their values must not be added together."
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
            # Hour of the day is not a series but it IS an order: the day runs
            # from opening to closing, and a ranking by value would scramble it.
            time_cols = [a for a, _ in select_terms if a in ("hour", "day", "week", "month")]
            if change_ranked:
                # A change ranking needs BOTH windows whole: the cut happens
                # after matching, in _rank_compared. top_n is not applied in
                # SQL here, and the ordering below is provisional.
                order_sql = "\nORDER BY value DESC NULLS LAST" if group_terms else ""
                ordering = _req(cdef, f"rank_by.modes.{rank_mode}.order")
            elif top_n is not None and group_terms:
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

            sql_body = (
                f"SELECT {select_sql}\n"
                f"FROM {from_sql}\n"
                f"WHERE {where_sql}"
                f"{group_sql}{order_sql}"
            )
            sql_top_n = None if change_ranked else top_n
            sql = f"{sql_body}\nLIMIT {sql_top_n or _MAX_ROWS}"

            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]

            # The baseline: THE SAME STATEMENT with the other window bound.
            # top_n ranks the current period; the baseline is read whole so
            # every ranked subject finds its counterpart.
            baseline_rows: list[dict] = []
            # Built HERE, after every filter has finished adding to `params` —
            # see the note where this used to live.
            base_params = {**params, **base_win}
            if cdef is not None:
                cur.execute(f"{sql_body}\nLIMIT {_MAX_ROWS}", base_params)
                baseline_rows = [dict(r) for r in cur.fetchall()]
                if change_ranked and (len(rows) >= _MAX_ROWS or len(baseline_rows) >= _MAX_ROWS):
                    # comparisons.<kind>.rank_by.whole_set_required: a ranking
                    # by change over a prefix of the subjects is a different
                    # and wrong ranking, so it is refused rather than served.
                    raise ValueError(
                        f"rank_by={rank_mode!r} needs every subject in both "
                        f"windows, and one window has at least {_MAX_ROWS} — the "
                        f"tool's row cap. Narrow the window, add a filter, or "
                        f"group by category instead of product."
                    )

            truncated = len(rows) == _MAX_ROWS
            # full_row_count costs a query, so only pay for it when the result
            # was actually limited. When it was not, what came back IS the set.
            if truncated or (sql_top_n is not None and len(rows) == sql_top_n):
                cur.execute(
                    f"SELECT COUNT(*) AS n FROM (\n"
                    f"SELECT 1 FROM {from_sql}\nWHERE {where_sql}{group_sql}\n) x",
                    params,
                )
                full_row_count = cur.fetchone()["n"]
            else:
                full_row_count = len(rows)

            # ---- reconciliation ------------------------------------------
            # Over the current window, and over the baseline too when there is
            # one: a comparison whose baseline month is one of the divergent
            # 2024 windows must say so about THAT window.
            recon = _reconcile(cur, defs, metric, filters, where_sql, params, notices,
                               window_label="current" if cdef is not None else None)
            baseline_recon: Optional[dict] = None
            if cdef is not None:
                baseline_recon = _reconcile(cur, defs, metric, filters, where_sql,
                                            base_params, notices, window_label="baseline")

            # ---- derived-metric diagnostics ------------------------------
            # A ratio is only as honest as its denominator, so a derived
            # metric reports what its definition says to report about it
            # (metrics.yaml metrics.<id>.diagnostics) — for ATP, how many of
            # the transactions in the window were zero-total baskets. A
            # diagnostic is inspectable context, not a caveat: it goes in
            # meta, never in a notice.
            diagnostics: dict[str, Any] = {}
            for dname, dref in (mdef.get("diagnostics") or {}).items():
                dsql = f"SELECT {_req(defs, dref)} AS n\nFROM {from_sql}\nWHERE {where_sql}"
                cur.execute(dsql, params)
                diagnostics[dname] = cur.fetchone()["n"]
                if cdef is not None:
                    cur.execute(dsql, base_params)
                    diagnostics[f"baseline_{dname}"] = cur.fetchone()["n"]

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
    for r in rows + baseline_rows:
        if "store_id" in r:
            r["store"] = _label_store(catalog, r["store_id"])
        if isinstance(r.get("value"), Decimal):
            r["value"] = float(r["value"])
        for k in ("day", "week", "month"):
            if isinstance(r.get(k), date):
                r[k] = r[k].isoformat()

    # ---- the comparison, row by row --------------------------------------
    comparison_meta: Optional[dict] = None
    not_ranked_meta: Optional[dict] = None
    if cdef is not None:
        key_fields = [alias for alias, _ in select_terms]
        label_fields = key_fields + (["store"] if "store_id" in key_fields else [])
        # Under a VALUE ranking top_n already cut the current period in SQL,
        # so a subject absent from it was cut by the rank (ranked=True). Under
        # a CHANGE ranking both windows are whole, every subject is matched,
        # and the cut happens after — in _rank_compared, below.
        compared = _compare_rows(rows, baseline_rows, key_fields, label_fields,
                                 _req(mdef, "unit"), cdef,
                                 ranked=(sql_top_n is not None))
        statuses: dict[str, int] = {}
        for r in compared:
            statuses[r["baseline_status"]] = statuses.get(r["baseline_status"], 0) + 1
        # The notice is computed over the WHOLE matched set, before any
        # change-ranking cut: a product that vanished is reported whether or
        # not it survived the ranking, and it never survives one by change.
        incomplete = [r for r in compared if r["baseline_status"] != "ok"]
        if incomplete:
            described = _req(cdef, "baseline_statuses")
            notices.append({
                "kind": "comparison_incomplete",
                "message": (
                    f"{len(incomplete)} of {len(compared)} compared row(s) could not be "
                    f"compared against the {baseline_meta['start']} to "
                    f"{baseline_meta['end']} baseline: "
                    + _describe_incomplete(
                        incomplete, described,
                        int(_req(cdef, "incomplete_notice_max_named")),
                    )
                    + "."
                ),
                "guidance": (
                    "Say which, and why, rather than reporting the comparison as "
                    "whole; change_pct is null on those rows and must not be "
                    "filled in."
                ),
                "source": f"definitions/metrics.yaml: comparisons.{compare_to}.baseline_statuses",
            })
        if change_ranked:
            rows, not_ranked_meta = _rank_compared(
                compared, rank_mode, top_n,
                int(_req(cdef, "rank_by.not_ranked_max_named")),
            )
            # The set is every matched subject; the rows are the ranked cut.
            full_row_count = len(compared)
        else:
            rows = compared
        comparison_meta = {
            "kind": compare_to,
            "display_name": _req(cdef, "display_name"),
            "method": (_req(cdef, "preset_window") if preset_to_compare
                       else _req(cdef, "explicit_window")),
            "current": {"start": window_meta["start"], "end": window_meta["end"]},
            "baseline": dict(baseline_meta),
            "same_population": True,
            "change_pct_formula": _req(cdef, "change_pct_formula"),
            "baseline_statuses": statuses,
            "row_count_baseline": len(baseline_rows),
            # Which ranking applied, and how the rows were cut. Under `value`
            # top_n ranks the CURRENT period in SQL: subjects outside the
            # ranking are not compared at all — not reported as absent —
            # because they were cut by the rank, not missing from trade. Under
            # a change mode both windows are whole, every subject is matched,
            # and only rows with a numeric change are ranked (rank_by.modes).
            "rank_by": rank_mode,
            "ranked_by_current": sql_top_n is not None,
            "ranking_note": (
                f"top_n={top_n} ranked the current period; only those {top_n} "
                f"subjects are compared, and a subject outside them is not "
                f"absent from trade — it was not ranked."
                if sql_top_n is not None else
                f"rank_by={rank_mode!r}: every subject in both windows was "
                f"matched, then rows with a numeric change were ranked by change "
                f"and cut to top_n={top_n}. Subjects with no numeric change are "
                f"in not_ranked, never in the ranking."
                if change_ranked else None
            ),
            "source": f"definitions/metrics.yaml: comparisons.{compare_to}",
        }
        if not_ranked_meta is not None:
            comparison_meta["not_ranked"] = not_ranked_meta

    # A derived ratio over a window with no qualifying transactions is NULL,
    # and the answer has to say "undefined", not "zero" — the legacy analytics
    # code returned 0 here, and that is exactly the number this notice exists
    # to keep out of an answer. Grouped rows never trigger it (an empty bucket
    # is absent, not NULL); the grand total does.
    if metric_kind == "derived" and any(r.get("value") is None for r in rows):
        # The kind is a literal so tests/test_notice_fingerprints can see it;
        # the yaml names the same kind on the metric, and the contract test
        # holds the two together.
        assert _req(mdef, "undefined_notice_kind") == "ratio_undefined"
        notices.append({
            "kind": "ratio_undefined",
            "message": (
                f"{_req(mdef, 'display_name')} is undefined for this window: "
                f"there were no qualifying transactions, so the denominator "
                f"({_req(mdef, 'formula.denominator')}) is zero. The value is "
                f"reported as null, not as zero — nothing was sold, and nothing "
                f"was averaged."
            ),
            "source": f"definitions/metrics.yaml: metrics.{metric}.undefined_when",
        })

    meta: dict[str, Any] = {
        "source_table": source_table,
        "metric": metric,
        "metric_sql": metric_sql,
        "metric_unit": _req(mdef, "unit"),
        "metric_grain": grain,
        # The metric model (metrics.yaml metric_model): what this figure IS,
        # said in the receipt rather than left to the model to infer from a
        # key name. A derived metric also names what it is made of.
        "metric_kind": metric_kind,
        "metric_label": _req(mdef, "display_name"),
        "metric_domain": _req(mdef, "domain"),
        # What the DEFINITIONS say may be asked next of this metric, so a
        # surface can offer "by store" or "why?" only where a follow-up is
        # valid — read from metrics.yaml here, never decided by a client and
        # never by the model (UI System V2, contextual actions).
        "valid_group_by": list(_req(mdef, "valid_group_by")),
        "drivers": list((mdef.get("drivers") or {}).get("components") or []),
        "top_n": top_n,
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
    if metric_kind == "derived":
        meta["metric_formula"] = dict(_req(mdef, "formula"))
        meta.update(diagnostics)
    if comparison_meta is not None:
        meta["comparison"] = comparison_meta
        meta["baseline_reconciliation"] = baseline_recon
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
