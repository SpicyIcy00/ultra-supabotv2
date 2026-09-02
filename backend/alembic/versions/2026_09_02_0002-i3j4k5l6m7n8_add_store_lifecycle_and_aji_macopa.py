"""add_store_lifecycle_and_aji_macopa

Two changes, one subject: locations that no longer operate.

1. `stores.is_active` and `stores.closed_at`. A store is either operating or it
   is not, and that is a property of the store, not a metric — so it lives on
   the row rather than only in definitions/metrics.yaml. metrics.yaml keeps
   owning SCOPE (which stores a given question covers); this column answers
   "is this place still open", which the UI and the store picker also need.

   THIS ALSO FIXES A LIVE BUG. app/api/v1/routes/stores.py:23 already filters on
   `StoreModel.is_active`, a column that has never existed on the model or in
   the database, so `GET /stores/?is_active=true` raises AttributeError today.
   The filter was written for a column somebody meant to add. This adds it.

2. The AJI MACOPA row.

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-09-02 00:02:00.000000

WHY AJI MACOPA GETS A ROW, AND WHY ITS ID LOOKS WRONG
-----------------------------------------------------
AJI MACOPA is a closed warehouse. It appears 1,006 times across the StoreHub
exports — 666 as the source of a transfer, 340 as the destination — and in 76 of
227 purchase orders, but it has no row in `stores`, so every one of those
references imports with a null foreign key.

Every other stores.id is a StoreHub MongoDB ObjectID (24 hex characters). This
one is NOT:

    local-aji-macopa-wh-0001

That is deliberate. MACOPA presumably has a real ObjectID inside StoreHub that
was never synced here. Minting a plausible-looking hex id would risk a duplicate
row if that real id ever arrives, with a thousand documents bound to the wrong
one. A 24-character id that is obviously not hex cannot be mistaken for a real
StoreHub id, cannot collide with one, and makes the reconciliation — if the real
id ever turns up — a search for one known string.

    Decided 2026-09-02, after the risk was raised twice and creating the row was
    confirmed. If the real ObjectID is later supplied, migrate by updating this
    id and the alias in metrics.yaml storehub.locations.alias together.

closed_at = 2026-06-24, DERIVED FROM THE DATA, not supplied:
  ST2721, AJI MACOPA -> Magnolia, PHP 4,040, status Completed, shipped and
  received 2026-06-24 23:27. It is the last date on which goods actually moved
  to or from MACOPA.

  One document is LATER and is deliberately not used: ST2735 (2026-06-28),
  MACOPA -> OPUS, status Created, ZERO lines, total 0.00. It was raised and
  never shipped. That is a document, not a movement — the same distinction
  metrics.yaml already draws in storehub.stock_transfers.moved_statuses, applied
  here so the closing date means "when goods last moved" rather than "when
  someone last opened a form".
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, None] = 'h2i3j4k5l6m7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MACOPA_ID = 'local-aji-macopa-wh-0001'
MACOPA_CLOSED_AT = '2026-06-24'


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Store lifecycle.
    #
    # is_active defaults TRUE and is NOT NULL: every existing store keeps
    # behaving exactly as it does now, and a new store is open unless someone
    # says otherwise. closed_at is a DATE — the exports record a closing to the
    # day, and a timestamp would imply a precision the derivation does not have.
    # ------------------------------------------------------------------
    op.add_column(
        'stores',
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
    )
    op.add_column('stores', sa.Column('closed_at', sa.Date(), nullable=True))
    op.create_index('ix_stores_is_active', 'stores', ['is_active'])

    # ------------------------------------------------------------------
    # 2. AJI MACOPA. See the module docstring for the id and the date.
    #
    # ON CONFLICT DO NOTHING so re-running is harmless, and so that if the real
    # StoreHub row is ever synced in under this id the migration does not fight
    # it.
    # ------------------------------------------------------------------
    op.execute(
        sa.text("""
            INSERT INTO stores (id, name, display_name, is_active, closed_at)
            VALUES (:id, :name, :display_name, false, :closed_at)
            ON CONFLICT (id) DO NOTHING
        """).bindparams(
            id=MACOPA_ID,
            name='AJI MACOPA',
            display_name='AJI MACOPA (closed)',
            closed_at=MACOPA_CLOSED_AT,
        )
    )


def downgrade() -> None:
    # Only remove the row this migration created, and only while nothing points
    # at it. The StoreHub imports reference it by foreign key; if documents have
    # been imported, this DELETE is blocked by those constraints rather than
    # cascading through a thousand of them. That is the intended behaviour —
    # unwinding the store row is not a reason to lose the documents.
    op.execute(
        sa.text("DELETE FROM stores WHERE id = :id").bindparams(id=MACOPA_ID)
    )
    op.drop_index('ix_stores_is_active', 'stores')
    op.drop_column('stores', 'closed_at')
    op.drop_column('stores', 'is_active')
