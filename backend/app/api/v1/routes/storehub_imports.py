"""
StoreHub CSV import routes.

Upload a purchase-order or stock-transfer export; it is parsed, imported and
recorded in the ledger, all in one transaction. Re-uploading the same window
converges on the file rather than accumulating duplicates.

Every route is behind require_page("storehub_imports"). Access is denied by
default until the page is granted to a role in the admin screen, which is the
existing convention — a new page never arrives readable.

WHY THE RESPONSE IS SHAPED LIKE THIS. The import returns its counters AND its
notices, and the notices are not decoration. An import can succeed completely
while telling you that 40 lines mention a location with no store row, or that
six SKUs matched nothing, or that a re-import removed lines. Those are the facts
that decide whether the numbers built on this data mean what they appear to.
A caller that shows only "imported 151 documents" is discarding the half of the
result that carries the caveats.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_page
from app.models.app_user import AppUser
from app.models.storehub import StorehubImport
from app.services.storehub_import import import_file
from app.services.storehub_parser import StorehubParseError

router = APIRouter(tags=["storehub-imports"])

_import_user = require_page("storehub_imports")

KINDS = ("purchase_orders", "stock_transfers")

# The exports are text CSV. 151 POs / 642 lines and 771 transfers / 14,024 lines
# are both comfortably under this; the cap exists so an accidental upload of
# something else fails fast instead of being parsed.
MAX_UPLOAD_BYTES = 32 * 1024 * 1024


class ImportResponse(BaseModel):
    import_id: int
    kind: str
    filename: str
    sha256: str
    counters: dict
    # Always present, possibly empty. Never omitted when empty — a caller that
    # has to check for the key is a caller that will forget to.
    notices: List[dict]


class ImportSummary(BaseModel):
    id: int
    kind: str
    filename: str
    sha256: str
    uploaded_by: str
    uploaded_at: Optional[str]
    documents_seen: int
    lines_seen: int
    documents_inserted: int
    documents_updated: int
    lines_inserted: int
    lines_updated: int
    lines_deleted: int
    unresolved_locations: int
    unmatched_skus: int
    ambiguous_skus: int
    subtotal_mismatches: int
    header_total_mismatches: int
    mojibake_names: int
    notices: List[dict]


@router.post("/{kind}", response_model=ImportResponse, status_code=status.HTTP_201_CREATED)
async def upload_export(
    kind: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: AppUser = Depends(_import_user),
) -> ImportResponse:
    """
    Import one StoreHub CSV export.

    The whole file is one transaction: it either imports completely or not at
    all, and a rejected file leaves no ledger row behind. A file that cannot be
    trusted — unexpected columns, a malformed number, a duplicate document, a
    header total that disagrees with its lines — is rejected with the reason
    rather than partially imported.
    """
    if kind not in KINDS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown export kind {kind!r}. Expected one of {list(KINDS)}.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"The file is {len(data):,} bytes, over the {MAX_UPLOAD_BYTES:,} "
                f"byte limit for a StoreHub export."
            ),
        )

    try:
        result = await import_file(
            db,
            data=data,
            filename=file.filename or "(unnamed)",
            kind=kind,
            # Login is passcode-only (see AppUser), so username is the identity
            # available here — there is no email on the account.
            uploaded_by=user.username,
        )
    except StorehubParseError as exc:
        # 422: the request was well-formed, the file's contents were not. The
        # session is rolled back by get_db, so nothing was written.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    return ImportResponse(**result.as_dict())


@router.get("", response_model=List[ImportSummary])
async def list_imports(
    kind: Optional[str] = Query(None, description="Filter to one export kind."),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: AppUser = Depends(_import_user),
) -> List[ImportSummary]:
    """
    The import ledger, most recent first.

    This is how a number's provenance is traced back to a file and an uploader,
    and how a degrading export shows up as a trend — rising unmatched SKUs or
    unresolved locations across successive imports — rather than as a surprise
    inside an answer.
    """
    if kind is not None and kind not in KINDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown export kind {kind!r}. Expected one of {list(KINDS)}.",
        )

    stmt = select(StorehubImport).order_by(StorehubImport.id.desc()).limit(limit)
    if kind is not None:
        stmt = stmt.where(StorehubImport.kind == kind)

    rows = (await db.execute(stmt)).scalars().all()
    return [
        ImportSummary(
            id=r.id,
            kind=r.kind,
            filename=r.filename,
            sha256=r.sha256,
            uploaded_by=r.uploaded_by,
            uploaded_at=r.uploaded_at.isoformat() if r.uploaded_at else None,
            documents_seen=r.documents_seen,
            lines_seen=r.lines_seen,
            documents_inserted=r.documents_inserted,
            documents_updated=r.documents_updated,
            lines_inserted=r.lines_inserted,
            lines_updated=r.lines_updated,
            lines_deleted=r.lines_deleted,
            unresolved_locations=r.unresolved_locations,
            unmatched_skus=r.unmatched_skus,
            ambiguous_skus=r.ambiguous_skus,
            subtotal_mismatches=r.subtotal_mismatches,
            header_total_mismatches=r.header_total_mismatches,
            mojibake_names=r.mojibake_names,
            notices=r.notices or [],
        )
        for r in rows
    ]
