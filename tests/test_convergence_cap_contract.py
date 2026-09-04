"""
The convergence cap refuses more SEARCHING, not the act of finishing.

NO DATABASE, NO API. The Anthropic client is a stub that returns scripted
content blocks — tool_use blocks included — and the tool dispatchers are
replaced, so what is under test is the loop's bookkeeping.

Two things went wrong on 2026-09-04, in one turn. A deliberate 19-call
fan-out (per-SKU movement; no grouped call exists) was followed by one
save_workflow, and the cap refused the save: the budget had been spent, and
the cap did not distinguish "more reads" from "save what I have". Worse, the
refusal appended a plain user message after an assistant turn whose tool_use
blocks had no tool_result, and the next request was rejected outright —
"tool_use ids were found without tool_result blocks" — so the whole turn
ended as an api_error with the save never attempted.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                          # noqa: E402
from tests.test_loop_correction_contract import _Final, _Stream, _TextBlock, frames_of  # noqa: E402


# ---------------------------------------------------------------------------
# A stub that can emit tool_use blocks
# ---------------------------------------------------------------------------

class _ToolUse:
    def __init__(self, id_, name, input_):
        self.type, self.id, self.name, self.input = "tool_use", id_, name, input_


class _BlocksStream(_Stream):
    """One text delta (possibly empty), then a final message of scripted blocks."""

    def __init__(self, blocks):
        text = "".join(b.text for b in blocks if getattr(b, "type", "") == "text")
        super().__init__(text)
        self._blocks = blocks

    async def get_final_message(self):
        final = _Final("")
        final.content = self._blocks
        return final


class _Messages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def stream(self, **kwargs):
        self.requests.append(kwargs)
        reply = self.replies.pop(0) if self.replies else [_TextBlock("")]
        return _BlocksStream(reply)


class FakeClient:
    def __init__(self, replies):
        self.messages = _Messages(replies)


def _reads(n, start=0):
    return [_ToolUse(f"tu-read-{start + i}", "get_sales",
                     {"group_by": "store", "date_range": "yesterday", "top_n": start + i + 1})
            for i in range(n)]


async def _fake_read(name, args):
    return ({"rows": [{"value": 1.0}],
             "meta": {"source_table": "new_transactions", "filters_applied": [],
                      "snapshot_timestamp": "2026-09-04T00:00:00+00:00", "row_count": 1}},
            None, 3)


def _drive(monkeypatch, replies, writes: list):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(george_loop, "_call_tool", _fake_read)

    async def fake_write(name, args, ctx):
        writes.append((name, args))
        return ({"rows": [{"pin_id": "p-1", "title": "Net sales", "page": None,
                           "pins_on_page": 1, "tool_calls": []}], "meta": {}}, None, 2)

    monkeypatch.setattr(george_loop, "_call_write_tool", fake_write)

    async def writer(spec):                     # presence enables pin_answer
        raise AssertionError("not reached: _call_write_tool is stubbed")

    async def collect():
        return [f async for f in george_loop.run("net sales by store?", pin_writer=writer)]

    return asyncio.run(collect()), fake.messages.requests


def _assert_every_tool_use_is_answered(messages: list[dict]) -> None:
    """The API's structural rule: tool_use blocks get tool_results in the next message."""
    for i, m in enumerate(messages):
        if m["role"] != "assistant" or not isinstance(m["content"], list):
            continue
        ids = {b.id for b in m["content"] if getattr(b, "type", "") == "tool_use"}
        if not ids:
            continue
        nxt = messages[i + 1]
        assert nxt["role"] == "user" and isinstance(nxt["content"], list), \
            f"message {i}: tool_use followed by {nxt['role']} text, not tool_results"
        answered = {b["tool_use_id"] for b in nxt["content"] if b.get("type") == "tool_result"}
        assert ids <= answered, f"message {i}: unanswered tool_use ids {ids - answered}"


# ---------------------------------------------------------------------------
# 1. A write after the budget is spent goes through
# ---------------------------------------------------------------------------

def test_a_write_after_the_budget_is_not_refused(monkeypatch):
    writes: list = []
    frames, requests = _drive(monkeypatch, [
        _reads(george_loop.MAX_TOOL_CALLS + 1),                     # 13 reads at once
        [_TextBlock("Here they are. "),
         _ToolUse("tu-pin", "pin_answer", {"title": "Net sales", "tool_calls": []})],
        [_TextBlock("Pinned “Net sales” with no page. The tile re-runs its 13 calls.")],
    ], writes)

    assert [w[0] for w in writes] == ["pin_answer"]
    assert frames_of(frames, "warning") == []          # no convergence_cap
    assert frames_of(frames, "pinned")[0]["pin_id"] == "p-1"
    assert frames_of(frames, "done")[0]["status"] == "ok"
    _assert_every_tool_use_is_answered(requests[-1]["messages"])


# ---------------------------------------------------------------------------
# 2. More reads after the budget are refused — and still answered
# ---------------------------------------------------------------------------

def test_reads_past_the_budget_are_refused_with_tool_results(monkeypatch):
    writes: list = []
    n = george_loop.MAX_TOOL_CALLS + 1
    frames, requests = _drive(monkeypatch, [
        _reads(n),
        _reads(2, start=n),                                        # two more
        [_TextBlock("Partial: 13 stores read; the two extra were not run.")],
    ], writes)

    warning = frames_of(frames, "warning")[0]
    assert warning["reason"] == "convergence_cap" and warning["tool_calls"] == n
    assert writes == []

    # The two refused calls are visible as calls that errored, not as silence.
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert len(refused) == 2 and all("Not run" in r["error"] for r in refused)
    assert refused[0]["seq"] == n and refused[1]["seq"] == n + 1

    # And answered in the message structure, so the next request is valid.
    msgs = requests[-1]["messages"]
    _assert_every_tool_use_is_answered(msgs)
    cap_msg = next(m for m in msgs if m["role"] == "user" and isinstance(m["content"], list)
                   and any(b.get("type") == "text" and "STOP CALLING TOOLS" in b["text"]
                           for b in m["content"]))
    kinds = [b.get("type") for b in cap_msg["content"]]
    assert kinds == ["tool_result", "tool_result", "text"], kinds
    assert all(b.get("is_error") for b in cap_msg["content"][:2])

    assert frames_of(frames, "done")[0]["status"] == "ok"


def test_the_budget_is_still_a_budget_for_reads(monkeypatch):
    """Sanity: under the cap nothing is refused and no warning is raised."""
    writes: list = []
    frames, requests = _drive(monkeypatch, [
        _reads(3),
        _reads(3, start=3),
        [_TextBlock("Six reads, answered.")],
    ], writes)
    assert frames_of(frames, "warning") == []
    assert not [r for r in frames_of(frames, "tool_result") if r["error"]]
    _assert_every_tool_use_is_answered(requests[-1]["messages"])
