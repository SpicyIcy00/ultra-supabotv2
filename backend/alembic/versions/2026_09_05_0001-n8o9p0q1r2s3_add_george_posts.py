"""add_george_posts

The river: one append-only timeline of everything George does and says, and
everything anyone says to him.

A NEW TABLE, AND george.conversations IS NOT TOUCHED
----------------------------------------------------
That table is INSERT-only by george_log, it is ALSO the gap log, and pins point
at it for provenance. Rewriting it into posts would put all three at risk for
no gain, and would break the one property that makes the log trustworthy — that
nothing can go back and edit what George was asked. Posts are written ALONGSIDE
it, and the backfill below is a projection of what is already there.

So /george/chats keeps working through the whole transition and can be retired
after it rather than during.

WHO WRITES WHAT, AND WITH WHICH ROLE
------------------------------------
    question, answer      the agent loop, as it logs today   -> george_log
    brief                 POST /brief/send                   -> application
    workflow_run          workflow_scheduler                 -> application
    pin_confirmation      pin_writer, already injected       -> application
    notice, system        whichever service raised it        -> its own role

george_log gains INSERT on one more table in the schema it already writes to.
It still cannot SELECT anything, so it cannot read a post back — the same
asymmetry conversations already relies on. Reading the river is the application
role, exactly as /george/chats reads conversations today.

APPROVALS ARE DERIVED AND ARE NOT WRITTEN HERE. `approval` is a valid kind for
a post that ANNOUNCES one, but the queue itself stays computed by
pending_promotion(): a second stored copy could disagree with it, and a
promotion would then need a compensating write to keep them in step.

VISIBILITY IS PER POST (CLAUDE.md, "The river")
-----------------------------------------------
George's own posts are 'org'. A person's question and its answer are 'private'
until shared. The read query is `visibility = 'org' OR author_user = :me`, so
opening the default later is one line and does not need a migration.

THREADS EMERGE, AND THEY ARE NOT CREATED. thread_id groups posts into one
exchange; for a post derived from a turn it is the CONVERSATION's thread_id, so
a six-turn chat becomes twelve posts sharing one thread without anything having
opened it. parent_id is the reply target — an answer replies to its question,
and a question has none. Nothing creates an empty thread because there is
nothing to create.

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-09-05 00:40:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'n8o9p0q1r2s3'
down_revision: Union[str, None] = 'm7n8o9p0q1r2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The eight kinds a post can be. Mirrored by POST_KINDS in
# app/models/george_post.py and by the CHECK constraint below, so a kind that
# exists in one place and not the others fails loudly rather than rendering as
# a blank card.
KINDS = (
    "brief", "notice", "answer", "question",
    "approval", "workflow_run", "pin_confirmation", "system",
)


def upgrade() -> None:
    kinds = ", ".join(f"'{k}'" for k in KINDS)
    op.execute(f"""
        CREATE TABLE IF NOT EXISTS george.posts (
            id              uuid PRIMARY KEY,
            -- The exchange this post belongs to. For a post derived from a
            -- turn it is the conversation's thread_id.
            thread_id       uuid        NOT NULL,
            -- The post being replied to; NULL for a root.
            parent_id       uuid,
            kind            text        NOT NULL,
            -- 'george' or 'user'. Not a user id: it decides which side of the
            -- thread a post is drawn on, and George has no account.
            author          text        NOT NULL,
            -- WHO, when a person wrote it — or the schedule's created_by for an
            -- unattended run, which is an identity captured from a token when
            -- the schedule was made and never from anything a model said.
            author_user     text,
            visibility      text        NOT NULL DEFAULT 'private',
            -- The standalone prose. A voice layer speaks exactly this, so it
            -- must never depend on the payload to make sense.
            body            text,
            -- Kind-specific structure: rows, chips, buttons, ids.
            payload         jsonb,
            -- meta: source_table, filters_applied, snapshot_timestamp. UI
            -- rules 3 and 6 are satisfied from here on every George post.
            receipts        jsonb,
            -- Notice objects, surfaced above the body — UI rule 4.
            notices         jsonb,
            -- Back-reference into the existing log, so a post can always be
            -- traced to the turn that produced it.
            conversation_id uuid,
            created_at      timestamptz NOT NULL DEFAULT now(),
            hidden_at       timestamptz,
            CONSTRAINT ck_posts_kind CHECK (kind IN ({kinds})),
            CONSTRAINT ck_posts_author CHECK (author IN ('george', 'user')),
            CONSTRAINT ck_posts_visibility CHECK (visibility IN ('org', 'private')),
            -- A person's post always has a person on it; George's never does.
            CONSTRAINT ck_posts_actor CHECK (
                (author = 'user' AND author_user IS NOT NULL)
                OR author = 'george'
            )
        )
    """)

    # The river read: newest first, filtered by visibility. The partial index
    # excludes hidden posts because every read excludes them.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_river
        ON george.posts (created_at DESC)
        WHERE hidden_at IS NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_visibility_created
        ON george.posts (visibility, created_at DESC)
        WHERE hidden_at IS NULL
    """)
    # One thread, in order.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_thread
        ON george.posts (thread_id, created_at)
    """)
    # "My posts", for the private half of the visibility filter.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_author_created
        ON george.posts (author_user, created_at DESC)
        WHERE hidden_at IS NULL
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_conversation
        ON george.posts (conversation_id)
    """)

    # ---- grants and RLS, matching conversations exactly --------------------
    # george_log writes; it still cannot read. The role may not exist in a
    # local database, so this is guarded rather than assumed.
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'george_log') THEN
                GRANT USAGE ON SCHEMA george TO george_log;
                GRANT INSERT ON george.posts TO george_log;
            END IF;
        END $$;
    """)

    op.execute("ALTER TABLE george.posts ENABLE ROW LEVEL SECURITY")
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'george_log')
               AND NOT EXISTS (
                   SELECT 1 FROM pg_policies
                   WHERE schemaname = 'george' AND tablename = 'posts'
                     AND policyname = 'george_log_write'
               ) THEN
                CREATE POLICY george_log_write ON george.posts
                    FOR INSERT TO george_log WITH CHECK (true);
            END IF;
        END $$;
    """)
    # The application role reads and writes. A superuser bypasses RLS and this
    # is a no-op for it; a tightened role would get ZERO ROWS WITH NO ERROR
    # without it, which has bitten this database twice (see l6m7n8o9p0q1).
    for name, verb in (("george_app_read", "SELECT"),
                       ("george_app_write", "INSERT"),
                       ("george_app_update", "UPDATE")):
        clause = "USING (true)" if verb == "SELECT" else (
            "WITH CHECK (true)" if verb == "INSERT" else "USING (true) WITH CHECK (true)"
        )
        op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies
                    WHERE schemaname = 'george' AND tablename = 'posts'
                      AND policyname = '{name}'
                ) THEN
                    EXECUTE format(
                        'CREATE POLICY {name} ON george.posts FOR {verb} TO %I {clause}',
                        current_user
                    );
                END IF;
            END $$;
        """)

    # ---- backfill ----------------------------------------------------------
    # Every logged turn becomes two posts sharing the conversation's existing
    # thread_id: the question, then the answer replying to it. Nothing is
    # invented — notices, receipts and hidden_at are carried across as they
    # stand, and a turn that never produced an answer produces no answer post,
    # exactly as chat_history already renders it.
    #
    # chr(58) is ':' — written that way because SQLAlchemy parses a literal
    # ':question' in the SQL as a BIND PARAMETER and refuses to run without a
    # value for it. The bytes hashed are identical, so this still matches
    # ConversationLog.post_ids() exactly.
    #
    # Deterministic ids: md5 of the conversation id plus the role, cast to
    # uuid. Not uuid_generate_v5, which needs the uuid-ossp extension this
    # database does not have — md5() is core and the cast is exact (32 hex
    # digits). Re-running the migration therefore cannot duplicate the river.
    op.execute("""
        INSERT INTO george.posts (
            id, thread_id, parent_id, kind, author, author_user, visibility,
            body, payload, receipts, notices, conversation_id, created_at, hidden_at
        )
        SELECT
            (md5(c.id::text || chr(58) || 'question'))::uuid,
            COALESCE(c.thread_id, c.id),
            NULL,
            'question',
            'user',
            COALESCE(c.user_id, 'unknown'),
            'private',
            c.question,
            NULL, NULL, NULL,
            c.id,
            c.asked_at,
            c.hidden_at
        FROM george.conversations c
        WHERE NOT EXISTS (
            SELECT 1 FROM george.posts p WHERE p.conversation_id = c.id
        )
    """)
    op.execute("""
        INSERT INTO george.posts (
            id, thread_id, parent_id, kind, author, author_user, visibility,
            body, payload, receipts, notices, conversation_id, created_at, hidden_at
        )
        SELECT
            (md5(c.id::text || chr(58) || 'answer'))::uuid,
            COALESCE(c.thread_id, c.id),
            (md5(c.id::text || chr(58) || 'question'))::uuid,
            'answer',
            'george',
            NULL,
            'private',
            c.final_answer,
            NULL,
            c.receipts,
            c.notices,
            c.id,
            COALESCE(c.logged_at, c.asked_at),
            c.hidden_at
        FROM george.conversations c
        WHERE c.final_answer IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM george.posts p
            WHERE p.conversation_id = c.id AND p.kind = 'answer'
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS george.posts")
