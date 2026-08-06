"""
Weimi vending machine models (brand: Hello Aji).

These tables are populated by an n8n sync job against the Weimi API — the app
never writes to them. They are declared here so the vending domain is part of
the app's known Supabase schema (column names + types in one place), the same
way the StoreHub tables are declared in store.py / transaction.py.

MONEY: every *_price / *_cost / *_amount money column in these raw tables is an
INTEGER in CENTS (2000 = PHP 20.00). Divide by 100 for pesos, or read from the
peso-formatted views (v_vending_orders_php, v_vending_order_lines_php).

CURRENCY: the raw `currency` column says "CNY" — that is a Weimi hardcoding bug.
The real currency is PHP. The _php views relabel it correctly.

Vending is its own domain: there are NO shared product IDs with the StoreHub
`products` table. Never join vending data to store data.
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class VendingDevice(Base):
    """A physical vending machine, e.g. 'CMG HQ' or 'OPUS dispenser'."""

    __tablename__ = "vending_devices"

    # Primary key - Weimi device code (stable machine identifier)
    device_code: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    # Human-readable machine name — use this for any UI/report label
    device_name: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    device_id: Mapped[Optional[str]] = mapped_column(String(64))

    # Physical layout
    cabinet_total: Mapped[Optional[int]] = mapped_column(Integer)
    layer_total: Mapped[Optional[int]] = mapped_column(Integer)
    aisle_total: Mapped[Optional[int]] = mapped_column(Integer)

    # Last time the n8n job refreshed this row
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    aisles: Mapped[List["VendingAisle"]] = relationship(
        "VendingAisle",
        back_populates="device"
    )
    orders: Mapped[List["VendingOrder"]] = relationship(
        "VendingOrder",
        back_populates="device"
    )


class VendingAisle(Base):
    """Live planogram / stock level for one aisle (slot) of a machine."""

    __tablename__ = "vending_aisles"

    # Primary key - Weimi aisle identifier
    aisle_id: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    device_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("vending_devices.device_code", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    aisle_code: Mapped[Optional[str]] = mapped_column(String(64))

    # Product loaded in this aisle (vending-only IDs — unrelated to products.id)
    goods_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    goods_name: Mapped[Optional[str]] = mapped_column(String(255))

    # Selling price in CENTS (divide by 100 for pesos)
    price: Mapped[Optional[int]] = mapped_column(Integer)

    # Stock levels
    curr_stock: Mapped[Optional[int]] = mapped_column(Integer)
    max_stock: Mapped[Optional[int]] = mapped_column(Integer)

    measurement: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[Optional[int]] = mapped_column(Integer)

    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Relationships
    device: Mapped["VendingDevice"] = relationship(
        "VendingDevice",
        back_populates="aisles"
    )

    __table_args__ = (
        Index('idx_vending_aisles_device_goods', 'device_code', 'goods_id'),
    )


class VendingOrder(Base):
    """Order header — one customer purchase at a machine (may contain lines)."""

    __tablename__ = "vending_orders"

    # Primary key - Weimi trade number
    trade_no_in: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    device_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("vending_devices.device_code", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    # Money in CENTS (divide by 100 for pesos)
    total_amount: Mapped[Optional[int]] = mapped_column(Integer)
    pay_amount: Mapped[Optional[int]] = mapped_column(Integer)

    pay_status: Mapped[Optional[int]] = mapped_column(Integer)

    trade_start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        index=True
    )
    pay_end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    is_cart_order: Mapped[Optional[bool]] = mapped_column(Boolean)

    # Raw Weimi payload extras — contains payWay (e.g. 'gcashpay')
    ext: Mapped[Optional[dict]] = mapped_column(JSONB)

    # Relationships
    device: Mapped["VendingDevice"] = relationship(
        "VendingDevice",
        back_populates="orders"
    )
    lines: Mapped[List["VendingOrderLine"]] = relationship(
        "VendingOrderLine",
        back_populates="order"
    )

    __table_args__ = (
        Index('idx_vending_orders_device_time', 'device_code', 'trade_start_time'),
    )


class VendingOrderLine(Base):
    """
    Order line item — THE vending sales fact table.

    One row = one item sold (with its own cost, price and timestamp). Product-
    level and machine-level totals are aggregated from here, never stored.
    """

    __tablename__ = "vending_order_lines"

    # Primary key - Weimi line trade number
    line_trade_no_in: Mapped[str] = mapped_column(String(64), primary_key=True, index=True)

    order_trade_no_in: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("vending_orders.trade_no_in", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    device_code: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("vending_devices.device_code", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    aisle_code: Mapped[Optional[str]] = mapped_column(String(64))

    goods_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    goods_name: Mapped[Optional[str]] = mapped_column(String(255))

    # Money in CENTS (divide by 100 for pesos).
    # goods_purchase_cost is 0 for products whose cost was never entered in the
    # Weimi backend — profit is overstated for those rows (see v_vending_missing_cost).
    goods_purchase_cost: Mapped[Optional[int]] = mapped_column(Integer)
    goods_retail_price: Mapped[Optional[int]] = mapped_column(Integer)
    real_price: Mapped[Optional[int]] = mapped_column(Integer)

    # Units sold on this line
    goods_amount: Mapped[Optional[int]] = mapped_column(Integer)

    # 1 = vend succeeded, 3 = vend failed (item never dispensed)
    shipment_status: Mapped[Optional[int]] = mapped_column(Integer, index=True)
    shipment_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        index=True
    )

    # Relationships
    order: Mapped["VendingOrder"] = relationship(
        "VendingOrder",
        back_populates="lines"
    )

    __table_args__ = (
        Index('idx_vending_lines_device_time', 'device_code', 'shipment_time'),
        Index('idx_vending_lines_goods', 'goods_id', 'shipment_time'),
    )
