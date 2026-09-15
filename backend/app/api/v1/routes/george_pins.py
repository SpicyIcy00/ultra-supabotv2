"""
Pins — answers that became live tiles.

A pin stores the TOOL CALLS behind an answer and re-runs them on load, so a tile
shows current numbers rather than a frozen one. CLAUDE.md: "A pin re-runs; a
save is the rule it re-runs." Nothing here stores an answer.

WRITES RUN ON THE APPLICATION ROLE, not on either George role. george_ro is
read-only and has no access to the george schema; george_log has INSERT without
SELECT and could never list a pin. This is the same split the StoreHub import
uses: the app owns the metadata, george_ro still does George's reading. See the
migration (j4k5l6m7n8o9).

That holds for George pinning his own answer too. The `pin_answer` tool does not
connect to anything — routes/george.py hands the agent loop a writer bound to
the authenticated user, and it calls app.services.pin_writer.create_pin, the
same function this route calls. There is ONE write path, and it is not George's
to reach on his own.

USER SCOPING IS ENFORCED IN EVERY QUERY. george.pins deliberately has RLS off —
RLS with no policy is deny-all and returns zero rows with no error, which has
already bitten this database twice. Every read, update and delete filters on
created_by, and a pin belonging to someone else is a 404, not a 403: whether a
given pin id exists is not information a caller is entitled to.

A THREAD IS AN AXIS OF ITS OWN (2026-09-15, P2.a). GET /?thread_id= answers
"has this conversation been kept, and where" by joining the pins to the
conversations IN that thread — pins carry the conversation they were made in,
and a thread is a list of those rows. It is refused alongside a page scope
rather than combined with one: two scopes on one listing means one was silently
ignored and the caller cannot tell which.

MEMBERSHIP (2026-09-07, by name; 2026-09-08, by id). A page is a row now
(routes/george_pages.py) and a pin points at it with `page_id` and holds a
`position` on it. PATCH /{pin_id} moves a pin by page id — or by TITLE, which
still creates a page under a new name, as the Pin dialog always could — places
it relative to another pin, or retitles it. The calls, the question, the
provenance and the run history are untouched and nothing is re-run. The two
name-keyed routes under /pages are kept for callers that have not moved to
ids: the listing now carries each page's id, and the rename resolves the exact
title to its row and keeps the id. ROUTE ORDER IS LOAD-BEARING: the /pages
routes are declared before /{pin_id} so that "pages" is never read as a pin id.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.george_pin import GeorgePin
from app.services import page_writer
from app.services.pin_runner import PinValidationError, run_pin
from app.services.thread_access import conversations_in_thread
from app.services.pin_writer import (
    UNSET,
    NotAPage,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    PinNotFound,
    PinQuotaError,
    SimilarPageError,
    create_pin as create_pin_row,
    rename_page as rename_page_rows,
    update_pin as update_pin_row,
)

router = APIRouter(tags=["george-pins"])

# Pins are George's, so they live behind George's page.
_pin_user = require_page("george")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ToolCallIn(BaseModel):
    tool: str = Field(..., min_length=1, max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)


class PinCreate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    question: Optional[str] = Field(None, max_length=2000)
    conversation_id: Optional[uuid.UUID] = None
    # Where it lands: by identity, or by title (an existing title joins that
    # page, a new title creates one). Neither means Ungrouped.
    page_id: Optional[uuid.UUID] = None
    page: Optional[str] = Field(None, max_length=100)
    tool_calls: List[ToolCallIn] = Field(..., min_length=1)
    # Set true to accept a page name that differs from an existing one only by
    # case. Without it the request is refused rather than forking the page.
    allow_similar_page: bool = False


class Placement(BaseModel):
    """
    Where on its page a pin goes, relationally. Exactly one field; never a raw
    integer — the service owns position arithmetic.
    """
    before: Optional[uuid.UUID] = None
    after: Optional[uuid.UUID] = None
    at: Optional[str] = Field(None, pattern="^(top|bottom)$")

    def as_place(self) -> dict:
        return {k: (str(v) if isinstance(v, uuid.UUID) else v)
                for k, v in self.model_dump().items() if v is not None}


class PinUpdate(BaseModel):
    """
    A membership, order or title change. A field left out is left alone;
    `page_id` (or `page`) sent as null means Ungrouped, which is how a pin
    leaves a page without being deleted. Pydantic tells the two apart through
    model_fields_set.
    """
    page_id: Optional[uuid.UUID] = None
    page: Optional[str] = Field(None, max_length=100)
    place: Optional[Placement] = None
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    allow_similar_page: bool = False


class PageRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    allow_similar_page: bool = False


class PageRenameOut(BaseModel):
    page_id: uuid.UUID
    page: str
    pins_moved: int


class PinOut(BaseModel):
    id: uuid.UUID
    title: str
    question: Optional[str]
    # The page's title, kept under its old key for every reader of it; and the
    # identity, which is what the client now navigates and scopes by.
    page: Optional[str]
    page_id: Optional[uuid.UUID]
    position: int
    conversation_id: Optional[uuid.UUID]
    tool_calls: List[dict]
    created_at: datetime
    last_run_at: Optional[datetime]
    last_ok_at: Optional[datetime]
    last_status: Optional[str]

    model_config = {"from_attributes": True}


class PageOut(BaseModel):
    """The legacy listing shape, with the id beside the name. Ungrouped is `page: null`."""
    page: Optional[str]
    page_id: Optional[uuid.UUID] = None
    pins: int


class PinRunOut(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    # One entry per stored tool call, each carrying its own status, full meta
    # and notices. Full meta, not the chat tool_result summary: a tile has to
    # show filters_applied and snapshot_timestamp.
    results: List[dict]
    notices: List[dict]
    last_ok_at: Optional[datetime]
    ran_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _owned(db: AsyncSession, pin_id: uuid.UUID, user: AppUser) -> GeorgePin:
    """Fetch a pin the caller owns, or 404. Never 403 — see the module docstring."""
    pin = (
        await db.execute(
            select(GeorgePin).where(
                GeorgePin.id == pin_id,
                GeorgePin.created_by == user.username,
            )
        )
    ).scalar_one_or_none()
    if pin is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pin not found.")
    return pin


def _similar_page_conflict(exc: SimilarPageError) -> HTTPException:
    """
    409, not a silent merge and not a silent fork. Two pages differing only by
    case is almost always a typo, but deciding that FOR the user would be a
    guess — so the collision is reported and they choose. Same rule as the
    store alias map: exact match or ask. One rendering for every route that
    can hit it, so the client recognises it by shape wherever it comes from.
    """
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": str(exc),
            "existing_page": exc.existing_page,
            "submitted_page": exc.submitted_page,
        },
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=PinOut, status_code=status.HTTP_201_CREATED)
async def create_pin(
    payload: PinCreate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> PinOut:
    """
    Pin an answer: store the tool calls behind it so the tile can re-run them.

    Every rule a pin carries lives in app.services.pin_writer.create_pin, not
    here — George pins his own answers through that same function when asked in
    conversation, and two implementations would drift. This route's own job is
    the HTTP shape: which refusal is a 422 and which is a 409.

    Every call is validated against the LIVE tool surface before it is stored.
    Storing a pin that cannot run means a tile that breaks later for no visible
    reason, so the failure happens here, while the user is still looking at the
    answer they tried to pin.
    """
    try:
        created = await create_pin_row(
            db,
            username=user.username,
            tool_calls=[c.model_dump() for c in payload.tool_calls],
            title=payload.title,
            question=payload.question,
            conversation_id=payload.conversation_id,
            page_id=payload.page_id if payload.page_id is not None else UNSET,
            page=payload.page if payload.page is not None else UNSET,
            allow_similar_page=payload.allow_similar_page,
        )
    except (PinValidationError, PageValidationError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except (PinQuotaError, PageQuotaError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc

    return PinOut.model_validate(created.row)


@router.get("", response_model=List[PinOut])
async def list_pins(
    page_id: Optional[uuid.UUID] = Query(None, description="Filter to one page, by id."),
    page: Optional[str] = Query(None, description="Filter to one page, by exact title (legacy)."),
    ungrouped: bool = Query(False, description="Only pins with no page."),
    thread_id: Optional[uuid.UUID] = Query(
        None, description="Only pins made in this thread, whatever page they sit on."
    ),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> List[PinOut]:
    """
    The caller's pins.

    Scoped to one page they come back in the page's order — by position — and
    Ungrouped comes back newest first, because it keeps no order. Unscoped
    they come back newest first across every page. A page id that is not the
    caller's is a 404; a title that matches none of their pages is an empty
    list, as it always was.

    `thread_id` IS A DIFFERENT AXIS, and it is what lets a thread say whether
    it has been kept (P2.a): a pin records the conversation it was made in, a
    thread is a list of conversations, so "the pins this thread produced" is
    that join and nothing more. It is refused alongside a page scope rather
    than combined with one — two scopes on one listing means one of them was
    silently ignored, and a caller cannot tell which. An empty list is a real
    answer: this thread has been kept nowhere.
    """
    scopes = [
        name for name, on in (
            ("page_id", page_id is not None), ("page", page is not None),
            ("ungrouped", ungrouped), ("thread_id", thread_id is not None),
        ) if on
    ]
    if len(scopes) > 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Give one scope, not {len(scopes)}: {', '.join(scopes)}.",
        )
    if thread_id is not None:
        ids = await conversations_in_thread(db, user.username, thread_id)
        if not ids:
            return []
        rows = (
            await db.execute(
                select(GeorgePin)
                .where(GeorgePin.created_by == user.username,
                       GeorgePin.conversation_id.in_(ids))
                .order_by(GeorgePin.created_at.desc(), GeorgePin.id.desc())
            )
        ).scalars().all()
        return [PinOut.model_validate(p) for p in rows]
    if ungrouped:
        return [PinOut.model_validate(p)
                for p in await page_writer.page_pins(db, user.username, None)]
    if page_id is not None:
        try:
            await page_writer.get_page(db, user.username, page_id)
        except PageNotFound as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        return [PinOut.model_validate(p)
                for p in await page_writer.page_pins(db, user.username, page_id)]
    if page is not None:
        found = await page_writer.find_page_by_title(db, user.username, page)
        if found is None:
            return []
        return [PinOut.model_validate(p)
                for p in await page_writer.page_pins(db, user.username, found.id)]

    stmt = (
        select(GeorgePin)
        .where(GeorgePin.created_by == user.username)
        .order_by(GeorgePin.created_at.desc(), GeorgePin.id.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [PinOut.model_validate(p) for p in rows]


@router.get("/pages", response_model=List[PageOut])
async def list_pages(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> List[PageOut]:
    """
    The caller's pages, with pin counts — the legacy listing, kept for the
    picker. Every real page is here, EMPTY ONES INCLUDED, each with its id;
    the ungrouped pins are reported as a page of None, without an id, when
    there are any. /george/pages is the full shape.
    """
    pages = await page_writer.list_pages(db, user.username)
    counts = dict((
        await db.execute(
            select(GeorgePin.page_id, func.count())
            .where(GeorgePin.created_by == user.username)
            .group_by(GeorgePin.page_id)
        )
    ).all())
    out = [PageOut(page=p.title, page_id=p.id, pins=counts.get(p.id, 0))
           for p in sorted(pages, key=lambda p: p.title)]
    if counts.get(None):
        out.append(PageOut(page=None, page_id=None, pins=counts[None]))
    return out


@router.patch("/pages/{page}", response_model=PageRenameOut)
async def rename_page(
    page: str,
    payload: PageRename,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> PageRenameOut:
    """
    Rename one of the caller's pages, named by its current exact title.

    Legacy route; PATCH /george/pages/{id} is the one by identity. The page
    keeps its id, so nothing bound to it moves. Another person's page of the
    same name is untouched. A rename to a case-variant of a DIFFERENT
    existing page is a 409 the caller resolves, as on create.
    """
    try:
        renamed = await rename_page_rows(
            db,
            username=user.username,
            old=page,
            new=payload.name,
            allow_similar_page=payload.allow_similar_page,
        )
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PinValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc
    return PageRenameOut(page_id=renamed.page_id, page=renamed.page,
                         pins_moved=renamed.pins_moved)


@router.patch("/{pin_id}", response_model=PinOut)
async def update_pin(
    pin_id: uuid.UUID,
    payload: PinUpdate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> PinOut:
    """
    Move one of the caller's pins to a page, off a page, place it on its
    page, or retitle it.

    `page_id` (identity) or `page` (title: existing, new, or null for
    Ungrouped) moves it; `place` puts it before or after another pin or at
    the top or bottom; both may travel together. Every page touched has
    dense positions again before this returns. The calls and the run history
    are not touched and the pin is not re-run: membership is not a figure.
    Somebody else's pin is a 404, and so is somebody else's page.
    """
    sent = payload.model_fields_set
    try:
        moved = await update_pin_row(
            db,
            username=user.username,
            pin_id=pin_id,
            page_id=payload.page_id if "page_id" in sent else UNSET,
            page=payload.page if "page" in sent else UNSET,
            place=payload.place.as_place() if payload.place is not None else UNSET,
            title=payload.title if "title" in sent else UNSET,
            allow_similar_page=payload.allow_similar_page,
        )
    except (PinNotFound, PageNotFound) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (PinValidationError, PageValidationError, NotAPage) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except PageQuotaError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc
    return PinOut.model_validate(moved.row)


# response_class=Response is load-bearing: FastAPI asserts at import time that a
# 204 route declares no response body, and a `-> None` annotation is enough to
# count as one. Without it the whole app fails to start, not just this route.
@router.delete("/{pin_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def delete_pin(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> Response:
    """
    Delete one of the caller's pins. A pin belonging to someone else is a 404.

    The page it sat on is renumbered so its positions stay dense — the same
    invariant every other write keeps — and the deletion is recorded on the
    page's audit as the pin leaving it.
    """
    await page_writer.lock_workspace(db, user.username)
    pin = await _owned(db, pin_id, user)
    if pin.page_id is not None:
        # Off the page first, through the one function that keeps the page
        # dense and writes the event; then the row goes.
        await page_writer.move_pin(db, owner=user.username, pin=pin, to_page=None)
    await db.execute(
        sa_delete(GeorgePin).where(
            GeorgePin.id == pin_id, GeorgePin.created_by == user.username
        )
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{pin_id}/run", response_model=PinRunOut)
async def run_pinned(
    pin_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> PinRunOut:
    """
    Re-run a pin's tool calls and return current figures with their receipts.

    Tools only — no model call. The result is deterministic, and a notice cannot
    go unsurfaced because nothing stands between meta.notice and the tile.

    A refusal or a rotted tool call is a 200 with that status on the call, not an
    HTTP error: the tile has to render those states, and an error status code
    would turn a real answer ("this SKU is three products") into a failed
    request. last_ok_at is returned so a failing tile can say when it last
    worked instead of only that it is broken.
    """
    pin = await _owned(db, pin_id, user)
    ran_at = datetime.now(timezone.utc)

    outcome = await run_pin(pin.tool_calls)

    pin.last_run_at = ran_at
    pin.last_status = outcome["status"]
    previous_ok = pin.last_ok_at
    if outcome["status"] == "ok":
        pin.last_ok_at = ran_at
    await db.flush()

    return PinRunOut(
        id=pin.id,
        title=pin.title,
        status=outcome["status"],
        results=outcome["results"],
        notices=outcome["notices"],
        # The PREVIOUS success, so a tile that just failed can say how old the
        # last good figure was. On a successful run this equals ran_at.
        last_ok_at=pin.last_ok_at if outcome["status"] == "ok" else previous_ok,
        ran_at=ran_at,
    )
