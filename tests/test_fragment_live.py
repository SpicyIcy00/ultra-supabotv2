"""
A fragment, against real data: the Done-when of P1.j, measured rather than
assumed.

NEEDS THE DATABASE — skipped by conftest with the rest of the golden suite when
GEORGE_DATABASE_URL is unset. Nothing here writes.

    first visible change for a NAVIGATION fragment  < 2 s
    first figure for an ANALYTICAL fragment         < 2 s

WHAT A FRAGMENT COSTS, AND WHAT IS IN THE NUMBER. Typing "last month" into the
composer resolves against the tokens on screen — a lookup in a list the server
sent, no request, no model — and runs the stored call again with that one
argument changed. So the measured thing is the reads, which is the part that
costs anything, and the rule for which read the person waits for is
`tests/evals/timing.py fragment_change_ms`: the SLOWEST of the batch, because a
board half on August and half on last week has not changed, it has broken.

WHAT IS NOT IN THE NUMBER, said rather than hidden. The endpoint adds two
application-database statements around each read (reading the stored call off
the post, appending the change to it), measured at 33 ms each in P1.i. The
resolve and the render are in-memory and open no connection. And an ANALYTICAL
fragment also costs a model turn: the figure is what this measures, the
reading follows it and is never dropped to keep this number small
(`fragments.analytical_asks_anyway`).

THE STORED CALL IS FABRICATED HERE, exactly as it is in `test_replay_live`:
what the endpoint reads off a post is a `{tool, arguments}` pair, and these are
two of them.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from app.services.pin_runner import run_call
from agent.loop import MAX_ROWS_TO_CLIENT
from app.services.replay import board_frame, retarget
from tools._common import load_defs
from tests.evals.timing import analytical_figure_ms, fragment_change_ms

# Two calls of the shape the loop records for "how did we do last week?" — one
# grouped over the estate, one scoped to a shop. Both on the same window, which
# is what makes one window token true of the whole screen and what makes a
# fragment move both of them.
STORED = [
    {"metric": "net_sales", "group_by": ["store"], "date_range": "last_week",
     "compare_to": "previous_period"},
    {"metric": "net_sales", "group_by": [], "date_range": "last_week",
     "filters": {"store": "OPUS"}},
]

# The card's budget, in seconds. Stated here so a failure names the figure it
# missed rather than just being slow.
BUDGET_S = 2.0

# The first read of a process opens the connection and is not the one anybody
# waits for — P1.i measured 6.12 s cold against 0.46 s warm, from a laptop to a
# pooler in another region. The backend is long-lived and warm by the time
# somebody types anything.
_MEASURE = 3


def _run(stored, argument, value):
    """One replay, as the endpoint runs it: retarget, validate-by-running, time."""
    args, was = retarget("get_sales", stored, argument, value)
    started = time.perf_counter()
    result = asyncio.run(run_call({"tool": "get_sales", "arguments": args}))
    return args, was, result, time.perf_counter() - started


def _fragment(argument, value, stored=STORED):
    """Every replay one fragment fires, and what each of them took."""
    out = [_run(s, argument, value) for s in stored]
    return out, [got[3] for got in out]


def test_a_navigation_fragment_changes_the_board_inside_the_budget():
    """"last month", typed, over both reads on screen. No model anywhere."""
    _fragment("window", "last_month")                       # the warm-up

    runs = []
    for _ in range(_MEASURE):
        out, times = _fragment("window", "last_month")
        for _args, was, result, _t in out:
            assert was == "last_week"
            assert result["status"] == "ok", result.get("error")
        runs.append(fragment_change_ms(times))

    median = sorted(runs)[len(runs) // 2]
    assert median is not None and median < BUDGET_S * 1000, (
        f"median first visible change {median:.0f}ms over {_MEASURE} fragments "
        f"against a {BUDGET_S}s budget; all of them: "
        f"{[round(r) for r in runs]}ms"
    )


def test_and_both_reads_moved_to_the_same_window():
    out, _ = _fragment("window", "last_month")
    for args, _was, result, _t in out:
        assert args["date_range"] == "last_month"
        applied = " ".join(str(f) for f in result["meta"]["filters_applied"])
        assert "last_week" not in applied
        assert result["meta"]["snapshot_timestamp"], "UI rule 6"


# "products" ON A SALES READ IS NOT A REPLAY, and this is where that was
# found. `net_sales` is transaction grain and declines a product grouping in
# its own sentence — the ladder localizes by product through `product_revenue`,
# which is a different METRIC and therefore a different call, and a replay
# changes one scope argument and never the measure. So a product token is
# offered on a product-revenue read and on no other, and "products" asked of a
# net-sales board goes to George, as it always did.
PRODUCTS = {"metric": "product_revenue", "group_by": ["store"],
            "date_range": "last_week", "filters": {"store": "OPUS"}}


def test_an_analytical_fragment_has_its_figure_inside_the_budget():
    """
    "products" — a change of the CUT, which is the one kind that still asks
    George. The figure is what is measured; his reading follows it.
    """
    grouped = [PRODUCTS]
    _fragment("group_by", ["product"], grouped)             # the warm-up

    runs = []
    for _ in range(_MEASURE):
        out, times = _fragment("group_by", ["product"], grouped)
        for args, _was, result, _t in out:
            assert args["group_by"] == ["product"]
            assert result["status"] == "ok", result.get("error")
        runs.append(analytical_figure_ms(times))

    median = sorted(runs)[len(runs) // 2]
    assert median is not None and median < BUDGET_S * 1000, (
        f"median first figure {median:.0f}ms over {_MEASURE} analytical "
        f"fragments against a {BUDGET_S}s budget; all of them: "
        f"{[round(r) for r in runs]}ms"
    )


def test_and_the_new_cut_arrives_with_a_shape_to_draw_it_in():
    """
    A grouping changes what a row IS, so the object drawn over the old rows is
    not the object for these (`replay.changes_shape`). The endpoint's own board
    frame is what replaces it — `default_composition`, which names a shape and
    never a word about the rows.

    THE CUT IS BOUNDED TO WHAT A SCREEN DRAWS, which is what this found. Every
    product OPUS sold last week is 200 rows against a 120-row cap, and 200 rows
    have no shape: a mark over the first 120 is a different and wrong mark. So
    the drawable case is the ranked one, and the unbounded one is the next
    test.
    """
    args, _was, result, _t = _run({**PRODUCTS, "top_n": 10}, "group_by", ["product"])
    assert result["status"] == "ok", result.get("error")
    assert 0 < len(result["rows"]) <= MAX_ROWS_TO_CLIENT
    blocks = board_frame("get_sales", args, result, seq=1)
    assert blocks, "a replayed cut with rows and no shape draws nothing"
    for block in blocks:
        assert block.get("key") == "read-1"
        assert not block.get("claim"), "nobody has looked at these rows"
        assert not block.get("emphasise")


def test_a_cut_wider_than_a_screen_moves_nothing_and_says_so():
    """
    ALL OF THE ROWS OR NONE — the loop's own rule, which this endpoint was not
    applying until P1.j. Every product OPUS sold last week is 200 rows, and the
    loop would have sent none of them; so does this, and the board stays where
    it is rather than redrawing a mark over rows it cannot hold.
    """
    args, _was, result, _t = _run(PRODUCTS, "group_by", ["product"])
    assert result["status"] == "ok"
    assert len(result["rows"]) > MAX_ROWS_TO_CLIENT
    # What the endpoint does with that, through the whole of it.
    assert board_frame("get_sales", args, result, seq=1) == []
    said = load_defs()["surface"]["desk"]["replay"]["rows_incomplete_says"]
    assert said.strip(), "the room needs words for a board that did not move"


def test_a_window_still_in_progress_is_refused_in_the_tool_s_own_words():
    """
    The fragment resolves — "this month" is a preset and a token offers it —
    and the TOOL declines to compare a window that has not finished. That is a
    real answer in its own sentence and the row has to say it, not swallow it.
    """
    _args, _was, result, _t = _run(STORED[0], "window", "this_month")
    assert result["status"] != "ok"
    said = str(result.get("error") or "")
    assert "this_month" in said and "last_month" in said, said
