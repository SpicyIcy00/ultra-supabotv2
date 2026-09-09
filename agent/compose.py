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

It opens no connection, holds nothing, and its result names no source table,
for the reason findings.py gives: the loop keeps the last meta that describes
real data as the answer's receipts, and this read nothing.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping, Optional

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
        raise Rejected(f"call {seq} is not a read")
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

            kind = item.get("kind")
            if kind not in widgets:
                raise Rejected(f"{kind!r} is not a widget (metrics.yaml composition.widgets)")

            key = item.get("key")
            if not isinstance(key, str) or not key_re.match(key):
                raise Rejected("every block needs a short key like 'rockwell' or 'seikyo-order'")
            if key in keys_seen:
                raise Rejected(f"key {key!r} is used twice")

            weight = item.get("weight", "supporting")
            if weight not in weights:
                raise Rejected(f"weight {weight!r} is not one of {', '.join(weights)}")
            if kind == "hero" and voc.get("hero_must_lead") and weight != "lead":
                raise Rejected("a hero is the lead by definition; give it weight 'lead' or use 'subject'")
            if weight == "lead" and voc.get("one_lead") and lead_key is not None:
                raise Rejected(f"only one block leads, and {lead_key!r} already does")

            needs = list(widgets[kind].get("needs") or [])
            block: dict[str, Any] = {"kind": kind, "key": key, "weight": weight}

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
                "How the workspace is composed, from reads that already ran. "
                "Nothing was read. A refused block is not drawn and the answer "
                "must not describe the screen as showing it."
            ),
        },
    }
