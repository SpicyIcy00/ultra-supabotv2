"""
What the cache breakpoints are, and why each one has the TTL it has (P0.6).

NO DATABASE, NO API. Scripted client, stubbed read, stubbed log.

WHY THIS FILE EXISTS. Until 2026-09-13 nothing asserted `cache_control` at all.
The placement was held by a comment, and the comment had already gone stale —
it said "Both TTLs are the default 5m" while the card raising them was open. A
breakpoint that moves, or a TTL that drifts, is invisible in every other suite:
the model receives byte-identical input either way and every answer still looks
right. Only the bill changes, and the bill is read once a week.

THE SHAPE, in render order — tools, then system, then messages:

    tools[-1]      explicit, 1h    ~9.2k tokens with system; does not change
    system[0]      explicit, 1h     between sessions, so it must survive the
                                    gap between them
    message tail   automatic, 5m   rewritten every iteration, and the
                                    iterations of a turn are seconds apart

Three of the four breakpoints allowed. The asymmetry is deliberate and is
tested here in both directions: raising the tail to 1h would double the write
price on the largest, most-rewritten block in the request and buy nothing.

MIXED TTLS ARE LEGAL IN EXACTLY THIS ORDER. Entries with the longer TTL must
render before shorter ones, and an explicit marker ON the last block with a TTL
differing from the top-level field's returns a 400. Both rules are structural —
they cannot be caught by reading an answer — so both are asserted below.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                          # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock            # noqa: E402

FIVE_MINUTES = {"type": "ephemeral"}          # the default: no ttl field
ONE_HOUR = {"type": "ephemeral", "ttl": "1h"}
SALES = {"group_by": "store", "date_range": "last_week", "metric": "net_sales"}
FINAL = "Rockwell leads on net sales; the rest are within the usual spread."


def _requests(monkeypatch, replies):
    """Drive one turn and return the kwargs of every request it made."""
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"store": "Rockwell", "value": 1.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-13T00:00:00+00:00", "row_count": 1}},
                None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in bob_loop.run("net sales by store?")]

    asyncio.run(collect())
    return fake.messages.requests


@pytest.fixture
def turn(monkeypatch):
    """A two-iteration turn: a read, then the answer. Both requests are captured."""
    reqs = _requests(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock(FINAL)],
    ])
    assert len(reqs) == 2, "the fixture needs more than one iteration to be worth asserting on"
    return reqs


def _markers_in_content(content) -> list[dict]:
    if not isinstance(content, list):
        return []
    return [b["cache_control"] for b in content
            if isinstance(b, dict) and b.get("cache_control")]


def _message_markers(messages) -> list[dict]:
    return [m for msg in messages for m in _markers_in_content(msg.get("content"))]


# ---------------------------------------------------------------------------
# The static prefix: written for an hour
# ---------------------------------------------------------------------------

def test_the_tools_array_is_written_for_an_hour_on_its_last_tool(turn):
    for req in turn:
        tools = req["tools"]
        marked = [(i, t) for i, t in enumerate(tools) if "cache_control" in t]
        assert len(marked) == 1, f"expected exactly one marked tool, got {len(marked)}"
        index, tool = marked[0]
        assert index == len(tools) - 1, "the marker must sit on the LAST tool"
        assert tool["cache_control"] == ONE_HOUR


def test_the_system_prompt_is_written_for_an_hour(turn):
    for req in turn:
        system = req["system"]
        assert len(system) == 1
        assert system[0]["cache_control"] == ONE_HOUR


def test_the_prefix_ttl_is_the_constant_and_the_constant_is_an_hour():
    # Named, so the two markers cannot drift apart, and pinned, so raising it
    # is a decision rather than an edit.
    assert bob_loop.PREFIX_TTL == "1h"


def test_the_tools_array_and_the_system_prompt_do_not_change_within_a_turn(turn):
    # The whole point of a prefix breakpoint: iteration 2 READS what iteration 1
    # wrote. A tool list or system prompt rebuilt per iteration would write a
    # fresh entry every time and never read one.
    first, second = turn
    assert first["tools"] == second["tools"]
    assert first["system"] == second["system"]


# ---------------------------------------------------------------------------
# The moving tail: stays at five minutes, on purpose
# ---------------------------------------------------------------------------

def test_the_moving_tail_keeps_the_default_five_minute_ttl(turn):
    # NOT an oversight. The tail is rewritten every iteration and the iterations
    # of a turn are seconds apart, so it never has to survive a gap — and it is
    # the largest block in the request, where a 2x write would actually cost.
    for req in turn:
        assert req["cache_control"] == FIVE_MINUTES
        assert "ttl" not in req["cache_control"]


# ---------------------------------------------------------------------------
# The two API rules that govern mixing them
# ---------------------------------------------------------------------------

def test_every_one_hour_breakpoint_renders_before_every_five_minute_one(turn):
    # The ordering rule: a longer-TTL entry must appear before any shorter one.
    # Render order is tools, then system, then messages — so this holds as long
    # as the only 5m breakpoint is the automatic one, which lands in messages.
    for req in turn:
        assert _message_markers(req["messages"]) == [], \
            "an explicit marker inside messages would render AFTER the 1h ones"


def test_no_explicit_marker_sits_on_the_last_block(turn):
    # The documented 400: an explicit marker on the last block whose TTL differs
    # from the top-level field's. The last block lives in the last message.
    for req in turn:
        last = req["messages"][-1]
        assert _markers_in_content(last.get("content")) == []


def test_three_breakpoints_are_used_of_the_four_allowed(turn):
    for req in turn:
        explicit = (sum("cache_control" in t for t in req["tools"])
                    + sum("cache_control" in b for b in req["system"])
                    + len(_message_markers(req["messages"])))
        automatic = 1 if req.get("cache_control") else 0
        assert explicit == 2
        assert explicit + automatic == 3, "4 is the cap; leave room"


# ---------------------------------------------------------------------------
# The lever that was refused
# ---------------------------------------------------------------------------

def test_the_row_cap_is_not_a_cost_lever(turn):
    # P0.6 considered cutting MAX_ROWS_TO_MODEL and refused: it reduces what
    # Bob can SEE, which is the product, not the bill. Held here so reopening
    # it has to be deliberate.
    assert bob_loop.MAX_ROWS_TO_MODEL == 200
