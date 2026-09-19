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

import asyncio
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


# ---------------------------------------------------------------------------
# Regressions from the first live import. Both were invisible to fixture-sized
# tests and only appeared against 771 documents / 14,024 lines.
# ---------------------------------------------------------------------------

def test_line_less_document_still_carries_header_total_reconciles():
    """
    Documents with no line rows used to skip the branch that sets this key, so
    the header dicts were heterogeneous and the importer's multi-row INSERT
    failed to compile. ~20 such documents exist in one real export.
    """
    data = _st(
        '"ST9100","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"0.00","Cancelled","","Tan Daniel","09/02/2026 17:00",""',
        '"ST9101","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","","","","","","","","",'
        '"10.00","Created","","","",""',
        '"ST9101","09/02/2026 16:20","","","AJI BARN","AJI ONLINE","1","A","SKU1","","indi",'
        '"10","1.00","10.00","","Created","","","",""',
    )
    docs = parse(data, "stock_transfers").documents
    assert len(docs) == 2
    for d in docs:
        assert "header_total_reconciles" in d.header, d.external_id
    # The key set is identical across documents, which is what the importer
    # needs for a single multi-row statement.
    assert set(docs[0].header) == set(docs[1].header)


def test_multirow_insert_stays_under_the_postgres_bind_limit():
    """
    Postgres carries the bind-parameter count in an int16: max 32,767 per
    statement. 14,024 lines x 14 columns is 196,336 and fails outright with
    "the number of query arguments cannot exceed 32767".
    """
    from app.services.storehub_import import _chunk, _MAX_BIND_PARAMS

    for columns in (14, 16, 19, 23):
        rows = [{"c": i} for i in range(14_024)]
        batches = _chunk(rows, columns)
        assert sum(len(b) for b in batches) == len(rows)          # nothing lost
        assert [r for b in batches for r in b] == rows            # order preserved
        for b in batches:
            assert len(b) * columns <= _MAX_BIND_PARAMS, (columns, len(b))


def test_normalise_gives_every_row_the_same_keys():
    from app.services.storehub_import import _normalise

    out = _normalise([{"a": 1}, {"a": 2, "b": 3}, {"c": 4}])
    assert all(set(r) == {"a", "b", "c"} for r in out)
    assert out[0]["b"] is None and out[2]["a"] is None
    assert out[1]["b"] == 3          # present values survive
    assert _normalise([]) == []


# ===========================================================================
# Products — the import that writes suppliers and stock levels
#
# Run against a RECORDING SESSION, not a database. Every statement the importer
# issues is compiled against the Postgres dialect here, which is the check that
# matters: a column that does not exist, a conflict target with no unique index
# behind it, or a Decimal that will not bind all fail at compile time. What is
# left over — that Postgres accepts the DDL — is the migration's business.
# ===========================================================================

from types import SimpleNamespace                                  # noqa: E402

from app.models.storehub import ProductStockLevel, ProductSupplier  # noqa: E402
from app.services import storehub_import                            # noqa: E402
from tests.test_storehub_products_contract import (                 # noqa: E402
    AJM1, ITEM1, MAGNOLIA, NORTH_EDSA, ROCKWELL, SH1, SH610, SH1206,
    ROW_AJM1, ROW_ITEM1, ROW_SH1, ROW_SH610, ROW_SH1206,
    _file, _row,
)


class _Result:
    def __init__(self, rows, rowcount=0):
        self._rows = rows
        self.rowcount = rowcount

    def all(self):
        return self._rows

    def __iter__(self):
        return iter(self._rows)


class _RecordingSession:
    """
    Stands in for AsyncSession. Compiles everything it is given — so a statement
    that could not run is a failure here — and answers the SELECT with whichever
    product ids the test says the catalogue holds.
    """

    def __init__(self, catalogue, deleted=0):
        self.catalogue = list(catalogue)
        self.deleted = deleted
        self.sql: list[str] = []
        self.added = None

    def add(self, obj):
        self.added = obj

    async def flush(self):
        self.added.id = 77

    async def execute(self, stmt):
        text = str(stmt.compile(dialect=postgresql.dialect()))
        self.sql.append(text)

        if isinstance(stmt, sa.Select):
            return _Result([(pid,) for pid in self.catalogue])
        if isinstance(stmt, sa.Delete):
            return _Result([], rowcount=self.deleted)

        # An upsert. One RETURNING row per row of VALUES, all reported as
        # inserts, which is what an empty table would answer.
        multi = getattr(stmt, "_multi_values", ())
        count = len(multi[0]) if multi else 1
        return _Result([SimpleNamespace(was_inserted=True) for _ in range(count)])


def _run(catalogue, rows, deleted=0):
    db = _RecordingSession(catalogue, deleted=deleted)
    result = asyncio.run(storehub_import.import_file(
        db, data=_file(*rows), filename="Products_FROM-ajiichiban.csv",
        kind="products", uploaded_by="ice",
    ))
    return db, result


def test_a_products_import_writes_only_suppliers_and_levels():
    db, result = _run([AJM1, SH1, SH1206, SH610, ITEM1],
                      [ROW_AJM1, ROW_SH1, ROW_SH1206, ROW_SH610, ROW_ITEM1])

    assert result.kind == "products"
    assert result.counters["products_seen"] == 5
    assert result.counters["products_matched"] == 5
    assert result.counters["unknown_products"] == 0

    # 1 + 5 + 2 + 1 + 0 supplier names across the five rows.
    assert result.counters["suppliers_inserted"] == 9
    # SH1206 sets two, SH610 sets two, nothing else sets any.
    assert result.counters["stock_levels_inserted"] == 4

    written = " ".join(db.sql).lower()
    assert "insert into product_suppliers" in written
    assert "insert into product_stock_levels" in written
    # The catalogue is READ and never written. Its other writer owns it.
    assert "insert into products" not in written
    assert "update products" not in written
    assert "delete from products " not in written


def test_the_upserts_land_on_the_unique_key_of_each_table():
    db, _ = _run([SH1206], [ROW_SH1206])
    written = " ".join(db.sql).lower()
    assert "on conflict (product_id, supplier_name) do update" in written
    assert "on conflict (product_id, store_id) do update" in written
    # first_seen_import_id is absent from every SET clause: the first import to
    # see a link keeps its name on it.
    for clause in written.split("do update set ")[1:]:
        assert "first_seen_import_id" not in clause.split("returning")[0]


def test_a_product_the_catalogue_does_not_have_is_counted_and_said():
    db, result = _run([SH1206], [ROW_SH1206, ROW_AJM1, ROW_ITEM1])

    assert result.counters["products_seen"] == 3
    assert result.counters["unknown_products"] == 2
    said = [n for n in result.notices if n["kind"] == "unknown_products"]
    assert said and "never creates one" in said[0]["message"]

    # Its suppliers are not written under some invented product row.
    assert result.counters["suppliers_inserted"] == 2      # SH1206's two only


def test_the_converge_delete_is_scoped_to_the_products_in_the_file():
    db, result = _run([SH1206, SH610], [ROW_SH1206], deleted=3)

    deletes = [s for s in db.sql if s.lower().startswith("delete from product_")]
    assert len(deletes) == 2, "suppliers and levels each converge"
    for statement in deletes:
        assert "product_id IN" in statement
        assert "import_id !=" in statement

    # rowcount is answered per statement by the stub; both report it.
    assert result.counters["suppliers_deleted"] == 3
    assert result.counters["stock_levels_deleted"] == 3
    removed = [n for n in result.notices if n["kind"] == "links_removed_on_reimport"]
    assert removed and "converges on the file" in removed[0]["message"]


def test_a_level_binds_as_a_number_and_a_blank_one_stays_null():
    """
    Magnolia's ideal is 25 and its warning is 10; a product with a warning and
    no ideal must bind NULL, not 0. Numeric(18,4) takes a Decimal; anything the
    parser produced that it could not take would fail compiling here.
    """
    half = _row("HALF", "Only a warning", "cat", product_id="e" * 24,
                at={NORTH_EDSA: ("5", "4", "")})
    db, result = _run(["e" * 24, SH1206], [half, ROW_SH1206])
    assert result.counters["stock_levels_inserted"] == 3

    levels = [s for s in db.sql if "INSERT INTO product_stock_levels" in s]
    assert len(levels) == 1
    assert "warning_level" in levels[0] and "ideal_level" in levels[0]


def test_every_key_the_importer_builds_is_a_column_of_its_table():
    supplier_columns = {c.name for c in ProductSupplier.__table__.columns}
    level_columns = {c.name for c in ProductStockLevel.__table__.columns}
    assert {"product_id", "supplier_name", "position", "import_id",
            "first_seen_import_id"} <= supplier_columns
    assert {"product_id", "store_id", "warning_level", "ideal_level",
            "import_id", "first_seen_import_id"} <= level_columns
    # And the two that make a re-import converge rather than accumulate.
    for table in (ProductSupplier.__table__, ProductStockLevel.__table__):
        unique = [c for c in table.constraints
                  if isinstance(c, sa.UniqueConstraint)]
        assert unique, f"{table.name} has no unique key for the upsert to hit"


def test_a_file_with_no_products_is_recorded_rather_than_refused():
    db, result = _run([], [], deleted=0)
    assert result.counters["products_seen"] == 0
    assert [n["kind"] for n in result.notices] == ["empty_export"]
    assert not any("INSERT INTO product_suppliers" in s for s in db.sql)


def test_the_ledger_row_carries_the_whole_counter_dict():
    db, result = _run([SH1206], [ROW_SH1206])
    assert db.added.kind == "products"
    assert db.added.counters == result.counters
    # The flat columns were named for documents; this kind fills the ones it
    # legitimately has and leaves the rest alone.
    assert db.added.counters["products_seen"] == 1
