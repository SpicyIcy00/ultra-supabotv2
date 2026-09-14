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

  `caveat` AND `next` CARRY NO DIGITS AT ALL, checked here. They are
  characterisations, and CLAUDE.md's bound on an annotation is exactly this: it
  may point at rows and characterise them, and may never name a number. A
  caveat's figures are on the notice it paraphrases and on the objects below
  it; a next step is a sentence about what to do, not about how much.

Every slot is bounded by metrics.yaml `voice.reading.slots`, and a slot that
fails is DROPPED with a reason, the rest standing — the same way a block that
fails is dropped and the rest of the composition draws. Nothing here is a
refusal that costs a round trip: there is nothing for the model to fix that
would change a figure.
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Optional

#: The order they are read in, and the order they are drawn in.
SLOTS = ("claim", "caveat", "next")


class Rejected(ValueError):
    """One slot refused, with a reason a person could act on."""


def slots(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return ((defs.get("voice") or {}).get("reading") or {}).get("slots") or {}


def _check(name: str, value: Any, spec: Mapping[str, Any]) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Rejected(f"{name} is a few words, or it is left out")
    text = " ".join(value.split())
    longest = int(spec.get("max_length") or 160)
    if len(text) > longest:
        raise Rejected(
            f"{name} is at most {longest} characters — it is one thing said "
            f"once (voice.reading.slots.{name})"
        )
    if spec.get("no_digits") and any(ch.isdigit() for ch in text):
        raise Rejected(
            f"{name} carries no digits — it characterises the figures, it "
            f"never states one; the number is already drawn below it "
            f"(voice.reading.slots.{name})"
        )
    return text


def validate(submitted: Any, defs: Mapping[str, Any]) -> tuple[dict, list[dict]]:
    """
    Which slots stand, and why the others do not.

    Returns (accepted, rejected). `accepted` is a mapping of slot to text, in
    the order they are drawn; `rejected` carries a reason per entry, which the
    loop surfaces as a warning — a slot that was refused is a thing the model
    tried to say and could not.
    """
    spec = slots(defs)
    if not spec:
        raise ValueError("metrics.yaml voice.reading.slots is not defined")
    accepted: dict[str, str] = {}
    rejected: list[dict] = []
    if submitted is None:
        return accepted, rejected
    if not isinstance(submitted, Mapping):
        return accepted, [{"slot": None, "reason": "the reading is three named slots"}]

    for name in submitted:
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
            accepted[name] = _check(name, submitted[name], spec[name])
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
    return accepted, rejected


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
