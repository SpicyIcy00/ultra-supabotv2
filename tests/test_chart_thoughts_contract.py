"""
A thought on every chart, and questions to tap under the headline (2026-09-17).

The owner: "add more ai thoughts to the charts cause if the ai thoughts are with
the charts it feels likes your going thorugh it together and under the blob is
the main headline and question suggestions".

WHAT THIS HOLDS, without a model:

  - a block may carry a `thought`: bounded, and a figure only when a read this
    turn returned it — Bob's reading of the chart, never arithmetic on it;
  - a reading may carry `asks`: at most three short questions, same figure
    rule, a failing one dropped with its reason and the rest standing;
  - the compose tool's schema tells him both, from metrics.yaml;
  - SYSTEM_PROMPT is not where it was said — the budget is untouched.
"""
from __future__ import annotations

import pytest

pytest.importorskip("yaml")

from agent import compose, reading  # noqa: E402
from agent import loop as bob_loop  # noqa: E402
from tools._common import load_defs  # noqa: E402

DEFS = load_defs()
#: The loop's record of a read, as compose receives it (seq → the call as it ran).
CALLS = {
    0: {"is_read": True, "error": None, "duplicate": False, "tool": "get_sales",
        "rows": [{"store": "OPUS", "value": 467102, "baseline": 555147,
                  "change_pct": -15.9, "direction": "down"}],
        "meta": {"source_table": "new_transactions"}},
}


def _block(**extra):
    return [{"op": "put", "kind": "ranked", "key": "sales", "weight": "lead", "seq": 0, **extra}]


def test_a_block_carries_his_thought():
    accepted, rejected = compose.validate(
        _block(thought="OPUS gave up more than any shop, down to ₱467,102 — the drop is theirs."),
        CALLS, DEFS)
    assert not rejected, rejected
    assert accepted[0]["thought"].startswith("OPUS gave up more")


def test_a_thought_may_not_carry_a_figure_no_read_returned():
    accepted, rejected = compose.validate(
        _block(thought="OPUS lost ₱88,045 of the estate's fall."), CALLS, DEFS)
    assert not accepted
    assert "no read returned" in rejected[0]["reason"]
    assert "composition.thought" in rejected[0]["reason"]


def test_a_thought_is_bounded_by_cutting_not_by_losing_the_block():
    """Past its length a thought keeps the sentences that fit (P2S.7); a
    refused thought used to take its whole block off the board."""
    longest = DEFS["composition"]["thought"]["max_length"]
    first = "OPUS gave up more than any shop this week."
    coerced: list[str] = []
    accepted, rejected = compose.validate(
        _block(thought=first + " " + "word " * longest), CALLS, DEFS, coerced=coerced)
    assert rejected == []
    assert accepted[0]["thought"] == first
    assert coerced


def test_the_asks_are_kept_bounded_and_held_to_the_figure_rule():
    returned = reading.returned_numbers(CALLS.values())
    said, refused = reading.validate({
        "claim": "OPUS gave up the estate",
        "asks": ["Which products fell at OPUS?", "Was it fewer shoppers at OPUS?",
                 "Why is OPUS down ₱88,045?", "What about Greenhills?", "And Rockwell?"],
    }, DEFS, returned)
    assert said["asks"] == ["Which products fell at OPUS?", "Was it fewer shoppers at OPUS?",
                            "What about Greenhills?"]
    reasons = [r["reason"] for r in refused if r["slot"] == "asks"]
    assert any("no read returned" in r for r in reasons)
    assert any("at most 3" in r for r in reasons)


def test_the_compose_schema_tells_him_both():
    schema = next(t for t in bob_loop.build_tool_schemas()
                  if t["name"] == bob_loop.COMPOSE_TOOL)["input_schema"]["properties"]
    thought = schema["blocks"]["items"]["properties"]["thought"]
    assert thought["maxLength"] == DEFS["composition"]["thought"]["max_length"]
    assert "go through it together" in thought["description"]
    assert "asks" in schema["reading"]["properties"]


def test_it_was_not_said_in_the_system_prompt():
    # On the tool it describes, not in the prompt, which is at its budget.
    words = len(bob_loop.SYSTEM_PROMPT.split())
    assert words <= DEFS["voice"]["budget"]["max_words"]
