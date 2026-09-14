"""
Replay, against real data: the Done-when of P1.i, measured rather than assumed.

NEEDS THE DATABASE — skipped by conftest with the rest of the golden suite when
GEORGE_DATABASE_URL is unset. Nothing here writes: the post lookup and the
record are the application role's and are held by the contract suite; what is
live is the half that costs time, which is the tool running as george_ro.

    "last week" -> "August" on the stored OPUS call returns in < 1.5 s with
    correct receipts; a window still in progress is refused by name.

WHAT IS AND IS NOT IN THE 1.5 s. This times the read, which is the part that
costs anything: the endpoint adds two application-database statements around it
— reading the stored call off the post and appending the change to it —
measured at 33 ms each from this machine, against a 0.46 s read. Those two are
shape, not cost, and the contract suite holds their shape.

THE STORED CALL IS FABRICATED HERE AND THAT IS THE POINT. What the endpoint
reads off a post is a `{tool, arguments}` pair, and this is one — so the timing
and the receipts are the same timing and receipts a real post produces, without
a fixture turn having to be bought to get them.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.services.replay import board_frame, retarget
from app.services.pin_runner import run_call

# A call of the shape the loop records for "how did OPUS do last week?".
STORED = {
    "metric": "net_sales",
    "group_by": [],
    "date_range": "last_week",
    "filters": {"store": "OPUS"},
}

# The card says "August". A named month is an explicit half-open Manila window,
# which is the shape `date_range` documents beside its presets — and which the
# pin validator refused until P1.i corrected `_enum_for`.
AUGUST = ["2026-08-01", "2026-09-01"]

# P1.i's own number: a tap must feel like a tap, not like a question. Stated
# here so a failure names the figure it missed rather than just being slow.
BUDGET_S = 1.5

# THE FIRST READ OF A PROCESS IS NOT THE ONE A PERSON WAITS FOR, and one run
# of this file measured 6.12 s on it against 0.46 s on every read after —
# opening the connection, from a laptop, to a pooler in another region. The
# backend process is long-lived and warm by the time anybody taps anything, so
# the timed reads are warm ones and the warm-up is named rather than hidden.
# A budget asserted on one cold sample is a test that fails for a reason it is
# not about.
_MEASURE = 3


def _replay(argument, value, stored=None):
    args, was = retarget("get_sales", stored or STORED, argument, value)
    started = time.perf_counter()
    result = asyncio.run(run_call({"tool": "get_sales", "arguments": args}))
    return args, was, result, time.perf_counter() - started


def test_last_week_to_august_returns_inside_the_budget():
    args, was, result, _ = _replay("window", AUGUST)          # the warm-up
    assert was == "last_week"
    assert args["date_range"] == AUGUST
    assert result["status"] == "ok", result.get("error")

    times = sorted(_replay("window", AUGUST)[3] for _ in range(_MEASURE))
    median = times[len(times) // 2]
    assert median < BUDGET_S, (
        f"median {median:.2f}s over {_MEASURE} reads, against a {BUDGET_S}s "
        f"budget; all of them: {[round(t, 2) for t in times]}"
    )


def test_and_its_receipts_are_the_new_window_s():
    args, _, result, _ = _replay("window", AUGUST)
    meta = result["meta"]
    assert meta["source_table"]
    assert meta["snapshot_timestamp"], "UI rule 6: no number without a timestamp"
    applied = " ".join(str(f) for f in meta["filters_applied"])
    # The window that RAN, not the one the stored call named.
    assert "2026-08-01" in applied and "2026-09-01" in applied
    assert "last_week" not in applied
    # And the scope the stored call carried is still on it.
    assert "OPUS" in applied


def test_a_window_still_in_progress_is_refused_by_name():
    stored = {**STORED, "compare_to": "previous_period"}
    _, _, result, _ = _replay("window", "this_month", stored)
    assert result["status"] == "refused", result
    said = result["error"]
    assert "this_month" in said, said
    # Named, and with the closed window that answers the same question.
    assert "last_month" in said, said


def test_a_refusal_is_as_fast_as_an_answer():
    """
    The preset check happens before a connection is opened (tools/windows.py),
    so a refusal must not be the slow path a person learns to avoid. No
    warm-up: this one never touches the database at all.
    """
    stored = {**STORED, "compare_to": "previous_period"}
    _, _, _, elapsed = _replay("window", "this_month", stored)
    assert elapsed < BUDGET_S, f"{elapsed:.2f}s against a {BUDGET_S}s budget"


def test_the_board_draws_the_replayed_read():
    args, _, result, _ = _replay("window", AUGUST)
    blocks = board_frame("get_sales", args, result, 3)
    assert len(blocks) == 1
    assert blocks[0]["key"] == "read-3"
    # One row, one figure — the rule default_composition applies to any read.
    assert blocks[0]["kind"] == "figure"


def test_a_store_change_reaches_the_rows():
    _replay("store", "Rockwell")                              # the warm-up
    args, was, result, elapsed = _replay("store", "Rockwell")
    assert was == "OPUS"
    assert result["status"] == "ok", result.get("error")
    assert "Rockwell" in " ".join(str(f) for f in result["meta"]["filters_applied"])
    assert elapsed < BUDGET_S, f"{elapsed:.2f}s against a {BUDGET_S}s budget"


def test_a_grouping_change_changes_the_rows_and_not_the_window():
    args, was, result, _ = _replay("group_by", ["store"])
    assert was == []
    assert result["status"] == "ok", result.get("error")
    assert args["date_range"] == "last_week"


@pytest.mark.parametrize("value", ["nonesuch", "augustish"])
def test_a_window_that_is_not_a_window_is_refused_by_the_tool(value):
    _, _, result, _ = _replay("window", value)
    assert result["status"] in ("refused", "unrunnable"), result
    assert value in result["error"]


# ---------------------------------------------------------------------------
# The record, as Postgres actually evaluates it
# ---------------------------------------------------------------------------
#
# THE STATEMENT IS THE ONE PART A STUB CANNOT CHECK. The contract suite holds
# what the UPDATE says; only a database holds what it MEANS, and a jsonb
# expression that appends to the wrong place or trims the wrong end is a
# silent, permanent edit to somebody's answer post. So the expression is
# evaluated here over LITERALS — `payload` bound as a parameter instead of read
# from the column — which touches no row, reads nothing, and rolls back.

import json                                                        # noqa: E402
import os                                                          # noqa: E402

from sqlalchemy import text                                        # noqa: E402

from app.services.replay import _RECORD_SQL                        # noqa: E402

needs_app_db = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="the record is written by the application role; DATABASE_URL is unset",
)

# The same expression, with the column swapped for a bound literal.
_OVER_LITERALS = "SELECT " + (
    _RECORD_SQL.split("SET payload = ", 1)[1].split(" WHERE id =")[0]
).replace("payload", "CAST(:payload AS jsonb)")


def _evaluate(payload, cap=3, entry=None):
    """
    Evaluate the expression once, on an engine of this test's own.

    NOT the application's `AsyncSessionLocal`. Its pooled asyncpg connection
    belongs to the loop that opened it, and each of these tests is its own
    `asyncio.run` — so the second one to reuse it fails on the loop rather
    than on anything this file is about.
    """
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.core.config import settings

    async def go():
        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        try:
            async with engine.connect() as conn:
                out = (await conn.execute(text(_OVER_LITERALS), {
                    "payload": json.dumps(payload) if payload is not None else None,
                    "cap": cap, "entry": json.dumps(entry or {"n": "new"}),
                })).scalar_one()
                await conn.rollback()
                return out if isinstance(out, dict) else json.loads(out)
        finally:
            await engine.dispose()

    return asyncio.run(go())


@needs_app_db
def test_the_record_appends_and_leaves_the_answer_alone():
    answer = {"charted": [{"seq": 1}], "calls": [{"seq": 1}], "reading": {"claim": "x"}}
    out = _evaluate(answer)
    assert out["replays"] == [{"n": "new"}]
    for key, value in answer.items():
        assert out[key] == value, f"the record touched {key}"


@needs_app_db
def test_a_post_with_no_payload_gets_one_holding_only_the_replay():
    assert _evaluate(None) == {"replays": [{"n": "new"}]}


@needs_app_db
def test_the_trim_drops_the_oldest_and_keeps_the_newest():
    out = _evaluate({"replays": [{"n": 1}, {"n": 2}, {"n": 3}]}, cap=3)
    assert out["replays"] == [{"n": 2}, {"n": 3}, {"n": "new"}]


@needs_app_db
def test_a_replays_key_that_is_not_a_list_does_not_raise():
    """`jsonb_array_length` over a non-array raises, and a replay that RAN
    must not fail on the record of itself."""
    assert _evaluate({"replays": "junk"})["replays"] == [{"n": "new"}]
