from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, field_validator
from decimal import Decimal


# Base schema with common fields
class TransactionBase(BaseModel):
    invoice_number: Optional[str] = Field(None, max_length=100)
    store_id: int = Field(..., gt=0)
    register_id: Optional[str] = Field(None, max_length=50)
    employee_id: Optional[str] = Field(None, max_length=50)
    transaction_type: Optional[str] = Field(None, max_length=50)
    transaction_time: datetime
    customer_ref_id: Optional[str] = Field(None, max_length=100)

    # Financial data
    total: Decimal = Field(..., ge=0, decimal_places=2)
    sub_total: Decimal = Field(..., ge=0, decimal_places=2)
    discount: Decimal = Field(default=Decimal('0'), ge=0, decimal_places=2)
    tax: Decimal = Field(default=Decimal('0'), ge=0, decimal_places=2)
    rounded_amount: Decimal = Field(default=Decimal('0'), decimal_places=2)
    service_charge: Decimal = Field(default=Decimal('0'), ge=0, decimal_places=2)

    # Cancellation info
    is_cancelled: bool = False
    cancelled_by: Optional[str] = Field(None, max_length=100)
    cancelled_time: Optional[datetime] = None

    # Additional info
    comment: Optional[str] = Field(None, max_length=500)
    return_reason: Optional[str] = Field(None, max_length=255)
    sale_invoice_number: Optional[str] = Field(None, max_length=100)
    channel: Optional[str] = Field(None, max_length=50)
    table_id: Optional[str] = Field(None, max_length=50)

    @field_validator('transaction_time')
    @classmethod
    def validate_transaction_time(cls, v: datetime) -> datetime:
        if v > datetime.now():
            raise ValueError('transaction_time cannot be in the future')
        return v


# Schema for creating a transaction
class TransactionCreate(TransactionBase):
    ref_id: str = Field(..., max_length=100)


# Schema for updating a transaction
class TransactionUpdate(BaseModel):
    invoice_number: Optional[str] = Field(None, max_length=100)
    register_id: Optional[str] = Field(None, max_length=50)
    employee_id: Optional[str] = Field(None, max_length=50)
    transaction_type: Optional[str] = Field(None, max_length=50)
    customer_ref_id: Optional[str] = Field(None, max_length=100)

    total: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    sub_total: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    discount: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    tax: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    rounded_amount: Optional[Decimal] = Field(None, decimal_places=2)
    service_charge: Optional[Decimal] = Field(None, ge=0, decimal_places=2)

    is_cancelled: Optional[bool] = None
    cancelled_by: Optional[str] = Field(None, max_length=100)
    cancelled_time: Optional[datetime] = None

    comment: Optional[str] = Field(None, max_length=500)
    return_reason: Optional[str] = Field(None, max_length=255)
    sale_invoice_number: Optional[str] = Field(None, max_length=100)
    channel: Optional[str] = Field(None, max_length=50)
    table_id: Optional[str] = Field(None, max_length=50)


# Schema for reading a transaction (response)
class TransactionRead(TransactionBase):
    ref_id: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Backward compatibility alias
Transaction = TransactionRead


# Schema for transaction with items
class TransactionWithItems(TransactionRead):
    items: List["TransactionItemRead"] = []


# Schema for transaction list with pagination metadata
class TransactionList(BaseModel):
    items: list[TransactionRead]
    total: int
    page: int
    page_size: int
    total_pages: int


# Filter schema for querying transactions
class TransactionFilter(BaseModel):
    store_id: Optional[int] = None
    transaction_type: Optional[str] = None
    is_cancelled: Optional[bool] = None
    employee_id: Optional[str] = None
    channel: Optional[str] = None
    invoice_number: Optional[str] = None


# Date range filter schema
class DateRangeFilter(BaseModel):
    start_date: datetime
    end_date: datetime

    @field_validator('end_date')
    @classmethod
    def validate_date_range(cls, v: datetime, info) -> datetime:
        if 'start_date' in info.data and v < info.data['start_date']:
            raise ValueError('end_date must be after start_date')
        return v


# Import at the end to avoid circular imports
from app.schemas.transaction_item import TransactionItemRead

# Update forward references
TransactionWithItems.model_rebuild()
