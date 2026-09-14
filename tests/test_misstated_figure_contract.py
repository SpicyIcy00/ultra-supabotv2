"""
A drawn figure said WRONG, which was the way past the restatement gate.

PURE. No database, no model, no API.

THE DEFECT THIS CLOSES (dogfood log, 2026-09-13). The twelve caught George
writing "nothing sells 800 grams-worth of one line and then some" over an
attention row drawn as `was: 801.0`. The number on screen was not a number any
read returned.

WHAT MADE IT WORSE THAN A TYPO. The loop already had a gate on figures in
prose: `restated_sentences` fires when the answer quotes a figure the board
draws, and the turn is rewritten. It matches at the precision written, so:

    "801 grams-worth"   gate fires      -> rewritten, figure comes off screen
    "800 grams-worth"   gate SILENT     -> wrong figure ships

Being imprecise was the way PAST the guard, and the further off George was the
safer he was from it. The eval caught it offline, on the runs where it
happened; production caught nothing.

WHERE THE LINE IS. This asks only whether a prose numeral is a corrupted copy
of a figure the board DRAWS — the same direction as the rest of `agent/prose.py`
("a figure that IS on the board, said again"). It never asks whether a figure
absent from the board came from a tool: that is `ungrounded_numerals`, it is an
eval, and CLAUDE.md rule 9 keeps it one.
"""

from __future__ import annotations

import pytest

from agent import prose as _prose

# The real row, from tools.attention on the day it happened.
SAMPALOC = [{"rows": [{"subject": "G35 sampaloc 1g", "store": "OPUS",
                       "was": 801.0, "now": -211.0}], "meta": {}}]

THE_ANSWER = ("OPUS is the one to look at: sampaloc went from a full shelf to "
              "below zero in a single night, which is a count error rather than "
              "a day's selling — nothing sells 800 grams-worth of one line and "
              "then some.")


def _wrote(answer, results=SAMPALOC):
    return [(w, d) for _, w, d in _prose.misstated_figures(answer, results)]


# ---------------------------------------------------------------------------
# The turn that was reported
# ---------------------------------------------------------------------------

def test_the_reported_answer_is_caught():
    assert _wrote(THE_ANSWER) == [(800.0, 801.0)]


def test_the_exact_figure_is_a_restatement_and_not_a_misstatement():
    # Both gates exist; a figure belongs to exactly one of them.
    exact = THE_ANSWER.replace("800 grams", "801 grams")
    assert _wrote(exact) == []
    assert _prose.restated_sentences(exact, SAMPALOC)


def test_the_gate_the_rounding_slipped_past_still_does_not_see_it():
    # The defect, stated as a test: this is what shipped.
    assert _prose.restated_sentences(THE_ANSWER, SAMPALOC) == []


# ---------------------------------------------------------------------------
# What is NOT a misstatement — the false positives that would make it useless
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sentence", [
    "The shelf went from full to below zero overnight.",      # no figure at all
    "Nothing sells 750 grams-worth of one line.",             # a different number
    "Nothing sells 1000 grams-worth of one line.",            # one significant digit
    "Six shops last sold it on the same day.",                # a small count
    "It last sold on 2026-09-11.",                            # a date
])
def test_not_every_near_number_is_a_misstatement(sentence):
    assert _wrote(sentence) == []


def test_a_figure_that_matches_another_drawn_figure_exactly_is_left_alone():
    # 200 is drawn in its own right, so it is a restatement, not a corruption
    # of 211 — the exact match must win.
    results = [{"rows": [{"a": 211.0, "b": 200.0}], "meta": {}}]
    assert _wrote("It fell by 200 units.", results) == []


def test_the_significant_digit_floor_is_what_bounds_it():
    results = [{"rows": [{"v": 172918.5}], "meta": {}}]
    # 172,900 keeps four digits; 100,000 keeps one.
    assert _wrote("about 172,900 pesos", results) == [(172900.0, 172918.5)]
    assert _wrote("about 100,000 pesos", results) == []


def test_a_lower_floor_admits_coarser_roundings():
    # The bound is a parameter read from voice.misstatement, not a constant
    # buried here. 1,234 rounded to the thousands is 1,000, which keeps one of
    # its digits: out of range at a floor of two, in range at a floor of one.
    results = [{"rows": [{"v": 1234.0}], "meta": {}}]
    assert _wrote("about 1,000 pesos", results) == []
    assert _prose.misstated_figures("about 1,000 pesos", results, min_significant=1)


# ---------------------------------------------------------------------------
# The definition behind it
# ---------------------------------------------------------------------------

def test_the_bound_and_the_kind_come_from_the_yaml():
    from tools._common import load_defs, req

    defs = load_defs()
    assert req(defs, "voice.misstatement.min_significant_digits") == 2
    assert req(defs, "voice.misstatement.warning_reason") == "misstated_figure"


def test_nothing_here_asks_whether_a_figure_is_grounded():
    # The line CLAUDE.md rule 9 draws: a figure that appears NOWHERE on the
    # board is not this function's business, however wrong it is.
    assert _wrote("Sales were 4,412 pesos.", [{"rows": [], "meta": {}}]) == []


# ---------------------------------------------------------------------------
# The gate, driven through the loop — the pure function being right is not the
# same as it being wired to anything.
# ---------------------------------------------------------------------------

from tests.test_voice_contract import (                                # noqa: E402
    _drive_drawn, _standing_answer, ROWS, META, RECITING, READING,
)
from tests.test_loop_correction_contract import StubLog, frames_of      # noqa: E402

# 48,210 drawn; 48,200 written. Two of its digits gone, the rest kept.
MISSTATING = "Rockwell took about ₱48,200 last week, which is the week's story."


def _gap_kinds() -> list[str]:
    return [p[2] for log in StubLog.instances for sql, p in log.statements
            if "george.gaps" in sql]


def test_the_written_figure_is_an_echo_of_the_drawn_one():
    drawn = [{"rows": ROWS, "meta": META}]
    assert [(w, d) for _, w, d in _prose.misstated_figures(MISSTATING, drawn)] \
        == [(48200.0, 48210.0)]
    # And the gate it slipped past still does not see it.
    assert _prose.restated_sentences(MISSTATING, drawn) == []


def test_a_misstated_figure_costs_one_rewrite(monkeypatch):
    frames, requests = _drive_drawn(monkeypatch, [MISSTATING, READING])
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "misstated_figure"]
    assert len(warnings) == 1 and warnings[0]["found"] == 1
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == ["misstated_figure"]
    assert _standing_answer(frames) == READING


def test_the_correction_names_both_the_written_and_the_drawn_figure(monkeypatch):
    _, requests = _drive_drawn(monkeypatch, [MISSTATING, READING])
    sent = [m["content"] for r in requests for m in r["messages"]
            if m["role"] == "user" and isinstance(m["content"], str)]
    correction = [c for c in sent if "written wrong" in c]
    assert correction, "the misstatement was never put to the model"
    assert "48200" in correction[0] and "48210" in correction[0]


def test_the_gap_is_recorded_under_its_own_kind(monkeypatch):
    _drive_drawn(monkeypatch, [MISSTATING, READING])
    assert "misstated_figure" in _gap_kinds()


def test_a_wrong_figure_outranks_a_repeated_one_when_both_are_present(monkeypatch):
    # The sweep should sort a wrong number above a said-twice one, so the
    # warning takes the more serious name — and BOTH gaps are still recorded.
    both = RECITING + " " + MISSTATING
    frames, _ = _drive_drawn(monkeypatch, [both, READING])
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == ["misstated_figure"]
    kinds = _gap_kinds()
    assert "misstated_figure" in kinds and "restated_figure" in kinds


def test_one_correction_covers_both_rather_than_two_round_trips(monkeypatch):
    both = RECITING + " " + MISSTATING
    frames, requests = _drive_drawn(monkeypatch, [both, READING])
    assert len(frames_of(frames, "answer_reset")) == 1
    # read + first answer + the one rewrite
    assert len(requests) == 3


def test_a_clean_reading_is_still_left_alone(monkeypatch):
    frames, _ = _drive_drawn(monkeypatch, [READING])
    assert [w["reason"] for w in frames_of(frames, "warning")
            if w["reason"] in ("misstated_figure", "restated_figure")] == []
