from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Numeric, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Product(Base):
    __tablename__ = "products"

    # Primary key - MongoDB ObjectID (24-character hex string)
    id: Mapped[str] = mapped_column(String(24), primary_key=True, index=True)

    # Product details
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), index=True)
    price_type: Mapped[Optional[str]] = mapped_column(String(50))

    # Pricing
    unit_price: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))
    cost: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))

    # Inventory flags
    track_stock_level: Mapped[bool] = mapped_column(Boolean, default=True)
    is_parent_product: Mapped[bool] = mapped_column(Boolean, default=False)

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
    transaction_items: Mapped[List["TransactionItem"]] = relationship(
        "TransactionItem",
        back_populates="product"
    )
    inventory: Mapped[List["Inventory"]] = relationship(
        "Inventory",
        back_populates="product"
    )
