"""
Bob composes the workspace. This module decides whether a composition is one
he is allowed to make.

WHY THIS EXISTS. Until 2026-09-10 the screen was a pure function of rows: a
composer in the client derived a layout, and the model's only channel into it
was an integer and one of four words (agent/findings.py). What that produced
was a document — a chart, then findings, then prose — and a document with its
paragraphs reordered is still a document. Three rebuilds of the same screen
felt the same because the structure never changed.

Now Bob says what you see. A composition is a short list of blocks: which
result, as which kind of object, at what weight, under which key. The client
draws exactly that and nothing else.

WHAT KEEPS A CHOICE FROM BECOMING A VALUE. Every rule below is the answer to
one way this could go wrong, and the rules are the same ones record_findings
already lives by:

  - A BLOCK NAMES A READ THAT RAN. `seq` must be a successful read in this
    conversation. A widget over a call that failed, or that never happened, is
    a picture of nothing.
  - A SUBJECT IS A ROW. "Rockwell" on a figure is admissible only if a row of
    that read carries it. Bob may choose which row leads; he may not
    introduce one.
  - NO FIELD BUT THE ALLOWED ONES. A colour, a width, a value, a title — any
    key outside metrics.yaml composition.allowed_fields refuses the block. This
    is the line between composing and drawing.
  - ONE LEAD. Weight is judgment made visible, and a composition where
    everything leads has not been composed; a second one is demoted, not
    refused.
  - KEYS TRANSFORM. A key is a short slug; a later composition that uses the
    same key is the same object changing, which is what keeps the workspace
    from stacking.
  - A COMPOSITION IS A SET OF EDITS, NOT A SCREEN (2026-09-10). `put`,
    `change`, `quiet` and `drop` apply to a board that persists between turns,
    so an object Bob does not mention this turn simply stays — with its own
    read, its own receipts and its own read time. Only `put` needs a whole
    block; the other three need a key and what is changing. A `change` that
    names a subject must name the read it comes from, or Bob could rename
    what an object is about while it still draws an older read's rows.

WHAT IS COERCED RATHER THAN REFUSED (P1.a, 2026-09-13). The rules above are
about TRUTH, and a refusal that is not about truth is a round trip spent on
ceremony. Four recorded runs of the twelve carry 46 refusals between them and
NONE of them would have put a wrong figure on screen — they are a
discriminator under another name, a subject the read was already filtered to,
a `quiet` that carried the seq it was quieting, a change that changed nothing.
Each cost a whole model round trip, and Bob spent up to four composes on
one answer finding the spelling.

So: a block is coerced where the coercion cannot change what a figure SAYS,
and refused where it can.

  COERCED   a second block weighted `lead`      demoted to supporting
            a change that changes nothing       ignored, not refused
            a `quiet`/`drop` with extra fields  the extras dropped
            a subject the read is FILTERED to   accepted: the read is about it
            no subject on a one-row read        filled from that read's scope
            a node named `type`/`kind`/`node`   renamed (agent/grammar.py)
            a claim or thought past its length  cut at a word or a sentence
            a caveat or next past its length    kept whole: it carries notices
            `emphasise` past its cap            the first ones he named stand
            a rounded figure in a slot          said exactly, when ONE read
                                                figure is what it rounds

  REFUSED   a seq that never ran or failed      there is nothing to draw
            a subject no row and no filter has  a label nobody read
            a subject on a MANY-row read        choosing a row is a judgement
            a note carrying a digit             that is a figure in prose
            a figure in a slot no read returned that one is about truth
            a figure, colour, size or title     the attempt this file exists
                                                to stop, and the one coercion
                                                that came back off the list

The line is one sentence: **a coercion may change which WORD holds a value; it
may never change which value is drawn, or introduce one.** Every coercion is
recorded and returned on `meta.coerced`, because a coercion the model cannot
see is a board it will describe wrongly.

WHAT IT VALIDATES GOT SMALLER (P1.f, 2026-09-14), and that is the card. The
vocabulary is now the catalogue the renderer draws — six marks and the four
kinds that are not marks — so seven widget names went, and with them the three
fields that served only those: `subjects` (a comparison), `form` (a chart) and
`action` (a recommendation). The block-level `note` became `claim` under its
own name: the few words that title the block, checked for digits exactly as a
note is, because a title carrying a figure is a figure with no receipt.

The second statement this call carries changed with it. It was ROLES on reads
— primary, driver, breakdown, context — validated exhaustively and drawn
nowhere since the room replaced the old surface. It is now the READING's three
slots (agent/reading.py): claim, caveat, next.

It opens no connection, holds nothing, and its result names no source table:
the loop keeps the last meta that describes real data as the answer's receipts,
and this read nothing.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterable, Mapping, Optional

from agent import grammar
from agent import reading as _reading


class Rejected(ValueError):
    pass


class OverBound(Rejected):
    """
    A block refused for a COUNT, not for what it says (W1.1, 2026-09-22): past
    max_blocks or max_in_words. It is not drawn, and the answer is not held
    for it — the round that composed it may still settle (rounds.settle).
    """


def vocabulary(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return defs["composition"]


def _read(calls: Mapping[int, Mapping[str, Any]], seq: Any) -> Mapping[str, Any]:
    """The call a block rests on: a read, in this conversation, that returned."""
    if not isinstance(seq, int) or isinstance(seq, bool):
        raise Rejected("seq must be the number of a read")
    call = calls.get(seq)
    if call is None:
        raise Rejected(f"read {seq} did not run in this conversation")
    if not call.get("is_read"):
        # Naming the way round matters: this fires most often when Bob has
        # just CHANGED something and wants the result on screen. An object is
        # drawn over a read so a figure always has receipts behind it, and a
        # write is not one — but the thing he changed is almost always
        # readable, so the refusal says so instead of just saying no.
        from agent import composite_tools

        if call.get("tool") in composite_tools.NOT_COMPOSABLE_READS:
            raise Rejected(
                f"call {seq} ({call.get('tool')}) returns SECTIONS, each its "
                f"own read — it is a way in to a thing, not a figure about it, "
                f"so there is nothing for one object to draw. Run the specific "
                f"read the section named and compose over that."
            )
        raise Rejected(
            f"call {seq} is not a read — an object is drawn over a read, so "
            f"that a figure always has receipts. Read the thing back and "
            f"compose over that read instead."
        )
    if call.get("error"):
        raise Rejected(f"read {seq} failed; there is nothing to draw")
    return call


def _row_has(call: Mapping[str, Any], subject: str) -> bool:
    """Whether some row of the read carries this subject, as a string value."""
    want = subject.strip().lower()
    for row in call.get("rows") or []:
        if not isinstance(row, Mapping):
            continue
        for value in row.values():
            if isinstance(value, str) and value.strip().lower() == want:
                return True
    return False


def _scope_values(call: Mapping[str, Any]) -> set[str]:
    """
    What the read is SCOPED to, as values — the filters the tool applied.

    A read filtered to Rockwell is about Rockwell whether or not a column
    survives the grouping. `get_sales(group_by=[], filters={"store":
    "Rockwell"})` returns ONE row of totals with no store column in it, and
    refusing `subject: "Rockwell"` over that row is what sent Bob round the
    loop in the `cannot` scenario: a figure with a subject, refused; without
    one, refused; then a whole extra read of the same
    figure grouped by store so the word would appear in a cell. Four
    iterations, for a label the read had already declared.

    This is not the model introducing a subject. `filters_applied` is the
    tool's own statement of scope, in `meta`, beside the snapshot timestamp —
    the same place the receipts come from.

    AND THE TOOLS STATE IT AS SENTENCES (P2S.7, 2026-09-18). Every read tool
    writes `filters_applied` as a LIST of statements — "t.store_id IN (1:
    North Edsa)   # metrics.yaml: stores.active_retail" — and this read only
    a mapping, so in production the scope was never seen at all: "read 0 has
    no row for 'North Edsa'" on a read filtered to North Edsa, twice in
    verification/p2s6-gate-2.json, and the same for an action on Rockwell.
    The tests passed a mapping and so never met the shape the tools return.
    A value the call was ASKED to filter by now counts when the tool's own
    statement names it back: the argument proposes, the receipt confirms, and
    a store the tool resolved to something else is not confirmed.
    """
    found: set[str] = set()
    filters = call.get("filters")
    if isinstance(filters, Mapping):
        for value in filters.values():
            for one in (value if isinstance(value, (list, tuple)) else [value]):
                if isinstance(one, str) and one.strip():
                    found.add(one.strip().lower())
        return found
    if not isinstance(filters, (list, tuple)):
        return found
    stated = " ".join(str(s) for s in filters if isinstance(s, str)).lower()
    asked = (call.get("arguments") or {}).get("filters")
    if not stated or not isinstance(asked, Mapping):
        return found
    for value in asked.values():
        for one in (value if isinstance(value, (list, tuple)) else [value]):
            if isinstance(one, str) and one.strip() and one.strip().lower() in stated:
                found.add(one.strip().lower())
    return found


def _backs(call: Mapping[str, Any], subject: str) -> bool:
    """Whether the read carries this subject — in a row, or in its own scope."""
    return _row_has(call, subject) or subject.strip().lower() in _scope_values(call)


def _implied_subject(call: Mapping[str, Any]) -> Optional[str]:
    """
    The subject a ONE-ROW read is already about, when the block named none.
    (Its spelling comes from the argument the tool confirmed — see
    `_scope_values` — or from a mapping of filters where one is given.)

    Only from what the read declares, and only when there is no choice to
    make. One row means the client draws that row whatever the subject says
    (`rowFor(rows, subject) ?? rows[0]`, room/tiles.tsx), so the subject is a
    caption here and not a selector — and the caption comes from the read's
    own single scalar filter, never from anything inferred.

    On a MANY-row read this returns None and the block is refused as before.
    That refusal is real: picking which of seven shops a figure draws is a
    judgement, and a judgement made by defaulting to row zero is the worst
    kind. grammar.py says the same thing about a panel-per-shop.
    """
    if len(call.get("rows") or []) != 1:
        return None
    values = sorted(_scope_values(call))
    if len(values) != 1:
        return None
    # The filter's own spelling, not the lowercased one it was matched on.
    filters = call.get("filters")
    if not isinstance(filters, Mapping):
        filters = (call.get("arguments") or {}).get("filters") or {}
    for value in filters.values():
        for one in (value if isinstance(value, (list, tuple)) else [value]):
            if isinstance(one, str) and one.strip().lower() == values[0]:
                return one.strip()
    return None


def read_identity(tool: Any, arguments: Any, subject: Any = None) -> str:
    """
    What a read IS for "this is that": tool, arguments, and the one subject
    the object is scoped to, if any. The same identity the client applies in
    board.ts, so the stored composition and the screen agree about which
    object a repeat became.
    """
    args = json.dumps(arguments or {}, sort_keys=True, default=str)
    return f"{tool}|{args}|{subject if isinstance(subject, str) else ''}"


def _existing_reads(board: Any) -> dict[str, str]:
    """identity -> key, for every object on the board that names its read."""
    out: dict[str, str] = {}
    for obj in board or []:
        if not isinstance(obj, Mapping):
            continue
        read = obj.get("read")
        key = obj.get("key")
        if not isinstance(read, Mapping) or not isinstance(key, str):
            continue
        # A CONTROL IS A HANDLE ON A READ, NOT A DRAWING OF IT (P7): it names
        # the read of the figure it drives, and is never that figure's twin.
        if obj.get("kind") == "control":
            continue
        out.setdefault(read_identity(read.get("tool"), read.get("arguments"),
                                     obj.get("about")), key)
    return out


def _demote(key: str, lead_key: str, weights: list, coerced: list[str]) -> str:
    """
    A second block asking to lead takes the next weight down.

    ONE LEAD IS STILL THE RULE — what changes is what happens when Bob
    breaks it. The composition he meant is legible: this block matters, and
    the one already leading matters more by having arrived first. Refusing
    the block drew nothing and cost a round trip; demoting it draws the
    composition he meant, one rank down, and says so.
    """
    below = weights[1] if len(weights) > 1 else "supporting"
    coerced.append(
        f"{key!r}: only one block leads and {lead_key!r} already does, so this "
        f"one is {below}"
    )
    return below


def _hang(accepted: list[dict], said: Mapping[str, tuple], voc: Mapping[str, Any],
          coerced: list[str]) -> None:
    """
    Resolve `under` / `relation` once every key in the composition is known.

    WHY A SECOND PASS. `under` names another block of the SAME composition,
    and a block may name one that arrives after it. Nothing can be settled
    while the list is still being read, so the loop only records what was
    said and this decides what stands.

    NOTHING HERE REFUSES. An `under` naming a key that is not in the
    composition, a second level, a cycle, or a `relation` with no `under` all
    simply fall away, and the block stands on its own — which is the board as
    it was drawn before any of this existed. The arrangement degrades to the
    old flow; it never breaks, and a bad relation costs no round trip.

    ONE LEVEL. Evidence hangs off a point; it may not have evidence hanging
    off it in turn. A tree is an outline and an outline is a report. The rule
    also disposes of cycles for free: in `a under b, b under a` both targets
    are themselves hung, so both fall away.
    """
    by_key = {b["key"]: b for b in accepted if isinstance(b.get("key"), str)}
    rel = voc.get("relation") or {}
    values = set(rel.get("values") or ())
    default = str(rel.get("default") or "")
    detach = str((voc.get("under") or {}).get("detach") or "")
    stands: dict[str, tuple[str, Any]] = {}

    for key, (under, relation) in said.items():
        if key not in by_key:
            continue                       # the block itself was refused
        if isinstance(under, str) and under == detach:
            # DETACHING IS SAYING SO. `board.carried()` copies every field an
            # edit sets and nothing clears one, so without this a block that
            # was ever gathered could never stand alone again without being
            # dropped and re-put.
            by_key[key].pop("under", None)
            by_key[key].pop("relation", None)
            by_key[key]["under"] = ""
            continue
        if not isinstance(under, str) or under == key or under not in by_key:
            if under is not None:
                coerced.append(
                    f"{key!r}: `under` names {under!r}, which is not a block of this "
                    f"composition, so it stands on its own"
                )
            elif relation is not None:
                coerced.append(
                    f"{key!r}: `relation` says how this sits under another block and "
                    f"none was named, so it stands on its own"
                )
            continue
        stands[key] = (under, relation)

    # DECIDED FROM A SNAPSHOT, not as we go. Dropping one edge while still
    # reading the rest makes the result depend on the order Bob listed his
    # blocks in: a cycle `a under b, b under a` would lose only whichever came
    # first, and the other would keep an edge into a block that no longer has
    # one. Both are second levels; both fall away.
    said_edges = dict(stands)
    for key in {k for k, (u, _) in said_edges.items() if u in said_edges}:
        parent = said_edges[key][0]
        coerced.append(
            f"{key!r}: {parent!r} is itself under {said_edges[parent][0]!r} — evidence "
            f"hangs off a point, not off other evidence, so this stands on its own"
        )
        del stands[key]

    for key, (under, relation) in stands.items():
        by_key[key]["under"] = under
        if isinstance(relation, str) and relation in values:
            by_key[key]["relation"] = relation
        else:
            if relation is not None:
                coerced.append(
                    f"{key!r}: {relation!r} is not one of {', '.join(sorted(values))} "
                    f"(metrics.yaml composition.relation), so it is evidence"
                )
            # SAID ONCE, NOT THREE TIMES (composition.relation.default). A block
            # that names what it is under is evidence for it unless it says
            # otherwise, so the common case costs one field, not two.
            if default:
                by_key[key]["relation"] = default


def _claim(text: Any, voc: Mapping[str, Any], coerced: Optional[list[str]] = None,
           key: Optional[str] = None) -> str:
    """
    THE FEW WORDS OVER A BLOCK, and the one thing on it Bob writes.

    Held to the same rule a note is held to, and for the same reason: an
    annotation may point at what is drawn and characterise it, and may never
    name a number (CLAUDE.md). The figure is already under the title, with the
    read that returned it and the time it was read — a digit up here would be
    a figure with no receipt of its own, stated above one that has.

    The digit rule is TRUTH and stays a refusal. The length is not: past it,
    the title is cut at a word (composition.claim.over_length).
    """
    spec = voc.get("claim") or {}
    if not isinstance(text, str) or not text.strip():
        raise Rejected("a claim is a few words saying what this block says")
    said = " ".join(text.split())
    if spec.get("no_digits", True) and any(ch.isdigit() for ch in said):
        raise Rejected(
            "a claim carries no digits — the figure is drawn under it, with "
            "its own receipts (metrics.yaml composition.claim)"
        )
    try:
        return _reading.over_length(f"{key!r} claim" if key else "claim", said, spec, 80,
                                    coerced, "metrics.yaml composition.claim")
    except _reading.Rejected as why:
        raise Rejected(str(why)) from None


def _question(text: Any, voc: Mapping[str, Any], coerced: Optional[list[str]] = None,
              key: Optional[str] = None) -> str:
    """
    THE QUESTION THE READ ANSWERS — what makes a block a step (P3.o).

    The design he approved opens every block with a question in bold and its
    answer running on (`ops/ideal/bob-ahead-of-me.html`, `.step`); the board
    opened with the answer alone, so four steps of an investigation drew as
    four findings and the page read as tiles with captions.

    Held exactly as `_claim` is — it sits in the same line, above the same
    figure, so a digit in it would be a number with no receipt of its own.
    Length is not truth and is cut at a word.
    """
    spec = voc.get("question") or {}
    if not isinstance(text, str) or not text.strip():
        raise Rejected("a question is the one this read answers, in your own words")
    said = " ".join(text.split())
    if spec.get("no_digits", True) and any(ch.isdigit() for ch in said):
        raise Rejected(
            "a question carries no digits — the figure is drawn under it, with "
            "its own receipts (metrics.yaml composition.question)"
        )
    try:
        return _reading.over_length(f"{key!r} question" if key else "question", said, spec, 90,
                                    coerced, "metrics.yaml composition.question")
    except _reading.Rejected as why:
        raise Rejected(str(why)) from None


# ---------------------------------------------------------------------------
# THE ARRANGEMENT — how he lays the right-hand side out for this answer (P3.p)
# ---------------------------------------------------------------------------

# A figure inside a sentence: {key}, {key.change}, {key.was}. The key is a block
# of his; the digits are the row's. (composition.arrangement.refs)
_REF = re.compile(r"\{([a-z0-9][a-z0-9_-]*)(?:\.([a-z_]+))?\}")


def _arrangement(tree: Any, voc: Mapping[str, Any], keys: list[str],
                 coerced: list[str], blocks: Any = None, board: Any = None,
                 own: Any = None) -> Optional[dict]:
    """
    THE PAGE HE WRITES, validated into a tree the room draws.

    The owner, 2026-09-20: *"i want it to use that space like its designing its
    own page or artifact for its answer … in that space its its playground."*
    And 2026-09-21, of the first pages it produced: *"it feels like it has to
    fit the stuff in columns and rows or a grid but an artifact/page isnt like
    that. it makes its own ... it can also have buttons, drop downs, filters
    ... it shouldnt use everything for everything. its case to case."*

    So this is a DOCUMENT (P7, ops/ideal/the-page-bob-writes.html): a `lede`,
    sections opened by a `head`, paragraphs (`say`) with the figure they
    discuss set `beside` them, a margin `note`, `tabs` over reads made at two
    scopes, a `control` carried by the figure it drives, the plan (`next`).

    It refuses as little as it can and NEVER refuses the composition: a part
    that cannot be understood is dropped and said, the blocks stand, and the
    room lays them out as it always did. Nothing here can change a figure:

    A FIGURE INSIDE A SENTENCE IS A REFERENCE. `{key}` names a `figure` block
    of his; the page draws that row's own value, `{key.change}` its change,
    `{key.was}` its baseline. His words still carry no digit, so the rule that
    kept a number out of his prose is what lets a number into his sentence.

    THE FOUR LAYOUTS ARE THE GRAMMAR'S OWN (composition.grammar.layouts) plus
    `tabs` — one space, the same question at two scopes, switched by the
    person with no read and no turn.

    Every departure is named on `coerced`, because a page he cannot see is one
    he will describe wrongly.
    """
    if tree is None:
        return None
    spec = voc.get("arrangement") or {}
    layouts = (set((voc.get("grammar") or {}).get("layouts") or {})
               | set(spec.get("extra_layouts") or []))
    max_nodes = int(spec.get("max_nodes") or 40)
    max_depth = int(spec.get("max_depth") or 4)
    budget = [max_nodes, int(spec.get("max_says") or 12), int(spec.get("max_heads") or 6)]
    placed: set[str] = set()
    # WHAT HE MAY POINT AT: the blocks this call just validated, and what is
    # already on the board — he is told to give the page ONCE, when it is
    # settled, and a block he put two composes ago is still his.
    kinds: dict[str, Any] = {}
    for obj in list(board or []) + list(blocks or []):
        if isinstance(obj, Mapping) and isinstance(obj.get("key"), str):
            kinds[obj["key"]] = obj.get("kind")
    known = set(keys) | set(kinds)
    # A FIGURE IN A SENTENCE IS THIS TURN'S (W1.1, 2026-09-22). `{key}` named
    # anything on the board, the earlier turns' included, so a page could
    # borrow a figure an earlier answer read — and after a reload, when the
    # board had moved on, draw a dash where the number was. A reference
    # resolves only against the blocks of THIS turn: this call's and the ones
    # its earlier composes put. `own` None keeps the old reading, for a caller
    # that has no turn.
    ref_kinds: dict[str, Any] = dict(kinds)
    if own is not None:
        ref_kinds = {}
        for obj in list(own or []) + list(blocks or []):
            if isinstance(obj, Mapping) and isinstance(obj.get("key"), str):
                ref_kinds[obj["key"]] = obj.get("kind")
    refs = spec.get("refs") or {}
    ref_parts = set(refs.get("parts") or [])
    ref_kind = str(refs.get("of_kind") or "figure")
    sizes = set(spec.get("sizes") or [])
    # THE PLAN IS A PART OF THE PAGE (P6.h): `{"next": true}` places the
    # reading's `next`; unplaced, the room draws it last. Once: a plan drawn
    # twice is two plans. And one lede: a page opens once.
    placed_next = [False]
    placed_lede = [False]
    # HIS CAVEAT, ON THE PAGE (P7): `{"caveat": true}` sets the reading's
    # caveat beside the section it qualifies. Once, for the plan's reason.
    placed_caveat = [False]

    def words(path: str, raw: Any, leaf: str) -> Optional[str]:
        """A line of his — lede, head, say or note — with its references checked."""
        said = " ".join(str(raw or "").split())
        if not said:
            return None
        rule = spec.get(leaf) or {}
        if rule.get("no_digits", True) and any(ch.isdigit() for ch in _REF.sub("", said)):
            # NOT A REFUSAL OF THE COMPOSITION, and not silent either: it sits
            # in the same space as the figures, so it is held to the claim's
            # rule, and the line is dropped rather than the page.
            coerced.append(f"{path}: a line on the page carries no digits — write {{key}} where a "
                           f"`{ref_kind}` block's number belongs and the page draws it with its "
                           f"receipt (metrics.yaml composition.arrangement.refs) — so it was left out")
            return None
        for m in _REF.finditer(said):
            key, part = m.group(1), m.group(2)
            if key not in ref_kinds or ref_kinds.get(key) != ref_kind:
                coerced.append(f"{path}: {{{key}}} names no `{ref_kind}` block of this turn, "
                               f"so the line was left out — compose the figure, then point at it")
                return None
            if part and part not in ref_parts:
                coerced.append(f"{path}: {{{key}.{part}}} is not a part of a figure — it has "
                               f"{', '.join(sorted(ref_parts))} — so the line was left out")
                return None
        try:
            said = _reading.over_length(path, said, rule, 360, coerced,
                                        f"metrics.yaml composition.arrangement.{leaf}")
        except _reading.Rejected:
            return None
        if said.count("{") != said.count("}"):
            # The cut fell inside a reference: end the line before it.
            said = said[:said.rfind("{")].rstrip(" ,;:—-")
        if not said:
            return None
        placed.update(m.group(1) for m in _REF.finditer(said))
        return said

    def node(item: Any, depth: int, path: str) -> Optional[dict]:
        if budget[0] <= 0:
            coerced.append(f"arrangement: more than {max_nodes} parts, so {path} was left out "
                           f"(metrics.yaml composition.arrangement.max_nodes)")
            return None
        if depth > max_depth:
            coerced.append(f"{path}: nested deeper than {max_depth}, so it was left out "
                           f"(metrics.yaml composition.arrangement.max_depth)")
            return None
        if not isinstance(item, Mapping):
            # A BARE KEY IS A LEAF. He writes `["a", "b"]` about as often as
            # the long form, and refusing it would cost a round trip to learn
            # a punctuation rule.
            if isinstance(item, str) and item in known:
                return node({"block": item}, depth, path)
            coerced.append(f"{path}: not a part of a page, so it was left out")
            return None

        if item.get("next") is True or ("next" in item and len(item) == 1):
            if placed_next[0]:
                coerced.append(f"{path}: the plan is already placed, so it was left out "
                               f"a second time")
                return None
            placed_next[0] = True
            budget[0] -= 1
            return {"next": True}

        if item.get("caveat") is True or ("caveat" in item and len(item) == 1):
            if placed_caveat[0]:
                coerced.append(f"{path}: your caveat is already placed, so it was left out "
                               f"a second time")
                return None
            placed_caveat[0] = True
            budget[0] -= 1
            return {"caveat": True}

        for leaf in ("lede", "head", "say", "note"):
            if leaf not in item:
                continue
            purse = 2 if leaf == "head" else 1
            if budget[purse] <= 0:
                coerced.append(
                    f"{path}: more than {spec.get('max_heads')} headings on one page, so this one "
                    f"was left out" if purse == 2 else
                    f"{path}: more than {spec.get('max_says')} of your own lines "
                    f"in the arrangement, so this one was left out")
                return None
            said = words(path, item.get(leaf), leaf)
            if said is None:
                return None
            if leaf == "lede":
                if placed_lede[0]:
                    leaf = "say"          # a page opens once; a second opening is a paragraph
                placed_lede[0] = True
            budget[0] -= 1
            budget[purse] -= 1
            out: dict[str, Any] = {leaf: said}
            if leaf == "note" and isinstance(item.get("label"), str):
                label = " ".join(item["label"].split())
                cap = int((spec.get("note") or {}).get("label_max_length") or 48)
                if label and not any(ch.isdigit() for ch in label):
                    out["label"] = label[:cap]
            return out

        if "block" in item:
            key = item.get("block")
            if not isinstance(key, str) or not re.match(voc["key_pattern"], key):
                coerced.append(f"{path}: {key!r} is not a block of this composition, "
                               f"so it was left out of the arrangement")
                return None
            if key not in known:
                # A PLACE WAITS FOR ITS BLOCK (P13, 2026-09-21). You are told to
                # give the page ONCE, when it is settled — and a page given
                # before the last compose names keys that have not arrived yet.
                # Dropping them silently cost his live page of 17:05 the figure
                # it was written around. The place is kept; the room draws the
                # block when it arrives and nothing until then.
                coerced.append(f"{path}: {key!r} is not on the board yet — the page keeps its "
                               f"place and draws it when you compose it")
            if key in placed:
                # ONE READ IS ONE OBJECT (board.readIdentity). Drawn twice it
                # would be the same figure under two headings.
                coerced.append(f"{path}: {key!r} is already placed, so it was left out "
                               f"of the arrangement a second time")
                return None
            placed.add(key)
            budget[0] -= 1
            leaf_out: dict[str, Any] = {"block": key}
            # HOW IT SITS, never what it says: beside the words that follow it,
            # at a size — or neither, and the page sizes it by what it draws
            # and balances it against the words.
            if item.get("beside") is True:
                leaf_out["beside"] = True
            size = item.get("size")
            if size is not None:
                if size in sizes:
                    leaf_out["size"] = size
                else:
                    coerced.append(f"{path}: {size!r} is not a size — {', '.join(sorted(sizes))} "
                                   f"— so the page sizes {key!r} itself")
            control = item.get("control")
            if control is not None:
                if (isinstance(control, str) and control in known
                        and kinds.get(control) == "control" and control not in placed):
                    leaf_out["control"] = control
                    placed.add(control)
                else:
                    coerced.append(f"{path}: {control!r} is not a control block of this "
                                   f"composition, so {key!r} is drawn without one")
            return leaf_out

        # ---- a layout arranges other parts ---------------------------------
        word = item.get("layout")
        if word not in layouts:
            # The discriminator under another name, exactly as the grammar
            # already forgives it (agent/grammar._normalise).
            found = next((k for k in item if k in layouts), None)
            if found is None:
                coerced.append(f"{path}: names no layout of "
                               f"{', '.join(sorted(layouts))}, so it was left out")
                return None
            inner = item.get(found)
            item = dict(inner) if isinstance(inner, Mapping) else {"children": inner}
            word = found
            coerced.append(f"{path}: read as a {word}")
        budget[0] -= 1
        kids = item.get("children")
        kids = kids if isinstance(kids, (list, tuple)) else []
        drawn = [c for c in (node(k, depth + 1, f"{path}.{word}[{n}]")
                             for n, k in enumerate(kids)) if c]
        if not drawn:
            return None
        out = {"layout": word, "children": drawn}
        if word == "tabs":
            # ONE SPACE, SEVERAL VIEWS — and a view nobody can name is a stack.
            rule = spec.get("tabs") or {}
            lo, hi = int(rule.get("min") or 2), int(rule.get("max") or 4)
            cap = int(rule.get("label_max_length") or 28)
            labels = item.get("labels") if isinstance(item.get("labels"), (list, tuple)) else []
            labels = [" ".join(str(x).split())[:cap] for x in labels]
            if (not lo <= len(drawn) <= hi or len(labels) != len(drawn)
                    or any(not x or any(ch.isdigit() for ch in x) for x in labels)):
                coerced.append(f"{path}: tabs take {lo} to {hi} views and a plain label for "
                               f"each, so this was laid out as a stack")
                out["layout"] = "stack"
            else:
                out["labels"] = labels
        if word == "fold":
            # A LONG THING PRESENT WITHOUT BEING A WALL (P15.a). What a person
            # decides to open has to say what is in there, so a fold with no
            # label is a stack — otherwise the page hides something behind the
            # word "more". No digit in it: a count is the drawing's to make.
            rule = spec.get("fold") or {}
            cap = int(rule.get("label_max_length") or 48)
            label = item.get("label")
            label = " ".join(str(label).split())[:cap] if isinstance(label, str) else ""
            if (not label or any(ch.isdigit() for ch in label)
                    or len(drawn) < int(rule.get("min") or 1)):
                coerced.append(f"{path}: a fold takes a plain label saying what is inside "
                               f"it, so this was laid out as a stack")
                out["layout"] = "stack"
            else:
                out["label"] = label
        if word == "grid":
            cols = item.get("cols")
            out["cols"] = cols if isinstance(cols, int) and 1 < cols <= 6 else 2
        if word == "panel" and isinstance(item.get("heading"), str):
            head = " ".join(item["heading"].split())
            if head and not any(ch.isdigit() for ch in head):
                out["heading"] = head
        return out

    def _unfold_caveat(n: Any, inside: bool) -> Any:
        """
        HIS CAVEAT IS NEVER BEHIND A DISCLOSURE (2026-09-21).

        A fold is closed at rest and `{caveat: true}` placed inside one is drawn
        nowhere a reader will see it — and worse, the room reads "the page
        carries the caveat" and stops drawing it beside his answer, so the
        qualification disappears from the screen entirely. Dropped from inside a
        fold and named, which returns it to its place beside his answer.
        """
        if not isinstance(n, Mapping):
            return n
        if "children" in n:
            folded = inside or n.get("layout") == "fold"
            kids = [k for k in (_unfold_caveat(k, folded) for k in n["children"]) if k]
            if not kids:
                return None
            return {**n, "children": kids}
        if inside and "caveat" in n:
            coerced.append("arrangement: a caveat cannot sit inside a fold — it would be "
                           "closed, so it was left beside your answer instead")
            return None
        return n

    built = node(tree, 1, "arrangement")
    built = _unfold_caveat(built, False)
    if built is None:
        return None
    # A BLOCK IS NEVER LOST. One he composed and did not place is drawn after
    # the tree, in his order — a figure that vanishes because an arrangement
    # forgot it is the one failure this may not have. A figure he pointed at
    # from a sentence IS placed: it is in the sentence.
    left = [k for k in keys if k not in placed and kinds.get(k) != "control"]
    if left:
        # SAID AS A COUNT, BECAUSE ONE IS A SLIP AND EIGHT IS A PAGE THAT FORGOT
        # ITS FIGURES (P13). His live page of 17:05 placed one of nine.
        coerced.append(f"arrangement: {len(left)} of your blocks "
                       f"{'is' if len(left) == 1 else 'are'} NOT on the page "
                       f"({', '.join(repr(k) for k in left[:6])}"
                       f"{', …' if len(left) > 6 else ''}) — drawn after it, in a place you did "
                       f"not choose. Every block you compose belongs where its words are.")
    return built


def notes_on_the_page(tree: Any) -> str:
    """
    The MARGIN NOTES he placed on the page, as one string.

    THE NOTICE GATE HAS TO READ THESE (2026-09-21). `reading.said_this_turn`
    read the answer, the caveat slot and the plan — and nothing of the page,
    which is where P7 put `note`: the aside drawn beside the figure it
    qualifies. So a qualification written exactly where UI rule 4 asks for it
    counted as unsaid, and the loop appended the same notice verbatim
    underneath. A wall of caveat in the slot passed the gate; a placed note
    failed it. That is backwards.

    ONLY `note`, AND DELIBERATELY NOT THE WHOLE PAGE. A fingerprint is "every
    group matches, any alternative within a group suffices", so feeding it the
    page's ~640 words of `lede`, `head` and `say` would let a notice be counted
    as conveyed by prose that happens to contain the words — silencing a real
    caveat. Trustworthiness about numbers is the floor, so this takes the one
    leaf whose PURPOSE is to carry a qualification, and leaves the argument
    prose out.

    Bounded like every other walk of this tree, so a hostile one costs what an
    honest one does.
    """
    said: list[str] = []
    budget = [200]

    def walk(node: Any, depth: int) -> None:
        if budget[0] <= 0 or depth > 8:
            return
        budget[0] -= 1
        if isinstance(node, (list, tuple)):
            for kid in node:
                walk(kid, depth + 1)
            return
        if not isinstance(node, Mapping):
            return
        # A NOTE INSIDE A FOLD IS NOT SURFACED (2026-09-21). A fold is CLOSED at
        # rest, so a caveat written inside one is not on screen — and counting
        # it as said would let a notice UI rule 4 requires drawn be discharged
        # by text nobody sees. The grammar tells him never to fold a caveat;
        # this is the half that does not depend on him reading it.
        if node.get("layout") == "fold":
            return
        text = node.get("note")
        if isinstance(text, str) and text.strip():
            said.append(text)
        walk(node.get("children"), depth + 1)

    walk(tree, 0)
    return "\n\n".join(said)


def _in_words(tree: Any, voc: Mapping[str, Any]) -> dict[str, str]:
    """
    The keys this page does NOT draw as a block, each with the kind it must be:
    a `figure` named only inside a sentence (`{key}`), a `control` carried on a
    figure. Placed as a block anywhere in the tree, a key is a block again.

    Read from the RAW tree, because it decides what `validate` may accept and
    the tree is validated after the blocks it arranges. Bounded by the same
    `max_nodes`, so a hostile tree costs what an honest one does.
    """
    spec = voc.get("arrangement") or {}
    ref_kind = str((spec.get("refs") or {}).get("of_kind") or "figure")
    budget = [int(spec.get("max_nodes") or 40) * 2]
    found: dict[str, str] = {}
    placed: set[str] = set()

    def walk(node: Any, depth: int) -> None:
        if budget[0] <= 0 or depth > 8 or not isinstance(node, Mapping):
            return
        budget[0] -= 1
        if isinstance(node.get("block"), str):
            placed.add(node["block"])
        if isinstance(node.get("control"), str):
            found.setdefault(node["control"], "control")
        for leaf in ("lede", "head", "say", "note"):
            if isinstance(node.get(leaf), str):
                for m in _REF.finditer(node[leaf]):
                    found.setdefault(m.group(1), ref_kind)
        kids = node.get("children")
        if isinstance(kids, (list, tuple)):
            for kid in kids:
                walk(kid, depth + 1)

    walk(tree, 0)
    return {k: kind for k, kind in found.items() if k not in placed}


def left_off(tree: Any, blocks: Iterable[Mapping[str, Any]],
             voc: Mapping[str, Any]) -> list[str]:
    """
    The keys he composed and did not put on the page, in his order.

    A figure is ON the page if the tree places it as a block, names it inside a
    sentence (`{key}`), or carries it as a control on a figure — `_in_words`
    already knows the last two. A block the MACHINE composed (`default`) is not
    his and is not counted: he never chose it.

    Empty when there is no page WRITTEN AS ONE, because a board with no
    arrangement, or an arrangement that only lays blocks out, is laid out for
    him (`pageOf`) and nothing has been left anywhere.
    """
    if not isinstance(tree, Mapping) or not is_a_document(tree):
        return []
    placed: set[str] = set()

    def walk(node: Any, depth: int) -> None:
        if depth > 8 or not isinstance(node, Mapping):
            return
        if isinstance(node.get("block"), str):
            placed.add(node["block"])
        kids = node.get("children")
        if isinstance(kids, (list, tuple)):
            for kid in kids:
                walk(kid, depth + 1)

    walk(tree, 0)
    placed |= set(_in_words(tree, voc))
    return [b["key"] for b in blocks
            if isinstance(b, Mapping) and isinstance(b.get("key"), str)
            and not b.get("default") and b["key"] not in placed]


def is_a_document(tree: Any, depth: int = 0) -> bool:
    """Whether the page is written as one: it has an opening sentence or a heading."""
    if depth > 8 or not isinstance(tree, Mapping):
        return False
    if isinstance(tree.get("lede"), str) or isinstance(tree.get("head"), str):
        return True
    kids = tree.get("children")
    return isinstance(kids, (list, tuple)) and any(is_a_document(k, depth + 1) for k in kids)


def _mark_kinds(voc: Mapping[str, Any]) -> set[str]:
    """The widgets that are ways of drawing a read — the ones with a `rows` rule."""
    return {k for k, v in (voc.get("widgets") or {}).items()
            if isinstance(v, Mapping) and v.get("rows")}


def _drawn_as(kind: str, item: Mapping[str, Any], call: Mapping[str, Any], key: str,
              defs: Mapping[str, Any], question: Optional[str], board: Any,
              coerced: list[str]) -> str:
    """
    THE SHAPE A BLOCK IS DRAWN AS (P2S.3): the one Bob named, unless his
    rows cannot make it or it is a shape drawn only when asked and nobody
    asked. Then it is the shape those rows make by default, and the coercion
    is named. A drawing changes; no value does (agent/vocabulary.py).
    """
    from agent import default_composition, vocabulary

    def fallback(why: str) -> str:
        shaped = default_composition.shape_for(call, 0, key, "supporting")
        instead = str((shaped or {}).get("kind") or "table")
        if instead == kind:
            return kind
        coerced.append(f"{key!r}: {why}, so it is drawn as a {instead}")
        return instead

    if vocabulary.only_when_asked(kind, defs) and not vocabulary.asked_for(
            kind, question, defs, board, key):
        return fallback(f"a {kind} is drawn only when the person asks for one")
    if not vocabulary.drawable(kind, call.get("rows"), defs, item):
        rule = ((defs["composition"]["widgets"][kind].get("rows")) or "")
        said = (defs["composition"].get("shape_rows") or {}).get(rule, rule)
        return fallback(f"a {kind} needs {said}, and read {item.get('seq')} does not carry that")
    if kind == "gauge" and len(call.get("rows") or []) != 1:
        return fallback("a gauge draws one row, and this read returned several")
    return kind


def validate(
    submitted: Any,
    calls: Mapping[int, Mapping[str, Any]],
    defs: Mapping[str, Any],
    board: Any = None,
    coerced: Optional[list[str]] = None,
    question: Optional[str] = None,
    arrangement: Any = None,
) -> tuple[list[dict], list[dict]]:
    """
    Split a submitted composition into the blocks that may be drawn and those
    that may not, each refusal with a reason a person could act on.

    `board` is what is already on the screen, as the question carried it
    (key, kind, and the read behind each object). A `put` of a read already
    there under a new key is REWRITTEN to a `change` of the existing key —
    not refused: the model meant "show this", and the board's rule is that
    one read is one object. The rewrite is named on the edit and in meta.

    `coerced` collects every block that was adjusted rather than refused, in
    words, for the caller to hand back. See the module docstring for where
    the line between the two sits.
    """
    existing = _existing_reads(board)
    voc = vocabulary(defs)
    # THE FIGURES THIS TURN READ, for a block's `thought` — the reading's rule.
    from agent import reading as _reading_rules
    returned = _reading_rules.returned_numbers(calls.values())

    def thought_of(text: Any) -> str:
        try:
            return _reading_rules.check_sentence(
                "thought", text, voc.get("thought") or {}, returned, defs,
                coerced, "composition.thought")
        except _reading_rules.Rejected as why:
            raise Rejected(str(why)) from None

    def ruled_out_of(flag: Any) -> bool:
        # A FLAG, NEVER A SENTENCE (composition.ruled_out): why a read was
        # ruled out is Bob's to say in the reading, with its receipts.
        if not isinstance(flag, bool):
            raise Rejected("ruled_out is true or false — the why belongs in what you say")
        return flag
    widgets: Mapping[str, Any] = voc["widgets"]
    weights = list(voc["weights"])
    allowed = set(voc["allowed_fields"])
    key_re = re.compile(voc["key_pattern"])
    max_blocks = int(voc["max_blocks"])
    # WHAT THE PAGE DOES NOT DRAW AS A BLOCK (P7): a figure that lives only in
    # a sentence of his, a control that rides on a figure. Read off the page he
    # sent with this same call, before it is validated — a line later dropped
    # leaves its figure a block like any other, drawn after the tree.
    in_words = _in_words(arrangement, voc)
    max_in_words = int(((voc.get("arrangement") or {}).get("refs") or {}).get("max_in_words") or 0)
    drawn = spoken = 0
    state_labels = set(voc.get("state_labels", []))
    arguments = set(voc.get("control_arguments", []))
    # Which argument carries a window, per tool. One map, already declared for
    # backtesting (workflows.backtest.window_arguments), so a control and a
    # backtest cannot disagree about what a tool's window is called.
    windows_by_tool: Mapping[str, Any] = (
        (defs.get("workflows") or {}).get("backtest") or {}
    ).get("window_arguments") or {}

    ops: Mapping[str, Any] = voc["ops"]
    default_op = str(voc["default_op"])

    accepted: list[dict] = []
    rejected: list[dict] = []
    keys_seen: set[str] = set()
    lead_key: Optional[str] = None
    # key -> (under, relation), as said. Settled by `_hang` once the whole
    # composition is known, because `under` may name a block still to come.
    hangs: dict[str, tuple] = {}
    coerced = [] if coerced is None else coerced

    blocks = submitted.get("blocks") if isinstance(submitted, Mapping) else submitted
    if blocks is None:
        return accepted, rejected
    if not isinstance(blocks, (list, tuple)):
        rejected.append({"block": submitted, "reason": "a composition is a list of blocks"})
        return accepted, rejected

    for item in list(blocks)[: max_blocks + max_in_words + 1]:
        try:
            rides = (isinstance(item, Mapping) and isinstance(item.get("key"), str)
                     and in_words.get(item["key"]) == item.get("kind"))
            if rides and spoken >= max_in_words:
                raise OverBound(f"more than {max_in_words} figures inside your sentences; past that "
                               f"it is a table — draw the read as one")
            if not rides and drawn >= max_blocks:
                raise OverBound(f"more than {max_blocks} blocks; a workspace is not a report — a "
                               f"figure written into a sentence as {{key}} is not counted")
            if not isinstance(item, Mapping):
                raise Rejected("not a block")

            # STILL A REFUSAL, AND DELIBERATELY SO (P1.a, 2026-09-13). This
            # was the one coercion on the list that came off it. A block
            # carrying `value: 412884`, `colour`, `width` or `title` is not a
            # misspelling — it is the attempt this file exists to stop, and
            # "dropped the field, drew the rest" teaches nothing while
            # "refused, Bob composes and the system draws" teaches the
            # rule. It costs nothing either: the tool schema is
            # additionalProperties:false, so a well-formed call cannot carry
            # one, and four recorded runs of the twelve contain zero of them.
            # A coercion that buys no round trip and blunts a trust boundary
            # is a bad trade in one direction only.
            extra = set(item.keys()) - allowed
            if extra:
                # DROPPED, NOT REFUSED, SINCE 2026-09-19 — except the names
                # that are the attempt itself (composition.refused_fields):
                # `claim_note` cost the P2S.✓ follow-up turn a whole round
                # and the renderer never reads a field it does not know, so
                # dropping one changes nothing drawn. `value`, `colour`,
                # `size`, `title` and their kin still refuse, and still teach.
                refused = extra & set((defs.get("composition") or {}).get("refused_fields") or ())
                if refused:
                    raise Rejected(
                        f"a block may not carry {sorted(refused)}: Bob composes, the system "
                        f"draws (metrics.yaml composition.allowed_fields)"
                    )
                coerced.append(
                    f"{item.get('key', '?')!r}: {sorted(extra)} dropped — Bob composes, "
                    f"the system draws (metrics.yaml composition.allowed_fields)"
                )
                item = {k: v for k, v in item.items() if k in allowed}

            op = item.get("op", default_op)
            if op not in ops:
                raise Rejected(f"{op!r} is not one of {', '.join(ops)} (metrics.yaml composition.ops)")

            key = item.get("key")
            if not isinstance(key, str) or not key_re.match(key):
                raise Rejected("every block needs a short key like 'rockwell' or 'seikyo-order'")
            if key in keys_seen:
                raise Rejected(f"key {key!r} is edited twice in one turn")

            # WHAT IT HANGS OFF, recorded now and settled after the loop:
            # `under` names another block of this same composition, which may
            # not have arrived yet. Every path out of this block — a change, a
            # drop, a spec, a named widget — passes through here, so this is
            # the one place it has to be caught. See `_hang`.
            if "under" in item or "relation" in item:
                hangs[key] = (item.get("under"), item.get("relation"))

            # An edit to something already on the board carries only what
            # changes. Nothing here can name a figure, so a partial edit is as
            # safe as a whole one — with the one exception below.
            if op in ("drop", "quiet"):
                # NAMING THE KEY IS THE WHOLE EDIT, and anything else Bob
                # restated alongside it is ignored rather than refused. A
                # `quiet` that carries the seq it is quieting says the same
                # thing twice; refusing it lost a round trip and quieted
                # nothing.
                said_too = sorted(f for f in ("kind", "seq", "subject", "claim",
                                              "label", "argument")
                                  if f in item)
                if said_too:
                    coerced.append(
                        f"{key!r}: a {op} names a key and nothing else, so "
                        f"{said_too} was ignored"
                    )
                keys_seen.add(key)
                edit = {"op": op, "key": key}
                if op == "quiet":
                    edit["weight"] = "quiet"
                accepted.append(edit)
                continue

            kind = item.get("kind")

            # THIS IS THAT (server side). Only a fresh `put` under a key not on
            # the board, over a read the board already draws for the same
            # subject: it becomes a `change` of that object, and the model is
            # told which key it became.
            rewritten_from: Optional[str] = None
            if op == "put" and existing and kind != "control" and key not in {
                o.get("key") for o in (board or []) if isinstance(o, Mapping)
            }:
                seq_for = item.get("seq")
                if seq_for is None and isinstance(item.get("seqs"), (list, tuple)) and item["seqs"]:
                    seq_for = item["seqs"][0]
                call_for = calls.get(seq_for) if isinstance(seq_for, int) else None
                if call_for is not None:
                    ident = read_identity(call_for.get("tool"), call_for.get("arguments"),
                                          item.get("subject"))
                    twin = existing.get(ident)
                    if twin and twin != key and twin not in keys_seen:
                        rewritten_from, key, op = key, twin, "change"

            if op == "change" and kind is None:
                # Changing prominence, or which read an object draws, without
                # restating what kind of object it is.
                weight = item.get("weight")
                if weight is not None and weight not in weights:
                    raise Rejected(f"weight {weight!r} is not one of {', '.join(weights)}")
                if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                    weight = _demote(key, lead_key, weights, coerced)
                edit = {"op": "change", "key": key}
                if weight:
                    edit["weight"] = weight
                    if weight == "lead":
                        lead_key = key
                # RETITLING IS NOT RENAMING WHAT AN OBJECT IS ABOUT. A claim
                # says what the block SAYS; it names no row and carries no
                # figure, so it changes on its own exactly as a weight does.
                if "claim" in item:
                    edit["claim"] = _claim(item["claim"], voc, coerced, key)
                if "question" in item:
                    edit["question"] = _question(item["question"], voc, coerced, key)
                if "thought" in item:
                    edit["thought"] = thought_of(item["thought"])
                if "ruled_out" in item:
                    edit["ruled_out"] = ruled_out_of(item["ruled_out"])
                if "seq" in item:
                    call = _read(calls, item.get("seq"))
                    edit["seq"] = item["seq"]
                    edit["tool"] = call.get("tool")
                    for field in ("subject", "label", "argument"):
                        if field in item:
                            edit[field] = item[field]
                    if isinstance(edit.get("subject"), str) and not _backs(call, edit["subject"]):
                        raise Rejected(f"read {item['seq']} has no row for {edit['subject']!r}")
                elif voc.get("change_subject_requires_seq") and "subject" in item:
                    # Otherwise the object would claim to be about something the
                    # rows it still draws never carried.
                    raise Rejected(
                        "to change what an object is about, name the read it comes from too"
                    )
                if len(edit) == 2:
                    # A NO-OP IS NOT A MISTAKE, it is a restatement. The object
                    # stays exactly as it is either way, so the only thing a
                    # refusal changed was the round trip count.
                    coerced.append(
                        f"{key!r}: a change with nothing to change — the object "
                        f"is as it was"
                    )
                    keys_seen.add(key)
                    continue
                keys_seen.add(key)
                accepted.append(edit)
                continue

            # "MAKE THAT ONE A PIE" (P2S.3). A change naming a new kind and no
            # read redraws the object already on the board under that key, over
            # the rows it already draws. Nothing is read and no value moves, so
            # it needs no seq — only that the object is a drawing of a read and
            # the new kind is one too. Whether its rows can make the shape is
            # the client's to answer with the same rule (catalogue.drawable);
            # a pie its rows cannot make is drawn as what they do make.
            if (op == "change" and kind is not None and "seq" not in item
                    and item.get("spec") is None):
                marks = _mark_kinds(voc)
                if kind not in marks:
                    raise Rejected(
                        f"{kind!r} is not a shape a read is drawn as — reshape to one of "
                        f"{', '.join(sorted(marks))}"
                    )
                on_board = next((o for o in (board or [])
                                 if isinstance(o, Mapping) and o.get("key") == key), None)
                if on_board is None:
                    raise Rejected(
                        f"nothing on the board is called {key!r} — to draw a read as a "
                        f"{kind}, name its seq"
                    )
                if (str(on_board.get("kind")) in set(widgets) - marks
                        or on_board.get("kind") == voc.get("composed_kind")):
                    raise Rejected(
                        f"{key!r} is a {on_board.get('kind')}, not a drawing of a read, so it "
                        f"has no other shape"
                    )
                from agent import vocabulary as _vocabulary
                if (_vocabulary.only_when_asked(kind, defs)
                        and not _vocabulary.asked_for(kind, question, defs, board, key)):
                    coerced.append(
                        f"{key!r}: a {kind} is drawn only when the person asks for one, so "
                        f"it stays as it was"
                    )
                    keys_seen.add(key)
                    continue
                edit = {"op": "change", "key": key, "kind": kind}
                for field in ("field", "against"):
                    if isinstance(item.get(field), str):
                        edit[field] = item[field]
                if "claim" in item:
                    edit["claim"] = _claim(item["claim"], voc, coerced, key)
                if "question" in item:
                    edit["question"] = _question(item["question"], voc, coerced, key)
                if "thought" in item:
                    edit["thought"] = thought_of(item["thought"])
                if "ruled_out" in item:
                    edit["ruled_out"] = ruled_out_of(item["ruled_out"])
                keys_seen.add(key)
                accepted.append(edit)
                continue

            # A COMPOSED SHAPE, when nothing named fits. The block carries a
            # tree instead of a widget name, and agent/grammar.py holds it to
            # the same guarantee by a stricter route: every mark names a read
            # and a COLUMN, so a shape nobody listed in advance still cannot
            # put a figure on screen that no tool returned.
            if item.get("spec") is not None:
                if kind is not None:
                    raise Rejected(
                        "a block carries a kind or a spec, never both — the "
                        "named widgets are shorthand for shapes this grammar "
                        "can also express"
                    )
                weight = item.get("weight", "supporting")
                if weight not in weights:
                    raise Rejected(f"weight {weight!r} is not one of {', '.join(weights)}")
                if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                    weight = _demote(key, lead_key, weights, coerced)
                try:
                    spec = grammar.validate_spec(item["spec"], calls=calls, defs=defs,
                                                 coerced=coerced)
                except grammar.Rejected as why:
                    raise Rejected(str(why)) from why
                keys_seen.add(key)
                if weight == "lead":
                    lead_key = key
                accepted.append({
                    "op": op, "key": key, "weight": weight, "spec": spec,
                    # Which reads it draws, so the loop charts them exactly as
                    # it charts a widget's single read.
                    "seqs": grammar.reads_in(spec),
                })
                continue

            if kind not in widgets:
                raise Rejected(f"{kind!r} is not a widget (metrics.yaml composition.widgets)")

            weight = item.get("weight", "supporting")
            if weight not in weights:
                raise Rejected(f"weight {weight!r} is not one of {', '.join(weights)}")
            if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                # EVERY KIND DEMOTES NOW (P1.f). The one that did not was
                # `hero`, whose whole point was the expressive tile at the top;
                # it is gone with the rest of the names the renderer did not
                # draw, and a second block asking to lead is a composition
                # worth drawing one rank down.
                weight = _demote(key, lead_key, weights, coerced)

            # WHICH SHAPE IT IS DRAWN AS, decided before what the shape needs,
            # because a pie its rows cannot make becomes what they do make and
            # takes that shape's needs (P2S.3).
            if widgets[kind].get("rows") and isinstance(item.get("seq"), int) \
                    and not isinstance(item.get("seq"), bool):
                read_for = _read(calls, item.get("seq"))
                kind = _drawn_as(kind, item, read_for, key, defs, question, board, coerced)

            needs = list(widgets[kind].get("needs") or [])
            block: dict[str, Any] = {"op": op, "kind": kind, "key": key, "weight": weight}
            for field in ("field", "against"):
                if field in item and not isinstance(item[field], str):
                    raise Rejected(f"{field} names a column of the read, as a string")
            # A COLUMN IS NAMED, NEVER A VALUE — held exactly as the grammar
            # holds a channel. Only the shapes that draw two measures of a row
            # take them; on any other shape they would mean nothing, so they
            # are dropped and said.
            takes = {"field", "against"} if kind == "scatter" else {"against"} if kind == "gauge" else set()
            for field in ("field", "against"):
                if field not in item:
                    continue
                if field in takes:
                    block[field] = item[field]
                else:
                    coerced.append(f"{key!r}: a {kind} draws no {field}, so it was ignored")
            if "ruled_out" in item:
                if ruled_out_of(item["ruled_out"]):
                    block["ruled_out"] = True

            # POINTING IS NOT A SHAPE. A claim and an emphasis annotate
            # whatever is drawn, so they belong on a named widget as much as on
            # a composed one — held to the same "no digits" rule, which is the
            # whole of what makes a few words over a figure safe.
            if "claim" in item:
                block["claim"] = _claim(item["claim"], voc, coerced, key)
            if "question" in item:
                block["question"] = _question(item["question"], voc, coerced, key)
            if "thought" in item:
                block["thought"] = thought_of(item["thought"])
            if "emphasise" in item:
                # ONE ROW OR SEVERAL (2026-09-15). It took one, and a
                # comparison is about two: asked to compare two shops Bob
                # lit one of them and wrote "Both selected shops" as the
                # claim, which the drawing could not support. Each name is
                # held to exactly the rule one name was held to; the cap is
                # what keeps it an emphasis rather than a second way to draw
                # every row bright.
                said = item["emphasise"]
                many = said if isinstance(said, (list, tuple)) else [said]
                cap = int((voc.get("grammar", {}).get("channels", {})
                           .get("emphasise", {}) or {}).get("max_emphasised") or 3)
                if len(many) > cap:
                    # PAST THE CAP, THE FIRST ONES ARE KEPT (P2S.7). Lighting
                    # a fourth row changes no value — it is emphasis, not a
                    # figure — and refusing it threw away the whole block: the
                    # `caveats` turn of both P2S.6 runs lost its board to it.
                    # His order is his ranking, so the first `cap` stand.
                    coerced.append(
                        f"{key!r}: emphasise names at most {cap} rows, so only "
                        f"{', '.join(repr(str(x)) for x in many[:cap])} are lit"
                    )
                    many = list(many)[:cap]
                try:
                    lit = [grammar.annotation("emphasise", one, defs) for one in many]
                except grammar.Rejected as why:
                    raise Rejected(str(why)) from why
                # A single name stays a STRING on the block, so every board
                # stored before today draws exactly as it did.
                block["emphasise"] = lit[0] if len(lit) == 1 else lit

            if "seq" in needs:
                call = _read(calls, item.get("seq"))
                block["seq"] = item["seq"]
                block["tool"] = call.get("tool")
                # A POINTED ANNOTATION (composition.span, P6.a): the first and
                # last row of a stretch, by the rows' own labels. Presentation
                # only, so a bad one is DROPPED and said, never refused — it
                # cannot change a value. Needs a `thought` to point with.
                if "span" in item:
                    said = item["span"]
                    ends = list(said) if isinstance(said, (list, tuple)) else []
                    labels = set()
                    for r in call.get("rows") or []:
                        for k in ("day", "week", "month", "store", "product", "category", "subject"):
                            if r.get(k) is not None:
                                labels.add(str(r[k]))
                    # ONE LABEL IS ONE ROW (P6.e): a callout under the one shop
                    # of a set of multiples, as the design draws "the one that
                    # did not come back" under Rockwell. Two bound a stretch.
                    if (1 <= len(ends) <= 2 and all(isinstance(e, str) for e in ends)
                            and all(e in labels for e in ends) and item.get("thought")):
                        block["span"] = [ends[0], ends[-1]]
                    else:
                        coerced.append(
                            f"{key!r}: `span` names a row, or the first and last row of a "
                            f"stretch, by the rows' own labels and needs a `thought` to "
                            f"point with; this one was left off")
            else:
                call = None

            if "subject" in needs:
                subject = item.get("subject")
                assert call is not None
                if not isinstance(subject, str) or not subject.strip():
                    # WHEN THERE IS ONE ROW THERE IS NO CHOICE. The subject
                    # selects a row; a read that returned one row has already
                    # selected it, and the client draws that row whether the
                    # block names it or not. So the block stands, captioned
                    # from the read's own scope where it declares one and from
                    # the row itself where it does not — never from anything
                    # Bob supplied. On a many-row read this is still a
                    # refusal, because there choosing IS the judgement.
                    if len(call.get("rows") or []) != 1:
                        raise Rejected(
                            f"a {kind} names the subject it is about — read "
                            f"{item.get('seq')} returned "
                            f"{len(call.get('rows') or [])} rows, so which one "
                            f"this draws is yours to say"
                        )
                    implied = _implied_subject(call)
                    if implied:
                        block["subject"] = implied
                        coerced.append(
                            f"{key!r}: a {kind} names a subject — read "
                            f"{item.get('seq')} is filtered to {implied!r} and "
                            f"returned one row, so that is what it is about"
                        )
                    else:
                        coerced.append(
                            f"{key!r}: a {kind} names a subject — read "
                            f"{item.get('seq')} returned one row, so it draws "
                            f"that row and takes its name from it"
                        )
                elif not _backs(call, subject):
                    raise Rejected(f"read {item['seq']} has no row for {subject!r}")
                else:
                    block["subject"] = subject.strip()

            if "argument" in needs:
                # SCOPE ONLY. A control re-runs a read with one scope argument
                # changed; a threshold is a definition and has no control.
                argument = item.get("argument")
                if argument not in arguments:
                    raise Rejected(
                        f"a control changes one of "
                        f"{', '.join(sorted(arguments))} — scope, never a "
                        f"threshold (metrics.yaml composition.control_arguments)"
                    )
                # AND THE TOOL HAS TO TAKE IT. The closed list says which
                # arguments a control MAY change; it does not say this read
                # has one. get_purchase_plan's window is `lookback_days`, a
                # number of days — offering it four date presets drew a
                # control whose every option would have been refused on
                # click, which is worse than no control.
                assert call is not None
                if argument == "date_range":
                    carries = (windows_by_tool.get(str(call.get("tool"))) or "")
                    if carries != "date_range":
                        raise Rejected(
                            f"{call.get('tool')} has no date_range to change"
                            + (f" — its window is {carries!r}, which a window "
                               f"control cannot set yet" if carries else
                               " — it takes no window at all")
                        )
                block["argument"] = argument

            if "label" in needs:
                label = item.get("label")
                if label not in state_labels:
                    raise Rejected(f"state label must be one of {', '.join(sorted(state_labels))}")
                block["label"] = label
                if isinstance(item.get("seq"), int):
                    _read(calls, item["seq"])
                    block["seq"] = item["seq"]

            keys_seen.add(key)
            if weight == "lead":
                lead_key = key
            if rewritten_from:
                # Named on the edit, so the stored composition says what
                # happened and the model learns the key it became.
                block["op"] = "change"
                block["key"] = key
                block["rewritten_from"] = rewritten_from
            accepted.append(block)
            if rides:
                spoken += 1
            else:
                drawn += 1
        except Rejected as why:
            rejected.append({"block": item, "reason": str(why),
                             **({"bound": "count"} if isinstance(why, OverBound) else {})})

    _hang(accepted, hangs, voc, coerced)
    return accepted, rejected


def req_size(defs: Mapping[str, Any], key: str) -> Any:
    """A key of metrics.yaml composition.size, which every size rule reads."""
    return ((defs.get("composition") or {}).get("size") or {})[key]


def size_order(defs: Mapping[str, Any]) -> list[str]:
    """The sizes, smallest first (composition.size.order)."""
    return [str(k) for k in req_size(defs, "order")]


def size_spec(size: Optional[str], defs: Mapping[str, Any]) -> dict:
    """One size's bounds, with its nulls read from where they live."""
    spec = dict((req_size(defs, "kinds") or {}).get(size) or {})
    if spec and spec.get("max_words") is None:
        spec["max_words"] = int(((defs.get("voice") or {}).get("body") or {}).get("max_words") or 40)
    return spec


def resolve_size(declared: Any, ceiling: Optional[str], defs: Mapping[str, Any],
                 coerced: Optional[list[str]] = None) -> str:
    """
    The size an answer is held to: what he declared, never above the ceiling
    the message arrived with. Nothing declared is the ceiling itself; no
    ceiling (a caller with no question) is the largest size, the old behaviour.
    """
    order = size_order(defs)
    top = ceiling if ceiling in order else order[-1]
    said = declared if isinstance(declared, str) and declared in order else None
    if said is None:
        return top
    if order.index(said) > order.index(top):
        if coerced is not None:
            coerced.append(" ".join(str(req_size(defs, "brought_down")).split())
                           .format(ceiling=top))
        return top
    return said


def _is_figure(edit: Mapping[str, Any], voc: Mapping[str, Any]) -> bool:
    """Whether an edit puts a drawing of a read on screen (a mark or a composed shape)."""
    if edit.get("op", "put") in ("drop", "quiet"):
        return False
    if edit.get("spec") is not None or edit.get("kind") == voc.get("composed_kind"):
        return True
    return edit.get("kind") in _mark_kinds(voc) or (
        edit.get("op") == "change" and edit.get("seq") is not None)


def hold_to_size(accepted: list[dict], size: str, defs: Mapping[str, Any],
                 own: Any = None) -> tuple[list[dict], list[dict]]:
    """
    The figures past the size's bound, REFUSED like any other over-bound
    block (composition.size). Counted over the TURN: the figures an earlier
    compose of this turn already put count, and a key that changes one of
    them is not a new one.
    """
    voc = vocabulary(defs)
    spec = size_spec(size, defs)
    if spec.get("max_figures") is None:
        # The page's own bounds hold it (composition.max_blocks, refs.max_in_words).
        return list(accepted), []
    most = int(spec["max_figures"])
    have = {o.get("key") for o in (own or [])
            if isinstance(o, Mapping) and _is_figure({"op": "put", **o}, voc)}
    kept: list[dict] = []
    refused: list[dict] = []
    why = " ".join(str(req_size(defs, "refused")).split())
    for edit in accepted:
        key = edit.get("key")
        if _is_figure(edit, voc) and key not in have:
            if len(have) >= most:
                refused.append({"block": edit, "bound": "size", "reason": why.format(
                    figures=most, size=size,
                    means=" ".join(str(spec.get("means") or "").split()))})
                continue
            have.add(key)
        kept.append(edit)
    return kept, refused


# ---------------------------------------------------------------------------
# THE PAGE TYPES (W2.4, 2026-09-22)
# ---------------------------------------------------------------------------

def page_types(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    """metrics.yaml composition.page_types — the designed pages a broad answer is written into."""
    return (defs.get("composition") or {}).get("page_types") or {}


def page_tree(page: Any, defs: Mapping[str, Any], reading: Any,
              coerced: list[str]) -> tuple[Optional[dict], Optional[str]]:
    """
    A PAGE OF A KNOWN TYPE, BUILT TO THE DESIGN: his slots in, the tree out.

    He picks the type and writes the words and names the figures; the ORDER
    of the sections, where each figure sits against its words, where his
    caveat goes and the plan's heading are the type's (composition.page_types),
    so every broad page of one type reads like every other and like the
    target. What comes out is an ordinary arrangement tree, and it goes
    through `_arrangement` like any other — so a digit of his, a reference to
    nothing, a key placed twice are caught exactly where they always were.
    Nothing here reads or writes a figure.

    Returns (tree, type), or (None, None) with the reason on `coerced`.
    """
    spec = page_types(defs)
    types = spec.get("types") or {}
    if not isinstance(page, Mapping):
        coerced.append("page: a page is {\"type\": ..., \"lede\": ..., \"sections\": {...}}, "
                       "so it was left out")
        return None, None
    kind = page.get("type")
    if kind not in types:
        coerced.append(f"page: {kind!r} is not a page type — {', '.join(types)} — so it was "
                       f"left out (metrics.yaml composition.page_types)")
        return None, None
    design = types[kind] or {}
    slots = design.get("sections") or {}
    most_says = int(spec.get("max_says_per_section") or 3)
    given = page.get("sections")
    if isinstance(given, (list, tuple)):
        # A list of sections, each naming its slot, is the same page.
        given = {s.get("slot"): s for s in given if isinstance(s, Mapping)}
    given = dict(given) if isinstance(given, Mapping) else {}
    for name in [k for k in given if k not in slots]:
        coerced.append(f"page: a {kind} page has no {name!r} section — it has "
                       f"{', '.join(slots)} — so it was left out")
    said = reading if isinstance(reading, Mapping) else {}
    caveat_in = page.get("caveat_in") if page.get("caveat_in") in slots else design.get("caveat_in")
    has_caveat = bool(str(said.get("caveat") or "").strip())

    tree: list[Any] = []
    if isinstance(page.get("lede"), str) and page["lede"].strip():
        tree.append({"lede": page["lede"]})
    else:
        coerced.append(f"page: a {kind} page opens with a `lede` — the answer, its figures "
                       f"inside it by {{key}} — and this one has none")
    for name, rule in slots.items():
        rule = rule or {}
        sec = given.get(name)
        if not isinstance(sec, Mapping):
            if rule.get("required"):
                coerced.append(f"page: a {kind} page needs its {name!r} section — "
                               f"{' '.join(str(rule.get('means') or '').split())}")
            if name == caveat_in and has_caveat:
                caveat_in = None     # placed after the last section instead
            continue
        if isinstance(sec.get("head"), str) and sec["head"].strip():
            tree.append({"head": sec["head"]})
        else:
            coerced.append(f"page: the {name!r} section has no `head` stating what it found")
        if name == caveat_in and has_caveat:
            tree.append({"caveat": True})
        figures = sec.get("figures")
        if figures is None and sec.get("figure") is not None:
            figures = [sec.get("figure")]
        if isinstance(figures, str):
            figures = [figures]
        figures = [f for f in (figures or []) if isinstance(f, str) and f.strip()]
        room = int(rule.get("figures") or 1)
        extra = figures[room:]
        figures = figures[:room]
        if extra:
            coerced.append(f"page: the {name!r} section rests on {room} figure(s); "
                           f"{', '.join(repr(k) for k in extra)} drawn after its words")
        says = sec.get("says")
        if isinstance(says, str):
            says = [p for p in says.split("\n\n")]
        says = [s for s in (says or []) if isinstance(s, str) and s.strip()]
        if len(says) > most_says:
            coerced.append(f"page: the {name!r} section says {most_says} paragraphs at most, "
                           f"so the last {len(says) - most_says} were left out")
            says = says[:most_says]
        paras = [{"say": s} for s in says]
        control = sec.get("control") if rule.get("control") and isinstance(sec.get("control"), str) else None
        if rule.get("layout") == "row" and len(figures) > 1:
            # Facing each other, on one scale, under the words that read them.
            tree.extend(paras)
            tree.append({"layout": "row", "children": [{"block": k} for k in figures]})
        else:
            for n, key in enumerate(figures):
                leaf: dict[str, Any] = {"block": key}
                if n == 0 and control:
                    leaf["control"] = control
                tree.append(leaf)
                if n == 0:
                    tree.extend(paras)
            if not figures:
                tree.extend(paras)
        tree.extend({"block": k} for k in extra)
    if has_caveat and caveat_in is None:
        tree.append({"caveat": True})
    if said.get("next"):
        head = str(spec.get("plan_head") or "").strip()
        if head:
            tree.append({"head": head})
        tree.append({"next": True})
    if not tree:
        return None, None
    return {"layout": "stack", "children": tree}, str(kind)


def page_schema(defs: Mapping[str, Any]) -> dict:
    """
    The `page` parameter as he is offered it: the types, each with its
    sections and what each is for — the design he writes into, read at the
    moment he composes (the same place the widgets are read).
    """
    spec = page_types(defs)
    types = spec.get("types") or {}
    arr = (defs.get("composition") or {}).get("arrangement") or {}
    by_ref = ("Figures by reference only — {key}, {key.change}, {key.was} of a `figure` block "
              "you put. No digits of your own.")

    def line(leaf: str) -> int:
        return int((arr.get(leaf) or {}).get("max_length") or 360)

    kinds = "; ".join(
        f"{name} — {' '.join(str(t.get('means') or '').split())} (when {t.get('when')}); "
        f"sections: " + ", ".join(
            f"{s}{' (required)' if (r or {}).get('required') else ''}: "
            f"{' '.join(str((r or {}).get('means') or '').split())}"
            f" [{int((r or {}).get('figures') or 1)} figure(s)"
            f"{', a control' if (r or {}).get('control') else ''}]"
            for s, r in (t.get("sections") or {}).items())
        for name, t in types.items())
    section = {
        "type": "object",
        "properties": {
            "head": {"type": "string", "maxLength": line("head"),
                     "description": "what this section found, in a few words. No digits."},
            "figures": {"type": "array", "items": {"type": "string"},
                        "description": "the keys of the blocks this section rests on, in order"},
            "says": {"type": "array", "maxItems": int(spec.get("max_says_per_section") or 3),
                     "items": {"type": "string", "maxLength": line("say")},
                     "description": "two or three short paragraphs about exactly these figures. "
                                    "Open one with its finding in **bold** where it helps. "
                                    + by_ref},
            "control": {"type": "string",
                        "description": "the key of a `control` block to carry above the "
                                       "figure, where the section allows one"},
        },
        "additionalProperties": False,
    }
    return {
        "type": "object",
        "description": " ".join(str(spec.get("about") or "").split()),
        "properties": {
            "type": {"type": "string", "enum": list(types),
                     "description": "which designed page this answer is — " + kinds},
            "lede": {"type": "string", "maxLength": line("lede"),
                     "description": "the page's opening: the answer again, in one or two "
                                    "sentences, its figures inside it. " + by_ref},
            "sections": {
                "type": "object",
                "description": "the type's sections, each under its own name",
                "properties": {name: section for name in sorted(
                    {s for t in types.values() for s in (t.get("sections") or {})})},
                "additionalProperties": False,
            },
            "caveat_in": {"type": "string",
                          "description": "the section your caveat qualifies, when it is not "
                                         "the type's own choice"},
        },
        "required": ["type", "lede", "sections"],
        "additionalProperties": False,
    }


def compose(blocks: Any, reading: Any = None, actions: Any = None, arrangement: Any = None,
            size: Any = None, page: Any = None, *,
            calls: Mapping[int, Mapping[str, Any]],
            defs: Mapping[str, Any], board: Any = None,
            question: Optional[str] = None,
            ceiling: Optional[str] = None,
            own: Any = None) -> dict:
    """
    Compose the answer: say which of the results you read the person sees, as which kind of object, at what weight — say the reading in its three slots, and offer what to do about a row. A broad answer is a DESIGNED PAGE: pick its type on `page` — the week, one finding, a comparison — and write into that type's sections; the page is built to the design from what you write. Call it ONCE, when the reads are in: a later call adds new keys and changes known ones where they stand, and nothing you do not name moves. Nothing here is a figure: every number is drawn from the read a block names.

    Args:
        blocks: the blocks on screen, in order. Each names a kind, a short key, a weight, the read (seq) it draws, a claim — the few words saying what it says — and a thought: one or two sentences of what you think it shows, drawn beside it as you go through it together.
        reading: what you are about to say, in three slots — {"claim": the few words that ARE the point, said again word for word in your answer; "caveat": what qualifies these figures, drawn whole above them; "next": one sentence, drawn last — what you would do, or what no read can settle, never a read you could have made} — and "asks": two or three short questions they might ask you next, drawn under your headline to tap — to steer, challenge, decide or act, never one this answer already settles. Optional; a confirmation needs none.
        actions: what to do about ONE ROW, offered where that row is drawn — [{"act": what the surface does, "seq": the read, "target": the row's own value, "reason": why this one, in your words}]. Optional. You never say what it costs: that is derived from the act.
        size: how large this answer is — lookup, focused or broad (remember, for a thing to keep) — at or under the size the question arrived with. A lookup is a sentence and one figure; focused, a short answer and two or three figures, the page offered; broad, the page.
        page: THE PAGE A BROAD ANSWER IS — {"type": one of the page types, "lede": your opening, "sections": {name: {"head", "figures", "says", "control"?}}}. You fill the slots; the order, where each figure sits, the caveat's place and the plan's heading are the type's. Only for a broad answer, and it replaces `arrangement`.
        arrangement: only for a broad page NO page type fits — how the right-hand side is LAID OUT for this answer — one arrangement of the blocks you just put, so the space is used the way this answer needs rather than packed for you. LAY IT OUT ONCE: the arrangement you give STANDS for the rest of the turn, exactly as a block you do not mention stays where it is. A later call in the same turn sends this again only to CHANGE the layout — otherwise send the blocks that moved and leave this out. Optional; left out with none given yet, it is packed.

    Returns:
        The tool body. Returns {rows, meta} like every other tool, and names no
    source_table: the loop keeps the last meta that describes real data as the
    answer's receipts, and this read nothing.
    """
    coerced: list[str] = []
    # A PAGE OF A KNOWN TYPE IS BUILT, THEN CHECKED AS ANY PAGE IS (W2.4): the
    # type's tree replaces a free arrangement, and everything below — the size,
    # the references, the digits — holds it exactly as it holds that.
    page_type: Optional[str] = None
    if page is not None:
        built, page_type = page_tree(page, defs, reading, coerced)
        if built is not None:
            if arrangement is not None:
                coerced.append("arrangement: a page of a known type is laid out by its type, "
                               "so your own arrangement was left out")
            arrangement = built
    accepted, rejected = validate(blocks, calls, defs, board=board, coerced=coerced,
                                  question=question, arrangement=arrangement)
    # THE ANSWER IS THE SIZE OF THE QUESTION (composition.size, W1.1).
    answer_size = resolve_size(size, ceiling, defs, coerced)
    accepted, over = hold_to_size(accepted, answer_size, defs, own)
    rejected.extend(over)
    if arrangement is not None and not size_spec(answer_size, defs).get("page"):
        spec = size_spec(answer_size, defs)
        coerced.append(" ".join(str(req_size(defs, "page_left_out")).split()).format(
            size=answer_size, means=" ".join(str(spec.get("means") or "").split())))
        arrangement = None
        page_type = None
    # ONE CALL, TWO STATEMENTS (P1.a, 2026-09-13; the second one swapped in
    # P1.f). The board and the reading are said at the same moment, about the
    # same turn, and neither reads anything. Splitting them across two tools
    # bought nothing and cost a sequential round trip in every investigation
    # the twelve contained. agent/reading.py owns every rule about the slots —
    # this is one door into it, not a second set of checks.
    from agent import reading as _reading

    # THE THIRD STATEMENT (P2.d, 2026-09-15), on the same call and for the same
    # reason the reading is: it is about the reads this composition is already
    # validated against, it opens no connection, and splitting it off would buy
    # a round trip and nothing else. agent/actions.py owns every rule.
    from agent import actions as _actions

    offered, offered_rejected = _actions.validate(actions, calls, defs)

    # THE FOURTH STATEMENT (P3.p, 2026-09-20): how the right-hand side is laid
    # out for this answer. It arranges the blocks THIS call just validated, so
    # it is settled after them and never before. Presentation only — it cannot
    # reach a figure — so it is coerced to the last and never refuses the
    # composition.
    laid_out = _arrangement(arrangement, vocabulary(defs), [e["key"] for e in accepted], coerced,
                            blocks=accepted, board=board, own=own)
    if laid_out is not None and page_type:
        # WHICH DESIGN IT IS, for the room to draw it as that page.
        laid_out = {**laid_out, "type": page_type}

    said, said_rejected = ({}, [])
    if reading is not None:
        # THE FIGURES THIS TURN ACTUALLY READ, so `caveat` and `next` may say
        # one and may not invent one (voice.reading.slots, `figures: returned`).
        # Taken from the calls this composition is already validated against —
        # the same rows, the same meta, no second source of truth.
        said, said_rejected = _reading.validate(
            reading, defs, _reading.returned_numbers(calls.values()), coerced)
    # THE PAGE IS OFFERED, NOT MADE (composition.size.kinds.focused.offer): the
    # offer's words are a broad phrase, so tapping it is a broad question.
    offer = size_spec(answer_size, defs).get("offer")
    voc_now = vocabulary(defs)
    if offer and any(_is_figure(e, voc_now) for e in accepted):
        said = dict(said)
        asks = [a for a in (said.get(_reading.ASKS) or []) if a != offer]
        most = int(((_reading._reading(defs).get(_reading.ASKS) or {}).get("max_items")) or 3)
        said[_reading.ASKS] = [offer, *asks][:max(1, most)]
    return {
        "rows": accepted,
        "meta": {
            "accepted": len(accepted),
            "rejected": rejected,
            "reading": said,
            "rejected_slots": said_rejected,
            "actions": offered,
            "rejected_actions": offered_rejected,
            # HOW IT IS LAID OUT, or absent — and absent is the page packed for
            # him, which is every board composed before this existed.
            "arrangement": laid_out,
            # THE SIZE THIS ANSWER IS HELD TO (composition.size).
            "size": answer_size,
            # What was ADJUSTED rather than refused: a discriminator renamed, a
            # second lead demoted, a subject taken from the read's own scope.
            # Named because the model has to describe the board it actually
            # got, and a coercion it cannot see is a board it describes wrongly.
            "coerced": coerced,
            # A put of a read the board already drew became a change of that
            # object: one read is one object. Named so the model uses the key
            # it became from here on.
            "rewritten": [{"from": e["rewritten_from"], "to": e["key"]}
                          for e in accepted if e.get("rewritten_from")],
            "widgets": list(vocabulary(defs)["widgets"]),
            "slots": list(_reading.SLOTS),
            "acts": list(_actions.acts(defs)),
            "note": (
                "How the board changed, from reads that already ran. Nothing "
                "was read, and nothing you did not name has moved. A refused "
                "edit did not happen and the answer must not describe the "
                "board as though it did. A COERCED edit did happen, in the "
                "form named beside it: that is for you, never for the reader "
                "— say what the figures show, not how they were drawn. A "
                "claim you gave "
                "here is lit where you say it in your answer, so say it there. "
                "An action you offered is drawn on its own row, with what it "
                "costs derived — do not say either in your answer."
            ),
        },
    }


# ---------------------------------------------------------------------------
# THE TURN'S BOARD, BUILT AS HE GOES (P2S.7, 2026-09-18)
# ---------------------------------------------------------------------------

def drawn_seqs(blocks: Iterable[Mapping[str, Any]]) -> set[int]:
    """Every read a list of blocks draws — `seq` on a mark, `seqs` on a shape."""
    out: set[int] = set()
    for b in blocks:
        if isinstance(b.get("seq"), int) and not isinstance(b.get("seq"), bool):
            out.add(b["seq"])
        for s in b.get("seqs") or []:
            if isinstance(s, int) and not isinstance(s, bool):
                out.add(s)
    return out


def fold(board: list[dict], edits: Iterable[Mapping[str, Any]], *,
         first: bool = False) -> list[dict]:
    """
    The turn's board after one more compose: `board` is what this turn has
    drawn so far, in the order it arrived; `edits` are a compose's accepted
    edits. Returns a new list; nothing already on it MOVES.

    WHY. Until today each compose frame REPLACED the turn's composition — here
    and in the client — so Bob's second compose had to restate the whole
    board, and one that did not erased it: `why` in verification/p2s6-gate-2
    .json composed three blocks, then `{"key": "stores-week", "op": "change",
    "weight": "lead"}`, and the frame that carried only that change left a
    change aimed at a key no longer on screen. The owner asked for the
    opposite: *"the more pop up so you can really see it building"*.

    So a compose is folded the way the board already folds turns
    (frontend/src/room/board.ts):

      put     under a key already here   replaced where it stands
              over a read a DEFAULT drew replaces that default where it stands
                                         — he has now said what the read is
              otherwise                  added at the end
      change  of a key already here      merged into it, where it stands
      quiet   of a key already here      made quiet, where it stands
      drop    of a key already here      removed — his decision, said
      any edit to a key NOT here         kept as the edit, for the board of an
                                         earlier turn (the client applies it)

    `first` is his first compose of the turn: the moment a default stops
    outranking anything, exactly as editsFor demotes one on the client.
    """
    out = [dict(b) for b in board]
    if first:
        for b in out:
            if b.get("default") and b.get("weight") == "lead":
                b["weight"] = "quiet"
    # THE LEAD HIS FIRST COMPOSE SETTLED, if this is a later one.
    settled = None if first else next(
        (b.get("key") for b in out if b.get("weight") == "lead" and not b.get("default")),
        None)
    for edit in edits:
        e = {k: v for k, v in edit.items()}
        key = e.get("key")
        op = e.get("op", "put")
        at = next((i for i, b in enumerate(out) if b.get("key") == key), None)
        if op == "put":
            if at is None:
                mine = drawn_seqs([e])
                at = next((i for i, b in enumerate(out)
                           if b.get("default") and drawn_seqs([b]) & mine), None)
            if at is None:
                out.append(e)
            else:
                out[at] = e
            continue
        if at is None:
            out.append(e)
            continue
        if op == "drop":
            del out[at]
        elif op == "quiet":
            out[at] = {**out[at], "weight": "quiet"}
            out[at].pop("default", None)
        else:
            merged = {**out[at], **{k: v for k, v in e.items() if k != "op"}}
            merged.pop("default", None)
            out[at] = merged
        # ONE LEAD, THE LATEST, within his first compose.
        now = next((b for b in out if b.get("key") == key), None)
        if now is not None and now.get("weight") == "lead":
            for b in out:
                if b is not now and b.get("weight") == "lead":
                    b["weight"] = "supporting"
    # AND AFTER IT, THE LEAD IS SETTLED. The lead is drawn first, so a lead
    # that changed hands later MOVED the board under the reader — both runs of
    # verification/p2s7-gate*.json did it in `morning`: a new block asked to
    # lead, and the settled one was restated as supporting. So the block his
    # first compose made lead keeps it, whatever a later edit says of its
    # weight, and a later ask to lead is drawn supporting where it landed. A
    # lead he DROPPED is gone, and the latest ask stands. The CLAIM is what
    # settles last, not the board.
    if settled is not None and any(b.get("key") == settled for b in out):
        for b in out:
            if b.get("key") == settled:
                b["weight"] = "lead"
            elif b.get("weight") == "lead":
                b["weight"] = "supporting"
    return out


def as_board_objects(board: Iterable[Mapping[str, Any]],
                     calls: Mapping[int, Mapping[str, Any]]) -> list[dict]:
    """
    This turn's blocks in the shape the question's `[On the board` carries —
    key, kind, the read behind it, what it is about — so a later compose in
    the SAME turn can change them by key and "this is that" finds a read the
    turn already drew. A default is left out: he never saw its key, and a put
    over its read is handled by `fold`, which replaces it where it stands.
    """
    out: list[dict] = []
    for b in board:
        if b.get("default") or b.get("op", "put") != "put":
            continue
        obj: dict[str, Any] = {"key": b.get("key"), "kind": b.get("kind") or "spec"}
        call = calls.get(b.get("seq")) if isinstance(b.get("seq"), int) else None
        if call is not None:
            obj["read"] = {"tool": call.get("tool"), "arguments": call.get("arguments")}
        if isinstance(b.get("subject"), str):
            obj["about"] = b["subject"]
        out.append(obj)
    return out
