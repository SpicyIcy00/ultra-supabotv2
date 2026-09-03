"""
Live tests for running a pin: the four tile states, against real data.

NEEDS THE DATABASE — skipped by conftest with the rest of the golden suite when
GEORGE_DATABASE_URL is unset. The runner is where a pin either stays honest or
quietly lies, and none of that is decidable without running the tools.

A tile has to render four things, and every one of them is a normal 200:
    ok          figures with their receipts
    refused     the tool declining to mislead — a real answer, kept verbatim
    unrunnable  the pin has rotted; say what changed
    failed      timeout or crash, with when it last worked
"""

from __future__ import annotations

import asyncio

import pytest

from app.services.pin_runner import run_call, run_pin


def _run(coro):
    return asyncio.run(coro)


SALES = {
    "tool": "get_sales",
    "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"},
}


# ---------------------------------------------------------------------------
# ok — and the receipts a tile needs
# ---------------------------------------------------------------------------

def test_a_working_pin_returns_rows_and_full_receipts():
    r = _run(run_call(SALES))
    assert r["status"] == "ok", r.get("error")
    assert r["rows"]

    # The tile must be able to satisfy "every number is inspectable" and "no
    # number displays without a timestamp" from this alone — which is why the
    # runner returns full meta, not the summary the chat tool_result frame sends.
    meta = r["meta"]
    assert meta["source_table"]
    assert meta["snapshot_timestamp"]
    assert meta["filters_applied"]
    assert meta["definitions_version"]


def test_a_relative_window_resolves_at_run_time():
    """
    A pin storing "last_month" re-runs over a MOVING window — that is the point
    of a pin. The tile must render the resolved meta.window, not the stored
    argument, or "last month" silently means whatever it meant when pinned.
    """
    r = _run(run_call(SALES))
    window = r["meta"]["window"]
    assert window["kind"] == "preset"
    assert window["name"] == "last_month"
    # The resolved bounds are what the tile shows.
    assert "includes_partial_day" in window


def test_results_are_json_serialisable():
    """Decimals and datetimes come back from the tools; a tile gets JSON."""
    import json

    r = _run(run_call(SALES))
    assert isinstance(json.dumps(r), str)


# ---------------------------------------------------------------------------
# refused — a real answer, not an error
# ---------------------------------------------------------------------------

def test_a_refusing_tool_is_refused_not_failed():
    """
    Destination scoping on the inferred basis is refused by design. A tile must
    show that refusal in the tool's own words: it is the tool declining to
    produce a misleading number, which is information.
    """
    r = _run(run_call({
        "tool": "get_movement",
        "arguments": {"store": "AJI BARN", "to_store": "Rockwell",
                      "sku": "SH1", "basis": "balance_delta"},
    }))
    assert r["status"] == "refused"
    assert "not answerable" in r["error"]
    assert r["rows"] == []


def test_a_refusal_keeps_its_own_message():
    r = _run(run_call({"tool": "get_movement", "arguments": {"store": "AJI BARN"}}))
    assert r["status"] == "refused"
    # get_movement requires sku or product_id and says why.
    assert "sku" in r["error"].lower()


# ---------------------------------------------------------------------------
# unrunnable — the pin has rotted
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "call, expect",
    [
        ({"tool": "get_revenue", "arguments": {}}, "no longer one of George's tools"),
        ({"tool": "get_sales", "arguments": {**SALES["arguments"], "metrik": 1}},
         "unexpected keyword argument"),
        ({"tool": "get_sales", "arguments": {**SALES["arguments"], "metric": "gross_profit"}},
         "no longer a valid value"),
    ],
    ids=["tool-gone", "argument-gone", "value-gone"],
)
def test_a_rotted_pin_is_unrunnable_with_a_reason(call, expect):
    r = _run(run_call(call))
    assert r["status"] == "unrunnable"
    assert expect in r["error"]
    # It never reached the database, so there is nothing to show but the reason.
    assert r["rows"] == [] and r["meta"] == {}


# ---------------------------------------------------------------------------
# Rolling up a whole pin
# ---------------------------------------------------------------------------

def test_pin_status_is_the_worst_of_its_calls():
    out = _run(run_pin([SALES, {"tool": "get_revenue", "arguments": {}}]))
    assert out["status"] == "unrunnable"
    # ...but the working call still returned its figures. One dead call must not
    # hide the others.
    assert [r["status"] for r in out["results"]] == ["ok", "unrunnable"]
    assert out["results"][0]["rows"]


def test_a_pin_of_only_good_calls_is_ok():
    out = _run(run_pin([SALES]))
    assert out["status"] == "ok"
    assert len(out["results"]) == 1


def test_notices_are_flattened_for_the_tile():
    """
    A pinned tile CANNOT fail to surface a notice — no model stands between
    meta.notice and the screen, unlike chat where the loop has to nag and
    sometimes force caveats in.
    """
    out = _run(run_pin([{
        "tool": "get_purchasing",
        "arguments": {"measure": "completion_lead_days", "group_by": "supplier"},
    }]))
    assert out["status"] == "ok"
    kinds = {n["kind"] for n in out["notices"]}
    assert "completion_not_delivery" in kinds
    # The same notices are on the call that raised them, not only in the roll-up.
    assert out["results"][0]["notices"]


def test_calls_run_concurrently_rather_than_in_series():
    """A page of tiles loads them together; serial execution would show."""
    import time

    calls = [SALES, dict(SALES), dict(SALES)]
    started = time.perf_counter()
    out = _run(run_pin(calls))
    elapsed = time.perf_counter() - started
    slowest = max(r["duration_ms"] for r in out["results"]) / 1000.0
    assert out["status"] == "ok"
    # Generous: concurrency, not a stopwatch. Serial would be ~3x the slowest.
    assert elapsed < slowest * 2.5 + 2.0
