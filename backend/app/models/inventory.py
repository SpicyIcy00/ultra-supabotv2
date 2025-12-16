from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Inventory(Base):
    __tablename__ = "inventory"

    # Composite primary key using product_id and store_id (MongoDB ObjectIDs)
    product_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
        index=True
    )
    store_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("stores.id", ondelete="CASCADE"),
        primary_key=True,
        index=True
    )

    # Inventory levels
    quantity_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warning_stock: Mapped[Optional[int]] = mapped_column(Integer)
    ideal_stock: Mapped[Optional[int]] = mapped_column(Integer)

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
    product: Mapped["Product"] = relationship(
        "Product",
        back_populates="inventory"
    )
    store: Mapped["Store"] = relationship(
        "Store",
        back_populates="inventory"
    )

    # Compound indexes for common queries
    __table_args__ = (
        Index('idx_product_store', 'product_id', 'store_id'),
        Index('idx_store_product', 'store_id', 'product_id'),
    )
