"""
The speed fix (2026-09-19), held: what it changed and what it may not have cost.

NO DATABASE, NO API. The scripted client of the voice contract, one read with
two rows, then the answers a test writes.

WHY THESE SIX. The P2S.✓ close (verification/p2sclose-v2.json) put the median
answer at 76.6 s against 17.1 s on 14 September, and failed three trust rows
the same way — a rounded range in prose that no read returned. The owner's
question was whether the target could be reached without losing function; the
answer was six changes, four with nothing at stake and two in a version that
keeps the ladder and the rewrite where they matter. Each is a test here, so a
later session can say which one moved a number.

  1. effort by kind      — tests/test_effort_per_turn_contract.py holds the
                           levels; here only that a lookup and a follow-up
                           are no longer high, and a dig still is.
  2. figures in prose    — a rounding one read explains is said exactly, with
                           no round trip; what no read explains buys ONE
                           rewrite; what survives that goes with its sentence.
  3. accessories         — an ask or an action refused does not un-settle the
                           round; a slot or a block refused still does.
  4. unknown fields      — dropped with a note; a figure typed onto a block is
                           still refused.
  5. the stale check     — "I don't have footfall" says what he cannot tell.
  6. the error's detail  — an api_error frame carries the exception's name.
"""
from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")

from agent import compose, loop as george_loop, prose, reading                # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402
from tests.evals import checks                                                 # noqa: E402
from tests.test_loop_correction_contract import frames_of                      # noqa: E402
from tests.test_voice_contract import ROWS, _drive_drawn, _standing_answer     # noqa: E402
from tests.test_compose_coercion_contract import CALLS                         # noqa: E402

DEFS = load_defs()
RETURNED = prose.allowed_numbers([{"rows": ROWS, "meta": {}}])      # 48,210 and 61,500.5


# ---------------------------------------------------------------------------
# 1. Effort by kind
# ---------------------------------------------------------------------------

def test_a_lookup_and_a_follow_up_are_no_longer_high_and_a_dig_still_is() -> None:
    assert george_loop.turn_effort("how did Rockwell do?", None, DEFS) == ("medium", "fresh")
    assert george_loop.turn_effort("no i meant last week", [{"role": "user"}], DEFS) == ("medium", "follow_up")
    assert george_loop.turn_effort("analyze tradsnax per store", None, DEFS) == ("high", "ladder")
    assert george_loop.turn_effort("how are we doing?", None, DEFS) == ("high", "broad")
    assert george_loop.turn_effort("lets build an ordering system", None, DEFS) == ("high", "build")


# ---------------------------------------------------------------------------
# 2. A figure in prose that no read returned
# ---------------------------------------------------------------------------

def test_the_ranges_the_close_failed_on_are_found_and_the_exact_figure_is_not() -> None:
    allowed = {27968.0, 36712.0, 16230.0}
    found = prose.unreturned_prose_figures(
        "10 to 13 Sept ran ₱28,000–36,700, then every day sat near ₱16,230.", allowed)
    assert [raw for _s, raw, _v in found] == ["₱28,000", "36,700"]
    assert prose.unreturned_prose_figures("730 units.", {730.0}) == []
    # The eval's check is the same function, so the measure cannot drift.
    assert [f.value for f in checks.ungrounded_numerals(
        "Down to ₱28,000 on the day.", [{"rows": [{"v": 27968}], "meta": {}}])] == [28000.0]


def test_a_rounding_one_figure_explains_is_said_exactly_and_an_ambiguous_one_is_left() -> None:
    fixed, repaired = reading.repair_rounding_in_prose("It ran near ₱28,000 that week.", {27968.0}, 31)
    assert fixed == "It ran near ₱27,968 that week." and len(repaired) == 1
    same, none = reading.repair_rounding_in_prose("It ran near ₱28,000 that week.", {27968.0, 28010.0}, 31)
    assert same == "It ran near ₱28,000 that week." and none == []


def test_the_loop_repairs_a_rounding_with_no_round_trip(monkeypatch) -> None:
    # Coarse roundings: ₱50,000 keeps one digit of 48,210, so it is not the
    # misstatement gate's echo, and one returned figure is within its half.
    frames, requests = _drive_drawn(monkeypatch, ["Rockwell took ₱50,000 and OPUS ₱60,000 last week."])
    assert len(requests) == 2, "the read and the answer — a repair is a pass over the text"
    said = _standing_answer(frames)
    assert "₱48,210" in said and "₱61,500.5" in said and "50,000" not in said
    warnings = [w for w in frames_of(frames, "warning") if w["reason"] == "ungrounded_figure"]
    assert warnings and warnings[0]["corrected"] == "deterministic" and warnings[0]["repaired"] == 2
    assert frames_of(frames, "done")[0]["grounding_corrections"] == 0


def test_a_figure_no_read_explains_buys_one_rewrite(monkeypatch) -> None:
    frames, requests = _drive_drawn(monkeypatch, [
        "Rockwell took ₱48,210 and lost ₱9,999 to OPUS.",
        "Rockwell took ₱48,210 and OPUS took ₱61,500.50.",
    ])
    assert len(requests) == 3, "the read, the answer, one rewrite"
    assert "9,999" not in _standing_answer(frames)
    reasons = [w["corrected"] for w in frames_of(frames, "warning") if w["reason"] == "ungrounded_figure"]
    assert reasons == ["round_trip"]
    assert frames_of(frames, "done")[0]["grounding_corrections"] == 1


def test_a_figure_that_survives_the_rewrite_goes_with_its_sentence(monkeypatch) -> None:
    frames, requests = _drive_drawn(monkeypatch, [
        "Rockwell took ₱48,210 last week. OPUS lost ₱9,999 to the weather.",
        "Rockwell took ₱48,210 last week. OPUS lost ₱9,999 to the weather.",
    ])
    assert len(requests) == 3, "one rewrite is the budget"
    said = _standing_answer(frames)
    assert "₱48,210" in said and "9,999" not in said
    last = [w for w in frames_of(frames, "warning") if w["reason"] == "ungrounded_figure"][-1]
    assert last["corrected"] == "deterministic" and last["removed"] == 1


def test_a_turn_that_read_nothing_is_conversation(monkeypatch) -> None:
    """A refusal or a pin confirmed carries no read; its figures are the thread's."""
    from tests.test_loop_correction_contract import drive
    frames, requests = drive(monkeypatch, ["Net sales last month were ₱8,069,394.16."])
    assert frames_of(frames, "warning") == [] and len(requests) == 1


# ---------------------------------------------------------------------------
# 3. Accessories do not un-settle the round
# ---------------------------------------------------------------------------

def test_an_ask_or_an_action_refused_leaves_the_round_standing() -> None:
    keeps = george_loop._refusal_keeps_the_round
    assert keeps({"rejected_slots": [{"slot": "asks", "reason": "a figure"}]}, DEFS) is False
    assert keeps({"rejected_actions": [{"action": "why", "reason": "no row"}]}, DEFS) is False
    assert keeps({"rejected_slots": [{"slot": "caveat", "reason": "a figure"}]}, DEFS) is True
    assert keeps({"rejected": [{"block": {"key": "x"}, "reason": "no row"}]}, DEFS) is True
    assert set(req(DEFS, "rounds.settle.stands_without")) == {"asks", "actions"}


# ---------------------------------------------------------------------------
# 4. An unknown field is dropped; a figure typed onto a block is refused
# ---------------------------------------------------------------------------

def test_a_note_field_is_dropped_with_a_reason_and_a_value_field_is_refused() -> None:
    coerced: list[str] = []
    accepted, rejected = compose.validate(
        {"blocks": [{"key": "rockwell", "kind": "figure", "seq": 0, "claim_note": "a note"}]},
        CALLS, DEFS, coerced=coerced)
    assert len(accepted) == 1 and rejected == []
    assert "claim_note" not in accepted[0]
    assert any("['claim_note'] dropped" in c for c in coerced)

    accepted, rejected = compose.validate(
        {"blocks": [{"key": "rockwell", "kind": "figure", "seq": 0, "value": 412884}]},
        CALLS, DEFS)
    assert accepted == [] and "may not carry ['value']" in rejected[0]["reason"]


# ---------------------------------------------------------------------------
# 5. The stale check
# ---------------------------------------------------------------------------

def test_saying_he_does_not_have_the_data_is_a_limitation_statement() -> None:
    assert checks.limitation_statement(
        "I don't have footfall — no door counter or people counter feeds into anything I can read.")
    assert checks.limitation_statement("Neither exists in the data I have.")
    assert checks.limitation_statement("We don't count footfall anywhere — the closest measure is transactions.")
    assert checks.limitation_statement("Customers are buying fewer premium products.") is None


# ---------------------------------------------------------------------------
# 6. The exception's text reaches the report through the gaps log, never the
#    stream (tests/test_read_failure_contract.py holds the stream's half)
# ---------------------------------------------------------------------------

def test_the_report_keeps_the_exception_from_the_gaps_log() -> None:
    import inspect
    from tests.evals import harness
    src = inspect.getsource(harness)
    assert 'if "george.gaps" in sql' in src and '"error_detail"' in src
    assert "api_error" in src[src.index('"error_detail"'):src.index('"error_detail"') + 200]
