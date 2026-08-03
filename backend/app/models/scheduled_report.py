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

    # When to run (Manila time). frequency: 'daily' | 'weekly' | 'monthly'.
    frequency: Mapped[str] = mapped_column(String(10), nullable=False, default="daily")

    # Legacy single-slot fields (kept for backward compatibility / fallback).
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    hour: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    minute: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Flexible schedule (JSON-encoded). When present these win over the legacy
    # fields above.
    #   times          -> ["08:00", "17:30"]      (one or more times per day)
    #   days_of_week   -> [0, 3]                   (Mon=0 … Sun=6; used when weekly)
    #   days_of_month  -> [1, 15, 31]              (used when monthly; 31 => last day)
    times: Mapped[str | None] = mapped_column(Text, nullable=True)
    days_of_week: Mapped[str | None] = mapped_column(Text, nullable=True)
    days_of_month: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Delivery. telegram_chat_id keeps the first/primary chat for compat;
    # telegram_chat_ids (JSON) holds the full list of recipients.
    telegram_chat_id: Mapped[str] = mapped_column(String(64), nullable=False)
    telegram_chat_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
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
