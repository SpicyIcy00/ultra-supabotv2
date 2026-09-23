"""
THE LEFT IS THE BIGGER PICTURE, AND THE DISCLAIMERS GO (D2, 2026-09-23).

The owner, testing the live build after wave 2 (`ops/DOGFOOD_LOG.md`, the
2026-09-23 entry):

  *"why is there soo much text on the left i want most text on the right. the
  left is just the bigger picture."*
  *"its still really long even for non pages we need to check that, it wasnt
  like that before."*
  *"theres still alot of discliamers i dont really want to see them."*
  *"i dont really like thats its making me ask why when i already asked why and
  it should provide most it for me."*

Three things are held here, and each is enforced rather than asked for —
instructing has not held any of them (`enforce the page, don't instruct it`):

  THE LEFT IS THE POINT AND A LINE UNDER IT. Measured live on his own "Why is
  Greenhills down?" on 2026-09-23: the body came back at EIGHT words and the
  caveat drawn above it at FORTY-SEVEN. The bound on the body was never what
  made that column long, so the caveat went to the head of the figures — what
  it qualifies, where UI rule 4 puts it — and the column holds the answer.

  A NON-PAGE ANSWER IS SHORT AGAIN. W1.1 gave the focused answer 70 words where
  every answer had been held to `voice.body.max_words` (40 since P6.h). That is
  the regression he names, and this test is why it cannot come back quietly.

  THE QUESTION JUST ASKED IS NEVER OFFERED BACK. "Why is Greenhills down?" was
  offered to tap under the answer to "Why is Greenhills down?".

NO DATABASE, NO API: the definitions, `agent/reading.py` and `agent/compose.py`.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.compose imports the tools, which import psycopg")

from agent import compose, reading                                             # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()
BODY = req(DEFS, "voice.body")
SIZE = req(DEFS, "composition.size")
ASKS = req(DEFS, "voice.reading.asks")
DESK_NOTICES = req(DEFS, "surface.desk.notices")


def _calls(n: int = 2) -> dict:
    return {i: {"tool": "get_sales", "arguments": {"metric": "net_sales", "group_by": []},
                "error": None, "duplicate": False, "is_read": True, "filters": {},
                "rows": [{"store": "Greenhills", "value": 10.0 + i, "baseline": 9.0,
                          "change": 1.0, "change_pct": 5.0, "baseline_status": "ok"}],
                "meta": {"row_count": 1}}
            for i in range(n)}


OFFER = req(SIZE, "kinds.focused.offer")


def _his_asks(out: dict) -> list:
    """The asks he wrote, less the page OFFER compose puts first on a focused answer."""
    return [a for a in (out["meta"]["reading"].get("asks") or []) if a != OFFER]


def _block(key: str, seq: int) -> dict:
    return {"op": "put", "key": key, "kind": "figure", "weight": "supporting", "seq": seq,
            "subject": "Greenhills", "claim": "Greenhills fell"}


# ---------------------------------------------------------------------------
# 1. What he says before the first figure, and what the gate measures
# ---------------------------------------------------------------------------

def test_what_he_says_before_the_first_figure_is_the_body_and_the_caveat():
    body = "Greenhills fell on fewer transactions."
    said = reading.drawn_left(body, {"caveat": "Two different weeks.",
                                     "next": "Check the hours."})
    assert "Two different weeks." in said, "the caveat is read before the figures"
    assert "Check the hours" not in said, "`next` is drawn last, under the figures"
    assert reading.drawn_left_words(body, {"caveat": "Two different weeks."}) == (
        len(body.split()) + 3)


def test_a_caveat_sentence_the_answer_already_carries_is_counted_once():
    body = "Greenhills fell. These are two different weeks."
    # The room draws only the caveat sentences the answer does not carry
    # (Reading.tsx `unsaid`), so the measure must not count them twice.
    assert reading.caveat_unsaid("These are two different weeks.", body) == ""
    assert reading.drawn_left_words(body, {"caveat": "These are two different weeks."}) == (
        len(body.split()))


def test_the_definitions_say_the_left_is_the_body_and_the_caveat_is_with_the_figures():
    assert list(req(BODY, "drawn_on_the_left")) == ["body"]
    assert req(BODY, "caveat_drawn_with") == "figures"


def test_the_caveat_is_back_to_one_thing_said_once():
    """
    640 -> 320. The raise was made because the bound REFUSED the slot and a
    refusal lost the caveat; it is `kept_whole` since the same afternoon, so a
    crossing loses nothing — and on 2026-09-23 a 47-word caveat sat over an
    eight-word answer.
    """
    caveat = req(DEFS, "voice.reading.slots.caveat")
    assert int(caveat["max_length"]) == 320
    assert caveat["over_length"] == "kept_whole", "a cut caveat can drop the warning it carries"


# ---------------------------------------------------------------------------
# 2. A non-page answer is short again — the regression he found
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["remember", "lookup", "focused"])
def test_no_answer_without_a_page_is_given_more_words_than_the_body_bound(size):
    """
    W1.1 gave `focused` 70 where voice.body.max_words is 40, and the owner read
    the result as "its still really long even for non pages ... it wasnt like
    that before". A size with no page of its own has nowhere else to put the
    words, so it never gets MORE room than the bound every answer had.
    """
    spec = req(SIZE, f"kinds.{size}")
    assert spec["page"] is False
    assert int(spec["max_words"]) <= int(req(BODY, "max_words")), (
        f"a {size} answer has no page, so its words are the left column's"
    )


def test_the_broad_answer_still_defers_to_the_body_bound():
    """A page carries the prose; beside it his words are the conclusion."""
    assert req(SIZE, "kinds.broad.page") is True
    assert req(SIZE, "kinds.broad.max_words") is None


# ---------------------------------------------------------------------------
# 3. Never offer back the question just asked
# ---------------------------------------------------------------------------

def test_an_ask_that_is_the_question_again_is_dropped_before_it_is_drawn():
    out = compose.compose(
        [_block("net", 0)],
        {"claim": "Greenhills fell", "asks": ["Why is Greenhills down?",
                                              "Should we move stock to Rockwell?"]},
        calls=_calls(), defs=DEFS, size="focused", ceiling="focused", own=[],
        question="Why is Greenhills down?")
    assert _his_asks(out) == ["Should we move stock to Rockwell?"]
    [dropped] = [r for r in out["meta"]["rejected_slots"] if r["slot"] == "asks"]
    assert "the question just asked" in dropped["reason"]
    assert "Greenhills" in dropped["said"]


def test_the_same_question_in_other_words_is_dropped_too():
    out = compose.compose(
        [_block("net", 0)],
        {"claim": "Greenhills fell", "asks": ["Greenhills is down why?"]},
        calls=_calls(), defs=DEFS, size="focused", ceiling="focused", own=[],
        question="why is Greenhills down")
    assert _his_asks(out) == []


def test_an_ask_that_is_the_claim_again_is_dropped():
    out = compose.compose(
        [_block("net", 0)],
        {"claim": "Greenhills lost transactions",
         "asks": ["Did Greenhills lose transactions?"]},
        calls=_calls(), defs=DEFS, size="focused", ceiling="focused", own=[],
        question="how are the shops")
    assert _his_asks(out) == []


def test_a_genuinely_different_question_still_stands():
    out = compose.compose(
        [_block("net", 0)],
        {"claim": "Greenhills fell", "asks": ["Is the warehouse holding enough stock?"]},
        calls=_calls(), defs=DEFS, size="focused", ceiling="focused", own=[],
        question="Why is Greenhills down?")
    assert _his_asks(out) == ["Is the warehouse holding enough stock?"]


def test_the_bar_is_a_definition_and_not_a_number_in_the_code():
    assert 0 < float(req(ASKS, "not_the_question_at")) <= 1
    assert 0 < float(req(ASKS, "not_the_claim_at")) <= 1
    assert req(ASKS, "dropped_reason")


# ---------------------------------------------------------------------------
# 4. Which notices are drawn, decided per kind
# ---------------------------------------------------------------------------

def test_the_purchase_plans_negative_stock_note_only_explains_how_it_was_measured():
    """
    purchasing.plan.negative_on_hand reads a negative count as NONE at that
    location and never as a deficit, and the notice's own words are "the
    quantities here are not inflated by them". Nothing drawn is wrong.
    """
    assert req(DEFS, "purchasing.plan.negative_on_hand.read_as") == "none_at_that_location"
    assert req(DEFS, "purchasing.plan.negative_on_hand.never_as_a_deficit") is True
    assert "purchase_plan_negative_on_hand" in DESK_NOTICES["explains_only"]
    assert "purchase_plan_negative_on_hand" not in DESK_NOTICES["data_may_be_wrong"]


def test_the_replenishment_plans_negative_stock_note_still_says_a_figure_is_wrong():
    """shipment_plans DOES size its request against the raw figure, so the
    drawn quantity is inflated and the notice says so. It stays drawn."""
    assert "replenishment_negative_on_hand" in DESK_NOTICES["data_may_be_wrong"]
    assert "replenishment_negative_on_hand" not in DESK_NOTICES["explains_only"]
