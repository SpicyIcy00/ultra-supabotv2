"""add_percentile_algorithm

Adds algorithm selector + percentile flag columns to shipment_plans,
and creates the service_overrides feedback-loop table.

Revision ID: g1h2i3j4k5l6
Revises: a7b8c9d0e1f2
Create Date: 2026-07-04 00:01:00.000000
"""
from typing import Sequence, Union
from alembic import op


revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS so this migration is fully idempotent
    # and safe to re-run if a previous attempt partially applied.

    # shipment_plans: algorithm selector + percentile output columns
    op.execute("""
        ALTER TABLE shipment_plans
            ADD COLUMN IF NOT EXISTS algorithm        VARCHAR(20)    NOT NULL DEFAULT 'legacy',
            ADD COLUMN IF NOT EXISTS abc_class        VARCHAR(1),
            ADD COLUMN IF NOT EXISTS service_quantile NUMERIC(4, 2),
            ADD COLUMN IF NOT EXISTS segment          VARCHAR(10),
            ADD COLUMN IF NOT EXISTS needs_count      BOOLEAN,
            ADD COLUMN IF NOT EXISTS silent_stockout  BOOLEAN,
            ADD COLUMN IF NOT EXISTS days_since_last_sale INTEGER,
            ADD COLUMN IF NOT EXISTS trusted_ledger   BOOLEAN
    """)

    # service_overrides: per-(store, product) quantile feedback table
    op.execute("""
        CREATE TABLE IF NOT EXISTS service_overrides (
            store_id         VARCHAR(24)  NOT NULL,
            product_id       VARCHAR(24)  NOT NULL,
            quantile_override NUMERIC(4, 2) NOT NULL,
            updated_at       TIMESTAMPTZ  NOT NULL DEFAULT timezone('Asia/Manila', now()),
            PRIMARY KEY (store_id, product_id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS service_overrides")
    op.execute("""
        ALTER TABLE shipment_plans
            DROP COLUMN IF EXISTS trusted_ledger,
            DROP COLUMN IF EXISTS days_since_last_sale,
            DROP COLUMN IF EXISTS silent_stockout,
            DROP COLUMN IF EXISTS needs_count,
            DROP COLUMN IF EXISTS segment,
            DROP COLUMN IF EXISTS service_quantile,
            DROP COLUMN IF EXISTS abc_class,
            DROP COLUMN IF EXISTS algorithm
    """)
