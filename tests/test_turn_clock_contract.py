"""The clock measures the wait, and never quietly derives it.

Three things are held here.

**The loop records it.** `agent/loop.py` must put duration_ms, iteration_ms
and corrective_turns on the conversation row and on the `done` frame, off a
monotonic clock, and the per-iteration figures must add up to the turn. A turn
whose clock is missing is a turn Phase 1 cannot be measured on.

**The report shapes rows honestly.** summarise() and render() take rows and a
clock — no database, which is the whole reason they are separate from fetch().
The two things that must not drift: an unanswered turn never enters a spread,
and a derived figure is never presented as a measured one.

**The skew is caught.** `logged_at - asked_at` looks like turn time and is
turn time plus the offset between two machines. The report exists partly to
say so, and a negative derived value is the proof — so the negative has to
survive into the rendering rather than being clamped away as nonsense.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import json
import re

import pytest

from ops.turn_clock import (
    ANSWERED,
    CLOCK_COLUMNS,
    HAS_CLOCK_SQL,
    NO_CLOCK_COLUMNS,
    SCRIPTED_USERS,
    TURNS_SQL,
    Clock,
    Spread,
    percentile,
    render,
    summarise,
)

ROOT = Path(__file__).resolve().parents[1]
UTC = timezone.utc
NOW = datetime(2026, 9, 13, 4, 0, tzinfo=UTC)


def turn(**kw) -> dict:
    """One row as the query returns it."""
    row = {
        "id": kw.pop("id", "t"),
        "user_id": kw.pop("user_id", "admin"),
        "status": kw.pop("status", ANSWERED),
        "asked_at": NOW,
        "iterations": kw.pop("iterations", 3),
        "derived_s": kw.pop("derived_s", 10.0),
        "duration_ms": kw.pop("duration_ms", None),
        "iteration_ms": kw.pop("iteration_ms", None),
        "corrective_turns": kw.pop("corrective_turns", None),
        "calls": kw.pop("calls", 4),
    }
    row.update(kw)
    return row


def shape(rows, **kw) -> Clock:
    return summarise(rows, days=7, until=NOW, has_clock=kw.pop("has_clock", True), **kw)


# ---------------------------------------------------------------------------
# The loop records the clock
# ---------------------------------------------------------------------------
def _loop_source() -> str:
    return (ROOT / "agent" / "loop.py").read_text(encoding="utf-8")


def test_the_conversation_insert_carries_the_three_clock_columns():
    source = _loop_source()
    insert = source.split("INSERT INTO george.conversations")[1][:900]
    for column in ("duration_ms", "iteration_ms", "corrective_turns"):
        assert column in insert, (
            f"{column} is not in the conversation insert. Phase 1 is measured in "
            "seconds and per round trip; a column the loop does not write is a "
            "number ops/turn_clock.py can only ever report as a dash."
        )


def test_the_turn_is_timed_on_a_monotonic_clock():
    source = _loop_source()
    assert "turn_started = time.monotonic()" in source
    assert "iteration_marks.append(time.monotonic())" in source, (
        "each iteration must mark the monotonic clock, or iteration_ms is an "
        "empty array and the claim that iterations are what make a turn slow "
        "stays unchecked."
    )
    # The trap this whole card exists to close.
    assert "logged_at - asked_at" not in source.replace("`logged_at - asked_at`", ""), (
        "the loop must never derive a turn time from two machines' clocks"
    )


def test_the_done_frame_reports_the_same_clock_as_the_log():
    source = _loop_source()
    done = source.split('yield _sse("done"')[1][:1400]
    for key in ('"duration_ms": duration_ms', '"iteration_ms": iteration_ms',
                '"corrective_turns": corrections_total'):
        assert key in done, f"the done frame does not carry {key}"


def test_a_driven_turn_records_a_clock_that_adds_up(monkeypatch):
    """
    The loop end to end, against a scripted model: the row it writes must
    carry a duration, one iteration figure per round trip, and the two must
    agree. A per-iteration array that does not sum to the turn means the
    marks are being taken somewhere other than the boundaries, and every
    "which part is slow" reading off it would be wrong.
    """
    from tests.test_loop_correction_contract import StubLog, drive, frames_of

    frames, _ = drive(monkeypatch, [
        'Pinned "Net sales by store" to the Replenishment page.',
        "Nothing was pinned — I never called the tool. Say the word and I will.",
    ])

    log = StubLog.instances[-1]
    row = next(params for sql, params in log.statements
               if "INSERT INTO george.conversations" in sql)
    duration_ms, iteration_ms, corrective = row[-3], row[-2], row[-1]

    assert isinstance(duration_ms, int) and duration_ms >= 0
    per_iteration = json.loads(iteration_ms)
    done = frames_of(frames, "done")[0]
    assert len(per_iteration) == done["iterations"] == 2, (
        "one figure per model round trip, and this turn took two — the answer "
        "and the correction after it"
    )
    assert sum(per_iteration) <= duration_ms, (
        "the iterations cannot add up to more than the turn they happened in"
    )
    # The tail of the last iteration runs to the end of the turn, so nothing
    # after the model stops talking falls outside the measurement.
    assert duration_ms - sum(per_iteration) <= 50
    # This turn corrected a pin that was claimed and never made: exactly one
    # gate fired, and the log saw it.
    assert corrective == 1
    assert done["duration_ms"] == duration_ms
    assert done["corrective_turns"] == 1


def test_corrections_total_counts_all_six_gates():
    source = _loop_source()
    total = source.split("corrections_total = (")[1].split(")\n")[0]
    for gate in ("corrective_turns", "pin_corrections", "save_corrections",
                 "page_corrections", "volunteer_corrections", "restate_corrections"):
        assert gate in total, (
            f"{gate} is a corrective round trip the log would not see. All six "
            "gates are one number or the measure understates the cost."
        )


# ---------------------------------------------------------------------------
# Percentiles
# ---------------------------------------------------------------------------
def test_percentile_interpolates_the_way_percentile_cont_does():
    assert percentile([1, 2, 3, 4], 0.5) == 2.5
    assert percentile([10], 0.9) == 10.0
    assert percentile([], 0.5) is None
    # p90 of ten values sits on the ninth, exactly.
    assert percentile(list(range(1, 11)), 0.9) == pytest.approx(9.1)


def test_a_spread_of_nothing_is_empty_rather_than_zero():
    s = Spread.of([None, None])
    assert s.n == 0 and s.median is None and s.p90 is None, (
        "a missing measurement is not a fast one"
    )


# ---------------------------------------------------------------------------
# The shaping
# ---------------------------------------------------------------------------
def test_only_answered_turns_enter_a_spread():
    rows = [
        turn(id="a", duration_ms=20_000, derived_s=20.0),
        turn(id="b", duration_ms=30_000, derived_s=30.0),
        # Died before the model: sub-second, and nothing to do with speed.
        turn(id="c", status="api_error", duration_ms=200, derived_s=0.2),
    ]
    clock = shape(rows)
    assert clock.turns == 3 and clock.answered == 2
    assert clock.measured.n == 2
    assert clock.measured.median == pytest.approx(25.0), (
        "a turn that never reached the API dragged the median down"
    )
    assert clock.by_status == {"ok": 2, "api_error": 1}


def test_the_skew_check_reads_every_turn_including_the_failures():
    rows = [
        turn(id="a", duration_ms=20_000, derived_s=20.0),
        # Impossible, and the only place the offset between the two clocks is
        # visible: a turn long enough to answer hides it inside itself.
        turn(id="b", status="api_error", derived_s=-1.82),
    ]
    clock = shape(rows)
    assert clock.derived.lowest == pytest.approx(20.0), (
        "the failed turn must not appear as a turn time"
    )
    assert clock.skew_floor == pytest.approx(1.82)
    assert "at least 1.82 s behind" in render(clock)


def test_no_negative_means_no_claim_that_the_clocks_agree():
    clock = shape([turn(duration_ms=1000, derived_s=1.0)])
    assert clock.skew_floor is None
    assert "not evidence there is none" in render(clock), (
        "silence about the offset must not read as proof of its absence"
    )


def test_per_iteration_pools_every_iteration_of_every_turn():
    rows = [
        turn(id="a", duration_ms=6_000, iteration_ms=[1_000, 2_000, 3_000]),
        turn(id="b", duration_ms=4_000, iteration_ms=[4_000]),
    ]
    clock = shape(rows)
    assert clock.per_iteration.n == 4
    assert clock.per_iteration.median == pytest.approx(2.5)
    assert clock.per_iteration.highest == pytest.approx(4.0)


def test_iteration_ms_survives_arriving_as_json_text():
    # psycopg gives back a list for jsonb; a csv or a stub may hand over the
    # string. Either is the same measurement.
    clock = shape([turn(duration_ms=3_000, iteration_ms=json.dumps([1_000, 2_000]))])
    assert clock.per_iteration.n == 2


def test_a_ruined_iteration_array_is_dropped_rather_than_guessed():
    for bad in ("not json", {"a": 1}, [None, "x"]):
        clock = shape([turn(duration_ms=3_000, iteration_ms=bad)])
        assert clock.per_iteration.n == 0


def test_user_only_drops_the_scripted_users():
    rows = [turn(id=str(i), user_id="coverage") for i in range(5)]
    rows.append(turn(id="real", user_id="admin", duration_ms=9_000))
    assert shape(rows).turns == 6
    only = shape(rows, user_only=True)
    assert only.turns == 1 and only.who == [("admin", 1)]
    assert "coverage" in SCRIPTED_USERS


def test_who_asked_is_always_shown_so_a_script_cannot_pass_for_a_week():
    rows = [turn(id=str(i), user_id="coverage", duration_ms=1_000) for i in range(9)]
    rows.append(turn(id="real", user_id="admin", duration_ms=9_000))
    out = render(shape(rows))
    assert "Who asked" in out
    assert "coverage" in out and "(scripted)" in out


# ---------------------------------------------------------------------------
# The rendering says which clock it is reading
# ---------------------------------------------------------------------------
def test_a_database_without_the_column_says_so_instead_of_showing_a_dash():
    out = render(shape([turn(derived_s=12.0)], has_clock=False))
    assert "no duration_ms column on this database" in out
    assert "NO TURN IN THIS WINDOW CARRIES A MEASURED CLOCK." in out


def test_the_derived_row_is_always_labelled_an_estimate():
    out = render(shape([turn(duration_ms=9_000, derived_s=9.0)]))
    assert "turn, measured" in out and "turn, derived" in out
    assert "logged_at - asked_at" in out, (
        "the derived row must name what it is, or it reads as a second "
        "measurement rather than as the same one plus an unknown"
    )


def test_an_empty_window_reports_use_rather_than_speed():
    out = render(shape([]))
    assert "No turns in this window" in out
    assert "fact about use, not about speed" in out


def test_the_report_writes_nothing():
    source = (ROOT / "ops" / "turn_clock.py").read_text(encoding="utf-8")
    assert "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" in source
    # Every statement the script can execute, not the prose about them: the
    # docstring explains why george_log's INSERT-and-no-SELECT is the wrong
    # credential here, and that sentence is not a write.
    for sql in (HAS_CLOCK_SQL, TURNS_SQL, CLOCK_COLUMNS, NO_CLOCK_COLUMNS):
        for word in ("INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER"):
            assert not re.search(rf"\b{word}\b", sql, re.I), (
                f"{word} in a read-only report"
            )
    # And nothing else is executed: two statements, both module constants.
    executed = re.findall(r"conn\.execute\(\s*([A-Za-z_\"][^,)]*)", source)
    assert executed == ['"SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"',
                        "HAS_CLOCK_SQL", "sql"], executed


def test_the_credential_is_named_and_never_printed():
    source = (ROOT / "ops" / "turn_clock.py").read_text(encoding="utf-8")
    assert "--url-env" in source
    # The value comes out of _url() and goes straight into psycopg. It is
    # never formatted into anything that reaches a stream.
    assert not re.search(r"print\([^)]*\b(url|value)\b", source)
