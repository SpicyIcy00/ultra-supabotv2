"""add_george_pins

A pin is an answer that became a live tile: it stores the TOOL CALLS behind the
answer, not the answer itself, and re-runs them every time it is loaded.

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-09-03 00:01:00.000000

WHY NO ANSWER TEXT IS STORED
----------------------------
CLAUDE.md: "A pin re-runs; a save is the rule it re-runs." A stored sentence
written against June's figures, sitting beside a re-run October number, is
exactly the stale-number trap the UI rules exist to prevent. The `question`
gives the tile its meaning; the numbers come from running the tools again.

SCHEMA PLACEMENT AND WHO CAN WRITE HERE
---------------------------------------
This lands in the `george` schema alongside conversations/tool_calls/gaps, but
NEITHER George role can use it:

    george_ro    SELECT on public only; explicitly REVOKE ALL ON SCHEMA george
    george_log   INSERT on three tables, deliberately no SELECT — cannot list

So pins follow the StoreHub import pattern instead: the APPLICATION role owns
the pin metadata through get_db, exactly as it owns packing lists and report
presets, while george_ro still executes the pinned tools. Nobody gains a
privilege they did not have — the app writes ABOUT George, george_ro still does
George's reading.

Consequence to remember if DATABASE_URL is ever tightened from the current
superuser to a real application role: that role needs USAGE ON SCHEMA george
plus table privileges here, or pins break.

ROW LEVEL SECURITY IS DELIBERATELY OFF
--------------------------------------
The three existing george.* tables have RLS enabled with insert-only policies
for george_log. This table does NOT enable it, matching the StoreHub tables in
migration h2i3j4k5l6m7 and for the same reason: RLS enabled with no policy is
deny-all to any role without BYPASSRLS, and the symptom is queries that succeed
and return ZERO ROWS with no error. That has already bitten this database twice
(tools/george_ro_role.sql documents the first time).

User scoping is therefore enforced in the QUERY — every read and delete filters
on created_by — not by the database. If RLS is ever turned on here, add a policy
in the same change or pins will silently vanish for everyone.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'j4k5l6m7n8o9'
down_revision: Union[str, None] = 'i3j4k5l6m7n8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The schema already exists (created by agent/sql/george_log_role.sql, run
    # by hand). IF NOT EXISTS so this migration also works on a fresh database
    # where that script has not been run yet.
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    op.create_table(
        'pins',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),

        # AppUser.username. Login is passcode-only (see app/models/app_user.py),
        # so there is no email to key on. Text rather than an FK: a pin should
        # outlive an account row being reshaped, and app_user lives in another
        # schema.
        sa.Column('created_by', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),

        # Editable label. Defaults to the question when the client sends none.
        sa.Column('title', sa.Text(), nullable=False),
        # What was originally asked. Provenance, and what the tile is "about".
        sa.Column('question', sa.Text(), nullable=True),
        # Traceability into george.conversations. No FK: that row is written
        # LAST by the logging role, so it may not exist yet — the same reasoning
        # already recorded in agent/sql/george_log_role.sql.
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=True),

        # The grouping. NULL means ungrouped. A page is "a collection of pins"
        # (CLAUDE.md), so it has no independent existence and needs no table —
        # a page with no pins is not a thing. Normalised on write; a
        # case-insensitive near-duplicate is REFUSED rather than silently
        # forking "Replenishment" and "replenishment" into two pages.
        sa.Column('page', sa.Text(), nullable=True),

        # The ordered tool calls behind the answer: [{tool, arguments}, ...].
        # A list, not one call, because an answer legitimately spans several
        # (a figure plus its reconciliation). Most pins hold one.
        sa.Column('tool_calls', postgresql.JSONB(astext_type=sa.Text()), nullable=False),

        # Last-run state. This is what lets a failing tile say WHEN IT LAST
        # WORKED instead of only that it is broken — the difference between
        # "stale" and "dead" on the tile.
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_ok_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_status', sa.Text(), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('ok', 'refused', 'unrunnable', 'failed')",
            name='ck_pins_last_status',
        ),
        # A pin with no tool calls could never render anything.
        sa.CheckConstraint("jsonb_array_length(tool_calls) > 0",
                           name='ck_pins_tool_calls_not_empty'),
        # Normalisation happens in the service; this stops an un-normalised
        # value reaching the table by another route.
        sa.CheckConstraint("page IS NULL OR page = btrim(page)",
                           name='ck_pins_page_trimmed'),
        sa.CheckConstraint("page IS NULL OR length(page) > 0",
                           name='ck_pins_page_not_blank'),
        schema='george',
    )

    # Listing a user's pins, newest first — the GET /pins query.
    op.create_index('ix_pins_owner_created', 'pins',
                    ['created_by', sa.text('created_at DESC')], schema='george')
    # A page's tiles, and the DISTINCT behind GET /pins/pages.
    op.create_index('ix_pins_owner_page', 'pins',
                    ['created_by', 'page'], schema='george')
    # Case-insensitive page lookup for the near-duplicate check on create.
    op.create_index('ix_pins_owner_page_lower', 'pins',
                    ['created_by', sa.text('lower(page)')], schema='george')


def downgrade() -> None:
    op.drop_index('ix_pins_owner_page_lower', 'pins', schema='george')
    op.drop_index('ix_pins_owner_page', 'pins', schema='george')
    op.drop_index('ix_pins_owner_created', 'pins', schema='george')
    op.drop_table('pins', schema='george')
    # The schema itself is NOT dropped. alembic never created it — conversations,
    # tool_calls and gaps were made by agent/sql/george_log_role.sql — so
    # dropping it here would destroy tables this migration knows nothing about.
