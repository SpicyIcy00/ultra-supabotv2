"""
Two reads that answered the wrong question quietly (P2S.7, 2026-09-18).

  - A CATEGORY SPELLED DIFFERENTLY matched nothing. "analyze tradsnax per
    store" spent four reads of spelling in both P2S.6 runs: `category=
    'TRADSNAX'` returned no products, because the catalogue says `tradsnax`.
    An empty result for a real category reads as "no products". So a category
    is resolved against the catalogue (tools/products.resolve_category): exact
    stands, a match ignoring case IS the category, anything else is refused
    with every category named.
  - A CUT LIST said only `truncated`. The store-wide stock-out view returned
    1,000 of more rows, and a product absent from it was read as "not out".
    The meta now says absence from a cut list is not a fact about a product.
"""

from __future__ import annotations

import pytest

from tools import products
from tools._common import load_defs, req

DEFS = load_defs()


class _Cursor:
    def __init__(self, categories):
        self.categories = categories
        self.sql = []

    def execute(self, sql, params=None):
        self.sql.append(sql)

    def fetchall(self):
        return [{"category": c} for c in self.categories]


def test_an_exact_category_stands_with_no_note():
    cur = _Cursor(["aji mix", "tradsnax", "Uncategorized"])
    assert products.resolve_category(cur, DEFS, "tradsnax") == ("tradsnax", None)
    # One grouped statement over the catalogue, through the definition's own
    # normalization — never a string built from the caller's value.
    assert req(DEFS, "products.category_normalization.sql") in cur.sql[0]
    assert "tradsnax" not in cur.sql[0]


def test_a_category_in_another_case_is_that_category_and_says_so():
    spelled, note = products.resolve_category(_Cursor(["aji mix", "tradsnax"]), DEFS, "TRADSNAX")
    assert spelled == "tradsnax" and "TRADSNAX" in note


def test_a_category_that_does_not_exist_is_refused_with_every_one_named():
    with pytest.raises(ValueError) as why:
        products.resolve_category(_Cursor(["aji mix", "tradsnax"]), DEFS, "snax")
    assert "aji mix" in str(why.value) and "tradsnax" in str(why.value)


def test_both_reads_resolve_a_category_before_reading():
    sales = open("tools/sales.py", encoding="utf-8").read()
    product = open("tools/products.py", encoding="utf-8").read()
    assert "resolve_category(cur, defs, filters[\"category\"])" in sales
    assert "resolve_category(cur, defs, category)" in product


def test_a_cut_list_says_absence_is_not_known():
    note = " ".join(req(DEFS, "ranking.absent_from_a_cut_list").split())
    said = note.format(shown=1000, full=3005)
    assert "1000 of 3005" in said and "NOT known" in said
    source = open("tools/inventory.py", encoding="utf-8").read()
    assert '"absent_is_not_known"' in source and "if full_row_count > len(rows)" in source


def test_the_models_own_row_cap_says_the_same():
    from agent import loop
    capped = loop._truncate({"rows": [{"n": i} for i in range(loop.MAX_ROWS_TO_MODEL + 5)],
                             "meta": {}})
    assert "not known to be absent" in capped["meta"]["truncation_note"]


def test_a_grouped_count_states_its_whole():
    """verification/p2s7-gate.json: "3,005 of Greenhills' 3,541" — the 3,541
    was George's sum. The tool now states the whole of a complete grouping."""
    source = open("tools/inventory.py", encoding="utf-8").read()
    assert '"product_count_all_groups"' in source
    assert "if group_by and not truncated and full_row_count == len(rows)" in source
