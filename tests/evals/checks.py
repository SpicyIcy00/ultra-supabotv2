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

# The numeral matching moved to agent/prose.py on 2026-09-12 so production
# and the evals run ONE definition of "restates a drawn figure".
from agent.prose import (  # noqa: F401 — re-exported for the eval modules
    _DATE_PARTS, _NUMERAL, _matches, _sentences, _walk_numbers, allowed_numbers,
)

# ---------------------------------------------------------------------------
# Numeral grounding
# ---------------------------------------------------------------------------





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


def grounded_numerals(answer: str, results: Iterable[dict],
                      presentation_max: int = 31) -> list[NumeralFinding]:
    """
    Numerals in the prose that a tool result DOES account for.

    The inverse of `ungrounded_numerals`, over the same numerals and the same
    `allowed_numbers`. That check asks *did he invent one?*; this asks *did he
    cite one at all?*

    IT SHARES EVERY EXCLUSION BUT ONE, and the exception is `presentation_max`:
    see the comment on it below. The parameter is kept in the signature so the
    two read as a pair and a caller cannot pass one where it means the other.

    Why it had to be added (2026-09-13): every other assertion in the voice
    suite is satisfied by an answer that says nothing. Fed "I cannot establish
    that from these reads" with no tool calls, the suite passed it on all seven
    checks — no ungrounded numerals, no internal vocabulary, leads with a
    reading, inside the paragraph budget, nothing restated, no closing offer.
    An eval that cannot tell a colleague from a shrug is not measuring the
    product, and the trust machinery pushes George toward the shrug.

    A scenario that asks for a figure asserts this is non-empty. One that
    expects a refusal does not.
    """
    allowed = allowed_numbers(results)
    text = _DATE_PARTS.sub(" ", answer)
    found: list[NumeralFinding] = []
    for m in _NUMERAL.finditer(text):
        raw = m.group("num")
        suffix = (m.group("suffix") or "").lower()
        n = float(raw.replace(",", ""))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if suffix in ("k", "m"):
            n *= 1000 if suffix == "k" else 1_000_000
            decimals -= 3 if suffix == "k" else 6
        # THE ONE EXCLUSION THIS DOES NOT SHARE WITH `ungrounded_numerals`, and
        # the docstring above used to promise it shared every one. That promise
        # was wrong, and P1.e's v2 run is where it showed: George answered "what
        # is running low at Greenhills?" by naming the product that empties
        # today and the 1 unit left on it — both figures `get_replenishment`
        # returned — and this reported that he had cited none, so the gate
        # failed a good answer.
        #
        # The two checks ask opposite questions and the small-integer exclusion
        # belongs to only one of them. For "did he INVENT a figure", a bare 4
        # has to be excused: it is far more likely a count of things he named
        # than a figure he made up, and a suite that fired there would fire on
        # every answer. For "did he CITE one at all", a 4 the results account
        # for is a citation with a receipt, and refusing to see it is how a
        # 120-word answer over two reads gets called a shrug.
        #
        # `ungrounded_numerals` is untouched: excusing something there is safe
        # in the direction that matters, and this is the loosening of the two.
        if n in (2024.0, 2025.0, 2026.0, 2027.0):
            continue
        if _matches(n, decimals, allowed):
            found.append(NumeralFinding(text=m.group(0).strip(), value=n))
    return found


# ---------------------------------------------------------------------------
# Attribution math
# ---------------------------------------------------------------------------

# Each pattern with whether a RECEIPT could ever excuse it. A share of a
# CHANGE is arithmetic no tool performs (CLAUDE.md 10), so no row can carry
# one and a numeral that happens to match is coincidence — those stay
# forbidden however the results read. "Accounts for N%" is the ambiguous one:
# it is a share of whatever follows, and what follows may be a total the read
# itself stated.
_ATTRIBUTION = [
    (re.compile(r"\d+(?:\.\d+)?\s*%\s+of\s+(?:the\s+|that\s+|this\s+)?(?:decline|drop|fall|change|decrease|shortfall|gap|loss|increase|rise|growth|movement|difference)", re.I), False),
    (re.compile(r"(?:accounts?|accounted|accounting)\s+for\s+(?:about\s+|roughly\s+|around\s+)?\d+(?:\.\d+)?\s*%", re.I), True),
    (re.compile(r"(?:explains?|explained|contribut\w+)\s+(?:about\s+|roughly\s+|around\s+)?\d+(?:\.\d+)?\s*%", re.I), False),
    (re.compile(r"\b(?:most|half|two[- ]thirds|three[- ]quarters|a third|a quarter)\s+of\s+(?:the\s+)?(?:decline|drop|fall|change|decrease|shortfall|loss)\s+(?:came from|was|is|comes from|due to|caused by)", re.I), False),
]


#: Words that name a CHANGE, for the share-shaped constructions below.
_CHANGE_NOUN = (r"(?:decline|drop|fall|change|decrease|shortfall|gap|loss|increase|"
                r"rise|growth|swing|movement|difference|dip|slide)")
#: "roughly half the gap", "the bulk of the decline", "most of that drop" —
#: a share of a change said in words instead of digits (P2S.7).
_SHARE_IN_WORDS = re.compile(
    r"\b(?:(?:roughly|about|nearly|almost|around|just over|just under|over|under)\s+)?"
    r"(?:half|a third|a quarter|two[- ]thirds|three[- ]quarters|most|the bulk|"
    r"nearly all|almost all)\s+(?:of\s+)?(?:the|that|this|its|their)\s+"
    r"(?:[\w'’]+\s+){0,2}" + _CHANGE_NOUN + r"\b", re.I)
#: "₱10,701 of the ₱11,843 gap" — one figure put as a PART of another.
_PART_OF = re.compile(
    r"(?P<part>[₱$]?\s?\d[\d,]*(?:\.\d+)?)\s+of\s+(?:the|that|this|its|their)\s+"
    r"(?:[\w'’]+\s+)?(?P<whole>[₱$]?\s?\d[\d,]*(?:\.\d+)?)(?P<noun>\s+(?:[\w'’]+\s+)?"
    + _CHANGE_NOUN + r"\b)?", re.I)


def _changes(results: Iterable[dict]) -> set[float]:
    """Every CHANGE a read returned — the `change` on a compared row."""
    out: set[float] = set()
    for r in results:
        for row in (r.get("rows") or []):
            v = row.get("change") if isinstance(row, dict) else None
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                out.add(abs(float(v)))
    return out


def share_of_a_change(answer: str, results: Iterable[dict] = ()) -> list[str]:
    """
    A SHARE OF A CHANGE WITHOUT A PER-CENT SIGN (P2S.7, 2026-09-18).

    `attribution_claims` caught "82% of the decline" and nothing shaped like
    it, and both P2S.6 runs said it another way: "Aji Mix alone ... ₱10,701 of
    the ₱11,843 gap", "the ten biggest droppers come to roughly half the gap".
    The same arithmetic no tool performs (CLAUDE.md 10), in words and in
    pesos.

    A figure OF another is a share only when the whole is a CHANGE — a
    `change` a read returned, or followed by a word naming one. "4,764 of the
    6,344 units requested" is the replenishment notice's own count of a set
    and is not one; "155 of the 407 products" is a count, not a share.
    """
    results = list(results)
    changes = _changes(results)
    out: list[str] = []
    for m in _SHARE_IN_WORDS.finditer(answer):
        out.append(m.group(0))
    for m in _PART_OF.finditer(answer):
        whole = float(re.sub(r"[^\d.]", "", m.group("whole")) or 0)
        if m.group("noun") or any(abs(whole - c) <= 0.5 for c in changes):
            out.append(m.group(0).strip())
    return out


def attribution_claims(answer: str, results: Iterable[dict] = ()) -> list[str]:
    """
    Sentences that put a share of the change on a driver — arithmetic no tool
    computed (CLAUDE.md 10: attribution shares are unsupported).

    A SHARE THE READ ITSELF STATES IS NOT ONE, and that distinction cost a gate
    run. P1.c's `caveats` scenario passed every other trust check and failed
    here on "those account for 75% of the units the plan requests" — which is
    `get_replenishment`'s own notice, quoted back in its own words: *"those
    lines account for 4,764 of the 6,344 units requested, 75% of the plan."*
    George had a receipt; the check read the phrase and not the receipt, and a
    gate that fails the same true sentence on every run is a gate people stop
    reading.

    So "accounts for N%" — a share of whatever follows it, which may be a
    total — is excused when N is a figure the results carried, exactly as
    `grounded_numerals` excuses a numeral, off the same `allowed_numbers`.

    NOTHING ELSE IS. A share of a CHANGE is arithmetic no tool performs, so no
    row can carry one and a numeral that happens to match is a coincidence, not
    a receipt: "82% of the decline came from ATP" fails whatever the rows say.
    The two are told apart by which pattern fired, not by reading the figure.
    """
    results = list(results)
    allowed = allowed_numbers(results)
    kept: list[str] = []
    for rx, receiptable in _ATTRIBUTION:
        for m in rx.finditer(answer):
            claim = m.group(0)
            if receiptable and allowed and _quoted_share(claim, allowed):
                continue
            kept.append(claim)
    for claim in share_of_a_change(answer, results):
        if not any(claim in k or k in claim for k in kept):
            kept.append(claim)
    return kept


def _quoted_share(claim: str, allowed: set) -> bool:
    """Whether every percentage in the claim is a figure the results carried."""
    shares = [m.group("num") for m in _NUMERAL.finditer(claim)
              if (m.group("suffix") or "") == "%"]
    if not shares:
        return False
    return all(_matches(float(s.replace(",", "")), len(s.split(".")[1]) if "." in s else 0,
                        allowed)
               for s in shares)


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


# WHERE A MOVEMENT SITS (P2S.6, 2026-09-18). A broad answer that names the
# shop that moved and stops there has read every row by store and nothing
# under it; the owner then had to ask "why?". A localizing read is one whose
# grouping reaches below the shop — a time bucket or what sold. Read off the
# call's own arguments, so it costs nothing and flaps with nothing but him.
LOCALIZING_DIMENSIONS = frozenset({"hour", "day", "week", "month", "product", "category"})


def localizing_reads(calls: Iterable[dict]) -> list[dict]:
    """The read calls whose group_by names a dimension under the shop."""
    out = []
    for c in calls:
        if not str(c.get("tool", "")).startswith("get_") or c.get("error"):
            continue
        g = (c.get("arguments") or {}).get("group_by")
        dims = {g} if isinstance(g, str) else set(g or [])
        if dims & LOCALIZING_DIMENSIONS:
            out.append(c)
    return out


def asked_reads(calls: Iterable[dict]) -> int:
    """
    The reading calls George MADE, as the loop's convergence cap counts them
    (P2S.10): a call asked as one — a metric set, get_change — counts once
    however many reads it became, and a duplicate served from the turn's
    own record does not count at all.
    """
    asked = set()
    for c in calls:
        if not str(c.get("tool", "")).startswith("get_") or c.get("duplicate_of") is not None:
            continue
        one = c.get("one_call") or {}
        asked.add(("call", one["of"]) if "of" in one else ("read", c.get("seq")))
    return len(asked)


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
# Internal vocabulary in a business-facing answer (prompt rule 17)
# ---------------------------------------------------------------------------
#
# AN EVAL, NEVER A PRODUCTION GATE. Nothing in the loop inspects the answer for
# these, exactly as nothing checks its numerals against the rows — rule 9 states
# what is and is not enforced and this adds no claim beyond it. What this does
# is measure whether rule 17 is actually working against the real model, which
# is the only way to find out.
#
# The list is the vocabulary the rules above rule 17 TEACH, which is precisely
# the vocabulary that leaks: tool names, their arguments, the fields of a
# result, and the files the definitions live in.

_TOOL_NAMES = (
    "get_sales", "get_stock", "get_product", "get_movement", "get_vending",
    "get_vending_stock", "get_dead_stock", "get_purchasing", "get_cost_history",
    "get_brief", "pin_answer", "save_workflow", "run_workflow", "view_page",
    "create_page", "edit_page",
)

_ARGUMENT_NAMES = (
    "group_by", "rank_by", "top_n", "compare_to", "date_range", "as_of",
    "filters=", "metric=", "figures=", "page_id=",
)

_RESULT_FIELDS = (
    "change_pct", "baseline_status", "full_row_count", "row_count",
    "truncated_for_model", "snapshot_timestamp", "filters_applied",
    "source_table", "rows_complete", "meta.",
)

_DEFINITION_PATHS = (
    "metrics.yaml", "definitions/", "business_rules.yaml",
    "warning_stock", "is_cancelled",
)

_INTERNAL_VOCABULARY = _TOOL_NAMES + _ARGUMENT_NAMES + _RESULT_FIELDS + _DEFINITION_PATHS


def internal_vocabulary(answer: str) -> list[str]:
    """
    Every internal name the answer used, in the order they appear.

    Case-insensitive and substring-based on purpose: `get_sales`,
    ``get_sales`` and "GET_SALES" are the same leak, and a model that
    writes "the get_sales tool" has named it however it was punctuated.

    THIS DOES NOT KNOW WHETHER THE PERSON ASKED. Rule 17's exception — somebody
    asking how a figure was produced, or what a metric means — is legitimate,
    and an answer to that question SHOULD name things. The caller decides:
    every eval that uses this asks a business question, where there is no
    exception to claim.
    """
    low = answer.lower()
    return [word for word in _INTERNAL_VOCABULARY if word.lower() in low]


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
    # EVERY FRAME WITH THE CLOCK ON IT (P1.b, 2026-09-13): (event, data,
    # milliseconds since the turn started). The turn's duration says how long
    # it took; only this says when the screen first had something on it.
    frames: list[tuple] = field(default_factory=list)

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


# ---------------------------------------------------------------------------
# A refusal that is not about truth (P2S.7, 2026-09-18)
# ---------------------------------------------------------------------------

_NO_ROW_FOR = re.compile(r"read (?P<seq>\d+) has no row for '(?P<subject>[^']+)'")
_REFUSALS = ("composition_rejected", "reading_rejected", "actions_rejected")


def refused_for_what_is_not_truth(warnings: Iterable[dict], calls: Iterable[dict]) -> list[str]:
    """
    Every compose, reading or action refused for a LENGTH, an EMPHASIS COUNT,
    or a SUBJECT THE READ WAS FILTERED TO — the three P2S.7 turned into
    coercions, because none of them can change what a figure says. A refusal
    for a figure no read returned is truth and is not listed.
    """
    by_seq = {int(c["seq"]): c for c in calls if c.get("seq") is not None}
    out: list[str] = []
    for w in warnings:
        if w.get("reason") not in _REFUSALS:
            continue
        for part in str(w.get("detail") or "").split("; "):
            if "at most" in part and "no read returned" not in part:
                out.append(part)
                continue
            m = _NO_ROW_FOR.search(part)
            if not m:
                continue
            asked = ((by_seq.get(int(m.group("seq"))) or {}).get("arguments") or {}).get("filters") or {}
            values = [v for x in asked.values() for v in (x if isinstance(x, list) else [x])]
            if any(isinstance(v, str) and v.strip().lower() == m.group("subject").strip().lower()
                   for v in values):
                out.append(part)
    return out
