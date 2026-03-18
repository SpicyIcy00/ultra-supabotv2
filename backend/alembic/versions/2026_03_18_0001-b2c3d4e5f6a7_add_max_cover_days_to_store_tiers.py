"""add_max_cover_days_to_store_tiers

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-18 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'store_tiers',
        sa.Column('max_cover_days', sa.Integer(), nullable=False, server_default='10')
    )


def downgrade() -> None:
    op.drop_column('store_tiers', 'max_cover_days')
