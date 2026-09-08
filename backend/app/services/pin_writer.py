"""
Creating a pin — the ONE write path, shared by the button and by George.

This module exists because there are two ways to pin an answer: the Pin button
on a chat turn (POST /pins) and George pinning his own answer when asked in
conversation (the `pin_answer` tool). They must not be two implementations.
Every guarantee a pin carries — that its calls still run against the live tool
surface, that a page name is not a case-typo of an existing page, that a tile
holds at most MAX_TOOL_CALLS_PER_PIN calls — is enforced here, once, so a fix to
one is a fix to both.

WHAT THE CALLER STILL OWNS
  - The identity. `username` is passed in and is never derived from anything a
    request body (or a model) said. Both callers take it from the verified token.
  - The transaction. This module flushes; it does not commit. The route lets
    get_db commit at the end of the request; George's writer commits
    immediately, because it runs inside a long-lived SSE stream and the pin must
    survive the stream dying later.

FAILURES ARE TYPED, NOT FORMATTED. The route turns them into status codes, and
George turns them into a refusal the model can act on. Neither reads a string to
decide which is which.

MEMBERSHIP MOVED TO page_writer (2026-09-08, Page Workshop V1). A page is a row
now, a pin points at it by id and holds a position on it, and every membership
or order change — including the one a create makes by landing a pin at the
bottom of a page — goes through app.services.page_writer, which keeps positions
dense and writes the audit row. What stays here is the pin itself: its calls
validated, its quota checked, its title, its question and its provenance. The
page-by-NAME forms (`page="Replenishment"`) are kept because the Pin dialog and
pin_answer still speak in names; page_writer.page_for_write turns a name into
the existing page or a new one under the same collision rule as always.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_page import GeorgePage
from app.models.george_pin import GeorgePin
from app.services import page_writer
from app.services.page_writer import (   # noqa: F401 - re-exported for the routes and tests
    USER,
    Actor,
    AmbiguousTarget,
    NotAPage,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    PinNotFound,
    SimilarPageError,
)
from app.services.pin_runner import PinValidationError, validate_calls
from app.services.river_writer import post_pin_confirmation

# A tile that needs more than this is probably several tiles.
MAX_TOOL_CALLS_PER_PIN = 8
MAX_PINS_PER_USER = 500


class TooManyCallsError(PinValidationError):
    """More calls than one tile can hold. A validation failure, like the rest."""


class PinQuotaError(ValueError):
    """The caller is at MAX_PINS_PER_USER."""


class _Unset:
    """A field the caller did not send. Distinct from None, which means ungrouped."""

    def __repr__(self) -> str:  # pragma: no cover - diagnostics only
        return "UNSET"


UNSET: Any = _Unset()


@dataclass(frozen=True)
class CreatedPin:
    """
    The stored row, plus the one derived figure both callers want.

    The row itself is handed back so the route can serialise it with PinOut
    exactly as before. It stays readable after the session commits because the
    sessionmaker sets expire_on_commit=False.
    """

    row: GeorgePin
    # How many pins now sit on that page, this one included. Lets George say
    # "added to Replenishment, which now has four" instead of guessing.
    pins_on_page: int


async def pages_for(db: AsyncSession, username: str) -> list[str]:
    """The caller's existing page titles. Scoped in the query — RLS is off."""
    return await page_writer.page_titles(db, username)


async def count_pins(db: AsyncSession, username: str) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(GeorgePin).where(GeorgePin.created_by == username)
        )
    ).scalar_one()


async def _count_on_page(db: AsyncSession, username: str, page_id: Optional[uuid.UUID]) -> int:
    stmt = select(func.count()).select_from(GeorgePin).where(GeorgePin.created_by == username)
    stmt = stmt.where(GeorgePin.page_id.is_(None) if page_id is None
                      else GeorgePin.page_id == page_id)
    return (await db.execute(stmt)).scalar_one()


def validate_pin_calls(tool_calls: list[dict[str, Any]]) -> list[dict]:
    """
    The call-level rules, factored so a page build can validate EVERY analysis
    before it stores ANY: the cap, and each call against the live surface.
    """
    if len(tool_calls) > MAX_TOOL_CALLS_PER_PIN:
        raise TooManyCallsError(
            f"A pin may hold at most {MAX_TOOL_CALLS_PER_PIN} tool calls; "
            f"this answer used {len(tool_calls)}. A tile that needs more than "
            f"that is probably several tiles."
        )
    return validate_calls(tool_calls)


async def ensure_pin_quota(db: AsyncSession, username: str, adding: int = 1) -> None:
    count = await count_pins(db, username)
    if count + adding > MAX_PINS_PER_USER:
        raise PinQuotaError(
            f"You have {count} pins and the maximum is {MAX_PINS_PER_USER}; "
            f"adding {adding} more is not possible. Delete some first."
        )


def new_pin_row(
    *, username: str, calls: list[dict], title: Optional[str], question: Optional[str],
    conversation_id: Optional[uuid.UUID],
) -> GeorgePin:
    """The row, unattached. page_writer.append_new_pin puts it somewhere."""
    return GeorgePin(
        id=uuid.uuid4(),
        created_by=username,
        created_at=datetime.now(timezone.utc),
        title=(title or question or calls[0]["tool"]).strip()[:200],
        question=question,
        conversation_id=conversation_id,
        page_id=None,
        position=0,
        tool_calls=calls,
    )


async def create_pin(
    db: AsyncSession,
    *,
    username: str,
    tool_calls: list[dict[str, Any]],
    title: Optional[str] = None,
    question: Optional[str] = None,
    conversation_id: Optional[uuid.UUID] = None,
    page: Any = UNSET,
    page_id: Any = UNSET,
    allow_similar_page: bool = False,
    actor: Actor = USER,
    announce: bool = True,
) -> CreatedPin:
    """
    Store the tool calls behind an answer so a tile can re-run them.

    Every call is validated against the LIVE tool surface before it is stored.
    Storing an un-runnable pin means a tile that breaks later for no visible
    reason, so the failure happens here — while the user is still looking at the
    answer they tried to pin, or still in the conversation where they asked for
    it.

    Where it lands: `page_id` names one of the caller's pages by identity;
    `page` names one by TITLE (an existing title joins it, a new title creates
    it, None or blank is Ungrouped); neither means Ungrouped. A new pin joins a
    page at the BOTTOM. `announce=False` skips the river confirmation, for a
    page build that announces itself once rather than once per analysis.

    Raises TooManyCallsError / PinValidationError (the pin cannot be stored),
    PinQuotaError / PageQuotaError (the caller or the page is full), PageNotFound
    (page_id is not theirs), or SimilarPageError (the page name needs a decision
    the caller must not make for them).
    """
    calls = validate_pin_calls(tool_calls)
    await ensure_pin_quota(db, username, adding=1)

    target: Optional[GeorgePage] = None
    if page_id is not UNSET and page_id is not None:
        target = await page_writer.get_page(db, username, uuid.UUID(str(page_id)))
    elif page is not UNSET and page is not None:
        target = await page_writer.page_for_write(
            db, owner=username, title=page, actor=actor,
            allow_similar_page=allow_similar_page,
        )

    pin = new_pin_row(username=username, calls=calls, title=title, question=question,
                      conversation_id=conversation_id)
    await page_writer.append_new_pin(db, owner=username, pin=pin, to_page=target, actor=actor)
    db.add(pin)
    await db.flush()

    # The pin in the river, so it has a durable record beside everything else
    # George did. PRIVATE and owned by whoever pinned: a pin is one person's
    # tile (app/models/george_post.PRIVATE_GEORGE_KINDS). Here rather than in
    # the route, because this is the path the route AND George's injected
    # writer both take. Idempotent on the pin id. Never fatal.
    if announce:
        try:
            await post_pin_confirmation(
                db, pin_id=pin.id, title=pin.title, page=pin.page,
                owner=username, tool_calls=len(calls),
                conversation_id=conversation_id,
            )
        except Exception as exc:  # noqa: BLE001 - a post must not cost a pin
            print(f"[pins] river post failed for pin {pin.id}: "
                  f"{type(exc).__name__}: {exc}")

    return CreatedPin(row=pin, pins_on_page=await _count_on_page(db, username, pin.page_id))


@dataclass(frozen=True)
class MovedPin:
    """The pin after its membership changed, plus where it now sits."""

    row: GeorgePin
    pins_on_page: int


async def update_pin(
    db: AsyncSession,
    *,
    username: str,
    pin_id: uuid.UUID,
    page: Any = UNSET,
    page_id: Any = UNSET,
    title: Any = UNSET,
    place: Any = UNSET,
    allow_similar_page: bool = False,
    actor: Actor = USER,
) -> MovedPin:
    """
    Change which page a pin sits on, where on it, or what it is called.

    `page_id` (identity) or `page` (title: existing, new, or None for
    Ungrouped) moves it; `place` — {"before": id} | {"after": id} |
    {"at": "top"|"bottom"} — positions it on the page it ends up on; `title`
    retitles it. A field not sent is left exactly as it was, which is what
    UNSET is for: None is a value here, not an absence. Positions on every
    page touched are dense again before this returns.

    THE CALLS ARE NEVER TOUCHED and nothing is re-run: membership is not a
    figure. Somebody else's pin is PinNotFound, indistinguishable from none.
    """
    pin = await page_writer.get_pin(db, username, pin_id)

    moving = page_id is not UNSET or page is not UNSET
    if moving:
        if page_id is not UNSET and page_id is not None:
            target = await page_writer.get_page(db, username, uuid.UUID(str(page_id)))
        elif page is not UNSET and page is not None:
            target = await page_writer.page_for_write(
                db, owner=username, title=page, actor=actor,
                allow_similar_page=allow_similar_page,
            )
        else:
            target = None
        await page_writer.move_pin(
            db, owner=username, pin=pin, to_page=target,
            place=None if place is UNSET else place, actor=actor,
        )
    elif place is not UNSET and place is not None:
        await page_writer.place_pin(db, owner=username, pin=pin, place=place, actor=actor)

    if title is not UNSET:
        cleaned = (title or "").strip()[:200]
        if not cleaned:
            raise PinValidationError("A pin needs a title.")
        pin.title = cleaned

    await db.flush()
    return MovedPin(row=pin, pins_on_page=await _count_on_page(db, username, pin.page_id))


@dataclass(frozen=True)
class RenamedPage:
    """What a rename did: the page, the name it settled on, and how many pins it holds."""

    page_id: uuid.UUID
    page: str
    pins_moved: int


async def rename_page(
    db: AsyncSession,
    *,
    username: str,
    old: str,
    new: str,
    allow_similar_page: bool = False,
    actor: Actor = USER,
) -> RenamedPage:
    """
    Rename one of the caller's pages, named by its current EXACT title.

    Kept for the legacy route (PATCH /pins/pages/{name}); the page keeps its
    id, so nothing bound to it moves. `pins_moved` is the pin count, which is
    what the old contract reported and still the number a reader wants.
    """
    name = page_writer.normalize_page(old)
    if not name:
        raise PageNotFound("Ungrouped is not a page and cannot be renamed.")
    page = await page_writer.find_page_by_title(db, username, name)
    if page is None:
        raise PageNotFound(f"You have no page called {name!r}.")
    renamed = await page_writer.rename_page(
        db, owner=username, page_id=page.id, title=new, actor=actor,
        allow_similar_page=allow_similar_page,
    )
    return RenamedPage(page_id=renamed.id, page=renamed.title,
                       pins_moved=await _count_on_page(db, username, renamed.id))
