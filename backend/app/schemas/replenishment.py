from datetime import date, datetime
from typing import Optional, List, Literal
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


# --- Store Tier Schemas ---

class StoreTierCreate(BaseModel):
    store_id: str = Field(..., max_length=24)
    tier: Literal["A", "B"]
    safety_days: int = Field(default=3, ge=1)
    target_cover_days: int = Field(default=7, ge=1)
    expiry_window_days: int = Field(default=60, ge=1)


class StoreTierUpdate(BaseModel):
    tier: Optional[Literal["A", "B"]] = None
    safety_days: Optional[int] = Field(None, ge=1)
    target_cover_days: Optional[int] = Field(None, ge=1)
    expiry_window_days: Optional[int] = Field(None, ge=1)


class StoreTierResponse(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    tier: str
    safety_days: int
    target_cover_days: int
    expiry_window_days: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Store Pipeline Schemas ---

class StorePipelineItem(BaseModel):
    store_id: str = Field(..., max_length=24)
    sku_id: str = Field(..., max_length=24)
    on_order_units: int = Field(default=0, ge=0)


class StorePipelineBulkUpdate(BaseModel):
    items: List[StorePipelineItem]


class StorePipelineResponse(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    sku_id: str
    product_name: Optional[str] = None
    on_order_units: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Warehouse Inventory Schemas ---

class WarehouseInventoryItem(BaseModel):
    sku_id: str = Field(..., max_length=24)
    wh_on_hand_units: int = Field(default=0, ge=0)


class WarehouseInventoryBulkUpdate(BaseModel):
    items: List[WarehouseInventoryItem]


class WarehouseInventoryResponse(BaseModel):
    sku_id: str
    product_name: Optional[str] = None
    category: Optional[str] = None
    wh_on_hand_units: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Seasonality Calendar Schemas ---

class SeasonalityCalendarCreate(BaseModel):
    start_date: date
    end_date: date
    multiplier: Decimal = Field(default=Decimal("1.000"), ge=0, le=10)
    label: str = Field(..., max_length=100)


class SeasonalityCalendarUpdate(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    multiplier: Optional[Decimal] = Field(None, ge=0, le=10)
    label: Optional[str] = Field(None, max_length=100)


class SeasonalityCalendarResponse(BaseModel):
    id: int
    start_date: date
    end_date: date
    multiplier: float
    label: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Shipment Plan Schemas ---

class ShipmentPlanItem(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    sku_id: str
    product_name: Optional[str] = None
    category: Optional[str] = None
    avg_daily_sales: float
    season_adjusted_daily_sales: float
    safety_stock: float
    min_level: float
    max_level: float
    expiry_cap: float
    final_max: float
    on_hand: int
    on_order: int
    inventory_position: int
    requested_ship_qty: int
    allocated_ship_qty: int
    priority_score: float
    days_of_stock: float

    model_config = ConfigDict(from_attributes=True)


class ShipmentPlanResponse(BaseModel):
    run_date: date
    calculation_mode: str
    snapshot_days_available: int
    items: List[ShipmentPlanItem]
    summary: "ShipmentPlanSummary"


class ShipmentPlanSummary(BaseModel):
    total_stores: int
    total_skus: int
    total_requested_units: int
    total_allocated_units: int


# --- Replenishment Run Response ---

class ReplenishmentRunResponse(BaseModel):
    run_date: date
    calculation_mode: str
    snapshot_days_available: int
    total_items: int
    stores_processed: int
    warehouse_allocations: int
    exceptions_count: int
    summary: ShipmentPlanSummary


# --- Picklist Schemas ---

class PicklistStoreBreakdown(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    quantity: int


class PicklistItem(BaseModel):
    sku_id: str
    product_name: Optional[str] = None
    category: Optional[str] = None
    total_allocated_qty: int
    store_breakdown: List[PicklistStoreBreakdown]


class PicklistResponse(BaseModel):
    run_date: date
    items: List[PicklistItem]
    total_units: int


# --- Exception Schemas ---

class ExceptionItem(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    sku_id: str
    product_name: Optional[str] = None
    exception_type: str  # warehouse_shortage, critical_stock, overstock, sales_spike, low_data
    detail: str
    requested_qty: int = 0
    allocated_qty: int = 0
    days_of_stock: float = 0
    priority_score: float = 0


class ExceptionsResponse(BaseModel):
    run_date: date
    items: List[ExceptionItem]
    total_exceptions: int


# --- Data Readiness Schema ---

class DataReadinessResponse(BaseModel):
    snapshot_days_available: int
    days_until_full_accuracy: int
    full_accuracy_date: date
    calculation_mode: str
    stores_with_snapshots: List[str]
    message: str


# Rebuild forward refs
ShipmentPlanResponse.model_rebuild()
