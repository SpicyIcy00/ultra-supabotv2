from datetime import date, datetime
from typing import Optional
from sqlalchemy import (
    String, Integer, Numeric, Date, DateTime, Boolean,
    ForeignKey, Index, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class StoreTier(Base):
    __tablename__ = "store_tiers"

    store_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("stores.id", ondelete="CASCADE"),
        primary_key=True
    )
    tier: Mapped[str] = mapped_column(String(1), nullable=False)  # 'A' or 'B'
    safety_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    target_cover_days: Mapped[int] = mapped_column(Integer, nullable=False, default=7)
    expiry_window_days: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )

    store: Mapped["Store"] = relationship("Store")


class StorePipeline(Base):
    __tablename__ = "store_pipeline"

    store_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("stores.id", ondelete="CASCADE"),
        primary_key=True
    )
    sku_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True
    )
    on_order_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )

    store: Mapped["Store"] = relationship("Store")
    product: Mapped["Product"] = relationship("Product")

    __table_args__ = (
        Index('idx_pipeline_store_sku', 'store_id', 'sku_id'),
    )


class WarehouseInventory(Base):
    __tablename__ = "warehouse_inventory"

    sku_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True
    )
    wh_on_hand_units: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )

    product: Mapped["Product"] = relationship("Product")


class SeasonalityCalendar(Base):
    __tablename__ = "seasonality_calendar"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    multiplier: Mapped[float] = mapped_column(
        Numeric(5, 3), nullable=False, default=1.0
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now()),
        onupdate=func.timezone('Asia/Manila', func.now())
    )

    __table_args__ = (
        Index('idx_seasonality_dates', 'start_date', 'end_date'),
    )


class ShipmentPlan(Base):
    __tablename__ = "shipment_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    store_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("stores.id", ondelete="CASCADE"),
        nullable=False
    )
    sku_id: Mapped[str] = mapped_column(
        String(24),
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False
    )

    # Calculation fields
    avg_daily_sales: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    season_adjusted_daily_sales: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    safety_stock: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    min_level: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    max_level: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    expiry_cap: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    final_max: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Inventory position
    on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    on_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inventory_position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Shipment quantities
    requested_ship_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allocated_ship_qty: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Priority and metrics
    priority_score: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False, default=0)
    days_of_stock: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)

    # Metadata
    calculation_mode: Mapped[str] = mapped_column(String(20), nullable=False, default="fallback")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )

    store: Mapped["Store"] = relationship("Store")
    product: Mapped["Product"] = relationship("Product")

    __table_args__ = (
        Index('idx_shipment_run_store_sku', 'run_date', 'store_id', 'sku_id'),
        Index('idx_shipment_run_date', 'run_date'),
    )


class InventorySnapshot(Base):
    """Maps to the existing inventory_snapshots table in Supabase (created via n8n).
    This model is read-only for the replenishment module."""
    __tablename__ = "inventory_snapshots"

    product_id: Mapped[str] = mapped_column(
        String(24),
        primary_key=True
    )
    store_id: Mapped[str] = mapped_column(
        String(24),
        primary_key=True
    )
    snapshot_date: Mapped[date] = mapped_column(
        Date,
        primary_key=True
    )
    quantity_on_hand: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.timezone('Asia/Manila', func.now())
    )

    __table_args__ = (
        Index('idx_snapshot_date_store', 'snapshot_date', 'store_id'),
        Index('idx_snapshot_store_product', 'store_id', 'product_id'),
    )
