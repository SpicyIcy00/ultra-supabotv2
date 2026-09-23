"""
A BOUND COSTS NO ROUND, AND A TURN ALWAYS LEAVES A RECORD (D3, 2026-09-23).

Three things the owner found on the live build, held here.

1. *"why is it getting declined is that adding to the time?"* — it was. Once
   the call that answers a question of this size has run
   (`composition.size.kinds.<size>.answered_by`), every further read is
   refused; on 2026-09-23 06:31 the round that asked for two of them cost
   10.8 s of an 82.8 s answer. The bound stays. What goes is the ASKING: the
   reading tools leave the schema, so the round that would have asked composes
   instead.

2. A read a bound refused is not a failed read. Nothing reached the database
   and no tool declined anything, so the frame says which bound refused it and
   the room's trail does not draw it as work that went wrong.

3. *"it hung there i had to refresh."* — the turn of 06:44 left five rows in
   george.tool_calls under a conversation_id with no row in
   george.conversations and no post in the river. A generator that is CLOSED
   raises GeneratorExit at its live `yield`, which no `except Exception`
   catches, so nothing after the loop's try ever ran. The record is now
   written on that way out too.

NO DATABASE, NO API: the client is the scripted stub from the convergence-cap
test and the tools are dispatched by a fake.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                            # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse          # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of  # noqa: E402
from tools._common import load_defs, req                                      # noqa: E402

DEFS = load_defs()


def _drive(monkeypatch, replies, question="why is Rockwell down?"):
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"store": "Rockwell", "value": 1.0, "baseline": 2.0,
                           "change": -1.0, "change_pct": -50.0, "direction": "down",
                           "baseline_status": "ok"}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-23T00:00:00+00:00",
                          "row_count": 1}}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in bob_loop.run(question)]

    return asyncio.run(collect()), fake.messages.requests


def _tool_names(request: dict) -> set[str]:
    return {str(t.get("name")) for t in (request.get("tools") or [])}


# ---------------------------------------------------------------------------
# 1 and 2: the bound takes the reads away instead of refusing them
# ---------------------------------------------------------------------------

def test_the_reads_leave_the_schema_once_one_call_has_answered(monkeypatch):
    _frames, requests = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "Rockwell"})],
        [_TextBlock("Rockwell fell on traffic.")],
    ])
    assert len(requests) >= 2, "the turn made only one request"
    first, after = _tool_names(requests[0]), _tool_names(requests[1])
    assert "get_sales" in first and "get_change" in first, (
        "the first request is the schema as it always was")
    assert not (after & {"get_sales", "get_change", "get_stock", "get_stock_history"}), (
        "a read was still offered after the call that answers the question whole — "
        "so he can ask for it, and the refusal costs the person a round")
    # What the bound never refused is still there to be called.
    assert bob_loop.COMPOSE_TOOL in after, "compose went with the reads"
    assert after, "the request was left with no tools at all"


def test_he_is_told_why_the_reads_went(monkeypatch):
    _frames, requests = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "Rockwell"})],
        [_TextBlock("Rockwell fell on traffic.")],
    ])
    said = "".join(
        block.get("text", "")
        for message in requests[1]["messages"] if isinstance(message.get("content"), list)
        for block in message["content"]
        if isinstance(block, dict) and block.get("type") == "text"
    )
    assert "get_change" in said and "no longer offered" in said, (
        "the reads vanished from the schema and nothing said why")


def test_a_read_a_bound_refused_says_which_bound(monkeypatch):
    frames, _requests = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "Rockwell"})],
        # The stub asks anyway — a batch already in flight when the bound
        # closed. The refusal is still the backstop, and it is not a failure.
        [_ToolUse("r1", "get_stock_history", {"view": "stockouts", "store": "Rockwell"})],
        [_TextBlock("Rockwell fell on traffic.")],
    ])
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert refused, "the bound refused nothing"
    assert all(r.get("refused_by") for r in refused), (
        "a read refused by a bound must say so on the frame — the room draws one "
        "that does not as a read that declined, and keeps it on screen")
    assert req(DEFS, "composition.size.kinds.focused.answered_by") == ["get_change"]


# ---------------------------------------------------------------------------
# 3: the turn nobody is listening to any more
# ---------------------------------------------------------------------------

def test_a_turn_whose_client_went_away_still_writes_its_record(monkeypatch):
    """The owner's refresh must not be how a turn disappears."""
    fake = FakeClient([[_ToolUse("c1", "get_change", {"store": "Rockwell"})],
                       [_TextBlock("Rockwell fell on traffic.")]])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [], "meta": {"source_table": "new_transactions",
                                      "filters_applied": [], "row_count": 0,
                                      "snapshot_timestamp": "2026-09-23T00:00:00+00:00"}},
                None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def walk_away():
        turn = bob_loop.run("why is Rockwell down?")
        seen = 0
        async for _frame in turn:
            seen += 1
            if seen == 2:          # the client goes: a refresh, a closed tab
                break
        await turn.aclose()        # what the server does to an abandoned stream

    asyncio.run(walk_away())

    log = StubLog.instances[0]
    written = [sql for sql, _params in log.statements]
    assert any("INSERT INTO george.conversations" in sql for sql in written), (
        "a turn whose client went away left tool calls in the log and no "
        "conversation row — from his side it hung, from ours it never happened")
    assert any("INSERT INTO george.posts" in sql for sql in written), (
        "no post means no thread address to come back to after the refresh")
    row = next(params for sql, params in log.statements
               if "INSERT INTO george.conversations" in sql)
    assert "abandoned" in row, "the record does not say the turn ended that way"
