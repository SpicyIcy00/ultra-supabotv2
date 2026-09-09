"""
The work in front of the user, as George is told it — and what his prose may
not say about it.

WHY THIS EXISTS. "Why?", "compare that with Rockwell", "products" have no
referent in the question itself. Until 2026-09-09 the referent was whatever the
model recovered from the prior turn's PROSE plus the `[Calls behind this
answer: ...]` line `_seed_history` appends — a list of raw tool invocations,
which is deterministic but is not a description of the work. The frontend now
composes a surface from the same persisted facts (surfaceAnchor.ts); this is
the server-side twin, so the model and the screen are told the same thing from
the same source: the arguments the tools accepted, never the prose.

WHAT THE SENTENCE MAY CONTAIN. Metric display names from the definitions, the
subject named in a store filter or grouping, the window preset the call named,
and whether a comparison was asked for. NO FIGURE, EVER — the sentence is built
from arguments alone and never reads a row, so it cannot leak a number into the
prompt that no tool returned this turn. Architecture rule 9 is untouched.

WHAT THE PROSE SCAN IS, EXACTLY. `leaked_terms` finds the words metrics.yaml
`surface.prose.leaks` lists — tool names, argument names, field names,
implementation narration — as whole words in an answer, and
`transaction_synonyms` finds the words the definitions do NOT establish as
meaning "transaction". Both are recorded as gaps and surfaced as warning
frames. Neither rewrites the answer: rule 17 has a legitimate exception (being
asked how a figure was got), and a mechanical correction cannot tell the two
apart. This is telemetry for the dogfood, and it is honest about that.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping, Optional

from tools._common import req

# Filter keys that name a subject rather than narrowing the population. The
# same list surfaceAnchor.ts holds (SUBJECT_FILTERS).
_SUBJECT_FILTERS = ("store", "product", "product_id", "sku", "category")
_SUBJECT_DIMENSIONS = ("store", "product", "category")

_METRIC_TOOL = "get_sales"


def _display(defs: Mapping[str, Any], metric: str) -> str:
    entry = (defs.get("metrics") or {}).get(metric) or {}
    name = entry.get("display_name")
    return str(name).lower() if isinstance(name, str) and name else metric.replace("_", " ")


def _groups(args: Mapping[str, Any]) -> list[str]:
    raw = args.get("group_by")
    if isinstance(raw, str):
        return [raw] if raw else []
    if isinstance(raw, list):
        return [str(g) for g in raw]
    return []


def anchor_of(calls: Iterable[Mapping[str, Any]]) -> Optional[dict]:
    """
    What a turn's reads were about, from their arguments only.

    Returns None when no call is a metric read (the sentence is only written
    for work a refinement can act on). Subjects are the union across calls,
    as on the client; window and comparison are the first metric read's.
    """
    metrics: list[str] = []
    subjects: list[str] = []
    dimension: Optional[str] = None
    window: Optional[str] = None
    compared = False

    for call in calls or []:
        if call.get("tool") != _METRIC_TOOL:
            continue
        args = call.get("arguments") or {}
        metric = args.get("metric") or "net_sales"
        if isinstance(metric, str) and metric not in metrics:
            metrics.append(metric)
        filters = args.get("filters") or {}
        if isinstance(filters, Mapping):
            for key in _SUBJECT_FILTERS:
                v = filters.get(key)
                if isinstance(v, str) and v and v not in subjects:
                    subjects.append(v)
                    dimension = dimension or (
                        "product" if key in ("sku", "product_id") else key)
        for g in _groups(args):
            if g in _SUBJECT_DIMENSIONS:
                dimension = dimension or g
        if window is None and isinstance(args.get("date_range"), str):
            window = args["date_range"]
        if args.get("compare_to"):
            compared = True

    if not metrics:
        return None
    return {
        "metrics": metrics,
        "subjects": sorted(subjects),
        "dimension": dimension,
        "window": window,
        "compared": compared,
    }


def work_sentence(calls: Iterable[Mapping[str, Any]], defs: Mapping[str, Any]) -> Optional[str]:
    """
    One line naming the work the next question refines. Arguments only.
    """
    anchor = anchor_of(calls)
    if anchor is None:
        return None
    names = [_display(defs, m) for m in anchor["metrics"]]
    what = ", ".join(names[:-1]) + (" and " if len(names) > 1 else "") + names[-1]
    where = (
        f" for {', '.join(anchor['subjects'])}" if anchor["subjects"]
        else (f" by {anchor['dimension']}" if anchor["dimension"] else " across the stores")
    )
    when = f", {anchor['window'].replace('_', ' ')}" if anchor["window"] else ""
    against = ", compared with the previous period" if anchor["compared"] else ""
    ops = ", ".join(str(o).replace("_", " ") for o in req(defs, "surface.refinements"))
    return (
        f"[The work in front of the user: {what}{where}{when}{against}. "
        f"A short follow-up — why, compare, products, break it down — REFINES "
        f"this work ({ops}): keep its window, its filters and its comparison "
        f"unless asked otherwise, read only what the refinement needs, and "
        f"call record_findings so the new reads take their place on the same "
        f"surface. A question about a different store, window or business is "
        f"new work.]"
    )


def _whole_words(terms: Iterable[Any], text: str) -> list[str]:
    low = text.lower()
    found: list[str] = []
    for term in terms:
        if not isinstance(term, str) or not term:
            continue
        pattern = r"(?<![\w.])" + re.escape(term.lower()) + r"(?![\w])"
        if re.search(pattern, low):
            found.append(term)
    return found


def leaked_terms(answer: str, defs: Mapping[str, Any]) -> list[str]:
    """The tool and implementation vocabulary present in an answer."""
    return _whole_words(req(defs, "surface.prose.leaks"), answer)


def transaction_synonyms(answer: str, defs: Mapping[str, Any]) -> list[str]:
    """
    Words the definitions do not establish as meaning "transaction", when the
    answer is about transactions at all. An answer that never mentions
    transactions is not read for them: "people" in an answer about suppliers
    is a word, not a translation.
    """
    if not re.search(r"\btransactions?\b", answer, re.IGNORECASE):
        return []
    return _whole_words(req(defs, "surface.prose.transaction_synonyms_not_established"), answer)
