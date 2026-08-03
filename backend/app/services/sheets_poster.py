"""
Shared server-side Google Sheets posting.

Ports the transform logic that used to live only in the frontend
(frontend/src/config/sheetsMapping.ts) and centralizes the server-to-server
POST to the Google Apps Script web app. Both the /sheets/post-to-sheets proxy
route and the scheduled auto-report job go through here so there is one code path.
"""
from typing import Any, Dict, List, Optional
import os
import httpx

# Sheet tab names that route to the dedicated barcode-DB web app (kept in sync
# with google_sheets.py). Only relevant to the proxy route, not auto-report.
BARCODE_SHEETS = {"New May Barcode Database", "Barcodes"}


def transform_replenishment_for_sheets(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """6-column main-report format. Mirrors transformReplenishmentForSheets (TS).

    A: product_name, B: sku, C: product_id,
    D: requested_ship_qty -> quantity_sold ("Ordered Qty"),
    E: on_hand -> inventory_store_a ("Store Inventory"),
    F: wh_on_hand -> inventory_store_b ("Warehouse Inventory").
    """
    out: List[Dict[str, Any]] = []
    for item in items:
        out.append({
            "product_name": item.get("product_name") or "",
            "sku": item.get("product_sku") or item.get("sku_id") or "",
            "product_id": item.get("sku_id") or "",
            "quantity_sold": item.get("requested_ship_qty") or 0,
            "inventory_store_a": item.get("on_hand") or 0,
            "inventory_store_b": item.get("wh_on_hand") or 0,
        })
    return out


def transform_replenishment_for_backup(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Full-field backup format. Mirrors transformReplenishmentForBackup (TS)."""
    out: List[Dict[str, Any]] = []
    for item in items:
        out.append({
            "store_name":             item.get("store_name") or item.get("store_id") or "",
            "product_name":           item.get("product_name") or "",
            "sku":                    item.get("product_sku") or item.get("sku_id") or "",
            "product_id":             item.get("sku_id") or "",
            "category":               item.get("category") or "",
            "total_sold_qty":         item.get("total_sold_qty") or 0,
            "dead_days":              item.get("dead_days") or 0,
            "avg_daily_sales":        item.get("avg_daily_sales") or 0,
            "season_adj_daily_sales": item.get("season_adjusted_daily_sales") or 0,
            "safety_stock":           item.get("safety_stock") or 0,
            "min_level":              item.get("min_level") or 0,
            "max_level":              item.get("max_level") or 0,
            "expiry_cap":             item.get("expiry_cap") or 0,
            "final_max":              item.get("final_max") or 0,
            "store_inv":              item.get("on_hand") or 0,
            "on_order":               item.get("on_order") or 0,
            "inv_position":           item.get("inventory_position") or 0,
            "wh_on_hand":             item.get("wh_on_hand") or 0,
            "ordered_qty":            item.get("requested_ship_qty") or 0,
            "allocated_qty":          item.get("allocated_ship_qty") or 0,
            "days_of_stock":          item.get("days_of_stock") or 0,
            "priority_score":         item.get("priority_score") or 0,
            "velocity_mult":          item.get("velocity_multiplier") or 0,
            "category_mult":          item.get("category_multiplier") or 0,
            "effective_mult":         item.get("effective_multiplier") or 0,
        })
    return out


def resolve_sheets_url(sheet_name: str, is_backup: bool, override_url: Optional[str] = None) -> str:
    """Pick the destination web app URL using the same rules as google_sheets.py.

    Env vars are read per call so Railway changes are picked up without a restart.
    """
    google_sheets_url = os.getenv("GOOGLE_SHEETS_URL", "")
    google_sheets_barcode_db_url = os.getenv("GOOGLE_SHEETS_BARCODE_DB_URL", "")
    google_sheets_backup_url = os.getenv("GOOGLE_SHEETS_BACKUP_URL", "")

    if sheet_name in BARCODE_SHEETS and google_sheets_barcode_db_url:
        return google_sheets_barcode_db_url
    if is_backup and google_sheets_backup_url:
        return google_sheets_backup_url
    return google_sheets_url or (override_url or "")


async def post_to_sheets(
    sheet_name: str,
    data: List[Any],
    is_backup: bool = False,
    override_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Server-to-server POST to the Google Apps Script web app.

    Returns {"success": bool, "message": str, "rowsWritten": int, "error": str|None}.
    Never raises for a Sheets-side failure — callers inspect the dict.
    """
    if not sheet_name:
        return {"success": False, "message": "Sheet name is required", "error": "missing_sheet_name"}
    if not data:
        return {"success": False, "message": "No data to post", "error": "empty_data"}

    sheets_url = resolve_sheets_url(sheet_name, is_backup, override_url)
    if not sheets_url:
        return {
            "success": False,
            "message": "Google Sheets URL not configured",
            "error": "Set GOOGLE_SHEETS_URL (and optionally GOOGLE_SHEETS_BACKUP_URL) in the environment.",
        }
    if not sheets_url.startswith("https://script.google.com/"):
        return {
            "success": False,
            "message": "Invalid Google Sheets URL",
            "error": f"Must start with 'https://script.google.com/'. Got: {sheets_url[:50]}...",
        }

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.post(
                sheets_url,
                json={"sheetName": sheet_name, "data": data},
                headers={"Content-Type": "application/json"},
            )
        try:
            result = response.json()
            if result.get("status") == "success" or result.get("success"):
                return {
                    "success": True,
                    "message": f"Posted {len(data)} rows to '{sheet_name}' tab",
                    "rowsWritten": result.get("rowsWritten", len(data)),
                    "error": None,
                }
            return {
                "success": False,
                "message": "Google Sheets returned an error",
                "error": result.get("message") or result.get("error") or "Unknown error",
            }
        except Exception:
            # Non-JSON body: treat HTTP 200 as success (Apps Script sometimes returns bare text)
            if response.status_code == 200:
                return {
                    "success": True,
                    "message": f"Posted {len(data)} rows to '{sheet_name}' tab",
                    "rowsWritten": len(data),
                    "error": None,
                }
            return {
                "success": False,
                "message": f"HTTP {response.status_code}",
                "error": (response.text[:200] if response.text else "Unknown error"),
            }
    except httpx.TimeoutException:
        return {
            "success": False,
            "message": "Request timed out",
            "error": "Request to Google Sheets timed out after 60 seconds",
        }
    except Exception as e:
        return {"success": False, "message": "Failed to post to Google Sheets", "error": str(e)}
