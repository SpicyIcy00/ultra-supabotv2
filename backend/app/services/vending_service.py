"""
Vending analytics service layer (Weimi machines, brand "Hello Aji").

Mirrors AnalyticsService, but for the vending domain. Kept deliberately
separate from store analytics: the two data sources share no product IDs and
must never be joined or merged.

MONEY: all money columns in the raw vending tables are integer CENTS
(2000 = PHP 20.00). Every query below divides by 100.0 so the API always
returns pesos, exactly like the store endpoints do. The `currency` column in
the raw tables says "CNY" — that is a Weimi hardcoding bug; the real currency
is PHP, so that column is never read.

SALES TRUTH: vending_order_lines. One row = one item sold. Successful vends are
shipment_status = 1; shipment_status = 3 means the vend FAILED (never
dispensed) and is reported separately, never as a sale.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.cache import cached

# A sold item's timestamp: when it was dispensed, falling back to when the
# customer started the order (lines synced before shipment_time is written).
SALE_TS = "COALESCE(l.shipment_time, o.trade_start_time)"

# Successful vend only
VEND_OK = "l.shipment_status = 1"

# Failed vend (item paid for / attempted but never dispensed)
VEND_FAILED = "l.shipment_status = 3"


class VendingService:
    """Service class for vending machine analytics operations."""

    def __init__(self, db: AsyncSession):
        """
        Initialize vending service.

        Args:
            db: Async database session
        """
        self.db = db

    @staticmethod
    def _device_filter(device_codes: List[str], alias: str = "l") -> str:
        """Build an optional device filter clause (values are bound, not inlined)."""
        if not device_codes:
            return ""
        return f"AND {alias}.device_code = ANY(:device_codes)"

    async def get_devices(self) -> List[Dict[str, Any]]:
        """List all vending machines (for the machine selector)."""
        query = text("""
            SELECT
                device_code,
                device_name,
                device_id,
                cabinet_total,
                layer_total,
                aisle_total,
                last_synced_at
            FROM vending_devices
            ORDER BY COALESCE(device_name, device_code)
        """)

        result = await self.db.execute(query)
        rows = result.fetchall()

        return [
            {
                "device_code": row.device_code,
                "device_name": row.device_name or row.device_code,
                "device_id": row.device_id,
                "cabinet_total": row.cabinet_total,
                "layer_total": row.layer_total,
                "aisle_total": row.aisle_total,
                "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
            }
            for row in rows
        ]

    async def get_kpi_data_for_period(
        self,
        start_date: datetime,
        end_date: datetime,
        device_codes: List[str]
    ) -> Dict[str, Any]:
        """
        Get vending KPIs for a period.

        Revenue/profit are returned in PESOS (raw cents / 100).
        `missing_cost_units` counts units whose purchase cost was never entered
        in the Weimi backend — profit is overstated by that much.
        """
        # Add one day to end_date to make it inclusive (end of day), matching
        # the store dashboard: the frontend sends plain YYYY-MM-DD dates.
        end_date_inclusive = end_date + timedelta(days=1)
        device_filter = self._device_filter(device_codes)

        query = text(f"""
            SELECT
                COALESCE(SUM(l.real_price) FILTER (WHERE {VEND_OK}), 0) / 100.0 AS total_sales,
                COALESCE(SUM(
                    l.real_price - COALESCE(l.goods_purchase_cost, 0) * COALESCE(l.goods_amount, 0)
                ) FILTER (WHERE {VEND_OK}), 0) / 100.0 AS total_profit,
                COALESCE(SUM(l.goods_amount) FILTER (WHERE {VEND_OK}), 0)::int AS units_sold,
                COUNT(DISTINCT l.order_trade_no_in) FILTER (WHERE {VEND_OK})::int AS orders,
                COUNT(*) FILTER (WHERE {VEND_FAILED})::int AS failed_vends,
                COALESCE(SUM(l.goods_amount) FILTER (
                    WHERE {VEND_OK} AND COALESCE(l.goods_purchase_cost, 0) = 0
                ), 0)::int AS missing_cost_units
            FROM vending_order_lines l
            INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
            WHERE {SALE_TS} >= :start_date
              AND {SALE_TS} < :end_date
              {device_filter}
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "device_codes": device_codes,
        })
        row = result.fetchone()

        total_sales = float(row.total_sales or 0)
        orders = int(row.orders or 0)

        return {
            "total_sales": total_sales,
            "total_profit": float(row.total_profit or 0),
            "units_sold": int(row.units_sold or 0),
            "orders": orders,
            "failed_vends": int(row.failed_vends or 0),
            "missing_cost_units": int(row.missing_cost_units or 0),
            "avg_order_value": total_sales / orders if orders else 0.0,
        }

    @cached(expire=300, prefix="vending")
    async def get_sales_by_machine(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        device_codes: List[str] = []
    ) -> List[Dict[str, Any]]:
        """Revenue (pesos) and units per machine, with comparison period."""
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)
        device_filter = self._device_filter(device_codes)
        device_where = "WHERE d.device_code = ANY(:device_codes)" if device_codes else ""

        query = text(f"""
            WITH filtered_devices AS (
                SELECT d.device_code, COALESCE(d.device_name, d.device_code) AS device_name
                FROM vending_devices d
                {device_where}
            ),
            current_period AS (
                SELECT
                    l.device_code,
                    COALESCE(SUM(l.real_price), 0) / 100.0 AS current_sales,
                    COALESCE(SUM(l.goods_amount), 0)::int  AS current_units
                FROM vending_order_lines l
                INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
                WHERE {VEND_OK}
                  AND {SALE_TS} >= :start_date
                  AND {SALE_TS} < :end_date
                  {device_filter}
                GROUP BY l.device_code
            ),
            previous_period AS (
                SELECT
                    l.device_code,
                    COALESCE(SUM(l.real_price), 0) / 100.0 AS previous_sales,
                    COALESCE(SUM(l.goods_amount), 0)::int  AS previous_units
                FROM vending_order_lines l
                INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
                WHERE {VEND_OK}
                  AND {SALE_TS} >= :compare_start_date
                  AND {SALE_TS} < :compare_end_date
                  {device_filter}
                GROUP BY l.device_code
            )
            SELECT
                fd.device_code,
                fd.device_name,
                COALESCE(c.current_sales, 0)::float  AS current_sales,
                COALESCE(p.previous_sales, 0)::float AS previous_sales,
                COALESCE(c.current_units, 0)::int    AS current_units,
                COALESCE(p.previous_units, 0)::int   AS previous_units
            FROM filtered_devices fd
            LEFT JOIN current_period c  ON fd.device_code = c.device_code
            LEFT JOIN previous_period p ON fd.device_code = p.device_code
            ORDER BY current_sales DESC
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive,
            "device_codes": device_codes,
        })
        rows = result.fetchall()

        return [
            {
                "device_code": row.device_code,
                "device_name": row.device_name,
                "current_sales": float(row.current_sales or 0),
                "previous_sales": float(row.previous_sales or 0),
                "current_units": int(row.current_units or 0),
                "previous_units": int(row.previous_units or 0),
            }
            for row in rows
        ]

    @cached(expire=300, prefix="vending")
    async def get_top_products(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        device_codes: List[str],
        limit: int
    ) -> List[Dict[str, Any]]:
        """Top vending products by revenue (pesos), with comparison period."""
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)
        device_filter = self._device_filter(device_codes)

        query = text(f"""
            WITH current_period AS (
                SELECT
                    l.goods_name,
                    COALESCE(SUM(l.real_price), 0) / 100.0 AS current_sales,
                    COALESCE(SUM(l.goods_amount), 0)::int  AS current_units,
                    BOOL_OR(COALESCE(l.goods_purchase_cost, 0) = 0) AS missing_cost
                FROM vending_order_lines l
                INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
                WHERE {VEND_OK}
                  AND {SALE_TS} >= :start_date
                  AND {SALE_TS} < :end_date
                  {device_filter}
                GROUP BY l.goods_name
            ),
            previous_period AS (
                SELECT
                    l.goods_name,
                    COALESCE(SUM(l.real_price), 0) / 100.0 AS previous_sales,
                    COALESCE(SUM(l.goods_amount), 0)::int  AS previous_units
                FROM vending_order_lines l
                INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
                WHERE {VEND_OK}
                  AND {SALE_TS} >= :compare_start_date
                  AND {SALE_TS} < :compare_end_date
                  {device_filter}
                GROUP BY l.goods_name
            )
            SELECT
                COALESCE(c.goods_name, p.goods_name) AS product_name,
                COALESCE(c.current_sales, 0)::float  AS current_sales,
                COALESCE(p.previous_sales, 0)::float AS previous_sales,
                COALESCE(c.current_units, 0)::int    AS current_units,
                COALESCE(p.previous_units, 0)::int   AS previous_units,
                COALESCE(c.missing_cost, false)      AS missing_cost
            FROM current_period c
            FULL OUTER JOIN previous_period p ON c.goods_name = p.goods_name
            WHERE COALESCE(c.current_sales, 0) > 0 OR COALESCE(p.previous_sales, 0) > 0
            ORDER BY current_sales DESC
            LIMIT :limit
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "compare_start_date": compare_start_date,
            "compare_end_date": compare_end_date_inclusive,
            "device_codes": device_codes,
            "limit": limit,
        })
        rows = result.fetchall()

        return [
            {
                "product_name": row.product_name,
                "current_sales": float(row.current_sales or 0),
                "previous_sales": float(row.previous_sales or 0),
                "current_units": int(row.current_units or 0),
                "previous_units": int(row.previous_units or 0),
                "missing_cost": bool(row.missing_cost),
            }
            for row in rows
        ]

    @cached(expire=300, prefix="vending")
    async def get_sales_trend(
        self,
        start_date: datetime,
        end_date: datetime,
        compare_start_date: datetime,
        compare_end_date: datetime,
        device_codes: List[str],
        granularity: str
    ) -> Dict[str, Any]:
        """Vending sales over time (pesos), current vs comparison period."""
        end_date_inclusive = end_date + timedelta(days=1)
        compare_end_date_inclusive = compare_end_date + timedelta(days=1)
        device_filter = self._device_filter(device_codes)

        bucket = "hour" if granularity == "hour" else "day"
        time_group = f"DATE_TRUNC('{bucket}', {SALE_TS} AT TIME ZONE 'Asia/Manila')"

        trend_query = text(f"""
            SELECT
                {time_group} AS date,
                COALESCE(SUM(l.real_price), 0) / 100.0 AS sales
            FROM vending_order_lines l
            INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
            WHERE {VEND_OK}
              AND {SALE_TS} >= :start_date
              AND {SALE_TS} < :end_date
              {device_filter}
            GROUP BY date
            ORDER BY date
        """)

        current_result = await self.db.execute(trend_query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "device_codes": device_codes,
        })
        current_rows = current_result.fetchall()

        previous_result = await self.db.execute(trend_query, {
            "start_date": compare_start_date,
            "end_date": compare_end_date_inclusive,
            "device_codes": device_codes,
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

    @cached(expire=300, prefix="vending")
    async def get_stock_levels(
        self,
        device_codes: List[str] = []
    ) -> List[Dict[str, Any]]:
        """
        Current stock per aisle from vending_aisles (live planogram).

        This is current state, not history — `price` is converted from cents.
        """
        device_where = "WHERE a.device_code = ANY(:device_codes)" if device_codes else ""

        query = text(f"""
            SELECT
                a.device_code,
                COALESCE(d.device_name, a.device_code) AS device_name,
                a.aisle_code,
                a.goods_name,
                COALESCE(a.curr_stock, 0)::int AS curr_stock,
                COALESCE(a.max_stock, 0)::int  AS max_stock,
                COALESCE(a.price, 0) / 100.0   AS price,
                a.measurement,
                a.status,
                a.updated_at
            FROM vending_aisles a
            LEFT JOIN vending_devices d ON a.device_code = d.device_code
            {device_where}
            ORDER BY device_name, a.curr_stock ASC, a.aisle_code
        """)

        result = await self.db.execute(query, {"device_codes": device_codes})
        rows = result.fetchall()

        return [
            {
                "device_code": row.device_code,
                "device_name": row.device_name,
                "aisle_code": row.aisle_code,
                "goods_name": row.goods_name,
                "curr_stock": int(row.curr_stock or 0),
                "max_stock": int(row.max_stock or 0),
                "price": float(row.price or 0),
                "measurement": row.measurement,
                "status": row.status,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ]

    @cached(expire=300, prefix="vending")
    async def get_failed_vends(
        self,
        start_date: datetime,
        end_date: datetime,
        device_codes: List[str] = [],
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Failed vends (shipment_status = 3) grouped by machine + product."""
        end_date_inclusive = end_date + timedelta(days=1)
        device_filter = self._device_filter(device_codes)

        query = text(f"""
            SELECT
                l.device_code,
                COALESCE(d.device_name, l.device_code) AS device_name,
                l.goods_name,
                l.aisle_code,
                COUNT(*)::int AS failed_count,
                COALESCE(SUM(l.real_price), 0) / 100.0 AS failed_value,
                MAX({SALE_TS}) AS last_failure_at
            FROM vending_order_lines l
            INNER JOIN vending_orders o ON l.order_trade_no_in = o.trade_no_in
            LEFT JOIN vending_devices d ON l.device_code = d.device_code
            WHERE {VEND_FAILED}
              AND {SALE_TS} >= :start_date
              AND {SALE_TS} < :end_date
              {device_filter}
            GROUP BY l.device_code, d.device_name, l.goods_name, l.aisle_code
            ORDER BY failed_count DESC, last_failure_at DESC
            LIMIT :limit
        """)

        result = await self.db.execute(query, {
            "start_date": start_date,
            "end_date": end_date_inclusive,
            "device_codes": device_codes,
            "limit": limit,
        })
        rows = result.fetchall()

        return [
            {
                "device_code": row.device_code,
                "device_name": row.device_name,
                "goods_name": row.goods_name,
                "aisle_code": row.aisle_code,
                "failed_count": int(row.failed_count or 0),
                "failed_value": float(row.failed_value or 0),
                "last_failure_at": row.last_failure_at.isoformat() if row.last_failure_at else None,
            }
            for row in rows
        ]
