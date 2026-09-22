"""
The reading's three slots — claim, caveat, next — and what each may carry.

WHAT THIS REPLACES. Until 2026-09-14 the second statement a `compose` carried
was a set of ROLES on reads: primary, driver, breakdown, context
(agent/findings.py). The roles were validated exhaustively, recorded on the
frame, stored on the post — and the room drew none of them. They were the
model's channel for saying what a read MEANT, spent entirely on a vocabulary
the screen had stopped speaking, and Bob paid a schema and a dozen items of
it on every turn. P1.f swaps the channel for the one the screen does draw:
what he SAYS, in three slots instead of one paragraph.

WHAT THE MODEL SUPPLIES, EXACTLY. Three short strings, none of them required:

    {"claim": "OPUS added more than the next two shops together",
     "caveat": "Basket value fell at Magnolia and North Edsa even as takings rose",
     "next": "Draft the Seikyo order — three of the five lines are theirs"}

WHY THIS IS NOT A HOLE IN RULE 9. A figure is still bound, never authored:

  `claim` IS THE ANSWER'S OWN WORDS. It is not drawn as a sentence of its
  own — it is a HIGHLIGHT. The surface finds those words in what Bob
  actually said and lights them there, and a claim that does not appear in the
  answer is dropped rather than drawn. So the channel cannot put a character on
  screen that the answer does not already carry, and the answer is governed by
  everything that has always governed it (voice.restatement, the notice gates,
  the remainder gate).

  `caveat` AND `next` CARRY ONLY A FIGURE A READ RETURNED, checked here
  (`figures: returned`, 2026-09-14). They carried no digits at all until then,
  and the rule made Bob vaguer than his evidence: "44 of 118 products have
  no figure on one side" — a count `meta.comparison.not_ranked` returned — was
  refused, and "roughly half" was what fitted. Three recorded runs refused 0, 6
  and 8 slots for it, every one of them a true qualification of the figures
  below it. What is still refused is the thing worth refusing: a number no read
  returned, which is Bob doing arithmetic on the board. Dates and small
  counts are not figures and never were.

  A BLOCK'S `claim` IS UNCHANGED and still carries no digits at all
  (agent/compose.py). That one IS an annotation — it titles a mark that draws
  the figure underneath it — and CLAUDE.md's bound on an annotation holds
  exactly there. The reading is not an annotation; it is what Bob says.

Every slot is bounded by metrics.yaml `voice.reading.slots`, and a slot that
fails is DROPPED with a reason, the rest standing — the same way a block that
fails is dropped and the rest of the composition draws. Nothing here is a
refusal that costs a round trip: there is nothing for the model to fix that
would change a figure.
"""

from __future__ import annotations

import re
from typing import Callable, Any, Iterable, Mapping, Optional

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


def cut_to(text: str, longest: int, how: str) -> str:
    """
    `text` shortened to at most `longest` characters by REMOVING its end — at
    the last sentence that fits (`cut_at_sentence`, else a word) or at the
    last word that fits (`cut_at_word_boundary`). Nothing is added or
    reworded, so a cut cannot put a figure on screen the words did not
    already carry; it can only leave one out.
    """
    if len(text) <= longest:
        return text
    head = text[:longest + 1]
    if how == "cut_at_sentence":
        ends = [m.end() for m in re.finditer(r"[.!?](?=\s)", head) if m.end() <= longest]
        if ends:
            return head[:ends[-1]].strip()
    space = head.rfind(" ")
    cut = head[:space] if space > 0 else text[:longest]
    return cut.rstrip(" ,;:—–-")


def over_length(name: str, text: str, spec: Mapping[str, Any], default_longest: int,
                coerced: Optional[list[str]], where: str) -> str:
    """
    WHAT A LENGTH BOUND DOES WHEN IT IS CROSSED (P2S.7, 2026-09-18), read from
    the definition's own `over_length` and never decided here.

    A length is not about truth, so by P1.a's line it is coerced, not refused:
    about a tenth of verification/p2s6-gate*.json's $3.88 was Bob redoing a
    compose refused for a title ten characters long, or losing a caveat to
    its length. `kept_whole` is for the slots that carry notices — cutting a
    caveat could drop the very warning it exists for. `refuse` (the default,
    for anything that declares nothing) is the old behaviour.
    """
    longest = int(spec.get("max_length") or default_longest)
    if len(text) <= longest:
        return text
    how = str(spec.get("over_length") or "refuse")
    if how == "kept_whole":
        if coerced is not None:
            coerced.append(f"{name}: longer than {longest} characters and kept "
                           f"whole ({where})")
        return text
    if how in ("cut_at_word_boundary", "cut_at_sentence"):
        cut = cut_to(text, longest, how)
        if cut:
            if coerced is not None:
                coerced.append(f"{name}: longer than {longest} characters, so it "
                               f"was cut to {cut!r} ({where})")
            return cut
    raise Rejected(
        f"{name} is at most {longest} characters — it is one thing said once ({where})"
    )


#: A written figure that is a returned one ROUNDED — "about 13,100" over a row
#: of 13,134 — is the returned one, said loosely. `_rounded_from` finds it.
def _rounded_from(n: float, decimals: int, returned: set[float]) -> list[float]:
    """
    The returned figures `n` is a rounding of, at the precision it was written
    to: 13,100 keeps its hundreds, so any returned value within fifty of it.
    Only a written figure that ENDS IN ZEROS can be a rounding — 13,134 said as
    13,134 either matched or is a different number.
    """
    if decimals > 0 or n < 10 or n != int(n):
        return []
    zeros = len(str(int(n))) - len(str(int(n)).rstrip("0"))
    if zeros == 0:
        return []
    half = 0.5 * 10 ** zeros
    return sorted({abs(v) for v in returned if abs(abs(v) - n) < half and abs(v) != n})


def _say(value: float, like: str) -> str:
    """A returned figure written the way the one it replaces was: commas kept."""
    text = f"{value:,.2f}".rstrip("0").rstrip(".") if value != int(value) else f"{int(value):,}"
    return text if "," in like else text.replace(",", "")


def _correct_rounding(name: str, text: str, returned: set[float], presentation: int,
                      coerced: Optional[list[str]], where: str) -> str:
    """
    A ROUNDED FIGURE IS SAID EXACTLY, OR REFUSED WITH THE ROW'S OWN VALUE
    NAMED (P2S.7, 2026-09-18).

    verification/p2s6-gate-2.json refused Bob's caveat for "about 13,100
    pesos" over a row of 13,134 — true, and rounded — and with the caveat gone
    the notices it carried were unsurfaced, the answer was re-asked, and a
    block of them was forced in anyway. The failure was not the rounding; it
    was losing the caveat to it.

    So where exactly ONE returned figure rounds to what was written, the
    numeral is replaced by that figure, and said. Nothing is invented: the
    value that goes on screen is one a read returned, in the place Bob put
    its rounding. Where two could be meant, nothing here chooses — the slot is
    refused and the refusal names them, so the next compose can say which.
    """
    out = text
    for m in reversed(list(_prose._NUMERAL.finditer(text))):
        raw = m.group("num")
        if m.group("suffix"):
            continue
        n = float(raw.replace(",", ""))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if not _prose._is_business_figure(n, decimals, False, presentation):
            continue
        if _prose._matches(n, decimals, returned):
            continue
        meant = _rounded_from(n, decimals, returned)
        if len(meant) == 1:
            exact = _say(meant[0], raw)
            start, end = m.span("num")
            out = out[:start] + exact + out[end:]
            if coerced is not None:
                coerced.append(f"{name}: {raw} is {exact} rounded, so it says "
                               f"{exact} — the figure the read returned ({where})")
        elif len(meant) > 1:
            named = ", ".join(_say(v, raw) for v in meant[:4])
            raise Rejected(
                f"{name} says {raw}, which rounds more than one figure this turn "
                f"read ({named}) — say the one you mean exactly ({where})"
            )
    return out


def repair_rounding_in_prose(text: str, returned: set[float], presentation: int,
                             skip: Optional[Callable[[float], bool]] = None,
                             ) -> tuple[str, list[str]]:
    """
    THE ANSWER'S OWN ROUNDINGS SAID EXACTLY (voice.grounding, 2026-09-19) —
    `_correct_rounding` for the paragraph rather than a slot, and it never
    refuses: a numeral that ONE returned figure explains is replaced by that
    figure; one that two could mean, or none, is left for the gate that runs
    after this. Returns the text and what was replaced, for the run record.
    """
    out = text
    repaired: list[str] = []
    for m in reversed(list(_prose._NUMERAL.finditer(_prose._DATE_PARTS.sub(
            lambda d: " " * len(d.group(0)), text)))):
        raw = m.group("num")
        if m.group("suffix"):
            continue
        n = float(raw.replace(",", ""))
        decimals = len(raw.split(".")[1]) if "." in raw else 0
        if not _prose._is_business_figure(n, decimals, False, presentation):
            continue
        if _prose._matches(n, decimals, returned):
            continue
        if skip is not None and skip(n):
            continue                     # another gate's — see the loop
        meant = _rounded_from(n, decimals, returned)
        if len(meant) == 1:
            exact = _say(meant[0], raw)
            start, end = m.span("num")
            out = out[:start] + exact + out[end:]
            repaired.append(f"{raw} is {exact} rounded, so it says {exact}")
    return out, list(reversed(repaired))


def _check(name: str, value: Any, spec: Mapping[str, Any],
           returned: set[float], presentation: int,
           coerced: Optional[list[str]] = None, where: Optional[str] = None) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Rejected(f"{name} is a few words, or it is left out")
    where = where or f"voice.reading.slots.{name}"
    text = over_length(name, " ".join(value.split()), spec, 160, coerced, where)
    rule = spec.get("figures")
    if rule == FIGURES_RETURNED:
        # A FIGURE, NOT A DIGIT. The matcher is the one the answer's own gates
        # use (agent/prose), so a caveat and a sentence excuse the same dates,
        # day numbers and small counts — two rules that disagreed about what a
        # figure is would be the measure and the gate drifting apart again.
        text = _correct_rounding(name, text, returned, presentation, coerced, where)
        unbacked = _prose.unreturned_figures(text, returned, presentation)
        if unbacked:
            wrote = ", ".join(f"{n:g}" for n in unbacked[:3])
            raise Rejected(
                f"{name} carries a figure no read returned ({wrote}) — it may "
                f"say a number this turn read, never one worked out from them "
                f"({where})"
            )
    elif rule is not None:
        raise ValueError(
            f"voice.reading.slots.{name}.figures: {rule!r} is not a rule"
        )
    return text


def validate(submitted: Any, defs: Mapping[str, Any],
             returned: Optional[set[float]] = None,
             coerced: Optional[list[str]] = None) -> tuple[dict, list[dict]]:
    """
    Which slots stand, and why the others do not.

    Returns (accepted, rejected). `accepted` is a mapping of slot to text, in
    the order they are drawn; `rejected` carries a reason per entry, which the
    loop surfaces as a warning — a slot that was refused is a thing the model
    tried to say and could not.

    `returned` is every number this turn's reads returned. A turn that read
    nothing passes nothing, and then a slot under `figures: returned` may carry
    no figure at all — which is the same rule, not a stricter one: with no read
    behind it, every figure is one Bob made up.

    `coerced` collects what was ADJUSTED rather than refused — a claim cut at
    a word, a caveat kept whole past its length, a rounded figure said
    exactly — for the caller to hand back on `meta.coerced` (P2S.7).
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
            accepted[name] = _steps(name, submitted[name], spec[name],
                                    returned, presentation, coerced)
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
                              returned, presentation, coerced)
        if asks:
            accepted[ASKS] = asks
        rejected.extend(refused)
    return accepted, rejected


def _steps(name: str, value: Any, spec: Mapping[str, Any], returned: set[float],
           presentation: int, coerced: Optional[list[str]] = None) -> str:
    """
    One slot, whether he wrote it as a sentence or as a list of steps.

    THE STRUCTURE COMES FROM THE SOURCE (P14, 2026-09-21). The page numbers a
    plan of more than one step, and twice it tried to find the steps inside a
    paragraph: a short opening sentence broke his own sentence in half, and
    requiring a capital only moved the error. He hands over the steps now, and
    a list is kept as the paragraphs the page already splits on — so what is
    stored is still one string, every word of it his, and nothing downstream
    learns a new shape.

    Each step is held to the slot's own rule, so a digit he may not write is
    still refused, one step at a time.
    """
    if (spec.get("steps") and isinstance(value, str)
            and len([p for p in re.split(r"\n\s*\n", value) if p.strip()]) > 1):
        # Paragraphs he separated by a blank line ARE steps — the page already
        # splits on them — so they are held to the same bound as a list.
        value = [p.strip() for p in re.split(r"\n\s*\n", value) if p.strip()]
    if not isinstance(value, (list, tuple)):
        return _check(name, value, spec, returned, presentation, coerced)
    most = int(spec.get("max_steps") or 6)
    # EACH STEP SHORT (W1.1, 2026-09-22): a step is held to its own length,
    # cut at a word, so the plan is four short steps and not four essays.
    step_spec = dict(spec)
    if spec.get("max_step_length"):
        step_spec["max_length"] = int(spec["max_step_length"])
        step_spec["over_length"] = spec.get("step_over_length") or "cut_at_word_boundary"
    steps: list[str] = []
    for n, step in enumerate(value[:most], 1):
        steps.append(_check(f"{name}[{n}]", step, step_spec, returned, presentation, coerced))
    if len(value) > most and coerced is not None:
        coerced.append(f"{name}: more than {most} steps, so the rest were left out — "
                       f"a plan nobody can hold is not a plan")
    return "\n\n".join(s for s in steps if s)


def _asks(value: Any, spec: Mapping[str, Any], returned: set[float],
          presentation: int, coerced: Optional[list[str]] = None,
          ) -> tuple[list[str], list[dict]]:
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
            text = _check(ASKS, item, spec, returned, presentation, coerced,
                          "voice.reading.asks")
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
                   returned: set[float], defs: Mapping[str, Any],
                   coerced: Optional[list[str]] = None,
                   where: Optional[str] = None) -> str:
    """A sentence held to a slot's rule, for a field outside the reading (a block's thought)."""
    return _check(name, value, spec, returned, presentation_max(defs), coerced, where)


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


def said_this_turn(answer: str, reading: Optional[Mapping[str, Any]],
                   page: Any = None) -> str:
    """
    Everything Bob says this turn, wherever it lands on the page.

    THE NOTICE GATE READS THIS, NOT THE ANSWER ALONE. A caveat moved out of the
    paragraph and into its own slot is more surfaced than it was, not less — it
    is drawn whole, above the figures — and a gate that read only the paragraph
    would have called it missing and forced a duplicate underneath. The claim is
    excluded: it is a span of the answer already.

    AND A MARGIN NOTE IS PART OF "WHEREVER IT LANDS" (2026-09-21). When P7 grew
    the page a `note` — the aside drawn beside the figure it qualifies — this
    function was not told, so a qualification written exactly where UI rule 4
    asks for it read as UNSAID and the loop appended the same notice verbatim
    underneath. A wall of caveat in the slot passed; a placed note failed. One
    live page carried "thousands sit below zero, so a line that looks empty may
    only be unrecorded", which IS `negative_on_hand`, in his own words, in the
    right place.

    ONLY the notes, never the page's argument prose: see
    `compose.notes_on_the_page` for why feeding a fingerprint 640 words would
    silence real caveats rather than surface them.

    `page` is the arrangement he laid out. Passing none keeps the old behaviour
    exactly, for every caller that has no page.
    """
    parts = [answer or ""]
    for name in ("caveat", "next"):
        text = (reading or {}).get(name)
        if isinstance(text, str) and text.strip():
            parts.append(text)
        elif isinstance(text, (list, tuple)):
            # The plan is a list of steps since P14; its words still count.
            parts.extend(str(step) for step in text if str(step).strip())
    if page is not None:
        from agent import compose as _compose
        written = _compose.notes_on_the_page(page)
        if written:
            parts.append(written)
    return "\n\n".join(parts)
