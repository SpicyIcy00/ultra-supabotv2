"""
George's write surface. Today that is exactly one tool: pin_answer.

WHY THIS FILE IS NOT IN tools/
tools/ is the READ surface: ten functions that connect as george_ro and return
figures. It is also, and more importantly, the set of calls a pin may CONTAIN —
backend/app/services/pin_runner.py validates every stored call against
agent.loop.TOOL_FUNCTIONS. Putting pin_answer in there would make a pin able to
contain a pin, and would let the pin RUNNER write. Keeping the write surface in
a separate registry closes both by construction rather than by a name check.

HOW THE WRITE HAPPENS — READ THIS BEFORE ADDING A SECOND WRITE TOOL
This module opens no connection and holds no credential. It cannot: George's two
database identities are george_ro (read-only, SELECT on business tables) and
george_log (INSERT on george.* with NO SELECT, so it could not read a pin count
or a page list even if it were granted the table). Neither can create a pin, and
neither should gain the privilege — a role that can read every transaction and
also write is exactly the boundary the split exists to keep.

So the loop is handed a WRITER by whoever runs it. The web process constructs it
in backend/app/api/v1/routes/george.py, closing over the AUTHENTICATED user and
the application's own session, and the write runs on the application role — the
same role, through the same service function, that POST /pins uses.

Three properties follow, and the next write tool should preserve all three:
  - No writer injected, no write tool in the schema. The capability IS the
    injection; an unauthenticated caller gets the ten read tools and nothing else.
  - The loop never learns who the user is. `created_by` comes from the token on
    the backend side, and nothing the model emits can influence it.
  - agent/ never imports backend/. The dependency runs one way only.

PROVENANCE: George may only pin calls he actually ran, successfully, in THIS
conversation. That single rule is what makes "pin that but daily" safe — the
adjusted call is not in the executed set until it has been run, so the loop
forces the re-run to happen (and to stream to the user) before the pin can
exist. It is enforced here, not asked for in the prompt.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Protocol


class PinRefused(ValueError):
    """
    The pin cannot be created as asked, and the message says why.

    A ValueError so agent/loop.py's tool-error handling treats it exactly like a
    read tool's refusal: it goes back to the model as a real answer with a route
    out, never as a crash.
    """


@dataclass(frozen=True)
class PinSpec:
    """What the loop asks the writer to store. Assembled here, written there."""

    tool_calls: list[dict[str, Any]]
    title: str
    page: Optional[str]
    allow_similar_page: bool
    # Filled by the loop, never by the model: the question as the user asked it
    # and the id of the conversation it was asked in.
    question: Optional[str]
    conversation_id: Optional[str]


class PinWriter(Protocol):
    """
    Stores a pin and reports back. Implemented in the web process.

    Must raise PinRefused — with a message a person could act on — for every
    expected failure (an invalid call, a full account, a page name that collides
    with an existing one by case alone). Anything else is a fault.
    """

    async def __call__(self, spec: PinSpec) -> dict: ...


@dataclass
class WriteContext:
    """
    Everything a write tool needs that the model does not supply.

    Passed keyword-only, which is also how the schema generator knows to keep it
    out of the model's view: build_tool_schemas skips keyword-only parameters.
    """

    writer: Optional[PinWriter] = None
    question: Optional[str] = None
    conversation_id: Optional[str] = None
    # call_key -> {tool, arguments} for every call that RAN AND SUCCEEDED in this
    # conversation. The loop fills it; pin_answer refuses anything absent from it.
    executed: dict[str, dict] = field(default_factory=dict)


def call_key(tool: str, arguments: Any) -> str:
    """
    Canonical identity of one tool call: name plus arguments, order-independent.

    Sorted keys so {"metric": x, "store": y} and {"store": y, "metric": x} are
    the same call — the model rewrites argument order freely between turns, and
    a pin refused over key order would be a mystery to everyone.

    Nothing else is normalised. In particular an OMITTED argument and an explicit
    None are different calls, because for these tools they are: get_movement's
    `store` defaults to "AJI BARN", while store=None means every location.
    Folding them together would let a tile re-run over a scope the user never
    saw. The cost of the strict rule is a refusal that says "run it, then pin
    it"; the cost of the loose one is a tile quietly answering a different
    question.
    """
    return tool + "\x00" + json.dumps(arguments or {}, sort_keys=True, default=str)


def _normalize_calls(tool_calls: Any) -> list[dict]:
    """Structural check only. Whether a call is RUNNABLE is the writer's business."""
    if not isinstance(tool_calls, list) or not tool_calls:
        raise PinRefused("tool_calls must be a non-empty list of {tool, arguments}.")

    out = []
    for call in tool_calls:
        if not isinstance(call, dict):
            raise PinRefused(
                f"Each tool call must be an object with 'tool' and 'arguments'; "
                f"got {type(call).__name__}."
            )
        name = call.get("tool")
        args = call.get("arguments") or {}
        if not isinstance(name, str) or not name:
            raise PinRefused("A tool call is missing its 'tool' name.")
        if not isinstance(args, dict):
            raise PinRefused(
                f"{name}: 'arguments' must be an object, got {type(args).__name__}."
            )
        out.append({"tool": name, "arguments": args})
    return out


def _unrun(calls: list[dict], executed: dict[str, dict]) -> list[dict]:
    """The calls that did not run, successfully, in this conversation."""
    return [c for c in calls if call_key(c["tool"], c["arguments"]) not in executed]


async def pin_answer(
    tool_calls: list[dict],
    title: str,
    page: Optional[str] = None,
    allow_similar_page: bool = False,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Pin an answer: turn the tool calls behind it into a live tile that re-runs.
    A pin stores the CALLS, never the numbers, so the tile shows current figures
    rather than a sentence written against last month's data.

    Args:
        tool_calls: The calls to pin, as [{"tool": ..., "arguments": {...}}].
            You may ONLY pin calls you have already run, successfully, in this
            conversation. To pin a variant of an answer — the same question
            grouped by day, or for one store — run the adjusted call FIRST, read
            its result, and then pin that call. A call you have not run is
            refused.
        title: What the tile is called. Write it as a person would label a tile
            they will see again in a month, not as a restatement of the question.
        page: Which page the pin goes on, e.g. "Replenishment". A page is a
            collection of pins. Omit it to leave the pin ungrouped. Use a page
            name the user already has unless they asked for a new one.
        allow_similar_page: Only after a refusal says the page name collides with
            an existing one by capitalisation alone, and only if the user then
            says they want both pages kept.

    Returns:
        {rows, meta} like every other tool. rows holds one row describing the pin
        that now exists; meta.source_table is george.pins.
    """
    if ctx.writer is None:
        # Unreachable through the loop, which only advertises a write tool when a
        # writer exists. Kept because a missing writer must never be a crash.
        raise PinRefused(
            "Pinning is not available in this session — it requires a signed-in "
            "user. Tell the user the answer cannot be pinned from here."
        )

    calls = _normalize_calls(tool_calls)

    if not isinstance(title, str) or not title.strip():
        raise PinRefused("A pin needs a title.")

    missing = _unrun(calls, ctx.executed)
    if missing:
        listed = "; ".join(
            f"{c['tool']}({json.dumps(c['arguments'], sort_keys=True, default=str)})"
            for c in missing
        )
        ran = ", ".join(sorted({c["tool"] for c in ctx.executed.values()})) or "none"
        raise PinRefused(
            f"You have not run {listed} in this conversation, so it cannot be "
            f"pinned — a pin must be a call whose result the user has actually "
            f"seen. Run it now, read the result, then pin it. Tools run so far: "
            f"{ran}."
        )

    stored = await ctx.writer(
        PinSpec(
            tool_calls=calls,
            title=title.strip(),
            page=page,
            allow_similar_page=bool(allow_similar_page),
            question=ctx.question,
            conversation_id=ctx.conversation_id,
        )
    )

    return {
        "rows": [{
            "pin_id": stored["pin_id"],
            "title": stored["title"],
            "page": stored["page"],
            "tool_calls": calls,
            "pins_on_page": stored["pins_on_page"],
        }],
        # Architecture rule 2 has no exception for writes. A pin is as
        # inspectable as a figure: what was written, where, scoped to whom, and
        # when.
        "meta": {
            "source_table": "george.pins",
            "filters_applied": [f"created_by = {stored['created_by']}"],
            "snapshot_timestamp": stored.get("created_at")
            or datetime.now(timezone.utc).isoformat(),
            "row_count": 1,
            "page": stored["page"],
            "pins_on_page": stored["pins_on_page"],
            "wrote": "pin",
        },
    }


# The write surface, by name. agent/loop.py merges this into the schema ONLY
# when a writer has been injected, and dispatches it separately from
# TOOL_FUNCTIONS so that neither the pin runner nor a pin's own contents can
# ever reach it.
WRITE_TOOL_FUNCTIONS = {"pin_answer": pin_answer}
