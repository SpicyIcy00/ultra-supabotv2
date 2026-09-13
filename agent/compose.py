"""
George composes the workspace. This module decides whether a composition is one
he is allowed to make.

WHY THIS EXISTS. Until 2026-09-10 the screen was a pure function of rows: a
composer in the client derived a layout, and the model's only channel into it
was an integer and one of four words (agent/findings.py). What that produced
was a document — a chart, then findings, then prose — and a document with its
paragraphs reordered is still a document. Three rebuilds of the same screen
felt the same because the structure never changed.

Now George says what you see. A composition is a short list of blocks: which
result, as which kind of object, at what weight, under which key. The client
draws exactly that and nothing else.

WHAT KEEPS A CHOICE FROM BECOMING A VALUE. Every rule below is the answer to
one way this could go wrong, and the rules are the same ones record_findings
already lives by:

  - A BLOCK NAMES A READ THAT RAN. `seq` must be a successful read in this
    conversation. A widget over a call that failed, or that never happened, is
    a picture of nothing.
  - A SUBJECT IS A ROW. "Rockwell" on a hero is admissible only if a row of
    that read carries it. George may choose which row leads; he may not
    introduce one.
  - NO FIELD BUT THE ALLOWED ONES. A colour, a width, a value, a title — any
    key outside metrics.yaml composition.allowed_fields refuses the block. This
    is the line between composing and drawing.
  - ONE LEAD. Weight is judgment made visible, and a composition where
    everything leads has not been composed. A hero is the lead by definition.
  - KEYS TRANSFORM. A key is a short slug; a later composition that uses the
    same key is the same object changing, which is what keeps the workspace
    from stacking.
  - A COMPOSITION IS A SET OF EDITS, NOT A SCREEN (2026-09-10). `put`,
    `change`, `quiet` and `drop` apply to a board that persists between turns,
    so an object George does not mention this turn simply stays — with its own
    read, its own receipts and its own read time. Only `put` needs a whole
    block; the other three need a key and what is changing. A `change` that
    names a subject must name the read it comes from, or George could rename
    what an object is about while it still draws an older read's rows.

WHAT IS COERCED RATHER THAN REFUSED (P1.a, 2026-09-13). The rules above are
about TRUTH, and a refusal that is not about truth is a round trip spent on
ceremony. Four recorded runs of the twelve carry 46 refusals between them and
NONE of them would have put a wrong figure on screen — they are a
discriminator under another name, a subject the read was already filtered to,
a `quiet` that carried the seq it was quieting, a change that changed nothing.
Each cost a whole model round trip, and George spent up to four composes on
one answer finding the spelling.

So: a block is coerced where the coercion cannot change what a figure SAYS,
and refused where it can.

  COERCED   a second block weighted `lead`      demoted to supporting
            a change that changes nothing       ignored, not refused
            a `quiet`/`drop` with extra fields  the extras dropped
            a subject the read is FILTERED to   accepted: the read is about it
            no subject on a one-row read        filled from that read's scope
            a node named `type`/`kind`/`node`   renamed (agent/grammar.py)

  REFUSED   a seq that never ran or failed      there is nothing to draw
            a subject no row and no filter has  a label nobody read
            a subject on a MANY-row read        choosing a row is a judgement
            a note carrying a digit             that is a figure in prose
            a figure, colour, size or title     the attempt this file exists
                                                to stop, and the one coercion
                                                that came back off the list

The line is one sentence: **a coercion may change which WORD holds a value; it
may never change which value is drawn, or introduce one.** Every coercion is
recorded and returned on `meta.coerced`, because a coercion the model cannot
see is a board it will describe wrongly.

It opens no connection, holds nothing, and its result names no source table,
for the reason findings.py gives: the loop keeps the last meta that describes
real data as the answer's receipts, and this read nothing.
"""

from __future__ import annotations

import json
import re
from typing import Any, Iterable, Mapping, Optional

from agent import grammar

MAX_SUBJECTS = 4


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
        # Naming the way round matters: this fires most often when George has
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
    refusing `subject: "Rockwell"` over that row is what sent George round the
    loop in the `cannot` scenario: hero with subject, refused; hero without,
    refused; figure without, refused; then a whole extra read of the same
    figure grouped by store so the word would appear in a cell. Four
    iterations, for a label the read had already declared.

    This is not the model introducing a subject. `filters_applied` is the
    tool's own statement of scope, in `meta`, beside the snapshot timestamp —
    the same place the receipts come from.
    """
    found: set[str] = set()
    filters = call.get("filters")
    if not isinstance(filters, Mapping):
        return found
    for value in filters.values():
        for one in (value if isinstance(value, (list, tuple)) else [value]):
            if isinstance(one, str) and one.strip():
                found.add(one.strip().lower())
    return found


def _backs(call: Mapping[str, Any], subject: str) -> bool:
    """Whether the read carries this subject — in a row, or in its own scope."""
    return _row_has(call, subject) or subject.strip().lower() in _scope_values(call)


def _implied_subject(call: Mapping[str, Any]) -> Optional[str]:
    """
    The subject a ONE-ROW read is already about, when the block named none.

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
    for value in (filters or {}).values():
        for one in (value if isinstance(value, (list, tuple)) else [value]):
            if isinstance(one, str) and one.strip().lower() == values[0]:
                return one.strip()
    return None


def read_identity(tool: Any, arguments: Any, subject: Any = None) -> str:
    """
    What a read IS for "this is that": tool, arguments, and the one subject
    the object is scoped to, if any. A comparison's `subjects` are a VIEW of
    the read, not a scope, and are deliberately not part of it. The same
    identity the client applies in board.ts, so the stored composition and
    the screen agree about which object a repeat became.
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

    ONE LEAD IS STILL THE RULE — what changes is what happens when George
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


def validate(
    submitted: Any,
    calls: Mapping[int, Mapping[str, Any]],
    defs: Mapping[str, Any],
    board: Any = None,
    coerced: Optional[list[str]] = None,
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
    widgets: Mapping[str, Any] = voc["widgets"]
    weights = list(voc["weights"])
    allowed = set(voc["allowed_fields"])
    key_re = re.compile(voc["key_pattern"])
    max_blocks = int(voc["max_blocks"])
    chart_forms = set(voc.get("chart_forms", []))
    state_labels = set(voc.get("state_labels", []))
    actions = set(voc.get("recommendation_actions", []))
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
            # "refused, George composes and the system draws" teaches the
            # rule. It costs nothing either: the tool schema is
            # additionalProperties:false, so a well-formed call cannot carry
            # one, and four recorded runs of the twelve contain zero of them.
            # A coercion that buys no round trip and blunts a trust boundary
            # is a bad trade in one direction only.
            extra = set(item.keys()) - allowed
            if extra:
                raise Rejected(
                    f"a block may not carry {sorted(extra)}: George composes, the system "
                    f"draws (metrics.yaml composition.allowed_fields)"
                )

            op = item.get("op", default_op)
            if op not in ops:
                raise Rejected(f"{op!r} is not one of {', '.join(ops)} (metrics.yaml composition.ops)")

            key = item.get("key")
            if not isinstance(key, str) or not key_re.match(key):
                raise Rejected("every block needs a short key like 'rockwell' or 'seikyo-order'")
            if key in keys_seen:
                raise Rejected(f"key {key!r} is edited twice in one turn")

            # An edit to something already on the board carries only what
            # changes. Nothing here can name a figure, so a partial edit is as
            # safe as a whole one — with the one exception below.
            if op in ("drop", "quiet"):
                # NAMING THE KEY IS THE WHOLE EDIT, and anything else George
                # restated alongside it is ignored rather than refused. A
                # `quiet` that carries the seq it is quieting says the same
                # thing twice; refusing it lost a round trip and quieted
                # nothing.
                said_too = sorted(f for f in ("kind", "seq", "subject", "subjects",
                                              "form", "label", "action", "argument")
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
                if "seq" in item:
                    call = _read(calls, item.get("seq"))
                    edit["seq"] = item["seq"]
                    edit["tool"] = call.get("tool")
                    for field in ("subject", "subjects", "form", "label",
                                  "action", "argument"):
                        if field in item:
                            edit[field] = item[field]
                    if isinstance(edit.get("subject"), str) and not _backs(call, edit["subject"]):
                        raise Rejected(f"read {item['seq']} has no row for {edit['subject']!r}")
                    for s in edit.get("subjects") or []:
                        if not isinstance(s, str) or not _backs(call, s):
                            raise Rejected(f"read {item['seq']} has no row for {s!r}")
                elif voc.get("change_subject_requires_seq") and ("subject" in item or "subjects" in item):
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
            if kind == "hero" and voc.get("hero_must_lead") and weight != "lead":
                raise Rejected("a hero is the lead by definition; give it weight 'lead' or use 'subject'")
            if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                # A HERO THAT CANNOT LEAD IS NOT A HERO. Demoting it would
                # draw the wrong OBJECT — the big expressive tile, second —
                # so this one stays a refusal while every other kind demotes.
                if kind == "hero":
                    raise Rejected(f"only one block leads, and {lead_key!r} already does")
                weight = _demote(key, lead_key, weights, coerced)

            needs = list(widgets[kind].get("needs") or [])
            block: dict[str, Any] = {"op": op, "kind": kind, "key": key, "weight": weight}

            # POINTING IS NOT A SHAPE. A note and an emphasis annotate whatever
            # is drawn, so they belong on a named widget as much as on a
            # composed one — held to the grammar's rules, which is where the
            # "no digits in a note" guarantee lives.
            for annotation in ("note", "emphasise"):
                if annotation in item:
                    try:
                        checked = grammar.annotation(annotation, item[annotation], defs)
                    except grammar.Rejected as why:
                        raise Rejected(str(why)) from why
                    block[annotation] = checked

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
                    # George supplied. On a many-row read this is still a
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

            if "subjects" in needs:
                subjects = item.get("subjects")
                if not isinstance(subjects, (list, tuple)) or not (2 <= len(subjects) <= MAX_SUBJECTS):
                    # Naming what is there turns the refusal into the next
                    # correct attempt, the way grammar._no_row does. Which two
                    # to compare is George's to say; which two are AVAILABLE
                    # is the read's, and he should not spend a round trip
                    # finding out.
                    assert call is not None
                    available = sorted({
                        v.strip() for row in (call.get("rows") or [])[:12]
                        if isinstance(row, Mapping)
                        for v in row.values()
                        if isinstance(v, str) and 0 < len(v.strip()) < 40
                    })[:6]
                    raise Rejected(
                        f"a {kind} names two to {MAX_SUBJECTS} subjects, from "
                        f"the rows of ONE read"
                        + (f" — read {item.get('seq')} carries: "
                           f"{', '.join(available)}" if available else
                           f" — read {item.get('seq')} carries no named rows to "
                           f"compare, so this is a chart or a table")
                    )
                assert call is not None
                cleaned: list[str] = []
                for s in subjects:
                    if not isinstance(s, str) or not s.strip():
                        raise Rejected("a subject is a name")
                    if not _backs(call, s):
                        raise Rejected(f"read {item['seq']} has no row for {s!r}")
                    if s.strip() not in cleaned:
                        cleaned.append(s.strip())
                if len(cleaned) < 2:
                    raise Rejected("a comparison needs two different subjects")
                block["subjects"] = cleaned

            if "action" in needs:
                # WHICH action, never a new one, and never the figure behind
                # it: the block has no field for a number, so "order 806
                # units" is the read's quantity beside George's verb.
                action = item.get("action")
                if action not in actions:
                    raise Rejected(
                        f"a recommendation's action is one of "
                        f"{', '.join(sorted(actions))} "
                        f"(metrics.yaml composition.recommendation_actions)"
                    )
                block["action"] = action

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

            if "form" in needs:
                form = item.get("form")
                if form not in chart_forms:
                    raise Rejected(f"chart form must be one of {', '.join(sorted(chart_forms))}")
                block["form"] = form

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

    return accepted, rejected


def compose(blocks: Any, findings: Any = None, *,
            calls: Mapping[int, Mapping[str, Any]],
            defs: Mapping[str, Any], board: Any = None) -> dict:
    """
    Compose the workspace: say which of the results you read the person sees, as which kind of object, at what weight, and what each read MEANT. Call it once, after your reads return and before you answer. Nothing here is a figure — every number is drawn from the read a block names.

    Args:
        blocks: the blocks on screen, in order. Each names a kind, a short key, a weight, and the read (seq) and subject it draws from.
        findings: what each read meant in this piece of work — {"seq": 3, "role": "driver", "of": 0}. Optional; an investigation says it, a single figure needs none.

    Returns:
        The tool body. Returns {rows, meta} like every other tool, and names no
    source_table, for the reason agent/findings.py names none.
    """
    coerced: list[str] = []
    accepted, rejected = validate(blocks, calls, defs, board=board, coerced=coerced)
    # ONE CALL, ONE SCHEMA (P1.a, 2026-09-13). Roles and blocks are two
    # statements about the SAME set of calls, submitted at the same moment,
    # validated against the same record, and neither reads anything. Splitting
    # them across two tools bought nothing and cost a sequential round trip in
    # every investigation the twelve contain. agent/findings.py still owns
    # every rule — this is one door into it, not a second set of checks.
    from agent import findings as _findings

    roles, roles_rejected = ([], [])
    if findings is not None:
        roles, roles_rejected = _findings.validate(findings, calls, defs)
    return {
        "rows": accepted,
        "meta": {
            "accepted": len(accepted),
            "rejected": rejected,
            "findings": roles,
            "findings_rejected": roles_rejected,
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
            "roles": list(_findings.ROLES),
            "note": (
                "How the board changed, from reads that already ran. Nothing "
                "was read, and nothing you did not name has moved. A refused "
                "edit did not happen and the answer must not describe the "
                "board as though it did. A COERCED edit did happen, in the "
                "form named beside it — describe that one."
            ),
        },
    }
