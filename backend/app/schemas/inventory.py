from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# Base schema with common fields
class InventoryBase(BaseModel):
    product_id: int = Field(..., gt=0)
    store_id: int = Field(..., gt=0)
    quantity_on_hand: int = Field(default=0, ge=0)
    warning_stock: Optional[int] = Field(None, ge=0)
    ideal_stock: Optional[int] = Field(None, ge=0)


# Schema for creating inventory
class InventoryCreate(InventoryBase):
    pass


# Schema for updating inventory
class InventoryUpdate(BaseModel):
    quantity_on_hand: Optional[int] = Field(None, ge=0)
    warning_stock: Optional[int] = Field(None, ge=0)
    ideal_stock: Optional[int] = Field(None, ge=0)


# Schema for reading inventory (response)
class InventoryRead(InventoryBase):
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Backward compatibility alias
Inventory = InventoryRead


# Schema for inventory with product and store details
class InventoryWithDetails(InventoryRead):
    product: Optional["ProductRead"] = None
    store: Optional["StoreRead"] = None


# Schema for inventory list with pagination metadata
class InventoryList(BaseModel):
    items: list[InventoryRead]
    total: int
    page: int
    page_size: int
    total_pages: int


# Filter schema for querying inventory
class InventoryFilter(BaseModel):
    store_id: Optional[int] = None
    product_id: Optional[int] = None
    low_stock: Optional[bool] = Field(None, description="Filter items below warning stock")
    out_of_stock: Optional[bool] = Field(None, description="Filter items with zero stock")


# Import at the end to avoid circular imports
from app.schemas.product import ProductRead
from app.schemas.store import StoreRead

# Update forward references
InventoryWithDetails.model_rebuild()
