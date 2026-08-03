"""
Google Sheets proxy endpoint to avoid CORS issues.
Routes requests through the backend server-to-server.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import os

from app.services.sheets_poster import post_to_sheets as post_to_sheets_helper

router = APIRouter(tags=["Google Sheets"])

# Get Google Sheets URLs from environment (read at startup; backup URL re-read per request below)
GOOGLE_SHEETS_URL = os.getenv("GOOGLE_SHEETS_URL", "")
GOOGLE_SHEETS_BARCODE_DB_URL = os.getenv("GOOGLE_SHEETS_BARCODE_DB_URL", "")


class SheetRow(BaseModel):
    product_name: str
    sku: str
    product_id: str
    quantity_sold: int
    inventory_store_a: int
    inventory_store_b: int


class PostToSheetsRequest(BaseModel):
    sheetName: str
    data: List[Any]  # accepts both list-of-dicts and list-of-arrays
    sheetsUrl: Optional[str] = None  # Optional override URL
    isBackup: Optional[bool] = False  # Route to GOOGLE_SHEETS_BACKUP_URL


class PostToSheetsResponse(BaseModel):
    success: bool
    message: str
    rowsWritten: Optional[int] = None
    sheetName: Optional[str] = None
    error: Optional[str] = None


@router.post("/post-to-sheets", response_model=PostToSheetsResponse)
async def post_to_google_sheets(request: PostToSheetsRequest):
    """
    Proxy endpoint to post data to Google Sheets.
    This avoids CORS issues by making the request server-side.
    Delegates URL routing + the server-to-server POST to app.services.sheets_poster.
    """
    print(f"=== Google Sheets Proxy Request ===")
    print(f"Sheet Name: {request.sheetName}")
    print(f"Is Backup: {request.isBackup}")
    print(f"Data rows: {len(request.data) if request.data else 0}")

    if not request.sheetName:
        raise HTTPException(status_code=400, detail="Sheet name is required")
    if not request.data or len(request.data) == 0:
        raise HTTPException(status_code=400, detail="No data to post")

    result = await post_to_sheets_helper(
        sheet_name=request.sheetName,
        data=request.data,
        is_backup=bool(request.isBackup),
        override_url=request.sheetsUrl,
    )

    # Surface configuration/validation problems as 400 (unchanged behavior)
    if not result["success"] and result.get("error") in ("missing_sheet_name", "empty_data"):
        raise HTTPException(status_code=400, detail=result["message"])
    if not result["success"] and "URL not configured" in result.get("message", ""):
        raise HTTPException(
            status_code=400,
            detail="Google Sheets URL not configured. Set GOOGLE_SHEETS_URL (and optionally GOOGLE_SHEETS_BARCODE_DB_URL) in Railway.",
        )

    return PostToSheetsResponse(
        success=result["success"],
        message=result["message"],
        rowsWritten=result.get("rowsWritten"),
        sheetName=request.sheetName if result["success"] else None,
        error=result.get("error"),
    )
