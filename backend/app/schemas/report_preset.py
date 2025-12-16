"""
Report Preset Schemas

Pydantic models for report preset request/response validation.
"""

from typing import Optional, List, Any, Dict
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator


class ColumnConfig(BaseModel):
    """Column visibility configuration"""
    category: bool = True
    product_name: bool = True
    sku: bool = True
    product_id: bool = True
    quantity_sold: bool = True
    revenue: bool = True
    inventory_sales_store: bool = True
    comparison_qty_sold: bool = True
    comparison_inventory: bool = True
    comparison_revenue: bool = True
    comparison_variance: bool = True

    @model_validator(mode='before')
    @classmethod
    def migrate_old_columns(cls, data: Any) -> Any:
        """Migrate old column names to new ones for backward compatibility"""
        if isinstance(data, dict):
            # If old column names exist, migrate them
            if 'inventory_store_a' in data:
                data['inventory_sales_store'] = data.pop('inventory_store_a')
            if 'inventory_store_b' in data:
                # Remove inventory_store_b as it's no longer used
                data.pop('inventory_store_b')
            # Ensure revenue field exists (default to True if not present)
            if 'revenue' not in data:
                data['revenue'] = True
            # Migrate old comparison_stores to new individual fields
            if 'comparison_stores' in data:
                comp_value = data.pop('comparison_stores')
                data.setdefault('comparison_qty_sold', comp_value)
                data.setdefault('comparison_inventory', comp_value)
                data.setdefault('comparison_revenue', comp_value)
                data.setdefault('comparison_variance', comp_value)
            # Ensure all comparison fields exist (default to True if not present)
            data.setdefault('comparison_qty_sold', True)
            data.setdefault('comparison_inventory', True)
            data.setdefault('comparison_revenue', True)
            data.setdefault('comparison_variance', True)
        return data


class FilterConfig(BaseModel):
    """Report filter configuration"""
    categories: Optional[List[str]] = Field(None, description="Filter by product categories")
    min_quantity: Optional[int] = Field(None, ge=0, description="Minimum quantity sold")
    max_quantity: Optional[int] = Field(None, ge=0, description="Maximum quantity sold")
    limit: Optional[int] = Field(None, ge=1, le=10000, description="Limit number of results (top N)")
    sort_by: Optional[str] = Field("quantity_sold", description="Field to sort by")
    sort_order: Optional[str] = Field("desc", description="Sort order: asc or desc")
    search: Optional[str] = Field(None, description="Search in product name, SKU, or product ID")

    @field_validator('sort_order')
    @classmethod
    def validate_sort_order(cls, v):
        if v and v not in ['asc', 'desc']:
            raise ValueError("sort_order must be 'asc' or 'desc'")
        return v

    @field_validator('sort_by', mode='before')
    @classmethod
    def validate_sort_by(cls, v):
        # Migrate old field names
        if v == 'inventory_store_a':
            v = 'inventory_sales_store'

        valid_fields = ['category', 'product_name', 'sku', 'product_id', 'quantity_sold', 'revenue', 'inventory_sales_store']
        if v and v not in valid_fields:
            raise ValueError(f"sort_by must be one of: {', '.join(valid_fields)}")
        return v


class PresetConfig(BaseModel):
    """Complete preset configuration"""
    columns: ColumnConfig = Field(default_factory=ColumnConfig)
    filters: FilterConfig = Field(default_factory=FilterConfig)
    group_by_category: bool = Field(True, description="Whether to group results by category")
    # Optional: Save store and date selections (for true "presets")
    save_stores: bool = Field(False, description="Whether to save store selections")
    save_dates: bool = Field(False, description="Whether to save date range")
    sales_store_id: Optional[str] = None
    compare_store_ids: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

    @field_validator('compare_store_ids', mode='before')
    @classmethod
    def filter_none_values(cls, v):
        """Filter out None values from compare_store_ids"""
        if isinstance(v, list):
            filtered = [sid for sid in v if sid is not None]
            # Return None if all values were None, otherwise return filtered list
            return filtered if len(filtered) > 0 else None
        return v

    @model_validator(mode='before')
    @classmethod
    def migrate_old_store_field(cls, data: Any) -> Any:
        """Migrate old compare_store_id to compare_store_ids for backward compatibility"""
        if isinstance(data, dict):
            # If old compare_store_id exists and compare_store_ids doesn't, migrate it
            if 'compare_store_id' in data and 'compare_store_ids' not in data:
                data['compare_store_ids'] = [data.pop('compare_store_id')]
            elif 'compare_store_id' in data:
                # Remove compare_store_id if compare_store_ids already exists
                data.pop('compare_store_id')
        return data


class PresetBase(BaseModel):
    """Base preset schema"""
    name: str = Field(..., min_length=1, max_length=255, description="Preset name")
    report_type: str = Field("product-sales", description="Type of report")
    config: PresetConfig = Field(default_factory=PresetConfig)


class PresetCreate(PresetBase):
    """Schema for creating a new preset"""
    is_default: bool = Field(False, description="Set as default preset")


class PresetUpdate(BaseModel):
    """Schema for updating an existing preset"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    config: Optional[PresetConfig] = None
    is_default: Optional[bool] = None


class PresetResponse(PresetBase):
    """Schema for preset response"""
    id: int
    is_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PresetListResponse(BaseModel):
    """Schema for list of presets"""
    presets: List[PresetResponse]
    total: int
    default_preset_id: Optional[int] = None
