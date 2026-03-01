"""
Report Preset Model

Stores saved report configurations including filters, column selections,
and other display preferences.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.sql import func
from app.core.database import Base


class ReportPreset(Base):
    """
    Report preset model for saving report configurations.

    Attributes:
        id: Primary key
        name: User-friendly name for the preset
        report_type: Type of report (e.g., 'product-sales', 'analytics')
        config: JSON field containing all preset configuration:
            - filters: Category, quantity range, top N, etc.
            - columns: Which columns to show/hide
            - sorting: Sort field and direction
            - stores: Optional saved store selections
            - dates: Optional saved date ranges
        is_default: Whether this is the default preset to load
        created_at: Timestamp when preset was created
        updated_at: Timestamp when preset was last modified
    """

    __tablename__ = "report_presets"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    report_type = Column(String(100), nullable=False, index=True)
    config = Column(JSON, nullable=False, default={})
    is_default = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<ReportPreset(id={self.id}, name='{self.name}', type='{self.report_type}', default={self.is_default})>"
