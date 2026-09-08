"""
Page Workshop — a page built or edited as ONE atomic act.

George's two write tools (`create_page`, `edit_page` in agent/write_tools.py)
end here, through the injected PageWriter, and so may a route that wants the
same batch semantics. Everything each function does is either all persisted or
none of it:

    1. resolve every target        (page ids, pin ids, titles → rows)
    2. validate every call         (the live tool surface, the per-pin cap)
    3. validate ownership          (every row is the caller's — get_page/get_pin)
    4. validate quotas and bounds  (pages, pins, analyses per build, ops per edit)
    5. calculate the result        (positions come from page_writer, densely)
    6. only then mutate
    7. the CALLER commits once

A failure anywhere before the commit raises, and because every mutation is in
the caller's open transaction, nothing is left behind: a build whose fourth
analysis would breach a constraint does not leave the first three on a new
page. Step 6 is still written defensively — page_writer's own checks stay on —
so a bound the planner missed is a rollback, never a half-built page.

THE ANALYTICAL READS ARE NOT IN HERE. What arrives as an analysis is a list of
{tool, arguments} the loop has already checked against the calls that actually
ran this conversation (write_tools._unrun), or the id of a pin the caller
already owns. Nothing is re-run to be saved, and nothing here can run anything:
validate_calls checks shape and vocabulary against the read surface, which is
also why a page can never hold view_page, a write tool or a composite.

Sections are absent by decision (V1.1). Positions are page-wide.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_page import GeorgePage
from app.models.george_pin import GeorgePin
from app.services import page_writer, pin_writer
from app.services.page_writer import (
    ANY_PAGE,
    MAX_PINS_PER_PAGE,
    USER,
    Actor,
    NotAPage,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    normalize_purpose,
    normalize_title,
)

# Bounds on one act. Operational, like MAX_TOOL_CALLS_PER_PIN.
MAX_ANALYSES_PER_BUILD = 6
MAX_OPERATIONS_PER_EDIT = 10
MAX_ADDS_PER_EDIT = 6

# The closed set of things edit_page can do. Mirrored in the tool schema.
EDIT_OPERATIONS = (
    "rename", "set_purpose", "add", "add_existing", "remove", "move_to_page", "place",
)


# ---------------------------------------------------------------------------
# Shapes
# ---------------------------------------------------------------------------

def _analysis_row(pin: GeorgePin) -> dict[str, Any]:
    return {
        "pin_id": str(pin.id),
        "title": pin.title,
        "position": pin.position,
        "tools": [c.get("tool") for c in (pin.tool_calls or [])],
        "calls": [dict(c) for c in (pin.tool_calls or [])],
    }


def page_summary(page: GeorgePage, pins: list[GeorgePin]) -> dict[str, Any]:
    """The page after a write, as every caller reports it."""
    return {
        "page_id": str(page.id),
        "title": page.title,
        "purpose": page.purpose,
        "created_at": page.created_at.isoformat() if page.created_at else None,
        "updated_at": page.updated_at.isoformat() if page.updated_at else None,
        "analyses": [_analysis_row(p) for p in pins],
        "analysis_count": len(pins),
    }


@dataclass(frozen=True)
class PageResult:
    page: dict[str, Any]
    # What was done, in order, each as a small structured record the UI turns
    # into a confirmation line — never a sentence the model wrote.
    operations: list[dict[str, Any]] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Building
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class _NewAnalysis:
    title: str
    calls: list[dict]


@dataclass(frozen=True)
class _ExistingAnalysis:
    pin: GeorgePin


def _normalize_analysis_title(title: Any, calls: list[dict]) -> str:
    cleaned = (title or "").strip() if isinstance(title, str) else ""
    if not cleaned:
        cleaned = calls[0]["tool"] if calls else ""
    if not cleaned:
        raise PageValidationError("Each analysis needs a title.")
    return cleaned[:200]


async def _plan_analyses(
    db: AsyncSession, owner: str, analyses: Any,
) -> list[_NewAnalysis | _ExistingAnalysis]:
    if analyses is None:
        return []
    if not isinstance(analyses, list):
        raise PageValidationError("analyses must be a list.")
    if len(analyses) > MAX_ANALYSES_PER_BUILD:
        raise PageValidationError(
            f"A page is built from at most {MAX_ANALYSES_PER_BUILD} analyses at once; "
            f"{len(analyses)} were given. Create it with the most useful few and add "
            f"the rest afterwards."
        )
    planned: list[_NewAnalysis | _ExistingAnalysis] = []
    seen_pins: set[uuid.UUID] = set()
    seen_calls: set[str] = set()
    for i, entry in enumerate(analyses):
        if not isinstance(entry, dict):
            raise PageValidationError(f"analyses[{i}] must be an object.")
        if entry.get("pin_id") is not None:
            if entry.get("tool_calls") is not None:
                raise PageValidationError("Give pin_id or tool_calls, not both.")
            pin = await page_writer.resolve_pin(db, owner, pin_id=entry["pin_id"])
            if pin.id in seen_pins:
                raise PageValidationError(f"analyses[{i}] names pin {pin.id} twice.")
            seen_pins.add(pin.id)
            planned.append(_ExistingAnalysis(pin))
        elif entry.get("tool_calls") is not None:
            calls = pin_writer.validate_pin_calls(entry["tool_calls"])
            _unique_calls(calls, seen_calls)
            planned.append(_NewAnalysis(_normalize_analysis_title(entry.get("title"), calls), calls))
        else:
            raise PageValidationError(
                f"analyses[{i}] must carry either tool_calls (a new analysis) or "
                f"pin_id (an existing one)."
            )
    return planned


def _unique_calls(calls: list[dict], seen: set[str]) -> None:
    for call in calls:
        key = json.dumps(call, sort_keys=True, separators=(",", ":"))
        if key in seen:
            raise PageValidationError("A Page build/edit cannot add the same read twice.")
        seen.add(key)


async def build_page(
    db: AsyncSession,
    *,
    owner: str,
    title: str,
    purpose: Optional[str] = None,
    analyses: Optional[list[dict[str, Any]]] = None,
    question: Optional[str] = None,
    conversation_id: Optional[uuid.UUID] = None,
    actor: Actor = USER,
    allow_similar_page: bool = False,
) -> PageResult:
    """
    A new page with its first analyses, or an empty one, as one act.

    Validation is complete before the page row exists: the title and purpose,
    the page quota, every analysis (each new one's calls against the live
    surface and the per-pin cap; each existing one an owned pin), the pin quota
    for the new ones, and the page's own capacity. Then the page is created,
    new pins are appended in the order given and existing pins moved onto the
    page after them, each landing at the bottom, so the page reads in the
    order it was described.
    """
    await page_writer.lock_workspace(db, owner)
    name = normalize_title(title)
    why = normalize_purpose(purpose)
    planned = await _plan_analyses(db, owner, analyses)
    if len(planned) > MAX_PINS_PER_PAGE:   # unreachable while MAX_ANALYSES_PER_BUILD < it
        raise PageQuotaError(f"A page holds at most {MAX_PINS_PER_PAGE} analyses.")
    new_count = sum(1 for p in planned if isinstance(p, _NewAnalysis))
    if new_count:
        await pin_writer.ensure_pin_quota(db, owner, adding=new_count)

    page = await page_writer.create_page(
        db, owner=owner, title=name, purpose=why, actor=actor,
        allow_similar_page=allow_similar_page,
    )
    ops: list[dict[str, Any]] = [{"op": "create", "page_id": str(page.id), "title": page.title}]

    for item in planned:
        if isinstance(item, _NewAnalysis):
            created = await pin_writer.create_pin(
                db, username=owner, tool_calls=item.calls, title=item.title,
                question=question, conversation_id=conversation_id,
                page_id=page.id, actor=actor, announce=False,
            )
            ops.append({"op": "add", "pin_id": str(created.row.id), "title": created.row.title,
                        "position": created.row.position, "source": "new"})
        else:
            pin = item.pin
            came_from = {"page_id": str(pin.page_id) if pin.page_id else None,
                         "page_title": pin.page}
            await page_writer.move_pin(db, owner=owner, pin=pin, to_page=page, actor=actor)
            ops.append({"op": "add", "pin_id": str(pin.id), "title": pin.title,
                        "position": pin.position, "source": "existing",
                        "from": came_from})

    pins = await page_writer.page_pins(db, owner, page.id)
    return PageResult(page=page_summary(page, pins), operations=ops)


# ---------------------------------------------------------------------------
# Editing
# ---------------------------------------------------------------------------

@dataclass
class _Plan:
    """Everything resolved and checked, before the first mutation."""

    page: GeorgePage
    steps: list[dict[str, Any]] = field(default_factory=list)


def _one_of(op: dict, *keys: str) -> Optional[str]:
    present = [k for k in keys if op.get(k) is not None]
    if len(present) > 1:
        raise PageValidationError(
            f"{op.get('op')}: give exactly one of {', '.join(keys)}, not several."
        )
    return present[0] if present else None


async def _resolve_target_pin(
    db: AsyncSession, owner: str, op: dict, *, within: Any,
) -> GeorgePin:
    which = _one_of(op, "pin_id", "title")
    if which is None:
        raise PageValidationError(f"{op.get('op')}: name the analysis by pin_id or title.")
    return await page_writer.resolve_pin(
        db, owner, pin_id=op.get("pin_id"),
        title=op.get("title") if which == "title" else None, within_page=within,
    )


async def _resolve_destination(
    db: AsyncSession, owner: str, op: dict,
) -> Optional[GeorgePage]:
    """Writes accept stable identity only; title discovery belongs to reads."""
    if "page_title" in op:
        raise PageValidationError("Resolve the destination from owned Page metadata and supply page_id.")
    if "page_id" in op and op["page_id"] is None:
        return None
    if "page_id" not in op:
        raise PageValidationError(
            "move_to_page: give the destination as page_id, or "
            "page_id: null for Ungrouped."
        )
    try:
        pid = uuid.UUID(str(op["page_id"]))
    except ValueError as exc:
        raise PageNotFound(f"{op['page_id']!r} is not a page id.") from exc
    return await page_writer.get_page(db, owner, pid)


async def plan_edit(
    db: AsyncSession, *, owner: str, page_id: uuid.UUID, operations: Any,
) -> _Plan:
    """
    Resolve and validate every operation against the page as it stands.
    Nothing is written. Order-dependent effects (an add that would exceed the
    page's capacity after earlier adds) are checked against a running count.
    """
    if not isinstance(operations, list) or not operations:
        raise PageValidationError("operations must be a non-empty list.")
    if len(operations) > MAX_OPERATIONS_PER_EDIT:
        raise PageValidationError(
            f"One edit may carry at most {MAX_OPERATIONS_PER_EDIT} operations; "
            f"{len(operations)} were given."
        )
    page = await page_writer.get_page(db, owner, page_id)
    plan = _Plan(page=page)

    on_page = len(await page_writer.page_pins(db, owner, page.id))
    adds = 0
    new_pins = 0
    seen_calls: set[str] = set()
    titles_in_use = {p.title for p in await page_writer.list_pages(db, owner) if p.id != page.id}
    for i, op in enumerate(operations):
        if not isinstance(op, dict) or not isinstance(op.get("op"), str):
            raise PageValidationError(f"operations[{i}] must be an object with an 'op'.")
        kind = op["op"]
        if kind not in EDIT_OPERATIONS:
            raise PageValidationError(
                f"operations[{i}]: unknown op {kind!r}. One of: {', '.join(EDIT_OPERATIONS)}."
            )

        if kind == "rename":
            name = normalize_title(op.get("title"))
            await page_writer.ensure_title_free(
                db, owner, name, except_page_id=page.id,
                allow_similar_page=bool(op.get("allow_similar_page")),
            )
            if name != page.title and name in titles_in_use:
                raise PageValidationError(f"You already have a page called {name!r}.")
            plan.steps.append({"op": kind, "title": name,
                               "allow_similar_page": bool(op.get("allow_similar_page"))})

        elif kind == "set_purpose":
            plan.steps.append({"op": kind, "purpose": normalize_purpose(op.get("purpose"))})

        elif kind == "add":
            adds += 1
            if adds > MAX_ADDS_PER_EDIT:
                raise PageValidationError(
                    f"One edit may add at most {MAX_ADDS_PER_EDIT} analyses."
                )
            calls = pin_writer.validate_pin_calls(op.get("tool_calls") or [])
            _unique_calls(calls, seen_calls)
            title = _normalize_analysis_title(op.get("title"), calls)
            on_page += 1
            new_pins += 1
            plan.steps.append({"op": kind, "title": title, "calls": calls})

        elif kind == "add_existing":
            adds += 1
            if adds > MAX_ADDS_PER_EDIT:
                raise PageValidationError(
                    f"One edit may add at most {MAX_ADDS_PER_EDIT} analyses."
                )
            pin = await _resolve_target_pin(db, owner, op, within=ANY_PAGE)
            if pin.page_id != page.id:
                on_page += 1
            plan.steps.append({"op": kind, "pin": pin, "place": op.get("place")})

        elif kind == "remove":
            pin = await _resolve_target_pin(db, owner, op, within=page.id)
            if pin.page_id != page.id:
                raise PageNotFound(f"{pin.title!r} is not on {page.title!r}.")
            on_page -= 1
            plan.steps.append({"op": kind, "pin": pin})

        elif kind == "move_to_page":
            pin = await _resolve_target_pin(db, owner, op, within=page.id)
            if pin.page_id != page.id:
                raise PageNotFound(f"{pin.title!r} is not on {page.title!r}.")
            dest = await _resolve_destination(db, owner, op)
            if dest is not None and dest.id == page.id:
                raise PageValidationError(
                    f"{pin.title!r} is already on {page.title!r}; use place to reorder it."
                )
            if dest is not None:
                dest_count = len(await page_writer.page_pins(db, owner, dest.id))
                if dest_count >= MAX_PINS_PER_PAGE:
                    raise PageQuotaError(
                        f"{dest.title!r} already holds {MAX_PINS_PER_PAGE} analyses."
                    )
            on_page -= 1
            plan.steps.append({"op": kind, "pin": pin, "dest": dest})

        elif kind == "place":
            pin = await _resolve_target_pin(db, owner, op, within=page.id)
            if pin.page_id != page.id:
                raise PageNotFound(f"{pin.title!r} is not on {page.title!r}.")
            place = op.get("place")
            if not place:
                raise PageValidationError(
                    'place needs a place: {"before": pin_id}, {"after": pin_id}, '
                    '{"at": "top"} or {"at": "bottom"}.'
                )
            plan.steps.append({"op": kind, "pin": pin, "place": place})

        if on_page > MAX_PINS_PER_PAGE:
            raise PageQuotaError(
                f"{page.title!r} would hold more than {MAX_PINS_PER_PAGE} analyses after "
                f"operations[{i}]; the maximum for one page is {MAX_PINS_PER_PAGE}."
            )

    if new_pins:
        await pin_writer.ensure_pin_quota(db, owner, adding=new_pins)
    await _preflight_order(db, owner, plan)
    return plan


async def _preflight_order(db: AsyncSession, owner: str, plan: _Plan) -> None:
    """Simulate all memberships and relational placements without changing ORM rows."""
    orders: dict[uuid.UUID, list[GeorgePin]] = {}
    locations: dict[uuid.UUID, Optional[uuid.UUID]] = {}

    async def order(pid):
        if pid not in orders:
            orders[pid] = list(await page_writer.page_pins(db, owner, pid))
        return orders[pid]

    for step in plan.steps:
        kind = step["op"]
        if kind in ("rename", "set_purpose"):
            continue
        if kind == "add":
            pin = GeorgePin(id=uuid.uuid4())
            source = None
        else:
            pin = step["pin"]
            source = locations.get(pin.id, pin.page_id)
            if kind in ("remove", "move_to_page", "place") and source != plan.page.id:
                raise PageValidationError("An earlier operation already moved this analysis off the Page.")
        destination = plan.page.id
        if kind == "remove":
            destination = None
        elif kind == "move_to_page":
            destination = step["dest"].id if step["dest"] else None
        if source is not None:
            orders[source] = [p for p in await order(source) if p.id != pin.id]
        if destination is not None:
            target = [p for p in await order(destination) if p.id != pin.id]
            index = page_writer._placement_index(target, pin, step.get("place"))
            target.insert(index, pin)
            if len(target) > MAX_PINS_PER_PAGE:
                raise PageQuotaError(f"A Page holds at most {MAX_PINS_PER_PAGE} analyses.")
            orders[destination] = target
        elif step.get("place"):
            raise NotAPage("Ungrouped keeps no order.")
        locations[pin.id] = destination


async def apply_edit(
    db: AsyncSession,
    *,
    owner: str,
    page_id: Optional[uuid.UUID],
    operations: list[dict[str, Any]],
    question: Optional[str] = None,
    conversation_id: Optional[uuid.UUID] = None,
    actor: Actor = USER,
) -> PageResult:
    """
    Edit one of the caller's pages: plan everything, then do it, in order.

    `page_id` None is Ungrouped, which is not a page and cannot be edited —
    the caller substitutes the page in scope before calling; a null scope
    means there is nothing to edit.
    """
    await page_writer.lock_workspace(db, owner)
    if page_id is None:
        raise NotAPage(
            "Ungrouped is not a page: it cannot be renamed, described or reordered. "
            "Name a page by page_id, or ask from a page."
        )
    plan = await plan_edit(db, owner=owner, page_id=page_id, operations=operations)
    page = plan.page
    ops: list[dict[str, Any]] = []

    for step in plan.steps:
        kind = step["op"]
        if kind == "rename":
            before = page.title
            await page_writer.rename_page(
                db, owner=owner, page_id=page.id, title=step["title"], actor=actor,
                allow_similar_page=step["allow_similar_page"],
            )
            ops.append({"op": kind, "from": before, "to": page.title})

        elif kind == "set_purpose":
            before = page.purpose
            await page_writer.set_purpose(db, owner=owner, page_id=page.id,
                                          purpose=step["purpose"], actor=actor)
            ops.append({"op": kind, "from": before, "to": page.purpose})

        elif kind == "add":
            created = await pin_writer.create_pin(
                db, username=owner, tool_calls=step["calls"], title=step["title"],
                question=question, conversation_id=conversation_id,
                page_id=page.id, actor=actor, announce=False,
            )
            ops.append({"op": kind, "pin_id": str(created.row.id), "title": created.row.title,
                        "position": created.row.position, "source": "new"})

        elif kind == "add_existing":
            pin = step["pin"]
            came_from = {"page_id": str(pin.page_id) if pin.page_id else None,
                         "page_title": pin.page}
            await page_writer.move_pin(db, owner=owner, pin=pin, to_page=page,
                                       place=step.get("place"), actor=actor)
            ops.append({"op": "add", "pin_id": str(pin.id), "title": pin.title,
                        "position": pin.position, "source": "existing", "from": came_from})

        elif kind == "remove":
            pin = step["pin"]
            await page_writer.move_pin(db, owner=owner, pin=pin, to_page=None, actor=actor)
            ops.append({"op": kind, "pin_id": str(pin.id), "title": pin.title,
                        "from_page": page.title, "to": "ungrouped"})

        elif kind == "move_to_page":
            pin, dest = step["pin"], step["dest"]
            await page_writer.move_pin(db, owner=owner, pin=pin, to_page=dest, actor=actor)
            ops.append({
                "op": kind, "pin_id": str(pin.id), "title": pin.title,
                "from_page": page.title,
                "to_page_id": str(dest.id) if dest else None,
                "to_page": dest.title if dest else None,
            })

        elif kind == "place":
            pin = step["pin"]
            before = pin.position
            await page_writer.place_pin(db, owner=owner, pin=pin, place=step["place"], actor=actor)
            ops.append({"op": kind, "pin_id": str(pin.id), "title": pin.title,
                        "from_position": before, "position": pin.position})

    await db.flush()
    pins = await page_writer.page_pins(db, owner, page.id)
    return PageResult(page=page_summary(page, pins), operations=ops)
