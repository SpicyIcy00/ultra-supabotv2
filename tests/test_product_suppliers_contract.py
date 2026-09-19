"""
Who supplies a product, and what level somebody set — as get_product returns it.

NO DATABASE. The two queries are constants and the shaping is pure, so both are
checked here against a cursor that answers with known rows. What this cannot
check is that Postgres likes the SQL; `tests/test_storehub_import_contract.py`
compiles the write side, and the read side is two SELECTs over tables whose
columns are asserted below against the models.

WHY THIS FILE EXISTS AT ALL. The owner asked, on 2026-09-19, whether Bob knew
about the two tables the products import had just filled. He did not, twice
over: his role had no grant, and no tool read them. The grant is a fact about
the database and cannot live in a test. This is the other half.

THE THING MOST WORTH HOLDING is not the join. It is that there are TWO answers
to "who supplies this" in this repository and they answer different questions:

    product_suppliers                 who StoreHub RECORDS as supplying it
    definitions/product_suppliers.yaml  who we have BOUGHT it from, inferred

They will disagree. Nothing here may blend them, and every result that carries
one has to say which it is.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from tools.products import (
    _LEVELS_SQL,
    _SUPPLIERS_SQL,
    _SUPPLIER_SOURCE_SQL,
    _attach_supplier_facts,
)
from app.services.storehub_parser import load_defs


class _Cursor:
    """Answers the three statements the attach makes, in the order it makes them."""

    def __init__(self, suppliers, levels, wrote=None):
        self._answers = [suppliers, levels]
        self._wrote = wrote
        self.executed: list[tuple[str, dict]] = []
        self._rows: list = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params or {}))
        if sql is _SUPPLIER_SOURCE_SQL:
            self._rows = []
            return
        self._rows = self._answers.pop(0)

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._wrote


ROCKWELL = "6639efd54694700008d7ccc6"
MAGNOLIA = "67612230a740d90007464e26"

SH1 = "663c7869391c7c00079595a8"
SH1206 = "663c78bc391c7c000795d792"
ITEM1 = "68d163cef5f50c00075b6c12"


def _rows(*ids):
    return [{"id": i, "sku": i[:4], "name": i[:4]} for i in ids]


def _supplier(product_id, name, position):
    return {"product_id": product_id, "supplier_name": name, "position": position}


def _level(product_id, store_id, store, warning, ideal):
    return {"product_id": product_id, "store_id": store_id, "store": store,
            "warning_level": warning, "ideal_level": ideal}


WROTE = {
    "id": 18,
    "filename": "Products_FROM-ajiichiban_09192026_1109_242054892.csv",
    "uploaded_at": None,
    "uploaded_by": "admin",
}


# ---------------------------------------------------------------------------
# The queries themselves
# ---------------------------------------------------------------------------

def test_both_queries_are_vetted_constants_with_one_bound_parameter():
    """CLAUDE.md rule 1: no model-generated SQL, no string-built queries."""
    for sql in (_SUPPLIERS_SQL, _LEVELS_SQL):
        assert "%(ids)s" in sql
        assert sql.count("%(") == 1, "one bound parameter, and it is the id list"
        # Nothing is interpolated: no f-string markers survive into the text.
        assert "{" not in sql and "}" not in sql
    assert "%(" not in _SUPPLIER_SOURCE_SQL


def test_the_supplier_list_keeps_the_export_order():
    assert "ORDER BY ps.product_id, ps.position" in _SUPPLIERS_SQL
    spec = load_defs()["products"]["suppliers"]
    assert spec["order_by"] == "position"


def test_a_level_is_read_against_a_named_store():
    # Joined to `stores`, so a level arrives with the shop's NAME and not only
    # an id nobody can read.
    assert "JOIN stores s ON s.id = l.store_id" in _LEVELS_SQL
    assert "s.name AS store" in _LEVELS_SQL


# ---------------------------------------------------------------------------
# What lands on a row
# ---------------------------------------------------------------------------

def test_suppliers_and_levels_land_on_the_right_products():
    rows = _rows(SH1, SH1206, ITEM1)
    cur = _Cursor(
        suppliers=[
            _supplier(SH1, "Chris Cheng CHC001", 1),
            _supplier(SH1, "GZ Cri GZ001", 2),
            _supplier(SH1206, "Kai Fat KAF001", 1),
        ],
        levels=[_level(SH1206, MAGNOLIA, "(5) Ajiichiban food products Magnolia",
                       Decimal("10"), Decimal("25"))],
        wrote=WROTE,
    )
    meta, notices = _attach_supplier_facts(cur, rows, load_defs())

    by_id = {r["id"]: r for r in rows}
    assert by_id[SH1]["suppliers"] == ["Chris Cheng CHC001", "GZ Cri GZ001"]
    assert by_id[SH1206]["suppliers"] == ["Kai Fat KAF001"]
    # A product StoreHub has no supplier for gets an EMPTY list, never a
    # missing key: a key that is sometimes absent is a key nobody checks.
    assert by_id[ITEM1]["suppliers"] == []
    assert by_id[ITEM1]["stock_levels"] == []

    assert by_id[SH1206]["stock_levels"] == [{
        "store_id": MAGNOLIA,
        "store": "(5) Ajiichiban food products Magnolia",
        "warning_level": 10.0,
        "ideal_level": 25.0,
    }]

    facts = meta["supplier_facts"]
    assert facts["attached"] is True
    assert facts["products_with_a_supplier"] == 2
    assert facts["products_with_a_stock_level"] == 1
    assert facts["last_written_by_import"]["import_id"] == 18
    assert notices, "one product here has no supplier; that is said once"


def test_half_a_level_stays_half_and_zero_stays_zero():
    """
    NULL means nobody set that half. 0 means somebody set zero. The two must
    not collapse, which is the same rule received_quantity.blank_is_zero
    carries on the document side.
    """
    rows = _rows(SH1)
    cur = _Cursor(
        suppliers=[_supplier(SH1, "GZ Cri GZ001", 1)],
        levels=[_level(SH1, ROCKWELL, "(1) Aji Ichiban Food Products",
                       Decimal("0"), None)],
        wrote=WROTE,
    )
    _attach_supplier_facts(cur, rows, load_defs())
    level = rows[0]["stock_levels"][0]
    assert level["warning_level"] == 0.0
    assert level["ideal_level"] is None


def test_a_wide_result_says_it_did_not_look_rather_than_saying_none():
    """
    Over the bound the lists are NOT read, and null says so. An empty list
    there would be the tool asserting "this product has no supplier" about a
    question it never asked.
    """
    defs = load_defs()
    bound = int(defs["products"]["suppliers"]["attach_when_rows_at_most"])
    rows = _rows(*[f"{i:024d}" for i in range(bound + 1)])
    cur = _Cursor(suppliers=[], levels=[], wrote=WROTE)

    meta, notices = _attach_supplier_facts(cur, rows, defs)

    assert cur.executed == [], "nothing was read at all"
    assert meta["supplier_facts"]["attached"] is False
    assert all(r["suppliers"] is None and r["stock_levels"] is None for r in rows)
    assert "NOT READ" in meta["supplier_facts"]["reason"]
    assert notices == []


def test_no_products_reads_nothing():
    meta, notices = _attach_supplier_facts(_Cursor([], []), [], load_defs())
    assert meta == {} and notices == []


# ---------------------------------------------------------------------------
# The two answers to one question
# ---------------------------------------------------------------------------

def test_every_attached_result_names_which_supplier_answer_it_is():
    rows = _rows(SH1)
    cur = _Cursor(suppliers=[_supplier(SH1, "Seikyo SEK001", 1)], levels=[], wrote=WROTE)
    facts = _attach_supplier_facts(cur, rows, load_defs())[0]["supplier_facts"]

    # The inferred map is named by path, so a reader cannot confuse the two.
    assert "definitions/product_suppliers.yaml" in facts["not_the_same_as"]
    assert "purchase history" in facts["not_the_same_as"]
    # And a level is never offered as on-hand.
    assert "get_stock" in facts["stock_level_is_not_on_hand"]
    assert facts["names_are_raw"]


def test_the_definitions_keep_the_two_supplier_sources_apart():
    defs = load_defs()
    spec = defs["products"]["suppliers"]
    assert spec["source_table"] == "product_suppliers"
    assert spec["normalised"] is False
    # The purchase plan still uses the inferred map; this one has not replaced
    # it, because which wins is a decision nobody has made.
    assert defs["purchasing"]["plan"]["supplier_link"]["map_file"] \
        == "definitions/product_suppliers.yaml"


def test_a_level_is_never_described_as_what_is_on_hand():
    spec = load_defs()["products"]["stock_levels"]
    assert spec["is_not_on_hand"] is True
    assert spec["blank_is_zero"] is False
    assert spec["per"] == "store"


def test_a_result_with_no_supplier_anywhere_says_so_once():
    rows = _rows(SH1, SH1206)
    cur = _Cursor(suppliers=[], levels=[], wrote=WROTE)
    _, notices = _attach_supplier_facts(cur, rows, load_defs())
    assert len(notices) == 1
    assert notices[0]["kind"] == "supplier_coverage"
    assert "2 of 2" in notices[0]["message"]
    # And it warns against answering from the other source instead.
    assert "product_suppliers.yaml" in notices[0]["guidance"]


def test_the_docstring_tells_the_model_both_facts_and_both_traps():
    """
    The tool schema the model sees IS this docstring (agent/loop.py parses it).
    A field the docstring does not mention is a field Bob does not know he has.
    """
    from tools.products import get_product
    doc = get_product.__doc__ or ""
    assert "suppliers" in doc and "stock_levels" in doc
    assert "get_stock" in doc, "a level is not on hand, and the model is told so"
    assert "never blend" in doc
    assert "NOT READ" in doc


@pytest.mark.parametrize("column", ["product_id", "supplier_name", "position"])
def test_the_supplier_query_reads_columns_the_model_declares(column):
    from app.models.storehub import ProductSupplier
    assert column in {c.name for c in ProductSupplier.__table__.columns}
    assert column in _SUPPLIERS_SQL


@pytest.mark.parametrize("column", ["product_id", "store_id", "warning_level", "ideal_level"])
def test_the_level_query_reads_columns_the_model_declares(column):
    from app.models.storehub import ProductStockLevel
    assert column in {c.name for c in ProductStockLevel.__table__.columns}
    assert column in _LEVELS_SQL
