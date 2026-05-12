from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.config import settings
from app.services.replenishment_service import ReplenishmentService
from app.services.ai_insights_service import AIInsightsService
from app.schemas.replenishment import (
    StoreTierCreate,
    StoreTierUpdate,
    StorePipelineBulkUpdate,
    WarehouseInventoryBulkUpdate,
    SeasonalityCalendarCreate,
    SeasonalityCalendarUpdate,
    AlgorithmSettingsUpdate,
    VelocityMultiplierRuleCreate,
    VelocityMultiplierRuleUpdate,
    CategoryMultiplierBulkUpdate,
)

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
    apply_stockout_buffer: bool = Query(True),
    normalize_priority: bool = Query(True),
    sales_start_date: Optional[date] = Query(None),
    mode: Optional[str] = Query(None, description="snapshot | fallback | auto"),
    service: ReplenishmentService = Depends(_get_service),
):
    """Run the replenishment calculation, optionally filtered to a single store."""
    result = await service.run_replenishment_calculation(
        run_date, store_id, apply_stockout_buffer, normalize_priority, sales_start_date, mode
    )
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


@router.post("/ai-insights")
async def generate_ai_insights(
    store_ids: Optional[List[str]] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Generate AI-powered narrative, exception analysis, and demand insights for the latest run."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured on the server")

    plan = await service.get_latest_shipment_plan(store_ids)
    if not plan.get("run_date"):
        raise HTTPException(status_code=404, detail="No replenishment plan found. Run a replenishment calculation first.")

    exceptions = await service.get_exceptions()

    try:
        ai_service = AIInsightsService(settings.ANTHROPIC_API_KEY)
        insights = await ai_service.generate_full_insights(plan, exceptions)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        # Surface the real error (auth failure, network, rate limit, etc.)
        err_msg = str(e)
        if hasattr(e, "response"):
            try:
                body = e.response.json()
                err_msg = body.get("error", {}).get("message", err_msg)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Claude API error: {err_msg}")

    return insights


@router.post("/ai-quantities")
async def generate_ai_quantities(
    store_ids: Optional[List[str]] = Query(None),
    service: ReplenishmentService = Depends(_get_service),
):
    """Use Claude to calculate optimal min_qty and ship_qty for every item in the latest plan."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured on the server")

    plan = await service.get_latest_shipment_plan(store_ids)
    if not plan.get("run_date"):
        raise HTTPException(status_code=404, detail="No replenishment plan found. Run a replenishment calculation first.")

    items = plan.get("items", [])
    if not items:
        return {"run_date": plan.get("run_date"), "items": []}

    try:
        ai_service = AIInsightsService(settings.ANTHROPIC_API_KEY)
        quantities = await ai_service.calculate_ai_quantities(items)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        err_msg = str(e)
        if hasattr(e, "response"):
            try:
                body = e.response.json()
                err_msg = body.get("error", {}).get("message", err_msg)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"Claude API error: {err_msg}")

    return {"run_date": plan.get("run_date"), "items": quantities}


@router.post("/ai-reasoning")
async def ai_reasoning_analysis(
    store_id: str = Query(..., description="Store ID to analyse"),
    service: ReplenishmentService = Depends(_get_service),
):
    """AI Reasoning Mode: analyse each SKU using raw 28-day snapshot history only. No formula output is passed to Claude."""
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured on the server")

    plan = await service.get_latest_shipment_plan([store_id])
    if not plan.get("run_date"):
        raise HTTPException(status_code=404, detail="No replenishment plan found. Run a replenishment calculation first.")

    items = plan.get("items", [])
    if not items:
        return {"run_date": plan.get("run_date"), "store_id": store_id, "items": []}

    sku_ids = [item["sku_id"] for item in items]
    snapshot_map = await service.get_skus_snapshot_history(store_id, sku_ids)

    try:
        ai_service = AIInsightsService(settings.ANTHROPIC_API_KEY)
        results = await ai_service.analyze_store_with_reasoning(items, snapshot_map)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Reasoning error: {str(e)}")

    return {"run_date": plan.get("run_date"), "store_id": store_id, "items": results}


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


# ----------------------------------------------------------------
# Algorithm Settings
# ----------------------------------------------------------------

@router.get("/algorithm-settings")
async def get_algorithm_settings(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get current algorithm settings."""
    return await service.get_algorithm_settings()


@router.post("/algorithm-settings")
async def update_algorithm_settings(
    body: AlgorithmSettingsUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Update algorithm settings."""
    data = body.model_dump(exclude_unset=True)
    try:
        return await service.update_algorithm_settings(data)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))


# ----------------------------------------------------------------
# Velocity Multiplier Rules
# ----------------------------------------------------------------

@router.get("/velocity-multiplier-rules")
async def get_velocity_multiplier_rules(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get all velocity multiplier rules."""
    return await service.get_all_velocity_rules()


@router.post("/velocity-multiplier-rules")
async def create_velocity_multiplier_rule(
    body: VelocityMultiplierRuleCreate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Create a new velocity multiplier rule."""
    return await service.create_velocity_rule(body.model_dump())


@router.put("/velocity-multiplier-rules/{rule_id}")
async def update_velocity_multiplier_rule(
    rule_id: int,
    body: VelocityMultiplierRuleUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Update a velocity multiplier rule."""
    data = body.model_dump(exclude_unset=True)
    result = await service.update_velocity_rule(rule_id, data)
    if result is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    return result


@router.delete("/velocity-multiplier-rules/{rule_id}")
async def delete_velocity_multiplier_rule(
    rule_id: int,
    service: ReplenishmentService = Depends(_get_service),
):
    """Delete a velocity multiplier rule."""
    deleted = await service.delete_velocity_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"status": "deleted", "id": rule_id}


# ----------------------------------------------------------------
# Category Multipliers
# ----------------------------------------------------------------

@router.get("/category-multipliers")
async def get_category_multipliers(
    service: ReplenishmentService = Depends(_get_service),
):
    """Get all category multipliers."""
    return await service.get_all_category_multipliers()


@router.post("/category-multipliers")
async def bulk_update_category_multipliers(
    body: CategoryMultiplierBulkUpdate,
    service: ReplenishmentService = Depends(_get_service),
):
    """Bulk create or update category multipliers (per store)."""
    items = [item.model_dump() for item in body.items]
    return await service.bulk_upsert_category_multipliers(items)


@router.post("/category-multipliers/auto-populate")
async def auto_populate_category_multipliers(
    service: ReplenishmentService = Depends(_get_service),
):
    """Auto-populate all category × store combinations at 1.0."""
    return await service.auto_populate_category_multipliers()
