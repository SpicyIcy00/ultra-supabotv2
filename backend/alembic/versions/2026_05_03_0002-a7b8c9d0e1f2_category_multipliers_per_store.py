"""category_multipliers_per_store

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-03 00:02:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table('category_multipliers')

    op.create_table(
        'category_multipliers',
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('store_id', sa.String(length=24), sa.ForeignKey('stores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('category', 'store_id'),
    )

    # Auto-populate: every distinct category × every store, defaulting to 1.0
    op.execute("""
        INSERT INTO category_multipliers (category, store_id, multiplier)
        SELECT DISTINCT p.category, s.id, 1.000
        FROM products p
        CROSS JOIN stores s
        WHERE p.category IS NOT NULL AND p.category != ''
        ON CONFLICT (category, store_id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table('category_multipliers')

    op.create_table(
        'category_multipliers',
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('category'),
    )
