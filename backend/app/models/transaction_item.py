from datetime import datetime
from typing import Optional
from sqlalchemy import String, Numeric, Integer, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class TransactionItem(Base):
    __tablename__ = "new_transaction_items"

    # Primary key
    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Foreign keys
    transaction_ref_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("new_transactions.ref_id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    product_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Item details
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)  # Often NULL in actual data

    # Financial data
    item_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    item_subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    tax_code: Mapped[Optional[str]] = mapped_column(String(50))

    # Additional info
    item_type: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(String(500))

    # Timestamps - timezone aware (Asia/Manila)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )

    # Relationships
    transaction: Mapped["Transaction"] = relationship(
        "Transaction",
        back_populates="items"
    )
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="transaction_items"
    )

    # Compound indexes for common queries
    __table_args__ = (
        Index('idx_product_transaction', 'product_id', 'transaction_ref_id'),
    )
