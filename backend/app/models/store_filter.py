"""
Store Filter Model

Stores configuration for which stores to include in different query types.
"""

import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class StoreFilter(Base):
    """
    Configuration for store filtering in AI chat queries.

    filter_type: 'sales' or 'inventory'
    store_name: Name of the store to include in this filter type
    """
    __tablename__ = "store_filters"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )
    filter_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    store_name: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )
