from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# Base schema with common fields
class StoreBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    display_name: Optional[str] = Field(None, max_length=255)
    color: Optional[str] = Field(None, max_length=20, description="Hex color e.g. #E74C3C")
    address1: Optional[str] = Field(None, max_length=255)
    address2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = None
    website: Optional[str] = Field(None, max_length=255)


# Schema for creating a store
class StoreCreate(StoreBase):
    pass


# Schema for updating a store
class StoreUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    display_name: Optional[str] = Field(None, max_length=255)
    color: Optional[str] = Field(None, max_length=20)
    address1: Optional[str] = Field(None, max_length=255)
    address2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = None
    website: Optional[str] = Field(None, max_length=255)


# Schema for reading a store (response)
class StoreRead(StoreBase):
    # Usually a StoreHub MongoDB ObjectID. AJI MACOPA, a closed warehouse that
    # StoreHub never synced, carries a deliberately non-hex local id so it can
    # never be confused with or collide with a real one.
    id: str = Field(..., description="StoreHub ObjectID, or a local id for a store StoreHub never synced")
    created_at: datetime
    updated_at: datetime

    # Lifecycle. Exposed so a store picker can leave closed locations out
    # instead of every caller having to know which names are defunct.
    is_active: bool = True
    closed_at: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


# Backward compatibility alias
Store = StoreRead


# Schema for store list with pagination metadata
class StoreList(BaseModel):
    items: list[StoreRead]
    total: int
    page: int
    page_size: int
    total_pages: int


# Filter schema for querying stores
class StoreFilter(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    search: Optional[str] = Field(None, description="Search by name, city, or state")
