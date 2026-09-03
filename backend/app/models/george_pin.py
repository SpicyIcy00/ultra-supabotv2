"""
SQLAlchemy model for george.pins.

A pin is an answer that became a live tile. It stores the TOOL CALLS behind the
answer and re-runs them on load, so the tile shows current numbers rather than a
frozen one. There is deliberately no answer text here — see the migration
(j4k5l6m7n8o9) for why.

Written by the APPLICATION role, not by either George role: george_ro is
read-only and has no access to this schema, and george_log has INSERT without
SELECT so it could never list a pin. Reading and deleting are scoped to
created_by IN THE QUERY, because this table deliberately has RLS off.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Index, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# The states a pin (or one of its tool calls) can be in after a run. Kept here
# and mirrored by the CHECK constraint in the migration.
#   ok          ran and returned data
#   refused     the tool raised — a real answer, not a bug
#   unrunnable  the tool or an argument no longer exists
#   failed      timeout, connection, or an unexpected exception
PIN_STATUSES = ("ok", "refused", "unrunnable", "failed")


class GeorgePin(Base):
    __tablename__ = "pins"
    __table_args__ = (
        CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('ok', 'refused', 'unrunnable', 'failed')",
            name="ck_pins_last_status",
        ),
        CheckConstraint("jsonb_array_length(tool_calls) > 0",
                        name="ck_pins_tool_calls_not_empty"),
        CheckConstraint("page IS NULL OR page = btrim(page)",
                        name="ck_pins_page_trimmed"),
        CheckConstraint("page IS NULL OR length(page) > 0",
                        name="ck_pins_page_not_blank"),
        Index("ix_pins_owner_created", "created_by", text("created_at DESC")),
        Index("ix_pins_owner_page", "created_by", "page"),
        Index("ix_pins_owner_page_lower", "created_by", text("lower(page)")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)

    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    title: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[Optional[str]] = mapped_column(Text)
    conversation_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    # NULL means ungrouped. Normalised on write; a case-insensitive
    # near-duplicate is refused rather than silently forking a page.
    page: Mapped[Optional[str]] = mapped_column(Text)

    # [{tool, arguments}, ...] in call order.
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    # What lets a failing tile say when it last worked.
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_ok_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[Optional[str]] = mapped_column(Text)
