"""
Replenishment service layer for inventory planning.
Contains business logic for weekly replenishment calculations.
"""
import math
import statistics
from datetime import date, datetime, timedelta
from typing import List, Optional, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func, delete
from app.models.replenishment import (
    StoreTier,
    StorePipeline,
    WarehouseInventory,
    SeasonalityCalendar,
    ShipmentPlan,
    InventorySnapshot,
)
from app.models.store import Store
from app.models.product import Product
from app.models.inventory import Inventory


# Hard-coded parameters (configurable later)
REVIEW_PERIOD_DAYS = 7
LEAD_TIME_DAYS = 2
COVER_DAYS = REVIEW_PERIOD_DAYS + LEAD_TIME_DAYS  # 9
WAREHOUSE_STORE_ID = "667bde393126e50006c8058c"  # AJI BARN


class ReplenishmentService:
    """Service class for replenishment planning operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ----------------------------------------------------------------
    # Data Readiness
    # ----------------------------------------------------------------

    async def get_snapshot_days_available(self) -> int:
        """Count distinct snapshot dates in the last 28 days."""
        cutoff = date.today() - timedelta(days=28)
        query = select(
            func.count(func.distinct(InventorySnapshot.snapshot_date))
        ).where(InventorySnapshot.snapshot_date >= cutoff)
        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_data_readiness(self) -> Dict[str, Any]:
        """Get snapshot data readiness information."""
        snapshot_days = await self.get_snapshot_days_available()
        days_until_full = max(0, 28 - snapshot_days)
        full_accuracy_date = date.today() + timedelta(days=days_until_full)
        calc_mode = "snapshot" if snapshot_days >= 28 else "fallback"

        # Get stores that have snapshot data
        query = (
            select(Store.name)
            .join(InventorySnapshot, Store.id == InventorySnapshot.store_id)
            .distinct()
        )
        result = await self.db.execute(query)
        stores_with_snapshots = [row[0] for row in result.fetchall()]

        return {
            "snapshot_days_available": snapshot_days,
            "days_until_full_accuracy": days_until_full,
            "full_accuracy_date": full_accuracy_date.isoformat(),
            "calculation_mode": calc_mode,
            "stores_with_snapshots": stores_with_snapshots,
            "message": (
                f"Snapshot history: {snapshot_days}/28 days. "
                f"{'Full accuracy mode active.' if calc_mode == 'snapshot' else 'Using transaction-based fallback.'}"
            ),
        }

    # ----------------------------------------------------------------
    # Daily Sales Calculation
    # ----------------------------------------------------------------

    async def _get_daily_sales_snapshot_mode(
        self, store_id: str, sku_id: str, lookback_days: int = 28
    ) -> List[float]:
        """Get daily sales excluding stockout days using inventory snapshots."""
        cutoff = date.today() - timedelta(days=lookback_days)
        query = text("""
            SELECT
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                COALESCE(SUM(ti.quantity), 0)::float AS daily_qty
            FROM new_transactions t
            JOIN new_transaction_items ti ON t.ref_id = ti.transaction_ref_id
            JOIN inventory_snapshots snap
                ON snap.product_id = ti.product_id
                AND snap.store_id = t.store_id
                AND snap.snapshot_date = DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
            WHERE ti.product_id = :sku_id
              AND t.store_id = :store_id
              AND t.transaction_time >= :cutoff
              AND t.transaction_time < CURRENT_DATE
              AND t.is_cancelled = false
              AND snap.quantity_on_hand > 0
            GROUP BY sale_date
            ORDER BY sale_date
        """)
        result = await self.db.execute(
            query,
            {"sku_id": sku_id, "store_id": store_id, "cutoff": cutoff},
        )
        rows = result.fetchall()
        return [float(row[1]) for row in rows if float(row[1]) > 0]

    async def _get_daily_sales_fallback_mode(
        self, store_id: str, sku_id: str, lookback_days: int = 28
    ) -> List[float]:
        """Get daily sales, filtering out zero-sales days as stockout proxy."""
        cutoff = date.today() - timedelta(days=lookback_days)
        query = text("""
            SELECT
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                COALESCE(SUM(ti.quantity), 0)::float AS daily_qty
            FROM new_transactions t
            JOIN new_transaction_items ti ON t.ref_id = ti.transaction_ref_id
            WHERE ti.product_id = :sku_id
              AND t.store_id = :store_id
              AND t.transaction_time >= :cutoff
              AND t.transaction_time < CURRENT_DATE
              AND t.is_cancelled = false
            GROUP BY sale_date
            ORDER BY sale_date
        """)
        result = await self.db.execute(
            query,
            {"sku_id": sku_id, "store_id": store_id, "cutoff": cutoff},
        )
        rows = result.fetchall()
        # Filter out zero-sales days as proxy for stockouts
        return [float(row[1]) for row in rows if float(row[1]) > 0]

    async def get_daily_sales(
        self,
        store_id: str,
        sku_id: str,
        calculation_mode: str,
        lookback_days: int = 28,
    ) -> List[float]:
        """Get valid daily sales based on calculation mode."""
        if calculation_mode == "snapshot":
            return await self._get_daily_sales_snapshot_mode(
                store_id, sku_id, lookback_days
            )
        return await self._get_daily_sales_fallback_mode(
            store_id, sku_id, lookback_days
        )

    # ----------------------------------------------------------------
    # Seasonality
    # ----------------------------------------------------------------

    async def get_seasonality_multiplier(self, target_date: date) -> float:
        """Get the seasonality multiplier for a given date. Returns 1.0 if none."""
        query = (
            select(SeasonalityCalendar.multiplier)
            .where(SeasonalityCalendar.start_date <= target_date)
            .where(SeasonalityCalendar.end_date >= target_date)
            .limit(1)
        )
        result = await self.db.execute(query)
        row = result.scalar_one_or_none()
        return float(row) if row is not None else 1.0

    # ----------------------------------------------------------------
    # Store Tier
    # ----------------------------------------------------------------

    async def get_store_tier_params(self, store_id: str) -> Dict[str, Any]:
        """Get tier parameters for a store. Returns Tier B defaults if not configured."""
        query = select(StoreTier).where(StoreTier.store_id == store_id)
        result = await self.db.execute(query)
        tier = result.scalar_one_or_none()
        if tier:
            return {
                "tier": tier.tier,
                "safety_days": tier.safety_days,
                "target_cover_days": tier.target_cover_days,
                "expiry_window_days": tier.expiry_window_days,
            }
        # Default to Tier B if not configured
        return {
            "tier": "B",
            "safety_days": 3,
            "target_cover_days": 7,
            "expiry_window_days": 60,
        }

    # ----------------------------------------------------------------
    # Main Replenishment Calculation
    # ----------------------------------------------------------------

    async def _batch_get_daily_sales_fallback(
        self, lookback_days: int = 28, store_id: Optional[str] = None
    ) -> Dict[Tuple[str, str], List[float]]:
        """Batch fetch daily sales for store-SKU pairs (fallback mode)."""
        cutoff = date.today() - timedelta(days=lookback_days)
        store_filter = "AND t.store_id = :store_id" if store_id else ""
        query = text(f"""
            SELECT
                t.store_id,
                ti.product_id,
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                COALESCE(SUM(ti.quantity), 0)::float AS daily_qty
            FROM new_transactions t
            JOIN new_transaction_items ti ON t.ref_id = ti.transaction_ref_id
            WHERE t.transaction_time >= :cutoff
              AND t.transaction_time < CURRENT_DATE
              AND t.is_cancelled = false
              {store_filter}
            GROUP BY t.store_id, ti.product_id, sale_date
            ORDER BY t.store_id, ti.product_id, sale_date
        """)
        params: Dict[str, Any] = {"cutoff": cutoff}
        if store_id:
            params["store_id"] = store_id
        result = await self.db.execute(query, params)
        rows = result.fetchall()

        sales_map: Dict[Tuple[str, str], List[float]] = {}
        for row in rows:
            key = (row[0], row[1])
            qty = float(row[3])
            if qty > 0:  # Filter zero-sales days as proxy for stockouts
                if key not in sales_map:
                    sales_map[key] = []
                sales_map[key].append(qty)
        return sales_map

    async def _batch_get_daily_sales_snapshot(
        self, lookback_days: int = 28, store_id: Optional[str] = None
    ) -> Dict[Tuple[str, str], List[float]]:
        """Batch fetch daily sales for store-SKU pairs (snapshot mode)."""
        cutoff = date.today() - timedelta(days=lookback_days)
        store_filter = "AND t.store_id = :store_id" if store_id else ""
        query = text(f"""
            SELECT
                t.store_id,
                ti.product_id,
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                COALESCE(SUM(ti.quantity), 0)::float AS daily_qty
            FROM new_transactions t
            JOIN new_transaction_items ti ON t.ref_id = ti.transaction_ref_id
            JOIN inventory_snapshots snap
                ON snap.product_id = ti.product_id
                AND snap.store_id = t.store_id
                AND snap.snapshot_date = DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
            WHERE t.transaction_time >= :cutoff
              AND t.transaction_time < CURRENT_DATE
              AND t.is_cancelled = false
              AND snap.quantity_on_hand > 0
              {store_filter}
            GROUP BY t.store_id, ti.product_id, sale_date
            ORDER BY t.store_id, ti.product_id, sale_date
        """)
        params: Dict[str, Any] = {"cutoff": cutoff}
        if store_id:
            params["store_id"] = store_id
        result = await self.db.execute(query, params)
        rows = result.fetchall()

        sales_map: Dict[Tuple[str, str], List[float]] = {}
        for row in rows:
            key = (row[0], row[1])
            qty = float(row[3])
            if qty > 0:
                if key not in sales_map:
                    sales_map[key] = []
                sales_map[key].append(qty)
        return sales_map

    async def run_replenishment_calculation(
        self, run_date: Optional[date] = None, store_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute the replenishment calculation, optionally filtered to a single store."""
        if run_date is None:
            run_date = date.today()

        # Determine calculation mode
        snapshot_days = await self.get_snapshot_days_available()
        calc_mode = "snapshot" if snapshot_days >= 28 else "fallback"

        # Get seasonality multiplier for today
        seasonality_multiplier = await self.get_seasonality_multiplier(run_date)

        # Get store-SKU combinations with inventory (products that track stock)
        store_filter = "AND i.store_id = :store_id" if store_id else ""
        store_sku_query = text(f"""
            SELECT DISTINCT i.store_id, i.product_id, i.quantity_on_hand
            FROM inventory i
            JOIN products p ON i.product_id = p.id
            WHERE p.track_stock_level = true
              AND i.store_id != :wh_store_id
              {store_filter}
        """)
        params: Dict[str, Any] = {"wh_store_id": WAREHOUSE_STORE_ID}
        if store_id:
            params["store_id"] = store_id
        result = await self.db.execute(store_sku_query, params)
        store_sku_rows = result.fetchall()

        # Pre-load all tier params
        tier_cache: Dict[str, Dict] = {}
        tiers_result = await self.db.execute(select(StoreTier))
        for tier in tiers_result.scalars().all():
            tier_cache[tier.store_id] = {
                "tier": tier.tier,
                "safety_days": tier.safety_days,
                "target_cover_days": tier.target_cover_days,
                "expiry_window_days": tier.expiry_window_days,
            }

        # Pre-load all pipeline data
        pipeline_cache: Dict[Tuple[str, str], int] = {}
        pipeline_result = await self.db.execute(select(StorePipeline))
        for p in pipeline_result.scalars().all():
            pipeline_cache[(p.store_id, p.sku_id)] = p.on_order_units

        # Pre-load warehouse (AJI BARN) inventory from the inventory table
        wh_cache: Dict[str, int] = {}
        wh_query = text("""
            SELECT product_id, quantity_on_hand
            FROM inventory
            WHERE store_id = :wh_store_id
        """)
        wh_result = await self.db.execute(wh_query, {"wh_store_id": WAREHOUSE_STORE_ID})
        for row in wh_result.fetchall():
            wh_cache[row[0]] = int(row[1])

        # Batch fetch daily sales in one query
        if calc_mode == "snapshot":
            sales_cache = await self._batch_get_daily_sales_snapshot(store_id=store_id)
        else:
            sales_cache = await self._batch_get_daily_sales_fallback(store_id=store_id)

        # Delete previous plans for this run_date (and store if filtered)
        delete_q = delete(ShipmentPlan).where(ShipmentPlan.run_date == run_date)
        if store_id:
            delete_q = delete_q.where(ShipmentPlan.store_id == store_id)
        await self.db.execute(delete_q)

        # Calculate for each store-SKU
        plan_items: List[ShipmentPlan] = []
        # Track requests per SKU for warehouse allocation
        sku_requests: Dict[str, List[Dict]] = {}

        for row in store_sku_rows:
            store_id = row[0]
            sku_id = row[1]
            on_hand = int(row[2])

            # Get tier params (default Tier B)
            tier_params = tier_cache.get(store_id, {
                "tier": "B",
                "safety_days": 3,
                "target_cover_days": 7,
                "expiry_window_days": 60,
            })

            # Get daily sales from pre-loaded cache
            daily_sales = sales_cache.get((store_id, sku_id), [])

            # Calculate median (AvgDailySales)
            if daily_sales:
                avg_daily_sales = statistics.median(daily_sales)
            else:
                avg_daily_sales = 0.0

            # Season adjusted
            season_adj_sales = avg_daily_sales * seasonality_multiplier

            # Safety stock
            safety_stock = season_adj_sales * tier_params["safety_days"]

            # Min = (SeasonAdjustedDailySales × CoverDays) + SafetyStock
            min_level = (season_adj_sales * COVER_DAYS) + safety_stock

            # Max = Min + (SeasonAdjustedDailySales × TargetCoverDays)
            max_level = min_level + (season_adj_sales * tier_params["target_cover_days"])

            # Expiry cap
            expiry_cap = season_adj_sales * tier_params["expiry_window_days"]

            # Final max
            final_max = min(max_level, expiry_cap)

            # Inventory position
            on_order = pipeline_cache.get((store_id, sku_id), 0)
            inventory_position = on_hand + on_order

            # Requested ship quantity
            requested_ship_qty = max(0, math.ceil(final_max - inventory_position))

            # Skip products that don't need replenishment
            if requested_ship_qty == 0:
                continue

            # Days of stock
            days_of_stock = (
                on_hand / max(season_adj_sales, 0.1)
                if season_adj_sales > 0 or on_hand > 0
                else 0.0
            )

            # Stockout risk and priority
            stockout_risk = 1.0 / max(days_of_stock, 0.1)
            priority_score = (season_adj_sales * 0.6) + (stockout_risk * 0.4)

            plan = ShipmentPlan(
                run_date=run_date,
                store_id=store_id,
                sku_id=sku_id,
                avg_daily_sales=round(avg_daily_sales, 4),
                season_adjusted_daily_sales=round(season_adj_sales, 4),
                safety_stock=round(safety_stock, 2),
                min_level=round(min_level, 2),
                max_level=round(max_level, 2),
                expiry_cap=round(expiry_cap, 2),
                final_max=round(final_max, 2),
                on_hand=on_hand,
                on_order=on_order,
                inventory_position=inventory_position,
                requested_ship_qty=requested_ship_qty,
                allocated_ship_qty=requested_ship_qty,  # Default: full allocation
                priority_score=round(priority_score, 4),
                days_of_stock=round(days_of_stock, 2),
                calculation_mode=calc_mode,
            )
            plan_items.append(plan)

            # Track for warehouse allocation
            if requested_ship_qty > 0:
                if sku_id not in sku_requests:
                    sku_requests[sku_id] = []
                sku_requests[sku_id].append({
                    "plan": plan,
                    "priority_score": priority_score,
                })

        # Warehouse allocation
        warehouse_allocation_count = 0
        for sku_id, requests in sku_requests.items():
            total_requested = sum(r["plan"].requested_ship_qty for r in requests)
            wh_available = wh_cache.get(sku_id, 0)

            if total_requested > wh_available:
                warehouse_allocation_count += 1
                # Sort by priority descending
                requests.sort(key=lambda r: r["priority_score"], reverse=True)
                remaining = wh_available
                for req in requests:
                    allocated = min(req["plan"].requested_ship_qty, remaining)
                    req["plan"].allocated_ship_qty = allocated
                    remaining -= allocated
                    if remaining <= 0:
                        break
                # Zero out remaining stores
                for req in requests:
                    if remaining <= 0 and req["plan"].allocated_ship_qty == req["plan"].requested_ship_qty:
                        pass  # Already handled
                    # Ensure stores after depletion get 0
                for i, req in enumerate(requests):
                    if i > 0 and sum(
                        r["plan"].allocated_ship_qty for r in requests[:i+1]
                    ) > wh_available:
                        req["plan"].allocated_ship_qty = max(
                            0,
                            wh_available - sum(
                                r["plan"].allocated_ship_qty for r in requests[:i]
                            ),
                        )

        # Save all plans
        self.db.add_all(plan_items)
        await self.db.flush()

        # Count exceptions
        exceptions_count = sum(
            1 for p in plan_items
            if p.allocated_ship_qty < p.requested_ship_qty
            or p.on_hand < 0
            or p.days_of_stock > 120
        )

        unique_stores = set(p.store_id for p in plan_items)

        return {
            "run_date": run_date.isoformat(),
            "calculation_mode": calc_mode,
            "snapshot_days_available": snapshot_days,
            "total_items": len(plan_items),
            "stores_processed": len(unique_stores),
            "warehouse_allocations": warehouse_allocation_count,
            "exceptions_count": exceptions_count,
            "summary": {
                "total_stores": len(unique_stores),
                "total_skus": len(set(p.sku_id for p in plan_items)),
                "total_requested_units": sum(p.requested_ship_qty for p in plan_items),
                "total_allocated_units": sum(p.allocated_ship_qty for p in plan_items),
            },
        }

    # ----------------------------------------------------------------
    # Latest Shipment Plan
    # ----------------------------------------------------------------

    async def get_latest_shipment_plan(
        self,
        store_ids: Optional[List[str]] = None,
        sku_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Get the most recent shipment plan with optional filters."""
        # Get latest run date
        latest_query = select(func.max(ShipmentPlan.run_date))
        result = await self.db.execute(latest_query)
        latest_date = result.scalar_one_or_none()

        if latest_date is None:
            return {
                "run_date": None,
                "calculation_mode": "none",
                "snapshot_days_available": 0,
                "items": [],
                "summary": {
                    "total_stores": 0,
                    "total_skus": 0,
                    "total_requested_units": 0,
                    "total_allocated_units": 0,
                },
            }

        # Build query with joins for names + warehouse inventory
        query = text("""
            SELECT
                sp.store_id,
                s.name AS store_name,
                sp.sku_id,
                p.name AS product_name,
                p.category,
                sp.avg_daily_sales::float,
                sp.season_adjusted_daily_sales::float,
                sp.safety_stock::float,
                sp.min_level::float,
                sp.max_level::float,
                sp.expiry_cap::float,
                sp.final_max::float,
                sp.on_hand,
                sp.on_order,
                sp.inventory_position,
                sp.requested_ship_qty,
                sp.allocated_ship_qty,
                sp.priority_score::float,
                sp.days_of_stock::float,
                sp.calculation_mode,
                COALESCE(wh_inv.quantity_on_hand, 0) AS wh_on_hand
            FROM shipment_plans sp
            JOIN stores s ON sp.store_id = s.id
            JOIN products p ON sp.sku_id = p.id
            LEFT JOIN inventory wh_inv
                ON wh_inv.product_id = sp.sku_id
                AND wh_inv.store_id = :wh_store_id
            WHERE sp.run_date = :run_date
            ORDER BY sp.priority_score DESC
        """)

        result = await self.db.execute(query, {"run_date": latest_date, "wh_store_id": WAREHOUSE_STORE_ID})
        rows = result.fetchall()

        items = []
        for row in rows:
            store_id = row[0]
            sku_id = row[2]

            # Apply filters
            if store_ids and store_id not in store_ids:
                continue
            if sku_ids and sku_id not in sku_ids:
                continue

            items.append({
                "store_id": store_id,
                "store_name": row[1],
                "sku_id": sku_id,
                "product_name": row[3],
                "category": row[4],
                "avg_daily_sales": row[5],
                "season_adjusted_daily_sales": row[6],
                "safety_stock": row[7],
                "min_level": row[8],
                "max_level": row[9],
                "expiry_cap": row[10],
                "final_max": row[11],
                "on_hand": row[12],
                "on_order": row[13],
                "inventory_position": row[14],
                "requested_ship_qty": row[15],
                "allocated_ship_qty": row[16],
                "priority_score": row[17],
                "days_of_stock": row[18],
                "wh_on_hand": int(row[20]),
            })

        calc_mode = rows[0][19] if rows else "none"  # calculation_mode column
        snapshot_days = await self.get_snapshot_days_available()

        return {
            "run_date": latest_date.isoformat(),
            "calculation_mode": calc_mode,
            "snapshot_days_available": snapshot_days,
            "items": items,
            "summary": {
                "total_stores": len(set(i["store_id"] for i in items)),
                "total_skus": len(set(i["sku_id"] for i in items)),
                "total_requested_units": sum(i["requested_ship_qty"] for i in items),
                "total_allocated_units": sum(i["allocated_ship_qty"] for i in items),
            },
        }

    # ----------------------------------------------------------------
    # Warehouse Picklist
    # ----------------------------------------------------------------

    async def get_warehouse_picklist(
        self, run_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Get aggregated picklist grouped by SKU."""
        # Get run date
        if run_date is None:
            result = await self.db.execute(
                select(func.max(ShipmentPlan.run_date))
            )
            run_date = result.scalar_one_or_none()
            if run_date is None:
                return {"run_date": None, "items": [], "total_units": 0}

        query = text("""
            SELECT
                sp.sku_id,
                p.name AS product_name,
                p.category,
                SUM(sp.allocated_ship_qty)::int AS total_allocated_qty,
                json_agg(
                    json_build_object(
                        'store_id', sp.store_id,
                        'store_name', s.name,
                        'quantity', sp.allocated_ship_qty
                    )
                    ORDER BY sp.allocated_ship_qty DESC
                ) AS store_breakdown
            FROM shipment_plans sp
            JOIN products p ON sp.sku_id = p.id
            JOIN stores s ON sp.store_id = s.id
            WHERE sp.run_date = :run_date
              AND sp.allocated_ship_qty > 0
            GROUP BY sp.sku_id, p.name, p.category
            ORDER BY total_allocated_qty DESC
        """)

        result = await self.db.execute(query, {"run_date": run_date})
        rows = result.fetchall()

        items = []
        total_units = 0
        for row in rows:
            total_qty = row[3]
            total_units += total_qty
            items.append({
                "sku_id": row[0],
                "product_name": row[1],
                "category": row[2],
                "total_allocated_qty": total_qty,
                "store_breakdown": row[4],
            })

        return {
            "run_date": run_date.isoformat(),
            "items": items,
            "total_units": total_units,
        }

    # ----------------------------------------------------------------
    # Exceptions
    # ----------------------------------------------------------------

    async def get_exceptions(
        self, run_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """Get items needing review."""
        if run_date is None:
            result = await self.db.execute(
                select(func.max(ShipmentPlan.run_date))
            )
            run_date = result.scalar_one_or_none()
            if run_date is None:
                return {"run_date": None, "items": [], "total_exceptions": 0}

        query = text("""
            SELECT
                sp.store_id,
                s.name AS store_name,
                sp.sku_id,
                p.name AS product_name,
                sp.on_hand,
                sp.days_of_stock::float,
                sp.requested_ship_qty,
                sp.allocated_ship_qty,
                sp.priority_score::float,
                sp.avg_daily_sales::float
            FROM shipment_plans sp
            JOIN stores s ON sp.store_id = s.id
            JOIN products p ON sp.sku_id = p.id
            WHERE sp.run_date = :run_date
              AND (
                  sp.on_hand < 0
                  OR sp.days_of_stock > 120
                  OR sp.allocated_ship_qty < sp.requested_ship_qty
              )
            ORDER BY sp.priority_score DESC
        """)

        result = await self.db.execute(query, {"run_date": run_date})
        rows = result.fetchall()

        items = []
        for row in rows:
            on_hand = row[4]
            days_of_stock = row[5]
            requested = row[6]
            allocated = row[7]

            # Determine exception type
            if on_hand < 0:
                exc_type = "negative_stock"
                detail = f"On-hand is {on_hand} (negative)"
            elif days_of_stock > 120:
                exc_type = "overstock"
                detail = f"Days of stock: {days_of_stock:.0f} (>120)"
            elif allocated < requested:
                exc_type = "warehouse_shortage"
                detail = f"Allocated {allocated} of {requested} requested"
            else:
                exc_type = "unknown"
                detail = "Flagged for review"

            items.append({
                "store_id": row[0],
                "store_name": row[1],
                "sku_id": row[2],
                "product_name": row[3],
                "exception_type": exc_type,
                "detail": detail,
                "requested_qty": requested,
                "allocated_qty": allocated,
                "days_of_stock": days_of_stock,
                "priority_score": row[8],
            })

        return {
            "run_date": run_date.isoformat(),
            "items": items,
            "total_exceptions": len(items),
        }

    # ----------------------------------------------------------------
    # CRUD Helpers
    # ----------------------------------------------------------------

    async def get_all_store_tiers(self) -> List[Dict]:
        """Get all store tier configurations with store names."""
        query = text("""
            SELECT
                st.store_id,
                s.name AS store_name,
                st.tier,
                st.safety_days,
                st.target_cover_days,
                st.expiry_window_days,
                st.created_at,
                st.updated_at
            FROM store_tiers st
            JOIN stores s ON st.store_id = s.id
            ORDER BY st.tier, s.name
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()
        return [
            {
                "store_id": r[0],
                "store_name": r[1],
                "tier": r[2],
                "safety_days": r[3],
                "target_cover_days": r[4],
                "expiry_window_days": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
                "updated_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]

    async def upsert_store_tier(self, data: Dict) -> Dict:
        """Create or update a store tier."""
        existing = await self.db.execute(
            select(StoreTier).where(StoreTier.store_id == data["store_id"])
        )
        tier = existing.scalar_one_or_none()

        if tier:
            if "tier" in data:
                tier.tier = data["tier"]
            if "safety_days" in data:
                tier.safety_days = data["safety_days"]
            if "target_cover_days" in data:
                tier.target_cover_days = data["target_cover_days"]
            if "expiry_window_days" in data:
                tier.expiry_window_days = data["expiry_window_days"]
        else:
            tier = StoreTier(**data)
            self.db.add(tier)

        await self.db.flush()
        return {"store_id": tier.store_id, "tier": tier.tier, "status": "ok"}

    async def delete_store_tier(self, store_id: str) -> bool:
        """Delete a store tier configuration."""
        result = await self.db.execute(
            delete(StoreTier).where(StoreTier.store_id == store_id)
        )
        return result.rowcount > 0

    async def get_all_seasonality(self) -> List[Dict]:
        """Get all seasonality periods."""
        result = await self.db.execute(
            select(SeasonalityCalendar).order_by(SeasonalityCalendar.start_date)
        )
        periods = result.scalars().all()
        return [
            {
                "id": p.id,
                "start_date": p.start_date.isoformat(),
                "end_date": p.end_date.isoformat(),
                "multiplier": float(p.multiplier),
                "label": p.label,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in periods
        ]

    async def create_seasonality(self, data: Dict) -> Dict:
        """Create a seasonality period."""
        period = SeasonalityCalendar(**data)
        self.db.add(period)
        await self.db.flush()
        return {
            "id": period.id,
            "label": period.label,
            "status": "created",
        }

    async def update_seasonality(self, period_id: int, data: Dict) -> Optional[Dict]:
        """Update a seasonality period."""
        result = await self.db.execute(
            select(SeasonalityCalendar).where(SeasonalityCalendar.id == period_id)
        )
        period = result.scalar_one_or_none()
        if not period:
            return None

        for key, value in data.items():
            if value is not None and hasattr(period, key):
                setattr(period, key, value)

        await self.db.flush()
        return {"id": period.id, "label": period.label, "status": "updated"}

    async def delete_seasonality(self, period_id: int) -> bool:
        """Delete a seasonality period."""
        result = await self.db.execute(
            delete(SeasonalityCalendar).where(SeasonalityCalendar.id == period_id)
        )
        return result.rowcount > 0

    async def get_warehouse_inventory(
        self, sku_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Get warehouse inventory levels."""
        query = text("""
            SELECT
                wi.sku_id,
                p.name AS product_name,
                p.category,
                wi.wh_on_hand_units,
                wi.updated_at
            FROM warehouse_inventory wi
            JOIN products p ON wi.sku_id = p.id
            ORDER BY p.name
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()

        items = [
            {
                "sku_id": r[0],
                "product_name": r[1],
                "category": r[2],
                "wh_on_hand_units": r[3],
                "updated_at": r[4].isoformat() if r[4] else None,
            }
            for r in rows
        ]

        if sku_ids:
            items = [i for i in items if i["sku_id"] in sku_ids]

        return items

    async def update_warehouse_inventory(self, items: List[Dict]) -> Dict:
        """Bulk update warehouse inventory."""
        updated = 0
        created = 0
        for item in items:
            existing = await self.db.execute(
                select(WarehouseInventory).where(
                    WarehouseInventory.sku_id == item["sku_id"]
                )
            )
            wh = existing.scalar_one_or_none()
            if wh:
                wh.wh_on_hand_units = item["wh_on_hand_units"]
                updated += 1
            else:
                wh = WarehouseInventory(
                    sku_id=item["sku_id"],
                    wh_on_hand_units=item["wh_on_hand_units"],
                )
                self.db.add(wh)
                created += 1

        await self.db.flush()
        return {"updated": updated, "created": created}

    async def get_pipeline(
        self, store_ids: Optional[List[str]] = None
    ) -> List[Dict]:
        """Get pipeline (on-order) data."""
        query = text("""
            SELECT
                sp.store_id,
                s.name AS store_name,
                sp.sku_id,
                p.name AS product_name,
                sp.on_order_units,
                sp.updated_at
            FROM store_pipeline sp
            JOIN stores s ON sp.store_id = s.id
            JOIN products p ON sp.sku_id = p.id
            ORDER BY s.name, p.name
        """)
        result = await self.db.execute(query)
        rows = result.fetchall()

        items = [
            {
                "store_id": r[0],
                "store_name": r[1],
                "sku_id": r[2],
                "product_name": r[3],
                "on_order_units": r[4],
                "updated_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]

        if store_ids:
            items = [i for i in items if i["store_id"] in store_ids]

        return items

    async def update_pipeline(self, items: List[Dict]) -> Dict:
        """Bulk update store pipeline (on-order) data."""
        updated = 0
        created = 0
        for item in items:
            existing = await self.db.execute(
                select(StorePipeline).where(
                    StorePipeline.store_id == item["store_id"],
                    StorePipeline.sku_id == item["sku_id"],
                )
            )
            pipeline = existing.scalar_one_or_none()
            if pipeline:
                pipeline.on_order_units = item["on_order_units"]
                updated += 1
            else:
                pipeline = StorePipeline(
                    store_id=item["store_id"],
                    sku_id=item["sku_id"],
                    on_order_units=item["on_order_units"],
                )
                self.db.add(pipeline)
                created += 1

        await self.db.flush()
        return {"updated": updated, "created": created}
