"""
What George believes about the business, and what makes a belief admissible.

WHY THIS EXISTS. Until now George forgot the business between questions. Every
conversation began cold, he could never say "this is the third week", and a view
he formed on Tuesday was gone by Wednesday — which is why he produced answers
rather than an understanding. A belief is that view, kept.

THIS MODULE DECIDES ADMISSIBILITY AND NOTHING ELSE. It opens no connection,
holds no credential and stores nothing; the store is injected by whoever runs
the loop, exactly as the pin, workflow and page writers are (agent/write_tools.py
explains that pattern and this follows it without amending it). What lives here
is the pure question: is this a belief George is allowed to hold?

FOUR RULES, AND EACH ONE IS THE ANSWER TO A WAY MEMORY GOES WRONG.

  1. A BELIEF NAMES WHAT IT RESTS ON, and there are exactly two things it may
     rest on: the READS behind it, as CALLS rather than as row numbers, or —
     for a view a person TAUGHT him — their own words.

     THE READS. At least one, every one a call actually run in this
     conversation — the same provenance rule pin_answer has, reused rather
     than reinvented, and for the same reason: a stored call can be re-run,
     so a belief can be re-checked. This is `judgment.grounding` made mechanical:
     an ungrounded view is an invention, and an invention that persists is
     worse than one that does not, because tomorrow nobody remembers it was
     invented. A read that established NOTHING counts — "I looked and there is
     nothing there" is grounded in the looking.

     THE SECOND GROUND, added 2026-09-15 for P2.f. "We means the shops, not
     the warehouse" is not a reading of anything, so under calls-only it could
     not be kept at all — George was refused the one correction a person is
     the sole authority on. A `means` view names `told` instead: what they
     said, in their words. That is not a weaker ground than a read, it is a
     different one, and the rule is EXACTLY ONE per view: a reading stance
     names calls and may not name `told`; a `means` view names `told` and no
     calls. Both would let a typed sentence borrow a read's authority.

  2. A BELIEF CARRIES NO FIGURE. This is the rule that keeps memory from
     becoming a lie. "Rockwell is down 9.4%" is false a week later and says so
     to nobody; "Rockwell is losing customers rather than smaller baskets"
     degrades gracefully and can be re-checked. The figures live in the
     evidence, which can be re-run. It is the same warrant the composer's own
     one-sentence readings have had since they were introduced: characterise
     the rows, never restate them.

  3. A STANCE IS ONE OF THE WORDS IN THE DEFINITIONS. metrics.yaml
     `judgment.stances`, and the same ones the prompt teaches — five readings
     of data and two a person told him, `means` and `leave_out` (which binds
     a declared setting the reads apply, P2S.11). One invented at the keyboard
     would be a category of business situation nobody defined.

  4. CHANGING A VIEW KEEPS THE OLD ONE AND SAYS WHY. A belief that supersedes
     another must name it and give a reason. A view that can be silently
     replaced cannot be wrong, and a view that cannot be wrong is not a view —
     it is a cache.

WHAT THIS MODULE DOES NOT CHECK, deliberately: whether the superseded belief
exists, and whether the subject is real. Both need the store, both are checked
where the store is, and pretending to check them here would be a second source
of truth for the same fact.
"""

from __future__ import annotations

import json

import re
from typing import Any, Callable, Iterable, Mapping, Optional

#: A belief is a sentence about a thing, not a reading of a number. Any digit
#: is refused — including a window, which belongs to the evidence rather than
#: to the claim.
_DIGIT = re.compile(r"\d")

#: Bounds. A claim longer than this is an answer being stored, not a view.
MAX_CLAIM = 240
MAX_WHY = 240
MAX_BELIEFS_PER_TURN = 6


def taught_stances(defs: Mapping[str, Any]) -> tuple[str, ...]:
    """
    The stances that rest on a person rather than on a read.

    One until 2026-09-18 (`means`); `leave_out` joined it for P2S.11, because
    "leave per gram out" is something a person SAID, exactly as "we means the
    shops" is, and no read can settle either.
    """
    return tuple(str(s) for s in defs["judgment"]["taught"]["stances"])


def setting_bound_by(defs: Mapping[str, Any], stance: str) -> Optional[tuple[str, Mapping[str, Any]]]:
    """
    The declared setting a told stance binds, as (name, declaration), or None.

    Read from metrics.yaml settings.declared.<name>.bound_by, so the one place
    that says which stance binds which setting is the declaration itself.
    """
    for name, decl in ((defs.get("settings") or {}).get("declared") or {}).items():
        if (decl.get("bound_by") or {}).get("stance") == stance:
            return name, decl
    return None


def max_told_words(defs: Mapping[str, Any]) -> int:
    """
    How much of what they said may be kept.

    A bound in WORDS rather than characters because this is a quotation, and
    the thing being refused is a paragraph pasted in as though it were a
    correction. metrics.yaml judgment.taught.max_words.
    """
    return int(defs["judgment"]["taught"]["max_words"])


def stances_for(defs: Mapping[str, Any]) -> tuple[str, ...]:
    """Every stance, read from the definitions so the two cannot drift."""
    return tuple(defs["judgment"]["stances"].keys())


def subject_kinds_for(defs: Mapping[str, Any]) -> tuple[str, ...]:
    return tuple(defs["judgment"]["subject_kinds"])


def _reject(item: Any, reason: str) -> dict:
    return {"belief": item, "reason": reason}


def validate(
    submitted: Iterable[Any],
    defs: Mapping[str, Any],
    *,
    is_executed: Callable[[Mapping[str, Any]], bool],
    resolve_category: Optional[Callable[[str], tuple[Optional[str], str]]] = None,
) -> tuple[list[dict], list[dict]]:
    """
    Split proposed beliefs into those George may hold and those he may not.

    `is_executed` answers one question about one call: was this actually run,
    successfully, in this conversation? The predicate is supplied rather than
    the executed set itself, so this module never has to know how a call is
    keyed — that lives with the writer, in one place, and passing it as a
    function also keeps agent/write_tools.py and this file from importing each
    other.

    `resolve_category` answers, for a view that BINDS a setting, whether its
    subject is a category the catalogue carries: (the catalogue's spelling,
    "") or (None, why not). Supplied by the writer, which can read; without it
    a binding view is refused, because a setting bound to a name that matches
    nothing would put "left out at your instruction" on reads that left out
    nothing (metrics.yaml settings.declared.<name>.bounds.values).

    Returns (accepted, rejected). A rejected belief is NOT stored and the answer
    must not describe it as though it were.
    """
    stances = stances_for(defs)
    kinds = subject_kinds_for(defs)
    taught = taught_stances(defs)
    max_told = max_told_words(defs)

    accepted: list[dict] = []
    rejected: list[dict] = []

    if submitted is None:
        return accepted, rejected
    # A list that arrived as its own JSON text is still that list. The schema
    # now says "array of objects" (agent/loop.py), but a model that has seen
    # the string form once may send it again, and refusing a well-formed view
    # for its wrapping would be the tool being clever at the person's expense.
    if isinstance(submitted, str):
        try:
            submitted = json.loads(submitted)
        except ValueError:
            return accepted, [_reject(submitted, "not a list of belief objects")]
    if isinstance(submitted, Mapping):
        submitted = [submitted]

    for item in list(submitted)[: MAX_BELIEFS_PER_TURN + 1]:
        if len(accepted) >= MAX_BELIEFS_PER_TURN:
            rejected.append(_reject(item, (
                f"more than {MAX_BELIEFS_PER_TURN} beliefs in one turn; a turn that "
                f"changes this much of the picture is an investigation, not a view"
            )))
            continue
        if not isinstance(item, Mapping):
            rejected.append(_reject(item, "not an object"))
            continue

        stance = item.get("stance")
        if stance not in stances:
            rejected.append(_reject(item, (
                f"stance {stance!r} is not one of {', '.join(stances)} "
                f"(metrics.yaml: judgment.stances)"
            )))
            continue

        kind = item.get("subject_kind")
        if kind not in kinds:
            rejected.append(_reject(item, (
                f"subject_kind {kind!r} is not one of {', '.join(kinds)} "
                f"(metrics.yaml: judgment.subject_kinds)"
            )))
            continue

        subject = item.get("subject")
        if not isinstance(subject, str) or not subject.strip():
            rejected.append(_reject(item, "no subject — a view is held about a thing"))
            continue

        claim = item.get("claim")
        if not isinstance(claim, str) or not claim.strip():
            rejected.append(_reject(item, "no claim"))
            continue
        claim = claim.strip()
        if len(claim) > MAX_CLAIM:
            rejected.append(_reject(item, (
                f"claim longer than {MAX_CLAIM} characters; that is an answer being "
                f"stored rather than a view"
            )))
            continue
        if _DIGIT.search(claim):
            rejected.append(_reject(item, (
                "a belief carries no figure. A stored number goes stale silently — "
                "the figures are in the evidence and can be re-read. Say what the "
                "figures MEAN, in words"
            )))
            continue

        # WHAT IT RESTS ON — exactly one ground, decided by the stance.
        #
        # A `means` view is the correction a person makes to what a question
        # means, and nobody but them can settle it, so it rests on `told` and
        # names no calls. Every other stance is a reading of data and rests on
        # the reads, exactly as before. A view offering both would let a typed
        # sentence borrow a read's authority, and a view offering neither is
        # the invention rule 1 exists to refuse.
        told = item.get("told")
        if stance in taught:
            evidence, why_bad = [], None
            if item.get("evidence"):
                why_bad = (
                    f"a {stance!r} view rests on what the person SAID, not on a read. "
                    f"Put their words in `told` and leave `evidence` out; if this is "
                    f"a reading of data, it needs one of the other stances"
                )
            elif not isinstance(told, str) or not told.strip():
                why_bad = (
                    f"a {stance!r} view needs `told`: what the person actually said, "
                    f"in their words. Without it there is nothing behind it"
                )
            else:
                told = told.strip()
                if len(told.split()) > max_told:
                    why_bad = (
                        f"`told` is longer than {max_told} words; that is a passage "
                        f"being stored, not the sentence that corrected you"
                    )
        else:
            told = None
            if item.get("told"):
                why_bad = (
                    f"only a {' or '.join(repr(t) for t in taught)} view rests on what "
                    f"a person said. A reading of data rests on the reads behind it "
                    f"— name them in `evidence`"
                )
                evidence = []
            else:
                evidence, why_bad = _evidence(item.get("evidence"), is_executed)
        if why_bad:
            rejected.append(_reject(item, why_bad))
            continue

        # A VIEW THAT BINDS A SETTING is held to the setting's declaration: the
        # kind of thing it is about, and a value inside its bounds. "Leave out
        # Rockwell" is not a category, and "leave out gummies" names nothing
        # the catalogue calls a category — either would be a receipt saying
        # something was left out when nothing was (P2S.11).
        subject = subject.strip()
        binds = setting_bound_by(defs, stance)
        if binds is not None:
            name, decl = binds
            want_kind = decl["bound_by"]["subject_kind"]
            if kind != want_kind:
                rejected.append(_reject(item, (
                    f"a {stance!r} view is about a {want_kind}, not a {kind} "
                    f"(metrics.yaml settings.declared.{name}.bound_by)"
                )))
                continue
            if resolve_category is None:
                rejected.append(_reject(item, (
                    f"a {stance!r} view needs the catalogue to check its {want_kind} "
                    f"against, and this session cannot read it"
                )))
                continue
            spelled, why_not = resolve_category(subject)
            if spelled is None:
                rejected.append(_reject(item, why_not))
                continue
            subject = spelled

        supersedes = item.get("supersedes")
        why = item.get("why")
        if supersedes is not None:
            if not isinstance(supersedes, (str, int)) or not str(supersedes).strip():
                rejected.append(_reject(item, "supersedes must name a belief"))
                continue
            if not isinstance(why, str) or not why.strip():
                rejected.append(_reject(item, (
                    "changing a view needs a reason: what did this read establish "
                    "that the old view did not account for?"
                )))
                continue
            why = why.strip()[:MAX_WHY]
        else:
            why = None

        accepted.append({
            "stance": stance,
            "subject_kind": kind,
            "subject": subject,
            "claim": claim,
            "evidence": evidence,
            "told": told,
            "supersedes": str(supersedes).strip() if supersedes is not None else None,
            "why": why,
        })

    return accepted, rejected


def _evidence(raw: Any, is_executed: Callable[[Mapping[str, Any]], bool],
              ) -> tuple[list[dict], Optional[str]]:
    """
    The calls behind a belief, each one actually run in this conversation.

    A read that came back EMPTY is admissible and is the point: "I looked at
    OPUS and there is nothing there" rests on the looking. A call that never ran
    is not admissible under any stance — that is the whole rule, and it is the
    same one that makes "pin that but daily" safe.
    """
    if raw is None:
        return [], "a belief names the reads behind it; this one names none"
    if isinstance(raw, Mapping):
        raw = [raw]
    if not isinstance(raw, (list, tuple)):
        return [], "evidence must be a list of calls, as [{'tool': ..., 'arguments': {...}}]"

    calls: list[dict] = []
    for entry in raw:
        if not isinstance(entry, Mapping):
            return [], f"evidence {entry!r} is not a call"
        tool = entry.get("tool")
        args = entry.get("arguments") or {}
        if not isinstance(tool, str) or not tool.strip():
            return [], "a piece of evidence names no tool"
        if not isinstance(args, Mapping):
            return [], f"arguments for {tool} are not an object"
        call = {"tool": tool.strip(), "arguments": dict(args)}
        if not is_executed(call):
            return [], (
                f"{tool} was not run with those arguments in this conversation. A view "
                f"has to rest on something that actually happened — run it, read it, "
                f"then hold the view"
            )
        if call not in calls:
            calls.append(call)
    if not calls:
        return [], "a belief names the reads behind it; this one names none"
    return calls, None


def record(beliefs: Any, *, defs: Mapping[str, Any],
           is_executed: Callable[[Mapping[str, Any]], bool], store: Any) -> dict:
    """
    The tool body. Returns {rows, meta} like every other tool.

    NO `source_table` IN meta, and for the same reason record_findings has none:
    the loop keeps the last meta that describes real data as the answer's
    receipts, and this result read nothing. It is a statement about what George
    now holds.
    """
    accepted, rejected = validate(beliefs, defs, is_executed=is_executed)
    stored = store.record(accepted) if accepted else []
    return {
        "rows": stored,
        "meta": {
            "held": len(stored),
            "rejected": rejected,
            "stances": list(stances_for(defs)),
            "note": (
                "What George now believes about these things, kept until a later "
                "read changes it. Nothing was read. A rejected belief is not held "
                "and the answer must not describe it as though it were."
            ),
        },
    }
