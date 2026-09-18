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

WHAT IT DECIDES, AND WHY THAT IS SAFE. Only WHICH SHAPE a read is, from the
rows and nothing else — no threshold, no formula, no grouping convention, no
figure. It chooses a NOUN for data that already exists.

AND IT IS THE CATALOGUE'S OWN RULE (P1.f, 2026-09-14). The vocabulary is now
the six marks the renderer draws, so this file and
frontend/src/room/catalogue.ts `markFor` decide the same way from the same
columns: one row is a `figure`; a baseline on every row is a `dumbbell`; a
signed change on every row is `contributors`; an ordered series is a `line`; a
set of named rows is `ranked`; everything else is a `table`. Two implementations
of one rule, in the two places a board can be composed, and
tests/test_default_composition_contract.py is what keeps them saying the same
thing. P2S.3 added three answers for a read grouped by TWO things, which until
then fell to a line joining every store's weeks into one zigzag: a name over
hours is a `heatmap`, a name over a calendar order is `multiples`, two names of
parts are `stacked`. The other new shapes are George's to pick, never a
default's — a default decides a noun from the columns, and "a pie" is not
something the columns say.

WHAT IT DELIBERATELY DOES NOT DO:

  - It never carries a claim, an emphasis or a word of the reading. Those are
    readings, and a reading is George's — a machine that titled a block would
    be characterising rows nobody looked at.
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

from agent import compose, vocabulary
from agent.composite_tools import MEMORY_TOOL

# Mirrors frontend/src/components/george/pinShape.ts. Where a constant appears
# in both, it is the same constant for the same reason, and the reason is
# written there.
TIME_KEYS = ("day", "week", "month", "bucket", "date", "snapshot_date")
SUBJECT_KEYS = ("subject", "store", "product", "category", "name", "label")
MIN_CHART_ROWS = 3
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

    One row is a figure whatever else is true of it; a compared set of named
    rows is the movement the tool measured; a homogeneous series is a line only
    when it is long enough to have a shape; and everything else is a table,
    because a wrong chart misleads in a way a boring table does not.
    """
    rows = _rows(call)
    if not rows:
        return None
    block: dict[str, Any] = {"op": "put", "key": key, "seq": seq, "weight": weight}

    # WHAT HE REMEMBERS HAS ONE SHAPE, AND IT IS NOT A TABLE (P2.f). Every
    # other branch below reads the COLUMNS, because for a read of the business
    # the rows are all there is to go on. These rows are not the business:
    # they are the views he holds, every one of them with a Forget on it, and
    # a table of them draws no Forget at all. The read itself says which, so
    # nothing is inferred — this is the one tool whose result has exactly one
    # honest drawing.
    if str(call.get("tool") or "") == MEMORY_TOOL:
        return {**block, "kind": "memory"}

    if len(rows) == 1:
        # ONE ROW IS A FIGURE, whether or not it was compared. `subject` is
        # omitted deliberately: on a one-row read the validator fills it from
        # the read's own scope, or says the block draws that row and takes its
        # name from it. Either way the caption comes from the read, never here.
        if _comparable(rows) or _is_number(rows[0].get("value")):
            return {**block, "kind": "figure"}
        return {**block, "kind": "table"}

    if _comparable(rows) and _subjects(rows):
        # WHAT THE TOOL MEASURED ABOUT THESE ROWS DECIDES THE MARK, exactly as
        # catalogue.ranking does on the client: a before on every row has two
        # ends and is drawn as a movement; a signed change with no before is a
        # decomposition of one.
        if all(_is_number(r.get("baseline")) for r in rows):
            return {**block, "kind": "dumbbell"}
        if all(_is_number(r.get("change")) for r in rows):
            return {**block, "kind": "contributors"}
        return {**block, "kind": "ranked"}

    # A READ GROUPED BY TWO THINGS (P2S.3). Until the vocabulary had a shape
    # for one, a read by store AND week fell to the line below — every store's
    # weeks joined into one zigzag, a series that does not exist. Now: a name
    # over the hours of the day is WHERE IN THE DAY, a heatmap; a name over a
    # calendar order is one small line per name; two names is what each total
    # is made of.
    if vocabulary.satisfies("series_per_name", rows):
        if vocabulary.order_key(rows) == "hour":
            return {**block, "kind": "heatmap"}
        return {**block, "kind": "multiples"}
    if vocabulary.satisfies("two_key_parts", rows):
        return {**block, "kind": "stacked"}

    if len(rows) >= MIN_CHART_ROWS and _homogeneous(rows):
        if any(k in rows[0] for k in TIME_KEYS):
            return {**block, "kind": "line"}
        if _categorical(rows):
            # No order of its own, so a line would assert a progression that
            # does not exist.
            return {**block, "kind": "ranked"}

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


def compose_added(calls: Mapping[int, Mapping[str, Any]], *, drawn: set[int],
                  defs: Mapping[str, Any], board: Any = None, max_rows: int,
                  room: int, lead: bool) -> list[dict]:
    """
    THE READS THAT LANDED SINCE THE BOARD WAS LAST DRAWN, as blocks to ADD to
    it (P2S.7, 2026-09-18) — flagged `default`, and quiet unless the board is
    still empty.

    WHY. The default used to be drawn once a turn and never again, so between
    the first figures and the end of a broad answer nothing new appeared: "how
    are we doing?" drew the shops at 10.4 s and nothing else until 59.6 s
    (verification/p2s6-gate-2.json). The owner: *"the more pop up so you can
    really see it building"*. A default that REARRANGED the board would move
    objects under a person mid-read, which is why it was latched (P1.b); one
    that only ADDS, quiet, at the end, moves nothing — so the latch goes and
    that reason stays.

    Same rule as `blocks` and the same gate as `compose_default`; `drawn` is
    every seq the turn's board already draws, George's and the defaults'.
    """
    if room <= 0:
        return []
    fresh = {s: c for s, c in calls.items() if s not in drawn}
    proposed = [b for b in blocks(fresh, max_rows=max_rows)][:room]
    if not proposed:
        return []
    for i, b in enumerate(proposed):
        b["weight"] = "lead" if (lead and i == 0) else "quiet"
    try:
        result = compose.compose(proposed, None, calls=calls, defs=defs, board=board)
    except (ValueError, KeyError, TypeError):
        return []
    return [{**b, "default": True} for b in (result.get("rows") or [])]


def pin_blocks(tool_calls: Sequence[Mapping[str, Any]], results: Sequence[Mapping[str, Any]],
               *, defs: Mapping[str, Any]) -> list[dict]:
    """
    THE BLOCKS A KEPT PAGE DRAWS ONE PIN WITH (P2S.3(g)) — the same blocks, by
    the same rule and through the same gate, that the board is drawn from.

    WHY. A kept page was drawn by `PinnedPage` → `PinTile` → the pre-P1.e
    renderer, so a chart kept from the room came back looking like another
    product. The owner: *"it doesnt feel like its from the same app and its
    beacause its not, so make it."* Now a pin run returns blocks and the page
    draws them with the room's own marks.

    Each call that came back with rows is one block: the shape its rows make
    (`shape_for`), or the shape the pin remembers (`drawn_as`). The remembered
    shape is handed to `compose` as the object already on the board under that
    key, which is exactly the rule that keeps an asked-for pie a pie — and a
    shape the rows can no longer make is drawn as what they do make, and said.
    """
    calls: dict[int, dict] = {}
    proposed: list[dict] = []
    remembered: list[dict] = []
    for i, (stored, result) in enumerate(zip(tool_calls, results)):
        ok = result.get("status") == "ok"
        rows = [r for r in (result.get("rows") or []) if isinstance(r, Mapping)]
        meta = result.get("meta") if isinstance(result.get("meta"), Mapping) else {}
        calls[i] = {
            "tool": result.get("tool"), "arguments": result.get("arguments") or {},
            "error": None if ok else (result.get("error") or result.get("status") or "failed"),
            "duplicate": False, "is_read": True, "rows": rows,
            "filters": meta.get("filters_applied") if isinstance(meta.get("filters_applied"), Mapping) else {},
        }
        if not ok or not rows:
            continue
        block = shape_for(calls[i], i, f"pin-{i}", "lead" if not proposed else "supporting")
        if block is None:
            continue
        shape = stored.get("drawn_as") if isinstance(stored, Mapping) else None
        if isinstance(shape, Mapping) and isinstance(shape.get("kind"), str):
            block = {**block, **{k: v for k, v in shape.items() if k in ("kind", "field", "against")}}
            remembered.append({"key": block["key"], "kind": shape["kind"]})
        proposed.append(block)
    if not proposed:
        return []
    try:
        result = compose.compose(proposed, None, calls=calls, defs=defs, board=remembered)
    except (ValueError, KeyError, TypeError):
        return []
    return list(result.get("rows") or [])
