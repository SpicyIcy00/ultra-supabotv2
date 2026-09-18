"""
WHAT TO DO ABOUT IT, ON THE ROW IT IS ABOUT.

The third statement `compose` carries (P2.d, 2026-09-15), beside the blocks and
the reading. An action is not a tile and not a recommendation: it is a thing
the SURFACE can already do, pointed at one row, carrying Bob's own few words
for why that row and not another.

WHAT CAME BEFORE, AND WHY THIS IS NOT IT. `action` was a field on a
`recommendation` block until P1.f retired it. That tile said "Order Aji Mix" in
a box beside the figures it was recommending, at the same weight as them, and
it lost: every answer has a `next` sentence and few answers had the tile. The
difference here is placement and cause. A suggestion that sits ON the row it is
about needs no sentence explaining which row it means, and a suggestion that
says WHY is a suggestion a person can disagree with.

THE MODEL SUPPLIES THREE THINGS AND DERIVES NOTHING:

    {"act": "why", "seq": 2, "target": "Magnolia",
     "reason": "the only shop that fell while takings rose"}

  `act`      one of the acts metrics.yaml declares, and the surface performs.
             Nothing may be suggested that the room cannot do when it is
             tapped — an offer that opens nothing is a sentence dressed as a
             control.
  `seq`      a read that returned this turn. The same anchor a block uses, and
             for the same reason: it is what the target is checked against, and
             it is how the renderer knows which mark the offer belongs inside.
  `target`   a value a row of that read carries, or a value the read was
             scoped to — `compose._backs`, the identical test a block's
             subject passes. OPTIONAL: an action about the answer rather than
             about a row names none and is drawn at the foot.
  `reason`   Bob's words. AN ANNOTATION under CLAUDE.md's bound, so it may
             point at rows and characterise them and may never name a number.

WHAT IT NEVER SUPPLIES IS THE COST. "~1s" and "a turn" are facts about this
machine, not about the shops, and a model writing them could be wrong about
them on a slow day. Each act declares its own in metrics.yaml and the renderer
draws what it finds. A person deciding whether to tap something is owed the
difference between a second and a conversation.

WHICH ACTS THERE ARE IS THE YAML'S BUSINESS, and it currently declares two:
`why`, which asks Bob and costs a turn, and `open`, which opens the object
and costs about a second. `replay` is written down there as the act that is NOT
offered, with the reason — it would need a value as well as an argument, and
the preset values live in the renderer rather than in the definitions.

A REFUSED ACTION IS DROPPED AND THE REST STAND, exactly as a refused block is
dropped and the rest of the composition draws. Nothing here costs a round trip:
there is nothing for the model to fix that would change a figure.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional

from agent import reading as _reading


class Rejected(ValueError):
    """One action refused, with a reason a person could act on."""


def spec(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return ((defs.get("composition") or {}).get("actions") or {})


def acts(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return spec(defs).get("acts") or {}


def max_actions(defs: Mapping[str, Any]) -> int:
    return int(spec(defs).get("max") or 3)


def _reason(text: Any, defs: Mapping[str, Any]) -> str:
    """
    THE WHY, HELD EXACTLY WHERE A BLOCK'S CLAIM IS HELD.

    Same rule, same reason: this is an annotation over rows that are drawn with
    their own receipts beside them. A digit here would be a figure stated above
    one that has a source, by the one channel on the turn nobody can click.
    """
    bound = spec(defs).get("reason") or {}
    if not isinstance(text, str) or not text.strip():
        raise Rejected(
            "an action says WHY this row — without it, it is a button with no "
            "argument and the person has to guess what you saw"
        )
    said = " ".join(text.split())
    longest = int(bound.get("max_length") or 70)
    if bound.get("no_digits", True) and any(ch.isdigit() for ch in said):
        raise Rejected(
            "a reason carries no digits — it sits over rows that draw their "
            "own figures (metrics.yaml composition.actions.reason)"
        )
    try:
        return _reading.over_length("reason", said, {**bound, "max_length": longest},
                                    70, None, "metrics.yaml composition.actions.reason")
    except _reading.Rejected:
        raise Rejected(
            f"a reason is at most {longest} characters — it is the few words "
            f"beside a button, not the reading"
        ) from None


def _shorten(value: Any) -> str:
    text = value if isinstance(value, str) else repr(value)
    return text[:120]


def validate(
    submitted: Any,
    calls: Mapping[int, Mapping[str, Any]],
    defs: Mapping[str, Any],
) -> tuple[list[dict], list[dict]]:
    """
    Split submitted actions into the ones that may be drawn and the ones that
    may not, each refusal with a reason.

    `calls` is this turn's reads by seq — the same mapping the composition is
    validated against, so an action and a block cannot disagree about what a
    read returned.
    """
    from agent import compose as _compose

    accepted: list[dict] = []
    rejected: list[dict] = []
    if submitted is None:
        return accepted, rejected
    if not isinstance(submitted, list):
        return accepted, [{"action": _shorten(submitted), "target": None,
                           "reason": "actions are a list of objects"}]

    known = acts(defs)
    arguments = set((defs.get("composition") or {}).get("control_arguments") or [])
    cap = max_actions(defs)
    seen: set[tuple] = set()

    for item in submitted:
        try:
            if not isinstance(item, Mapping):
                raise Rejected("an action is an object naming an act, a read and a reason")
            act = item.get("act")
            if act not in known:
                raise Rejected(
                    f"an act is one of {', '.join(sorted(known))} — what the "
                    f"surface can do when it is tapped "
                    f"(metrics.yaml composition.actions.acts)"
                )
            declared: Mapping[str, Any] = known[act]

            seq = item.get("seq")
            if not isinstance(seq, int) or isinstance(seq, bool):
                raise Rejected("an action names the seq of a read that returned this turn")
            call = calls.get(seq)
            if call is None:
                raise Rejected(f"read {seq} did not run, or did not return")

            target: Optional[str] = None
            raw = item.get("target")
            if isinstance(raw, str) and raw.strip():
                if not _compose._backs(call, raw):
                    raise Rejected(
                        f"read {seq} has no row for {raw.strip()!r} — an action "
                        f"sits on a row, and this one would sit on nothing"
                    )
                target = raw.strip()
            elif raw is not None and not isinstance(raw, str):
                raise Rejected("a target is the value of a row, as a word")

            # NO ACT TAKES AN ARGUMENT TODAY, and the refusal is kept rather
            # than the branch deleted: `replay` is written down in the yaml as
            # the act that would, and the day it comes back this is where it
            # is checked. An argument arriving now is the model reaching for
            # an act that is not offered.
            argument = None
            if declared.get("needs_argument"):
                argument = item.get("argument")
                if argument not in arguments:
                    raise Rejected(
                        f"a {act} changes one of {', '.join(sorted(arguments))} "
                        f"— scope, never a threshold "
                        f"(metrics.yaml composition.control_arguments)"
                    )
            elif item.get("argument") is not None:
                raise Rejected(f"a {act} changes no argument")

            reason = _reason(item.get("reason"), defs)

            # THE SAME OFFER TWICE IS ONE OFFER. Two rounds of composing in a
            # turn is normal, and the second one repeating the first would
            # otherwise draw the button twice on the same row.
            fingerprint = (act, seq, (target or "").lower(), argument)
            if fingerprint in seen:
                raise Rejected("that is the same action on the same row, already offered")
            seen.add(fingerprint)

            if len(accepted) >= cap:
                raise Rejected(
                    f"at most {cap} actions — past that the person is choosing "
                    f"between suggestions instead of reading the figures"
                )

            drawn = {
                "act": act,
                "seq": seq,
                "target": target,
                "reason": reason,
                # DERIVED, NEVER SUBMITTED. The schema has no field for either,
                # so neither can arrive from the model.
                "costs": str(declared.get("costs") or ""),
                "model_turn": bool(declared.get("model_turn")),
            }
            if argument is not None:
                drawn["argument"] = argument
            accepted.append(drawn)
        except Rejected as exc:
            rejected.append({
                "action": _shorten(item.get("act") if isinstance(item, Mapping) else item),
                "target": (item.get("target") if isinstance(item, Mapping) else None),
                "reason": str(exc),
            })
    return accepted, rejected
