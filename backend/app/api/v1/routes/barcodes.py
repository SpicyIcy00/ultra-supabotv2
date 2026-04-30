"""
Barcode management routes.

- Generate EAN-13 barcodes for selected products (with check digit calculation)
- Save to product_barcodes table
- List existing barcode assignments
- StoreHub proxy: read products from StoreHub API (note: StoreHub has no product UPDATE endpoint)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, distinct, text
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import csv
import io

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


class ProductForBarcode(BaseModel):
    id: str
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    price_type: Optional[str] = None
    unit_price: Optional[float] = None
    cost: Optional[float] = None
    track_stock_level: bool = True


class StoreHubProductsResponse(BaseModel):
    products: list
    note: str


class BarcodeLookupResult(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str]
    barcode: str
    source: str  # "generated" | "storehub"
    category: Optional[str]
    unit_price: Optional[float]




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

    # Skip products that already have a StoreHub-confirmed barcode.
    skipped = [pid for pid in request.product_ids if products[pid].barcode]
    to_generate = [pid for pid in request.product_ids if not products[pid].barcode]

    async def _max_sequence() -> int:
        res = await db.execute(
            select(ProductBarcode.base_digits).where(
                ProductBarcode.base_digits.like(f"{prefix}%")
            )
        )
        used: set[int] = set()
        for (bd,) in res:
            if bd and len(bd) == 12:
                try:
                    used.add(int(bd[3:]))
                except ValueError:
                    pass
        return max(used, default=-1)

    generated: List[BarcodeEntry] = []

    # Retry loop guards against concurrent requests colliding on the UNIQUE barcode constraint.
    for attempt in range(5):
        try:
            generated = []
            # On each retry, offset the starting sequence by the batch size so we
            # jump past whichever values were just taken by the competing request.
            next_seq = await _max_sequence() + 1 + attempt * len(to_generate)

            for product_id in to_generate:
                product = products[product_id]

                # Remove any stale product_barcodes entry before creating a fresh one.
                stale_result = await db.execute(
                    select(ProductBarcode).where(ProductBarcode.product_id == product_id)
                )
                stale = stale_result.scalar_one_or_none()
                if stale:
                    await db.delete(stale)

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
            break  # success — exit retry loop

        except IntegrityError:
            await db.rollback()
            if attempt == 4:
                raise HTTPException(
                    status_code=500,
                    detail="Barcode sequence collision after 5 retries — please try again",
                )

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


@router.get("/products", response_model=List[ProductForBarcode])
async def list_products_for_barcode(
    name: Optional[str] = None,
    sku: Optional[str] = None,
    category: Optional[str] = None,
    no_barcode_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """
    Return products for the barcode generator page.
    Supports server-side filtering by name (ILIKE), SKU (ILIKE), category, and
    no_barcode_only (products with no barcode in either products.barcode or product_barcodes).
    """
    query = select(
        Product.id,
        Product.name,
        Product.sku,
        Product.barcode,
        Product.category,
        Product.price_type,
        Product.unit_price,
        Product.cost,
        Product.track_stock_level,
    )

    if name:
        query = query.where(Product.name.ilike(f"%{name}%"))
    if sku:
        query = query.where(Product.sku.ilike(f"%{sku}%"))
    if category:
        query = query.where(Product.category == category)
    if no_barcode_only:
        # Exclude products that have a StoreHub barcode OR a generated barcode entry
        generated_ids_subq = select(ProductBarcode.product_id)
        query = query.where(
            Product.barcode.is_(None),
            ~Product.id.in_(generated_ids_subq),
        )

    query = query.order_by(Product.name)
    result = await db.execute(query)
    rows = result.all()
    return [
        ProductForBarcode(
            id=str(row.id),
            name=row.name,
            sku=row.sku,
            barcode=row.barcode,
            category=row.category,
            price_type=row.price_type,
            unit_price=float(row.unit_price) if row.unit_price is not None else None,
            cost=float(row.cost) if row.cost is not None else None,
            track_stock_level=bool(row.track_stock_level),
        )
        for row in rows
    ]


@router.get("/categories", response_model=List[str])
async def list_product_categories(
    db: AsyncSession = Depends(get_db),
):
    """Return all unique product categories for the barcode page filter."""
    result = await db.execute(
        select(distinct(Product.category))
        .where(Product.category.isnot(None))
        .order_by(Product.category)
    )
    return [cat for cat in result.scalars().all() if cat]


@router.post("/process-csv")
async def process_storehub_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept a StoreHub Products export CSV, patch ONLY the Barcode column using
    product_barcodes entries (matched by SKU), and return the modified CSV.

    CSV structure expected:
      Row 0  — column names  (SKU, Product Name, Barcode, …)
      Row 1  — instruction / description row  (#Required…, Required, Optional…)
      Row 2+ — product data
    """
    raw = await file.read()
    # Handle UTF-8 BOM that Excel sometimes adds
    text = raw.decode("utf-8-sig")

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)

    if len(rows) < 3:
        raise HTTPException(status_code=400, detail="CSV must have at least a header row, instruction row, and one data row.")

    headers = rows[0]
    try:
        sku_col     = headers.index("SKU")
        barcode_col = headers.index("Barcode")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Column not found in CSV: {e}")

    # Collect all SKUs from data rows (row index 2+)
    skus = [
        row[sku_col]
        for row in rows[2:]
        if len(row) > sku_col and row[sku_col].strip()
    ]

    # Look up barcodes from product_barcodes joined to products (match by SKU)
    result = await db.execute(
        select(ProductBarcode, Product)
        .join(Product, ProductBarcode.product_id == Product.id)
        .where(Product.sku.in_(skus))
    )
    barcode_by_sku: dict[str, str] = {
        p.sku: pb.barcode for pb, p in result.all() if p.sku
    }

    patched = 0
    for i in range(2, len(rows)):
        row = rows[i]
        if len(row) <= max(sku_col, barcode_col):
            continue
        sku = row[sku_col].strip()
        if sku in barcode_by_sku:
            rows[i][barcode_col] = barcode_by_sku[sku]
            patched += 1

    # Write back — Row 0: headers, Row 1+: data only (skip instruction row)
    # StoreHub will try to import the instruction row as a product and fail.
    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_ALL)
    writer.writerow(rows[0])       # column headers
    writer.writerows(rows[2:])     # product data only (skip rows[1] = instruction row)

    return Response(
        content=out.getvalue().encode("utf-8"),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="storehub_import_barcodes.csv"',
            "X-Patched-Count": str(patched),
        },
    )


@router.get("/lookup/{barcode}", response_model=BarcodeLookupResult)
async def lookup_barcode(
    barcode: str,
    db: AsyncSession = Depends(get_db),
):
    """Look up a product by barcode value. Searches generated barcodes first, then StoreHub-confirmed."""
    # Check product_barcodes (generated)
    pb_result = await db.execute(
        select(ProductBarcode, Product)
        .join(Product, ProductBarcode.product_id == Product.id)
        .where(ProductBarcode.barcode == barcode)
    )
    row = pb_result.first()
    if row:
        pb, product = row
        return BarcodeLookupResult(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            barcode=barcode,
            source="generated",
            category=product.category,
            unit_price=float(product.unit_price) if product.unit_price is not None else None,
        )

    # Check products.barcode (StoreHub confirmed)
    p_result = await db.execute(
        select(Product).where(Product.barcode == barcode)
    )
    product = p_result.scalar_one_or_none()
    if product:
        return BarcodeLookupResult(
            product_id=product.id,
            product_name=product.name,
            sku=product.sku,
            barcode=barcode,
            source="storehub",
            category=product.category,
            unit_price=float(product.unit_price) if product.unit_price is not None else None,
        )

    raise HTTPException(status_code=404, detail="Barcode not found")



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
