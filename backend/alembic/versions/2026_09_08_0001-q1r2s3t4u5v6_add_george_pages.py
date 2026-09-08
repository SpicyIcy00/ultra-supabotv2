"""add_george_pages

A page becomes a row. Until this revision a page was `DISTINCT (created_by,
page)` over george.pins — a label on the pins that happened to share it — and
CLAUDE.md recorded three things that would force a table: a page-level fact not
derivable from its pins, a page shared at org level, or an empty page. Page
Workshop (2026-09-08) arrived with two of them as requirements:

  - an EMPTY page must exist — "make me a Rockwell page" before any analysis
    does, and a page a person can open and ask George to fill;
  - a page's IDENTITY must survive a rename — the thread scope, the URL, the
    reader George reads through and the writer he writes through were all keyed
    on a mutable string, so renaming a page silently orphaned every one of them.

A sentinel pin for the first and a name-cascade for the second were both
considered and both refused: each is a second source of truth for a fact the
row now carries once.

WHAT CHANGES
------------
    george.pages         id, owner, title, purpose, created_at, updated_at
                         UNIQUE (owner, title) — exact name, per person
    george.pins          + page_id  (NULL = ungrouped, which stays virtual)
                         + position (dense 0..n-1 within a real page)
                         - page     (dropped, below, after verification)
    george.page_events   append-only audit of every structural write, made by a
                         person's button or by George through the injected
                         writer — one service, one event shape

Ordinary generated ids. A migration runs once; what is needed is stable
identity AFTER it, not a derivable identity across hypothetical re-runs.

WHAT IS PRESERVED, AND VERIFIED BEFORE ANYTHING IS DROPPED
----------------------------------------------------------
Every pin keeps its calls, its question, its provenance and its run history
untouched. Its page is carried over by exact (owner, name) — exact duplicates
collapse into one page by construction; case variants stay separate pages,
which is what they already were. Positions are assigned so that every page
shows the SAME order after this revision as before it: created_at DESC, id
DESC. The assertions in `_verify` check all of that against the live rows and
RAISE on any mismatch, leaving the old column intact, because a migration that
half-moves a workspace is worse than one that stops.

Behaviour that changes on purpose, recorded here because the code cannot say
why: a NEW pin now lands at the BOTTOM of its page rather than the top. A
designed page grows downward.

Ownership scoping is still in the query, not in RLS, for exactly the reason
the pins migration (j4k5l6m7n8o9) gives. Same schema, same application role,
same note if DATABASE_URL is ever tightened.

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-09-08 00:01:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op
from sqlalchemy.dialects import postgresql

revision: str = 'q1r2s3t4u5v6'
down_revision: Union[str, None] = 'p0q1r2s3t4u5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


class MigrationVerificationFailed(RuntimeError):
    """A backfill assertion did not hold. The old column has NOT been dropped."""


def _applying() -> bool:
    """
    Whether this is a real application against a connection.

    False under `alembic upgrade --sql`. True under a normal upgrade, and
    also when the revision is applied programmatically through
    Operations.context with no EnvironmentContext at all — which is how the
    live test suite applies it inside a transaction it then rolls back.
    """
    try:
        return not context.is_offline_mode()
    except Exception:  # noqa: BLE001 - no environment context configured
        return True


def _scalar(sql: str):
    return op.get_bind().execute(sa.text(sql)).scalar()


def _verify() -> None:
    """
    Every claim the docstring makes about the backfill, checked against the
    rows. Runs BEFORE george.pins.page is dropped, so a failure leaves the
    original grouping exactly as it was.
    """
    checks = {
        # Every distinct (owner, name) became exactly one page, and no page
        # exists that no pin named.
        "pages == distinct (owner, page) among grouped pins": (
            "SELECT (SELECT count(*) FROM george.pages) = "
            "       (SELECT count(*) FROM (SELECT DISTINCT created_by, page "
            "                              FROM george.pins WHERE page IS NOT NULL) s)"
        ),
        # Every previously grouped pin points at a page ...
        "no grouped pin is left without page_id": (
            "SELECT count(*) = 0 FROM george.pins "
            " WHERE page IS NOT NULL AND page_id IS NULL"
        ),
        # ... and at the RIGHT page.
        "every page_id agrees with the old (owner, page)": (
            "SELECT count(*) = 0 FROM george.pins p JOIN george.pages g ON g.id = p.page_id "
            " WHERE p.created_by <> g.owner OR p.page <> g.title"
        ),
        # Ungrouped stays ungrouped.
        "no ungrouped pin gained a page": (
            "SELECT count(*) = 0 FROM george.pins "
            " WHERE page IS NULL AND page_id IS NOT NULL"
        ),
        # Per page, the pin count is unchanged.
        "per-page pin counts match": (
            "SELECT count(*) = 0 FROM ("
            "  SELECT g.id, "
            "         (SELECT count(*) FROM george.pins p WHERE p.page_id = g.id) AS by_id, "
            "         (SELECT count(*) FROM george.pins p "
            "           WHERE p.created_by = g.owner AND p.page = g.title) AS by_name "
            "    FROM george.pages g) c WHERE by_id <> by_name"
        ),
        # The order a page showed yesterday is the order it shows today.
        "positions reproduce created_at DESC, id DESC": (
            "SELECT count(*) = 0 FROM ("
            "  SELECT position, "
            "         row_number() OVER (PARTITION BY page_id "
            "                            ORDER BY created_at DESC, id DESC) - 1 AS expected "
            "    FROM george.pins WHERE page_id IS NOT NULL) s WHERE position <> expected"
        ),
        # Dense: 0..n-1 with no gap and no repeat.
        "positions are dense per page": (
            "SELECT count(*) = 0 FROM ("
            "  SELECT page_id, count(*) AS n, min(position) AS lo, max(position) AS hi, "
            "         count(DISTINCT position) AS d "
            "    FROM george.pins WHERE page_id IS NOT NULL GROUP BY page_id) s "
            " WHERE lo <> 0 OR hi <> n - 1 OR d <> n"
        ),
    }
    failed = [name for name, sql in checks.items() if not _scalar(sql)]
    if failed:
        raise MigrationVerificationFailed(
            "george.pages backfill did not verify; george.pins.page has NOT been "
            "dropped. Failed: " + "; ".join(failed)
        )


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS george")

    # ------------------------------------------------------------------ pages
    op.create_table(
        'pages',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        # AppUser.username, as pins.created_by. A page is one person's, because
        # its pins are; scoped in every statement, RLS off, as for pins.
        sa.Column('owner', sa.Text(), nullable=False),
        # Presentation, not identity. Trimmed, non-blank, at most 100 characters
        # — the same rule the page NAME already obeyed on a pin.
        sa.Column('title', sa.Text(), nullable=False),
        # Descriptive metadata a person wrote: what the page is for, in one
        # line. Shown under the title; read back to George labelled as the
        # user's own words and never as an instruction.
        sa.Column('purpose', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        # Bumped by every structural write, so the Pages list can order by it.
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("title = btrim(title)", name='ck_pages_title_trimmed'),
        sa.CheckConstraint("length(title) BETWEEN 1 AND 100", name='ck_pages_title_length'),
        sa.CheckConstraint("purpose IS NULL OR (purpose = btrim(purpose) "
                           "AND length(purpose) BETWEEN 1 AND 200 "
                           "AND position(chr(10) in purpose) = 0)",
                           name='ck_pages_purpose_shape'),
        # Exact name, per owner. Case variants remain distinct, as they are
        # today: the case-collision REFUSAL lives in the service and can be
        # overridden deliberately, which a lower(title) index would forbid.
        sa.UniqueConstraint('owner', 'title', name='uq_pages_owner_title'),
        schema='george',
    )
    op.create_index('ix_pages_owner_updated', 'pages',
                    ['owner', sa.text('updated_at DESC')], schema='george')

    # ------------------------------------------------------------ page events
    op.create_table(
        'page_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        # No FK: the record of a page outlives the page. A deleted page's events
        # still say what happened to it.
        sa.Column('page_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('owner', sa.Text(), nullable=False),
        # Who did it: a person at a button, or George through the injected
        # writer. Both take the same service path and leave the same record.
        sa.Column('actor', sa.Text(), nullable=False),
        sa.Column('operation', sa.Text(), nullable=False),
        sa.Column('pin_id', postgresql.UUID(as_uuid=True), nullable=True),
        # Metadata only — a title, a page id, a position — never replayed rows.
        sa.Column('before', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('after', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        # The conversation George did it in, or NULL for a manual write.
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint("actor IN ('user', 'george')", name='ck_page_events_actor'),
        schema='george',
    )
    op.create_index('ix_page_events_page_at', 'page_events',
                    ['page_id', sa.text('at DESC')], schema='george')
    op.create_index('ix_page_events_owner_at', 'page_events',
                    ['owner', sa.text('at DESC')], schema='george')

    # ------------------------------------------------------------------- pins
    op.add_column('pins',
                  sa.Column('page_id', postgresql.UUID(as_uuid=True), nullable=True),
                  schema='george')
    op.add_column('pins',
                  sa.Column('position', sa.Integer(), nullable=False,
                            server_default=sa.text('0')),
                  schema='george')
    # SET NULL rather than CASCADE: deleting a page must never delete a pin.
    # The service ungroups explicitly and renumbers; this is the backstop.
    op.create_foreign_key('fk_pins_page', 'pins', 'pages', ['page_id'], ['id'],
                          source_schema='george', referent_schema='george',
                          ondelete='SET NULL')
    op.create_check_constraint('ck_pins_position_non_negative', 'pins',
                               'position >= 0', schema='george')

    # --------------------------------------------------------------- backfill
    # One page per distinct (owner, name). created_at is the oldest pin's and
    # updated_at the newest's, so the Pages list keeps ordering the way it did.
    op.execute("""
        INSERT INTO george.pages (id, owner, title, purpose, created_at, updated_at)
        SELECT gen_random_uuid(), created_by, page, NULL,
               min(created_at), max(created_at)
          FROM george.pins
         WHERE page IS NOT NULL
         GROUP BY created_by, page
    """)
    op.execute("""
        UPDATE george.pins p
           SET page_id = g.id
          FROM george.pages g
         WHERE p.page IS NOT NULL
           AND g.owner = p.created_by
           AND g.title = p.page
    """)
    # Today's order, made explicit: newest first, id as the total tie-break —
    # the same ORDER BY the reader and the route have used all along.
    op.execute("""
        UPDATE george.pins p
           SET position = s.pos
          FROM (SELECT id,
                       row_number() OVER (PARTITION BY page_id
                                          ORDER BY created_at DESC, id DESC) - 1 AS pos
                  FROM george.pins
                 WHERE page_id IS NOT NULL) s
         WHERE p.id = s.id
    """)

    # ------------------------------------------------------------------ verify
    # Offline rendering (`alembic upgrade --sql`) has no rows to check and no
    # connection to check them with; the assertions run only when applying.
    if _applying():
        _verify()

    # ---------------------------------------------------- drop the old column
    op.drop_index('ix_pins_owner_page_lower', table_name='pins', schema='george')
    op.drop_index('ix_pins_owner_page', table_name='pins', schema='george')
    op.drop_constraint('ck_pins_page_trimmed', 'pins', schema='george', type_='check')
    op.drop_constraint('ck_pins_page_not_blank', 'pins', schema='george', type_='check')
    op.drop_column('pins', 'page', schema='george')

    op.create_index('ix_pins_page_position', 'pins',
                    ['page_id', 'position'], schema='george')
    op.create_index('ix_pins_owner_page_id', 'pins',
                    ['created_by', 'page_id'], schema='george')


def downgrade() -> None:
    # The name comes back onto the pin from the page it points at; positions
    # are simply forgotten, because the old model had none.
    op.add_column('pins', sa.Column('page', sa.Text(), nullable=True), schema='george')
    op.execute("""
        UPDATE george.pins p
           SET page = g.title
          FROM george.pages g
         WHERE p.page_id = g.id
    """)
    op.create_check_constraint('ck_pins_page_trimmed', 'pins',
                               "page IS NULL OR page = btrim(page)", schema='george')
    op.create_check_constraint('ck_pins_page_not_blank', 'pins',
                               "page IS NULL OR length(page) > 0", schema='george')
    op.create_index('ix_pins_owner_page', 'pins', ['created_by', 'page'], schema='george')
    op.create_index('ix_pins_owner_page_lower', 'pins',
                    ['created_by', sa.text('lower(page)')], schema='george')

    op.drop_index('ix_pins_owner_page_id', table_name='pins', schema='george')
    op.drop_index('ix_pins_page_position', table_name='pins', schema='george')
    op.drop_constraint('ck_pins_position_non_negative', 'pins', schema='george', type_='check')
    op.drop_constraint('fk_pins_page', 'pins', schema='george', type_='foreignkey')
    op.drop_column('pins', 'position', schema='george')
    op.drop_column('pins', 'page_id', schema='george')

    op.drop_index('ix_page_events_owner_at', table_name='page_events', schema='george')
    op.drop_index('ix_page_events_page_at', table_name='page_events', schema='george')
    op.drop_table('page_events', schema='george')
    op.drop_index('ix_pages_owner_updated', table_name='pages', schema='george')
    op.drop_table('pages', schema='george')
