"""
Google Sheets proxy endpoint to avoid CORS issues.
Routes requests through the backend server-to-server.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import httpx
import os

router = APIRouter(tags=["Google Sheets"])

# Get Google Sheets URL from environment
GOOGLE_SHEETS_URL = os.getenv("GOOGLE_SHEETS_URL", "")


class SheetRow(BaseModel):
    product_name: str
    sku: str
    product_id: str
    quantity_sold: int
    inventory_store_a: int
    inventory_store_b: int


class PostToSheetsRequest(BaseModel):
    sheetName: str
    data: List[Dict[str, Any]]
    sheetsUrl: Optional[str] = None  # Optional override URL


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
    """
    # Log incoming request for debugging
    print(f"=== Google Sheets Proxy Request ===")
    print(f"Sheet Name: {request.sheetName}")
    print(f"Data rows: {len(request.data) if request.data else 0}")
    print(f"Provided sheetsUrl from frontend: {request.sheetsUrl}")
    print(f"Environment GOOGLE_SHEETS_URL: {GOOGLE_SHEETS_URL}")
    
    # Use provided URL or fall back to environment variable
    sheets_url = request.sheetsUrl or GOOGLE_SHEETS_URL
    
    print(f"Final URL to use: {sheets_url}")
    
    if not sheets_url:
        raise HTTPException(
            status_code=400,
            detail="Google Sheets URL not configured. Set GOOGLE_SHEETS_URL environment variable in Railway."
        )
    
    # Validate URL format
    if not sheets_url.startswith("https://script.google.com/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid Google Sheets URL. Must start with 'https://script.google.com/'. Got: {sheets_url[:50]}..."
        )
    
    if not request.sheetName:
        raise HTTPException(
            status_code=400,
            detail="Sheet name is required"
        )
    
    if not request.data or len(request.data) == 0:
        raise HTTPException(
            status_code=400,
            detail="No data to post"
        )
    
    try:
        # Make server-to-server request to Google Apps Script
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.post(
                sheets_url,
                json={
                    "sheetName": request.sheetName,
                    "data": request.data
                },
                headers={
                    "Content-Type": "application/json"
                }
            )
            
            # Log for debugging
            print(f"Google Sheets response status: {response.status_code}")
            print(f"Google Sheets response body: {response.text[:500] if response.text else 'empty'}")
            
            # Try to parse response
            try:
                result = response.json()
                if result.get("status") == "success" or result.get("success"):
                    return PostToSheetsResponse(
                        success=True,
                        message=f"Posted {len(request.data)} rows to '{request.sheetName}' tab",
                        rowsWritten=result.get("rowsWritten", len(request.data)),
                        sheetName=request.sheetName
                    )
                else:
                    return PostToSheetsResponse(
                        success=False,
                        message="Google Sheets returned an error",
                        error=result.get("message") or result.get("error") or "Unknown error"
                    )
            except Exception as parse_error:
                # If we can't parse JSON, check if it was successful based on status
                if response.status_code == 200:
                    return PostToSheetsResponse(
                        success=True,
                        message=f"Posted {len(request.data)} rows to '{request.sheetName}' tab",
                        rowsWritten=len(request.data),
                        sheetName=request.sheetName
                    )
                else:
                    return PostToSheetsResponse(
                        success=False,
                        message=f"HTTP {response.status_code}",
                        error=response.text[:200] if response.text else "Unknown error"
                    )
                    
    except httpx.TimeoutException:
        return PostToSheetsResponse(
            success=False,
            message="Request timed out",
            error="Request to Google Sheets timed out after 60 seconds"
        )
    except Exception as e:
        print(f"Error posting to Google Sheets: {str(e)}")
        return PostToSheetsResponse(
            success=False,
            message="Failed to post to Google Sheets",
            error=str(e)
        )
