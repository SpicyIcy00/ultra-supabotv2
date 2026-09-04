"""add_george_posts_owner

Every answer post was invisible to everyone, and the cause was one word
doing two jobs.

WHAT WENT WRONG
---------------
n8o9p0q1r2s3 filtered the river with

    visibility = 'org' OR author_user = :me

and set `author_user` to who WROTE a post. George writes the answers, and
George has no account, so a private answer carried author_user = NULL. It
therefore matched neither branch: not org, and not anybody's. Measured on the
migrated database before this fix: 125 answer posts, 0 visible to the person
who asked the question. A thread rendered as questions with no replies.

The mistake was conflating two different facts. `author_user` is WHO WROTE IT —
which side of the thread a post is drawn on, and whose name appears. `owner_user`
is WHOSE IT IS — who may see it while it is private, and who may share it. For a
question those are the same person; for the answer to that question they are
not, and the whole bug lives in that gap.

WHAT THIS DOES
--------------
Adds `owner_user`, backfills it from the conversation the post came from, and
adds a CHECK that a private post must have one. The constraint is the point: it
makes a post that nobody can see impossible to write, rather than something to
remember. `author_user` goes back to meaning only what its name says and is
left exactly as it is.

The read filter becomes `visibility = 'org' OR owner_user = :me` in
routes/george.py, and agent/loop.py sets owner_user on both posts of a turn.

WRITTEN TO AVOID THE TWO BUGS THAT TOOK PRODUCTION DOWN AN HOUR AGO
-------------------------------------------------------------------
n8o9p0q1r2s3 shipped with a comment containing `{kind, message, source}` inside
an f-string, which Python read as a set literal, and with a literal ':question'
in SQL, which SQLAlchemy read as a bind parameter. Both failed at execution
time against a dry run that had only exercised the query. So: no f-strings in
this file at all, and no literal colons in any statement.

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-09-05 02:10:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'p0q1r2s3t4u5'
down_revision: Union[str, None] = 'o9p0q1r2s3t4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE george.posts ADD COLUMN IF NOT EXISTS owner_user text")

    # Backfill from the turn the post came from. COALESCE for the same reason
    # the original backfill used it: ck_posts_actor already refuses a user post
    # with no user, and a post whose conversation had none is 'unknown' rather
    # than rejected.
    op.execute("""
        UPDATE george.posts p
           SET owner_user = COALESCE(c.user_id, 'unknown')
          FROM george.conversations c
         WHERE p.conversation_id = c.id
           AND p.owner_user IS NULL
    """)

    # A private post with no owner is invisible to every reader, which is the
    # bug this migration exists to fix. Anything left over is adopted by its
    # author so that no row is unreachable; for George's own posts, which have
    # no author, the only safe reading is that it was never private.
    op.execute("""
        UPDATE george.posts
           SET owner_user = author_user
         WHERE owner_user IS NULL
           AND author_user IS NOT NULL
    """)
    op.execute("""
        UPDATE george.posts
           SET visibility = 'org'
         WHERE owner_user IS NULL
           AND visibility = 'private'
    """)

    # The guarantee, enforced rather than remembered: a private post always has
    # somebody who can see it.
    op.execute("""
        ALTER TABLE george.posts
          ADD CONSTRAINT ck_posts_private_has_owner
          CHECK (visibility = 'org' OR owner_user IS NOT NULL)
    """)

    # The private half of the read filter.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_posts_owner_created
        ON george.posts (owner_user, created_at DESC)
        WHERE hidden_at IS NULL
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS george.ix_posts_owner_created")
    op.execute("ALTER TABLE george.posts DROP CONSTRAINT IF EXISTS ck_posts_private_has_owner")
    op.execute("ALTER TABLE george.posts DROP COLUMN IF EXISTS owner_user")
