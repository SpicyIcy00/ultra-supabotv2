"""
SQLAlchemy models for authority: who approves, the line, and the requests.

The reasoning for the shape is in the migration
(2026_09_22_0002-b3c4d5e6f7a8). The short version, because it governs what may
be added here later: the line's VALUE is a person's binding and lives in
`authority_versions`, one immutable row per change; what the line MEANS, its
bounds and its modes are metrics.yaml `authority.line`. A request carries the
value code computed for it and the version that routed it. Nothing here
records anything being sent, because nothing is.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

PERSON_ROLES = ("approver", "builder", "requester")
AUTHORITY_MODES = ("over_line", "every_draft", "never")
REQUEST_ROUTES = ("list", "decision")
REQUEST_STATUSES = ("waiting", "approved", "rejected", "changed")
REQUEST_KINDS = ("purchase_draft",)


class BobPerson(Base):
    """One person Bob works with, and what they may decide."""

    __tablename__ = "people"
    __table_args__ = (
        CheckConstraint("role IN ('approver', 'builder', 'requester')", name="ck_people_role"),
        CheckConstraint("username IS NULL OR username = lower(username)",
                        name="ck_people_username_lowercase"),
        {"schema": "george"},
    )

    person_key: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    businesses: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    username: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    linked_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class BobAuthorityVersion(Base):
    """One version of the line. Inserted, never updated."""

    __tablename__ = "authority_versions"
    __table_args__ = (
        CheckConstraint("mode IN ('over_line', 'every_draft', 'never')",
                        name="ck_authority_versions_mode"),
        CheckConstraint("(mode = 'over_line') = (line_php IS NOT NULL)",
                        name="ck_authority_versions_line_matches_mode"),
        CheckConstraint("line_php IS NULL OR line_php > 0",
                        name="ck_authority_versions_line_positive"),
        CheckConstraint("version >= 1", name="ck_authority_versions_version"),
        CheckConstraint("length(btrim(said)) > 0", name="ck_authority_versions_said"),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    rule: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    line_php: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    said: Mapped[str] = mapped_column(Text, nullable=False)
    set_by: Mapped[str] = mapped_column(Text, nullable=False)
    set_by_person: Mapped[str] = mapped_column(
        Text, ForeignKey("george.people.person_key"), nullable=False)
    set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now())
    conversation_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class BobRequest(Base):
    """One draft waiting on a person, or what a person decided about it."""

    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint("kind IN ('purchase_draft')", name="ck_requests_kind"),
        CheckConstraint("routed IN ('list', 'decision')", name="ck_requests_routed"),
        CheckConstraint("status IN ('waiting', 'approved', 'rejected', 'changed')",
                        name="ck_requests_status"),
        CheckConstraint("(status = 'waiting') = (decided_at IS NULL)",
                        name="ck_requests_decided_when_not_waiting"),
        CheckConstraint("value_php >= 0", name="ck_requests_value_not_negative"),
        CheckConstraint("jsonb_typeof(lines) = 'array'", name="ck_requests_lines_array"),
        Index("ix_requests_status_created", "status", text("created_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_call: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    lines: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    moves: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    value_php: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    unpriced_lines: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    snapshot_timestamp: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True)
    routed: Mapped[str] = mapped_column(Text, nullable=False)
    routed_because: Mapped[str] = mapped_column(Text, nullable=False)
    authority_version_id: Mapped[Optional[UUID]] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("george.authority_versions.id"), nullable=True)
    line_php: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)
    requested_by: Mapped[str] = mapped_column(Text, nullable=False)
    requested_by_person: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'waiting'"))
    decided_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by_person: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    replaces: Mapped[Optional[UUID]] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("george.requests.id"), nullable=True)
    conversation_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now())
