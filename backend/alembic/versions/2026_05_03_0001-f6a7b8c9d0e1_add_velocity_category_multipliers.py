"""add_velocity_category_multipliers

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-03 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. velocity_multiplier_rules
    op.create_table(
        'velocity_multiplier_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('threshold', sa.Numeric(precision=10, scale=4), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_velocity_rules_threshold', 'velocity_multiplier_rules', ['threshold'])

    # Seed default velocity rules
    op.execute("""
        INSERT INTO velocity_multiplier_rules (threshold, multiplier, label)
        VALUES
            (0,    1.000, 'Standard'),
            (5,    1.100, 'Moderate Mover'),
            (15,   1.200, 'Fast Mover'),
            (30,   1.300, 'High Velocity')
    """)

    # 2. category_multipliers
    op.create_table(
        'category_multipliers',
        sa.Column('category', sa.String(length=100), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('category'),
    )

    # Auto-populate from existing product categories
    op.execute("""
        INSERT INTO category_multipliers (category, multiplier)
        SELECT DISTINCT category, 1.000
        FROM products
        WHERE category IS NOT NULL AND category != ''
        ON CONFLICT (category) DO NOTHING
    """)

    # 3. Add multiplier audit columns to shipment_plans
    op.add_column('shipment_plans', sa.Column('velocity_multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'))
    op.add_column('shipment_plans', sa.Column('category_multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'))
    op.add_column('shipment_plans', sa.Column('effective_multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'))


def downgrade() -> None:
    op.drop_column('shipment_plans', 'effective_multiplier')
    op.drop_column('shipment_plans', 'category_multiplier')
    op.drop_column('shipment_plans', 'velocity_multiplier')

    op.drop_table('category_multipliers')

    op.drop_index('idx_velocity_rules_threshold', table_name='velocity_multiplier_rules')
    op.drop_table('velocity_multiplier_rules')
