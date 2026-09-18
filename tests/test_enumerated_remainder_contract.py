"""
A count Bob worked out himself — the third way past a gate that checks quoting.

PURE. No database, no model, no API.

THE DEFECT THIS CLOSES (dogfood log, 2026-09-13). The twelve caught Bob
writing, of a product comparison:

    "48 sold last week with nothing in the week before (Aji Cuttlefish
     Japanese, Aji Golden Plum, Aji Squid Hokkaido Slices and 45 others)"

48 came from the read. 45 is 48 minus the three he chose to name, so the
subtraction is his and no row, meta or notice holds a receipt for it.

WHY NEITHER EXISTING GATE COULD SEE IT. `restated_sentences` fires on a figure
the board draws, said again — 45 restates nothing. `misstated_figures` fires on
a drawn figure rounded off — 45 is a rounding of nothing. Both check the prose
against what is on screen, and this number is on screen nowhere, which is the
same shape as the "800 grams-worth" defect closed the same morning: arithmetic
in prose is the way past a gate that checks quoting.

WHERE THE LINE IS, AND IT IS NOT MOVED. What fires here is a CONSTRUCTION, not
a missing row. A count that sits beside "others", "more" or "the other" is by
definition what is LEFT once the writer decided how many members to name, so no
tool can ever have returned it — the shape is the proof. Rows are consulted
only to EXCUSE, exactly as `misstated_figures` excuses an exact match: a drawn
delta reading as "45 more" is the board's own figure and is left alone. An
ordinary ungrounded numeral still sails past untouched. That remains
`ungrounded_numerals`, it remains an eval, and CLAUDE.md rule 9 keeps it one —
held below by `test_an_ordinary_ungrounded_figure_is_still_not_productions_business`.
"""

from __future__ import annotations

import pytest

from agent import prose as _prose
from tools._common import load_defs, req

DEFS = load_defs()
TAILS = tuple(req(DEFS, "voice.enumerated_remainder.trailing_words"))
LEADERS = tuple(req(DEFS, "voice.enumerated_remainder.leading_phrases"))

# The comparison meta behind the reported turn: every figure in the sentence
# came from here except the one this file is about.
COMPARISON = [{"rows": [], "meta": {
    "compared": 216, "not_compared": 102,
    "new_last_week": 48, "gone_this_week": 49, "zero_baseline": 5,
}}]

THE_ANSWER = (
    "The product view carries a real limit: of the 216 products compared, 102 "
    "could not be compared against the baseline — 48 sold last week with "
    "nothing in the week before (Aji Cuttlefish Japanese, Aji Golden Plum, Aji "
    "Squid Hokkaido Slices and 45 others), 49 sold in the baseline week and not "
    "last week, and 5 free-pack lines have a baseline of exactly zero."
)


def _found(answer, results=COMPARISON):
    return [(n, phrase) for _s, n, phrase in
            _prose.enumerated_remainders(answer, results, TAILS, LEADERS)]


# ---------------------------------------------------------------------------
# The turn that was reported
# ---------------------------------------------------------------------------

def test_the_reported_answer_is_caught():
    assert _found(THE_ANSWER) == [(45.0, "45 others")]


def test_every_other_figure_in_that_sentence_is_left_alone():
    # 216, 102, 48, 49 and 5 all came from the read. Catching them would make
    # the gate fire on the one part of the answer that was working.
    assert [n for n, _ in _found(THE_ANSWER)] == [45.0]


ISOLATED = "I named three of them and 45 others went unnamed."


def test_neither_existing_gate_can_see_the_45():
    """
    The defect, stated as a test.

    `misstated_figures` sees nothing: 45 is a rounding of nothing.
    `restated_sentences` DOES report the reported sentence — for 216, 102 and
    48, which all have receipts — and that is the shape of the failure rather
    than a defence against it: it reports the sentence for the figures that are
    grounded and is silent about the one that is not, so the rewrite it buys
    can carry 45 straight through. Isolated, neither gate says anything at all.
    """
    assert _prose.misstated_figures(THE_ANSWER, COMPARISON) == []
    assert _prose.restated_sentences(ISOLATED, COMPARISON) == []
    assert _prose.misstated_figures(ISOLATED, COMPARISON) == []
    assert _found(ISOLATED) == [(45.0, "45 others")]


# ---------------------------------------------------------------------------
# The shapes a remainder takes
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sentence, written", [
    ("Aji Mix, kiamoy and toys moved, and 45 others did too.", 45.0),
    ("Aji Mix led it, with 45 other lines behind.", 45.0),
    ("Three shops recovered; the other 44 did not.", 44.0),
    ("I named the top three and another 45 followed them.", 45.0),
    ("Two are real shortages and 40 more are record errors.", 40.0),
    ("Four lines are named here; 38 remaining are not.", 38.0),
    ("Aji Mix and Golden Plum led, and 52 unnamed lines followed.", 52.0),
])
def test_a_stated_remainder_is_caught_however_it_is_phrased(sentence, written):
    assert [n for n, _ in _found(sentence, [{"rows": [], "meta": {}}])] == [written]


# ---------------------------------------------------------------------------
# What is NOT a remainder — the false positives that would make it useless
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sentence", [
    "OPUS carried the week and Rockwell did not.",             # no figure
    "There is nothing more to say about that shop.",           # no numeral
    "Six shops are ahead and the other four are behind.",      # words, not digits
    "Three shops recovered and the other 4 did not.",          # a small count
    "It last sold on 11 Sep 2026, and nothing since.",         # a date
    "I would look no further than Aji Mix for the cause.",     # no numeral
])
def test_not_every_sentence_with_a_tail_word_is_a_remainder(sentence):
    assert _found(sentence, [{"rows": [], "meta": {}}]) == []


def test_a_drawn_delta_written_as_more_is_the_board_s_figure_and_is_left_alone():
    # The exemption that keeps this usable: 45 IS on the board, so "45 more"
    # is quoting it, not computing it — the restatement gate's business.
    drawn = [{"rows": [{"store": "Rockwell", "gain": 45.0}], "meta": {}}]
    assert _found("Rockwell took 45 more than OPUS did.", drawn) == []
    assert _prose.restated_sentences("Rockwell took 45 more than OPUS did.", drawn)


def test_a_remainder_over_no_read_at_all_still_counts():
    # Nothing charted means nothing could have returned it, which makes the
    # count more ungrounded rather than less.
    assert _found("I named three, and 45 others went unnamed.",
                  [{"rows": [], "meta": {}}]) == [(45.0, "45 others")]


def test_an_ordinary_ungrounded_figure_is_still_not_productions_business():
    """
    CLAUDE.md rule 9's line, unmoved. A figure that appears nowhere and sits in
    no remainder construction is not this function's business, however wrong it
    is — that is `ungrounded_numerals`, and it is an eval.
    """
    assert _found("Sales were 4,412 pesos last week.", [{"rows": [], "meta": {}}]) == []


# ---------------------------------------------------------------------------
# The definition behind it
# ---------------------------------------------------------------------------

def test_the_vocabulary_and_the_kind_come_from_the_yaml():
    gate = req(DEFS, "voice.enumerated_remainder")
    assert gate["warning_reason"] == "enumerated_remainder"
    assert gate["max_corrective_turns"] == 1
    assert "others" in gate["trailing_words"] and "the other" in gate["leading_phrases"]


def test_the_words_are_a_definition_the_function_is_given():
    # Swap the vocabulary and the gate follows it. The words live in
    # metrics.yaml with every other definition; agent/prose.py holds only the
    # grammar of them.
    assert _found(ISOLATED) == [(45.0, "45 others")]
    assert _prose.enumerated_remainders(
        ISOLATED, COMPARISON, ("widgets",), ("the widget",)) == []
    assert _prose.enumerated_remainders(
        "I named three and 45 widgets went unnamed.", COMPARISON,
        ("widgets",), ("the widget",))


def test_the_small_count_excuse_is_the_same_one_the_evals_use():
    # The measure and the gate must excuse the same numerals; a check that
    # fired on "and 3 others" while the eval called it presentation is the
    # drift agent/prose.py exists to prevent.
    from tests.evals import checks

    assert checks.allowed_numbers is _prose.allowed_numbers
    assert _found("I named two and 3 others followed.", [{"rows": [], "meta": {}}]) == []
    assert _prose.PRESENTATION_MAX == 31


# ---------------------------------------------------------------------------
# The gate, driven through the loop — the pure function being right is not the
# same as it being wired to anything.
# ---------------------------------------------------------------------------

from tests.test_voice_contract import (                                # noqa: E402
    _drive_drawn, _standing_answer, ROWS, RECITING, READING,
)
from tests.test_loop_correction_contract import StubLog, frames_of      # noqa: E402

# ROWS draws Rockwell at 48,210 and OPUS at 61,500.50 — two shops. "and 45
# others" is a count of shops nothing returned.
REMAINDER = ("Rockwell and OPUS are the two worth naming, and 45 others sat "
             "flat behind them.")


def _gap_kinds() -> list[str]:
    return [p[2] for log in StubLog.instances for sql, p in log.statements
            if "george.gaps" in sql]


def test_a_stated_remainder_costs_one_rewrite(monkeypatch):
    frames, _ = _drive_drawn(monkeypatch, [REMAINDER, READING])
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "enumerated_remainder"]
    assert len(warnings) == 1 and warnings[0]["found"] == 1
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == ["enumerated_remainder"]
    assert _standing_answer(frames) == READING


def test_the_correction_names_the_phrase_and_asks_for_the_total(monkeypatch):
    _, requests = _drive_drawn(monkeypatch, [REMAINDER, READING])
    sent = [m["content"] for r in requests for m in r["messages"]
            if m["role"] == "user" and isinstance(m["content"], str)]
    correction = [c for c in sent if "remainder you worked out yourself" in c]
    assert correction, "the remainder was never put to the model"
    assert "45 others" in correction[0]
    assert "among them" in correction[0]


def test_the_gap_is_recorded_under_its_own_kind(monkeypatch):
    _drive_drawn(monkeypatch, [REMAINDER, READING])
    assert "enumerated_remainder" in _gap_kinds()


def test_a_count_with_no_receipt_outranks_a_figure_merely_said_again(monkeypatch):
    # The sweep sorts on the kind, so the warning takes the most serious name
    # present — and both gaps are still recorded.
    both = RECITING + " " + REMAINDER
    frames, _ = _drive_drawn(monkeypatch, [both, READING])
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == ["enumerated_remainder"]
    kinds = _gap_kinds()
    assert "enumerated_remainder" in kinds and "restated_figure" in kinds


def test_one_pass_covers_both_and_since_p1h_costs_no_round_trip(monkeypatch):
    """
    A turn that recites AND states a remainder is corrected once — and since
    P1.h that correction is a deletion, so the turn is read + answer and
    nothing more. It was read + answer + rewrite.
    """
    both = RECITING + " " + REMAINDER
    frames, requests = _drive_drawn(monkeypatch, [both])
    assert len(frames_of(frames, "answer_reset")) == 1
    assert len(requests) == 2
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "enumerated_remainder"]
    assert len(warnings) == 1 and warnings[0]["corrected"] == "deterministic"
    standing = _standing_answer(frames)
    assert "45 others" not in standing, "the count with no receipt went"
    assert "48,210" in standing, "the figure the claim rests on stayed"


def test_the_correction_is_capped(monkeypatch):
    frames, _ = _drive_drawn(monkeypatch, [REMAINDER, REMAINDER, REMAINDER])
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "enumerated_remainder"]
    assert len(warnings) == req(DEFS, "voice.enumerated_remainder.max_corrective_turns") == 1
    assert _standing_answer(frames) == REMAINDER, (
        "it gave up and kept the answer rather than spinning")


def test_a_clean_reading_is_still_left_alone(monkeypatch):
    frames, _ = _drive_drawn(monkeypatch, [READING])
    assert [w["reason"] for w in frames_of(frames, "warning")
            if w["reason"] == "enumerated_remainder"] == []


def test_the_client_treats_the_warning_as_process_not_caveat():
    from pathlib import Path

    # PROCESS moved to room/data.ts with P1.k, where the work line reads the
    # same list the region above the board reads.
    src = (Path(__file__).resolve().parents[1]
           / "frontend/src/room/data.ts").read_text(encoding="utf-8")
    assert "'enumerated_remainder'" in src.split("const PROCESS")[1].split(";")[0]


def test_the_kind_is_in_the_sweep_catalogue_as_a_defect():
    from ops.sweep_gaps import DEFECTS, KINDS

    assert "enumerated_remainder" in KINDS
    assert "enumerated_remainder" in DEFECTS, (
        "a count with no receipt behind it is never operating noise")
