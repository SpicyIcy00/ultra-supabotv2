"""
StoreHub CSV importer — writes parsed documents into the database.

Parsing lives in storehub_parser (pure, no database). This module does the four
things that need one: resolve SKUs against the product catalog, upsert the
documents and their lines, converge the lines to the file, and record the import
in the ledger.

RUNS ON THE APPLICATION'S ROLE, not George's. George's read-only role
(tools/_common.connect) cannot write and is never used here. George READS these
tables afterwards.

IDEMPOTENCY, WHICH IS THE WHOLE POINT
-------------------------------------
Re-importing a file CONVERGES on it rather than accumulating:

  - documents upsert on external_id;
  - lines upsert on (document_id, line_no);
  - lines of THOSE documents that this import did not write are deleted, which
    is exactly the set the file no longer contains (they still carry an older
    import_id);
  - documents ABSENT from the file are untouched. These exports are
    date-windowed, so absence means "outside this window", not "deleted".
    Deleting on absence would empty the table on the first narrow export.

Everything happens in ONE transaction — the caller's session, committed by
get_db. A file that fails halfway leaves nothing behind, including its own
ledger row.

NO BUSINESS DEFINITION LIVES HERE. Status meanings, location aliases, SKU
matching rules and the currency correction are read from
definitions/metrics.yaml via storehub_parser.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy import delete, literal_column, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.storehub import (
    PurchaseOrder,
    PurchaseOrderLine,
    StockTransfer,
    StockTransferLine,
    StorehubImport,
)
from app.models.product import Product
from app.services.storehub_parser import (
    PARSER_VERSION,
    ParsedFile,
    StorehubParseError,
    load_defs,
    parse,
    req,
)

# Which models and which columns each export kind writes. Keyed by the same
# `kind` the parser and metrics.yaml use.
_KINDS: dict[str, dict[str, Any]] = {
    "purchase_orders": {
        "document": PurchaseOrder,
        "line": PurchaseOrderLine,
        "line_fk": "purchase_order_id",
    },
    "stock_transfers": {
        "document": StockTransfer,
        "line": StockTransferLine,
        "line_fk": "stock_transfer_id",
    },
}


@dataclass
class ImportResult:
    import_id: int
    kind: str
    filename: str
    sha256: str
    counters: dict[str, int] = field(default_factory=dict)
    notices: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "import_id": self.import_id,
            "kind": self.kind,
            "filename": self.filename,
            "sha256": self.sha256,
            "counters": self.counters,
            "notices": self.notices,
        }


async def _resolve_skus(
    db: AsyncSession, skus: set[str]
) -> tuple[dict[str, Optional[str]], dict[str, str], dict[str, int]]:
    """
    Map each exported SKU to a product id, CASE-SENSITIVELY.

    metrics.yaml products.sku.import_match is case_sensitive and it is
    load-bearing: TKY28 and Tky28 are different products, as are TKY107 and
    Tky107, and the catalog holds three unrelated items under Tky105 / tky105 /
    TKY105. Folding case here would merge unrelated products' cost histories
    into one series.

    A SKU matching more than one row is NOT resolved by choosing one. It is left
    unresolved and flagged, exactly like a miss — there is no user present to
    disambiguate for, and a silently-picked product would attribute a real
    purchase cost to the wrong item.

    Returns (sku -> product_id or None, sku -> match kind, counters).
    """
    defs = load_defs()
    policy = req(defs, "products.sku.import_match")
    if policy != "case_sensitive":
        raise RuntimeError(
            f"metrics.yaml products.sku.import_match is {policy!r}; this importer "
            f"implements case_sensitive matching only. Change the code "
            f"deliberately rather than letting the two disagree."
        )

    product_id: dict[str, Optional[str]] = {}
    match_kind: dict[str, str] = {}
    counters = {"unmatched_skus": 0, "ambiguous_skus": 0}

    if not skus:
        return product_id, match_kind, counters

    # Equality against products.sku is case-sensitive in Postgres by default,
    # which is the behaviour wanted here. No lower() anywhere.
    rows = (
        await db.execute(
            select(Product.id, Product.sku).where(Product.sku.in_(list(skus)))
        )
    ).all()

    by_sku: dict[str, list[str]] = {}
    for pid, sku in rows:
        by_sku.setdefault(sku, []).append(pid)

    for sku in skus:
        matches = by_sku.get(sku, [])
        if len(matches) == 1:
            product_id[sku] = matches[0]
            match_kind[sku] = "exact"
        elif not matches:
            product_id[sku] = None
            match_kind[sku] = "none"
            counters["unmatched_skus"] += 1
        else:
            product_id[sku] = None
            match_kind[sku] = "ambiguous"
            counters["ambiguous_skus"] += 1

    return product_id, match_kind, counters


def _document_values(parsed, kind: str, import_id: int) -> dict:
    """Header roles as produced by the parser, plus provenance."""
    values = dict(parsed.header)
    values["external_id"] = parsed.external_id
    values["line_count"] = len(parsed.lines)
    values["import_id"] = import_id
    values["first_seen_import_id"] = import_id      # kept on conflict; see below
    # A document with no status would violate NOT NULL. The export always
    # carries one; failing here rather than defaulting keeps a silently
    # statusless document from becoming "" downstream.
    if not values.get("status"):
        raise StorehubParseError(
            f"{parsed.external_id} has no Status. Status decides whether goods "
            f"moved and whether the document is cancelled; it is not defaulted."
        )
    return values


async def import_file(
    db: AsyncSession,
    *,
    data: bytes,
    filename: str,
    kind: str,
    uploaded_by: str,
) -> ImportResult:
    """
    Parse and import one StoreHub export.

    Does NOT commit. The caller's session owns the transaction (get_db commits
    on success and rolls back on any exception), which is what makes the whole
    file atomic.

    Raises StorehubParseError if the file cannot be trusted; nothing is written.
    """
    if kind not in _KINDS:
        raise StorehubParseError(
            f"Unknown export kind {kind!r}. Expected one of {sorted(_KINDS)}."
        )

    defs = load_defs()
    spec = _KINDS[kind]
    Document = spec["document"]
    Line = spec["line"]
    line_fk = spec["line_fk"]

    # ---- parse first. Nothing is written for a file that cannot be read. ----
    parsed: ParsedFile = parse(data, kind, defs)

    # ---- resolve SKUs ------------------------------------------------------
    skus = {
        ln.sku_raw
        for doc in parsed.documents
        for ln in doc.lines
        if ln.sku_raw is not None
    }
    sku_to_product, sku_match, sku_counters = await _resolve_skus(db, skus)

    # ---- the ledger row, first, so everything can point at it --------------
    import_row = StorehubImport(
        kind=kind,
        filename=filename,
        sha256=hashlib.sha256(data).hexdigest(),
        byte_size=len(data),
        uploaded_by=uploaded_by,
        parser_version=PARSER_VERSION,
    )
    db.add(import_row)
    await db.flush()
    import_id = import_row.id

    notices = list(parsed.notices)
    counters = dict(parsed.counters)
    counters.update(sku_counters)
    counters.update(
        documents_inserted=0, documents_updated=0,
        lines_inserted=0, lines_updated=0, lines_deleted=0,
    )

    if not parsed.documents:
        # An export with a header row and nothing else. Recorded rather than
        # treated as an error: an empty window is a real answer.
        notices.append({
            "kind": "empty_export",
            "message": f"{filename} contains no documents. Nothing was imported.",
            "source": "storehub_import",
        })
        _finalise(import_row, counters, notices)
        return ImportResult(import_id, kind, filename, import_row.sha256, counters, notices)

    # ---- upsert documents --------------------------------------------------
    # ON CONFLICT updates every mutable column EXCEPT first_seen_import_id,
    # which keeps its original value by simply not appearing in the SET clause.
    # RETURNING (xmax = 0) distinguishes an insert from an update, so the ledger
    # can report both without a second query.
    doc_values = [_document_values(d, kind, import_id) for d in parsed.documents]
    mutable = [c for c in doc_values[0] if c not in ("external_id", "first_seen_import_id")]

    stmt = pg_insert(Document).values(doc_values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Document.external_id],
        set_={c: stmt.excluded[c] for c in mutable},
    ).returning(
        Document.id,
        Document.external_id,
        # xmax is a Postgres system column and has no mapped attribute. On a row
        # this statement INSERTED it is 0; on one it UPDATED it holds the
        # updating transaction's id. It is the standard way to tell the two
        # apart in an upsert without a second round trip.
        literal_column("xmax = 0").label("was_inserted"),
    )

    doc_id_by_external: dict[str, int] = {}
    for row in (await db.execute(stmt)).all():
        doc_id_by_external[row.external_id] = row.id
        if row.was_inserted:
            counters["documents_inserted"] += 1
        else:
            counters["documents_updated"] += 1

    # ---- upsert lines ------------------------------------------------------
    line_values: list[dict] = []
    for doc in parsed.documents:
        parent_id = doc_id_by_external[doc.external_id]
        for ln in doc.lines:
            values = {
                line_fk: parent_id,
                "import_id": import_id,
                "line_no": ln.line_no,
                "product_name_raw": ln.product_name_raw,
                "name_mojibake": ln.name_mojibake,
                "sku_raw": ln.sku_raw,
                "product_id": sku_to_product.get(ln.sku_raw) if ln.sku_raw else None,
                # 'absent' when the export carried no SKU at all — a different
                # fact from a SKU that failed to match.
                "sku_match": ln.sku_match or sku_match.get(ln.sku_raw, "none"),
                "serial_no": ln.serial_no,
                "category_raw": ln.category_raw,
                "ordered_qty": ln.ordered_qty,
                "unit_cost": ln.unit_cost,
                "subtotal": ln.subtotal,
                "subtotal_consistent": ln.subtotal_consistent,
            }
            if kind == "purchase_orders":
                values["received_qty"] = ln.received_qty
                values["received_differs_from_ordered"] = ln.received_differs_from_ordered
            line_values.append(values)

    if line_values:
        line_mutable = [c for c in line_values[0] if c not in (line_fk, "line_no")]
        lstmt = pg_insert(Line).values(line_values)
        lstmt = lstmt.on_conflict_do_update(
            index_elements=[getattr(Line, line_fk), Line.line_no],
            set_={c: lstmt.excluded[c] for c in line_mutable},
        ).returning(literal_column("xmax = 0").label("was_inserted"))

        for row in (await db.execute(lstmt)).all():
            if row.was_inserted:
                counters["lines_inserted"] += 1
            else:
                counters["lines_updated"] += 1

    # ---- converge: drop lines this file no longer contains -----------------
    # Every line the file DOES contain was just written with this import_id, so
    # the leftovers are exactly the ones it dropped. Scoped to the documents in
    # this file — a document outside the export's window keeps its lines.
    doc_ids = list(doc_id_by_external.values())
    deleted = await db.execute(
        delete(Line).where(
            getattr(Line, line_fk).in_(doc_ids),
            Line.import_id != import_id,
        )
    )
    counters["lines_deleted"] = deleted.rowcount or 0

    if counters["lines_deleted"]:
        notices.append({
            "kind": "lines_removed_on_reimport",
            "message": (
                f"{counters['lines_deleted']} line(s) were removed because the "
                f"documents in this file no longer list them. A re-import "
                f"converges on the file rather than accumulating."
            ),
            "source": "metrics.yaml: storehub.idempotency.delete_missing_lines",
        })

    if sku_counters["unmatched_skus"] or sku_counters["ambiguous_skus"]:
        notices.append({
            "kind": "unresolved_skus",
            "message": (
                f"{sku_counters['unmatched_skus']} SKU(s) matched no product and "
                f"{sku_counters['ambiguous_skus']} matched more than one. Those "
                f"lines import with no product link. Matching is case-sensitive "
                f"because TKY28 and Tky28 are different products; an ambiguous "
                f"SKU is never resolved by picking one of the matches."
            ),
            "source": "metrics.yaml: products.sku.import_match",
        })

    _finalise(import_row, counters, notices)
    return ImportResult(import_id, kind, filename, import_row.sha256, counters, notices)


def _finalise(import_row: StorehubImport, counters: dict, notices: list[dict]) -> None:
    """Copy the counters onto the ledger row. Unknown keys are ignored."""
    for name in (
        "documents_seen", "lines_seen",
        "documents_inserted", "documents_updated",
        "lines_inserted", "lines_updated", "lines_deleted",
        "unresolved_locations", "unmatched_skus", "ambiguous_skus",
        "subtotal_mismatches", "header_total_mismatches", "mojibake_names",
    ):
        if name in counters:
            setattr(import_row, name, counters[name])
    import_row.notices = notices or None
