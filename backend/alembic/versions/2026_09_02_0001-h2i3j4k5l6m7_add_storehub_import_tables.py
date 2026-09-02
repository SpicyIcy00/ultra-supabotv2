"""add_storehub_import_tables

Purchase orders and stock transfers imported from the StoreHub CSV exports,
plus the import ledger that records where each row came from.

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-09-02 00:01:00.000000

DESIGN NOTES — the reasoning lives in definitions/metrics.yaml (storehub:).
Repeated here only where it constrains a column type or a constraint.

  Money is PHP, not ringgit. The export headers say "(RM)" and the values are
  pesos (metrics.yaml storehub.currency). No column below carries "rm" in its
  name; a column named for a currency it does not hold is how that mistake gets
  made a second time.

  unit_cost is NUMERIC(18, 6). The export carries six decimals — PCON03 is
  1.018028 — and a 2dp column would silently round the source.

  Quantities are NUMERIC, not INTEGER. They are integral in the exports seen so
  far, but per-gram products move as counts of grams and the store domain
  already sells fractional quantities. An integer column would reject a
  fractional line rather than record it.

  Line identity is (document, line_no), NOT (document, sku). A document may
  legitimately list the same SKU twice; a SKU-keyed constraint would reject or
  merge two real lines. It is also what makes the re-import converge: lines
  whose line_no is absent from the file are deleted.

  Locations are nullable FKs beside a retained raw string. An unresolved
  location — AJI MACOPA, AJI VENDO — imports with a null FK, the raw text kept,
  and a notice. It is never fuzzy-matched and never causes a stores row to be
  created.

  NO is_cancelled / has_moved COLUMN. Which statuses mean "cancelled" and which
  mean "the goods moved" are business definitions and live in metrics.yaml
  (storehub.*.cancelled_statuses, storehub.stock_transfers.moved_statuses).
  Materialising them here would freeze a definition into data, where changing it
  needs a migration instead of an edit to the definitions file.

  ROW LEVEL SECURITY is deliberately NOT enabled on these tables. 36 existing
  tables have RLS on with zero policies, which is deny-all to any role without
  BYPASSRLS — the failure mode documented in tools/george_ro_role.sql, where
  queries succeed and return zero rows. With RLS off, george_ro needs only
  GRANT SELECT. The grants are added to tools/george_ro_role.sql alongside the
  tools that read these tables.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_NOW_MANILA = sa.text("timezone('Asia/Manila', now())")


def _document_columns() -> list:
    """Columns common to purchase_orders and stock_transfers."""
    return [
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),

        # The StoreHub document number: 'PO0710', 'ST3001'. The idempotency key.
        sa.Column('external_id', sa.String(32), nullable=False),

        # 'Created Date'. Manila wall clock in the file, stored as timestamptz.
        sa.Column('created_at_source', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_date', sa.DateTime(timezone=True), nullable=True),

        # Raw status string, exactly as exported. Meanings live in metrics.yaml.
        sa.Column('status', sa.String(32), nullable=False),

        # Destination. The raw string is retained whether or not it resolved, so
        # an unresolved location is still reportable by name.
        sa.Column('target_location_raw', sa.String(255), nullable=False),
        sa.Column('target_store_id', sa.String(24), nullable=True),
        sa.Column('target_location_resolved', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        # 'Total (RM)' from the header row — PHP. Verified equal to the sum of
        # line subtotals (metrics.yaml storehub.integrity).
        sa.Column('header_total', sa.Numeric(18, 4), nullable=True),

        # Whether header_total equals the sum of the line subtotals. TRUE on
        # every stock transfer measured (2,034 documents) and FALSE on two of
        # 151 purchase orders, where the source document disagrees with itself:
        # PO0604 carries a 90,000.00 total with every line cost left at 0.00.
        # NULL means the check could not run. Both figures are imported exactly
        # as exported either way — this flag exists so a total taken from such a
        # document carries the caveat rather than looking clean.
        sa.Column('header_total_reconciles', sa.Boolean(), nullable=True),

        sa.Column('line_count', sa.Integer(), nullable=False, server_default=sa.text('0')),

        # Provenance. first_seen_import_id never changes; import_id is the most
        # recent import that touched the row, so "which file last said this"
        # is answerable without a separate audit table.
        sa.Column('import_id', sa.BigInteger(), nullable=False),
        sa.Column('first_seen_import_id', sa.BigInteger(), nullable=False),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=_NOW_MANILA, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=_NOW_MANILA, nullable=False),
    ]


def _line_columns(parent_table: str, parent_fk_column: str) -> list:
    """Columns common to purchase_order_lines and stock_transfer_lines."""
    return [
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column(parent_fk_column, sa.BigInteger(), nullable=False),

        # The import that last wrote this line. It is what makes the re-import
        # converge in ONE statement: after upserting every line the file
        # contains, the lines of those documents still carrying an older
        # import_id are exactly the ones the file no longer has, and they are
        # deleted. It doubles as line-level provenance — which file last stated
        # this cost and quantity.
        sa.Column('import_id', sa.BigInteger(), nullable=False),

        # The export's 'No.' column. Line identity within the document, and the
        # discriminator that separates line rows from header rows at parse time.
        sa.Column('line_no', sa.Integer(), nullable=False),

        # Stored verbatim, including UTF-8 mis-decoding. name_mojibake flags a
        # suspect name; it is a detector, never a repair.
        sa.Column('product_name_raw', sa.String(512), nullable=True),
        sa.Column('name_mojibake', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        # SKU as exported, and the product it resolved to. Matching is
        # CASE-SENSITIVE (metrics.yaml products.sku.import_match): TKY28 and
        # Tky28 are different products. sku_match records which of
        # exact / none / ambiguous / absent applied, so an unresolved line is
        # distinguishable from a line that had no SKU at all.
        sa.Column('sku_raw', sa.String(100), nullable=True),
        sa.Column('product_id', sa.String(24), nullable=True),
        sa.Column('sku_match', sa.String(16), nullable=False),

        sa.Column('serial_no', sa.String(255), nullable=True),
        sa.Column('category_raw', sa.String(100), nullable=True),

        sa.Column('ordered_qty', sa.Numeric(18, 4), nullable=True),
        sa.Column('unit_cost', sa.Numeric(18, 6), nullable=True),
        sa.Column('subtotal', sa.Numeric(18, 4), nullable=True),

        # NULL when quantity or cost is missing — "not checkable", which is not
        # the same as "checked and consistent".
        sa.Column('subtotal_consistent', sa.Boolean(), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=_NOW_MANILA, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=_NOW_MANILA, nullable=False),
    ]


def upgrade() -> None:
    # ------------------------------------------------------------------
    # storehub_imports — the ledger every imported row points back to.
    #
    # A row exists only for an import that COMMITTED. The whole file imports in
    # one transaction (metrics.yaml storehub.idempotency.single_transaction), so
    # a failed import rolls its own ledger row back with everything else and
    # leaves no trace. That is the price of atomicity and is deliberate.
    # ------------------------------------------------------------------
    op.create_table(
        'storehub_imports',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('kind', sa.String(32), nullable=False),
        sa.Column('filename', sa.String(512), nullable=False),
        sa.Column('sha256', sa.String(64), nullable=False),
        sa.Column('byte_size', sa.BigInteger(), nullable=False),
        sa.Column('uploaded_by', sa.String(255), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True),
                  server_default=_NOW_MANILA, nullable=False),
        sa.Column('parser_version', sa.String(32), nullable=False),

        sa.Column('documents_seen', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('lines_seen', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('documents_inserted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('documents_updated', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('lines_inserted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('lines_updated', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('lines_deleted', sa.Integer(), nullable=False, server_default=sa.text('0')),

        # Data-quality counters. Reported on every import so a degrading export
        # is visible as a trend rather than discovered inside an answer.
        sa.Column('unresolved_locations', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('unmatched_skus', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('ambiguous_skus', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('subtotal_mismatches', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('header_total_mismatches', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('mojibake_names', sa.Integer(), nullable=False, server_default=sa.text('0')),

        sa.Column('notices', postgresql.JSONB(astext_type=sa.Text()), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "kind IN ('purchase_orders', 'stock_transfers')",
            name='ck_storehub_imports_kind',
        ),
    )
    op.create_index('ix_storehub_imports_sha256', 'storehub_imports', ['sha256'])
    op.create_index('ix_storehub_imports_kind_uploaded_at', 'storehub_imports',
                    ['kind', 'uploaded_at'])

    # ------------------------------------------------------------------
    # purchase_orders
    # ------------------------------------------------------------------
    op.create_table(
        'purchase_orders',
        *_document_columns(),

        # 'Estimated Date of Arrival' is DATE-ONLY in the export. Stored as a
        # date: a midnight timestamp would imply a precision the file lacks and
        # would make a same-day ETA appear to precede its own PO.
        sa.Column('estimated_arrival_date', sa.Date(), nullable=True),

        # When the PO was marked complete in StoreHub. NOT when goods arrived —
        # see metrics.yaml storehub.purchase_orders.lead_time.
        sa.Column('completion_date', sa.DateTime(timezone=True), nullable=True),

        # Free text. There is no supplier master and these are never deduplicated
        # or normalised (storehub.purchase_orders.supplier_is_free_text).
        sa.Column('supplier_name', sa.String(255), nullable=True),

        # Stored verbatim: embedded newlines and commas, no parsing. The actual
        # receipt date often lives in here and is deliberately NOT extracted
        # (storehub.notes.parse_received_date: false).
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('notes_mentions_received', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        sa.Column('requested_by', sa.String(255), nullable=True),
        sa.Column('cancelled_by', sa.String(255), nullable=True),
        sa.Column('completed_by', sa.String(255), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id', name='uq_purchase_orders_external_id'),
        # RESTRICT: an import that documents still point at cannot be deleted out
        # from under them, so provenance cannot dangle.
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['first_seen_import_id'], ['storehub_imports.id'],
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['target_store_id'], ['stores.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_purchase_orders_target_store_id', 'purchase_orders', ['target_store_id'])
    op.create_index('ix_purchase_orders_status', 'purchase_orders', ['status'])
    op.create_index('ix_purchase_orders_created_at_source', 'purchase_orders',
                    ['created_at_source'])
    op.create_index('ix_purchase_orders_supplier_name', 'purchase_orders', ['supplier_name'])

    op.create_table(
        'purchase_order_lines',
        *_line_columns('purchase_orders', 'purchase_order_id'),

        # Imported EXACTLY as exported and never reconciled to ordered_qty.
        # Blank means "not recorded" and is stored NULL; 0 means "recorded as
        # zero". Collapsing the two would erase the difference, and Completed
        # POs carrying 0 on every line are real (PO0707, PO0705).
        sa.Column('received_qty', sa.Numeric(18, 4), nullable=True),
        sa.Column('received_differs_from_ordered', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('purchase_order_id', 'line_no',
                            name='uq_purchase_order_lines_doc_line'),
        sa.ForeignKeyConstraint(['purchase_order_id'], ['purchase_orders.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'], ondelete='RESTRICT'),
        sa.CheckConstraint(
            "sku_match IN ('exact', 'none', 'ambiguous', 'absent')",
            name='ck_purchase_order_lines_sku_match',
        ),
    )
    op.create_index('ix_purchase_order_lines_product_id', 'purchase_order_lines', ['product_id'])
    op.create_index('ix_purchase_order_lines_sku_raw', 'purchase_order_lines', ['sku_raw'])

    # ------------------------------------------------------------------
    # stock_transfers
    #
    # Unlike the snapshot-differencing path in tools/movement.py, these records
    # name BOTH ends, so destination-scoped movement is answerable from them.
    # ------------------------------------------------------------------
    op.create_table(
        'stock_transfers',
        *_document_columns(),

        sa.Column('shipped_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('received_date', sa.DateTime(timezone=True), nullable=True),

        sa.Column('source_location_raw', sa.String(255), nullable=False),
        sa.Column('source_store_id', sa.String(24), nullable=True),
        sa.Column('source_location_resolved', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')),

        sa.Column('sent_by', sa.String(255), nullable=True),
        sa.Column('received_by', sa.String(255), nullable=True),
        sa.Column('cancelled_by', sa.String(255), nullable=True),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id', name='uq_stock_transfers_external_id'),
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['first_seen_import_id'], ['storehub_imports.id'],
                                ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['source_store_id'], ['stores.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['target_store_id'], ['stores.id'], ondelete='RESTRICT'),
    )
    op.create_index('ix_stock_transfers_source_store_id', 'stock_transfers', ['source_store_id'])
    op.create_index('ix_stock_transfers_target_store_id', 'stock_transfers', ['target_store_id'])
    op.create_index('ix_stock_transfers_status', 'stock_transfers', ['status'])
    op.create_index('ix_stock_transfers_created_at_source', 'stock_transfers',
                    ['created_at_source'])
    # Route questions ("BARN -> Rockwell") scan both ends together.
    op.create_index('ix_stock_transfers_route', 'stock_transfers',
                    ['source_store_id', 'target_store_id', 'created_at_source'])

    op.create_table(
        'stock_transfer_lines',
        *_line_columns('stock_transfers', 'stock_transfer_id'),

        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stock_transfer_id', 'line_no',
                            name='uq_stock_transfer_lines_doc_line'),
        sa.ForeignKeyConstraint(['stock_transfer_id'], ['stock_transfers.id'],
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['product_id'], ['products.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['import_id'], ['storehub_imports.id'], ondelete='RESTRICT'),
        sa.CheckConstraint(
            "sku_match IN ('exact', 'none', 'ambiguous', 'absent')",
            name='ck_stock_transfer_lines_sku_match',
        ),
    )
    op.create_index('ix_stock_transfer_lines_product_id', 'stock_transfer_lines', ['product_id'])
    op.create_index('ix_stock_transfer_lines_sku_raw', 'stock_transfer_lines', ['sku_raw'])


def downgrade() -> None:
    op.drop_table('stock_transfer_lines')
    op.drop_table('stock_transfers')
    op.drop_table('purchase_order_lines')
    op.drop_table('purchase_orders')
    op.drop_table('storehub_imports')
