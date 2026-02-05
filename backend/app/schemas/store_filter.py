"""
Store Filter Schemas

Pydantic models for store filter API requests and responses.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class StoreFilterConfig(BaseModel):
    """Configuration for store filters - grouped by type."""
    sales_stores: List[str] = Field(default_factory=list)
    inventory_stores: List[str] = Field(default_factory=list)


class StoreFilterUpdate(BaseModel):
    """Update request for store filters."""
    sales_stores: List[str] = Field(..., min_length=1)
    inventory_stores: List[str] = Field(..., min_length=1)


class StoreFilterResponse(BaseModel):
    """Individual store filter record."""
    id: str
    filter_type: str
    store_name: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AvailableStoresResponse(BaseModel):
    """List of all stores available in the system."""
    stores: List[str]
