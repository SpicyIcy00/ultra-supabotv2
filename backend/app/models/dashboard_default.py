"""
Dashboard Default Model

Which stores / vending machines are pre-selected on the dashboard. Stored
server-side so the defaults configured in Settings follow the user to every
device, instead of living only in one browser's localStorage.
"""

from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DashboardDefault(Base):
    """
    A single pre-selected item for one dashboard scope.

    scope:   'stores' (item_id = stores.id) or 'vending' (item_id = device_code)
    item_id: the id to pre-select
    """
    __tablename__ = "dashboard_defaults"

    scope: Mapped[str] = mapped_column(String(20), primary_key=True)
    item_id: Mapped[str] = mapped_column(String(64), primary_key=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )
