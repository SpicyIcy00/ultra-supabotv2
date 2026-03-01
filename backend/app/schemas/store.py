from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict


# Base schema with common fields
class StoreBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
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
    id: str = Field(..., description="MongoDB ObjectID (24-character hex string)")
    created_at: datetime
    updated_at: datetime

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
