"""
The reading's three slots — claim, caveat, next — and what each may carry.

WHAT THIS REPLACES. Until 2026-09-14 the second statement a `compose` carried
was a set of ROLES on reads: primary, driver, breakdown, context
(agent/findings.py). The roles were validated exhaustively, recorded on the
frame, stored on the post — and the room drew none of them. They were the
model's channel for saying what a read MEANT, spent entirely on a vocabulary
the screen had stopped speaking, and George paid a schema and a dozen items of
it on every turn. P1.f swaps the channel for the one the screen does draw:
what he SAYS, in three slots instead of one paragraph.

WHAT THE MODEL SUPPLIES, EXACTLY. Three short strings, none of them required:

    {"claim": "OPUS added more than the next two shops together",
     "caveat": "Basket value fell at Magnolia and North Edsa even as takings rose",
     "next": "Draft the Seikyo order — three of the five lines are theirs"}

WHY THIS IS NOT A HOLE IN RULE 9. A figure is still bound, never authored:

  `claim` IS THE ANSWER'S OWN WORDS. It is not drawn as a sentence of its
  own — it is a HIGHLIGHT. The surface finds those words in what George
  actually said and lights them there, and a claim that does not appear in the
  answer is dropped rather than drawn. So the channel cannot put a character on
  screen that the answer does not already carry, and the answer is governed by
  everything that has always governed it (voice.restatement, the notice gates,
  the remainder gate).

  `caveat` AND `next` CARRY ONLY A FIGURE A READ RETURNED, checked here
  (`figures: returned`, 2026-09-14). They carried no digits at all until then,
  and the rule made George vaguer than his evidence: "44 of 118 products have
  no figure on one side" — a count `meta.comparison.not_ranked` returned — was
  refused, and "roughly half" was what fitted. Three recorded runs refused 0, 6
  and 8 slots for it, every one of them a true qualification of the figures
  below it. What is still refused is the thing worth refusing: a number no read
  returned, which is George doing arithmetic on the board. Dates and small
  counts are not figures and never were.

  A BLOCK'S `claim` IS UNCHANGED and still carries no digits at all
  (agent/compose.py). That one IS an annotation — it titles a mark that draws
  the figure underneath it — and CLAUDE.md's bound on an annotation holds
  exactly there. The reading is not an annotation; it is what George says.

Every slot is bounded by metrics.yaml `voice.reading.slots`, and a slot that
fails is DROPPED with a reason, the rest standing — the same way a block that
fails is dropped and the rest of the composition draws. Nothing here is a
refusal that costs a round trip: there is nothing for the model to fix that
would change a figure.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping, Optional

from agent import prose as _prose

#: The order they are read in, and the order they are drawn in.
SLOTS = ("claim", "caveat", "next")
#: The questions he suggests asking next — a list beside the slots, not one of them.
ASKS = "asks"

#: The only value `figures` takes: a figure this turn's reads returned, and no
#: other. A slot declaring anything else is a definition nobody implemented,
#: and it raises rather than silently allowing everything.
FIGURES_RETURNED = "returned"


class Rejected(ValueError):
    """One slot refused, with a reason a person could act on."""


def _reading(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return ((defs.get("voice") or {}).get("reading") or {})


def slots(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return _reading(defs).get("slots") or {}


def presentation_max(defs: Mapping[str, Any]) -> int:
    """What is not a figure here, read from the definitions rather than fixed."""
    return int(_reading(defs).get("presentation_max") or _prose.PRESENTATION_MAX)


def returned_numbers(results: Iterable[Mapping[str, Any]]) -> set[float]:
    """Every number the turn's reads returned, rows and meta alike."""
    return _prose.allowed_numbers([dict(r) for r in results])


def _check(name: str, value: Any, spec: Mapping[str, Any],
           returned: set[float], presentation: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Rejected(f"{name} is a few words, or it is left out")
    text = " ".join(value.split())
    longest = int(spec.get("max_length") or 160)
    if len(text) > longest:
        raise Rejected(
            f"{name} is at most {longest} characters — it is one thing said "
            f"once (voice.reading.slots.{name})"
        )
    rule = spec.get("figures")
    if rule == FIGURES_RETURNED:
        # A FIGURE, NOT A DIGIT. The matcher is the one the answer's own gates
        # use (agent/prose), so a caveat and a sentence excuse the same dates,
        # day numbers and small counts — two rules that disagreed about what a
        # figure is would be the measure and the gate drifting apart again.
        unbacked = _prose.unreturned_figures(text, returned, presentation)
        if unbacked:
            wrote = ", ".join(f"{n:g}" for n in unbacked[:3])
            raise Rejected(
                f"{name} carries a figure no read returned ({wrote}) — it may "
                f"say a number this turn read, never one worked out from them "
                f"(voice.reading.slots.{name})"
            )
    elif rule is not None:
        raise ValueError(
            f"voice.reading.slots.{name}.figures: {rule!r} is not a rule"
        )
    return text


def validate(submitted: Any, defs: Mapping[str, Any],
             returned: Optional[set[float]] = None) -> tuple[dict, list[dict]]:
    """
    Which slots stand, and why the others do not.

    Returns (accepted, rejected). `accepted` is a mapping of slot to text, in
    the order they are drawn; `rejected` carries a reason per entry, which the
    loop surfaces as a warning — a slot that was refused is a thing the model
    tried to say and could not.

    `returned` is every number this turn's reads returned. A turn that read
    nothing passes nothing, and then a slot under `figures: returned` may carry
    no figure at all — which is the same rule, not a stricter one: with no read
    behind it, every figure is one George made up.
    """
    spec = slots(defs)
    if not spec:
        raise ValueError("metrics.yaml voice.reading.slots is not defined")
    returned = set(returned or ())
    presentation = presentation_max(defs)
    accepted: dict[str, str] = {}
    rejected: list[dict] = []
    if submitted is None:
        return accepted, rejected
    if not isinstance(submitted, Mapping):
        return accepted, [{"slot": None, "reason": "the reading is three named slots"}]

    for name in submitted:
        if name == ASKS:
            continue
        if name not in spec:
            rejected.append({
                "slot": str(name),
                "reason": (f"{name!r} is not a slot of the reading "
                           f"({', '.join(SLOTS)})"),
            })
    for name in SLOTS:
        if name not in submitted:
            continue
        try:
            accepted[name] = _check(name, submitted[name], spec[name],
                                    returned, presentation)
        except Rejected as why:
            # WHAT WAS REFUSED, NOT ONLY WHY. P1.f's run refused five slots
            # across eleven turns, every one of them for a digit or a length,
            # and the reason alone cannot say whether the rule is protecting
            # anything: "next carries no digits" over "order 806 units" is the
            # rule working, and over "check the 8-week window" it is the rule
            # costing a slot. The same lesson as `warning_detail` in the eval
            # harness — a measurement whose reasons nobody can read is the gap
            # log all over again.
            rejected.append({"slot": name, "reason": str(why),
                             "said": _shorten(submitted[name])})
    if ASKS in submitted:
        asks, refused = _asks(submitted[ASKS], _reading(defs).get(ASKS) or {},
                              returned, presentation)
        if asks:
            accepted[ASKS] = asks
        rejected.extend(refused)
    return accepted, rejected


def _asks(value: Any, spec: Mapping[str, Any], returned: set[float],
          presentation: int) -> tuple[list[str], list[dict]]:
    """
    THE QUESTIONS HE SUGGESTS (2026-09-17): up to `max_items`, each held to the
    slot rule — bounded, and no figure a read did not return. One that fails is
    dropped with its reason and the rest stand, as a slot does.
    """
    if not spec:
        return [], [{"slot": ASKS, "reason": "voice.reading.asks is not defined"}]
    if not isinstance(value, list):
        return [], [{"slot": ASKS, "reason": "asks is a short list of questions",
                     "said": _shorten(value)}]
    accepted: list[str] = []
    rejected: list[dict] = []
    most = int(spec.get("max_items") or 3)
    for item in value:
        try:
            text = _check(ASKS, item, spec, returned, presentation)
        except Rejected as why:
            rejected.append({"slot": ASKS, "reason": str(why), "said": _shorten(item)})
            continue
        if len(accepted) >= most:
            rejected.append({"slot": ASKS, "reason": f"at most {most} questions",
                             "said": _shorten(item)})
            continue
        accepted.append(text)
    return accepted, rejected


def check_sentence(name: str, value: Any, spec: Mapping[str, Any],
                   returned: set[float], defs: Mapping[str, Any]) -> str:
    """A sentence held to a slot's rule, for a field outside the reading (a block's thought)."""
    return _check(name, value, spec, returned, presentation_max(defs))


def _shorten(value: Any) -> str:
    """What the model sent, bounded, for the record. Never drawn anywhere."""
    return " ".join(str(value).split())[:200]


# ---------------------------------------------------------------------------
# THE CLAIM IS A HIGHLIGHT, AND THIS IS WHAT MAKES IT ONE
# ---------------------------------------------------------------------------

_GAP = re.compile(r"\s+")


def _flatten(text: str) -> str:
    """Case and whitespace off, so a claim survives a line break in the answer."""
    return _GAP.sub(" ", text or "").strip().lower()


def was_said(answer: str, claim: Optional[str]) -> bool:
    """
    Whether the claim is words the answer actually carries.

    The one check that makes the claim safe: the surface lights a span of the
    ANSWER, so a claim nobody said lights nothing. The match is deliberately
    forgiving about case and whitespace and about nothing else — a claim that
    is a paraphrase of what he said is not a highlight of it, and drawing it
    would be the surface writing a sentence.

    Mirrored in frontend/src/room/claim.ts `splitClaim`, which does the same
    match to find the span it draws. This side only records whether it landed
    (voice.reading.unsaid_claim_is), so the rate is a measured number rather
    than an assertion.
    """
    if not claim:
        return False
    return _flatten(claim) in _flatten(answer)


def said_this_turn(answer: str, reading: Optional[Mapping[str, Any]]) -> str:
    """
    Everything George says this turn, wherever it lands on the page.

    THE NOTICE GATE READS THIS, NOT THE ANSWER ALONE. A caveat moved out of the
    paragraph and into its own slot is more surfaced than it was, not less — it
    is drawn whole, above the figures — and a gate that read only the paragraph
    would have called it missing and forced a duplicate underneath. The claim is
    excluded: it is a span of the answer already.
    """
    parts = [answer or ""]
    for name in ("caveat", "next"):
        text = (reading or {}).get(name)
        if isinstance(text, str) and text.strip():
            parts.append(text)
    return "\n\n".join(parts)
