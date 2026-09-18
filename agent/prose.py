"""
What the prose says about the figures — decided from digits, not from judgement.

WHY THIS IS IN agent/ AND NOT IN tests/evals/. Every result a turn reads is
drawn beside the answer, whole. A sentence carrying a figure that a drawn row
already holds is saying what the screen already shows, and the voice plan set
the target for such sentences at zero. The 8,623-word prompt asked for it in
three places and got 22%; the 1,793-word prompt asked once and got 19.5%.
Words do not move it, so the loop enforces it the way it enforces the
volunteering cap: one corrective turn, then the answer stands
(metrics.yaml voice.restatement). The evals measured with these functions
first; production now runs the same ones, so the measure and the gate cannot
drift apart.

MATCHED ON DIGITS. ₱110,876.50, 110,877 and 110876.5 are one figure: a prose
numeral matches a returned number when it is that number rounded to the
precision written. Dates, years and integers up to a presentation maximum
("3 of 7 shops", "the 12th") are excused, because they are not figures.

WHAT THIS DOES NOT DO. It does not verify that a figure NOT on the board
came from a tool — ungrounded_numerals in tests/evals/checks.py does that,
as an eval only, and CLAUDE.md rule 9 still says production does not check
prose numerals against rows. This is the opposite direction: a figure that
IS on the board, said again — exactly, rounded off, or with a few of its
members named and the rest counted.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal
from functools import lru_cache
from typing import Any, Iterable

_NUMERAL = re.compile(
    r"(?<![\w.])[₱$]?\s?(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?P<suffix>[kKmM]\b|%)?"
)
_DATE_PARTS = re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:,\s*(?:19|20)\d{2})?\b|\b(?:19|20)\d{2}\b")

#: Integers up to this, with no decimals and no % sign, are counts and day
#: numbers rather than business figures.
PRESENTATION_MAX = 31


def _walk_numbers(obj: Any, out: set[float]) -> None:
    if isinstance(obj, bool):
        return
    # A DECIMAL IS A NUMBER, AND UNTIL 2026-09-14 THIS COULD NOT SEE ONE.
    # Postgres `numeric` arrives as Decimal through psycopg, so every quantity
    # get_purchase_plan returns — `suggested_order_qty`, `units_per_day` — was
    # invisible to every check in this module: a figure George read off a row
    # and quoted exactly was reported as a figure no tool returned. P1.f's run
    # found it, on `order`: "729 units", where the row says
    # suggested_order_qty 729. The loop's own frames are json-safe by then
    # (`_json_safe`) and so is a recorded report, which is why replaying the
    # same answer through the same check said it was clean — the run was
    # reading raw rows and the replay was reading serialized ones.
    #
    # One-way, like every other loosening here: it can only add a number the
    # tools DID return, never remove one.
    if isinstance(obj, (int, float, Decimal)):
        try:
            value = float(obj)
        except (ValueError, OverflowError):
            return
        if math.isfinite(value):                 # a NaN matches nothing anyway
            out.add(value)
    elif isinstance(obj, str):
        # Dates and iso timestamps contribute their parts; numeric strings —
        # including a notice's "12,340.00 PHP" — contribute their value.
        for m in re.finditer(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?", obj):
            try:
                out.add(float(m.group(0).replace(",", "")))
            except ValueError:
                pass
    elif isinstance(obj, dict):
        for v in obj.values():
            _walk_numbers(v, out)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _walk_numbers(v, out)


def allowed_numbers(results: Iterable[dict]) -> set[float]:
    """Every number in every row and meta the tools returned this turn."""
    out: set[float] = set()
    for r in results:
        _walk_numbers(r.get("rows") or [], out)
        _walk_numbers(r.get("meta") or {}, out)
    return out


def _matches(n: float, decimals: int, allowed: set[float]) -> bool:
    """
    A prose numeral matches a returned number if it is that number rounded
    to the precision written: within half a unit of the last digit. Compared
    against the raw value, not a re-rounding of it — Python rounds halves to
    even, and 172,918.5 written as ₱172,919 is a correct rounding.
    """
    tol = 0.5 * 10 ** (-decimals) + 1e-9
    for v in allowed:
        if abs(abs(v) - n) <= tol:
            return True
    return False


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def sentences(answer: str) -> list[str]:
    """Sentences of three words or more; a bare figure or a heading is not one."""
    return [s for s in _sentences(answer) if len(s.split()) >= 3]


def _is_business_figure(n: float, decimals: int, is_percent: bool,
                       presentation_max: int) -> bool:
    """
    Whether a numeral is a figure at all, rather than a day number, a small
    count or a year.

    Shared so that every gate in this module excuses the same things. A check
    that fired on "and 3 others" while the eval called the same numeral
    presentation would be the measure and the gate drifting apart, which is
    the one thing this module exists to prevent.
    """
    if not is_percent and decimals == 0 and n == int(n) and 0 <= n <= presentation_max:
        return False
    if n in (2024.0, 2025.0, 2026.0, 2027.0):
        return False
    return True


def figures(text: str, presentation_max: int = PRESENTATION_MAX) -> list[tuple[float, int]]:
    """(value, decimals) of every business figure in `text`, dates and small counts excused."""
    text = _DATE_PARTS.sub(" ", text)
    out: list[tuple[float, int]] = []
    for m in _NUMERAL.finditer(text):
        raw = m.group("num")
        suffix = (m.group("suffix") or "").lower()
        n = float(raw.replace(",", ""))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if suffix in ("k", "m"):
            n *= 1000 if suffix == "k" else 1_000_000
            decimals -= 3 if suffix == "k" else 6
        if not _is_business_figure(n, decimals, suffix == "%", presentation_max):
            continue
        out.append((n, decimals))
    return out


def restated_sentences(answer: str, results: Iterable[dict]) -> list[str]:
    """Sentences carrying a figure that a returned row or meta already holds."""
    allowed = allowed_numbers(results)
    return [s for s in sentences(answer)
            if any(_matches(n, d, allowed) for n, d in figures(s))]


def unreturned_figures(text: str, allowed: set[float],
                       presentation_max: int = PRESENTATION_MAX) -> list[float]:
    """
    Figures in `text` that no returned number matches — dates, years and small
    counts excused as everywhere else in this module.

    THE ONE CALLER IS A SLOT, NOT THE PROSE (agent/reading.py, 2026-09-14).
    `caveat` and `next` carried no digits at all until today; this is what they
    carry instead, and it is strictly fewer refusals over exactly the same text.
    Nothing here is pointed at the answer's paragraph — CLAUDE.md rule 9's
    "production does not check numerals in prose against rows" is a statement
    about that paragraph and it stays true.
    """
    return [n for n, d in figures(text, presentation_max)
            if not _matches(n, d, allowed)]


#: How much of a drawn figure a prose numeral must keep to count as that figure
#: said badly rather than as a different number. 801 written as 800 keeps two
#: of its own digits and is this defect; written as 1000 it keeps none of them,
#: which is not a rounding of 801 in any useful sense and is left to the eval.
MIN_ECHO_SIGNIFICANT_DIGITS = 2


def _echo_of(n: float, allowed: set[float], min_significant: int) -> float | None:
    """
    The drawn figure `n` is a rounded-off copy of, or None.

    Deterministic: `n` is an echo when some drawn figure, rounded at the tens,
    hundreds or thousands — never so far that fewer than `min_significant`
    digits survive — is exactly `n`. Callers pass only numerals that matched
    nothing at the precision written, so an echo is by construction a figure
    the board holds and the prose got wrong.
    """
    for v in sorted(allowed):                    # sorted: one answer, always
        av = abs(v)
        if av < 10:
            continue
        for k in range(1, len(str(int(av))) - min_significant + 1):
            if round(av, -k) == n:
                return v
    return None


def misstated_figures(answer: str, results: Iterable[dict],
                      min_significant: int = MIN_ECHO_SIGNIFICANT_DIGITS,
                      ) -> list[tuple[str, float, float]]:
    """
    (sentence, written, drawn) for every prose figure that is a drawn figure
    rounded off — the board says 801 and the sentence says 800.

    WHY THIS EXISTS, and it is the more interesting half of restatement.
    `restated_sentences` fires when the prose quotes a drawn figure EXACTLY,
    and the loop then asks for a rewrite. So on 2026-09-13 the two guards were
    complementary in the wrong direction: writing 801 tripped the gate and was
    corrected, and writing 800 tripped nothing and shipped. Imprecision was the
    way PAST the guard, and the further off George was the safer he was from it.

    Same direction as the rest of this module — a figure that IS on the board,
    said again — so it stays inside CLAUDE.md rule 9's line: nothing here asks
    whether a figure absent from the board came from a tool.
    """
    allowed = allowed_numbers(results)
    out: list[tuple[str, float, float]] = []
    for s in sentences(answer):
        for n, d in figures(s):
            if _matches(n, d, allowed):
                continue                          # said exactly: restatement
            drawn = _echo_of(n, allowed, min_significant)
            if drawn is not None:
                out.append((s, n, drawn))
    return out


# ---------------------------------------------------------------------------
# A REMAINDER WORKED OUT IN PROSE — "and 45 others"
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def _remainder_re(tails: tuple[str, ...], leaders: tuple[str, ...]) -> re.Pattern:
    """
    The two shapes a stated remainder takes: a count before a word meaning
    "the rest" ("45 others", "45 other lines"), or after one ("the other 45").

    Built from the vocabulary rather than written out, so the words live in
    metrics.yaml with every other definition and this file holds only the
    grammar of them.
    """
    num = r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
    tail = "|".join(re.escape(t) for t in sorted(tails, key=len, reverse=True))
    lead = "|".join(re.escape(l) for l in sorted(leaders, key=len, reverse=True))
    return re.compile(
        rf"(?<![\w.])(?P<num>{num})\s+(?:{tail})\b"
        rf"|\b(?:{lead})\s+(?P<lead_num>{num})(?![\w.])",
        re.I,
    )


def enumerated_remainders(answer: str, results: Iterable[dict],
                          tails: Iterable[str], leaders: Iterable[str],
                          presentation_max: int = PRESENTATION_MAX,
                          ) -> list[tuple[str, float, str]]:
    """
    (sentence, written, phrase) for every count in the prose that states what
    is LEFT once George decided how many members to name.

    WHY THIS EXISTS, and it is the third way a figure with no receipt reaches
    the screen. Found by the twelve on 2026-09-13:

        "48 sold last week with nothing in the week before (Aji Cuttlefish
         Japanese, Aji Golden Plum, Aji Squid Hokkaido Slices and 45 others)"

    48 is a returned figure. 45 is 48 minus the three he chose to name, and
    the subtraction is his — no row, meta or notice holds it. Neither gate
    above could see it: 45 restates nothing, and it is a rounding of nothing.

    THE CONSTRUCTION IS THE PROOF, NOT THE BOARD. A count that follows "and"
    and precedes "others" is by definition relative to a list the writer
    chose, so no tool can ever have returned it. That is why this does not
    become "production checks numerals against rows": an ordinary ungrounded
    numeral still sails past, exactly as CLAUDE.md rule 9 says it does. What
    fires here is a shape, and rows are consulted only to EXCUSE — a drawn
    delta reading as "45 more" is the board's own figure and is left alone,
    the same way `misstated_figures` excuses an exact match.

    Day numbers, small counts, years and dates are excused as everywhere else
    in this module.
    """
    allowed = allowed_numbers(results)
    pattern = _remainder_re(tuple(tails), tuple(leaders))
    out: list[tuple[str, float, str]] = []
    for s in sentences(answer):
        for m in pattern.finditer(_DATE_PARTS.sub(" ", s)):
            raw = m.group("num") or m.group("lead_num")
            n = float(raw.replace(",", ""))
            decimals = len(raw.split(".")[1]) if "." in raw else 0
            if not _is_business_figure(n, decimals, False, presentation_max):
                continue
            if _matches(n, decimals, allowed):
                continue                          # the board holds it: not his
            out.append((s, n, m.group(0).strip()))
    return out


# ---------------------------------------------------------------------------
# WHAT A DELETION MUST NOT STRAND (P2S.7, 2026-09-18)
# ---------------------------------------------------------------------------

#: A sentence that opens by pointing back at the one before it. Deleting the
#: one before leaves it pointing at nothing: "That's a bookkeeping problem"
#: with its subject gone, 3 of 14 turns in verification/p2s6-gate*.json.
_POINTS_BACK = re.compile(
    r"^(?:that|this|these|those|it|its|it's|they|their|them|such|both|which|"
    r"same|so|the (?:rest|others?|same|remainder)|neither|either|"
    r"(?:and|but|yet) (?:that|this|it|they|those|these)|"
    r"\w+ (?:more|others?|of (?:them|those|these)))\b",
    re.I,
)
#: A sentence that ANNOUNCES what follows it — "Two things I'd act on:",
#: "Two things temper the size of the drop." — and how many it announces.
_COUNT_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "a couple of": 2,
                "a few": 2, "several": 2, "both": 2}
_ANNOUNCES = re.compile(
    r"^(?:the\s+)?(?P<count>two|three|four|five|a couple of|a few|several|both)\b"
    r"(?:\s+\w+){0,3}?\s+(?:things?|points?|lines?|shops?|stores?|products?|reasons?|"
    r"caveats?|changes?|moves?|signals?|findings?|items?|matters?|others?)\b",
    re.I,
)


def _blocks(answer: str) -> list[list[str]]:
    """The answer's sentences, as paragraphs of sentences, in order."""
    return [_sentences(p) for p in re.split(r"\n\s*\n", answer) if p.strip()]


def strands(answer: str, sentence: str) -> bool:
    """
    Whether removing `sentence` from `answer` would leave another sentence
    orphaned — and so whether a deletion gate must leave it standing.

    TWO SHAPES, both measured on the P2S.6 runs:

      pointing back   the sentence after it opens with "That's", "This",
                      "Same product", "Six more" — it is about the one being
                      removed, and would be about nothing.
      announced       a sentence before it announces a number of things to
                      follow ("Two things I'd act on:", a line ending in a
                      colon) and this is one of them: removing it breaks the
                      count the reader was just given.
      opening         it opens a paragraph that goes on: the sentences after
                      it are about what it said.

    A heuristic by construction, and it errs toward KEEPING: a restated figure
    left in is a style miss, a sentence pointing at nothing is a broken answer.
    """
    paras = _blocks(answer)
    target = sentence.strip()
    # A PARAGRAPH'S OPENING SENTENCE CARRIES THE REST OF IT (verification/
    # p2s7-gate-2.json `morning`): the barn's negative F9 count was deleted and
    # "A negative count is a receiving or counting error" was left explaining
    # nothing, and "recount F9" asked for a count nobody had been told of.
    for para in paras:
        if len(para) > 1 and para[0] == target:
            return True
    flat = [s for para in paras for s in para]
    if target not in flat:
        return False
    i = flat.index(target)
    if i + 1 < len(flat) and _POINTS_BACK.match(flat[i + 1].lstrip("*_ -•")):
        return True
    for back in range(1, 6):
        j = i - back
        if j < 0:
            break
        lead = flat[j].lstrip("*_ -•")
        m = _ANNOUNCES.match(lead)
        announced = (_COUNT_WORDS.get(m.group("count").lower(), 1) if m
                     else 1 if lead.rstrip("*_ ").endswith(":") else 0)
        if announced and back <= announced:
            return True
        if announced:
            break
    return False
