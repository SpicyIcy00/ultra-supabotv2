"""
Keeping a thread, against the real database, ROLLED BACK.

NEEDS DATABASE_URL — the application role's connection — and skips without it.
Everything here runs in one transaction that is rolled back, so the database is
left exactly as it was found (tests/pages_live.py).

WHAT THIS PROVES THAT THE CONTRACT TEST CANNOT: that the ROUND TRIP closes.
`build_page` writes a page whose pins carry the conversation they were made in;
`conversations_in_thread` resolves a thread back to those conversations; the
pins listing finds the page again. Each half is checkable in isolation without
a database and neither says the loop joins up — a pin written against a
conversation id that the resolver's own clause excludes would pass both halves
and lose the page forever.

AND THE BOUNDARY IS THE POINT OF THE RESOLVER: another person's turn in the
same thread, and a hidden turn of the caller's own, are both invisible to it.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from tests import pages_live                                                  # noqa: E402

if not pages_live.available():
    pytest.skip("DATABASE_URL is not set", allow_module_level=True)

from app.models.bob_pin import BobPin                                   # noqa: E402
from app.services import page_operations                                      # noqa: E402
from app.services.thread_access import conversations_in_thread                # noqa: E402

SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
STOCK = {"tool": "get_stock", "arguments": {}}

NOW = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)


async def _turn(s, *, conversation: uuid.UUID, thread: uuid.UUID, user: str,
                minutes: int = 0, hidden: bool = False) -> uuid.UUID:
    """
    One row in george.conversations, as the loop writes one.

    Only the columns the resolver reads plus the NOT NULLs: this is a fixture
    for a join, not a fake turn, and nothing here pretends to be a real answer.
    """
    await s.execute(
        text(
            "INSERT INTO george.conversations "
            "(id, thread_id, user_id, asked_at, question, iterations, status, hidden_at) "
            "VALUES (:id, :thread, :user, :at, :q, 1, 'ok', :hidden)"
        ),
        {"id": conversation, "thread": thread, "user": user,
         "at": NOW + timedelta(minutes=minutes), "q": f"turn {minutes}",
         "hidden": NOW if hidden else None},
    )
    return conversation


def test_a_thread_resolves_to_its_own_turns_and_to_nobody_elses():
    async def scenario():
        async with pages_live.migrated_session() as s:
            me, them = f"ice-{uuid.uuid4().hex[:8]}", f"other-{uuid.uuid4().hex[:8]}"
            thread = uuid.uuid4()
            first = await _turn(s, conversation=thread, thread=thread, user=me, minutes=0)
            second = await _turn(s, conversation=uuid.uuid4(), thread=thread, user=me, minutes=1)
            # Two things that must NOT come back: somebody else replying in the
            # same thread, and a turn of the caller's own that is hidden.
            await _turn(s, conversation=uuid.uuid4(), thread=thread, user=them, minutes=2)
            await _turn(s, conversation=uuid.uuid4(), thread=thread, user=me, minutes=3, hidden=True)
            await s.flush()

            assert await conversations_in_thread(s, me, thread) == [first, second]
            # Oldest first, because a page reads in the order it was asked.
            assert await conversations_in_thread(s, them, thread) != []
            # A thread nobody has a turn in is empty, not an error.
            assert await conversations_in_thread(s, me, uuid.uuid4()) == []

    asyncio.run(scenario())


def test_a_thread_with_no_thread_id_is_still_its_own_thread():
    """
    `thread_id` is nullable for rows written before the column, and COALESCE
    keeps every such row its own thread — the same reading `thread_continuable`
    has always used. A conversation from before threads existed must still be
    findable by its own id, or a page kept from it is orphaned.
    """
    async def scenario():
        async with pages_live.migrated_session() as s:
            me = f"ice-{uuid.uuid4().hex[:8]}"
            alone = uuid.uuid4()
            await s.execute(
                text(
                    "INSERT INTO george.conversations "
                    "(id, thread_id, user_id, asked_at, question, iterations, status) "
                    "VALUES (:id, NULL, :user, :at, 'old turn', 1, 'ok')"
                ),
                {"id": alone, "user": me, "at": NOW},
            )
            await s.flush()
            assert await conversations_in_thread(s, me, alone) == [alone]

    asyncio.run(scenario())


def test_keeping_a_thread_writes_a_page_the_thread_can_find_again():
    async def scenario():
        async with pages_live.migrated_session() as s:
            me = f"ice-{uuid.uuid4().hex[:8]}"
            thread = uuid.uuid4()
            first = await _turn(s, conversation=thread, thread=thread, user=me, minutes=0)
            second = await _turn(s, conversation=uuid.uuid4(), thread=thread, user=me, minutes=1)
            await s.flush()

            # The gesture: one act, the page and both of its sections.
            built = await page_operations.build_page(
                s, owner=me, title="how are we doing",
                analyses=[{"title": "how are we doing", "tool_calls": [SALES]},
                          {"title": "and the warehouse?", "tool_calls": [STOCK]}],
                question="how are we doing",
                conversation_id=second,
            )
            await s.flush()
            page_id = built.page["page_id"]
            assert built.page["analysis_count"] == 2
            # The page reads in the order it was described.
            assert [a["title"] for a in built.page["analyses"]] \
                == ["how are we doing", "and the warehouse?"]

            # And now the round trip: thread → its conversations → its pins →
            # the page. This is what the header draws "kept as" from.
            ids = await conversations_in_thread(s, me, thread)
            assert second in ids and first in ids
            pins = (await s.execute(
                select(BobPin).where(BobPin.created_by == me,
                                        BobPin.conversation_id.in_(ids))
            )).scalars().all()
            assert len(pins) == 2
            assert {str(p.page_id) for p in pins} == {page_id}
            # What is stored is the CALLS, never a number.
            assert [p.tool_calls for p in pins] == [[SALES], [STOCK]]

    asyncio.run(scenario())


def test_a_page_built_against_no_conversation_is_not_found_by_any_thread():
    """
    Bob's `create_page` fills the conversation in from the loop and the
    button fills it in from the room, but a caller may send none — and then the
    page is a page, not a kept thread. It must not be attributed to a thread by
    a title, a time, or anything else that looks close.
    """
    async def scenario():
        async with pages_live.migrated_session() as s:
            me = f"ice-{uuid.uuid4().hex[:8]}"
            thread = uuid.uuid4()
            await _turn(s, conversation=thread, thread=thread, user=me)
            await s.flush()
            await page_operations.build_page(
                s, owner=me, title="how are we doing",
                analyses=[{"title": "how are we doing", "tool_calls": [SALES]}],
            )
            await s.flush()
            ids = await conversations_in_thread(s, me, thread)
            pins = (await s.execute(
                select(BobPin).where(BobPin.created_by == me,
                                        BobPin.conversation_id.in_(ids))
            )).scalars().all()
            assert pins == []

    asyncio.run(scenario())
