"""
SQLAlchemy models for watches.

The reasoning for the shape is in the migration
(2026_09_11_0002-t4u5v6w7x8y9). The short version, because it governs what may
be added here later: a watch names a CONDITION from `metrics.yaml`
`watches.conditions` and carries no number of its own except the time it runs.
If a future change wants a threshold column, the answer is a definition in
`brief:` with a measurement beside it, not a column here.
"""

from datetime import date, datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Integer,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# quiet           checked, nothing changed — the normal outcome
# fired           the firing set changed and a post was written
# failed          the check could not run
# stale_backtest  the definitions moved under it; it has stopped and said so
WATCH_STATUSES = ("quiet", "fired", "failed", "stale_backtest")

WATCH_DIRECTIONS = ("down", "up", "either")
WATCH_KINDS = ("daily", "weekly")


class BobWatch(Base):
    """One condition, its scope, its slot, and what it saw last time."""

    __tablename__ = "watches"
    __table_args__ = (
        CheckConstraint("direction IN ('down', 'up', 'either')",
                        name="ck_watches_direction"),
        CheckConstraint("kind IN ('daily', 'weekly')", name="ck_watches_kind"),
        CheckConstraint("hour BETWEEN 0 AND 23", name="ck_watches_hour"),
        CheckConstraint("minute BETWEEN 0 AND 59", name="ck_watches_minute"),
        CheckConstraint(
            "(kind = 'daily' AND days_of_week IS NULL) OR "
            "(kind = 'weekly' AND days_of_week IS NOT NULL "
            " AND array_length(days_of_week, 1) BETWEEN 1 AND 7)",
            name="ck_watches_days_match_kind",
        ),
        CheckConstraint("stores IS NULL OR array_length(stores, 1) >= 1",
                        name="ck_watches_stores_not_empty"),
        # Architecture rule 7, as a constraint rather than only a service rule.
        CheckConstraint("NOT enabled OR backtest IS NOT NULL",
                        name="ck_watches_backtested_before_enabled"),
        CheckConstraint(
            "last_status IS NULL OR last_status IN "
            "('quiet', 'fired', 'failed', 'stale_backtest')",
            name="ck_watches_last_status",
        ),
        Index("ix_watches_due", "last_slot", postgresql_where=text("enabled")),
        Index("ix_watches_owner", "owner", text("created_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    owner: Mapped[str] = mapped_column(Text, nullable=False)
    condition: Mapped[str] = mapped_column(Text, nullable=False)
    direction: Mapped[str] = mapped_column(Text, nullable=False,
                                           server_default="either")
    #: NULL means every shop. An empty list is refused — it can never fire.
    stores: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)

    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="daily")
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    days_of_week: Mapped[Optional[list[int]]] = mapped_column(ARRAY(Integer),
                                                              nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False,
                                          server_default=text("false"))

    backtest: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    last_slot: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    claimed_by: Mapped[Optional[str]] = mapped_column(Text)

    last_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_fired_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[Optional[str]] = mapped_column(Text)
    last_error: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BobWatchCheck(Base):
    """
    One check, fired or not.

    THE QUIET ONES ARE THE POINT. Without them, "quiet for eleven days" and
    "broken for eleven days" are the same observation from outside, and the
    second is the one somebody needs.
    """

    __tablename__ = "watch_checks"
    __table_args__ = (
        Index("ix_watch_checks_watch", "watch_id", text("checked_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    #: No FK: the record of a check outlives the watch it belonged to.
    watch_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    fired: Mapped[bool] = mapped_column(Boolean, nullable=False,
                                        server_default=text("false"))
    state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    changed: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    post_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))
    definitions_version: Mapped[Optional[str]] = mapped_column(Text)
    error: Mapped[Optional[str]] = mapped_column(Text)
