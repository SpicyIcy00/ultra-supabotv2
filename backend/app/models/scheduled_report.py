"""
Scheduled AI-chat reports.

Persists a chat-generated report (its natural-language question + the SQL that
produced it) plus a delivery schedule, so the backend can re-run the same query
on future days and push the result to Telegram.
"""
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)

    # What to run
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    sql: Mapped[str] = mapped_column(Text, nullable=False)

    # When to run (Manila time). frequency: 'daily' | 'weekly'.
    # day_of_week: Monday=0 … Sunday=6 (only used when frequency == 'weekly').
    frequency: Mapped[str] = mapped_column(String(10), nullable=False, default="daily")
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Delivery
    telegram_chat_id: Mapped[str] = mapped_column(String(64), nullable=False)
    include_csv: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Run bookkeeping
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_run_detail: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("Asia/Manila", func.now()),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone("Asia/Manila", func.now()),
        onupdate=func.timezone("Asia/Manila", func.now()),
    )
