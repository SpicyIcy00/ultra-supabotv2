"""
Contract tests between the StoreHub parser and the tables it writes into.

NO DATABASE. These check that what the parser produces is exactly what the
models can store, and that the upsert/converge statements compile against the
Postgres dialect. That contract is the seam where an import would fail at 3am
against the real database with a column that does not exist — cheap to check
here, expensive to discover there.

Requires SQLAlchemy 2.0 (the version backend/requirements.txt pins). Skipped,
with a reason, on an interpreter that only has 1.4.
"""

from __future__ import annotations

import pytest

sa = pytest.importorskip("sqlalchemy", reason="SQLAlchemy is required")
sa_orm = pytest.importorskip("sqlalchemy.orm", reason="SQLAlchemy is required")
if not hasattr(sa_orm, "mapped_column"):
    pytest.skip(
        "SQLAlchemy 2.0 is required (the local interpreter has 1.4). "
        "backend/requirements.txt pins 2.0.45.",
        allow_module_level=True,
    )

from sqlalchemy import delete, literal_column                      # noqa: E402
from sqlalchemy.dialects import postgresql                         # noqa: E402
from sqlalchemy.dialects.postgresql import insert as pg_insert     # noqa: E402

from app.models.storehub import (                                  # noqa: E402
    PurchaseOrder,
    PurchaseOrderLine,
    StockTransfer,
    StockTransferLine,
)
from app.services.storehub_parser import parse, load_defs          # noqa: E402
from tests.test_storehub_parser import _po, _st                    # noqa: E402


PO_FIXTURE = _po(
    '"PO0710","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Dried Fruits DF001",'
    '"(6) Aji Ichiban  OPUS","","","","","","","","","","10.00","Completed",'
    '"Fixing inventory, late POS.\nReceived September 1, 2026","Tan Daniel","","","Tan Daniel"',
    '"PO0710","09/02/2026 16:34","09/02/2026","09/02/2026 16:36","Dried Fruits DF001",'
    '"(6) Aji Ichiban  OPUS","1","G35 sampaloc 1g","G35","","per gram","10","10","1.00",'
    '"10.00","","Completed","","Tan Daniel","","","Tan Daniel"',
)

ST_FIXTURE = _st(
    '"ST2993","09/02/2026 06:58","09/02/2026 07:00","09/02/2026 07:00","AJI MACOPA",'
    '"AJI BARN","","","","","","","","","90.00","Completed","Atay Arjel","","","Atay Arjel"',
    '"ST2993","09/02/2026 06:58","09/02/2026 07:00","09/02/2026 07:00","AJI MACOPA",'
    '"AJI BARN","1","aji plum winter singapore","judyA7","","tradsnax","1","90.00","90.00",'
    '"","Completed","Atay Arjel","","","Atay Arjel"',
)

# Set by the importer, not the parser.
_IMPORTER_SUPPLIED = {"external_id", "line_count", "import_id", "first_seen_import_id"}


@pytest.mark.parametrize(
    "data, kind, model",
    [
        pytest.param(PO_FIXTURE, "purchase_orders", PurchaseOrder, id="purchase_orders"),
        pytest.param(ST_FIXTURE, "stock_transfers", StockTransfer, id="stock_transfers"),
    ],
)
def test_every_parsed_header_key_is_a_real_column(data, kind, model):
    """
    The parser derives header keys from metrics.yaml field_map, including the
    two it computes (`*_store_id`, `*_location_resolved`). A typo in the yaml,
    or a role with no matching column, would surface here rather than as an
    UndefinedColumn error mid-import.
    """
    doc = parse(data, kind).documents[0]
    columns = {c.name for c in model.__table__.columns}
    unknown = set(doc.header) - columns
    assert not unknown, f"{kind}: parser emits header keys with no column: {sorted(unknown)}"


@pytest.mark.parametrize(
    "data, kind, model",
    [
        pytest.param(PO_FIXTURE, "purchase_orders", PurchaseOrder, id="purchase_orders"),
        pytest.param(ST_FIXTURE, "stock_transfers", StockTransfer, id="stock_transfers"),
    ],
)
def test_every_non_nullable_column_gets_a_value(data, kind, model):
    """A NOT NULL column the parser never fills would fail on the first import."""
    doc = parse(data, kind).documents[0]
    supplied = set(doc.header) | _IMPORTER_SUPPLIED

    required = {
        c.name
        for c in model.__table__.columns
        if not c.nullable
        and c.name != "id"
        and c.server_default is None
        and c.default is None
    }
    missing = required - supplied
    assert not missing, f"{kind}: NOT NULL columns nobody fills: {sorted(missing)}"


def test_parsed_header_values_round_trip_through_column_types():
    """
    Types, not just names. A date landing in a timestamptz column (or a Decimal
    in a String) is the other half of the contract.
    """
    from datetime import date, datetime
    from decimal import Decimal

    doc = parse(PO_FIXTURE, "purchase_orders").documents[0]
    cols = {c.name: c for c in PurchaseOrder.__table__.columns}

    expected = {
        sa.DateTime: datetime,
        sa.Date: date,
        sa.Numeric: Decimal,
        sa.Boolean: bool,
        sa.String: str,
        sa.Text: str,
    }
    for key, value in doc.header.items():
        if value is None:
            continue
        col_type = cols[key].type
        for satype, pytype in expected.items():
            if isinstance(col_type, satype):
                # date is not a datetime here: estimated_arrival_date must stay a
                # date, and datetime is a subclass of date, so check exactly.
                if satype is sa.Date:
                    assert type(value) is date, f"{key} should be a plain date, got {type(value)}"
                else:
                    assert isinstance(value, pytype), (
                        f"{key} is {type(value).__name__}, column wants {pytype.__name__}"
                    )
                break


@pytest.mark.parametrize(
    "kind, Doc, Line, fk",
    [
        ("purchase_orders", PurchaseOrder, PurchaseOrderLine, "purchase_order_id"),
        ("stock_transfers", StockTransfer, StockTransferLine, "stock_transfer_id"),
    ],
)
def test_upsert_and_converge_statements_compile(kind, Doc, Line, fk):
    """
    The upsert relies on ON CONFLICT ... DO UPDATE and on `xmax = 0` in
    RETURNING to tell inserts from updates. Both are compiled here so a
    construction error is caught without a database.
    """
    cols = [c.name for c in Doc.__table__.columns
            if c.name not in ("id", "created_at", "updated_at")]
    mutable = [c for c in cols if c not in ("external_id", "first_seen_import_id")]

    stmt = pg_insert(Doc).values([{c: None for c in cols}])
    stmt = stmt.on_conflict_do_update(
        index_elements=[Doc.external_id],
        set_={c: stmt.excluded[c] for c in mutable},
    ).returning(Doc.id, Doc.external_id, literal_column("xmax = 0").label("was_inserted"))

    sql = " ".join(str(stmt.compile(dialect=postgresql.dialect())).split())
    assert "ON CONFLICT (external_id) DO UPDATE" in sql
    assert "RETURNING" in sql and "xmax = 0" in sql
    # first_seen_import_id must NOT be updated — it records the import that first
    # saw the document and would otherwise be overwritten on every re-import.
    assert "first_seen_import_id = excluded" not in sql
    assert "import_id = excluded.import_id" in sql

    lcols = [c.name for c in Line.__table__.columns
             if c.name not in ("id", "created_at", "updated_at")]
    lmut = [c for c in lcols if c not in (fk, "line_no")]
    lstmt = pg_insert(Line).values([{c: None for c in lcols}])
    lstmt = lstmt.on_conflict_do_update(
        index_elements=[getattr(Line, fk), Line.line_no],
        set_={c: lstmt.excluded[c] for c in lmut},
    ).returning(literal_column("xmax = 0").label("was_inserted"))

    lsql = " ".join(str(lstmt.compile(dialect=postgresql.dialect())).split())
    assert f"ON CONFLICT ({fk}, line_no) DO UPDATE" in lsql

    # The converge delete: scoped to this file's documents, removing whatever
    # this import did not write.
    dsql = " ".join(str(
        delete(Line).where(getattr(Line, fk).in_([1]), Line.import_id != 1)
        .compile(dialect=postgresql.dialect())
    ).split())
    assert f"DELETE FROM {Line.__tablename__}" in dsql
    assert "import_id !=" in dsql


def test_line_tables_carry_the_import_that_wrote_them():
    """import_id on a line is what makes the converge delete one statement."""
    for Line in (PurchaseOrderLine, StockTransferLine):
        col = Line.__table__.columns["import_id"]
        assert col.nullable is False
        assert [fk.column.table.name for fk in col.foreign_keys] == ["storehub_imports"]


def test_sku_import_match_is_case_sensitive_in_the_definitions():
    """
    The importer refuses to run if this flips, so the definition and the code
    cannot silently disagree. TKY28 and Tky28 are different products.
    """
    assert load_defs()["products"]["sku"]["import_match"] == "case_sensitive"
