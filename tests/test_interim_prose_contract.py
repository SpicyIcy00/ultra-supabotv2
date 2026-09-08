"""
Interim prose is narration, not the answer (Investigation V1, 2026-09-08).

NO DATABASE, NO API. Scripted client, stubbed read, stubbed log.

THE DIVERGENCE THIS CLOSES. When an iteration emits text AND tool calls, the
text streamed to the client as ordinary deltas and accumulated into the
answer, while the loop's own `answer` was rebuilt from the LAST iteration's
deltas alone. So a person watching saw "Rockwell is down. Let me look at
the drivers." above the real answer, and the stored post had only the real
answer: the live conversation and the stored one disagreed about what George
concluded. An investigation makes this the common case, because a round of
reads is what follows a sentence like that.

Now the loop says so: after the interim deltas, before the tool_call frames,
an answer_reset with reason interim_prose. The client moves the text into
the activity disclosure and starts the answer again; the stored answer is
unchanged, and the two agree.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                          # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of # noqa: E402

INTERIM = "Rockwell is down. Let me look at the drivers."
FINAL = "Transactions held and ATP fell, so basket value is the stronger measured driver."
SALES = {"group_by": [], "date_range": "last_week", "metric": "net_sales",
         "compare_to": "previous_period"}


def _drive(monkeypatch, replies):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0, "baseline": 2.0, "change_pct": -50.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00", "row_count": 1}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("why is Rockwell down?")]

    return asyncio.run(collect())


def _events(frames):
    return [f.partition("\n")[0].removeprefix("event: ") for f in frames]


def test_text_before_a_tool_call_is_reset_as_interim_prose(monkeypatch):
    frames = _drive(monkeypatch, [
        [_TextBlock(INTERIM), _ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock(FINAL)],
    ])
    events = _events(frames)
    resets = frames_of(frames, "answer_reset")
    assert resets == [{"reason": "interim_prose"}]

    # Order: the interim deltas stream, THEN the reset, THEN the tool call.
    i_reset = events.index("answer_reset")
    i_call = events.index("tool_call")
    first_text = events.index("text")
    assert first_text < i_reset < i_call

    # The final text streams after the tools and is never reset.
    assert events.index("text", i_call) > i_call
    assert events.count("answer_reset") == 1


def test_an_answer_with_no_tool_calls_is_never_reset(monkeypatch):
    frames = _drive(monkeypatch, [[_TextBlock(FINAL)]])
    assert frames_of(frames, "answer_reset") == []


def test_a_tool_call_with_no_prose_is_not_reset(monkeypatch):
    frames = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock(FINAL)],
    ])
    assert frames_of(frames, "answer_reset") == []


def test_the_stored_answer_is_the_final_text_alone(monkeypatch):
    """What the river keeps is what the person is shown as the answer."""
    _drive(monkeypatch, [
        [_TextBlock(INTERIM), _ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock(FINAL)],
    ])
    log = StubLog.instances[0]
    conv = [p for sql, p in log.statements if "INSERT INTO george.conversations" in sql]
    assert len(conv) == 1
    params = [p for p in conv[0] if isinstance(p, str)]
    assert FINAL in params
    assert not any(INTERIM in p for p in params)
