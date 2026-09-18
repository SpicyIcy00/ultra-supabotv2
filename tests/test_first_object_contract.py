"""
The measure P1.b is reported against, held against the rule it claims to copy.

"Time to first visible object" is a number a card lives or dies by, so the
thing that computes it needs its own cover — the more so because it is a REPLAY
of client code (room/board.ts `editsFor`) in another language. If the two drift,
the eval reports a screen nobody is looking at.

The cases below are the four the rule turns on:

  - the board is not empty once a read lands, because the client's fallback
    draws a quiet table per read. That was already true before P1.b, and it is
    why the card does not move THIS number;
  - prose alone does not count, because `answer_reset` wipes it — the reported
    moment is the last time the board became non-empty and stayed;
  - a default composition fills the board under the new rule and is invisible
    under the old one, which is how one run yields both numbers;
  - his composition always wins, whatever order the frames arrive in.
"""

from __future__ import annotations

from tests.evals import timing


def f(event, at, **data):
    return (event, data, float(at))


READ = dict(seq=0, tool="get_sales", rows_complete=True, rows=[{"value": 1}])
EMPTY_READ = dict(seq=1, tool="get_stock", rows_complete=False, rows=[])
SEEDED = dict(seq=-1, blocks=[{"op": "put", "kind": "figure", "key": "read-0", "seq": 0}],
              default=True)
HIS = dict(seq=4, blocks=[{"op": "put", "kind": "hero", "key": "rockwell", "seq": 0}])


def test_a_read_landing_fills_the_board_with_or_without_a_default():
    frames = [f("start", 0), f("tool_call", 900, seq=0), f("tool_result", 1200, **READ),
              f("done", 9000)]
    assert timing.first_object_ms(frames, with_default=False) == 1200
    assert timing.first_object_ms(frames, with_default=True) == 1200


def test_prose_that_is_wiped_does_not_count_as_the_first_object():
    # "stuff came out but it just disappeared": his prose is the only thing on
    # screen, the loop resets the answer, and the room is back to the greeting.
    # The reported moment is when the screen stopped being empty for good,
    # which is the read.
    frames = [f("start", 0), f("text", 400, delta="Let me look."),
              f("answer_reset", 800, reason="interim_prose"),
              f("tool_call", 900, seq=0), f("tool_result", 2600, **READ), f("done", 9000)]
    assert timing.first_object_ms(frames, with_default=True) == 2600


def test_a_read_the_loop_could_not_send_whole_draws_nothing():
    frames = [f("start", 0), f("tool_result", 1200, **EMPTY_READ), f("done", 4000)]
    assert timing.first_object_ms(frames, with_default=True) is None


def test_the_default_is_the_first_composed_object_and_his_was_the_first_before():
    frames = [f("start", 0), f("tool_result", 1200, **READ), f("compose", 1300, **SEEDED),
              f("compose", 9400, **HIS), f("done", 12000)]
    assert timing.first_composed_object_ms(frames, with_default=True) == 1300
    assert timing.first_composed_object_ms(frames, with_default=False) == 9400


def test_a_turn_he_never_composed_had_no_composed_object_at_all_before():
    frames = [f("start", 0), f("tool_result", 1200, **READ), f("compose", 1300, **SEEDED),
              f("done", 8000)]
    assert timing.first_composed_object_ms(frames, with_default=False) is None
    assert timing.first_composed_object_ms(frames, with_default=True) == 1300


def test_his_composition_is_what_the_board_holds_however_the_frames_arrive():
    frames = [f("start", 0), f("compose", 5000, **HIS), f("compose", 5100, **SEEDED),
              f("done", 6000)]
    timeline = timing.board_timeline(frames, with_default=True)
    assert timeline[-1][1] is True
    # And the default that arrived after it did not become the board.
    assert timing.first_object_ms(frames, with_default=True) == 5000


def test_a_turn_that_drew_nothing_reports_nothing_rather_than_zero():
    frames = [f("start", 0), f("text", 300, delta="I can't see foot traffic."),
              f("done", 4000)]
    # Prose with no read and no composition: the room has his answer and no
    # object, and a measure that called that "0 ms" would be a lie in the
    # card's favour.
    assert timing.first_composed_object_ms(frames, with_default=True) is None


# ---------------------------------------------------------------------------
# P2S.7: the board builds while he works, and nothing drawn moves
# ---------------------------------------------------------------------------

def _compose(at, blocks, default=False):
    return ("compose", {"seq": -1, "blocks": blocks, **({"default": True} if default else {})}, at)


def test_a_block_that_lands_before_the_final_round_is_deeper_before_final():
    from tests.evals import timing as _t
    frames = [
        _compose(10_000, [{"key": "read-0", "seq": 0, "weight": "lead"}], default=True),
        _compose(30_000, [{"key": "read-0", "seq": 0, "weight": "lead"},
                          {"key": "read-3", "seq": 3, "weight": "quiet"}], default=True),
        _compose(60_000, [{"key": "shops", "seq": 0, "weight": "lead"},
                          {"key": "read-3", "seq": 3, "weight": "quiet", "default": True}]),
    ]
    growth = _t.board_growth(frames, {"duration_ms": 100_000, "iteration_ms": [10_000, 20_000, 30_000, 40_000]})
    assert growth["first_ms"] == 10_000
    assert growth["final_round_ms"] == 60_000
    assert growth["gains"][0] == (30_000, 1)
    assert growth["deeper_before_final"] is True
    assert growth["moved"] == []          # read-0 replaced WHERE IT STOOD


def test_the_old_shape_drew_nothing_new_before_the_final_round():
    """verification/p2s6-gate-2.json's broad turn, in shape: one default, then
    his board in the last rounds, and nothing between."""
    from tests.evals import timing as _t
    frames = [
        _compose(10_400, [{"key": "read-0", "seq": 0, "weight": "lead"}], default=True),
        _compose(95_000, [{"key": "shops", "seq": 0, "weight": "lead"},
                          {"key": "opus", "seq": 5, "weight": "supporting"}]),
    ]
    growth = _t.board_growth(frames, {"duration_ms": 105_700, "iteration_ms": [10_000, 85_000, 10_700]})
    assert growth["deeper_before_final"] is False


def test_a_rearrangement_is_a_move():
    from tests.evals import timing as _t
    frames = [
        _compose(1, [{"key": "a", "weight": "lead"}, {"key": "b"}, {"key": "c"}]),
        _compose(2, [{"key": "a", "weight": "lead"}, {"key": "c"}, {"key": "b"}]),
    ]
    assert _t.board_growth(frames, None)["moved"]
