"""
George's write surface: pin_answer, and save_workflow.

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

THE SECOND WRITE TOOL, AND WHAT IT KEPT
save_workflow turns agreed logic into a versioned rule. It preserves all three
properties above — a second WRITER, not a second role; the loop still never
learns who the user is; agent/ still never imports backend/ — and it extends the
provenance rule rather than carving an exception out of it:

    A workflow step is saved AT THE BINDING IT WAS RUN AT. Every parameter has a
    default, the step bound to its defaults must be in the executed set, and
    other values of that parameter are then permitted because the tools validate
    them against the same metrics.yaml vocabulary and the call SHAPE is one the
    user has watched return.

Computing that defaulted form needs the binder that also runs workflows, and
that lives in the backend — so the injected WorkflowWriter is a small object
with two methods rather than a bare callable. The RULE stays here, beside
pin_answer's; only the substitution lives where it is implemented once.
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


class WorkflowRefused(ValueError):
    """
    The workflow cannot be saved as asked, and the message says why.

    A ValueError for the same reason PinRefused is one: the loop's tool-error
    handling turns it into a real answer with a route out, never a crash.
    """


@dataclass(frozen=True)
class WorkflowSpec:
    """What the loop asks the workflow writer to store."""

    name: str
    steps: list[dict[str, Any]]
    parameters: list[dict[str, Any]]
    intent: Optional[str]
    change_note: Optional[str]
    # An optional proposed slot. It NEVER fires on its own: a schedule created
    # here is disabled until an administrator promotes the version past the
    # backtest gate, so accepting "every Monday at 6" in conversation cannot
    # become unattended execution of unreviewed logic.
    schedule: Optional[dict[str, Any]]
    # Filled by the loop, never by the model.
    question: Optional[str]
    conversation_id: Optional[str]


class WorkflowWriter(Protocol):
    """
    Stores a workflow and reports back. Implemented in the web process.

    Two methods rather than one callable, because saving needs a step's DEFAULTED
    form — parameters substituted for their defaults — and the code that does
    that substitution is the same code that runs workflows. Duplicating it here
    would give the binding two implementations, and the one that drifted would
    be the one deciding what George is allowed to save.

    Both must raise WorkflowRefused — with a message a person could act on — for
    every expected failure. Anything else is a fault.
    """

    def default_calls(self, steps: list[dict], parameters: list[dict]) -> list[dict]:
        """The steps as concrete {tool, arguments} at their default bindings."""
        ...

    async def save(self, spec: WorkflowSpec) -> dict: ...


class WorkflowRunner(Protocol):
    """
    Runs a saved workflow and returns its steps, notices and receipts.

    A READ, injected the same way a writer is, because the workflow it has to
    find lives in a schema george_ro cannot see. No writer here and no reader
    there: the capability is always the injection.
    """

    async def __call__(self, name: str, bindings: Optional[dict],
                       as_of: Optional[str]) -> dict: ...


@dataclass
class WriteContext:
    """
    Everything an injected tool needs that the model does not supply.

    Passed keyword-only, which is also how the schema generator knows to keep it
    out of the model's view: build_tool_schemas skips keyword-only parameters.

    Named for the write tools it was built for; it now also carries the workflow
    RUNNER, which is a read. What the two have in common is the thing that
    matters: each is a capability the loop cannot give itself, and each is absent
    from the model's schema entirely when it has not been injected.
    """

    writer: Optional[PinWriter] = None
    question: Optional[str] = None
    conversation_id: Optional[str] = None
    # call_key -> {tool, arguments} for every call that RAN AND SUCCEEDED in this
    # conversation. The loop fills it; pin_answer refuses anything absent from it.
    executed: dict[str, dict] = field(default_factory=dict)
    workflow_writer: Optional[WorkflowWriter] = None
    workflow_runner: Optional[WorkflowRunner] = None


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


def _normalize_steps(steps: Any) -> list[dict]:
    """Structural check only. Whether a step RUNS is the writer's business."""
    if not isinstance(steps, list) or not steps:
        raise WorkflowRefused(
            "steps must be a non-empty list of {name, tool, arguments, why}."
        )

    out = []
    for step in steps:
        if not isinstance(step, dict):
            raise WorkflowRefused(
                f"Each step must be an object with 'name', 'tool' and "
                f"'arguments'; got {type(step).__name__}."
            )
        tool = step.get("tool")
        if not isinstance(tool, str) or not tool:
            raise WorkflowRefused("A step is missing its 'tool' name.")
        name = step.get("name")
        if not isinstance(name, str) or not name.strip():
            raise WorkflowRefused(
                f"The {tool} step needs a 'name'. Step names are how a person "
                f"reads the run six months from now — write what the step "
                f"establishes, not what the tool is called."
            )
        args = step.get("arguments") or {}
        if not isinstance(args, dict):
            raise WorkflowRefused(
                f"{name}: 'arguments' must be an object, got {type(args).__name__}."
            )
        out.append({
            "name": name.strip(),
            "tool": tool,
            "arguments": args,
            "why": (step.get("why") or "").strip() or None,
        })
    return out


async def save_workflow(
    name: str,
    steps: list[dict],
    parameters: Optional[list[dict]] = None,
    intent: Optional[str] = None,
    change_note: Optional[str] = None,
    schedule: Optional[dict] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Save agreed logic as a versioned workflow: named steps over the tools you
    have already run, the parameters that vary, and the reasoning behind each
    choice. Saving a name that already exists appends a new VERSION rather than
    replacing anything, so nothing is ever overwritten.

    Args:
        name: What the workflow is called, e.g. "PO Maker". This is how it is
            run later ("run PO Maker"), so it must be unique — a name that
            differs from an existing one only by capitalisation is refused.
        steps: The steps, in the order a person should read them, as
            [{"name": ..., "tool": ..., "arguments": {...}, "why": ...}].
            You may ONLY save steps whose call you have already run,
            successfully, in this conversation, at the values its parameters
            default to. Steps do not pass data to each other — each one gathers
            a fact independently. `why` is the reasoning you and the user
            agreed on; write it for someone reading this in six months.
        parameters: What varies between runs, as
            [{"name": ..., "type": ..., "default": ..., "description": ...}].
            Types: string, integer, boolean, date_range. Every parameter needs a
            default. Reference one from a step with {"$param": "<name>"}.
            A parameter is SCOPE — which store, which window, how many rows.
            A business threshold is not a parameter; it belongs in metrics.yaml.
        intent: Why this workflow exists, in the user's words.
        change_note: When saving over an existing name, what changed and why.
        schedule: An optional slot, as {"kind": "daily"|"weekly"|"monthly",
            "hour": 6, "minute": 0, "days_of_week": [0], "day_of_month": null,
            "telegram_chat_ids": [...]}. It is created switched OFF and fires
            nothing until an administrator has backtested and promoted the
            version. Say so when you use it.

    Returns:
        {rows, meta} like every other tool. rows holds one row describing the
        workflow and the version that now exists; meta.source_table is
        george.workflow_versions.
    """
    if ctx.workflow_writer is None:
        raise WorkflowRefused(
            "Saving a workflow is not available in this session — it requires a "
            "signed-in user. Tell the user the logic cannot be saved from here."
        )

    if not isinstance(name, str) or not name.strip():
        raise WorkflowRefused("A workflow needs a name — it is how it is run.")

    normalized = _normalize_steps(steps)
    params = parameters if isinstance(parameters, list) else []

    # Provenance, extended rather than excepted: the DEFAULTED form of every
    # step must be a call that ran and succeeded here. A workflow the user has
    # not watched produce numbers is a rule nobody has ever checked.
    calls = ctx.workflow_writer.default_calls(normalized, params)
    missing = _unrun(calls, ctx.executed)
    if missing:
        listed = "; ".join(
            f"{c['tool']}({json.dumps(c['arguments'], sort_keys=True, default=str)})"
            for c in missing
        )
        ran = ", ".join(sorted({c["tool"] for c in ctx.executed.values()})) or "none"
        raise WorkflowRefused(
            f"You have not run {listed} in this conversation, so it cannot be "
            f"saved as a step — a workflow must be built from calls whose results "
            f"the user has actually seen. Run each step at its default values "
            f"first, read the results, then save. Tools run so far: {ran}."
        )

    stored = await ctx.workflow_writer.save(
        WorkflowSpec(
            name=name.strip(),
            steps=normalized,
            parameters=params,
            intent=(intent or None),
            change_note=(change_note or None),
            schedule=schedule if isinstance(schedule, dict) else None,
            question=ctx.question,
            conversation_id=ctx.conversation_id,
        )
    )

    return {
        "rows": [{
            "workflow_id": stored["workflow_id"],
            "name": stored["name"],
            "version": stored["version"],
            "steps": [s["name"] for s in normalized],
            "parameters": [p.get("name") for p in params],
            "scheduled": stored.get("schedule") or None,
            "awaiting_promotion": stored.get("awaiting_promotion", True),
        }],
        # Architecture rule 2 has no exception for writes. What was written,
        # which version it became, and when.
        "meta": {
            "source_table": "george.workflow_versions",
            "filters_applied": [f"created_by = {stored['created_by']}"],
            "snapshot_timestamp": stored.get("created_at")
            or datetime.now(timezone.utc).isoformat(),
            "row_count": 1,
            "workflow": stored["name"],
            "version": stored["version"],
            "wrote": "workflow",
            # A saved workflow is not a scheduled one. Surfaced in meta as well
            # as in the answer, because the difference is the entire gate.
            "queue": stored.get("queue_name"),
        },
    }


# The write surface, by name. agent/loop.py merges these into the schema ONLY
# when the matching writer has been injected, and dispatches them separately
# from TOOL_FUNCTIONS so that neither the pin runner, a pin's own contents, nor
# a workflow's steps can ever reach one.
WRITE_TOOL_FUNCTIONS = {
    "pin_answer": pin_answer,
    "save_workflow": save_workflow,
}

# Which injected capability each write tool needs. The loop reads this to decide
# what to put in the schema: a session with a pin writer and no workflow writer
# is offered pin_answer and not save_workflow, rather than being offered a tool
# that would refuse every call.
WRITE_TOOL_REQUIRES = {
    "pin_answer": "writer",
    "save_workflow": "workflow_writer",
}
