"""
Bob — SSE endpoint.

Thin transport over agent.loop.run(). No business logic here: the loop owns the
agent behaviour and the tools own the numbers. This module's only jobs are to
accept a question, stream the loop's frames, never let an exception escape as a
half-written stream — and hand the loop the one capability it cannot give
itself.

Deliberately separate from routes/chatbot.py, which serves the older NL->SQL
system. The two do not share code paths (CLAUDE.md: do not extend the freehand
SQL generator when building Bob).

THE INJECTIONS — BOB'S ONLY ROUTES OUT OF THE READ SURFACE
Bob can pin an answer, save a workflow, and run a saved one. The first two
are writes and the third reads a schema george_ro cannot see, so none of the
three is something the agent loop can do on its own. Neither of Bob's
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

SAVING IS NOT SCHEDULING. A schedule Bob accepts in conversation is created
switched OFF and fires nothing until an administrator has backtested and
promoted the version. That is enforced in workflow_writer, not asked for in the
prompt, so "set that up for every Monday" cannot become unattended execution of
logic nobody approved.
"""

from __future__ import annotations

import asyncio
import functools
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, List, Literal, Mapping, Optional

from app.core.config import settings

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services.chat_history import build_turns, question_of, title_of
from app.services.bob_greeting import build_greeting
from app.services import belief_store as beliefs_service
from tools import objects as objects_tool
from app.services import standing_questions
from app.services import decisions as decisions_service
from app.services import watch_runner
from app.services import watches as watches_service
from app.services.watches import WatchRefused as WatchServiceRefused
from app.services.standing_questions import StandingRefused as StandingServiceRefused
from app.services import self_reader
from app.services.bob_recall import as_block, recent_figures
from app.services.river import (
    DEFAULT_LIMIT as RIVER_LIMIT,
    MAX_LIMIT as RIVER_MAX,
    build_river,
    next_cursor,
    thread_of,
)
from app.services import page_operations, page_writer
from app.services.page_writer import (
    AmbiguousTarget,
    NotAPage,
    PageNotFound as PageWriterPageNotFound,
    PageQuotaError,
    PageValidationError,
    PinNotFound as PageWriterPinNotFound,
    bob_actor,
)
from app.services.page_reader import (
    PageNotFound as PageReadNotFound,
    PageReadRefused as PageReadServiceRefused,
    read_page,
)
from app.services.pin_writer import (
    PinQuotaError,
    SimilarPageError,
    create_pin,
)
from app.services.pin_runner import PinValidationError
from app.services import mentions as mentions_service
from app.services import replay as replay_service
from app.services.thread_access import parent_in_thread, thread_continuable
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

from agent import loop as bob_loop  # noqa: E402
from tools import brief as brief_tool  # noqa: E402
from tools._common import load_defs as _load_defs, req as _req  # noqa: E402
from agent import write_tools  # noqa: E402
from agent.write_tools import (  # noqa: E402
    PageReader,
    PageReadRefused,
    PinRefused,
    PinSpec,
    PinWriter,
    WorkflowRefused,
    WorkflowSpec,
    PageBuildSpec,
    PageEditSpec,
    PageRefused,
    PageWriter,
    StandingRefused,
    WatchRefused,
)

# The prefix is supplied by main.py, matching every other router in this app.
router = APIRouter(tags=["bob"])

# The same gate the pins routes use. Bob reads the business data and can now
# write a pin on the caller's behalf; both belong behind Bob's page.
_bob_user = require_page("bob")


class HistoryCall(BaseModel):
    tool: str = Field(..., min_length=1, max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)


class HistoryTurn(BaseModel):
    """One earlier turn, replayed by the client."""

    role: Literal["user", "bob"]
    text: str = Field("", max_length=20000)
    # The calls behind an earlier answer, which the client has already shown the
    # user. Send only calls that SUCCEEDED — a call that refused has no result
    # anyone saw, and must not become pinnable.
    tool_calls: List[HistoryCall] = Field(default_factory=list, max_length=20)


class PageScope(BaseModel):
    """
    The Bob page the question is asked from, as an IDENTITY.

    `page_id` is the page's id; null is the ungrouped pins, which are a real
    scope with no row. This is what binds the injected page reader and
    writer, and it is distinct from `page_context` below on purpose: that
    field is a display string ("Pages / AJI BARN Reorder") the loop reads out
    to the model, and an identity is never parsed back out of a display
    string.

    `name` is the scope as it was sent until 2026-09-08 — the exact title —
    and is accepted for one reason: a thread reopened from before that date
    has only a title in its stored answers. When `page_id` is absent the
    title is resolved to the caller's page of exactly that name at request
    time (page_writer.find_page_by_title); a title that no longer resolves
    binds NOTHING, deliberately — the page was renamed or removed, and a
    guess would read somebody the wrong page. A title is never the write
    identity: the writer is closed over the id the resolution produced.
    """

    page_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, max_length=100)


# The desk's bounds, from the definitions, at import: the number the client is
# told is the number the route refuses past (metrics.yaml surface.desk).
_DESK = _req(_load_defs(), "surface.desk")
_DESK_MAX_SUBJECTS = int(_req(_DESK, "selection.max_subjects"))
_DESK_DIMENSIONS = tuple(str(d) for d in _req(_DESK, "selection.dimensions"))
# What the workspace may say about itself, and how much of it. Declared in
# metrics.yaml surface.desk.context, so the bound the client is held to is the
# bound the definitions state and neither side keeps its own copy.
_DESK_MAX_DRAWN = int(_req(_DESK, "context.max_drawn_subjects"))
_DESK_MAX_ATTENTION = int(_req(_DESK, "context.max_attention"))
# WHICH BUSINESS A QUESTION MAY BE SCOPED TO (P2.g). The keys the definitions
# declare and nothing else — a part the yaml does not name is refused here
# rather than reaching the loop and being dropped there in silence.
_DESK_ESTATE = tuple(str(p["key"]) for p in _req(_DESK, "estate.parts"))
# The board's bound is the board's own, from metrics.yaml composition, so the
# number the client folds to is the number the route refuses past.
_BOARD_MAX = int(_req(_load_defs(), "composition.max_objects"))


class DeskSubject(BaseModel):
    """One selected subject: the id a row carried, and the label beside it."""

    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=200)


class DeskSelection(BaseModel):
    """
    What the person has selected or focused on the workspace.

    IDS FROM ROWS, NEVER LABELS THE MODEL INFERRED. The client takes these off
    the rows the tools returned (store_id, product_id, category); the loop
    names them to Bob on the question in words and never as a figure. The
    dimension is one of the definitions' subject dimensions and nothing else.
    """

    dimension: Literal["store", "product", "category", "supplier"]
    subjects: List[DeskSubject] = Field(default_factory=list, max_length=_DESK_MAX_SUBJECTS)


class DeskWindow(BaseModel):
    """The window a replay moved the work to: a preset by name, or explicit dates."""

    kind: Literal["preset", "explicit"]
    name: Optional[str] = Field(None, max_length=40)
    start: Optional[str] = Field(None, max_length=10)
    end: Optional[str] = Field(None, max_length=10)


class DeskDrawn(BaseModel):
    """
    What is on the screen the question was asked from.

    A LAYOUT, NOT A FIGURE. The representation the composer chose, the subject
    dimension, the subjects it drew BY NAME, the metric's own display label
    and whether the figures carry a comparison. No value, no delta, no count
    of anything but subjects. Without this a question asked with nothing
    selected told Bob nothing about what the person was looking at, which
    is why "show me" and "is that actually bad?" had no referent.
    """

    representation: Optional[str] = Field(None, max_length=40)
    dimension: Optional[Literal["store", "product", "category"]] = None
    subjects: List[str] = Field(default_factory=list, max_length=_DESK_MAX_DRAWN)
    metric_label: Optional[str] = Field(None, max_length=80)
    compared: bool = False


class DeskAttention(BaseModel):
    """
    One thing the DATA singled out, as the surface composed it.

    The reason is one of two words a tool established — the subject moved
    against the direction the majority moved in, or the tool's own ranking put
    it first (surface.desk.context.attention_reasons). Nothing here is scored,
    thresholded or inferred.
    """

    subject: str = Field(..., min_length=1, max_length=200)
    reason: Literal["against_the_majority", "ranked_first"]


class DeskRecommendation(BaseModel):
    """
    The move Bob last offered, by the ground that produced it.

    Carried so a bare "what would you do?" or "yes, do that" refers to
    something, and so Bob does not offer the same move twice under two
    names. The ground is one of `initiative.recommend.grounded_in`.
    """

    ground: str = Field(..., min_length=1, max_length=40)
    question: Optional[str] = Field(None, max_length=200)


class BoardObject(BaseModel):
    """
    One object on the board as the question was asked from it.

    Names and closed vocabulary, never a figure: the key Bob gave it, the
    kind of object it is, whether it leads, what it is about, the measure it is
    in and the window it was read over. This is what lets "why?" and "products"
    mean the thing being LOOKED at rather than the last thing said.
    """

    key: str = Field(..., min_length=1, max_length=40)
    kind: str = Field(..., min_length=1, max_length=20)
    weight: Optional[str] = Field(None, max_length=12)
    about: Optional[str] = Field(None, max_length=200)
    measure: Optional[str] = Field(None, max_length=80)
    window: Optional[str] = Field(None, max_length=60)


class DeskReference(BaseModel):
    """
    Something the person NAMED with `@` that is neither a subject nor a scope.

    A rule, today, and only a rule: a store, product and supplier are subjects
    and travel in `selection`; a page binds `page_scope`. A workflow has no
    request field of its own, so it travels here as what it is — a name and an
    id Bob is told about — and running or editing it stays his tool call
    and the owner's decision (level four).
    """

    kind: str = Field(..., min_length=1, max_length=20)
    id: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=200)


class DeskContext(BaseModel):
    """
    The desk as the question was asked from it. Bounded here, named to the
    model by the loop, and kept on the question post's payload so a reload
    restores the same focus from the same record (surface.desk.selection,
    surface.desk.context).
    """

    # WHICH BUSINESS THE QUESTION IS ABOUT (P2.g) — one key from
    # `surface.desk.estate.parts`, which the loop turns into the places it
    # covers and what answers for them. Absent means the default, which is
    # what every question meant before this existed.
    estate: Optional[str] = Field(None, max_length=32)
    selection: Optional[DeskSelection] = None
    window: Optional[DeskWindow] = None
    drawn: Optional[DeskDrawn] = None
    # What is on the board (2026-09-10), so a fragment resolves against what is
    # being looked at instead of against the transcript.
    board: List[BoardObject] = Field(default_factory=list, max_length=_BOARD_MAX)
    attention: List[DeskAttention] = Field(default_factory=list, max_length=_DESK_MAX_ATTENTION)
    recommendation: Optional[DeskRecommendation] = None
    # What an `@` resolved to that binds nothing (P2.c) — a rule, by name and
    # id. Bounded by the same number the drawn subjects are.
    references: List[DeskReference] = Field(default_factory=list, max_length=_DESK_MAX_DRAWN)

    @field_validator("estate")
    @classmethod
    def _estate_is_a_declared_part(cls, value: Optional[str]) -> Optional[str]:
        """
        A part the definitions do not declare is refused, not ignored.

        The rest of the desk is bounded by `Literal`s; this one is a list read
        out of metrics.yaml at import, so it cannot be spelled as a type. The
        check has to exist somewhere and this is the edge — a bad key dropped
        silently in the loop would mean a person switching to something the
        server does not know gets the whole estate back, with a pill lit saying
        otherwise.
        """
        if value is None or value in _DESK_ESTATE:
            return value
        raise ValueError(f"unknown estate part {value!r}; "
                         f"expected one of {', '.join(_DESK_ESTATE)}")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    # What the person has selected on the workspace, and the window they moved
    # it to. Optional: an empty desk sends nothing, exactly as before it existed.
    desk: Optional[DeskContext] = None
    # The page the user is asking from, e.g. "replenishment". Bob is present
    # wherever the user already is and receives that page as context.
    #
    # This used to be sent in a field called `user_id`, which meant
    # george.conversations.user_id held the page name and no record of who
    # asked. Who asked now comes from the token, below, and cannot be set by a
    # caller at all.
    page_context: Optional[str] = Field(None, max_length=100)
    # The Bob page in scope, when the question was asked from one. Present
    # means a page reader bound to the caller and this exact page is injected
    # and Bob can read the page's pins; absent means he cannot, and the
    # tool is not in his schema. Legacy callers (the Operations chrome) send
    # page_context alone and are unaffected.
    page_scope: Optional[PageScope] = None
    # The conversation so far. The loop is stateless per request, so without
    # this every question stands alone and "pin that" has nothing to refer to.
    history: List[HistoryTurn] = Field(default_factory=list, max_length=20)
    # The thread this question continues. Omit to start a new one; the `start`
    # frame hands back the id to send on the next turn. Checked against the
    # caller before the stream opens: the caller's own conversation, or a
    # thread Bob opened at org level — see app.services.thread_access.
    thread_id: Optional[uuid.UUID] = None
    # The post this question replies to, inside thread_id. Optional: a thread
    # groups posts whether or not each names its parent. Must be in the thread
    # and visible to the caller; meaningless without thread_id.
    parent_id: Optional[uuid.UUID] = None


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
    # The full first question, untruncated. `title` is a 40-character cut of
    # this, and the rail shows this one on hover — a truncated label that
    # cannot be expanded is a name nobody can read.
    question: str
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
    # Whether cache_hit is a measurement or an artefact — false for a turn that
    # never reached the API, whose cache_read is 0 because no request was made.
    # Defaulted so rows logged before cache_creation_tokens existed still load.
    cache_measured: bool = False


class ChatTurn(BaseModel):
    """
    One turn, in the shape useBobStream builds from a live stream — so a
    reopened chat renders through the same component as a live one.
    """

    role: Literal["user", "bob"]
    text: str
    at: Optional[str]
    # bob-only; absent on a user turn.
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
    # As on ChatSummary: the untruncated first question, so a reopened chat's
    # header can show on hover what its 40-character name was cut from.
    question: str
    turns: List[ChatTurn]


# thread_id is nullable in the table for rows that predate the column; every
# such row was backfilled to its own id, and COALESCE keeps that true even if
# the backfill is ever skipped.
_THREAD = "COALESCE(c.thread_id, c.id)"

# A deleted chat is hidden, not removed (see migration m7n8o9p0q1r2). Every
# read below carries this, so a hidden chat is gone from the list, 404s on
# reopen, and cannot be continued — while its rows stay in the log.
_VISIBLE = "c.hidden_at IS NULL"


async def _thread_continuable(username: str, thread_id: uuid.UUID) -> bool:
    """
    Before the stream opens, because the loop itself cannot read.

    The rule lives in app.services.thread_access and is deliberately narrow:
    the caller's own conversation, or a thread whose ROOT post Bob wrote at
    org level. Nothing else opens a thread to continuation.
    """
    async with AsyncSessionLocal() as session:
        return await thread_continuable(session, username, thread_id)


async def _parent_in_thread(username: str, thread_id: uuid.UUID,
                            parent_id: uuid.UUID) -> bool:
    async with AsyncSessionLocal() as session:
        return await parent_in_thread(session, username, thread_id, parent_id)


# ---------------------------------------------------------------------------
# The opening line
#
# WHY THIS ROUTE EXISTS RATHER THAN A CALL TO /api/v1/brief. That endpoint is
# gated by BRIEF_TOKEN — a shared secret scoped so that a leak costs the morning
# brief and nothing else (routes/brief.py). Handing it to every browser that
# loads Bob would destroy exactly that scoping. So the SOURCE is reused and
# the DOOR is not: this calls the same tools.brief.get_brief(), behind the same
# gate /bob/chats and /bob/pins already sit behind. /api/v1/brief and its
# token are untouched and remain the scheduler's.
# ---------------------------------------------------------------------------

class FollowUp(BaseModel):
    """One chip: a short label, and the question it actually asks."""

    label: str
    question: str


class GreetingResponse(BaseModel):
    """
    Bob's opening line, and the receipts under it.

    `kind` is item | quiet | could_not_look, and the third is not a variant of
    the second: it means a section of the brief COULD NOT RUN. See
    app/services/bob_greeting.py.
    """

    kind: Literal["item", "quiet", "could_not_look"]
    # A complete, standalone sentence. Standalone deliberately: it is the one
    # string a voice layer would speak, and it must never need the DOM around
    # it to make sense.
    headline: str
    # The brief row itself, carrying its own `receipts`. None when nothing
    # crossed a threshold.
    item: Optional[dict[str, Any]] = None
    notices: List[ChatNotice] = Field(default_factory=list)
    # The brief's own meta — source, filters, snapshot_timestamp, sections.
    meta: dict[str, Any] = Field(default_factory=dict)
    blind_sections: List[str] = Field(default_factory=list)
    # The obvious next question per brief item, most notable first. A chip is a
    # QUESTION, not a staged answer: clicking one asks Bob in the ordinary
    # way, so the reply carries its own notices and receipts and nothing is
    # ever shown from a figure that went stale on screen.
    follow_ups: List[FollowUp] = Field(default_factory=list)


async def _stored_brief(db: AsyncSession, as_of: Optional[str]) -> Optional["GreetingResponse"]:
    """
    This morning's brief post, as a greeting — or None to compute one.

    Returns None for every reason: no post yet today, a post the shape of
    something this endpoint cannot describe, or a lookup that failed. The
    caller then computes, which is what it did before there were posts at all,
    so a miss costs latency and never correctness.

    The `shape` in the payload is the greeting's own kind, stored so the
    could_not_look / quiet distinction survives the round trip. A post without
    it predates this and is ignored rather than guessed at — reporting a
    morning nobody could look at as a quiet one is the single thing this whole
    path must not do.
    """
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _Z

    day = as_of or _dt.now(_Z("Asia/Manila")).date().isoformat()
    try:
        row = (
            await db.execute(
                text(
                    "SELECT body, payload, receipts, notices FROM george.posts "
                    "WHERE kind = 'brief' AND payload->>'as_of' = :d "
                    "  AND hidden_at IS NULL LIMIT 1"
                ),
                {"d": day},
            )
        ).mappings().first()
    except SQLAlchemyError:
        return None
    if not row:
        return None

    payload = dict(row["payload"] or {})
    shape = payload.get("shape")
    if shape not in ("item", "quiet", "could_not_look"):
        return None

    return GreetingResponse(
        kind=shape,
        headline=row["body"] or "",
        # The row itself is not stored on the post; the receipts it carried are,
        # which is what the display actually uses. `item` stays None and the
        # client falls back to the post's receipts exactly as it does for a
        # quiet morning.
        item=None,
        notices=[ChatNotice.model_validate(n) for n in (row["notices"] or [])],
        meta=dict(row["receipts"] or {}),
        blind_sections=list(payload.get("blind_sections") or []),
        follow_ups=[FollowUp.model_validate(f) for f in (payload.get("follow_ups") or [])],
    )


@router.get("/greeting", response_model=GreetingResponse)
async def greeting(
    as_of: Optional[str] = Query(
        None, description="Manila date the brief is written ON. Reproduces a past morning."
    ),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> GreetingResponse:
    """
    What Bob says before he is asked anything.

    READS THIS MORNING'S BRIEF POST FIRST. The 06:00 send writes one (see
    river_writer.post_brief), and it holds exactly what this endpoint returns —
    the same standalone sentence, the same item receipts, the same notices —
    because the post IS the greeting rather than a second rendering of it. One
    indexed SELECT replaces several full scans on every page load.

    FALLING BACK IS NOT A DEGRADED PATH, it is the ordinary one before 06:00
    and whenever the send did not happen. It computes the brief exactly as
    before, and if the TOOL then refuses, that is a 422 — the client shows its
    own quiet failure line. What must never happen is a morning nobody could
    look at being reported as a quiet one, and that distinction lives inside
    build_greeting's three shapes either way.

    Threaded on the fallback, because get_brief() is synchronous and running it
    on the event loop would stall every other request for its duration,
    including an in-flight answer stream.
    """
    stored = await _stored_brief(db, as_of)
    if stored is not None:
        return stored

    try:
        payload = await asyncio.to_thread(brief_tool.get_brief, as_of=as_of)
    except (ValueError, KeyError, RuntimeError) as exc:
        # A refusal from the tool is a real answer, but the client needs a
        # non-200 so it shows its own quiet failure line rather than a greeting.
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    g = build_greeting(payload)
    return GreetingResponse(
        kind=g["kind"],
        headline=g["headline"],
        item=g["item"],
        notices=[ChatNotice.model_validate(n) for n in g["notices"]],
        meta=g["meta"],
        blind_sections=g["blind_sections"],
        follow_ups=[FollowUp.model_validate(f) for f in g.get("follow_ups") or []],
    )


# ---------------------------------------------------------------------------
# The river
#
# One append-only timeline of everything Bob does and says, and everything
# anyone says to him. Read-only here: C.1 renders the history that already
# exists (backfilled from george.conversations by n8o9p0q1r2s3), and the live
# write path arrives in C.2.
#
# VISIBILITY IS APPLIED IN SQL AND NOWHERE ELSE. `visibility = 'org' OR
# author_user = :me` — Bob's own posts are company-level facts, a person's
# question is theirs until they share it (CLAUDE.md, "The river"). A filter
# written in Python is a filter somebody can forget to call.
# ---------------------------------------------------------------------------

# Posts a caller may see. The one place this is expressed.
# owner_user, NOT author_user. Bob writes the answers and has no account,
# so filtering on the author made every private answer invisible to everyone —
# 125 of 125, measured (alembic p0q1r2s3t4u5).
_POST_VISIBLE = "p.hidden_at IS NULL AND (p.visibility = 'org' OR p.owner_user = :me)"

_POST_COLUMNS = (
    "p.id, p.thread_id, p.parent_id, p.kind, p.author, p.author_user, "
    "p.visibility, p.owner_user, p.body, p.payload, p.receipts, p.notices, "
    "p.conversation_id, p.created_at"
)


class RiverPost(BaseModel):
    """One post. Every Bob post carries its receipts and its notices."""

    id: str
    thread_id: str
    parent_id: Optional[str] = None
    kind: str
    author: str
    author_user: Optional[str] = None
    visibility: str
    #: Whose post it is while private — who may see it and who may share it.
    #: Distinct from author_user, which is only who WROTE it.
    owner_user: Optional[str] = None
    #: True when the viewer owns it — decides whether a share action is
    #: offered, and nothing else. Visibility was applied in SQL.
    mine: bool
    body: str
    payload: Optional[dict[str, Any]] = None
    receipts: Optional[dict[str, Any]] = None
    notices: List[ChatNotice] = Field(default_factory=list)
    conversation_id: Optional[str] = None
    created_at: Optional[str] = None


class RiverPage(BaseModel):
    """
    A page of the river, oldest-first.

    `before` is the cursor for the page ABOVE this one. None means the river
    has been read to its beginning — a real end, which the UI states rather
    than spinning on (UI rule 8).
    """

    posts: List[RiverPost]
    before: Optional[str] = None


class StoreHealth(BaseModel):
    """One store, and whether this morning's brief said anything about it."""

    name: str
    #: True when a brief item named this store today. NOT "unhealthy" — a
    #: flagged store is one Bob had something to say about.
    flagged: bool


class SourceFreshness(BaseModel):
    """A source table and when it was last actually read."""

    table: str
    read_at: str


class StatusBand(BaseModel):
    """
    What the band above the river may claim.

    EVERY FIELD IS EITHER A LOADED FACT OR EXPLICITLY UNKNOWN (UI rule 8).
    `stores_known` is the important one: with no brief post for today there is
    no basis for saying anything about any store, and the band must render an
    unknown state rather than a row of calm dots. "All fine" and "we have not
    looked" are different claims and only one of them is safe to make.
    """

    #: The active retail stores, from metrics.yaml — the single source for the
    #: store list (CLAUDE.md). Present even when nothing is known about them.
    stores: List[StoreHealth] = Field(default_factory=list)
    #: False when no brief has been posted today, so `flagged` means nothing.
    stores_known: bool = False
    #: Newest read per source, from the receipts posts actually carry.
    sources: List[SourceFreshness] = Field(default_factory=list)
    #: The Manila day this describes.
    as_of: str


# ---------------------------------------------------------------------------
# Standing questions
#
# A question Bob is asked on a schedule. These endpoints are the MANUAL half
# of the same write path his injected tool takes — same service functions, same
# owner scope, same refusals (CLAUDE.md rule 4). The room reads `latest` to
# decide what it opens on.
# ---------------------------------------------------------------------------


class StandingQuestionOut(BaseModel):
    id: str
    question: str
    instructions: List[str] = Field(default_factory=list)
    #: The slot in words: "every day at 06:00", "Mon, Thu at 09:00".
    when: str
    #: "asked on schedule" or "switched off".
    state: str
    last_asked: Optional[datetime] = None
    last_status: Optional[str] = None


class DecisionIn(BaseModel):
    """One gesture on one agenda row — see app/services/decisions.py."""
    what: str = Field(min_length=1, max_length=500)
    source: str = Field(default="", max_length=100)
    subject: str = Field(default="", max_length=300)
    outcome: str
    raised_at: Optional[datetime] = None
    thread_id: Optional[str] = Field(default=None, max_length=100)


class DecisionOut(BaseModel):
    id: str
    what: str
    outcome: str
    decided_at: datetime


class ForgottenBelief(BaseModel):
    """What was dropped, so the surface can say it by name rather than guess."""
    id: str
    subject: str
    stance: str
    claim: str
    forgotten_at: datetime


class StandingLatest(BaseModel):
    """The newest standing answer waiting for this person, if there is one."""

    thread_id: str
    question: str
    answered_at: Optional[datetime] = None
    standing_question_id: str


@router.post("/decisions", response_model=DecisionOut, status_code=status.HTTP_201_CREATED)
async def record_decision(
    body: DecisionIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> DecisionOut:
    """
    What this person did with something Bob raised.

    Written by the room's own gestures on an agenda row — keep, set aside,
    open, ask why, put the morning away — and by nothing else. There is no
    read here: Bob reads the log himself when he ranks the morning
    (an injected reader on get_attention) and says on the row why it is
    where it is. Shared, like beliefs: the agenda is about the business.
    """
    try:
        row = await decisions_service.record(
            db, what=body.what, source=body.source, subject=body.subject,
            outcome=body.outcome, decided_by=user.username,
            raised_at=body.raised_at, thread_id=body.thread_id,
        )
        await db.commit()
    except decisions_service.DecisionRefused as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return DecisionOut(id=row.id, what=row.what, outcome=row.outcome, decided_at=row.decided_at)


@router.post("/beliefs/{belief_id}/forget", response_model=ForgottenBelief)
async def forget_belief(
    belief_id: str,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> ForgottenBelief:
    """
    Stop holding a view, at a person's word.

    A GESTURE, NOT A TOOL (P2.f). Forget sits on every row the memory draws,
    and it is the person's to make: Bob may revise a view when a read
    contradicts it, but he may not decide to stop knowing something because
    somebody disagreed. So there is no `forget_belief` in his schema and there
    is no argument here for whose memory — beliefs are shared, as they have
    been since they were introduced.

    THE ROW IS NOT DELETED. `forgotten_at` and the hand that did it are
    stamped on it and it stops being current, which is what takes it out of
    the prompt and out of `view_memory` at the same moment. What Bob used
    to think is still answerable.

    404 when it is not a view he currently holds, INCLUDING one already
    forgotten: a second Forget that reports success is telling the person
    something untrue.
    """
    try:
        row = await beliefs_service.forget(db, belief_id, by=user.username)
    except beliefs_service.BeliefNotHeld as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return ForgottenBelief(
        id=str(row["id"]), subject=str(row["subject"] or ""),
        stance=str(row["stance"] or ""), claim=str(row["claim"] or ""),
        forgotten_at=row["forgotten_at"],
    )


@router.get("/standing", response_model=List[StandingQuestionOut])
async def list_standing(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> List[StandingQuestionOut]:
    """Every question this person has asked Bob to keep asking."""
    rows = await standing_questions.list_for(db, user.username)
    return [StandingQuestionOut(**standing_questions.as_row(r)) for r in rows]


@router.get("/standing/latest", response_model=Optional[StandingLatest])
async def latest_standing(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> Optional[StandingLatest]:
    """
    What Bob has already said, unprompted, that this person has not asked for.

    THIS IS WHAT THE ROOM OPENS ON, and it is the whole of the morning
    briefing's implementation on the read side: there is no brief object, no
    brief table and no brief renderer — there is the answer to a question he
    was asked at 06:00, drawn by the same board that draws every other answer.

    Null is a real answer and the client must render it as one: somebody with
    no standing question, or one that has never run, has nothing waiting, and
    a room that invented an opening for them would be stating something it
    never checked (UI rule 8).
    """
    found = await standing_questions.latest_answer(db, user.username)
    return StandingLatest(**found) if found else None


# ---------------------------------------------------------------------------
# Opening an object
#
# TAPPING A SHOP MUST NOT COST A MODEL TURN. Asking Bob to open Rockwell
# takes roughly forty seconds and a model call; the figures are the same five
# reads every time and there is no judgement in choosing them, so the client
# calls this directly and gets them in about a second.
#
# NOTHING HERE DECIDES ANYTHING. The sections come from tools/objects.py, which
# is the same tool Bob is given, so what a person sees when they tap and
# what he sees when he reasons cannot drift apart. This endpoint adds exactly
# one thing the tool cannot reach: what Bob currently THINKS about the
# object, which lives in the `bob` schema the read-only role cannot see.
# ---------------------------------------------------------------------------

# Which belief subject kinds answer to which object kind. A shop is a store or
# the warehouse; both are places somebody would open by name.
BELIEF_KINDS: dict[str, tuple[str, ...]] = {
    "shop": ("store", "warehouse"),
    "product": ("product",),
    "supplier": ("supplier",),
    "order": (),
}


class ObjectRequest(BaseModel):
    kind: str = Field(..., description="shop, product, supplier or order")
    name: str = Field(..., min_length=1, max_length=200)
    date_range: Optional[str] = Field(default=None, max_length=40)


class ObjectView(BaseModel):
    """One object opened: its sections, and Bob's view of it if he has one."""

    kind: str
    name: str
    #: Each section with its own rows, receipts and the call behind it.
    sections: List[dict[str, Any]] = Field(default_factory=list)
    meta: dict[str, Any] = Field(default_factory=dict)
    #: What Bob thinks about this thing, or null. Null is a real answer:
    #: "he has not formed a view" is not "he thinks nothing is wrong".
    view: Optional[dict[str, Any]] = None


@router.post("/object", response_model=ObjectView)
async def open_object(
    request: ObjectRequest,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> ObjectView:
    """
    Open a shop, a product, a supplier or an order.

    The read runs on Bob's read-only role in a worker thread — the tools are
    synchronous and blocking, and holding the event loop for a second would
    stall every other request in this process. The belief lookup runs on the
    application role, in the caller's own session, exactly as the greeting's
    does.

    A refusal from the tool — an unknown shop, a kind that does not exist — is
    a 400 with the tool's own sentence, because that sentence already names
    what to do instead.
    """
    # WHAT A PERSON SAID TO LEAVE OUT applies to a tap as to a question
    # (P2S.11): the same object, the same lists, the same receipts. A lookup
    # that fails opens the object whole — its receipts then say nothing was
    # left out, which is true.
    try:
        bound = beliefs_service.bound_settings(
            await beliefs_service.current(db), _load_defs())
    except SQLAlchemyError:
        await db.rollback()
        bound = {}
    try:
        opened = await asyncio.to_thread(
            functools.partial(objects_tool.get_object, request.kind, request.name,
                              request.date_range,
                              left_out=bound.get("left_out_categories")),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    view = None
    kinds = BELIEF_KINDS.get(request.kind) or ()
    if kinds:
        # The object's resolved identity where there is one — a product asked
        # for by name is opened by SKU, and the view is about the product, not
        # about the word somebody typed.
        subject = request.name
        identity = next((s for s in opened["rows"]
                         if s["section"] == "identity" and s["rows"]), None)
        if identity and len(identity["rows"]) == 1:
            subject = str(identity["rows"][0].get("name") or subject)
        try:
            view = await self_reader.view_of(
                db, subject_kinds=kinds, subject=subject,
            )
        except SQLAlchemyError:
            # A lookup that failed is not "he has no view" — those render
            # differently (UI rule 8) — so it is reported as its own state.
            view = {"state": "unavailable",
                    "reason": "What Bob thinks could not be read."}

    return ObjectView(
        kind=request.kind, name=request.name,
        sections=opened["rows"], meta=opened["meta"], view=view,
    )


# ---------------------------------------------------------------------------
# What Bob noticed
#
# A watch writes an org post and says nothing else. Until this read existed the
# post went into the river and the ROOM never showed it, so a watch could fire
# correctly and still be invisible to the person it fired for — which is the
# same as not having fired.
#
# NOT "NEEDS YOU". The accent colour and that phrase belong to the approval
# queue and to nothing else (UI rule 5): an approval is a thing somebody must
# act on, and a watch is a thing that happened. Conflating them would spend the
# one colour reserved for a summons on a fact.
#
# BOUNDED BY TIME, NOT BY A SEEN FLAG. A "seen" mark is a write per person per
# post, and the first version of this does not need one: a watch speaks rarely,
# so the last few days of them is a short list, and dismissing one is a
# per-viewer convenience the client keeps for the session.
# ---------------------------------------------------------------------------

NOTICED_DAYS = 7
NOTICED_LIMIT = 5


class NoticedItem(BaseModel):
    """
    One thing Bob noticed: a watch that fired, or a system that broke.

    TWO KINDS, AND THEY ARE DIFFERENT FACTS. A "watch" is something true
    about the business that changed. A "stuck" is something about BOB — a rule
    that failed on its schedule, a question that could not be asked, a watch
    that has stopped watching. The second kind matters precisely because it is
    otherwise invisible: a watch's normal state is silence, so a broken one and
    a quiet fortnight look identical from outside.
    """

    post_id: str
    #: Empty for a "stuck": nothing was posted, so there is no thread to reply
    #: in. The client offers no "look into it" for one.
    thread_id: str
    kind: str = "watch"
    body: str
    created_at: Optional[datetime] = None
    #: For a "stuck": what the system itself said went wrong.
    why: Optional[str] = None
    #: For a "stuck": the one thing that would unstick it.
    fix: Optional[str] = None
    #: The watch that produced it, so a client can group or mute by watch.
    watch_id: Optional[str] = None
    #: True when the read behind it travelled with the post, which is what
    #: makes "look into it" re-run a fact rather than work from the sentence.
    has_calls: bool = False


async def _stuck(db: AsyncSession, username: str) -> List["NoticedItem"]:
    """
    Things that RUN and have stopped working.

    THE OWNER'S FEATURE 18: not just create workflows — operate the systems:
    monitor, prepare work, check conditions, follow up, ESCALATE EXCEPTIONS.
    Until this, a scheduled run that failed wrote a post nobody surfaced, a
    standing question that broke recorded `failed` on its own row and said
    nothing, and a watch that stopped because its thresholds moved went quiet —
    which for a watch is indistinguishable from working perfectly.

    A system that fails silently is worse than no system: it is a thing you
    believe is watching.

    WHAT IS DELIBERATELY NOT HERE. A question you have not switched on, a watch
    with no backtest yet — those are things you have not started, not things
    that broke. Listing them would turn an exception report into a nag list,
    and a nag list is read once. This carries only what WAS running.

    NEVER THE APPROVALS COLOUR (UI rule 5). A failed run is not an approval —
    CLAUDE.md says so in those words — so this lands beside what Bob
    noticed, in his own colour, and the accent stays with the queue.
    """
    items: List[NoticedItem] = []

    # ---- scheduled runs that failed -------------------------------------
    # Grouped, with a count: "failed three mornings running" is a different
    # fact from "failed once", and only the first is worth waking up for.
    runs = (await db.execute(text("""
        SELECT w.name,
               count(*) AS times,
               max(r.started_at) AS last_at,
               -- A run has no `error` column: what went wrong is the first
               -- notice it carried, which is also what the run's own post
               -- says, so the two accounts cannot disagree.
               (array_agg(r.notices -> 0 ->> 'message'
                          ORDER BY r.started_at DESC))[1] AS why
          FROM george.workflow_runs r
          JOIN george.workflows w ON w.id = r.workflow_id
         WHERE r.status <> 'ok'
           AND r.mode = 'scheduled'
           AND r.started_at > now() - make_interval(days => :days)
         GROUP BY w.name
         ORDER BY max(r.started_at) DESC
         LIMIT :limit
    """), {"days": NOTICED_DAYS, "limit": NOTICED_LIMIT})).mappings().all()
    for row in runs:
        times = int(row["times"])
        items.append(NoticedItem(
            post_id=f"stuck:workflow:{row['name']}",
            thread_id="",
            kind="stuck",
            body=(f"{row['name']} failed on its schedule"
                  + (f", {times} times" if times > 1 else "")),
            created_at=row["last_at"],
            why=(str(row["why"])[:400] if row["why"] else None),
            fix="Run it by hand to see the failure, or switch its schedule off.",
        ))

    # ---- standing questions that could not be asked ----------------------
    questions = (await db.execute(text("""
        SELECT question, last_run_at, last_error
          FROM george.standing_questions
         WHERE owner = :me AND last_status = 'failed'
         ORDER BY last_run_at DESC NULLS LAST
         LIMIT :limit
    """), {"me": username, "limit": NOTICED_LIMIT})).mappings().all()
    for row in questions:
        items.append(NoticedItem(
            post_id=f"stuck:question:{row['question'][:60]}",
            thread_id="",
            kind="stuck",
            body=f"“{row['question']}” could not be answered on its schedule",
            created_at=row["last_run_at"],
            why=(str(row["last_error"])[:400] if row["last_error"] else None),
            fix="Ask it now and see what happens, or change what it asks.",
        ))

    # ---- watches that are not watching -----------------------------------
    # The one that matters most, because a watch's normal state is silence:
    # from outside, a broken watch and a quiet fortnight look identical.
    watches = (await db.execute(text("""
        SELECT id, condition, direction, stores, last_status, last_error,
               last_checked_at
          FROM george.watches
         WHERE owner = :me AND last_status IN ('failed', 'stale_backtest')
         ORDER BY last_checked_at DESC NULLS LAST
         LIMIT :limit
    """), {"me": username, "limit": NOTICED_LIMIT})).mappings().all()
    for row in watches:
        where = ", ".join(row["stores"]) if row["stores"] else "any shop"
        stopped = row["last_status"] == "stale_backtest"
        items.append(NoticedItem(
            post_id=f"stuck:watch:{row['id']}",
            thread_id="",
            kind="stuck",
            body=(f"the watch on {row['condition']} ({where}) "
                  + ("has stopped" if stopped else "could not check")),
            created_at=row["last_checked_at"],
            why=(str(row["last_error"])[:400] if row["last_error"] else None),
            fix=("Back it again — the thresholds behind it changed, so what it "
                 "would do is no longer what it was measured doing."
                 if stopped else
                 "It is blind rather than quiet. What it last saw is unchanged."),
        ))

    return items


@router.get("/noticed", response_model=List[NoticedItem])
async def read_noticed(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> List[NoticedItem]:
    """
    The things Bob noticed lately, newest first.

    Only `watch` posts. A brief, a workflow run and an approval are also things
    Bob initiated, and each already has its own home — putting them here
    would make this the river with a different name.

    An empty list is a real answer and the client must render it as one: a
    quiet week is what a watch is FOR, and "nothing to report" is different
    from "not loaded yet" (UI rule 8).
    """
    rows = (
        await db.execute(
            text(
                f"SELECT {_POST_COLUMNS} FROM george.posts p "
                f"WHERE {_POST_VISIBLE} AND p.kind = 'watch' "
                f"  AND p.created_at > now() - make_interval(days => :days) "
                f"ORDER BY p.created_at DESC LIMIT :limit"
            ),
            {"me": user.username, "days": NOTICED_DAYS, "limit": NOTICED_LIMIT},
        )
    ).mappings().all()

    items: List[NoticedItem] = []
    for row in rows:
        payload = row["payload"] or {}
        items.append(NoticedItem(
            post_id=str(row["id"]),
            thread_id=str(row["thread_id"]),
            kind="watch",
            body=row["body"] or "",
            created_at=row["created_at"],
            watch_id=payload.get("watch_id"),
            has_calls=bool(payload.get("calls")),
        ))

    # WHAT BROKE COMES FIRST. A watch reporting the business is news; a system
    # that has stopped reporting is a thing you believe is running and is not.
    return await _stuck(db, user.username) + items


@router.get("/status", response_model=StatusBand)
async def status_band(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> StatusBand:
    """
    The state of things, for the band above the river.

    Built only from what is already stored: the store list from metrics.yaml,
    and freshness from the receipts on posts. No new scan, no tool call — this
    runs on every load of Bob's home and must cost a couple of indexed
    reads, not a pass over the transaction table.

    The needs-you count is deliberately NOT here. It comes from
    GET /workflows/approvals, which is the queue's one source; a second count
    computed elsewhere could disagree with the rail it sits above.
    """
    from datetime import datetime as _dt
    from zoneinfo import ZoneInfo as _Z

    day = _dt.now(_Z("Asia/Manila")).date().isoformat()
    defs = _load_defs()
    stores = [s["display_name"] for s in _req(defs, "stores.active_retail")]

    flagged: set[str] = set()
    stores_known = False
    row = (
        await db.execute(
            text("SELECT body, payload FROM george.posts "
                 "WHERE kind = 'brief' AND payload->>'as_of' = :d "
                 "  AND hidden_at IS NULL LIMIT 1"),
            {"d": day},
        )
    ).mappings().first()
    if row:
        # A store is flagged when the brief named it. The body is the greeting
        # sentence, which always leads with the subject, so a name appearing in
        # it is a name Bob had something to say about.
        stores_known = True
        body = row["body"] or ""
        flagged = {name for name in stores if name and name in body}

    sources = (
        await db.execute(
            text("SELECT receipts->>'source_table' AS t, "
                 "       max(receipts->>'snapshot_timestamp') AS read_at "
                 "  FROM george.posts "
                 " WHERE receipts ? 'source_table' AND hidden_at IS NULL "
                 " GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 6"),
        )
    ).mappings().all()

    return StatusBand(
        stores=[StoreHealth(name=n, flagged=n in flagged) for n in stores],
        stores_known=stores_known,
        sources=[
            SourceFreshness(table=r["t"], read_at=r["read_at"])
            for r in sources if r["t"] and r["read_at"]
        ],
        as_of=day,
    )


# The two streams of the one river, by post kind (2026-09-09).
#
# ASK is where a person goes to Bob: the questions they asked and the
# answers he gave. TODAY is where Bob comes to them: the brief, a notice,
# a run, an approval — every post he initiated. One table, one visibility
# clause, one cursor; the split is a WHERE on `kind`, so nothing a caller may
# not see in one stream becomes visible in the other. No stream named means
# the whole river, exactly as before.
RIVER_STREAMS: dict[str, str] = {
    "work": " AND p.kind IN ('question', 'answer')",
    "attention": " AND p.kind NOT IN ('question', 'answer')",
}


@router.get("/river", response_model=RiverPage)
async def read_river(
    limit: int = Query(RIVER_LIMIT, ge=1, le=RIVER_MAX),
    before: Optional[str] = Query(
        None, description="Read the page above this ISO timestamp. Omit for the newest."
    ),
    stream: Optional[str] = Query(
        None, description="'work' for questions and answers, 'attention' for what Bob initiated. Omit for all."
    ),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> RiverPage:
    """
    The river, newest page first, rendered oldest-first within the page.

    Read newest-first so paging backwards never counts from the beginning of
    history; reversed for rendering so the page reads top-to-bottom like any
    thread. Both facts live in app.services.river, not in a client.
    """
    params: dict[str, Any] = {"me": user.username, "limit": limit}
    cursor = ""
    if stream is not None:
        if stream not in RIVER_STREAMS:
            raise HTTPException(status_code=422, detail="stream must be 'work' or 'attention'.")
        cursor += RIVER_STREAMS[stream]
    if before:
        try:
            params["before"] = datetime.fromisoformat(before)
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="before must be an ISO timestamp."
            ) from exc
        # APPENDED, NEVER ASSIGNED. This used to overwrite the stream filter,
        # so the first page of `attention` was Bob's posts and the second
        # page was everything — the filter silently stopped applying exactly
        # when somebody scrolled far enough to care.
        cursor += " AND p.created_at < :before"

    rows = (
        await db.execute(
            text(
                f"SELECT {_POST_COLUMNS} FROM george.posts p "
                f"WHERE {_POST_VISIBLE}{cursor} "
                f"ORDER BY p.created_at DESC LIMIT :limit"
            ),
            params,
        )
    ).mappings().all()

    return RiverPage(
        posts=[RiverPost.model_validate(p) for p in build_river(rows, user.username)],
        before=next_cursor(rows, limit),
    )


class ShareRequest(BaseModel):
    """Only one direction exists, so the body says which and nothing else."""

    visibility: Literal["org"]


@router.patch("/river/posts/{post_id}", response_model=List[RiverPost])
async def share_post(
    post_id: uuid.UUID,
    body: ShareRequest,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> List[RiverPost]:
    """
    Share a private post into the river. Returns the whole thread as it now is.

    ONE WAY ONLY. private -> org, never back. That is the same argument that
    set the default (CLAUDE.md, "The river"): a private default can be opened
    per post by the person who owns it, and a public one cannot un-show what
    was shown. An unshare button would promise something it cannot deliver, so
    the request type admits exactly one value.

    IT ACTS ON THE THREAD, not the post. A shared question whose answer stayed
    private is half a conversation, and the half missing is the one with the
    figures in it. So this shares every post in the thread THE CALLER OWNS —
    never anybody else's, even in a thread they started.

    Ownership is enforced in the UPDATE, not checked first: a check and a write
    are two statements, and the row can change between them.
    """
    owned = (
        await db.execute(
            text("SELECT thread_id FROM george.posts "
                 " WHERE id = :id AND owner_user = :me AND hidden_at IS NULL"),
            {"id": post_id, "me": user.username},
        )
    ).scalar_one_or_none()
    if owned is None:
        # Not found and not yours are the same answer: a post somebody else
        # owns is not the caller's to learn about.
        raise HTTPException(status_code=404, detail="No post of yours with that id.")

    await db.execute(
        text("UPDATE george.posts SET visibility = 'org' "
             " WHERE thread_id = :t AND owner_user = :me "
             "   AND visibility = 'private' AND hidden_at IS NULL"),
        {"t": owned, "me": user.username},
    )

    rows = (
        await db.execute(
            text(f"SELECT {_POST_COLUMNS} FROM george.posts p "
                 f"WHERE p.thread_id = :t AND {_POST_VISIBLE} "
                 f"ORDER BY p.created_at ASC"),
            {"t": owned, "me": user.username},
        )
    ).mappings().all()
    return [RiverPost.model_validate(p) for p in thread_of(rows, user.username)]


@router.get("/river/threads/{thread_id}", response_model=List[RiverPost])
async def read_thread(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> List[RiverPost]:
    """
    One thread, oldest first.

    Same visibility filter, so a thread cannot be a way around it: a private
    post in someone else's thread is simply not returned.

    AN EMPTY THREAD IS TWO DIFFERENT FACTS AND THIS TELLS THEM APART.

    A thread the caller may CONTINUE — their own conversation, or one whose
    root post is Bob's and org-visible (app.services.thread_access) — but
    which holds no visible post yet is a real, ordinary state: the turn that
    names the thread is still running, and its posts are written at the END of
    the loop. Returning 404 for it meant the first question of every new thread
    was read at an address that was guaranteed to fail until the answer
    finished, and the client drew "That thread isn't available." over an answer
    that was arriving underneath it. `200 []` is the honest answer: the thread
    is yours, and nothing is in it yet.

    Everything else stays a 404, and it stays deliberately ambiguous between
    "no such thread" and "not yours" — a caller who could tell those apart
    could enumerate other people's threads by id.
    """
    rows = (
        await db.execute(
            text(
                f"SELECT {_POST_COLUMNS} FROM george.posts p "
                f"WHERE p.thread_id = :t AND {_POST_VISIBLE} "
                f"ORDER BY p.created_at ASC"
            ),
            {"t": thread_id, "me": user.username},
        )
    ).mappings().all()
    if not rows:
        # The route's own session, not _thread_continuable's, which opens a
        # second one. Every Bob database URL goes through the 5432
        # session-mode pooler and connections are the scarce thing; a read that
        # already holds a session has no business asking for another.
        if await thread_continuable(db, user.username, thread_id):
            return []
        raise HTTPException(status_code=404, detail="No thread with that id.")
    return [RiverPost.model_validate(p) for p in thread_of(rows, user.username)]


@router.get("/chats", response_model=List[ChatSummary])
async def list_chats(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
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
                f"WHERE c.user_id = :u AND {_VISIBLE} "
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
            question=question_of(r["first_question"]),
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
    user: AppUser = Depends(_bob_user),
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
                f"       c.output_tokens, c.cache_read_tokens, "
                f"       c.cache_creation_tokens, c.notices, "
                f"       c.notice_forced, c.status, c.receipts "
                f"FROM george.conversations c "
                f"WHERE {_THREAD} = :t AND c.user_id = :u AND {_VISIBLE} "
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

    # `page` is the TITLE of the page a pin sits on, read through the foreign
    # key. Page Workshop V1 dropped the old `page` text column and migrated the
    # ORM path; these two raw statements still selected it, so every call to
    # this endpoint raised UndefinedColumnError and the whole thread failed to
    # load. A LEFT JOIN keeps Ungrouped (page_id IS NULL) as NULL, which is
    # exactly what the dropped column held for it.
    pins = (
        await db.execute(
            text(
                "SELECT p.id, p.title, pg.title AS page, p.conversation_id, p.tool_calls "
                "FROM george.pins p "
                "LEFT JOIN george.pages pg ON pg.id = p.page_id "
                "WHERE p.created_by = :u AND p.conversation_id = ANY(:ids) "
                "ORDER BY p.created_at"
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
                    "SELECT pg.title AS page, COUNT(*) AS n "
                    "FROM george.pins p "
                    "LEFT JOIN george.pages pg ON pg.id = p.page_id "
                    "WHERE p.created_by = :u GROUP BY pg.title"
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
        question=question_of(rows[0]["question"]),
        turns=[ChatTurn.model_validate(t) for t in turns],
    )


# response_class=Response is load-bearing, as in bob_pins: FastAPI asserts
# at import that a 204 route declares no body, and `-> None` counts as one.
@router.delete("/chats/{thread_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def delete_chat(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> Response:
    """
    Delete one of the caller's chats — by HIDING it.

    Every row of the thread gets hidden_at, so the chat leaves the list, 404s
    on reopen and cannot be continued. The rows are not removed: this table is
    also the conversation log, which the gap log and pin provenance depend on.
    A chat belonging to someone else, or already hidden, is a 404.
    """
    result = await db.execute(
        text(
            f"UPDATE george.conversations c SET hidden_at = now() "
            f"WHERE {_THREAD} = :t AND c.user_id = :u AND {_VISIBLE}"
        ),
        {"t": thread_id, "u": user.username},
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="No chat with that id belongs to you.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    Bob's route to saving a workflow, bound to one authenticated caller.

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
    Bob's route to RUNNING a saved workflow, including backtesting one.

    A read, but injected exactly like a writer: the workflows live in the
    `bob` schema, which george_ro cannot see. Its own session, committed
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


def _memory_reader(username: str):
    """
    Bob's route to reading HIS OWN VIEWS.

    He is already handed them as text before the turn starts, which is enough
    to reason with. It is not enough to put one on the board: composing an
    object needs a read with a seq behind it. Injected exactly like the page
    reader — its own session, commits nothing, and the caller is captured here
    so the tool has no argument for whose memory.
    """

    async def read() -> dict:
        async with AsyncSessionLocal() as session:
            try:
                return await self_reader.read_memory(session, username=username)
            except SQLAlchemyError as exc:
                raise RuntimeError(
                    f"Your views could not be read: {type(exc).__name__}. Tell the "
                    f"user you cannot see what you previously thought."
                ) from exc

    return read


def _decisions_reader():
    """
    What people did with what Bob raised, for the agenda to learn from.

    Injected like the memory reader — its own session, commits nothing — and
    bound to nobody, because decisions are shared: the agenda is about the
    business, and what its people did with it is one record. get_attention
    receives the rows as a keyword-only argument the model cannot see.
    """

    async def read() -> list[dict]:
        async with AsyncSessionLocal() as session:
            return await decisions_service.recent(session)

    return read


def _automations_reader(username: str):
    """
    Bob's route to reading WHAT THE SAVED RULES HAVE BEEN DOING — what ran
    on its own, what is scheduled, what is waiting on a person. Same pattern,
    same reasons: the workflow tables are in the george schema, which george_ro
    cannot see at all.
    """

    async def read() -> dict:
        async with AsyncSessionLocal() as session:
            try:
                return await self_reader.read_automations(session, username=username)
            except SQLAlchemyError as exc:
                raise RuntimeError(
                    f"The saved rules could not be read: {type(exc).__name__}. Tell "
                    f"the user you cannot see what has been running."
                ) from exc

    return read


def _standing_writer(username: str):
    """
    Bob's route to KEEPING A QUESTION and to changing one already kept.

    A write, injected exactly as the pin writer is: the owner is captured here
    from the verified token, so the tool has no argument for whose question,
    and Bob holds no credential. It calls the same service functions the
    HTTP routes below call — one write path, whether the sentence was typed
    into a form or said out loud.

    NOT injected into a scheduled ask (app/services/standing_runner.py). A
    question that can move its own slot, or switch itself on, is a thing that
    gets away from you overnight.
    """

    async def apply(action: str, fields: dict) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                if action == "create":
                    row = await standing_questions.create(
                        session, owner=username,
                        question=fields.get("question"),
                        hour=fields.get("hour"), minute=fields.get("minute"),
                        days_of_week=fields.get("days"),
                    )
                    wrote = "created"
                elif action == "reschedule":
                    row = await standing_questions.reschedule(
                        session, owner=username, which=fields.get("which"),
                        hour=fields.get("hour"), minute=fields.get("minute"),
                        days_of_week=fields.get("days"),
                    )
                    wrote = "rescheduled"
                elif action == "add_instruction":
                    row = await standing_questions.add_instruction(
                        session, owner=username, which=fields.get("which"),
                        instruction=fields.get("instruction"),
                    )
                    wrote = "instruction added"
                elif action == "remove_instruction":
                    row = await standing_questions.remove_instruction(
                        session, owner=username, which=fields.get("which"),
                        instruction=fields.get("instruction"),
                    )
                    wrote = "instruction removed"
                elif action == "rewrite":
                    row = await standing_questions.rewrite(
                        session, owner=username, which=fields.get("which"),
                        question=fields.get("question"),
                    )
                    wrote = "question changed"
                elif action in ("switch_on", "switch_off"):
                    row = await standing_questions.switch(
                        session, owner=username, which=fields.get("which"),
                        on=action == "switch_on",
                    )
                    wrote = "switched on" if action == "switch_on" else "switched off"
                elif action == "remove":
                    row = await standing_questions.remove(
                        session, owner=username, which=fields.get("which"),
                    )
                    wrote = "removed"
                else:  # pragma: no cover - the tool checked the vocabulary first
                    raise StandingRefused(f"{action!r} is not a standing-question action.")

                as_row = standing_questions.as_row(row)
                await session.commit()
            except StandingServiceRefused as exc:
                await session.rollback()
                raise StandingRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                await session.rollback()
                raise StandingRefused(
                    f"That could not be saved: {type(exc).__name__}. Nothing was "
                    f"changed — tell the user, and do not describe it as done."
                ) from exc

        return {
            "rows": [as_row],
            "meta": {
                "source_table": "george.standing_questions",
                "filters_applied": ["owner = the signed-in user"],
                "snapshot_timestamp": as_row.get("last_asked"),
                "wrote": wrote,
                "enabled": as_row["state"] != "switched off",
                "note": (
                    "A standing question is created switched OFF and is asked "
                    "only once the owner turns it on. Say which it is."
                    if wrote == "created" else
                    "This changes what is asked from the next slot onwards. "
                    "Answers already given are unchanged."
                ),
            },
        }

    class _Writer:
        async def apply(self, action: str, fields: dict) -> dict:
            return await apply(action, fields)

    return _Writer()


def _watch_writer(username: str):
    """
    Bob's route to KEEPING A WATCH, and to running its backtest.

    A write, injected exactly as the pin writer is: the owner is captured here
    from the verified token, so the tool has no argument for whose watch, and
    Bob holds no credential. It calls the same service functions any manual
    control would.

    THE BACKTEST RUNS HERE rather than in the tool because it finishes by
    STORING its result on the watch — the gate that lets it be switched on is
    the stored record, not a number that appeared once in a conversation and
    was believed.

    NOT injected into a scheduled ask (app/services/standing_runner.py):
    nothing that runs unattended may change what else runs unattended.
    """

    async def apply(action: str, fields: dict) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                if action == "create":
                    watch = await watches_service.create(
                        session, owner=username,
                        condition=fields.get("condition"),
                        direction=fields.get("direction") or "either",
                        stores=fields.get("stores"),
                        hour=fields.get("hour"), minute=fields.get("minute"),
                        days_of_week=fields.get("days"),
                    )
                    wrote, extra = "created", {}
                elif action == "backtest":
                    watch = await watches_service._owned(
                        session, username, fields.get("which"))
                    result = await watch_runner.backtest(watch)
                    watch = await watches_service.record_backtest(
                        session, owner=username, which=str(watch.id), result=result)
                    wrote, extra = "backtested", {"backtest": result}
                elif action == "rescope":
                    watch = await watches_service.rescope(
                        session, owner=username, which=fields.get("which"),
                        stores=fields.get("stores"),
                        direction=fields.get("direction"),
                        all_shops=bool(fields.get("all_shops")))
                    wrote, extra = "rescoped", {}
                elif action in ("switch_on", "switch_off"):
                    watch = await watches_service.switch(
                        session, owner=username, which=fields.get("which"),
                        on=action == "switch_on")
                    wrote, extra = ("switched on" if action == "switch_on"
                                    else "switched off"), {}
                elif action == "reschedule":
                    watch = await watches_service.reschedule(
                        session, owner=username, which=fields.get("which"),
                        hour=fields.get("hour"), minute=fields.get("minute"),
                        days_of_week=fields.get("days"))
                    wrote, extra = "rescheduled", {}
                elif action == "remove":
                    watch = await watches_service.remove(
                        session, owner=username, which=fields.get("which"))
                    wrote, extra = "removed", {}
                else:  # pragma: no cover - the tool checked the vocabulary
                    raise WatchRefused(f"{action!r} is not a watch action.")

                row = watches_service.as_row(watch)
                await session.commit()
            except WatchServiceRefused as exc:
                await session.rollback()
                raise WatchRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                await session.rollback()
                raise WatchRefused(
                    f"That could not be saved: {type(exc).__name__}. Nothing "
                    f"was changed — tell the user, and do not describe it as done."
                ) from exc

        meta = {
            "source_table": "george.watches",
            "filters_applied": ["owner = the signed-in user"],
            "snapshot_timestamp": row.get("last_checked"),
            "wrote": wrote,
            "enabled": row["state"] == "watching",
            "note": {
                "created": (
                    "Set up, and NOT switched on: a watch cannot run until it "
                    "has been backtested. Back it and say how often it would "
                    "have spoken before asking whether to start it."
                ),
                "backtested": (
                    "This is what it would have done, not what it will do. "
                    "Give them the count and the days; a watch that would have "
                    "fired most days is one nobody will read."
                ),
                "rescoped": (
                    "The scope changed, so the old backtest no longer describes "
                    "this watch — it has been discarded and the watch switched "
                    "off. Back it again and give them the new number."
                ),
                "switched on": (
                    "It will say nothing on a normal day. Silence is the "
                    "normal state, and it posts only when the answer changes."
                ),
            }.get(wrote, "Nothing already posted is affected."),
        }
        meta.update(extra)
        return {"rows": [row], "meta": meta}

    class _Writer:
        async def apply(self, action: str, fields: dict) -> dict:
            return await apply(action, fields)

    return _Writer()


def _page_reader(username: str, page_id: Optional[uuid.UUID]) -> PageReader:
    """
    Bob's route to READING the page the caller is on.

    A read, injected exactly like the workflow runner: the pins live in the
    george schema, which george_ro cannot see. Both the username and the page
    are captured HERE — the username from the verified token, the page's ID
    from the request's page_scope — so the tool that calls this has no
    argument for either. Nothing the model emits can point it at another
    person's page, or at a page the person is not on; and a page renamed
    while the thread is open is still the page being read.

    Its own session, like the runner's, and it commits nothing: a read from
    Bob does not even touch the pins' run bookkeeping — that stays the
    tile's.
    """

    async def read(pins: Optional[list[str]], figures: bool) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                return await read_page(
                    session, username=username, page_id=page_id, pins=pins,
                    figures=figures,
                )
            except (PageReadNotFound, PageReadServiceRefused) as exc:
                # Expected refusals, in the words a person can act on. They
                # reach the model as a tool refusal — a real answer with a
                # route out — rather than as a failure of the whole turn.
                raise PageReadRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                raise RuntimeError(
                    f"The page could not be read: {type(exc).__name__}. Tell the "
                    f"user the page was not inspected."
                ) from exc

    return read


class _PageWriter:
    """
    Bob's route to CREATING and EDITING the caller's pages, bound to one
    authenticated owner and to the page in scope, if any.

    The same shape as the workflow writer: an object with two methods, because
    both ends of it need the same closure. The username is captured HERE, from
    the verified token; the page in scope is captured HERE, from the resolved
    page_scope; nothing the model emits can change whose pages these are or
    which page "this page" is. Every operation runs through
    app.services.page_operations — the same functions a route would call — as
    the actor `bob`, with the conversation recorded on each audit row.

    Its own session, committed BEFORE returning, because it runs inside a
    long-lived SSE stream and the page must survive the stream dying later.
    A refusal (a bound, a collision, an ambiguous or foreign target, an
    analysis that never ran) reaches the model as PageRefused — a real answer
    with a route out; a database fault reaches it as a failed tool that says
    nothing was changed.
    """

    _REFUSALS = (
        PageValidationError, PageQuotaError, SimilarPageError, PageWriterPageNotFound,
        PageWriterPinNotFound, AmbiguousTarget, NotAPage, PinValidationError, PinQuotaError,
    )

    def __init__(self, username: str, page_id: Optional[uuid.UUID]) -> None:
        self._username = username
        self._page_id = page_id

    async def create(self, spec: PageBuildSpec) -> dict:
        async with AsyncSessionLocal() as session:
            try:
                built = await page_operations.build_page(
                    session, owner=self._username, title=spec.title,
                    purpose=spec.purpose, analyses=spec.analyses,
                    question=spec.question,
                    conversation_id=(
                        uuid.UUID(spec.conversation_id) if spec.conversation_id else None
                    ),
                    actor=bob_actor(spec.conversation_id),
                )
                await session.commit()
            except self._REFUSALS as exc:
                await session.rollback()
                raise PageRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                await session.rollback()
                raise RuntimeError(
                    f"The page could not be created: {type(exc).__name__}. Nothing "
                    f"was written; tell the user the page was not created."
                ) from exc
            return {"owner": self._username, "page": built.page,
                    "operations": built.operations}

    async def edit(self, spec: PageEditSpec) -> dict:
        target: Optional[uuid.UUID]
        if spec.page_id is None:
            target = self._page_id
        else:
            try:
                target = uuid.UUID(spec.page_id)
            except ValueError as exc:
                raise PageRefused(
                    f"{spec.page_id!r} is not a page id. Use the page_id from "
                    f"view_page or an earlier result, or omit it for this page."
                ) from exc
        async with AsyncSessionLocal() as session:
            try:
                edited = await page_operations.apply_edit(
                    session, owner=self._username, page_id=target,
                    operations=spec.operations, question=spec.question,
                    conversation_id=(
                        uuid.UUID(spec.conversation_id) if spec.conversation_id else None
                    ),
                    actor=bob_actor(spec.conversation_id),
                )
                await session.commit()
            except self._REFUSALS as exc:
                await session.rollback()
                raise PageRefused(str(exc)) from exc
            except SQLAlchemyError as exc:
                await session.rollback()
                raise RuntimeError(
                    f"The page could not be changed: {type(exc).__name__}. Nothing "
                    f"was written; tell the user the page is as it was."
                ) from exc
            return {"owner": self._username, "page": edited.page,
                    "operations": edited.operations}


async def _resolve_scope(username: str, scope: PageScope) -> Optional[dict]:
    """
    The scope as the loop takes it: {"page_id": str | None, "name": title | None}.

    An id is checked to be the caller's — somebody else's, or nobody's, binds
    nothing rather than binding a reader that would refuse every read. The
    ungrouped scope is {page_id: None}. A legacy title is resolved to the
    caller's page of exactly that name, or binds nothing; see PageScope.
    """
    async with AsyncSessionLocal() as session:
        if scope.page_id is not None:
            try:
                page = await page_writer.get_page(session, username, scope.page_id)
            except PageWriterPageNotFound:
                return None
            return {"page_id": str(page.id), "name": page.title}
        if "page_id" in scope.model_fields_set:
            return {"page_id": None, "name": None}
        if scope.name is None:
            return {"page_id": None, "name": None}
        page = await page_writer.find_page_by_title(session, username, scope.name)
        if page is None:
            return None
        return {"page_id": str(page.id), "name": page.title}


def _belief_store(username: str, conversation_id: Optional[str]):
    """
    Bob's route to KEEPING what he believes.

    A write, injected exactly as the pin writer is: beliefs live in the george
    schema, which neither of the loop's identities can see. The username is
    captured HERE, from the verified token, and is recorded as PROVENANCE only
    — beliefs are about the business and are shared, so nothing the model emits
    and nothing in the query scopes them to a person.

    Its own session, and it commits: a view Bob formed during a turn has to
    survive the turn, which is the entire point of the table.
    """

    class _Store:
        async def record(self, accepted: list[dict]) -> list[dict]:
            async with AsyncSessionLocal() as session:
                return await beliefs_service.record(
                    session, accepted,
                    created_by=username, conversation_id=conversation_id,
                )

    return _Store()


async def _beliefs_for() -> tuple[Optional[str], dict]:
    """
    What Bob currently believes, as the block attached to the question —
    and what those views have BOUND (P2S.11), as {setting: value} for the
    loop to hand the reads. One read of george.beliefs serves both, so the
    block and the setting can never describe two different registers.

    UNLIKE RECALL, THIS IS SENT ON EVERY TURN. Recall is a nicety that stops
    being useful once the conversation has its own history; a view is the frame
    the question is read in, and dropping it mid-thread would let Bob
    contradict himself between one follow-up and the next.

    Freshness is computed against the transaction stream here, so a belief last
    checked before today's data arrives marked unconfirmed rather than
    authoritative. Failure is never fatal: an answer must not be lost to a
    lookup that could not run, and Bob without his beliefs is the Bob of
    last week.
    """
    try:
        async with AsyncSessionLocal() as session:
            rows = await beliefs_service.current(session)
            latest = await beliefs_service.latest_data_at(session)
            block = beliefs_service.as_block(rows, latest_data=latest)
            bound = beliefs_service.bound_settings(rows, _load_defs())
            # COUNT WHAT WAS ACTUALLY HANDED OVER (P2.f). The views that reach
            # the question are the ones the block carries, and `in_prompt` is
            # the one place that decides which — so the count cannot drift
            # from the block it is counting. Nothing is counted when there is
            # no block: an empty register applied nothing.
            if block:
                try:
                    await beliefs_service.mark_applied(
                        session, beliefs_service.in_prompt(rows))
                except SQLAlchemyError:
                    # A turn is never lost to a counter.
                    await session.rollback()
        return block, bound
    except SQLAlchemyError:
        return None, {}


async def _recall_for(username: str, history: list[dict],
                      thread_id: Optional[str]) -> Optional[str]:
    """
    What this person was told in EARLIER chats, or None.

    ONLY EARLY IN A CHAT. Once the conversation on screen has turns of its own,
    the client is replaying them and the referent for "up from what you said" is
    already in the prompt; sending this as well would pay for the same
    continuity twice on every follow-up. Below that, in-chat history cannot
    supply a referent at all — which is exactly when a past chat can.

    Read through the APPLICATION role, here, because neither of the loop's
    identities can see the george schema. Failure is never fatal: recall is a
    nicety, and an answer must not be lost to a lookup that could not run.
    """
    if len([t for t in history if t.get("role") == "user"]) >= 2:
        return None
    try:
        async with AsyncSessionLocal() as session:
            lines = await recent_figures(session, username, exclude_thread=thread_id)
        return as_block(lines)
    except SQLAlchemyError:
        return None


async def _safe_stream(question: str, user_id: Optional[str],
                       page_context: Optional[str],
                       pin_writer: PinWriter,
                       history: list[dict],
                       workflow_writer,
                       workflow_runner,
                       thread_id: Optional[str] = None,
                       recall: Optional[str] = None,
                       beliefs: Optional[str] = None,
                       belief_store=None,
                       parent_id: Optional[str] = None,
                       page_reader: Optional[PageReader] = None,
                       page_scope: Optional[dict] = None,
                       page_writer: Optional[PageWriter] = None,
                       page_references: Optional[list[dict]] = None,
                       memory_reader=None,
                       automations_reader=None,
                       decisions_reader=None,
                       standing_writer=None,
                       watch_writer=None,
                       desk: Optional[dict] = None,
                       bound_settings: Optional[dict] = None) -> AsyncIterator[str]:
    """
    Wrap the loop so a crash still closes the stream cleanly.

    Once the response has started, an exception cannot become an HTTP error —
    the client has already had a 200. It has to arrive as an SSE `error` frame,
    or the frontend hangs waiting for `done`.
    """
    try:
        async for frame in bob_loop.run(
            question,
            user_id=user_id,
            page_context=page_context,
            pin_writer=pin_writer,
            history=history,
            workflow_writer=workflow_writer,
            workflow_runner=workflow_runner,
            thread_id=thread_id,
            beliefs=beliefs,
            belief_store=belief_store,
            recall=recall,
            parent_id=parent_id,
            page_reader=page_reader,
            page_scope=page_scope,
            page_writer=page_writer,
            page_references=page_references,
            memory_reader=memory_reader,
            automations_reader=automations_reader,
            decisions_reader=decisions_reader,
            standing_writer=standing_writer,
            watch_writer=watch_writer,
            desk=desk,
            bound_settings=bound_settings,
        ):
            yield frame
    except Exception as exc:  # noqa: BLE001
        payload = json.dumps({"message": f"{type(exc).__name__}: {exc}"})
        yield f"event: error\ndata: {payload}\n\n"
        yield f"event: done\ndata: {json.dumps({'status': 'error'})}\n\n"


@router.post("/ask")
async def ask(
    request: AskRequest,
    user: AppUser = Depends(_bob_user),
) -> StreamingResponse:
    """
    Ask Bob a question. Streams Server-Sent Events.

    Frames, in the order a client will normally see them:
        start        conversation_id, whether logging is active
        thinking     summarized reasoning deltas
        tool_call    {seq, tool, arguments}
        tool_result  {seq, tool, row_count, source_table, truncated, duration_ms}
        notice       {kind, message}   — a caveat the answer must carry
        pinned       {pin_id, title, page, pins_on_page, tool_calls}
        post         {question_post_id, answer_post_id, thread_id,
                     conversation_id, visibility, stored} — the turn's two
                     posts in the river. `stored` is false when logging is off
                     or failed, and a client must not render a post that does
                     not exist.
        text         answer deltas
        answer_reset {reason} — discard the deltas so far; the answer is being
                     rewritten. A client that ignores this shows the answer twice.
        warning      {reason}          — unsurfaced_notice | notice_forced | logging_failed
        error        {message}
        done         {conversation_id, iterations, tool_calls, status, usage}

    tool_result carries a SUMMARY, never the rows. A single call can return 200
    wide rows; streaming those would dwarf the answer and duplicate data the
    model has already read.

    Authenticated, behind Bob's own page — the same gate as /bob/pins.
    That is what lets an answer be pinned from the conversation: the pin is
    written as the caller, and there is no anonymous route to a write.

    The loop holds no conversation state between requests, so a follow-up like
    "pin that" only has a referent if the client replays the turns before it in
    `history`. Send it, or every question stands alone.
    """
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="question must not be empty")

    # Continuing a thread: the caller's own conversation, or one Bob opened
    # at org level (app.services.thread_access). Checked HERE, before any
    # frame is sent, because once the stream has started a refusal can only
    # arrive as an error frame — and because the loop's own role cannot read.
    # Not found and not continuable are the same answer, as for pins.
    if request.thread_id is not None and not await _thread_continuable(
        user.username, request.thread_id
    ):
        raise HTTPException(status_code=404, detail="No thread with that id you can continue.")

    # A reply names a post in the thread it is replying to, and nowhere else.
    if request.parent_id is not None:
        if request.thread_id is None:
            raise HTTPException(status_code=400, detail="parent_id needs a thread_id.")
        if not await _parent_in_thread(user.username, request.thread_id, request.parent_id):
            raise HTTPException(status_code=404, detail="No post with that id in this thread.")

    history = [t.model_dump() for t in request.history]
    thread = str(request.thread_id) if request.thread_id else None
    parent = str(request.parent_id) if request.parent_id else None

    # The page in scope, as an identity the caller owns. Only when a page is
    # in scope: without one there is nothing to read, and the tool stays out
    # of the schema. Nothing is read here — the page is looked up only if
    # Bob decides the question needs it. The title travels beside the id
    # for the sentence Bob is given; it binds nothing.
    page_reader: Optional[PageReader] = None
    page_scope: Optional[dict] = None
    if request.page_scope is not None:
        page_scope = await _resolve_scope(user.username, request.page_scope)
    if page_scope is not None:
        page_reader = _page_reader(user.username, page_scope["page_id"])
    # Awaited here rather than inside the stream: it is a read the caller's own
    # role performs, and it has to be done before the 200 goes out, while a
    # failure can still be handled as something other than an error frame.
    recall = await _recall_for(user.username, history, thread)
    # Every turn, unlike recall: a view is the frame a question is read in.
    held_beliefs, bound_settings = await _beliefs_for()
    # Lightweight owner-scoped discovery: no pin replay or business query.
    async with AsyncSessionLocal() as session:
        page_references = [
            {"page_id": str(p.id), "title": p.title}
            for p in (await page_writer.list_pages(session, user.username))[:page_writer.MAX_PAGES_PER_OWNER]
        ]

    return StreamingResponse(
        _safe_stream(
            request.question,
            user_id=user.username,
            page_context=request.page_context,
            pin_writer=_pin_writer(user.username),
            history=history,
            workflow_writer=(_WorkflowWriter(user.username, user.role)
                             if settings.GEORGE_ENABLE_WORKFLOW_WRITES else None),
            workflow_runner=_workflow_runner(user.username, user.role),
            thread_id=thread,
            recall=recall,
            beliefs=held_beliefs,
            belief_store=_belief_store(user.username, thread),
            parent_id=parent,
            page_reader=page_reader,
            page_scope=page_scope,
            page_references=page_references,
            # Always: the two things that are his and that he cannot otherwise
            # see. Every signed-in caller gets both — they read nothing but
            # Bob's own record.
            memory_reader=_memory_reader(user.username),
            automations_reader=_automations_reader(user.username),
            # Always: what people did with what he raised, so the agenda can
            # learn from it. Shared, so bound to nobody.
            decisions_reader=_decisions_reader(),
            # Always: every signed-in caller may have Bob keep a question
            # and ask it on a schedule. Bound to them; the tool has no owner
            # argument.
            standing_writer=_standing_writer(user.username),
            # Always: every signed-in caller may keep watches of their own.
            watch_writer=_watch_writer(user.username),
            # The desk, bounded by the model above; an empty one is nothing.
            desk=request.desk.model_dump(exclude_none=True) if request.desk else None,
            # What a person told him to leave out, bound (P2S.11): the reads
            # apply it and say so; the model never sees the value.
            bound_settings=bound_settings or None,
            # Always: every signed-in caller may build and edit their own
            # pages. "This page" is the resolved scope, or nothing.
            page_writer=_PageWriter(
                user.username,
                uuid.UUID(page_scope["page_id"])
                if page_scope and page_scope.get("page_id") else None,
            ),
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


# ---------------------------------------------------------------------------
# The desk: a replay, and the definitions it is drawn from
#
# A window change on the workspace re-runs calls a person already has on
# screen with one scope argument changed. No model is consulted — this is the
# pin's path: the same validation (read tools only, the pin's own limit) and
# the same runner, returning the same {rows, meta, notices} per call with the
# full receipts a tile shows. It is TRANSIENT (metrics.yaml surface.desk.replay):
# nothing is written, and the record of the change is the next question, which
# carries the window in `desk.window`.
# ---------------------------------------------------------------------------

class ReplayRequest(BaseModel):
    """
    One stored call, one changed argument.

    The call is named, not sent: `post` and `seq` address a call the loop
    recorded, and the arguments come off that record. There is nowhere in this
    body to put a tool name or an argument list, which is the point — the
    endpoint used to take a whole call list from the client and run it.
    """

    post: uuid.UUID
    seq: int = Field(..., ge=0)
    argument: str = Field(..., min_length=1, max_length=32)
    #: A word, a number, a list of words, or null to take the argument off.
    #: Shape-bounded in the service against `surface.desk.replay`.
    value: Any = None


class ReplayOut(BaseModel):
    """
    The read, its receipts, and the object the board draws for it.

    `status` is the pin runner's — ok, refused, unrunnable, failed — and
    `refusal` carries the tool's own words whenever it is not ok. `recorded`
    is the UPDATE's own answer, never an assumption: a turn whose post was
    never written records nothing and this says so (UI rule 8).
    """

    status: str
    tool: str
    seq: int
    argument: str
    #: What the stored call had, so the change itself has a receipt.
    was: Any = None
    value: Any = None
    #: The arguments that actually ran, whole.
    arguments: dict[str, Any]
    rows: List[dict[str, Any]]
    #: False when the read returned more rows than a screen is sent, in which
    #: case `rows` is empty: all of them or none, never a prefix (loop.py
    #: MAX_ROWS_TO_CLIENT). The board does not move, and the room says so in
    #: the definitions' own sentence (`replay.rows_incomplete_says`).
    rows_complete: bool
    meta: dict[str, Any]
    notices: List[dict[str, Any]]
    refusal: Optional[str] = None
    #: The board frame — validated blocks from agent/default_composition, which
    #: names a shape for rows and never says a word about them. Empty for a
    #: refusal, for no rows, and for more rows than a screen is sent.
    blocks: List[dict[str, Any]]
    duration_ms: int
    recorded: bool
    ran_at: datetime


@router.post("/replay", response_model=ReplayOut)
async def replay(
    request: ReplayRequest,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> ReplayOut:
    """
    Re-run one stored read with ONE scope argument changed. No model.

    Validated exactly as a pin is before anything runs: a write, a composite,
    an unknown tool or an argument the definitions no longer accept is a 422
    with the runner's own words, and so is an argument a replay may not change
    at all. A post that is not the caller's, or a call that answer never kept,
    is a 404 — not found and not yours are one answer.

    A refusal from the tool at run time — a comparison over a window still in
    progress — is a **200** carrying that status and the tool's own sentence,
    because the tool declining to mislead is a real answer the workspace has to
    draw rather than an error to swallow.
    """
    try:
        outcome = await replay_service.replay(
            db, username=user.username, post_id=request.post, seq=request.seq,
            argument=request.argument, value=request.value,
        )
    except replay_service.ReplayNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except replay_service.ReplayRefused as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ReplayOut(**outcome)


class DeskWindowDef(BaseModel):
    """One date preset, as the definitions state it."""

    name: str
    includes_partial_day: bool
    closed_alternative: Optional[str] = None
    relative: dict[str, Any] = Field(default_factory=dict)


class DeskLocation(BaseModel):
    """A place in the business, from the one store list (metrics.yaml stores)."""

    id: str
    display_name: str
    kind: Literal["retail", "warehouse"]


class DeskAlternative(BaseModel):
    """
    One value a token may be moved to, the word for it, and what it answers to.

    `spellings` is what a person may TYPE to mean this alternative, resolved
    here from the definitions (`surface.desk.tokens.spoken` and the names the
    presets and the store list already carry). It is a list and not a rule:
    the client matches a fragment against it exactly, so there is no stemmer
    and no fuzzy match anywhere, and what resolves is only ever what the
    definitions say resolves.
    """

    value: Any
    label: str
    spellings: List[str]
    #: The word `permitted_by` names this alternative by, for a token whose
    #: alternatives depend on something the call carries. None for one whose
    #: alternatives are the same on every call.
    permit_key: Optional[str] = None


class DeskPermit(BaseModel):
    """
    Which alternatives a call actually permits, and what decides it.

    A `group_by` token offering a cut the tool will refuse is worse than no
    token: `net_sales` is transaction grain and declines a product grouping in
    its own sentence. What a call permits therefore depends on the METRIC it
    carries, and this is that dependency said once, here, from
    `metrics.<metric>.valid_group_by` — not a rule a client works out.
    """

    #: The argument on the stored call whose value decides. `metric`, today.
    argument: str
    #: Each value of it, to the `permit_key`s it allows.
    permits: dict[str, List[str]]


class DeskToken(BaseModel):
    """
    One argument the loop accepted, as a thing a person can move.

    `kind` is the fragment kind that moving it IS
    (`surface.desk.fragments.kind_by_argument`): a navigation change is
    answered by the replay alone, an analytical one draws the replay and still
    asks Bob to read it. The alternatives are resolved here, from the
    definitions that bound the argument, so no client holds a list of windows,
    shops or dimensions of its own.
    """

    argument: str
    kind: str
    label: str
    alternatives: List[DeskAlternative]
    #: Present when the alternatives depend on what the call carries; the
    #: client keeps only the ones every read it would move permits.
    permitted_by: Optional[DeskPermit] = None


class DeskEstatePart(BaseModel):
    """
    One part of the estate a question may be scoped to (P2.g).

    The pill's own words and the places behind them, both out of metrics.yaml:
    `label` and `says` are what it reads, `places` is the store list it covers
    resolved to display names here, so no client holds a shop's name or counts
    one. What a part MEANS — which domain answers for it, what it is excluded
    from — is not served: that is Bob's to be told on the question, and a
    client drawing a pill has no use for it.

    `count_places` LIVED HERE AND IS GONE (2026-09-15). It drew "7 shops" on
    the one pill that was a plural common noun, and that pill went when the
    owner folded the warehouses into the business they belong to. A field no
    part sets is a channel whose absence nobody can see, which is the lesson
    P2.l is named after — so it is deleted rather than kept for a pill that
    might come back.
    """

    key: str
    label: str
    says: Optional[str] = None
    #: The display names of the places this part covers, from `stores`. Empty
    #: for a business whose places are not shops — vending's are machines.
    places: List[str]


class DeskEstate(BaseModel):
    """The switch itself: what it is called, what it does when untouched, its parts."""

    label: str
    #: The part a question is on before anybody presses anything. It narrows
    #: nothing and is not sent.
    default: str
    parts: List[DeskEstatePart]


class DeskDefinitions(BaseModel):
    """
    Everything the workspace reads from the definitions, in one read.

    NOTHING HERE IS A FIGURE. The business's name, the date presets and which
    are still in progress, which argument carries a window per tool, the
    resting reads, the selection bounds and the locations — all of it is
    `metrics.yaml`, served so the client never keeps a copy that can drift.
    """

    business: dict[str, Any]
    windows: List[DeskWindowDef]
    window_arguments: dict[str, str]
    rest_reads: List[dict[str, Any]]
    selection: dict[str, Any]
    direct_manipulation: List[str]
    locations: List[DeskLocation]
    #: The subject dimensions SOME metric can be broken down by.
    #:
    #: Not the headline metric's own `valid_group_by`: net sales is
    #: transaction grain and refuses a product grouping, while the
    #: investigation ladder localizes by product through product_revenue
    #: (metrics.yaml investigation.ladder.localize). So "is a product
    #: breakdown a thing that exists here" is a question about the
    #: DEFINITIONS, answered here rather than guessed by a client that
    #: cannot see them.
    breakdown_dimensions: List[str]
    #: Which businesses a question may be scoped to, and the places each
    #: covers (metrics.yaml surface.desk.estate). The pills are drawn from
    #: this and from nothing else.
    estate: DeskEstate
    #: The tokens a drawn read may carry, in the order the definitions list
    #: them, with every alternative resolved (metrics.yaml
    #: surface.desk.tokens). A client draws what it is given.
    tokens: List[DeskToken]
    #: `surface.desk.replay`, verbatim. Where each argument LANDS in a call's
    #: own arguments, which argument a composed control names, which changes
    #: can change the shape of the rows, and how much of the record is read
    #: back on opening. A client reads a token's current value and decides
    #: what to redraw from this rather than keeping a copy of any of it.
    replay: dict[str, Any]
    #: The bounds and words a fragment is resolved by (surface.desk.fragments):
    #: how short a fragment may be, and the one token that costs a turn.
    fragments: dict[str, Any]
    #: WHICH NOTICES THE ROOM DRAWS (surface.desk.notices, UI rule 4 as changed
    #: 2026-09-17): the kinds that only explain how a figure was measured, and
    #: the kinds that say it may be wrong. A client draws any kind not in
    #: `explains_only`, so an unlisted kind is shown.
    notices: dict[str, List[str]]


def _desk_tokens(
    desk: Mapping[str, Any],
    metrics: Mapping[str, Any],
    windows: List[DeskWindowDef],
    locations: List[DeskLocation],
    dimensions: List[str],
) -> List[DeskToken]:
    """
    The tokens a read may carry, with every alternative resolved here.

    THE ALTERNATIVES ARE THE DEFINITIONS', NOT A CLIENT'S. Each list below is
    the one this endpoint already serves — the date presets, the store list,
    the dimensions some metric permits a grouping by — so a token can only
    offer a scope the definitions already bound. `counts` is the one list that
    exists nowhere else and it is in the yaml
    (`surface.desk.tokens.counts`), not here.

    An argument with no alternatives is not a token. `rank_by` is the case:
    its values are each tool's own, and a control that cannot show what it
    could be moved to is a label wearing a button's clothes.
    """
    spec = _req(desk, "tokens")
    kinds = _req(desk, "fragments.kind_by_argument")
    counts = [int(n) for n in _req(desk, "tokens.counts")]
    # group_by is a LIST argument on every tool that takes one, so a token's
    # value is the list the tool would have received — never the bare word.
    spoken = _req(desk, "tokens.spoken")
    # WHICH GROUPINGS EACH METRIC PERMITS, from the metrics themselves. The
    # union is what a token could ever offer; `permitted_by` is what any one
    # call may actually be moved to. A grouping absent from every metric is
    # not a thing that exists, and a dimension with no word for it (the
    # definitions' `spoken`) has no way to be typed and so is not offered.
    permits = {
        name: [g for g in (metric.get("valid_group_by") or []) if g in spoken]
        for name, metric in metrics.items()
        if isinstance(metric, dict) and metric.get("valid_group_by")
    }
    groupings = [d for d in dimensions if any(d in p for p in permits.values())]
    groupings += [g for g in dict.fromkeys(
        g for allowed in permits.values() for g in allowed) if g not in groupings]
    choices: dict[str, List[DeskAlternative]] = {
        "window": [
            DeskAlternative(value=w.name, label=w.name.replace("_", " "),
                            spellings=[w.name, w.name.replace("_", " ")])
            for w in windows
        ],
        "store": [
            DeskAlternative(value=loc.id, label=loc.display_name,
                            spellings=[loc.display_name])
            for loc in locations
        ],
        "group_by": [
            DeskAlternative(value=[d], label=f"by {d}", permit_key=d,
                            spellings=[f"by {d}", *[str(w) for w in spoken.get(d, [d])]])
            for d in groupings
        ],
        "top_n": [
            DeskAlternative(value=n, label=f"top {n}", spellings=[f"top {n}", str(n)])
            for n in counts
        ],
    }
    labels = {"window": "window", "store": "shop", "group_by": "grouped",
              "top_n": "how many"}
    out: List[DeskToken] = []
    for argument in _req(desk, "tokens.arguments"):
        alternatives = choices.get(str(argument)) or []
        if not alternatives:
            continue
        for alternative in alternatives:
            alternative.spellings = list(dict.fromkeys(alternative.spellings))
        out.append(DeskToken(
            argument=str(argument),
            kind=str(kinds[str(argument)]),
            label=labels.get(str(argument), str(argument)),
            alternatives=alternatives,
            permitted_by=(DeskPermit(argument="metric", permits=permits)
                          if str(argument) == "group_by" else None),
        ))
    return out[: int(spec["max_tokens"])]


def _desk_estate(defs: Mapping[str, Any]) -> DeskEstate:
    """
    The estate switch, with every part's places resolved from `stores` (P2.g).

    A part names the LISTS it covers and never the shops in them, so opening a
    shop moves the pill, the sentence Bob is told and the ids behind them in
    one edit. The resolution happens here, once, rather than in a client that
    would then be holding a copy of the store list — the thing CLAUDE.md says
    lives in metrics.yaml and nowhere else.
    """
    estate = _req(defs, "surface.desk.estate")
    parts: List[DeskEstatePart] = []
    for part in _req(estate, "parts"):
        places: List[str] = []
        for path in part.get("places_from") or []:
            for entry in _req(defs, str(path)) or []:
                name = entry.get("display_name") or entry.get("name")
                if name and name not in places:
                    places.append(str(name))
        # A PART MAY TAKE ITS NAME FROM THE DEFINITIONS rather than typing it
        # again: the business is named once, in `surface.desk.business.name`,
        # and a rename there has to reach the pill.
        label = part.get("label") or _req(defs, str(part["label_from"]))
        parts.append(DeskEstatePart(
            key=str(part["key"]),
            label=str(label),
            says=(str(part["says"]) if part.get("says") else None),
            places=places,
        ))
    return DeskEstate(label=str(_req(estate, "label")),
                      default=str(_req(estate, "default")), parts=parts)


@router.get("/definitions/desk", response_model=DeskDefinitions)
async def desk_definitions(user: AppUser = Depends(_bob_user)) -> DeskDefinitions:
    defs = _load_defs()
    desk = _req(defs, "surface.desk")
    presets = _req(defs, "sales_day.presets")
    windows = [
        DeskWindowDef(
            name=name,
            includes_partial_day=bool(p.get("includes_partial_day")),
            closed_alternative=p.get("closed_alternative"),
            relative=dict(p.get("relative") or {}),
        )
        for name, p in presets.items()
    ]
    locations = [
        DeskLocation(id=s["id"], display_name=s["display_name"], kind="retail")
        for s in _req(defs, "stores.active_retail")
    ] + [
        DeskLocation(id=s["id"], display_name=s["display_name"], kind="warehouse")
        for s in _req(defs, "stores.warehouse")
    ]
    # Every subject dimension at least one metric permits a grouping by.
    dimensions = [str(d) for d in _req(desk, "selection.dimensions")]
    groupable = {
        g
        for metric in (_req(defs, "metrics") or {}).values()
        if isinstance(metric, dict)
        for g in (metric.get("valid_group_by") or [])
    }

    return DeskDefinitions(
        business=dict(_req(desk, "business")),
        estate=_desk_estate(defs),
        breakdown_dimensions=[d for d in dimensions if d in groupable],
        tokens=_desk_tokens(desk, _req(defs, "metrics"), windows, locations,
                            [d for d in dimensions if d in groupable]),
        replay={
            **dict(_req(desk, "replay")),
            # THE WORDS A READER MUST NEVER SEE, served with the sentence that
            # replaces them (the dogfood log, 2026-09-15). One definition, in
            # `voice.prose.leaks`, already used to scan the ANSWER; the token
            # row now checks a tool's refusal against the same list rather
            # than a component keeping a second copy of it.
            "leaks": [str(w) for w in _req(defs, "surface.prose.leaks")],
        },
        fragments=dict(_req(desk, "fragments")),
        notices={k: [str(x) for x in v] for k, v in dict(_req(desk, "notices")).items()},
        windows=windows,
        window_arguments=dict(_req(defs, "workflows.backtest.window_arguments")),
        rest_reads=[dict(r) for r in _req(desk, "rest.reads")],
        selection=dict(_req(desk, "selection")),
        direct_manipulation=[str(op) for op in _req(desk, "direct_manipulation")],
        locations=locations,
    )


# ---------------------------------------------------------------------------
# `@` — a name resolved to an id before the question is sent (P2.c)
#
# The second door onto the selection. A subject tapped on a row carries the id
# that row held; a subject TYPED had nothing, so "Rockwell" reached Bob as a
# word with two meanings in this estate. Completion is over things that exist,
# each from the read that already defines it, and what each kind binds is the
# definitions' to say (surface.desk.selection.mentions).
#
# NO MODEL, NO WRITE, AND NOTHING HERE IS A FIGURE. The only numbers that reach
# this response are a count of purchase orders beside a supplier's name, which
# is the same kind of thing the work line is allowed to say: a count of rows,
# opening nothing.
# ---------------------------------------------------------------------------

_MENTION_MAX_QUERY = 60


class MentionCandidate(BaseModel):
    """One thing an `@` could mean, and what picking it would do."""

    kind: str
    #: What travels. A store id, a product id, the supplier's exact name (there
    #: is no supplier master), a page id, a workflow id.
    id: str
    label: str
    #: The one word that tells three things of the same name apart.
    says: str
    #: `selection`, `page_scope` or `named_on_question` — the definitions'.
    binds: str
    #: The subject dimension a selected mention travels as, or null.
    dimension: Optional[str] = None
    #: What distinguishes two of a kind: a SKU, a purpose, a status. Never a figure.
    hint: Optional[str] = None


class MentionsOut(BaseModel):
    """
    What answers to what has been typed, and which sources could not be read.

    `unavailable` is not an error channel dressed up: a kind that failed and a
    kind with nothing in it render differently, because "no supplier by that
    name" and "the purchasing read did not come back" are different facts
    (UI rule 8).
    """

    query: str
    candidates: List[MentionCandidate]
    unavailable: dict[str, str] = Field(default_factory=dict)


@router.get("/mentions", response_model=MentionsOut)
async def mentions(
    q: str = Query("", max_length=_MENTION_MAX_QUERY),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> MentionsOut:
    """
    Everything a typed `@` could mean: shops, products, suppliers, the
    caller's own pages and the company's saved rules.

    The two catalogue reads run on Bob's read-only role in worker threads —
    the tools are synchronous and blocking, and holding the event loop while
    somebody types would stall every other request in this process. The pages
    and rules are read in the caller's own session, as their own routes do.
    """
    found = await mentions_service.resolve(db, username=user.username, query=q)
    return MentionsOut(
        query=found["query"],
        candidates=[MentionCandidate(**c) for c in found["candidates"]],
        unavailable=found["unavailable"],
    )


@router.get("/tools")
async def list_tools() -> dict:
    """
    The tool schemas the loop hands the model, generated from the live
    signatures and definitions. Useful for confirming what Bob can actually
    do without reading the source, and for spotting a definitions change that
    silently altered the tool surface.

    The write surface is included and flagged. It is listed here because this is
    the answer to "what can Bob do", and a tool that writes is the part of
    that answer worth being able to see. A real session only receives it when a
    writer was injected — see the module docstring.
    """
    schemas = bob_loop.build_tool_schemas(include_write=True)
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
