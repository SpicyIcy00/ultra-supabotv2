"""
A stored answer keeps the calls behind it — exactly as they ran, or not at all.

WHY THIS EXISTS. A live turn can be pinned from its tool_call frames; a stored
post could not be pinned at all, so persistence ended at the reload. The loop
now writes `calls` beside the charted snapshot: every READ call that ran
without error, with the arguments the tool accepted (dict(b.input), the same
object log.tool_call records).

THE PROPERTY UNDER TEST is that nothing is ever reconstructed. A call that
refused is absent, a write is absent, a workflow run is absent, and a post
written before this existed has no `calls` at all — which the client reads as
"not pinnable" (postShape.storedCalls) and never fills in.

NO DATABASE, NO API — the client is a stub and the tool dispatcher is replaced,
as test_chart_rows_contract does. ConversationLog.posts is captured so the
payload the loop would have written can be read without a log database.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                          # noqa: E402
from agent import write_tools                                                  # noqa: E402
from tests.test_convergence_cap_contract import (                              # noqa: E402
    FakeClient,
    _ToolUse,
)
from tests.test_loop_correction_contract import _TextBlock                     # noqa: E402

META = {
    "source_table": "new_transactions",
    "filters_applied": ["is_cancelled = false   # metrics.yaml: filters.cancelled"],
    "snapshot_timestamp": "2026-09-04T00:00:00+00:00",
    "metric_unit": "PHP",
}

ARGS_A = {"metric": "net_sales", "group_by": "store", "date_range": "last_7_days"}
ARGS_B = {"metric": "transactions", "group_by": "store", "date_range": "last_7_days",
          "filters": {"store": "Fame"}}


def _drive(monkeypatch, tool_uses, outcomes, captured: list, writer=None):
    """
    One turn: the model makes `tool_uses`, then answers. `outcomes` maps a tool
    name to (rows, error). The posts() call is captured instead of written.
    """
    fake = FakeClient([tool_uses, [_TextBlock("Here are the figures.")]])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)

    async def fake_read(name, args):
        rows, error = outcomes[name]
        if error:
            return ({"rows": [], "meta": {"error": error}}, error, 3)
        return ({"rows": list(rows), "meta": {**META, "row_count": len(rows)}}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def fake_write(name, args, ctx):
        return ({"rows": [{"pin_id": "p-1", "title": "T", "page": None,
                           "pins_on_page": 1, "tool_calls": []}], "meta": {}}, None, 2)

    monkeypatch.setattr(bob_loop, "_call_write_tool", fake_write)

    def capture(self, **kw):
        captured.append(kw)

    monkeypatch.setattr(bob_loop.ConversationLog, "posts", capture)

    async def collect():
        kwargs = {"pin_writer": writer} if writer else {}
        return [f async for f in bob_loop.run("figures?", **kwargs)]

    return asyncio.run(collect())


def _rows(n):
    return [{"store": f"S{i}", "value": 100.0 + i} for i in range(n)]


# ---------------------------------------------------------------------------
# What is stored
# ---------------------------------------------------------------------------

def test_the_calls_that_ran_are_stored_with_the_arguments_that_ran(monkeypatch):
    captured: list = []
    _drive(
        monkeypatch,
        [_ToolUse("tu-1", "get_sales", ARGS_A), _ToolUse("tu-2", "get_sales", ARGS_B)],
        {"get_sales": (_rows(3), None)},
        captured,
    )
    [kw] = captured
    calls = kw["calls"]
    assert [c["tool"] for c in calls] == ["get_sales", "get_sales"]
    # Byte-for-byte the model's input, not a summary, not a canonical form.
    assert calls[0]["arguments"] == ARGS_A
    assert calls[1]["arguments"] == ARGS_B
    # Ordered by the conversation-global seq, which the charted entries share.
    assert [c["seq"] for c in calls] == sorted(c["seq"] for c in calls)


def test_every_charted_entry_names_its_call(monkeypatch):
    """What the post draws is reproducible from what the post stores."""
    captured: list = []
    _drive(monkeypatch, [_ToolUse("tu-1", "get_sales", ARGS_A)],
           {"get_sales": (_rows(3), None)}, captured)
    [kw] = captured
    seqs = {c["seq"] for c in kw["calls"]}
    for entry in kw["charted"]:
        assert entry["seq"] in seqs
        assert entry["arguments"] == ARGS_A


def test_a_large_result_is_not_charted_but_its_call_is_still_stored(monkeypatch):
    """
    The chart is all-or-none (rows over the cap send nothing). The CALL still
    ran and returned, so a pin can re-run it: the two are different facts.
    """
    captured: list = []
    _drive(monkeypatch, [_ToolUse("tu-1", "get_sales", ARGS_A)],
           {"get_sales": (_rows(bob_loop.MAX_ROWS_TO_CLIENT + 1), None)}, captured)
    [kw] = captured
    assert kw["charted"] == []
    assert [c["arguments"] for c in kw["calls"]] == [ARGS_A]


# ---------------------------------------------------------------------------
# What is NOT stored
# ---------------------------------------------------------------------------

def test_a_refused_call_is_not_stored(monkeypatch):
    """No result was produced, so there are no 'arguments that produced it'."""
    captured: list = []
    _drive(monkeypatch, [_ToolUse("tu-1", "get_sales", ARGS_A)],
           {"get_sales": ([], "No such store 'Atlantis'.")}, captured)
    [kw] = captured
    assert kw["calls"] == []
    assert kw["charted"] == []


def test_a_refused_call_beside_a_good_one_leaves_only_the_good_one(monkeypatch):
    captured: list = []
    _drive(
        monkeypatch,
        [_ToolUse("tu-1", "get_sales", ARGS_A), _ToolUse("tu-2", "get_stock", {"location": "X"})],
        {"get_sales": (_rows(2), None), "get_stock": ([], "Unknown location.")},
        captured,
    )
    [kw] = captured
    assert [(c["tool"], c["arguments"]) for c in kw["calls"]] == [("get_sales", ARGS_A)]


def test_a_write_is_never_stored_as_a_call(monkeypatch):
    """A pin describing the pin it made would be a pin that pins itself."""
    async def writer(spec):
        return {"pin_id": "p-1", "title": "T", "page": None, "created_by": "u",
                "created_at": "2026-09-07T00:00:00+00:00", "pins_on_page": 1}

    captured: list = []
    _drive(
        monkeypatch,
        [_ToolUse("tu-1", "get_sales", ARGS_A),
         _ToolUse("tu-2", "pin_answer", {"title": "T", "tool_calls": [
             {"tool": "get_sales", "arguments": ARGS_A}]})],
        {"get_sales": (_rows(2), None)},
        captured,
        writer=writer,
    )
    [kw] = captured
    assert "pin_answer" in write_tools.WRITE_TOOL_FUNCTIONS
    assert [c["tool"] for c in kw["calls"]] == ["get_sales"]


# ---------------------------------------------------------------------------
# The payload as written
# ---------------------------------------------------------------------------

def test_the_payload_carries_both_or_is_absent():
    payload = bob_loop._answer_payload
    assert payload(None, None) is None
    assert payload([], []) is None

    charted = [{"seq": 1, "tool": "get_sales", "arguments": ARGS_A, "rows": [{"value": 1}],
                "meta": META}]
    calls = [{"seq": 1, "tool": "get_sales", "arguments": ARGS_A}]
    assert json.loads(payload(charted, calls)) == {"charted": charted, "calls": calls}

    # Nothing drawn, something ran: still pinnable.
    assert json.loads(payload([], calls)) == {"calls": calls}


def test_a_legacy_payload_shape_is_still_producible_and_carries_no_calls():
    """
    Posts written before 2026-09-07 look exactly like this. The client must
    keep rendering them and must not offer a Pin for them — see
    postShape.test.ts, 'legacy'. This pins the shape so that test is testing
    something real.
    """
    charted = [{"seq": 1, "tool": "get_sales", "rows": [{"value": 1}], "meta": META}]
    legacy = json.loads(bob_loop._answer_payload(charted, None))
    assert legacy == {"charted": charted}
    assert "calls" not in legacy
