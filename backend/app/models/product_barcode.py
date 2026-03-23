from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class ProductBarcode(Base):
    __tablename__ = "product_barcodes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # FK to products.id (MongoDB ObjectID string)
    product_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # EAN-13 barcode (13 digits)
    barcode: Mapped[str] = mapped_column(String(13), nullable=False, unique=True, index=True)

    # Optional: the 12-digit base used to generate (for auditing)
    base_digits: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)

    # Timestamps
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )

    # Relationship back to product
    product: Mapped["Product"] = relationship("Product", backref="barcodes")
