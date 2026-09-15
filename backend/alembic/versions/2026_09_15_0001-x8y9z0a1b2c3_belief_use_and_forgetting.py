"""belief_use_and_forgetting

What George was TOLD, how often a view has been carried, and how one is dropped.

THREE THINGS P2.f NEEDS THAT THE TABLE COULD NOT HOLD.

  A VIEW A PERSON TAUGHT HIM. `george.beliefs` required evidence — the calls a
  view rests on — because an ungrounded view that persists is worse than one
  that does not. A correction has no calls behind it: "we means the shops" is
  not a reading of anything, it is what the question means here, and the owner
  is a better authority on that than any read. So the grounding rule is not
  relaxed, it gains a SECOND ground: `told`, their own words. The check
  constraint below is the rule — exactly one ground per row, evidence or told,
  never both and never neither.

  HOW OFTEN IT HAS BEEN APPLIED. `applied_count` and `last_applied_at` move
  when a view is attached to a question George answers, and that is the only
  thing they mean. They do NOT say a view changed an answer — nothing can
  observe that — and the read that returns them says so in its own note. A
  view is attached while it is among the newest `MAX_IN_PROMPT`, so a register
  of forty leaves the oldest ones uncounted, which is the honest reading of
  "carried into a question".

  FORGETTING, WITHOUT DELETING. The room draws every view with a Forget on it,
  and Forget is a person's gesture — not a write George makes. It stamps
  `forgotten_at` and who did it; the row stays, because the original migration
  is right that a belief which can vanish takes the reason it changed with it.
  A forgotten view is simply not current: it leaves the prompt, it leaves
  `view_memory`, and it is still in the table for anyone asking what George
  used to think.

FORGETTING IS NOT SUPERSEDING, and the two columns stay apart. Superseding
says "I was wrong, here is what I think now" and carries a successor and a
reason; forgetting says "stop holding this at all" and has neither. Collapsing
them would have made every Forget look like a revision with a missing half.
"""

from alembic import op
import sqlalchemy as sa

revision = "x8y9z0a1b2c3"
down_revision = "w7x8y9z0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # What the person said, when this view is one they taught rather than one
    # he read. NULL on every view that rests on calls.
    op.add_column("beliefs", sa.Column("told", sa.Text(), nullable=True),
                  schema="george")
    # How many questions this view has been attached to, and when it last was.
    op.add_column("beliefs", sa.Column("applied_count", sa.Integer(), nullable=False,
                                       server_default=sa.text("0")), schema="george")
    op.add_column("beliefs", sa.Column("last_applied_at", sa.DateTime(timezone=True),
                                       nullable=True), schema="george")
    # Dropped by a person. The row stays; it is no longer current.
    op.add_column("beliefs", sa.Column("forgotten_at", sa.DateTime(timezone=True),
                                       nullable=True), schema="george")
    op.add_column("beliefs", sa.Column("forgotten_by", sa.Text(), nullable=True),
                  schema="george")

    # EXACTLY ONE GROUND PER VIEW. agent/beliefs.py refuses the same thing
    # before anything reaches here; this is the version that holds when the
    # validator is not the only writer.
    #
    # NOT VALID, DELIBERATELY. A plain CHECK scans every existing row at
    # migration time, and a single legacy belief that failed it would take
    # the whole deploy down — the app refuses to serve against a schema that
    # did not reach head, which is the behaviour that makes a bad migration a
    # 502 rather than a silent 500. The rule is enforced on every write from
    # here; rows that predate it are the validator's word, which is what they
    # always were.
    op.execute("""
        ALTER TABLE george.beliefs
        ADD CONSTRAINT ck_beliefs_rests_on_exactly_one_ground CHECK (
            (jsonb_array_length(evidence) > 0)
            <> (told IS NOT NULL AND length(btrim(told)) > 0)
        ) NOT VALID
    """)
    # A row that is forgotten says who did it: a gesture with no hand behind it
    # is indistinguishable from a bug that cleared the table.
    op.create_check_constraint(
        "ck_beliefs_forgetting_has_a_hand",
        "beliefs",
        "forgotten_at IS NULL OR "
        "(forgotten_by IS NOT NULL AND length(btrim(forgotten_by)) > 0)",
        schema="george",
    )

    # The every-turn query is now "current AND not forgotten", so the partial
    # index has to be too, or it stops covering the read it exists for.
    op.drop_index("ix_beliefs_current", table_name="beliefs", schema="george")
    op.create_index(
        "ix_beliefs_current",
        "beliefs",
        ["subject_kind", "subject"],
        unique=False,
        schema="george",
        postgresql_where=sa.text("superseded_by IS NULL AND forgotten_at IS NULL"),
    )

    # The write role gains exactly the two new powers and no third: it may
    # count an application and it may forget. It still may not DELETE.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'george_log') THEN
                GRANT UPDATE (superseded_by, applied_count, last_applied_at,
                              forgotten_at, forgotten_by)
                    ON george.beliefs TO george_log;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.drop_index("ix_beliefs_current", table_name="beliefs", schema="george")
    op.create_index(
        "ix_beliefs_current",
        "beliefs",
        ["subject_kind", "subject"],
        unique=False,
        schema="george",
        postgresql_where=sa.text("superseded_by IS NULL"),
    )
    op.drop_constraint("ck_beliefs_forgetting_has_a_hand", "beliefs",
                       schema="george", type_="check")
    op.drop_constraint("ck_beliefs_rests_on_exactly_one_ground", "beliefs",
                       schema="george", type_="check")
    for column in ("forgotten_by", "forgotten_at", "last_applied_at",
                   "applied_count", "told"):
        op.drop_column("beliefs", column, schema="george")
