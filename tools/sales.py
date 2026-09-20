"""
Bob — sales tool.

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

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional, Sequence


from . import windows as _windows
from ._common import (
    DICT_ROW,
    validate_top_n as _validate_top_n,
    DEFAULT_MAX_ROWS as _MAX_ROWS,
    DEFS_PATH as _DEFS_PATH,
    LEFT_OUT as _LEFT_OUT,
    connect as _connect,
    left_out as _left_out,
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


def _bound(param: str) -> str:
    """The same Manila-date bound as _EXPLICIT_START, on a parameter of its own."""
    return _EXPLICIT_START.replace("win_start", param)

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


def _denominator_label(defs: dict, mdef: dict) -> str:
    """
    A ratio's denominator in the reader's words.

    The formula names another METRIC — `transaction_count` — and that key was
    reaching a notice message, which is text a person reads above the figure it
    qualifies (UI rule 4). The metric already carries a display name for
    exactly this; the key is kept only when there is none, because a notice
    that cannot name its denominator at all would be worse than one naming it
    awkwardly.
    """
    key = str(_req(mdef, "formula.denominator"))
    other = (_req(defs, "metrics") or {}).get(key) or {}
    return str(other.get("display_name") or key).lower()


def _reconcile(cur, defs: dict, metric: str, filters: dict, where_sql: str,
               params: dict, notices: list[dict], window_label: Optional[str],
               left_out_applied: bool = False) -> dict:
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
                "product_revenue for the same period."
            ),
        }
    if left_out_applied:
        # The same reason in a person's words: a category left out at their
        # instruction is a product-level filter too (P2S.11).
        return {
            "applicable": False,
            "reason": (
                "a category is left out at the person's instruction, so these "
                "rows do not cover the whole till and are not comparable to "
                "net_sales for the same period."
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
        which = f"{window_label}" if window_label else "this period"
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
            + " Store-level and product-level totals here "
            "are NOT comparable — do not present them side by side "
            "as though they sum to the same thing."
        )
        notices.append({
            "kind": "reconciliation_failed",
            "message": recon["note"],
            "source": "tools/sales.py reconciliation",
        })
    return recon


def _bucket_index(bucket: str, when: date, start: date) -> Optional[int]:
    """
    How many BUCKETS `when` sits after the bucket the window starts in.

    IN BUCKETS, NOT DAYS, and that distinction is the whole of it. A bucket's
    date is truncated to its own boundary — a week to its Monday, a month to
    its first — so the number of DAYS between a truncated bucket and an
    arbitrary window start depends on where inside its bucket the window began.
    Two windows of the same length that start on different weekdays then
    produce different day-offsets for the same position, and nothing matches.

    Found the first time the fixed tool was used in anger, on `last_30_days`
    grouped by week: 10 of 10 rows came back uncomparable, which is the exact
    failure the fix existed to remove.
    """
    if bucket == "day":
        return (when - start).days
    if bucket == "week":
        # Both truncated to their own Monday, then counted in weeks.
        return ((when - timedelta(days=when.weekday()))
                - (start - timedelta(days=start.weekday()))).days // 7
    if bucket == "month":
        return (when.year - start.year) * 12 + (when.month - start.month)
    return None


def _offset_rows(rows: list[dict], bucket: str, window_start) -> None:
    """
    Stamp each row with its bucket's offset from its own window's start, as the
    key the two windows are matched on (comparisons.previous_period.time_bucket_alignment).

    Pure bookkeeping: `_offset` is a POSITION, never a figure — nothing is
    derived from it and it is dropped before the rows are returned. A row whose
    bucket did not parse simply gets none and falls through as unmatched, which
    is what an unmatched bucket is.
    """
    start = window_start.date() if hasattr(window_start, "date") else window_start
    for r in rows:
        got = r.get(bucket)
        if isinstance(got, str):
            try:
                got = date.fromisoformat(got)
            except ValueError:
                got = None
        r["_offset"] = _bucket_index(bucket, got, start) if isinstance(got, date) else None


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
                  ranked: bool = False, bucket: Optional[str] = None) -> list[dict]:
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

    def made(c: Optional[dict], b: Optional[dict]) -> dict:
        row = _compare_row(c, b, label_fields, unit, cdef)
        # WHICH BUCKET IT WAS MEASURED AGAINST, by its own date. A row saying
        # "Monday 7 Sep, down against 31 Aug" can be checked; one saying only
        # "down" cannot, and the offset that matched them is a position, not a
        # date anybody can look up (comparisons.previous_period.time_bucket_alignment).
        if bucket is not None:
            row[f"baseline_{bucket}"] = (b or {}).get(bucket)
        row.pop("_offset", None)
        return row

    for c in current:
        k = key(c)
        seen.add(k)
        out.append(made(c, by_key.get(k)))
    if not ranked:
        for b in baseline:
            if key(b) not in seen:
                seen.add(key(b))
                out.append(made(None, b))
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


# ---------------------------------------------------------------------------
# SAME STORE — which shops a comparison a year apart counts (P2S.4)
#
# metrics.yaml same_store holds the rule and every reason a shop is left out;
# this is the arithmetic on it. Split in two so the rule is testable with no
# database: _same_store_split judges trading dates it is handed, and
# _same_store reads those dates in ONE statement and builds the receipt.
# ---------------------------------------------------------------------------

def _same_store_split(
    defs: dict,
    candidates: Sequence[str],
    labels: dict[str, str],
    trading: dict[str, dict],
    current: tuple[date, date],
    baseline: tuple[date, date],
) -> tuple[list[str], list[dict]]:
    """
    (counted ids, excluded entries) under metrics.yaml same_store.

    `trading[sid]` carries first_sale and last_sale (Manila dates, over the
    whole record) and baseline_sales / current_sales (counts in each window);
    a candidate with no entry never traded. Windows are half-open [start,
    end) of dates. Reasons are tested in the file's order and the first that
    applies is the one given; a shop is either counted or excluded, never
    neither.
    """
    reasons = _req(defs, "same_store.exclusion_reasons")
    b_start, b_end = baseline
    c_start, c_end = current
    dates = {
        "baseline_start": b_start.isoformat(),
        "baseline_last_day": (b_end - timedelta(days=1)).isoformat(),
        "current_start": c_start.isoformat(),
        "current_last_day": (c_end - timedelta(days=1)).isoformat(),
    }
    counted: list[str] = []
    excluded: list[dict] = []
    for sid in candidates:
        t = trading.get(sid)
        if not t or t.get("first_sale") is None:
            code = "never_traded"
        elif t["first_sale"] > b_start:
            code = "first_sale_after_start"
        elif t["last_sale"] < c_end - timedelta(days=1):
            code = "last_sale_before_end"
        elif not t.get("baseline_sales"):
            code = "no_sale_in_baseline"
        elif not t.get("current_sales"):
            code = "no_sale_in_current"
        else:
            counted.append(sid)
            continue
        first = t["first_sale"].isoformat() if t and t.get("first_sale") else None
        last = t["last_sale"].isoformat() if t and t.get("last_sale") else None
        excluded.append({
            "store": labels.get(sid, sid),
            "store_id": sid,
            "reason": code,
            "why": _req(reasons, code).format(first_sale=first, last_sale=last, **dates),
            "first_sale_on_record": first,
            "last_sale_on_record": last,
        })
    return counted, excluded


def _record_days(current: tuple[date, date], baseline: tuple[date, date],
                 recorded: dict[str, int]) -> dict:
    """
    How much of each window the sales record covers (same_store.record):
    `recorded[window]` is the number of days on which any shop in the
    estate recorded a sale. A day with none is silent — shut, or missing
    from the record; the record cannot say which.
    """
    out = {}
    for name, (start, end) in (("baseline", baseline), ("current", current)):
        days = (end - start).days
        with_sale = int(recorded.get(name) or 0)
        out[name] = {
            "start": start.isoformat(),
            "last_day": (end - timedelta(days=1)).isoformat(),
            "days": days,
            "days_with_a_sale": with_sale,
            "silent_days": days - with_sale,
        }
    return out


def _same_store(
    cur,
    defs: dict,
    store_ids: Sequence[str],
    catalog: dict[str, dict],
    *,
    unfiltered: bool,
    current: tuple[date, date],
    baseline: tuple[date, date],
) -> dict:
    """
    Judge the shops for a same_store comparison, in the caller's transaction.

    Candidates are the shops the read covers and, when no shop was named,
    the closed shops of the kind the rule judges (same_store.candidates) —
    so a shop that traded last year and has since shut is named as left out
    rather than never mentioned. A counted closed shop joins `catalog` so its
    rows carry its name. Refuses when no shop is counted
    (same_store.none_counted): a comparison over no shops is not one.
    """
    rule = _req(defs, "same_store")
    cand_rule = _req(rule, "candidates")
    candidates = list(store_ids)
    judged = {sid: dict(catalog[sid]) for sid in store_ids if sid in catalog}
    if unfiltered and cand_rule.get("plus_closed_when_unfiltered"):
        for entry in _req(defs, "stores.closed"):
            if entry.get("kind") == _req(cand_rule, "closed_kind") and entry["id"] not in judged:
                candidates.append(entry["id"])
                judged[entry["id"]] = dict(entry)
    labels = {sid: _label_store(judged, sid) for sid in candidates}

    guards = " AND ".join(_req(defs, ref) for ref in _req(rule, "trading_guards"))
    windows_params = {"ss_b_start": baseline[0], "ss_b_end": baseline[1],
                      "ss_c_start": current[0], "ss_c_end": current[1]}
    in_baseline = f"t.transaction_time >= {_bound('ss_b_start')} AND t.transaction_time < {_bound('ss_b_end')}"
    in_current = f"t.transaction_time >= {_bound('ss_c_start')} AND t.transaction_time < {_bound('ss_c_end')}"

    # THE RECORD FIRST (same_store.record): on how many days of each window
    # did ANY shop in the estate record a sale? Whatever shop was asked
    # about, silence across the whole estate is the record's, not a shop's.
    estate_ids = [s["id"] for s in _req(defs, "stores.active_retail")] + [
        e["id"] for e in _req(defs, "stores.closed")
        if e.get("kind") == _req(cand_rule, "closed_kind")
    ]
    cur.execute(
        f"""
        SELECT count(DISTINCT d) FILTER (WHERE in_b) AS baseline,
               count(DISTINCT d) FILTER (WHERE in_c) AS current
        FROM (
          SELECT (t.transaction_time AT TIME ZONE 'Asia/Manila')::date AS d,
                 ({in_baseline}) AS in_b, ({in_current}) AS in_c
          FROM new_transactions t
          WHERE {guards}
            AND t.store_id = ANY(%(ss_estate)s)
            AND (({in_baseline}) OR ({in_current}))
        ) x
        """,
        {**windows_params, "ss_estate": estate_ids},
    )
    record = _record_days(current, baseline, dict(cur.fetchone()))
    record_rule = _req(rule, "record")
    for name, which in (("baseline", "earlier"), ("current", "later")):
        w = record[name]
        if w["days_with_a_sale"] == 0:
            raise ValueError(
                f"The sales record holds no sale from any shop between "
                f"{w['start']} and {w['last_day']} (the {which} window), so "
                f"there is nothing to compare a year apart — those days are "
                f"missing from the record or every shop was shut, and the "
                f"record cannot say which. (metrics.yaml: same_store.record)"
            )
    notices: list[dict] = []
    silent = [(which, record[name]) for name, which in
              (("baseline", "earlier"), ("current", "later"))
              if record[name]["silent_days"]]
    if silent:
        # A literal so tests/test_notice_fingerprints can see it; the yaml
        # names the same kind, and this holds the two together.
        assert _req(record_rule, "silent_days_notice_kind") == "sales_record_silent_days"
        notices.append({
            "kind": "sales_record_silent_days",
            "message": (
                "The sales record has no sale from any shop on "
                + "; and on ".join(
                    f"{w['silent_days']} of the {w['days']} days from {w['start']} "
                    f"to {w['last_day']}" for _, w in silent)
                + ". Those days are either days every shop was shut or sales "
                "missing from the record, and the record does not tell them apart — if "
                "they are missing, this comparison is wrong by what they held."
            ),
            "guidance": (
                "Say how many days of which period have no recorded sales, and "
                "that the change may be the gap rather than trade. Never "
                "estimate what the missing days held."
            ),
            "source": "definitions/metrics.yaml: same_store.record",
        })

    cur.execute(
        f"""
        SELECT t.store_id,
               (min(t.transaction_time) AT TIME ZONE 'Asia/Manila')::date AS first_sale,
               (max(t.transaction_time) AT TIME ZONE 'Asia/Manila')::date AS last_sale,
               count(*) FILTER (WHERE t.transaction_time >= {_bound('ss_b_start')}
                                  AND t.transaction_time <  {_bound('ss_b_end')}) AS baseline_sales,
               count(*) FILTER (WHERE t.transaction_time >= {_bound('ss_c_start')}
                                  AND t.transaction_time <  {_bound('ss_c_end')}) AS current_sales
        FROM new_transactions t
        WHERE {guards}
          AND t.store_id = ANY(%(ss_candidates)s)
        GROUP BY t.store_id
        """,
        {**windows_params, "ss_candidates": candidates},
    )
    trading = {r["store_id"]: dict(r) for r in cur.fetchall()}
    counted, excluded = _same_store_split(defs, candidates, labels, trading,
                                          current, baseline)
    left_out = "; ".join(f"{x['store']} ({x['why']})" for x in excluded)
    if not counted:
        raise ValueError(
            "No shop traded through both windows, so there is nothing to "
            f"compare a year apart: {left_out}. (metrics.yaml: same_store)"
        )
    for sid in counted:
        catalog.setdefault(sid, judged[sid])
    names = ", ".join(labels[s] for s in counted)
    rule_text = " ".join(_req(rule, "rule").split())
    return {
        "rule": rule_text,
        "confirmed_by_owner": bool(rule.get("confirmed_by_owner")),
        "counted": [labels[s] for s in counted],
        "counted_ids": counted,
        "excluded": excluded,
        "judged": len(candidates),
        "record": record,
        "source": "definitions/metrics.yaml: same_store",
        "filters_applied": (
            f"t.store_id IN ({len(counted)}: {names}) — the shops that traded "
            f"through both windows"
            + (f"; left out: {left_out}" if excluded else "")
            + "   # metrics.yaml: same_store (of stores.active_retail"
            + (" and stores.closed" if len(candidates) > len(store_ids) else "")
            + ")"
        ),
        "notices": notices + ([{
            "kind": "same_store_scope",
            "message": (
                f"Same-store figure: it counts the {len(counted)} shop"
                f"{'' if len(counted) == 1 else 's'} that traded through both "
                f"periods ({names}). Left out: {left_out}."
            ),
            "guidance": (
                "Say the figure is same-store and name the shops left out and "
                "why; never present it as the whole estate."
            ),
            "source": "definitions/metrics.yaml: same_store",
        }] if excluded else []),
    }


def get_sales(
    group_by: Any,
    date_range: Any,
    filters: Optional[dict] = None,
    metric: str = "net_sales",
    top_n: Optional[int] = None,
    compare_to: Optional[str] = None,
    rank_by: Optional[str] = None,
    *,
    left_out: Any = None,
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
                    transaction_count and average_transaction_value together:
                    metric='sales_headline' reads all three in ONE call, with
                    one date_range, filters and compare_to, and answers with
                    the three results side by side, each with its own
                    call_seq (metrics.yaml metric_sets.sales_headline).
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
                    today) — for those use 'to_date_same_elapsed': the period
                    so far against the same elapsed portion of the period
                    before (Monday to now against last Monday to the same
                    weekday and hour; today against the same weekday last
                    week to this hour), with meta.comparison.elapsed saying
                    how much of the period the figure covers. "How is this
                    week going?" is this_week + 'to_date_same_elapsed'.
                    'same_weekday_last_week' is a closed day or explicit
                    window against the same days a week earlier — the
                    comparison the morning brief makes, for any day.
                    'same_period_last_year' is a closed window against the
                    same calendar dates a year earlier ("last December against
                    the year before" is 2025-12-01..2026-01-01), counting only
                    the shops that traded through both (same-store): the
                    shops left out, and why, are in meta.comparison.same_store
                    and must be named. To
                    explain a change in net_sales, read its drivers —
                    transaction_count and average_transaction_value — with
                    the same date_range, filters and compare_to (metrics.yaml
                    metrics.net_sales.drivers); metric='sales_headline' reads
                    net_sales and both drivers in one call.
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

    `left_out` is not the model's: it is the categories a person told Bob
    to leave out (metrics.yaml settings.declared.left_out_categories),
    supplied by the loop. Grouped by product or category they are left out
    and meta.filters_applied says so; any other grouping is a total and is
    untouched, with meta.settings saying why.
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
        # A mode may INHERIT another: row fields, statuses, arithmetic and
        # ranking come from the parent and only the window rule is its own
        # (comparisons.<kind>.inherits). Merged here, once, so nothing
        # below has to know which mode it is reading.
        parent = cdef.get("inherits")
        if parent:
            if parent not in supported:
                raise RuntimeError(
                    f"metrics.yaml comparisons.{compare_to}.inherits names "
                    f"{parent!r}, which is not a supported comparison."
                )
            cdef = {**supported[parent], **cdef}
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
        # A SUBJECT IS MATCHED ON ITS KEY; A TIME BUCKET ON ITS OFFSET (2026-09-20).
        #
        # Until today every time bucket was refused here, with the reason "each
        # bucket against its own predecessor is a lag series". That is not what
        # would have happened: `_compare_rows` matches the two windows on the
        # GROUP KEY, and for a bucket that key is the date — which the two
        # windows never share, so every row would have come back no_baseline.
        # The refusal was covering a broken join and calling it a decision.
        # Matched on the offset from each window's own start, the first day of
        # one window meets the first day of the other, which over two calendar
        # weeks is Monday against Monday.
        allowed_with_comparison = set(_req(cdef, "valid_group_by"))
        aligned_buckets = set(cdef.get("valid_time_buckets") or [])
        unmatched = [g for g in group_by
                     if g not in allowed_with_comparison and g not in aligned_buckets]
        if unmatched:
            raise ValueError(
                f"compare_to={compare_to!r} cannot be grouped by "
                f"{', '.join(unmatched)}: there is nothing to match the two "
                f"windows on — a subject is matched on its key and a time "
                f"bucket on its offset from its window's start, and this is "
                f"neither (metrics.yaml comparisons.previous_period.valid_group_by and "
                f".valid_time_buckets). Group by "
                f"{', '.join(sorted(allowed_with_comparison | aligned_buckets))} "
                f"or by nothing, or drop compare_to and read the series as a chart."
            )
        aligned_on = [g for g in group_by if g in aligned_buckets]
        if len(aligned_on) > 1:
            raise ValueError(
                f"compare_to={compare_to!r} takes at most one time bucket; "
                f"{', '.join(aligned_on)} were given, and two offsets cannot "
                f"both key the match."
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
    # The warehouse refuses in its own words, not as a missing shop.
    store_ids = _resolve_store_in(
        filters.get("store"), catalog, defs,
        out_of_scope_reason=_req(defs, "sales_scope.warehouse_excluded_reason"),
    )

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
    # WHICH WINDOW RULE. previous_period shifts back by the window's own
    # length; same_weekday_last_week shifts back by the days the brief
    # measured; to_date_same_elapsed reads the period so far against the
    # same elapsed portion of the period before. Each is a definition
    # (comparisons.<kind>.window_rule) and the arithmetic is tools/windows.py.
    window_rule = (cdef or {}).get("window_rule") or "previous_period"
    elapsed_rule = window_rule == "same_elapsed_portion_of_the_period_before"
    day_shift_rule = window_rule == "shift_back_by_days"
    year_rule = window_rule == "shift_back_by_years"
    elapsed_meta: Optional[dict] = None
    if cdef is None:
        start_sql, end_sql, win_params, window_meta = _resolve_window(defs, date_range)
    else:
        start_sql, end_sql = _EXPLICIT_START, _EXPLICIT_END
        if isinstance(date_range, str):
            # Refused HERE, before a connection is opened, when the preset is
            # unknown, or still in progress for a whole-window rule, or
            # closed for the elapsed rule. The dates come once today's
            # Manila date has been read.
            if elapsed_rule:
                _windows.check_preset_in_progress(defs, date_range)
            else:
                _windows.check_preset_comparable(defs, date_range)
            preset_to_compare = date_range
            win_params = {}
            window_meta = {"kind": "preset", "name": date_range,
                           "includes_partial_day": elapsed_rule}
        else:
            if elapsed_rule:
                raise ValueError(
                    f"compare_to={compare_to!r} reads a period still in progress "
                    f"(today, this_week, this_month, this_year); an explicit "
                    f"window is closed. Use compare_to='previous_period' or "
                    f"'same_weekday_last_week' on it."
                )
            _, _, win_params, window_meta = _resolve_window(defs, date_range)
            if day_shift_rule:
                offset = int(_req(defs, _req(cdef, "offset_days")))
                b_start, b_end = _windows.shifted_back_by_days(
                    win_params["win_start"], win_params["win_end"], offset
                )
            elif year_rule:
                b_start, b_end = _windows.shifted_back_by_years(
                    win_params["win_start"], win_params["win_end"],
                    int(_req(cdef, "years_back")),
                )
            else:
                b_start, b_end = _windows.previous_period_explicit(
                    win_params["win_start"], win_params["win_end"]
                )
            base_win = {"win_start": b_start, "win_end": b_end}
            baseline_meta = {"kind": "explicit", "start": b_start.isoformat(),
                             "end": b_end.isoformat(),
                             "convention": "half-open [start, end)"}
            if day_shift_rule:
                baseline_meta["shifted_back_days"] = offset
            if year_rule:
                baseline_meta["shifted_back_years"] = int(_req(cdef, "years_back"))

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

    # Which line of the receipt names the shops: same_store narrows them and
    # rewrites that line rather than leaving one that is no longer true.
    _scope_statement = 2
    same_store_meta: Optional[dict] = None
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
    assert "stores.active_retail" in filters_applied[_scope_statement]
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
        # Resolved to the catalogue's spelling once the connection is open
        # (tools/products.resolve_category, P2S.7).
        category_statement = len(filters_applied)
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

    # ---- what a person said to leave out (P2S.11) -------------------------
    # Only a LIST of products or categories: every such grouping has the
    # products table joined already (needs_products above), and a total —
    # a shop, a day, the estate — is the till's figure and stays whole.
    left = _left_out(
        defs, left_out,
        lists=bool(_PRODUCT_GROUPINGS & set(group_by)),
        asked_category=filters.get("category"),
        names_product=bool({"sku", "product_id"} & set(filters)),
    )
    if left["predicate"]:
        predicates.append(left["predicate"])
        params.update(left["params"])
    filters_applied.extend(left["filters_applied"])

    metric_sql = _req(mdef, "sql")

    # ---- execute ---------------------------------------------------------
    with _connect() as conn:
        with conn.cursor(row_factory=DICT_ROW) as cur:
            cur.execute(
                "SELECT now() AS read_at, "
                "       (now() AT TIME ZONE 'Asia/Manila')::date AS manila_today, "
                "       (now() AT TIME ZONE 'Asia/Manila')       AS manila_now"
            )
            head = cur.fetchone()
            snapshot_timestamp = head["read_at"]

            # THE CATEGORY AS THE CATALOGUE SPELLS IT (P2S.7): "TRADSNAX" is
            # tradsnax, and a category that does not exist is refused with
            # every one named, rather than read as a week of no sales.
            if "category" in filters:
                from .products import resolve_category
                spelled_as, spelled = resolve_category(cur, defs, filters["category"])
                if spelled_as != params["category"]:
                    params["category"] = spelled_as
                    filters_applied[category_statement] = (
                        f"{_req(defs, 'products.category_normalization.sql')} = {spelled_as!r}"
                        f"   # metrics.yaml: products.category_normalization ({spelled})"
                    )

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
                if elapsed_rule:
                    # The period so far, to the minute, against the same
                    # elapsed portion of the period before. Timestamps, not
                    # dates: "now" has an hour.
                    day_offset = int(_req(defs, _req(cdef, "day_baseline_offset")))
                    (c_start, c_end), (b_start, b_end), elapsed_meta = _windows.same_elapsed(
                        defs, preset_to_compare, head["manila_now"], day_offset
                    )
                    baseline_meta = {"kind": "preset", "name": preset_to_compare,
                                     "periods_back": 1, "same_elapsed_portion": True,
                                     "start": b_start.isoformat(sep=" "),
                                     "end": b_end.isoformat(sep=" "),
                                     "convention": "half-open [start, end), Manila timestamps"}
                    if elapsed_meta.get("day_baseline_offset_days"):
                        baseline_meta["shifted_back_days"] = elapsed_meta["day_baseline_offset_days"]
                    window_meta.update(
                        start=c_start.isoformat(sep=" "), end=c_end.isoformat(sep=" "),
                        convention="half-open [start, end), Manila timestamps",
                        resolved_against=head["manila_now"].isoformat(sep=" "),
                    )
                elif year_rule:
                    # The preset's own window on today's Manila date, then
                    # both bounds a year back — last_month against the same
                    # month a year earlier.
                    years = int(_req(cdef, "years_back"))
                    c_iso = _windows.resolve_preset(defs, preset_to_compare, head["manila_today"])
                    c_start, c_end = date.fromisoformat(c_iso[0]), date.fromisoformat(c_iso[1])
                    b_start, b_end = _windows.shifted_back_by_years(c_start, c_end, years)
                    baseline_meta = {"kind": "preset", "name": preset_to_compare,
                                     "shifted_back_years": years,
                                     "start": b_start.isoformat(), "end": b_end.isoformat(),
                                     "convention": "half-open [start, end)"}
                    window_meta.update(
                        start=c_start.isoformat(), end=c_end.isoformat(),
                        convention="half-open [start, end)",
                        resolved_against=head["manila_today"].isoformat(),
                    )
                elif day_shift_rule:
                    offset = int(_req(defs, _req(cdef, "offset_days")))
                    c_iso = _windows.resolve_preset(defs, preset_to_compare, head["manila_today"])
                    c_start, c_end = date.fromisoformat(c_iso[0]), date.fromisoformat(c_iso[1])
                    b_start, b_end = _windows.shifted_back_by_days(c_start, c_end, offset)
                    baseline_meta = {"kind": "preset", "name": preset_to_compare,
                                     "shifted_back_days": offset,
                                     "start": b_start.isoformat(), "end": b_end.isoformat(),
                                     "convention": "half-open [start, end)"}
                    window_meta.update(
                        start=c_start.isoformat(), end=c_end.isoformat(),
                        convention="half-open [start, end)",
                        resolved_against=head["manila_today"].isoformat(),
                    )
                else:
                    (c_start, c_end), (b_start, b_end) = _windows.previous_period_preset(
                        defs, preset_to_compare, head["manila_today"]
                    )
                    baseline_meta = {"kind": "preset", "name": preset_to_compare,
                                     "periods_back": 1,
                                     "start": b_start.isoformat(), "end": b_end.isoformat(),
                                     "convention": "half-open [start, end)"}
                    window_meta.update(
                        start=c_start.isoformat(), end=c_end.isoformat(),
                        convention="half-open [start, end)",
                        resolved_against=head["manila_today"].isoformat(),
                    )
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

            # ---- same store (P2S.4) ----------------------------------------
            # A comparison a year apart counts only the shops that traded
            # through BOTH windows (metrics.yaml same_store). Judged here, in
            # the same transaction, before either window is read; the shops
            # it leaves out are named on the receipt with the dates that
            # decided it, and never silently dropped.
            if cdef is not None and cdef.get("population") == "same_store":
                same_store_meta = _same_store(
                    cur, defs, store_ids, catalog,
                    unfiltered=filters.get("store") is None,
                    current=(win_params["win_start"], win_params["win_end"]),
                    baseline=(base_win["win_start"], base_win["win_end"]),
                )
                params["store_ids"] = same_store_meta["counted_ids"]
                filters_applied[_scope_statement] = same_store_meta["filters_applied"]
                notices.extend(same_store_meta["notices"])
                same_store_meta = {k: v for k, v in same_store_meta.items()
                                   if k not in ("filters_applied", "notices")}
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
                               window_label="current" if cdef is not None else None,
                               left_out_applied=bool(left["predicate"]))
            baseline_recon: Optional[dict] = None
            if cdef is not None:
                baseline_recon = _reconcile(cur, defs, metric, filters, where_sql,
                                            base_params, notices, window_label="baseline",
                                            left_out_applied=bool(left["predicate"]))

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
                            f"{dq['orphan_line_items']} line item(s) here "
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
        # A TIME BUCKET IS MATCHED ON ITS OFFSET, NOT ITS DATE (2026-09-20,
        # comparisons.previous_period.time_bucket_alignment). The two windows hold
        # different dates by construction, so the date cannot be the key; the
        # bucket's position in its own window can, and over two calendar weeks
        # that is the same weekday. Computed here rather than in SQL because it
        # is a KEY and not a figure — no value is derived from it, and the
        # window starts are already known.
        aligned = next((g for g in group_by
                        if g in set(cdef.get("valid_time_buckets") or [])), None)
        if aligned is not None:
            align = _req(cdef, "time_bucket_alignment")
            c_from, c_to = win_params["win_start"], win_params["win_end"]
            b_from, b_to = base_win["win_start"], base_win["win_end"]
            if align.get("requires_equal_length", True) and (c_to - c_from) != (b_to - b_from):
                # A REAL REFUSAL, with a reason that is true: offsets line up
                # only when the windows hold the same number of days.
                raise ValueError(
                    f"compare_to={compare_to!r} grouped by {aligned} needs two "
                    f"windows of the same length — the buckets are matched on "
                    f"their offset from each window's start and these windows "
                    f"differ, so nothing lines up (metrics.yaml comparisons."
                    f"retail.time_bucket_alignment)."
                )
            _offset_rows(rows, aligned, c_from)
            _offset_rows(baseline_rows, aligned, b_from)
            key_fields = [("_offset" if k == aligned else k) for k in key_fields]
        # Under a VALUE ranking top_n already cut the current period in SQL,
        # so a subject absent from it was cut by the rank (ranked=True). Under
        # a CHANGE ranking both windows are whole, every subject is matched,
        # and the cut happens after — in _rank_compared, below.
        compared = _compare_rows(rows, baseline_rows, key_fields, label_fields,
                                 _req(mdef, "unit"), cdef,
                                 ranked=(sql_top_n is not None), bucket=aligned)
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
            "method": (window_rule if window_rule != "previous_period"
                       else _req(cdef, "preset_window") if preset_to_compare
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
        if same_store_meta is not None:
            comparison_meta["same_store"] = same_store_meta
        if elapsed_meta is not None:
            # How much of the period the figure covers, from the windows the
            # tool bound — never from the clock on whoever reads it.
            comparison_meta["elapsed"] = elapsed_meta

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
            # The denominator NAMED THE METRIC KEY until 2026-09-13 — a reader
            # asking how a shop did was shown "the denominator
            # (transaction_count) is zero". A notice message is the reader's,
            # so it takes the denominator's display name.
            "message": (
                f"{_req(mdef, 'display_name')} cannot be worked out here: "
                f"there were no qualifying transactions, so the denominator "
                f"({_denominator_label(defs, mdef)}) is zero. The value is "
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
    if left["setting"] is not None:
        meta["settings"] = {_LEFT_OUT: left["setting"]}
    if notices:
        meta["notice"] = notices[0] if len(notices) == 1 else {
            "kind": "multiple",
            "message": " | ".join(n["message"] for n in notices),
            "items": notices,
        }

    return {"rows": rows, "meta": meta}
