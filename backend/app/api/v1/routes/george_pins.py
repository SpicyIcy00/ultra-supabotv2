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

USER SCOPING IS ENFORCED IN EVERY QUERY. george.pins deliberately has RLS off —
RLS with no policy is deny-all and returns zero rows with no error, which has
already bitten this database twice. Every read and delete filters on
created_by, and a pin belonging to someone else is a 404, not a 403: whether a
given pin id exists is not information a caller is entitled to.
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
from app.services.pin_runner import (
    PinValidationError,
    find_similar_page,
    normalize_page,
    run_pin,
    validate_calls,
)

router = APIRouter(tags=["george-pins"])

# Pins are George's, so they live behind George's page.
_pin_user = require_page("george")

MAX_TOOL_CALLS_PER_PIN = 8
MAX_PINS_PER_USER = 500


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
    page: Optional[str] = Field(None, max_length=100)
    tool_calls: List[ToolCallIn] = Field(..., min_length=1)
    # Set true to accept a page name that differs from an existing one only by
    # case. Without it the request is refused rather than forking the page.
    allow_similar_page: bool = False


class PinOut(BaseModel):
    id: uuid.UUID
    title: str
    question: Optional[str]
    page: Optional[str]
    conversation_id: Optional[uuid.UUID]
    tool_calls: List[dict]
    created_at: datetime
    last_run_at: Optional[datetime]
    last_ok_at: Optional[datetime]
    last_status: Optional[str]

    model_config = {"from_attributes": True}


class PageOut(BaseModel):
    page: Optional[str]
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


async def _pages_for(db: AsyncSession, username: str) -> list[str]:
    rows = (
        await db.execute(
            select(GeorgePin.page)
            .where(GeorgePin.created_by == username, GeorgePin.page.isnot(None))
            .distinct()
        )
    ).scalars().all()
    return [r for r in rows if r]


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

    Every call is validated against the LIVE tool surface before it is stored.
    Storing a pin that cannot run means a tile that breaks later for no visible
    reason, so the failure happens here, while the user is still looking at the
    answer they tried to pin.
    """
    if len(payload.tool_calls) > MAX_TOOL_CALLS_PER_PIN:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"A pin may hold at most {MAX_TOOL_CALLS_PER_PIN} tool calls; "
                f"this answer used {len(payload.tool_calls)}. A tile that needs "
                f"more than that is probably several tiles."
            ),
        )

    count = (
        await db.execute(
            select(func.count())
            .select_from(GeorgePin)
            .where(GeorgePin.created_by == user.username)
        )
    ).scalar_one()
    if count >= MAX_PINS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"You already have {count} pins, the maximum. Delete some first.",
        )

    try:
        calls = validate_calls([c.model_dump() for c in payload.tool_calls])
    except PinValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc

    page = normalize_page(payload.page)
    if page and not payload.allow_similar_page:
        similar = find_similar_page(page, await _pages_for(db, user.username))
        if similar:
            # 409, not a silent merge and not a silent fork. Two pages differing
            # only by case is almost always a typo, but deciding that FOR the
            # user would be a guess — so the collision is reported and they
            # choose. Same rule as the store alias map: exact match or ask.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": (
                        f"You already have a page called {similar!r}. You sent "
                        f"{page!r}, which differs only by capitalisation. Reuse "
                        f"the existing name, or resend with "
                        f"allow_similar_page=true to keep both."
                    ),
                    "existing_page": similar,
                    "submitted_page": page,
                },
            )

    title = (payload.title or payload.question or calls[0]["tool"]).strip()[:200]
    pin = GeorgePin(
        id=uuid.uuid4(),
        created_by=user.username,
        created_at=datetime.now(timezone.utc),
        title=title,
        question=payload.question,
        conversation_id=payload.conversation_id,
        page=page,
        tool_calls=calls,
    )
    db.add(pin)
    await db.flush()
    return PinOut.model_validate(pin)


@router.get("", response_model=List[PinOut])
async def list_pins(
    page: Optional[str] = Query(None, description="Filter to one page."),
    ungrouped: bool = Query(False, description="Only pins with no page."),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> List[PinOut]:
    """
    The caller's pins, newest first.

    Ordering is created_at only — there is no manual position yet, so a page
    renders in the order its tiles were pinned.
    """
    stmt = select(GeorgePin).where(GeorgePin.created_by == user.username)
    if ungrouped:
        stmt = stmt.where(GeorgePin.page.is_(None))
    elif page is not None:
        stmt = stmt.where(GeorgePin.page == normalize_page(page))
    stmt = stmt.order_by(GeorgePin.created_at.desc())

    rows = (await db.execute(stmt)).scalars().all()
    return [PinOut.model_validate(p) for p in rows]


@router.get("/pages", response_model=List[PageOut])
async def list_pages(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_pin_user),
) -> List[PageOut]:
    """
    The caller's pages, with pin counts.

    Derived from the pins, because a page IS a collection of pins (CLAUDE.md) —
    it has no independent existence and an empty one is not a thing. Ungrouped
    pins are reported as a page of None rather than hidden.
    """
    rows = (
        await db.execute(
            select(GeorgePin.page, func.count())
            .where(GeorgePin.created_by == user.username)
            .group_by(GeorgePin.page)
            .order_by(GeorgePin.page.asc().nulls_last())
        )
    ).all()
    return [PageOut(page=p, pins=n) for p, n in rows]


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
    """Delete one of the caller's pins. A pin belonging to someone else is a 404."""
    await _owned(db, pin_id, user)
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
