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

    for item in list(blocks)[: max_blocks + 1]:
        try:
            if len(accepted) >= max_blocks:
                raise Rejected(f"more than {max_blocks} blocks; a workspace is not a report")
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
            if op == "put" and existing and key not in {
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
        except Rejected as why:
            rejected.append({"block": item, "reason": str(why)})

    _hang(accepted, hangs, voc, coerced)
    return accepted, rejected


def compose(blocks: Any, reading: Any = None, actions: Any = None, *,
            calls: Mapping[int, Mapping[str, Any]],
            defs: Mapping[str, Any], board: Any = None,
            question: Optional[str] = None) -> dict:
    """
    Compose the workspace: say which of the results you read the person sees, as which kind of object, at what weight — say the reading in its three slots, and offer what to do about a row. Call it AS YOU GO, in the same batch as your next reads, drawing what the reads so far found: a later call adds new keys and changes known ones where they stand, and nothing you do not name moves. The reading settles in your last call. Nothing here is a figure: every number is drawn from the read a block names.

    Args:
        blocks: the blocks on screen, in order. Each names a kind, a short key, a weight, the read (seq) it draws, a claim — the few words saying what it says — and a thought: one or two sentences of what you think it shows, drawn beside it as you go through it together.
        reading: what you are about to say, in three slots — {"claim": the few words that ARE the point, said again word for word in your answer; "caveat": what qualifies these figures, drawn whole above them; "next": one sentence, drawn last — what you would do, or what no read can settle, never a read you could have made} — and "asks": two or three short questions they might ask you next, drawn under your headline to tap — to steer, challenge, decide or act, never one this answer already settles. Optional; a confirmation needs none.
        actions: what to do about ONE ROW, offered where that row is drawn — [{"act": what the surface does, "seq": the read, "target": the row's own value, "reason": why this one, in your words}]. Optional. You never say what it costs: that is derived from the act.

    Returns:
        The tool body. Returns {rows, meta} like every other tool, and names no
    source_table: the loop keeps the last meta that describes real data as the
    answer's receipts, and this read nothing.
    """
    coerced: list[str] = []
    accepted, rejected = validate(blocks, calls, defs, board=board, coerced=coerced,
                                  question=question)
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

    said, said_rejected = ({}, [])
    if reading is not None:
        # THE FIGURES THIS TURN ACTUALLY READ, so `caveat` and `next` may say
        # one and may not invent one (voice.reading.slots, `figures: returned`).
        # Taken from the calls this composition is already validated against —
        # the same rows, the same meta, no second source of truth.
        said, said_rejected = _reading.validate(
            reading, defs, _reading.returned_numbers(calls.values()), coerced)
    return {
        "rows": accepted,
        "meta": {
            "accepted": len(accepted),
            "rejected": rejected,
            "reading": said,
            "rejected_slots": said_rejected,
            "actions": offered,
            "rejected_actions": offered_rejected,
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
