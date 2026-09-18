"""
Exact duplicate reads are served once per turn (Investigation V1, 2026-09-08).

NO DATABASE, NO API. The client is the scripted stub from the convergence-cap
tests, and the read dispatcher is replaced by a counter, so what is under
test is the loop's bookkeeping: which calls reach a tool, what a duplicate
is answered with, what it costs, and what it may never become.

WHAT WAS OBSERVED. Every exact repeat in the log — 34 groups, all time — was
a refusal retried verbatim: the model sent the same rejected arguments again
and got the same rejection. A repeat of a successful read had not happened
in 30 days, so this guard is a fence, not a fix: an investigation reads in
rounds, and a round that re-reads what the last one read is spending budget
on nothing.

THE RULES, EACH HELD BELOW.
  - Identity is call_key and nothing looser: sorted keys, and an omitted
    argument is not a None.
  - Successful, empty and refused reads are all recorded; a duplicate of any
    of them is answered with the ORIGINAL outcome, plus duplicate_of.
  - A duplicate gets its own seq and frames, is not pinnable, sends no rows,
    and spends none of the read budget.
  - The guard is per turn: a call in the replayed history is not a duplicate.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                          # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of # noqa: E402

SALES = {"group_by": "store", "date_range": "last_week", "metric": "net_sales"}
REFUSED = {"group_by": "day", "date_range": "last_week", "metric": "net_sales",
           "compare_to": "previous_period"}


def _drive(monkeypatch, replies, history=None):
    """Run the loop; return (frames, requests, executed) where executed lists every call a tool saw."""
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)
    executed: list[tuple[str, dict]] = []

    async def fake_read(name, args):
        executed.append((name, args))
        if args.get("compare_to") and args.get("group_by") == "day":
            reason = "compare_to='previous_period' cannot be grouped by day: lag series"
            return ({"rows": [], "meta": {"error": reason}}, reason, 1)
        if args.get("date_range") == "empty":
            return ({"rows": [], "meta": {"source_table": "new_transactions", "filters_applied": [],
                                          "snapshot_timestamp": f"2026-09-08T00:00:0{len(executed)}+00:00",
                                          "row_count": 0}}, None, 2)
        return ({"rows": [{"store": "Rockwell", "value": 1.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": f"2026-09-08T00:00:0{len(executed)}+00:00",
                          "row_count": 1}}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in bob_loop.run("why is Rockwell down?", history=history)]

    return asyncio.run(collect()), fake.messages.requests, executed


def _tool_results(request) -> list[dict]:
    """Every tool_result block the model was shown, in order, parsed."""
    out = []
    for m in request["messages"]:
        if m["role"] == "user" and isinstance(m["content"], list):
            for b in m["content"]:
                if b.get("type") == "tool_result":
                    out.append({"is_error": b.get("is_error", False),
                                "payload": json.loads(b["content"])})
    return out


# ---------------------------------------------------------------------------
# Across iterations
# ---------------------------------------------------------------------------

def test_a_read_repeated_in_a_later_iteration_is_served_not_run(monkeypatch):
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", "get_sales", dict(SALES))],
        [_TextBlock("Rockwell took ₱1 in the week to 2026-08-31.")],
    ])
    assert len(executed) == 1, "the tool ran once"

    calls = frames_of(frames, "tool_call")
    results = frames_of(frames, "tool_result")
    assert [c["seq"] for c in calls] == [0, 1]
    assert "duplicate_of" not in calls[0] and calls[1]["duplicate_of"] == 0
    assert results[1]["duplicate_of"] == 0
    assert results[1]["pinnable"] is False and results[1]["rows"] == [] and results[1]["rows_complete"] is False
    assert results[0]["pinnable"] is True

    # The model was answered with the ORIGINAL outcome, plus the two fields.
    shown = _tool_results(requests[-1])
    assert shown[0]["payload"]["rows"] == shown[1]["payload"]["rows"]
    assert shown[1]["payload"]["meta"]["duplicate_of"] == 0
    assert "not re-run" in shown[1]["payload"]["meta"]["duplicate_note"]
    assert (shown[1]["payload"]["meta"]["snapshot_timestamp"]
            == shown[0]["payload"]["meta"]["snapshot_timestamp"]), "the original read time"

    done = frames_of(frames, "done")[0]
    assert done["tool_calls"] == 2 and done["executed_calls"] == 1 and done["duplicate_reads"] == 1

    gaps = [p for sql, p in StubLog.instances[0].statements if "george.gaps" in sql]
    assert any(p[2] == "duplicate_read" for p in gaps)


def test_a_duplicate_within_one_batch_runs_once_and_names_its_original(monkeypatch):
    frames, _, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES), _ToolUse("tu-2", "get_sales", dict(SALES))],
        [_TextBlock("Done.")],
    ])
    assert len(executed) == 1
    calls = frames_of(frames, "tool_call")
    assert calls[1]["duplicate_of"] == 0
    assert frames_of(frames, "done")[0]["duplicate_reads"] == 1


# ---------------------------------------------------------------------------
# Every outcome is recorded, and re-served faithfully
# ---------------------------------------------------------------------------

def test_a_refused_read_repeated_is_the_same_refusal_without_a_second_attempt(monkeypatch):
    """The observed pattern: the model retries a refusal verbatim."""
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", REFUSED)],
        [_ToolUse("tu-2", "get_sales", dict(REFUSED))],
        [_TextBlock("That comparison cannot be grouped by day.")],
    ])
    assert len(executed) == 1
    shown = _tool_results(requests[-1])
    assert shown[0]["is_error"] and shown[1]["is_error"], "still a refusal, both times"
    assert shown[1]["payload"]["meta"]["error"] == shown[0]["payload"]["meta"]["error"]
    assert shown[1]["payload"]["meta"]["duplicate_of"] == 0
    results = frames_of(frames, "tool_result")
    assert results[1]["error"] == results[0]["error"] and results[1]["pinnable"] is False


def test_an_empty_read_repeated_is_the_same_empty_result(monkeypatch):
    empty = {**SALES, "date_range": "empty"}
    _, requests, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", empty)],
        [_ToolUse("tu-2", "get_sales", dict(empty))],
        [_TextBlock("Nothing traded.")],
    ])
    assert len(executed) == 1
    shown = _tool_results(requests[-1])
    assert shown[1]["payload"]["rows"] == [] and shown[1]["payload"]["meta"]["duplicate_of"] == 0


# ---------------------------------------------------------------------------
# Identity is call_key, exactly
# ---------------------------------------------------------------------------

def test_argument_order_does_not_make_a_new_call(monkeypatch):
    reordered = {"metric": "net_sales", "date_range": "last_week", "group_by": "store"}
    _, _, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", "get_sales", reordered)],
        [_TextBlock("Done.")],
    ])
    assert len(executed) == 1


def test_an_omitted_argument_and_an_explicit_none_are_different_calls(monkeypatch):
    """Nothing looser than call_key: get_movement's store=None means every location."""
    _, _, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", "get_sales", {**SALES, "top_n": None})],
        [_TextBlock("Done.")],
    ])
    assert len(executed) == 2


def test_a_changed_argument_is_a_fresh_read(monkeypatch):
    _, _, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", "get_sales", {**SALES, "compare_to": "previous_period"})],
        [_TextBlock("Done.")],
    ])
    assert len(executed) == 2


# ---------------------------------------------------------------------------
# A duplicate spends no budget
# ---------------------------------------------------------------------------

def test_duplicates_do_not_count_against_the_read_budget(monkeypatch):
    n = bob_loop.MAX_TOOL_CALLS
    uniques = [_ToolUse(f"tu-{i}", "get_sales", {**SALES, "top_n": i + 1}) for i in range(n - 1)]
    frames, _, executed = _drive(monkeypatch, [
        uniques,                                                    # 11 executed
        [_ToolUse("tu-dup", "get_sales", {**SALES, "top_n": 1})],   # a duplicate: free
        [_ToolUse("tu-last", "get_sales", {**SALES, "top_n": 99})], # the 12th executed read
        [_TextBlock("Done.")],
    ])
    assert len(executed) == n, "eleven, then the twelfth; the duplicate cost nothing"
    assert frames_of(frames, "warning") == [], "no convergence cap"
    done = frames_of(frames, "done")[0]
    assert done["tool_calls"] == n + 1 and done["executed_calls"] == n and done["duplicate_reads"] == 1


def test_the_cap_counts_executed_reads_and_the_duplicate_is_still_served_past_it(monkeypatch):
    n = bob_loop.MAX_TOOL_CALLS
    uniques = [_ToolUse(f"tu-{i}", "get_sales", {**SALES, "top_n": i + 1}) for i in range(n)]
    frames, requests, executed = _drive(monkeypatch, [
        uniques,                                                    # 12 executed: budget spent
        [_ToolUse("tu-dup", "get_sales", {**SALES, "top_n": 1})],   # duplicate, not a new read
        [_TextBlock("Done.")],
    ])
    assert len(executed) == n
    # The duplicate batch carried no NEW reads, so the cap did not fire on it.
    assert frames_of(frames, "warning") == []
    shown = _tool_results(requests[-1])
    assert shown[-1]["payload"]["meta"]["duplicate_of"] == 0


# ---------------------------------------------------------------------------
# Per turn only
# ---------------------------------------------------------------------------

def test_a_call_in_the_replayed_history_is_not_a_duplicate(monkeypatch):
    history = [
        {"role": "user", "text": "net sales by store last week?"},
        {"role": "bob", "text": "Rockwell took ₱1.", "tool_calls": [{"tool": "get_sales", "arguments": SALES}]},
    ]
    frames, _, executed = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", dict(SALES))],
        [_TextBlock("Still ₱1.")],
    ], history=history)
    assert len(executed) == 1, "a later user turn re-reads freely"
    assert frames_of(frames, "done")[0]["duplicate_reads"] == 0
