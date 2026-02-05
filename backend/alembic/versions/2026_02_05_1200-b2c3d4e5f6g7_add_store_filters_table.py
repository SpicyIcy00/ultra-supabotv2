"""add_store_filters_table

Revision ID: b2c3d4e5f6g7
Revises: a1b2c3d4e5f6
Create Date: 2026-02-05 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import uuid


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6g7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create store_filters table
    op.create_table(
        'store_filters',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('filter_type', sa.String(length=50), nullable=False),
        sa.Column('store_name', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index on filter_type
    op.create_index('ix_store_filters_filter_type', 'store_filters', ['filter_type'])

    # Seed default data
    store_filters_table = sa.table(
        'store_filters',
        sa.column('id', sa.String),
        sa.column('filter_type', sa.String),
        sa.column('store_name', sa.String),
    )

    # Default sales stores
    sales_stores = ['Rockwell', 'Greenhills', 'Magnolia', 'North Edsa', 'Fairview', 'Opus']
    # Default inventory stores (includes warehouse)
    inventory_stores = ['Rockwell', 'Greenhills', 'Magnolia', 'North Edsa', 'Fairview', 'Opus', 'AJI BARN']

    # Insert sales stores
    for store in sales_stores:
        op.execute(
            store_filters_table.insert().values(
                id=str(uuid.uuid4()),
                filter_type='sales',
                store_name=store
            )
        )

    # Insert inventory stores
    for store in inventory_stores:
        op.execute(
            store_filters_table.insert().values(
                id=str(uuid.uuid4()),
                filter_type='inventory',
                store_name=store
            )
        )


def downgrade() -> None:
    # Drop index
    op.drop_index('ix_store_filters_filter_type', table_name='store_filters')

    # Drop table
    op.drop_table('store_filters')
