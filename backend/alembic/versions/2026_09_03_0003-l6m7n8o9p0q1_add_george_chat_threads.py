"""add_george_chat_threads

Chats are sessions, not pages. Until now george.conversations held one row per
REQUEST: every /george/ask generated a fresh uuid, the client never sent it
back, and nothing linked one turn to the next. A six-turn chat was six rows
with six unrelated ids, and the only durable thing a chat could become was a
pin — which is how conversations ended up in "Ungrouped".

TWO COLUMNS, NO NEW TABLE
-------------------------
    thread_id   the chat a turn belongs to. A chat's first turn IS the thread:
                its own id. Later turns carry the id the client was handed back
                in the `start` frame.
    receipts    the last tool meta of the answer — source table, filters,
                snapshot timestamp. It streamed to the client but was never
                logged, so a reopened figure had no timestamp (UI rule 6).

No threads table, deliberately. A chat's title is its first question, derived
at read time, and its last activity is MAX(asked_at). That keeps george_log
INSERT-only — it never has to UPDATE a thread row — and adds no write path.
Renaming a chat would need a threads table; build that when someone asks.

BACKFILL: thread_id = id. Every existing turn becomes a one-turn chat. They
were never linked, and inventing links from timestamps would be inventing
history.

READ ACCESS. The table has RLS enabled with a single INSERT policy for
george_log. The application role (DATABASE_URL, currently the superuser)
bypasses RLS; a real application role would get ZERO ROWS with no error, which
has bitten this database twice. So this migration also grants the role that
runs it a SELECT policy on conversations and tool_calls — a no-op for a
superuser, and exactly what a tightened role will need.

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-09-03 23:30:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'l6m7n8o9p0q1'
down_revision: Union[str, None] = 'k5l6m7n8o9p0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE george.conversations ADD COLUMN IF NOT EXISTS thread_id uuid")
    op.execute("ALTER TABLE george.conversations ADD COLUMN IF NOT EXISTS receipts jsonb")
    op.execute("UPDATE george.conversations SET thread_id = id WHERE thread_id IS NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_george_conversations_user_thread "
        "ON george.conversations (user_id, thread_id, asked_at)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_george_conversations_thread "
        "ON george.conversations (thread_id, asked_at)"
    )

    # A SELECT policy for whichever role is running this migration — the
    # application role. Harmless for a superuser, required for anything else.
    for table in ("conversations", "tool_calls"):
        op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies
                    WHERE schemaname = 'george' AND tablename = '{table}'
                      AND policyname = 'george_app_read'
                ) THEN
                    EXECUTE format(
                        'CREATE POLICY george_app_read ON george.{table} FOR SELECT TO %I USING (true)',
                        current_user
                    );
                END IF;
            END $$;
        """)


def downgrade() -> None:
    for table in ("conversations", "tool_calls"):
        op.execute(f"DROP POLICY IF EXISTS george_app_read ON george.{table}")
    op.execute("DROP INDEX IF EXISTS george.ix_george_conversations_thread")
    op.execute("DROP INDEX IF EXISTS george.ix_george_conversations_user_thread")
    op.execute("ALTER TABLE george.conversations DROP COLUMN IF EXISTS receipts")
    op.execute("ALTER TABLE george.conversations DROP COLUMN IF EXISTS thread_id")
