from datetime import date, datetime
from typing import Optional, List
from sqlalchemy import Boolean, Date, String, DateTime, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Store(Base):
    __tablename__ = "stores"

    # Primary key - MongoDB ObjectID (24-character hex string)
    id: Mapped[str] = mapped_column(String(24), primary_key=True, index=True)

    # Store details
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(255))  # UI-only label (never used in SQL)
    color: Mapped[Optional[str]] = mapped_column(String(20))          # Hex color e.g. '#E74C3C'
    address1: Mapped[Optional[str]] = mapped_column(String(255))
    address2: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    state: Mapped[Optional[str]] = mapped_column(String(100))
    country: Mapped[Optional[str]] = mapped_column(String(100))
    postal_code: Mapped[Optional[str]] = mapped_column(String(20))

    # Lifecycle. A store is open unless someone says otherwise.
    #
    # These describe the STORE. Which stores a given question covers is a
    # different matter and stays in definitions/metrics.yaml — see
    # stores.active_retail, stores.closed and filters.excluded_from_sales.
    # Keeping scope out of this table is what stops two sources of truth for
    # "is this store in scope" from disagreeing.
    #
    # AJI MACOPA (closed 2026-06-24) is the first row to use them.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    closed_at: Mapped[Optional[date]] = mapped_column(Date)

    # Contact information
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    email: Mapped[Optional[str]] = mapped_column(String(255))
    website: Mapped[Optional[str]] = mapped_column(String(255))

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
    transactions: Mapped[List["Transaction"]] = relationship(
        "Transaction",
        back_populates="store"
    )
    inventory: Mapped[List["Inventory"]] = relationship(
        "Inventory",
        back_populates="store"
    )
