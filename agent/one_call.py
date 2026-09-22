"""
Reads asked as one call (P2S.10, 2026-09-18): get_change, get_stock_health
and, since wave 1 (2026-09-22), get_overview.

THIS FILE READS NOTHING AND COMPUTES NO FIGURE. Each function below turns one
call Bob makes into the reads metrics.yaml `one_call_reads` lists — the
same tools, with the call's window and shop filled in — and the loop runs
those reads as ordinary calls: each its own seq, frames, board object,
receipts and pin (agent/loop._expand_sets). It is the metric set's
arrangement from P2S.9(b), widened from one tool to several.

WHY IT IS NOT A COMPOSITE LIKE get_object. get_object returns SECTIONS, and a
section cannot be drawn (compose refuses it, composite_tools.NOT_COMPOSABLE_
READS) — so after opening a shop Bob re-ran the reads he wanted to show,
and paid a round for it. Here every read is drawable the moment it lands.

WHAT IT MAY NOT DO, and does not. No read consumes another's rows (the shelf
read is the shop's stockouts over the window, never "the products that fell"
looked up one by one); nothing is summed, ranked or joined across reads; no
threshold is chosen here. Architecture rule 6's reasoning: two results
combined is a definition, and definitions live behind vetted SQL.

The functions' signatures and docstrings are what the model is offered
(agent/loop.build_tool_schemas); they are never registered as reads, so a pin
or a workflow step can never contain one — only the reads it became.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

from tools import windows
from tools._common import load_defs, req

MANILA = ZoneInfo("Asia/Manila")


def _spec(name: str, defs: dict) -> dict:
    return req(defs, f"one_call_reads.tools.{name}")


def _stores(spec: dict, defs: dict) -> list[str]:
    """The shops this call may be asked about, from the store list only."""
    groups = spec["stores"] if isinstance(spec["stores"], list) else [spec["stores"]]
    out: list[str] = []
    for group in groups:
        for entry in req(defs, group) or []:
            out.append(str(entry.get("display_name") or entry.get("name"))
                       if isinstance(entry, dict) else str(entry))
    return out


def _shop(store: Optional[str], name: str, spec: dict, defs: dict) -> Optional[str]:
    """
    The shop, matched against the store list — or None for the whole estate.

    Refused ONCE, here, rather than by each read: an unknown shop would
    otherwise come back as five identical refusals, and a warehouse asked how
    it changed as five reads of a place that sells nothing.
    """
    if store is None or not str(store).strip():
        return None
    known = _stores(spec, defs)
    wanted = str(store).strip().lower()
    match = next((k for k in known if k.lower() == wanted), None)
    if match is None:
        raise ValueError(
            f"{name} cannot be asked about {store!r}. It is asked about one of: "
            f"{', '.join(known)} — or with no store, for the whole estate."
        )
    return match


def _comparison(compare_to: Optional[str], spec: dict, name: str) -> str:
    """The comparison the call is made with — one the definition allows."""
    kind = compare_to or spec["default_compare_to"]
    if kind not in spec["compare_to"]:
        raise ValueError(
            f"{name} compares with {' or '.join(spec['compare_to'])}, not {kind!r}."
        )
    return kind


def _windows(date_range: Any, compare_to: str,
             defs: dict) -> tuple[Any, tuple[date, date], tuple[date, date]]:
    """
    The asked window as get_sales takes it, and the current and baseline
    windows as dates — placed by the comparison's own window rule
    (metrics.yaml comparisons) through tools/windows.py over the presets
    get_sales resolves, anchored on the Manila date.

    A window still in progress is refused by the same rule get_sales applies
    (partial_window_policy), naming the closed alternative.
    """
    rule = req(defs, f"comparisons.{compare_to}")
    today = datetime.now(MANILA).date()
    if isinstance(date_range, (list, tuple)):
        if len(date_range) != 2:
            raise ValueError("An explicit window is a [start, end) pair of dates.")
        current = (windows.as_date(date_range[0]), windows.as_date(date_range[1]))
        asked: Any = [current[0].isoformat(), current[1].isoformat()]
    else:
        asked = str(date_range)
        windows.check_preset_comparable(defs, asked)
        start, end = windows.resolve_preset(defs, asked, today)
        current = (date.fromisoformat(start), date.fromisoformat(end))
    if rule.get("window_rule") == "shift_back_by_days":
        base = windows.shifted_back_by_days(*current, int(req(defs, rule["offset_days"])))
    elif isinstance(asked, str):
        _cur, base = windows.previous_period_preset(defs, asked, today)
    else:
        base = windows.previous_period_explicit(*current)
    return asked, current, base


def _reads(name: str, *, store: Optional[str], category: Optional[str] = None,
           date_range: Any = None, compare_to: Optional[str] = None) -> list[dict]:
    """Every read the definitions list for this call, window and scope filled in."""
    defs = load_defs()
    spec = _spec(name, defs)
    shop = _shop(store, name, spec, defs)
    category = str(category).strip() if category and str(category).strip() else None
    listed = spec["reads_with_a_category"] if category else spec["reads"]
    window = current = base = kind = None
    if any("window" in r for r in listed):
        kind = _comparison(compare_to, spec, name)
        window, current, base = _windows(date_range or spec["default_window"], kind, defs)

    out: list[dict] = []
    for read in listed:
        args: dict[str, Any] = dict(read.get("arguments") or {})
        if read.get("compared"):
            args["compare_to"] = kind
        where = read.get("window")
        if where == "date_range":
            args["date_range"] = window
        elif where == "baseline_and_window":
            args["date_range"] = [base[0].isoformat(), current[1].isoformat()]
        elif where == "window_days":
            # Stock history takes inclusive calendar days; the window is [start, end).
            args["start"] = current[0].isoformat()
            args["end"] = (current[1] - timedelta(days=1)).isoformat()
        elif where is not None:
            raise ValueError(f"metrics.yaml one_call_reads.tools.{name}: unknown window {where!r}")
        scope = read.get("scope")
        if scope == "filters":
            wanted = {k: v for k, v in (("store", shop), ("category", category)) if v}
            if wanted:
                args["filters"] = {**(args.get("filters") or {}), **wanted}
        elif scope == "store":
            if shop is not None:
                args["store"] = shop
        else:
            raise ValueError(f"metrics.yaml one_call_reads.tools.{name}: unknown scope {scope!r}")
        out.append({"part": read["part"], "tool": read["tool"], "arguments": args})
    return out


def get_change(store: Optional[str] = None, category: Optional[str] = None,
               date_range: Any = None, compare_to: Optional[str] = None) -> list[dict]:
    """
    How did this change, and where — one call for what took two or three
    rounds: the three drivers compared (net sales, transactions, basket), the
    days of the window with the comparison window's own days before them, the
    five products that fell most and the five that rose most, and the
    products longest off the shelf in the window. Seven ordinary reads, each
    its own result with its own call_seq and receipts. For one shop, or with
    no store for the whole estate. With a category it is four reads: the
    category's revenue by shop compared, by day, and its products that fell
    and rose — net sales and its drivers cannot be cut to a category, and the
    shelf cannot be read by one. It is VERIFY, DECOMPOSE, LOCALIZE and CHECK
    for one subject — for a why about one subject it is the whole read: after
    it, compose, and offer what it cannot show (hours, one product's own days)
    as the next step.

    Args:
        store: one shop by name; omit for the whole estate. A warehouse is
               refused — it records no sales.
        category: a product category, e.g. "choco"; omit for every product.
        date_range: a CLOSED preset or an explicit [start, end) pair; default
               last_week. A window still in progress is refused, as a
               comparison on one is.
        compare_to: 'previous_period' (default) or 'same_weekday_last_week' —
               a day against the same weekday a week before, as the morning
               compares yesterday.
    """
    return _reads("get_change", store=store, category=category,
                  date_range=date_range, compare_to=compare_to)


def get_stock_health(store: Optional[str] = None) -> list[dict]:
    """
    A shop's stock health in one call: how many lines stand in each state,
    the emptiest lines (a negative count, which is a broken record, leads),
    and the replenishment plan's summary and what it most wants shipped.
    Four ordinary reads, each its own result with its own call_seq and
    receipts. "Running low" here is the plan's minimum — no shop has a
    warning level set. For one shop, or with no store for the whole estate; a
    warehouse has no replenishment plan and those two reads say so.

    Args:
        store: one shop or warehouse by name; omit for the whole estate.
    """
    return _reads("get_stock_health", store=store)


def get_overview(date_range: Any = None) -> list[dict]:
    """
    How the business is doing, in ONE call — use it FIRST AND ALONE for a
    broad question ("how are we doing", "how was the week", "anything I
    should know"). It is the overview's FINDINGS read and the reads a page
    draws them from, each its own result with its own call_seq and receipts:
    the estate's net sales, transactions and basket against the week before,
    net sales by shop, each shop's days against the same weekdays before,
    the products that fell and rose most, and the longest stockouts. The
    findings are ranked, each one line of fact written by code; among them
    is WHAT CARRIED IT, a `concentration` finding that says whether one shop
    (and one product) carried most of the estate's change — quote its words,
    never a share of your own. Answer from the findings and draw from the
    parts by their own call_seq: a chart of shops is the shop read, the days
    are the days read, the movers are the fell and rose reads. After it,
    compose: nothing more is read for a broad answer — not for a chart, and
    not to drill into a shop a finding flags; that drill-down is the next
    step you offer. Your first sentence says the estate's change as its
    first finding gives it, the percentage included.

    Args:
        date_range: a CLOSED preset or an explicit [start, end) pair; default
               last_week, against the week before. A window still in
               progress is refused, as a comparison on one is.
    """
    from tools import overview  # the overview owns its list (overview.drawn)

    findings_args: dict[str, Any] = {} if date_range is None else {"date_range": date_range}
    parts = overview.drawn_calls(date_range)  # refuses a window in progress, once
    return [{"part": "findings", "tool": "get_overview_findings", "arguments": findings_args},
            *parts]


FUNCTIONS: dict[str, Callable[..., list[dict]]] = {
    "get_change": get_change,
    "get_stock_health": get_stock_health,
    "get_overview": get_overview,
}
