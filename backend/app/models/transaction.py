from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Numeric, Boolean, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Transaction(Base):
    __tablename__ = "new_transactions"

    # Primary key - using ref_id as per specification
    ref_id: Mapped[str] = mapped_column(String(100), primary_key=True, index=True)

    # Transaction identifiers
    invoice_number: Mapped[Optional[str]] = mapped_column(String(100), index=True)

    # Foreign keys - MongoDB ObjectID for store
    store_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("stores.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    register_id: Mapped[Optional[str]] = mapped_column(String(50))
    employee_id: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    customer_ref_id: Mapped[Optional[str]] = mapped_column(String(100))

    # Transaction details
    transaction_type: Mapped[Optional[str]] = mapped_column(String(50), index=True)
    transaction_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True
    )

    # Financial data
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    sub_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    tax: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    rounded_amount: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)
    service_charge: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), default=0)

    # Cancellation info
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(100))
    cancelled_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Additional info
    comment: Mapped[Optional[str]] = mapped_column(String(500))
    return_reason: Mapped[Optional[str]] = mapped_column(String(255))
    sale_invoice_number: Mapped[Optional[str]] = mapped_column(String(100))
    channel: Mapped[Optional[str]] = mapped_column(String(50))
    table_id: Mapped[Optional[str]] = mapped_column(String(50))

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
    store: Mapped["Store"] = relationship("Store", back_populates="transactions")
    items: Mapped[List["TransactionItem"]] = relationship(
        "TransactionItem",
        back_populates="transaction",
        cascade="all, delete-orphan"
    )

    # Compound indexes for common queries
    __table_args__ = (
        Index('idx_transaction_time_store', 'transaction_time', 'store_id'),
        Index('idx_transaction_type_time', 'transaction_type', 'transaction_time'),
    )
