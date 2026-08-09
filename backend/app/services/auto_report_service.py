"""
Auto Report orchestration.

Reproduces the manual ReplenishmentDashboard flow (run -> filter/sort -> transform
-> post to Sheets) server-side, once per enabled store, driven by persisted config.
Used by both the /auto-report/run endpoint (manual "Run now") and the weekly scheduler.

A full run takes minutes (per-store calculation + up to two Apps Script posts each),
which is far longer than the edge proxy in front of the API will hold a response open.
So "Run now" starts the run detached (start_background_run) and the UI polls
get_run_state() for progress; the durable summary still lands on the settings row.
"""
import asyncio
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.replenishment import AutoReportSettings, AutoReportStore
from app.services.replenishment_service import ReplenishmentService
from app.services.percentile_service import PercentileReplenishmentService
from app.services import sheets_poster

MANILA = ZoneInfo("Asia/Manila")

# Serializes runs across the manual endpoint and the weekly scheduler so the two
# can never post to the same tabs at once.
_run_lock = asyncio.Lock()

# Live progress for the UI. In-process only (single API instance); the durable
# record of a run is always the settings row's last_run_* columns.
_run_state: Dict[str, Any] = {
    "running": False,
    "triggered_by": None,
    "started_at": None,
    "stores_total": 0,
    "stores_done": 0,
    "current_store": None,
    "results": [],
    "final": None,
}
_run_task: Optional[asyncio.Task] = None


def get_run_state() -> Dict[str, Any]:
    """Snapshot of the in-flight (or most recent) run for polling clients."""
    return {**_run_state, "results": list(_run_state["results"])}


async def _run_detached(triggered_by: str) -> None:
    """Body of the background task: own session, never propagates to a caller."""
    try:
        async with AsyncSessionLocal() as session:
            await AutoReportService(session).run_all(triggered_by=triggered_by)
    except Exception as e:  # pragma: no cover - defensive; run_all isolates per store
        print(f"[auto-report] background run error: {e}")
        _run_state.update({"running": False, "current_store": None})


def start_background_run(triggered_by: str = "manual") -> Dict[str, Any]:
    """Kick off a full run detached from the request. Returns immediately."""
    global _run_task
    if _run_state["running"] or _run_lock.locked():
        return {"started": False, "already_running": True, "state": get_run_state()}

    # Marked here rather than inside the task so a second click within the same
    # tick of the event loop can't slip through before the task starts.
    _run_state.update({
        "running": True,
        "triggered_by": triggered_by,
        "started_at": datetime.now(MANILA).isoformat(),
        "stores_total": 0,
        "stores_done": 0,
        "current_store": None,
        "results": [],
        "final": None,
    })
    _run_task = asyncio.create_task(_run_detached(triggered_by))
    return {"started": True, "already_running": False, "state": get_run_state()}

_SETTINGS_DEFAULTS: Dict[str, Any] = {
    "enabled": False,
    "day_of_week": 0,
    "hour": 6,
    "minute": 0,
    "algorithm": "legacy",
    "calc_mode": "snapshot",
    "apply_stockout_buffer": False,
    "show_zero_requested": False,
    "post_backup": True,
}


class AutoReportService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ----------------------------------------------------------------
    # Settings (singleton, id=1)
    # ----------------------------------------------------------------

    async def get_settings(self) -> Dict[str, Any]:
        try:
            result = await self.db.execute(
                select(AutoReportSettings).where(AutoReportSettings.id == 1)
            )
            row = result.scalar_one_or_none()
            if row:
                return self._settings_to_dict(row)
        except Exception:
            await self.db.rollback()
        return {**_SETTINGS_DEFAULTS, "last_run_at": None, "last_run_status": None,
                "last_run_detail": None, "updated_at": None}

    async def update_settings(self, data: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result = await self.db.execute(
                select(AutoReportSettings).where(AutoReportSettings.id == 1)
            )
            row = result.scalar_one_or_none()
            editable = {k: v for k, v in data.items()
                        if k not in ("id", "updated_at", "last_run_at",
                                     "last_run_status", "last_run_detail")}
            if row:
                for key, value in editable.items():
                    if hasattr(row, key):
                        setattr(row, key, value)
            else:
                row = AutoReportSettings(id=1, **editable)
                self.db.add(row)
            await self.db.commit()
            return await self.get_settings()
        except Exception as e:
            await self.db.rollback()
            raise ValueError(f"Could not save auto-report settings — migration may not have run yet: {e}") from e

    @staticmethod
    def _settings_to_dict(row: AutoReportSettings) -> Dict[str, Any]:
        return {
            "enabled": row.enabled,
            "day_of_week": row.day_of_week,
            "hour": row.hour,
            "minute": row.minute,
            "algorithm": row.algorithm,
            "calc_mode": row.calc_mode,
            "apply_stockout_buffer": row.apply_stockout_buffer,
            "show_zero_requested": row.show_zero_requested,
            "post_backup": row.post_backup,
            "last_run_at": row.last_run_at.isoformat() if row.last_run_at else None,
            "last_run_status": row.last_run_status,
            "last_run_detail": row.last_run_detail,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }

    # ----------------------------------------------------------------
    # Per-store config
    # ----------------------------------------------------------------

    async def get_store_configs(self) -> List[Dict[str, Any]]:
        """Return one row per store tier, auto-seeding missing auto_report_store rows.

        The tier table is the source of truth for which stores exist in the
        replenishment module, so we align to it (same set the dashboard shows).
        """
        svc = ReplenishmentService(self.db)
        tiers = await svc.get_all_store_tiers()

        existing = {}
        try:
            result = await self.db.execute(select(AutoReportStore))
            for row in result.scalars().all():
                existing[row.store_id] = row
        except Exception:
            await self.db.rollback()

        seeded = False
        for tier in tiers:
            if tier["store_id"] not in existing:
                new_row = AutoReportStore(store_id=tier["store_id"], enabled=True, sheet_name=None)
                self.db.add(new_row)
                existing[tier["store_id"]] = new_row
                seeded = True
        if seeded:
            try:
                await self.db.commit()
            except Exception:
                await self.db.rollback()

        name_by_id = {t["store_id"]: t["store_name"] for t in tiers}
        out: List[Dict[str, Any]] = []
        for tier in tiers:
            row = existing.get(tier["store_id"])
            out.append({
                "store_id": tier["store_id"],
                "store_name": name_by_id.get(tier["store_id"]),
                "enabled": bool(row.enabled) if row else True,
                "sheet_name": (row.sheet_name if row else None),
            })
        return out

    async def upsert_store_configs(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        for item in items:
            store_id = item["store_id"]
            result = await self.db.execute(
                select(AutoReportStore).where(AutoReportStore.store_id == store_id)
            )
            row = result.scalar_one_or_none()
            if row:
                if "enabled" in item:
                    row.enabled = item["enabled"]
                if "sheet_name" in item:
                    row.sheet_name = item["sheet_name"] or None
            else:
                self.db.add(AutoReportStore(
                    store_id=store_id,
                    enabled=item.get("enabled", True),
                    sheet_name=item.get("sheet_name") or None,
                ))
        await self.db.commit()
        return await self.get_store_configs()

    # ----------------------------------------------------------------
    # The run
    # ----------------------------------------------------------------

    @staticmethod
    def _filter_and_sort(items: List[Dict[str, Any]], show_zero: bool) -> List[Dict[str, Any]]:
        """Port of filteredAndSorted() in ReplenishmentDashboard.tsx (no search filter)."""
        if show_zero:
            filtered = [
                it for it in items
                if (it.get("requested_ship_qty") or 0) > 0
                or (it.get("total_sold_qty") or 0) > 0
                or (it.get("avg_daily_sales") or 0) > 0
            ]
        else:
            filtered = [it for it in items if (it.get("requested_ship_qty") or 0) > 0]

        def sort_key(it: Dict[str, Any]):
            return ((it.get("category") or "").lower(), -(it.get("requested_ship_qty") or 0))

        return sorted(filtered, key=sort_key)

    async def run_all(self, triggered_by: str = "manual") -> Dict[str, Any]:
        """Run the report for every enabled store and post to Sheets.

        Isolates per-store failures so one store never aborts the rest.
        Records a summary into the settings row (last_run_*).
        """
        async with _run_lock:
            _run_state.update({"running": True, "triggered_by": triggered_by,
                               "started_at": datetime.now(MANILA).isoformat()})
            try:
                return await self._run_all_inner(triggered_by)
            finally:
                _run_state.update({"running": False, "current_store": None})

    async def _run_all_inner(self, triggered_by: str) -> Dict[str, Any]:
        settings = await self.get_settings()
        store_configs = await self.get_store_configs()
        enabled_stores = [s for s in store_configs if s["enabled"]]

        _run_state.update({"stores_total": len(enabled_stores), "stores_done": 0,
                           "current_store": None, "results": [], "final": None})
        await self._record_run("running", f"{triggered_by}: 0/{len(enabled_stores)} stores…",
                               touch_last_run_at=False)

        algorithm = settings["algorithm"]
        calc_mode = settings["calc_mode"]
        apply_buffer = settings["apply_stockout_buffer"]
        show_zero = settings["show_zero_requested"]
        post_backup = settings["post_backup"]

        repl_service = ReplenishmentService(self.db)
        pct_service = PercentileReplenishmentService(self.db)
        run_date = date.today()

        results: List[Dict[str, Any]] = []
        for store in enabled_stores:
            store_id = store["store_id"]
            store_name = store["store_name"] or store_id
            sheet_name = store["sheet_name"] or store_name
            entry: Dict[str, Any] = {"store_id": store_id, "store_name": store_name,
                                     "sheet_name": sheet_name}
            _run_state["current_store"] = store_name
            try:
                # 1) Run the calculation (same branching as the /run route)
                if algorithm == "percentile":
                    await pct_service.run(run_date, filter_store_id=store_id)
                else:
                    await repl_service.run_replenishment_calculation(
                        run_date=None,
                        store_id=store_id,
                        apply_stockout_buffer=apply_buffer,
                        mode=calc_mode,
                    )

                # 2) Read the plan back
                plan = await repl_service.get_latest_shipment_plan([store_id], None, algorithm)
                items = self._filter_and_sort(plan.get("items", []), show_zero)

                if not items:
                    entry.update({"success": True, "rows": 0, "message": "No items to post"})
                    results.append(entry)
                    await self._publish_progress(triggered_by, results, len(enabled_stores))
                    continue

                # 3) Post main tab
                main = await sheets_poster.post_to_sheets(
                    sheet_name, sheets_poster.transform_replenishment_for_sheets(items)
                )
                entry["success"] = main["success"]
                entry["rows"] = main.get("rowsWritten", len(items))
                entry["message"] = main["message"]
                if not main["success"]:
                    entry["error"] = main.get("error")

                # 4) Fire backup (all fields) if enabled — non-fatal
                if post_backup:
                    backup = await sheets_poster.post_to_sheets(
                        sheet_name,
                        sheets_poster.transform_replenishment_for_backup(plan.get("items", [])),
                        is_backup=True,
                    )
                    entry["backup_success"] = backup["success"]
                    if not backup["success"]:
                        entry["backup_error"] = backup.get("error")
            except Exception as e:
                await self.db.rollback()
                entry.update({"success": False, "rows": 0, "error": str(e)})
            results.append(entry)
            await self._publish_progress(triggered_by, results, len(enabled_stores))

        ok = sum(1 for r in results if r.get("success"))
        failed = len(results) - ok
        total_rows = sum(r.get("rows", 0) for r in results)
        status = "success" if failed == 0 else ("partial" if ok > 0 else "failed")
        detail = (f"{triggered_by}: {ok}/{len(results)} stores posted, "
                  f"{total_rows} rows total"
                  + (f", {failed} failed" if failed else ""))

        await self._record_run(status, detail)

        payload = {
            "triggered_by": triggered_by,
            "run_date": run_date.isoformat(),
            "status": status,
            "stores_total": len(results),
            "stores_ok": ok,
            "stores_failed": failed,
            "total_rows": total_rows,
            "results": results,
        }
        _run_state["final"] = payload
        return payload

    async def _publish_progress(
        self, triggered_by: str, results: List[Dict[str, Any]], total: int
    ) -> None:
        """Mirror per-store progress into the in-memory state + settings row.

        Persisting each step means a run that dies mid-way (deploy, restart) still
        leaves a record of how far it got instead of the previous run's summary.
        """
        _run_state["stores_done"] = len(results)
        _run_state["results"] = list(results)
        ok = sum(1 for r in results if r.get("success"))
        await self._record_run(
            "running",
            f"{triggered_by}: {ok}/{total} stores posted so far "
            f"({len(results)} of {total} attempted)…",
            touch_last_run_at=False,
        )

    async def _record_run(self, status: str, detail: str,
                          touch_last_run_at: bool = True) -> None:
        try:
            result = await self.db.execute(
                select(AutoReportSettings).where(AutoReportSettings.id == 1)
            )
            row = result.scalar_one_or_none()
            now = datetime.now(MANILA)
            if row:
                # In-progress markers leave last_run_at alone: the scheduler treats it
                # as "this week's slot is done", so only a finished run may move it.
                if touch_last_run_at:
                    row.last_run_at = now
                row.last_run_status = status
                row.last_run_detail = detail[:500]
            else:
                self.db.add(AutoReportSettings(
                    id=1,
                    last_run_at=now if touch_last_run_at else None,
                    last_run_status=status,
                    last_run_detail=detail[:500],
                ))
            await self.db.commit()
        except Exception:
            await self.db.rollback()
