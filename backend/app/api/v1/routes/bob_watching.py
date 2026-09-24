"""
/bob/watching — the standing questions and watches, and the switch (W4.4).

    GET    /bob/watching                              everything, both families
    POST   /bob/watching/questions/{id}/switch        {on}
    POST   /bob/watching/questions/{id}/reschedule    {hour, minute, kind, days_of_week}
    POST   /bob/watching/questions/{id}/rewrite       {question}
    DELETE /bob/watching/questions/{id}
    POST   /bob/watching/watches/{id}/switch          {on}
    POST   /bob/watching/watches/{id}/reschedule      {hour, minute, kind, days_of_week}
    DELETE /bob/watching/watches/{id}

EVERY ONE OF THESE CALLS THE FUNCTION BOB'S WRITER CALLS. `standing_questions`
and `watches` are the single write path (rule 4): the agent holds no
credential, the web process binds `owner` from the authenticated session, and
no function below takes an owner from anything a client said. Switching the
morning on from this page and telling Bob to switch it on are the same row
changed by the same code.

RULE 7 IS THE POINT, NOT AN OBSTACLE THE PAGE ROUTES AROUND. Nothing here
creates anything — creating is Bob's, and everything he creates is born off.
A watch's switch is refused until it has a backtest of a closed window measured
under the current definitions, and the refusal is the service's own sentence,
rendered verbatim. There is no force, no override and no query parameter that
skips it.

A REFUSAL IS A 4xx WHOSE DETAIL IS A SENTENCE A PERSON CAN ACT ON, exactly as
/bob/authority does it — "this watch has not been backtested" and "no standing
question of yours has that id" have different fixes.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.services import standing_questions, watches, watching

router = APIRouter(tags=["bob-watching"])

_bob_user = require_page("bob")


class SwitchIn(BaseModel):
    on: bool


class SlotIn(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    minute: Optional[int] = Field(0, ge=0, le=59)
    kind: Optional[str] = None
    days_of_week: Optional[list[int]] = None


class RewriteIn(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


def _refused(exc: Exception) -> HTTPException:
    """The service's sentence, with the status that matches what it means."""
    said = str(exc)
    if "has that id" in said or said.startswith("There are no"):
        return HTTPException(status.HTTP_404_NOT_FOUND, said)
    return HTTPException(status.HTTP_400_BAD_REQUEST, said)


@router.get("")
async def get_watching(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    """Everything this person has asked Bob to keep asking or keep checking."""
    return await watching.page_for(db, user.username)


# ---------------------------------------------------------------------------
# Standing questions
# ---------------------------------------------------------------------------

@router.post("/questions/{question_id}/switch")
async def switch_question(
    question_id: str, body: SwitchIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    """Start or stop asking it — the person's act, never Bob's (rule 7)."""
    try:
        row = await standing_questions.switch(db, owner=user.username,
                                              which=question_id, on=body.on)
        await db.commit()
    except standing_questions.StandingRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return await watching.question_row(db, row)


@router.post("/questions/{question_id}/reschedule")
async def reschedule_question(
    question_id: str, body: SlotIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    try:
        row = await standing_questions.reschedule(
            db, owner=user.username, which=question_id, hour=body.hour,
            minute=body.minute, kind=body.kind, days_of_week=body.days_of_week)
        await db.commit()
    except standing_questions.StandingRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return await watching.question_row(db, row)


@router.post("/questions/{question_id}/rewrite")
async def rewrite_question(
    question_id: str, body: RewriteIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    """Change what is asked. The slot and the instructions stay."""
    try:
        row = await standing_questions.rewrite(db, owner=user.username,
                                               which=question_id,
                                               question=body.question)
        await db.commit()
    except standing_questions.StandingRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return await watching.question_row(db, row)


# response_class=Response is load-bearing, as in bob_pins: FastAPI asserts
# that a 204 carries no body, and a `-> None` return annotation alone still
# declares a JSON one.
@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def remove_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> Response:
    """Forget the question. The answers it produced are posts and stay."""
    try:
        await standing_questions.remove(db, owner=user.username, which=question_id)
        await db.commit()
    except standing_questions.StandingRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Watches
# ---------------------------------------------------------------------------

@router.post("/watches/{watch_id}/switch")
async def switch_watch(
    watch_id: str, body: SwitchIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    """
    Start or stop checking.

    Switching ON goes through watches.switch, which refuses without a recorded
    backtest measured under the current definitions. The page has already said
    so beside the switch (`switch_on_refusal`); this is the gate itself.
    """
    try:
        row = await watches.switch(db, owner=user.username, which=watch_id, on=body.on)
        await db.commit()
    except watches.WatchRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return await watching.watch_row(db, row)


@router.post("/watches/{watch_id}/reschedule")
async def reschedule_watch(
    watch_id: str, body: SlotIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> dict:
    try:
        row = await watches.reschedule(
            db, owner=user.username, which=watch_id, hour=body.hour,
            minute=body.minute, kind=body.kind, days_of_week=body.days_of_week)
        await db.commit()
    except watches.WatchRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return await watching.watch_row(db, row)


@router.delete("/watches/{watch_id}", status_code=status.HTTP_204_NO_CONTENT,
               response_class=Response)
async def remove_watch(
    watch_id: str,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_bob_user),
) -> Response:
    """Forget the watch. Its posts and its checks are a record and stay."""
    try:
        await watches.remove(db, owner=user.username, which=watch_id)
        await db.commit()
    except watches.WatchRefused as exc:
        await db.rollback()
        raise _refused(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
