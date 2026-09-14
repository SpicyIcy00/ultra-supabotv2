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
        f"call compose so the new reads take their place on the same "
        f"surface. A question about a different store, window or business is "
        f"new work.]"
    )


# ---------------------------------------------------------------------------
# The desk: what the person selected, and the window they moved to
#
# The selection is a set of subjects a person picked on the workspace — ids
# and labels off rows the tools returned — and it reaches the model the same
# way the work sentence does: on the QUESTION, in words, never in the cached
# prefix and never as a figure. A label is quoted and neutralised (one line,
# no brackets) because it is client-supplied text, exactly like the question.
# ---------------------------------------------------------------------------

_LABEL_MAX = 80
_NOUN = {"store": "store", "product": "product", "category": "category"}


def _clean_label(value: Any) -> str:
    text = " ".join(str(value if value is not None else "").split())
    text = text.replace("[", "(").replace("]", ")").replace("'", "’")
    return text[:_LABEL_MAX]


def _subject_words(dimension: str, subjects: list[Mapping[str, Any]]) -> str:
    parts: list[str] = []
    for s in subjects:
        label = _clean_label(s.get("label"))
        if not label:
            continue
        ident = " ".join(str(s.get("id") or "").split())[:64]
        # A store is named to the tools by its display name; a product's name
        # may be three products, so its id travels with it.
        if dimension == "product" and ident:
            parts.append(f"'{label}' (product_id {ident})")
        else:
            parts.append(f"'{label}'")
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def _window_words(window: Mapping[str, Any]) -> Optional[str]:
    if window.get("kind") == "preset" and isinstance(window.get("name"), str):
        return window["name"].replace("_", " ")
    start, end = window.get("start"), window.get("end")
    if isinstance(start, str) and isinstance(end, str):
        return f"{start} to {end}"
    return None


def _names(labels: list[str]) -> str:
    """A list of names, in words. Cleaned like every other client-supplied label."""
    parts = [_clean_label(x) for x in labels]
    parts = [p for p in parts if p]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


_ATTENTION_WORDS = {
    "against_the_majority": "moved against the way the rest moved",
    "ranked_first": "is the largest measured change",
}


def _drawn_words(drawn: Mapping[str, Any], defs: Mapping[str, Any]) -> Optional[str]:
    """
    What is on screen, in words: the representation, the subjects and the
    metric. Every value is checked against the definitions' own vocabularies
    before it is repeated, so a client cannot put a sentence of its own into
    George's context by naming a representation that does not exist.
    """
    kinds = [str(k) for k in req(defs, "surface.desk.representation.kinds")]
    dims = [str(d) for d in req(defs, "surface.desk.selection.dimensions")]
    cap = int(req(defs, "surface.desk.context.max_drawn_subjects"))

    representation = drawn.get("representation")
    dimension = drawn.get("dimension")
    subjects = [x for x in (drawn.get("subjects") or []) if isinstance(x, str)][:cap]
    metric = _clean_label(drawn.get("metric_label")) if drawn.get("metric_label") else ""

    if representation not in kinds:
        representation = None
    if dimension not in dims:
        dimension = None
    if representation is None and not subjects and not metric:
        return None

    said = "the workspace is showing"
    if metric:
        said += f" {metric}"
    if dimension and subjects:
        noun = _NOUN.get(dimension, dimension)
        plural = "" if len(subjects) == 1 else "s"
        said += f" for the {noun}{plural} {_names(subjects)}"
    elif dimension:
        said += f" by {_NOUN.get(dimension, dimension)}"
    if drawn.get("compared") is True:
        said += ", compared with the period before"
    if representation:
        said += f" (drawn as {representation})"
    return said


def _attention_words(marks: list[Any], defs: Mapping[str, Any]) -> Optional[str]:
    """What the data has already singled out, by subject and trusted reason."""
    allowed = [str(r) for r in req(defs, "surface.desk.context.attention_reasons")]
    cap = int(req(defs, "surface.desk.context.max_attention"))
    by_reason: dict[str, list[str]] = {}
    for m in marks[:cap]:
        if not isinstance(m, Mapping):
            continue
        reason = m.get("reason")
        subject = _clean_label(m.get("subject"))
        if reason not in allowed or not subject:
            continue
        names = by_reason.setdefault(str(reason), [])
        if subject not in names:
            names.append(subject)
    said = [
        f"{_names(names)} {_ATTENTION_WORDS[reason]}"
        for reason, names in by_reason.items()
        if reason in _ATTENTION_WORDS and names
    ]
    if not said:
        return None
    return "the figures already single out " + "; ".join(said)


def _recommendation_words(rec: Mapping[str, Any], defs: Mapping[str, Any]) -> Optional[str]:
    """The move already offered, so it is not offered again under another name."""
    grounds = [str(g) for g in req(defs, "surface.desk.initiative.recommend.grounded_in")]
    if rec.get("ground") not in grounds:
        return None
    question = _clean_label(rec.get("question")) if rec.get("question") else ""
    if not question:
        return "the workspace has already offered a next move"
    return f"the workspace has already offered the next move '{question}'"


def board_sentence(board: Optional[Any], defs: Mapping[str, Any]) -> Optional[str]:
    """
    One line naming WHAT IS ON THE BOARD, so a fragment has something to land on.

    "Why?" "Products." "These two." "Last month." — the shortest and most
    natural things a person says — were resolved against the TRANSCRIPT until
    2026-09-10, because that was all George could see. That worked while the
    screen was the last answer and stopped working the moment the board could
    hold six things at once: "why?" meant the last thing said, not the thing
    being looked at.

    So the board travels with the question, as names and closed vocabulary:

      key       the object's own key, which George chose when he composed it
      kind      one of composition.widgets, or composition.composed_kind
                for a shape he composed himself
      weight    one of composition.weights — which of them is LEADING
      about     the subject it is drawn for, a value off a row of its read
      measure   the metric's display name, from the definitions
      window    the window that read was taken over

    NOTHING HERE IS A FIGURE. Not a value, not a change, not a count of rows.
    George is told what he is looking at and what each object is FOR; every
    number he says still comes from a tool result he can point at.

    The key matters more than it looks: naming it is what lets a follow-up
    CHANGE the object the person means instead of putting a second one beside
    it. Without the key on this line, "products" could only ever be a new
    object, and the board would grow every time it was steered.
    """
    if not isinstance(board, (list, tuple)) or not board:
        return None

    voc = req(defs, "composition")
    # A COMPOSED SHAPE IS ON THE BOARD TOO. Its kind is `composed_kind`, which
    # is not a widget — and until 2026-09-14 this line skipped it, so a board
    # whose LEADING object was a shape George composed said nothing about the
    # thing being looked at and "why?" landed on a quiet table beside it. The
    # kind still comes from the definitions, so a made-up one is still ignored.
    # AND A KIND THE BOARD STILL CARRIES FROM BEFORE P1.f. The vocabulary
    # narrowed to the six marks; a board composed before that still holds
    # `hero` and `comparison`, and a board George cannot describe is a board
    # "why?" lands on the wrong object of.
    kinds = (set(req(voc, "widgets")) | {str(req(voc, "composed_kind"))}
             | set(voc.get("retired_kinds") or []))
    weights = set(req(voc, "weights"))
    limit = int(req(voc, "max_objects"))

    said: list[str] = []
    for obj in list(board)[:limit]:
        if not isinstance(obj, Mapping):
            continue
        key = _clean_label(obj.get("key"))
        kind = obj.get("kind")
        if not key or kind not in kinds:
            continue
        weight = obj.get("weight") if obj.get("weight") in weights else None
        shape = [str(kind)]
        if weight == "lead":
            shape.append("LEADING")
        elif weight == "quiet":
            shape.append("quiet")
        line = f"{key} ({', '.join(shape)})"
        about = [_clean_label(obj.get(field)) for field in ("about", "measure", "window")]
        about = [a for a in about if a]
        if about:
            line += " — " + ", ".join(about)
        said.append(line)

    if not said:
        return None
    return (
        "[On the board: " + "; ".join(said) + ". A short instruction — why, "
        "products, compare these, last month, not that — applies to what is on "
        "the board: resolve it against the LEADING object unless something is "
        "selected, and change that object by its own KEY rather than putting a "
        "second one beside it. Answer from what is already there when it holds "
        "the answer. Nothing on this line is a figure.]"
    )


def desk_sentence(desk: Optional[Mapping[str, Any]], defs: Mapping[str, Any]) -> Optional[str]:
    """
    One line naming what the person is looking at.

    WHAT IT SAYS AND WHY. Until 2026-09-09 this returned None unless something
    was selected or a window had been moved, so a question asked from a full
    workspace with nothing clicked told George nothing about what was on
    screen. Short steers refer to the WORKSPACE — "show me", "is that
    actually bad?", "what would you do?" — and they had no referent at all.

    Four things now travel, and every one of them is a name, a count or a word
    from a vocabulary declared in metrics.yaml (surface.desk.context):

      drawn           the representation, the metric, the subjects on screen
      selection       what the person has clicked, ids off rows
      attention       what the tools' own rows singled out, by trusted reason
      recommendation  the move already offered, by its ground

    NOTHING HERE IS A FIGURE, and every value is checked against the
    definitions before it is repeated. George is told what he is looking at;
    he still reads every number from a tool result.
    """
    if not desk:
        return None
    dims = list(req(defs, "surface.desk.selection.dimensions"))
    parts: list[str] = []

    drawn = desk.get("drawn")
    if isinstance(drawn, Mapping):
        words = _drawn_words(drawn, defs)
        if words:
            parts.append(words)

    sel = desk.get("selection") or {}
    dimension = sel.get("dimension") if isinstance(sel, Mapping) else None
    subjects = [s for s in ((sel.get("subjects") or []) if isinstance(sel, Mapping) else [])
                if isinstance(s, Mapping)]
    if dimension in dims and subjects:
        words = _subject_words(dimension, subjects)
        if words:
            noun = _NOUN.get(dimension, dimension)
            plural = "" if len(subjects) == 1 else "s"
            parts.append(f"the user has selected the {noun}{plural} {words} on the surface")

    marks = desk.get("attention")
    if isinstance(marks, list):
        words = _attention_words(marks, defs)
        if words:
            parts.append(words)

    rec = desk.get("recommendation")
    if isinstance(rec, Mapping):
        words = _recommendation_words(rec, defs)
        if words:
            parts.append(words)

    window = desk.get("window")
    if isinstance(window, Mapping):
        when = _window_words(window)
        if when:
            parts.append(f"the work above was re-read for {when}, which is now its window")

    if not parts:
        return None
    return (
        "[On the desk: " + "; ".join(parts) + ". A short instruction — why, show "
        "me, compare these, products, what would you do — applies to THIS work: "
        "read for these subjects by name, keep the work's window and comparison, "
        "answer from figures already on the surface where they hold the answer, "
        "and record findings for any new read so it joins the same surface.]"
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


# Where one clause stops and the next begins: punctuation, a spaced dash, or a
# coordinating conjunction. A negation does not reach across one of these, and
# that is what separates "nobody counts people" from "Rockwell didn't grow, but
# customers were up" — same distance in words, different clause.
_CLAUSE_BREAK = re.compile(
    r"[.!?\n,;:]"
    r"|\s[-–—]\s"
    r"|\b(?:but|and|so|yet|while|whereas|though|although|because)\b",
    re.IGNORECASE,
)


def _disclaimed(before: str, markers: set[str], window: int) -> bool:
    """
    Whether the words just before a term negate it.

    The lookback is the CLAUSE the term sits in, not the sentence. A sentence
    is too wide — "this was footfall through the till, not bigger purchases"
    has a negator in it, and it belongs to the purchases — and a plain
    distance in words is too blunt, because "didn't grow, but customers" puts
    the negator exactly as close as "nobody counts people" does. What tells
    them apart is the comma and the "but".

    `window` is a bound on top of that, not the mechanism: it stops a very
    long clause from being cleared by a negator at the far end of it.
    """
    clause = _CLAUSE_BREAK.split(before)[-1]
    return any(token in markers
               for token in re.findall(r"[\w']+", clause.lower())[-window:])


def transaction_synonyms(answer: str, defs: Mapping[str, Any]) -> list[str]:
    """
    Words the definitions do not establish as meaning "transaction", when the
    answer is about transactions at all. An answer that never mentions
    transactions is not read for them: "people" in an answer about suppliers
    is a word, not a translation.

    A USE THAT DENIES THE TRANSLATION IS NOT A LEAK. Asked for foot traffic,
    George answered "I can't see foot traffic anywhere — nobody counts people
    through the door, only tills… that's sales made, not people who walked
    in", which is the trust rules working exactly as written — and he was
    recorded as having leaked "people" and "traffic" for saying so. A check
    that fires on the refusal it most wants trains the refusal out.

    So a term is kept only when at least ONE of its uses stands undenied. Every
    use disclaimed is an answer being careful; one bare use is still a leak,
    which is what keeps "this was footfall through the till" — calling
    transactions footfall — reported. See surface.prose.negation_markers.
    """
    if not re.search(r"\btransactions?\b", answer, re.IGNORECASE):
        return []
    markers = {str(m).lower()
               for m in req(defs, "surface.prose.negation_markers")}
    window = int(req(defs, "surface.prose.negation_window_words"))
    low = answer.lower()

    found: list[str] = []
    for term in req(defs, "surface.prose.transaction_synonyms_not_established"):
        if not isinstance(term, str) or not term:
            continue
        pattern = r"(?<![\w.])" + re.escape(term.lower()) + r"(?![\w])"
        uses = list(re.finditer(pattern, low))
        if uses and not all(
            _disclaimed(answer[:use.start()], markers, window) for use in uses
        ):
            found.append(term)
    return found
