"""
A page's date window — one control that re-runs every analysis on the page.

WHAT IT IS FOR (W1.4, 2026-09-22). "Add date filters to this", asked from a
kept page. Until this a page had no filter to add: the only window was each
pin's own, and Bob put a control on his own answer instead, beside a page it
could not reach. Now a page may carry ONE window (george.pages.window) that a
person changes from the page, and every analysis on it re-runs with its own
window argument set to that preset.

THE FIGURE IS STILL THE PIN'S OWN READ. Nothing here computes anything. The
window is substituted into each stored call by `replay.retarget` — the same
function a replayed window goes through, landing where
`surface.desk.replay.arguments.window` says each tool keeps its window — and
the call is then run by pin_runner as a tile always runs it. The stored call
is never rewritten: the window is scope applied at run time, so taking the
filter off shows the page exactly as it was kept.

A READ THAT TAKES NO WINDOW SAYS SO. A tool with no window argument, or one
whose window is not a date range (`get_dead_stock.window`,
`get_purchase_plan.lookback_days`), runs as it was kept and carries a line
from `pages.window.no_window_says` naming it. It is never drawn under a
window it ignored. Whether an argument takes a preset is read from the live
tool schema (the preset names are its enum), not from a list kept here.

THE OPTIONS ARE THE YAML'S (`pages.window.options_from`: sales_day.presets).
None is a real value: the control is on the page and nothing is moved until
somebody picks — adding a filter does not quietly change the figures.

Stored shape, all of it metadata: {"preset": str | None, "set_at": iso,
"set_by": "user" | "bob"}. A NULL column is a page with no window control.
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from tools._common import load_defs, req  # noqa: E402


class WindowRefused(ValueError):
    """A window value that is not one of the presets. Words a person can act on."""


def spec(defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    return req(defs or load_defs(), "pages.window")


def presets(defs: Optional[Mapping[str, Any]] = None) -> list[str]:
    """The windows a page may be set to, in the yaml's order."""
    defs = defs or load_defs()
    return [str(k) for k in req(defs, str(spec(defs)["options_from"]))]


def label(preset: Optional[str], defs: Optional[Mapping[str, Any]] = None) -> str:
    """A preset's words — the same convention the desk's window token uses."""
    if preset is None:
        return str(spec(defs)["unset_label"])
    return preset.replace("_", " ")


def options(defs: Optional[Mapping[str, Any]] = None) -> list[dict[str, Any]]:
    """What the control offers: unset first, then every preset."""
    defs = defs or load_defs()
    table = req(defs, str(spec(defs)["options_from"]))
    out: list[dict[str, Any]] = [{"value": None, "label": label(None, defs),
                                  "includes_partial_day": False}]
    for name in presets(defs):
        out.append({"value": name, "label": label(name, defs),
                    "includes_partial_day": bool((table.get(name) or {}).get("includes_partial_day"))})
    return out


def check(preset: Any, defs: Optional[Mapping[str, Any]] = None) -> Optional[str]:
    """A preset name or None; anything else is refused naming the options."""
    if preset is None:
        return None
    names = presets(defs)
    if not isinstance(preset, str) or preset not in names:
        raise WindowRefused(
            f"{preset!r} is not a date window a page can take. One of: "
            f"{', '.join(names)} — or null for each analysis as it was kept."
        )
    return preset


def stored(preset: Optional[str], set_by: str, *, at: Optional[datetime] = None) -> dict[str, Any]:
    return {"preset": preset, "set_by": set_by,
            "set_at": (at or datetime.now(timezone.utc)).isoformat()}


def current(window: Any) -> Optional[str]:
    """The preset a stored window applies, or None (no window, or unset)."""
    if isinstance(window, Mapping):
        value = window.get("preset")
        return value if isinstance(value, str) else None
    return None


def _argument(tool: str, defs: Mapping[str, Any]) -> Optional[str]:
    """This tool's own name for its window, or None when it has none."""
    landing = req(defs, str(spec(defs)["lands_through"]))
    per_tool = req(defs, str(landing["per_tool"]))
    arg = per_tool.get(tool)
    return str(arg) if arg else None


def takes_window(tool: str, preset: str, defs: Optional[Mapping[str, Any]] = None) -> Optional[str]:
    """
    The argument this tool's window lands in, when that argument takes a
    preset; None when the tool has no window or its window is not a date
    range. Read off the live tool schema, so a tool that stops taking presets
    stops being windowed without anybody editing a list.
    """
    from app.services.pin_runner import _enum_for, _schema_for

    defs = defs or load_defs()
    arg = _argument(tool, defs)
    if arg is None:
        return None
    allowed = _enum_for(_schema_for(tool), arg, preset)
    return arg if allowed and preset in allowed else None


def windowed(calls: list[dict], preset: Optional[str], *, title: str = "This analysis",
             defs: Optional[Mapping[str, Any]] = None) -> tuple[list[dict], list[Optional[dict]]]:
    """
    The calls to run under the page's window, and what the window did to each.

    Pure over its inputs. With no preset the calls come back as stored and
    every note is None. Otherwise a call whose tool takes a preset window has
    it set (through `replay.retarget`, the one implementation of "change the
    window"), and one that does not is left alone and noted in the yaml's
    words. The stored list is never mutated.
    """
    if preset is None:
        return [dict(c) for c in calls], [None] * len(calls)
    from app.services.replay import retarget

    defs = defs or load_defs()
    out: list[dict] = []
    notes: list[Optional[dict]] = []
    for call in calls:
        tool = str(call.get("tool"))
        stored_args = dict(call.get("arguments") or {})
        arg = takes_window(tool, preset, defs)
        if arg is None:
            out.append({**call, "arguments": stored_args})
            # Named by the analysis, and by its read when it has several, so
            # the line never says the whole analysis ignored the window when
            # only one of its reads did.
            who = title if len(calls) == 1 else f"{title} ({tool})"
            notes.append({"applied": None, "preset": preset,
                          "says": str(spec(defs)["no_window_says"]).format(analysis=who)})
            continue
        args, was = retarget(tool, stored_args, "window", preset, defs)
        out.append({**call, "arguments": args})
        notes.append({"applied": preset, "argument": arg, "was": was})
    return out, notes
