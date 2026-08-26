"""
Warehouse packing routes.

Staff pick a category, then add products one at a time. For each product they
enter EITHER a number of packs OR a weight in grams/kg, and the other figure is
derived. All arithmetic happens in Postgres (packing_items.total_kg and
total_packs are generated columns), so a client cannot submit its own totals.

Every route is behind require_page("packing").
"""
import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.packing import PackingItem, PackingList
from app.models.product import Product

router = APIRouter(tags=["packing"])

_packing_user = require_page("packing")

# The packing classification, distinct from products.category (POS pricing).
# Taken from the reconciliation sheet.
PACKING_CATEGORIES: List[str] = [
    "Plums",
    "Fruits",
    "Seeds & Nuts",
    "Seafood",
    "Gummy",
]

STATUSES = ("pending", "in_progress", "done")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class ProductOption(BaseModel):
    id: str
    name: str
    nickname: Optional[str] = None
    sku: Optional[str] = None
    pack_weight_g: Optional[float] = None


class CreateListRequest(BaseModel):
    category: Optional[str] = None


class UpdateListRequest(BaseModel):
    category: Optional[str] = None
    status: Optional[str] = None


class AddItemRequest(BaseModel):
    product_id: str
    # 'packs'  -> quantity is a pack count
    # 'grams'  -> quantity is raw grams
    # 'kg'     -> convenience, converted to grams before storing
    unit: str
    quantity: float = Field(gt=0)


class UpdateItemRequest(BaseModel):
    unit: Optional[str] = None
    quantity: Optional[float] = Field(default=None, gt=0)
    actual_packed: Optional[float] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class ItemRecord(BaseModel):
    id: str
    product_id: str
    product_name: str
    nickname: Optional[str] = None
    unit: str
    quantity: float
    pack_weight_g_snapshot: Optional[float] = None
    total_kg: Optional[float] = None
    total_packs: Optional[float] = None
    actual_packed: Optional[float] = None
    remarks: Optional[str] = None
    # raw_qty - coalesce(actual_packed, raw_qty): zero until actuals are keyed in
    discrepancy: Optional[float] = None


class ListTotals(BaseModel):
    total_packs: float
    total_grams: float
    total_kg: float
    item_count: int


class ListSummary(BaseModel):
    id: str
    category: Optional[str] = None
    status: str
    created_by_name: Optional[str] = None
    created_at: str
    totals: ListTotals


class ListDetail(ListSummary):
    items: List[ItemRecord]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _f(value) -> Optional[float]:
    """Decimal -> float for JSON, preserving None."""
    return None if value is None else float(value)


def _to_item(item: PackingItem, product: Product) -> ItemRecord:
    packs = _f(item.total_packs)
    actual = _f(item.actual_packed)
    return ItemRecord(
        id=str(item.id),
        product_id=item.product_id,
        product_name=product.name,
        nickname=product.nickname,
        unit=item.unit,
        quantity=_f(item.quantity),
        pack_weight_g_snapshot=_f(item.pack_weight_g_snapshot),
        total_kg=_f(item.total_kg),
        total_packs=packs,
        actual_packed=actual,
        remarks=item.remarks,
        # Nothing has been packed yet until actual_packed is filled in, so the
        # discrepancy is 0 rather than the whole quantity.
        discrepancy=None if packs is None else packs - (actual if actual is not None else packs),
    )


def _totals(items: List[ItemRecord]) -> ListTotals:
    grams = sum((i.total_kg or 0) * 1000 for i in items)
    return ListTotals(
        total_packs=sum(i.total_packs or 0 for i in items),
        total_grams=grams,
        total_kg=grams / 1000,
        item_count=len(items),
    )


async def _load_detail(db: AsyncSession, list_id: uuid.UUID) -> ListDetail:
    result = await db.execute(
        select(PackingList)
        .options(selectinload(PackingList.items))
        .where(PackingList.id == list_id)
    )
    plist = result.scalar_one_or_none()
    if plist is None:
        raise HTTPException(status_code=404, detail="Packing list not found")

    product_ids = [i.product_id for i in plist.items]
    products = {}
    if product_ids:
        prows = await db.execute(select(Product).where(Product.id.in_(product_ids)))
        products = {p.id: p for p in prows.scalars().all()}

    items = [
        _to_item(i, products[i.product_id])
        for i in plist.items
        if i.product_id in products
    ]

    creator = None
    if plist.created_by:
        urow = await db.execute(select(AppUser).where(AppUser.id == plist.created_by))
        user = urow.scalar_one_or_none()
        creator = (user.display_name or user.username) if user else None

    return ListDetail(
        id=str(plist.id),
        category=plist.category,
        status=plist.status,
        created_by_name=creator,
        created_at=plist.created_at.isoformat() if plist.created_at else "",
        totals=_totals(items),
        items=items,
    )


def _normalise_unit(unit: str, quantity: float) -> tuple[str, float]:
    """
    Map the request's unit onto what the column accepts.

    kg is accepted for convenience because staff think in kilos for targets,
    but it is stored as grams so there is only ever one weight unit in the DB.
    """
    unit = unit.strip().lower()
    if unit == "kg":
        return "grams", quantity * 1000
    if unit not in ("packs", "grams"):
        raise HTTPException(
            status_code=400, detail="unit must be one of 'packs', 'grams', 'kg'"
        )
    return unit, quantity


async def _require_packable(db: AsyncSession, product_id: str) -> Product:
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    # Without a per-pack weight neither conversion is possible, so refuse at
    # add time rather than storing a row whose totals silently come out NULL.
    if product.pack_weight_g is None or float(product.pack_weight_g) <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"'{product.nickname or product.name}' has no pack weight set",
        )
    return product


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=List[str])
async def list_categories(_: AppUser = Depends(_packing_user)):
    return PACKING_CATEGORIES


@router.get("/products", response_model=List[ProductOption])
async def search_products(
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    """
    Products that can be packed, searchable by nickname, catalogue name or SKU.

    Only products with a pack weight are returned — anything else cannot be
    converted between packs and grams, so offering it would only produce an
    error when staff try to add it.
    """
    query = select(Product).where(
        Product.pack_weight_g.isnot(None), Product.pack_weight_g > 0
    )

    if search:
        term = f"%{search.strip()}%"
        query = query.where(
            or_(
                Product.nickname.ilike(term),
                Product.name.ilike(term),
                Product.sku.ilike(term),
            )
        )

    # Nickname first: it is what staff actually look for.
    query = query.order_by(Product.nickname, Product.name).limit(limit)
    rows = await db.execute(query)

    return [
        ProductOption(
            id=p.id,
            name=p.name,
            nickname=p.nickname,
            sku=p.sku,
            pack_weight_g=_f(p.pack_weight_g),
        )
        for p in rows.scalars().all()
    ]


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------

@router.post("/lists", response_model=ListDetail, status_code=201)
async def create_list(
    payload: CreateListRequest,
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_packing_user),
):
    if payload.category and payload.category not in PACKING_CATEGORIES:
        raise HTTPException(
            status_code=400, detail=f"category must be one of {PACKING_CATEGORIES}"
        )

    plist = PackingList(category=payload.category, created_by=user.id, status="pending")
    db.add(plist)
    await db.commit()
    await db.refresh(plist)
    return await _load_detail(db, plist.id)


@router.get("/lists", response_model=List[ListSummary])
async def list_history(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    """Past packing lists, newest first, with their totals."""
    query = select(PackingList).options(selectinload(PackingList.items))
    if status:
        query = query.where(PackingList.status == status)
    query = query.order_by(PackingList.created_at.desc()).limit(limit)

    rows = (await db.execute(query)).scalars().all()

    creators = {}
    creator_ids = {p.created_by for p in rows if p.created_by}
    if creator_ids:
        urows = await db.execute(select(AppUser).where(AppUser.id.in_(creator_ids)))
        creators = {
            u.id: (u.display_name or u.username) for u in urows.scalars().all()
        }

    summaries = []
    for plist in rows:
        # Totals only need the generated columns, so the product join the item
        # serialiser does is unnecessary here.
        packs = sum(_f(i.total_packs) or 0 for i in plist.items)
        kg = sum(_f(i.total_kg) or 0 for i in plist.items)
        summaries.append(
            ListSummary(
                id=str(plist.id),
                category=plist.category,
                status=plist.status,
                created_by_name=creators.get(plist.created_by),
                created_at=plist.created_at.isoformat() if plist.created_at else "",
                totals=ListTotals(
                    total_packs=packs,
                    total_grams=kg * 1000,
                    total_kg=kg,
                    item_count=len(plist.items),
                ),
            )
        )
    return summaries


@router.get("/lists/{list_id}", response_model=ListDetail)
async def get_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    return await _load_detail(db, list_id)


@router.patch("/lists/{list_id}", response_model=ListDetail)
async def update_list(
    list_id: uuid.UUID,
    payload: UpdateListRequest,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    result = await db.execute(select(PackingList).where(PackingList.id == list_id))
    plist = result.scalar_one_or_none()
    if plist is None:
        raise HTTPException(status_code=404, detail="Packing list not found")

    if payload.category is not None:
        if payload.category not in PACKING_CATEGORIES:
            raise HTTPException(
                status_code=400, detail=f"category must be one of {PACKING_CATEGORIES}"
            )
        plist.category = payload.category

    if payload.status is not None:
        if payload.status not in STATUSES:
            raise HTTPException(
                status_code=400, detail=f"status must be one of {list(STATUSES)}"
            )
        plist.status = payload.status

    await db.commit()
    return await _load_detail(db, list_id)


@router.delete("/lists/{list_id}", status_code=204)
async def delete_list(
    list_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    result = await db.execute(select(PackingList).where(PackingList.id == list_id))
    plist = result.scalar_one_or_none()
    if plist is None:
        raise HTTPException(status_code=404, detail="Packing list not found")
    await db.delete(plist)  # items cascade
    await db.commit()


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------

@router.post("/lists/{list_id}/items", response_model=ListDetail, status_code=201)
async def add_item(
    list_id: uuid.UUID,
    payload: AddItemRequest,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    """
    Add a product to the list.

    Adding a product already on the list in the same unit adds to that row
    rather than creating a second one, which is what staff expect when they
    scan the same thing twice.
    """
    result = await db.execute(select(PackingList).where(PackingList.id == list_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Packing list not found")

    unit, quantity = _normalise_unit(payload.unit, payload.quantity)
    product = await _require_packable(db, payload.product_id)

    existing = await db.execute(
        select(PackingItem).where(
            PackingItem.packing_list_id == list_id,
            PackingItem.product_id == payload.product_id,
            PackingItem.unit == unit,
        )
    )
    item = existing.scalar_one_or_none()

    if item is not None:
        item.quantity = Decimal(str(item.quantity)) + Decimal(str(quantity))
    else:
        db.add(
            PackingItem(
                packing_list_id=list_id,
                product_id=payload.product_id,
                unit=unit,
                quantity=Decimal(str(quantity)),
                pack_weight_g_snapshot=product.pack_weight_g,
            )
        )

    await db.commit()
    return await _load_detail(db, list_id)


@router.patch("/items/{item_id}", response_model=ListDetail)
async def update_item(
    item_id: uuid.UUID,
    payload: UpdateItemRequest,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    """Edit a row, or key in actual_packed and remarks after physical packing."""
    result = await db.execute(select(PackingItem).where(PackingItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Packing item not found")

    if payload.unit is not None or payload.quantity is not None:
        unit, quantity = _normalise_unit(
            payload.unit or item.unit,
            payload.quantity if payload.quantity is not None else float(item.quantity),
        )
        item.unit = unit
        item.quantity = Decimal(str(quantity))

    if payload.actual_packed is not None:
        item.actual_packed = Decimal(str(payload.actual_packed))
    if payload.remarks is not None:
        item.remarks = payload.remarks

    await db.commit()
    return await _load_detail(db, item.packing_list_id)


@router.delete("/items/{item_id}", response_model=ListDetail)
async def delete_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_packing_user),
):
    result = await db.execute(select(PackingItem).where(PackingItem.id == item_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Packing item not found")

    list_id = item.packing_list_id
    await db.delete(item)
    await db.commit()
    return await _load_detail(db, list_id)
