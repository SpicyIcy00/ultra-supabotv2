"""
Rows reach the client whole, or not at all.

WHY THIS EXISTS. Tool results streamed as summaries for as long as George has
existed — "raw rows never cross the wire" — because a call can return 200 wide
rows and streaming them would dwarf the answer. Charting an ANSWER needs the
rows anyway, and the alternative was a second detection path in the backend
deciding what is chartable. Detection stayed in the frontend, so the rows had
to move.

The safety property is the whole design: ALL OF THEM OR NONE. A chart drawn
from the first 120 of 900 rows is not a smaller chart, it is a different and
wrong one, asserting a shape the data does not have. So a result over the cap
sends no rows at all and says so, and pinShape refuses to chart it (see
pinShape.test.ts, "never charts a prefix").

NO DATABASE, NO API — the client is a stub and the tool dispatcher is replaced,
exactly as test_convergence_cap_contract does.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                          # noqa: E402
from tests.test_convergence_cap_contract import (                              # noqa: E402
    FakeClient,
    _ToolUse,
)
from tests.test_loop_correction_contract import _TextBlock, frames_of          # noqa: E402

META = {
    "source_table": "new_transactions",
    "filters_applied": ["is_cancelled = false   # metrics.yaml: filters.cancelled"],
    "snapshot_timestamp": "2026-09-04T00:00:00+00:00",
    "metric_unit": "PHP",
}


def _drive(monkeypatch, rows, tool="get_sales", error=None):
    """One turn: the model calls one read tool, then answers."""
    fake = FakeClient([
        [_ToolUse("tu-1", tool, {"group_by": "day", "date_range": "last_7_days"})],
        [_TextBlock("Sales rose through the week.")],
    ])
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)

    async def fake_read(name, args):
        payload = {"rows": list(rows), "meta": {**META, "row_count": len(rows)}}
        if error:
            return ({"rows": [], "meta": {"error": error}}, error, 3)
        return (payload, None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("sales by day?")]

    return asyncio.run(collect())


def _tool_result(frames) -> dict:
    return frames_of(frames, "tool_result")[0]


def _days(n):
    return [{"day": f"2026-09-{i + 1:02d}", "value": 100.0 + i} for i in range(n)]


# ---------------------------------------------------------------------------
# Under the cap: every row, and the meta the receipts line needs
# ---------------------------------------------------------------------------

def test_a_small_result_sends_every_row(monkeypatch):
    frames = _drive(monkeypatch, _days(7))
    payload = _tool_result(frames)

    assert payload["rows_complete"] is True
    assert len(payload["rows"]) == 7
    assert payload["rows"][0] == {"day": "2026-09-01", "value": 100.0}
    # The receipts line under a charted answer reads this, not a summary of it.
    assert payload["meta"]["source_table"] == "new_transactions"
    assert payload["meta"]["snapshot_timestamp"] == META["snapshot_timestamp"]


def test_the_boundary_row_count_is_still_whole(monkeypatch):
    frames = _drive(monkeypatch, _days(george_loop.MAX_ROWS_TO_CLIENT))
    payload = _tool_result(frames)
    assert payload["rows_complete"] is True
    assert len(payload["rows"]) == george_loop.MAX_ROWS_TO_CLIENT


# ---------------------------------------------------------------------------
# Over the cap: NOTHING, never a prefix
# ---------------------------------------------------------------------------

def test_a_large_result_sends_no_rows_at_all(monkeypatch):
    frames = _drive(monkeypatch, _days(george_loop.MAX_ROWS_TO_CLIENT + 1))
    payload = _tool_result(frames)

    assert payload["rows_complete"] is False
    assert payload["rows"] == [], "a prefix is a different chart, not a smaller one"
    # The count still travels: the answer can say how many rows there were
    # without being able to draw them.
    assert payload["row_count"] == george_loop.MAX_ROWS_TO_CLIENT + 1


def test_a_refusal_carries_no_rows_and_is_not_complete(monkeypatch):
    frames = _drive(monkeypatch, _days(3), error="No such store 'Atlantis'.")
    payload = _tool_result(frames)

    assert payload["error"] == "No such store 'Atlantis'."
    assert payload["rows"] == []
    assert payload["rows_complete"] is False
    assert payload["meta"] is None


# ---------------------------------------------------------------------------
# The model's own budget is a different budget
# ---------------------------------------------------------------------------

def test_the_client_cap_is_independent_of_the_model_cap(monkeypatch):
    """
    The model sees at most MAX_ROWS_TO_MODEL rows; the client sees all or none.
    Taking the model's truncated list for the wire would send a silent prefix of
    anything between the two caps.
    """
    assert george_loop.MAX_ROWS_TO_CLIENT < george_loop.MAX_ROWS_TO_MODEL

    n = george_loop.MAX_ROWS_TO_CLIENT + 1          # under the model's 200 cap
    frames = _drive(monkeypatch, _days(n))
    payload = _tool_result(frames)

    # The model was NOT truncated at this size, and the client still got nothing.
    assert payload["truncated"] is False
    assert payload["rows"] == []
    assert payload["rows_complete"] is False
