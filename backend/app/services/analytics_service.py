"""
Analytics service layer for BI Dashboard.
Contains business logic for all analytics queries.
"""
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.cache import cached

_STORE_ID_RE = re.compile(
    r'^([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$',
    re.IGNORECASE
)

def _is_valid_uuid(value: str) -> bool:
    """Return True if value is a valid store ID (MongoDB ObjectID or UUID)."""
    return bool(_STORE_ID_RE.match(str(value)))


class AnalyticsService:
    """Service class for analytics operations."""

    def __init__(self, db: AsyncSession):
        """
        Initialize analytics service.

        Args:
            db: Async database session
        """
        self.db = db

    @cached(expire=300, prefix="analytics")
    async def get_sales_by_hour(
        self,
        start_date: datetime,
        end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Get hourly sales aggregation with Asia/Manila timezone.

        Uses raw SQL for optimal performance with timezone conversion.

        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            store_ids: Optional list of store names to filter

        Returns:
            Dictionary with hourly sales data

        Example:
            >>> service = AnalyticsService(db)
            >>> result = await service.get_sales_by_hour(
            ...     start_date=datetime(2025, 10, 1),
            ...     end_date=datetime(2025, 10, 31),
            ...     store_ids=["Rockwell", "Greenhills"]
            ... )
            >>> print(result['data'][0])
            {'hour': 9, 'hour_label': '9 AM', 'total_sales': 15234.50, 'transaction_count': 45}
        """
        # Add one day to end_date to make it inclusive (end of day)
        # This is necessary because formatDateForAPI sends just the date (YYYY-MM-DD)
        # which becomes midnight (00:00:00) when parsed
        end_date_inclusive = end_date + timedelta(days=1)

        # Build store filter
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND t.store_id IN ('{store_ids_str}')"
        else:
            store_filter = ""

        query = text(f"""
            SELECT
                EXTRACT(HOUR FROM t.transaction_time AT TIME ZONE 'Asia/Manila')::int AS hour,
                COUNT(*)::int AS transaction_count,
                COALESCE(SUM(t.total), 0)::float AS total_sales
            FROM new_transactions t
            JOIN stores s ON t.store_id = s.id
            WHERE
                t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
                {store_filter}
            GROUP BY hour
            ORDER BY hour
        """)
        params = {
            "start_date": start_date,
            "end_date": end_date_inclusive
        }

        result = await self.db.execute(query, params)

        rows = result.fetchall()

        # Format the results
        data = []
        total_sales = 0.0
        total_transactions = 0

        for row in rows:
            hour = row.hour
            transaction_count = row.transaction_count
            sales = row.total_sales

            # Format hour label
            if hour == 0:
                hour_label = "12 AM"
            elif hour < 12:
                hour_label = f"{hour} AM"
            elif hour == 12:
                hour_label = "12 PM"
            else:
                hour_label = f"{hour - 12} PM"

            data.append({
                "hour": hour,
                "hour_label": hour_label,
                "total_sales": sales,
                "transaction_count": transaction_count
            })

            total_sales += sales
            total_transactions += transaction_count

        return {
            "data": data,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "store_id": None,  # Legacy field, kept for backward compatibility
            "total_sales": total_sales,
            "total_transactions": total_transactions
        }

    @cached(expire=300, prefix="analytics")
    async def get_store_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Get top performing stores by revenue.

        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            limit: Number of top stores to return

        Returns:
            Dictionary with store performance data

        Example:
            >>> result = await service.get_store_performance(
            ...     start_date=datetime(2025, 10, 1),
            ...     end_date=datetime(2025, 10, 31),
            ...     limit=10
            ... )
        """
        # Add one day to end_date to make it inclusive
        end_date_inclusive = end_date + timedelta(days=1)

        query = text("""
            WITH store_sales AS (
                SELECT
                    s.id AS store_id,
                    s.name AS store_name,
                    COUNT(t.ref_id)::int AS transaction_count,
                    COALESCE(SUM(t.total), 0)::float AS total_sales
                FROM stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY s.id, s.name
            ),
            total AS (
                SELECT COALESCE(SUM(total_sales), 0)::float AS grand_total
                FROM store_sales
            )
            SELECT
                ss.store_id,
                ss.store_name,
                ss.total_sales,
                ss.transaction_count,
                CASE
                    WHEN t.grand_total > 0 THEN (ss.total_sales / t.grand_total * 100)::float
                    ELSE 0::float
                END AS percentage_of_total,
                CASE
                    WHEN ss.transaction_count > 0 THEN (ss.total_sales / ss.transaction_count)::float
                    ELSE 0::float
                END AS avg_transaction_value
            FROM store_sales ss
            CROSS JOIN total t
            WHERE ss.total_sales > 0
            ORDER BY ss.total_sales DESC
            LIMIT :limit
        """)

        result = await self.db.execute(
            query,
            {
                "start_date": start_date,
                "end_date": end_date_inclusive,
                "limit": limit
            }
        )

        rows = result.fetchall()

        # Calculate totals
        total_sales = sum(row.total_sales for row in rows)
        total_stores = len(rows)

        data = [
            {
                "store_id": row.store_id,
                "store_name": row.store_name,
                "total_sales": row.total_sales,
                "transaction_count": row.transaction_count,
                "percentage_of_total": round(row.percentage_of_total, 2),
                "avg_transaction_value": round(row.avg_transaction_value, 2)
            }
            for row in rows
        ]

        return {
            "data": data,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "total_sales": total_sales,
            "total_stores": total_stores
        }

    @cached(expire=300, prefix="analytics")
    async def get_daily_trend(self, days: int = 30) -> Dict[str, Any]:
        """
        Get daily sales trend with cumulative totals.

        Args:
            days: Number of days to include (default: 30)

        Returns:
            Dictionary with daily trend data

        Example:
            >>> result = await service.get_daily_trend(days=30)
        """
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        # For this method, end_date is already a full datetime (now()),
        # so we don't need to add a day - it already includes the current time

        query = text("""
            WITH daily_sales AS (
                SELECT
                    DATE(transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                    COUNT(*)::int AS transaction_count,
                    COALESCE(SUM(total), 0)::float AS daily_sales
                FROM new_transactions
                WHERE
                    transaction_time >= :start_date
                    AND transaction_time < :end_date
                    AND is_cancelled = false
                GROUP BY sale_date
                ORDER BY sale_date
            )
            SELECT
                sale_date,
                daily_sales,
                transaction_count,
                SUM(daily_sales) OVER (ORDER BY sale_date)::float AS cumulative_sales
            FROM daily_sales
            ORDER BY sale_date
        """)

        result = await self.db.execute(
            query,
            {
                "start_date": start_date,
                "end_date": end_date
            }
        )

        rows = result.fetchall()

        total_sales = sum(row.daily_sales for row in rows)
        avg_daily_sales = total_sales / len(rows) if rows else 0

        data = [
            {
                "date": row.sale_date.isoformat(),
                "daily_sales": row.daily_sales,
                "cumulative_sales": row.cumulative_sales,
                "transaction_count": row.transaction_count
            }
            for row in rows
        ]

        return {
            "data": data,
            "days": days,
            "total_sales": total_sales,
            "avg_daily_sales": round(avg_daily_sales, 2)
        }

    @cached(expire=300, prefix="analytics")
    async def get_kpi_metrics(self) -> Dict[str, Any]:
        """
        Get KPI metrics comparing latest day vs previous day.

        Returns:
            Dictionary with KPI comparison data

        Example:
            >>> result = await service.get_kpi_metrics()
            >>> print(result['sales_growth_pct'])
            13.64
        """
        query = text("""
            WITH daily_metrics AS (
                SELECT
                    DATE(transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                    COUNT(*)::int AS transaction_count,
                    COALESCE(SUM(total), 0)::float AS total_sales
                FROM new_transactions
                WHERE
                    transaction_time >= CURRENT_DATE - INTERVAL '7 days'
                    AND is_cancelled = false
                GROUP BY sale_date
                ORDER BY sale_date DESC
                LIMIT 2
            )
            SELECT
                sale_date,
                total_sales,
                transaction_count
            FROM daily_metrics
            ORDER BY sale_date DESC
        """)

        result = await self.db.execute(query)
        rows = result.fetchall()

        if len(rows) < 2:
            # Not enough data, return zeros
            today = date.today()
            yesterday = today - timedelta(days=1)
            return {
                "latest_date": today.isoformat(),
                "previous_date": yesterday.isoformat(),
                "latest_sales": 0.0,
                "previous_sales": 0.0,
                "sales_growth_pct": 0.0,
                "latest_transactions": 0,
                "previous_transactions": 0,
                "transactions_growth_pct": 0.0,
                "latest_avg_transaction_value": 0.0,
                "previous_avg_transaction_value": 0.0,
                "avg_transaction_value_growth_pct": 0.0
            }

        latest = rows[0]
        previous = rows[1]

        # Calculate metrics
        latest_avg = latest.total_sales / latest.transaction_count if latest.transaction_count > 0 else 0
        previous_avg = previous.total_sales / previous.transaction_count if previous.transaction_count > 0 else 0

        # Calculate growth percentages
        sales_growth = ((latest.total_sales - previous.total_sales) / previous.total_sales * 100) if previous.total_sales > 0 else 0
        trans_growth = ((latest.transaction_count - previous.transaction_count) / previous.transaction_count * 100) if previous.transaction_count > 0 else 0
        avg_growth = ((latest_avg - previous_avg) / previous_avg * 100) if previous_avg > 0 else 0

        return {
            "latest_date": latest.sale_date.isoformat(),
            "previous_date": previous.sale_date.isoformat(),
            "latest_sales": latest.total_sales,
            "previous_sales": previous.total_sales,
            "sales_growth_pct": round(sales_growth, 2),
            "latest_transactions": latest.transaction_count,
            "previous_transactions": previous.transaction_count,
            "transactions_growth_pct": round(trans_growth, 2),
            "latest_avg_transaction_value": round(latest_avg, 2),
            "previous_avg_transaction_value": round(previous_avg, 2),
            "avg_transaction_value_growth_pct": round(avg_growth, 2)
        }

    @cached(expire=300, prefix="analytics")
    async def get_product_performance(
        self,
        start_date: datetime,
        end_date: datetime,
        category: Optional[str] = None,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Get top performing products by revenue and quantity.

        Args:
            start_date: Start date for analysis
            end_date: End date for analysis
            category: Optional category filter
            limit: Number of top products to return

        Returns:
            Dictionary with product performance data

        Example:
            >>> result = await service.get_product_performance(
            ...     start_date=datetime(2025, 10, 1),
            ...     end_date=datetime(2025, 10, 31),
            ...     category="Electronics",
            ...     limit=20
            ... )
        """
        # Add one day to end_date to make it inclusive
        end_date_inclusive = end_date + timedelta(days=1)

        # Build query dynamically to handle NULL category parameter
        if category:
            query = text("""
                SELECT
                    p.id AS product_id,
                    p.name AS product_name,
                    p.category,
                    p.sku,
                    SUM(v.quantity)::int AS quantity_sold,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS total_revenue,
                    AVG(v.item_total_resolved / NULLIF(v.quantity, 0))::float AS avg_price,
                    COUNT(DISTINCT t.ref_id)::int AS transaction_count
                FROM products p
                INNER JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                INNER JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    AND p.category = :category
                    AND v.quantity > 0
                GROUP BY p.id, p.name, p.category, p.sku
                ORDER BY total_revenue DESC
                LIMIT :limit
            """)
            params = {
                "start_date": start_date,
                "end_date": end_date_inclusive,
                "category": category,
                "limit": limit
            }
        else:
            query = text("""
                SELECT
                    p.id AS product_id,
                    p.name AS product_name,
                    p.category,
                    p.sku,
                    SUM(v.quantity)::int AS quantity_sold,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS total_revenue,
                    AVG(v.item_total_resolved / NULLIF(v.quantity, 0))::float AS avg_price,
                    COUNT(DISTINCT t.ref_id)::int AS transaction_count
                FROM products p
                INNER JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                INNER JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    AND v.quantity > 0
                GROUP BY p.id, p.name, p.category, p.sku
                ORDER BY total_revenue DESC
                LIMIT :limit
            """)
            params = {
                "start_date": start_date,
                "end_date": end_date_inclusive,
                "limit": limit
            }

        result = await self.db.execute(query, params)

        rows = result.fetchall()

        total_revenue = sum(row.total_revenue for row in rows)
        total_quantity = sum(row.quantity_sold for row in rows)

        data = [
            {
                "product_id": row.product_id,
                "product_name": row.product_name,
                "category": row.category,
                "sku": row.sku,
                "total_revenue": row.total_revenue,
                "quantity_sold": row.quantity_sold,
                "avg_price": round(row.avg_price, 2) if row.avg_price is not None else 0.0,
                "transaction_count": row.transaction_count
            }
            for row in rows
        ]

        return {
            "data": data,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "category": category,
            "total_revenue": total_revenue,
            "total_quantity": total_quantity
        }

    # NEW DASHBOARD METHODS

    @cached(expire=300, prefix="analytics")
    async def get_kpi_data_for_period(
        self,
        start_date: datetime,
        end_date: datetime,
        store_ids: List[str]
    ) -> Dict[str, Any]:
        """Get KPI data for a specific period"""

        # Add one day to end_date to make it inclusive (end of day)
        # This is necessary because formatDateForAPI sends just the date (YYYY-MM-DD)
        # which becomes midnight (00:00:00) when parsed
        end_date_inclusive = end_date + timedelta(days=1)

        # Build store filter using subquery to convert store names to IDs
        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND store_id IN ('{store_ids_str}')"

        query = text(f"""
            WITH period_data AS (
                SELECT
                    COALESCE(SUM(total), 0)::float AS total_sales,
                    COUNT(DISTINCT ref_id)::int AS transactions
                FROM new_transactions
                WHERE
                    transaction_time >= :start_date
                    AND transaction_time < :end_date
                    AND is_cancelled = false
                    {store_filter}
            ),
            profit_data AS (
                SELECT
                    COALESCE(SUM(v.item_total_resolved - (COALESCE(p.cost, 0) * v.quantity)), 0)::float AS total_profit
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN products p ON v.product_id = p.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter.replace('AND store_id IN', 'AND t.store_id IN')}
            )
            SELECT
                pd.total_sales,
                pd.transactions,
                prof.total_profit,
                CASE
                    WHEN pd.transactions > 0 THEN pd.total_sales / pd.transactions
                    ELSE 0
                END AS avg_transaction_value
            FROM period_data pd, profit_data prof
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        row = result.fetchone()

        return {
            "total_sales": float(row.total_sales or 0),
            "total_profit": float(row.total_profit or 0),
            "transactions": int(row.transactions or 0),
            "avg_transaction_value": float(row.avg_transaction_value or 0)
        }

    @cached(expire=300, prefix="analytics")
    async def get_sales_by_category(
        self,
        start_date: datetime,
        end_date: datetime,
        store_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """Get sales aggregated by category"""

        # Add one day to end_date to make it inclusive
        end_date_inclusive = end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND t.store_id IN ('{store_ids_str}')"

        query = text(f"""
            SELECT
                COALESCE(p.category, 'n/a') as category,
                COALESCE(SUM(v.item_total_resolved), 0)::float as total_sales
            FROM v_new_transaction_items_resolved v
            JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
            JOIN products p ON v.product_id = p.id
            WHERE
                t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
                {store_filter}
            GROUP BY p.category
            ORDER BY total_sales DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        rows = result.fetchall()

        return [
            {
                "category": row.category,
                "total_sales": float(row.total_sales or 0)
            }
            for row in rows
        ]

    @cached(expire=600, prefix="analytics")  # 10 minutes - inventory changes less frequently
    async def get_inventory_by_category(
        self,
        store_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """Get inventory value by category"""

        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND i.store_id IN ('{store_ids_str}')"

        query = text(f"""
            SELECT
                COALESCE(p.category, 'n/a') as category,
                COALESCE(SUM(i.quantity_on_hand * p.cost), 0)::float as inventory_value
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE i.quantity_on_hand > 0
                {store_filter}
            GROUP BY p.category
            ORDER BY inventory_value DESC
        """)

        result = await self.db.execute(query, {})
        rows = result.fetchall()

        return [
            {
                "category": row.category,
                "inventory_value": float(row.inventory_value or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_sales_by_store(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str] = []
    ) -> List[Dict[str, Any]]:
        """Get sales by store with comparison"""

        # Add one day to end dates to make them inclusive
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        # Build store filter
        store_where = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_where = f"WHERE id IN ('{store_ids_str}')"

        query = text(f"""
            WITH filtered_stores AS (
                SELECT id, name
                FROM stores
                {store_where}
            ),
            current_period AS (
                SELECT
                    s.name as store_name,
                    COALESCE(SUM(t.total), 0)::float as current_sales
                FROM filtered_stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY s.name
            ),
            previous_period AS (
                SELECT
                    s.name as store_name,
                    COALESCE(SUM(t.total), 0)::float as previous_sales
                FROM filtered_stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                GROUP BY s.name
            )
            SELECT
                COALESCE(c.store_name, p.store_name) as store_name,
                COALESCE(c.current_sales, 0) as current_sales,
                COALESCE(p.previous_sales, 0) as previous_sales
            FROM current_period c
            FULL OUTER JOIN previous_period p ON c.store_name = p.store_name
            ORDER BY current_sales DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive
        })
        rows = result.fetchall()

        return [
            {
                "store_name": row.store_name,
                "current_sales": float(row.current_sales or 0),
                "previous_sales": float(row.previous_sales or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_top_products(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """Get top products with comparison"""

        # Add one day to end dates to make them inclusive
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND t.store_id IN ('{store_ids_str}')"

        query = text(f"""
            WITH current_period AS (
                SELECT
                    p.name as product_name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as current_sales
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                JOIN products p ON v.product_id = p.id
                GROUP BY p.name
            ),
            previous_period AS (
                SELECT
                    p.name as product_name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as previous_sales
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                    {store_filter}
                JOIN products p ON v.product_id = p.id
                GROUP BY p.name
            )
            SELECT
                COALESCE(c.product_name, p.product_name) as product_name,
                COALESCE(c.current_sales, 0) as current_sales,
                COALESCE(p.previous_sales, 0) as previous_sales
            FROM current_period c
            FULL OUTER JOIN previous_period p ON c.product_name = p.product_name
            WHERE COALESCE(c.current_sales, 0) > 0 OR COALESCE(p.previous_sales, 0) > 0
            ORDER BY current_sales DESC
            LIMIT :limit
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive,
            "limit": limit
        })
        rows = result.fetchall()

        return [
            {
                "product_name": row.product_name,
                "current_sales": float(row.current_sales or 0),
                "previous_sales": float(row.previous_sales or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_sales_trend(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str],
        granularity: str
    ) -> Dict[str, Any]:
        """Get sales trend with comparison"""

        # Add one day to end dates to make them inclusive
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND store_id IN ('{store_ids_str}')"

        # Determine grouping based on granularity
        if granularity == "hour":
            time_group = "DATE_TRUNC('hour', transaction_time AT TIME ZONE 'Asia/Manila')"
        else:  # day
            time_group = "DATE_TRUNC('day', transaction_time AT TIME ZONE 'Asia/Manila')"

        # Current period
        current_query = text(f"""
            SELECT
                {time_group} as date,
                COALESCE(SUM(total), 0)::float as sales
            FROM new_transactions
            WHERE
                transaction_time >= :start_date
                AND transaction_time < :end_date
                AND is_cancelled = false
                {store_filter}
            GROUP BY date
            ORDER BY date
        """)

        current_result = await self.db.execute(current_query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        current_rows = current_result.fetchall()

        # Previous period
        previous_query = text(f"""
            SELECT
                {time_group} as date,
                COALESCE(SUM(total), 0)::float as sales
            FROM new_transactions
            WHERE
                transaction_time >= :compare_start_date
                AND transaction_time < :compare_end_date
                AND is_cancelled = false
                {store_filter}
            GROUP BY date
            ORDER BY date
        """)

        previous_result = await self.db.execute(previous_query, {
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive
        })
        previous_rows = previous_result.fetchall()

        return {
            "current": [
                {
                    "date": row.date.isoformat() if row.date else None,
                    "sales": float(row.sales or 0)
                }
                for row in current_rows
            ],
            "previous": [
                {
                    "date": row.date.isoformat() if row.date else None,
                    "sales": float(row.sales or 0)
                }
                for row in previous_rows
            ]
        }

    @cached(expire=300, prefix="analytics")
    async def get_top_categories(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str]
    ) -> List[Dict[str, Any]]:
        """Get top categories with comparison"""

        # Add one day to end dates to make them inclusive
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            store_ids_str = "', '".join(store_ids)
            store_filter = f"AND t.store_id IN ('{store_ids_str}')"

        query = text(f"""
            WITH current_period AS (
                SELECT
                    COALESCE(p.category, 'n/a') as category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as current_sales
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                JOIN products p ON v.product_id = p.id
                GROUP BY p.category
            ),
            previous_period AS (
                SELECT
                    COALESCE(p.category, 'n/a') as category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as previous_sales
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                    {store_filter}
                JOIN products p ON v.product_id = p.id
                GROUP BY p.category
            )
            SELECT
                COALESCE(c.category, p.category) as category,
                COALESCE(c.current_sales, 0) as current_sales,
                COALESCE(p.previous_sales, 0) as previous_sales
            FROM current_period c
            FULL OUTER JOIN previous_period p ON c.category = p.category
            WHERE COALESCE(c.current_sales, 0) > 0 OR COALESCE(p.previous_sales, 0) > 0
            ORDER BY current_sales DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive
        })
        rows = result.fetchall()

        return [
            {
                "category": row.category,
                "current_sales": float(row.current_sales or 0),
                "previous_sales": float(row.previous_sales or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_store_comparison(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get comprehensive store comparison metrics.

        Returns all stores with total sales, profit, transaction count, and avg transaction value.
        """
        # Add one day to end_date to make it inclusive
        end_date_inclusive = end_date + timedelta(days=1)

        query = text("""
            WITH store_metrics AS (
                SELECT
                    s.id,
                    s.name as store_name,
                    COUNT(DISTINCT t.ref_id)::int AS transaction_count,
                    COALESCE(SUM(t.total), 0)::float AS total_sales,
                    COALESCE(SUM(CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (1, 2, 3, 4, 5)
                        THEN t.total
                        ELSE 0
                    END), 0)::float AS weekday_sales,
                    COALESCE(SUM(CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (6, 0)
                        THEN t.total
                        ELSE 0
                    END), 0)::float AS weekend_sales,
                    COUNT(DISTINCT CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (1, 2, 3, 4, 5)
                        THEN DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
                    END)::int AS weekday_count,
                    COUNT(DISTINCT CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (6, 0)
                        THEN DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
                    END)::int AS weekend_count,
                    COUNT(DISTINCT CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (1, 2, 3, 4, 5)
                        THEN t.ref_id
                    END)::int AS weekday_transaction_count,
                    COUNT(DISTINCT CASE
                        WHEN EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila') IN (6, 0)
                        THEN t.ref_id
                    END)::int AS weekend_transaction_count
                FROM stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                WHERE s.name NOT IN (
                    'Aji Ichiban Food Products', 'AJI Disposal', 'Aji Packing',
                    'Test stoee', 'AJI PINA', 'Digital Store', 'AJI CMG',
                    'AJI BARN', 'AJI ONLINE'
                )
                GROUP BY s.id, s.name
            ),
            store_profit AS (
                SELECT
                    t.store_id,
                    COALESCE(SUM(v.item_total_resolved - (COALESCE(p.cost, 0) * v.quantity)), 0)::float AS total_profit
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY t.store_id
            )
            SELECT
                sm.store_name,
                sm.total_sales,
                COALESCE(sp.total_profit, 0)::float as total_profit,
                sm.transaction_count,
                CASE
                    WHEN sm.transaction_count > 0 THEN (sm.total_sales / sm.transaction_count)::float
                    ELSE 0::float
                END AS avg_transaction_value,
                CASE
                    WHEN sm.weekday_count > 0 THEN (sm.weekday_sales / sm.weekday_count)::float
                    ELSE 0::float
                END AS avg_weekday_sales,
                CASE
                    WHEN sm.weekend_count > 0 THEN (sm.weekend_sales / sm.weekend_count)::float
                    ELSE 0::float
                END AS avg_weekend_sales,
                CASE
                    WHEN sm.weekday_transaction_count > 0 THEN (sm.weekday_sales / sm.weekday_transaction_count)::float
                    ELSE 0::float
                END AS avg_weekday_transaction_value,
                CASE
                    WHEN sm.weekend_transaction_count > 0 THEN (sm.weekend_sales / sm.weekend_transaction_count)::float
                    ELSE 0::float
                END AS avg_weekend_transaction_value
            FROM store_metrics sm
            LEFT JOIN store_profit sp ON sm.id = sp.store_id
            ORDER BY sm.total_sales DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        rows = result.fetchall()

        return [
            {
                "store_name": row.store_name,
                "total_sales": float(row.total_sales or 0),
                "total_profit": float(row.total_profit or 0),
                "transaction_count": int(row.transaction_count or 0),
                "avg_transaction_value": float(row.avg_transaction_value or 0),
                "avg_weekday_sales": float(row.avg_weekday_sales or 0),
                "avg_weekend_sales": float(row.avg_weekend_sales or 0),
                "avg_weekday_transaction_value": float(row.avg_weekday_transaction_value or 0),
                "avg_weekend_transaction_value": float(row.avg_weekend_transaction_value or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_day_of_week_patterns(self, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict[str, Any]:
        """
        Get day of week patterns for a date range.

        Returns sales, profit, transaction count, and avg transaction value by day of week.
        If start_date and end_date are not provided, defaults to last 8 weeks.
        """
        # Default to last 8 weeks if not provided
        if end_date is None:
            end_date = datetime.now()
        if start_date is None:
            start_date = end_date - timedelta(weeks=8)

        query = text("""
            WITH daily_data AS (
                SELECT
                    DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') as date,
                    EXTRACT(DOW FROM t.transaction_time AT TIME ZONE 'Asia/Manila')::int as day_of_week,
                    TO_CHAR(t.transaction_time AT TIME ZONE 'Asia/Manila', 'Day') as day_name,
                    COUNT(DISTINCT t.ref_id)::int as transaction_count,
                    COALESCE(SUM(t.total), 0)::float as total_sales,
                    COALESCE(SUM(v.item_total_resolved - (COALESCE(p.cost, 0) * v.quantity)), 0)::float as total_profit
                FROM new_transactions t
                LEFT JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                LEFT JOIN products p ON v.product_id = p.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY date, day_of_week, day_name
            )
            SELECT
                day_of_week,
                TRIM(day_name) as day_name,
                COALESCE(AVG(total_sales), 0)::float as total_sales,
                COALESCE(AVG(total_profit), 0)::float as total_profit,
                COALESCE(AVG(transaction_count), 0)::float as transaction_count,
                CASE
                    WHEN AVG(transaction_count) > 0 THEN (AVG(total_sales) / AVG(transaction_count))::float
                    ELSE 0::float
                END as avg_transaction_value
            FROM daily_data
            GROUP BY day_of_week, day_name
            ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date
        })
        rows = result.fetchall()

        # Calculate number of weeks in the date range
        days_diff = (end_date - start_date).days
        weeks_count = max(1, round(days_diff / 7))

        return {
            "data": [
                {
                    "day_of_week": row.day_of_week,
                    "day_name": row.day_name,
                    "total_sales": float(row.total_sales or 0),
                    "total_profit": float(row.total_profit or 0),
                    "transaction_count": float(row.transaction_count or 0),
                    "avg_transaction_value": float(row.avg_transaction_value or 0)
                }
                for row in rows
            ],
            "weeks": weeks_count,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }

    @cached(expire=300, prefix="analytics")
    async def get_product_combos(
        self,
        start_date: datetime,
        end_date: datetime,
        limit: int = 15
    ) -> List[Dict[str, Any]]:
        """
        Get top product pairs bought together in the same transaction.

        Returns top 15 product combinations with frequency, combined sales, and % of total transactions.
        """
        # Add one day to end_date to make it inclusive
        end_date_inclusive = end_date + timedelta(days=1)

        query = text("""
            WITH transaction_products AS (
                SELECT DISTINCT
                    t.ref_id as transaction_id,
                    p.name as product_name,
                    v.item_total_resolved as sales
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    AND v.quantity > 0
                    AND COALESCE(p.unit_price, 0) > 0
                    AND LOWER(p.name) NOT LIKE '%free%'
            ),
            product_pairs AS (
                SELECT
                    tp1.product_name as product1,
                    tp2.product_name as product2,
                    tp1.transaction_id,
                    (tp1.sales + tp2.sales) as combined_sales
                FROM transaction_products tp1
                JOIN transaction_products tp2 ON tp1.transaction_id = tp2.transaction_id
                WHERE tp1.product_name < tp2.product_name
            ),
            total_transactions AS (
                SELECT COUNT(DISTINCT ref_id)::float as total FROM new_transactions
                WHERE
                    transaction_time >= :start_date
                    AND transaction_time < :end_date
                    AND is_cancelled = false
            )
            SELECT
                pp.product1,
                pp.product2,
                COUNT(DISTINCT pp.transaction_id)::int as frequency,
                SUM(pp.combined_sales)::float as combined_sales,
                (COUNT(DISTINCT pp.transaction_id)::float / tt.total * 100)::float as pct_of_transactions
            FROM product_pairs pp
            CROSS JOIN total_transactions tt
            GROUP BY pp.product1, pp.product2, tt.total
            ORDER BY frequency DESC
            LIMIT :limit
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "limit": limit
        })
        rows = result.fetchall()

        return [
            {
                "product1": row.product1,
                "product2": row.product2,
                "frequency": int(row.frequency or 0),
                "combined_sales": float(row.combined_sales or 0),
                "pct_of_transactions": float(row.pct_of_transactions or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_sales_anomalies(self) -> List[Dict[str, Any]]:
        """
        Get products with significant sales drops.

        Identifies products where current 7-day avg sales dropped >15% from 30-day baseline.
        Includes severity level (Critical for >30% drop, Warning for 15-30% drop).
        """
        end_date = datetime.now()
        seven_day_start = end_date - timedelta(days=7)
        thirty_day_start = end_date - timedelta(days=30)

        query = text("""
            WITH last_7_days AS (
                SELECT
                    p.id as product_id,
                    p.name as product_name,
                    t.store_id,
                    s.name as store_name,
                    AVG(v.item_total_resolved)::float as avg_7_day_sales
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :seven_day_start
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    AND v.quantity > 0
                GROUP BY p.id, p.name, t.store_id, s.name
            ),
            last_30_days AS (
                SELECT
                    p.id as product_id,
                    t.store_id,
                    AVG(v.item_total_resolved)::float as avg_30_day_sales
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE
                    t.transaction_time >= :thirty_day_start
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    AND v.quantity > 0
                GROUP BY p.id, t.store_id
            )
            SELECT
                l7.product_name,
                l7.store_name,
                l7.avg_7_day_sales,
                l30.avg_30_day_sales,
                ((l7.avg_7_day_sales - l30.avg_30_day_sales) / l30.avg_30_day_sales * 100)::float as pct_change,
                CASE
                    WHEN ((l7.avg_7_day_sales - l30.avg_30_day_sales) / l30.avg_30_day_sales * 100) < -30 THEN 'Critical'
                    ELSE 'Warning'
                END as severity
            FROM last_7_days l7
            JOIN last_30_days l30 ON l7.product_id = l30.product_id AND l7.store_id = l30.store_id
            WHERE
                l30.avg_30_day_sales > 0
                AND ((l7.avg_7_day_sales - l30.avg_30_day_sales) / l30.avg_30_day_sales * 100) < -15
            ORDER BY pct_change ASC
            LIMIT 50
        """)

        result = await self.db.execute(query, {
            "seven_day_start": seven_day_start,
            "thirty_day_start": thirty_day_start,
            "end_date": end_date
        })
        rows = result.fetchall()

        return [
            {
                "product_name": row.product_name,
                "store_name": row.store_name,
                "avg_7_day_sales": float(row.avg_7_day_sales or 0),
                "avg_30_day_sales": float(row.avg_30_day_sales or 0),
                "pct_change": float(row.pct_change or 0),
                "severity": row.severity
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_store_categories(
        self,
        store_id: int,
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        Get product categories ranked by sales for a specific store.
        """
        end_date_inclusive = end_date + timedelta(days=1)

        query = text("""
            SELECT
                p.category,
                COALESCE(SUM(v.item_total_resolved), 0)::float as total_sales,
                COUNT(DISTINCT t.ref_id)::int as transaction_count
            FROM products p
            JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
            JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
            WHERE
                t.store_id = :store_id
                AND t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
                AND v.quantity > 0
            GROUP BY p.category
            ORDER BY total_sales DESC
        """)

        result = await self.db.execute(query, {
            "store_id": store_id,
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        rows = result.fetchall()

        return [
            {
                "category": row.category or "Uncategorized",
                "total_sales": float(row.total_sales or 0),
                "transaction_count": int(row.transaction_count or 0)
            }
            for row in rows
        ]

    @cached(expire=300, prefix="analytics")
    async def get_store_top_products(
        self,
        store_id: int,
        start_date: datetime,
        end_date: datetime,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top products ranked by sales for a specific store.
        """
        end_date_inclusive = end_date + timedelta(days=1)

        query = text("""
            SELECT
                p.name as product_name,
                p.category,
                COALESCE(SUM(v.item_total_resolved), 0)::float as total_sales,
                COALESCE(SUM(v.quantity), 0)::int as quantity_sold,
                COUNT(DISTINCT t.ref_id)::int as transaction_count
            FROM products p
            JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
            JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
            WHERE
                t.store_id = :store_id
                AND t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
                AND v.quantity > 0
            GROUP BY p.id, p.name, p.category
            ORDER BY total_sales DESC
            LIMIT :limit
        """)

        result = await self.db.execute(query, {
            "store_id": store_id,
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "limit": limit
        })
        rows = result.fetchall()

        return [
            {
                "product_name": row.product_name,
                "category": row.category or "Uncategorized",
                "total_sales": float(row.total_sales or 0),
                "quantity_sold": int(row.quantity_sold or 0),
                "transaction_count": int(row.transaction_count or 0)
            }
            for row in rows
        ]

    # STORE COMPARISON V2 METHODS

    @cached(expire=300, prefix="analytics")
    async def get_store_comparison_v2(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Get comprehensive store comparison metrics for the heatmap view.
        Returns current and previous period data for all stores.
        """
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        # Build store filter
        store_filter = ""
        if store_ids:
            validated_ids = [sid for sid in store_ids if _is_valid_uuid(sid)]
            if validated_ids:
                store_ids_str = "', '".join(validated_ids)
                store_filter = f"AND s.id IN ('{store_ids_str}')"

        query = text(f"""
            WITH current_period AS (
                SELECT
                    s.id as store_id,
                    s.name as store_name,
                    COALESCE(SUM(t.total), 0)::float as revenue,
                    COUNT(DISTINCT t.ref_id)::int as transaction_count,
                    CASE
                        WHEN COUNT(DISTINCT t.ref_id) > 0 THEN (COALESCE(SUM(t.total), 0) / COUNT(DISTINCT t.ref_id))::float
                        ELSE 0::float
                    END as avg_ticket
                FROM stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                WHERE 1=1
                    {store_filter}
                GROUP BY s.id, s.name
            ),
            current_profit AS (
                SELECT
                    t.store_id,
                    COALESCE(SUM(v.item_total_resolved - (COALESCE(p.cost, 0) * v.quantity)), 0)::float AS profit,
                    COALESCE(SUM(t.total), 0)::float as total_revenue
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY t.store_id
            ),
            previous_period AS (
                SELECT
                    s.id as store_id,
                    COALESCE(SUM(t.total), 0)::float as revenue,
                    COUNT(DISTINCT t.ref_id)::int as transaction_count,
                    CASE
                        WHEN COUNT(DISTINCT t.ref_id) > 0 THEN (COALESCE(SUM(t.total), 0) / COUNT(DISTINCT t.ref_id))::float
                        ELSE 0::float
                    END as avg_ticket
                FROM stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                WHERE 1=1
                    {store_filter}
                GROUP BY s.id
            ),
            previous_profit AS (
                SELECT
                    t.store_id,
                    COALESCE(SUM(v.item_total_resolved - (COALESCE(p.cost, 0) * v.quantity)), 0)::float AS profit,
                    COALESCE(SUM(t.total), 0)::float as total_revenue
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY t.store_id
            )
            SELECT
                cp.store_id,
                cp.store_name,
                cp.revenue as current_revenue,
                cp.transaction_count as current_transaction_count,
                cp.avg_ticket as current_avg_ticket,
                CASE
                    WHEN cprof.total_revenue > 0 THEN ((cprof.profit / cprof.total_revenue) * 100)::float
                    ELSE 0::float
                END as current_margin_pct,
                COALESCE(pp.revenue, 0) as previous_revenue,
                COALESCE(pp.transaction_count, 0) as previous_transaction_count,
                COALESCE(pp.avg_ticket, 0) as previous_avg_ticket,
                CASE
                    WHEN COALESCE(pprof.total_revenue, 0) > 0 THEN ((COALESCE(pprof.profit, 0) / pprof.total_revenue) * 100)::float
                    ELSE 0::float
                END as previous_margin_pct
            FROM current_period cp
            LEFT JOIN current_profit cprof ON cp.store_id = cprof.store_id
            LEFT JOIN previous_period pp ON cp.store_id = pp.store_id
            LEFT JOIN previous_profit pprof ON cp.store_id = pprof.store_id
            ORDER BY cp.revenue DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive
        })
        rows = result.fetchall()

        stores_data = []
        for row in rows:
            stores_data.append({
                "store_id": str(row.store_id),
                "store_name": row.store_name,
                "current": {
                    "revenue": float(row.current_revenue or 0),
                    "transaction_count": int(row.current_transaction_count or 0),
                    "avg_ticket": float(row.current_avg_ticket or 0),
                    "margin_pct": float(row.current_margin_pct or 0)
                },
                "previous": {
                    "revenue": float(row.previous_revenue or 0),
                    "transaction_count": int(row.previous_transaction_count or 0),
                    "avg_ticket": float(row.previous_avg_ticket or 0),
                    "margin_pct": float(row.previous_margin_pct or 0)
                }
            })

        return {"stores": stores_data}

    @cached(expire=300, prefix="analytics")
    async def get_store_drilldown_v2(
        self,
        store_id: str,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Full store drilldown: summary KPIs vs prior period, daily breakdown,
        hour-of-day, product movers, category movers, transaction size distribution,
        zero-sales/new products, and store rank.
        """
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        base_params = {
            "store_id": store_id,
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive,
        }

        # ── 1. SUMMARY KPIs ──────────────────────────────────────────────────
        summary_query = text("""
            WITH cur AS (
                SELECT
                    s.name                                                  AS store_name,
                    COALESCE(SUM(t.total), 0)::float                       AS revenue,
                    COUNT(DISTINCT t.ref_id)::int                          AS transactions,
                    CASE WHEN COUNT(DISTINCT t.ref_id) > 0
                         THEN (SUM(t.total) / COUNT(DISTINCT t.ref_id))::float
                         ELSE 0::float END                                  AS avg_ticket
                FROM stores s
                LEFT JOIN new_transactions t
                    ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                WHERE s.id = :store_id
                GROUP BY s.id, s.name
            ),
            pri AS (
                SELECT
                    COALESCE(SUM(t.total), 0)::float                       AS revenue,
                    COUNT(DISTINCT t.ref_id)::int                          AS transactions,
                    CASE WHEN COUNT(DISTINCT t.ref_id) > 0
                         THEN (SUM(t.total) / COUNT(DISTINCT t.ref_id))::float
                         ELSE 0::float END                                  AS avg_ticket
                FROM new_transactions t
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
            ),
            cur_items AS (
                SELECT
                    COALESCE(SUM(v.item_total_resolved), 0)::float         AS item_revenue,
                    COALESCE(SUM(v.quantity * p.cost), 0)::float           AS item_cost,
                    COALESCE(SUM(v.quantity), 0)::float                    AS total_units,
                    COUNT(DISTINCT t.ref_id)::int                          AS txn_count
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
            ),
            pri_items AS (
                SELECT
                    COALESCE(SUM(v.item_total_resolved), 0)::float         AS item_revenue,
                    COALESCE(SUM(v.quantity * p.cost), 0)::float           AS item_cost,
                    COALESCE(SUM(v.quantity), 0)::float                    AS total_units,
                    COUNT(DISTINCT t.ref_id)::int                          AS txn_count
                FROM new_transactions t
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
            ),
            cur_basket AS (
                SELECT AVG(product_count)::float AS avg_products_per_txn
                FROM (
                    SELECT t.ref_id, COUNT(DISTINCT v.product_id) AS product_count
                    FROM new_transactions t
                    JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                    WHERE t.store_id = :store_id
                        AND t.transaction_time >= :start_date
                        AND t.transaction_time < :end_date
                        AND t.is_cancelled = false
                    GROUP BY t.ref_id
                ) sub
            ),
            pri_basket AS (
                SELECT AVG(product_count)::float AS avg_products_per_txn
                FROM (
                    SELECT t.ref_id, COUNT(DISTINCT v.product_id) AS product_count
                    FROM new_transactions t
                    JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                    WHERE t.store_id = :store_id
                        AND t.transaction_time >= :compare_start_date
                        AND t.transaction_time < :compare_end_date
                        AND t.is_cancelled = false
                    GROUP BY t.ref_id
                ) sub
            )
            SELECT
                cur.store_name,
                cur.revenue               AS cur_revenue,
                cur.transactions          AS cur_transactions,
                cur.avg_ticket            AS cur_avg_ticket,
                pri.revenue               AS pri_revenue,
                pri.transactions          AS pri_transactions,
                pri.avg_ticket            AS pri_avg_ticket,
                cur_items.item_revenue    AS cur_item_revenue,
                cur_items.item_cost       AS cur_item_cost,
                pri_items.item_revenue    AS pri_item_revenue,
                pri_items.item_cost       AS pri_item_cost,
                cur_basket.avg_products_per_txn AS cur_skus_per_txn,
                pri_basket.avg_products_per_txn AS pri_skus_per_txn
            FROM cur, pri, cur_items, pri_items, cur_basket, pri_basket
        """)

        # ── 2. DAILY BREAKDOWN ───────────────────────────────────────────────
        daily_sql = text("""
            SELECT
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')        AS day_date,
                COALESCE(SUM(t.total), 0)::float                           AS revenue,
                COUNT(DISTINCT t.ref_id)::int                              AS transactions,
                CASE WHEN COUNT(DISTINCT t.ref_id) > 0
                     THEN (SUM(t.total) / COUNT(DISTINCT t.ref_id))::float
                     ELSE 0::float END                                      AS avg_ticket
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
            GROUP BY 1 ORDER BY 1
        """)

        daily_prior_sql = text("""
            SELECT
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')        AS day_date,
                COALESCE(SUM(t.total), 0)::float                           AS revenue,
                COUNT(DISTINCT t.ref_id)::int                              AS transactions,
                CASE WHEN COUNT(DISTINCT t.ref_id) > 0
                     THEN (SUM(t.total) / COUNT(DISTINCT t.ref_id))::float
                     ELSE 0::float END                                      AS avg_ticket
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :compare_start_date
                AND t.transaction_time < :compare_end_date
                AND t.is_cancelled = false
            GROUP BY 1 ORDER BY 1
        """)

        # ── 3. HOUR OF DAY ───────────────────────────────────────────────────
        hourly_sql = text("""
            SELECT
                EXTRACT(HOUR FROM t.transaction_time AT TIME ZONE 'Asia/Manila')::int AS hour,
                COALESCE(SUM(t.total), 0)::float                           AS revenue,
                COUNT(DISTINCT t.ref_id)::int                              AS transactions
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
            GROUP BY 1 ORDER BY 1
        """)

        hourly_prior_sql = text("""
            SELECT
                EXTRACT(HOUR FROM t.transaction_time AT TIME ZONE 'Asia/Manila')::int AS hour,
                COALESCE(SUM(t.total), 0)::float                           AS revenue,
                COUNT(DISTINCT t.ref_id)::int                              AS transactions
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :compare_start_date
                AND t.transaction_time < :compare_end_date
                AND t.is_cancelled = false
            GROUP BY 1 ORDER BY 1
        """)

        # ── 4. PRODUCT MOVERS ────────────────────────────────────────────────
        product_cte = """
            WITH cur_prods AS (
                SELECT p.id, p.name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY p.id, p.name
            ),
            pri_prods AS (
                SELECT p.id,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                GROUP BY p.id
            ),
            changes AS (
                SELECT
                    cp.name,
                    cp.revenue                              AS current_revenue,
                    COALESCE(pp.revenue, 0)::float          AS previous_revenue,
                    (cp.revenue - COALESCE(pp.revenue, 0))::float AS revenue_change
                FROM cur_prods cp
                LEFT JOIN pri_prods pp ON cp.id = pp.id
                WHERE GREATEST(cp.revenue, COALESCE(pp.revenue, 0)) >= 1000
            )
        """

        prod_gainers_sql  = text(product_cte + "SELECT * FROM changes WHERE revenue_change > 0 ORDER BY revenue_change DESC LIMIT 5")
        prod_decliners_sql = text(product_cte + "SELECT * FROM changes WHERE revenue_change < 0 ORDER BY revenue_change ASC LIMIT 5")

        # ── 5. CATEGORY MOVERS ───────────────────────────────────────────────
        cat_query = text("""
            WITH cur_cats AS (
                SELECT COALESCE(p.category, 'Uncategorized') AS category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY p.category
            ),
            pri_cats AS (
                SELECT COALESCE(p.category, 'Uncategorized') AS category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                GROUP BY p.category
            )
            SELECT
                cc.category,
                cc.revenue                              AS current_revenue,
                COALESCE(pc.revenue, 0)::float          AS prior_revenue,
                (cc.revenue - COALESCE(pc.revenue, 0))::float AS revenue_change
            FROM cur_cats cc
            LEFT JOIN pri_cats pc ON cc.category = pc.category
            ORDER BY ABS(cc.revenue - COALESCE(pc.revenue, 0)) DESC
        """)

        # ── 6. TRANSACTION SIZE DISTRIBUTION ────────────────────────────────
        txn_dist_sql = text("""
            SELECT
                CASE
                    WHEN t.total < 200   THEN 1
                    WHEN t.total < 500   THEN 2
                    WHEN t.total < 1000  THEN 3
                    ELSE 4
                END AS bucket_order,
                CASE
                    WHEN t.total < 200   THEN '<₱200'
                    WHEN t.total < 500   THEN '₱200-500'
                    WHEN t.total < 1000  THEN '₱500-1k'
                    ELSE '₱1k+'
                END AS bucket,
                COUNT(*)::int              AS count,
                COALESCE(SUM(t.total), 0)::float AS revenue
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :start_date
                AND t.transaction_time < :end_date
                AND t.is_cancelled = false
            GROUP BY 1, 2 ORDER BY 1
        """)

        txn_dist_prior_sql = text("""
            SELECT
                CASE
                    WHEN t.total < 200   THEN 1
                    WHEN t.total < 500   THEN 2
                    WHEN t.total < 1000  THEN 3
                    ELSE 4
                END AS bucket_order,
                CASE
                    WHEN t.total < 200   THEN '<₱200'
                    WHEN t.total < 500   THEN '₱200-500'
                    WHEN t.total < 1000  THEN '₱500-1k'
                    ELSE '₱1k+'
                END AS bucket,
                COUNT(*)::int              AS count,
                COALESCE(SUM(t.total), 0)::float AS revenue
            FROM new_transactions t
            WHERE t.store_id = :store_id
                AND t.transaction_time >= :compare_start_date
                AND t.transaction_time < :compare_end_date
                AND t.is_cancelled = false
            GROUP BY 1, 2 ORDER BY 1
        """)

        # ── 7. ZERO-SALES & NEW PRODUCTS ─────────────────────────────────────
        zero_sales_sql = text("""
            WITH cur_ids AS (
                SELECT DISTINCT v.product_id
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
            ),
            pri_prods AS (
                SELECT p.id, p.name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS prior_revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                GROUP BY p.id, p.name
                HAVING COALESCE(SUM(v.item_total_resolved), 0) >= 1000
            )
            SELECT pp.name, pp.prior_revenue
            FROM pri_prods pp
            LEFT JOIN cur_ids ci ON pp.id = ci.product_id
            WHERE ci.product_id IS NULL
            ORDER BY pp.prior_revenue DESC
            LIMIT 10
        """)

        new_products_sql = text("""
            WITH pri_ids AS (
                SELECT DISTINCT v.product_id
                FROM v_new_transaction_items_resolved v
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
            ),
            cur_prods AS (
                SELECT p.id, p.name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float AS current_revenue
                FROM v_new_transaction_items_resolved v
                JOIN products p ON v.product_id = p.id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                WHERE t.store_id = :store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                GROUP BY p.id, p.name
                HAVING COALESCE(SUM(v.item_total_resolved), 0) >= 1000
            )
            SELECT cp.name, cp.current_revenue
            FROM cur_prods cp
            LEFT JOIN pri_ids pi ON cp.id = pi.product_id
            WHERE pi.product_id IS NULL
            ORDER BY cp.current_revenue DESC
            LIMIT 10
        """)

        # ── 8. STORE RANK ────────────────────────────────────────────────────
        rank_store_filter = ""
        if store_ids:
            validated = [sid for sid in store_ids if _is_valid_uuid(sid)]
            if validated:
                ids_str = "', '".join(validated)
                rank_store_filter = f"AND t.store_id IN ('{ids_str}')"

        rank_sql = text(f"""
            SELECT store_id, rank, total_stores
            FROM (
                SELECT
                    t.store_id,
                    COALESCE(SUM(t.total), 0)::float                           AS revenue,
                    RANK() OVER (ORDER BY COALESCE(SUM(t.total), 0) DESC)::int AS rank,
                    COUNT(*) OVER ()::int                                       AS total_stores
                FROM new_transactions t
                WHERE t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {rank_store_filter}
                GROUP BY t.store_id
            ) ranked
            WHERE store_id = :store_id
        """)

        # ── EXECUTE ALL QUERIES ───────────────────────────────────────────────
        summary_row       = (await self.db.execute(summary_query,       base_params)).fetchone()
        daily_rows        = (await self.db.execute(daily_sql,           base_params)).fetchall()
        daily_prior_rows  = (await self.db.execute(daily_prior_sql,     base_params)).fetchall()
        hourly_rows       = (await self.db.execute(hourly_sql,          base_params)).fetchall()
        hourly_prior_rows = (await self.db.execute(hourly_prior_sql,    base_params)).fetchall()
        gainers_rows      = (await self.db.execute(prod_gainers_sql,    base_params)).fetchall()
        decliners_rows    = (await self.db.execute(prod_decliners_sql,  base_params)).fetchall()
        cat_rows          = (await self.db.execute(cat_query,           base_params)).fetchall()
        dist_rows         = (await self.db.execute(txn_dist_sql,        base_params)).fetchall()
        dist_prior_rows   = (await self.db.execute(txn_dist_prior_sql,  base_params)).fetchall()
        zero_rows         = (await self.db.execute(zero_sales_sql,      base_params)).fetchall()
        new_rows          = (await self.db.execute(new_products_sql,    base_params)).fetchall()
        rank_row          = (await self.db.execute(rank_sql,            base_params)).fetchone()

        if not summary_row:
            return {"store_name": store_id, "error": "No data found"}

        # ── PROCESS SUMMARY ───────────────────────────────────────────────────
        def safe_pct(cur, pri):
            if pri and pri > 0:
                return round((cur - pri) / pri * 100, 2)
            return None

        cur_rev   = float(summary_row.cur_revenue or 0)
        pri_rev   = float(summary_row.pri_revenue or 0)
        cur_txn   = int(summary_row.cur_transactions or 0)
        pri_txn   = int(summary_row.pri_transactions or 0)
        cur_avg   = float(summary_row.cur_avg_ticket or 0)
        pri_avg   = float(summary_row.pri_avg_ticket or 0)
        cur_skus  = float(summary_row.cur_skus_per_txn or 0)
        pri_skus  = float(summary_row.pri_skus_per_txn or 0)

        cur_item_rev  = float(summary_row.cur_item_revenue or 0)
        cur_item_cost = float(summary_row.cur_item_cost or 0)
        pri_item_rev  = float(summary_row.pri_item_revenue or 0)
        pri_item_cost = float(summary_row.pri_item_cost or 0)

        cur_margin = round((cur_item_rev - cur_item_cost) / cur_item_rev * 100, 2) if cur_item_rev > 0 else 0
        pri_margin = round((pri_item_rev - pri_item_cost) / pri_item_rev * 100, 2) if pri_item_rev > 0 else 0

        # ── PROCESS DAILY ─────────────────────────────────────────────────────
        def row_to_day(r):
            return {
                "date": r.day_date.isoformat(),
                "label": r.day_date.strftime("%a %-d"),
                "revenue": float(r.revenue or 0),
                "transactions": int(r.transactions or 0),
                "avg_ticket": float(r.avg_ticket or 0),
            }

        cur_days  = [row_to_day(r) for r in daily_rows]
        pri_days  = [row_to_day(r) for r in daily_prior_rows]

        daily = []
        for i, day in enumerate(cur_days):
            prior = pri_days[i] if i < len(pri_days) else {}
            daily.append({
                "label":               day["label"],
                "cur_date":            day["date"],
                "pri_date":            prior.get("date"),
                "pri_label":           prior.get("label"),
                "current_revenue":     day["revenue"],
                "prior_revenue":       prior.get("revenue", 0),
                "current_transactions": day["transactions"],
                "prior_transactions":  prior.get("transactions", 0),
                "current_avg_ticket":  day["avg_ticket"],
                "prior_avg_ticket":    prior.get("avg_ticket", 0),
            })

        # ── PROCESS HOURLY ────────────────────────────────────────────────────
        def fmt_hour(h):
            if h == 0: return "12 AM"
            if h < 12: return f"{h} AM"
            if h == 12: return "12 PM"
            return f"{h - 12} PM"

        cur_hourly  = {r.hour: r for r in hourly_rows}
        pri_hourly  = {r.hour: r for r in hourly_prior_rows}
        all_hours   = sorted(set(cur_hourly) | set(pri_hourly))
        hourly = []
        for h in all_hours:
            cr = cur_hourly.get(h)
            pr = pri_hourly.get(h)
            hourly.append({
                "hour":                h,
                "hour_label":          fmt_hour(h),
                "current_revenue":     float(cr.revenue or 0) if cr else 0,
                "prior_revenue":       float(pr.revenue or 0) if pr else 0,
                "current_transactions": int(cr.transactions or 0) if cr else 0,
                "prior_transactions":  int(pr.transactions or 0) if pr else 0,
            })

        # ── PROCESS PRODUCT MOVERS ────────────────────────────────────────────
        def build_mover(r, name_col="name"):
            prev = float(r.previous_revenue or 0)
            chg  = float(r.revenue_change or 0)
            return {
                "name":             getattr(r, name_col),
                "current_revenue":  float(r.current_revenue or 0),
                "previous_revenue": prev,
                "revenue_change":   chg,
                "change_pct":       round(chg / prev * 100, 2) if prev > 0 else None,
            }

        # ── PROCESS CATEGORIES ────────────────────────────────────────────────
        def build_cat(r):
            prev = float(r.prior_revenue or 0)
            cur  = float(r.current_revenue or 0)
            chg  = float(r.revenue_change or 0)
            return {
                "category":         r.category,
                "current_revenue":  cur,
                "prior_revenue":    prev,
                "revenue_change":   chg,
                "change_pct":       round(chg / prev * 100, 2) if prev > 0 else None,
            }

        # ── PROCESS DISTRIBUTION ─────────────────────────────────────────────
        all_buckets = ["<₱200", "₱200-500", "₱500-1k", "₱1k+"]
        cur_dist  = {r.bucket: {"count": r.count, "revenue": float(r.revenue or 0)} for r in dist_rows}
        pri_dist  = {r.bucket: {"count": r.count, "revenue": float(r.revenue or 0)} for r in dist_prior_rows}
        distribution = [
            {
                "bucket":              b,
                "current_count":       cur_dist.get(b, {}).get("count", 0),
                "prior_count":         pri_dist.get(b, {}).get("count", 0),
                "current_revenue":     cur_dist.get(b, {}).get("revenue", 0),
                "prior_revenue":       pri_dist.get(b, {}).get("revenue", 0),
            }
            for b in all_buckets
        ]

        return {
            "store_name": summary_row.store_name,
            "summary": {
                "current":  {"revenue": cur_rev, "transactions": cur_txn, "avg_ticket": cur_avg, "skus_per_txn": round(cur_skus, 1), "margin_pct": cur_margin},
                "prior":    {"revenue": pri_rev, "transactions": pri_txn, "avg_ticket": pri_avg, "skus_per_txn": round(pri_skus, 1), "margin_pct": pri_margin},
                "revenue_change":      cur_rev - pri_rev,
                "revenue_change_pct":  safe_pct(cur_rev, pri_rev),
                "txn_change":          cur_txn - pri_txn,
                "txn_change_pct":      safe_pct(cur_txn, pri_txn),
                "avg_ticket_change":   round(cur_avg - pri_avg, 2),
                "avg_ticket_change_pct": safe_pct(cur_avg, pri_avg),
                "skus_change":         round(cur_skus - pri_skus, 2),
                "skus_change_pct":     safe_pct(cur_skus, pri_skus),
                "margin_change":       round(cur_margin - pri_margin, 2),
            },
            "rank": {
                "rank":         int(rank_row.rank) if rank_row else None,
                "total_stores": int(rank_row.total_stores) if rank_row else None,
            },
            "daily":        daily,
            "hourly":       hourly,
            "product_movers": {
                "gainers":   [build_mover(r) for r in gainers_rows],
                "decliners": [build_mover(r) for r in decliners_rows],
            },
            "categories":   [build_cat(r) for r in cat_rows],
            "distribution": distribution,
            "zero_sales":   [{"name": r.name, "prior_revenue": float(r.prior_revenue or 0)} for r in zero_rows],
            "new_products": [{"name": r.name, "current_revenue": float(r.current_revenue or 0)} for r in new_rows],
        }

    @cached(expire=300, prefix="analytics")
    async def get_category_performance_matrix(
        self,
        start_date: datetime,
        end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Get category performance matrix showing revenue for each category/store combination.
        """
        end_date_inclusive = end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            validated_ids = [sid for sid in store_ids if _is_valid_uuid(sid)]
            if validated_ids:
                store_ids_str = "', '".join(validated_ids)
                store_filter = f"AND s.id IN ('{store_ids_str}')"

        query = text(f"""
            WITH category_store_sales AS (
                SELECT
                    COALESCE(p.category, 'Uncategorized') as category,
                    s.id as store_id,
                    s.name as store_name,
                    SUM(v.item_total_resolved)::float as revenue
                FROM new_transactions t
                JOIN stores s ON t.store_id = s.id
                JOIN v_new_transaction_items_resolved v ON t.ref_id = v.transaction_ref_id
                JOIN products p ON v.product_id = p.id
                WHERE t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY p.category, s.id, s.name
            ),
            all_categories AS (
                SELECT DISTINCT COALESCE(category, 'Uncategorized') as category
                FROM products
            ),
            all_stores AS (
                SELECT s.id as store_id, s.name as store_name
                FROM stores s
                WHERE 1=1
                    {store_filter}
            ),
            category_totals AS (
                SELECT
                    category,
                    SUM(revenue)::float as total_revenue
                FROM category_store_sales
                GROUP BY category
            )
            SELECT
                ac.category,
                ast.store_id,
                ast.store_name,
                COALESCE(css.revenue, 0)::float as revenue,
                COALESCE(ct.total_revenue, 0)::float as category_total
            FROM all_categories ac
            CROSS JOIN all_stores ast
            LEFT JOIN category_store_sales css
                ON ac.category = css.category
                AND ast.store_id = css.store_id
            LEFT JOIN category_totals ct ON ac.category = ct.category
            ORDER BY
                COALESCE(ct.total_revenue, 0) DESC,
                ac.category,
                ast.store_name
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        rows = result.fetchall()

        # Organize data by category; collect store_id → store_name mapping
        matrix = {}
        store_names: dict = {}
        for row in rows:
            category = row.category
            if category not in matrix:
                matrix[category] = {}
            store_id_str = str(row.store_id)
            matrix[category][store_id_str] = float(row.revenue or 0)
            store_names[store_id_str] = row.store_name

        # Convert to list format
        matrix_list = [
            {
                "category": category,
                "stores": stores_data
            }
            for category, stores_data in matrix.items()
        ]

        return {"matrix": matrix_list, "store_names": store_names}

    @cached(expire=300, prefix="analytics")
    async def get_store_weekly_trends(
        self,
        start_date: datetime,
        end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Get weekly sales trends within the given date range for each store.
        Returns sparkline data for time trend visualization.
        """
        end_date_inclusive = end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            validated_ids = [sid for sid in store_ids if _is_valid_uuid(sid)]
            if validated_ids:
                store_ids_str = "', '".join(validated_ids)
                store_filter = f"AND s.id IN ('{store_ids_str}')"

        query = text(f"""
            WITH weekly_data AS (
                SELECT
                    s.id as store_id,
                    s.name as store_name,
                    DATE_TRUNC('week', t.transaction_time AT TIME ZONE 'Asia/Manila')::date as week_start,
                    COALESCE(SUM(t.total), 0)::float as weekly_revenue
                FROM stores s
                LEFT JOIN new_transactions t ON s.id = t.store_id
                    AND t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                WHERE 1=1
                    {store_filter}
                GROUP BY s.id, s.name, DATE_TRUNC('week', t.transaction_time AT TIME ZONE 'Asia/Manila')
                ORDER BY s.name, week_start
            )
            SELECT
                store_id,
                store_name,
                week_start,
                weekly_revenue
            FROM weekly_data
            WHERE week_start IS NOT NULL
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive
        })
        rows = result.fetchall()

        # Organize by store
        trends = {}
        for row in rows:
            store_id = str(row.store_id)
            if store_id not in trends:
                trends[store_id] = []
            trends[store_id].append({
                "week": row.week_start.isoformat(),
                "revenue": float(row.weekly_revenue or 0)
            })

        return {"trends": trends}

    @cached(expire=300, prefix="analytics")
    async def get_top_movers(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        store_ids: List[str] = []
    ) -> Dict[str, Any]:
        """
        Get top movers - products and categories with biggest revenue changes.
        Returns top 5 products up/down and top 3 categories up/down by absolute revenue impact.
        """
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)

        store_filter = ""
        if store_ids:
            validated_ids = [sid for sid in store_ids if _is_valid_uuid(sid)]
            if validated_ids:
                store_ids_str = "', '".join(validated_ids)
                store_filter = f"AND s.id IN ('{store_ids_str}')"

        # Get product movers — separate queries for gainers and decliners so both always have representation
        product_cte = f"""
            WITH current_products AS (
                SELECT
                    p.id,
                    p.name,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as revenue
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY p.id, p.name
            ),
            previous_products AS (
                SELECT
                    p.id,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as revenue
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY p.id
            ),
            product_changes AS (
                SELECT
                    cp.name as product_name,
                    cp.revenue as current_revenue,
                    COALESCE(pp.revenue, 0)::float as previous_revenue,
                    (cp.revenue - COALESCE(pp.revenue, 0))::float as revenue_change
                FROM current_products cp
                LEFT JOIN previous_products pp ON cp.id = pp.id
                WHERE
                    (cp.revenue > 0 OR COALESCE(pp.revenue, 0) > 0)
                    AND GREATEST(cp.revenue, COALESCE(pp.revenue, 0)) >= 5000
            )
        """

        product_gainers_query = text(product_cte + """
            SELECT * FROM product_changes
            WHERE revenue_change > 0
            ORDER BY revenue_change DESC
            LIMIT 5
        """)

        product_decliners_query = text(product_cte + """
            SELECT * FROM product_changes
            WHERE revenue_change < 0
            ORDER BY revenue_change ASC
            LIMIT 5
        """)

        params = {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive
        }

        product_gainers_result = await self.db.execute(product_gainers_query, params)
        product_gainers_rows = product_gainers_result.fetchall()
        product_decliners_result = await self.db.execute(product_decliners_query, params)
        product_decliners_rows = product_decliners_result.fetchall()

        # Get category movers — separate queries for gainers and decliners
        category_cte = f"""
            WITH current_categories AS (
                SELECT
                    COALESCE(p.category, 'Uncategorized') as category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as revenue
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :start_date
                    AND t.transaction_time < :end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY p.category
            ),
            previous_categories AS (
                SELECT
                    COALESCE(p.category, 'Uncategorized') as category,
                    COALESCE(SUM(v.item_total_resolved), 0)::float as revenue
                FROM products p
                JOIN v_new_transaction_items_resolved v ON p.id = v.product_id
                JOIN new_transactions t ON v.transaction_ref_id = t.ref_id
                JOIN stores s ON t.store_id = s.id
                WHERE
                    t.transaction_time >= :compare_start_date
                    AND t.transaction_time < :compare_end_date
                    AND t.is_cancelled = false
                    {store_filter}
                GROUP BY p.category
            ),
            category_changes AS (
                SELECT
                    cc.category,
                    cc.revenue as current_revenue,
                    COALESCE(pc.revenue, 0)::float as previous_revenue,
                    (cc.revenue - COALESCE(pc.revenue, 0))::float as revenue_change
                FROM current_categories cc
                LEFT JOIN previous_categories pc ON cc.category = pc.category
                WHERE cc.revenue > 0 OR COALESCE(pc.revenue, 0) > 0
            )
        """

        category_gainers_query = text(category_cte + """
            SELECT * FROM category_changes
            WHERE revenue_change > 0
            ORDER BY revenue_change DESC
            LIMIT 3
        """)

        category_decliners_query = text(category_cte + """
            SELECT * FROM category_changes
            WHERE revenue_change < 0
            ORDER BY revenue_change ASC
            LIMIT 3
        """)

        category_gainers_result = await self.db.execute(category_gainers_query, params)
        category_gainers_rows = category_gainers_result.fetchall()
        category_decliners_result = await self.db.execute(category_decliners_query, params)
        category_decliners_rows = category_decliners_result.fetchall()

        def build_product_item(row):
            prev = float(row.previous_revenue or 0)
            change = float(row.revenue_change or 0)
            return {
                "name": row.product_name,
                "current_revenue": float(row.current_revenue or 0),
                "previous_revenue": prev,
                "revenue_change": change,
                "change_pct": ((change / prev) * 100) if prev > 0 else None
            }

        def build_category_item(row):
            prev = float(row.previous_revenue or 0)
            change = float(row.revenue_change or 0)
            return {
                "name": row.category,
                "current_revenue": float(row.current_revenue or 0),
                "previous_revenue": prev,
                "revenue_change": change,
                "change_pct": ((change / prev) * 100) if prev > 0 else None
            }

        return {
            "products_up": [build_product_item(r) for r in product_gainers_rows],
            "products_down": [build_product_item(r) for r in product_decliners_rows],
            "categories_up": [build_category_item(r) for r in category_gainers_rows],
            "categories_down": [build_category_item(r) for r in category_decliners_rows]
        }
 
