"""
SQLAlchemy models for the StoreHub CSV imports.

Purchase orders and stock transfers as StoreHub exports them, plus the import
ledger every row points back to. These are the first recorded procurement and
movement documents this database has held.

THE MODELS HOLD NO BUSINESS DEFINITION. Which statuses mean "cancelled", which
mean the goods actually moved, what a location name maps to, what the money
column's currency is — all of that lives in definitions/metrics.yaml under
`storehub:` and is read at runtime. These classes describe storage only.

See the migration (2026_09_02_0001) for the reasoning behind the column types.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

_NOW_MANILA = func.timezone("Asia/Manila", func.now())


class StorehubImport(Base):
    """
    One committed import of one CSV file.

    A row exists only for an import that COMMITTED — the whole file is imported
    in a single transaction, so a failure rolls this row back too and leaves no
    trace. Atomicity is worth more here than a record of the attempt.

    A byte-identical re-import is allowed and gets its own row rather than being
    rejected: "someone re-ran this import" is itself worth knowing, and the
    upsert converges either way.
    """

    __tablename__ = "storehub_imports"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('purchase_orders', 'stock_transfers')",
            name="ck_storehub_imports_kind",
        ),
        Index("ix_storehub_imports_kind_uploaded_at", "kind", "uploaded_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW_MANILA, nullable=False
    )
    parser_version: Mapped[str] = mapped_column(String(32), nullable=False)

    documents_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lines_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    documents_inserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    documents_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lines_inserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lines_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lines_deleted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Data-quality counters, reported on every import so a degrading export shows
    # up as a trend rather than as a surprise inside an answer.
    unresolved_locations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unmatched_skus: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ambiguous_skus: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    subtotal_mismatches: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    header_total_mismatches: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    mojibake_names: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    notices: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)


class _DocumentMixin:
    """Columns shared by purchase_orders and stock_transfers."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # StoreHub's document number — 'PO0710', 'ST3001'. The idempotency key.
    external_id: Mapped[str] = mapped_column(String(32), nullable=False)

    created_at_source: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    cancelled_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Raw status text exactly as exported. The MEANING of each value is in
    # metrics.yaml, never here.
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)

    # The raw location string is kept whether or not it resolved, so an
    # unresolved location is still reportable by name.
    target_location_raw: Mapped[str] = mapped_column(String(255), nullable=False)
    target_location_resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    header_total: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))

    # Whether header_total equals the sum of the line subtotals. NULL when the
    # check could not run. False on a document that disagrees with itself — two
    # of 151 purchase orders do, and no stock transfer measured does. Neither
    # figure is ever adjusted to make this true.
    header_total_reconciles: Mapped[Optional[bool]] = mapped_column(Boolean)

    line_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW_MANILA, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=_NOW_MANILA,
        onupdate=_NOW_MANILA,
        nullable=False,
    )


class _LineMixin:
    """Columns shared by purchase_order_lines and stock_transfer_lines."""

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # The export's 'No.' column: line identity within the document, and the only
    # reliable header/line discriminator at parse time.
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)

    # Verbatim, including UTF-8 mis-decoding. name_mojibake flags a suspect
    # name — it is a detector, never a repair.
    product_name_raw: Mapped[Optional[str]] = mapped_column(String(512))
    name_mojibake: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # SKU matching is CASE-SENSITIVE (metrics.yaml products.sku.import_match).
    # sku_match is one of exact / none / ambiguous / absent, so a line whose SKU
    # failed to resolve stays distinguishable from one that carried no SKU.
    sku_raw: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    sku_match: Mapped[str] = mapped_column(String(16), nullable=False)

    serial_no: Mapped[Optional[str]] = mapped_column(String(255))
    category_raw: Mapped[Optional[str]] = mapped_column(String(100))

    ordered_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))
    unit_cost: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 6))
    subtotal: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))

    # NULL means "not checkable" (quantity or cost missing), which is not the
    # same as "checked and consistent".
    subtotal_consistent: Mapped[Optional[bool]] = mapped_column(Boolean)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=_NOW_MANILA, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=_NOW_MANILA,
        onupdate=_NOW_MANILA,
        nullable=False,
    )


class PurchaseOrder(_DocumentMixin, Base):
    """
    A StoreHub purchase order header.

    Two traps, both recorded in metrics.yaml and both load-bearing for any tool
    reading this table:

      status 'Open' does NOT mean "not received". Observed: PO0706 (PHP 327,320),
      PO0708 and PO0709 are all Open with notes saying the goods arrived. Open
      means nobody completed the document.

      completion_date is NOT an arrival time. It is when someone clicked
      Complete. PO0710 was created and completed two minutes apart as a
      backdated correction. The real receipt date, where it exists at all, is
      prose inside `notes`, which is deliberately not parsed.
    """

    __tablename__ = "purchase_orders"
    __table_args__ = (
        UniqueConstraint("external_id", name="uq_purchase_orders_external_id"),
        Index("ix_purchase_orders_created_at_source", "created_at_source"),
    )

    # DATE-ONLY in the export. A midnight timestamp would imply a precision the
    # file does not have.
    estimated_arrival_date: Mapped[Optional[date]] = mapped_column(Date)
    completion_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Free text; there is no supplier master and these are never deduplicated.
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), index=True)

    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_mentions_received: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    requested_by: Mapped[Optional[str]] = mapped_column(String(255))
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(255))
    completed_by: Mapped[Optional[str]] = mapped_column(String(255))

    target_store_id: Mapped[Optional[str]] = mapped_column(
        String(24), ForeignKey("stores.id", ondelete="RESTRICT"), index=True
    )
    import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )
    first_seen_import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )

    lines: Mapped[List["PurchaseOrderLine"]] = relationship(
        back_populates="purchase_order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PurchaseOrderLine(_LineMixin, Base):
    __tablename__ = "purchase_order_lines"
    __table_args__ = (
        UniqueConstraint("purchase_order_id", "line_no", name="uq_purchase_order_lines_doc_line"),
        CheckConstraint(
            "sku_match IN ('exact', 'none', 'ambiguous', 'absent')",
            name="ck_purchase_order_lines_sku_match",
        ),
    )

    purchase_order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[Optional[str]] = mapped_column(
        String(24), ForeignKey("products.id", ondelete="RESTRICT"), index=True
    )
    # See the migration: this is both line-level provenance and the mechanism
    # that makes a re-import converge in one DELETE.
    import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )

    # Imported exactly as exported and NEVER reconciled to ordered_qty. NULL is
    # "not recorded"; 0 is "recorded as zero". Received can also exceed ordered.
    received_qty: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 4))
    received_differs_from_ordered: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    purchase_order: Mapped["PurchaseOrder"] = relationship(back_populates="lines")


class StockTransfer(_DocumentMixin, Base):
    """
    A StoreHub stock transfer header.

    STATUS DECIDES WHETHER GOODS MOVED. A transfer with status 'Created' has no
    shipped or received date — it is a document, not a movement. In the sample
    window most transfers are Created, including the largest single document
    (ST2989, PHP 159,184.70), where nothing left the warehouse. Summing
    quantities without filtering on status reports goods that never moved.

    Both ends are named, so unlike the snapshot-differencing path in
    tools/movement.py these records CAN answer destination-scoped questions.
    """

    __tablename__ = "stock_transfers"
    __table_args__ = (
        UniqueConstraint("external_id", name="uq_stock_transfers_external_id"),
        Index("ix_stock_transfers_created_at_source", "created_at_source"),
        # Route questions ("BARN -> Rockwell, last month") scan both ends and the
        # date together.
        Index("ix_stock_transfers_route",
              "source_store_id", "target_store_id", "created_at_source"),
    )

    shipped_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    received_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    source_location_raw: Mapped[str] = mapped_column(String(255), nullable=False)
    source_location_resolved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    sent_by: Mapped[Optional[str]] = mapped_column(String(255))
    received_by: Mapped[Optional[str]] = mapped_column(String(255))
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(255))

    source_store_id: Mapped[Optional[str]] = mapped_column(
        String(24), ForeignKey("stores.id", ondelete="RESTRICT"), index=True
    )
    target_store_id: Mapped[Optional[str]] = mapped_column(
        String(24), ForeignKey("stores.id", ondelete="RESTRICT"), index=True
    )
    import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )
    first_seen_import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )

    lines: Mapped[List["StockTransferLine"]] = relationship(
        back_populates="stock_transfer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class StockTransferLine(_LineMixin, Base):
    __tablename__ = "stock_transfer_lines"
    __table_args__ = (
        UniqueConstraint("stock_transfer_id", "line_no", name="uq_stock_transfer_lines_doc_line"),
        CheckConstraint(
            "sku_match IN ('exact', 'none', 'ambiguous', 'absent')",
            name="ck_stock_transfer_lines_sku_match",
        ),
    )

    stock_transfer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("stock_transfers.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[Optional[str]] = mapped_column(
        String(24), ForeignKey("products.id", ondelete="RESTRICT"), index=True
    )
    import_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("storehub_imports.id", ondelete="RESTRICT"), nullable=False
    )

    stock_transfer: Mapped["StockTransfer"] = relationship(back_populates="lines")
