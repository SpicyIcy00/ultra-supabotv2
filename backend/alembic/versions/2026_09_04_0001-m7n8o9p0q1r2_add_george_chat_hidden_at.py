"""add_george_chat_hidden_at

Deleting a chat HIDES it. george.conversations is not only the chat list — it
is the conversation log: the gap log joins to it, pins point at it for
provenance, and it is the record of every question George could not answer.
Hard-deleting a chat would remove its turns from all of that. So a deleted
chat gets hidden_at on every row of its thread: it leaves the list and 404s on
reopen, exactly as if deleted, while the rows stay for the log.

Also an UPDATE policy for the role running this migration, matching the
SELECT policy from l6m7n8o9p0q1 — a no-op for the superuser, required for a
tightened application role, and scoped to this one column's purpose by the
service, not the policy.

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-09-04 01:10:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'm7n8o9p0q1r2'
down_revision: Union[str, None] = 'l6m7n8o9p0q1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE george.conversations ADD COLUMN IF NOT EXISTS hidden_at timestamptz")
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'george' AND tablename = 'conversations'
                  AND policyname = 'george_app_update'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY george_app_update ON george.conversations FOR UPDATE TO %I USING (true) WITH CHECK (true)',
                    current_user
                );
            END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS george_app_update ON george.conversations")
    op.execute("ALTER TABLE george.conversations DROP COLUMN IF EXISTS hidden_at")
