"""
One object, opened up: a shop, a product, a supplier, an order.

THIS FILE CONTAINS NO SQL, AND THAT IS THE DESIGN. Everything an object view
shows is already defined and already vetted somewhere else — a shop's week is
get_sales, its shelf is get_stock, a product's costs are get_cost_history — so
this calls those tools and keeps each result WHOLE, with its own receipts,
exactly as tools/brief.py returns three sections at once.

The consequence is the point: there is one definition of what a shop's week is,
shared by the object view, the morning brief, a watch, and anything Bob
reasons with. A second implementation would be a second definition, and the two
would disagree on a Tuesday with nobody able to say which was right.

NOTHING IS JOINED ACROSS SECTIONS (architecture rule 6's reasoning, applied
here): the moment two results are combined, the combination is a definition,
and definitions live in metrics.yaml behind vetted SQL. Sections sit beside
each other. No total is summed across them, no ratio is taken between them, and
no row from one is filtered by a row from another.

WHY IT EXISTS AT ALL, given Bob could just be asked. Opening a shop by
asking him costs a model turn and roughly forty seconds. It is the same four
reads every time — there is no judgement in it — so the client calls this
directly when somebody taps, and it takes about a second. Bob is given the
identical tool, so what a person sees when they tap and what he sees when he
thinks cannot drift apart.

A SECTION THAT FAILS DOES NOT TAKE THE OBJECT WITH IT. Each is attempted
separately and a failure becomes a section with a stated reason, because half a
shop is worth more than an error page — and because a missing section that
simply vanished would read as "there is nothing here", which is the one thing
this whole system exists to prevent.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from tools._common import load_defs, req
from tools.cost_history import get_cost_history
from tools.inventory import get_stock
from tools.products import get_product
from tools.purchasing import get_purchasing
from tools.sales import get_sales

# The window an object opens on. `last_week` is a closed period — this week is
# still moving, and a comparison against a window in progress is refused by
# name anyway (metrics.yaml comparisons).
DEFAULT_WINDOW = "last_week"

# Sections are independent reads, so they run at once. Four rather than more
# because tools/_common.connect() gates at 8 connections per process and the
# web process is serving other things; four takes a shop from ~5s to ~1.5s,
# which is the difference between tapping a shop and asking about one.
MAX_PARALLEL = 4


def _kinds(defs: dict) -> dict[str, Any]:
    return req(defs, "objects.kinds")


def _store_names(defs: dict) -> list[str]:
    """Every place that can be opened as a shop, from the store list only."""
    names: list[str] = []
    for group in ("stores.active_retail", "stores.warehouse"):
        for entry in req(defs, group) or []:
            names.append(str(entry["display_name"] if isinstance(entry, dict) else entry))
    return names


def _resolve_shop(name: str, defs: dict) -> tuple[str, bool]:
    """
    A shop name and whether it TRADES, matched against the store list.

    Refused rather than passed through: an unknown shop returned as an empty
    view reads as "this shop sold nothing", which is a false statement made out
    of a typo.

    The second half matters as much. AJI BARN is a warehouse — it holds stock
    and records no transactions — so asking it for a week of sales gets a
    refusal from get_sales, correctly. Asking anyway and showing five refusals
    is a view that looks broken; knowing not to ask is a view that explains
    itself. The definitions already draw that line, so this reads it rather
    than discovering it by being told no.
    """
    retail = [str(s["display_name"] if isinstance(s, dict) else s)
              for s in req(defs, "stores.active_retail") or []]
    known = _store_names(defs)
    wanted = str(name).strip().lower()
    match = next((k for k in known if k.strip().lower() == wanted), None)
    if match is None:
        raise ValueError(
            f"There is no shop called {name!r}. The shops are: {', '.join(known)}."
        )
    return match, match in retail


def _section(name: str, says: str, call: dict, run) -> dict[str, Any]:
    """
    One section, with the call behind it and whatever it returned.

    A FAILURE IS A SECTION, not an exception, and the states are distinct in
    the structure so a client can render them as the different facts they are
    (UI rule 8): "nothing is out of stock here" is not "the shelf could not be
    read", and neither is "this question does not apply here".

    A REFUSAL IS NOT A FAULT. A tool raising ValueError is declining to produce
    a misleading number — asking a warehouse for its net sales, naming a store
    that does not sell — and that is a real answer with a reason a person can
    read. Anything else is a fault. Collapsing the two would put "AJI BARN is a
    warehouse" and "the database is down" under one word.
    """
    try:
        out = run()
    except ValueError as exc:
        return {"section": name, "says": says, "state": "refused",
                "reason": str(exc), "call": call, "rows": [], "meta": None}
    except Exception as exc:  # noqa: BLE001 - a section's failure is data
        return {"section": name, "says": says, "state": "failed",
                "reason": f"{type(exc).__name__}: {exc}", "call": call,
                "rows": [], "meta": None}
    rows = out.get("rows") or []
    return {
        "section": name,
        "says": says,
        "state": "available" if rows else "empty",
        "call": call,
        "rows": rows,
        # The section's OWN receipts. An object mixes windows and sources —
        # a week of sales beside a stock snapshot — so one timestamp over the
        # whole view would lend the freshest source's credibility to the
        # stalest one, which is the mistake tools/brief.py already refuses.
        "meta": out.get("meta"),
    }


FUNCTIONS = {"get_sales": get_sales, "get_stock": get_stock,
             "get_product": get_product, "get_cost_history": get_cost_history,
             "get_purchasing": get_purchasing}


def _run(tool: str, arguments: dict, name: str, says: str,
         left_out: Any = None) -> dict:
    """
    Build the section and remember the exact call, so a tile can re-run it.

    `left_out` — the categories a person said to leave out (P2S.11) — goes to
    the reads whose declaration names them (metrics.yaml settings.declared
    .left_out_categories.participates_in), and never into the remembered call:
    it is the person's binding, not an argument of the question.
    """
    extra = ({"left_out": left_out} if left_out and tool in
             req(load_defs(), "settings.declared.left_out_categories.participates_in")
             else {})
    return _section(name, says, {"tool": tool, "arguments": arguments},
                    lambda: FUNCTIONS[tool](**arguments, **extra))


def _run_all(specs: list[tuple[str, dict, str, str]], left_out: Any = None) -> list[dict]:
    """
    Every section at once, returned in the order asked for.

    Order is preserved deliberately: it is the order the object is READ in —
    what it took, then why, then what moved, then the shelf — and a view whose
    sections shuffled by whichever query finished first would be a different
    view every time.
    """
    if len(specs) == 1:
        return [_run(*specs[0], left_out=left_out)]
    with ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        return list(pool.map(lambda spec: _run(*spec, left_out=left_out), specs))


def _resolve_product(name: str, says: dict) -> tuple[dict, Optional[str], Optional[dict]]:
    """
    Which product this is, before anything is read about it.

    RESOLVING WHICH OBJECT IS NOT COMBINING FIGURES. The rule that sections are
    never joined is about arithmetic across results — a total summed from two
    reads is a definition nobody declared. Deciding which SKU the word "Aji
    Mix" refers to is the same act as matching a shop name against the store
    list, and it has to happen before the other reads or they are about
    nothing.

    AMBIGUITY IS NOT RESOLVED BY GUESSING. SKUs are not unique in this
    catalogue and a name is a substring match, so several products can answer
    to one word. When they do, the identity section still returns them all and
    the rest of the view says it does not know which was meant — a view that
    picked one would be showing somebody another product's figures under the
    name they typed.
    """
    identity = _run("get_product", {"sku": name}, "identity", says["identity"])
    if identity["state"] != "available":
        identity = _run("get_product", {"name": name}, "identity", says["identity"])

    rows = identity["rows"]
    if not rows:
        return identity, None, {
            "kind": "object_not_found",
            "message": (
                f"No product matches {name!r} by SKU or by name, so there is "
                f"nothing to open. This is an unknown product, not one with no "
                f"sales."
            ),
            "source": "tools/products.py",
        }

    wanted = str(name).strip().lower()
    exact_sku = [r for r in rows if str(r.get("sku") or "").strip().lower() == wanted]
    exact_name = [r for r in rows if str(r.get("name") or "").strip().lower() == wanted]
    chosen = exact_sku or exact_name or (rows if len(rows) == 1 else [])

    if len(chosen) != 1:
        candidates = "; ".join(
            f"{r.get('sku')} = {r.get('name')!r}" for r in rows[:8]
        )
        return identity, None, {
            "kind": "object_ambiguous",
            "message": (
                f"{name!r} matches {len(rows)} products, so the figures below "
                f"cannot be shown for one of them: {candidates}. Ask again with "
                f"the exact SKU."
            ),
            "source": "metrics.yaml: products.sku.ambiguity_policy",
        }
    return identity, str(chosen[0].get("sku")), None


def get_object(kind: str, name: str,
               date_range: Optional[str] = None, *, left_out: Any = None) -> dict:
    """
    Open one thing up: a shop, a product, a supplier or an order.

    Returns every section of that object in ONE call — its week and what moved
    it, what is selling, what has run out — each section carrying its own
    receipts. Use it when somebody names a thing rather than a measure: "how is
    Rockwell doing", "what about Aji Mix", "open OPUS". For one specific figure,
    call the specific read instead; this is the way IN to an object, not a
    replacement for asking a precise question.

    Nothing here is computed. Every section is an existing vetted read, kept
    whole and kept apart, so a figure means exactly what it means everywhere
    else.

    Args:
        kind: shop, product, supplier or order.
        name: which one. A shop by name; a product by SKU or name; a supplier
              by name; an order by its external id. A shop that does not exist
              is refused rather than returned empty, and a product that matches
              several is reported as ambiguous rather than guessed at.
        date_range: the window for the sections that have one. Defaults to
              last_week — a closed period, because a comparison against a
              window still in progress is refused by name.

    Returns:
        {"rows": [...], "meta": {...}}, where each row is a SECTION with its
        own `rows`, `meta` and the call behind it. `state` is available, empty,
        failed or unresolved per section, and a failed one names its reason:
        half an object is worth more than an error, and a section that vanished
        would read as "there is nothing here".

    `left_out` is supplied by the loop or the web process, never the model:
    the categories a person said to leave out (P2S.11). Each section's read
    applies it as that read does, and its own receipt says so.
    """
    defs = load_defs()
    kinds = _kinds(defs)
    if kind not in kinds:
        raise ValueError(
            f"{kind!r} is not a kind of object. It is one of: {', '.join(kinds)}."
        )
    if not str(name or "").strip():
        raise ValueError(f"Which {kind}? A name or id is required.")

    window = date_range or DEFAULT_WINDOW
    top_n = int(req(defs, "objects.top_n"))
    says = {s: spec["says"] for s, spec in kinds[kind]["sections"].items()}

    sections: list[dict] = []
    specs: list[tuple[str, dict, str, str]] = []
    ambiguity: Optional[dict] = None

    if kind == "shop":
        store, trades = _resolve_shop(name, defs)
        if not trades:
            # A warehouse has a shelf and no till. Its sales sections are not
            # empty and not broken — they do not exist, and saying so once is
            # better than five refusals that look like breakage.
            sections = _run_all([("get_stock", {
                "store": store, "state": "out_of_stock", "top_n": top_n,
            }, "shelf", says["shelf"])], left_out=left_out)
            ambiguity = {
                "kind": "object_has_no_sales",
                "message": (
                    f"{store} is a warehouse: it holds stock and records no "
                    f"transactions, so it has no week, no drivers and no "
                    f"best sellers. What it does have is a shelf, below."
                ),
                "source": "metrics.yaml: stores.warehouse",
            }
        else:
            specs.append(("get_sales", {
                "metric": "net_sales", "group_by": "store", "date_range": window,
                "filters": {"store": store}, "compare_to": "previous_period",
            }, "week", says["week"]))
            # BOTH DRIVERS, SAME WINDOW, SAME FILTERS — which is what makes
            # "and why" a reading of figures rather than an assertion.
            # net_sales is the product of these two
            # (metrics.net_sales.drivers), so a shop that grew on transactions
            # and one that grew on basket value are visibly different here
            # without anything being computed.
            for metric in ("transaction_count", "average_transaction_value"):
                specs.append(("get_sales", {
                    "metric": metric, "group_by": "store", "date_range": window,
                    "filters": {"store": store}, "compare_to": "previous_period",
                }, "drivers", says["drivers"]))
            specs.append(("get_sales", {
                "metric": "product_revenue", "group_by": "product",
                "date_range": window, "filters": {"store": store},
                "compare_to": "previous_period", "rank_by": "biggest_gain",
                "top_n": top_n,
            }, "moving", says["moving"]))
            specs.append(("get_sales", {
                "metric": "product_revenue", "group_by": "product",
                "date_range": window, "filters": {"store": store},
                "compare_to": "previous_period", "rank_by": "biggest_drop",
                "top_n": top_n,
            }, "slipping", says["slipping"]))
            specs.append(("get_stock", {
                "store": store, "state": "out_of_stock", "top_n": top_n,
            }, "shelf", says["shelf"]))
            # THIRTY FULL DAYS, and the hours of the day — the instruments'
            # reads. No top_n: a series cut to five is not a series. Always
            # last_30_days, whatever window the object was asked for.
            specs.append(("get_sales", {
                "metric": "net_sales", "group_by": "day", "date_range": "last_30_days",
                "filters": {"store": store},
            }, "days", says["days"]))
            specs.append(("get_sales", {
                "metric": "net_sales", "group_by": "hour", "date_range": "last_30_days",
                "filters": {"store": store},
            }, "hours", says["hours"]))
            sections = _run_all(specs, left_out=left_out)

    elif kind == "product":
        # IDENTITY FIRST, and everything else waits on it: a SKU is what the
        # other three reads are filtered by, so asking them before knowing it
        # would be asking about nothing.
        identity, sku, ambiguity = _resolve_product(name, says)
        sections.append(identity)
        if sku is None:
            # Named, not dropped. A section that simply vanished would read as
            # "this product has no sales", which is a different claim from
            # "I do not know which product you mean" (UI rule 8).
            for section in ("week", "shelf", "cost"):
                sections.append({
                    "section": section, "says": says[section],
                    "state": "unresolved",
                    "reason": (ambiguity or {}).get("message"),
                    "call": None, "rows": [], "meta": None,
                })
        else:
            specs.append(("get_sales", {
                "metric": "product_revenue", "group_by": "store",
                "date_range": window, "filters": {"sku": sku},
                "compare_to": "previous_period",
            }, "week", says["week"]))
            specs.append(("get_stock", {"sku": sku, "top_n": top_n},
                          "shelf", says["shelf"]))
            # Capped like every other section. Cost history is three separate
            # series that are never blended (tools/cost_history.py), so the
            # cap is per series and 690 rows of it is a report, not a way in.
            specs.append(("get_cost_history", {"sku": sku, "top_n": top_n},
                          "cost", says["cost"]))
            sections.extend(_run_all(specs, left_out=left_out))

    elif kind == "supplier":
        sections = _run_all([("get_purchasing", {
            "supplier": name, "group_by": "status", "top_n": top_n,
        }, "orders", says["orders"])])

    elif kind == "order":
        sections = _run_all([("get_purchasing", {
            "external_id": name, "group_by": "sku", "top_n": top_n,
        }, "lines", says["lines"])])

    thin = kinds[kind].get("thin_because")
    notice = ambiguity
    if notice is None and thin:
        notice = {
            "kind": "object_view_thin",
            "message": (
                f"A {kind} can only be shown as the record has it. "
                + str(req(defs, f"objects.thin_reasons.{thin}")).strip()
            ),
            "source": f"metrics.yaml: objects.kinds.{kind}.thin_because",
        }

    return {
        "rows": sections,
        "meta": {
            # Every table any section touched, named rather than summarised:
            # this view mixes sources and must not claim one.
            "source_table": " + ".join(sorted({
                str((s.get("meta") or {}).get("source_table"))
                for s in sections if (s.get("meta") or {}).get("source_table")
            })) or "none",
            "filters_applied": [f"{kind} = {name}", f"window = {window}"],
            # DELIBERATELY NULL. An object read has no single moment: a week of
            # sales and a stock snapshot were read at different times against
            # sources of different ages. Each section carries its own, and one
            # timestamp over the whole view would be the freshest source
            # vouching for the stalest.
            "snapshot_timestamp": None,
            "object": {"kind": kind, "name": name},
            # NOT `window`. Every other tool uses meta.window for a STRUCTURED
            # window — {kind, name, start, end} — and the result vocabulary and
            # bob_recall both read it as one. Putting a bare preset string
            # there crashed recall for every later question in any conversation
            # that had opened an object (AttributeError: 'str' has no 'get').
            # An object view has no single window anyway: each section carries
            # its own, and the preset here is only what was ASKED for.
            "window_preset": window,
            "sections": {s["section"]: s["state"] for s in sections},
            "available": sum(1 for s in sections if s["state"] == "available"),
            "failed": [s["section"] for s in sections if s["state"] == "failed"],
            "notice": notice,
            "note": (
                "Each section is a separate vetted read with its own receipts. "
                "Nothing is combined across them — a figure here means what it "
                "means everywhere else."
            ),
        },
    }
