"""
Saved Queries API Routes

Provides CRUD endpoints for saving and managing frequently used queries.
Includes export functionality for CSV and chart images.
"""

import csv
import io
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import json

router = APIRouter(tags=["saved-queries"])


# In-memory storage (in production, use database)
_saved_queries: Dict[str, Dict[str, Any]] = {}


class SavedQuery(BaseModel):
    """Schema for a saved query"""
    id: Optional[str] = Field(None, description="Unique ID (auto-generated)")
    name: str = Field(..., min_length=1, max_length=100, description="Query name")
    question: str = Field(..., min_length=1, description="Natural language question")
    category: Optional[str] = Field(None, description="Category for organization")
    is_favorite: bool = Field(False, description="Whether this is a favorite")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    last_used: Optional[str] = Field(None, description="Last used timestamp")
    use_count: int = Field(0, description="Number of times used")


class SavedQueryCreate(BaseModel):
    """Schema for creating a saved query"""
    name: str = Field(..., min_length=1, max_length=100)
    question: str = Field(..., min_length=1)
    category: Optional[str] = None
    is_favorite: bool = False


class SavedQueryUpdate(BaseModel):
    """Schema for updating a saved query"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    question: Optional[str] = Field(None, min_length=1)
    category: Optional[str] = None
    is_favorite: Optional[bool] = None


class ExportRequest(BaseModel):
    """Schema for data export request"""
    data: List[Dict[str, Any]] = Field(..., description="Data rows to export")
    filename: Optional[str] = Field("export", description="Filename without extension")
    include_headers: bool = Field(True, description="Include column headers")


@router.get("/", response_model=List[SavedQuery])
async def list_saved_queries(
    category: Optional[str] = Query(None, description="Filter by category"),
    favorites_only: bool = Query(False, description="Only return favorites")
) -> List[SavedQuery]:
    """
    Get all saved queries, optionally filtered.
    """
    queries = list(_saved_queries.values())
    
    if category:
        queries = [q for q in queries if q.get("category") == category]
    
    if favorites_only:
        queries = [q for q in queries if q.get("is_favorite", False)]
    
    # Sort by last_used, then by name
    queries.sort(key=lambda q: (q.get("last_used") or "", q.get("name", "")), reverse=True)
    
    return [SavedQuery(**q) for q in queries]


@router.post("/", response_model=SavedQuery)
async def create_saved_query(query: SavedQueryCreate) -> SavedQuery:
    """
    Save a new query.
    """
    import uuid
    
    query_id = str(uuid.uuid4())[:8]
    now = datetime.now().isoformat()
    
    saved_query = {
        "id": query_id,
        "name": query.name,
        "question": query.question,
        "category": query.category,
        "is_favorite": query.is_favorite,
        "created_at": now,
        "last_used": None,
        "use_count": 0
    }
    
    _saved_queries[query_id] = saved_query
    
    return SavedQuery(**saved_query)


@router.get("/{query_id}", response_model=SavedQuery)
async def get_saved_query(query_id: str) -> SavedQuery:
    """
    Get a saved query by ID.
    """
    if query_id not in _saved_queries:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    return SavedQuery(**_saved_queries[query_id])


@router.put("/{query_id}", response_model=SavedQuery)
async def update_saved_query(query_id: str, update: SavedQueryUpdate) -> SavedQuery:
    """
    Update a saved query.
    """
    if query_id not in _saved_queries:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    query = _saved_queries[query_id]
    
    if update.name is not None:
        query["name"] = update.name
    if update.question is not None:
        query["question"] = update.question
    if update.category is not None:
        query["category"] = update.category
    if update.is_favorite is not None:
        query["is_favorite"] = update.is_favorite
    
    return SavedQuery(**query)


@router.delete("/{query_id}")
async def delete_saved_query(query_id: str) -> Dict[str, str]:
    """
    Delete a saved query.
    """
    if query_id not in _saved_queries:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    del _saved_queries[query_id]
    
    return {"message": "Query deleted successfully"}


@router.post("/{query_id}/use")
async def mark_query_used(query_id: str) -> SavedQuery:
    """
    Mark a query as used (updates last_used and use_count).
    """
    if query_id not in _saved_queries:
        raise HTTPException(status_code=404, detail="Saved query not found")
    
    query = _saved_queries[query_id]
    query["last_used"] = datetime.now().isoformat()
    query["use_count"] = query.get("use_count", 0) + 1
    
    return SavedQuery(**query)


@router.get("/categories/list")
async def list_categories() -> List[str]:
    """
    Get all unique categories.
    """
    categories = set()
    for query in _saved_queries.values():
        if query.get("category"):
            categories.add(query["category"])
    
    return sorted(list(categories))


# ============================================================================
# EXPORT ENDPOINTS
# ============================================================================

@router.post("/export/csv")
async def export_to_csv(request: ExportRequest) -> StreamingResponse:
    """
    Export data to CSV format.
    
    Returns a downloadable CSV file.
    """
    if not request.data:
        raise HTTPException(status_code=400, detail="No data to export")
    
    # Create CSV in memory
    output = io.StringIO()
    
    # Get headers from first row
    headers = list(request.data[0].keys())
    
    writer = csv.writer(output)
    
    # Write headers if requested
    if request.include_headers:
        writer.writerow(headers)
    
    # Write data rows
    for row in request.data:
        writer.writerow([row.get(h, "") for h in headers])
    
    # Prepare response
    output.seek(0)
    
    filename = f"{request.filename or 'export'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


@router.post("/export/json")
async def export_to_json(request: ExportRequest) -> StreamingResponse:
    """
    Export data to JSON format.
    
    Returns a downloadable JSON file.
    """
    if not request.data:
        raise HTTPException(status_code=400, detail="No data to export")
    
    # Convert to JSON
    json_str = json.dumps(request.data, indent=2, default=str)
    
    filename = f"{request.filename or 'export'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    
    return StreamingResponse(
        iter([json_str]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/json; charset=utf-8"
        }
    )


# Pre-populate with some example saved queries
_saved_queries["example1"] = {
    "id": "example1",
    "name": "Top Products This Month",
    "question": "What are the top 10 selling products this month?",
    "category": "Sales",
    "is_favorite": True,
    "created_at": datetime.now().isoformat(),
    "last_used": None,
    "use_count": 0
}

_saved_queries["example2"] = {
    "id": "example2",
    "name": "Sales by Store",
    "question": "Show me sales by store for the last 7 days",
    "category": "Sales",
    "is_favorite": True,
    "created_at": datetime.now().isoformat(),
    "last_used": None,
    "use_count": 0
}

_saved_queries["example3"] = {
    "id": "example3",
    "name": "Low Stock Alert",
    "question": "Show me low stock items across all stores",
    "category": "Inventory",
    "is_favorite": False,
    "created_at": datetime.now().isoformat(),
    "last_used": None,
    "use_count": 0
}
