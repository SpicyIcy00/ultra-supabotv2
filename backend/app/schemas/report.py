from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional, Dict, Any


class ComparisonStoreData(BaseModel):
    """Comparison data for a single store."""

    quantity_sold: float = Field(0, description="Quantity sold in comparison store")
    inventory: int = Field(0, description="Inventory in comparison store")
    revenue: float = Field(0, description="Revenue in comparison store")
    qty_variance: float = Field(0, description="Quantity variance from sales store")
    qty_variance_percent: float = Field(0, description="Quantity variance percentage")


class ReportRow(BaseModel):
    """Single row in the product sales report."""

    category: Optional[str] = Field(None, description="Product category")
    product_name: str = Field(..., description="Product name")
    sku: Optional[str] = Field(None, description="Product SKU")
    product_id: str = Field(..., description="Product ID")
    quantity_sold: float = Field(..., description="Total quantity sold in sales store")
    revenue: float = Field(0, description="Revenue in sales store")
    inventory_sales_store: int = Field(0, description="Inventory in sales store")
    unit_price: Optional[float] = Field(None, description="Product unit price")
    cost: Optional[float] = Field(None, description="Product cost")
    profit_margin: Optional[float] = Field(None, description="Profit margin percentage")
    comparison_stores: Dict[str, ComparisonStoreData] = Field(default_factory=dict, description="Comparison store data keyed by store ID")

    class Config:
        from_attributes = True


class ReportMeta(BaseModel):
    """Metadata for the product sales report."""

    sales_store_id: str = Field(..., description="ID of the sales store")
    compare_store_ids: List[str] = Field(..., description="IDs of the comparison stores")
    start: str = Field(..., description="Start datetime (ISO format with timezone)")
    end: str = Field(..., description="End datetime (ISO format with timezone)")
    timezone: str = Field(default="Asia/Manila", description="Timezone used for the report")
    generated_at: datetime = Field(default_factory=datetime.utcnow, description="Report generation timestamp")

    class Config:
        from_attributes = True


class ProductSalesReportResponse(BaseModel):
    """Complete product sales report response."""

    meta: ReportMeta
    rows: List[ReportRow]

    class Config:
        from_attributes = True
