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
IS on the board, said again.
"""

from __future__ import annotations

import re
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
    if isinstance(obj, (int, float)):
        out.add(float(obj))
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
        if suffix != "%" and n == int(n) and 0 <= n <= presentation_max and decimals == 0:
            continue
        if n in (2024.0, 2025.0, 2026.0, 2027.0):
            continue
        out.append((n, decimals))
    return out


def restated_sentences(answer: str, results: Iterable[dict]) -> list[str]:
    """Sentences carrying a figure that a returned row or meta already holds."""
    allowed = allowed_numbers(results)
    return [s for s in sentences(answer)
            if any(_matches(n, d, allowed) for n, d in figures(s))]


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
