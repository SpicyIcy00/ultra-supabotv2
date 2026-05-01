"""add_algorithm_settings_table

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-04-30 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'algorithm_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('snapshot_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('snapshot_required_days', sa.Integer(), nullable=False, server_default='28'),
        sa.Column('stockout_buffer_weekday_pct', sa.Integer(), nullable=False, server_default='20'),
        sa.Column('stockout_buffer_weekend_pct', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('priority_velocity_weight', sa.Numeric(4, 2), nullable=False, server_default='0.60'),
        sa.Column('priority_stockout_weight', sa.Numeric(4, 2), nullable=False, server_default='0.40'),
        sa.Column('overstock_threshold_days', sa.Integer(), nullable=False, server_default='120'),
        sa.Column('critical_stock_threshold_days', sa.Integer(), nullable=False, server_default='3'),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('Asia/Manila', now())"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    # Seed the default row
    op.execute(
        "INSERT INTO algorithm_settings (id) VALUES (1) ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table('algorithm_settings')
