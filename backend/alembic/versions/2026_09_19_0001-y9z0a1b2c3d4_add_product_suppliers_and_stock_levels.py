"""add_product_suppliers_and_stock_levels

What the StoreHub products export carries that nothing else in this database
does: which suppliers a product comes from, and the warning / ideal stock level
somebody set for it at a store.

Revision ID: y9z0a1b2c3d4
Revises: x8y9z0a1b2c3
Create Date: 2026-09-19 00:01:00.000000

DESIGN NOTES — the reasoning lives in definitions/metrics.yaml (storehub.products).
Repeated here only where it constrains a column or a constraint.

  TWO TABLES, NOT TWO COLUMNS ON `products`. A product has SEVERAL suppliers —
  SH1 "Aji Mix" has five — and a level is per STORE. Either as a column would
  be a delimited string that every reader has to split, which is how "Seikyo
  SEK001; GZ Cri GZ001" becomes a supplier named "Seikyo SEK001; GZ Cri GZ001".

  NOTHING HERE WRITES `products`. That table is filled nightly by a job outside
  this repository; these tables hold only what that job does not carry. One
  writer per column is the whole rule (metrics.yaml storehub.products).

  SUPPLIER NAMES ARE NOT A SUPPLIER TABLE. There is no supplier master and no
  id: the string is stored as exported and never deduplicated, normalised or
  fuzzy-matched. `position` keeps the order the export listed them in, because
  the first name is usually the one they actually buy from and losing that
  ordering loses a fact.

  A LEVEL IS NULLABLE AND ZERO IS REAL. Blank in the export means nobody ever
  set a level for that product at that store; 0 means somebody set it to zero.
  A NOT NULL column with a 0 default would erase the difference, which is the
  same trap as received_quantity.blank_is_zero on purchase orders.

  store_id IS NOT NULL HERE, unlike the document tables. A level with no store
  is not a fact about anything, and the two test stores in the export resolve to
  no row; those levels are skipped and counted rather than stored against NULL.

  storehub_imports GAINS `counters`. The ledger's flat columns were named for
  documents and lines, and products have neither. Rather than report a product
  count in a column called documents_seen, every import now also writes its
  whole counter dict as JSON, and the surface renders that when it is there.

  ROW LEVEL SECURITY IS DELIBERATELY OFF, as on the other storehub tables. 36
  tables in this database have RLS on with zero policies, which is deny-all to
  any role without BYPASSRLS and reads as "the query worked and there is no
  data". With RLS off, george_ro needs only GRANT SELECT — added in
  tools/george_ro_role.sql.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'y9z0a1b2c3d4'
down_revision: Union[str, None] = 'x8y9z0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'product_suppliers',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),

        sa.Column('product_id', sa.String(24), nullable=False),

        # Free text, exactly as exported. No supplier master exists; see the
        # header. Length matches purchase_orders.supplier_name so the same name
        # cannot fit in one table and be truncated in the other.
        sa.Column('supplier_name', sa.String(255), nullable=False),

        # 1-based, the order the export listed them in.
        sa.Column('position', sa.SmallInteger(), nullable=False),

        sa.Column('import_id', sa.BigInteger(), nullable=False),
        sa.Column('first_seen_import_id', sa.BigInteger(), nullable=False),

        sa.PrimaryKeyConstraint('id', name='pk_product_suppliers'),
        # One row per product per supplier NAME. A file listing the same name
        # twice for one product is one link, not two.
        sa.UniqueConstraint('product_id', 'supplier_name',
                            name='uq_product_suppliers_product_supplier'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'],
                                name='fk_product_suppliers_product',
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'],
                                name='fk_product_suppliers_import',
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['first_seen_import_id'], ['storehub_imports.id'],
                                name='fk_product_suppliers_first_import',
                                ondelete='RESTRICT'),
    )
    op.create_index('ix_product_suppliers_product_id', 'product_suppliers', ['product_id'])
    op.create_index('ix_product_suppliers_supplier_name', 'product_suppliers', ['supplier_name'])

    op.create_table(
        'product_stock_levels',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),

        sa.Column('product_id', sa.String(24), nullable=False),
        sa.Column('store_id', sa.String(24), nullable=False),

        # NULL means never set, 0 means set to zero. Numeric, not integer: the
        # per-gram products move in counts of grams and a level may follow.
        sa.Column('warning_level', sa.Numeric(18, 4), nullable=True),
        sa.Column('ideal_level', sa.Numeric(18, 4), nullable=True),

        sa.Column('import_id', sa.BigInteger(), nullable=False),
        sa.Column('first_seen_import_id', sa.BigInteger(), nullable=False),

        sa.PrimaryKeyConstraint('id', name='pk_product_stock_levels'),
        sa.UniqueConstraint('product_id', 'store_id',
                            name='uq_product_stock_levels_product_store'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'],
                                name='fk_product_stock_levels_product',
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['store_id'], ['stores.id'],
                                name='fk_product_stock_levels_store',
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'],
                                name='fk_product_stock_levels_import',
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['first_seen_import_id'], ['storehub_imports.id'],
                                name='fk_product_stock_levels_first_import',
                                ondelete='RESTRICT'),
    )
    op.create_index('ix_product_stock_levels_product_id', 'product_stock_levels', ['product_id'])
    op.create_index('ix_product_stock_levels_store_id', 'product_stock_levels', ['store_id'])

    # Every import's full counter dict, whatever its kind counts. The flat
    # columns stay for the two document kinds and for rows written before this.
    op.add_column(
        'storehub_imports',
        sa.Column('counters', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    # The ledger's kind is a CHECK, not a lookup table, so a new kind is a
    # migration on purpose: an import kind is code (a parser and an importer),
    # never a row somebody adds.
    op.drop_constraint('ck_storehub_imports_kind', 'storehub_imports', type_='check')
    op.create_check_constraint(
        'ck_storehub_imports_kind',
        'storehub_imports',
        "kind IN ('purchase_orders', 'stock_transfers', 'products')",
    )


def downgrade() -> None:
    # A products import cannot exist under the old constraint. Its rows go
    # first, by the same rule that put them here.
    op.execute("DELETE FROM storehub_imports WHERE kind = 'products'")
    op.drop_constraint('ck_storehub_imports_kind', 'storehub_imports', type_='check')
    op.create_check_constraint(
        'ck_storehub_imports_kind',
        'storehub_imports',
        "kind IN ('purchase_orders', 'stock_transfers')",
    )

    op.drop_column('storehub_imports', 'counters')

    op.drop_index('ix_product_stock_levels_store_id', table_name='product_stock_levels')
    op.drop_index('ix_product_stock_levels_product_id', table_name='product_stock_levels')
    op.drop_table('product_stock_levels')

    op.drop_index('ix_product_suppliers_supplier_name', table_name='product_suppliers')
    op.drop_index('ix_product_suppliers_product_id', table_name='product_suppliers')
    op.drop_table('product_suppliers')
