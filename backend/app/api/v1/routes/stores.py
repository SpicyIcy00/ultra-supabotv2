from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.core.database import get_db
from app.models.store import Store as StoreModel
from app.schemas.store import Store, StoreCreate, StoreUpdate

router = APIRouter()


@router.get("/", response_model=List[Store])
async def list_stores(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
) -> List[Store]:
    """List all stores with optional filtering."""
    query = select(StoreModel)

    if is_active is not None:
        query = query.where(StoreModel.is_active == is_active)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    stores = result.scalars().all()

    return stores


@router.get("/{store_id}", response_model=Store)
async def get_store(
    store_id: int,
    db: AsyncSession = Depends(get_db),
) -> Store:
    """Get a specific store by ID."""
    result = await db.execute(
        select(StoreModel).where(StoreModel.id == store_id)
    )
    store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    return store


@router.post("/", response_model=Store, status_code=201)
async def create_store(
    store_in: StoreCreate,
    db: AsyncSession = Depends(get_db),
) -> Store:
    """Create a new store."""
    # Check if code already exists
    result = await db.execute(
        select(StoreModel).where(StoreModel.code == store_in.code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Store with this code already exists")

    store = StoreModel(**store_in.model_dump())
    db.add(store)
    await db.commit()
    await db.refresh(store)

    return store


@router.patch("/{store_id}", response_model=Store)
async def update_store(
    store_id: int,
    store_in: StoreUpdate,
    db: AsyncSession = Depends(get_db),
) -> Store:
    """Update a store."""
    result = await db.execute(
        select(StoreModel).where(StoreModel.id == store_id)
    )
    store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    update_data = store_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(store, field, value)

    await db.commit()
    await db.refresh(store)

    return store


@router.delete("/{store_id}", status_code=204)
async def delete_store(
    store_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a store."""
    result = await db.execute(
        select(StoreModel).where(StoreModel.id == store_id)
    )
    store = result.scalar_one_or_none()

    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    await db.delete(store)
    await db.commit()
