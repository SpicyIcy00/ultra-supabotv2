"""
The deterministic checks for HOW Bob talks.

PURE — no model, no database — and additive to checks.py, which holds the
trust checks (numeral grounding, attribution, enumeration). These hold the
voice: how long an answer is, whether it leads with the reading or with a
figure, how many of its sentences restate a figure the board is already
drawing, whether it is one paragraph, and whether it ends with an offer.

They are the measuring stick for the prompt rewrite (plan phase A), so they
exist BEFORE the rewrite and are run on both sides of it. None of them is a
production gate; all of them are unit-tested in
tests/test_eval_checks_contract.py.

WHAT "RESTATES A DRAWN FIGURE" MEANS. Every result a turn reads is drawn
beside the answer, whole. A sentence carrying a figure that a row or meta
of those results holds is therefore saying what the screen already shows.
Matched on digits, so ₱110,876.50, 110,877 and 110876.5 are one figure
(the method that measured 16% → 0% on 2026-09-11).
"""

from __future__ import annotations

import re
from typing import Any, Iterable

from agent import prose
from agent.prose import _DATE_PARTS, _NUMERAL, _sentences, allowed_numbers, _matches  # noqa: F401


def word_count(answer: str) -> int:
    return len(answer.split())


def sentences(answer: str) -> list[str]:
    """Sentences of three words or more; a bare figure or a heading is not one."""
    return [s for s in _sentences(answer) if len(s.split()) >= 3]


def paragraphs(answer: str) -> int:
    return len([p for p in re.split(r"\n\s*\n", answer.strip()) if p.strip()])


def _figures(text: str, presentation_max: int = 31) -> list[tuple[float, int]]:
    """(value, decimals) of every business figure in `text`, dates and small counts excused."""
    return prose.figures(text, presentation_max)


def _figures_here(text: str, presentation_max: int = 31) -> list[tuple[float, int]]:  # pragma: no cover — superseded
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
    """Sentences carrying a figure that a returned row or meta already holds — the production gate's own function."""
    return prose.restated_sentences(answer, results)


def figure_sentences(answer: str) -> list[str]:
    """Sentences carrying any business figure at all."""
    return [s for s in sentences(answer) if _figures(s)]


def leads_with_reading(answer: str) -> bool:
    """
    The first sentence says what it means, not what the number is.

    A figure in the opening sentence is the dashboard habit — "Net sales were
    ₱1,777,622" — and the voice puts the reading first, the figure on the
    board. An opening that is a caveat or a correction still counts as a
    reading: it carries no figure.
    """
    first = sentences(answer)
    return bool(first) and not _figures(first[0])


def closing_offers(answer: str) -> int:
    """Questions in the LAST paragraph — the "shall I…?" beat. One is the voice; several is a menu."""
    last = [p for p in re.split(r"\n\s*\n", answer.strip()) if p.strip()]
    if not last:
        return 0
    return sum(1 for s in _sentences(last[-1]) if s.rstrip().endswith("?"))


def voice_findings(answer: str, results: Iterable[dict], notices: int) -> dict[str, Any]:
    """Everything the voice evals record for one turn, in one place."""
    ss = sentences(answer)
    restated = restated_sentences(answer, results)
    return {
        "words": word_count(answer),
        "sentences": len(ss),
        "paragraphs": paragraphs(answer),
        "figure_sentences": len(figure_sentences(answer)),
        "restated_sentences": len(restated),
        "restated_share": round(len(restated) / len(ss), 2) if ss else 0.0,
        "leads_with_reading": leads_with_reading(answer),
        "closing_offers": closing_offers(answer),
        "notices": notices,
        # What the voice allows: one paragraph, plus one per caveat it carries.
        "paragraph_budget": 1 + notices,
    }
