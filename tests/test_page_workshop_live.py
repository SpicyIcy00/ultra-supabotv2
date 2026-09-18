"""
Live tests for pages, against the real database, ROLLED BACK.

NEEDS DATABASE_URL — the application role's connection — and skips without it.
The migration is applied inside the test's own transaction when the database
has not had it yet (tests/pages_live.py), which makes every run of this file a
dry run of q1r2s3t4u5v6 against the live rows, assertions included, and leaves
the database exactly as it was found.

WHAT THIS PROVES THAT THE CONTRACT TESTS CANNOT: that the DATABASE agrees with
the statements. Two owners, each with a page; every operation tried across the
boundary; every id that is not the caller's answered the same way as one that
never existed; positions dense after every write; a rename that keeps its id;
a page deleted whose pins survive; and an audit row for each of them.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from sqlalchemy import select, text

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from tests import pages_live                                                  # noqa: E402

if not pages_live.available():
    pytest.skip("DATABASE_URL is not set", allow_module_level=True)

from app.models.bob_page import BobPage, BobPageEvent               # noqa: E402
from app.models.bob_pin import BobPin                                   # noqa: E402
from app.services import page_operations, page_writer, pin_writer             # noqa: E402
from app.services.page_writer import (                                        # noqa: E402
    AmbiguousTarget,
    NotAPage,
    PageNotFound,
    PageQuotaError,
    PageValidationError,
    PinNotFound,
    SimilarPageError,
    bob_actor,
)

SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
TX = {"tool": "get_sales",
      "arguments": {"metric": "transaction_count", "group_by": "store", "date_range": "last_month"}}
ATP = {"tool": "get_sales",
       "arguments": {"metric": "average_transaction_value", "group_by": "store",
                     "date_range": "last_month"}}


async def _positions(s, owner, page_id) -> list[tuple[str, int]]:
    pins = await page_writer.page_pins(s, owner, page_id)
    return [(p.title, p.position) for p in pins]


def _dense(rows: list[tuple[str, int]]) -> bool:
    return [pos for _, pos in rows] == list(range(len(rows)))


async def _events(s, page_id) -> list[BobPageEvent]:
    return list((await s.execute(
        select(BobPageEvent).where(BobPageEvent.page_id == page_id)
        .order_by(BobPageEvent.at.asc())
    )).scalars().all())


# ---------------------------------------------------------------------------
# The migration itself
# ---------------------------------------------------------------------------

async def _migration_round_trip() -> None:
    from app.core.database import AsyncSessionLocal, engine

    await engine.dispose()
    async with AsyncSessionLocal() as s:
        try:
            before_columns = set((await s.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='george' AND table_name='pins'"))).scalars().all())
            before_calls = (await s.execute(text(
                "SELECT id, tool_calls FROM george.pins ORDER BY id"))).all()
            before_groups = ((await s.execute(text(
                "SELECT id, page FROM george.pins ORDER BY id"))).all()
                if "page" in before_columns else None)
            conn = await s.connection()
            ran = await conn.run_sync(pages_live.apply_migration_if_needed)
            # Whether it ran now or earlier, the shape is the shape.
            cols = set((await s.execute(text(
                "SELECT column_name FROM information_schema.columns "
                " WHERE table_schema='george' AND table_name='pins'"))).scalars().all())
            assert {"page_id", "position"} <= cols and "page" not in cols
            assert (await s.execute(text(
                "SELECT id, tool_calls FROM george.pins ORDER BY id"))).all() == before_calls
            # Every grouped pin's positions are dense and every page is owned
            # by the owner of its pins — the assertions the revision ran,
            # restated from outside it.
            bad = (await s.execute(text(
                "SELECT count(*) FROM george.pins p JOIN george.pages g ON g.id = p.page_id "
                " WHERE p.created_by <> g.owner"))).scalar()
            assert bad == 0
            gaps = (await s.execute(text(
                "SELECT count(*) FROM (SELECT page_id, count(*) n, max(position) hi, "
                " min(position) lo, count(DISTINCT position) d FROM george.pins "
                " WHERE page_id IS NOT NULL GROUP BY page_id) s "
                " WHERE lo <> 0 OR hi <> n - 1 OR d <> n"))).scalar()
            assert gaps == 0
            if ran:
                # And back: the name returns to the pin from the page it was on.
                await conn.run_sync(pages_live.downgrade_migration)
                cols = set((await s.execute(text(
                    "SELECT column_name FROM information_schema.columns "
                    " WHERE table_schema='george' AND table_name='pins'"))).scalars().all())
                assert "page" in cols and "page_id" not in cols
                tables = set((await s.execute(text(
                    "SELECT table_name FROM information_schema.tables "
                    " WHERE table_schema='george'"))).scalars().all())
                assert "pages" not in tables and "page_events" not in tables
                assert (await s.execute(text(
                    "SELECT id, page FROM george.pins ORDER BY id"))).all() == before_groups
        finally:
            await s.rollback()
    async with AsyncSessionLocal() as verify:
        after_columns = set((await verify.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='george' AND table_name='pins'"))).scalars().all())
        assert after_columns == before_columns
        assert (await verify.execute(text(
            "SELECT id, tool_calls FROM george.pins ORDER BY id"))).all() == before_calls
    await engine.dispose()


def test_the_migration_applies_verifies_and_reverses_inside_one_transaction():
    asyncio.run(_migration_round_trip())


# ---------------------------------------------------------------------------
# Two owners, every operation, across the boundary
# ---------------------------------------------------------------------------

async def _scenario() -> None:
    run = uuid.uuid4().hex[:8]
    a, b = f"test-a-{run}", f"test-b-{run}"

    async with pages_live.migrated_session() as s:
        # ---- creation: empty page, then pins landing at the BOTTOM -------------
        rock = await page_writer.create_page(s, owner=a, title=f"Rockwell {run}",
                                             purpose="Monitor Rockwell.")
        assert rock.title == f"Rockwell {run}" and rock.purpose == "Monitor Rockwell."
        assert await _positions(s, a, rock.id) == []          # empty, and real

        p1 = (await pin_writer.create_pin(s, username=a, tool_calls=[SALES], title="Net sales",
                                          page_id=rock.id)).row
        p2 = (await pin_writer.create_pin(s, username=a, tool_calls=[TX], title="Transactions",
                                          page=rock.title)).row       # by title → same page
        p3 = (await pin_writer.create_pin(s, username=a, tool_calls=[ATP], title="ATP",
                                          page_id=rock.id)).row
        assert await _positions(s, a, rock.id) == [("Net sales", 0), ("Transactions", 1), ("ATP", 2)]
        assert p1.page_id == p2.page_id == p3.page_id == rock.id

        # Preflight must reject the whole batch before even its first mutation.
        original_purpose = rock.purpose
        with pytest.raises(PinNotFound):
            await page_operations.apply_edit(s, owner=a, page_id=rock.id, operations=[
                {"op": "set_purpose", "purpose": "Must not persist"},
                {"op": "place", "pin_id": str(p1.id), "place": {"before": str(uuid.uuid4())}},
            ])
        assert rock.purpose == original_purpose
        assert await _positions(s, a, rock.id) == [("Net sales", 0), ("Transactions", 1), ("ATP", 2)]

        # A NEW title on a pin still brings a page into being.
        loose = (await pin_writer.create_pin(s, username=a, tool_calls=[SALES], title="Loose")).row
        assert loose.page_id is None
        # An explicit null ID wins over a stale legacy display title.
        await pin_writer.update_pin(s, username=a, pin_id=loose.id,
                                    page_id=None, page=rock.title)
        assert loose.page_id is None
        made = (await pin_writer.create_pin(s, username=a, tool_calls=[SALES], title="First",
                                            page=f"Aji Overview {run}")).row
        overview = await page_writer.find_page_by_title(s, a, f"Aji Overview {run}")
        assert overview is not None and made.page_id == overview.id

        # The other owner's world, with a page of the SAME title.
        theirs = await page_writer.create_page(s, owner=b, title=f"Rockwell {run}")
        their_pin = (await pin_writer.create_pin(s, username=b, tool_calls=[SALES],
                                                 title="Net sales", page_id=theirs.id)).row
        their_loose = (await pin_writer.create_pin(s, username=b, tool_calls=[SALES], title="Private loose")).row
        with pytest.raises(PinNotFound, match="^Pin not found\\.$"):
            await page_writer.move_pin(s, owner=a, pin=their_loose, to_page=rock)

        # ---- ownership: foreign == missing, on every path -----------------------
        ghost = uuid.uuid4()
        for pid in (theirs.id, ghost):
            with pytest.raises(PageNotFound) as exc:
                await page_writer.get_page(s, a, pid)
            assert str(exc.value) == "Page not found."
            with pytest.raises(PageNotFound):
                await page_writer.rename_page(s, owner=a, page_id=pid, title="Stolen")
            with pytest.raises(PageNotFound):
                await page_operations.apply_edit(
                    s, owner=a, page_id=pid, operations=[{"op": "set_purpose", "purpose": "x"}])
        for pin_id in (their_pin.id, ghost):
            with pytest.raises(PinNotFound) as exc:
                await page_writer.get_pin(s, a, pin_id)
            assert str(exc.value) == "Pin not found."
            with pytest.raises(PinNotFound):          # cannot smuggle it onto my page
                await page_operations.apply_edit(
                    s, owner=a, page_id=rock.id,
                    operations=[{"op": "add_existing", "pin_id": str(pin_id)}])
            with pytest.raises(PinNotFound):          # cannot reorder it
                await page_operations.apply_edit(
                    s, owner=a, page_id=rock.id,
                    operations=[{"op": "place", "pin_id": str(pin_id), "place": {"at": "top"}}])
            with pytest.raises(PinNotFound):          # cannot build a page from it
                await page_operations.build_page(
                    s, owner=a, title=f"Heist {run}", analyses=[{"pin_id": str(pin_id)}])
        with pytest.raises(PageNotFound):             # cannot target their page as destination
            await page_operations.apply_edit(
                s, owner=a, page_id=rock.id,
                operations=[{"op": "move_to_page", "pin_id": str(p1.id), "page_id": str(theirs.id)}])
        with pytest.raises(PinNotFound):              # their pin cannot be moved by me at all
            await pin_writer.update_pin(s, username=a, pin_id=their_pin.id, page_id=rock.id)
        # And nothing above touched their page.
        assert await _positions(s, b, theirs.id) == [("Net sales", 0)]

        # ---- the null scope: into and out of, never edited ----------------------
        with pytest.raises(NotAPage):
            await page_operations.apply_edit(s, owner=a, page_id=None,
                                             operations=[{"op": "rename", "title": "U"}])
        with pytest.raises(NotAPage):
            await page_writer.place_pin(s, owner=a, pin=loose, place={"at": "top"})

        # ---- edit: rename keeps the id; purpose; place; remove; move --------------
        res = await page_operations.apply_edit(
            s, owner=a, page_id=rock.id,
            actor=bob_actor(str(uuid.uuid4())),
            operations=[
                {"op": "rename", "title": f"Rockwell Weekly {run}"},
                {"op": "set_purpose", "purpose": "Weekly Rockwell performance."},
                {"op": "place", "title": "ATP", "place": {"before": str(p2.id)}},
                {"op": "add_existing", "pin_id": str(loose.id)},
                {"op": "remove", "title": "Net sales"},
            ],
        )
        same = await page_writer.get_page(s, a, rock.id)
        assert same.id == rock.id and same.title == f"Rockwell Weekly {run}"
        assert same.purpose == "Weekly Rockwell performance."
        rows = await _positions(s, a, rock.id)
        assert rows == [("ATP", 0), ("Transactions", 1), ("Loose", 2)]
        assert _dense(rows)
        await s.refresh(p1)
        assert p1.page_id is None and p1.tool_calls == [SALES]   # removed = ungrouped, kept
        kinds = [o["op"] for o in res.operations]
        assert kinds == ["rename", "set_purpose", "place", "add", "remove"]
        assert res.operations[-1]["to"] == "ungrouped"
        assert res.page["page_id"] == str(rock.id)

        # Resolve human titles in trusted metadata; mutations use the ID, and
        # both pages are dense afterwards.
        await page_operations.apply_edit(
            s, owner=a, page_id=rock.id,
            operations=[{"op": "move_to_page", "pin_id": str(p2.id),
                         "page_id": str(overview.id)}],
        )
        assert _dense(await _positions(s, a, rock.id))
        assert await _positions(s, a, overview.id) == [("First", 0), ("Transactions", 1)]

        # ---- ambiguity refuses ---------------------------------------------------
        await pin_writer.create_pin(s, username=a, tool_calls=[ATP], title="ATP", page_id=rock.id)
        with pytest.raises(AmbiguousTarget) as exc:
            await page_operations.apply_edit(
                s, owner=a, page_id=rock.id,
                operations=[{"op": "remove", "title": "ATP"}])
        assert len(exc.value.candidates) == 2
        assert all(c["page_title"] == same.title for c in exc.value.candidates)
        # And the refusal left the page exactly as it was.
        rows = await _positions(s, a, rock.id)
        assert rows == [("ATP", 0), ("Loose", 1), ("ATP", 2)]

        # ---- the title rule ------------------------------------------------------
        with pytest.raises(PageValidationError):
            await page_writer.create_page(s, owner=a, title=f"Rockwell Weekly {run}")   # exact dup
        with pytest.raises(SimilarPageError):
            await page_writer.create_page(s, owner=a, title=f"rockwell weekly {run}")   # case
        kept = await page_writer.create_page(s, owner=a, title=f"rockwell weekly {run}",
                                             allow_similar_page=True)
        assert kept.id != rock.id
        # The other owner may use my exact title; pages are per person.
        assert theirs.title == f"Rockwell {run}"

        # ---- atomic build: a bad fourth analysis leaves nothing behind ----------
        before_pages = len(await page_writer.list_pages(s, a))
        before_pins = await pin_writer.count_pins(s, a)
        with pytest.raises(Exception):
            await page_operations.build_page(
                s, owner=a, title=f"Half {run}",
                analyses=[
                    {"title": "1", "tool_calls": [SALES]},
                    {"title": "2", "tool_calls": [TX]},
                    {"title": "3", "tool_calls": [ATP]},
                    {"title": "4", "tool_calls": [{"tool": "get_sales",
                                                   "arguments": {"metric": "no_such_metric"}}]},
                ])
        assert len(await page_writer.list_pages(s, a)) == before_pages
        assert await pin_writer.count_pins(s, a) == before_pins
        assert await page_writer.find_page_by_title(s, a, f"Half {run}") is None

        # And a good build lands in the order described, with existing pins after.
        built = await page_operations.build_page(
            s, owner=a, title=f"Built {run}", purpose="From a conversation.",
            analyses=[
                {"title": "Sales", "tool_calls": [SALES]},
                {"pin_id": str(p1.id)},                       # the ungrouped one
                {"title": "Basket", "tool_calls": [ATP]},
            ],
            actor=bob_actor(str(uuid.uuid4())),
        )
        built_id = uuid.UUID(built.page["page_id"])
        assert await _positions(s, a, built_id) == [("Sales", 0), ("Net sales", 1), ("Basket", 2)]
        assert [o["op"] for o in built.operations] == ["create", "add", "add", "add"]

        # ---- capacity, with the bound lowered for the test -----------------------
        page_writer.MAX_PINS_PER_PAGE, page_operations.MAX_PINS_PER_PAGE = 3, 3
        try:
            with pytest.raises(PageQuotaError):
                await pin_writer.create_pin(s, username=a, tool_calls=[SALES], title="Four",
                                            page_id=built_id)
            with pytest.raises(PageQuotaError):
                await page_operations.apply_edit(
                    s, owner=a, page_id=built_id,
                    operations=[{"op": "add", "title": "Four", "tool_calls": [SALES]}])
            # Overview has two analyses: each move fits alone, both cannot fit.
            with pytest.raises(PageQuotaError):
                await page_operations.apply_edit(s, owner=a, page_id=rock.id, operations=[
                    {"op": "set_purpose", "purpose": "Must not persist"},
                    {"op": "move_to_page", "pin_id": str(p3.id), "page_id": str(overview.id)},
                    {"op": "move_to_page", "pin_id": str(loose.id), "page_id": str(overview.id)},
                ])
            assert rock.purpose == "Weekly Rockwell performance."
            assert await _positions(s, a, overview.id) == [("First", 0), ("Transactions", 1)]
        finally:
            page_writer.MAX_PINS_PER_PAGE = page_operations.MAX_PINS_PER_PAGE = 50
        assert await _positions(s, a, built_id) == [("Sales", 0), ("Net sales", 1), ("Basket", 2)]

        # ---- delete a page: the row goes, every pin survives in Ungrouped -------
        gone = await page_writer.delete_page(s, owner=a, page_id=built_id)
        assert gone.pins_ungrouped == 3
        with pytest.raises(PageNotFound):
            await page_writer.get_page(s, a, built_id)
        survivors = (await s.execute(
            select(BobPin).where(BobPin.created_by == a, BobPin.page_id.is_(None))
        )).scalars().all()
        assert {p.title for p in survivors} >= {"Sales", "Net sales", "Basket"}

        # ---- the audit ---------------------------------------------------------------
        evs = await _events(s, rock.id)
        ops = [e.operation for e in evs]
        assert ops[0] == "create"
        for expected in ("add", "rename", "set_purpose", "place", "remove", "move"):
            assert expected in ops, ops
        bob_rows = [e for e in evs if e.actor == "bob"]
        assert bob_rows and all(e.conversation_id is not None for e in bob_rows)
        user_rows = [e for e in evs if e.actor == "user"]
        assert user_rows and all(e.conversation_id is None for e in user_rows)
        rename = next(e for e in evs if e.operation == "rename")
        assert rename.before == {"title": f"Rockwell {run}"}
        assert rename.after == {"title": f"Rockwell Weekly {run}"}
        # Metadata only: no event carries rows or meta.
        for e in evs:
            for side in (e.before or {}, e.after or {}):
                assert "rows" not in side and "meta" not in side
        # The other owner's page has only its own two events.
        assert [e.operation for e in await _events(s, theirs.id)] == ["create", "add"]

        # ---- pages list order: most recently changed first --------------------------
        titles = [p.title for p in await page_writer.list_pages(s, a)]
        assert titles[0] == kept.title                  # created last, so changed last


def test_pages_against_the_database_rolled_back():
    asyncio.run(_scenario())
