"""A standing question's run can be silent.

Revision ID: u5v6w7x8y9z0
Revises: t4u5v6w7x8y9
Create Date: 2026-09-12

THE MORNING CAN FIND NOTHING, AND THAT IS NOT A FAILURE. With the judgement
layer (tools/attention.py, metrics.yaml `attention`) a scheduled question may
read that nothing crossed its floors. That answer is recorded as `silent`:
not `ok`, because `latest_answer` opens the room on the newest `ok` and a
morning with nothing in it must not be what the room opens on; not `failed`,
because the question ran and answered. Management by exception — silence is
the normal state.

The constraint is the only thing that changes. `last_thread_id` still moves
only on `ok` (standing_questions.record_outcome), so a silent run leaves the
previous answer where it was.
"""
from alembic import op

revision = "u5v6w7x8y9z0"
down_revision = "t4u5v6w7x8y9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_standing_last_status", "standing_questions", schema="george", type_="check")
    op.create_check_constraint(
        "ck_standing_last_status",
        "standing_questions",
        "last_status IS NULL OR last_status IN ('ok', 'failed', 'refused', 'silent')",
        schema="george",
    )


def downgrade() -> None:
    op.execute("UPDATE george.standing_questions SET last_status = 'ok' WHERE last_status = 'silent'")
    op.drop_constraint("ck_standing_last_status", "standing_questions", schema="george", type_="check")
    op.create_check_constraint(
        "ck_standing_last_status",
        "standing_questions",
        "last_status IS NULL OR last_status IN ('ok', 'failed', 'refused')",
        schema="george",
    )
