from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.services.replenishment_service import ReplenishmentService
from pydantic import BaseModel
from app.schemas.replenishment import (
    StoreTierCreate,
    StoreTierUpdate,
    StorePipelineBulkUpdate,
    WarehouseInventoryBulkUpdate,
    SeasonalityCalendarCreate,
    SeasonalityCalendarUpdate,
)


class ReplenishmentConfigUpdate(BaseModel):
    use_inventory_snapshots: bool

router = APIRouter()


def _get_service(db: AsyncSession = Depends(get_db)) -> ReplenishmentService:
    return ReplenishmentService(db)


# ----------------------------------------------------------------
# Main Operations
# ----------------------------------------------------------------

@router.post("/run")
async def run_replenishment(
    run_date: Optional[date] = Query(None),
    store_id: Optional[str] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Run the replenishment calculation, optionally filtered to a single store."""
    result = await service.run_replenishment_calculation(run_date, store_id)
    return result


@router.get("/latest")
async def get_latest_shipment_plan(
    store_ids: Optional[List[str]] = Query(None),
    sku_ids: Optional[List[str]] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Get the most recent shipment plan with optional filters."""
    return await service.get_latest_shipment_plan(store_ids, sku_ids)


@router.get("/picklist")
async def get_warehouse_picklist(
    run_date: Optional[date] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Get aggregated warehouse picklist grouped by SKU."""
    return await service.get_warehouse_picklist(run_date)


@router.get("/exceptions")
async def get_exceptions(
    run_date: Optional[date] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Get items needing review (negative stock, overstock, warehouse shortage)."""
    return await service.get_exceptions(run_date)


@router.get("/data-readiness")
async def get_data_readiness(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get snapshot data availability and calculation mode status."""
    return await service.get_data_readiness()


# ----------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------

@router.get("/config")
async def get_config(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get replenishment configuration."""
    return await service.get_config()


@router.put("/config")
async def update_config(
    body: ReplenishmentConfigUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Update replenishment configuration."""
    return await service.update_config(body.model_dump())


# ----------------------------------------------------------------
# Warehouse Inventory
# ----------------------------------------------------------------

@router.get("/warehouse-inventory")
async def get_warehouse_inventory(
    sku_ids: Optional[List[str]] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Get current warehouse inventory levels."""
    return await service.get_warehouse_inventory(sku_ids)


@router.post("/warehouse-inventory")
async def update_warehouse_inventory(
    body: WarehouseInventoryBulkUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Bulk update warehouse inventory levels."""
    items = [item.model_dump() for item in body.items]
    return await service.update_warehouse_inventory(items)


# ----------------------------------------------------------------
# Pipeline (On-Order)
# ----------------------------------------------------------------

@router.get("/pipeline")
async def get_pipeline(
    store_ids: Optional[List[str]] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Get current pipeline (on-order) data."""
    return await service.get_pipeline(store_ids)


@router.post("/pipeline")
async def update_pipeline(
    body: StorePipelineBulkUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Bulk update store pipeline (on-order) quantities."""
    items = [item.model_dump() for item in body.items]
    return await service.update_pipeline(items)


# ----------------------------------------------------------------
# Store Tiers
# ----------------------------------------------------------------

@router.get("/store-tiers")
async def get_store_tiers(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get all store tier configurations."""
    return await service.get_all_store_tiers()


@router.post("/store-tiers")
async def upsert_store_tier(
    body: StoreTierCreate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Create or update a store tier configuration."""
    return await service.upsert_store_tier(body.model_dump())


@router.delete("/store-tiers/{store_id}")
async def delete_store_tier(
    store_id: str,
    service: ReplenishmentService = Depends(_get_service),
):
    """Delete a store tier configuration."""
    deleted = await service.delete_store_tier(store_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Store tier not found")
    return {"status": "deleted", "store_id": store_id}


# ----------------------------------------------------------------
# Seasonality Calendar
# ----------------------------------------------------------------

@router.get("/seasonality")
async def get_seasonality_calendar(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get all seasonality periods."""
    return await service.get_all_seasonality()


@router.post("/seasonality")
async def create_seasonality_period(
    body: SeasonalityCalendarCreate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Create a new seasonality period."""
    return await service.create_seasonality(body.model_dump())


@router.put("/seasonality/{period_id}")
async def update_seasonality_period(
    period_id: int,
    body: SeasonalityCalendarUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Update an existing seasonality period."""
    data = body.model_dump(exclude_unset=True)
    result = await service.update_seasonality(period_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Seasonality period not found")
    return result


@router.delete("/seasonality/{period_id}")
async def delete_seasonality_period(
    period_id: int,
    service: ReplenishmentService = Depends(_get_service),
):
    """Delete a seasonality period."""
    deleted = await service.delete_seasonality(period_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Seasonality period not found")
    return {"status": "deleted", "id": period_id}
