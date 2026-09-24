"""
/bob/authority — what reaches the approver, who that is, and the queue (W2.2).

The HTTP shape of app/services/authority.py, and the writer Bob is handed.
Both call the same service functions: a draft Bob submits and a draft a
person submits here are the same row by the same code, and the line Bob sets
when the approver tells him is the same version the control below would make.

    GET    /bob/authority                  the line, its history, the people, what I may do
                                           — and, for an administrator only, the logins
                                             a person may be linked to (W4.5)
    PUT    /bob/authority/line             a new version of the line (approver only)
    PUT    /bob/authority/people/{key}     link a person to a login (administrator only)
    GET    /bob/authority/requests         the queue (?status=waiting|approved|rejected|changed|all)
    POST   /bob/authority/requests         submit a draft read (anyone signed in)
    POST   /bob/authority/requests/{id}/decide   approve | reject | change (approver only)

A refusal is a 4xx whose detail is the service's sentence, rendered verbatim
by the client — "only Joy can approve" and "already approved" have different
fixes. NOTHING HERE SENDS ANYTHING: an approved draft is keyed into StoreHub
by a person (metrics.yaml authority.keyed_into).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import AsyncSessionLocal
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services import authority as svc

router = APIRouter(tags=["bob-authority"])

_bob_user = require_page("bob")


class LineIn(BaseModel):
    mode: Optional[str] = None
    line_php: Optional[int] = None
    said: str = Field(..., min_length=1, max_length=500)


class LinkIn(BaseModel):
    username: Optional[str] = Field(None, max_length=64)


class SubmitIn(BaseModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = Field(None, max_length=300)


class DecideIn(BaseModel):
    action: str
    note: Optional[str] = Field(None, max_length=300)
    # product_id -> the new quantity, for `change` only.
    quantities: Optional[dict[str, int]] = None


def _refused(exc: Exception) -> HTTPException:
    text = str(exc)
    if text.startswith("No request with that id") or text.startswith("Nobody called"):
        return HTTPException(status.HTTP_404_NOT_FOUND, text)
    if text.startswith("Only "):
        return HTTPException(status.HTTP_403_FORBIDDEN, text)
    return HTTPException(status.HTTP_400_BAD_REQUEST, text)


async def _accounts(session) -> list[dict]:
    """
    The logins an administrator may link a person to (W4.5).

    A privileged read the WEB PROCESS does, bound to the signed-in
    administrator (CLAUDE.md rule 4) — Bob holds no credential and this never
    reaches his schema. The passcode hash is never in the row; whether the
    account can sign in at all is.
    """
    rows = (await session.execute(
        select(AppUser).order_by(AppUser.active.desc(), AppUser.username)
    )).scalars()
    return [{"username": u.username, "display_name": u.display_name, "role": u.role,
             "active": bool(u.active), "can_sign_in": bool(u.passcode_hash)}
            for u in rows]


async def _state(session, user: AppUser) -> dict:
    ps = await svc.people(session)
    names = {p.person_key: p.display_name for p in ps}
    v = await svc.current_version(session)
    hist = await svc.history(session)
    line = svc.version_row(v, names) if v else None
    people = [svc.person_row(p) for p in ps]
    who = await svc.viewer(session, user.username, user.role)
    return {
        "line": line,
        "line_means": svc.describe_line(line),
        "history": [svc.version_row(h, names) for h in hist],
        "people": people,
        # Whether anybody can actually approve — code's sentence, not the
        # screen's (W4.5), because an approver linked to no login is a queue
        # nobody can ever empty.
        "approval": svc.describe_approval(people),
        "viewer": who,
        # The logins, for the administrator who may link one to a person.
        # Nobody else is shown other people's accounts.
        "accounts": await _accounts(session) if who["may_link_people"] else None,
        # When this was read, so no figure on the screen is undated (UI rule 6).
        "read_at": datetime.now(timezone.utc).isoformat(),
        "assumption": " ".join(str(svc.spec().get("assumption") or "").split()),
        "keyed_into": svc.spec().get("keyed_into"),
    }


@router.get("")
async def get_authority(user: AppUser = Depends(_bob_user)) -> dict:
    async with AsyncSessionLocal() as session:
        return await _state(session, user)


@router.put("/line")
async def put_line(body: LineIn, user: AppUser = Depends(_bob_user)) -> dict:
    async with AsyncSessionLocal() as session:
        try:
            await svc.set_line(session, username=user.username, mode=body.mode,
                               line=body.line_php, said=body.said)
            await session.commit()
        except svc.AuthorityRefused as exc:
            await session.rollback()
            raise _refused(exc) from exc
        return await _state(session, user)


@router.put("/people/{person_key}")
async def put_person(person_key: str, body: LinkIn, user: AppUser = Depends(_bob_user)) -> dict:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only an administrator links a person to a login.")
    async with AsyncSessionLocal() as session:
        try:
            await svc.link_person(session, admin_username=user.username,
                                  person_key=person_key, username=body.username)
            await session.commit()
        except svc.AuthorityRefused as exc:
            await session.rollback()
            raise _refused(exc) from exc
        return await _state(session, user)


@router.get("/requests")
async def list_requests(
    status_: str = Query("waiting", alias="status"),
    limit: int = Query(50, ge=1, le=200),
    user: AppUser = Depends(_bob_user),
) -> dict:
    allowed = [*svc.spec().get("statuses", []), "all"]
    if status_ not in allowed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"status is one of {allowed}")
    async with AsyncSessionLocal() as session:
        reqs, who = await svc.queue(session, username=user.username, app_role=user.role,
                                    status=status_, limit=limit)
        names = {p.person_key: p.display_name for p in await svc.people(session)}
        return {"requests": [svc.request_row(r, names) for r in reqs], "viewer": who}


@router.post("/requests", status_code=status.HTTP_201_CREATED)
async def submit_request(body: SubmitIn, user: AppUser = Depends(_bob_user)) -> dict:
    async with AsyncSessionLocal() as session:
        try:
            req = await svc.submit(session, username=user.username, tool=body.tool,
                                   arguments=body.arguments, note=body.note)
            await session.commit()
        except svc.AuthorityRefused as exc:
            await session.rollback()
            raise _refused(exc) from exc
        names = {p.person_key: p.display_name for p in await svc.people(session)}
        return svc.request_row(req, names)


@router.post("/requests/{request_id}/decide")
async def decide_request(request_id: str, body: DecideIn,
                         user: AppUser = Depends(_bob_user)) -> dict:
    async with AsyncSessionLocal() as session:
        try:
            req = await svc.decide(session, username=user.username, request_id=request_id,
                                   action=body.action, note=body.note,
                                   quantities=body.quantities)
            await session.commit()
        except svc.AuthorityRefused as exc:
            await session.rollback()
            raise _refused(exc) from exc
        names = {p.person_key: p.display_name for p in await svc.people(session)}
        return svc.request_row(req, names)


# ---------------------------------------------------------------------------
# The writer Bob is handed (CLAUDE.md rule 4)
# ---------------------------------------------------------------------------

def authority_writer(username: str, app_role: Optional[str] = None):
    """
    Bob's route to the line and the queue, closed over the SIGNED-IN user.

    Who submits and who is setting the line come from the verified token, so
    the tools have no argument for either. Not injected into a scheduled ask
    (app/services/standing_runner.py): nothing unattended submits or decides.
    """
    from agent.write_tools import AuthorityRefused

    def _fail(exc: SQLAlchemyError) -> AuthorityRefused:
        return AuthorityRefused(
            f"That could not be saved: {type(exc).__name__}. Nothing was changed — tell "
            f"the user, and do not describe it as done.")

    class _Writer:
        async def submit(self, tool, arguments, note, conversation_id):
            async with AsyncSessionLocal() as session:
                try:
                    req = await svc.submit(session, username=username, tool=tool,
                                           arguments=arguments, note=note,
                                           conversation_id=conversation_id)
                    names = {p.person_key: p.display_name for p in await svc.people(session)}
                    row = svc.request_row(req, names, with_lines=False)
                    await session.commit()
                except svc.AuthorityRefused as exc:
                    await session.rollback()
                    raise AuthorityRefused(str(exc)) from exc
                except SQLAlchemyError as exc:
                    await session.rollback()
                    raise _fail(exc) from exc
            routes = svc.spec().get("routes") or {}
            return {"rows": [row], "meta": {
                "source_table": "george.requests",
                "filters_applied": [f"submitted by the signed-in user",
                                    f"value = {svc.spec()['drafts']['value']['formula']}"],
                "snapshot_timestamp": row["snapshot_timestamp"],
                "wrote": "submitted",
                "routed": row["routed"],
                "routed_means": (routes.get(row["routed"]) or {}).get("says"),
                "sends_anything": False,
                "keyed_into": svc.spec().get("keyed_into"),
                "note": ("Nothing was sent. Say in one line where it went and why "
                         "(routed_because); a decision waits for Approve · Change · Look "
                         "into it, a list item waits quietly for a yes."),
            }}

        async def set_line(self, mode, line, said, conversation_id):
            async with AsyncSessionLocal() as session:
                try:
                    v = await svc.set_line(session, username=username, mode=mode, line=line,
                                           said=said, conversation_id=conversation_id)
                    names = {p.person_key: p.display_name for p in await svc.people(session)}
                    row = svc.version_row(v, names)
                    await session.commit()
                except svc.AuthorityRefused as exc:
                    await session.rollback()
                    raise AuthorityRefused(str(exc)) from exc
                except SQLAlchemyError as exc:
                    await session.rollback()
                    raise _fail(exc) from exc
            return {"rows": [row], "meta": {
                "source_table": "george.authority_versions",
                "filters_applied": [f"rule = {row['rule']}", "the newest version"],
                "snapshot_timestamp": row["set_at"],
                "wrote": f"version {row['version']}",
                "sends_anything": False,
                "note": ("A new version; the old ones are kept. It decides what reaches the "
                         "approver, never what is sent — confirm that in one line."),
            }}

        async def overview(self):
            async with AsyncSessionLocal() as session:
                return await svc.overview(session, username=username, app_role=app_role)

    return _Writer()
