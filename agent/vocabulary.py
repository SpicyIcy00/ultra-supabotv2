"""
Which shapes a read's rows can make, and whether a shape was asked for (P2S.3).

WHY THIS EXISTS. The catalogue grew from six marks to seventeen, and every one
of the new ones needs something of its rows a ranking does not: a heatmap two
groupings, a calendar a date per row, a pie parts of one whole. A shape named
over rows that cannot make it would draw nothing, or worse, draw something —
a pie of signed changes is a picture of a whole that does not exist.

So every shape names what its rows must carry (`composition.widgets.*.rows`,
one of `composition.shape_rows`), and this module is the one place on the
server that answers it. `frontend/src/room/catalogue.ts` `drawable` is the
other, and `tests/test_vocabulary_contract.py` holds the two to the same
answers over the recorded reads in `frontend/src/room/__fixtures__/`.

WHAT IT DOES WHEN THE ROWS CANNOT MAKE THE SHAPE: nothing here refuses.
`agent/compose` draws the shape those rows make by default
(`default_composition.shape_for`) and names the coercion — a drawing changed,
never a value, which is the line P1.a drew between coercing and refusing.

ONLY WHEN ASKED. Three shapes read worse than a ranking for what they show —
pie, treemap, gauge — and Bob never picks them on his own. "Asked" is the
person's question naming the shape (`asked_by`), or the object already being
drawn that way on the board: "make that one a pie" makes a pie that STAYS one
when a later turn touches it.

NOTHING HERE READS A FIGURE. It reads which columns exist and whether a value
is a number, a date, or below zero — the same kind of reading `shape_for` has
always done.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Mapping, Optional, Sequence

# A NAME: a string column that says what a row is about.
NAME_KEYS = ("store", "product", "category", "supplier", "machine", "payment_method",
             "status", "state", "label", "name", "subject")
# AN ORDER: a column the rows run along.
ORDER_KEYS = ("day", "week", "month", "hour", "date", "bucket", "snapshot_date", "period")
DATE_KEYS = ("day", "date", "snapshot_date")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")

Row = Mapping[str, Any]


def _number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v \
        and v not in (float("inf"), float("-inf"))


def _present(v: Any) -> bool:
    return v is not None and not (isinstance(v, str) and not v.strip())


def _rows(rows: Any) -> list[Row]:
    return [r for r in (rows or []) if isinstance(r, Mapping)]


def name_key(rows: Sequence[Row]) -> Optional[str]:
    """The first NAME column carried as a non-empty string on every row."""
    for k in NAME_KEYS:
        if rows and all(isinstance(r.get(k), str) and r[k].strip() for r in rows):
            return k
    return None


def order_key(rows: Sequence[Row]) -> Optional[str]:
    """The first ORDER column present on every row."""
    for k in ORDER_KEYS:
        if rows and all(_present(r.get(k)) for r in rows):
            return k
    return None


def keys_of(rows: Sequence[Row]) -> list[str]:
    """Every grouping the rows carry on every row, names first then orders."""
    out = [k for k in NAME_KEYS
           if rows and all(isinstance(r.get(k), str) and r[k].strip() for r in rows)]
    out += [k for k in ORDER_KEYS if rows and all(_present(r.get(k)) for r in rows)]
    return out


def _distinct(rows: Sequence[Row], *cols: str) -> bool:
    seen = set()
    for r in rows:
        key = tuple(str(r.get(c)) for c in cols)
        if key in seen:
            return False
        seen.add(key)
    return True


# Never a row's headline figure: a change, a count of rows, an id — the same
# list `valueOf` skips in frontend/src/room/data.ts.
_NOT_A_VALUE = frozenset({"change", "change_pct", "baseline", "seq", "call_seq", "row_count"})


def _numeric(v: Any) -> bool:
    return _number(v) or (isinstance(v, str) and re.fullmatch(r"-?\d+(\.\d+)?", v) is not None)


def value_of(row: Row) -> Optional[tuple[str, float]]:
    """
    A ROW'S HEADLINE FIGURE, as the client reads it (data.ts `valueOf`): the
    tool's own `value` where it has one, else the first numeric column that is
    not a change, an id or an ORDER. An hour of the day is where a row sits,
    not how much it holds.
    """
    if _numeric(row.get("value")):
        return "value", float(row["value"])
    for k, v in row.items():
        if k in _NOT_A_VALUE or k.endswith("_id") or k in ORDER_KEYS:
            continue
        if _numeric(v):
            return k, float(v)
    return None


def _values(rows: Sequence[Row]) -> bool:
    return bool(rows) and all(value_of(r) is not None for r in rows)


def satisfies(requirement: str, rows: Any, block: Optional[Mapping[str, Any]] = None,
              defs: Optional[Mapping[str, Any]] = None) -> bool:
    """Whether `rows` carry what `composition.shape_rows.<requirement>` names."""
    rs = _rows(rows)
    block = block or {}
    if requirement == "any":
        return bool(rs)
    if requirement == "one_value":
        return any(value_of(r) is not None for r in rs)
    if requirement == "baseline":
        against = block.get("against") if isinstance(block.get("against"), str) else "baseline"
        return _values(rs) and all(_number(r.get(against)) for r in rs)
    if requirement == "change":
        return bool(rs) and all(_number(r.get("change")) for r in rs)
    if requirement == "named":
        name = name_key(rs)
        return bool(name) and _values(rs) and _distinct(rs, name)
    if requirement == "parts":
        cap = int(((defs or {}).get("composition") or {}).get("max_parts") or 12)
        return (satisfies("named", rs) and len(rs) <= cap
                and all(value_of(r)[1] >= 0 for r in rs) and any(value_of(r)[1] > 0 for r in rs))
    if requirement == "series":
        order = order_key(rs)
        return bool(order) and len(rs) >= 2 and _values(rs) and _distinct(rs, order)
    if requirement == "days":
        order = next((k for k in DATE_KEYS
                      if rs and all(isinstance(r.get(k), str) and _DATE.match(r[k]) for r in rs)),
                     None)
        return bool(order) and _values(rs) and _distinct(rs, order)
    if requirement == "series_per_name":
        name, order = name_key(rs), order_key(rs)
        return (bool(name) and bool(order) and _values(rs) and _distinct(rs, name, order)
                and not _distinct(rs, order))
    if requirement == "two_keys":
        keys = keys_of(rs)
        return (len(keys) >= 2 and _values(rs) and _distinct(rs, keys[0], keys[1])
                and not _distinct(rs, keys[0]))
    if requirement == "two_key_parts":
        return satisfies("two_keys", rs) and all(value_of(r)[1] >= 0 for r in rs)
    if requirement == "two_measures":
        field, against = block.get("field"), block.get("against")
        return (isinstance(field, str) and isinstance(against, str) and field != against
                and len(rs) >= 2 and all(_number(r.get(field)) and _number(r.get(against))
                                         for r in rs))
    raise KeyError(f"{requirement!r} is not one of composition.shape_rows")


def drawable(kind: str, rows: Any, defs: Mapping[str, Any],
             block: Optional[Mapping[str, Any]] = None) -> bool:
    """Whether a named widget can be drawn over these rows. Non-marks always can."""
    spec = ((defs.get("composition") or {}).get("widgets") or {}).get(kind) or {}
    requirement = spec.get("rows")
    if not requirement:
        return True
    if len(_rows(rows)) < int(spec.get("min_rows") or 1):
        return False
    return satisfies(str(requirement), rows, block, defs)


def asked_words(kind: str, defs: Mapping[str, Any]) -> list[str]:
    spec = ((defs.get("composition") or {}).get("widgets") or {}).get(kind) or {}
    return [str(w) for w in (spec.get("asked_by") or [])]


def only_when_asked(kind: str, defs: Mapping[str, Any]) -> bool:
    spec = ((defs.get("composition") or {}).get("widgets") or {}).get(kind) or {}
    return bool(spec.get("only_when_asked"))


def asked_for(kind: str, question: Optional[str], defs: Mapping[str, Any],
              board: Optional[Iterable[Any]] = None, key: Optional[str] = None) -> bool:
    """
    Whether the person asked for this shape: their question names it, or the
    object under this key is already drawn as it (the ask is remembered).
    """
    if isinstance(question, str) and question.strip():
        said = question.lower()
        for word in asked_words(kind, defs):
            if re.search(r"(?<![a-z])" + re.escape(word.lower()) + r"s?(?![a-z])", said):
                return True
    for obj in board or []:
        if isinstance(obj, Mapping) and key and obj.get("key") == key and obj.get("kind") == kind:
            return True
    return False


# ---------------------------------------------------------------------------
# A shape a PIN remembers (P2S.3(g))
# ---------------------------------------------------------------------------

def mark_kinds(defs: Mapping[str, Any]) -> list[str]:
    """The widgets that are ways of drawing a read — the ones with a `rows` rule."""
    return [k for k, v in ((defs.get("composition") or {}).get("widgets") or {}).items()
            if isinstance(v, Mapping) and v.get("rows")]


def drawn_as(value: Any, defs: Mapping[str, Any]) -> Optional[dict]:
    """
    THE SHAPE ONE PINNED CALL IS DRAWN AS, normalised: `{"kind": k}` and, for a
    scatter or a gauge, the COLUMNS it draws. None for none. Raises ValueError
    with a reason a person could act on.

    A pin stores calls, never figures, and now the shape they were asked to be
    drawn as — the same pin on the board and on its page (P2S.3(g)). It rides
    on the stored call rather than a new column, so a kept page needed no
    migration: a pin has always been a list of calls, and a call may say how it
    is drawn.
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = {"kind": value}
    if not isinstance(value, Mapping):
        raise ValueError("drawn_as is a shape: a kind, or {kind, field, against}")
    marks = mark_kinds(defs)
    kind = value.get("kind")
    if kind not in marks:
        raise ValueError(f"{kind!r} is not a shape a read is drawn as — one of {', '.join(marks)}")
    extra = set(value) - {"kind", "field", "against"}
    if extra:
        raise ValueError(f"drawn_as carries a kind and the columns it draws, never {sorted(extra)}")
    out: dict[str, Any] = {"kind": kind}
    for column in ("field", "against"):
        if column in value and value[column] is not None:
            if not isinstance(value[column], str) or not value[column].strip():
                raise ValueError(f"drawn_as.{column} names a column of the read")
            out[column] = value[column].strip()
    return out


def board_shapes(board: Any, composition: Iterable[Mapping[str, Any]],
                 calls: Mapping[int, Mapping[str, Any]], defs: Mapping[str, Any],
                 key_of) -> dict[str, dict]:
    """
    WHAT EACH READ ON THE BOARD IS DRAWN AS, by call identity (`key_of(tool,
    arguments)`), so pinning a chart keeps the shape it has on screen: a pie
    pinned is a pie on its page. The board the question carried, with this
    turn's composition applied over it — a put or change that names a read, and
    a reshape that names only a key.
    """
    marks = set(mark_kinds(defs))
    by_key: dict[str, dict] = {}
    for obj in board or []:
        if not isinstance(obj, Mapping) or not isinstance(obj.get("key"), str):
            continue
        read = obj.get("read") if isinstance(obj.get("read"), Mapping) else {}
        by_key[obj["key"]] = {"kind": obj.get("kind"), "tool": read.get("tool"),
                              "arguments": read.get("arguments") or {}}
    for block in composition or []:
        key = block.get("key")
        if not isinstance(key, str) or block.get("op") in ("drop", "quiet"):
            continue
        entry = dict(by_key.get(key) or {})
        if isinstance(block.get("seq"), int) and block["seq"] in calls:
            call = calls[block["seq"]]
            entry.update(tool=call.get("tool"), arguments=call.get("arguments") or {})
        for field in ("kind", "field", "against"):
            if field in block:
                entry[field] = block[field]
        by_key[key] = entry
    out: dict[str, dict] = {}
    for entry in by_key.values():
        if entry.get("kind") in marks and isinstance(entry.get("tool"), str):
            shape = {"kind": entry["kind"]}
            shape.update({c: entry[c] for c in ("field", "against") if isinstance(entry.get(c), str)})
            out[key_of(entry["tool"], entry.get("arguments") or {})] = shape
    return out
