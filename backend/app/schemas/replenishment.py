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
    max_cover_days: int = Field(default=10, ge=1)
    expiry_window_days: int = Field(default=60, ge=1)


class StoreTierUpdate(BaseModel):
    tier: Optional[Literal["A", "B"]] = None
    safety_days: Optional[int] = Field(None, ge=1)
    target_cover_days: Optional[int] = Field(None, ge=1)
    max_cover_days: Optional[int] = Field(None, ge=1)
    expiry_window_days: Optional[int] = Field(None, ge=1)


class StoreTierResponse(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    tier: str
    safety_days: int
    target_cover_days: int
    max_cover_days: int
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


# --- Velocity Multiplier Rule Schemas ---

class VelocityMultiplierRuleCreate(BaseModel):
    threshold: Decimal = Field(..., ge=0, description="Min avg daily sales to meet this tier")
    multiplier: Decimal = Field(default=Decimal("1.000"), ge=0, le=10)
    label: str = Field(..., max_length=100)


class VelocityMultiplierRuleUpdate(BaseModel):
    threshold: Optional[Decimal] = Field(None, ge=0)
    multiplier: Optional[Decimal] = Field(None, ge=0, le=10)
    label: Optional[str] = Field(None, max_length=100)


class VelocityMultiplierRuleResponse(BaseModel):
    id: int
    threshold: float
    multiplier: float
    label: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# --- Category Multiplier Schemas ---

class CategoryMultiplierUpdate(BaseModel):
    category: str = Field(..., max_length=100)
    store_id: str = Field(..., max_length=24)
    multiplier: Decimal = Field(default=Decimal("1.000"), ge=0, le=10)


class CategoryMultiplierBulkUpdate(BaseModel):
    items: List[CategoryMultiplierUpdate]


class CategoryMultiplierResponse(BaseModel):
    category: str
    store_id: str
    store_name: Optional[str] = None
    multiplier: float
    updated_at: Optional[str] = None

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
    velocity_multiplier: float = 1.0
    category_multiplier: float = 1.0
    effective_multiplier: float = 1.0

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


# --- Algorithm Settings Schemas ---

class AlgorithmSettingsUpdate(BaseModel):
    snapshot_enabled: Optional[bool] = None
    snapshot_required_days: Optional[int] = Field(None, ge=1, le=365)
    stockout_buffer_weekday_pct: Optional[int] = Field(None, ge=0, le=200)
    stockout_buffer_weekend_pct: Optional[int] = Field(None, ge=0, le=200)
    priority_velocity_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    priority_stockout_weight: Optional[float] = Field(None, ge=0.0, le=1.0)
    overstock_threshold_days: Optional[int] = Field(None, ge=1, le=3650)
    critical_stock_threshold_days: Optional[int] = Field(None, ge=0, le=365)


class AlgorithmSettingsResponse(BaseModel):
    snapshot_enabled: bool
    snapshot_required_days: int
    stockout_buffer_weekday_pct: int
    stockout_buffer_weekend_pct: int
    priority_velocity_weight: float
    priority_stockout_weight: float
    overstock_threshold_days: int
    critical_stock_threshold_days: int
    updated_at: Optional[str] = None


# --- Percentile Run Response ---

class PercentileRunResponse(BaseModel):
    run_date: date
    algorithm: str
    total_items: int
    stores_processed: int
    exceptions_count: int
    summary: ShipmentPlanSummary


# --- Percentile Shipment Item (extends base with percentile fields) ---

class PercentileShipmentItem(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    sku_id: str
    product_name: Optional[str] = None
    category: Optional[str] = None
    # Core demand metrics
    avg_daily_sales: float
    total_sold_qty: int
    # Target (stored in min_level column)
    target: float
    on_hand: int
    usable_on_hand: int
    ship_qty: int
    days_of_stock: float
    priority_score: float
    # Percentile metadata
    abc_class: Optional[str] = None
    service_quantile: Optional[float] = None
    segment: Optional[str] = None
    needs_count: Optional[bool] = None
    silent_stockout: Optional[bool] = None
    days_since_last_sale: Optional[int] = None
    trusted_ledger: Optional[bool] = None
    calculation_mode: str = "percentile"

    model_config = ConfigDict(from_attributes=True)


# --- Compare Response ---

class CompareItem(BaseModel):
    store_id: str
    store_name: Optional[str] = None
    sku_id: str
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    category: Optional[str] = None
    on_hand: Optional[int] = None
    # Legacy outputs
    legacy_ship_qty: Optional[int] = None
    legacy_target: Optional[float] = None
    legacy_days_of_stock: Optional[float] = None
    # Percentile outputs
    percentile_ship_qty: Optional[int] = None
    percentile_target: Optional[float] = None
    percentile_days_of_stock: Optional[float] = None
    # Percentile metadata
    abc_class: Optional[str] = None
    service_quantile: Optional[float] = None
    segment: Optional[str] = None
    silent_stockout: Optional[bool] = None
    needs_count: Optional[bool] = None
    days_since_last_sale: Optional[int] = None
    trusted_ledger: Optional[bool] = None
    # Derived
    diff: Optional[int] = None  # percentile_ship_qty - legacy_ship_qty


class CompareResponse(BaseModel):
    run_date: Optional[date] = None
    legacy_run_date: Optional[date] = None
    percentile_run_date: Optional[date] = None
    items: List[CompareItem]
    summary: dict


# Rebuild forward refs
ShipmentPlanResponse.model_rebuild()
