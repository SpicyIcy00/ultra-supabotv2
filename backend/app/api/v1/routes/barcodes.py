"""
Barcode management routes.

- Generate EAN-13 barcodes for selected products (with check digit calculation)
- Save to product_barcodes table
- List existing barcode assignments
- StoreHub proxy: read products from StoreHub API (note: StoreHub has no product UPDATE endpoint)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os

from app.core.database import get_db
from app.models.product import Product
from app.models.product_barcode import ProductBarcode

router = APIRouter(tags=["barcodes"])

STOREHUB_API_BASE = "https://api.storehubhq.com"
STOREHUB_USERNAME = os.getenv("STOREHUB_USERNAME", "")
STOREHUB_API_TOKEN = os.getenv("STOREHUB_API_TOKEN", "")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class GenerateBarcodesRequest(BaseModel):
    product_ids: List[str]
    # 3-digit GS1 prefix. 200-299 is reserved for in-store/restricted use.
    prefix: str = "200"


class BarcodeEntry(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str]
    barcode: str          # EAN-13 (13 digits)
    base_digits: str      # first 12 digits before check digit
    already_existed: bool = False


class GenerateBarcodesResponse(BaseModel):
    generated: List[BarcodeEntry]
    skipped: List[str]    # product_ids that already have a barcode assigned


class BarcodeRecord(BaseModel):
    id: int
    product_id: str
    product_name: str
    sku: Optional[str]
    barcode: str
    base_digits: Optional[str]
    generated_at: str


class StoreHubProductsResponse(BaseModel):
    products: list
    note: str


# ---------------------------------------------------------------------------
# EAN-13 helpers
# ---------------------------------------------------------------------------

def _calculate_ean13_check_digit(twelve_digits: str) -> int:
    """
    Compute the EAN-13 check digit from the first 12 digits.
    Algorithm: alternate multiply by 1 and 3, sum, check = (10 - sum%10) % 10
    """
    if len(twelve_digits) != 12 or not twelve_digits.isdigit():
        raise ValueError(f"Expected exactly 12 numeric digits, got: {twelve_digits!r}")
    total = sum(
        int(d) * (3 if i % 2 else 1)
        for i, d in enumerate(twelve_digits)
    )
    return (10 - (total % 10)) % 10


def _build_ean13(prefix: str, sequence: int) -> tuple[str, str]:
    """
    Build a full EAN-13 barcode.
    prefix  : 3-digit string (e.g. "200")
    sequence: integer 0-999999999 (fills the remaining 9 digits)
    Returns (barcode_13_digits, base_12_digits)
    """
    item_ref = str(sequence).zfill(9)   # 9 digits
    base = f"{prefix}{item_ref}"         # 12 digits
    check = _calculate_ean13_check_digit(base)
    return f"{base}{check}", base


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/generate", response_model=GenerateBarcodesResponse)
async def generate_barcodes(
    request: GenerateBarcodesRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate EAN-13 barcodes for the selected product IDs and persist them.

    Uses GS1 prefix 200 (in-store restricted circulation) by default.
    Skips products that already have a barcode assigned in the DB.
    """
    if not request.product_ids:
        raise HTTPException(status_code=400, detail="No product IDs provided")

    prefix = request.prefix.strip()
    if len(prefix) != 3 or not prefix.isdigit():
        raise HTTPException(status_code=400, detail="prefix must be exactly 3 numeric digits (e.g. '200')")

    # Fetch products
    result = await db.execute(
        select(Product).where(Product.id.in_(request.product_ids))
    )
    products = {p.id: p for p in result.scalars().all()}

    missing = set(request.product_ids) - set(products)
    if missing:
        raise HTTPException(status_code=404, detail=f"Products not found: {list(missing)}")

    # Find which products already have barcodes
    existing_result = await db.execute(
        select(ProductBarcode).where(ProductBarcode.product_id.in_(request.product_ids))
    )
    existing_by_product = {pb.product_id: pb for pb in existing_result.scalars().all()}

    # Find the highest existing sequence for this prefix to avoid collisions
    all_barcodes_result = await db.execute(
        select(ProductBarcode.base_digits).where(
            ProductBarcode.base_digits.like(f"{prefix}%")
        )
    )
    used_sequences = set()
    for (bd,) in all_barcodes_result:
        if bd and len(bd) == 12:
            try:
                used_sequences.add(int(bd[3:]))   # last 9 digits = sequence
            except ValueError:
                pass

    next_seq = max(used_sequences, default=-1) + 1

    generated: List[BarcodeEntry] = []
    skipped: List[str] = []

    for product_id in request.product_ids:
        product = products[product_id]

        if product_id in existing_by_product:
            skipped.append(product_id)
            continue

        barcode_str, base = _build_ean13(prefix, next_seq)
        next_seq += 1

        pb = ProductBarcode(
            product_id=product_id,
            barcode=barcode_str,
            base_digits=base,
        )
        db.add(pb)

        generated.append(BarcodeEntry(
            product_id=product_id,
            product_name=product.name,
            sku=product.sku,
            barcode=barcode_str,
            base_digits=base,
        ))

    await db.commit()

    return GenerateBarcodesResponse(generated=generated, skipped=skipped)


@router.get("/", response_model=List[BarcodeRecord])
async def list_barcodes(
    db: AsyncSession = Depends(get_db),
):
    """Return all barcode assignments with product info."""
    result = await db.execute(
        select(ProductBarcode, Product)
        .join(Product, ProductBarcode.product_id == Product.id)
        .order_by(ProductBarcode.generated_at.desc())
    )
    rows = result.all()
    return [
        BarcodeRecord(
            id=pb.id,
            product_id=pb.product_id,
            product_name=p.name,
            sku=p.sku,
            barcode=pb.barcode,
            base_digits=pb.base_digits,
            generated_at=pb.generated_at.isoformat(),
        )
        for pb, p in rows
    ]


@router.delete("/{barcode_id}", status_code=204)
async def delete_barcode(
    barcode_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Remove a barcode assignment."""
    result = await db.execute(
        select(ProductBarcode).where(ProductBarcode.id == barcode_id)
    )
    pb = result.scalar_one_or_none()
    if not pb:
        raise HTTPException(status_code=404, detail="Barcode record not found")
    await db.delete(pb)
    await db.commit()


@router.get("/storehub/products", response_model=StoreHubProductsResponse)
async def get_storehub_products():
    """
    Fetch products from the StoreHub REST API.

    NOTE: StoreHub's public API only supports reading products (GET).
    There is NO endpoint to update/patch a product's barcode field.
    To assign a barcode in StoreHub you must enter it manually in their Back Office.
    """
    if not STOREHUB_USERNAME or not STOREHUB_API_TOKEN:
        raise HTTPException(
            status_code=503,
            detail=(
                "StoreHub credentials not configured. "
                "Set STOREHUB_USERNAME and STOREHUB_API_TOKEN environment variables."
            ),
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{STOREHUB_API_BASE}/products",
                auth=(STOREHUB_USERNAME, STOREHUB_API_TOKEN),
                headers={"Accept": "application/json"},
            )

        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="StoreHub authentication failed. Check credentials.")
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"StoreHub API error: {response.text[:300]}"
            )

        products = response.json()
        return StoreHubProductsResponse(
            products=products,
            note=(
                "StoreHub REST API is read-only for products. "
                "Generated barcodes cannot be pushed back via API — "
                "they must be entered manually in the StoreHub Back Office."
            ),
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="StoreHub API request timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to contact StoreHub: {str(e)}")
