"""
Live test for the page reader, against the real database, ROLLED BACK.

NEEDS DATABASE_URL — the application role's connection, the one the routes
use — and skips without it. Nothing is committed: every pin below is created
and read inside one session whose transaction is rolled back at the end, the
same "exact dry run" test_pin_membership_live relies on.

WHY A LIVE TEST AT ALL. test_page_reader_contract.py proves the statement
carries the scope. This proves the DATABASE agrees: two people with a page of
the same name, and one of them reading it sees only their own pins, cannot
name the other's pin by id, and gets the same answer for that id as for one
that never existed. The one figures read at the end goes through george_ro
exactly as a tile does, so the receipts a reader gets are the receipts a tile
gets.
"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL is not set", allow_module_level=True)

from tests import pages_live                                          # noqa: E402
from app.services import page_writer                                  # noqa: E402
from app.services.page_reader import (                                # noqa: E402
    DEFAULT_PINS,
    PageNotFound,
    read_page,
)
from app.services.pin_writer import create_pin                        # noqa: E402

SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}


async def _noop_run(calls):
    return {"status": "ok", "results": [], "notices": []}


async def _scenario() -> None:
    run = uuid.uuid4().hex[:8]
    a, b = f"test-a-{run}", f"test-b-{run}"
    page = f"Shared Name {run}"

    # The pages schema present (applied in this transaction if the database
    # has not had it), everything rolled back, the engine left clean.
    async with pages_live.migrated_session() as s:
        mine = []
        for i in range(DEFAULT_PINS + 2):
            mine.append((await create_pin(
                s, username=a, tool_calls=[SALES], title=f"A{i}", page=page,
            )).row)
        mine_page = await page_writer.find_page_by_title(s, a, page)
        theirs = (await create_pin(
            s, username=b, tool_calls=[SALES], title="B0", page=page,
        )).row
        their_page = await page_writer.find_page_by_title(s, b, page)
        loose = (await create_pin(s, username=a, tool_calls=[SALES], title="Loose")).row
        assert mine_page is not None and their_page is not None and mine_page.id != their_page.id

        # --- own page: only a's pins, in page order, bounded ----------------------
        out = await read_page(s, username=a, page_id=mine_page.id, figures=False, run=_noop_run)
        assert out["pins_total"] == DEFAULT_PINS + 2
        titles = [p["title"] for p in out["pins"]] + [p["title"] for p in out["remainder"]]
        assert "B0" not in titles
        assert len(out["pins"]) == DEFAULT_PINS
        # New pins append at the bottom, so the page reads in creation order.
        assert titles == [f"A{i}" for i in range(DEFAULT_PINS + 2)]
        assert out["page_id"] == str(mine_page.id) and out["page"] == page

        # --- the other person's same-named page is a different page ---------------
        other = await read_page(s, username=b, page_id=their_page.id, figures=False, run=_noop_run)
        assert [p["title"] for p in other["pins"]] == ["B0"]
        # And their page's id, from me, is a page that does not exist.
        with pytest.raises(PageNotFound):
            await read_page(s, username=a, page_id=their_page.id, figures=False)

        # --- their pin by id is indistinguishable from a missing one ---------------
        ghost = str(uuid.uuid4())
        out = await read_page(s, username=a, page_id=mine_page.id, figures=False, run=_noop_run,
                              pins=[str(theirs.id), ghost, str(mine[0].id)])
        assert [p["title"] for p in out["pins"]] == ["A0"]
        assert out["unavailable"] == [str(theirs.id), ghost]

        # --- a missing page; an empty page; the ungrouped scope --------------------
        with pytest.raises(PageNotFound):
            await read_page(s, username=a, page_id=uuid.uuid4(), figures=False)
        empty = await page_writer.create_page(s, owner=a, title=f"Empty {run}")
        out = await read_page(s, username=a, page_id=empty.id, figures=False, run=_noop_run)
        assert out["empty"] is True and out["pins_total"] == 0
        none_ungrouped = await read_page(s, username=b, page_id=None, figures=False, run=_noop_run)
        assert none_ungrouped["empty"] is True and none_ungrouped["pins"] == []
        ungrouped = await read_page(s, username=a, page_id=None, figures=False, run=_noop_run)
        assert [p["title"] for p in ungrouped["pins"]] == ["Loose"]
        assert ungrouped["page"] is None and ungrouped["page_id"] is None

        # --- a rename does not move the scope --------------------------------------
        await page_writer.rename_page(s, owner=a, page_id=mine_page.id, title=f"Renamed {run}")
        after = await read_page(s, username=a, page_id=mine_page.id, figures=False, run=_noop_run)
        assert after["page"] == f"Renamed {run}" and after["pins_total"] == DEFAULT_PINS + 2

        # --- one real replay, through george_ro, with a tile's receipts ------------
        if os.environ.get("GEORGE_DATABASE_URL"):
            live = await read_page(s, username=a, page_id=None)
            [pin] = live["pins"]
            assert pin["read"] == "ok", pin
            [result] = pin["results"]
            assert result["meta"]["source_table"]
            assert result["meta"]["snapshot_timestamp"]
            assert result["meta"]["filters_applied"]

        # --- nothing was written -----------------------------------------------------
        await s.refresh(loose)
        assert loose.last_run_at is None and loose.last_status is None


def test_page_reads_against_the_database_rolled_back():
    asyncio.run(_scenario())
