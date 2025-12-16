from pydantic import BaseModel, ConfigDict, Field
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, List


# Sales by Hour
class SalesByHour(BaseModel):
    """Hourly sales aggregation."""
    hour: int = Field(..., ge=0, le=23, description="Hour of day (0-23)")
    hour_label: str = Field(..., description="Formatted hour label (e.g., '9 AM')")
    total_sales: float = Field(..., ge=0, description="Total sales for this hour")
    transaction_count: int = Field(default=0, ge=0)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "hour": 14,
                "hour_label": "2 PM",
                "total_sales": 15234.50,
                "transaction_count": 45
            }
        }
    )


class SalesByHourResponse(BaseModel):
    """Response for sales-by-hour endpoint."""
    data: List[SalesByHour]
    start_date: datetime
    end_date: datetime
    store_id: Optional[str] = None
    total_sales: float
    total_transactions: int


# Store Performance
class StorePerformanceItem(BaseModel):
    """Individual store performance metrics."""
    store_id: str
    store_name: str
    total_sales: float = Field(..., ge=0)
    transaction_count: int = Field(..., ge=0)
    percentage_of_total: float = Field(..., ge=0, le=100)
    avg_transaction_value: float = Field(..., ge=0)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "store_id": "68c5bb269da1d500073690c2",
                "store_name": "Main Street Store",
                "total_sales": 125000.00,
                "transaction_count": 450,
                "percentage_of_total": 35.5,
                "avg_transaction_value": 277.78
            }
        }
    )


class StorePerformanceResponse(BaseModel):
    """Response for store-performance endpoint."""
    data: List[StorePerformanceItem]
    start_date: datetime
    end_date: datetime
    total_sales: float
    total_stores: int


# Daily Trend
class DailyTrendItem(BaseModel):
    """Daily sales trend with cumulative totals."""
    date: date
    daily_sales: float = Field(..., ge=0)
    cumulative_sales: float = Field(..., ge=0)
    transaction_count: int = Field(..., ge=0)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "date": "2025-10-20",
                "daily_sales": 8500.00,
                "cumulative_sales": 125000.00,
                "transaction_count": 32
            }
        }
    )


class DailyTrendResponse(BaseModel):
    """Response for daily-trend endpoint."""
    data: List[DailyTrendItem]
    days: int
    total_sales: float
    avg_daily_sales: float


# KPI Metrics
class KPIMetrics(BaseModel):
    """Key performance indicators comparing latest vs previous period."""
    latest_date: date
    previous_date: date
    latest_sales: float = Field(..., ge=0)
    previous_sales: float = Field(..., ge=0)
    sales_growth_pct: float
    latest_transactions: int = Field(..., ge=0)
    previous_transactions: int = Field(..., ge=0)
    transactions_growth_pct: float
    latest_avg_transaction_value: float = Field(..., ge=0)
    previous_avg_transaction_value: float = Field(..., ge=0)
    avg_transaction_value_growth_pct: float

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "latest_date": "2025-10-20",
                "previous_date": "2025-10-19",
                "latest_sales": 12500.00,
                "previous_sales": 11000.00,
                "sales_growth_pct": 13.64,
                "latest_transactions": 45,
                "previous_transactions": 42,
                "transactions_growth_pct": 7.14,
                "latest_avg_transaction_value": 277.78,
                "previous_avg_transaction_value": 261.90,
                "avg_transaction_value_growth_pct": 6.07
            }
        }
    )


# Product Performance
class ProductPerformanceItem(BaseModel):
    """Individual product performance metrics."""
    product_id: str = Field(..., description="MongoDB ObjectID (24-character hex string)")
    product_name: str
    category: Optional[str] = None
    sku: Optional[str] = None
    total_revenue: float = Field(..., ge=0)
    quantity_sold: int = Field(..., ge=0)
    avg_price: float = Field(..., ge=0)
    transaction_count: int = Field(..., ge=0)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "product_id": "68dea296ef9c5700070207f0",
                "product_name": "Premium Widget",
                "category": "Electronics",
                "sku": "WID-PRE-001",
                "total_revenue": 45000.00,
                "quantity_sold": 150,
                "avg_price": 300.00,
                "transaction_count": 120
            }
        }
    )


class ProductPerformanceResponse(BaseModel):
    """Response for product-performance endpoint."""
    data: List[ProductPerformanceItem]
    start_date: datetime
    end_date: datetime
    category: Optional[str] = None
    total_revenue: float
    total_quantity: int


# Legacy schemas for backward compatibility
class SalesMetrics(BaseModel):
    total_sales: Decimal
    total_transactions: int
    average_transaction_value: Decimal
    total_items_sold: int
    period_start: datetime
    period_end: datetime


class ProductPerformance(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: str
    product_name: str
    sku: str
    total_quantity_sold: int
    total_revenue: Decimal
    total_profit: Optional[Decimal] = None
    average_price: Decimal
    category: Optional[str] = None


class StorePerformance(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    store_id: str
    store_name: str
    total_sales: Decimal
    total_transactions: int
    average_transaction_value: Decimal
