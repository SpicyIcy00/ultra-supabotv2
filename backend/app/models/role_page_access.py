from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class RolePageAccess(Base):
    """
    Which pages a role may see. Toggled at runtime from /admin/page-access so
    access changes never need a redeploy.
    """

    __tablename__ = "role_page_access"

    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    page_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


# The full page list. Seeded for every role so the admin screen always renders a
# complete matrix, and so a new page never silently defaults to "visible".
PAGE_KEYS: list[str] = [
    "dashboard",
    "analytics",
    "ai_chat",
    "george",
    "warehouse",
    "settings",
    "packing",
    "admin",
]

ROLES: list[str] = ["admin", "warehouse_staff"]
