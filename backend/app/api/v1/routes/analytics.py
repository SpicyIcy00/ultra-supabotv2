"""
Analytics API router for BI Dashboard.
Provides endpoints for sales analytics, KPIs, and performance metrics.
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timedelta
from typing import Optional, List
from app.core.database import get_db
from app.services.analytics_service import AnalyticsService
from app.core.cache import invalidate_cache
from app.schemas.analytics import (
    SalesByHourResponse,
    StorePerformanceResponse,
    DailyTrendResponse,
    KPIMetrics,
    ProductPerformanceResponse,
)


router = APIRouter(tags=["Analytics"])


@router.get("/stores", summary="Get all stores")
async def get_stores(db: AsyncSession = Depends(get_db)):
    """Get all stores from database"""
    result = await db.execute(text("SELECT id, name FROM stores ORDER BY name"))
    stores = result.fetchall()
    return [{"id": store.id, "name": store.name} for store in stores]


@router.get(
    "/sales-by-hour",
    response_model=SalesByHourResponse,
    summary="Get hourly sales aggregation",
    description="""
    Returns hourly sales data aggregated by hour of day in Asia/Manila timezone.

    **Features:**
    - Groups sales by hour (0-23)
    - Filters by date range
    - Optional store filtering
    - Cached for 5 minutes
    - Returns formatted hour labels (e.g., "9 AM", "2 PM")

    **Use Case:**
    Perfect for visualizing peak sales hours to optimize staffing and operations.
    """
)
async def get_sales_by_hour(
    start_date: datetime = Query(..., description="Start date for analysis"),
    end_date: datetime = Query(..., description="End date for analysis"),
    store_ids: List[str] = Query(default=[], description="Filter by specific stores (use store IDs)"),
    db: AsyncSession = Depends(get_db),
) -> SalesByHourResponse:
    """
    Get sales aggregated by hour of day.

    Example Request:
        GET /api/v1/analytics/sales-by-hour?start_date=2025-10-01T00:00:00&end_date=2025-10-31T23:59:59&store_ids=Rockwell&store_ids=Greenhills

    Example Response:
        {
            "data": [
                {"hour": 9, "hour_label": "9 AM", "total_sales": 15234.50, "transaction_count": 45},
                {"hour": 10, "hour_label": "10 AM", "total_sales": 18500.75, "transaction_count": 52}
            ],
            "start_date": "2025-10-01T00:00:00",
            "end_date": "2025-10-31T23:59:59",
            "total_sales": 850000.00,
            "total_transactions": 3500
        }
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_sales_by_hour(start_date, end_date, store_ids)
        return SalesByHourResponse(**result)

    except Exception as e:
        import traceback
        print(f"ERROR in sales-by-hour: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales by hour: {str(e)}"
        )


@router.get(
    "/store-performance",
    response_model=StorePerformanceResponse,
    summary="Get top performing stores",
    description="""
    Returns top stores ranked by revenue with performance metrics.

    **Metrics Included:**
    - Total sales revenue
    - Transaction count
    - Percentage of total sales
    - Average transaction value

    **Features:**
    - Cached for 5 minutes
    - Configurable limit (default: 10)
    - Date range filtering

    **Use Case:**
    Identify top-performing locations for expansion or best practice sharing.
    """
)
async def get_store_performance(
    start_date: datetime = Query(..., description="Start date for analysis"),
    end_date: datetime = Query(..., description="End date for analysis"),
    limit: int = Query(10, ge=1, le=50, description="Number of top stores to return"),
    db: AsyncSession = Depends(get_db),
) -> StorePerformanceResponse:
    """
    Get top performing stores by revenue.

    Example Request:
        GET /api/v1/analytics/store-performance?start_date=2025-10-01T00:00:00&end_date=2025-10-31T23:59:59&limit=10

    Example Response:
        {
            "data": [
                {
                    "store_id": 1,
                    "store_name": "Main Street Store",
                    "total_sales": 125000.00,
                    "transaction_count": 450,
                    "percentage_of_total": 35.5,
                    "avg_transaction_value": 277.78
                }
            ],
            "start_date": "2025-10-01T00:00:00",
            "end_date": "2025-10-31T23:59:59",
            "total_sales": 350000.00,
            "total_stores": 10
        }
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_store_performance(start_date, end_date, limit)
        return StorePerformanceResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store performance: {str(e)}"
        )


@router.get(
    "/daily-trend",
    response_model=DailyTrendResponse,
    summary="Get daily sales trend",
    description="""
    Returns daily sales data with cumulative totals for trend analysis.

    **Data Points:**
    - Daily sales total
    - Cumulative sales (running total)
    - Transaction count per day

    **Features:**
    - Cached for 5 minutes
    - Configurable lookback period (default: 30 days)
    - Automatic timezone handling (Asia/Manila)

    **Use Case:**
    Track sales momentum and identify growth patterns over time.
    """
)
async def get_daily_trend(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    db: AsyncSession = Depends(get_db),
) -> DailyTrendResponse:
    """
    Get daily sales trend with cumulative totals.

    Example Request:
        GET /api/v1/analytics/daily-trend?days=30

    Example Response:
        {
            "data": [
                {
                    "date": "2025-10-01",
                    "daily_sales": 8500.00,
                    "cumulative_sales": 8500.00,
                    "transaction_count": 32
                },
                {
                    "date": "2025-10-02",
                    "daily_sales": 9200.00,
                    "cumulative_sales": 17700.00,
                    "transaction_count": 35
                }
            ],
            "days": 30,
            "total_sales": 250000.00,
            "avg_daily_sales": 8333.33
        }
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_daily_trend(days)
        return DailyTrendResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching daily trend: {str(e)}"
        )


@router.get(
    "/kpi-metrics",
    response_model=KPIMetrics,
    summary="Get key performance indicators",
    description="""
    Returns KPI comparison between latest day and previous day.

    **Metrics Compared:**
    - Total sales (with growth %)
    - Transaction count (with growth %)
    - Average transaction value (with growth %)

    **Features:**
    - Cached for 5 minutes
    - Automatic date selection (latest vs previous)
    - Percentage calculations
    - Timezone aware (Asia/Manila)

    **Use Case:**
    Quick dashboard overview to monitor day-over-day performance.
    """
)
async def get_kpi_metrics(
    db: AsyncSession = Depends(get_db),
) -> KPIMetrics:
    """
    Get KPI metrics comparing latest day vs previous day.

    Example Request:
        GET /api/v1/analytics/kpi-metrics

    Example Response:
        {
            "latest_date": "2025-10-20",
            "previous_date": "2025-10-19",
            "latest_sales": 12500.00,
            "previous_sales": 11000.00,
            "sales_growth_pct": 13.64,
            "latest_transactions": 45,
            "previous_transactions": 42,
            "transactions_growth_pct": 7.14,
            "latest_avg_transaction_value": 277.78,
            "previous_avg_transaction_value": 261.90,
            "avg_transaction_value_growth_pct": 6.07
        }
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_kpi_metrics()
        return KPIMetrics(**result)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching KPI metrics: {str(e)}"
        )


@router.get(
    "/product-performance",
    response_model=ProductPerformanceResponse,
    summary="Get top performing products",
    description="""
    Returns top products ranked by revenue and quantity sold.

    **Metrics Included:**
    - Total revenue
    - Quantity sold
    - Average selling price
    - Transaction count

    **Features:**
    - Cached for 5 minutes
    - Optional category filtering
    - Date range filtering
    - Configurable limit (default: 20)

    **Use Case:**
    Identify bestsellers, optimize inventory, and plan promotions.
    """
)
async def get_product_performance(
    start_date: datetime = Query(..., description="Start date for analysis"),
    end_date: datetime = Query(..., description="End date for analysis"),
    category: Optional[str] = Query(None, description="Filter by product category"),
    limit: int = Query(20, ge=1, le=100, description="Number of top products to return"),
    db: AsyncSession = Depends(get_db),
) -> ProductPerformanceResponse:
    """
    Get top performing products by revenue and quantity.

    Example Request:
        GET /api/v1/analytics/product-performance?start_date=2025-10-01T00:00:00&end_date=2025-10-31T23:59:59&category=Electronics&limit=20

    Example Response:
        {
            "data": [
                {
                    "product_id": 123,
                    "product_name": "Premium Widget",
                    "category": "Electronics",
                    "sku": "WID-PRE-001",
                    "total_revenue": 45000.00,
                    "quantity_sold": 150,
                    "avg_price": 300.00,
                    "transaction_count": 120
                }
            ],
            "start_date": "2025-10-01T00:00:00",
            "end_date": "2025-10-31T23:59:59",
            "category": "Electronics",
            "total_revenue": 450000.00,
            "total_quantity": 1500
        }
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_product_performance(start_date, end_date, category, limit)
        return ProductPerformanceResponse(**result)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product performance: {str(e)}"
        )


# NEW DASHBOARD ENDPOINTS

@router.get(
    "/dashboard-kpis",
    summary="Get dashboard KPI metrics with comparison",
    description="Returns KPI metrics for current period and comparison period"
)
async def get_dashboard_kpis(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get KPIs for current and comparison periods"""
    try:
        service = AnalyticsService(db)

        # Get current period data
        current = await service.get_kpi_data_for_period(
            start_date, end_date, store_ids
        )

        # Get comparison period data
        previous = await service.get_kpi_data_for_period(
            compare_start_date, compare_end_date, store_ids
        )

        return {
            "current": current,
            "previous": previous
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching dashboard KPIs: {str(e)}"
        )


@router.get(
    "/sales-by-category",
    summary="Get sales aggregated by category"
)
async def get_sales_by_category(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get sales by category"""
    try:
        service = AnalyticsService(db)
        result = await service.get_sales_by_category(start_date, end_date, store_ids)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales by category: {str(e)}"
        )


@router.get(
    "/inventory-by-category",
    summary="Get inventory value aggregated by category"
)
async def get_inventory_by_category(
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get inventory value by category"""
    try:
        service = AnalyticsService(db)
        result = await service.get_inventory_by_category(store_ids)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching inventory by category: {str(e)}"
        )


@router.get(
    "/sales-by-store",
    summary="Get sales by store with comparison"
)
async def get_sales_by_store(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get sales by store with comparison"""
    try:
        service = AnalyticsService(db)
        result = await service.get_sales_by_store(
            start_date, end_date, compare_start_date, compare_end_date, store_ids
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales by store: {str(e)}"
        )


@router.get(
    "/top-products",
    summary="Get top products with comparison"
)
async def get_top_products(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    limit: int = Query(10),
    db: AsyncSession = Depends(get_db),
):
    """Get top products with comparison"""
    try:
        service = AnalyticsService(db)
        result = await service.get_top_products(
            start_date, end_date, compare_start_date, compare_end_date, store_ids, limit
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching top products: {str(e)}"
        )


@router.get(
    "/sales-trend",
    summary="Get sales trend with comparison"
)
async def get_sales_trend(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    granularity: str = Query("day"),
    db: AsyncSession = Depends(get_db),
):
    """Get sales trend with comparison"""
    try:
        service = AnalyticsService(db)
        result = await service.get_sales_trend(
            start_date, end_date, compare_start_date, compare_end_date,
            store_ids, granularity
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales trend: {str(e)}"
        )


@router.get(
    "/top-categories",
    summary="Get top categories with comparison"
)
async def get_top_categories(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Get top categories with comparison"""
    try:
        service = AnalyticsService(db)
        result = await service.get_top_categories(
            start_date, end_date, compare_start_date, compare_end_date, store_ids
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching top categories: {str(e)}"
        )


@router.get(
    "/store-comparison",
    summary="Get store comparison metrics"
)
async def get_store_comparison(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Get comprehensive store comparison showing all stores with:
    - Total Sales
    - Total Profit
    - Transaction Count
    - Average Transaction Value
    Sortable by any column.
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_store_comparison(start_date, end_date)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store comparison: {str(e)}"
        )


@router.get(
    "/day-of-week-patterns",
    summary="Get day of week patterns"
)
async def get_day_of_week_patterns(
    db: AsyncSession = Depends(get_db),
):
    """
    Get day of week patterns for the last 8 weeks showing:
    - Sales by Day
    - Profit by Day
    - Transaction Count by Day
    - Avg Transaction Value by Day
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_day_of_week_patterns()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching day of week patterns: {str(e)}"
        )


@router.get(
    "/product-combos",
    summary="Get product combinations"
)
async def get_product_combos(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    limit: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    Get top product pairs bought together in the same transaction showing:
    - Product 1 and Product 2 names
    - Frequency (how many times bought together)
    - Combined Sales
    - Percentage of Total Transactions
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_product_combos(start_date, end_date, limit)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching product combos: {str(e)}"
        )


@router.get(
    "/sales-anomalies",
    summary="Get sales anomalies and alerts"
)
async def get_sales_anomalies(
    db: AsyncSession = Depends(get_db),
):
    """
    Get products with significant sales drops showing:
    - Products where 7-day avg sales dropped >15% from 30-day baseline
    - Store name
    - Percentage change
    - Severity badge (Critical for >30% drop, Warning for 15-30% drop)
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_sales_anomalies()
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sales anomalies: {str(e)}"
        )

@router.get("/store-categories")
async def get_store_categories(
    store_id: int,
    start_date: str,
    end_date: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get product categories ranked by sales for a specific store.
    """
    try:
        service = AnalyticsService(db)
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        result = await service.get_store_categories(store_id, start, end)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store categories: {str(e)}"
        )


@router.get("/store-top-products")
async def get_store_top_products(
    store_id: int,
    start_date: str,
    end_date: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """
    Get top products ranked by sales for a specific store.
    """
    try:
        service = AnalyticsService(db)
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        result = await service.get_store_top_products(store_id, start, end, limit)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store top products: {str(e)}"
        )


# STORE COMPARISON V2 ENDPOINTS

@router.get(
    "/store-comparison-v2",
    summary="Get comprehensive store comparison with period comparison"
)
async def get_store_comparison_v2(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """
    Get comprehensive store comparison metrics showing current and previous period data.
    Returns heatmap data for all stores with Revenue, Transaction Count, Avg Ticket, and Margin %.
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_store_comparison_v2(
            start_date, end_date, compare_start_date, compare_end_date, store_ids
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store comparison v2: {str(e)}"
        )


@router.get(
    "/store-drilldown-v2",
    summary="Get detailed drill-down analysis for a specific store"
)
async def get_store_drilldown_v2(
    store_id: str = Query(...),
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed drill-down data for a specific store including:
    - Revenue gap vs best performer ($ and %)
    - Transaction count breakdown
    - Average ticket size comparison
    - Top 5 categories by revenue for that store vs store average
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_store_drilldown_v2(store_id, start_date, end_date)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store drilldown v2: {str(e)}"
        )


@router.get(
    "/category-performance-matrix",
    summary="Get category performance matrix across all stores"
)
async def get_category_performance_matrix(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """
    Get category performance matrix showing revenue for each category/store combination.
    Helps identify where stores diverge (e.g., Snacks crushing at North Edsa but weak at Magnolia).
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_category_performance_matrix(start_date, end_date, store_ids)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching category performance matrix: {str(e)}"
        )


@router.get(
    "/store-weekly-trends",
    summary="Get weekly sales trends for stores"
)
async def get_store_weekly_trends(
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """
    Get weekly sales trends for the last 8 weeks for each store.
    Returns sparkline data showing momentum (going up, down, flat).
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_store_weekly_trends(store_ids)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching store weekly trends: {str(e)}"
        )


@router.get(
    "/top-movers",
    summary="Get top movers - products and categories"
)
async def get_top_movers(
    start_date: datetime = Query(...),
    end_date: datetime = Query(...),
    compare_start_date: datetime = Query(...),
    compare_end_date: datetime = Query(...),
    store_ids: List[str] = Query(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """
    Get top movers knowing products and categories with biggest revenue changes.
    Returns top 5 products up/down and top 3 categories up/down by absolute revenue impact.
    """
    try:
        service = AnalyticsService(db)
        result = await service.get_top_movers(
            start_date, end_date, compare_start_date, compare_end_date, store_ids
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching top movers: {str(e)}"
        )


@router.post(
    "/invalidate-cache",
    summary="Clear all analytics cache",
    description="Invalidates all Redis cache for analytics endpoints. Use this to force fresh data."
)
async def invalidate_analytics_cache():
    """
    Clear all analytics cache to force fresh data fetch.

    This endpoint clears all cached analytics data stored in Redis.
    After calling this endpoint, all subsequent analytics requests will
    fetch fresh data from the database.

    Returns:
        Dictionary with number of cache keys deleted
    """
    try:
        # Invalidate all analytics-related caches
        deleted_count = await invalidate_cache("analytics:*")

        return {
            "success": True,
            "message": f"Successfully invalidated {deleted_count} cache entries",
            "deleted_count": deleted_count
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error invalidating cache: {str(e)}"
        )
