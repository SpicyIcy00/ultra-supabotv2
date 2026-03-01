from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal


# Base schema with common fields
class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    sku: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)
    price_type: Optional[str] = Field(None, max_length=50)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    cost: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    track_stock_level: bool = True
    is_parent_product: bool = False


# Schema for creating a product
class ProductCreate(ProductBase):
    pass


# Schema for updating a product
class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    sku: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)
    price_type: Optional[str] = Field(None, max_length=50)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    cost: Optional[Decimal] = Field(None, ge=0, decimal_places=4)
    track_stock_level: Optional[bool] = None
    is_parent_product: Optional[bool] = None


# Schema for reading a product (response)
class ProductRead(ProductBase):
    id: str = Field(..., description="MongoDB ObjectID (24-character hex string)")
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Backward compatibility alias
Product = ProductRead


# Schema for product list with pagination metadata
class ProductList(BaseModel):
    items: list[ProductRead]
    total: int
    page: int
    page_size: int
    total_pages: int


# Filter schema for querying products
class ProductFilter(BaseModel):
    category: Optional[str] = None
    price_min: Optional[Decimal] = Field(None, ge=0)
    price_max: Optional[Decimal] = Field(None, ge=0)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    track_stock_level: Optional[bool] = None
    is_parent_product: Optional[bool] = None
    search: Optional[str] = Field(None, description="Search by name, SKU, or barcode")
