"""
Pages — real rows now, addressed by id.

A page is a person's ordered collection of pins, with a title and a one-line
purpose. It has existed as a row since 2026-09-08 (Page Workshop V1), which is
what lets it be EMPTY — opened, named and handed to Bob to fill — and what
lets its identity survive a rename: the URL, the thread scope, the reader and
the writer all hold the id, and the title is presentation.

EVERY RULE LIVES IN THE SERVICE, not here. app.services.page_writer is the one
write path for a page and for a pin's place on it; Bob's `create_page` and
`edit_page` reach the same functions through the writer routes/bob.py
injects. This router's own job is the HTTP shape: which refusal is a 404,
which a 409, which a 422.

A CREATE MAY CARRY THE PAGE'S FIRST SECTIONS (P2.a), and then it is one act:
POST goes through page_operations.build_page, the same function Bob's
`create_page` ends in, so the page and its pins commit together or not at all.
An empty create is that same call with no analyses — one path, not two. Ownership is enforced in every statement the service
makes, and a page belonging to someone else is a 404, not a 403 — whether a
given id exists is not information a caller is entitled to.

UNGROUPED IS NOT HERE. It is `pins.page_id IS NULL`, read through
GET /bob/pins?ungrouped=true, and it has no id to PATCH or DELETE. The
listing does not invent a row for it; the client draws it from the pins.

DELETE IS DELIBERATELY NARROW: it deletes the page ROW and moves every pin on
it to Ungrouped. No pin is deleted by any route in this module.

EVERY PAGE SHAPE CARRIES ITS KIND (W4.1) — dashboard, week, list or
collection — and it is never null: a page always draws as something, so when
nobody has said, the server DERIVES one from what the page's pins carry
(app/services/page_kind.py), on every read, never stored. `kind_set_by` says
which of "user", "bob" or "derived" it was, and `kind_draws` is the yaml's own
drawing rules for that kind, served with the page the way the window's options
are. PUT /{page_id} is the owner setting it by hand. A kind changes how the
page is DRAWN and nothing else.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.bob_pin import BobPin
from app.services import page_kind, page_operations, page_window, page_writer
from app.services.page_writer import (
    MAX_PURPOSE_LEN,
    MAX_TITLE_LEN,
    AmbiguousTarget,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    PinNotFound,
    SimilarPageError,
)
from app.services.pin_runner import PinValidationError
from app.services.pin_writer import PinQuotaError

router = APIRouter(tags=["bob-pages"])

_page_user = require_page("bob")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PageAnalysisIn(BaseModel):
    """
    One section of a page being created: a NEW analysis, or one the caller
    already has.

    A new one carries its calls, exactly as they ran, and the service validates
    every one against the live tool surface before the page row exists. An
    existing one carries only a pin_id. Giving both is refused in the service,
    where Bob's `create_page` is refused it too — one rule, one place.
    """

    title: Optional[str] = None
    tool_calls: Optional[list[dict[str, Any]]] = None
    pin_id: Optional[uuid.UUID] = None


class PageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LEN)
    purpose: Optional[str] = Field(None, max_length=MAX_PURPOSE_LEN)
    allow_similar_page: bool = False
    # THE PAGE AND ITS FIRST SECTIONS ARE ONE ACT (P2.a). "Keep as page" on a
    # thread is one gesture and must be one write: a page that came into being
    # with four of its five sections is a page nobody asked for. Absent or
    # empty creates the empty page this route has always created.
    analyses: Optional[list[PageAnalysisIn]] = None
    # Provenance, recorded on each pin the build creates — the question the
    # thread opened with and the conversation the calls ran in. Never used to
    # decide anything; it is what lets a kept thread find its page again.
    question: Optional[str] = None
    conversation_id: Optional[uuid.UUID] = None
    # WHAT KIND OF PAGE IT IS (W4.1) — how it is drawn, never what is on it.
    # Left out, nobody has said and the server derives one from the analyses
    # the page ends up carrying.
    kind: Optional[str] = None


class PageUpdate(BaseModel):
    """
    A title or purpose change. A field left out is left alone; `purpose` sent
    as null clears it. Pydantic tells the two apart through model_fields_set.
    """
    title: Optional[str] = Field(None, min_length=1, max_length=MAX_TITLE_LEN)
    purpose: Optional[str] = Field(None, max_length=MAX_PURPOSE_LEN)
    allow_similar_page: bool = False


class PageOut(BaseModel):
    id: uuid.UUID
    title: str
    purpose: Optional[str]
    created_at: datetime
    updated_at: datetime
    # How many pins sit on it. Zero is a real state — an empty page exists.
    pins: int
    # THE PAGE'S DATE WINDOW (W1.4). None: the page has no date filter.
    # Otherwise the preset picked (None: each analysis as kept), its words,
    # who set it and when, and the options — the yaml's presets, never a list
    # the client holds.
    window: Optional[dict[str, Any]] = None
    # WHAT KIND OF PAGE THIS IS (W4.1), and therefore how the room DRAWS it:
    # "dashboard", "week", "list" or "collection". NEVER NULL — a page always
    # draws as something, so when nobody has said the server derives one from
    # what the page's pins carry.
    kind: str
    # How it got that kind: "user" (the owner said), "bob" (he did) or
    # "derived" (nobody has, and it is worked out on every read).
    kind_set_by: str
    # One line, in a person's words, of what this kind of page is.
    kind_means: str
    # HOW THIS KIND DRAWS, from `pages.kinds.catalogue.<kind>.draws` — the
    # width each block shape takes, whether a run of consecutive single-figure
    # analyses groups into one row, whether the title reads as a head or a
    # caption, and whether the page carries a dateline. Served with the page
    # the way the window's options are, so no component holds a copy of a
    # layout rule (CLAUDE.md rule 3).
    kind_draws: dict[str, Any]


class PageWindowIn(BaseModel):
    """The window a person picked on the page: a preset, or null for each as kept."""
    preset: Optional[str] = None


class PageKindIn(BaseModel):
    """
    The kind the owner set by hand: how the page is DRAWN. One of the four in
    `pages.kinds.catalogue`; anything else is a 422 naming them.
    """
    kind: str


class PageDeletedOut(BaseModel):
    id: uuid.UUID
    title: str
    pins_ungrouped: int


class PageEventOut(BaseModel):
    id: uuid.UUID
    page_id: Optional[uuid.UUID]
    actor: str
    operation: str
    pin_id: Optional[uuid.UUID]
    before: Optional[dict[str, Any]]
    after: Optional[dict[str, Any]]
    conversation_id: Optional[uuid.UUID]
    at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _similar_page_conflict(exc: SimilarPageError) -> HTTPException:
    """The same 409 body the pins routes render, so the client recognises it by shape."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={
            "message": str(exc),
            "existing_page": exc.existing_page,
            "submitted_page": exc.submitted_page,
        },
    )


async def _counts(db: AsyncSession, username: str) -> dict[uuid.UUID, int]:
    rows = (
        await db.execute(
            select(BobPin.page_id, func.count())
            .where(BobPin.created_by == username, BobPin.page_id.isnot(None))
            .group_by(BobPin.page_id)
        )
    ).all()
    return {pid: n for pid, n in rows}


async def _calls(db: AsyncSession, username: str,
                 page_id: Optional[uuid.UUID] = None) -> dict[uuid.UUID, list[list[dict]]]:
    """
    Each of the caller's pages, as its pins' STORED CALLS in page order.

    What the kind is derived from (W4.1) and the only thing it is derived
    from: a tool name and its arguments. No title, no purpose, no word
    anybody wrote. Scoped to created_by in the statement, as every read of
    george.pins is.
    """
    statement = (
        select(BobPin.page_id, BobPin.tool_calls)
        .where(BobPin.created_by == username, BobPin.page_id.isnot(None))
        .order_by(BobPin.page_id, BobPin.position)
    )
    if page_id is not None:
        statement = statement.where(BobPin.page_id == page_id)
    out: dict[uuid.UUID, list[list[dict]]] = {}
    for pid, calls in (await db.execute(statement)).all():
        out.setdefault(pid, []).append(
            [dict(c) for c in (calls or []) if isinstance(c, dict)]
        )
    return out


def _window(stored: Any) -> Optional[dict[str, Any]]:
    """The page's window as the page draws it, with the yaml's options. Pure."""
    if not isinstance(stored, dict):
        return None
    preset = page_window.current(stored)
    return {"preset": preset, "label": page_window.label(preset),
            "set_at": stored.get("set_at"), "set_by": stored.get("set_by"),
            "options": page_window.options()}


def _out(page, pins: int, analyses: Optional[list[list[dict]]] = None) -> PageOut:
    kind, set_by = page_kind.resolve(
        getattr(page, "kind", None), getattr(page, "kind_set_by", None), analyses or [],
        has_date_window=getattr(page, "date_window", None) is not None,
    )
    return PageOut(id=page.id, title=page.title, purpose=page.purpose,
                   created_at=page.created_at, updated_at=page.updated_at, pins=pins,
                   window=_window(getattr(page, "date_window", None)),
                   kind=kind, kind_set_by=set_by, kind_means=page_kind.means(kind),
                   kind_draws=page_kind.draws(kind))


async def _one(db: AsyncSession, username: str, page) -> PageOut:
    """One page with its pin count and the calls its kind is derived from."""
    by_page = await _calls(db, username, page.id)
    analyses = by_page.get(page.id, [])
    return _out(page, len(analyses), analyses)


def _from_summary(summary: dict[str, Any]) -> PageOut:
    """
    A page as page_operations reports it, in this router's shape.

    The times arrive as ISO strings because that summary is also what reaches
    the MODEL, where a datetime cannot go. `_at` is defensive about a null
    rather than raising a 500 on one: the columns are written by the service on
    every path, and a page that exists with no time on it would still be a
    page, not a failed request.
    """
    def _at(value: Any) -> datetime:
        return datetime.fromisoformat(value) if isinstance(value, str) else datetime.now(timezone.utc)

    return PageOut(
        id=uuid.UUID(summary["page_id"]), title=summary["title"],
        purpose=summary["purpose"],
        created_at=_at(summary["created_at"]), updated_at=_at(summary["updated_at"]),
        pins=int(summary["analysis_count"]),
        window=_window(summary.get("window")),
        # The kind the service already resolved for this page (W4.1) — never
        # derived a second time here, so the button and Bob's own sentence
        # describe the same page the same way.
        kind=str(summary["kind"]), kind_set_by=str(summary["kind_set_by"]),
        kind_means=str(summary["kind_means"]),
        kind_draws=page_kind.draws(str(summary["kind"])),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=List[PageOut])
async def list_pages(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> List[PageOut]:
    """The caller's pages, most recently changed first, each with its pin count."""
    pages = await page_writer.list_pages(db, user.username)
    # One pass for the counts and one for the calls each page's KIND is
    # derived from (W4.1) — never a query per page.
    by_page = await _calls(db, user.username)
    counts = await _counts(db, user.username)
    return [_out(p, counts.get(p.id, 0), by_page.get(p.id, [])) for p in pages]


@router.post("", response_model=PageOut, status_code=status.HTTP_201_CREATED)
async def create_page(
    payload: PageCreate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """
    A new page — empty, or with its first sections, as ONE act.

    ONE PATH, NOT TWO. Both cases go through page_operations.build_page, which
    is the same service function Bob's `create_page` reaches through the
    injected writer: analyses absent is the empty page this route has always
    made, and analyses present is the page and its pins in one transaction, or
    nothing. A second implementation for the button would be a second set of
    bounds to keep equal.

    THE REFUSALS ARE THE SERVICE'S, and every one of them is a sentence a
    person can act on. This route's own job is which is a 422, which a 409 and
    which a 404 — a pin id that is not the caller's is a 404 for the same
    reason a page id is.
    """
    try:
        built = await page_operations.build_page(
            db, owner=user.username, title=payload.title, purpose=payload.purpose,
            analyses=[a.model_dump(exclude_none=True) for a in (payload.analyses or [])] or None,
            question=payload.question,
            conversation_id=payload.conversation_id,
            allow_similar_page=payload.allow_similar_page,
            kind=payload.kind,
        )
    except (PageValidationError, PinValidationError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except (PageQuotaError, PinQuotaError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc
    except (PageNotFound, PinNotFound) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except AmbiguousTarget as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    # The page the caller is told about is the page the service built, read off
    # its own summary — the one page_operations reports to Bob too, so the
    # button and the sentence describe the same row the same way.
    return _from_summary(built.page)


@router.get("/{page_id}", response_model=PageOut)
async def get_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """One of the caller's pages. Somebody else's is a 404."""
    try:
        page = await page_writer.get_page(db, user.username, page_id)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return await _one(db, user.username, page)


@router.patch("/{page_id}", response_model=PageOut)
async def update_page(
    page_id: uuid.UUID,
    payload: PageUpdate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """
    Rename the page, or change its purpose. The id — and everything bound to
    it — stays exactly where it is. A rename to a case-variant of ANOTHER
    page is a 409 the caller resolves, as on create.
    """
    sent = payload.model_fields_set
    try:
        page = await page_writer.get_page(db, user.username, page_id)
        if "title" in sent and payload.title is not None:
            page = await page_writer.rename_page(
                db, owner=user.username, page_id=page_id, title=payload.title,
                allow_similar_page=payload.allow_similar_page,
            )
        if "purpose" in sent:
            page = await page_writer.set_purpose(
                db, owner=user.username, page_id=page_id, purpose=payload.purpose,
            )
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc
    return await _one(db, user.username, page)


@router.put("/{page_id}", response_model=PageOut)
async def set_page_kind(
    page_id: uuid.UUID,
    payload: PageKindIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """
    Say what KIND of page this is (W4.1) — the owner changing how it is DRAWN
    by hand.

    PRESENTATION ONLY. Nothing on the page moves: not an analysis, not its
    position, not its calls, not a figure. The four kinds are the yaml's
    (`pages.kinds.catalogue`) and a value that is not one of them is a 422
    naming them. Audited as `set_kind`, before and after, with the before
    recording what the page was already drawn as — a derived kind included.
    """
    try:
        page = await page_writer.set_kind(db, owner=user.username, page_id=page_id,
                                          kind=payload.kind)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return await _one(db, user.username, page)


@router.delete("/{page_id}", response_model=PageDeletedOut)
async def delete_page(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageDeletedOut:
    """Delete the page row. Its pins move to Ungrouped; none is deleted."""
    try:
        gone = await page_writer.delete_page(db, owner=user.username, page_id=page_id)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return PageDeletedOut(id=gone.page_id, title=gone.title, pins_ungrouped=gone.pins_ungrouped)


@router.get("/{page_id}/events", response_model=List[PageEventOut])
async def page_events(
    page_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> List[PageEventOut]:
    """
    What happened to this page, newest first: who (a person, or Bob in a
    conversation), what, before and after. The inspectable record of every
    structural write, whichever surface made it.
    """
    try:
        rows = await page_writer.events_for(db, user.username, page_id, limit=limit)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [PageEventOut.model_validate(r) for r in rows]


@router.put("/{page_id}/window", response_model=PageOut)
async def set_page_window(
    page_id: uuid.UUID,
    payload: PageWindowIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """
    Pick the page's date window (W1.4). Every analysis on the page re-runs
    over it when its tile next runs — the client re-runs them; this stores
    the choice, audited as `set_window`. A value that is not one of the
    yaml's presets is a 422 naming them.
    """
    try:
        page = await page_writer.set_window(db, owner=user.username, page_id=page_id,
                                            preset=payload.preset)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except PageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return await _one(db, user.username, page)


@router.delete("/{page_id}/window", response_model=PageOut)
async def remove_page_window(
    page_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """Take the page's date window off; audited as `remove_window`."""
    try:
        page = await page_writer.remove_window(db, owner=user.username, page_id=page_id)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return await _one(db, user.username, page)
