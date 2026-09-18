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
    "bob",
    "warehouse",
    "settings",
    "packing",
    # Uploading the StoreHub purchase-order and stock-transfer exports. Like
    # every key here it starts disabled for every role, so it must be granted in
    # the admin screen before the import endpoint will accept a file.
    "storehub_imports",
    "admin",
]

ROLES: list[str] = ["admin", "warehouse_staff"]

# A PAGE KEY THAT WAS RENAMED KEEPS ANSWERING TO ITS OLD NAME (2026-09-19).
# The rename to Bob changed the key in code; the row the owner toggled on in
# the admin screen still says `george`, and the database was deliberately
# left as it was. So a stored `george` grants `bob`: the guard reads both
# names, and the allowed-page list reports the current one. Remove the alias
# once the rows have been renamed by hand.
PAGE_KEY_ALIASES: dict[str, tuple[str, ...]] = {"bob": ("george",)}


def stored_keys_for(page_key: str) -> tuple[str, ...]:
    """Every key a row may carry that grants `page_key`, current name first."""
    return (page_key, *PAGE_KEY_ALIASES.get(page_key, ()))


def canonical_page_key(stored: str) -> str:
    """The current name of a stored key, so a stale row reads as today's page."""
    for current, olds in PAGE_KEY_ALIASES.items():
        if stored in olds:
            return current
    return stored
