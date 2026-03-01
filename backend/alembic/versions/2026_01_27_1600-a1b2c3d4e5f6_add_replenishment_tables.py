"""add_replenishment_tables

Revision ID: a1b2c3d4e5f6
Revises: 8a1e443c52ce
Create Date: 2026-01-27 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '8a1e443c52ce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. store_tiers
    op.create_table(
        'store_tiers',
        sa.Column('store_id', sa.String(length=24), sa.ForeignKey('stores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tier', sa.String(length=1), nullable=False),
        sa.Column('safety_days', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('target_cover_days', sa.Integer(), nullable=False, server_default='7'),
        sa.Column('expiry_window_days', sa.Integer(), nullable=False, server_default='60'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('store_id')
    )

    # 2. store_pipeline
    op.create_table(
        'store_pipeline',
        sa.Column('store_id', sa.String(length=24), sa.ForeignKey('stores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sku_id', sa.String(length=24), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('on_order_units', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('store_id', 'sku_id')
    )
    op.create_index('idx_pipeline_store_sku', 'store_pipeline', ['store_id', 'sku_id'])

    # 3. warehouse_inventory
    op.create_table(
        'warehouse_inventory',
        sa.Column('sku_id', sa.String(length=24), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('wh_on_hand_units', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('sku_id')
    )

    # 4. seasonality_calendar
    op.create_table(
        'seasonality_calendar',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('multiplier', sa.Numeric(precision=5, scale=3), nullable=False, server_default='1.000'),
        sa.Column('label', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_seasonality_dates', 'seasonality_calendar', ['start_date', 'end_date'])

    # 5. shipment_plans
    op.create_table(
        'shipment_plans',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('run_date', sa.Date(), nullable=False),
        sa.Column('store_id', sa.String(length=24), sa.ForeignKey('stores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sku_id', sa.String(length=24), sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False),
        sa.Column('avg_daily_sales', sa.Numeric(precision=12, scale=4), nullable=False, server_default='0'),
        sa.Column('season_adjusted_daily_sales', sa.Numeric(precision=12, scale=4), nullable=False, server_default='0'),
        sa.Column('safety_stock', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('min_level', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('max_level', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('expiry_cap', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('final_max', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('on_hand', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('on_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('inventory_position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('requested_ship_qty', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('allocated_ship_qty', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('priority_score', sa.Numeric(precision=12, scale=4), nullable=False, server_default='0'),
        sa.Column('days_of_stock', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'),
        sa.Column('calculation_mode', sa.String(length=20), nullable=False, server_default='fallback'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_shipment_run_store_sku', 'shipment_plans', ['run_date', 'store_id', 'sku_id'])
    op.create_index('idx_shipment_run_date', 'shipment_plans', ['run_date'])


def downgrade() -> None:
    op.drop_index('idx_shipment_run_date', table_name='shipment_plans')
    op.drop_index('idx_shipment_run_store_sku', table_name='shipment_plans')
    op.drop_table('shipment_plans')

    op.drop_index('idx_seasonality_dates', table_name='seasonality_calendar')
    op.drop_table('seasonality_calendar')

    op.drop_table('warehouse_inventory')

    op.drop_index('idx_pipeline_store_sku', table_name='store_pipeline')
    op.drop_table('store_pipeline')

    op.drop_table('store_tiers')
