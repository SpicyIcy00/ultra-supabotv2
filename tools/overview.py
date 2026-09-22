"""
The overview: one read that already has the picture (W1.3, 2026-09-22).

WHY IT EXISTS. "How are we doing" was answered by reading the estate, every
shop, the days, what rose and fell, the shelf and the warning list over two or
three model rounds, and then working out in prose which of those mattered —
most of a broad answer's minutes (DECISIONS 2026-09-21, "why a broad answer
takes minutes"). The reads never needed judgement to choose: they are the
same every time. So code runs them, and code writes what they found.

WHAT IT RETURNS: FINDINGS. Each row is one fact, one line written by code from
the figures on that row (metrics.yaml overview.facts), with the read behind it
named on the row (`part`) and that read's own receipts in meta.parts. Ranked
by the declared reading order (overview.order). The Tableau Pulse pattern:
code finds the facts; Bob selects, explains and interprets them.

THIS FILE CONTAINS NO SQL. Every figure comes from an existing vetted read —
get_sales, get_stock_history, get_attention — called with the window and the
arguments metrics.yaml overview.reads lists, exactly as tools/objects.py does
for a shop. There is one definition of what a shop's week is, and this is not
a second one.

WHAT IT COMPUTES, AND WHY THAT IS ALLOWED. Architecture rule 6's reasoning:
two results combined is a DEFINITION, and definitions live in the yaml. The
three combinations made here are each declared there:

  concentration  which shop (or product) carried the estate's change — its
                 change against the whole's, the SAME measure, window and
                 filters (overview.concentration). The ratio decides a word
                 ("carried most" means more than half); it is never put on a
                 row, so there is no share for anyone to quote (rule 10).
  day_moved      a shop's day against the same weekday of the baseline, both
                 read in one series (overview.day_moved); the difference is
                 computed here and put on the row, never left to prose.
  shop           a shop's three figures on one line: the three reads share one
                 window and one comparison, and are joined on the shop the
                 rows themselves name.

Rules 5 and 9 hold: no model is consulted, nothing is planned, and every digit
on a row was written by code from a read's figure.

A READ THAT FAILS DOES NOT TAKE THE OVERVIEW WITH IT. It becomes an `unread`
finding with its reason, ranked first — an overview that silently lost the
shelf would read as "nothing is out of stock", which is the one thing this
system exists to prevent.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

from tools import windows
from tools._common import load_defs, req
from tools.attention import get_attention
from tools.sales import get_sales
from tools.stock_history import get_stock_history

MANILA = ZoneInfo("Asia/Manila")

FUNCTIONS: dict[str, Callable[..., dict]] = {
    "get_sales": get_sales,
    "get_stock_history": get_stock_history,
    "get_attention": get_attention,
}


# ---------------------------------------------------------------------------
# Words and figures — how code writes a fact
# ---------------------------------------------------------------------------

def _num(v: Any) -> Optional[float]:
    if isinstance(v, bool) or v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _money(v: Any, defs: dict) -> str:
    """The figure exactly as the read gives it: cents only when it has them."""
    n = _num(v)
    if n is None:
        return "no figure"
    sym = str(req(defs, "currency.symbol"))
    places = int(req(defs, "currency.decimal_places"))
    body = f"{abs(n):,.{places}f}" if round(abs(n), places) != round(abs(n)) else f"{abs(n):,.0f}"
    return f"{'-' if n < 0 else ''}{sym}{body}"


def _amount(v: Any, unit: Any, defs: dict) -> str:
    """A figure in its unit: money in currency, a count as a count."""
    if str(unit or "").upper() == str(req(defs, "currency.code")).upper():
        return _money(v, defs)
    n = _num(v)
    if n is None:
        return "no figure"
    return f"{n:,.0f}" if n == round(n) else f"{n:,}"


def _pct(v: Any) -> str:
    n = _num(v)
    return "no comparison" if n is None else f"{abs(n):g}%"


def _dir(row: dict) -> str:
    d = str(row.get("direction") or "")
    if d in ("up", "down"):
        return d
    n = _num(row.get("change"))
    return "up" if (n or 0) > 0 else "down" if (n or 0) < 0 else "flat"


def _day(iso: Any) -> str:
    """'Tue 15 Sep'. Written out rather than %-d, which Windows rejects."""
    try:
        d = iso if isinstance(iso, date) else date.fromisoformat(str(iso)[:10])
    except (TypeError, ValueError):
        return str(iso)
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def _span(start: date, end: date) -> str:
    """A half-open [start, end) said as its first and last days."""
    last = end - timedelta(days=1)
    return _day(start) if last == start else f"{_day(start)} to {_day(last)}"


class _Blank(dict):
    """A template field nothing supplied reads as nothing, never as a crash."""

    def __missing__(self, key: str) -> str:
        return ""


def _say(template: str, **fields: Any) -> str:
    return " ".join(str(template).format_map(_Blank(fields)).split())


# ---------------------------------------------------------------------------
# The window
# ---------------------------------------------------------------------------

def _windows(date_range: Any, defs: dict) -> tuple[Any, dict, tuple[date, date], tuple[date, date]]:
    """
    The asked window, its structured description, and the current and
    baseline windows as dates — placed by the comparison's own rule
    (comparisons.previous_period) through tools/windows.py, anchored on the
    Manila date, so they are the windows get_sales itself resolves.
    """
    today = datetime.now(MANILA).date()
    if isinstance(date_range, (list, tuple)):
        if len(date_range) != 2:
            raise ValueError("An explicit window is a [start, end) pair of dates.")
        current = (windows.as_date(date_range[0]), windows.as_date(date_range[1]))
        base = windows.previous_period_explicit(*current)
        asked: Any = [current[0].isoformat(), current[1].isoformat()]
        described = {"kind": "explicit", "name": None}
    else:
        asked = str(date_range)
        windows.check_preset_comparable(defs, asked)
        current, base = windows.previous_period_preset(defs, asked, today)
        described = {"kind": "preset", "name": asked}
    described.update({
        "start": current[0].isoformat(), "end": current[1].isoformat(),
        "convention": "half-open [start, end)",
        "resolved_against": today.isoformat(),
    })
    return asked, described, current, base


def _calls(spec: dict, asked: Any, current: tuple[date, date],
           base: tuple[date, date]) -> dict[str, dict]:
    """Every read the definitions list, with the window and scope filled in."""
    top = spec["top_n"]
    out: dict[str, dict] = {}
    for part, read in spec["reads"].items():
        args: dict[str, Any] = dict(read.get("arguments") or {})
        if read.get("compared"):
            args["compare_to"] = spec["compare_to"]
        where = read.get("window")
        if where == "date_range":
            args["date_range"] = asked
        elif where == "baseline_and_window":
            args["date_range"] = [base[0].isoformat(), current[1].isoformat()]
        elif where == "window_days":
            args["start"] = current[0].isoformat()
            args["end"] = (current[1] - timedelta(days=1)).isoformat()
        elif where != "none":
            raise ValueError(f"metrics.yaml overview.reads.{part}: unknown window {where!r}")
        if read.get("top_n"):
            args["top_n"] = int(top[read["top_n"]])
        out[part] = {"tool": read["tool"], "arguments": args}
    return out


def _run(part: str, call: dict, decisions: Any) -> tuple[str, dict]:
    """
    One read, and what became of it. A refusal (ValueError) is a tool
    declining to mislead and is kept apart from a fault, as tools/objects.py
    keeps them: "the warehouse records no sales" is not "the database is down".
    """
    extra = {"decisions": decisions} if call["tool"] == "get_attention" and decisions is not None else {}
    try:
        out = FUNCTIONS[call["tool"]](**call["arguments"], **extra)
    except ValueError as exc:
        return part, {"state": "refused", "reason": str(exc), "rows": [], "meta": {}}
    except Exception as exc:  # noqa: BLE001 - a read's failure is a finding
        return part, {"state": "failed", "reason": f"{type(exc).__name__}: {exc}"[:300],
                      "rows": [], "meta": {}}
    rows = [r for r in (out.get("rows") or []) if isinstance(r, dict)]
    return part, {"state": "available" if rows else "empty", "rows": rows,
                  "meta": out.get("meta") or {}}


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

def _finding(kind: str, fact: str, part: str, *, subject: Any = None, where: Any = None,
             metric: Any = None, row: Optional[dict] = None, detail: Optional[dict] = None,
             order_within: float = 0.0) -> dict:
    row = row or {}
    return {
        "finding": kind,
        "subject": subject,
        "where": where,
        "metric": metric,
        "fact": fact,
        "value": row.get("value"),
        "baseline": row.get("baseline"),
        "change": row.get("change"),
        "change_pct": row.get("change_pct"),
        "unit": row.get("unit"),
        "part": part,
        "detail": detail,
        "_within": order_within,
    }


def _compared_ok(row: dict, spec: dict) -> bool:
    return (row.get("baseline_status") == spec["concentration"]["needs_baseline_status"]
            and _num(row.get("change")) is not None)


def _estate(results: dict, spec: dict, defs: dict, win: dict) -> list[dict]:
    """The primary fact, and its two drivers, for the estate as a whole."""
    facts, words = spec["facts"], spec["measure_words"]
    out: list[dict] = []
    for part, kind, within in (("estate_sales", "estate", 0), ("estate_transactions", "drivers", 0),
                               ("estate_basket", "drivers", 1)):
        rows = results[part]["rows"]
        if not rows:
            continue
        row, metric = rows[0], str(results[part]["meta"].get("metric") or "")
        measure = str(words.get(metric, metric))
        if _compared_ok(row, spec):
            fact = _say(facts[kind], measure=measure, value=_amount(row.get("value"), row.get("unit"), defs),
                        dir=_dir(row), change_pct=_pct(row.get("change_pct")),
                        baseline=_amount(row.get("baseline"), row.get("unit"), defs),
                        window=win["window"], baseline_window=win["baseline_window"])
        else:
            fact = _say(facts["no_baseline"], subject="The estate", measure=measure.lower(),
                        value=_amount(row.get("value"), row.get("unit"), defs),
                        window=win["window"], baseline_status=row.get("baseline_status"))
        out.append(_finding(kind, fact, part, subject="the estate", metric=metric,
                            row=row, order_within=within))
    return out


def _by_store(rows: list[dict]) -> dict[str, dict]:
    return {str(r.get("store")): r for r in rows if r.get("store")}


def _shops(results: dict, spec: dict, defs: dict, win: dict) -> list[dict]:
    """Every shop's week: net sales and its two drivers, on one line."""
    facts = spec["facts"]
    tx = _by_store(results["shop_transactions"]["rows"])
    basket = _by_store(results["shop_basket"]["rows"])
    out: list[dict] = []
    for row in results["shop_sales"]["rows"]:
        shop = row.get("store")
        if not shop:
            continue

        def moved(r: Optional[dict]) -> str:
            if not r or not _compared_ok(r, spec):
                return "with no comparison"
            return f"{_dir(r)} {_pct(r.get('change_pct'))}"

        t, b = tx.get(str(shop)), basket.get(str(shop))
        if _compared_ok(row, spec):
            fact = _say(facts["shop"], subject=shop,
                        value=_amount(row.get("value"), row.get("unit"), defs), dir=_dir(row),
                        change_pct=_pct(row.get("change_pct")),
                        baseline=_amount(row.get("baseline"), row.get("unit"), defs),
                        tx=moved(t), basket=moved(b))
        else:
            fact = _say(facts["no_baseline"], subject=shop, measure="net sales",
                        value=_amount(row.get("value"), row.get("unit"), defs),
                        window=win["window"], baseline_status=row.get("baseline_status"))
        detail = {
            "transactions": {k: (t or {}).get(k) for k in ("value", "baseline", "change_pct")},
            "basket": {k: (b or {}).get(k) for k in ("value", "baseline", "change_pct")},
        }
        out.append(_finding("shop", fact, "shop_sales", subject=shop, metric="net_sales",
                            row=row, detail=detail,
                            order_within=-abs(_num(row.get("change")) or 0.0)))
    return out


def _concentration(results: dict, spec: dict, defs: dict, of: str) -> list[dict]:
    """
    Which one subject carried the whole's change, by the definition in
    overview.concentration — decided here from two read figures, and said as
    a word. The ratio that decides it is never put on the row.
    """
    conc = spec["concentration"]
    decl = conc["of"][of]
    whole_rows = results[decl["whole"]]["rows"]
    if not whole_rows or not _compared_ok(whole_rows[0], spec):
        return []
    whole = whole_rows[0]
    whole_change = _num(whole.get("change")) or 0.0
    if whole_change == 0:
        return []
    parts = decl["parts"] if isinstance(decl["parts"], list) else [decl["parts"]]
    candidates: list[tuple[dict, str]] = []
    for part in parts:
        for r in results[part]["rows"]:
            c = _num(r.get("change"))
            if c is not None and _compared_ok(r, spec) and (c > 0) == (whole_change > 0):
                candidates.append((r, part))
    if not candidates:
        return []
    top, part = max(candidates, key=lambda rp: (abs(_num(rp[0].get("change")) or 0.0),
                                                 str(rp[0].get("store") or rp[0].get("product") or "")))
    subject = top.get("store") or top.get("product")
    ratio = (_num(top.get("change")) or 0.0) / whole_change
    outcome = ("carried_all" if ratio > 1 else
               "carried_most" if ratio > float(conc["most_means_more_than"]) else "spread")
    unit = whole.get("unit")
    fact = _say(spec["facts"][outcome], subject=subject, noun=decl["noun"], measure=decl["measure"],
                movement="fall" if whole_change < 0 else "rise",
                moved="fell" if whole_change < 0 else "rose", dir=_dir(top),
                change=_amount(abs(_num(top.get("change")) or 0.0), unit, defs),
                whole_change=_amount(abs(whole_change), unit, defs))
    return [_finding("concentration", fact, part, subject=subject, metric=results[part]["meta"].get("metric"),
                     row=top, order_within=0 if of == "shops" else 1,
                     detail={"of": of, "outcome": outcome, "whole": "the estate",
                             "whole_change": whole.get("change"), "whole_part": decl["whole"]})]


def _days_moved(results: dict, spec: dict, defs: dict, current: tuple[date, date],
                base: tuple[date, date]) -> list[dict]:
    """
    For the shops that moved most in the estate's direction, the day whose
    net sales moved most against the same weekday of the baseline window —
    both days from one read. Not offered when the two windows are not a whole
    number of weeks apart: there is then no same weekday to set a day against.
    """
    offset = (current[0] - base[0]).days
    estate = results["estate_sales"]["rows"]
    if offset <= 0 or offset % 7 or not estate or not _compared_ok(estate[0], spec):
        return []
    down = (_num(estate[0].get("change")) or 0.0) < 0
    movers = [r for r in results["shop_sales"]["rows"]
              if _compared_ok(r, spec) and ((_num(r.get("change")) or 0.0) < 0) == down
              and (_num(r.get("change")) or 0.0) != 0]
    movers.sort(key=lambda r: -abs(_num(r.get("change")) or 0.0))
    series: dict[str, dict[date, dict]] = {}
    for r in results["shop_days"]["rows"]:
        try:
            d = date.fromisoformat(str(r.get("day"))[:10])
        except (TypeError, ValueError):
            continue
        series.setdefault(str(r.get("store")), {})[d] = r
    unit = (results["shop_days"]["meta"] or {}).get("metric_unit")
    out: list[dict] = []
    for i, shop_row in enumerate(movers[: int(spec["top_n"]["shop_days"])]):
        shop = str(shop_row.get("store"))
        days = series.get(shop) or {}
        best: Optional[tuple[float, date, dict, dict]] = None
        d = current[0]
        while d < current[1]:
            now, then = days.get(d), days.get(d - timedelta(days=offset))
            if now is not None and then is not None:
                change = (_num(now.get("value")) or 0.0) - (_num(then.get("value")) or 0.0)
                if (change < 0) == down and change != 0 and (best is None or abs(change) > abs(best[0])):
                    best = (change, d, now, then)
            d += timedelta(days=1)
        if best is None:
            continue
        change, day, now, then = best
        was = _num(then.get("value")) or 0.0
        row = {"value": now.get("value"), "baseline": then.get("value"),
               "change": round(change, 2),
               "change_pct": round(change / abs(was) * 100, 1) if was else None, "unit": unit}
        fact = _say(spec["facts"]["day_moved"], subject=shop, movement="fall" if down else "rise",
                    day=_day(day), baseline_day=_day(day - timedelta(days=offset)),
                    value=_amount(row["value"], unit, defs), baseline=_amount(row["baseline"], unit, defs))
        out.append(_finding("day_moved", fact, "shop_days", subject=shop, metric="net_sales", row=row,
                            order_within=i, detail={"day": day.isoformat(),
                                                    "against": (day - timedelta(days=offset)).isoformat()}))
    return out


def _products(results: dict, spec: dict, defs: dict) -> list[dict]:
    out: list[dict] = []
    words = spec["measure_words"]
    for part, kind, sign in (("fell", "product_fell", -1), ("rose", "product_rose", 1)):
        metric = str(results[part]["meta"].get("metric") or "product_revenue")
        for i, r in enumerate(results[part]["rows"]):
            c = _num(r.get("change"))
            if c is None or c * sign <= 0 or not _compared_ok(r, spec):
                continue
            fact = _say(spec["facts"][kind], subject=r.get("product") or r.get("sku"),
                        measure=str(words.get(metric, metric)).lower(),
                        change=_amount(abs(c), r.get("unit"), defs),
                        value=_amount(r.get("value"), r.get("unit"), defs),
                        baseline=_amount(r.get("baseline"), r.get("unit"), defs))
            out.append(_finding(kind, fact, part, subject=r.get("product") or r.get("sku"),
                                metric=metric, row=r, order_within=i,
                                detail={"sku": r.get("sku")}))
    return out


def _attention(results: dict, spec: dict, defs: dict) -> list[dict]:
    lines = spec["facts"]["attention"]
    # The flagged day's drivers, by shop: the same day and comparison the
    # warning list's sales rows make (overview.reads.day_*), joined on the shop.
    tx = _by_store(results["day_transactions"]["rows"])
    basket = _by_store(results["day_basket"]["rows"])

    def moved(r: Optional[dict]) -> str:
        if not r or not _compared_ok(r, spec):
            return "with no comparison"
        return f"{_dir(r)} {_pct(r.get('change_pct'))}"

    out: list[dict] = []
    for i, r in enumerate(results["attention"]["rows"][: int(spec["top_n"]["attention"])]):
        source = str(r.get("source") or r.get("section") or "")
        as_of = (r.get("receipts") or {}).get("as_of") or {}
        compared = as_of.get("compared") or [None, None]
        shop_tx, shop_basket = tx.get(str(r.get("subject"))), basket.get(str(r.get("subject")))
        fields = {
            "tx": moved(shop_tx), "basket": moved(shop_basket),
            "subject": r.get("subject"), "where": r.get("store"), "source": source,
            "day": _day(as_of.get("day")) if as_of.get("day") else "",
            "value": _amount(r.get("value"), r.get("unit"), defs), "dir": _dir(r),
            "change_pct": _pct(r.get("change_pct")),
            "baseline": _amount(r.get("baseline"), r.get("unit"), defs),
            "was_day": _day(compared[0]) if compared[0] else "",
            "now_day": _day(compared[-1]) if compared[-1] else "",
            "last_sold": _day(r.get("last_sold")) if r.get("last_sold") else "",
        }
        fact = _say(lines.get(source) or lines["other"], **fields)
        keep = {k: r.get(k) for k in ("source", "identity", "was", "now", "quantity_on_hand",
                                      "last_sold", "sku", "threshold_applied") if r.get(k) is not None}
        if source == "sales_vs_same_weekday" and (shop_tx or shop_basket):
            keep["transactions"] = {k: (shop_tx or {}).get(k) for k in ("value", "baseline", "change_pct")}
            keep["basket"] = {k: (shop_basket or {}).get(k) for k in ("value", "baseline", "change_pct")}
        out.append(_finding("attention", fact, "attention", subject=r.get("subject"),
                            where=r.get("store"), metric=source, row=r,
                            order_within=_num(r.get("rank")) or i, detail=keep or None))
    return out


def _stockouts(results: dict, spec: dict) -> list[dict]:
    out: list[dict] = []
    for i, r in enumerate(results["stockouts"]["rows"]):
        fact = _say(spec["facts"]["stockout"], subject=r.get("product") or r.get("sku"),
                    where=r.get("store"), days_out=r.get("days_out_of_stock"),
                    observed_days=r.get("observed_days"))
        out.append(_finding("stockout", fact, "stockouts", subject=r.get("product") or r.get("sku"),
                            where=r.get("store"), metric="days_out_of_stock", order_within=i,
                            detail={k: r.get(k) for k in ("sku", "days_out_of_stock", "observed_days",
                                                          "days_negative", "current_stockout_run")}))
    return out


def _unread(results: dict, spec: dict) -> list[dict]:
    out: list[dict] = []
    for i, (part, res) in enumerate(results.items()):
        if res["state"] in ("refused", "failed"):
            fact = _say(spec["facts"]["unread"], part=spec["part_words"].get(part, part),
                        reason=res.get("reason"))
            out.append(_finding("unread", fact, part, order_within=i,
                                detail={"state": res["state"]}))
    return out


def _rank(findings: list[dict], order: list[str]) -> list[dict]:
    """Declared reading order, then each kind's own order, then subject."""
    place = {k: i for i, k in enumerate(order)}
    findings.sort(key=lambda f: (place.get(f["finding"], len(place)), f["_within"],
                                 str(f.get("subject") or "")))
    for i, f in enumerate(findings, 1):
        f.pop("_within", None)
        f["rank"] = i
    return [{"rank": f.pop("rank"), **f} for f in findings]


# ---------------------------------------------------------------------------
# Receipts
# ---------------------------------------------------------------------------

def _notices(results: dict) -> Optional[dict]:
    """Every read's notice, once each — so the loop surfaces them as its own."""
    seen: set[tuple] = set()
    items: list[dict] = []
    for res in results.values():
        notice = (res.get("meta") or {}).get("notice")
        if not isinstance(notice, dict):
            continue
        for n in (notice.get("items") if notice.get("kind") == "multiple" else None) or [notice]:
            if not isinstance(n, dict):
                continue
            key = (n.get("kind"), n.get("message"))
            if key not in seen:
                seen.add(key)
                items.append(n)
    if not items:
        return None
    if len(items) == 1:
        return items[0]
    return {"kind": "multiple", "message": " | ".join(str(n.get("message") or "") for n in items),
            "items": items}


def _part_receipt(call: dict, res: dict) -> dict:
    meta = res.get("meta") or {}
    out = {
        "call": call,
        "state": res["state"],
        "source_table": meta.get("source_table"),
        "filters_applied": meta.get("filters_applied"),
        "snapshot_timestamp": meta.get("snapshot_timestamp"),
        "row_count": meta.get("row_count", len(res.get("rows") or [])),
        "full_row_count": meta.get("full_row_count"),
    }
    if res.get("reason"):
        out["reason"] = res["reason"]
    return out


def drawn_calls(date_range: Any = None) -> list[dict]:
    """
    The parts a page draws (overview.drawn), each the same call the findings
    read makes, window filled in — for agent/one_call.get_overview. A window
    still in progress is refused here, once, as the findings read refuses it.
    """
    defs = load_defs()
    spec = req(defs, "overview")
    asked, _described, current, base = _windows(date_range or spec["default_window"], defs)
    calls = _calls(spec, asked, current, base)
    return [{"part": part, "tool": calls[part]["tool"], "arguments": calls[part]["arguments"]}
            for part in spec["drawn"]]


def get_overview_findings(date_range: Any = None, *, decisions: Any = None) -> dict:
    """
    The overview's FINDINGS alone: ranked, each one line of fact written by
    code with its figures on the row, its read named in `part` and that read's
    receipts in meta.parts — among them a `concentration` finding saying
    whether one shop (and one product) carried most of the estate's change,
    decided by definition. Ask get_overview instead: it is this read AND the
    parts a page draws. This one alone is for a pin or a workflow step that
    keeps the findings.

    Args:
        date_range: a CLOSED preset or an explicit [start, end) pair; default
               last_week, against the week before. A window still in progress
               is refused, as a comparison on one is.
    """
    defs = load_defs()
    spec = req(defs, "overview")
    asked, described, current, base = _windows(date_range or spec["default_window"], defs)
    calls = _calls(spec, asked, current, base)
    parallel = max(1, int(spec["max_parallel"]))
    with ThreadPoolExecutor(max_workers=parallel) as pool:
        done = dict(pool.map(lambda pc: _run(pc[0], pc[1], decisions), calls.items()))
    results = {part: done[part] for part in calls}

    win = {"window": _span(*current), "baseline_window": _span(*base)}
    findings: list[dict] = []
    findings += _unread(results, spec)
    findings += _estate(results, spec, defs, win)
    findings += _concentration(results, spec, defs, "shops")
    findings += _concentration(results, spec, defs, "products")
    findings += _shops(results, spec, defs, win)
    findings += _days_moved(results, spec, defs, current, base)
    findings += _products(results, spec, defs)
    findings += _attention(results, spec, defs)
    findings += _stockouts(results, spec)
    rows = _rank(findings, list(spec["order"]))

    parts = {part: _part_receipt(calls[part], results[part]) for part in calls}
    stamps = sorted(str(p["snapshot_timestamp"]) for p in parts.values() if p.get("snapshot_timestamp"))
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["finding"]] = counts.get(r["finding"], 0) + 1
    meta: dict[str, Any] = {
        # Every table any read touched, named rather than summarised.
        "source_table": " + ".join(sorted({t.strip() for p in parts.values() if p.get("source_table")
                                           for t in str(p["source_table"]).split(" + ")})) or "none",
        "filters_applied": [
            f"window {described['start']} to {described['end']} (half-open, Asia/Manila) against "
            f"{base[0].isoformat()} to {base[1].isoformat()}   # metrics.yaml: overview.compare_to "
            f"→ comparisons.{spec['compare_to']}",
            "every read with its own filters: meta.parts   # metrics.yaml: overview.reads",
            "findings in the order overview.order declares; within a kind, largest change first"
            "   # metrics.yaml: overview.order",
        ],
        # THE EARLIEST read time of any part — the overview is as old as its
        # oldest read, so the freshest one never vouches for the rest. Each
        # part carries its own in meta.parts.
        "snapshot_timestamp": stamps[0] if stamps else None,
        "snapshot_timestamp_is": "the earliest of meta.parts",
        "window": described,
        "comparison": {
            "kind": spec["compare_to"],
            "current": {"start": current[0].isoformat(), "end": current[1].isoformat()},
            "baseline": {"start": base[0].isoformat(), "end": base[1].isoformat()},
            "source": f"definitions/metrics.yaml: comparisons.{spec['compare_to']}",
        },
        "row_count": len(rows),
        "findings": counts,
        "unread": [p for p, r in results.items() if r["state"] in ("refused", "failed")],
        "parts": parts,
        "definitions": "definitions/metrics.yaml: overview",
        "note": (
            "Each finding's line was written by code from the figures on its row; "
            "quote them as they stand. A concentration finding's words are its "
            "definition's (overview.concentration) — no share of a change is on "
            "any row, and none is to be worked out."
        ),
    }
    notice = _notices(results)
    if notice is not None:
        meta["notice"] = notice
    return {"rows": rows, "meta": meta}
