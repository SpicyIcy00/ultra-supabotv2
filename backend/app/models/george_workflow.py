"""
SQLAlchemy models for saved workflows.

A workflow is logic George and a user agreed on in conversation, saved as a
VERSIONED RULE: named steps over existing read tools, parameters, and the
reasoning behind each choice. CLAUDE.md's vocabulary is exact about this — "a
pin re-runs; a save is the rule it re-runs" — and these four tables are the rule.

FOUR TABLES, BECAUSE FOUR THINGS HAVE DIFFERENT LIFETIMES
    workflows           identity and name. Long-lived; edited rarely.
    workflow_versions   the logic. IMMUTABLE — an edit appends, never updates.
    workflow_schedules  when it fires, against a PINNED version.
    workflow_runs       what happened, attributable to exactly one version.

WHY VERSIONS ARE IMMUTABLE. A scheduled job that silently changes behaviour when
somebody edits the logic is the same class of lie as a tile that stores a number
instead of re-running it. A run points at the version that produced it, so "what
was live at 06:00 last Monday" has an answer. Nothing ever UPDATEs a version row;
editing writes version n+1 and the schedule keeps running the old one until an
admin promotes the new one past the backtest gate.

OWNERSHIP IS ORG-LEVEL, AND THAT IS THE DIFFERENCE FROM PINS. A pin belongs to
one person and is scoped by created_by in every query. A workflow that fires
every Monday at 06:00 into a group chat is the company's rule; giving it a single
owner means it dies with that person's account. So created_by here records WHO
WROTE IT — used for the edit permission and for provenance — and never scopes a
read. The three verbs are separated in metrics.yaml (workflows.permissions):
anyone with George access runs, the creator or an admin edits, an admin promotes.

WRITTEN BY THE APPLICATION ROLE, like george.pins and for the same reason:
george_ro is read-only with no access to this schema, and george_log has INSERT
without SELECT so it could never list a workflow. RLS is off here too — matching
the pins migration, where RLS-with-no-policy silently returning zero rows has
already bitten this database twice. Unlike pins, there is no per-user scoping to
enforce in the query: these rows are org-wide by design.
"""

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The states a run (or one of its steps) can be in. Deliberately the SAME four
# as a pin's — a workflow step IS a pinned call with a name on it, and inventing
# a fifth state would mean two vocabularies for one idea.
#   ok          ran and returned data
#   refused     the tool declined to produce a misleading number — a real answer
#   unrunnable  the tool or an argument no longer exists
#   failed      timeout, connection, or an unexpected exception
RUN_STATUSES = ("ok", "refused", "unrunnable", "failed")

WORKFLOW_STATUSES = ("draft", "active", "archived")

# manual     someone asked for it, now, with these bindings
# backtest   run against a PAST window to see what it would have produced.
#            Never delivered anywhere, never counted as a scheduled run.
# scheduled  fired by the scheduler for one slot
RUN_MODES = ("manual", "backtest", "scheduled")

SCHEDULE_KINDS = ("daily", "weekly", "monthly")


class GeorgeWorkflow(Base):
    """Identity. The name is how a person runs it, so it must resolve to one row."""

    __tablename__ = "workflows"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'active', 'archived')", name="ck_workflows_status"
        ),
        CheckConstraint("name = btrim(name)", name="ck_workflows_name_trimmed"),
        CheckConstraint("length(name) > 0", name="ck_workflows_name_not_blank"),
        # A HARD unique index on the lowercased name, which is where this differs
        # from pins. A pin's page may fork into "Replenishment" and
        # "replenishment" if the user insists, because a page is a label. A
        # workflow's name is an INSTRUCTION — "run PO Maker" has to resolve to
        # exactly one rule — so the near-duplicate is refused with no override.
        Index("uq_workflows_name_lower", text("lower(name)"), unique=True),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)

    name: Mapped[str] = mapped_column(Text, nullable=False)

    # Who wrote it. Used for the edit permission and for provenance — NEVER to
    # scope a read. See the module docstring.
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")

    # The version a run uses when the caller does not name one. Nullable only for
    # the instant between INSERTing the workflow and its first version.
    current_version_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class GeorgeWorkflowVersion(Base):
    """
    The logic, frozen. Never UPDATEd after insert.

    The one exception is the gate bookkeeping — backtested_at / backtest_run_id /
    promoted_at / promoted_by — which records what HAPPENED TO this version
    rather than what it says. The steps, parameters and reasoning are immutable.
    """

    __tablename__ = "workflow_versions"
    __table_args__ = (
        UniqueConstraint("workflow_id", "version", name="uq_workflow_versions_number"),
        CheckConstraint("version > 0", name="ck_workflow_versions_positive"),
        CheckConstraint(
            "jsonb_array_length(steps) > 0", name="ck_workflow_versions_steps_not_empty"
        ),
        # The gate, in the database rather than only in the service: a version
        # cannot claim promotion without the backtest that justified it.
        CheckConstraint(
            "promoted_at IS NULL OR backtest_run_id IS NOT NULL",
            name="ck_workflow_versions_promoted_implies_backtested",
        ),
        Index("ix_workflow_versions_workflow", "workflow_id", text("version DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    workflow_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.workflows.id", ondelete="CASCADE"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # [{name, tool, arguments, why}, ...] in presentation order. `arguments` may
    # contain {"$param": "<name>"} where a parameter is bound.
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    # [{name, type, default, description}, ...]. Every parameter has a default,
    # because the fully-defaulted binding is what gets validated at save time and
    # what provenance is checked against.
    parameters: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    # Why this workflow exists, in the user's words. Prose, never executed — and
    # the thing conversation produces that a pin throws away. In six months the
    # question is not what the rule does, it is why it was set that way.
    intent: Mapped[Optional[str]] = mapped_column(Text)
    # Why this version differs from the last.
    change_note: Mapped[Optional[str]] = mapped_column(Text)

    # metrics.yaml `version:` when this was saved. A run whose live definitions
    # version differs carries a definitions_drift notice rather than pretending
    # nothing moved underneath the reasoning above.
    definitions_version: Mapped[Optional[int]] = mapped_column(Integer)

    # The conversation this was agreed in.
    derived_from_conversation_id: Mapped[Optional[UUID]] = mapped_column(
        PgUUID(as_uuid=True)
    )

    # ---- the approval queue -------------------------------------------------
    # NULL until this version has been run against a past window and the output
    # looked at. A schedule cannot fire an unbacktested version.
    backtested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    backtest_run_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))
    promoted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    promoted_by: Mapped[Optional[str]] = mapped_column(Text)


class GeorgeWorkflowSchedule(Base):
    """
    When a workflow fires, and which version fires.

    version_id is NOT NULL and is PINNED. "Whatever is current" would mean an
    edit changes what runs unattended on Monday morning without anyone promoting
    it, which is the whole reason versions exist.
    """

    __tablename__ = "workflow_schedules"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('daily', 'weekly', 'monthly')", name="ck_workflow_schedules_kind"
        ),
        CheckConstraint("hour BETWEEN 0 AND 23", name="ck_workflow_schedules_hour"),
        CheckConstraint("minute BETWEEN 0 AND 59", name="ck_workflow_schedules_minute"),
        CheckConstraint(
            "day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31",
            name="ck_workflow_schedules_day_of_month",
        ),
        CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('ok', 'refused', 'unrunnable', 'failed')",
            name="ck_workflow_schedules_last_status",
        ),
        Index("ix_workflow_schedules_due", "enabled", "last_slot"),
        Index("ix_workflow_schedules_workflow", "workflow_id"),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    workflow_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.workflows.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.workflow_versions.id", ondelete="RESTRICT"),
        nullable=False,
    )

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ---- the slot, in Manila wall clock -------------------------------------
    # The Philippines observes no DST (metrics.yaml timezone.observes_dst), so a
    # slot never repeats itself and never disappears.
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Monday=0 … Sunday=6, matching Python's weekday(). Weekly only.
    days_of_week: Mapped[list[int]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    # Monthly only. 31 means "last day of the month", as scheduled_reports uses.
    day_of_month: Mapped[Optional[int]] = mapped_column(Integer)

    # Parameter values for scheduled runs. Fully bound: a schedule cannot prompt.
    bindings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    # v1 delivery is Telegram, rendered on the backend so a notice cannot be
    # templated out downstream (metrics.yaml workflows.schedule.delivery).
    telegram_chat_ids: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )

    # The most recent slot this schedule has already run for. The tick compares
    # against it, which is what makes the scheduler idempotent and catch-up safe
    # across a restart — see workflow_scheduler.py.
    last_slot: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[Optional[str]] = mapped_column(Text)
    last_error: Mapped[Optional[str]] = mapped_column(Text)

    # The claim. Two web processes both tick; whichever wins the conditional
    # update runs the slot and the other finds nothing to do. See
    # workflow_scheduler.claim_slot.
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    claimed_by: Mapped[Optional[str]] = mapped_column(Text)


class GeorgeWorkflowRun(Base):
    """
    What happened, attributable to exactly one version.

    A run is a RECEIPT, not a warehouse. Every step's full meta and every notice
    are kept whole; rows are kept as a capped sample, because the numbers are
    always re-derivable by running the version again and a run that stored
    everything would grow without limit.
    """

    __tablename__ = "workflow_runs"
    __table_args__ = (
        CheckConstraint(
            "mode IN ('manual', 'backtest', 'scheduled')", name="ck_workflow_runs_mode"
        ),
        CheckConstraint(
            "status IN ('ok', 'refused', 'unrunnable', 'failed')",
            name="ck_workflow_runs_status",
        ),
        # A backtest is against a past window by definition; without as_of it is
        # not a backtest, it is a manual run wearing the label.
        CheckConstraint(
            "mode <> 'backtest' OR as_of IS NOT NULL",
            name="ck_workflow_runs_backtest_has_as_of",
        ),
        Index("ix_workflow_runs_workflow", "workflow_id", text("started_at DESC")),
        Index("ix_workflow_runs_version", "version_id", text("started_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    workflow_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.workflows.id", ondelete="CASCADE"),
        nullable=False,
    )
    version_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.workflow_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    schedule_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    mode: Mapped[str] = mapped_column(Text, nullable=False)

    # Who asked. For a scheduled run this is the schedule's created_by, captured
    # from a token when the schedule was made — never from anything a model said.
    requested_by: Mapped[str] = mapped_column(Text, nullable=False)

    # The Manila day the run is written against. NULL means "today", which is
    # every live run; a backtest always names one.
    as_of: Mapped[Optional[date]] = mapped_column(Date)
    bindings: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, nullable=False)

    # One entry per step: name, tool, bound arguments, status, full meta, its
    # notices, and a capped row sample.
    step_results: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    notices: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    # The LIVE definitions version at run time. Compared against the version's
    # own definitions_version to decide whether the run drifted.
    definitions_version_at_run: Mapped[Optional[int]] = mapped_column(Integer)

    # What was sent, where, and whether it arrived. Scheduled runs only.
    delivery: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
