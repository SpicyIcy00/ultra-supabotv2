"""add_george_standing_questions

A question George is asked on a schedule, whose answer waits for you.

WHY THIS EXISTS, AND WHY IT IS NOT A "BRIEF" TABLE. The owner asked for a
morning briefing he could steer by talking — "show more of Rockwell", "make it
9am instead of 8". The first pass at that built the briefing: a Python composer
that read the tables, picked the shops, wrote the sentence and handed George a
finished object. He corrected it in one line — *"why do we need to build the
brief? we're supposed to make George able to make those briefs on its own"* —
and he was right. A briefing somebody else assembled is a report. A briefing
George assembles is George.

So the mechanism is not a brief. It is a QUESTION, asked on a schedule, answered
by the ordinary loop with the ordinary tools, composed onto the ordinary board.
The morning briefing is simply the standing question whose text is "how are we
doing?". Anything else can be one too — "what did we sell yesterday", "is
anything out of stock at Rockwell" — and none of it needs new code, because
none of it is a feature.

THE SEVENTH WORD, AND WHY IT HAD TO BE ONE (CLAUDE.md's vocabulary warns that
a new word is normally a sign the concept is wrong). Nothing that exists can
say this:

    a Pin re-runs a call when you look at it — no model, no judgment
    a Workflow replays fixed steps on a schedule — no model, by design
    a Watch checks a condition and stays SILENT unless it fires

A standing question always speaks, and what it says is not decided in advance.
It is the only one of the four where the model runs unattended, and that is the
whole point: George decides each morning what is worth putting on the board.

WHAT MAY BE STORED HERE, AND WHAT MAY NOT. `question` and `instructions` are
TEXT the owner said, and `hour`/`minute`/`days_of_week` are WHEN. There is no
numeric column of any other kind, and that is a constraint rather than an
omission: "alert me when Rockwell drops 10% instead of 30%" has physically
nowhere to be written here, so it gets refused and told which comparison
exists. Every threshold that enters a calculation stays in metrics.yaml, where
it was measured. A schedule is scope; a business threshold is not.

WHY THERE IS NO PROMOTION GATE (architecture rule 7). A workflow version is
gated because it computes: its steps are fixed, a backtest against a closed
window proves what it WOULD have said, and an administrator approves that.
A question has no steps to backtest — the answer is whatever George decides
that morning — so a gate here would be a ceremony with nothing behind it.
What stands in its place is narrower capability: the scheduled turn is given
the READ tools, `compose`, and his own memory, and NOTHING structural. It
cannot pin, cannot build a page, cannot save a workflow, cannot create or
change a schedule — including this one. So an unattended turn can think,
answer and remember, and it cannot change the shape of the system while
nobody is watching. See app/services/standing_runner.py, where that list is
the code rather than a comment.

THE CLAIM COLUMNS ARE THE WORKFLOW SCHEDULER'S, ON PURPOSE. `last_slot`,
`claimed_at` and `claimed_by` have the same meaning and the same conditional
UPDATE, now shared from app/services/slots.py rather than copied. A slot is
claimed BEFORE the run, so a failure is reported rather than quietly
re-delivered an hour later wearing the 06:00 timestamp.

ONE ROW PER OWNER PER QUESTION IS NOT ENFORCED, deliberately: asking the same
question at 06:00 and again at 18:00 is a reasonable thing to want. What is
enforced is a bound on how many an owner may have, in the service, so a model
that misunderstands cannot fill the table.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "s3t4u5v6w7x8"
down_revision = "r2s3t4u5v6w7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    op.create_table(
        "standing_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        # AppUser.username. A standing question is one person's — it is asked
        # in their name and its answer is a private post they own — so every
        # statement scopes by it, RLS off, as for pins and pages.
        sa.Column("owner", sa.Text(), nullable=False),
        # What George is asked, in the owner's own words. Stored as the
        # question and asked verbatim: a question rewritten on the way in is a
        # different question, and nobody would know which one ran.
        sa.Column("question", sa.Text(), nullable=False),
        # How the owner wants it answered, as a list of plain sentences —
        # "show more of Rockwell", "skip the vending numbers". These are
        # INSTRUCTIONS ABOUT EMPHASIS, not definitions: they steer what George
        # looks at and how much of it he shows, and they can never introduce a
        # figure, because they are text handed to a model that may only state
        # numbers a tool returned.
        sa.Column("instructions", postgresql.JSONB(astext_type=sa.Text()),
                  nullable=False, server_default=sa.text("'[]'::jsonb")),
        # WHEN, in Asia/Manila like every other schedule in this system.
        # `kind` matches george.workflow_schedules so slots.py needs one
        # definition of a slot rather than two.
        sa.Column("kind", sa.Text(), nullable=False, server_default="daily"),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False, server_default="0"),
        # Monday=0 … Sunday=6, for a weekly question. NULL for a daily one.
        sa.Column("days_of_week", postgresql.ARRAY(sa.Integer()), nullable=True),
        # Off by default is the deliberate half: a question that starts firing
        # the moment it is created would mean George could give himself a
        # schedule mid-sentence. The owner switches it on.
        sa.Column("enabled", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        # The claim. Identical in meaning to workflow_schedules'.
        sa.Column("last_slot", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_by", sa.Text(), nullable=True),
        # What happened last time. `last_thread_id` is how the room opens on
        # the newest answer without searching the river for it.
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_thread_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("question = btrim(question) "
                           "AND length(question) BETWEEN 3 AND 500",
                           name="ck_standing_question_shape"),
        sa.CheckConstraint("kind IN ('daily', 'weekly')",
                           name="ck_standing_kind"),
        sa.CheckConstraint("hour BETWEEN 0 AND 23", name="ck_standing_hour"),
        sa.CheckConstraint("minute BETWEEN 0 AND 59", name="ck_standing_minute"),
        # A weekly question with no weekdays can never fire, and a daily one
        # with weekdays is two answers disagreeing about when it runs.
        sa.CheckConstraint(
            "(kind = 'daily' AND days_of_week IS NULL) OR "
            "(kind = 'weekly' AND days_of_week IS NOT NULL "
            " AND array_length(days_of_week, 1) BETWEEN 1 AND 7)",
            name="ck_standing_days_match_kind",
        ),
        sa.CheckConstraint("jsonb_typeof(instructions) = 'array' "
                           "AND jsonb_array_length(instructions) <= 8",
                           name="ck_standing_instructions_shape"),
        sa.CheckConstraint(
            "last_status IS NULL OR last_status IN ('ok', 'failed', 'refused')",
            name="ck_standing_last_status",
        ),
        schema="george",
    )

    # The tick's only query: enabled questions, oldest slot first. Partial,
    # because a disabled question is not a candidate and the tick runs every
    # minute forever.
    op.create_index(
        "ix_standing_due", "standing_questions",
        ["last_slot"], schema="george",
        postgresql_where=sa.text("enabled"),
    )
    op.create_index("ix_standing_owner", "standing_questions",
                    ["owner", sa.text("created_at DESC")], schema="george")


def downgrade() -> None:
    op.drop_index("ix_standing_owner", table_name="standing_questions", schema="george")
    op.drop_index("ix_standing_due", table_name="standing_questions", schema="george")
    op.drop_table("standing_questions", schema="george")
