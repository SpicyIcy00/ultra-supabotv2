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

from app.core.database import AsyncSessionLocal, engine               # noqa: E402
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

    # A fresh pool for THIS event loop: a connection left by an earlier
    # asyncio.run in the process belongs to a loop that is now closed.
    await engine.dispose()
    async with AsyncSessionLocal() as s:
        try:
            mine = []
            for i in range(DEFAULT_PINS + 2):
                mine.append((await create_pin(
                    s, username=a, tool_calls=[SALES], title=f"A{i}", page=page,
                )).row)
            theirs = (await create_pin(
                s, username=b, tool_calls=[SALES], title="B0", page=page,
            )).row
            loose = (await create_pin(s, username=a, tool_calls=[SALES], title="Loose")).row

            # --- own page: only a's pins, newest first, bounded ------------------
            out = await read_page(s, username=a, page=page, figures=False, run=_noop_run)
            assert out["pins_total"] == DEFAULT_PINS + 2
            titles = [p["title"] for p in out["pins"]] + [p["title"] for p in out["remainder"]]
            assert "B0" not in titles
            assert len(out["pins"]) == DEFAULT_PINS
            assert titles == [f"A{i}" for i in range(DEFAULT_PINS + 1, -1, -1)]

            # --- the other person's same-named page is a different page ----------
            other = await read_page(s, username=b, page=page, figures=False, run=_noop_run)
            assert [p["title"] for p in other["pins"]] == ["B0"]

            # --- their pin by id is indistinguishable from a missing one ----------
            ghost = str(uuid.uuid4())
            out = await read_page(s, username=a, page=page, figures=False, run=_noop_run,
                                  pins=[str(theirs.id), ghost, str(mine[0].id)])
            assert [p["title"] for p in out["pins"]] == ["A0"]
            assert out["unavailable"] == [str(theirs.id), ghost]

            # --- a missing page, and the ungrouped scope --------------------------
            with pytest.raises(PageNotFound):
                await read_page(s, username=a, page=f"Nowhere {run}", figures=False)
            with pytest.raises(PageNotFound):
                await read_page(s, username=b, page=None, figures=False)
            ungrouped = await read_page(s, username=a, page=None, figures=False, run=_noop_run)
            assert [p["title"] for p in ungrouped["pins"]] == ["Loose"]
            assert ungrouped["page"] is None

            # --- one real replay, through george_ro, with a tile's receipts -------
            if os.environ.get("GEORGE_DATABASE_URL"):
                live = await read_page(s, username=a, page=None)
                [pin] = live["pins"]
                assert pin["read"] == "ok", pin
                [result] = pin["results"]
                assert result["meta"]["source_table"]
                assert result["meta"]["snapshot_timestamp"]
                assert result["meta"]["filters_applied"]

            # --- nothing was written ----------------------------------------------
            await s.refresh(loose)
            assert loose.last_run_at is None and loose.last_status is None
        finally:
            await s.rollback()
    # And left clean for the next one: a connection this loop opened would be
    # handed to the next asyncio.run in the process and fail with "Event loop
    # is closed" — which is what test_pin_membership_live saw when it ran
    # after this file.
    await engine.dispose()


def test_page_reads_against_the_database_rolled_back():
    asyncio.run(_scenario())
