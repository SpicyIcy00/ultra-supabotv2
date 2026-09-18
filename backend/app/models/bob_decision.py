"""
The model for a decision: what a person did with something Bob raised.

The reasoning for the shape is in the migration (2026_09_12_0002-v6w7x8y9z0a1).
The short version, because it governs what may be added here later: this
table holds a GESTURE — kept, set aside, opened, asked about, left — on one
attention row, by whom and when. It holds no figure, no threshold and no
ranking: the ranking is get_attention's, computed from these rows each
morning by rules that live in metrics.yaml attention.learning.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# kept       held on to it on the board
# dismissed  set it aside
# opened     opened it to look
# asked      asked why
# left       put the morning away with it still on the board
#
# Matched by the CHECK below and by metrics.yaml attention.learning.outcomes;
# tests/test_attention_contract.py holds the three together.
DECISION_OUTCOMES = ("kept", "dismissed", "opened", "asked", "left")


class BobDecision(Base):
    """One recorded gesture on one attention row."""

    __tablename__ = "decisions"
    __table_args__ = (
        CheckConstraint(
            "outcome IN ('kept', 'dismissed', 'opened', 'asked', 'left')",
            name="ck_decisions_outcome",
        ),
        CheckConstraint("length(btrim(what)) > 0", name="ck_decisions_what_not_blank"),
        Index("ix_decisions_what_recent", "what", text("decided_at DESC")),
        Index("ix_decisions_decided_at", "decided_at"),
        {"schema": "george"},
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    what: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    outcome: Mapped[str] = mapped_column(Text, nullable=False)
    raised_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    decided_by: Mapped[str] = mapped_column(Text, nullable=False)
    thread_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
