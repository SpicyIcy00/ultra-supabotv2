"""
StoreHub CSV importer — writes parsed documents into the database.

Parsing lives in storehub_parser (pure, no database). This module does the four
things that need one: resolve SKUs against the product catalog, upsert the
documents and their lines, converge the lines to the file, and record the import
in the ledger.

RUNS ON THE APPLICATION'S ROLE, not Bob's. Bob's read-only role
(tools/_common.connect) cannot write and is never used here. Bob READS these
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
    ProductStockLevel,
    ProductSupplier,
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
    parse_products,
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


# The products export is not a document kind: one row is one product, there are
# no lines, and the import writes only the two facts nothing else in the
# database holds. It gets its own path below rather than a fourth entry here.
PRODUCTS_KIND = "products"


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


# Postgres's wire protocol carries the bind-parameter count in an int16, so a
# single statement can pass at most 32,767 of them. A multi-row INSERT spends
# one per column per row, so the real cap is a ROW count that depends on how
# wide the table is: 14,024 transfer lines x 14 columns is 196,336 parameters
# and fails outright with "the number of query arguments cannot exceed 32767".
#
# This only shows up at real volume. The fixture-sized tests never approached it.
_MAX_BIND_PARAMS = 32767
_BIND_HEADROOM = 128        # leaves room for the WHERE/ON CONFLICT parameters


def _chunk(rows: list[dict], columns: int) -> list[list[dict]]:
    """Split rows so no single statement exceeds the bind-parameter limit."""
    per_statement = max(1, (_MAX_BIND_PARAMS - _BIND_HEADROOM) // max(1, columns))
    return [rows[i:i + per_statement] for i in range(0, len(rows), per_statement)]


def _normalise(rows: list[dict]) -> list[dict]:
    """
    Give every row the same keys, filling absentees with None.

    A multi-row `INSERT ... VALUES` compiles one statement for the whole batch,
    so a key present on some rows and missing on others fails at compile time
    with "explicitly rendered as a boundparameter in the VALUES clause". That is
    a confusing error a long way from its cause.

    It happened for real: documents with no line rows skipped the branch that
    sets header_total_reconciles, and ~20 such documents exist in a single
    export. The parser now always sets it, and this makes the whole class of
    fault impossible rather than relying on every future field remembering.
    """
    if not rows:
        return rows
    keys: dict[str, None] = {}
    for r in rows:
        keys.update(dict.fromkeys(r))
    return [{k: r.get(k) for k in keys} for r in rows]


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
    if kind == PRODUCTS_KIND:
        return await _import_products(
            db, data=data, filename=filename, uploaded_by=uploaded_by
        )

    if kind not in _KINDS:
        raise StorehubParseError(
            f"Unknown export kind {kind!r}. Expected one of "
            f"{sorted([*_KINDS, PRODUCTS_KIND])}."
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
    doc_values = _normalise([_document_values(d, kind, import_id) for d in parsed.documents])
    mutable = [c for c in doc_values[0] if c not in ("external_id", "first_seen_import_id")]

    doc_id_by_external: dict[str, int] = {}
    for batch in _chunk(doc_values, len(doc_values[0])):
        stmt = pg_insert(Document).values(batch)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Document.external_id],
            set_={c: stmt.excluded[c] for c in mutable},
        ).returning(
            Document.id,
            Document.external_id,
            # xmax is a Postgres system column and has no mapped attribute. On a
            # row this statement INSERTED it is 0; on one it UPDATED it holds the
            # updating transaction's id. It is the standard way to tell the two
            # apart in an upsert without a second round trip.
            literal_column("xmax = 0").label("was_inserted"),
        )
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
        line_values = _normalise(line_values)
        line_mutable = [c for c in line_values[0] if c not in (line_fk, "line_no")]
        for batch in _chunk(line_values, len(line_values[0])):
            lstmt = pg_insert(Line).values(batch)
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
    # The flat columns were named for documents and lines. Products have
    # neither, so every import also records its whole counter dict and the
    # surface renders that when it is there.
    import_row.counters = counters or None
    import_row.notices = notices or None


# ---------------------------------------------------------------------------
# Products
#
# A DIFFERENT SHAPE AND A DIFFERENT JOB. The two document exports carry orders
# with lines. The products export carries the catalogue, and almost all of it
# already belongs to the nightly job that fills `products`. This import takes
# the two things that job does not carry — who supplies a product, and the
# warning / ideal stock level somebody set for it at a store — and writes
# NOTHING to `products` itself. One writer per column, which is the rule the
# whole design rests on (metrics.yaml storehub.products).
#
# A PRODUCT IS NEVER CREATED HERE. A Product Id in the export with no row in
# `products` is counted and said, exactly as an unresolved store is. Creating
# the row would mean inventing a name, a category and a price from an export
# whose price columns are already known to be wrong for unit-priced items.
# ---------------------------------------------------------------------------


async def _known_products(db: AsyncSession, product_ids: set[str]) -> set[str]:
    """Which of the export's Product Ids have a row in `products`."""
    if not product_ids:
        return set()
    known: set[str] = set()
    ids = sorted(product_ids)
    # One bind parameter per id, so the IN list is chunked like everything else.
    step = _MAX_BIND_PARAMS - _BIND_HEADROOM
    for i in range(0, len(ids), step):
        rows = await db.execute(
            select(Product.id).where(Product.id.in_(ids[i:i + step]))
        )
        known.update(r[0] for r in rows)
    return known


async def _upsert_and_converge(
    db: AsyncSession,
    *,
    model,
    rows: list[dict],
    key: list,
    scope_ids: list[str],
    import_id: int,
    counters: dict,
    inserted_key: str,
    updated_key: str,
    deleted_key: str,
) -> None:
    """
    Upsert `rows` on `key`, then delete the rows of the same products this
    import did not write.

    The converge scope is the products PRESENT IN THE FILE, never the whole
    table: a product the export does not mention keeps what it has, by the same
    rule that leaves documents outside an export's window alone. Within that
    scope the file is the truth — a supplier removed in StoreHub disappears
    here, which is the only way "who supplies this" can ever be right.
    """
    if rows:
        rows = _normalise(rows)
        key_names = {c.name for c in key}
        mutable = [
            c for c in rows[0]
            if c not in key_names and c != "first_seen_import_id"
        ]
        for batch in _chunk(rows, len(rows[0])):
            stmt = pg_insert(model).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=key,
                set_={c: stmt.excluded[c] for c in mutable},
            ).returning(literal_column("xmax = 0").label("was_inserted"))
            for row in (await db.execute(stmt)).all():
                counters[inserted_key if row.was_inserted else updated_key] += 1

    if scope_ids:
        step = _MAX_BIND_PARAMS - _BIND_HEADROOM
        for i in range(0, len(scope_ids), step):
            result = await db.execute(
                delete(model).where(
                    model.product_id.in_(scope_ids[i:i + step]),
                    model.import_id != import_id,
                )
            )
            counters[deleted_key] += result.rowcount or 0


async def _import_products(
    db: AsyncSession,
    *,
    data: bytes,
    filename: str,
    uploaded_by: str,
) -> ImportResult:
    """Import one StoreHub products export. Called by import_file."""
    defs = load_defs()
    parsed = parse_products(data, defs)

    ids = {p.product_id for p in parsed.products}
    known = await _known_products(db, ids)

    import_row = StorehubImport(
        kind=PRODUCTS_KIND,
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
    counters.update(
        products_matched=len(known),
        unknown_products=len(ids - known),
        suppliers_inserted=0, suppliers_updated=0, suppliers_deleted=0,
        stock_levels_inserted=0, stock_levels_updated=0, stock_levels_deleted=0,
    )

    if not parsed.products:
        notices.append({
            "kind": "empty_export",
            "message": f"{filename} contains no products. Nothing was imported.",
            "source": "storehub_import",
        })
        _finalise(import_row, counters, notices)
        return ImportResult(
            import_id, PRODUCTS_KIND, filename, import_row.sha256, counters, notices
        )

    supplier_rows: list[dict] = []
    level_rows: list[dict] = []
    for product in parsed.products:
        if product.product_id not in known:
            continue
        for position, name in enumerate(product.suppliers, start=1):
            supplier_rows.append({
                "product_id": product.product_id,
                "supplier_name": name,
                "position": position,
                "import_id": import_id,
                "first_seen_import_id": import_id,
            })
        for level in product.levels:
            level_rows.append({
                "product_id": product.product_id,
                "store_id": level.store_id,
                "warning_level": level.warning_level,
                "ideal_level": level.ideal_level,
                "import_id": import_id,
                "first_seen_import_id": import_id,
            })

    scope_ids = sorted(ids & known)

    await _upsert_and_converge(
        db, model=ProductSupplier, rows=supplier_rows,
        key=[ProductSupplier.product_id, ProductSupplier.supplier_name],
        scope_ids=scope_ids, import_id=import_id, counters=counters,
        inserted_key="suppliers_inserted", updated_key="suppliers_updated",
        deleted_key="suppliers_deleted",
    )
    await _upsert_and_converge(
        db, model=ProductStockLevel, rows=level_rows,
        key=[ProductStockLevel.product_id, ProductStockLevel.store_id],
        scope_ids=scope_ids, import_id=import_id, counters=counters,
        inserted_key="stock_levels_inserted", updated_key="stock_levels_updated",
        deleted_key="stock_levels_deleted",
    )

    if counters["unknown_products"]:
        notices.append({
            "kind": "unknown_products",
            "message": (
                f"{counters['unknown_products']} product(s) in the file have no "
                f"row in the catalogue, so their suppliers and stock levels were "
                f"not imported. Products are filled by the nightly job; this "
                f"import never creates one."
            ),
            "source": "metrics.yaml: storehub.products.unknown_product",
        })

    if counters["suppliers_deleted"] or counters["stock_levels_deleted"]:
        notices.append({
            "kind": "links_removed_on_reimport",
            "message": (
                f"{counters['suppliers_deleted']} supplier link(s) and "
                f"{counters['stock_levels_deleted']} stock level(s) were removed "
                f"because this export no longer lists them. A re-import converges "
                f"on the file rather than accumulating."
            ),
            "source": "metrics.yaml: storehub.products.idempotency",
        })

    _finalise(import_row, counters, notices)
    return ImportResult(
        import_id, PRODUCTS_KIND, filename, import_row.sha256, counters, notices
    )
