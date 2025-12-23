from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
from datetime import datetime
import traceback
from app.core.database import get_db
from app.schemas.report import ProductSalesReportResponse, ReportMeta, ReportRow, ComparisonStoreData

router = APIRouter()


@router.get("/product-sales", response_model=ProductSalesReportResponse)
async def get_product_sales_report(
    sales_store_id: str = Query(..., description="Store ID for sales data"),
    compare_store_ids: List[str] = Query(..., description="Store IDs for comparison (inventory and sales)"),
    start: str = Query(..., description="Start datetime in ISO format with timezone (e.g., 2024-01-01T00:00:00+08:00)"),
    end: str = Query(..., description="End datetime in ISO format with timezone (e.g., 2024-01-31T23:59:59+08:00)"),
    categories: List[str] | None = Query(None, description="Filter by product categories"),
    min_quantity: int | None = Query(None, ge=0, description="Minimum quantity sold"),
    max_quantity: int | None = Query(None, ge=0, description="Maximum quantity sold"),
    limit: int | None = Query(None, ge=1, le=10000, description="Limit number of results (top N)"),
    sort_by: str = Query("quantity_sold", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    search: str | None = Query(None, description="Search in product name, SKU, or product ID"),
    min_price: float | None = Query(None, ge=0, description="Minimum unit price"),
    max_price: float | None = Query(None, ge=0, description="Maximum unit price"),
    min_profit_margin: float | None = Query(None, ge=0, le=100, description="Minimum profit margin percentage"),
    max_profit_margin: float | None = Query(None, ge=0, le=100, description="Maximum profit margin percentage"),
    days_of_week: List[str] | None = Query(None, description="Filter by days of week (monday, tuesday, etc)"),
    db: AsyncSession = Depends(get_db),
) -> ProductSalesReportResponse:
    """
    Generate a product sales report with multi-store comparison.

    Returns sales data from the sales store for the specified date range (Asia/Manila timezone),
    along with sales and inventory data from multiple comparison stores.

    Results are grouped by product category and sorted by quantity sold (descending) within each category.
    Categories are sorted alphabetically.

    Args:
        sales_store_id: Store ID to get sales transactions from
        compare_store_ids: List of Store IDs to compare sales and inventory against
        start: Start datetime (inclusive) in ISO format with timezone
        end: End datetime (inclusive up to 23:59:59) in ISO format with timezone
        db: Database session

    Returns:
        ProductSalesReportResponse with meta information and report rows with dynamic comparison columns
    """
    # Validate required parameters
    if not sales_store_id or not sales_store_id.strip():
        raise HTTPException(status_code=400, detail="sales_store_id is required")
    if not compare_store_ids or len(compare_store_ids) == 0:
        raise HTTPException(status_code=400, detail="At least one compare_store_ids is required")
    if not start or not start.strip():
        raise HTTPException(status_code=400, detail="start datetime is required")
    if not end or not end.strip():
        raise HTTPException(status_code=400, detail="end datetime is required")

    # Validate datetime format
    try:
        datetime.fromisoformat(start.replace('Z', '+00:00'))
        datetime.fromisoformat(end.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid datetime format. Use ISO format with timezone (e.g., 2024-01-01T00:00:00+08:00): {str(e)}"
        )

    # Validate sort parameters
    valid_sort_fields = ['category', 'product_name', 'sku', 'product_id', 'quantity_sold', 'inventory_store_a', 'inventory_store_b']
    if sort_by not in valid_sort_fields:
        raise HTTPException(status_code=400, detail=f"Invalid sort_by field. Must be one of: {', '.join(valid_sort_fields)}")

    if sort_order.lower() not in ['asc', 'desc']:
        raise HTTPException(status_code=400, detail="Invalid sort_order. Must be 'asc' or 'desc'")

    # Build dynamic WHERE clauses for filters
    category_filter = ""
    if categories:
        # Use parameterized IN clause
        category_placeholders = ', '.join([f":category_{i}" for i in range(len(categories))])
        category_filter = f"AND p.category IN ({category_placeholders})"

    search_filter = ""
    if search:
        search_filter = """
            AND (
                LOWER(p.name) LIKE LOWER(:search_pattern)
                OR LOWER(p.sku) LIKE LOWER(:search_pattern)
                OR LOWER(p.id) LIKE LOWER(:search_pattern)
            )
        """

    price_filter = ""
    if min_price is not None:
        price_filter += " AND p.unit_price >= :min_price"
    if max_price is not None:
        price_filter += " AND p.unit_price <= :max_price"

    day_of_week_filter = ""
    if days_of_week:
        # Map day names to PostgreSQL day numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
        day_map = {
            'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
            'thursday': 4, 'friday': 5, 'saturday': 6
        }
        day_numbers = [str(day_map.get(day.lower(), -1)) for day in days_of_week]
        day_numbers_str = ', '.join(day_numbers)
        day_of_week_filter = f"AND EXTRACT(DOW FROM t.transaction_time) IN ({day_numbers_str})"

    quantity_filter = ""
    having_clauses = []
    if min_quantity is not None:
        having_clauses.append("COALESCE(SUM(ti.quantity), 0) >= :min_quantity")
    if max_quantity is not None:
        having_clauses.append("COALESCE(SUM(ti.quantity), 0) <= :max_quantity")
    if min_profit_margin is not None:
        having_clauses.append("CASE WHEN p.unit_price > 0 THEN ((p.unit_price - COALESCE(p.cost, 0)) / p.unit_price * 100) ELSE 0 END >= :min_profit_margin")
    if max_profit_margin is not None:
        having_clauses.append("CASE WHEN p.unit_price > 0 THEN ((p.unit_price - COALESCE(p.cost, 0)) / p.unit_price * 100) ELSE 0 END <= :max_profit_margin")

    if having_clauses:
        quantity_filter = "HAVING " + " AND ".join(having_clauses)

    # Build ORDER BY clause
    order_by = f"sd.{sort_by} {sort_order.upper()}"
    if sort_by != "category":
        order_by = f"sd.category ASC NULLS LAST, {order_by}"

    # Build LIMIT clause
    limit_clause = f"LIMIT {limit}" if limit else ""

    # Build dynamic CTEs and SELECT columns for each comparison store
    compare_sales_ctes = []
    compare_inventory_ctes = []
    compare_select_columns = []
    compare_joins = []

    for idx, store_id in enumerate(compare_store_ids):
        # Sales CTE for this comparison store
        compare_sales_ctes.append(f"""
        compare_sales_{idx} AS (
            SELECT
                p.id AS product_id,
                COALESCE(SUM(ti.quantity), 0) AS quantity_sold,
                COALESCE(SUM(ti.quantity * p.unit_price), 0) AS revenue
            FROM products p
            INNER JOIN new_transaction_items ti ON p.id = ti.product_id
            INNER JOIN new_transactions t ON ti.transaction_ref_id = t.ref_id
            WHERE
                t.store_id = :compare_store_id_{idx}
                AND t.transaction_time >= CAST(:start AS timestamptz)
                AND t.transaction_time <= CAST(:end AS timestamptz)
                AND t.is_cancelled = false
            GROUP BY p.id
        )""")

        # Inventory CTE for this comparison store
        compare_inventory_ctes.append(f"""
        compare_inventory_{idx} AS (
            SELECT
                product_id,
                quantity_on_hand
            FROM inventory
            WHERE store_id = :compare_store_id_{idx}
        )""")

        # SELECT columns for this comparison store
        compare_select_columns.append(f"""
            COALESCE(cs{idx}.quantity_sold, 0) AS compare_store_{idx}_quantity_sold,
            COALESCE(ci{idx}.quantity_on_hand, 0) AS compare_store_{idx}_inventory,
            COALESCE(cs{idx}.revenue, 0) AS compare_store_{idx}_revenue,
            (sd.quantity_sold - COALESCE(cs{idx}.quantity_sold, 0)) AS compare_store_{idx}_qty_variance,
            CASE
                WHEN COALESCE(cs{idx}.quantity_sold, 0) > 0
                THEN ((sd.quantity_sold - COALESCE(cs{idx}.quantity_sold, 0)) / COALESCE(cs{idx}.quantity_sold, 0) * 100)
                ELSE 0
            END AS compare_store_{idx}_qty_variance_percent""")

        # JOIN clauses for this comparison store
        compare_joins.append(f"""
        LEFT JOIN compare_sales_{idx} cs{idx} ON sd.product_id = cs{idx}.product_id
        LEFT JOIN compare_inventory_{idx} ci{idx} ON sd.product_id = ci{idx}.product_id""")

    # Combine all dynamic parts
    all_compare_sales_ctes = ",\n        ".join(compare_sales_ctes) if compare_sales_ctes else ""
    all_compare_inventory_ctes = ",\n        ".join(compare_inventory_ctes) if compare_inventory_ctes else ""
    all_compare_select_columns = ",\n           ".join(compare_select_columns) if compare_select_columns else ""
    all_compare_joins = "\n       ".join(compare_joins) if compare_joins else ""

    # SQL query with CTEs for sales aggregation and dynamic comparison stores
    query_str = f"""
        WITH sales_data AS (
            -- Aggregate sales by product from the specified store and date range
            SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.sku,
                p.category,
                p.unit_price,
                p.cost,
                CASE
                    WHEN p.unit_price > 0 THEN ((p.unit_price - COALESCE(p.cost, 0)) / p.unit_price * 100)
                    ELSE 0
                END AS profit_margin,
                COALESCE(SUM(ti.quantity), 0) AS quantity_sold,
                COALESCE(SUM(ti.quantity * p.unit_price), 0) AS revenue
            FROM products p
            INNER JOIN new_transaction_items ti ON p.id = ti.product_id
            INNER JOIN new_transactions t ON ti.transaction_ref_id = t.ref_id
            WHERE
                t.store_id = :sales_store_id
                AND t.transaction_time >= CAST(:start AS timestamptz)
                AND t.transaction_time <= CAST(:end AS timestamptz)
                AND t.is_cancelled = false
                {category_filter}
                {search_filter}
                {price_filter}
                {day_of_week_filter}
            GROUP BY p.id, p.name, p.sku, p.category, p.unit_price, p.cost
            {quantity_filter}
        ),
        inventory_sales_store AS (
            -- Get inventory for sales store
            SELECT
                product_id,
                quantity_on_hand
            FROM inventory
            WHERE store_id = :sales_store_id
        ){(',' if compare_sales_ctes else '')}
        {all_compare_sales_ctes}{(',' if compare_inventory_ctes and compare_sales_ctes else '')}
        {all_compare_inventory_ctes}
        SELECT
            sd.category,
            sd.product_name,
            sd.sku,
            sd.product_id,
            sd.quantity_sold,
            sd.revenue,
            COALESCE(iss.quantity_on_hand, 0) AS inventory_sales_store,
            sd.unit_price,
            sd.cost,
            sd.profit_margin{(',' if compare_select_columns else '')}
            {all_compare_select_columns}
        FROM sales_data sd
        LEFT JOIN inventory_sales_store iss ON sd.product_id = iss.product_id
        {all_compare_joins}
        ORDER BY {order_by}
        {limit_clause}
    """

    query = text(query_str)

    # Build parameters dict
    params = {
        "sales_store_id": sales_store_id,
        "start": start,
        "end": end,
    }

    # Add compare store ID parameters
    for idx, store_id in enumerate(compare_store_ids):
        params[f"compare_store_id_{idx}"] = store_id

    # Add category parameters if filtering by categories
    if categories:
        for i, category in enumerate(categories):
            params[f"category_{i}"] = category

    # Add search parameter if searching
    if search:
        params["search_pattern"] = f"%{search}%"

    # Add quantity range parameters
    if min_quantity is not None:
        params["min_quantity"] = min_quantity
    if max_quantity is not None:
        params["max_quantity"] = max_quantity

    # Add price range parameters
    if min_price is not None:
        params["min_price"] = min_price
    if max_price is not None:
        params["max_price"] = max_price

    # Add profit margin parameters
    if min_profit_margin is not None:
        params["min_profit_margin"] = min_profit_margin
    if max_profit_margin is not None:
        params["max_profit_margin"] = max_profit_margin

    # Execute query with parameters
    try:
        result = await db.execute(query, params)

        # Fetch all rows
        rows_data = result.fetchall()
    except Exception as e:
        print(f"DATABASE ERROR in product-sales: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Database query error: {str(e)}"
        )

    # Convert to ReportRow objects with dynamic comparison stores
    rows = []
    for row in rows_data:
        # Build comparison stores dict from dynamic columns
        comparison_stores = {}
        for idx, store_id in enumerate(compare_store_ids):
            comparison_stores[store_id] = {
                "quantity_sold": float(getattr(row, f"compare_store_{idx}_quantity_sold", 0)),
                "inventory": int(getattr(row, f"compare_store_{idx}_inventory", 0)),
                "revenue": float(getattr(row, f"compare_store_{idx}_revenue", 0)),
                "qty_variance": float(getattr(row, f"compare_store_{idx}_qty_variance", 0)),
                "qty_variance_percent": float(getattr(row, f"compare_store_{idx}_qty_variance_percent", 0)),
            }

        rows.append(ReportRow(
            category=row.category,
            product_name=row.product_name,
            sku=row.sku,
            product_id=row.product_id,
            quantity_sold=float(row.quantity_sold),
            revenue=float(row.revenue),
            inventory_sales_store=int(row.inventory_sales_store),
            unit_price=float(row.unit_price) if row.unit_price is not None else None,
            cost=float(row.cost) if row.cost is not None else None,
            profit_margin=float(row.profit_margin) if row.profit_margin is not None else None,
            comparison_stores=comparison_stores,
        ))

    # Create metadata
    meta = ReportMeta(
        sales_store_id=sales_store_id,
        compare_store_ids=compare_store_ids,
        start=start,
        end=end,
        timezone="Asia/Manila",
        generated_at=datetime.utcnow(),
    )

    return ProductSalesReportResponse(meta=meta, rows=rows)
