"""
"Compare these" — the Done-when of P2.c, measured rather than assumed.

NEEDS THE DATABASE — skipped by conftest with the rest of the golden suite when
GEORGE_DATABASE_URL is unset. Nothing here writes.

    tap OPUS, tap Rockwell, say "compare these"
    → a dumbbell for two shops, in under 2 s, with no model call

WHAT THE GESTURE IS. Two taps resolve two `store_id`s out of the rows already
on screen; the words are one of the definitions' own
(`selection.comparison.spoken`); and what happens is the replay that has
existed since P1.i, with the shop argument set to a LIST instead of a name.
Nothing new is asked of anybody: the read on screen was already grouped by
shop over the whole estate, and this scopes it to two.

WHAT IS IN THE NUMBER, and what is not, on the same terms `test_fragment_live`
states. Measured: the read. Not measured, because neither opens a connection
and both are under the resolution of anything a test can see: resolving the
two ids out of rows in memory, and the React commit that redraws the mark. The
endpoint adds two application-database statements around each read (33 ms each,
P1.i). No model is consulted anywhere on this path — that is a fact about the
code, asserted in `test_mentions_contract`, not a thing a stopwatch can show.

THE STORED CALL IS FABRICATED HERE, exactly as it is in `test_replay_live` and
`test_fragment_live`: what the endpoint reads off a post is a
`{tool, arguments}` pair, and this is one of them.
"""

from __future__ import annotations

import asyncio
import time

import pytest

from agent.loop import MAX_ROWS_TO_CLIENT
from app.services.pin_runner import run_call
from app.services.replay import board_frame, retarget
from tools._common import load_defs
from tests.evals.timing import fragment_change_ms

DEFS = load_defs()
SEL = DEFS["surface"]["desk"]["selection"]

# "How did the shops do last week?" — grouped over the estate, compared. This
# is the board a person is looking at when they tap two shops, and the reason
# there is no shop TOKEN to move: the call carries no shop filter at all, so
# the change is to ADD the argument rather than to move it.
STORED = {"metric": "net_sales", "group_by": ["store"], "date_range": "last_week",
          "compare_to": "previous_period"}

BUDGET_S = 2.0

# The first read of a process opens the connection and is not the one anybody
# waits for — the same warm-up `test_fragment_live` makes and for the same
# reason. The backend is long-lived and warm by the time anybody taps anything.
_MEASURE = 3


def _ids(*names: str) -> list[str]:
    """The store ids the ROWS carry, from the store list the rows are keyed by."""
    by_name = {s["display_name"]: s["id"] for s in DEFS["stores"]["active_retail"]}
    return [by_name[n] for n in names]


def _compare(subjects: list[str]):
    """One comparison, as the endpoint runs it: retarget, run, time."""
    args, was = retarget("get_sales", STORED, "store", subjects)
    started = time.perf_counter()
    result = asyncio.run(run_call({"tool": "get_sales", "arguments": args}))
    return args, was, result, time.perf_counter() - started


def test_two_taps_and_a_word_draw_a_dumbbell_inside_the_budget():
    two = _ids("OPUS", "Rockwell")
    _compare(two)                                            # the warm-up

    runs = []
    last = None
    for _ in range(_MEASURE):
        args, was, result, took = _compare(two)
        assert result["status"] == "ok", result.get("error")
        runs.append(fragment_change_ms([took]))
        last = (args, was, result)

    median = sorted(runs)[len(runs) // 2]
    assert median is not None and median < BUDGET_S * 1000, (
        f"median comparison {median:.0f}ms over {_MEASURE} runs against a "
        f"{BUDGET_S}s budget; all of them: {[round(r) for r in runs]}ms"
    )

    args, was, result = last
    # THE IDS REACHED THE TOOL ARGUMENT — the card's third Done-when, and the
    # whole point of resolving a tap to an id rather than to a name.
    assert args["filters"]["store"] == two
    assert was is None, "the board was on the whole estate; the filter is new"

    # TWO SHOPS, AND ONLY THE TWO. A comparison that quietly returned seven
    # would be the estate's figures under a label saying two.
    rows = result["rows"]
    assert len(rows) == 2
    assert {r["store"] for r in rows} == {"OPUS", "Rockwell"}
    assert {r["store_id"] for r in rows} == set(two)

    # AND THE MARK IS A DUMBBELL, decided by what the tool measured — a before
    # on every row — through `default_composition`, which never says a word
    # about the rows. No model composed this.
    frame = board_frame("get_sales", args, result, 0, DEFS)
    assert [b["kind"] for b in frame] == ["dumbbell"]
    assert "claim" not in frame[0] and "emphasis" not in frame[0]
    assert len(rows) <= MAX_ROWS_TO_CLIENT

    # UI rule 6: the figures wear the time they were read, not the time the
    # board was first drawn.
    assert result["meta"]["snapshot_timestamp"]


def test_the_receipts_name_both_shops_and_the_rule_that_scoped_them():
    args, _was, result, _took = _compare(_ids("OPUS", "Rockwell"))
    applied = " ".join(str(f) for f in result["meta"]["filters_applied"])
    assert "OPUS" in applied and "Rockwell" in applied
    # The tool's own line says how many, so a reader can see the scope is two
    # without counting the marks.
    assert "t.store_id IN (2:" in applied


def test_a_comparison_by_id_and_by_name_are_the_same_read():
    by_id = _compare(_ids("OPUS", "Rockwell"))[2]["rows"]
    by_name = _compare(["OPUS", "Rockwell"])[2]["rows"]
    # The tap sends ids and a person typing sends names; both resolve through
    # the store list, so the two doors cannot disagree about which shops.
    assert [r["store_id"] for r in by_id] == [r["store_id"] for r in by_name]


def test_an_unknown_shop_in_the_list_refuses_by_that_name_and_draws_nothing():
    args, _was, result, _took = _compare(_ids("OPUS") + ["Nowhere"])
    assert result["status"] != "ok"
    # The tool's own sentence, naming the one it could not find — not "the
    # comparison failed", which would say nothing about what to do next.
    assert "Nowhere" in str(result.get("error"))
    assert board_frame("get_sales", args, result, 0, DEFS) == []


def test_the_comparison_words_are_the_definitions_and_the_shop_is_a_replay_scope():
    # The two halves that make this a replay at all, restated against the live
    # definitions the running process loaded.
    assert SEL["comparison"]["replays_by_dimension"]["store"] == "store"
    assert "compare these" in SEL["comparison"]["spoken"]
    assert SEL["identity"]["store"] == "store_id"
