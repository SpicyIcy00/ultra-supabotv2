"""
AUTHORITY — what reaches the approver, and who that is (W2.2, 2026-09-22).

The owner's ops/STANDARD.md §15 as rules a person binds and code applies:

  - THE LINE. "Under ₱20,000, don't interrupt me" is a new, immutable version
    of `authority.line` (metrics.yaml), bound by the APPROVER. It routes a
    draft; it never sends one.
  - THE ROUTE. A draft at or under the line lands in the list quietly; over
    it, with no line, or with a value that cannot be trusted (a line with no
    cost on file), it arrives as a decision — Approve · Change · Look into it.
  - THE QUEUE. Anybody signed in may submit a draft (a manager's request is a
    draft submitted by the manager); only an approver approves, rejects or
    changes. A change is a new row that replaces the old one, approved.
  - LEVEL FIVE. Nothing here sends anything. An approved draft is keyed into
    StoreHub by a person (`authority.keyed_into`).

THE FIGURES ARE CODE'S (rule 9). A draft is a read that ran: this module
re-runs that exact call through the read tools (the same functions a pin
replays) and values its order lines as quantity × products.cost with vetted,
parameterised SQL. Bob never supplies a quantity, a cost or a total.

WHAT IS PURE AND WHAT IS NOT. Everything that decides — who may do what, which
lines are orders, what they are worth, where the draft goes and the sentence
saying why — is a pure function over rows and definitions, so the contract
tests hold it without a database. The async functions below them read and
write george.people / authority_versions / requests on the application's own
session, the way every other writer here does (CLAUDE.md rule 4).
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable, Mapping, Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bob_authority import BobAuthorityVersion, BobPerson, BobRequest


class AuthorityRefused(ValueError):
    """The act cannot be done as asked, and the message says why."""


def _defs() -> dict:
    from tools._common import load_defs
    return load_defs()


def spec(defs: Optional[Mapping[str, Any]] = None) -> Mapping[str, Any]:
    d = defs if defs is not None else _defs()
    got = d.get("authority")
    if not isinstance(got, Mapping):
        raise RuntimeError("metrics.yaml has no `authority` block.")
    return got


# ---------------------------------------------------------------------------
# Who may do what — pure
# ---------------------------------------------------------------------------

def role_of(person: Optional[Mapping[str, Any]], defs: Optional[Mapping] = None) -> str:
    """A linked person's role, or what an account linked to nobody is."""
    a = spec(defs)
    if person and person.get("role") in (a.get("roles") or {}):
        return str(person["role"])
    return str(a.get("unlinked_account_role") or "requester")


def may(role: str, act: str, defs: Optional[Mapping] = None) -> bool:
    return act in (((spec(defs).get("roles") or {}).get(role) or {}).get("may") or [])


def approvers_named(people: Iterable[Mapping[str, Any]], defs: Optional[Mapping] = None) -> str:
    names = [p["display_name"] for p in people if may(str(p.get("role")), "approve", defs)]
    return " or ".join(names) if names else "the approver"


# ---------------------------------------------------------------------------
# The line — pure
# ---------------------------------------------------------------------------

def peso(value: Optional[Decimal | float | int], defs: Optional[Mapping] = None) -> str:
    """₱12,400 — or ₱12,400.50 when there are centavos. Code writes every digit."""
    if value is None:
        return "no value"
    sym = str((spec(defs).get("line") or {}).get("currency_symbol") or "₱")
    d = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if d == d.to_integral_value():
        return f"{sym}{int(d):,}"
    return f"{sym}{d:,.2f}"


def check_line(mode: Optional[str], line: Any,
               defs: Optional[Mapping] = None) -> tuple[str, Optional[Decimal]]:
    """
    A binding inside the declaration's bounds, or a refusal saying which bound.

    `mode` defaults to over_line when a line is given and to the declared
    default when none is: "don't ask me unless it's above ₱20,000" names a
    line; "ask me every time" names none.
    """
    decl = spec(defs).get("line") or {}
    modes = list((decl.get("modes") or {}).keys())
    if mode is None:
        mode = "over_line" if line is not None else str(decl.get("default_mode"))
    if mode not in modes:
        raise AuthorityRefused(
            f"{mode!r} is not a way the line works. It is one of: {', '.join(modes)} "
            f"(metrics.yaml authority.line.modes).")
    if mode != "over_line":
        if line is not None:
            raise AuthorityRefused(
                f"{mode} takes no amount — only over_line has a line. Leave the amount out.")
        return mode, None
    if line is None or isinstance(line, bool):
        raise AuthorityRefused("over_line needs the amount they said, in whole pesos.")
    try:
        amount = Decimal(str(line))
    except Exception:  # noqa: BLE001
        raise AuthorityRefused(f"{line!r} is not an amount in pesos.") from None
    bounds = decl.get("bounds") or {}
    lo, hi = Decimal(str(bounds.get("min"))), Decimal(str(bounds.get("max")))
    if amount != amount.to_integral_value():
        raise AuthorityRefused("The line is in whole pesos.")
    if not (lo <= amount <= hi):
        raise AuthorityRefused(
            f"The line must be between {peso(lo, defs)} and {peso(hi, defs)} "
            f"(metrics.yaml authority.line.bounds) — {peso(amount, defs)} is outside "
            f"it. Ask them to say it again rather than guessing.")
    return mode, amount


def describe_line(version: Optional[Mapping[str, Any]], defs: Optional[Mapping] = None) -> str:
    """The line in words, from the version row (or its absence)."""
    if not version:
        return "No line is set, so every draft is a decision."
    mode = version.get("mode")
    if mode == "over_line":
        return (f"Drafts over {peso(version.get('line_php'), defs)} are a decision; at or "
                f"under it they land in the list quietly.")
    if mode == "never":
        return "No draft interrupts; every draft lands in the list and still waits for a yes."
    return "Every draft is a decision."


# ---------------------------------------------------------------------------
# A draft — pure
# ---------------------------------------------------------------------------

def draft_spec(tool: str, arguments: Mapping[str, Any],
               defs: Optional[Mapping] = None) -> Mapping[str, Any]:
    """The declaration for the read this draft came from, or a refusal."""
    reads = ((spec(defs).get("drafts") or {}).get("reads") or {})
    got = reads.get(tool)
    if got is None:
        raise AuthorityRefused(
            f"{tool} does not return a draft. A draft comes from one of: "
            f"{', '.join(f'{t}' for t in reads)} (metrics.yaml authority.drafts.reads) — "
            f"get_stock_cover view='draft' for a reorder, get_purchase_plan with cover_days "
            f"for a supplier order.")
    for k, v in (got.get("requires") or {}).items():
        if arguments.get(k) != v:
            raise AuthorityRefused(f"{tool} is a draft only with {k}={v!r}.")
    need = got.get("requires_argument")
    if need and arguments.get(need) in (None, ""):
        raise AuthorityRefused(
            f"{tool} suggests no quantity without {need}, so there is nothing to order yet. "
            f"Ask how many days it should cover and read it again with {need}.")
    return got


def order_lines(rows: Iterable[Mapping[str, Any]], dspec: Mapping[str, Any]) -> list[dict]:
    """The rows that BUY something, as {product_id, sku, product, quantity, reason}."""
    qf, pf = dspec["quantity"], dspec["product"]
    where = dspec.get("order_lines_where") or {}
    positive = dspec.get("order_lines_where_positive")
    out = []
    for r in rows:
        if any(r.get(k) != v for k, v in where.items()):
            continue
        q = r.get(qf)
        if positive and (q is None or Decimal(str(q)) <= 0):
            continue
        if q is None or r.get(pf) is None:
            continue
        qd = Decimal(str(q))
        if qd <= 0:
            continue
        out.append({
            "product_id": str(r[pf]),
            "sku": r.get("sku"),
            "product": r.get("product"),
            "quantity": int(qd) if qd == qd.to_integral_value() else float(qd),
            "reason": r.get("reason"),
            "suppliers": r.get("suppliers"),
        })
    return out


def moves_in(rows: Iterable[Mapping[str, Any]]) -> int:
    return sum(1 for r in rows if r.get("kind") == "move")


def value_lines(lines: list[dict], costs: Mapping[str, Any]) -> tuple[list[dict], Decimal, int]:
    """
    Each line with its unit cost and value, the total, and how many had no cost.

    A cost of NULL or zero is NO COST ON FILE — 8,659 of 11,907 purchase lines
    carry a zero cost that means "uncosted" (metrics.yaml storehub), and a zero
    would value an order at nothing and slip it under any line.
    """
    total = Decimal("0")
    unpriced = 0
    priced: list[dict] = []
    for ln in lines:
        raw = costs.get(ln["product_id"])
        cost = Decimal(str(raw)) if raw is not None else None
        if cost is None or cost <= 0:
            unpriced += 1
            priced.append({**ln, "unit_cost": None, "line_value": None})
            continue
        v = (Decimal(str(ln["quantity"])) * cost).quantize(Decimal("0.01"), ROUND_HALF_UP)
        total += v
        priced.append({**ln, "unit_cost": float(cost), "line_value": float(v)})
    return priced, total, unpriced


def route(value: Decimal, unpriced: int, lines: int, version: Optional[Mapping[str, Any]],
          defs: Optional[Mapping] = None) -> tuple[str, str]:
    """
    ('list' | 'decision', the sentence saying why), from the line in force.

    Conservative on every unknown: no line, or a value missing a line's cost,
    is a decision — an unknown value could be over the line.
    """
    a = spec(defs)
    what = f"{lines} order line{'s' if lines != 1 else ''} worth {peso(value, defs)}"
    if not version:
        return "decision", f"{what}. No line is set, so every draft is a decision."
    v = int(version.get("version") or 0)
    mode = version.get("mode")
    if unpriced and mode != "never":
        return ("decision",
                f"{what} counted, but {unpriced} line{'s have' if unpriced != 1 else ' has'} "
                f"no cost on file, so what it is worth is not known and it could be over "
                f"the line (version {v}).")
    if mode == "never":
        return "list", (f"{what}. No draft interrupts under version {v} of the line; it "
                        f"waits in the list for a yes.")
    if mode == "every_draft":
        return "decision", f"{what}. Every draft is a decision under version {v} of the line."
    line = Decimal(str(version.get("line_php")))
    if str((a.get("line") or {}).get("interrupts_when")) != "above":
        raise RuntimeError("metrics.yaml authority.line.interrupts_when must be `above`.")
    if value > line:
        return "decision", f"{what} — over the {peso(line, defs)} line (version {v})."
    return "list", f"{what} — at or under the {peso(line, defs)} line (version {v})."


def title_for(tool: str, arguments: Mapping[str, Any]) -> str:
    if tool == "get_stock_cover":
        where = arguments.get("store") or "every shop"
        return f"Reorder — {where}"
    if tool == "get_purchase_plan":
        who = arguments.get("supplier") or "every supplier"
        return f"Order from {who} — {arguments.get('cover_days')} days' cover"
    return tool


# ---------------------------------------------------------------------------
# Rows — what the model and the screen see
# ---------------------------------------------------------------------------

def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def person_row(p: BobPerson, defs: Optional[Mapping] = None) -> dict:
    a = spec(defs)
    return {
        "person": p.person_key, "name": p.display_name, "role": p.role,
        "says": ((a.get("people") or {}).get(p.person_key) or {}).get("says"),
        "businesses": list(p.businesses or []),
        "linked": p.username is not None,
        "username": p.username,
    }


def version_row(v: BobAuthorityVersion, names: Mapping[str, str],
                defs: Optional[Mapping] = None) -> dict:
    row = {"rule": v.rule, "version": v.version, "mode": v.mode,
           "line_php": float(v.line_php) if v.line_php is not None else None,
           "said": v.said, "set_by": names.get(v.set_by_person, v.set_by_person),
           "set_at": _iso(v.set_at)}
    row["means"] = describe_line(row, defs)
    return row


def request_row(r: BobRequest, names: Mapping[str, str], *, with_lines: bool = True,
                defs: Optional[Mapping] = None) -> dict:
    row = {
        "id": str(r.id), "title": r.title, "status": r.status, "routed": r.routed,
        "routed_because": r.routed_because,
        "value_php": float(r.value_php), "value": peso(r.value_php, defs),
        "order_lines": len(r.lines or []), "unpriced_lines": r.unpriced_lines,
        "moves": r.moves,
        "line_php": float(r.line_php) if r.line_php is not None else None,
        "requested_by": names.get(r.requested_by_person or "", r.requested_by),
        "note": r.note,
        "created_at": _iso(r.created_at),
        "snapshot_timestamp": _iso(r.snapshot_timestamp),
        "decided_by": (names.get(r.decided_by_person or "", r.decided_by)
                       if r.decided_by else None),
        "decided_at": _iso(r.decided_at), "decision_note": r.decision_note,
        "replaces": str(r.replaces) if r.replaces else None,
        "source_call": r.source_call,
    }
    if with_lines:
        row["lines"] = list(r.lines or [])
    return row


# ---------------------------------------------------------------------------
# Reads and writes on the application's session
# ---------------------------------------------------------------------------

# Vetted and parameterised (rule 1). products.cost is the catalogue's cost,
# which matched purchase-order unit costs on 19 of 20 SKUs (metrics.yaml
# storehub).
COST_SQL = text("SELECT id, cost FROM products WHERE id = ANY(:ids)")


async def people(db: AsyncSession) -> list[BobPerson]:
    return list((await db.execute(select(BobPerson).order_by(BobPerson.person_key))).scalars())


async def person_for(db: AsyncSession, username: str) -> Optional[BobPerson]:
    return (await db.execute(
        select(BobPerson).where(BobPerson.username == (username or "").lower())
    )).scalar_one_or_none()


def _names(ps: Iterable[BobPerson]) -> dict[str, str]:
    return {p.person_key: p.display_name for p in ps}


async def current_version(db: AsyncSession, rule: Optional[str] = None) -> Optional[BobAuthorityVersion]:
    rule = rule or str(spec().get("line", {}).get("rule"))
    return (await db.execute(
        select(BobAuthorityVersion).where(BobAuthorityVersion.rule == rule)
        .order_by(BobAuthorityVersion.version.desc()).limit(1)
    )).scalar_one_or_none()


async def history(db: AsyncSession, rule: Optional[str] = None) -> list[BobAuthorityVersion]:
    rule = rule or str(spec().get("line", {}).get("rule"))
    return list((await db.execute(
        select(BobAuthorityVersion).where(BobAuthorityVersion.rule == rule)
        .order_by(BobAuthorityVersion.version.desc())
    )).scalars())


async def set_line(db: AsyncSession, *, username: str, mode: Optional[str], line: Any,
                   said: str, conversation_id: Optional[str] = None) -> BobAuthorityVersion:
    """A new version of the line. Only an approver; never an update."""
    defs = _defs()
    me = await person_for(db, username)
    role = role_of({"role": me.role} if me else None, defs)
    if not may(role, "set_line", defs):
        everyone = await people(db)
        raise AuthorityRefused(
            f"Only {approvers_named([{'display_name': p.display_name, 'role': p.role} for p in everyone], defs)} "
            f"can change what needs approval — this account is "
            f"{'linked to ' + me.display_name + ' (' + role + ')' if me else 'not linked to anyone Bob works with'}. "
            f"Nothing was changed; say so, and do not describe it as set.")
    words = " ".join((said or "").split())
    if not words:
        raise AuthorityRefused("Pass their words as they said them in `said`.")
    mode, amount = check_line(mode, line, defs)
    rule = str((spec(defs).get("line") or {}).get("rule"))
    newest = (await db.execute(
        select(func.max(BobAuthorityVersion.version)).where(BobAuthorityVersion.rule == rule)
    )).scalar()
    v = BobAuthorityVersion(
        id=uuid.uuid4(), rule=rule, version=int(newest or 0) + 1, mode=mode, line_php=amount,
        said=words[:500], set_by=username, set_by_person=me.person_key,
        set_at=datetime.now(timezone.utc), conversation_id=conversation_id)
    db.add(v)
    await db.flush()
    return v


async def run_draft(tool: str, arguments: Mapping[str, Any]) -> dict:
    """Re-run the draft read exactly as it ran, through the read tools."""
    from agent import loop as bob_loop
    from app.services.pin_runner import PinValidationError, validate_call

    try:
        validate_call({"tool": tool, "arguments": dict(arguments)})
    except PinValidationError as exc:
        raise AuthorityRefused(str(exc)) from exc
    fn = bob_loop.TOOL_FUNCTIONS[tool]
    try:
        result = await asyncio.to_thread(fn, **dict(arguments))
    except (ValueError, KeyError, RuntimeError) as exc:
        raise AuthorityRefused(f"The draft could not be read again: {exc}") from exc
    return bob_loop._json_safe(result)


async def costs_for(db: AsyncSession, product_ids: list[str]) -> dict[str, Any]:
    if not product_ids:
        return {}
    got = await db.execute(COST_SQL, {"ids": product_ids})
    return {str(pid): cost for pid, cost in got.all()}


def build_request(*, tool: str, arguments: Mapping[str, Any], result: Mapping[str, Any],
                  costs: Mapping[str, Any], version: Optional[Mapping[str, Any]],
                  version_id: Optional[uuid.UUID], requested_by: str,
                  person: Optional[str], note: Optional[str],
                  conversation_id: Optional[str], defs: Optional[Mapping] = None) -> BobRequest:
    """The request row from a read's result — pure but for the id and the clock."""
    a = spec(defs)
    dspec = draft_spec(tool, arguments, defs)
    rows = list(result.get("rows") or [])
    lines = order_lines(rows, dspec)
    cap = int((a.get("drafts") or {}).get("max_lines") or 200)
    if len(lines) > cap:
        raise AuthorityRefused(
            f"The draft has {len(lines)} order lines and one request holds at most {cap} "
            f"(metrics.yaml authority.drafts.max_lines). Narrow it — one shop or one supplier.")
    priced, total, unpriced = value_lines(lines, costs)
    moves = moves_in(rows)
    if not priced and not moves:
        raise AuthorityRefused(
            "That draft has nothing in it to order or move — there is nothing to approve. "
            "Say so plainly.")
    routed, because = route(total, unpriced, len(priced), version, defs)
    if not priced:
        routed, because = "list", (f"{moves} move{'s' if moves != 1 else ''} and nothing to "
                                   f"buy, so it is worth nothing against the line; it waits "
                                   f"in the list for a yes.")
    words = " ".join((note or "").split()) or None
    nmax = int((a.get("drafts") or {}).get("note_max_length") or 300)
    snap = (result.get("meta") or {}).get("snapshot_timestamp")
    snap_dt = None
    if isinstance(snap, str):
        try:
            snap_dt = datetime.fromisoformat(snap)
        except ValueError:
            snap_dt = None
    elif isinstance(snap, datetime):
        snap_dt = snap
    return BobRequest(
        id=uuid.uuid4(), kind=str((a.get("drafts") or {}).get("kind")),
        title=title_for(tool, arguments),
        source_call={"tool": tool, "arguments": dict(arguments)},
        lines=priced, moves=moves, value_php=total, unpriced_lines=unpriced,
        snapshot_timestamp=snap_dt, routed=routed, routed_because=because,
        authority_version_id=version_id,
        line_php=(Decimal(str(version["line_php"])) if version and version.get("line_php") is not None
                  else None),
        requested_by=username_of(requested_by), requested_by_person=person,
        note=words[:nmax] if words else None, status="waiting",
        conversation_id=conversation_id, created_at=datetime.now(timezone.utc),
    )


def username_of(u: str) -> str:
    return (u or "").strip() or "unknown"


async def submit(db: AsyncSession, *, username: str, tool: str, arguments: Mapping[str, Any],
                 note: Optional[str] = None, conversation_id: Optional[str] = None) -> BobRequest:
    """Put a draft through the line. Anybody signed in may submit."""
    defs = _defs()
    draft_spec(tool, arguments, defs)            # refuse before the read
    result = await run_draft(tool, arguments)
    dspec = draft_spec(tool, arguments, defs)
    pids = sorted({ln["product_id"] for ln in order_lines(result.get("rows") or [], dspec)})
    costs = await costs_for(db, pids)
    v = await current_version(db)
    me = await person_for(db, username)
    req = build_request(
        tool=tool, arguments=arguments, result=result, costs=costs,
        version=({"version": v.version, "mode": v.mode, "line_php": v.line_php} if v else None),
        version_id=v.id if v else None, requested_by=username,
        person=me.person_key if me else None, note=note, conversation_id=conversation_id,
        defs=defs)
    db.add(req)
    await db.flush()
    return req


async def viewer(db: AsyncSession, username: str, app_role: Optional[str] = None) -> dict:
    defs = _defs()
    me = await person_for(db, username)
    role = role_of({"role": me.role} if me else None, defs)
    return {"username": username, "person": me.person_key if me else None,
            "name": me.display_name if me else None, "role": role,
            "may_approve": may(role, "approve", defs),
            "may_set_line": may(role, "set_line", defs),
            "may_link_people": app_role == "admin",
            "sees_all": may(role, "approve", defs) or app_role == "admin"}


async def queue(db: AsyncSession, *, username: str, app_role: Optional[str] = None,
                status: str = "waiting", limit: int = 50) -> tuple[list[BobRequest], dict]:
    """The requests this person may see: everything for an approver or an admin."""
    who = await viewer(db, username, app_role)
    q = select(BobRequest)
    if status != "all":
        q = q.where(BobRequest.status == status)
    if not who["sees_all"]:
        q = q.where(BobRequest.requested_by == username)
    q = q.order_by(BobRequest.created_at.desc()).limit(max(1, min(int(limit), 200)))
    return list((await db.execute(q)).scalars()), who


async def decide(db: AsyncSession, *, username: str, request_id: str, action: str,
                 note: Optional[str] = None,
                 quantities: Optional[Mapping[str, Any]] = None) -> BobRequest:
    """Approve, reject or change one waiting request. Only an approver."""
    defs = _defs()
    a = spec(defs)
    acts = a.get("actions") or {}
    if action not in acts or acts[action].get("model_turn"):
        raise AuthorityRefused(
            f"{action!r} is not a decision. It is one of: "
            f"{', '.join(k for k, v in acts.items() if not v.get('model_turn'))}.")
    me = await person_for(db, username)
    role = role_of({"role": me.role} if me else None, defs)
    if not may(role, action, defs):
        everyone = await people(db)
        raise AuthorityRefused(
            f"Only {approvers_named([{'display_name': p.display_name, 'role': p.role} for p in everyone], defs)} "
            f"can {action} a request.")
    try:
        rid = uuid.UUID(str(request_id))
    except ValueError:
        raise AuthorityRefused("No request with that id.") from None
    req = (await db.execute(
        select(BobRequest).where(BobRequest.id == rid).with_for_update()
    )).scalar_one_or_none()
    if req is None:
        raise AuthorityRefused("No request with that id.")
    if req.status != "waiting":
        raise AuthorityRefused(f"That request was already {req.status}.")
    now = datetime.now(timezone.utc)
    words = " ".join((note or "").split()) or None
    if action in ("approve", "reject"):
        req.status = "approved" if action == "approve" else "rejected"
        req.decided_by, req.decided_by_person, req.decided_at = username, me.person_key, now
        req.decision_note = words
        await db.flush()
        return req

    # CHANGE: a new row with the approver's quantities, valued again by code,
    # approved by the change; the old row says it was changed.
    if not isinstance(quantities, Mapping) or not quantities:
        raise AuthorityRefused("A change names the new quantity for at least one line.")
    known = {ln["product_id"]: ln for ln in (req.lines or [])}
    new_lines = []
    for pid, ln in known.items():
        q = quantities.get(pid, ln["quantity"])
        if isinstance(q, bool) or not isinstance(q, (int, float)) or q < 0 or q != int(q):
            raise AuthorityRefused(f"The quantity for {ln.get('product') or pid} must be a whole "
                                   f"number, zero or more.")
        if int(q) > 0:
            new_lines.append({k: v for k, v in ln.items() if k not in ("unit_cost", "line_value")}
                             | {"quantity": int(q)})
    unknown = set(quantities) - set(known)
    if unknown:
        raise AuthorityRefused("A change adjusts the lines the draft has; it cannot add one.")
    costs = await costs_for(db, [ln["product_id"] for ln in new_lines])
    priced, total, unpriced = value_lines(new_lines, costs)
    changed = BobRequest(
        id=uuid.uuid4(), kind=req.kind, title=req.title, source_call=req.source_call,
        lines=priced, moves=req.moves, value_php=total, unpriced_lines=unpriced,
        snapshot_timestamp=req.snapshot_timestamp, routed=req.routed,
        routed_because=(f"Changed by {me.display_name} from {peso(req.value_php, defs)} to "
                        f"{peso(total, defs)} and approved in the same act."),
        authority_version_id=req.authority_version_id, line_php=req.line_php,
        requested_by=req.requested_by, requested_by_person=req.requested_by_person,
        note=req.note, status="approved", decided_by=username,
        decided_by_person=me.person_key, decided_at=now, decision_note=words,
        replaces=req.id, conversation_id=req.conversation_id, created_at=now)
    req.status = "changed"
    req.decided_by, req.decided_by_person, req.decided_at = username, me.person_key, now
    req.decision_note = words
    db.add(changed)
    await db.flush()
    return changed


async def link_person(db: AsyncSession, *, admin_username: str, person_key: str,
                      username: Optional[str]) -> BobPerson:
    """Link a person to a login (or unlink). The route checks the admin role."""
    from app.models.app_user import AppUser

    p = (await db.execute(select(BobPerson).where(BobPerson.person_key == person_key))
         ).scalar_one_or_none()
    if p is None:
        raise AuthorityRefused(f"Nobody called {person_key!r} is in the people Bob works with.")
    if username:
        u = username.strip().lower()
        exists = (await db.execute(select(AppUser.id).where(func.lower(AppUser.username) == u))
                  ).scalar_one_or_none()
        if exists is None:
            raise AuthorityRefused(f"No account has the username {u!r}.")
        taken = await person_for(db, u)
        if taken is not None and taken.person_key != person_key:
            raise AuthorityRefused(f"{u!r} is already linked to {taken.display_name}.")
        p.username = u
    else:
        p.username = None
    p.linked_by, p.linked_at = admin_username, datetime.now(timezone.utc)
    await db.flush()
    return p


async def overview(db: AsyncSession, *, username: str, app_role: Optional[str] = None) -> dict:
    """{rows, meta} for view_requests: what is waiting, the line and who decides."""
    defs = _defs()
    reqs, who = await queue(db, username=username, app_role=app_role)
    ps = await people(db)
    names = _names(ps)
    v = await current_version(db)
    hist = await history(db)
    rows = [request_row(r, names, with_lines=False, defs=defs) for r in reqs]
    now = datetime.now(timezone.utc)
    return {
        "rows": rows,
        "meta": {
            "source_table": "george.requests",
            "filters_applied": [
                "status = waiting",
                "every request" if who["sees_all"] else "requested by the signed-in user",
            ],
            "snapshot_timestamp": now.isoformat(),
            "decisions_waiting": sum(1 for r in rows if r["routed"] == "decision"),
            "in_the_list": sum(1 for r in rows if r["routed"] == "list"),
            "line": version_row(v, names, defs) if v else None,
            "line_means": describe_line(version_row(v, names, defs) if v else None, defs),
            "line_versions": len(hist),
            "people": [person_row(p, defs) for p in ps],
            "viewer": who,
            "sends_anything": False,
            "keyed_into": spec(defs).get("keyed_into"),
        },
    }
