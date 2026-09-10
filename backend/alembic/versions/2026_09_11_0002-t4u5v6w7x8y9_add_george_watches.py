"""add_george_watches

A condition George checks on a schedule, which posts when it fires.

THE WORD HAS BEEN RESERVED SINCE 2026-09-05 and had no code until today.
CLAUDE.md wrote it down early precisely so it could not be built under a
different name in the meantime, and the definition there is the one this
implements: *"a condition plus a channel: George evaluates it on a schedule and
posts only when the answer changes. Silence is its normal state."*

WHAT MAKES IT DIFFERENT FROM THE THREE THINGS THAT ALREADY RUN. A pin re-runs
when you look at it. A workflow replays fixed steps and always produces a run.
A standing question is asked and always answers. All three speak every time. A
watch says nothing at all on a normal day — which is what makes the days it
speaks worth reading, and which is also why `watch_checks` records the quiet
ones. "It has been quiet for eleven days" must be a fact somebody can check,
not a hope; and a watch that has silently been broken for a fortnight looks
exactly like a watch with nothing to say, unless the checks are written down.

A WATCH HOLDS NO NUMBERS, AND THERE IS NO COLUMN FOR ONE. It names a condition
from `metrics.yaml` `watches.conditions`, each of which references a threshold
in `brief:` that was measured against a noise floor with the measurement
recorded beside it. So a watch cannot disagree with the morning brief about
what "down" means — they are reading the same definition through the same tool
— and "alert me at 10% instead of 30%" has nowhere to be written. That request
is a change to a DEFINITION and belongs where the evidence for the current
number is.

WHY THERE IS NO `name` COLUMN. A watch's identity is what it watches: the
condition, the direction and the scope. Deriving the label from those means
there is nothing to keep in step, no collision rule, and no way for a label to
say something the watch does not do.

THE BACKTEST GATE IS A CHECK CONSTRAINT, not only a service rule. Architecture
rule 7 says nothing runs unattended until it has been backtested, and here the
gate has an unusually direct payoff: replaying the last 60 closed mornings
answers "how often would this have bothered me", which is the number you want
before switching it on anyway. There is no promotion step, because unlike a
workflow version there is no authored logic to approve — the condition is one
of three and its numbers are the brief's. What a person must see is what the
rule WOULD have done, and that is exactly what `backtest` holds.

`definitions_version` travels with the backtest so a threshold change in
`brief:` invalidates it. A watch whose backtest describes a rule that no longer
exists STOPS and says so once, rather than going quiet: silence is its normal
state, so silence can never carry the news that something is wrong.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "t4u5v6w7x8y9"
down_revision = "s3t4u5v6w7x8"
branch_labels = None
depends_on = None

# The post kinds, with `watch` added. Written out in full because the CHECK is
# replaced wholesale — an ALTER cannot append to one.
KINDS = ("brief", "notice", "answer", "question", "approval", "workflow_run",
         "pin_confirmation", "system", "watch")


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    op.create_table(
        "watches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        # AppUser.username. A watch is one person's — they chose to be told —
        # though what it POSTS is org-visible, because what George initiates is
        # a company-level fact (CLAUDE.md, "The river").
        sa.Column("owner", sa.Text(), nullable=False),
        # A key of metrics.yaml watches.conditions. Not free text and not a
        # query: the closed set is the reason a watch cannot invent a rule.
        sa.Column("condition", sa.Text(), nullable=False),
        # down | up | either. Only meaningful for a condition that has a
        # direction; the others store 'either'.
        sa.Column("direction", sa.Text(), nullable=False, server_default="either"),
        # Which shops this is about, as display names. NULL means all of them —
        # distinct from an empty list, which would mean none and is refused.
        sa.Column("stores", postgresql.ARRAY(sa.Text()), nullable=True),
        # WHEN. Same vocabulary and the same slot rules as every other schedule
        # in this system (app/services/slots.py).
        sa.Column("kind", sa.Text(), nullable=False, server_default="daily"),
        sa.Column("hour", sa.Integer(), nullable=False),
        sa.Column("minute", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("days_of_week", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        # What it would have done: {window_days, from, to, days_checked,
        # days_fired, dates, subjects, definitions_version, measured_at}.
        sa.Column("backtest", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # The claim, identical in meaning to workflow_schedules' and standing
        # questions'.
        sa.Column("last_slot", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claimed_by", sa.Text(), nullable=True),
        # THE STATE IS THE POINT: the set of subjects firing at the last check,
        # with each one's direction. A check posts when this CHANGES, never
        # merely because it is non-empty — five identical alerts is how a
        # signal stops meaning anything.
        sa.Column("last_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_status", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint("direction IN ('down', 'up', 'either')",
                           name="ck_watches_direction"),
        sa.CheckConstraint("kind IN ('daily', 'weekly')", name="ck_watches_kind"),
        sa.CheckConstraint("hour BETWEEN 0 AND 23", name="ck_watches_hour"),
        sa.CheckConstraint("minute BETWEEN 0 AND 59", name="ck_watches_minute"),
        sa.CheckConstraint(
            "(kind = 'daily' AND days_of_week IS NULL) OR "
            "(kind = 'weekly' AND days_of_week IS NOT NULL "
            " AND array_length(days_of_week, 1) BETWEEN 1 AND 7)",
            name="ck_watches_days_match_kind",
        ),
        # NULL means every shop. An empty list would mean none, which is a
        # watch that can never fire — refused here rather than left to run.
        sa.CheckConstraint("stores IS NULL OR array_length(stores, 1) >= 1",
                           name="ck_watches_stores_not_empty"),
        # ARCHITECTURE RULE 7, AS A CONSTRAINT. Nothing runs unattended until
        # it has been backtested. The service refuses it too, with a message;
        # this is the half that survives a bug in the service.
        sa.CheckConstraint("NOT enabled OR backtest IS NOT NULL",
                           name="ck_watches_backtested_before_enabled"),
        sa.CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('quiet', 'fired', 'failed', 'stale_backtest')",
            name="ck_watches_last_status",
        ),
        schema="george",
    )
    op.create_index("ix_watches_due", "watches", ["last_slot"], schema="george",
                    postgresql_where=sa.text("enabled"))
    op.create_index("ix_watches_owner", "watches",
                    ["owner", sa.text("created_at DESC")], schema="george")

    # ----------------------------------------------------------- the checks
    # EVERY CHECK, FIRED OR NOT. This table is what makes silence readable.
    # Without it "quiet for eleven days" and "broken for eleven days" are the
    # same observation, and the second one is the one you need.
    op.create_table(
        "watch_checks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        # No FK: the record of a check outlives the watch, exactly as
        # page_events outlive a page. Deleting a watch must not rewrite what
        # it once told somebody.
        sa.Column("watch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # The Manila morning that was evaluated, which is not always the day
        # the check ran — a catch-up after an outage evaluates the slot it
        # claimed.
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("fired", sa.Boolean(), nullable=False,
                  server_default=sa.text("false")),
        # The whole firing set at this check, and what moved since the last
        # one: {added: [...], cleared: [...]}. Both stored, because "Rockwell
        # is back to normal" is the half people otherwise never get told.
        sa.Column("state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("changed", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # The post this produced, when it produced one.
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("definitions_version", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        schema="george",
    )
    op.create_index("ix_watch_checks_watch", "watch_checks",
                    ["watch_id", sa.text("checked_at DESC")], schema="george")

    # ------------------------------------------------- the new post kind
    op.execute("ALTER TABLE george.posts DROP CONSTRAINT IF EXISTS ck_posts_kind")
    kinds = ", ".join(f"'{k}'" for k in KINDS)
    op.execute(f"ALTER TABLE george.posts ADD CONSTRAINT "
               f"ck_posts_kind CHECK (kind IN ({kinds}))")


def downgrade() -> None:
    op.execute("DELETE FROM george.posts WHERE kind = 'watch'")
    op.execute("ALTER TABLE george.posts DROP CONSTRAINT IF EXISTS ck_posts_kind")
    kinds = ", ".join(f"'{k}'" for k in KINDS if k != "watch")
    op.execute(f"ALTER TABLE george.posts ADD CONSTRAINT "
               f"ck_posts_kind CHECK (kind IN ({kinds}))")
    op.drop_index("ix_watch_checks_watch", table_name="watch_checks", schema="george")
    op.drop_table("watch_checks", schema="george")
    op.drop_index("ix_watches_owner", table_name="watches", schema="george")
    op.drop_index("ix_watches_due", table_name="watches", schema="george")
    op.drop_table("watches", schema="george")
