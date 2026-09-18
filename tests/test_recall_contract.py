"""
Cross-chat recall: what goes in the block, and what must not.

NO DATABASE — the SELECT is one indexed read of the caller's own rows and is
not what can go wrong. What can go wrong is the block it produces: a figure
that reads as current, a number lifted out of prose, a line long enough to turn
a prompt into a second conversation. Those are all shaping, and shaping is
testable without a connection.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.bob_recall import (
    MAX_ANSWER_HEAD,
    MAX_QUESTION,
    MAX_RECALL_TURNS,
    as_block,
    build_recall_context,
)


def row(question, answer, receipts=None, day=(2026, 8, 27)):
    return {
        "asked_at": datetime(*day, 9, 30, tzinfo=timezone.utc),
        "question": question,
        "final_answer": answer,
        "receipts": receipts,
    }


NET_SALES = {
    "source_table": "new_transactions",
    "metric": "net_sales",
    "window": {"kind": "preset", "name": "last_week",
               "start": "2026-08-17", "end": "2026-08-24"},
    "snapshot_timestamp": "2026-08-27T09:30:00+00:00",
}


def test_a_line_carries_the_date_the_question_the_measure_and_the_opening():
    block = build_recall_context([
        row("net sales last week", "₱179,412 across the seven trading stores, up 4%.",
            NET_SALES),
    ])
    assert "2026-08-27" in block
    assert '"net sales last week"' in block
    assert "net_sales" in block
    assert "over 2026-08-17→2026-08-24" in block
    assert 'answer began "₱179,412 across the seven trading stores, up 4%."' in block


def test_the_window_is_present_because_a_figure_without_one_cannot_be_compared():
    """
    "Up from ₱179k" across a week and a day is a false statement made of two
    true ones. The window is what makes the comparison checkable at all.
    """
    block = build_recall_context([row("net sales last week", "₱179,412.", NET_SALES)])
    assert "2026-08-17→2026-08-24" in block


def test_a_named_window_with_no_dates_still_says_what_it_was():
    receipts = {"metric": "net_sales", "window": {"kind": "preset", "name": "yesterday"}}
    block = build_recall_context([row("how was yesterday", "₱44,100.", receipts)])
    assert "over yesterday" in block


def test_a_turn_with_no_receipts_still_produces_a_line():
    """A refusal or a no-tool answer has no meta. It is still worth recalling."""
    block = build_recall_context([
        row("can you check the vending aisles", "Not from that source — it is 29 days stale."),
    ])
    assert '"can you check the vending aisles"' in block
    assert "answer began" in block


# ---------------------------------------------------------------------------
# The framing is the guarantee
# ---------------------------------------------------------------------------

def test_the_block_says_these_are_reference_only_and_not_tool_results():
    block = build_recall_context([row("net sales last week", "₱179,412.", NET_SALES)])
    lowered = block.lower()
    assert "reference only" in lowered
    assert "may not restate it as a current number" in lowered
    assert "calculation" in lowered
    # Rule 1 restated next to the material it qualifies, rather than left to be
    # remembered from the system prompt thirty turns later.
    assert "tool call in this conversation" in lowered


def test_the_answer_is_quoted_as_an_opening_fragment_not_as_a_figure():
    """
    The number is never lifted out of the prose — a regex hunting figures in an
    answer would eventually surface one no tool ever returned. It travels
    inside a quoted fragment that says what it is.
    """
    block = build_recall_context([row("net sales last week", "₱179,412.", NET_SALES)])
    assert 'answer began "' in block


def test_nothing_to_recall_produces_no_block_at_all():
    # Not an empty heading, which would spend tokens announcing that there is
    # no history and invite the model to remark on its absence.
    assert build_recall_context([]) is None
    assert as_block([]) is None


# ---------------------------------------------------------------------------
# Bounded, because this lands in the prompt
# ---------------------------------------------------------------------------

def test_a_long_answer_is_cut_and_marked_as_cut():
    long_answer = "₱179,412 across the seven trading stores. " + ("detail " * 200)
    block = build_recall_context([row("net sales last week", long_answer, NET_SALES)])
    quoted = block.split('answer began "')[1].rsplit('"', 1)[0]
    assert len(quoted) <= MAX_ANSWER_HEAD + 1
    assert quoted.endswith("…")


def test_a_long_question_is_cut_and_marked_as_cut():
    block = build_recall_context([row("why " * 100, "Because.", NET_SALES)])
    quoted = block.split('"')[1]
    assert len(quoted) <= MAX_QUESTION + 1
    assert quoted.endswith("…")


def test_newlines_never_break_the_one_line_per_turn_shape():
    block = build_recall_context([
        row("net sales", "₱179,412.\n\n| store | value |\n| --- | --- |", NET_SALES),
        row("and stock", "42 SKUs.", None),
    ])
    # One bullet per recalled turn, and nothing else on a line of its own: a
    # markdown table smuggled in from a stored answer would otherwise arrive as
    # rows the model could read as data.
    lines = block.splitlines()
    assert len(lines) == 3                       # the framing, then two bullets
    assert sum(1 for ln in lines if ln.startswith("- ")) == 2


def test_the_default_turn_budget_is_small():
    """Six is enough for "what did I ask on Thursday" and not a second chat."""
    assert MAX_RECALL_TURNS == 6


def test_order_is_preserved_so_the_newest_is_read_first():
    block = build_recall_context([
        row("newest", "A.", None, day=(2026, 9, 3)),
        row("oldest", "B.", None, day=(2026, 8, 1)),
    ])
    assert block.index("newest") < block.index("oldest")


def test_recall_survives_receipts_it_did_not_expect():
    """
    THE BUG THIS HOLDS. Recall runs on the path that answers EVERY question,
    against receipts stored by whatever version of a tool wrote them — possibly
    weeks ago. A shape it does not expect must cost the recall LINE and never
    the answer.

    It cost every answer once: tools/objects.py put a bare preset string in
    meta.window, where every other tool puts a structured {kind, name, start,
    end}. The next question asked in any conversation that had opened an object
    raised AttributeError: 'str' object has no attribute 'get', and the ask
    endpoint returned 500 before a single frame went out.

    Both halves are fixed and both are held: the tool no longer overloads the
    key (test_objects_contract), and this tolerates anything.
    """
    from app.services.bob_recall import _figure

    assert _figure({"metric": "net_sales", "window": "last_week"}) == "net_sales"
    assert _figure({"metric": "x", "window": ["a", "b"]}) == "x"
    assert _figure({"metric": "x", "window": None}) == "x"
    assert _figure({"metric": "x"}) == "x"
    assert _figure(None) == ""
    # And the shape it does understand still works.
    assert "over" in _figure({"metric": "x", "window": {"name": "last week"}})
