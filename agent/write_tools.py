"""
George's write surface: pin_answer, save_workflow, create_page and edit_page.

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

THE FOURTH CAPABILITY IS A READ WITH NO NAME IN IT (added 2026-09-07, Page
Context V1). A PageReader reads ONE page of the caller's own pins — the page
they were on when they asked — and replays its pins through the same runner a
tile uses. It is injected exactly as the workflow runner is, for the same reason
(the pins live in a schema george_ro cannot see), and it keeps one more property
on purpose: the reader is closed over the authenticated user AND the exact page
scope in the web process, so the tool that calls it has no username argument
and no page-name argument. "Read Alice's Purchasing page" has nowhere to put
the name. No reader injected means the tool is not in the schema at all.

THE FIFTH AND SIXTH ARE WRITES TO A PAGE (added 2026-09-08, Page Workshop V1).
create_page and edit_page reach a PageWriter the web process closes over the
authenticated owner and — for "this page" — the page the question was asked
from, by its ID. The model names a page by page_id and a pin by pin_id; a
title is accepted as a convenience the SERVICE resolves deterministically or
refuses (two candidates is a refusal that lists both), never a guess and never
the write identity. Neither tool takes a username or an owner, and a page id
that is not the caller's is the same answer as one that does not exist.

The provenance rule extends unchanged: an analysis a page is built from is a
list of calls that RAN, successfully, in this conversation — the same
`executed` set pin_answer checks — or the id of a pin the caller already owns.
Nothing is re-run to be saved, and the tool_calls schema's enum is the READ
surface, so a page can never hold view_page, a write or a composite. Every
build and every edit is one transaction on the backend: a failed fourth
analysis leaves no page behind, and the tool returns only after the commit.
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


class PageReadRefused(ValueError):
    """
    The page cannot be read as asked, and the message says why: the caller has
    no page of that name, or asked for more pins than one read may hold.

    A ValueError for the same reason PinRefused is one: the loop's tool-error
    handling turns it into a real answer with a route out, never a crash.
    """


class PageReader(Protocol):
    """
    Reads the page the caller is on and replays its pins. Implemented in the
    web process, bound to the authenticated user and the exact page scope.

    `pins` is an optional list of pin ids to read instead of the default
    newest few; `figures` false returns the pins' definitions without
    replaying anything. Must raise PageReadRefused — with a message a person
    could act on — for every expected failure. Anything else is a fault.
    """

    async def __call__(self, pins: Optional[list[str]], figures: bool) -> dict: ...


class MemoryReader(Protocol):
    """Reads what George currently believes. Bound to the caller in the web process."""

    async def __call__(self) -> dict: ...


class AutomationsReader(Protocol):
    """Reads what the saved rules have been doing. Bound to the caller likewise."""

    async def __call__(self) -> dict: ...


class StandingRefused(ValueError):
    """
    The standing question cannot be created or changed as asked, and the
    message says why: no question of that id, an ambiguous "which one", a
    bound, a time that is not a time. A ValueError for the same reason
    PinRefused is one — the loop turns it into a real answer with a route out.
    """


class StandingQuestionWriter(Protocol):
    """
    Creates and changes the caller's standing questions. Implemented in the web
    process, closed over the authenticated owner — which is why no method here
    takes one, and why "change Alice's morning question" has nowhere to put the
    name.

    `apply` takes an action and the fields that action needs, and returns the
    question as a row plus what changed. Must raise StandingRefused, with a
    message a person could act on, for every expected failure, and return only
    after the write has COMMITTED.
    """

    async def apply(self, action: str, fields: dict[str, Any]) -> dict: ...


class BeliefStore(Protocol):
    """
    Where George's understanding is kept. Implemented in the web process, bound
    to the authenticated user for provenance only — beliefs are about the
    business and are shared, so there is no owner scope on the read.

    `record` takes beliefs that agent/beliefs.py has already ruled admissible
    and returns one row per belief saying what happened to it: new, confirmed,
    revised or refused.
    """

    async def record(self, accepted: list[dict]) -> list[dict]: ...


class PageRefused(ValueError):
    """
    The page cannot be created or edited as asked, and the message says why:
    a bound, a title collision, a target that is ambiguous or not the
    caller's, an analysis that never ran. A ValueError for the same reason
    PinRefused is one: the loop turns it into a real answer with a route out.
    """


@dataclass(frozen=True)
class PageBuildSpec:
    """What the loop asks the page writer to create. Assembled here, written there."""

    title: str
    purpose: Optional[str]
    # Each either {"title", "tool_calls"} (already checked against the
    # executed set) or {"pin_id"} (an existing pin; the service checks it is
    # the caller's).
    analyses: list[dict[str, Any]]
    # Filled by the loop, never by the model.
    question: Optional[str]
    conversation_id: Optional[str]


@dataclass(frozen=True)
class PageEditSpec:
    """What the loop asks the page writer to change."""

    # None means the page the question was asked from; the writer knows which
    # that is because it was closed over it. A string is a page id, which the
    # service checks is the caller's.
    page_id: Optional[str]
    operations: list[dict[str, Any]]
    question: Optional[str]
    conversation_id: Optional[str]


class PageWriter(Protocol):
    """
    Builds and edits the caller's pages. Implemented in the web process,
    closed over the authenticated owner and the page in scope (if any).

    Both methods must raise PageRefused — with a message a person could act
    on — for every expected failure, and return only after the write has
    COMMITTED. Anything else is a fault.
    """

    async def create(self, spec: PageBuildSpec) -> dict: ...

    async def edit(self, spec: PageEditSpec) -> dict: ...


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
    # The page the caller is on, readable through the application role. Bound
    # to the user and the page in the web process; the model names neither.
    page_reader: Optional[PageReader] = None
    # The caller's pages, writable through the application role. Bound to the
    # owner (and to the page in scope, for "this page") in the web process.
    page_writer: Optional[PageWriter] = None
    # Where George's understanding is kept. A write, injected like the others;
    # what he currently believes is READ before the loop starts and arrives as
    # part of the question, because it shapes the whole turn rather than being
    # fetched during one.
    belief_store: Optional[BeliefStore] = None
    # The two things that are most his and that he cannot otherwise see: his
    # own held views, and what the systems he built have been doing. Both live
    # in the `george` schema, which george_ro has no access to. Reads, injected
    # exactly like the page reader — bound to the authenticated user here, so
    # neither tool has an argument for whose memory or whose systems.
    #
    # He is already GIVEN his beliefs as text before a turn starts, which is
    # enough to reason with. It is not enough to put one on the board: an
    # object needs a read with a seq behind it, and there was no read. That gap
    # is why a briefing composer once got hand-written in Python.
    memory_reader: Optional[MemoryReader] = None
    automations_reader: Optional[AutomationsReader] = None
    # The questions the caller has asked George to keep asking. A write, bound
    # to the owner here like every other one. Deliberately NOT injected into a
    # scheduled ask (app/services/standing_runner.py): a question that can
    # reschedule itself is a thing that gets away from you.
    standing_writer: Optional[StandingQuestionWriter] = None


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
# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def _page_bounds() -> dict:
    """The bounds the prompt states and these tools enforce, from the definitions."""
    from tools._common import load_defs, req   # local: agent/ imports tools/ lazily here

    defs = load_defs()
    return {
        "max_analyses": int(req(defs, "pages.workshop.max_analyses_per_build")),
        "max_operations": int(req(defs, "pages.workshop.max_operations_per_edit")),
        "max_adds": int(req(defs, "pages.workshop.max_adds_per_edit")),
    }


# The closed set of things edit_page can do. Mirrored by the service
# (app/services/page_operations.EDIT_OPERATIONS) and held equal by a test.
PAGE_EDIT_OPERATIONS = (
    "rename", "set_purpose", "add", "add_existing", "remove", "move_to_page", "place",
)


def _refuse_unrun(calls: list[dict], ctx: WriteContext, what: str) -> None:
    missing = _unrun(calls, ctx.executed)
    if missing:
        listed = "; ".join(
            f"{c['tool']}({json.dumps(c['arguments'], sort_keys=True, default=str)})"
            for c in missing
        )
        ran = ", ".join(sorted({c["tool"] for c in ctx.executed.values()})) or "none"
        raise PageRefused(
            f"{what} uses {listed}, which you have not run in this conversation, "
            f"so it cannot be saved — an analysis on a page must be a call whose "
            f"result the user has actually seen. Run it now, read the result, then "
            f"save it. Tools run so far: {ran}."
        )


def _normalize_analyses(analyses: Any, ctx: WriteContext, max_analyses: int) -> list[dict]:
    if analyses is None:
        return []
    if not isinstance(analyses, list):
        raise PageRefused("analyses must be a list.")
    if len(analyses) > max_analyses:
        raise PageRefused(
            f"A page is built from at most {max_analyses} analyses at once; "
            f"{len(analyses)} were given. Create it with the most useful few and add "
            f"the rest when the user asks."
        )
    out = []
    seen_calls: set[str] = set()
    for i, entry in enumerate(analyses):
        if not isinstance(entry, dict):
            raise PageRefused(f"analyses[{i}] must be an object.")
        if entry.get("pin_id") is not None:
            if entry.get("tool_calls"):
                raise PageRefused(f"analyses[{i}]: give pin_id OR tool_calls, not both.")
            out.append({"pin_id": str(entry["pin_id"])})
            continue
        if entry.get("tool_calls") is None:
            raise PageRefused(
                f"analyses[{i}] must carry tool_calls (calls you ran) or pin_id "
                f"(an existing analysis of the user's)."
            )
        try:
            calls = _normalize_calls(entry["tool_calls"])
        except PinRefused as exc:
            raise PageRefused(f"analyses[{i}]: {exc}") from exc
        title = entry.get("title")
        if not isinstance(title, str) or not title.strip():
            raise PageRefused(f"analyses[{i}] needs a title.")
        _refuse_unrun(calls, ctx, f"analyses[{i}] ({title.strip()!r})")
        for call in calls:
            key = call_key(call["tool"], call["arguments"])
            if key in seen_calls:
                raise PageRefused("A Page build cannot add the same read twice.")
            seen_calls.add(key)
        out.append({"title": title.strip(), "tool_calls": calls})
    return out


def _page_result(stored: dict, wrote: str) -> dict:
    page = stored.get("page") or {}
    return {
        "rows": [{
            "page_id": page.get("page_id"),
            "title": page.get("title"),
            "purpose": page.get("purpose"),
            "updated_at": page.get("updated_at"),
            "analysis_count": page.get("analysis_count"),
            "analyses": [
                {"pin_id": a.get("pin_id"), "title": a.get("title"),
                 "position": a.get("position"), "tools": a.get("tools")}
                for a in (page.get("analyses") or [])
            ],
            "operations": stored.get("operations") or [],
        }],
        # Architecture rule 2 has no exception for writes. What was written,
        # scoped to whom, and when.
        "meta": {
            "source_table": "george.pages",
            "filters_applied": [f"owner = {stored.get('owner')}"],
            "snapshot_timestamp": page.get("updated_at")
            or datetime.now(timezone.utc).isoformat(),
            "row_count": 1,
            "page_id": page.get("page_id"),
            "wrote": wrote,
        },
    }


async def create_page(
    title: str,
    analyses: Optional[list[dict]] = None,
    purpose: Optional[str] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Create a page: a named, ordered workspace of saved analyses the user can
    open, and that you can read later with view_page. A page may start empty.
    Each analysis you add is stored as its CALLS, never its numbers, so it
    re-runs every time the page opens. The page is created with all of its
    analyses in one transaction, or not at all.

    Args:
        title: The page's name, e.g. "Rockwell Weekly". At most 100 characters;
            a name the user already uses is refused.
        analyses: At most 6, in the order the page should read, each ONE of:
            {"title": ..., "tool_calls": [{"tool": ..., "arguments": {...}}]}
            — a new analysis from calls you have already run, successfully,
            in this conversation (a call you have not run is refused; run it,
            read it, then save it); or {"pin_id": ...} — an analysis the user
            already has, which moves onto the new page. Prefer three or four
            that answer the page's purpose; the user can add more. Never one
            per store or per product.
        purpose: One line the user would recognise as what the page is for,
            e.g. "Monitor Rockwell sales performance." Optional.

    Returns:
        {rows, meta} like every other tool. rows holds one row describing the
        page that now exists — its page_id, title, and each analysis with its
        pin_id and position; meta.source_table is george.pages.
    """
    if ctx.page_writer is None:
        raise PageRefused(
            "Pages cannot be created in this session — it requires a signed-in "
            "user. Tell the user that."
        )
    if not isinstance(title, str) or not title.strip():
        raise PageRefused("A page needs a title.")
    bounds = _page_bounds()
    normalized = _normalize_analyses(analyses, ctx, bounds["max_analyses"])
    if purpose is not None and not isinstance(purpose, str):
        raise PageRefused("purpose must be text.")

    stored = await ctx.page_writer.create(PageBuildSpec(
        title=title.strip(), purpose=(purpose or None), analyses=normalized,
        question=ctx.question, conversation_id=ctx.conversation_id,
    ))
    return _page_result(stored, "page")


async def edit_page(
    operations: list[dict],
    page_id: Optional[str] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Change one of the user's pages: rename it, set its purpose, add analyses,
    take one off, move one to another page, or reorder. All the operations in
    one call are applied together, in order, or none of them are. Nothing is
    re-run; a page's analyses keep their calls.

    Args:
        operations: At most 10, each {"op": ..., ...} with op one of:
            rename {title};  set_purpose {purpose} (null clears it);
            add {title, tool_calls} — a new analysis from calls you have run
            in this conversation, at the bottom (at most 6 adds per call);
            add_existing {pin_id | title, place?} — an analysis the user
            already has, from Ungrouped or another page;
            remove {pin_id | title} — off this page and KEPT in Ungrouped;
            nothing is deleted;
            move_to_page {pin_id | title, page_id: UUID | null}
            — to another of the user's pages, or to Ungrouped;
            place {pin_id | title, place} where place is exactly one of
            {"before": pin_id}, {"after": pin_id}, {"at": "top"},
            {"at": "bottom"}.
            Name an analysis by pin_id (from view_page or an earlier result);
            a title is accepted when exactly one analysis has it, and a title
            two analyses share is refused with both ids — never guess between
            them.
        page_id: Which page. Omit it for the page the user is asking from; give
            a page_id (from view_page, create_page or an earlier result) for
            another of their pages. A title is not a page_id.

    Returns:
        {rows, meta} like every other tool. rows holds one row describing the
        page as it now stands and the operations applied; meta.source_table is
        george.pages.
    """
    if ctx.page_writer is None:
        raise PageRefused(
            "Pages cannot be edited in this session — it requires a signed-in "
            "user. Tell the user that."
        )
    if not isinstance(operations, list) or not operations:
        raise PageRefused("operations must be a non-empty list of {op, ...}.")
    bounds = _page_bounds()
    if len(operations) > bounds["max_operations"]:
        raise PageRefused(
            f"One edit may carry at most {bounds['max_operations']} operations; "
            f"{len(operations)} were given. Do the most important ones first."
        )
    if page_id is not None and (not isinstance(page_id, str) or not page_id.strip()):
        raise PageRefused("page_id must be a page id, or omitted for the page in scope.")

    adds = 0
    cleaned: list[dict] = []
    for i, op in enumerate(operations):
        if not isinstance(op, dict) or not isinstance(op.get("op"), str):
            raise PageRefused(f"operations[{i}] must be an object with an 'op'.")
        kind = op["op"]
        if "page_title" in op:
            raise PageRefused("Resolve the destination from owned Page references and supply page_id.")
        if kind not in PAGE_EDIT_OPERATIONS:
            raise PageRefused(
                f"operations[{i}]: unknown op {kind!r}. One of: "
                f"{', '.join(PAGE_EDIT_OPERATIONS)}."
            )
        entry = dict(op)
        if kind in ("add", "add_existing"):
            adds += 1
            if adds > bounds["max_adds"]:
                raise PageRefused(
                    f"One edit may add at most {bounds['max_adds']} analyses."
                )
        if kind == "add":
            try:
                calls = _normalize_calls(op.get("tool_calls"))
            except PinRefused as exc:
                raise PageRefused(f"operations[{i}]: {exc}") from exc
            title = op.get("title")
            if not isinstance(title, str) or not title.strip():
                raise PageRefused(f"operations[{i}] (add) needs a title.")
            _refuse_unrun(calls, ctx, f"operations[{i}] ({title.strip()!r})")
            entry["tool_calls"] = calls
            entry["title"] = title.strip()
        cleaned.append(entry)

    stored = await ctx.page_writer.edit(PageEditSpec(
        page_id=page_id.strip() if page_id else None, operations=cleaned,
        question=ctx.question, conversation_id=ctx.conversation_id,
    ))
    return _page_result(stored, "page_edit")


async def record_belief(beliefs: list[dict], *, ctx: WriteContext) -> dict:
    """
    Record what you now believe about the business, so you still know it tomorrow.

    A belief is one view about one thing, kept between conversations. Record one
    when a read has settled what you think — not for every figure you read.
    Re-recording a view you already hold simply confirms it, which is how "held
    since Friday" stays true.

    Args:
        beliefs: The views to keep, as a list of objects:
            subject_kind — one of store, warehouse, supplier, product, category,
                estate.
            subject — the thing itself, by the name a person uses: "Rockwell",
                "AJI BARN", "Seikyo SEK001".
            stance — needs_attention, unremarkable, unexplained, not_visible or
                waiting.
            claim — what you think, in ONE sentence and with NO FIGURE in it. A
                stored number is wrong a week later and tells nobody; say what
                the figures MEAN. "Rockwell is losing customers rather than
                smaller baskets", not "Rockwell is down nine percent".
            evidence — the calls this rests on, as
                [{"tool": ..., "arguments": {...}}]. Only calls you have already
                run in this conversation; a view has to rest on something that
                actually happened. A read that found nothing counts.
            supersedes — the id of a belief this replaces, from the block of
                current beliefs attached to the question. Include it when a read
                has changed your mind.
            why — required when superseding: what this read established that the
                old view did not account for.

    Returns:
        {rows, meta} like every other tool. Each row says what happened to one
        belief: new, confirmed, revised or refused.
    """
    if ctx.belief_store is None:
        raise PinRefused(
            "George cannot keep beliefs in this session — it requires a signed-in "
            "user. Say what you think in the answer; it will not be remembered."
        )
    from tools._common import load_defs   # local: agent/ imports tools/ lazily here
    defs = load_defs()

    def is_executed(call: dict) -> bool:
        return call_key(call["tool"], call["arguments"]) in ctx.executed

    return await _record_beliefs(beliefs, defs=defs, is_executed=is_executed,
                                 store=ctx.belief_store)


async def _record_beliefs(beliefs, *, defs, is_executed, store) -> dict:
    """The async half of agent/beliefs.record — validation is pure, storing is not."""
    from agent import beliefs as belief_rules
    accepted, rejected = belief_rules.validate(beliefs, defs, is_executed=is_executed)
    stored = await store.record(accepted) if accepted else []
    return {
        "rows": stored,
        "meta": {
            "held": len([r for r in stored if r.get("outcome") != "refused"]),
            "rejected": rejected,
            "stances": list(belief_rules.stances_for(defs)),
            "note": (
                "What George now believes about these things, kept until a later "
                "read changes it. Nothing was read. A rejected belief is not held "
                "and the answer must not describe it as though it were."
            ),
        },
    }


# The name sorts after every other injected tool except view_page, which is
# the only CONDITIONAL one — so the cached prefix property holds: a session
# with a page in scope keeps a tools list that is an exact prefix of one
# without. See build_tool_schemas.
STANDING_TOOL = "set_standing_question"

# Everything a person can say about a question they have George keep asking.
# Each is one sentence in conversation and one line in the service; there is
# no field on any of them for a threshold, a metric or a window.
STANDING_ACTIONS = (
    "create",
    "reschedule",
    "add_instruction",
    "remove_instruction",
    "rewrite",
    "switch_on",
    "switch_off",
    "remove",
)


async def set_standing_question(
    action: str,
    question: Optional[str] = None,
    hour: Optional[int] = None,
    minute: Optional[int] = None,
    days: Optional[list[int]] = None,
    instruction: Optional[str] = None,
    which: Optional[str] = None,
    *,
    ctx: WriteContext,
) -> dict:
    """
    Keep a question and ask it on a schedule, or change one you already keep.

    This is how a person gets a morning briefing: they do not get a briefing,
    they get an ANSWER TO A QUESTION they asked you to keep asking. "How are we
    doing?" every day at 06:00 is a standing question; so is "anything out of
    stock at Rockwell?" every Monday. When the slot comes round you are asked
    it exactly as if they had typed it, you read and compose the answer
    yourself, and it is waiting for them when they open the room.

    Use it when someone says they want something regularly — "brief me every
    morning", "make it 9am instead of 8", "show more of Rockwell in that",
    "stop sending me that one". Do not use it for a one-off question; just
    answer that.

    A NEW QUESTION IS CREATED SWITCHED OFF, and you must say so. They turn it
    on, which is one more sentence and the sentence that matters — nothing
    starts running unattended because a conversation drifted that way.

    WHAT CANNOT BE STORED HERE. A time, days of the week, and sentences. There
    is no argument for a threshold, a metric, a window or a store list, so
    "alert me when Rockwell drops 10% instead of 30%" cannot be saved: say that
    the comparison is a definition, not a setting, and name the one that
    exists. An instruction steers ATTENTION — what to show more of, what to
    leave out — and never what a number means.

    Args:
        action: What to do.
            create — keep a new question. Needs `question` and `hour`.
            reschedule — move it. Needs `hour`; `days` makes it weekly.
            add_instruction / remove_instruction — one standing instruction,
                in their words, at most 200 characters.
            rewrite — change what is asked; the schedule and instructions stay.
            switch_on / switch_off — start or stop asking it.
            remove — forget the question. Answers it already gave are posts and
                are not touched.
        question: What to ask, in their words, on one line. For create and
            rewrite.
        hour: The hour, 0–23, Manila time.
        minute: The minute, 0–59. Defaults to 0.
        days: Weekdays for a weekly question, 0=Monday … 6=Sunday. Leave it out
            for every day.
        instruction: One standing instruction, for add_instruction and
            remove_instruction. Removing matches on the text.
        which: The id of the question, from a read that returned it
            (view_automations lists them). Leave it out when there is only one
            — naming an id they never said is worse than asking.

    Returns:
        {rows, meta} like every other tool. The row is the question as it now
        stands — what is asked, when, its instructions and whether it is on.

        THIS IS A WRITE, so nothing may be composed over it — an object is
        drawn over a read so that a figure always has receipts. To put the
        question on the board, read it back with view_automations, which lists
        every standing question with its schedule, and compose over that.
    """
    if ctx.standing_writer is None:
        raise StandingRefused(
            "George cannot keep standing questions in this session. Answer the "
            "question now; it will not be asked again on its own."
        )
    if action not in STANDING_ACTIONS:
        raise StandingRefused(
            f"{action!r} is not something that can be done to a standing "
            f"question. It is one of: {', '.join(STANDING_ACTIONS)}."
        )

    fields = {
        "question": question,
        "hour": hour,
        "minute": minute,
        "days": days,
        "instruction": instruction,
        "which": which,
    }
    return await ctx.standing_writer.apply(action, fields)


WRITE_TOOL_FUNCTIONS = {
    "pin_answer": pin_answer,
    "save_workflow": save_workflow,
    "create_page": create_page,
    "edit_page": edit_page,
    "record_belief": record_belief,
    STANDING_TOOL: set_standing_question,
}

# The two page tools, by name, for the loop's frame and claim check.
PAGE_WRITE_TOOLS = ("create_page", "edit_page")

# Which injected capability each write tool needs. The loop reads this to decide
# what to put in the schema: a session with a pin writer and no workflow writer
# is offered pin_answer and not save_workflow, rather than being offered a tool
# that would refuse every call.
WRITE_TOOL_REQUIRES = {
    "pin_answer": "writer",
    "save_workflow": "workflow_writer",
    "create_page": "page_writer",
    "edit_page": "page_writer",
    "record_belief": "belief_store",
    STANDING_TOOL: "standing_writer",
}
