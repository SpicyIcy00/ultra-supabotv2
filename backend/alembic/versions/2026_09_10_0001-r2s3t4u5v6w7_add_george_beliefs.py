"""add_george_beliefs

George's understanding, kept between conversations.

WHY THIS TABLE EXISTS. Until it, George forgot the business every time a
conversation ended. He could answer a question about Rockwell and, an hour
later, have no idea he had ever looked — so he produced answers rather than an
understanding, and could never say "this is the third week". Everything in the
UNDERSTAND → BUILD → RUN plan past this point needs it: a George with no memory
cannot notice a change, cannot hold a system's state, and cannot tell you what
he did while you were away.

WHAT A BELIEF IS. One view, about one thing, with the reads behind it:

    george.beliefs   id, subject_kind, subject, stance, claim,
                     evidence (the CALLS, re-runnable), confirmed_at,
                     held_since, supersedes / superseded_by, why,
                     created_by, conversation_id, created_at

FOUR PROPERTIES OF THE SHAPE, EACH ANSWERING A WAY MEMORY GOES WRONG.

  EVIDENCE IS CALLS, NOT ROWS. `evidence` stores what was run, exactly as
  george.pins does, so a belief can be re-checked rather than merely re-read. A
  belief whose evidence cannot be re-run is an assertion with a date on it.

  A CLAIM CARRIES NO FIGURE, enforced in agent/beliefs.py rather than here
  because a CHECK constraint cannot read prose. "Rockwell is down 9.4%" is false
  a week later and tells nobody; "Rockwell is losing customers rather than
  smaller baskets" degrades gracefully. The numbers live in the evidence.

  NOTHING IS EVER UPDATED IN PLACE. Changing a view INSERTS a new row that
  names the one it supersedes and says why; the old row keeps its text and gains
  `superseded_by`. A view that can be silently replaced cannot be wrong, and a
  view that cannot be wrong is not a view. The revision history is the table.

  CONFIRMED_AT IS SEPARATE FROM CREATED_AT. When a later read agrees with a
  standing belief, `confirmed_at` moves and nothing else does — that is how
  "held for eleven days, confirmed this morning" becomes sayable, and how a
  stale view becomes visible instead of quietly authoritative.

BELIEFS ARE ABOUT THE BUSINESS, SO THEY ARE SHARED. Unlike a pin or a page,
which belong to one person, a belief is what George thinks about Rockwell —
there is one Rockwell. `created_by` records who was in the conversation when it
formed, for provenance, and is NOT a scope: no query filters by it. If beliefs
ever need to be private, that is a new column and a deliberate decision.

Ownership scoping stays in the query rather than in RLS, for the reason
j4k5l6m7n8o9 gives, on the same schema and the same application role.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "r2s3t4u5v6w7"
down_revision = "q1r2s3t4u5v6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    op.create_table(
        "beliefs",
        sa.Column("id", sa.Text(), primary_key=True),
        # What the view is ABOUT. `subject` is the display name a person uses —
        # "Rockwell", "AJI BARN", "Seikyo SEK001" — because a belief has to be
        # readable by a human reviewing what George thinks. The kind says which
        # vocabulary that name comes from (metrics.yaml judgment.subject_kinds).
        sa.Column("subject_kind", sa.Text(), nullable=False),
        sa.Column("subject", sa.Text(), nullable=False),
        # One of metrics.yaml judgment.stances. Not an enum type: the closed set
        # lives in the definitions, and a database enum would be a second place
        # to change it — which is how the two drift.
        sa.Column("stance", sa.Text(), nullable=False),
        sa.Column("claim", sa.Text(), nullable=False),
        # The calls behind it, [{"tool": ..., "arguments": {...}}], validated
        # against the executed set before it ever reaches here.
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        # When the evidence was last read and still agreed. Moves on
        # re-confirmation; nothing else does.
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # When this view was FIRST held — carried forward across revisions, so
        # "held since Friday" survives a change of wording.
        sa.Column("held_since", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # The revision chain. Both directions, so neither a lookup of "what did
        # this replace" nor "what replaced this" needs a scan.
        sa.Column("supersedes", sa.Text(), nullable=True),
        sa.Column("superseded_by", sa.Text(), nullable=True),
        # Why the view changed. Required when superseding, enforced below.
        sa.Column("why", sa.Text(), nullable=True),
        # Provenance, NOT scope. Nothing filters by this.
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("conversation_id", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.CheckConstraint(
            "supersedes IS NULL OR (why IS NOT NULL AND length(btrim(why)) > 0)",
            name="ck_beliefs_revision_has_a_reason",
        ),
        sa.CheckConstraint(
            "length(btrim(claim)) > 0",
            name="ck_beliefs_claim_not_blank",
        ),
        schema="george",
    )

    # The one query that runs on every turn: what does George currently believe?
    # A current belief is one nothing has superseded.
    op.create_index(
        "ix_beliefs_current",
        "beliefs",
        ["subject_kind", "subject"],
        unique=False,
        schema="george",
        postgresql_where=sa.text("superseded_by IS NULL"),
    )
    op.create_index(
        "ix_beliefs_confirmed_at", "beliefs", ["confirmed_at"], schema="george",
    )

    # The write role may INSERT and may mark a row superseded. It may not delete
    # one: the revision history is the point, and a belief that can vanish takes
    # the reason it changed with it.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'george_log') THEN
                GRANT USAGE ON SCHEMA george TO george_log;
                GRANT INSERT ON george.beliefs TO george_log;
                GRANT UPDATE (superseded_by) ON george.beliefs TO george_log;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index("ix_beliefs_confirmed_at", table_name="beliefs", schema="george")
    op.drop_index("ix_beliefs_current", table_name="beliefs", schema="george")
    op.drop_table("beliefs", schema="george")
