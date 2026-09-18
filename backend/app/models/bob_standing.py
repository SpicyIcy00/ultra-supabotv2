"""
The model for a standing question: a question Bob is asked on a schedule.

The reasoning for the shape is in the migration
(2026_09_11_0001-s3t4u5v6w7x8). The short version, because it governs what may
be added here later: this table holds WHAT was asked, HOW the owner wants it
answered, and WHEN. It holds no threshold, no metric, no window and no store
list — a schedule is scope, and a business definition lives in metrics.yaml
where it was measured.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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

# Daily or weekly. Monthly exists for workflows and is deliberately not offered
# here: a question asked once a month is answered against a window nobody
# remembers asking about, and nothing in the owner's description of this wanted
# one. Adding it is one string and a migration, when something asks for it.
STANDING_KINDS = ("daily", "weekly")

# ok       Bob answered
# failed   the turn raised, or produced nothing
# refused  the question could not be asked at all (no capability, no model)
STANDING_STATUSES = ("ok", "failed", "refused")

# How many an owner may have. A bound rather than a rule: it exists so a
# misunderstanding cannot fill the table, not because eleven would be wrong.
MAX_PER_OWNER = 10

# How many standing instructions one question may carry, matched by a CHECK.
# Past a handful they stop steering and start being a second prompt.
MAX_INSTRUCTIONS = 8
MAX_INSTRUCTION_LENGTH = 200


class BobStandingQuestion(Base):
    """One question, its standing instructions, its slot, and what happened last."""

    __tablename__ = "standing_questions"
    __table_args__ = (
        CheckConstraint("question = btrim(question) "
                        "AND length(question) BETWEEN 3 AND 500",
                        name="ck_standing_question_shape"),
        CheckConstraint("kind IN ('daily', 'weekly')", name="ck_standing_kind"),
        CheckConstraint("hour BETWEEN 0 AND 23", name="ck_standing_hour"),
        CheckConstraint("minute BETWEEN 0 AND 59", name="ck_standing_minute"),
        CheckConstraint(
            "(kind = 'daily' AND days_of_week IS NULL) OR "
            "(kind = 'weekly' AND days_of_week IS NOT NULL "
            " AND array_length(days_of_week, 1) BETWEEN 1 AND 7)",
            name="ck_standing_days_match_kind",
        ),
        CheckConstraint("jsonb_typeof(instructions) = 'array' "
                        "AND jsonb_array_length(instructions) <= 8",
                        name="ck_standing_instructions_shape"),
        CheckConstraint(
            "last_status IS NULL OR last_status IN ('ok', 'failed', 'refused', 'silent')",
            name="ck_standing_last_status",
        ),
        Index("ix_standing_due", "last_slot", postgresql_where=text("enabled")),
        Index("ix_standing_owner", "owner", text("created_at DESC")),
        {"schema": "george"},
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True)
    owner: Mapped[str] = mapped_column(Text, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    kind: Mapped[str] = mapped_column(Text, nullable=False, server_default="daily")
    hour: Mapped[int] = mapped_column(Integer, nullable=False)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    days_of_week: Mapped[Optional[list[int]]] = mapped_column(ARRAY(Integer), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False,
                                          server_default=text("false"))

    last_slot: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    claimed_by: Mapped[Optional[str]] = mapped_column(Text)

    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[Optional[str]] = mapped_column(Text)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    last_thread_id: Mapped[Optional[UUID]] = mapped_column(PgUUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
