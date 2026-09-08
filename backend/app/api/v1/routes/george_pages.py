"""
Pages — real rows now, addressed by id.

A page is a person's ordered collection of pins, with a title and a one-line
purpose. It has existed as a row since 2026-09-08 (Page Workshop V1), which is
what lets it be EMPTY — opened, named and handed to George to fill — and what
lets its identity survive a rename: the URL, the thread scope, the reader and
the writer all hold the id, and the title is presentation.

EVERY RULE LIVES IN THE SERVICE, not here. app.services.page_writer is the one
write path for a page and for a pin's place on it; George's `create_page` and
`edit_page` reach the same functions through the writer routes/george.py
injects. This router's own job is the HTTP shape: which refusal is a 404,
which a 409, which a 422. Ownership is enforced in every statement the service
makes, and a page belonging to someone else is a 404, not a 403 — whether a
given id exists is not information a caller is entitled to.

UNGROUPED IS NOT HERE. It is `pins.page_id IS NULL`, read through
GET /george/pins?ungrouped=true, and it has no id to PATCH or DELETE. The
listing does not invent a row for it; the client draws it from the pins.

DELETE IS DELIBERATELY NARROW: it deletes the page ROW and moves every pin on
it to Ungrouped. No pin is deleted by any route in this module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.george_pin import GeorgePin
from app.services import page_writer
from app.services.page_writer import (
    MAX_PURPOSE_LEN,
    MAX_TITLE_LEN,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    SimilarPageError,
)

router = APIRouter(tags=["george-pages"])

_page_user = require_page("george")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PageCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LEN)
    purpose: Optional[str] = Field(None, max_length=MAX_PURPOSE_LEN)
    allow_similar_page: bool = False


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
            select(GeorgePin.page_id, func.count())
            .where(GeorgePin.created_by == username, GeorgePin.page_id.isnot(None))
            .group_by(GeorgePin.page_id)
        )
    ).all()
    return {pid: n for pid, n in rows}


def _out(page, pins: int) -> PageOut:
    return PageOut(id=page.id, title=page.title, purpose=page.purpose,
                   created_at=page.created_at, updated_at=page.updated_at, pins=pins)


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
    counts = await _counts(db, user.username)
    return [_out(p, counts.get(p.id, 0)) for p in pages]


@router.post("", response_model=PageOut, status_code=status.HTTP_201_CREATED)
async def create_page(
    payload: PageCreate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_page_user),
) -> PageOut:
    """A new, empty page. The first useful thing on it can come from a pin or from George."""
    try:
        page = await page_writer.create_page(
            db, owner=user.username, title=payload.title, purpose=payload.purpose,
            allow_similar_page=payload.allow_similar_page,
        )
    except PageValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except PageQuotaError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except SimilarPageError as exc:
        raise _similar_page_conflict(exc) from exc
    return _out(page, 0)


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
    return _out(page, (await _counts(db, user.username)).get(page.id, 0))


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
    return _out(page, (await _counts(db, user.username)).get(page.id, 0))


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
    What happened to this page, newest first: who (a person, or George in a
    conversation), what, before and after. The inspectable record of every
    structural write, whichever surface made it.
    """
    try:
        rows = await page_writer.events_for(db, user.username, page_id, limit=limit)
    except PageNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return [PageEventOut.model_validate(r) for r in rows]
