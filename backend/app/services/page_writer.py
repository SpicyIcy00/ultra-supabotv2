"""
Pages — the ONE write path for a page and for a pin's place on it.

Until 2026-09-08 a page was derived from its pins and the only page writes were
a pin's label changing. Page Workshop makes a page a row (george.pages) and a
pin's membership a foreign key with a position, and every way of changing
either — the Rename link, the Move picker, the Move up / Move down links, the
New page button, and George's `create_page` / `edit_page` through the injected
writer — comes through the functions below. The reason is the one pin_writer
already gives: two implementations of "move" drift, and the half that drifts is
the half that stops enforcing something.

WHAT IS ENFORCED HERE, ONCE
  - OWNERSHIP, in the statement. Every SELECT and UPDATE carries `owner` /
    `created_by`, because george.* has RLS off. A page or pin that is somebody
    else's is PageNotFound / PinNotFound, indistinguishable from one that does
    not exist: whether an id exists at all is not information a caller is
    entitled to.
  - THE TITLE RULE, unchanged from the page-name rule a pin's label obeyed:
    trim, collapse internal whitespace, keep case, at most MAX_TITLE_LEN. An
    exact duplicate of the caller's own page is refused. A case-only collision
    with another of their pages is refused unless they say they want both —
    the same choice the Pin dialog has always offered.
  - DENSE POSITIONS. A real page's pins are 0..n-1, always, at the end of every
    function here, before anything commits. Add, remove, move and place each
    renumber every page they touched inside the same transaction. Pages are
    capped at MAX_PINS_PER_PAGE, so renumbering is a handful of rows and the
    invariant is simple to state and to test. Ungrouped has no positions — it
    is not a page — and keeps created_at DESC.
  - UNGROUPED IS VIRTUAL. `page_id IS NULL`. It cannot be renamed, described,
    deleted or reordered; pins move into and out of it. A function that needs a
    real page raises NotAPage on the null scope.
  - TARGETS RESOLVE OR REFUSE. A pin or page named by title resolves only when
    exactly one candidate matches (exact match first; then a unique
    case-insensitive one). Two candidates is AmbiguousTarget, carrying every
    candidate with its id so the caller can choose. Nothing here guesses.
  - EVERY STRUCTURAL WRITE LEAVES A page_events ROW: who (a person, or George
    in a named conversation), what, before and after — metadata, never a
    replayed result. A button and the injected writer produce the same record
    because they call the same function.

WHAT THE CALLER STILL OWNS: the identity (`owner` comes from the verified
token, never from a body or a model) and the transaction (this module flushes,
it does not commit). The route lets get_db commit at the end of the request;
George's writer commits immediately, because it runs inside a long-lived SSE
stream and the write must survive the stream dying later.

Sections are deliberately absent (Page Workshop V1 decision). Positions are
page-wide so that a section, when it arrives, is a contiguous run of them
under a nullable section_id — nothing here has to be re-encoded.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_page import GeorgePage, GeorgePageEvent
from app.models.george_pin import GeorgePin
from app.services.pin_runner import find_similar_page, normalize_page

# Operational caps, like MAX_TOOL_CALLS_PER_PIN. Not business definitions.
MAX_PAGES_PER_OWNER = 50
MAX_PINS_PER_PAGE = 50
MAX_TITLE_LEN = 100
MAX_PURPOSE_LEN = 200


# ---------------------------------------------------------------------------
# Failures — typed, so a route and George's writer can each render them
# ---------------------------------------------------------------------------

class PageValidationError(ValueError):
    """A title or purpose that cannot be stored, or an operation that makes no sense."""


class PageQuotaError(ValueError):
    """The caller is at MAX_PAGES_PER_OWNER, or the page is at MAX_PINS_PER_PAGE."""


class SimilarPageError(ValueError):
    """
    The title differs from one of the caller's existing pages only by case.

    Carries both names because the caller has to offer the choice rather than
    resolve it — silently merging or silently forking are both guesses.
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


class PageNotFound(LookupError):
    """No page with that id (or exact title) belongs to the caller."""


class PinNotFound(LookupError):
    """No pin with that id (or title) belongs to the caller."""


class NotAPage(ValueError):
    """The operation needs a real page, and Ungrouped is not one."""


class AmbiguousTarget(LookupError):
    """
    A title matched more than one of the caller's pins or pages.

    `candidates` is a list of dicts with ids, so the caller can name one.
    Never resolved here: choosing would be a guess dressed as a match.
    """

    def __init__(self, kind: str, title: str, candidates: list[dict[str, Any]]) -> None:
        self.kind = kind
        self.title = title
        self.candidates = candidates
        listed = "; ".join(
            f"{c.get('title')!r} (id {c.get('pin_id') or c.get('page_id')}"
            + (f", on {c['page_title']!r}" if c.get("page_title") else
               (", ungrouped" if kind == "pin" and c.get("page_id") is None else ""))
            + ")"
            for c in candidates
        )
        super().__init__(
            f"{title!r} matches {len(candidates)} of your {kind}s: {listed}. "
            f"Name the one you mean by its id."
        )


# ---------------------------------------------------------------------------
# Who did it
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class Actor:
    """
    Who is making a structural write, for the audit row.

    `user` is a person at a button. `george` is the injected writer acting on
    a request made in conversation, and carries the conversation it was made
    in. Neither changes what is allowed — ownership is the owner's, whoever
    presses the key — only what the record says.
    """

    kind: Literal["user", "george"]
    conversation_id: Optional[uuid.UUID] = None


USER = Actor("user")


def george_actor(conversation_id: Optional[str]) -> Actor:
    cid = None
    if conversation_id:
        try:
            cid = uuid.UUID(str(conversation_id))
        except ValueError:
            cid = None
    return Actor("george", cid)


# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

def normalize_title(title: Any) -> str:
    """
    Trim, collapse internal whitespace, keep case — the page-name rule a pin's
    label has always obeyed (pin_runner.normalize_page) — and refuse blank or
    over-long. Historical naming semantics are kept on purpose.
    """
    if title is not None and not isinstance(title, str):
        raise PageValidationError("A page title must be text.")
    cleaned = normalize_page(title)
    if not cleaned:
        raise PageValidationError("A page needs a title.")
    if len(cleaned) > MAX_TITLE_LEN:
        raise PageValidationError(
            f"A page title may be at most {MAX_TITLE_LEN} characters; this one is "
            f"{len(cleaned)}."
        )
    return cleaned


def normalize_purpose(purpose: Any) -> Optional[str]:
    """
    One line, at most MAX_PURPOSE_LEN, or None. Line breaks become spaces —
    a purpose is a sentence under a title, not a document — and an empty
    string clears it.
    """
    if purpose is None:
        return None
    if not isinstance(purpose, str):
        raise PageValidationError("A page purpose must be text.")
    cleaned = normalize_page(purpose)
    if not cleaned:
        return None
    if len(cleaned) > MAX_PURPOSE_LEN:
        raise PageValidationError(
            f"A page purpose may be at most {MAX_PURPOSE_LEN} characters; this one "
            f"is {len(cleaned)}."
        )
    return cleaned


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Reads that the writes need — every one scoped in the statement
# ---------------------------------------------------------------------------

async def list_pages(db: AsyncSession, owner: str) -> list[GeorgePage]:
    """The caller's pages, most recently changed first; title as the tie-break."""
    rows = (
        await db.execute(
            select(GeorgePage)
            .where(GeorgePage.owner == owner)
            .order_by(GeorgePage.updated_at.desc(), GeorgePage.title.asc())
        )
    ).scalars().all()
    return list(rows)


async def lock_workspace(db: AsyncSession, owner: str) -> None:
    """Serialize structural writes for one owner until commit or rollback.

    Covers empty Pages and Ungrouped too, where no parent row can be locked.
    This is a parameterized application-role query; George never connects.
    """
    await db.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(owner, 87103))))


async def page_titles(db: AsyncSession, owner: str) -> list[str]:
    rows = (
        await db.execute(select(GeorgePage.title).where(GeorgePage.owner == owner))
    ).scalars().all()
    return [r for r in rows if r]


async def get_page(db: AsyncSession, owner: str, page_id: uuid.UUID) -> GeorgePage:
    """One of the caller's pages, or PageNotFound. Foreign and missing are one answer."""
    page = (
        await db.execute(
            select(GeorgePage).where(GeorgePage.id == page_id, GeorgePage.owner == owner)
        )
    ).scalar_one_or_none()
    if page is None:
        raise PageNotFound("Page not found.")
    return page


async def find_page_by_title(db: AsyncSession, owner: str, title: str) -> Optional[GeorgePage]:
    """The caller's page with EXACTLY this normalised title, or None."""
    name = normalize_page(title)
    if not name:
        return None
    return (
        await db.execute(
            select(GeorgePage).where(GeorgePage.owner == owner, GeorgePage.title == name)
        )
    ).scalar_one_or_none()


async def resolve_page_title(db: AsyncSession, owner: str, title: str) -> GeorgePage:
    """
    A page named by a person, resolved deterministically or refused.

    Exact match wins. Failing that, a UNIQUE case-insensitive match is that
    page — one candidate is not a guess. Two case-variants and no exact match
    is AmbiguousTarget with both. Nothing is PageNotFound, and the message
    lists the caller's pages so the next attempt can name one.
    """
    name = normalize_page(title)
    if not name:
        raise PageValidationError("A page title is needed to find the page.")
    exact = await find_page_by_title(db, owner, name)
    if exact is not None:
        return exact
    candidates = [p for p in await list_pages(db, owner) if p.title.lower() == name.lower()]
    if len(candidates) == 1:
        return candidates[0]
    if len(candidates) > 1:
        raise AmbiguousTarget("page", name, [
            {"page_id": str(p.id), "title": p.title} for p in candidates
        ])
    have = ", ".join(repr(p.title) for p in await list_pages(db, owner)) or "none"
    raise PageNotFound(f"You have no page called {name!r}. Your pages: {have}.")


async def _count_pages(db: AsyncSession, owner: str) -> int:
    return (
        await db.execute(
            select(func.count()).select_from(GeorgePage).where(GeorgePage.owner == owner)
        )
    ).scalar_one()


async def ensure_title_free(
    db: AsyncSession, owner: str, title: str, *,
    allow_similar_page: bool = False, except_page_id: Optional[uuid.UUID] = None,
) -> None:
    """
    Refuse a title the caller already uses exactly, and a case-only variant of
    one they use unless they asked to keep both. `except_page_id` is the page
    being renamed, whose own current title must not count against it.
    """
    pages = [p for p in await list_pages(db, owner) if p.id != except_page_id]
    if any(p.title == title for p in pages):
        raise PageValidationError(f"You already have a page called {title!r}.")
    if not allow_similar_page:
        similar = find_similar_page(title, [p.title for p in pages])
        if similar:
            raise SimilarPageError(existing_page=similar, submitted_page=title)


async def page_pins(db: AsyncSession, owner: str, page_id: Optional[uuid.UUID]) -> list[GeorgePin]:
    """
    The caller's pins on one page, in the page's order.

    A real page orders by position (created_at DESC, id DESC as the total
    tie-break, which only matters if the invariant is ever broken from
    outside). Ungrouped — page_id None — orders by created_at DESC, id DESC,
    because it has no positions.
    """
    stmt = select(GeorgePin).where(GeorgePin.created_by == owner)
    if page_id is None:
        stmt = stmt.where(GeorgePin.page_id.is_(None)).order_by(
            GeorgePin.created_at.desc(), GeorgePin.id.desc()
        )
    else:
        stmt = stmt.where(GeorgePin.page_id == page_id).order_by(
            GeorgePin.position.asc(), GeorgePin.created_at.desc(), GeorgePin.id.desc()
        )
    return list((await db.execute(stmt)).scalars().all())


async def get_pin(db: AsyncSession, owner: str, pin_id: uuid.UUID) -> GeorgePin:
    pin = (
        await db.execute(
            select(GeorgePin).where(GeorgePin.id == pin_id, GeorgePin.created_by == owner)
        )
    ).scalar_one_or_none()
    if pin is None:
        raise PinNotFound("Pin not found.")
    return pin


class _Any:
    def __repr__(self) -> str:  # pragma: no cover
        return "ANY_PAGE"


ANY_PAGE: Any = _Any()


async def resolve_pin(
    db: AsyncSession, owner: str, *,
    pin_id: Optional[Any] = None, title: Optional[str] = None,
    within_page: Any = ANY_PAGE,
) -> GeorgePin:
    """
    A pin named by id (authoritative) or by title (a convenience), resolved
    deterministically or refused.

    `within_page` narrows a title search to one page (a real page's id, or
    None for Ungrouped); ANY_PAGE searches every pin of the caller's. An id
    is never narrowed — an owned pin is an owned pin — but it is always
    scoped to the owner. Title resolution: exact matches first; if exactly
    one, that pin; if several, AmbiguousTarget naming each with its id and
    page; if none, a unique case-insensitive match; otherwise PinNotFound
    listing what IS there.
    """
    if pin_id is not None:
        try:
            pid = uuid.UUID(str(pin_id))
        except ValueError as exc:
            raise PinNotFound(f"{pin_id!r} is not a pin id.") from exc
        return await get_pin(db, owner, pid)

    name = normalize_page(title)
    if not name:
        raise PageValidationError("Name the analysis by pin_id or by title.")

    stmt = select(GeorgePin).where(GeorgePin.created_by == owner)
    if within_page is None:
        stmt = stmt.where(GeorgePin.page_id.is_(None))
    elif within_page is not ANY_PAGE:
        stmt = stmt.where(GeorgePin.page_id == within_page)
    pool = list((await db.execute(stmt.order_by(GeorgePin.created_at.desc()))).scalars().all())

    def describe(p: GeorgePin) -> dict[str, Any]:
        return {"pin_id": str(p.id), "title": p.title,
                "page_id": str(p.page_id) if p.page_id else None,
                "page_title": p.page}

    exact = [p for p in pool if normalize_page(p.title) == name]
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        raise AmbiguousTarget("pin", name, [describe(p) for p in exact])
    loose = [p for p in pool if (normalize_page(p.title) or "").lower() == name.lower()]
    if len(loose) == 1:
        return loose[0]
    if len(loose) > 1:
        raise AmbiguousTarget("pin", name, [describe(p) for p in loose])
    where = ("in Ungrouped" if within_page is None
             else "on this page" if within_page is not ANY_PAGE else "among your pins")
    have = ", ".join(repr(p.title) for p in pool[:20]) or "none"
    raise PinNotFound(f"No analysis called {name!r} {where}. There: {have}.")


# ---------------------------------------------------------------------------
# The audit row
# ---------------------------------------------------------------------------

def _event(
    db: AsyncSession, *, owner: str, actor: Actor, operation: str,
    page_id: Optional[uuid.UUID], pin_id: Optional[uuid.UUID] = None,
    before: Optional[dict[str, Any]] = None, after: Optional[dict[str, Any]] = None,
) -> GeorgePageEvent:
    row = GeorgePageEvent(
        id=uuid.uuid4(), page_id=page_id, owner=owner, actor=actor.kind,
        operation=operation, pin_id=pin_id, before=before, after=after,
        conversation_id=actor.conversation_id, at=_now(),
    )
    db.add(row)
    return row


def _touch(page: Optional[GeorgePage]) -> None:
    if page is not None:
        page.updated_at = _now()


def renumber(pins: list[GeorgePin]) -> list[GeorgePin]:
    """Dense 0..n-1 in the order given. Pure; the caller flushes."""
    for i, pin in enumerate(pins):
        if pin.position != i:
            pin.position = i
    return pins


# ---------------------------------------------------------------------------
# Page writes
# ---------------------------------------------------------------------------

async def create_page(
    db: AsyncSession, *, owner: str, title: str, purpose: Optional[str] = None,
    actor: Actor = USER, allow_similar_page: bool = False,
) -> GeorgePage:
    """An empty page. It exists from this moment, with nothing on it yet."""
    await lock_workspace(db, owner)
    name = normalize_title(title)
    why = normalize_purpose(purpose)
    if await _count_pages(db, owner) >= MAX_PAGES_PER_OWNER:
        raise PageQuotaError(
            f"You already have {MAX_PAGES_PER_OWNER} pages, the maximum. "
            f"Delete or merge some first."
        )
    await ensure_title_free(db, owner, name, allow_similar_page=allow_similar_page)
    now = _now()
    page = GeorgePage(id=uuid.uuid4(), owner=owner, title=name, purpose=why,
                      created_at=now, updated_at=now)
    db.add(page)
    _event(db, owner=owner, actor=actor, operation="create", page_id=page.id,
           after={"title": name, "purpose": why})
    await db.flush()
    return page


async def rename_page(
    db: AsyncSession, *, owner: str, page_id: uuid.UUID, title: str,
    actor: Actor = USER, allow_similar_page: bool = False,
) -> GeorgePage:
    """
    A new title on the same row. Identity does not move: every thread bound
    to this page, every URL and every reader or writer closed over its id
    keeps pointing here. A case-only change of THIS page's own title is
    allowed; a collision with ANOTHER page is refused as on create.
    """
    await lock_workspace(db, owner)
    page = await get_page(db, owner, page_id)
    name = normalize_title(title)
    if name == page.title:
        return page
    await ensure_title_free(db, owner, name, allow_similar_page=allow_similar_page,
                            except_page_id=page.id)
    before = page.title
    page.title = name
    _touch(page)
    _event(db, owner=owner, actor=actor, operation="rename", page_id=page.id,
           before={"title": before}, after={"title": name})
    await db.flush()
    return page


async def set_purpose(
    db: AsyncSession, *, owner: str, page_id: uuid.UUID, purpose: Optional[str],
    actor: Actor = USER,
) -> GeorgePage:
    await lock_workspace(db, owner)
    page = await get_page(db, owner, page_id)
    why = normalize_purpose(purpose)
    if why == page.purpose:
        return page
    before = page.purpose
    page.purpose = why
    _touch(page)
    _event(db, owner=owner, actor=actor, operation="set_purpose", page_id=page.id,
           before={"purpose": before}, after={"purpose": why})
    await db.flush()
    return page


@dataclass(frozen=True)
class DeletedPage:
    page_id: uuid.UUID
    title: str
    pins_ungrouped: int


async def delete_page(
    db: AsyncSession, *, owner: str, page_id: uuid.UUID, actor: Actor = USER,
) -> DeletedPage:
    """
    Delete the page ROW. Every pin on it moves to Ungrouped; no pin is
    deleted. Manual UI only — George has no delete in V1 — but it lives here
    so the semantics cannot be re-decided by a route.
    """
    await lock_workspace(db, owner)
    page = await get_page(db, owner, page_id)
    pins = await page_pins(db, owner, page.id)
    for pin in pins:
        _event(db, owner=owner, actor=actor, operation="remove", page_id=page.id,
               pin_id=pin.id,
               before={"page_id": str(page.id), "position": pin.position},
               after={"page_id": None})
        pin.page_id = None
        pin.page_obj = None
        pin.position = 0
    _event(db, owner=owner, actor=actor, operation="delete", page_id=page.id,
           before={"title": page.title, "purpose": page.purpose, "pins": len(pins)})
    title = page.title
    await db.flush()
    await db.delete(page)
    await db.flush()
    return DeletedPage(page_id=page_id, title=title, pins_ungrouped=len(pins))


# ---------------------------------------------------------------------------
# Membership and order
# ---------------------------------------------------------------------------

Placement = dict[str, Any]   # {"before": pin_id} | {"after": pin_id} | {"at": "top"|"bottom"}


def _placement_index(order: list[GeorgePin], moving: GeorgePin, place: Optional[Placement]) -> int:
    """
    Where `moving` goes in `order` (which does not contain it). Bottom by
    default. Relational only — never a raw integer from a caller.
    """
    if not place:
        return len(order)
    if not isinstance(place, dict) or len(place) != 1:
        raise PageValidationError(
            'place must be exactly one of {"before": pin_id}, {"after": pin_id}, '
            '{"at": "top"} or {"at": "bottom"}.'
        )
    (key, value), = place.items()
    if key == "at":
        if value == "top":
            return 0
        if value == "bottom":
            return len(order)
        raise PageValidationError('place.at must be "top" or "bottom".')
    if key not in ("before", "after"):
        raise PageValidationError(f"Unknown placement {key!r}.")
    try:
        anchor = uuid.UUID(str(value))
    except ValueError as exc:
        raise PageValidationError(f"place.{key} must be a pin id.") from exc
    if anchor == moving.id:
        raise PageValidationError("An analysis cannot be placed relative to itself.")
    for i, pin in enumerate(order):
        if pin.id == anchor:
            return i if key == "before" else i + 1
    raise PinNotFound(f"place.{key}: no analysis with id {anchor} is on this page.")


async def move_pin(
    db: AsyncSession, *, owner: str, pin: GeorgePin, to_page: Optional[GeorgePage],
    place: Optional[Placement] = None, actor: Actor = USER,
) -> GeorgePin:
    """
    Put a pin on a page (existing), off a page (None = Ungrouped), or at a
    place on the page it is already on. Every page touched is renumbered
    0..n-1 before this returns. The calls, the question, the provenance and
    the run history are never touched, and nothing is re-run: membership is
    not a figure.
    """
    await lock_workspace(db, owner)
    if pin.created_by != owner:
        raise PinNotFound("Pin not found.")
    if to_page is not None and to_page.owner != owner:
        # Unreachable through get_page, kept so a caller cannot hand in a row
        # it fetched some other way.
        raise PageNotFound("Page not found.")

    source_id = pin.page_id
    target_id = to_page.id if to_page is not None else None
    same_page = source_id == target_id

    if target_id is None and place:
        raise NotAPage("Ungrouped keeps no order; a pin there cannot be placed.")
    if same_page and (target_id is None or not place):
        return pin   # already there, and nowhere in particular to go: nothing to do

    source_page = None
    if source_id is not None and not same_page:
        source_page = await get_page(db, owner, source_id)

    before = {"page_id": str(source_id) if source_id else None,
              "position": pin.position if source_id else None}

    # Take it off the source page and close the gap there.
    if source_id is not None and not same_page:
        remaining = [p for p in await page_pins(db, owner, source_id) if p.id != pin.id]
        renumber(remaining)
        _touch(source_page)

    if to_page is None:
        pin.page_id = None
        pin.page_obj = None
        pin.position = 0
        _event(db, owner=owner, actor=actor, operation="remove", page_id=source_id,
               pin_id=pin.id, before=before, after={"page_id": None})
        await db.flush()
        return pin

    # Put it on the target page, at the place asked for (bottom by default).
    order = [p for p in await page_pins(db, owner, to_page.id) if p.id != pin.id]
    if not same_page and len(order) >= MAX_PINS_PER_PAGE:
        raise PageQuotaError(
            f"{to_page.title!r} already holds {MAX_PINS_PER_PAGE} analyses, the "
            f"maximum for one page."
        )
    index = _placement_index(order, pin, place)
    order.insert(index, pin)
    pin.page_id = to_page.id
    pin.page_obj = to_page
    renumber(order)
    _touch(to_page)

    after = {"page_id": str(to_page.id), "position": pin.position}
    if same_page:
        if before["position"] != after["position"]:
            _event(db, owner=owner, actor=actor, operation="place", page_id=to_page.id,
                   pin_id=pin.id, before=before, after=after)
    elif source_id is None:
        _event(db, owner=owner, actor=actor, operation="add", page_id=to_page.id,
               pin_id=pin.id, before=before, after=after)
    else:
        _event(db, owner=owner, actor=actor, operation="move", page_id=source_id,
               pin_id=pin.id, before=before, after=after)
        _event(db, owner=owner, actor=actor, operation="add", page_id=to_page.id,
               pin_id=pin.id, before=before, after=after)
    await db.flush()
    return pin


async def place_pin(
    db: AsyncSession, *, owner: str, pin: GeorgePin, place: Placement, actor: Actor = USER,
) -> GeorgePin:
    """Reorder within the pin's own page. Refused for a pin in Ungrouped."""
    await lock_workspace(db, owner)
    if pin.page_id is None:
        raise NotAPage("This analysis is in Ungrouped, which keeps no order. Put it on a page first.")
    page = await get_page(db, owner, pin.page_id)
    return await move_pin(db, owner=owner, pin=pin, to_page=page, place=place, actor=actor)


async def append_new_pin(
    db: AsyncSession, *, owner: str, pin: GeorgePin, to_page: Optional[GeorgePage],
    actor: Actor = USER,
) -> GeorgePin:
    """
    A pin that is being CREATED joins a page at the bottom. Called by
    pin_writer.create_pin only; the pin is not yet flushed. Ungrouped is a
    no-op beyond leaving page_id NULL.
    """
    await lock_workspace(db, owner)
    if to_page is None:
        pin.page_id = None
        pin.page_obj = None
        pin.position = 0
        return pin
    existing = await page_pins(db, owner, to_page.id)
    if len(existing) >= MAX_PINS_PER_PAGE:
        raise PageQuotaError(
            f"{to_page.title!r} already holds {MAX_PINS_PER_PAGE} analyses, the "
            f"maximum for one page."
        )
    pin.page_id = to_page.id
    pin.page_obj = to_page
    pin.position = len(existing)
    _touch(to_page)
    _event(db, owner=owner, actor=actor, operation="add", page_id=to_page.id,
           pin_id=pin.id, before={"page_id": None},
           after={"page_id": str(to_page.id), "position": pin.position, "title": pin.title})
    return pin


async def page_for_write(
    db: AsyncSession, *, owner: str, title: Optional[str], actor: Actor = USER,
    allow_similar_page: bool = False,
) -> Optional[GeorgePage]:
    """
    The page a pin should land on when a caller named it by TITLE — the Pin
    dialog's "New page" box and pin_answer's `page` argument. An exact
    existing title is that page; a new title creates one, because a page
    still comes into being the moment something is pinned to a new name;
    None or blank is Ungrouped. The collision rule applies as everywhere.
    """
    await lock_workspace(db, owner)
    name = normalize_page(title)
    if not name:
        return None
    existing = await find_page_by_title(db, owner, name)
    if existing is not None:
        return existing
    return await create_page(db, owner=owner, title=name, actor=actor,
                             allow_similar_page=allow_similar_page)


async def events_for(db: AsyncSession, owner: str, page_id: uuid.UUID,
                     limit: int = 100) -> list[GeorgePageEvent]:
    """The audit rows for one of the caller's pages, newest first."""
    await get_page(db, owner, page_id)
    rows = (
        await db.execute(
            select(GeorgePageEvent)
            .where(GeorgePageEvent.owner == owner, GeorgePageEvent.page_id == page_id)
            .order_by(GeorgePageEvent.at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(rows)
