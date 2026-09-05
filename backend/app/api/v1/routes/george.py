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

import asyncio
import json
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncIterator, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services.chat_history import build_turns, question_of, title_of
from app.services.george_greeting import build_greeting
from app.services.george_recall import as_block, recent_figures
from app.services.river import (
    DEFAULT_LIMIT as RIVER_LIMIT,
    MAX_LIMIT as RIVER_MAX,
    build_river,
    next_cursor,
    thread_of,
)
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
from tools import brief as brief_tool  # noqa: E402
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


async def _thread_belongs_to(username: str, thread_id: uuid.UUID) -> bool:
    """One SELECT, before the stream opens: the loop itself cannot read."""
    async with AsyncSessionLocal() as session:
        row = (
            await session.execute(
                text(
                    f"SELECT 1 FROM george.conversations c "
                    f"WHERE {_THREAD} = :t AND c.user_id = :u AND {_VISIBLE} LIMIT 1"
                ),
                {"t": thread_id, "u": username},
            )
        ).first()
        return row is not None


# ---------------------------------------------------------------------------
# The opening line
#
# WHY THIS ROUTE EXISTS RATHER THAN A CALL TO /api/v1/brief. That endpoint is
# gated by BRIEF_TOKEN — a shared secret scoped so that a leak costs the morning
# brief and nothing else (routes/brief.py). Handing it to every browser that
# loads George would destroy exactly that scoping. So the SOURCE is reused and
# the DOOR is not: this calls the same tools.brief.get_brief(), behind the same
# gate /george/chats and /george/pins already sit behind. /api/v1/brief and its
# token are untouched and remain the scheduler's.
# ---------------------------------------------------------------------------

class FollowUp(BaseModel):
    """One chip: a short label, and the question it actually asks."""

    label: str
    question: str


class GreetingResponse(BaseModel):
    """
    George's opening line, and the receipts under it.

    `kind` is item | quiet | could_not_look, and the third is not a variant of
    the second: it means a section of the brief COULD NOT RUN. See
    app/services/george_greeting.py.
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
    # QUESTION, not a staged answer: clicking one asks George in the ordinary
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
    user: AppUser = Depends(_george_user),
) -> GreetingResponse:
    """
    What George says before he is asked anything.

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
# One append-only timeline of everything George does and says, and everything
# anyone says to him. Read-only here: C.1 renders the history that already
# exists (backfilled from george.conversations by n8o9p0q1r2s3), and the live
# write path arrives in C.2.
#
# VISIBILITY IS APPLIED IN SQL AND NOWHERE ELSE. `visibility = 'org' OR
# author_user = :me` — George's own posts are company-level facts, a person's
# question is theirs until they share it (CLAUDE.md, "The river"). A filter
# written in Python is a filter somebody can forget to call.
# ---------------------------------------------------------------------------

# Posts a caller may see. The one place this is expressed.
# owner_user, NOT author_user. George writes the answers and has no account,
# so filtering on the author made every private answer invisible to everyone —
# 125 of 125, measured (alembic p0q1r2s3t4u5).
_POST_VISIBLE = "p.hidden_at IS NULL AND (p.visibility = 'org' OR p.owner_user = :me)"

_POST_COLUMNS = (
    "p.id, p.thread_id, p.parent_id, p.kind, p.author, p.author_user, "
    "p.visibility, p.owner_user, p.body, p.payload, p.receipts, p.notices, "
    "p.conversation_id, p.created_at"
)


class RiverPost(BaseModel):
    """One post. Every George post carries its receipts and its notices."""

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
    #: flagged store is one George had something to say about.
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


@router.get("/status", response_model=StatusBand)
async def status_band(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_george_user),
) -> StatusBand:
    """
    The state of things, for the band above the river.

    Built only from what is already stored: the store list from metrics.yaml,
    and freshness from the receipts on posts. No new scan, no tool call — this
    runs on every load of George's home and must cost a couple of indexed
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
        # it is a name George had something to say about.
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


@router.get("/river", response_model=RiverPage)
async def read_river(
    limit: int = Query(RIVER_LIMIT, ge=1, le=RIVER_MAX),
    before: Optional[str] = Query(
        None, description="Read the page above this ISO timestamp. Omit for the newest."
    ),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_george_user),
) -> RiverPage:
    """
    The river, newest page first, rendered oldest-first within the page.

    Read newest-first so paging backwards never counts from the beginning of
    history; reversed for rendering so the page reads top-to-bottom like any
    thread. Both facts live in app.services.river, not in a client.
    """
    params: dict[str, Any] = {"me": user.username, "limit": limit}
    cursor = ""
    if before:
        try:
            params["before"] = datetime.fromisoformat(before)
        except ValueError as exc:
            raise HTTPException(
                status_code=422, detail="before must be an ISO timestamp."
            ) from exc
        cursor = " AND p.created_at < :before"

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
    user: AppUser = Depends(_george_user),
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
    user: AppUser = Depends(_george_user),
) -> List[RiverPost]:
    """
    One thread, oldest first.

    Same visibility filter, so a thread cannot be a way around it: a private
    post in someone else's thread is simply not returned, and an empty result
    is a 404 rather than a blank thread that implies something was hidden.
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
        raise HTTPException(status_code=404, detail="No thread with that id.")
    return [RiverPost.model_validate(p) for p in thread_of(rows, user.username)]


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
        question=question_of(rows[0]["question"]),
        turns=[ChatTurn.model_validate(t) for t in turns],
    )


# response_class=Response is load-bearing, as in george_pins: FastAPI asserts
# at import that a 204 route declares no body, and `-> None` counts as one.
@router.delete("/chats/{thread_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def delete_chat(
    thread_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_george_user),
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
                       recall: Optional[str] = None) -> AsyncIterator[str]:
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
            recall=recall,
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

    history = [t.model_dump() for t in request.history]
    thread = str(request.thread_id) if request.thread_id else None
    # Awaited here rather than inside the stream: it is a read the caller's own
    # role performs, and it has to be done before the 200 goes out, while a
    # failure can still be handled as something other than an error frame.
    recall = await _recall_for(user.username, history, thread)

    return StreamingResponse(
        _safe_stream(
            request.question,
            user_id=user.username,
            page_context=request.page_context,
            pin_writer=_pin_writer(user.username),
            history=history,
            workflow_writer=_WorkflowWriter(user.username, user.role),
            workflow_runner=_workflow_runner(user.username, user.role),
            thread_id=thread,
            recall=recall,
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
