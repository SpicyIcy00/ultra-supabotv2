"""
Saved workflows — logic agreed in conversation, kept as a versioned rule.

"A pin re-runs; a save is the rule it re-runs" (CLAUDE.md). A pin is one
person's tile; a workflow is the company's rule, so these rows are ORG-LEVEL:
anyone with George access can list and run them, the creator or an admin can
edit, and an admin — and only an admin — can promote a version past the
backtest gate. Nothing here is scoped by created_by, which is the deliberate
difference from /george/pins.

EVERY RULE LIVES IN app.services.workflow_writer, NOT HERE. George saves and
runs workflows through the same functions this router calls, and two
implementations would drift. This module's own job is the HTTP shape: which
refusal is a 403, which is a 409, and which is a 422.

WRITES RUN ON THE APPLICATION ROLE, not on either George role — george_ro is
read-only with no access to the george schema, and george_log has INSERT
without SELECT and could never list a workflow. Same split as pins.

THE APPROVAL QUEUE IS A REAL ENDPOINT, not a UI convention. GET
/workflows/approvals returns the versions waiting on a person, and UI rule 5's
one reserved colour belongs to exactly those rows and to nothing else on these
screens.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.george_workflow import (
    GeorgeWorkflow,
    GeorgeWorkflowRun,
    GeorgeWorkflowSchedule,
    GeorgeWorkflowVersion,
)
from app.services.workflow_runner import WorkflowValidationError
from app.services.workflow_writer import (
    NotAllowed,
    PromotionRefused,
    WorkflowNotFound,
    WorkflowNameTaken,
    WorkflowQuotaError,
    create_schedule,
    pending_promotion,
    promote as promote_version,
    resolve_version,
    run_workflow_version,
    save_workflow as save_workflow_row,
    set_enabled,
)

router = APIRouter(tags=["george-workflows"])

# Workflows are George's, so they live behind George's page — the same gate as
# /george/ask and /george/pins. The finer-grained verbs are checked in the
# service against metrics.yaml (workflows.permissions).
_workflow_user = require_page("george")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class StepIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    tool: str = Field(..., min_length=1, max_length=64)
    arguments: dict[str, Any] = Field(default_factory=dict)
    why: Optional[str] = Field(None, max_length=2000)


class ParameterIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    type: str = Field("string")
    default: Any = None
    description: Optional[str] = Field(None, max_length=500)


class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    steps: List[StepIn] = Field(..., min_length=1)
    parameters: List[ParameterIn] = Field(default_factory=list)
    intent: Optional[str] = Field(None, max_length=4000)
    change_note: Optional[str] = Field(None, max_length=2000)
    conversation_id: Optional[uuid.UUID] = None


class VersionOut(BaseModel):
    id: uuid.UUID
    version: int
    created_by: str
    created_at: datetime
    steps: List[dict]
    parameters: List[dict]
    intent: Optional[str]
    change_note: Optional[str]
    definitions_version: Optional[int]
    backtested_at: Optional[datetime]
    backtest_run_id: Optional[uuid.UUID]
    promoted_at: Optional[datetime]
    promoted_by: Optional[str]

    model_config = {"from_attributes": True}


class WorkflowOut(BaseModel):
    id: uuid.UUID
    name: str
    created_by: str
    created_at: datetime
    status: str
    current_version: Optional[VersionOut] = None

    model_config = {"from_attributes": True}


class ApprovalOut(BaseModel):
    """One row of the approval queue: a version that cannot yet run unattended."""

    workflow_id: uuid.UUID
    name: str
    version: int
    version_id: uuid.UUID
    created_by: str
    created_at: datetime
    backtested_at: Optional[datetime]
    # What is actually blocking it, in the words a person needs to act on.
    blocked_on: str


class RunRequest(BaseModel):
    bindings: dict[str, Any] = Field(default_factory=dict)
    # A past Manila date makes this a BACKTEST. It is recorded as one, delivered
    # nowhere, and is what an admin later promotes against.
    as_of: Optional[date] = None
    version: Optional[int] = Field(None, ge=1)


class ScheduleIn(BaseModel):
    kind: str = Field(..., pattern="^(daily|weekly|monthly)$")
    hour: int = Field(..., ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    days_of_week: List[int] = Field(default_factory=list)
    day_of_month: Optional[int] = Field(None, ge=1, le=31)
    bindings: dict[str, Any] = Field(default_factory=dict)
    telegram_chat_ids: List[str] = Field(default_factory=list, max_length=20)
    version: Optional[int] = Field(None, ge=1)
    enabled: bool = False


class ScheduleOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    version_id: uuid.UUID
    kind: str
    hour: int
    minute: int
    days_of_week: List[int]
    day_of_month: Optional[int]
    bindings: dict
    telegram_chat_ids: List[str]
    enabled: bool
    last_slot: Optional[datetime]
    last_run_at: Optional[datetime]
    last_status: Optional[str]
    last_error: Optional[str]

    model_config = {"from_attributes": True}


class EnabledIn(BaseModel):
    enabled: bool


class RunOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    version_id: uuid.UUID
    mode: str
    requested_by: str
    as_of: Optional[date]
    status: str
    started_at: datetime
    finished_at: Optional[datetime]
    notices: List[dict]

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _owned(db: AsyncSession, workflow_id: uuid.UUID) -> GeorgeWorkflow:
    """
    Fetch a workflow, or 404.

    No created_by filter, and that is the point: workflows are org-level. The
    per-verb checks happen in the service, so a caller who may see a rule but
    not edit it gets a 403 that says so rather than a 404 that pretends it does
    not exist.
    """
    workflow = (
        await db.execute(select(GeorgeWorkflow).where(GeorgeWorkflow.id == workflow_id))
    ).scalar_one_or_none()
    if workflow is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Workflow not found.")
    return workflow


def _refusals(exc: Exception) -> HTTPException:
    """One place that maps a typed refusal to a status code."""
    if isinstance(exc, NotAllowed):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, WorkflowNotFound):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, (WorkflowNameTaken, WorkflowQuotaError, PromotionRefused)):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                         detail=str(exc))


async def _with_current(db: AsyncSession, workflow: GeorgeWorkflow) -> WorkflowOut:
    version = (
        await db.execute(
            select(GeorgeWorkflowVersion).where(
                GeorgeWorkflowVersion.id == workflow.current_version_id
            )
        )
    ).scalar_one_or_none()
    out = WorkflowOut.model_validate(workflow)
    out.current_version = VersionOut.model_validate(version) if version else None
    return out


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=WorkflowOut, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    payload: WorkflowCreate,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> WorkflowOut:
    """
    Save logic as a versioned rule. An existing name appends a VERSION rather
    than replacing anything — nothing is ever overwritten.

    Every step is validated against the LIVE tool surface at its default
    bindings before anything is stored, so a rule that cannot run is refused
    while the person is still looking at it rather than at 06:00 on a Monday.
    """
    try:
        saved = await save_workflow_row(
            db,
            username=user.username,
            role=user.role,
            name=payload.name,
            steps=[s.model_dump() for s in payload.steps],
            parameters=[p.model_dump() for p in payload.parameters],
            intent=payload.intent,
            change_note=payload.change_note,
            conversation_id=payload.conversation_id,
        )
    except (WorkflowValidationError, WorkflowNameTaken, WorkflowQuotaError,
            NotAllowed) as exc:
        raise _refusals(exc) from exc

    return await _with_current(db, saved.workflow)


@router.get("", response_model=List[WorkflowOut])
async def list_workflows(
    include_archived: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> List[WorkflowOut]:
    """Every workflow, newest first. Not scoped to the caller — these are org-level."""
    stmt = select(GeorgeWorkflow)
    if not include_archived:
        stmt = stmt.where(GeorgeWorkflow.status != "archived")
    rows = (await db.execute(stmt.order_by(GeorgeWorkflow.created_at.desc()))).scalars().all()
    return [await _with_current(db, w) for w in rows]


# Declared BEFORE /{workflow_id}: "approvals" is not a UUID, and a path
# parameter would claim it first and answer 422.
@router.get("/approvals", response_model=List[ApprovalOut])
async def list_approvals(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> List[ApprovalOut]:
    """
    The approval queue — versions that cannot run unattended yet.

    A version with no backtest is IN this list, not absent from it: the thing
    waiting on a person is the same either way, and hiding it until somebody
    starts would mean the queue only ever shows work already begun.
    """
    out = []
    for workflow, version in await pending_promotion(db):
        blocked = (
            "Never backtested. Run it against a past window and look at what it "
            "would have produced."
            if version.backtest_run_id is None
            else "Backtested and waiting for an administrator to promote it."
        )
        out.append(ApprovalOut(
            workflow_id=workflow.id,
            name=workflow.name,
            version=version.version,
            version_id=version.id,
            created_by=version.created_by,
            created_at=version.created_at,
            backtested_at=version.backtested_at,
            blocked_on=blocked,
        ))
    return out


# Also before /{workflow_id}, and for the same reason: "stats" is not a UUID.
@router.get("/stats/counts")
async def counts(
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> dict:
    """How many workflows, how many are scheduled, how many wait on a person."""
    total = (
        await db.execute(
            select(func.count()).select_from(GeorgeWorkflow)
            .where(GeorgeWorkflow.status != "archived")
        )
    ).scalar_one()
    scheduled = (
        await db.execute(
            select(func.count()).select_from(GeorgeWorkflowSchedule)
            .where(GeorgeWorkflowSchedule.enabled.is_(True))
        )
    ).scalar_one()
    return {
        "workflows": total,
        "schedules_enabled": scheduled,
        "awaiting_promotion": len(await pending_promotion(db)),
    }


@router.get("/{workflow_id}", response_model=WorkflowOut)
async def get_workflow(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> WorkflowOut:
    return await _with_current(db, await _owned(db, workflow_id))


@router.get("/{workflow_id}/versions", response_model=List[VersionOut])
async def list_versions(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> List[VersionOut]:
    """Every version, newest first. Versions are immutable, so this is a history."""
    await _owned(db, workflow_id)
    rows = (
        await db.execute(
            select(GeorgeWorkflowVersion)
            .where(GeorgeWorkflowVersion.workflow_id == workflow_id)
            .order_by(GeorgeWorkflowVersion.version.desc())
        )
    ).scalars().all()
    return [VersionOut.model_validate(v) for v in rows]


@router.post("/{workflow_id}/run")
async def run_workflow(
    workflow_id: uuid.UUID,
    payload: RunRequest,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> dict:
    """
    Run a workflow now, or BACKTEST it against a past Manila date.

    Tools only — no model call. A refused or rotted step is a 200 with that
    status on the step, not an HTTP error: the run has to render those states,
    and an error code would turn a real answer ("this SKU is three products")
    into a failed request.

    Passing `as_of` records a backtest against the version, which is what an
    administrator promotes against. Read every step's `reproducible` field
    before believing a backtest: anything other than "full" is reporting the
    present.
    """
    workflow = await _owned(db, workflow_id)
    try:
        version = await resolve_version(db, workflow, payload.version)
        return await run_workflow_version(
            db,
            username=user.username,
            role=user.role,
            workflow=workflow,
            version=version,
            bindings=payload.bindings,
            as_of=payload.as_of.isoformat() if payload.as_of else None,
        )
    except (WorkflowValidationError, WorkflowNotFound, NotAllowed) as exc:
        raise _refusals(exc) from exc


@router.post("/{workflow_id}/promote", response_model=VersionOut)
async def promote(
    workflow_id: uuid.UUID,
    version: Optional[int] = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> VersionOut:
    """
    Let a version run unattended. Administrators only, and only after a backtest
    against a window that has closed.

    This is the approval queue's action. The gate is enforced in the service and
    again by a CHECK constraint, so a bug here cannot schedule unreviewed logic.
    """
    workflow = await _owned(db, workflow_id)
    try:
        target = await resolve_version(db, workflow, version)
        promoted = await promote_version(
            db, username=user.username, role=user.role,
            workflow=workflow, version=target,
        )
    except (PromotionRefused, NotAllowed, WorkflowNotFound) as exc:
        raise _refusals(exc) from exc
    return VersionOut.model_validate(promoted)


@router.post("/{workflow_id}/schedules", response_model=ScheduleOut,
             status_code=status.HTTP_201_CREATED)
async def add_schedule(
    workflow_id: uuid.UUID,
    payload: ScheduleIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> ScheduleOut:
    """
    Attach a slot to a PINNED version.

    Created switched off unless the version has already been promoted. A
    schedule whose version is not promoted exists, is visible, and fires
    nothing — which is what lets George accept "every Monday at 6" in
    conversation without that instruction bypassing the gate.
    """
    workflow = await _owned(db, workflow_id)
    try:
        version = await resolve_version(db, workflow, payload.version)
        schedule = await create_schedule(
            db,
            username=user.username,
            role=user.role,
            workflow=workflow,
            version=version,
            kind=payload.kind,
            hour=payload.hour,
            minute=payload.minute,
            days_of_week=payload.days_of_week,
            day_of_month=payload.day_of_month,
            bindings=payload.bindings,
            telegram_chat_ids=payload.telegram_chat_ids,
            enabled=payload.enabled,
        )
    except (WorkflowValidationError, WorkflowNotFound, NotAllowed,
            PromotionRefused) as exc:
        raise _refusals(exc) from exc
    return ScheduleOut.model_validate(schedule)


@router.get("/{workflow_id}/schedules", response_model=List[ScheduleOut])
async def list_schedules(
    workflow_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> List[ScheduleOut]:
    await _owned(db, workflow_id)
    rows = (
        await db.execute(
            select(GeorgeWorkflowSchedule)
            .where(GeorgeWorkflowSchedule.workflow_id == workflow_id)
            .order_by(GeorgeWorkflowSchedule.created_at.desc())
        )
    ).scalars().all()
    return [ScheduleOut.model_validate(s) for s in rows]


@router.patch("/{workflow_id}/schedules/{schedule_id}", response_model=ScheduleOut)
async def set_schedule_enabled(
    workflow_id: uuid.UUID,
    schedule_id: uuid.UUID,
    payload: EnabledIn,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> ScheduleOut:
    """
    Turn a schedule on or off.

    Turning one ON is the moment unattended execution begins, so the pinned
    version must be promoted. Turning one OFF is always allowed to anyone who
    may edit — stopping something is never the dangerous direction.
    """
    workflow = await _owned(db, workflow_id)
    schedule = (
        await db.execute(
            select(GeorgeWorkflowSchedule).where(
                GeorgeWorkflowSchedule.id == schedule_id,
                GeorgeWorkflowSchedule.workflow_id == workflow_id,
            )
        )
    ).scalar_one_or_none()
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Schedule not found.")

    version = (
        await db.execute(
            select(GeorgeWorkflowVersion).where(
                GeorgeWorkflowVersion.id == schedule.version_id
            )
        )
    ).scalar_one()

    try:
        updated = await set_enabled(
            db, username=user.username, role=user.role, workflow=workflow,
            version=version, schedule=schedule, enabled=payload.enabled,
        )
    except (PromotionRefused, NotAllowed) as exc:
        raise _refusals(exc) from exc
    return ScheduleOut.model_validate(updated)


@router.get("/{workflow_id}/runs", response_model=List[RunOut])
async def list_runs(
    workflow_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> List[RunOut]:
    """
    Run history, newest first, WITHOUT the step results.

    The full receipts of one run are large and are fetched one at a time; a
    history endpoint that returned them would make the list unusable to load
    the detail nobody asked for.
    """
    await _owned(db, workflow_id)
    rows = (
        await db.execute(
            select(GeorgeWorkflowRun)
            .where(GeorgeWorkflowRun.workflow_id == workflow_id)
            .order_by(GeorgeWorkflowRun.started_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return [RunOut.model_validate(r) for r in rows]


@router.get("/{workflow_id}/runs/{run_id}")
async def get_run(
    workflow_id: uuid.UUID,
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_workflow_user),
) -> dict:
    """
    One run in full: every step's status, its receipts and its notices.

    The stored rows are a capped SAMPLE and say so on the step; meta is whole.
    A run is a receipt, not a warehouse — re-run the version for the numbers.
    """
    await _owned(db, workflow_id)
    run = (
        await db.execute(
            select(GeorgeWorkflowRun).where(
                GeorgeWorkflowRun.id == run_id,
                GeorgeWorkflowRun.workflow_id == workflow_id,
            )
        )
    ).scalar_one_or_none()
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="Run not found.")
    return {
        "id": str(run.id),
        "workflow_id": str(run.workflow_id),
        "version_id": str(run.version_id),
        "schedule_id": str(run.schedule_id) if run.schedule_id else None,
        "mode": run.mode,
        "requested_by": run.requested_by,
        "as_of": run.as_of.isoformat() if run.as_of else None,
        "bindings": run.bindings,
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "steps": run.step_results,
        "notices": run.notices,
        "definitions_version_at_run": run.definitions_version_at_run,
        "delivery": run.delivery,
    }
