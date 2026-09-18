"""
SQLAlchemy model for george.pins.

A pin is an answer that became a live tile. It stores the TOOL CALLS behind the
answer and re-runs them on load, so the tile shows current numbers rather than a
frozen one. There is deliberately no answer text here — see the migration
(j4k5l6m7n8o9) for why.

Written by the APPLICATION role, not by either Bob role: george_ro is
read-only and has no access to this schema, and george_log has INSERT without
SELECT so it could never list a pin. Reading and deleting are scoped to
created_by IN THE QUERY, because this table deliberately has RLS off.

MEMBERSHIP IS A FOREIGN KEY NOW (2026-09-08, Page Workshop V1). `page_id`
points at george.pages; NULL is Ungrouped, which stays virtual. `position` is
the pin's place on its page — dense 0..n-1, owned and renumbered by the
service on every structural write, never supplied by a caller as a raw
integer. On the ungrouped pins position is meaningless and the order stays
created_at DESC. The old `page` text column is gone; `page` below is the
title of the page the pin sits on, read through the relationship, so every
consumer that showed a page NAME still can — but nothing writes one.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.bob_page import BobPage

# The states a pin (or one of its tool calls) can be in after a run. Kept here
# and mirrored by the CHECK constraint in the migration.
#   ok          ran and returned data
#   refused     the tool raised — a real answer, not a bug
#   unrunnable  the tool or an argument no longer exists
#   failed      timeout, connection, or an unexpected exception
PIN_STATUSES = ("ok", "refused", "unrunnable", "failed")


class BobPin(Base):
    __tablename__ = "pins"
    __table_args__ = (
        CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('ok', 'refused', 'unrunnable', 'failed')",
            name="ck_pins_last_status",
        ),
        CheckConstraint("jsonb_array_length(tool_calls) > 0",
                        name="ck_pins_tool_calls_not_empty"),
        CheckConstraint("position >= 0", name="ck_pins_position_non_negative"),
        Index("ix_pins_owner_created", "created_by", text("created_at DESC")),
        Index("ix_pins_page_position", "page_id", "position"),
        Index("ix_pins_owner_page_id", "created_by", "page_id"),
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

    # NULL means ungrouped. SET NULL on delete is the database's backstop; the
    # service ungroups explicitly so positions stay dense.
    page_id: Mapped[Optional[UUID]] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("george.pages.id", name="fk_pins_page", ondelete="SET NULL"),
    )
    # Dense 0..n-1 within a real page; unused when page_id is NULL.
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # Loaded with the pin, always, so `page` below can be read on an object
    # that came back from any select without a lazy load — which the async
    # session would refuse. Code that sets page_id on a loaded pin must set
    # this too; the service does, in one place.
    page_obj: Mapped[Optional[BobPage]] = relationship(BobPage, lazy="joined")

    # [{tool, arguments}, ...] in call order.
    tool_calls: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)

    # What lets a failing tile say when it last worked.
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_ok_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[Optional[str]] = mapped_column(Text)

    @property
    def page(self) -> Optional[str]:
        """The TITLE of the page this pin sits on, or None for Ungrouped. Read-only."""
        return self.page_obj.title if self.page_obj is not None else None
