"""
Percentile-based replenishment algorithm (v2).

All 7 retail stores are processed in a single run using two bulk SQL queries
(demand + snapshots). pandas handles outlier trimming, empty-shelf censoring,
rolling-window targets, ABC classification, and silent-stockout detection.
"""
from __future__ import annotations  # keeps pd.DataFrame annotations from blowing up when pd not installed

import math
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.replenishment import ServiceOverride, ShipmentPlan

# Lazy imports — only needed when the percentile algorithm actually runs.
# The app starts cleanly even if numpy/pandas are not yet installed in the
# container image; a clear error is raised only when the endpoint is called.
try:
    import numpy as np
    import pandas as pd
    _PANDAS_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PANDAS_AVAILABLE = False

# ── Store scope ───────────────────────────────────────────────────────────────

RETAIL_STORE_IDS: List[str] = [
    "6639efd54694700008d7ccc6",  # Rockwell
    "68c5bb269da1d500073690c2",  # Opus
    "69c73fcb277aa600076dfaaa",  # Shangri-La
    "668a43f60fa9990007cfa158",  # Greenhills
    "66cfff31aa7adf0007c9de41",  # North Edsa
    "668023c94721460006092609",  # Fairview
    "67612230a740d90007464e26",  # Magnolia
]
_STORE_ID_SET = set(RETAIL_STORE_IDS)

EXCLUDED_CATEGORIES = {"supplies", "store supplies", "packiging"}
BULK_CATEGORIES = {"per gram", "aji mix"}

# ── Config ────────────────────────────────────────────────────────────────────

LOOKBACK_DAYS = 84          # 12 equal weeks
REVIEW_DAYS = 7
LEAD_DAYS = 2
PROTECTION_DAYS = REVIEW_DAYS + LEAD_DAYS  # 9

SERVICE_QUANTILES: Dict[str, float] = {"A": 0.97, "B": 0.90, "C": 0.85}
MAX_COVER_DAYS: Dict[str, int] = {"A": 18, "default": 28}
BULK_ROUND_GRAMS = 500

# Silent-stockout: ≥1 sale-day per week on average = ≥12 sale-days in 84 days
SILENT_MIN_SALE_DAYS = LOOKBACK_DAYS // 7
SILENT_QUIET_DAYS = 21

TRUST_MIN_SNAPSHOT_DAYS = 30
OUTLIER_DAY_PCTL = 98       # percentile (0-100 scale for np.percentile)
THIN_HISTORY_MIN_TARGET = 2

QUANTILE_STEPS = [0.85, 0.90, 0.95, 0.97, 0.98]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _round_up_bulk(qty: float) -> int:
    """Round qty up to the nearest BULK_ROUND_GRAMS multiple."""
    if qty <= 0:
        return 0
    return int(math.ceil(qty / BULK_ROUND_GRAMS) * BULK_ROUND_GRAMS)


def _bump_quantile(current: float, direction: int) -> float:
    """Bump quantile one step up (+1) or down (-1) within QUANTILE_STEPS."""
    try:
        idx = QUANTILE_STEPS.index(current)
    except ValueError:
        # Snap to nearest step
        dists = [abs(current - q) for q in QUANTILE_STEPS]
        idx = dists.index(min(dists))
    new_idx = max(0, min(len(QUANTILE_STEPS) - 1, idx + direction))
    return QUANTILE_STEPS[new_idx]


# ── Main service ──────────────────────────────────────────────────────────────

class PercentileReplenishmentService:
    """Percentile-based replenishment planner (algorithm='percentile')."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Public entry point ────────────────────────────────────────────────────

    async def run(self, run_date: date, filter_store_id: Optional[str] = None) -> Dict[str, Any]:
        """Run the percentile algorithm. Pass filter_store_id to compute for one store only."""
        if not _PANDAS_AVAILABLE:
            raise RuntimeError(
                "numpy and pandas are required for the percentile algorithm but are not installed. "
                "The next container build will include them automatically."
            )
        cutoff = run_date - timedelta(days=LOOKBACK_DAYS)

        # 1. Bulk data fetch ─────────────────────────────────────────────────
        sales_rows = await self._fetch_sales(cutoff, run_date)
        snap_rows = await self._fetch_snapshots(cutoff, run_date)
        product_meta = await self._fetch_products()
        overrides_map = await self._fetch_overrides()
        on_hand_map = await self._fetch_latest_on_hand(run_date)

        # 2. Excluded SKU set ─────────────────────────────────────────────────
        excluded_skus = {
            pid
            for pid, m in product_meta.items()
            if (m.get("category") or "").lower() in EXCLUDED_CATEGORIES
        }

        # 3. Build demand DataFrame ────────────────────────────────────────────
        date_range = pd.date_range(
            pd.Timestamp(cutoff), pd.Timestamp(run_date - timedelta(days=1)), freq="D"
        )

        if not sales_rows:
            return self._empty_result(run_date)

        sales_df = pd.DataFrame(
            sales_rows, columns=["store_id", "product_id", "sale_date", "qty", "revenue"]
        )
        sales_df = sales_df[
            sales_df["store_id"].isin(_STORE_ID_SET)
            & ~sales_df["product_id"].isin(excluded_skus)
        ]
        sales_df["sale_date"] = pd.to_datetime(sales_df["sale_date"])

        # 4. Build snapshot DataFrame ──────────────────────────────────────────
        if snap_rows:
            snap_df = pd.DataFrame(
                snap_rows, columns=["store_id", "product_id", "snap_date", "on_hand"]
            )
            snap_df = snap_df[
                snap_df["store_id"].isin(_STORE_ID_SET)
                & ~snap_df["product_id"].isin(excluded_skus)
            ]
            snap_df["snap_date"] = pd.to_datetime(snap_df["snap_date"])
        else:
            snap_df = pd.DataFrame(
                columns=["store_id", "product_id", "snap_date", "on_hand"]
            )

        # 5. ABC classification (revenue across all stores, per product) ───────
        abc_map = self._compute_abc(sales_df)

        # 6. Per-(store, product) computation ─────────────────────────────────
        plan_items: List[ShipmentPlan] = []

        grouped_sales = sales_df.groupby(["store_id", "product_id"])
        grouped_snap = (
            snap_df.groupby(["store_id", "product_id"])
            if not snap_df.empty
            else None
        )

        for (sid, pid), group in grouped_sales:
            if sid not in _STORE_ID_SET:
                continue
            if filter_store_id and sid != filter_store_id:
                continue
            if pid in excluded_skus:
                continue

            meta = product_meta.get(pid, {})
            category = (meta.get("category") or "").lower()
            is_bulk = category in BULK_CATEGORIES

            # ── 6a. Raw demand series (reindexed, zeros for missing dates) ───
            demand_series = (
                group.set_index("sale_date")["qty"]
                .reindex(date_range, fill_value=0.0)
                .astype(float)
            )
            total_sold = int(group["qty"].sum())
            total_revenue = float(group["revenue"].sum())

            # ── 6b. Outlier trim: cap each day at 98th-pctile of series ──────
            p98 = float(np.percentile(demand_series.values, OUTLIER_DAY_PCTL))
            if p98 > 0:
                demand_series = demand_series.clip(upper=p98)

            # ── 6c. Empty-shelf censoring ─────────────────────────────────────
            trusted, snap_oh = self._build_snapshot_series(
                grouped_snap, sid, pid, date_range
            )
            if trusted and snap_oh is not None:
                demand_series = self._apply_censoring(demand_series, snap_oh)

            # ── 6d. Core metrics ─────────────────────────────────────────────
            sale_days = int((demand_series > 0).sum())
            mean_daily = float(demand_series.mean())

            # ── 6e. ABC + segment + effective service quantile ───────────────
            abc_class = abc_map.get(pid, "C")
            base_q = SERVICE_QUANTILES.get(abc_class, 0.85)

            if is_bulk or sale_days >= 20:
                segment = "BULK" if is_bulk else "FAST"
                effective_q = base_q
            elif sale_days >= 8:
                segment = "MED"
                effective_q = 0.90
            else:
                segment = "TAIL"
                effective_q = 0.90

            # Apply stored override from previous feedback cycle
            override_key = (sid, pid)
            if override_key in overrides_map:
                effective_q = float(overrides_map[override_key])

            # ── 6f. Rolling P-day sums → quantile target ─────────────────────
            rolling_sums = demand_series.rolling(PROTECTION_DAYS).sum().dropna()

            if len(rolling_sums) == 0 or mean_daily == 0:
                target = float(THIN_HISTORY_MIN_TARGET) if not is_bulk else 0.0
                skip_cover_cap = False
            else:
                raw_target = float(np.quantile(rolling_sums.values, effective_q))
                if segment == "TAIL" and not is_bulk:
                    raw_target = max(raw_target, float(THIN_HISTORY_MIN_TARGET))
                target = raw_target
                skip_cover_cap = False

            # ── 6g. Silent-stockout detection + override ─────────────────────
            silent_stockout = False
            days_since_last_sale: Optional[int] = None
            skip_cover_cap = False

            if sale_days >= SILENT_MIN_SALE_DAYS and sale_days > 0:
                last_sale_ts = demand_series[demand_series > 0].index[-1]
                days_since = int((date_range[-1] - last_sale_ts).days)
                if days_since >= SILENT_QUIET_DAYS:
                    silent_stockout = True
                    days_since_last_sale = days_since
                    # Recompute target from active period only
                    active = demand_series.loc[:last_sale_ts]
                    active_rolls = active.rolling(PROTECTION_DAYS).sum().dropna()
                    if len(active_rolls) > 0:
                        active_target = float(np.quantile(active_rolls.values, 0.90))
                        target = max(target, active_target)
                    skip_cover_cap = True  # mean_daily distorted by long OOS

            # ── 6h. Cover cap ─────────────────────────────────────────────────
            if not skip_cover_cap and mean_daily > 0:
                max_cover = MAX_COVER_DAYS.get(abc_class, MAX_COVER_DAYS["default"])
                target = min(target, mean_daily * max_cover)

            # ── 6i. On-hand + ship quantity ───────────────────────────────────
            raw_on_hand = on_hand_map.get((sid, pid))
            on_hand_int = int(raw_on_hand) if raw_on_hand is not None else 0
            usable_on_hand = max(0, on_hand_int)
            needs_count = (raw_on_hand is None) or (on_hand_int < 0) or (not trusted)

            ship_raw = max(0.0, target - usable_on_hand)
            ship_qty = _round_up_bulk(ship_raw) if is_bulk else math.ceil(ship_raw)

            # Omit rows with no signal (zero sales, zero ship_qty, not a silent OOS)
            if ship_qty == 0 and total_sold == 0 and not silent_stockout:
                continue

            # ── 6j. Priority score (same formula as legacy for pick ordering) ─
            days_of_stock = usable_on_hand / mean_daily if mean_daily > 0 else 0.0
            stockout_risk = 1.0 / max(days_of_stock, 0.1)
            velocity_score = math.log1p(mean_daily)
            priority_score = velocity_score * 0.60 + stockout_risk * 0.40

            plan = ShipmentPlan(
                run_date=run_date,
                store_id=sid,
                sku_id=pid,
                algorithm="percentile",
                calculation_mode="percentile",
                # Demand
                avg_daily_sales=round(mean_daily, 4),
                season_adjusted_daily_sales=round(mean_daily, 4),
                total_sold_qty=total_sold,
                dead_days=0,
                # Target stored in min_level so the shared query path works
                safety_stock=0.0,
                min_level=round(target, 2),
                max_level=round(
                    mean_daily * MAX_COVER_DAYS.get(abc_class, MAX_COVER_DAYS["default"]), 2
                ),
                expiry_cap=0.0,
                final_max=0.0,
                # Inventory
                on_hand=on_hand_int,
                on_order=0,
                inventory_position=usable_on_hand,
                # Quantities
                requested_ship_qty=ship_qty,
                allocated_ship_qty=ship_qty,
                # Scoring
                priority_score=round(priority_score, 4),
                days_of_stock=round(days_of_stock, 2),
                # Multipliers unused
                velocity_multiplier=1.0,
                category_multiplier=1.0,
                effective_multiplier=1.0,
                # Percentile-specific
                abc_class=abc_class,
                service_quantile=round(effective_q, 2),
                segment=segment,
                needs_count=needs_count,
                silent_stockout=silent_stockout,
                days_since_last_sale=days_since_last_sale,
                trusted_ledger=trusted,
            )
            plan_items.append(plan)

        # 7. Feedback loop: update service_overrides from this run's results ──
        await self._apply_feedback_loop(plan_items, run_date)

        # 8. Persist results ──────────────────────────────────────────────────
        delete_filters = [
            ShipmentPlan.run_date == run_date,
            ShipmentPlan.algorithm == "percentile",
        ]
        if filter_store_id:
            delete_filters.append(ShipmentPlan.store_id == filter_store_id)
        await self.db.execute(delete(ShipmentPlan).where(*delete_filters))
        self.db.add_all(plan_items)
        await self.db.flush()

        unique_stores = len({p.store_id for p in plan_items})
        return {
            "run_date": run_date.isoformat(),
            "algorithm": "percentile",
            "calculation_mode": "percentile",
            "snapshot_days_available": 0,
            "total_items": len(plan_items),
            "stores_processed": unique_stores,
            "warehouse_allocations": 0,
            "exceptions_count": sum(
                1 for p in plan_items if (p.needs_count or p.silent_stockout)
            ),
            "summary": {
                "total_stores": unique_stores,
                "total_skus": len({p.sku_id for p in plan_items}),
                "total_requested_units": sum(p.requested_ship_qty for p in plan_items),
                "total_allocated_units": sum(p.allocated_ship_qty for p in plan_items),
            },
        }

    # ── Data fetchers ─────────────────────────────────────────────────────────

    async def _fetch_sales(
        self, cutoff: date, run_date: date
    ) -> List[Tuple]:
        """One query: daily sales per (store, product) for all 7 stores."""
        # Try with item_total for revenue-based ABC; fall back to qty if column missing.
        q_revenue = text("""
            SELECT
                t.store_id,
                ti.product_id,
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                SUM(ti.quantity)::float                              AS qty,
                SUM(ti.item_total)::float                           AS revenue
            FROM new_transactions t
            JOIN new_transaction_items ti ON ti.transaction_ref_id = t.ref_id
            WHERE t.store_id = ANY(:store_ids)
              AND t.transaction_type = 'Sale'
              AND t.is_cancelled = false
              AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') >= :cutoff
              AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') < :run_date
            GROUP BY t.store_id, ti.product_id,
                     DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
        """)
        q_fallback = text("""
            SELECT
                t.store_id,
                ti.product_id,
                DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') AS sale_date,
                SUM(ti.quantity)::float                              AS qty,
                SUM(ti.quantity)::float                              AS revenue
            FROM new_transactions t
            JOIN new_transaction_items ti ON ti.transaction_ref_id = t.ref_id
            WHERE t.store_id = ANY(:store_ids)
              AND t.is_cancelled = false
              AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') >= :cutoff
              AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') < :run_date
            GROUP BY t.store_id, ti.product_id,
                     DATE(t.transaction_time AT TIME ZONE 'Asia/Manila')
        """)
        params = {
            "store_ids": RETAIL_STORE_IDS,
            "cutoff": cutoff,
            "run_date": run_date,
        }
        try:
            result = await self.db.execute(q_revenue, params)
        except Exception:
            await self.db.rollback()
            result = await self.db.execute(q_fallback, params)
        return result.fetchall()

    async def _fetch_snapshots(
        self, cutoff: date, run_date: date
    ) -> List[Tuple]:
        """One query: daily on-hand snapshots per (store, product) for all 7 stores."""
        result = await self.db.execute(
            text("""
                SELECT store_id, product_id, snapshot_date, quantity_on_hand
                FROM inventory_snapshots
                WHERE store_id = ANY(:store_ids)
                  AND snapshot_date >= :cutoff
                  AND snapshot_date < :run_date
            """),
            {
                "store_ids": RETAIL_STORE_IDS,
                "cutoff": cutoff,
                "run_date": run_date,
            },
        )
        return result.fetchall()

    async def _fetch_products(self) -> Dict[str, Dict]:
        result = await self.db.execute(
            text("SELECT id, name, category, sku FROM products")
        )
        return {
            row[0]: {"name": row[1], "category": row[2], "sku": row[3]}
            for row in result.fetchall()
        }

    async def _fetch_overrides(self) -> Dict[Tuple[str, str], float]:
        """Load all service-level overrides from the feedback table."""
        try:
            result = await self.db.execute(
                text("SELECT store_id, product_id, quantile_override FROM service_overrides")
            )
            return {(r[0], r[1]): float(r[2]) for r in result.fetchall()}
        except Exception:
            await self.db.rollback()
            return {}

    async def _fetch_latest_on_hand(
        self, run_date: date
    ) -> Dict[Tuple[str, str], int]:
        """Most recent snapshot on-hand per (store, product) before run_date."""
        result = await self.db.execute(
            text("""
                SELECT DISTINCT ON (store_id, product_id)
                    store_id, product_id, quantity_on_hand
                FROM inventory_snapshots
                WHERE store_id = ANY(:store_ids)
                  AND snapshot_date < :run_date
                ORDER BY store_id, product_id, snapshot_date DESC
            """),
            {"store_ids": RETAIL_STORE_IDS, "run_date": run_date},
        )
        return {(r[0], r[1]): int(r[2]) for r in result.fetchall()}

    # ── ABC classification ────────────────────────────────────────────────────

    def _compute_abc(self, sales_df: pd.DataFrame) -> Dict[str, str]:
        """Rank products by total revenue across all stores; A=top 80%, B=next 15%, C=rest."""
        if sales_df.empty:
            return {}
        rev_by_product = (
            sales_df.groupby("product_id")["revenue"].sum().sort_values(ascending=False)
        )
        total_rev = rev_by_product.sum()
        if total_rev == 0:
            return {pid: "C" for pid in rev_by_product.index}
        cumulative = rev_by_product.cumsum() / total_rev
        abc: Dict[str, str] = {}
        for pid, cum in cumulative.items():
            if cum <= 0.80:
                abc[pid] = "A"
            elif cum <= 0.95:
                abc[pid] = "B"
            else:
                abc[pid] = "C"
        return abc

    # ── Snapshot trust + censoring ────────────────────────────────────────────

    def _build_snapshot_series(
        self,
        grouped_snap,
        sid: str,
        pid: str,
        date_range: pd.DatetimeIndex,
    ) -> Tuple[bool, Optional[pd.Series]]:
        """Return (trusted, on_hand_series) for a (store, product) pair."""
        if grouped_snap is None or (sid, pid) not in grouped_snap.groups:
            return False, None

        snap_group = grouped_snap.get_group((sid, pid))
        snap_oh = (
            snap_group.set_index("snap_date")["on_hand"]
            .reindex(date_range)
            .astype(float)
        )
        snap_count = int(snap_oh.notna().sum())
        if snap_count == 0:
            return False, snap_oh

        min_oh = float(snap_oh.min())  # NaN-safe: min of non-NaN values
        trusted = (snap_count >= TRUST_MIN_SNAPSHOT_DAYS) and (min_oh >= 0)
        return trusted, snap_oh

    def _apply_censoring(
        self,
        demand: pd.Series,
        snap_oh: pd.Series,
    ) -> pd.Series:
        """Replace zero-demand / zero-stock (censored) days with same-DOW mean."""
        censored = (snap_oh <= 0) & (demand == 0)
        if not censored.any():
            return demand

        demand = demand.copy()
        dow_series = pd.Series(demand.index.dayofweek, index=demand.index)

        for dow in range(7):
            is_dow = dow_series == dow
            is_uncensored = is_dow & ~censored
            is_censored_dow = is_dow & censored
            if not is_censored_dow.any():
                continue
            vals = demand[is_uncensored]
            mean_val = float(vals.mean()) if len(vals) > 0 else 0.0
            if pd.isna(mean_val):
                mean_val = 0.0
            demand[is_censored_dow] = mean_val

        return demand

    # ── Feedback loop ─────────────────────────────────────────────────────────

    async def _apply_feedback_loop(
        self,
        plan_items: List[ShipmentPlan],
        run_date: date,
    ) -> None:
        """
        After each run:
        - Products with trusted on-hand that hit ≤0 during the PREVIOUS review
          cycle while having sales that cycle → bump service quantile UP one step.
        - Products with days_of_stock > MAX_COVER_DAYS[abc_class] → bump DOWN.
        Stores bumps in service_overrides.
        """
        # Identify products that stocked-out in previous review cycle
        prev_start = run_date - timedelta(days=REVIEW_DAYS)
        try:
            oos_result = await self.db.execute(
                text("""
                    SELECT DISTINCT snap.store_id, snap.product_id
                    FROM inventory_snapshots snap
                    JOIN (
                        SELECT t.store_id, ti.product_id
                        FROM new_transactions t
                        JOIN new_transaction_items ti ON ti.transaction_ref_id = t.ref_id
                        WHERE t.store_id = ANY(:store_ids)
                          AND t.is_cancelled = false
                          AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') >= :prev_start
                          AND DATE(t.transaction_time AT TIME ZONE 'Asia/Manila') < :run_date
                        GROUP BY t.store_id, ti.product_id
                    ) sales USING (store_id, product_id)
                    WHERE snap.store_id = ANY(:store_ids)
                      AND snap.snapshot_date >= :prev_start
                      AND snap.snapshot_date < :run_date
                      AND snap.quantity_on_hand <= 0
                """),
                {
                    "store_ids": RETAIL_STORE_IDS,
                    "prev_start": prev_start,
                    "run_date": run_date,
                },
            )
            stockout_combos = {(r[0], r[1]) for r in oos_result.fetchall()}
        except Exception:
            await self.db.rollback()
            stockout_combos = set()

        # Build current overrides for mutation
        overrides = await self._fetch_overrides()

        plan_by_key = {(p.store_id, p.sku_id): p for p in plan_items}

        for key, plan in plan_by_key.items():
            if not plan.trusted_ledger:
                continue

            abc_class = plan.abc_class or "C"
            max_cover = MAX_COVER_DAYS.get(abc_class, MAX_COVER_DAYS["default"])
            current_q = overrides.get(key, plan.service_quantile or 0.85)

            direction = 0
            if key in stockout_combos:
                direction = +1
            elif plan.days_of_stock > max_cover:
                direction = -1

            if direction != 0:
                new_q = _bump_quantile(current_q, direction)
                overrides[key] = new_q

        # Upsert changed overrides
        if overrides:
            await self.db.execute(
                text("""
                    INSERT INTO service_overrides (store_id, product_id, quantile_override)
                    VALUES (:store_id, :product_id, :q)
                    ON CONFLICT (store_id, product_id)
                    DO UPDATE SET quantile_override = EXCLUDED.quantile_override,
                                  updated_at = timezone('Asia/Manila', now())
                """),
                [
                    {"store_id": s, "product_id": p, "q": q}
                    for (s, p), q in overrides.items()
                ],
            )

    # ── Utility ───────────────────────────────────────────────────────────────

    def _empty_result(self, run_date: date) -> Dict[str, Any]:
        return {
            "run_date": run_date.isoformat(),
            "algorithm": "percentile",
            "calculation_mode": "percentile",
            "snapshot_days_available": 0,
            "total_items": 0,
            "stores_processed": 0,
            "warehouse_allocations": 0,
            "exceptions_count": 0,
            "summary": {
                "total_stores": 0,
                "total_skus": 0,
                "total_requested_units": 0,
                "total_allocated_units": 0,
            },
        }

    # ── Compare helper (called by route, not part of run) ─────────────────────

    async def get_compare(
        self, run_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Fetch legacy and percentile plans for the same date and return
        a joined comparison. If run_date is omitted, uses the latest date
        that has BOTH algorithms stored.
        """
        from sqlalchemy import func as sqlfunc, select
        from app.models.replenishment import ShipmentPlan as SP

        if run_date is None:
            # Find most recent date with both algorithms
            q = text("""
                SELECT run_date FROM shipment_plans
                WHERE algorithm = 'percentile'
                ORDER BY run_date DESC LIMIT 1
            """)
            r = await self.db.execute(q)
            row = r.fetchone()
            if not row:
                return {"run_date": None, "legacy_run_date": None,
                        "percentile_run_date": None, "items": [], "summary": {}}
            run_date = row[0]

        # Fetch both plans
        q = text("""
            SELECT
                sp.store_id, s.name, sp.sku_id, p.name, p.sku, p.category,
                sp.algorithm,
                sp.on_hand,
                sp.requested_ship_qty,
                sp.min_level,
                sp.days_of_stock,
                sp.abc_class,
                sp.service_quantile,
                sp.segment,
                sp.silent_stockout,
                sp.needs_count,
                sp.days_since_last_sale,
                sp.trusted_ledger
            FROM shipment_plans sp
            JOIN stores s ON sp.store_id = s.id
            JOIN products p ON sp.sku_id = p.id
            WHERE sp.run_date = :run_date
              AND sp.algorithm IN ('legacy', 'percentile')
            ORDER BY sp.store_id, sp.sku_id
        """)
        result = await self.db.execute(q, {"run_date": run_date})
        rows = result.fetchall()

        # Group by (store_id, sku_id)
        from collections import defaultdict
        merged: Dict[Tuple, Dict] = defaultdict(dict)
        for row in rows:
            sid, sname, pid, pname, psku, cat, algo, on_hand, ship_qty, target, \
                dos, abc_cls, svc_q, seg, silent, needs_c, days_lsl, trusted = row
            key = (sid, pid)
            if key not in merged:
                merged[key] = {
                    "store_id": sid, "store_name": sname,
                    "sku_id": pid, "product_name": pname,
                    "product_sku": psku, "category": cat,
                    "on_hand": None,
                }
            rec = merged[key]
            if algo == "legacy":
                rec["on_hand"] = on_hand
                rec["legacy_ship_qty"] = int(ship_qty or 0)
                rec["legacy_target"] = float(target or 0)
                rec["legacy_days_of_stock"] = float(dos or 0)
            else:
                rec["on_hand"] = on_hand
                rec["percentile_ship_qty"] = int(ship_qty or 0)
                rec["percentile_target"] = float(target or 0)
                rec["percentile_days_of_stock"] = float(dos or 0)
                rec["abc_class"] = abc_cls
                rec["service_quantile"] = float(svc_q) if svc_q else None
                rec["segment"] = seg
                rec["silent_stockout"] = silent
                rec["needs_count"] = needs_c
                rec["days_since_last_sale"] = days_lsl
                rec["trusted_ledger"] = trusted

        items = []
        for rec in merged.values():
            legacy_qty = rec.get("legacy_ship_qty")
            pct_qty = rec.get("percentile_ship_qty")
            if legacy_qty is not None and pct_qty is not None:
                rec["diff"] = pct_qty - legacy_qty
            items.append(rec)

        # Sort: category asc, then max(legacy, percentile) ship qty desc
        items.sort(key=lambda r: (
            (r.get("category") or "").lower(),
            -max(r.get("legacy_ship_qty") or 0, r.get("percentile_ship_qty") or 0),
        ))

        legacy_only = sum(1 for r in items if r.get("legacy_ship_qty") is not None and r.get("percentile_ship_qty") is None)
        pct_only = sum(1 for r in items if r.get("percentile_ship_qty") is not None and r.get("legacy_ship_qty") is None)
        both = sum(1 for r in items if r.get("legacy_ship_qty") is not None and r.get("percentile_ship_qty") is not None)

        return {
            "run_date": run_date.isoformat(),
            "legacy_run_date": run_date.isoformat(),
            "percentile_run_date": run_date.isoformat(),
            "items": items,
            "summary": {
                "total_items": len(items),
                "both_algorithms": both,
                "legacy_only": legacy_only,
                "percentile_only": pct_only,
                "total_percentile_units": sum(r.get("percentile_ship_qty") or 0 for r in items),
                "total_legacy_units": sum(r.get("legacy_ship_qty") or 0 for r in items),
            },
        }
