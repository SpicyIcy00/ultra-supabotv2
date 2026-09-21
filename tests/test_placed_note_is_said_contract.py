"""
A CAVEAT PLACED BESIDE ITS FIGURE HAS BEEN SAID (2026-09-21).

`reading.said_this_turn` is what the notice gate reads. It took the answer, the
caveat slot and the plan — and nothing of the page. But P7 gave the page a
`note`: the aside drawn beside the figure it qualifies, which is the placement
UI rule 4 asks for ("a notice is drawn ABOVE the number… identically
everywhere"). So a qualification written in the right place counted as unsaid,
and the loop appended the same notice verbatim underneath it.

A 150-word wall in the `caveat` slot passed the gate. A placed margin note
failed it. That is backwards, and it punished the model that lays its page out
best: on 2026-09-21 DeepSeek, which puts more of its qualification on the page
and less in the left column, was forced on 2 of 3 turns against Opus's 8 of 197.

WHAT THIS DELIBERATELY DOES NOT DO, and the reason is the trust floor. A
fingerprint matches when every group matches and any alternative within a group
does. Feeding it the page's whole prose — one live page carried 639 words of
`lede`, `head` and `say` — would let a notice count as conveyed because the
argument happened to contain the words, SILENCING a caveat that should have been
drawn. So only `note` is read: the one leaf whose purpose is to carry a
qualification.

HONEST ABOUT THE SIZE OF IT: replayed against the three forced turns of
2026-09-21 this changes none of them. What those turns were forced on was
`stale_sources` and `low_stock_not_operational`, which is a classification
question and not this. This closes the trap, it does not move today's number.
"""
from __future__ import annotations

import pytest

from agent import compose, reading

NOTE = ("Stock counts run days behind the sales and thousands sit below zero, "
        "so a line that looks empty may only be unrecorded.")


def _page(*children):
    return {"layout": "stack", "children": list(children)}


# ------------------------------------------------------------ what it reads

def test_a_placed_note_is_part_of_what_he_said():
    page = _page({"head": "The stock record is not a shelf"},
                 {"block": "records"},
                 {"note": NOTE})
    said = reading.said_this_turn("Down on the week.", {}, page)
    assert NOTE in said
    assert "Down on the week." in said


def test_a_note_nested_anywhere_is_found():
    page = _page({"layout": "row", "children": [
        {"block": "fell"},
        {"layout": "stack", "children": [{"note": NOTE}]}]})
    assert NOTE in compose.notes_on_the_page(page)


def test_the_pages_argument_prose_is_NOT_read():
    """The trust floor: 640 words of prose must not be able to satisfy a
    fingerprint by coincidence and silence a caveat that should be drawn."""
    page = _page({"lede": "Seven shops took less."},
                 {"head": "Transactions, not baskets"},
                 {"say": "The estate shed transactions and kept its basket."},
                 {"note": NOTE})
    got = compose.notes_on_the_page(page)
    assert got == NOTE
    for other in ("Seven shops took less.", "Transactions, not baskets",
                  "The estate shed transactions"):
        assert other not in got


def test_no_page_is_exactly_the_old_behaviour():
    a, r = "Down on the week.", {"caveat": "Two shops could not be compared."}
    assert reading.said_this_turn(a, r) == reading.said_this_turn(a, r, None)


def test_a_plan_written_as_steps_still_counts():
    # `next` became a list at P14; said_this_turn read only the string form,
    # so every step of a plan silently stopped counting as something he said.
    said = reading.said_this_turn("Down.", {"next": ["Greenhills first.", "Then Magnolia."]})
    assert "Greenhills first." in said and "Then Magnolia." in said


# --------------------------------------------------------------- and it is safe

@pytest.mark.parametrize("hostile", [
    {"layout": "stack", "children": [{"note": "x"}] * 500},
    {"note": "x", "children": [{"note": "y"}]},
    None,
    "not a tree",
    [],
])
def test_a_hostile_or_absent_tree_costs_what_an_honest_one_does(hostile):
    out = compose.notes_on_the_page(hostile)
    assert isinstance(out, str)


def test_the_loop_passes_the_page_it_recorded():
    from pathlib import Path
    src = (Path(__file__).resolve().parents[1] / "agent" / "loop.py").read_text(encoding="utf-8")
    assert "reading.said_this_turn(answer, reading_recorded, arrangement_recorded)" in src
