"""page_date_window

A PAGE MAY CARRY ONE DATE WINDOW (W1.4, 2026-09-22).

Revision ID: a2b3c4d5e6f7
Revises: z0a1b2c3d4e5
Create Date: 2026-09-22 00:01:00.000000

"Add date filters to this", asked from a kept page, had nothing to write to:
a page held a title, a purpose and its pins, and each pin its own window. The
window a person picks on the page has to survive a reload, so it is a column
on the page row — `date_window`, since `window` is a reserved word in
Postgres — nullable JSONB, because NULL (no control on the page) and
{"preset": null} (the control, nothing picked) are two different pages.

Metadata only, like page_events: a preset name, who set it and when. Never a
figure. The shape is held by app/services/page_window.py, which is the only
writer (through page_writer.set_window, audited as set_window / remove_window).

Additive and nullable: every existing page reads as a page with no window,
which is what it was. Nothing is backfilled.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'z0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "pages",
        sa.Column("date_window", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        schema="george",
    )
    # An object or nothing: a bare string or a list is not a window.
    op.create_check_constraint(
        "ck_pages_date_window_is_object",
        "pages",
        "date_window IS NULL OR jsonb_typeof(date_window) = 'object'",
        schema="george",
    )


def downgrade() -> None:
    op.drop_constraint("ck_pages_date_window_is_object", "pages", schema="george", type_="check")
    op.drop_column("pages", "date_window", schema="george")
