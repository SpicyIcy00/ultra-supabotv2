"""
The deterministic checks a behavioural eval applies to one George turn.

PURE. No model, no database. Every check reads the turn's frames and results
and returns a finding, so the checks themselves can be unit-tested
(tests/test_eval_checks_contract.py) and a false negative can be fixed as a
bug rather than argued about as a judgement.

WHAT IS AND IS NOT CHECKED HERE.

  numeral grounding    every business figure in the prose appears in a row or
                       meta the tools returned — an EVAL, not production
                       enforcement (CLAUDE.md: production does not verify
                       prose numerals).
  attribution math     no "X% of the decline came from Y".
  driver naming        which driver the prose names as stronger, so a
                       scenario can compare it with the rows George read.
  window consistency   every compared call in a round shares one window.
  enumeration          no fan-out of the same call over subjects.
  limitation           the answer says what the reads do not establish.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional

# ---------------------------------------------------------------------------
# Numeral grounding
# ---------------------------------------------------------------------------

_NUMERAL = re.compile(
    r"(?<![\w.])[₱$]?\s?(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?(?P<suffix>[kKmM]\b|%)?"
)
_DATE_PARTS = re.compile(r"\b(?:19|20)\d{2}-\d{2}-\d{2}\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(?:19|20)\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:,\s*(?:19|20)\d{2})?\b|\b(?:19|20)\d{2}\b")


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


@dataclass
class NumeralFinding:
    text: str
    value: float


def ungrounded_numerals(answer: str, results: Iterable[dict],
                        presentation_max: int = 31) -> list[NumeralFinding]:
    """
    Numerals in the prose that no tool result accounts for.

    Harmless numbers are excused: anything inside a date, integers up to
    `presentation_max` (day numbers, "3 of 7 stores", "two rounds"), years,
    and any figure that is a returned number at the precision written —
    including thousands separators, a ₱ sign, a % sign, and k/M scaling. A
    rounded representation of a returned figure is grounded; a figure that
    appears nowhere is not, and is what this exists to catch.
    """
    allowed = allowed_numbers(results)
    # Blank out dates so their digits are not read as figures.
    text = _DATE_PARTS.sub(" ", answer)
    found: list[NumeralFinding] = []
    for m in _NUMERAL.finditer(text):
        raw = m.group("num")
        suffix = (m.group("suffix") or "").lower()
        n = float(raw.replace(",", ""))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if suffix in ("k", "m"):
            n *= 1000 if suffix == "k" else 1_000_000
            # "₱1.49M" is precise to ±5,000; shift the tolerance with the scale.
            decimals -= 3 if suffix == "k" else 6
        if suffix != "%" and n == int(n) and 0 <= n <= presentation_max and decimals == 0:
            continue
        if n in (2024.0, 2025.0, 2026.0, 2027.0):
            continue
        if _matches(n, decimals, allowed):
            continue
        found.append(NumeralFinding(text=m.group(0).strip(), value=n))
    return found


# ---------------------------------------------------------------------------
# Attribution math
# ---------------------------------------------------------------------------

_ATTRIBUTION = [
    re.compile(r"\d+(?:\.\d+)?\s*%\s+of\s+(?:the\s+|that\s+|this\s+)?(?:decline|drop|fall|change|decrease|shortfall|gap|loss|increase|rise|growth|movement|difference)", re.I),
    re.compile(r"(?:accounts?|accounted|accounting)\s+for\s+(?:about\s+|roughly\s+|around\s+)?\d+(?:\.\d+)?\s*%", re.I),
    re.compile(r"(?:explains?|explained|contribut\w+)\s+(?:about\s+|roughly\s+|around\s+)?\d+(?:\.\d+)?\s*%", re.I),
    re.compile(r"\b(?:most|half|two[- ]thirds|three[- ]quarters|a third|a quarter)\s+of\s+(?:the\s+)?(?:decline|drop|fall|change|decrease|shortfall|loss)\s+(?:came from|was|is|comes from|due to|caused by)", re.I),
]


def attribution_claims(answer: str) -> list[str]:
    """Sentences that put a share of the change on a driver — arithmetic no tool computed."""
    return [m.group(0) for rx in _ATTRIBUTION for m in rx.finditer(answer)]


# ---------------------------------------------------------------------------
# Driver naming
# ---------------------------------------------------------------------------

_TX = re.compile(r"\b(transactions?|traffic|footfall|customer count|basket count|fewer (?:customers|baskets|shoppers|people)|more (?:customers|baskets|shoppers|people)|people (?:came in|through the door|coming in)|visits)\b", re.I)
_ATP = re.compile(r"\b(atp|baskets?|basket (?:value|size)|average transaction|transaction value|spend per|per[- ]transaction|per[- ]basket|average basket|spent (?:\w+ ){0,3}(?:more|less)|what each (?:of them )?spent)\b", re.I)
_DRIVER = re.compile(r"\b(driver|drove|driving|driven|explain\w*|account\w*|stronger|dominant|larger (?:move|change|swing|fall|drop|decline|rise)|the (?:main|bigger|biggest|primary) (?:factor|cause|move|contributor)|did the work|carried)\b", re.I)
_BOTH = re.compile(r"\b(both|similar|equally|alike|comparable|neither|roughly the same|about the same|in step|together|no single|not one|close enough|close|near[- ]equal|nearly equal|almost the same|roughly as much|as much (?:\w+ ){0,6}as|won't name|will not name|not name|no dominant|can't separate|cannot separate)\b", re.I)
# A term after a negation is the one being ruled OUT: "traffic is the driver,
# not basket size" names traffic. The negated span is blanked before the
# terms are looked for; the driver word is found on the original sentence.
_NEGATED = re.compile(r"\b(?:not|rather than|instead of|isn't|is not|wasn't|was not|aren't|are not)\b[^,.;:]*", re.I)


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def named_driver(answer: str) -> Optional[str]:
    """
    Which driver the prose names as the stronger measured one:
    'transactions', 'atp', 'both', or None when no driver sentence exists.

    Reads the sentences that speak of a driver. A sentence naming both terms
    and a word like "both"/"similar" is a mixed reading; a sentence naming
    one term beside a driver word names it. Later sentences win over earlier
    ones because a conclusion follows the figures.
    """
    verdict: Optional[str] = None
    for s in _sentences(answer):
        # A driver sentence names a driver word, or contrasts the two terms
        # — "it was footfall, not basket" names one without the word.
        contrast = bool(_TX.search(s) and _ATP.search(s) and _NEGATED.search(s))
        if not _DRIVER.search(s) and not contrast:
            continue
        # "Close enough that I won't name a dominant driver", "neither is the
        # stronger driver": a driver sentence with a mixed word is a mixed
        # reading whether or not it repeats both terms.
        if _BOTH.search(s) and (_DRIVER.search(s) or (_TX.search(s) and _ATP.search(s))):
            verdict = "both"
            continue
        # Blank the negated span so "not basket size" does not name basket size.
        t = _NEGATED.sub(lambda m: " " * len(m.group(0)), s)
        tx, atp = bool(_TX.search(t)), bool(_ATP.search(t))
        if tx and atp:
            # "ATP fell more than transactions, so basket value is the
            # driver": the term nearest the driver word wins — or nearest
            # the negation, in a contrast with no driver word.
            m = _DRIVER.search(s) or _NEGATED.search(s)
            dtx = min((abs(x.start() - m.start()) for x in _TX.finditer(t)), default=10**6)
            datp = min((abs(x.start() - m.start()) for x in _ATP.finditer(t)), default=10**6)
            verdict = "transactions" if dtx < datp else "atp"
        elif tx:
            verdict = "transactions"
        elif atp:
            verdict = "atp"
    return verdict


def stronger_from_rows(tx_change_pct: Optional[float], atp_change_pct: Optional[float],
                       clear_gap: float = 5.0) -> Optional[str]:
    """
    What the rows George read say: the driver with the larger |change_pct|,
    or 'both' when the two are within `clear_gap` points. None when either
    is missing. This is the eval's own arithmetic over tool rows — it never
    reaches the answer.
    """
    if tx_change_pct is None or atp_change_pct is None:
        return None
    a, b = abs(tx_change_pct), abs(atp_change_pct)
    if abs(a - b) < clear_gap:
        return "both"
    return "transactions" if a > b else "atp"


# ---------------------------------------------------------------------------
# Calls: windows, enumeration, comparison
# ---------------------------------------------------------------------------

def _norm_window(dr: Any) -> str:
    if isinstance(dr, (list, tuple)):
        return json.dumps([str(x) for x in dr])
    if isinstance(dr, dict):
        return json.dumps([str(dr.get("start")), str(dr.get("end"))])
    return json.dumps(dr)


def compared_windows(calls: Iterable[dict]) -> set[str]:
    """The distinct windows of every successful get_sales call carrying compare_to."""
    out = set()
    for c in calls:
        if c.get("tool") == "get_sales" and c.get("arguments", {}).get("compare_to") and not c.get("error"):
            out.add(_norm_window(c["arguments"].get("date_range")))
    return out


def enumeration(calls: Iterable[dict], min_subjects: int = 3) -> list[str]:
    """
    Groups of calls that differ ONLY in a subject argument — filters.store,
    filters.sku, filters.product_id, filters.category — with at least
    `min_subjects` distinct values. One grouped call expresses each of them.
    """
    groups: dict[str, set[str]] = {}
    for c in calls:
        args = dict(c.get("arguments") or {})
        filters = dict(args.get("filters") or {})
        subject = None
        for k in ("store", "sku", "product_id", "category"):
            if k in filters:
                subject = f"{k}={filters.pop(k)}"
        if subject is None:
            continue
        args["filters"] = filters
        key = c.get("tool", "") + json.dumps(args, sort_keys=True, default=str)
        groups.setdefault(key, set()).add(subject)
    return [key for key, subjects in groups.items() if len(subjects) >= min_subjects]


def compared_rows(results: Iterable[dict], metric: str, store: Optional[str] = None) -> Optional[dict]:
    """The grand-total compared row for `metric` (and store filter), from the captured results."""
    for r in results:
        if r.get("tool") != "get_sales" or r.get("error"):
            continue
        a = r.get("arguments") or {}
        if a.get("metric", "net_sales") != metric or not a.get("compare_to"):
            continue
        if store is not None and (a.get("filters") or {}).get("store", "").lower() != store.lower():
            continue
        g = a.get("group_by")
        if g not in (None, [], ""):
            continue
        rows = r.get("result", {}).get("rows") or []
        if rows:
            return rows[0]
    return None


# ---------------------------------------------------------------------------
# Limitation / next step
# ---------------------------------------------------------------------------

_LIMITATION = re.compile(
    r"(?:don't|do not|doesn't|does not|can't|cannot|couldn't|could not|won't|isn't|is not|not)\s+(?:\w+\s+){0,4}"
    r"(?:establish|say why|tell (?:you )?why|explain why|show why|determine|answer why|tell (?:us )?what caused|know why)"
    r"|would (?:be|need|take|require) (?:the |a )?(?:next|to)"
    r"|next (?:check|step|useful|read|question|thing)"
    r"|to (?:establish|find out|see why|know why)"
    r"|beyond what (?:the|these) (?:reads|data|figures)"
    r"|(?:the|these) (?:reads|data|figures) (?:don't|do not|can't|cannot) (?:say|show|tell|establish)"
    r"|(?:no|nothing) (?:here|in these reads|in the data) (?:says|shows|tells|establishes)"
    r"|what (?:it|this|these|they|the reads?|the data) (?:doesn't|does not|don't|do not|can't|cannot)(?::|\s)"
    r"|before anyone concludes"
    r"|(?:i|we)'d (?:want|need) (?:the |a )?(?:\w+ ){0,3}(?:before|first)",
    re.I,
)


def limitation_statement(answer: str) -> Optional[str]:
    m = _LIMITATION.search(answer)
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# One turn, summarised
# ---------------------------------------------------------------------------

@dataclass
class Turn:
    question: str
    answer: str
    calls: list[dict] = field(default_factory=list)       # tool_call ∪ tool_result frames
    results: list[dict] = field(default_factory=list)     # captured full results
    notices: list[dict] = field(default_factory=list)
    warnings: list[dict] = field(default_factory=list)
    done: dict = field(default_factory=dict)
    page_context: Optional[dict] = None
    narration: str = ""
    # page_changed frames, in order: a page George created or changed, from
    # the committed result (Page Workshop V1).
    page_changes: list[dict] = field(default_factory=list)

    @property
    def read_calls(self) -> list[dict]:
        return [c for c in self.calls if c.get("tool", "").startswith("get_")]

    @property
    def ok_calls(self) -> list[dict]:
        return [c for c in self.read_calls if not c.get("error")]

    @property
    def page_writes(self) -> list[dict]:
        """The create_page / edit_page calls this turn made, with their outcome."""
        return [c for c in self.calls if c.get("tool") in ("create_page", "edit_page")]

    def history_turns(self) -> list[dict]:
        """This turn as the two history entries the client would replay."""
        calls = [{"tool": c["tool"], "arguments": c["arguments"]}
                 for c in self.ok_calls if c.get("pinnable")]
        return [
            {"role": "user", "text": self.question},
            {"role": "george", "text": self.answer, "tool_calls": calls},
        ]
