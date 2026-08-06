"""
Vending API router (Weimi machines, brand "Hello Aji").

Same shape as the store analytics router, for the vending domain. All money in
responses is already in PESOS — the service divides the raw cents columns by
100. The vending domain is standalone: no endpoint here joins store data.
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List

from app.core.database import get_db
from app.services.vending_service import VendingService

router = APIRouter(tags=["Vending"])


@router.get("/devices", summary="Get all vending machines")
async def get_devices(db: AsyncSession = Depends(get_db)):
    """Get all vending machines (device_code + display name)."""
    try:
        service = VendingService(db)
        return await service.get_devices()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending devices: {str(e)}"
        )


@router.get(
    "/dashboard-kpis",
    summary="Get vending KPI metrics with comparison",
    description="Revenue, profit, units and orders for the current and comparison period (pesos)"
)
async def get_dashboard_kpis(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get vending KPIs for current and comparison periods."""
    try:
        service = VendingService(db)

        current = await service.get_kpi_data_for_period(
            start_date, end_date, device_codes
        )
        previous = await service.get_kpi_data_for_period(
            compare_start_date, compare_end_date, device_codes
        )

        return {
            "current": current,
            "previous": previous
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending KPIs: {str(e)}"
        )


@router.get(
    "/sales-by-machine",
    summary="Get revenue and units per vending machine with comparison"
)
async def get_sales_by_machine(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get sales by machine with comparison."""
    try:
        service = VendingService(db)
        return await service.get_sales_by_machine(
            start_date, end_date, compare_start_date, compare_end_date, device_codes
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending sales by machine: {str(e)}"
        )


@router.get(
    "/top-products",
    summary="Get top vending products with comparison"
)
async def get_top_products(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    limit: int = Query(10),
    db: AsyncSession = Depends(get_db),
):
    """Get top vending products with comparison."""
    try:
        service = VendingService(db)
        return await service.get_top_products(
            start_date, end_date, compare_start_date, compare_end_date,
            device_codes, limit
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching top vending products: {str(e)}"
        )


@router.get(
    "/sales-trend",
    summary="Get vending sales trend with comparison"
)
async def get_sales_trend(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    granularity: str = Query("day"),
    db: AsyncSession = Depends(get_db),
):
    """Get vending sales trend with comparison."""
    try:
        service = VendingService(db)
        return await service.get_sales_trend(
            start_date, end_date, compare_start_date, compare_end_date,
            device_codes, granularity
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending sales trend: {str(e)}"
        )


@router.get(
    "/top-categories",
    summary="Get vending categories ranked by revenue, with comparison"
)
async def get_top_categories(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get vending categories ranked by revenue (category comes from the product master)."""
    try:
        service = VendingService(db)
        return await service.get_top_categories(
            start_date, end_date, compare_start_date, compare_end_date, device_codes
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching top vending categories: {str(e)}"
        )


@router.get(
    "/sales-by-hour",
    summary="Get average vending sales per hour of day",
    description="Sales per hour of day in Asia/Manila, averaged over the active days in the range"
)
async def get_sales_by_hour(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get average vending sales per hour of day."""
    try:
        service = VendingService(db)
        return await service.get_sales_by_hour(start_date, end_date, device_codes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending sales by hour: {str(e)}"
        )


@router.get(
    "/stock-levels",
    summary="Get current stock per aisle per machine"
)
async def get_stock_levels(
    device_codes: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get current stock levels from the live planogram (vending_aisles)."""
    try:
        service = VendingService(db)
        return await service.get_stock_levels(device_codes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching vending stock levels: {str(e)}"
        )


@router.get(
    "/failed-vends",
    summary="Get failed vends (shipment_status = 3)"
)
async def get_failed_vends(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    device_codes: List[str] = Query(default=[]),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    """Get failed vends grouped by machine and product."""
    try:
        service = VendingService(db)
        return await service.get_failed_vends(start_date, end_date, device_codes, limit)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching failed vends: {str(e)}"
        )
