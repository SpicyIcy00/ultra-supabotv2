"""
The grammar: validating a shape George composed that nobody listed in advance.

WHAT THIS IS FOR. `agent/compose.py` takes a block naming one of fourteen
widgets. That is a menu, and a menu cannot become whatever the work needs
however long it gets. A block may instead carry a `spec` — a tree of layouts
and marks — and then the shape is George's, not a choice from mine.

THE ONE RULE THAT MAKES AN INFINITE SPACE OF SHAPES SAFE. A mark names a READ
and a FIELD. The renderer resolves the value from the rows. There is nowhere
in this grammar to type a number, a word, a colour or a size — so however
elaborate a composition becomes, every figure on screen is still a figure a
tool returned, with its receipts.

That is the whole of the trade, stated so it cannot be eroded: the guarantee
was never the fixed list of widgets, it was that a figure is BOUND rather than
authored. This file is what enforces it, and it is stricter than the widget
path because it has to be — a tree has far more places to hide a literal than
a flat block does.

FIVE THINGS ARE REFUSED, each because of what it would let onto the screen:

  a field a node may not carry           — the closed set is the guarantee
  a value in a value position            — that is a figure George typed
  a field the read does not have         — a column that does not exist
                                            renders as blank authority
  a read that never ran, or failed       — same rule the widget path has
  a tree past its bounds                 — a workspace is not a document

AND ONE THING IS NOT (P1.a, 2026-09-13). A node whose DISCRIMINATOR is under
another name — `type`, `kind`, `node`, or the layout's own word as the key —
is renamed, not refused. The four recorded runs of the twelve are unanimous
about what this cost: George wrote `{"type": "row", ...}`, was refused, wrote
`{"kind": "row", ...}`, was refused, wrote `{"row": {...}}`, was refused, and
landed on `{"layout": "row", ...}` on the fourth try — three round trips, in
every run, to say a thing he had said correctly the first time. The VALUES
were the grammar's own words throughout. Nothing about a rename can put a
figure on screen, so nothing about it is the guarantee; refusing it was
ceremony, and ceremony is what a round trip is spent on.

Every rename is recorded and handed back on the result, because a coercion
the model cannot see is a divergence it cannot describe.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

# A value position is a channel: it must name a COLUMN, so what arrives has to
# be a string that some row actually carries. Anything numeric here is George
# having typed a figure, which is the one thing the grammar exists to prevent.
# `against` is the whole a bullet's field is part of: a column of the SAME row,
# so a bar is measured against a figure the tool put beside it and never
# against another read.
CHANNELS = ("field", "by", "colour", "order", "label", "against")

# `subject` is the ONE channel that names a value rather than a column, and it
# is not a hole in the rule. A selector is not a figure: it says which row to
# draw, it is checked against the rows, and a value no row carries is refused —
# exactly as a named widget's subject is. Without it a panel-per-shop draws the
# first row on every panel, which is worse than refusing to draw at all.
SUBJECT = "subject"

# Which row is LIT among rows that are all drawn. Names a value like a subject
# and hides nothing — it is how a picture says "this is the one" instead of a
# sentence saying it.
EMPHASISE = "emphasise"

# A few words ON the mark. CLAUDE.md already permits exactly this and bounds it
# exactly this way: an annotation may point at rows and characterise them, and
# may NEVER introduce a number. So a note carries no digits at all — checked,
# not asked for — and a spec may hold only a handful.
NOTE = "note"


# THE DISCRIMINATOR, UNDER EVERY NAME GEORGE HAS REACHED FOR. A node says
# whether it is a layout or a mark; these are the words he used for that
# instead, each observed in a real run of the twelve. The VALUE is what
# decides which it becomes, so a synonym carrying a word that is neither a
# layout nor a mark is left alone and refused as it always was.
NODE_SYNONYMS = ("type", "kind", "node", "as")


class Rejected(ValueError):
    """One node refused, with a reason a person could act on."""


def vocabulary(defs: Mapping[str, Any]) -> Mapping[str, Any]:
    return ((defs.get("composition") or {}).get("grammar")) or {}


def _row_has(call: Mapping[str, Any], subject: str) -> bool:
    """Whether some row of the read carries this value, as a string."""
    want = subject.strip().lower()
    for row in call.get("rows") or []:
        if isinstance(row, Mapping):
            for value in row.values():
                if isinstance(value, str) and value.strip().lower() == want:
                    return True
    return False


def _no_row(call: Mapping[str, Any], subject: str, path: str, seq: Any) -> str:
    """
    Why a subject matched nothing — and the mistake it usually is.

    Live, George passed `subject: "store"`: the NAME of a column where a value
    belongs. "read 0 has no row for 'store'" is true and unhelpful. Saying
    which mistake it is, and naming values that would have worked, turns a
    refusal into the next correct attempt.
    """
    columns = _fields_of(call)
    if subject in columns:
        return (f"{path}: subject names a VALUE a row carries, not a column — "
                f"{subject!r} is a column of read {seq}. Use `by: {subject!r}` to "
                f"group by it, or a value from it as the subject.")
    values = sorted({
        str(v) for row in (call.get("rows") or [])[:12] if isinstance(row, Mapping)
        for v in row.values() if isinstance(v, str) and len(v) < 40
    })[:6]
    near = f" Values in this read include: {', '.join(values)}." if values else ""
    return f"{path}: read {seq} has no row for {subject!r}.{near}"


def _fields_of(call: Mapping[str, Any]) -> set[str]:
    """Every column name the read's rows actually carry."""
    found: set[str] = set()
    for row in call.get("rows") or []:
        if isinstance(row, Mapping):
            found.update(str(k) for k in row.keys())
    return found


def _check_channel(name: str, value: Any, call: Optional[Mapping[str, Any]],
                   where: str) -> str:
    """
    One channel: it names a column, and the column exists.

    THE NUMERIC CHECK IS NOT PEDANTRY. `field: 203717` is George putting a
    figure on screen through the one door left open, and it would render as a
    number nobody read. A channel is a name; a name is a string.
    """
    if isinstance(value, bool) or isinstance(value, (int, float)):
        raise Rejected(
            f"{where}: {name} must name a column, not carry a value — "
            f"every figure comes from the read (composition.grammar)"
        )
    if not isinstance(value, str) or not value.strip():
        raise Rejected(f"{where}: {name} must name a column")
    column = value.strip()
    if call is not None:
        columns = _fields_of(call)
        if columns and column not in columns:
            near = ", ".join(sorted(columns)[:8])
            raise Rejected(
                f"{where}: read {call.get('seq')} has no column {column!r} "
                f"(it has {near})"
            )
    return column


def _normalise(item: Any, *, layouts: Mapping[str, Any], marks: Mapping[str, Any],
               path: str, coerced: list[str]) -> Any:
    """
    The node George wrote, in the words the grammar uses.

    Three shapes arrive meaning the same thing, and only the third is spelled
    the way this file spells it:

        {"type": "row",  "children": [...]}      a synonym for the discriminator
        {"row": {"children": [...]}}             the discriminator as the key
        {"layout": "row", "children": [...]}     what the grammar asks for

    Each is renamed to the third. The rename cannot invent a layout or a mark
    that does not exist — the VALUE is what selects, and it is checked against
    the same closed sets the refusal checked — so what is gained is a round
    trip and what is risked is nothing.

    A key explicitly set to nothing (`heading: null`) is dropped for the same
    reason: an optional field the model declined to fill is not a field it
    filled wrongly.
    """
    if not isinstance(item, Mapping):
        return item
    out = dict(item)

    if "layout" not in out and "mark" not in out:
        # The discriminator as the key: {"stack": {...}}, {"value": {...}}.
        wrappers = [k for k, v in out.items()
                    if (k in layouts or k in marks) and isinstance(v, Mapping)]
        if len(wrappers) == 1 and len(out) == 1:
            word = wrappers[0]
            which = "layout" if word in layouts else "mark"
            out = dict(out[word])
            out[which] = word
            coerced.append(f"{path}: {word!r} as the key became {which}: {word!r}")

    if "layout" not in out and "mark" not in out:
        # The discriminator under another name: type, kind, node, as.
        for synonym in NODE_SYNONYMS:
            word = out.get(synonym)
            if not isinstance(word, str):
                continue
            which = "layout" if word in layouts else "mark" if word in marks else None
            if which is None:
                continue
            out.pop(synonym)
            out[which] = word
            coerced.append(f"{path}: {synonym}: {word!r} became {which}: {word!r}")
            break

    blank = sorted(k for k, v in out.items() if v is None)
    for key in blank:
        out.pop(key)
    if blank:
        coerced.append(f"{path}: dropped {blank} — set to nothing, so not set")
    return out


def _node(item: Any, *, calls: Mapping[int, Mapping[str, Any]],
          voc: Mapping[str, Any], depth: int, budget: list[int],
          path: str, inherited: Optional[str] = None,
          coerced: Optional[list[str]] = None) -> dict:
    """One node of the tree, and everything under it."""
    layouts: Mapping[str, Any] = voc.get("layouts") or {}
    marks: Mapping[str, Any] = voc.get("marks") or {}
    coerced = [] if coerced is None else coerced
    item = _normalise(item, layouts=layouts, marks=marks, path=path, coerced=coerced)
    allowed = set(voc.get("allowed_fields") or [])
    max_depth = int(voc.get("max_depth") or 4)
    max_cols = int(voc.get("max_cols") or 6)
    max_rows = int(voc.get("max_rows_drawn") or 40)

    if depth > max_depth:
        raise Rejected(f"{path}: nested deeper than {max_depth}; a workspace is not a document")
    budget[0] -= 1
    if budget[0] < 0:
        raise Rejected(f"more than {voc.get('max_nodes')} nodes in one composition")

    if not isinstance(item, Mapping):
        raise Rejected(f"{path}: not a node")

    extra = set(item.keys()) - allowed
    if extra:
        raise Rejected(
            f"{path}: a node may not carry {sorted(extra)} — George composes, "
            f"the system draws (composition.grammar.allowed_fields)"
        )

    # WHICH ROW, inherited downward. A panel scoped to OPUS makes every mark
    # inside it draw OPUS's row, which is what makes one panel per shop mean
    # seven different panels.
    subject = item.get(SUBJECT, inherited)
    if SUBJECT in item:
        if not isinstance(item[SUBJECT], str) or not item[SUBJECT].strip():
            raise Rejected(f"{path}: subject names a value a row carries")
        subject = item[SUBJECT].strip()

    if NOTE in item:
        note = item[NOTE]
        limits = (voc.get("channels") or {}).get(NOTE) or {}
        longest = int(limits.get("max_length") or 60)
        if not isinstance(note, str) or not note.strip():
            raise Rejected(f"{path}: a note is a few words")
        if any(ch.isdigit() for ch in note):
            raise Rejected(
                f"{path}: a note carries no digits — it characterises what is "
                f"drawn, it never states a figure. The numbers are already on "
                f"the mark (composition.grammar.channels.note)"
            )
        if len(note.strip()) > longest:
            raise Rejected(
                f"{path}: a note is at most {longest} characters — it is a "
                f"label on a mark, not a sentence under it"
            )
        budget[1] -= 1
        if budget[1] < 0:
            raise Rejected(
                f"more than {limits.get('max_per_spec')} notes in one shape; "
                f"past a handful they stop pointing and start narrating"
            )
        out_note = note.strip()
    else:
        out_note = None

    is_layout = "layout" in item
    is_mark = "mark" in item
    if is_layout == is_mark:
        raise Rejected(
            f"{path}: a node is either a layout or a mark, never both and "
            f"never neither"
        )

    out: dict[str, Any] = {}

    # ---- a layout arranges other nodes -----------------------------------
    if is_layout:
        layout = item.get("layout")
        if layout not in layouts:
            raise Rejected(
                f"{path}: {layout!r} is not a layout "
                f"({', '.join(sorted(layouts))})"
            )
        out["layout"] = layout

        if "cols" in item:
            cols = item["cols"]
            if not isinstance(cols, int) or isinstance(cols, bool) or not (1 <= cols <= max_cols):
                raise Rejected(f"{path}: cols is a whole number from 1 to {max_cols}")
            out["cols"] = cols

        # A panel's heading names a column too — never a title George wrote,
        # for the same reason a mark never carries a figure.
        if "heading" in item:
            heading = item["heading"]
            if not isinstance(heading, Mapping):
                raise Rejected(f"{path}: a heading names a read and a column")
            call = _read(calls, heading.get("seq"), path)
            if subject and not _row_has(call, subject):
                raise Rejected(_no_row(call, subject, path, heading.get("seq")))
            out["heading"] = {
                "seq": heading.get("seq"),
                "field": _check_channel("field", heading.get("field"), call,
                                        f"{path}.heading"),
            }

        children = item.get("children")
        if not isinstance(children, (list, tuple)) or not children:
            raise Rejected(f"{path}: a {layout} holds children")
        out["children"] = [
            _node(child, calls=calls, voc=voc, depth=depth + 1, budget=budget,
                  path=f"{path}.{n}", inherited=subject, coerced=coerced)
            for n, child in enumerate(children)
        ]
        if subject:
            out[SUBJECT] = subject
        if "gap" in item:
            gap = item["gap"]
            if gap not in ("tight", "normal", "loose"):
                raise Rejected(f"{path}: gap is tight, normal or loose")
            out["gap"] = gap
        return out

    # ---- a mark draws from a read ----------------------------------------
    mark = item.get("mark")
    if mark not in marks:
        raise Rejected(f"{path}: {mark!r} is not a mark ({', '.join(sorted(marks))})")
    out["mark"] = mark

    needs = list((marks[mark] or {}).get("needs") or [])
    call: Optional[Mapping[str, Any]] = None
    if "seq" in needs:
        call = _read(calls, item.get("seq"), path)
        out["seq"] = item["seq"]
        out["tool"] = call.get("tool")
    elif "seq" in item:
        # `prose` needs no read; naming one anyway would imply the words came
        # out of it.
        raise Rejected(f"{path}: a {mark} draws no read, so it names none")

    for channel in CHANNELS:
        if channel in item:
            out[channel] = _check_channel(channel, item[channel], call,
                                          f"{path}.{mark}")

    # WHICH ROW IS LIT. A value, checked against the rows exactly as a subject
    # is — and unlike a subject it hides nothing, so the others still draw.
    if EMPHASISE in item:
        want = item[EMPHASISE]
        if not isinstance(want, str) or not want.strip():
            raise Rejected(f"{path}: emphasise names a value a row carries")
        want = want.strip()
        if call is not None and not _row_has(call, want):
            raise Rejected(_no_row(call, want, path, item.get("seq")))
        out[EMPHASISE] = want

    if out_note is not None:
        out[NOTE] = out_note
    for required in needs:
        if required != "seq" and required not in out:
            raise Rejected(f"{path}: a {mark} needs {required}")

    # The selector has to select something. A subject no row carries would
    # draw nothing, or — worse — silently fall back to the first row.
    if subject and call is not None:
        if not _row_has(call, subject):
            raise Rejected(_no_row(call, subject, path, item.get("seq")))
        out[SUBJECT] = subject

    if "limit" in item:
        limit = item["limit"]
        if not isinstance(limit, int) or isinstance(limit, bool) or not (1 <= limit <= max_rows):
            raise Rejected(f"{path}: limit is a whole number from 1 to {max_rows}")
        out["limit"] = limit

    if "weight" in item:
        weight = item["weight"]
        if weight not in ("lead", "supporting", "quiet"):
            raise Rejected(f"{path}: weight is lead, supporting or quiet")
        out["weight"] = weight

    return out


def _read(calls: Mapping[int, Mapping[str, Any]], seq: Any,
          path: str) -> Mapping[str, Any]:
    """The read a node draws from — the same rule the widget path applies."""
    if not isinstance(seq, int) or isinstance(seq, bool):
        raise Rejected(f"{path}: seq must be the number of a read")
    call = calls.get(seq)
    if call is None:
        raise Rejected(f"{path}: read {seq} did not run in this conversation")
    if not call.get("is_read"):
        raise Rejected(f"{path}: call {seq} is not a read, so there is nothing to draw")
    if call.get("error"):
        raise Rejected(f"{path}: read {seq} failed; there is nothing to draw")
    return call


def annotation(name: str, value: Any, defs: Mapping[str, Any]) -> str:
    """
    One annotation, held to the same rules wherever it appears.

    A named widget may point at a row and characterise it exactly as a
    composed shape may — they are annotations, not shapes. Sharing this
    function is what stops a note on a widget quietly being allowed a figure
    that a note on a mark is refused.
    """
    voc = vocabulary(defs)
    limits = (voc.get("channels") or {}).get(name) or {}
    if not isinstance(value, str) or not value.strip():
        raise Rejected(f"{name} is a few words a row carries or characterises")
    text = value.strip()
    if name == NOTE:
        if any(ch.isdigit() for ch in text):
            raise Rejected(
                "a note carries no digits — it characterises what is drawn, it "
                "never states a figure (composition.grammar.channels.note)"
            )
        longest = int(limits.get("max_length") or 60)
        if len(text) > longest:
            raise Rejected(f"a note is at most {longest} characters")
    return text


def validate_spec(spec: Any, *, calls: Mapping[int, Mapping[str, Any]],
                  defs: Mapping[str, Any],
                  coerced: Optional[list[str]] = None) -> dict:
    """
    One composed shape, checked whole.

    Raises Rejected with a reason naming the node, so a refusal tells George
    which part of the tree was wrong rather than that the tree was.

    `coerced` collects every rename made on the way down, for the caller to
    hand back to the model: a shape that drew is worth knowing about, and a
    shape that drew under a different spelling than the one submitted is worth
    knowing about twice.
    """
    voc = vocabulary(defs)
    if not voc:
        raise Rejected("the grammar is not defined")
    notes = int(((voc.get("channels") or {}).get(NOTE) or {}).get("max_per_spec") or 4)
    budget = [int(voc.get("max_nodes") or 40), notes]
    return _node(spec, calls=calls, voc=voc, depth=1, budget=budget, path="spec",
                 coerced=coerced)


def reads_in(spec: Mapping[str, Any]) -> list[int]:
    """Every read a validated spec draws from, so the loop can chart them."""
    found: list[int] = []

    def walk(node: Mapping[str, Any]) -> None:
        if isinstance(node.get("seq"), int):
            found.append(node["seq"])
        heading = node.get("heading")
        if isinstance(heading, Mapping) and isinstance(heading.get("seq"), int):
            found.append(heading["seq"])
        for child in node.get("children") or []:
            walk(child)

    walk(spec)
    return sorted(set(found))
