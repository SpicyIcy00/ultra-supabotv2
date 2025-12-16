from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal


# Base schema with common fields
class TransactionItemBase(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0, decimal_places=2)
    item_total: Decimal = Field(..., ge=0, decimal_places=2)
    item_subtotal: Decimal = Field(..., ge=0, decimal_places=2)
    discount: Decimal = Field(default=Decimal('0'), ge=0, decimal_places=2)
    tax: Decimal = Field(default=Decimal('0'), ge=0, decimal_places=2)
    tax_code: Optional[str] = Field(None, max_length=50)
    item_type: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)


# Schema for creating a transaction item
class TransactionItemCreate(TransactionItemBase):
    transaction_ref_id: str = Field(..., max_length=100)


# Schema for updating a transaction item
class TransactionItemUpdate(BaseModel):
    quantity: Optional[int] = Field(None, gt=0)
    unit_price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    item_total: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    item_subtotal: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    discount: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    tax: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    tax_code: Optional[str] = Field(None, max_length=50)
    item_type: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=500)


# Schema for reading a transaction item (response)
class TransactionItemRead(TransactionItemBase):
    id: int
    transaction_ref_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Backward compatibility alias
TransactionItem = TransactionItemRead


# Schema for transaction item with product details
class TransactionItemWithProduct(TransactionItemRead):
    product: Optional["ProductRead"] = None


# Import at the end to avoid circular imports
from app.schemas.product import ProductRead

# Update forward references
TransactionItemWithProduct.model_rebuild()
