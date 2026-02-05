"""
Store Filters API Routes

Manages store filter configuration for AI chat queries.
"""

import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.store_filter import StoreFilter
from app.models.store import Store
from app.schemas.store_filter import (
    StoreFilterConfig,
    StoreFilterUpdate,
    AvailableStoresResponse,
)

router = APIRouter(tags=["store-filters"])


@router.get("", response_model=StoreFilterConfig)
async def get_store_filters(db: AsyncSession = Depends(get_db)):
    """
    Get current store filter configuration grouped by type.
    """
    result = await db.execute(
        select(StoreFilter).order_by(StoreFilter.filter_type, StoreFilter.store_name)
    )
    filters = result.scalars().all()

    config = StoreFilterConfig(sales_stores=[], inventory_stores=[])

    for f in filters:
        if f.filter_type == "sales":
            config.sales_stores.append(f.store_name)
        elif f.filter_type == "inventory":
            config.inventory_stores.append(f.store_name)

    return config


@router.put("", response_model=StoreFilterConfig)
async def update_store_filters(
    config: StoreFilterUpdate,
    db: AsyncSession = Depends(get_db)
):
    """
    Update store filter configuration (replaces all existing filters).
    """
    # Delete all existing filters
    await db.execute(delete(StoreFilter))

    # Insert new sales filters
    for store_name in config.sales_stores:
        filter_record = StoreFilter(
            id=str(uuid.uuid4()),
            filter_type="sales",
            store_name=store_name
        )
        db.add(filter_record)

    # Insert new inventory filters
    for store_name in config.inventory_stores:
        filter_record = StoreFilter(
            id=str(uuid.uuid4()),
            filter_type="inventory",
            store_name=store_name
        )
        db.add(filter_record)

    await db.commit()

    # Return updated config
    return StoreFilterConfig(
        sales_stores=config.sales_stores,
        inventory_stores=config.inventory_stores
    )


@router.get("/available-stores", response_model=AvailableStoresResponse)
async def get_available_stores(db: AsyncSession = Depends(get_db)):
    """
    Get all stores available in the system for selection.
    """
    result = await db.execute(
        select(Store.name).order_by(Store.name)
    )
    store_names = [row[0] for row in result.fetchall()]

    return AvailableStoresResponse(stores=store_names)


@router.post("/initialize")
async def initialize_default_filters(db: AsyncSession = Depends(get_db)):
    """
    Initialize with default store filters if none exist.
    This is idempotent - does nothing if filters already exist.
    """
    # Check if filters already exist
    result = await db.execute(select(StoreFilter).limit(1))
    if result.scalar_one_or_none():
        return {"message": "Filters already initialized", "initialized": False}

    # Default sales stores
    sales_stores = [
        "Rockwell", "Greenhills", "Magnolia",
        "North Edsa", "Fairview", "Opus"
    ]

    # Default inventory stores (includes warehouse)
    inventory_stores = [
        "Rockwell", "Greenhills", "Magnolia",
        "North Edsa", "Fairview", "Opus", "AJI BARN"
    ]

    # Insert defaults
    for store_name in sales_stores:
        filter_record = StoreFilter(
            id=str(uuid.uuid4()),
            filter_type="sales",
            store_name=store_name
        )
        db.add(filter_record)

    for store_name in inventory_stores:
        filter_record = StoreFilter(
            id=str(uuid.uuid4()),
            filter_type="inventory",
            store_name=store_name
        )
        db.add(filter_record)

    await db.commit()

    return {"message": "Default filters initialized", "initialized": True}
