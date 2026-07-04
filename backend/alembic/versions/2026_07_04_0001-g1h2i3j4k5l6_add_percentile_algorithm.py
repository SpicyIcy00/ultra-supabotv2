"""add_percentile_algorithm

Adds algorithm selector + percentile flag columns to shipment_plans,
and creates the service_overrides feedback-loop table.

Revision ID: g1h2i3j4k5l6
Revises: a7b8c9d0e1f2
Create Date: 2026-07-04 00:01:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "g1h2i3j4k5l6"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── shipment_plans: algorithm selector ───────────────────────────────────
    op.add_column(
        "shipment_plans",
        sa.Column("algorithm", sa.String(20), server_default="legacy", nullable=False),
    )

    # ── shipment_plans: percentile-specific output fields ────────────────────
    op.add_column("shipment_plans", sa.Column("abc_class", sa.String(1), nullable=True))
    op.add_column("shipment_plans", sa.Column("service_quantile", sa.Numeric(4, 2), nullable=True))
    op.add_column("shipment_plans", sa.Column("segment", sa.String(10), nullable=True))
    op.add_column("shipment_plans", sa.Column("needs_count", sa.Boolean(), nullable=True))
    op.add_column("shipment_plans", sa.Column("silent_stockout", sa.Boolean(), nullable=True))
    op.add_column("shipment_plans", sa.Column("days_since_last_sale", sa.Integer(), nullable=True))
    op.add_column("shipment_plans", sa.Column("trusted_ledger", sa.Boolean(), nullable=True))

    # Update existing rows to explicitly tag as legacy
    op.execute("UPDATE shipment_plans SET algorithm = 'legacy' WHERE algorithm = 'legacy'")

    # ── service_overrides: per-(store, product) quantile bump table ──────────
    op.create_table(
        "service_overrides",
        sa.Column("store_id", sa.String(24), nullable=False),
        sa.Column("product_id", sa.String(24), nullable=False),
        sa.Column("quantile_override", sa.Numeric(4, 2), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('Asia/Manila', now())"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("store_id", "product_id"),
    )


def downgrade() -> None:
    op.drop_table("service_overrides")
    op.drop_column("shipment_plans", "trusted_ledger")
    op.drop_column("shipment_plans", "days_since_last_sale")
    op.drop_column("shipment_plans", "silent_stockout")
    op.drop_column("shipment_plans", "needs_count")
    op.drop_column("shipment_plans", "segment")
    op.drop_column("shipment_plans", "service_quantile")
    op.drop_column("shipment_plans", "abc_class")
    op.drop_column("shipment_plans", "algorithm")
