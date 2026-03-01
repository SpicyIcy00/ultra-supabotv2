"""add_report_presets_table

Revision ID: 8a1e443c52ce
Revises: 60a8995b51cf
Create Date: 2025-11-18 14:53:57.808959

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a1e443c52ce'
down_revision: Union[str, None] = '60a8995b51cf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create report_presets table
    op.create_table(
        'report_presets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('report_type', sa.String(length=100), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create indexes for better query performance
    op.create_index('ix_report_presets_id', 'report_presets', ['id'])
    op.create_index('ix_report_presets_name', 'report_presets', ['name'])
    op.create_index('ix_report_presets_report_type', 'report_presets', ['report_type'])
    op.create_index('ix_report_presets_is_default', 'report_presets', ['is_default'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_report_presets_is_default', table_name='report_presets')
    op.drop_index('ix_report_presets_report_type', table_name='report_presets')
    op.drop_index('ix_report_presets_name', table_name='report_presets')
    op.drop_index('ix_report_presets_id', table_name='report_presets')

    # Drop table
    op.drop_table('report_presets')
