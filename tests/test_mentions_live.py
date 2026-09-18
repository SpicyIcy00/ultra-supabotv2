"""
`@` against the real estate, ROLLED BACK — the other half of P2.c's Done-when.

NEEDS DATABASE_URL (the application role, for the pages and the rules) and
GEORGE_DATABASE_URL (Bob's read-only role, for the catalogue and the
purchase orders). Skips without either. The pages and the rule written here
are rolled back; nothing else is written anywhere.

WHAT THIS PROVES THAT THE CONTRACT TESTS CANNOT. That the five kinds actually
resolve against the rows the business has: that "Seik" finds a supplier in the
purchase orders, a page of the caller's own and a rule — three things of one
name, told apart — and that a shop resolves to the id its own rows carry. The
contract tests hold the shape; this holds that there is anything in it.

AND THAT ANOTHER PERSON'S PAGE IS NOT OFFERED. A completion is a list of
things a person may scope a question to, and a page they cannot read is not
one of them.
"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest

pytest.importorskip("psycopg")

from tests import pages_live  # noqa: E402

if not pages_live.available():
    pytest.skip("DATABASE_URL is not set", allow_module_level=True)
if not os.environ.get("GEORGE_DATABASE_URL"):
    pytest.skip("GEORGE_DATABASE_URL is not set", allow_module_level=True)

from app.models.bob_workflow import BobWorkflow  # noqa: E402
from app.services import mentions, page_writer  # noqa: E402
from tools._common import load_defs  # noqa: E402

DEFS = load_defs()
ME = f"mentions-live-{uuid.uuid4().hex[:8]}"
THEM = f"mentions-live-other-{uuid.uuid4().hex[:8]}"


def _kinds(found: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for c in found["candidates"]:
        out.setdefault(c["kind"], []).append(c["label"])
    return out


def test_a_shop_resolves_to_the_id_its_own_rows_carry():
    async def go():
        async with pages_live.migrated_session() as s:
            return await mentions.resolve(s, username=ME, query="Rockwell", defs=DEFS)

    found = asyncio.run(go())
    shops = [c for c in found["candidates"] if c["kind"] == "store"]
    assert [c["label"] for c in shops] == ["Rockwell"]
    # The id a `desk.selection` subject would travel with — the store list's,
    # which is what `get_sales` returns as `store_id` on every grouped row.
    assert shops[0]["id"] == next(
        s["id"] for s in DEFS["stores"]["active_retail"] if s["display_name"] == "Rockwell"
    )
    assert mentions.as_subject(shops[0], DEFS)["dimension"] == "store"


def test_seik_offers_the_supplier_the_page_and_the_rule_told_apart():
    """The card's own Done-when, against the rows the business actually has."""

    async def go():
        async with pages_live.migrated_session() as s:
            page = await page_writer.create_page(
                s, owner=ME, title="Seikyo orders",
                purpose="what is on the water")
            s.add(BobWorkflow(id=uuid.uuid4(), name="Seikyo reorder",
                                 created_by=ME, status="draft"))
            await s.flush()
            # Somebody else's page of the same name, which must not be offered.
            await page_writer.create_page(s, owner=THEM, title="Seikyo theirs")
            await s.flush()
            return page, await mentions.resolve(s, username=ME, query="Seik", defs=DEFS)

    page, found = asyncio.run(go())
    by_kind = _kinds(found)

    # THREE KINDS, ONE WORD. The supplier comes out of the purchase orders,
    # which is data nobody in this test wrote.
    assert any("Seik" in label for label in by_kind.get("supplier", [])), by_kind
    assert "Seikyo orders" in by_kind.get("page", [])
    assert "Seikyo reorder" in by_kind.get("rule", [])

    # AND EACH SAYS WHICH IT IS, in the definitions' own word.
    says = {c["kind"]: c["says"] for c in found["candidates"]}
    assert len({says[k] for k in ("supplier", "page", "rule")}) == 3

    # ANOTHER PERSON'S PAGE IS NOT A THING THIS CALLER MAY SCOPE TO.
    assert "Seikyo theirs" not in by_kind.get("page", [])

    # The page binds the SCOPE, by its id, and the rule binds nothing.
    the_page = next(c for c in found["candidates"] if c["kind"] == "page")
    assert mentions.page_id_of(the_page, DEFS) == page.id
    assert mentions.as_subject(the_page, DEFS) is None
    the_rule = next(c for c in found["candidates"] if c["kind"] == "rule")
    assert mentions.as_subject(the_rule, DEFS) is None
    assert mentions.page_id_of(the_rule, DEFS) is None


def test_a_product_resolves_to_its_product_id_and_is_told_from_a_shop():
    async def go():
        async with pages_live.migrated_session() as s:
            return await mentions.resolve(s, username=ME, query="Aji Mix", defs=DEFS)

    found = asyncio.run(go())
    products = [c for c in found["candidates"] if c["kind"] == "product"]
    assert products, found
    one = products[0]
    assert one["hint"], "a product is told from another by its SKU"
    # A product and a shop are different dimensions, which is what stops
    # "@Rockwell" being read as a product name.
    assert mentions.as_subject(one, DEFS)["dimension"] == "product"
    assert one["id"] != one["label"]


def test_nothing_that_does_not_exist_is_offered_and_nothing_failed_saying_so():
    async def go():
        async with pages_live.migrated_session() as s:
            return await mentions.resolve(
                s, username=ME, query="zzzznothinghere", defs=DEFS)

    found = asyncio.run(go())
    assert found["candidates"] == []
    # "Nothing by that name" and "a source could not be read" are different
    # facts and this is the first one (UI rule 8).
    assert found["unavailable"] == {}


def test_the_whole_list_is_bounded_by_the_definitions():
    async def go():
        async with pages_live.migrated_session() as s:
            return await mentions.resolve(s, username=ME, query="a", defs=DEFS)

    found = asyncio.run(go())
    bounds = DEFS["surface"]["desk"]["selection"]["mentions"]
    assert len(found["candidates"]) <= int(bounds["max_results"])
    for kind in {c["kind"] for c in found["candidates"]}:
        n = sum(1 for c in found["candidates"] if c["kind"] == kind)
        assert n <= int(bounds["max_per_kind"])
