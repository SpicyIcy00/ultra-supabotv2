"""
What KIND of page this is — and therefore how it is DRAWN.

WHAT IT IS FOR (W4.1, 2026-09-23). The owner, of the pages in the room's
sidebar — Estate Dashboard, Store Dashboard, Estate Week, AJI BARN Reorder:
*"next thing we need to do is make how each page style work idealy"*. Four
kept pages doing four different jobs, drawn one way: a header and N boards
packed into the same grid. A page of numbers you check every morning and a
page of rows you work down are not the same page and should not read the same.

A KIND IS PRESENTATION AND NOTHING ELSE. It never changes what is on the page,
what any figure says, which reads run, or the order the person put the
analyses in. Nothing in this module computes, re-computes, rounds or re-words
a figure: it reads stored CALLS — a tool name and its arguments — and returns
one of four words. It runs no read, touches no database, and calls no model.

WHERE THE RULES LIVE. All of them in `pages.kinds` (definitions/metrics.yaml),
read at runtime: the four kinds, what each means, how each draws, and the
ORDERED matchers that derive one. This file holds the mechanism and not one
rule — a matcher naming a condition this file does not implement is a fault,
raised, never a matcher that quietly never fires.

NOTHING HERE LOOKS AT A WORD. Not the page's title, not its purpose, not a
pin's title, not anything a model wrote. A page called "Dashboard" full of
long lists is a `list`.

HOW A PAGE GETS ONE. The owner sets it by hand, or Bob sets it when he builds
or edits the page, and then `pages.kind` holds it and `pages.kind_set_by` says
who. NULL means nobody has said, and the kind is DERIVED on every read — never
stored — so a page whose analyses change is drawn as what it now is.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Sequence

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools._common import load_defs, req  # noqa: E402

# Who said what the kind is. 'user' and 'bob' are stored on the row; 'derived'
# is never stored — it is what a NULL column reads as.
SET_BY_USER = "user"
SET_BY_BOB = "bob"
SET_BY_DERIVED = "derived"
STORED_SET_BY = (SET_BY_USER, SET_BY_BOB)

# The shapes a stored call can be projected to without running it. Anything
# else is unknown, and unknown counts neither for nor against any kind.
SHAPE_LIST = "list"
SHAPE_FIGURE = "figure"
SHAPE_UNKNOWN = "unknown"

# Every condition a matcher may name. A matcher naming anything else raises,
# so the yaml and this file cannot drift apart in silence.
_CONDITIONS = frozenset({
    "min_analyses",
    "min_share_of_figure_analyses",
    "min_share_of_list_analyses",
    "min_distinct_tools",
    "no_read_is_compared",
    "every_read_is_compared",
    "one_window_across_the_page",
    "one_tool_across_the_page",
    "one_grouping_across_the_page",
})
# Keys on a matcher that are prose, not conditions.
_MATCHER_PROSE = frozenset({"name", "gives", "why"})


class KindRefused(ValueError):
    """A kind that is not one of the four. Words a person can act on."""


# ---------------------------------------------------------------------------
# The definitions
# ---------------------------------------------------------------------------

def spec(defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    return req(defs or load_defs(), "pages.kinds")


def kinds(defs: Optional[Mapping[str, Any]] = None) -> list[str]:
    """The four kinds, in the yaml's order. The closed set the API accepts."""
    return [str(k) for k in req(spec(defs), "catalogue")]


def default_kind(defs: Optional[Mapping[str, Any]] = None) -> str:
    return str(req(spec(defs), "default"))


def means(kind: str, defs: Optional[Mapping[str, Any]] = None) -> str:
    """One line, in a person's words, of what this kind of page is."""
    return str(req(spec(defs), f"catalogue.{kind}.means"))


def draws(kind: str, defs: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
    """
    HOW THIS KIND IS DRAWN, verbatim from the yaml: the width each block shape
    takes, whether a run of consecutive single-figure analyses groups into one
    row, whether the analysis title reads as a head or a caption, and whether
    the page carries a dateline.

    Served to the room on the page itself, the way the window's options are,
    so no component holds a copy of a layout rule.
    """
    return dict(req(spec(defs), f"catalogue.{kind}.draws"))


def options(defs: Optional[Mapping[str, Any]] = None) -> list[dict[str, str]]:
    """
    THE FOUR KINDS AS A PERSON READS THEM — what the owner's own control
    offers. `label` is the kind's `means` and `says` is its `when`, both the
    yaml's words: a control that spelled out "collection" would be the schema
    talking to the owner, and a control holding its own wording would be a
    second copy of a definition (CLAUDE.md rule 3).
    """
    out: list[dict[str, str]] = []
    for kind in kinds(defs):
        label = means(kind, defs).strip()
        out.append({
            "value": kind,
            "label": label[:1].upper() + label[1:],
            "says": " ".join(str(req(spec(defs), f"catalogue.{kind}.when")).split()),
        })
    return out


def check(kind: Any, defs: Optional[Mapping[str, Any]] = None) -> str:
    """One of the four, or refused naming them. Never None: a page has a kind."""
    names = kinds(defs)
    if not isinstance(kind, str) or kind not in names:
        raise KindRefused(
            f"{kind!r} is not a kind of page. One of: {', '.join(names)} — "
            f"or leave it unset and it is worked out from what is on the page."
        )
    return kind


# ---------------------------------------------------------------------------
# What a stored call will draw as
# ---------------------------------------------------------------------------

def _grouping(arguments: Mapping[str, Any]) -> tuple[str, ...]:
    """
    A call's grouping as a tuple, whichever way it was written: absent, a bare
    string, or a list. `()` is the whole scope as one row.
    """
    value = arguments.get("group_by")
    if value is None:
        return ()
    if isinstance(value, str):
        return (value,)
    if isinstance(value, (list, tuple)):
        return tuple(str(v) for v in value)
    return (str(value),)


def _compared(arguments: Mapping[str, Any]) -> bool:
    """Whether the call asked the tool for a baseline to compare against."""
    return bool(arguments.get("compare_to"))


def call_shape(call: Mapping[str, Any], defs: Optional[Mapping[str, Any]] = None) -> str:
    """
    What this stored call will produce, projected from the call alone.

    Deliberately narrow. Two projections are honest without rows — a bounded
    ranked set of named rows is a list, and a measured read with no grouping
    returns one row, which is a figure (agent/default_composition.shape_for
    decides the same way from the rows themselves). Everything else is
    `unknown`, which no matcher counts.
    """
    shapes = req(spec(defs), "derivation.shapes")
    tool = str(call.get("tool") or "")
    arguments = call.get("arguments") if isinstance(call.get("arguments"), Mapping) else {}

    listed = shapes.get(SHAPE_LIST) or {}
    if tool in (listed.get("tools") or []):
        return SHAPE_LIST
    if any(arguments.get(a) is not None for a in (listed.get("arguments") or [])):
        return SHAPE_LIST

    figure = shapes.get(SHAPE_FIGURE) or {}
    if tool in (figure.get("tools") or []):
        if not figure.get("grouping_empty") or not _grouping(arguments):
            return SHAPE_FIGURE
    return SHAPE_UNKNOWN


def analysis_shape(calls: Sequence[Mapping[str, Any]],
                   defs: Optional[Mapping[str, Any]] = None) -> str:
    """
    One analysis's shape: what EVERY call in it projects to, or unknown. One
    call nobody can place makes the analysis unplaced — never the majority of
    its calls, because an analysis is drawn as a whole.
    """
    if not calls:
        return SHAPE_UNKNOWN
    found = {call_shape(c, defs) for c in calls}
    return found.pop() if len(found) == 1 else SHAPE_UNKNOWN


# ---------------------------------------------------------------------------
# The derivation
# ---------------------------------------------------------------------------

class _Page:
    """Everything the matchers may see about a page. Calls, never words."""

    def __init__(self, analyses: Sequence[Sequence[Mapping[str, Any]]],
                 *, has_date_window: bool, defs: Mapping[str, Any]) -> None:
        self.count = len(analyses)
        self.shapes = [analysis_shape(list(a), defs) for a in analyses]
        self.calls = [c for a in analyses for c in a if isinstance(c, Mapping)]
        self.tools = {str(c.get("tool") or "") for c in self.calls}
        self.has_date_window = has_date_window
        self._args = [c.get("arguments") if isinstance(c.get("arguments"), Mapping) else {}
                      for c in self.calls]
        self.groupings = {_grouping(a) for a in self._args}
        self.ranges = {str(a.get("date_range")) for a in self._args if a.get("date_range")}
        self.reads_with_a_range = sum(1 for a in self._args if a.get("date_range"))
        self.compared = [_compared(a) for a in self._args]

    def share(self, shape: str) -> float:
        return (sum(1 for s in self.shapes if s == shape) / self.count) if self.count else 0.0

    def one_window(self) -> bool:
        """
        One window over the whole page: either every read names the same date
        range, or the page itself carries a date window, which re-runs every
        analysis over it whatever each was kept with.
        """
        if self.has_date_window:
            return True
        return bool(self.calls) and self.reads_with_a_range == len(self.calls) and len(self.ranges) == 1


def _holds(condition: str, value: Any, page: _Page) -> bool:
    if condition == "min_analyses":
        return page.count >= int(value)
    if condition == "min_share_of_figure_analyses":
        return page.share(SHAPE_FIGURE) >= float(value)
    if condition == "min_share_of_list_analyses":
        return page.share(SHAPE_LIST) >= float(value)
    if condition == "min_distinct_tools":
        return len(page.tools) >= int(value)
    if condition == "no_read_is_compared":
        return bool(value) is not any(page.compared)
    if condition == "every_read_is_compared":
        return bool(value) is (bool(page.compared) and all(page.compared))
    if condition == "one_window_across_the_page":
        return bool(value) is page.one_window()
    if condition == "one_tool_across_the_page":
        return bool(value) is (len(page.tools) == 1)
    if condition == "one_grouping_across_the_page":
        return bool(value) is (len(page.groupings) == 1)
    raise KeyError(condition)   # unreachable: _conditions_of checked it


def _conditions_of(matcher: Mapping[str, Any]) -> dict[str, Any]:
    conditions = {k: v for k, v in matcher.items() if k not in _MATCHER_PROSE}
    unknown = sorted(set(conditions) - _CONDITIONS)
    if unknown:
        raise KeyError(
            f"pages.kinds.derivation matcher {matcher.get('name')!r} names "
            f"{', '.join(unknown)}, which app/services/page_kind.py does not "
            f"implement. Implement it or take it out — a matcher that cannot "
            f"be read is one that never fires."
        )
    return conditions


def derive(analyses: Sequence[Sequence[Mapping[str, Any]]], *,
           has_date_window: bool = False,
           defs: Optional[Mapping[str, Any]] = None) -> str:
    """
    The kind a page of these analyses is, from what its pins CARRY.

    `analyses` is the page's pins IN THE PAGE'S ORDER, each one its stored
    calls ({tool, arguments}). Pure and deterministic: the same page always
    derives the same kind, and the kind is never written down.

    The first matcher whose every condition holds gives the kind; a page under
    `min_analyses`, or one nothing matches, is the default.
    """
    defs = defs or load_defs()
    rules = req(spec(defs), "derivation")
    page = _Page(analyses, has_date_window=has_date_window, defs=defs)
    if page.count < int(req(rules, "min_analyses")):
        return default_kind(defs)
    for matcher in req(rules, "matchers"):
        conditions = _conditions_of(matcher)
        if all(_holds(k, v, page) for k, v in conditions.items()):
            return check(matcher.get("gives"), defs)
    return default_kind(defs)


def which(matcher_name: str, defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    """The named matcher, for a test or a receipt. Raises if there is none."""
    for matcher in req(spec(defs), "derivation.matchers"):
        if str(matcher.get("name")) == matcher_name:
            return matcher
    raise KeyError(matcher_name)


# ---------------------------------------------------------------------------
# A page's kind, as every surface reports it
# ---------------------------------------------------------------------------

def resolve(stored: Any, stored_set_by: Any,
            analyses: Sequence[Sequence[Mapping[str, Any]]], *,
            has_date_window: bool = False,
            defs: Optional[Mapping[str, Any]] = None) -> tuple[str, str]:
    """
    (kind, kind_set_by) for one page. NEVER (None, ...): a page always has a
    kind, because a page always draws as something.

    A stored kind is the person's or Bob's and is returned as it stands — it
    is not second-guessed against the pins, because somebody said. A stored
    kind that is no longer one of the four (an older name, a hand-edited row)
    is treated as nobody having said, rather than refusing to draw the page.
    """
    defs = defs or load_defs()
    if isinstance(stored, str):
        try:
            return check(stored, defs), (str(stored_set_by) if stored_set_by in STORED_SET_BY
                                         else SET_BY_USER)
        except KindRefused:
            pass
    return derive(analyses, has_date_window=has_date_window, defs=defs), SET_BY_DERIVED


def calls_of(pins: Iterable[Any]) -> list[list[dict]]:
    """
    A page's pins as the derivation takes them: each pin's stored calls, in
    the page's order. Reads `tool_calls` and nothing else — never a title.
    """
    out: list[list[dict]] = []
    for pin in pins:
        calls = getattr(pin, "tool_calls", None)
        if calls is None and isinstance(pin, Mapping):
            calls = pin.get("tool_calls") or pin.get("calls")
        out.append([dict(c) for c in (calls or []) if isinstance(c, Mapping)])
    return out
