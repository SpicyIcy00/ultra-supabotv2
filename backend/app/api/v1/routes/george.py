"""
George — SSE endpoint.

Thin transport over agent.loop.run(). No business logic here: the loop owns the
agent behaviour and the tools own the numbers. This module's only jobs are to
accept a question, stream the loop's frames, never let an exception escape as a
half-written stream — and hand the loop the one capability it cannot give
itself.

Deliberately separate from routes/chatbot.py, which serves the older NL->SQL
system. The two do not share code paths (CLAUDE.md: do not extend the freehand
SQL generator when building George).

THE INJECTIONS — GEORGE'S ONLY ROUTES OUT OF THE READ SURFACE
George can pin an answer, save a workflow, and run a saved one. The first two
are writes and the third reads a schema george_ro cannot see, so none of the
three is something the agent loop can do on its own. Neither of George's
database identities can perform them: george_ro is read-only, and george_log has
INSERT without SELECT so it cannot read a pin count, a page list, or the row it
just wrote. Rather than granting either of them more, this module builds each
capability around the AUTHENTICATED user and the application's own session and
passes it into the loop. Consequences worth keeping:

  - The identity is the token's. `created_by` is user.username, and the ROLE
    that decides who may edit or promote is user.role — both taken here.
    Nothing in the request body or in the model's output can influence either.
  - Each goes through the same service function the HTTP routes call —
    pin_writer.create_pin, workflow_writer.save_workflow,
    workflow_writer.run_named_workflow — so the buttons and the conversation
    share every guarantee, including validation against the live tool surface.
  - Its own session, committed immediately. This route streams for as long as an
    answer takes; a pin written at second 20 must not depend on a stream that
    dies at second 40, or on that stream's transaction.
  - No injection, no tool. Per capability, not per session: a caller with a pin
    writer and no workflow writer is offered pin_answer and not save_workflow.
    Anything else that runs the loop without any of them gets the read tools and
    nothing more.

SAVING IS NOT SCHEDULING. A schedule George accepts in conversation is created
switched OFF and fires nothing until an administrator has backtested and
promoted the version. That is enforced in workflow_writer, not asked for in the
prompt, so "set that up for every Monday" cannot become unattended execution of
logic nobody approved.
"""

from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path
from typing import Any, AsyncIterator, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services.chat_history import build_turns, title_of
from app.services.pin_writer import (
    PinQuotaError,
    SimilarPageError,
    create_pin,
)
from app.services.pin_runner import PinValidationError
from app.services.workflow_runner import (
    WorkflowValidationError,
    default_calls as workflow_default_calls,
)
from app.services.workflow_writer import (
    NotAllowed,
    PromotionRefused,
    WorkflowNameTaken,
    WorkflowNotFound,
    WorkflowQuotaError,
    create_schedule,
    run_named_workflow,
    save_workflow as save_workflow_row,
)

# agent/ and tools/ live at the repo root, one level above backend/.
_ROOT = Path(__file__).resolve().parents[5]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from agent import loop as george_loop  # noqa: E402
from tools._common import load_defs as _load_defs, req as _req  # noqa: E402
from agent import write_tools  # noqa: E402
from agent.write_tools import (  # noqa: E402
    PinRefused,
    PinSpec,
    PinWriter,
    WorkflowRefused,
    WorkflowSpec,
)

# The prefix is supplied by main.py, matching every other router in this app.
router = APIRouter(tags=["george"])

# The same gate the pins routes use. George reads the business data and can now
# write a pin on the caller's behalf; both belong behind George's page.
_george_user = require_page("george")


class HistoryCall(BaseModel):
    tool: str = Field(..., min_length=1, max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)


class HistoryTurn(BaseModel):
    """One earlier turn, replayed by the client."""

    role: Literal["user", "george"]
    text: str = Field("", max_length=20000)
    # The calls behind an earlier answer, which the client has already shown the
    # user. Send only calls that SUCCEEDED — a call that refused has no result
    # anyone saw, and must not become pinnable.
    tool_calls: List[HistoryCall] = Field(default_factory=list, max_length=20)


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    # The page the user is asking from, e.g. "replenishment". George is present
    # wherever the user already is and receives that page as context.
    #
    # This used to be sent in a field called `user_id`, which meant
    # george.conversations.user_id held the page name and no record of who
    # asked. Who asked now comes from the token, below, and cannot be set by a
    # caller at all.
    page_context: Optional[str] = Field(None, max_length=100)
    # The conversation so far. The loop is stateless per request, so without
    # this every question stands alone and "pin that" has nothing to refer to.
    history: List[HistoryTurn] = Field(default_factory=list, max_length=20)
    # The chat this question continues. Omit to start a new one; the `start`
    # frame hands back the id to send on the next turn. Checked against the
    # caller before the stream opens — a chat is one person's, like a pin.
    thread_id: Optional[uuid.UUID] = None


# ---------------------------------------------------------------------------
# Chats — sessions, listed and reopened
#
# A chat is the thread of turns in george.conversations that share a thread_id.
# It is NOT a page: a page is a collection of pins, and "Ungrouped" holds pins
# with no page and nothing else. These routes read the log through the
# application role, because george_log is INSERT-only and george_ro is kept
# out of the schema (agent/sql/george_log_role.sql).
# ---------------------------------------------------------------------------

class ChatSummary(BaseModel):
    thread_id: uuid.UUID
    title: str
    first_asked_at: str
    last_asked_at: str
    turns: int


class ChatToolResult(BaseModel):
    row_count: Optional[int]
    source_table: Optional[str]
    truncated: bool
    duration_ms: int
    error: Optional[str]


class ChatToolCall(BaseModel):
    seq: int
    tool: str
    arguments: dict[str, Any]
    result: ChatToolResult


class ChatNotice(BaseModel):
    kind: str
    message: str
    source: Optional[str] = None


class ChatPinned(BaseModel):
    pin_id: str
    title: str
    page: Optional[str]
    pins_on_page: int
    tool_calls: List[dict[str, Any]]


class ChatDone(BaseModel):
    conversation_id: str
    thread_id: str
    iterations: int
    tool_calls: int
    status: str
    notice_forced: bool
    usage: dict[str, int]
    cache_hit: bool


class ChatTurn(BaseModel):
    """
    One turn, in the shape useGeorgeStream builds from a live stream — so a
    reopened chat renders through the same component as a live one.
    """

    role: Literal["user", "george"]
    text: str
    at: Optional[str]
    # george-only; absent on a user turn.
    thinking: Optional[str] = None
    tool_calls: Optional[List[ChatToolCall]] = None
    notices: Optional[List[ChatNotice]] = None
    pinned: Optional[List[ChatPinned]] = None
    receipts: Optional[dict[str, Any]] = None
    done: Optional[ChatDone] = None
    error: Optional[str] = None


class ChatDetail(BaseModel):
    thread_id: uuid.UUID
    title: str
    turns: List[ChatTurn]


# thread_id is nullable in the table for rows that predate the column; every
# such row was backfilled to its own id, and COALESCE keeps that true even if
# the backfill is ever skipped.
_THREAD = "COALESCE(c.thread_id, c.id)"


async def _thread_belongs_to(username: str, thread_id: uuid.UUID) -> bool:
    """One SELECT, before the stream opens: the loop itself cannot read."""
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                text(
                    f"SELECT 1 FROM george.conversations c "
                    f"WHERE {_THREAD} = :t AND c.user_id = :u LIMIT 1"
                ),
                {"t": thread_id, "u": username},
            )
        ).first()
        return row is not None


@router.get("/chats", response_model=List[ChatSummary])
async def list_chats(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_george_user),
) -> List[ChatSummary]:
    """
    The caller's chats, most recently active first.

    A chat is named by its first question and dated by its last turn. Both are
    derived here rather than stored, so the log role stays INSERT-only.
    """
    rows = (
        await db.execute(
            text(
                f"SELECT {_THREAD} AS thread_id, "
                f"       MIN(c.asked_at) AS first_asked_at, "
                f"       MAX(c.asked_at) AS last_asked_at, "
                f"       COUNT(*) AS turns, "
                f"       (array_agg(c.question ORDER BY c.asked_at))[1] AS first_question "
                f"FROM george.conversations c "
                f"WHERE c.user_id = :u "
                f"GROUP BY 1 "
                f"ORDER BY last_asked_at DESC "
                f"LIMIT :limit"
            ),
            {"u": user.username, "limit": limit},
        )
    ).mappings().all()
    return [
        ChatSummary(
            thread_id=r["thread_id"],
            title=title_of(r["first_question"]),
            first_asked_at=r["first_asked_at"].isoformat(),
            last_asked_at=r["last_asked_at"].isoformat(),
            turns=int(r["turns"]),
        )
        for r in rows
    ]


@router.get("/chats/{thread_id}", response_model=ChatDetail)
async def get_chat(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_george_user),
) -> ChatDetail:
    """
    One chat, as turns the conversation column renders directly.

    Tool calls are joined by conversation id and ordered by seq; pins made in
    the chat are joined the same way. A chat belonging to someone else is a
    404, not a 403 — the same convention as pins.
    """
    rows = (
        await db.execute(
            text(
                f"SELECT c.id, {_THREAD} AS thread_id, c.asked_at, c.logged_at, "
                f"       c.question, c.final_answer, c.iterations, c.input_tokens, "
                f"       c.output_tokens, c.cache_read_tokens, c.notices, "
                f"       c.notice_forced, c.status, c.receipts "
                f"FROM george.conversations c "
                f"WHERE {_THREAD} = :t AND c.user_id = :u "
                f"ORDER BY c.asked_at"
            ),
            {"t": thread_id, "u": user.username},
        )
    ).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No chat with that id belongs to you.")

    ids = [r["id"] for r in rows]

    calls = (
        await db.execute(
            text(
                "SELECT conversation_id, seq, tool, arguments, row_count, truncated, "
                "       source_table, duration_ms, error "
                "FROM george.tool_calls "
                "WHERE conversation_id = ANY(:ids) "
                "ORDER BY conversation_id, seq"
            ),
            {"ids": ids},
        )
    ).mappings().all()
    calls_by: dict[str, list] = {}
    for c in calls:
        calls_by.setdefault(str(c["conversation_id"]), []).append(c)

    pins = (
        await db.execute(
            text(
                "SELECT id, title, page, conversation_id, tool_calls "
                "FROM george.pins "
                "WHERE created_by = :u AND conversation_id = ANY(:ids) "
                "ORDER BY created_at"
            ),
            {"u": user.username, "ids": ids},
        )
    ).mappings().all()
    pins_by: dict[str, list] = {}
    for p in pins:
        pins_by.setdefault(str(p["conversation_id"]), []).append(p)

    pins_per_page: dict[Optional[str], int] = {}
    if pins:
        counts = (
            await db.execute(
                text(
                    "SELECT page, COUNT(*) AS n FROM george.pins "
                    "WHERE created_by = :u GROUP BY page"
                ),
                {"u": user.username},
            )
        ).mappings().all()
        pins_per_page = {r["page"]: int(r["n"]) for r in counts}

    # The reason a turn ended without an answer, where the loop recorded one.
    gaps = (
        await db.execute(
            text(
                "SELECT DISTINCT ON (conversation_id) conversation_id, detail "
                "FROM george.gaps "
                "WHERE conversation_id = ANY(:ids) AND kind IN ('api_error', 'unhandled') "
                "ORDER BY conversation_id, at DESC"
            ),
            {"ids": ids},
        )
    ).mappings().all()
    errors_by = {str(g["conversation_id"]): g["detail"] for g in gaps if g["detail"]}

    turns = build_turns(rows, calls_by, pins_by, pins_per_page, errors_by)
    return ChatDetail(
        thread_id=rows[0]["thread_id"],
        title=title_of(rows[0]["question"]),
        turns=[ChatTurn.model_validate(t) for t in turns],
    )


def _pin_writer(username: str) -> PinWriter:
    """
    Build the writer for one caller. The username is captured HERE, from the
    verified token, so no later argument can change whose pin this becomes.
    """

    async def write(spec: PinSpec) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                created = await create_pin(
                    session,
                    username=username,
                    tool_calls=spec.tool_calls,
                    title=spec.title,
                    question=spec.question,
                    conversation_id=(
                        uuid.UUID(spec.conversation_id) if spec.conversation_id else None
                    ),
                    page=spec.page,
                    allow_similar_page=spec.allow_similar_page,
                )
                await session.commit()
            except (PinValidationError, PinQuotaError, SimilarPageError) as exc:
                # Expected refusals, in the words the button already uses. They
                # reach the model as a tool refusal — a real answer with a route
                # out — rather than as a failure of the whole turn.
                await session.rollback()
                raise PinRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                # A fault, not a refusal, and it must not cost the user the
                # answer they already have. RuntimeError so the loop reports it
                # to the model as a failed tool call and the turn continues.
                await session.rollback()
                raise RuntimeError(
                    f"The pin could not be saved: {type(exc).__name__}. The answer "
                    f"above is unaffected; tell the user the pin did not save."
                ) from exc

            row = created.row
            return {
                "pin_id": str(row.id),
                "title": row.title,
                "page": row.page,
                "created_by": username,
                "created_at": row.created_at.isoformat(),
                "pins_on_page": created.pins_on_page,
            }

    return write


# The refusals a caller is expected to hit, as opposed to a fault. Listed once
# so the writer and the runner below cannot disagree about which is which.
_WORKFLOW_REFUSALS = (
    WorkflowValidationError,
    WorkflowNameTaken,
    WorkflowNotFound,
    WorkflowQuotaError,
    NotAllowed,
    PromotionRefused,
)


class _WorkflowWriter:
    """
    George's route to saving a workflow, bound to one authenticated caller.

    An object rather than a closure because save_workflow needs two things: the
    write itself, and the DEFAULTED form of each step, which is what the
    provenance rule is checked against. That substitution is the same code that
    runs workflows, so it is called here rather than reimplemented in agent/.

    The username and role are captured HERE, from the verified token, so nothing
    the model emits can change whose workflow this becomes or what they are
    allowed to do with it.
    """

    def __init__(self, username: str, role: str) -> None:
        self._username = username
        self._role = role

    def default_calls(self, steps: list[dict], parameters: list[dict]) -> list[dict]:
        try:
            return workflow_default_calls(steps, parameters)
        except _WORKFLOW_REFUSALS as exc:
            raise WorkflowRefused(str(exc)) from exc

    async def save(self, spec: WorkflowSpec) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                saved = await save_workflow_row(
                    session,
                    username=self._username,
                    role=self._role,
                    name=spec.name,
                    steps=spec.steps,
                    parameters=spec.parameters,
                    intent=spec.intent,
                    change_note=spec.change_note,
                    conversation_id=(
                        uuid.UUID(spec.conversation_id) if spec.conversation_id else None
                    ),
                )

                described: Optional[dict] = None
                if spec.schedule:
                    # Created SWITCHED OFF, always: create_schedule only enables
                    # a promoted version, and a version saved a moment ago has
                    # not been backtested. Accepting "every Monday at 6" in
                    # conversation must never become unattended execution of
                    # logic nobody has approved.
                    schedule = await create_schedule(
                        session,
                        username=self._username,
                        role=self._role,
                        workflow=saved.workflow,
                        version=saved.version,
                        kind=spec.schedule.get("kind", "weekly"),
                        hour=int(spec.schedule.get("hour", 6)),
                        minute=int(spec.schedule.get("minute", 0)),
                        days_of_week=spec.schedule.get("days_of_week") or [],
                        day_of_month=spec.schedule.get("day_of_month"),
                        bindings=spec.schedule.get("bindings") or {},
                        telegram_chat_ids=spec.schedule.get("telegram_chat_ids") or [],
                        enabled=False,
                    )
                    described = {
                        "id": str(schedule.id),
                        "kind": schedule.kind,
                        "hour": schedule.hour,
                        "minute": schedule.minute,
                        "days_of_week": schedule.days_of_week,
                        "day_of_month": schedule.day_of_month,
                        "enabled": schedule.enabled,
                    }

                await session.commit()
            except _WORKFLOW_REFUSALS as exc:
                # Expected refusals, in the words the API already uses. They
                # reach the model as a tool refusal — a real answer with a route
                # out — rather than as a failure of the whole turn.
                await session.rollback()
                raise WorkflowRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                await session.rollback()
                raise RuntimeError(
                    f"The workflow could not be saved: {type(exc).__name__}. The "
                    f"answer above is unaffected; tell the user it did not save."
                ) from exc

            return {
                "workflow_id": str(saved.workflow.id),
                "name": saved.workflow.name,
                "version": saved.version.version,
                "created_by": self._username,
                "created_at": saved.version.created_at.isoformat(),
                "schedule": described,
                # Always true for a version just written: promotion is a separate
                # act by an administrator, against a backtest.
                "awaiting_promotion": saved.version.promoted_at is None,
                "queue_name": _req(_load_defs(), "workflows.promotion.queue_name"),
            }

def _workflow_runner(username: str, role: str):
    """
    George's route to RUNNING a saved workflow, including backtesting one.

    A read, but injected exactly like a writer: the workflows live in the
    `george` schema, which george_ro cannot see. Its own session, committed
    immediately, because a run RECORDS itself and that record must survive the
    SSE stream dying later — the same reasoning as the pin writer.
    """

    async def run(name: str, bindings: Optional[dict],
                  as_of: Optional[str]) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                outcome = await run_named_workflow(
                    session,
                    username=username,
                    role=role,
                    name=name,
                    bindings=bindings,
                    as_of=as_of,
                )
                await session.commit()
                return outcome
            except _WORKFLOW_REFUSALS:
                # Already a ValueError, and its message names what exists and
                # what to do. It reaches the model unchanged.
                await session.rollback()
                raise
            except SQLAlchemyError as exc:
                await session.rollback()
                raise RuntimeError(
                    f"The workflow ran but its record could not be saved: "
                    f"{type(exc).__name__}."
                ) from exc

    return run


async def _safe_stream(question: str, user_id: Optional[str],
                       page_context: Optional[str],
                       pin_writer: PinWriter,
                       history: list[dict],
                       workflow_writer,
                       workflow_runner,
                       thread_id: Optional[str] = None) -> AsyncIterator[str]:
    """
    Wrap the loop so a crash still closes the stream cleanly.

    Once the response has started, an exception cannot become an HTTP error —
    the client has already had a 200. It has to arrive as an SSE `error` frame,
    or the frontend hangs waiting for `done`.
    """
    try:
        async for frame in george_loop.run(
            question,
            user_id=user_id,
            page_context=page_context,
            pin_writer=pin_writer,
            history=history,
            workflow_writer=workflow_writer,
            workflow_runner=workflow_runner,
            thread_id=thread_id,
        ):
            yield frame
    except Exception as exc:  # noqa: BLE001
        payload = json.dumps({"message": f"{type(exc).__name__}: {exc}"})
        yield f"event: error\ndata: {payload}\n\n"
        yield f"event: done\ndata: {json.dumps({'status': 'error'})}\n\n"


@router.post("/ask")
async def ask(
    request: AskRequest,
    user: AppUser = Depends(_george_user),
) -> StreamingResponse:
    """
    Ask George a question. Streams Server-Sent Events.

    Frames, in the order a client will normally see them:
        start        conversation_id, whether logging is active
        thinking     summarized reasoning deltas
        tool_call    {seq, tool, arguments}
        tool_result  {seq, tool, row_count, source_table, truncated, duration_ms}
        notice       {kind, message}   — a caveat the answer must carry
        pinned       {pin_id, title, page, pins_on_page, tool_calls}
        text         answer deltas
        answer_reset {reason} — discard the deltas so far; the answer is being
                     rewritten. A client that ignores this shows the answer twice.
        warning      {reason}          — unsurfaced_notice | notice_forced | logging_failed
        error        {message}
        done         {conversation_id, iterations, tool_calls, status, usage}

    tool_result carries a SUMMARY, never the rows. A single call can return 200
    wide rows; streaming those would dwarf the answer and duplicate data the
    model has already read.

    Authenticated, behind George's own page — the same gate as /george/pins.
    That is what lets an answer be pinned from the conversation: the pin is
    written as the caller, and there is no anonymous route to a write.

    The loop holds no conversation state between requests, so a follow-up like
    "pin that" only has a referent if the client replays the turns before it in
    `history`. Send it, or every question stands alone.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    # Continuing a chat: it has to be the caller's. Checked HERE, before any
    # frame is sent, because once the stream has started a refusal can only
    # arrive as an error frame — and because the loop's own role cannot read.
    if request.thread_id is not None and not await _thread_belongs_to(
        user.username, request.thread_id
    ):
        raise HTTPException(status_code=404, detail="No chat with that id belongs to you.")

    return StreamingResponse(
        _safe_stream(
            request.question,
            user_id=user.username,
            page_context=request.page_context,
            pin_writer=_pin_writer(user.username),
            history=[t.model_dump() for t in request.history],
            workflow_writer=_WorkflowWriter(user.username, user.role),
            workflow_runner=_workflow_runner(user.username, user.role),
            thread_id=str(request.thread_id) if request.thread_id else None,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Without this, nginx buffers the whole response and the stream
            # arrives as one lump when the answer is already finished.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/tools")
async def list_tools() -> dict:
    """
    The tool schemas the loop hands the model, generated from the live
    signatures and definitions. Useful for confirming what George can actually
    do without reading the source, and for spotting a definitions change that
    silently altered the tool surface.

    The write surface is included and flagged. It is listed here because this is
    the answer to "what can George do", and a tool that writes is the part of
    that answer worth being able to see. A real session only receives it when a
    writer was injected — see the module docstring.
    """
    schemas = george_loop.build_tool_schemas(include_write=True)
    return {
        "count": len(schemas),
        "tools": [
            {
                "name": s["name"],
                "description": s["description"],
                "parameters": sorted(s["input_schema"]["properties"]),
                "required": s["input_schema"]["required"],
                "writes": s["name"] in write_tools.WRITE_TOOL_FUNCTIONS,
            }
            for s in schemas
        ],
    }
