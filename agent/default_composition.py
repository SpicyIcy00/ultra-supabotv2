"""
The board fills when the data lands, not when George has finished thinking.

WHY THIS EXISTS (P1.b, 2026-09-13). A turn's reads return in the first
iteration and the screen stayed empty until the model came back round with a
`compose` — a whole extra round trip later, measured at 8-17 s on the twelve.
Everything needed to draw was already in hand; nobody had said so. So the loop
now composes a DEFAULT the moment reads land, and George's own composition
supersedes it when it arrives.

WHAT THIS IS NOT. It is not a second composer. Every block it produces goes
through `agent/compose.validate` exactly as George's do — the same vocabulary,
the same closed field list, the same refusal when a subject no row carries is
named. It cannot say anything George could not say, and it cannot say anything
at all that the validator would not accept from him. A block it produced and a
block he produced are indistinguishable downstream, which is the point: there
is one gate and one grammar, and this is a caller of them.

WHAT IT DECIDES, AND WHY THAT IS SAFE. Only WHICH SHAPE a read is, by the rule
`inferShape` has always used in the client (frontend/.../pinShape.ts) — one row
is a figure, a declared delta over two to four named rows is a comparison, a
homogeneous series is a chart, everything else is a table. That rule reads the
rows and nothing else: no threshold, no formula, no grouping convention, no
figure. It chooses a NOUN for data that already exists.

WHAT IT DELIBERATELY DOES NOT DO:

  - It never carries a note, an emphasis, a finding or a recommendation.
    Those are readings, and a reading is George's — a machine that annotated
    a chart would be characterising rows nobody looked at.
  - It never exempts a notice from prose. `_drawn_on_the_board` in the loop is
    fed George's composition only: a caveat is discharged by a person deciding
    to draw the read that raised it, not by a default doing it for him.
  - It never reaches the model. The model is not told a default was composed,
    is not shown its keys, and composes as though the board were empty — which
    is why this changes no iteration, no token and no answer.
  - It composes nothing for a read whose rows the client did not receive
    whole. An object over rows the screen does not have draws nothing, and an
    object over a PREFIX draws a different chart (MAX_ROWS_TO_CLIENT).

ONE LEAD, AND IT IS PROVISIONAL. The first composable read leads so the board
has a shape rather than a pile; the rest are quiet. The moment George composes,
his lead wins (board.ts `oneLead` keeps the most recently touched one) and the
defaults over reads he composed are superseded by seq — see `editsFor` in
frontend/src/room/board.ts for the supersession rule and why it is by seq
rather than by key.
"""

from __future__ import annotations

from typing import Any, Mapping, Optional, Sequence

from agent import compose

# Mirrors frontend/src/components/george/pinShape.ts. Where a constant appears
# in both, it is the same constant for the same reason, and the reason is
# written there.
TIME_KEYS = ("day", "week", "month", "bucket", "date", "snapshot_date")
SUBJECT_KEYS = ("subject", "store", "product", "category", "name", "label")
MIN_CHART_ROWS = 3
LINE_OVER_BAR_ROWS = 12
_CATEGORICAL_SKIP = frozenset({"value", "unit", "measure", "section", "direction"})

# A default is a holding shape, not a report. Well under composition.max_blocks
# so George's own blocks always have room beside whatever is still standing.
MAX_DEFAULT_BLOCKS = 4


def _rows(call: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    rows = call.get("rows") or []
    return [r for r in rows if isinstance(r, Mapping)]


def _is_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _comparable(rows: Sequence[Mapping[str, Any]]) -> bool:
    """
    Whether the TOOL declared a comparison over every row — the port of
    `comparisonRows`. A delta the tool computed, or its own word for having
    tried and failed (`baseline_status`). One row without either makes the
    result a list of different facts, which get_brief returns and which is a
    table.
    """
    for r in rows:
        declared = isinstance(r.get("baseline_status"), str)
        pct = _is_number(r.get("change_pct"))
        if not pct and not declared:
            return False
        value = r.get("value")
        if not _is_number(value) and not (value is None and declared):
            return False
    return bool(rows)


def _subjects(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """The name each row goes by, in the order the tools emit them."""
    out: list[str] = []
    for r in rows:
        found = next((str(r[k]).strip() for k in SUBJECT_KEYS
                      if isinstance(r.get(k), str) and str(r[k]).strip()), None)
        if not found or found in out:
            return []
        out.append(found)
    return out


def _homogeneous(rows: Sequence[Mapping[str, Any]]) -> bool:
    shape = sorted(rows[0].keys())
    return all(_is_number(r.get("value")) and sorted(r.keys()) == shape for r in rows)


def _categorical(rows: Sequence[Mapping[str, Any]]) -> Optional[str]:
    """The column rows are compared BY: a string on every row, and varying."""
    for k in rows[0].keys():
        if k in _CATEGORICAL_SKIP or k.endswith("_id"):
            continue
        if not all(isinstance(r.get(k), str) for r in rows):
            continue
        if len({r.get(k) for r in rows}) == len(rows):
            return k
    return None


def shape_for(call: Mapping[str, Any], seq: int, key: str, weight: str) -> Optional[dict]:
    """
    One read as one block, or None when no honest default exists.

    The order of the tests is `inferShape`'s order and the reasons are its
    reasons: a declared delta is the most specific thing a result can be, so it
    is read first; a one-row figure next; a series only when it is homogeneous
    and long enough to have a shape; a table for everything else, because a
    wrong chart misleads in a way a boring table does not.
    """
    rows = _rows(call)
    if not rows:
        return None
    block: dict[str, Any] = {"op": "put", "key": key, "seq": seq, "weight": weight}

    if _comparable(rows):
        if len(rows) == 1:
            # A figure with its delta. `subject` is omitted deliberately: on a
            # one-row read the validator fills it from the read's own scope, or
            # says the block draws that row and takes its name from it. Either
            # way the caption comes from the read, never from here.
            return {**block, "kind": "figure"}
        names = _subjects(rows)
        if 2 <= len(names) <= compose.MAX_SUBJECTS:
            return {**block, "kind": "comparison", "subjects": names}
        return {**block, "kind": "table"}

    if len(rows) == 1 and _is_number(rows[0].get("value")):
        return {**block, "kind": "figure"}

    if len(rows) >= MIN_CHART_ROWS and _homogeneous(rows):
        time_key = next((k for k in TIME_KEYS if k in rows[0]), None)
        if time_key:
            form = "line" if len(rows) > LINE_OVER_BAR_ROWS else "bar"
            return {**block, "kind": "chart", "form": form}
        if _categorical(rows):
            # No order of its own, so a line would assert a progression that
            # does not exist.
            return {**block, "kind": "chart", "form": "bar"}

    return {**block, "kind": "table"}


def blocks(calls: Mapping[int, Mapping[str, Any]], *, max_rows: int) -> list[dict]:
    """
    The blocks a board would hold if nobody had composed it yet.

    `calls` is the loop's record by seq, the same one `compose` validates
    against. A call is skipped when it is not a read, failed, re-read an
    earlier call, returned nothing, or returned more rows than the client was
    sent — in that last case the screen has no rows to draw and an object over
    it would be an empty frame with a receipts line under it.
    """
    out: list[dict] = []
    for seq in sorted(calls):
        if len(out) >= MAX_DEFAULT_BLOCKS:
            break
        call = calls[seq]
        if not call.get("is_read") or call.get("error") or call.get("duplicate"):
            continue
        if len(_rows(call)) > max_rows:
            continue
        block = shape_for(call, seq, f"read-{seq}", "lead" if not out else "quiet")
        if block:
            out.append(block)
    return out


def compose_default(calls: Mapping[int, Mapping[str, Any]], *,
                    defs: Mapping[str, Any], board: Any = None,
                    max_rows: int) -> list[dict]:
    """
    The validated default, or an empty list.

    Through `compose.compose` rather than beside it: a block that George's
    composition would have been refused for is refused here too, and what comes
    back is the same validated shape the client already knows how to draw. A
    refusal here is silent — there is no model turn to spend on it and nothing
    to tell, because nobody asked for this composition.
    """
    proposed = blocks(calls, max_rows=max_rows)
    if not proposed:
        return []
    try:
        result = compose.compose(proposed, None, calls=calls, defs=defs, board=board)
    except (ValueError, KeyError, TypeError):
        return []
    return list(result.get("rows") or [])
