"""
Every write a saved workflow can make. One path, shared by the route and by
George, for the reason pin_writer already gives: two implementations of "save"
drift, and the half that drifts is the half that stops enforcing something.

WHAT THE CALLER STILL OWNS
  - The identity. `username` and `role` are passed in and are never derived from
    a request body or from anything a model said. Both callers take them from
    the verified token.
  - The transaction. This module flushes; it does not commit. The route lets
    get_db commit at the end of the request; George's writer commits
    immediately, because it runs inside a long-lived SSE stream and the save
    must survive that stream dying later.

FAILURES ARE TYPED, NOT FORMATTED, so the route can pick a status code and
George can turn the same failure into a refusal the model can act on. Neither
reads a string to decide which is which.

THE PERMISSION MODEL IS ORG-LEVEL AND IS READ FROM metrics.yaml
Workflows are the company's rules, not one person's tiles, so the verbs are
separated (workflows.permissions): anyone with George access RUNS, the creator
or an admin EDITS, and an admin — and only an admin — PROMOTES a version past
the backtest gate. Nobody schedules their own unreviewed logic. The policy
strings are read at runtime rather than hardcoded here, and an unrecognised one
raises rather than defaulting open.

WHY current_version AND THE SCHEDULED VERSION ARE ALLOWED TO DIFFER
current_version_id is always the NEWEST version: "run PO Maker" in conversation
should use the latest logic. A schedule pins the version it was promoted with
and keeps firing that one until an admin promotes a newer one. So an edited
workflow can legitimately show different figures in chat and on Monday morning —
that is the gate working, not a bug, and it is why every run row names the exact
version that produced it.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.george_workflow import (
    GeorgeWorkflow,
    GeorgeWorkflowRun,
    GeorgeWorkflowSchedule,
    GeorgeWorkflowVersion,
)
from app.services.workflow_runner import (
    WorkflowValidationError,
    cap_for_storage,
    describe_slot,
    resolve_bindings,
    run_version,
    validate_parameters,
    validate_steps,
)

# Safe below the import above, which puts the repo root on sys.path — the same
# arrangement pin_runner and routes/george.py use.
from tools._common import load_defs as _load_defs, req as _req  # noqa: E402

MANILA = ZoneInfo("Asia/Manila")

# Operational caps, like MAX_TOOL_CALLS_PER_PIN. Not business definitions.
MAX_WORKFLOWS = 200
MAX_NAME_LEN = 120


class WorkflowNameTaken(ValueError):
    """
    The name is already in use, ignoring case.

    Unlike a pin's page there is no allow_similar override, and that is
    deliberate: a page is a label the user chose, but a workflow's name is how
    it is INVOKED. "Run PO Maker" has to resolve to exactly one rule, so two
    workflows differing only by capitalisation is not a preference to respect.
    """

    def __init__(self, existing: str, submitted: str) -> None:
        self.existing_name = existing
        self.submitted_name = submitted
        super().__init__(
            f"There is already a workflow called {existing!r}, and {submitted!r} "
            f"differs from it only by capitalisation. A workflow's name is how it "
            f"is run, so it has to be unique. Edit that one, or pick a different "
            f"name."
        )


class WorkflowQuotaError(ValueError):
    """The organisation is at MAX_WORKFLOWS."""


class WorkflowNotFound(ValueError):
    """No workflow by that name. Carries what does exist, so the caller can say."""


class NotAllowed(ValueError):
    """The caller may not do this. Carries which verb and which policy refused."""


class PromotionRefused(ValueError):
    """The version cannot be promoted past the gate yet, and the message says why."""


@dataclass(frozen=True)
class SavedVersion:
    """What both callers want back: the workflow, the version, and its number."""

    workflow: GeorgeWorkflow
    version: GeorgeWorkflowVersion
    created: bool  # True when the workflow itself was new


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

def _policy(defs: dict, verb: str) -> str:
    return _req(defs, f"workflows.permissions.{verb}")


def check_permission(defs: dict, verb: str, *, username: str, role: str,
                     created_by: Optional[str]) -> None:
    """
    Raise NotAllowed unless metrics.yaml's policy for `verb` admits this caller.

    An unknown policy string raises too. A permission check that fails open
    because somebody typed the policy name wrong is worse than one that fails
    loudly on the next deploy.
    """
    policy = _policy(defs, verb)

    if policy == "any_george_user":
        return
    if policy == "admin_only":
        if role == "admin":
            return
        raise NotAllowed(
            f"Only an administrator can {verb} a workflow. "
            f"(metrics.yaml workflows.permissions.{verb} = {policy})"
        )
    if policy == "creator_or_admin":
        if role == "admin" or (created_by is not None and created_by == username):
            return
        raise NotAllowed(
            f"Only {created_by or 'the person who wrote it'} or an administrator "
            f"can {verb} this workflow. "
            f"(metrics.yaml workflows.permissions.{verb} = {policy})"
        )

    raise NotAllowed(
        f"metrics.yaml workflows.permissions.{verb} is {policy!r}, which this "
        f"build does not recognise, so the action is refused. Valid policies: "
        f"any_george_user, creator_or_admin, admin_only."
    )


# ---------------------------------------------------------------------------
# Names
# ---------------------------------------------------------------------------

def normalize_name(name: Any) -> str:
    if not isinstance(name, str) or not name.strip():
        raise WorkflowValidationError("A workflow needs a name — it is how it is run.")
    cleaned = " ".join(name.split())
    if len(cleaned) > MAX_NAME_LEN:
        raise WorkflowValidationError(
            f"A workflow name may be at most {MAX_NAME_LEN} characters."
        )
    return cleaned


async def find_by_name(db: AsyncSession, name: str) -> Optional[GeorgeWorkflow]:
    """Case-insensitive lookup, which is also how "run PO Maker" resolves."""
    return (
        await db.execute(
            select(GeorgeWorkflow).where(
                func.lower(GeorgeWorkflow.name) == name.lower(),
                GeorgeWorkflow.status != "archived",
            )
        )
    ).scalar_one_or_none()


# ---------------------------------------------------------------------------
# Saving
# ---------------------------------------------------------------------------

async def save_workflow(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    name: str,
    steps: list[dict[str, Any]],
    parameters: Optional[list[dict[str, Any]]] = None,
    intent: Optional[str] = None,
    change_note: Optional[str] = None,
    conversation_id: Optional[uuid.UUID] = None,
) -> SavedVersion:
    """
    Save logic as a versioned rule. Creates the workflow if the name is new,
    otherwise appends a version to the existing one.

    Every step is validated against the LIVE tool surface at its default
    bindings before anything is stored — a rule that cannot run is a Monday
    morning failure with no visible cause, so the refusal happens now, while the
    person is still in the conversation where they asked for it.

    Raises WorkflowValidationError, WorkflowNameTaken, WorkflowQuotaError or
    NotAllowed.
    """
    defs = _load_defs()
    clean = normalize_name(name)

    params = validate_parameters(parameters)
    validated = validate_steps(steps, params)

    existing = await find_by_name(db, clean)

    if existing is None:
        count = (
            await db.execute(select(func.count()).select_from(GeorgeWorkflow))
        ).scalar_one()
        if count >= MAX_WORKFLOWS:
            raise WorkflowQuotaError(
                f"There are already {count} workflows, the maximum. Archive some "
                f"first."
            )
        check_permission(defs, "edit", username=username, role=role,
                         created_by=username)
        workflow = GeorgeWorkflow(
            id=uuid.uuid4(),
            name=clean,
            created_by=username,
            created_at=datetime.now(timezone.utc),
            status="draft",
        )
        db.add(workflow)
        await db.flush()
        number, created = 1, True
    else:
        if existing.name != clean:
            # Same name ignoring case, different capitalisation. Refused rather
            # than silently appending a version to a workflow the caller may
            # think is a different rule.
            raise WorkflowNameTaken(existing=existing.name, submitted=clean)
        check_permission(defs, "edit", username=username, role=role,
                         created_by=existing.created_by)
        workflow = existing
        number = (
            await db.execute(
                select(func.coalesce(func.max(GeorgeWorkflowVersion.version), 0))
                .where(GeorgeWorkflowVersion.workflow_id == workflow.id)
            )
        ).scalar_one() + 1
        created = False

    version = GeorgeWorkflowVersion(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        version=number,
        created_by=username,
        created_at=datetime.now(timezone.utc),
        steps=validated,
        parameters=params,
        intent=(intent or None),
        change_note=(change_note or None),
        definitions_version=_req(defs, "version"),
        derived_from_conversation_id=conversation_id,
    )
    db.add(version)
    await db.flush()

    # The newest version is what a manual run uses. A SCHEDULE keeps the version
    # it was promoted with — see the module docstring.
    workflow.current_version_id = version.id
    await db.flush()

    return SavedVersion(workflow=workflow, version=version, created=created)


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------

async def record_run(
    db: AsyncSession,
    *,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
    outcome: dict,
    mode: str,
    requested_by: str,
    as_of: Optional[date] = None,
    schedule_id: Optional[uuid.UUID] = None,
    started_at: Optional[datetime] = None,
    delivery: Optional[dict] = None,
) -> GeorgeWorkflowRun:
    """
    Store what a run produced. The run is the receipt; see cap_for_storage.

    A backtest that completed also stamps the version's gate fields, which is
    what an admin later promotes against. Stamped here rather than in the route
    so the scheduler and George cannot record a backtest that does not count.
    """
    now = datetime.now(timezone.utc)
    run = GeorgeWorkflowRun(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        version_id=version.id,
        schedule_id=schedule_id,
        mode=mode,
        requested_by=requested_by,
        as_of=as_of,
        bindings=outcome.get("bindings") or {},
        started_at=started_at or now,
        finished_at=now,
        status=outcome["status"],
        step_results=cap_for_storage(outcome.get("steps") or []),
        notices=outcome.get("notices") or [],
        definitions_version_at_run=outcome.get("definitions_version"),
        delivery=delivery,
    )
    db.add(run)
    await db.flush()

    if mode == "backtest" and as_of is not None:
        # The most recent backtest is the one an admin is looking at. Overwriting
        # an earlier one is right: promoting against a backtest nobody has seen
        # since is the thing the gate exists to prevent.
        version.backtested_at = now
        version.backtest_run_id = run.id
        await db.flush()

    return run


async def run_named_workflow(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    name: str,
    bindings: Optional[dict] = None,
    as_of: Optional[str] = None,
    version_number: Optional[int] = None,
) -> dict:
    """
    Find a workflow by name, run it, record the run, and return the outcome.

    The ONE implementation of "run PO Maker", used by the route and by George's
    injected runner alike. An `as_of` makes it a BACKTEST: the run is recorded
    as one, it is never delivered anywhere, and it is what an administrator
    later promotes against.

    Runs the workflow's CURRENT version unless a number is named — a manual run
    should use the latest logic. A schedule keeps the version it was promoted
    with; see the module docstring on why those two are allowed to differ.
    """
    clean = normalize_name(name)
    workflow = await find_by_name(db, clean)
    if workflow is None:
        existing = (
            await db.execute(
                select(GeorgeWorkflow.name)
                .where(GeorgeWorkflow.status != "archived")
                .order_by(GeorgeWorkflow.name)
            )
        ).scalars().all()
        raise WorkflowNotFound(
            f"There is no saved workflow called {clean!r}. "
            + (f"Saved workflows: {', '.join(existing)}."
               if existing else "Nothing has been saved yet.")
        )

    version = await resolve_version(db, workflow, version_number)
    return await run_workflow_version(
        db, username=username, role=role, workflow=workflow, version=version,
        bindings=bindings, as_of=as_of,
    )


async def resolve_version(
    db: AsyncSession,
    workflow: GeorgeWorkflow,
    version_number: Optional[int] = None,
) -> GeorgeWorkflowVersion:
    """The named version, or the current one — which is always the newest."""
    stmt = select(GeorgeWorkflowVersion).where(
        GeorgeWorkflowVersion.workflow_id == workflow.id
    )
    stmt = (
        stmt.where(GeorgeWorkflowVersion.version == version_number)
        if version_number is not None
        else stmt.where(GeorgeWorkflowVersion.id == workflow.current_version_id)
    )
    version = (await db.execute(stmt)).scalar_one_or_none()
    if version is None:
        raise WorkflowNotFound(
            f"{workflow.name!r} has no version "
            f"{version_number if version_number is not None else 'to run'}."
        )
    return version


async def version_context(
    db: AsyncSession,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
) -> dict:
    """
    Which version is about to run, and which versions the schedules fire.

    Read here rather than in the runner because it is a database fact and the
    runner reads nothing. Every schedule is described, enabled or not, so a
    caller can show the whole picture; the runner decides which of them
    constitutes a DIVERGENCE worth a notice (only the enabled ones — a disabled
    schedule sends nothing for anyone to be confused by).
    """
    rows = (
        await db.execute(
            select(GeorgeWorkflowSchedule, GeorgeWorkflowVersion.version)
            .join(GeorgeWorkflowVersion,
                  GeorgeWorkflowVersion.id == GeorgeWorkflowSchedule.version_id)
            .where(GeorgeWorkflowSchedule.workflow_id == workflow.id)
            .order_by(GeorgeWorkflowSchedule.created_at)
        )
    ).all()

    return {
        "workflow": workflow.name,
        "version": version.version,
        "promoted": version.promoted_at is not None,
        "scheduled": [
            {
                "schedule_id": str(schedule.id),
                "version": number,
                "enabled": schedule.enabled,
                "slot": describe_slot(
                    schedule.kind, schedule.hour, schedule.minute,
                    schedule.days_of_week, schedule.day_of_month,
                ),
            }
            for schedule, number in rows
        ],
    }


async def run_workflow_version(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
    bindings: Optional[dict] = None,
    as_of: Optional[str] = None,
) -> dict:
    """
    Run one version and record the run. The bottom of every non-scheduled path.

    An `as_of` makes it a BACKTEST: the run is recorded as one, it is never
    delivered anywhere, and it is what an administrator later promotes against.

    The version context goes in and comes back out: a run whose version differs
    from one an enabled schedule pins carries a version_divergence notice, which
    is stored on the run record and surfaced in the answer. Divergence is
    allowed — a manual run uses the newest logic while a schedule fires the
    promoted one — but it is never silent.
    """
    defs = _load_defs()
    check_permission(defs, "run", username=username, role=role, created_by=None)

    parsed: Optional[date] = None
    if as_of:
        try:
            parsed = date.fromisoformat(str(as_of))
        except ValueError as exc:
            raise WorkflowValidationError(
                f"as_of must be a Manila calendar date as YYYY-MM-DD, got "
                f"{as_of!r}."
            ) from exc

    context = await version_context(db, workflow, version)

    started = datetime.now(timezone.utc)
    outcome = await run_version(
        steps=version.steps,
        parameters=version.parameters or [],
        bindings=bindings,
        as_of=parsed,
        mode="backtest" if parsed else "manual",
        saved_definitions_version=version.definitions_version,
        version_context=context,
    )

    run = await record_run(
        db, workflow=workflow, version=version, outcome=outcome,
        mode="backtest" if parsed else "manual",
        requested_by=username, as_of=parsed, started_at=started,
    )

    return {
        **outcome,
        "workflow": workflow.name,
        "workflow_id": str(workflow.id),
        "version": version.version,
        "version_id": str(version.id),
        "run_id": str(run.id),
        "intent": version.intent,
        "awaiting_promotion": version.promoted_at is None,
    }


# ---------------------------------------------------------------------------
# The approval queue
# ---------------------------------------------------------------------------

async def pending_promotion(db: AsyncSession) -> list[tuple[GeorgeWorkflow, GeorgeWorkflowVersion]]:
    """
    The approval queue: the newest version of every workflow that has not been
    promoted. UI rule 5's one colour belongs to exactly these rows.

    A version with no backtest yet is IN the queue, not absent from it — the
    thing waiting on a person is the same either way, and hiding it until
    somebody runs a backtest would mean the queue only shows work already
    started.
    """
    rows = (
        await db.execute(
            select(GeorgeWorkflow, GeorgeWorkflowVersion)
            .join(GeorgeWorkflowVersion,
                  GeorgeWorkflowVersion.id == GeorgeWorkflow.current_version_id)
            .where(GeorgeWorkflow.status != "archived",
                   GeorgeWorkflowVersion.promoted_at.is_(None))
            .order_by(GeorgeWorkflowVersion.created_at.desc())
        )
    ).all()
    return [(w, v) for w, v in rows]


async def promote(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
) -> GeorgeWorkflowVersion:
    """
    Let a version fire on a schedule. Admin only, and only after a backtest.

    THE GATE, in full:
      1. the caller is an administrator (metrics.yaml workflows.permissions);
      2. a backtest run exists for THIS version;
      3. it was against a window that has closed — a "backtest" of today
         reproduces nothing and proves nothing;
      4. it actually ran. A version whose steps are unrunnable or failing must
         not be scheduled. A REFUSED step is allowed through: a tool declining
         to produce a misleading number is a real answer, and a scheduled run
         reporting that refusal every Monday is legitimate.
    """
    defs = _load_defs()
    check_permission(defs, "promote", username=username, role=role,
                     created_by=workflow.created_by)

    if not _req(defs, "workflows.promotion.requires_backtest"):
        # Present so that turning the gate off is a definitions change with a
        # visible diff, rather than something the code silently never checked.
        version.promoted_at = datetime.now(timezone.utc)
        version.promoted_by = username
        await db.flush()
        return version

    if version.backtest_run_id is None:
        raise PromotionRefused(
            f"Version {version.version} has never been backtested, so there is "
            f"nothing to approve. Run it against a past window first and look at "
            f"what it would have produced."
        )

    run = (
        await db.execute(
            select(GeorgeWorkflowRun).where(GeorgeWorkflowRun.id == version.backtest_run_id)
        )
    ).scalar_one_or_none()
    if run is None:
        raise PromotionRefused(
            f"The backtest recorded against version {version.version} no longer "
            f"exists. Run another one."
        )

    if _req(defs, "workflows.promotion.backtest_must_be_past"):
        today = datetime.now(MANILA).date()
        if run.as_of is None or run.as_of >= today:
            raise PromotionRefused(
                f"The backtest for version {version.version} was run against "
                f"{run.as_of or 'no date'}, which is not a window that has closed. "
                f"A backtest of today reproduces nothing. Run it against an "
                f"earlier Manila date."
            )

    if run.status in ("unrunnable", "failed"):
        raise PromotionRefused(
            f"The backtest for version {version.version} came back "
            f"{run.status!r}, so this rule does not currently run at all. "
            f"Scheduling it would produce a failure every time it fired."
        )

    version.promoted_at = datetime.now(timezone.utc)
    version.promoted_by = username
    if workflow.status == "draft":
        workflow.status = "active"
    await db.flush()
    return version


# ---------------------------------------------------------------------------
# Schedules
# ---------------------------------------------------------------------------

async def create_schedule(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
    kind: str,
    hour: int,
    minute: int = 0,
    days_of_week: Optional[list[int]] = None,
    day_of_month: Optional[int] = None,
    bindings: Optional[dict] = None,
    telegram_chat_ids: Optional[list[str]] = None,
    enabled: bool = False,
) -> GeorgeWorkflowSchedule:
    """
    Attach a slot to a PINNED version.

    Created disabled unless the version is already promoted, and enabling it
    later goes through set_enabled, which applies the same rule. A schedule
    whose version is not promoted exists, is visible in the approval queue, and
    fires nothing — which is what lets George accept "every Monday at 6" in
    conversation without that instruction quietly bypassing the gate.
    """
    defs = _load_defs()
    check_permission(defs, "edit", username=username, role=role,
                     created_by=workflow.created_by)

    kinds = _req(defs, "workflows.schedule.kinds")
    if kind not in kinds:
        raise WorkflowValidationError(
            f"Unknown schedule kind {kind!r}. Valid: {', '.join(kinds)}."
        )
    if kind == "weekly" and not days_of_week:
        raise WorkflowValidationError(
            "A weekly schedule needs at least one weekday (Monday=0 … Sunday=6)."
        )
    if kind == "monthly" and not day_of_month:
        raise WorkflowValidationError(
            "A monthly schedule needs a day of the month (31 means the last day)."
        )
    if not isinstance(hour, int) or not 0 <= hour <= 23:
        raise WorkflowValidationError("hour must be between 0 and 23, Manila time.")
    if not isinstance(minute, int) or not 0 <= minute <= 59:
        raise WorkflowValidationError("minute must be between 0 and 59.")

    delivery_kinds = _req(defs, "workflows.schedule.delivery")
    chats = list(telegram_chat_ids or [])
    if "telegram" in delivery_kinds and not chats:
        raise WorkflowValidationError(
            "A schedule needs somewhere to deliver to. A run nobody receives is "
            "indistinguishable from one that never happened."
        )

    # Bindings are resolved now so a schedule cannot be created against a
    # parameter that does not exist, or a value the tools would reject.
    resolved = resolve_bindings(version.parameters or [], bindings)
    validate_steps(version.steps, version.parameters or [])

    schedule = GeorgeWorkflowSchedule(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        version_id=version.id,
        created_by=username,
        created_at=datetime.now(timezone.utc),
        kind=kind,
        hour=hour,
        minute=minute,
        days_of_week=list(days_of_week or []),
        day_of_month=day_of_month,
        bindings=resolved,
        telegram_chat_ids=chats,
        enabled=False,
    )
    db.add(schedule)
    await db.flush()

    if enabled:
        await set_enabled(db, username=username, role=role, workflow=workflow,
                          version=version, schedule=schedule, enabled=True)
    return schedule


async def repoint_schedule(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    workflow: GeorgeWorkflow,
    schedule: GeorgeWorkflowSchedule,
    version: GeorgeWorkflowVersion,
) -> GeorgeWorkflowSchedule:
    """
    Point a schedule at a different version — the act that ENDS a divergence.

    Deliberately separate from promoting. Promotion says "this version is fit to
    run unattended"; repointing says "and it is what goes out on Monday". Fusing
    them would mean approving a version silently changed every schedule that
    mentions the workflow, which is the behaviour versions exist to prevent.

    The target must already be promoted, so this cannot be a way around the
    gate. The bindings are re-resolved against the new version's parameters: a
    version that renamed or dropped a parameter would otherwise leave a schedule
    firing at values it no longer declares.
    """
    defs = _load_defs()
    check_permission(defs, "edit", username=username, role=role,
                     created_by=workflow.created_by)

    if version.workflow_id != workflow.id:
        raise WorkflowNotFound(
            f"That version does not belong to {workflow.name!r}."
        )
    if schedule.version_id == version.id:
        return schedule

    if version.promoted_at is None:
        queue = _req(defs, "workflows.promotion.queue_name")
        raise PromotionRefused(
            f"Version {version.version} of {workflow.name!r} has not been "
            f"promoted, so a schedule cannot be pointed at it. It is in the "
            f"{queue} until an administrator approves it against a backtest."
        )

    schedule.bindings = resolve_bindings(version.parameters or [],
                                         schedule.bindings or {})
    schedule.version_id = version.id
    await db.flush()
    return schedule


async def set_enabled(
    db: AsyncSession,
    *,
    username: str,
    role: str,
    workflow: GeorgeWorkflow,
    version: GeorgeWorkflowVersion,
    schedule: GeorgeWorkflowSchedule,
    enabled: bool,
) -> GeorgeWorkflowSchedule:
    """
    Turn a schedule on or off.

    Turning one ON is the moment unattended execution begins, so it is gated:
    the pinned version must have been promoted. Turning one OFF is always
    allowed to anyone who may edit the workflow — stopping something is never
    the dangerous direction.
    """
    defs = _load_defs()
    check_permission(defs, "edit", username=username, role=role,
                     created_by=workflow.created_by)

    if enabled and version.promoted_at is None:
        queue = _req(defs, "workflows.promotion.queue_name")
        raise PromotionRefused(
            f"Version {version.version} of {workflow.name!r} has not been "
            f"promoted, so it cannot run unattended. It is in the {queue} until "
            f"an administrator approves it against a backtest."
        )

    schedule.enabled = bool(enabled)
    await db.flush()
    return schedule
