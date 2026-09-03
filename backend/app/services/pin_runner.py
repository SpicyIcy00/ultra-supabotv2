"""
Validating and running the tool calls behind a pin.

A pin re-runs rather than storing a number, so this module is what makes a
pinned tile trustworthy: it decides which of four states each call is in, and it
returns the SAME {rows, meta, notices} shape a live chat answer produces, so the
tile can reuse the chat components verbatim.

NO MODEL CALL. A pin replays tools and nothing else — deterministic, fast, and
free. That gives pinned tiles a property chat does not have: a notice CANNOT go
unsurfaced, because no model stands between meta.notice and the screen. In chat
the loop has to nag the model and sometimes force caveats in (see
_unsurfaced/_forced_caveats in agent/loop.py); here the notice is simply
rendered.

THE FOUR STATES
    ok          ran and returned data
    refused     the tool raised. A REAL ANSWER — the tool declining to produce a
                misleading number — carried through with its message, never
                flattened into a generic error.
    unrunnable  the tool or one of its arguments no longer exists. Pins rot:
                this repo has already renamed a metrics.yaml key and removed
                values from tool enums. A rotted pin says so instead of crashing
                the page.
    failed      timeout, connection, or an unexpected exception.

VALIDATION HAPPENS TWICE — before storing and again before running. Storing an
un-runnable pin means a tile that breaks later for no visible reason; running an
unvalidated one means trusting a replayed argument list. Neither is acceptable,
and the check is cheap.

Value-level validation deliberately stays INSIDE the tools. build_tool_schemas
in agent/loop.py says so explicitly ("the tools validate their own inputs and
raise on anything unknown"), and a tool raising is the `refused` state, which is
information rather than a fault.
"""

from __future__ import annotations

import asyncio
import inspect
import re
import sys
import time
from pathlib import Path
from typing import Any, Optional

# agent/ and tools/ live at the repo root, one level above backend/ — the same
# path insertion routes/george.py already does.
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import loop as george_loop  # noqa: E402

# A single pinned call gets less time than a chat call: a page of tiles loads
# them together and one slow query must not hold the page. george_ro also
# carries its own statement_timeout of 30s.
CALL_TIMEOUT_S = 25.0

# Worst-first. A pin's status is the worst of its calls'.
_SEVERITY = {"unrunnable": 3, "failed": 2, "refused": 1, "ok": 0}


class PinValidationError(ValueError):
    """A tool call that cannot be stored. Carries a human-readable reason."""


# ---------------------------------------------------------------------------
# Page names
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")


def normalize_page(page: Optional[str]) -> Optional[str]:
    """
    Trim and collapse internal whitespace. Case is PRESERVED.

    Case is what the user typed and is theirs to choose; it is not evidence of a
    different page. Deciding that "Replenishment" and "replenishment" are the
    same page is a separate question, answered by find_similar_page below —
    which reports the collision rather than resolving it.
    """
    if page is None:
        return None
    cleaned = _WS.sub(" ", page).strip()
    return cleaned or None


def find_similar_page(page: Optional[str], existing: list[str]) -> Optional[str]:
    """
    An existing page name that differs from `page` only by case.

    DELIBERATELY NOT FUZZY. Case and whitespace only — no edit distance, no
    stemming, no prefix matching. "Replenishment" vs "replenishment" is a
    near-certain accident; "Replenishment" vs "Replenishing" might be two real
    pages, and merging them on a similarity score would look authoritative while
    being a guess. That is the same rule the store alias map follows
    (metrics.yaml storehub.locations.fuzzy: false), for the same reason.

    Returns the existing name, or None. An EXACT match returns None — that is
    the same page, not a near-duplicate.
    """
    if not page:
        return None
    lowered = page.lower()
    for name in existing:
        if name != page and name.lower() == lowered:
            return name
    return None


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_call(call: Any) -> tuple[str, dict]:
    """
    Check one {tool, arguments} against the LIVE tool surface.

    Raises PinValidationError with a reason a person can act on. The reason is
    shown on the tile when a stored pin later fails this, so it has to say what
    changed, not just that something did.
    """
    if not isinstance(call, dict):
        raise PinValidationError(f"Expected a tool call object, got {type(call).__name__}.")

    name = call.get("tool")
    args = call.get("arguments") or {}
    if not isinstance(name, str) or not name:
        raise PinValidationError("Tool call is missing a tool name.")
    if not isinstance(args, dict):
        raise PinValidationError(
            f"{name}: arguments must be an object, got {type(args).__name__}."
        )

    fn = george_loop.TOOL_FUNCTIONS.get(name)
    if fn is None:
        raise PinValidationError(
            f"{name!r} is no longer one of George's tools. Available: "
            f"{', '.join(sorted(george_loop.TOOL_FUNCTIONS))}."
        )

    # Structural check: catches an argument that was removed or renamed, and one
    # that never existed. Values are the tools' business.
    try:
        inspect.signature(fn).bind(**args)
    except TypeError as exc:
        raise PinValidationError(f"{name}: {exc}.") from exc

    # Closed vocabularies come from metrics.yaml via the generated schema, so a
    # metric or preset deleted from the definitions invalidates its pins
    # automatically rather than failing later inside the tool.
    schema = _schema_for(name)
    for arg, value in args.items():
        allowed = _enum_for(schema, arg)
        if allowed is None or value is None:
            continue
        offered = value if isinstance(value, list) else [value]
        for v in offered:
            if isinstance(v, str) and v not in allowed:
                raise PinValidationError(
                    f"{name}.{arg}: {v!r} is no longer a valid value. "
                    f"Valid: {', '.join(map(str, allowed))}."
                )

    return name, args


def validate_calls(calls: Any) -> list[dict]:
    """Validate the whole list and return it normalised to {tool, arguments}."""
    if not isinstance(calls, list) or not calls:
        raise PinValidationError("A pin needs at least one tool call.")
    out = []
    for call in calls:
        name, args = validate_call(call)
        out.append({"tool": name, "arguments": args})
    return out


def _schema_for(name: str) -> dict:
    for s in george_loop.build_tool_schemas():
        if s["name"] == name:
            return s
    return {}


def _enum_for(schema: dict, arg: str) -> Optional[list]:
    """The closed vocabulary for one parameter, if it has one."""
    prop = (schema.get("input_schema", {}).get("properties", {}) or {}).get(arg)
    if not isinstance(prop, dict):
        return None
    if "enum" in prop:
        return prop["enum"]
    # group_by and date_range are oneOf; take the string branch's enum.
    for branch in prop.get("oneOf", []):
        if isinstance(branch, dict) and "enum" in branch:
            return branch["enum"]
        items = (branch or {}).get("items")
        if isinstance(items, dict) and "enum" in items:
            return items["enum"]
    return None


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

async def run_call(call: dict) -> dict:
    """
    Run one stored tool call. Never raises — every outcome is a state.

    The result carries the FULL meta, not the summary the chat tool_result frame
    sends, because the tile has to show filters_applied and snapshot_timestamp
    to satisfy "every number is inspectable" and "no number without a timestamp".
    """
    name = call.get("tool")
    args = call.get("arguments") or {}
    started = time.perf_counter()

    def _done(status: str, **extra) -> dict:
        return {
            "tool": name,
            "arguments": args,
            "status": status,
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "rows": [],
            "meta": {},
            "notices": [],
            **extra,
        }

    # Re-validated at run time, not just at store time: the tool surface can
    # change between pinning and loading.
    try:
        validate_call(call)
    except PinValidationError as exc:
        return _done("unrunnable", error=str(exc))

    fn = george_loop.TOOL_FUNCTIONS[name]
    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(fn, **args), timeout=CALL_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        return _done("failed",
                     error=f"Timed out after {CALL_TIMEOUT_S:.0f}s.")
    except (ValueError, KeyError, RuntimeError) as exc:
        # A refusal. The tool declining to produce a misleading number is a real
        # answer and keeps its own words — see agent/loop.py _call_tool, which
        # treats these identically.
        return _done("refused", error=str(exc))
    except Exception as exc:  # noqa: BLE001 - a tile must not take down the page
        return _done("failed", error=f"{type(exc).__name__}: {exc}")

    capped = george_loop._truncate(result)
    return _done(
        "ok",
        rows=george_loop._json_safe(capped.get("rows") or []),
        meta=george_loop._json_safe(capped.get("meta") or {}),
        notices=george_loop._json_safe(george_loop._notices_from(capped)),
    )


async def run_pin(tool_calls: list[dict]) -> dict:
    """
    Run every call behind a pin, concurrently, and roll up a status.

    Calls run together and fail independently: one dead call must not hide the
    others, because a tile showing three figures where one has rotted should
    still show the two that work — and say so about the third.
    """
    results = await asyncio.gather(*[run_call(c) for c in tool_calls])
    status = max((r["status"] for r in results),
                 key=lambda s: _SEVERITY.get(s, 0), default="ok")
    return {
        "status": status,
        "results": list(results),
        # Flattened for a tile that shows one notice strip above its figures,
        # the way GeorgeConversation puts notices above the answer.
        "notices": [n for r in results for n in r["notices"]],
    }
