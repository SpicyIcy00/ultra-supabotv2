"""bob_is_an_allowed_author

THE RENAME CHANGED A VALUE THE DATABASE VALIDATES, AND NOTHING CAUGHT IT.

Revision ID: z0a1b2c3d4e5
Revises: y9z0a1b2c3d4
Create Date: 2026-09-19 00:02:00.000000

WHAT BROKE. `044d3e7` ("George is Bob: the name and the code, not the
database") changed the author literal in two INSERT statements from 'george' to
'bob' — agent/loop.py's answer post, and river_writer's _INSERT, which every
brief, watch, approval, workflow run and pin confirmation goes through. The
models were updated to match. The CHECK constraints in the live database were
not, because they are data-level rules that no model diff surfaces:

    ck_posts_author        author = ANY (ARRAY['george', 'user'])
    ck_posts_actor         (author='user' AND author_user IS NOT NULL)
                             OR author='george'
    ck_page_events_actor   actor = ANY (ARRAY['user', 'george'])

So from the moment the rename deployed, EVERY post Bob authors was rejected by
the database. The question post survived — its author is 'user' — and the
answer post did not, which is why the owner's threads had a question, no
answer, and a conversation row holding the whole answer. He reported it as
"my most recent chat just disappears after i hard refresh which didnt happen
before", and it did not happen before because the deploy that caused it was
nineteen hours old.

The chat was the visible half. Page events would have failed the same way the
first time Bob created or edited a page.

WHY THE VALUE MOVES RATHER THAN THE CODE. The rename's rule was that the
database keeps its george NAMES — the schema, the roles, the environment
variables, the migration ids — and all of that is untouched here. `author` is
not a name, it is a value the product's own vocabulary reads: the frontend's
`PostAuthor` is already `'bob' | 'user'`, and `river.py` already defaults a
missing author to 'bob'. Leaving 175 rows saying 'george' would mean the
timeline speaks two words for one thing forever.

So the existing rows are moved to 'bob' and the constraints are rewritten to
permit exactly what the code writes. Nothing is left permitting both, because
a constraint that accepts either spelling is a constraint that has stopped
holding the vocabulary.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'z0a1b2c3d4e5'
down_revision: Union[str, None] = 'y9z0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The rows first: the constraints below refuse to be created while a row
    # violates them, which is exactly the guard that should have existed.
    op.execute("UPDATE george.posts SET author = 'bob' WHERE author = 'george'")
    op.execute("UPDATE george.page_events SET actor = 'bob' WHERE actor = 'george'")

    op.drop_constraint('ck_posts_author', 'posts', schema='george', type_='check')
    op.create_check_constraint(
        'ck_posts_author', 'posts',
        "author IN ('bob', 'user')", schema='george',
    )

    # Bob has no account, so his posts carry no author_user; a person's must.
    op.drop_constraint('ck_posts_actor', 'posts', schema='george', type_='check')
    op.create_check_constraint(
        'ck_posts_actor', 'posts',
        "(author = 'user' AND author_user IS NOT NULL) OR author = 'bob'",
        schema='george',
    )

    op.drop_constraint('ck_page_events_actor', 'page_events', schema='george',
                       type_='check')
    op.create_check_constraint(
        'ck_page_events_actor', 'page_events',
        "actor IN ('user', 'bob')", schema='george',
    )


def downgrade() -> None:
    op.execute("UPDATE george.posts SET author = 'george' WHERE author = 'bob'")
    op.execute("UPDATE george.page_events SET actor = 'george' WHERE actor = 'bob'")

    op.drop_constraint('ck_posts_author', 'posts', schema='george', type_='check')
    op.create_check_constraint(
        'ck_posts_author', 'posts',
        "author IN ('george', 'user')", schema='george',
    )

    op.drop_constraint('ck_posts_actor', 'posts', schema='george', type_='check')
    op.create_check_constraint(
        'ck_posts_actor', 'posts',
        "(author = 'user' AND author_user IS NOT NULL) OR author = 'george'",
        schema='george',
    )

    op.drop_constraint('ck_page_events_actor', 'page_events', schema='george',
                       type_='check')
    op.create_check_constraint(
        'ck_page_events_actor', 'page_events',
        "actor IN ('user', 'george')", schema='george',
    )
