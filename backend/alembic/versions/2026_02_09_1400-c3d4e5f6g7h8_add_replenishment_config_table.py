"""add_replenishment_config_table

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-09 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'replenishment_config',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('use_inventory_snapshots', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Seed the single config row
    config_table = sa.table(
        'replenishment_config',
        sa.column('id', sa.Integer),
        sa.column('use_inventory_snapshots', sa.Boolean),
    )
    op.execute(config_table.insert().values(id=1, use_inventory_snapshots=True))


def downgrade() -> None:
    op.drop_table('replenishment_config')
