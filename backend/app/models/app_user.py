import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AppUser(Base):
    """A person who can log in. Roles are 'admin' or 'warehouse_staff'."""

    __tablename__ = "app_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Stored lowercased — logins are matched case-insensitively.
    username: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Login is passcode-only: staff type one code, no username. It resolves to
    # this row, which supplies the role and the created_by for packing lists.
    # Nullable — a user without a passcode simply cannot sign in.
    passcode_hash: Mapped[Optional[str]] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="warehouse_staff")
    display_name: Mapped[Optional[str]] = mapped_column(String(120))

    # Deactivated instead of deleted, so past packing lists keep a valid created_by.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )
