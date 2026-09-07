"""
Creating a pin — the ONE write path, shared by the button and by George.

This module exists because there are now two ways to pin an answer: the Pin
button on a chat turn (POST /pins) and George pinning his own answer when asked
in conversation (the `pin_answer` tool). They must not be two implementations.
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

MEMBERSHIP IS A WRITE TOO (added 2026-09-07, Persistence V1). A page is still
derived from its pins — there is no pages table, and a page with no pins is not
a thing — so "move this pin to Purchasing" and "rename FFR Overview" are both
UPDATEs on george.pins, scoped to the caller in the query because that table has
RLS off. They live here beside create_pin for the same reason create_pin does:
the route calls them today, and a writer injected into the loop would call the
same functions tomorrow, so "put this on Purchasing" said in conversation cannot
drift from the button. Neither re-runs anything: membership is not a figure.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.river_writer import post_pin_confirmation
from app.models.george_pin import GeorgePin
from app.services.pin_runner import (
    PinValidationError,
    find_similar_page,
    normalize_page,
    validate_calls,
)

# A tile that needs more than this is probably several tiles.
MAX_TOOL_CALLS_PER_PIN = 8
MAX_PINS_PER_USER = 500


class TooManyCallsError(PinValidationError):
    """More calls than one tile can hold. A validation failure, like the rest."""


class PinQuotaError(ValueError):
    """The caller is at MAX_PINS_PER_USER."""


class SimilarPageError(ValueError):
    """
    The page name differs from an existing one only by case.

    Carries both names because the caller has to offer the choice rather than
    resolve it — silently merging or silently forking are both guesses. See
    find_similar_page for why the match is case-only and never fuzzy.
    """

    def __init__(self, existing_page: str, submitted_page: str) -> None:
        self.existing_page = existing_page
        self.submitted_page = submitted_page
        super().__init__(
            f"You already have a page called {existing_page!r}. You sent "
            f"{submitted_page!r}, which differs only by capitalisation. Reuse "
            f"the existing name, or resend with allow_similar_page=true to "
            f"keep both."
        )


class PinNotFound(LookupError):
    """
    No pin with that id belongs to the caller.

    Whether the id exists at all is not information a caller is entitled to,
    so the route renders this as a 404 exactly as it renders somebody else's
    pin — see routes/george_pins._owned.
    """


class PageNotFound(LookupError):
    """The caller has no pins on a page of that exact name."""


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
    """The caller's existing page names. Scoped in the query — this table has RLS off."""
    rows = (
        await db.execute(
            select(GeorgePin.page)
            .where(GeorgePin.created_by == username, GeorgePin.page.isnot(None))
            .distinct()
        )
    ).scalars().all()
    return [r for r in rows if r]


async def _count_on_page(db: AsyncSession, username: str, page: Optional[str]) -> int:
    stmt = select(func.count()).select_from(GeorgePin).where(
        GeorgePin.created_by == username
    )
    stmt = stmt.where(GeorgePin.page.is_(None) if page is None else GeorgePin.page == page)
    return (await db.execute(stmt)).scalar_one()


async def create_pin(
    db: AsyncSession,
    *,
    username: str,
    tool_calls: list[dict[str, Any]],
    title: Optional[str] = None,
    question: Optional[str] = None,
    conversation_id: Optional[uuid.UUID] = None,
    page: Optional[str] = None,
    allow_similar_page: bool = False,
) -> CreatedPin:
    """
    Store the tool calls behind an answer so a tile can re-run them.

    Every call is validated against the LIVE tool surface before it is stored.
    Storing an un-runnable pin means a tile that breaks later for no visible
    reason, so the failure happens here — while the user is still looking at the
    answer they tried to pin, or still in the conversation where they asked for
    it.

    Raises TooManyCallsError / PinValidationError (the pin cannot be stored),
    PinQuotaError (the caller is full), or SimilarPageError (the page name needs
    a decision the caller must not make for them).
    """
    if len(tool_calls) > MAX_TOOL_CALLS_PER_PIN:
        raise TooManyCallsError(
            f"A pin may hold at most {MAX_TOOL_CALLS_PER_PIN} tool calls; "
            f"this answer used {len(tool_calls)}. A tile that needs more than "
            f"that is probably several tiles."
        )

    count = (
        await db.execute(
            select(func.count())
            .select_from(GeorgePin)
            .where(GeorgePin.created_by == username)
        )
    ).scalar_one()
    if count >= MAX_PINS_PER_USER:
        raise PinQuotaError(
            f"You already have {count} pins, the maximum. Delete some first."
        )

    calls = validate_calls(tool_calls)

    normalized = await _check_page_name(db, username, page, allow_similar_page)

    pin = GeorgePin(
        id=uuid.uuid4(),
        created_by=username,
        created_at=datetime.now(timezone.utc),
        title=(title or question or calls[0]["tool"]).strip()[:200],
        question=question,
        conversation_id=conversation_id,
        page=normalized,
        tool_calls=calls,
    )
    db.add(pin)
    await db.flush()

    # The pin in the river, so it has a durable record beside everything else
    # George did. PRIVATE and owned by whoever pinned: a pin is one person's
    # tile, and "Ice pinned Rockwell net sales" is somebody's workspace rather
    # than a company-level fact (app/models/george_post.PRIVATE_GEORGE_KINDS).
    #
    # Here rather than in the route, because this is the path the route AND
    # George's injected writer both take — two call sites would drift, which is
    # the reason this module exists at all. Idempotent on the pin id.
    #
    # Never fatal: a pin that failed to announce itself is still a pin, and
    # raising here would lose the write over a post.
    try:
        await post_pin_confirmation(
            db, pin_id=pin.id, title=pin.title, page=normalized,
            owner=username, tool_calls=len(calls),
            conversation_id=conversation_id,
        )
    except Exception as exc:  # noqa: BLE001 - a post must not cost a pin
        print(f"[pins] river post failed for pin {pin.id}: "
              f"{type(exc).__name__}: {exc}")

    return CreatedPin(
        row=pin,
        pins_on_page=await _count_on_page(db, username, normalized),
    )


async def _check_page_name(
    db: AsyncSession, username: str, page: Optional[str], allow_similar_page: bool,
) -> Optional[str]:
    """
    Normalise a page name and refuse a case-only near-duplicate.

    THE SAME RULE create_pin APPLIES, factored so a move and a rename cannot
    apply a looser one. An exact match is the same page and passes — that is
    how a pin joins an existing page.
    """
    normalized = normalize_page(page)
    if normalized and not allow_similar_page:
        similar = find_similar_page(normalized, await pages_for(db, username))
        if similar:
            raise SimilarPageError(existing_page=similar, submitted_page=normalized)
    return normalized


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
    title: Any = UNSET,
    allow_similar_page: bool = False,
) -> MovedPin:
    """
    Change which page a pin sits on, or what it is called. Nothing else.

    `page` accepts an existing page (the pin joins it), a new name (the page
    now exists, because a page is its pins), or None (the pin is ungrouped —
    which is how a pin is REMOVED from a page without being deleted). A field
    not sent is left exactly as it was, which is what UNSET is for: None is a
    value here, not an absence.

    THE CALLS ARE NEVER TOUCHED. A move changes a label on a row and leaves
    tool_calls, question, conversation_id and the run history alone, and it
    does not re-run the pin: membership is not a figure, and a tile re-reads
    when it is next looked at anyway.

    Scoped to the caller in the query. Somebody else's pin is PinNotFound,
    indistinguishable from no pin at all.
    """
    pin = (
        await db.execute(
            select(GeorgePin).where(
                GeorgePin.id == pin_id, GeorgePin.created_by == username,
            )
        )
    ).scalar_one_or_none()
    if pin is None:
        raise PinNotFound("Pin not found.")

    if page is not UNSET:
        pin.page = await _check_page_name(db, username, page, allow_similar_page)

    if title is not UNSET:
        cleaned = (title or "").strip()[:200]
        if not cleaned:
            raise PinValidationError("A pin needs a title.")
        pin.title = cleaned

    await db.flush()
    return MovedPin(row=pin, pins_on_page=await _count_on_page(db, username, pin.page))


@dataclass(frozen=True)
class RenamedPage:
    """What a rename did: the name it settled on, and how many pins followed it."""

    page: str
    pins_moved: int


async def rename_page(
    db: AsyncSession,
    *,
    username: str,
    old: str,
    new: str,
    allow_similar_page: bool = False,
) -> RenamedPage:
    """
    Rename one of the caller's pages: every pin of theirs on it, in one UPDATE.

    A page is derived from its pins, so renaming it IS moving its pins, and the
    one statement below is the whole operation — there is no page row to keep
    in step and no second write that could half-succeed.

    ONLY THE CALLER'S PINS. The WHERE carries created_by, so another person's
    page of the same name is untouched: pages are per person because pins are.
    Historical river posts that name the old page are left as they are — they
    record what was true when they were written.

    The exact-name rule is deterministic and is the one create_pin uses:
    trim, collapse whitespace, keep case. A rename to a case-variant of ANOTHER
    existing page is refused as a near-duplicate unless the caller says they
    want both; a rename that only changes the case of THIS page is allowed,
    because the old name is about to stop existing.
    """
    old_name = normalize_page(old)
    new_name = normalize_page(new)
    if not old_name:
        raise PageNotFound("Ungrouped is not a page and cannot be renamed.")
    if not new_name:
        raise PinValidationError("A page needs a name.")

    if new_name != old_name and not allow_similar_page:
        others = [p for p in await pages_for(db, username) if p != old_name]
        similar = find_similar_page(new_name, others)
        if similar:
            raise SimilarPageError(existing_page=similar, submitted_page=new_name)

    result = await db.execute(
        update(GeorgePin)
        .where(GeorgePin.created_by == username, GeorgePin.page == old_name)
        .values(page=new_name)
    )
    moved = int(result.rowcount or 0)
    if moved == 0:
        raise PageNotFound(f"You have no page called {old_name!r}.")
    return RenamedPage(page=new_name, pins_moved=moved)
