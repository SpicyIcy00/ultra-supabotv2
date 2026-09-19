"""
The StoreHub products export, parsed.

WHY THIS FILE IS DIFFERENT FROM test_storehub_parser.py. Purchase orders and
stock transfers are documents with lines and a fixed column list. The products
export is one row per product and its column list GROWS when a store opens:
StoreHub writes three columns per store, named after the store, between a fixed
leading block and a fixed trailing block. So the shape is the thing under test.

THE VALUES ARE REAL, THE ROWS ARE BUILT. Every SKU, product id, supplier string
and stock level below is taken from the owner's export of 2026-09-19
(Products_FROM-ajiichiban_09192026_1109_242054892.csv). The rows are assembled
by `_row` rather than pasted, because a row is 84 fields of which 57 are
positional per-store cells: a paste that drops one empty cell moves every level
after it to the wrong shop, and the test would then be asserting against a file
StoreHub never wrote.

The store names ARE typed out, because they are load-bearing: they must match
the location alias map in metrics.yaml character for character, double space
and all. A wrong one surfaces as an unresolved location, which these tests
assert does not happen.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.storehub_parser import (
    StorehubParseError,
    load_defs,
    parse_products,
)

# The 19 stores in the export, in the order StoreHub writes them, exactly as it
# writes them. "(6) Aji Ichiban  OPUS" has a double space; "Test stoee" is
# spelled that way in StoreHub.
STORES = [
    "(1) Aji Ichiban Food Products",
    "AJI MACOPA",
    "AJI CMG",
    "AJI BARN",
    "(2) Aji Ichiban food products SM Fairview",
    "AJI ONLINE",
    "(3) Ajiichiban Food Products Greenhills",
    "AJI Disposal",
    "(4) Ajiichiban Food Products SM North Edsa",
    "(5) Ajiichiban food products Magnolia",
    "Aji Packing",
    "(6) Aji Ichiban  OPUS",
    "Test stoee",
    "Hello AJI vending",
    "Ajiichiban ROBINSONS super market lucky Chinatown",
    "AJI ROBINSONS supermarket robinsons galleria",
    "AJI VENDO",
    "test store 2",
    "(7) Ajiichiban SHANG",
]

LEADING = [
    "SKU", "Parent Product SKU", "Product Name", "Category", "Price Type",
    "Unit", "Tax-Inclusive Price", "Min Price", "Max Price", "Cost",
    "Supplier Price", "Product Tags", "Inventory Type", "Track Stock Levels",
    "Barcode", "SC/PWD Discount", "Solo Parent Discount", "Variant Name 1",
    "Variant Value 1",
]
TRAILING = [
    "Supplier", "Tax Name", "Store Credits", "Kitchen Station", "Product Id",
    "Online Price", "Online Discounted Price", "Product Description",
]

WIDTH = len(LEADING) + len(STORES) * 3 + len(TRAILING)

# Shorthand for the stores a row below actually carries a figure for.
ROCKWELL = "(1) Aji Ichiban Food Products"
FAIRVIEW = "(2) Aji Ichiban food products SM Fairview"
NORTH_EDSA = "(4) Ajiichiban Food Products SM North Edsa"
MAGNOLIA = "(5) Ajiichiban food products Magnolia"
TEST_STORE = "Test stoee"


def _header(stores=None) -> str:
    """The export's header row, built the way StoreHub builds it."""
    cols = list(LEADING)
    for store in (STORES if stores is None else stores):
        cols += [
            f"{store}_Quantity",
            f"{store}_Warning Stock Level",
            f"{store}_Ideal Stock Level",
        ]
    cols += TRAILING
    return ",".join(f'"{c}"' for c in cols)


def _row(
    sku: str,
    name: str,
    category: str = "",
    *,
    product_id: str,
    supplier: str = "",
    at: dict | None = None,          # store -> (quantity, warning, ideal)
    parent: str = "",
    price_type: str = "Fixed",
    unit: str = "",
    tax_price: str = "0.00",
    cost: str = "",
    supplier_price: str = "",
    tags: str = "",
    inventory_type: str = "Simple",
    barcode: str = "",
    variant_name: str = "",
    variant_value: str = "",
    kitchen: str = "",
) -> str:
    cells = [
        sku, parent, name, category, price_type, unit, tax_price, "", "",
        cost, supplier_price, tags, inventory_type, "1", barcode, "0", "0",
        variant_name, variant_value,
    ]
    for store in STORES:
        quantity, warning, ideal = (at or {}).get(store, ("", "", ""))
        cells += [quantity, warning, ideal]
    cells += [supplier, "", "", kitchen, product_id, "", "", ""]
    assert len(cells) == WIDTH
    return ",".join(f'"{c}"' for c in cells)


def _file(*rows: str, header: str | None = None) -> bytes:
    return ("\n".join([header or _header(), *rows]) + "\n").encode("utf-8")


def _instruction_row(width: int | None = None) -> str:
    """StoreHub's row of instructions, which sits under the header."""
    n = WIDTH if width is None else width
    cells = ["#Required(Must be unique)"] + ["Optional"] * (n - 1)
    return ",".join(f'"{c}"' for c in cells)


# --- rows whose every value is from the 2026-09-19 export --------------------

# One supplier, a quantity at three shops, no stock level anywhere.
AJM1 = "6877323e56b98500076b3003"
ROW_AJM1 = _row(
    "AJM-1", "115 white rabbit original 1g", "aji mix",
    price_type="Unit", unit="grams", cost="1.00", supplier_price="1.00",
    tags="white rabbit", barcode="4800000000026",
    at={"AJI CMG": ("-60000", "", ""), "AJI BARN": ("99272", "", ""),
        FAIRVIEW: ("-15739", "", "")},
    supplier="GZ aji mix", product_id=AJM1,
)

# Five suppliers on one product — the most any row in the export carries.
SH1 = "663c7869391c7c00079595a8"
ROW_SH1 = _row(
    "SH1", "Aji Mix", "aji mix",
    price_type="Unit", unit="Grams", tax_price="1.50", cost="0.80",
    tags="aji mix", barcode="90000010",
    at={ROCKWELL: ("690492", "", ""), "AJI MACOPA": ("-9624845", "", ""),
        "AJI CMG": ("-6798000", "", ""), "AJI BARN": ("-25641517", "", "")},
    supplier=("Chris Cheng CHC001; GZ Cri GZ001; Holeywood HLY001; "
              "Seikyo SEK001; Yeou Bin YB001"),
    product_id=SH1,
)

# Two suppliers, and levels set at two shops: 10/20 at SM North Edsa and
# 10/25 at Magnolia. Every other store carries a quantity or nothing.
SH1206 = "663c78bc391c7c000795d792"
ROW_SH1206 = _row(
    "SH1206", "Hxd premium Seedless Kiamoy 100G", "tradsnax",
    tax_price="399.00", cost="250.00", supplier_price="250.00",
    tags="kiamoy; top 20; plum", barcode="6921648821069",
    at={ROCKWELL: ("10", "", ""), "AJI MACOPA": ("-1", "", ""),
        "AJI BARN": ("461", "", ""), FAIRVIEW: ("15", "", ""),
        NORTH_EDSA: ("15", "10", "20"), MAGNOLIA: ("23", "10", "25")},
    supplier="GZ Cri GZ001; Kai Fat KAF001", product_id=SH1206,
    kitchen="Do Not Print Kitchen Docket",
)

# Levels at Rockwell (120/120) and AJI ONLINE (40/80).
SH610 = "663c7893391c7c000795b6fa"
ROW_SH610 = _row(
    "SH610", "Fuan Haw Flakes", "indi",
    tax_price="74.50", cost="70.00", tags="indi; top 20",
    barcode="6925042810131",
    at={ROCKWELL: ("36", "120", "120"), "AJI CMG": ("-86", "", ""),
        "AJI ONLINE": ("36", "40", "80"), NORTH_EDSA: ("15", "", "")},
    supplier="GZ Cri GZ001", product_id=SH610,
    kitchen="Do Not Print Kitchen Docket",
)

# No supplier at all, and a quantity of 0 at several shops — which is a
# QUANTITY, not a level, and must produce no level row.
ITEM1 = "68d163cef5f50c00075b6c12"
ROW_ITEM1 = _row(
    "Item1", "Acrylic", "", inventory_type="Serialized",
    at={ROCKWELL: ("1", "", ""), "AJI MACOPA": ("0", "", ""),
        "AJI CMG": ("0", "", ""), "AJI BARN": ("0", "", ""),
        FAIRVIEW: ("0", "", ""), TEST_STORE: ("0", "", "")},
    supplier="", product_id=ITEM1,
)


def _by_id(parsed, product_id: str):
    return next(p for p in parsed.products if p.product_id == product_id)


def _levels(parsed, product_id: str) -> dict:
    return {lv.location_raw: (lv.warning_level, lv.ideal_level)
            for lv in _by_id(parsed, product_id).levels}


# ---------------------------------------------------------------------------
# The real shape
# ---------------------------------------------------------------------------

def test_the_export_is_84_columns_and_every_store_is_found_in_order():
    parsed = parse_products(_file(ROW_AJM1))
    assert WIDTH == 84
    assert parsed.store_columns == STORES
    # AJM-1 sets no level anywhere, so no location is looked up and the two test
    # stores raise nothing: an unresolved store only matters where a level is.
    assert parsed.counters["unresolved_locations"] == 0
    assert parsed.notices == []


def test_suppliers_come_off_the_row_in_order_and_are_never_tidied():
    parsed = parse_products(_file(ROW_SH1, ROW_AJM1, ROW_ITEM1))

    assert _by_id(parsed, SH1).suppliers == [
        "Chris Cheng CHC001", "GZ Cri GZ001", "Holeywood HLY001",
        "Seikyo SEK001", "Yeou Bin YB001",
    ]
    assert _by_id(parsed, AJM1).suppliers == ["GZ aji mix"]
    assert _by_id(parsed, ITEM1).suppliers == []
    assert parsed.counters["suppliers_seen"] == 6


def test_one_supplier_named_twice_on_a_product_is_one_link():
    row = _row("DUP", "Named twice", "cat", product_id="a" * 24,
               supplier="Kai Fat KAF001; Kai Fat KAF001")
    parsed = parse_products(_file(row))
    assert _by_id(parsed, "a" * 24).suppliers == ["Kai Fat KAF001"]


def test_a_level_is_read_against_the_right_shop():
    alias = load_defs()["storehub"]["locations"]["alias"]
    parsed = parse_products(_file(ROW_SH1206, ROW_SH610))

    assert _levels(parsed, SH1206) == {
        NORTH_EDSA: (Decimal("10"), Decimal("20")),
        MAGNOLIA: (Decimal("10"), Decimal("25")),
    }
    assert _levels(parsed, SH610) == {
        ROCKWELL: (Decimal("120"), Decimal("120")),
        "AJI ONLINE": (Decimal("40"), Decimal("80")),
    }

    # Every level carries the store id from the alias map, never a guess and
    # never a name.
    for product in parsed.products:
        for level in product.levels:
            assert level.store_id == alias[level.location_raw]
            assert level.resolved is True


def test_a_quantity_is_not_a_level():
    """Acrylic is on hand at six shops and has no level set anywhere."""
    parsed = parse_products(_file(ROW_ITEM1))
    assert _by_id(parsed, ITEM1).levels == []
    assert parsed.counters["stock_levels_seen"] == 0


def test_blank_is_not_zero_and_zero_is_a_level_somebody_set():
    row = _row("Z", "Zeroed", "cat", product_id="b" * 24,
               at={NORTH_EDSA: ("15", "0", "")})
    parsed = parse_products(_file(row))
    # A warning of zero is a fact; the ideal beside it was never set.
    assert _levels(parsed, "b" * 24) == {NORTH_EDSA: (Decimal("0"), None)}


# ---------------------------------------------------------------------------
# The rows StoreHub adds that are not products
# ---------------------------------------------------------------------------

def test_the_instruction_row_under_the_header_is_not_a_product():
    parsed = parse_products(_file(_instruction_row(), ROW_AJM1))
    assert parsed.counters["instruction_rows_skipped"] == 1
    assert parsed.counters["products_seen"] == 1


def test_the_instruction_row_is_skipped_even_when_it_is_a_different_width():
    """
    It is StoreHub's own row and it is thrown away. Refusing a whole good export
    over the shape of a row nothing reads would be the wrong trade.
    """
    parsed = parse_products(_file(_instruction_row(width=12), ROW_AJM1))
    assert parsed.counters["instruction_rows_skipped"] == 1
    assert parsed.counters["products_seen"] == 1


def test_a_row_with_no_product_id_is_counted_and_said_rather_than_guessed():
    no_id = _row("NOID", "Has no id", "cat", product_id="", supplier="Judy JUD001")
    parsed = parse_products(_file(no_id, ROW_SH1))
    assert parsed.counters["rows_without_product_id"] == 1
    assert parsed.counters["products_seen"] == 1
    assert any(n["kind"] == "rows_without_product_id" for n in parsed.notices)


# ---------------------------------------------------------------------------
# Files that cannot be trusted
# ---------------------------------------------------------------------------

def test_one_product_id_twice_is_refused():
    with pytest.raises(StorehubParseError, match="appears twice"):
        parse_products(_file(ROW_AJM1, ROW_AJM1))


def test_a_renamed_fixed_column_is_refused():
    bad = _header().replace('"Supplier"', '"Suppliers"', 1)
    with pytest.raises(StorehubParseError, match="does not start and end"):
        parse_products(_file(ROW_AJM1, header=bad))


def test_a_dropped_store_column_is_refused_rather_than_read_positionally():
    bad = _header().replace('"AJI CMG_Warning Stock Level",', "", 1)
    with pytest.raises(StorehubParseError, match="not a whole number of"):
        parse_products(_file(ROW_AJM1, header=bad))


def test_store_columns_out_of_order_are_refused():
    bad = _header().replace(
        '"AJI CMG_Warning Stock Level"', '"AJI BARN_Warning Stock Level"', 1
    )
    with pytest.raises(StorehubParseError, match="name more than one store"):
        parse_products(_file(ROW_AJM1, header=bad))


def test_a_short_row_is_refused_rather_than_padded():
    with pytest.raises(StorehubParseError, match="fields where the header has"):
        parse_products(_file('"SKU-1","","A name","cat"'))


def test_a_malformed_level_rejects_the_file():
    bad = _row("BAD", "Not a number", "cat", product_id="c" * 24,
               at={NORTH_EDSA: ("15", "ten", "20")})
    with pytest.raises(StorehubParseError, match="not a number"):
        parse_products(_file(bad))


def test_a_level_at_a_store_with_no_row_is_counted_and_never_invented():
    """
    "Test stoee" is in the export and deliberately not in the alias map. A level
    there is reported and dropped: there is no store row to hang it on, and
    creating one is forbidden.
    """
    row = _row("TS", "At the test store", "cat", product_id="d" * 24,
               at={TEST_STORE: ("7", "7", "9"), ROCKWELL: ("1", "2", "3")})
    parsed = parse_products(_file(row))

    assert parsed.counters["unresolved_locations"] == 1
    # The real shop's level still lands; only the unknown one is dropped.
    assert _levels(parsed, "d" * 24) == {ROCKWELL: (Decimal("2"), Decimal("3"))}
    notice = next(n for n in parsed.notices if n["kind"] == "unresolved_location")
    assert notice["location"] == TEST_STORE
    assert "no store row was created" in notice["message"]
