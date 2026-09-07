"""
Live test for pin membership, against the real database, ROLLED BACK.

NEEDS DATABASE_URL — the application role's connection, the one the routes
use — and skips without it. Nothing is committed: every pin below is created,
moved and renamed inside one session whose transaction is rolled back at the
end, which is the same "exact dry run" the StoreHub import driver relies on.

WHY A LIVE TEST AT ALL. test_pin_membership_contract.py proves the statements
carry the scope. This proves the DATABASE agrees: two people with a page of the
same name, one renames theirs, the other's is untouched — asserted by reading
the rows back rather than by reading the SQL.
"""

from __future__ import annotations

import asyncio
import os
import uuid

import pytest
from sqlalchemy import select

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL is not set", allow_module_level=True)

from app.core.database import AsyncSessionLocal                       # noqa: E402
from app.models.george_pin import GeorgePin                           # noqa: E402
from app.services.pin_writer import (                                 # noqa: E402
    PinNotFound,
    SimilarPageError,
    create_pin,
    rename_page,
    update_pin,
)

SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}


async def _scenario() -> None:
    run = uuid.uuid4().hex[:8]
    a, b = f"test-a-{run}", f"test-b-{run}"

    async with AsyncSessionLocal() as s:
        try:
            a1 = (await create_pin(s, username=a, tool_calls=[SALES], title="A1",
                                   page="Shared Name")).row
            a2 = (await create_pin(s, username=a, tool_calls=[SALES], title="A2",
                                   page="Shared Name")).row
            b1 = (await create_pin(s, username=b, tool_calls=[SALES], title="B1",
                                   page="Shared Name")).row
            calls_before = list(a1.tool_calls)

            # --- move: label only, owner only ---------------------------------
            moved = await update_pin(s, username=a, pin_id=a1.id, page="Purchasing")
            assert moved.row.page == "Purchasing"
            assert moved.row.tool_calls == calls_before
            assert moved.row.last_run_at is None

            with pytest.raises(PinNotFound):
                await update_pin(s, username=b, pin_id=a1.id, page=None)

            # --- rename: only a's pins on the exact name ------------------------
            renamed = await rename_page(s, username=a, old="Shared Name", new="FFR Overview")
            assert renamed.pins_moved == 1          # a2; a1 had already moved

            rows = (await s.execute(
                select(GeorgePin.created_by, GeorgePin.title, GeorgePin.page)
                .where(GeorgePin.created_by.in_([a, b]))
                .order_by(GeorgePin.title)
            )).all()
            assert [tuple(r) for r in rows] == [
                (a, "A1", "Purchasing"),
                (a, "A2", "FFR Overview"),
                (b, "B1", "Shared Name"),            # untouched
            ]
            assert b1.page == "Shared Name"

            # --- the collision rule holds on rename ------------------------------
            with pytest.raises(SimilarPageError):
                await rename_page(s, username=a, old="FFR Overview", new="purchasing")
            case_only = await rename_page(s, username=a, old="FFR Overview", new="FFR OVERVIEW")
            assert case_only.pins_moved == 1

            # --- off a page without deleting -----------------------------------
            off = await update_pin(s, username=a, pin_id=a1.id, page=None)
            assert off.row.page is None
            assert off.row.tool_calls == calls_before
        finally:
            await s.rollback()


def test_membership_against_the_database_rolled_back():
    asyncio.run(_scenario())
