"""add_product_barcodes_table

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-23 00:01:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_barcodes',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('product_id', sa.String(24), nullable=False),
        sa.Column('barcode', sa.String(13), nullable=False),
        sa.Column('base_digits', sa.String(12), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True),
                  server_default=sa.text("timezone('Asia/Manila', now())"), nullable=False),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('barcode'),
    )
    op.create_index('ix_product_barcodes_product_id', 'product_barcodes', ['product_id'])
    op.create_index('ix_product_barcodes_barcode', 'product_barcodes', ['barcode'])


def downgrade() -> None:
    op.drop_index('ix_product_barcodes_barcode', 'product_barcodes')
    op.drop_index('ix_product_barcodes_product_id', 'product_barcodes')
    op.drop_table('product_barcodes')
