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

It opens no connection, holds nothing, and its result names no source table,
for the reason findings.py gives: the loop keeps the last meta that describes
real data as the answer's receipts, and this read nothing.
"""

from __future__ import annotations

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


def validate(
    submitted: Any,
    calls: Mapping[int, Mapping[str, Any]],
    defs: Mapping[str, Any],
) -> tuple[list[dict], list[dict]]:
    """
    Split a submitted composition into the blocks that may be drawn and those
    that may not, each refusal with a reason a person could act on.
    """
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
                for field in ("kind", "seq", "subject", "subjects", "form",
                              "label", "action", "argument"):
                    if field in item:
                        raise Rejected(f"a {op} names a key and nothing else; drop {field!r}")
                keys_seen.add(key)
                edit = {"op": op, "key": key}
                if op == "quiet":
                    edit["weight"] = "quiet"
                accepted.append(edit)
                continue

            kind = item.get("kind")
            if op == "change" and kind is None:
                # Changing prominence, or which read an object draws, without
                # restating what kind of object it is.
                weight = item.get("weight")
                if weight is not None and weight not in weights:
                    raise Rejected(f"weight {weight!r} is not one of {', '.join(weights)}")
                if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                    raise Rejected(f"only one block leads, and {lead_key!r} already does")
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
                    if isinstance(edit.get("subject"), str) and not _row_has(call, edit["subject"]):
                        raise Rejected(f"read {item['seq']} has no row for {edit['subject']!r}")
                    for s in edit.get("subjects") or []:
                        if not isinstance(s, str) or not _row_has(call, s):
                            raise Rejected(f"read {item['seq']} has no row for {s!r}")
                elif voc.get("change_subject_requires_seq") and ("subject" in item or "subjects" in item):
                    # Otherwise the object would claim to be about something the
                    # rows it still draws never carried.
                    raise Rejected(
                        "to change what an object is about, name the read it comes from too"
                    )
                if len(edit) == 2:
                    raise Rejected("a change has to change something: a weight, or a read and subject")
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
                    raise Rejected(f"only one block leads, and {lead_key!r} already does")
                try:
                    spec = grammar.validate_spec(item["spec"], calls=calls, defs=defs)
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
                raise Rejected(f"only one block leads, and {lead_key!r} already does")

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
                if not isinstance(subject, str) or not subject.strip():
                    raise Rejected(f"a {kind} names the subject it is about")
                assert call is not None
                if not _row_has(call, subject):
                    raise Rejected(f"read {item['seq']} has no row for {subject!r}")
                block["subject"] = subject.strip()

            if "subjects" in needs:
                subjects = item.get("subjects")
                if not isinstance(subjects, (list, tuple)) or not (2 <= len(subjects) <= MAX_SUBJECTS):
                    raise Rejected(f"a {kind} names two to {MAX_SUBJECTS} subjects")
                assert call is not None
                cleaned: list[str] = []
                for s in subjects:
                    if not isinstance(s, str) or not s.strip():
                        raise Rejected("a subject is a name")
                    if not _row_has(call, s):
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
            accepted.append(block)
        except Rejected as why:
            rejected.append({"block": item, "reason": str(why)})

    return accepted, rejected


def compose(blocks: Any, *, calls: Mapping[int, Mapping[str, Any]],
            defs: Mapping[str, Any]) -> dict:
    """
    Compose the workspace: say which of the results you read the person sees, as which kind of object, at what weight. Call it once, after your reads return and before you answer. Nothing here is a figure — every number is drawn from the read a block names.

    Args:
        blocks: the blocks on screen, in order. Each names a kind, a short key, a weight, and the read (seq) and subject it draws from.

    Returns:
        The tool body. Returns {rows, meta} like every other tool, and names no
    source_table, for the reason record_findings names none.
    """
    accepted, rejected = validate(blocks, calls, defs)
    return {
        "rows": accepted,
        "meta": {
            "accepted": len(accepted),
            "rejected": rejected,
            "widgets": list(vocabulary(defs)["widgets"]),
            "note": (
                "How the board changed, from reads that already ran. Nothing "
                "was read, and nothing you did not name has moved. A refused "
                "edit did not happen and the answer must not describe the "
                "board as though it did."
            ),
        },
    }
