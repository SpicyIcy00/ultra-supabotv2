"""page_kind

A PAGE HAS A KIND, AND THE KIND DECIDES HOW IT IS DRAWN (W4.1, 2026-09-23).

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-09-23 00:01:00.000000

Four kept pages doing four different jobs — Estate Dashboard, Store Dashboard,
Estate Week, AJI BARN Reorder — were drawn one way: a header and N boards in
the same packed grid. The owner: *"next thing we need to do is make how each
page style work idealy"*. A kind is PRESENTATION: it never changes what is on
the page, what any figure says, or the order the person put the analyses in.

TWO NULLABLE COLUMNS, AND NULL IS A REAL STATE. `kind` NULL means NOBODY HAS
SAID, and the server derives one from what the page's pins carry
(app/services/page_kind.py) on every read — so a page whose analyses change is
drawn as what it now is. A value is what a person or Bob decided, and it is
never second-guessed. `kind_set_by` says which of them, and is NULL exactly
when `kind` is: "derived" is not a value anybody stores, it is what a null
column reads as.

The CHECKs are the vocabulary, in the database as well as in the yaml, so a
hand-written row cannot invent a fifth kind. The four names also live in
definitions/metrics.yaml `pages.kinds.catalogue`, and a contract test holds
the two lists equal.

Additive and nullable: every existing page reads as a page nobody has set a
kind on, which is what it is. Nothing is backfilled and no page moves.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("pages", sa.Column("kind", sa.Text(), nullable=True), schema="george")
    op.add_column("pages", sa.Column("kind_set_by", sa.Text(), nullable=True), schema="george")
    op.create_check_constraint(
        "ck_pages_kind",
        "pages",
        "kind IS NULL OR kind IN ('dashboard', 'week', 'list', 'collection')",
        schema="george",
    )
    # 'derived' is deliberately absent: it is what a NULL kind reads as, never
    # something anybody stores.
    op.create_check_constraint(
        "ck_pages_kind_set_by",
        "pages",
        "kind_set_by IS NULL OR kind_set_by IN ('user', 'bob')",
        schema="george",
    )


def downgrade() -> None:
    op.drop_constraint("ck_pages_kind_set_by", "pages", schema="george", type_="check")
    op.drop_constraint("ck_pages_kind", "pages", schema="george", type_="check")
    op.drop_column("pages", "kind_set_by", schema="george")
    op.drop_column("pages", "kind", schema="george")
