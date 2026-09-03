"""add_george_workflows

Saved workflows: logic George and a user agreed on in conversation, stored as a
VERSIONED RULE — named steps over existing read tools, parameters, and the
reasoning behind each choice — runnable on demand or on a schedule George owns.

WHY FOUR TABLES
---------------
Four things with four different lifetimes, and collapsing any pair loses a
guarantee:

    workflows           the name. "Run PO Maker" has to resolve to one row.
    workflow_versions   the logic, IMMUTABLE. An edit appends version n+1.
    workflow_schedules  when it fires, against a PINNED version id.
    workflow_runs       what happened, attributable to exactly one version.

The pinning is the point. A schedule that ran "whatever is current" would change
what fires unattended on Monday morning the moment somebody edited the steps,
with nobody having approved the change — the same class of lie as a tile that
stores a number instead of re-running. Instead the schedule keeps running the
version it was promoted with until an admin promotes a newer one.

OWNERSHIP IS ORG-LEVEL, WHICH IS THE DIFFERENCE FROM PINS
---------------------------------------------------------
george.pins is scoped by created_by in every query: a pin is one person's tile.
A workflow that fires every Monday into a group chat is the company's rule, and
a single owner means it dies with that person's account. So created_by here
records who WROTE it — used for the edit permission and for provenance — and
never scopes a read. The verbs are split (metrics.yaml workflows.permissions):

    run       anyone who can use George at all
    edit      the creator, or an admin
    promote   an admin only — nobody schedules their own unreviewed logic

THE GATE IS IN THE DATABASE, NOT ONLY IN THE SERVICE
----------------------------------------------------
ck_workflow_versions_promoted_implies_backtested: a version cannot record a
promotion without the backtest run that justified it. The service enforces more
(the backtest must be against a window that has closed, and the promoter must be
an admin), but the part that must survive a bug in the service is here.

SCHEMA PLACEMENT AND WHO CAN WRITE
----------------------------------
The `george` schema, alongside pins — and, exactly as with pins, NEITHER George
role can use these tables. george_ro is read-only with no access to this schema;
george_log has INSERT without SELECT and could never list a workflow. The
APPLICATION role owns this metadata through get_db, while george_ro still
executes the tools each step calls. Nobody gains a privilege they did not have.

If DATABASE_URL is ever tightened from the current superuser to a real
application role, that role needs USAGE ON SCHEMA george plus table privileges
here, or workflows break — the same note the pins migration carries.

ROW LEVEL SECURITY IS DELIBERATELY OFF
--------------------------------------
Matching george.pins and the StoreHub tables. RLS enabled with no policy is
deny-all to any role without BYPASSRLS, and the symptom is queries that succeed
and return ZERO ROWS with no error; that has already bitten this database twice.
Unlike pins there is no per-user scoping to enforce in the query either — these
rows are org-wide by design.

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-09-03 00:02:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'k5l6m7n8o9p0'
down_revision: Union[str, None] = 'j4k5l6m7n8o9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    # ---------------------------------------------------------------- identity
    op.create_table(
        'workflows',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),

        # The name is an INSTRUCTION, not a label. See the unique index below.
        sa.Column('name', sa.Text(), nullable=False),

        # AppUser.username, taken from the token. Provenance and the edit
        # permission; never a read scope.
        sa.Column('created_by', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),

        sa.Column('status', sa.Text(), nullable=False, server_default='draft'),

        # Which version runs when the caller does not name one. Nullable only
        # for the instant between inserting the workflow and its first version;
        # no FK, because that would be circular with workflow_versions.
        sa.Column('current_version_id', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("status IN ('draft', 'active', 'archived')",
                           name='ck_workflows_status'),
        sa.CheckConstraint("name = btrim(name)", name='ck_workflows_name_trimmed'),
        sa.CheckConstraint("length(name) > 0", name='ck_workflows_name_not_blank'),
        schema='george',
    )

    # A HARD uniqueness rule on the lowercased name, and this is where workflows
    # deliberately differ from pins. A pin's page may fork into "Replenishment"
    # and "replenishment" if the user insists, because a page is a label the
    # user chose. A workflow's name is how it is INVOKED — "run PO Maker" must
    # resolve to exactly one rule — so a case-only near-duplicate is refused
    # outright, with no allow_similar escape hatch.
    op.create_index('uq_workflows_name_lower', 'workflows',
                    [sa.text('lower(name)')], unique=True, schema='george')

    # ----------------------------------------------------------- the logic
    op.create_table(
        'workflow_versions',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),

        sa.Column('created_by', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),

        # [{name, tool, arguments, why}, ...] in presentation order. `arguments`
        # may hold {"$param": "<name>"} wherever a parameter is bound. Steps do
        # not consume each other's output: the moment step 3 reads step 1's rows
        # a workflow needs expressions and join semantics, which is arbitrary
        # code with extra steps, and it puts a DEFINITION somewhere other than
        # metrics.yaml. If two facts need joining, that join is a new tool.
        sa.Column('steps', postgresql.JSONB(astext_type=sa.Text()), nullable=False),

        # [{name, type, default, description}, ...]. Every parameter has a
        # default: the fully-defaulted binding is what gets validated at save
        # time and what the provenance check is made against.
        sa.Column('parameters', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),

        # Prose, never executed. The thing conversation produces that a pin
        # throws away — in six months the question is not what the rule does,
        # it is why it was set that way.
        sa.Column('intent', sa.Text(), nullable=True),
        sa.Column('change_note', sa.Text(), nullable=True),

        # metrics.yaml `version:` as it stood when this was saved. A run whose
        # LIVE definitions version differs carries a definitions_drift notice
        # rather than pretending nothing moved under the reasoning above.
        sa.Column('definitions_version', sa.Integer(), nullable=True),

        # No FK to george.conversations: that row is written LAST by the logging
        # role, so it may not exist yet — the same reasoning as pins.
        sa.Column('derived_from_conversation_id', postgresql.UUID(as_uuid=True),
                  nullable=True),

        # The approval queue. NULL until this version has been run against a
        # past window and an admin has looked at the output.
        sa.Column('backtested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('backtest_run_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('promoted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('promoted_by', sa.Text(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workflow_id'], ['george.workflows.id'],
                                ondelete='CASCADE'),
        sa.UniqueConstraint('workflow_id', 'version',
                            name='uq_workflow_versions_number'),
        sa.CheckConstraint("version > 0", name='ck_workflow_versions_positive'),
        sa.CheckConstraint("jsonb_array_length(steps) > 0",
                           name='ck_workflow_versions_steps_not_empty'),
        # The gate, at the level a service bug cannot get past.
        sa.CheckConstraint("promoted_at IS NULL OR backtest_run_id IS NOT NULL",
                           name='ck_workflow_versions_promoted_implies_backtested'),
        schema='george',
    )
    op.create_index('ix_workflow_versions_workflow', 'workflow_versions',
                    ['workflow_id', sa.text('version DESC')], schema='george')

    # -------------------------------------------------------------- schedules
    op.create_table(
        'workflow_schedules',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),

        # PINNED, and NOT NULL. ondelete RESTRICT: a version a schedule points
        # at cannot be deleted out from under it.
        sa.Column('version_id', postgresql.UUID(as_uuid=True), nullable=False),

        sa.Column('created_by', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),

        # The slot, in Manila wall clock. The Philippines observes no DST
        # (metrics.yaml timezone.observes_dst), so a slot never repeats itself
        # and never disappears.
        sa.Column('kind', sa.Text(), nullable=False),
        sa.Column('hour', sa.Integer(), nullable=False),
        sa.Column('minute', sa.Integer(), nullable=False, server_default='0'),
        # Monday=0 … Sunday=6, matching Python's weekday(). Weekly only.
        sa.Column('days_of_week', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
        # Monthly only. 31 means the last day of the month, as scheduled_reports
        # already uses.
        sa.Column('day_of_month', sa.Integer(), nullable=True),

        # Fully bound. A schedule cannot prompt for a parameter at 06:00.
        sa.Column('bindings', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'{}'::jsonb")),

        # v1 delivery is Telegram, rendered on the backend so a notice cannot be
        # templated out downstream — the same argument ops/n8n/README.md makes.
        sa.Column('telegram_chat_ids', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),

        # Defaults to FALSE. A schedule created alongside an unpromoted version
        # exists, is visible in the approval queue, and fires nothing.
        sa.Column('enabled', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        # The most recent slot already run. The tick compares against this,
        # which is what makes the scheduler idempotent and catch-up safe across
        # a restart — a registered cron trigger would simply lose a slot the
        # process was not up for.
        sa.Column('last_slot', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_status', sa.Text(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),

        # The claim. The existing scheduler guards overlap with a module-level
        # asyncio.Lock, which holds for exactly one process; with two replicas
        # both tick and both fire. Whichever process wins the conditional update
        # on (id, last_slot) runs the slot, and the other finds nothing to do.
        sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('claimed_by', sa.Text(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workflow_id'], ['george.workflows.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['version_id'], ['george.workflow_versions.id'],
                                ondelete='RESTRICT'),
        sa.CheckConstraint("kind IN ('daily', 'weekly', 'monthly')",
                           name='ck_workflow_schedules_kind'),
        sa.CheckConstraint("hour BETWEEN 0 AND 23", name='ck_workflow_schedules_hour'),
        sa.CheckConstraint("minute BETWEEN 0 AND 59",
                           name='ck_workflow_schedules_minute'),
        sa.CheckConstraint("day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31",
                           name='ck_workflow_schedules_day_of_month'),
        sa.CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('ok', 'refused', 'unrunnable', 'failed')",
            name='ck_workflow_schedules_last_status'),
        schema='george',
    )
    # The tick's own query: enabled schedules, oldest slot first.
    op.create_index('ix_workflow_schedules_due', 'workflow_schedules',
                    ['enabled', 'last_slot'], schema='george')
    op.create_index('ix_workflow_schedules_workflow', 'workflow_schedules',
                    ['workflow_id'], schema='george')

    # ------------------------------------------------------------------- runs
    op.create_table(
        'workflow_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workflow_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('version_id', postgresql.UUID(as_uuid=True), nullable=False),
        # No FK: a schedule can be deleted while its runs remain as history.
        sa.Column('schedule_id', postgresql.UUID(as_uuid=True), nullable=True),

        sa.Column('mode', sa.Text(), nullable=False),

        # For a scheduled run this is the schedule's created_by, captured from a
        # token when the schedule was made — never from anything a model said.
        sa.Column('requested_by', sa.Text(), nullable=False),

        # The Manila day the run is written against. NULL means today, which is
        # every live run; a backtest always names one.
        sa.Column('as_of', sa.Date(), nullable=True),
        sa.Column('bindings', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'{}'::jsonb")),

        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Text(), nullable=False),

        # One entry per step: name, tool, bound arguments, status, FULL meta,
        # its notices, and a capped row sample. A run is a receipt, not a
        # warehouse — the numbers are re-derivable by running the version again.
        sa.Column('step_results', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('notices', postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),

        sa.Column('definitions_version_at_run', sa.Integer(), nullable=True),

        # What was sent, where, and whether it arrived. Scheduled runs only.
        sa.Column('delivery', postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workflow_id'], ['george.workflows.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['version_id'], ['george.workflow_versions.id'],
                                ondelete='CASCADE'),
        sa.CheckConstraint("mode IN ('manual', 'backtest', 'scheduled')",
                           name='ck_workflow_runs_mode'),
        sa.CheckConstraint("status IN ('ok', 'refused', 'unrunnable', 'failed')",
                           name='ck_workflow_runs_status'),
        # Without as_of it is not a backtest, it is a manual run wearing the
        # label — and the promotion gate reads this column.
        sa.CheckConstraint("mode <> 'backtest' OR as_of IS NOT NULL",
                           name='ck_workflow_runs_backtest_has_as_of'),
        schema='george',
    )
    op.create_index('ix_workflow_runs_workflow', 'workflow_runs',
                    ['workflow_id', sa.text('started_at DESC')], schema='george')
    op.create_index('ix_workflow_runs_version', 'workflow_runs',
                    ['version_id', sa.text('started_at DESC')], schema='george')


def downgrade() -> None:
    op.drop_index('ix_workflow_runs_version', 'workflow_runs', schema='george')
    op.drop_index('ix_workflow_runs_workflow', 'workflow_runs', schema='george')
    op.drop_table('workflow_runs', schema='george')

    op.drop_index('ix_workflow_schedules_workflow', 'workflow_schedules',
                  schema='george')
    op.drop_index('ix_workflow_schedules_due', 'workflow_schedules', schema='george')
    op.drop_table('workflow_schedules', schema='george')

    op.drop_index('ix_workflow_versions_workflow', 'workflow_versions', schema='george')
    op.drop_table('workflow_versions', schema='george')

    op.drop_index('uq_workflows_name_lower', 'workflows', schema='george')
    op.drop_table('workflows', schema='george')
    # The schema itself is NOT dropped — alembic never created it, and other
    # tables live there. Same reasoning as the pins migration.
