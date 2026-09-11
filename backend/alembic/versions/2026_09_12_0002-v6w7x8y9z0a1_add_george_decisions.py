"""add_george_decisions

What people did with what George raised.

WHY THIS TABLE EXISTS. The agenda (tools/attention.py) ranks what deserves
attention by size against each source's own floor, and that is all it could
rank by: it had no idea what happened to yesterday's rows. A shop raised every
morning and set aside every morning ranked first every morning, and George
could never say "raised Tuesday, left". A colleague learns from what you do
with what they bring you; until this table he could not.

WHAT A DECISION IS. One recorded GESTURE on one attention row:

    george.decisions   id, what, source, subject, outcome,
                       raised_at, decided_at, decided_by, thread_id

  `what` is the row's identity as tools/attention.py writes it — source,
  subject and (for a shelf) the shop — so a gesture on Tuesday finds the
  same thing on Thursday whatever its figures are that day.

  `outcome` is a closed set (metrics.yaml attention.learning.outcomes):
  kept, dismissed, opened, asked, left. Each is something a person DID on
  the board — keep, set aside, open, ask why, put the morning away — never
  something inferred from what they did not do. Nothing is written for a
  row nobody touched.

  `raised_at` is when the row was raised (the read's own timestamp);
  `decided_at` is when the gesture happened. The distance between them is
  how long a thing waited.

NOTHING IS EVER UPDATED. A change of mind is another row: kept on Tuesday and
set aside on Thursday are both true and both count. The write role may
INSERT and nothing else, exactly as for beliefs.

DECISIONS ARE SHARED, like beliefs and unlike pins. The agenda is about the
business, and what the business's people did with it is one record;
`decided_by` is provenance and no query filters by it.

THE READ BACK IS INJECTED. george_ro cannot see this schema, so
get_attention receives the recent rows through a reader the web process (or
the standing runner) binds — a keyword-only argument the model's schema
never shows (agent/loop.py INJECTED_READS).

Revision ID: v6w7x8y9z0a1
Revises: u5v6w7x8y9z0
Create Date: 2026-09-12
"""
from alembic import op
import sqlalchemy as sa

revision = "v6w7x8y9z0a1"
down_revision = "u5v6w7x8y9z0"
branch_labels = None
depends_on = None

OUTCOMES = ("kept", "dismissed", "opened", "asked", "left")


def upgrade() -> None:
    op.create_table(
        "decisions",
        sa.Column("id", sa.Text(), primary_key=True),
        # The attention row's identity, as tools/attention.py writes it.
        sa.Column("what", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False),
        sa.Column("raised_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # Provenance, NOT scope. Nothing filters by this.
        sa.Column("decided_by", sa.Text(), nullable=False),
        sa.Column("thread_id", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "outcome IN ('kept', 'dismissed', 'opened', 'asked', 'left')",
            name="ck_decisions_outcome",
        ),
        sa.CheckConstraint("length(btrim(what)) > 0", name="ck_decisions_what_not_blank"),
        schema="george",
    )
    # The one query: what happened to this thing lately.
    op.create_index(
        "ix_decisions_what_recent", "decisions", ["what", sa.text("decided_at DESC")],
        schema="george",
    )
    op.create_index("ix_decisions_decided_at", "decisions", ["decided_at"], schema="george")

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'george_log') THEN
                GRANT USAGE ON SCHEMA george TO george_log;
                GRANT INSERT ON george.decisions TO george_log;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index("ix_decisions_decided_at", table_name="decisions", schema="george")
    op.drop_index("ix_decisions_what_recent", table_name="decisions", schema="george")
    op.drop_table("decisions", schema="george")
