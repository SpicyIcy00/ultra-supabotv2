from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct
from typing import List, Optional
from app.core.database import get_db
from app.models.product import Product as ProductModel
from app.schemas.product import Product, ProductCreate, ProductUpdate

router = APIRouter()


@router.get("/categories", response_model=List[str])
async def list_categories(
    db: AsyncSession = Depends(get_db),
) -> List[str]:
    """Get all unique product categories."""
    query = select(distinct(ProductModel.category)).where(ProductModel.category.isnot(None)).order_by(ProductModel.category)
    result = await db.execute(query)
    categories = [cat for cat in result.scalars().all() if cat]
    return categories


@router.get("/", response_model=List[Product])
async def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> List[Product]:
    """List all products with optional filtering."""
    query = select(ProductModel)

    if category:
        query = query.where(ProductModel.category == category)

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    products = result.scalars().all()

    return products


@router.get("/{product_id}", response_model=Product)
async def get_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> Product:
    """Get a specific product by ID."""
    result = await db.execute(
        select(ProductModel).where(ProductModel.id == product_id)
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


@router.post("/", response_model=Product, status_code=201)
async def create_product(
    product_in: ProductCreate,
    db: AsyncSession = Depends(get_db),
) -> Product:
    """Create a new product."""
    # Check if SKU already exists
    result = await db.execute(
        select(ProductModel).where(ProductModel.sku == product_in.sku)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Product with this SKU already exists")

    product = ProductModel(**product_in.model_dump())
    db.add(product)
    await db.commit()
    await db.refresh(product)

    return product


@router.patch("/{product_id}", response_model=Product)
async def update_product(
    product_id: int,
    product_in: ProductUpdate,
    db: AsyncSession = Depends(get_db),
) -> Product:
    """Update a product."""
    result = await db.execute(
        select(ProductModel).where(ProductModel.id == product_id)
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = product_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(product, field, value)

    await db.commit()
    await db.refresh(product)

    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a product."""
    result = await db.execute(
        select(ProductModel).where(ProductModel.id == product_id)
    )
    product = result.scalar_one_or_none()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    await db.delete(product)
    await db.commit()
