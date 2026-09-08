"""
SQLAlchemy models for george.pages and george.page_events.

A PAGE IS A ROW NOW (2026-09-08, Page Workshop V1). Until this date a page was
derived from its pins — the distinct `page` labels one person's pins carried —
and CLAUDE.md recorded what would force a table. Two of those arrived together:
an empty page has to exist, and a page's identity has to survive a rename, so
that the thread bound to it, the URL that opens it, the reader George reads it
through and the writer he edits it through all keep pointing at the same thing
when it is called something else. See the migration (q1r2s3t4u5v6).

WHAT STAYS TRUE
  - A page is one person's, because its pins are. `owner` scopes every
    statement; RLS is off for the reason the pins migration gives.
  - The title is presentation, not identity. UNIQUE (owner, title) keeps the
    exact-name rule; the case-collision refusal lives in the service, where it
    can be overridden deliberately, as it always could.
  - Ungrouped is NOT a page. It is `pins.page_id IS NULL`, it has no row, and
    nothing here can rename it, describe it or delete it.
  - Nothing here holds a figure. A page holds pins; a pin holds calls.

PURPOSE is a single line a person wrote about what the page is for. It is shown
under the title, it is editable, and when George reads the page it is handed to
him labelled as the user's own description. It is never an instruction and
never overrides a rule, a definition, a tool constraint or a boundary.

PAGE EVENTS are the audit of structural writes — create, rename, purpose, add,
remove, move, place, delete — whoever made them. A button and George's injected
writer take the same service path and leave the same record, so "who moved
this" has one answer. Metadata only: a title, a page id, a position. Never a
replayed result.

Written by the APPLICATION role, like every george.* table the app owns.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, Index, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Who made a structural write. Mirrored by ck_page_events_actor.
PAGE_EVENT_ACTORS = ("user", "george")

# The structural operations a page can undergo. One vocabulary for the service,
# the audit, the model-facing tool and the UI, so the same act cannot be
# recorded under two names.
PAGE_OPERATIONS = (
    "create",        # a page came into being
    "rename",        # its title changed
    "set_purpose",   # its purpose changed (or was cleared)
    "add",           # a pin joined the page (new, or from Ungrouped / another page)
    "remove",        # a pin left the page for Ungrouped; nothing deleted
    "move",          # a pin left this page for another page
    "place",         # a pin changed position within the page
    "delete",        # the page row was deleted; its pins went to Ungrouped
)


class GeorgePage(Base):
    __tablename__ = "pages"
    __table_args__ = (
        CheckConstraint("title = btrim(title)", name="ck_pages_title_trimmed"),
        CheckConstraint("length(title) BETWEEN 1 AND 100", name="ck_pages_title_length"),
        CheckConstraint(
            "purpose IS NULL OR (purpose = btrim(purpose) "
            "AND length(purpose) BETWEEN 1 AND 200 "
            "AND position(chr(10) in purpose) = 0)",
            name="ck_pages_purpose_shape",
        ),
        UniqueConstraint("owner", "title", name="uq_pages_owner_title"),
        Index("ix_pages_owner_updated", "owner", text("updated_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    owner: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class GeorgePageEvent(Base):
    __tablename__ = "page_events"
    __table_args__ = (
        CheckConstraint("actor IN ('user', 'george')", name="ck_page_events_actor"),
        Index("ix_page_events_page_at", "page_id", text("at DESC")),
        Index("ix_page_events_owner_at", "owner", text("at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    # No FK on purpose: the record outlives the page.
    page_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))
    owner: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    operation: Mapped[str] = mapped_column(Text, nullable=False)
    pin_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))
    before: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    after: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB)
    conversation_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
