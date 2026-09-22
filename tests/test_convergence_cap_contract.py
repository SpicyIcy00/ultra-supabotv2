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

from agent import loop as bob_loop                                          # noqa: E402
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
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(bob_loop, "_call_tool", _fake_read)

    async def fake_write(name, args, ctx):
        writes.append((name, args))
        return ({"rows": [{"pin_id": "p-1", "title": "Net sales", "page": None,
                           "pins_on_page": 1, "tool_calls": []}], "meta": {}}, None, 2)

    monkeypatch.setattr(bob_loop, "_call_write_tool", fake_write)

    async def writer(spec):                     # presence enables pin_answer
        raise AssertionError("not reached: _call_write_tool is stubbed")

    # A BROAD QUESTION (W1.1, 2026-09-22): these hold the convergence cap on
    # CALLS, and a narrower question now meets its size's budget of queries
    # first (composition.size) — held on its own in test_answer_size_contract.
    async def collect():
        return [f async for f in bob_loop.run("how are we doing?", pin_writer=writer)]

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
        _reads(bob_loop.MAX_TOOL_CALLS + 1),                     # 13 reads at once
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
    n = bob_loop.MAX_TOOL_CALLS + 1
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


# ---------------------------------------------------------------------------
# The budget is READS (2026-09-18)
# ---------------------------------------------------------------------------

def test_a_write_does_not_spend_the_read_budget(monkeypatch):
    """
    The cap counted every call, so a turn that drew its board and recorded a
    view had two fewer reads than the prompt promised — nine reads plus a
    compose and a belief met the cap at the edge of the investigation. The
    owner: "cost should not hold us back in functionality". Here the budget
    minus one reads, a pin, then one more read: every read runs.
    """
    writes: list = []
    n = bob_loop.MAX_TOOL_CALLS - 1
    frames, requests = _drive(monkeypatch, [
        _reads(n),
        [_ToolUse("tu-pin", "pin_answer", {"title": "Net sales", "tool_calls": []})],
        _reads(1, start=n),
        [_TextBlock("Pinned, and the last shop read.")],
    ], writes)

    assert [w[0] for w in writes] == ["pin_answer"]
    assert "convergence_cap" not in [w["reason"] for w in frames_of(frames, "warning")]
    assert not [r for r in frames_of(frames, "tool_result") if r["error"]]
    _assert_every_tool_use_is_answered(requests[-1]["messages"])


def test_the_forced_answer_is_never_asked_to_name_a_tool():
    """P2S.7: the cap's instruction asked for "the single grouped or ranked
    call — naming the tool and arguments", and the owner was shown
    `get_sales(metric='product_revenue', …)` (verification/p2s6-gate-2.json).
    Rule 9 holds on the loop's own instructions too."""
    source = open("agent/loop.py", encoding="utf-8").read()
    body = source.split('f"STOP CALLING TOOLS.')[1].split("}]")[0]
    assert "naming the tool" not in body
    assert "no\n" in body or "no tool" in body.replace('"\n', "").replace('                            "', "")


# ---------------------------------------------------------------------------
# 6. A compose after the budget runs, beside the read the cap refuses
# ---------------------------------------------------------------------------

def test_a_compose_in_the_same_batch_as_a_refused_read_still_runs(monkeypatch):
    """
    2026-09-21 00:25, the first live page: 22 reads in three rounds, then
    `compose` and `record_belief` in one batch. The cap counted the compose as
    more searching and refused the whole batch, so the page he had composed
    never reached the board and the room drew the machine's. A compose is the
    act of finishing; the reads in its batch are refused, it is not.
    """
    writes: list = []
    frames, requests = _drive(monkeypatch, [
        _reads(bob_loop.MAX_TOOL_CALLS + 1),
        [_ToolUse("tu-read-more", "get_sales", {"group_by": "store", "date_range": "last_week"}),
         _ToolUse("tu-compose", "compose", {"blocks": [
             {"op": "put", "key": "a", "seq": 0, "kind": "figure", "weight": "lead", "claim": "one"}]})],
        [_TextBlock("Here it is.")],
    ], writes)

    results = frames_of(frames, "tool_result")
    refused = [r for r in results if r.get("error")]
    assert [r["tool"] for r in refused] == ["get_sales"], "only the read is refused"
    assert "Not run" in refused[0]["error"]
    composed = [f for f in frames_of(frames, "compose") if not f.get("default")]
    assert composed and "a" in [b["key"] for b in composed[-1]["blocks"]]
    assert frames_of(frames, "done")[0]["status"] == "ok"
    _assert_every_tool_use_is_answered(requests[-1]["messages"])


# ---------------------------------------------------------------------------
# 7. A compose that names the claim and says nothing is asked to finish
# ---------------------------------------------------------------------------

def test_a_compose_that_names_the_claim_and_says_nothing_is_asked_to_finish(monkeypatch):
    """
    2026-09-21, the first live page: three composes-only rounds, each naming
    the same claim, each writing nothing beside it, and the answer in a fourth
    round — 53.9 s, 24.6 s and 26.6 s of the 156 the owner waited. The settle
    rule already ends the turn on a composes-only round that names the claim
    WITH his words; this is the reminder when the words are missing, once.
    """
    writes: list = []
    frames, requests = _drive(monkeypatch, [
        _reads(2),
        [_ToolUse("tu-c1", "compose", {
            "blocks": [{"op": "put", "key": "a", "seq": 0, "kind": "figure",
                        "weight": "lead", "claim": "one"}],
            "reading": {"claim": "net sales are down on the week"}})],
        [_TextBlock("Down on the week.")],
    ], writes)

    # The last request carries the whole conversation, so it is the one to
    # count in: an earlier request holds a prefix of the same messages.
    said = [b["text"] for m in requests[-1]["messages"]
            if m["role"] == "user" and isinstance(m["content"], list)
            for b in m["content"] if b.get("type") == "text"]
    # Once per turn, and never a refusal: the compose itself stood.
    assert len([t for t in said if "Write the answer NOW" in t]) == 1, said
    composed = [f for f in frames_of(frames, "compose") if not f.get("default")]
    assert composed and "a" in [b["key"] for b in composed[-1]["blocks"]]
    assert frames_of(frames, "done")[0]["status"] == "ok"

