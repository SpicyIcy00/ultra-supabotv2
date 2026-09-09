"""
How a kept view reaches the prompt, and how it admits its own age.

NO DATABASE. The block builder and the wiring; the store's own confirm/revise
logic needs a session and was verified against the real table.

WHY THE FRESHNESS MARK IS THE WHOLE TEST FILE. A stored view with no age on it
is an old answer wearing authority — the same failure as a figure with no
timestamp, arriving through a sentence instead of a number. Everything else
here is scaffolding around that one property.
"""

from datetime import datetime, timedelta, timezone

import pytest

from agent import loop as george_loop
from agent import write_tools

pytest.importorskip("sqlalchemy")
import sys, pathlib                                        # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
from app.services import belief_store                      # noqa: E402

NOW = datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc)


def belief(**over):
    base = {
        "id": "b1",
        "subject_kind": "store",
        "subject": "Rockwell",
        "stance": "needs_attention",
        "claim": "Rockwell is losing customers rather than smaller baskets.",
        "evidence": [{"tool": "get_sales", "arguments": {}}],
        "confirmed_at": NOW - timedelta(hours=1),
        "held_since": NOW - timedelta(days=11),
        "why": None,
    }
    base.update(over)
    return base


# ------------------------------------------------------------- freshness


def test_a_belief_checked_before_the_newest_data_is_marked_unconfirmed():
    """
    The property this whole feature stands or falls on. A view last checked on
    Monday, with Tuesday's sales now in, must not read as current.
    """
    block = belief_store.as_block(
        [belief(confirmed_at=NOW - timedelta(days=3))],
        latest_data=NOW - timedelta(days=1), now=NOW,
    )
    assert "UNCONFIRMED" in block
    assert "data has landed since" in block


def test_a_belief_checked_after_the_newest_data_is_not_marked():
    block = belief_store.as_block(
        [belief(confirmed_at=NOW - timedelta(minutes=5))],
        latest_data=NOW - timedelta(days=1), now=NOW,
    )
    assert "UNCONFIRMED" not in block


def test_freshness_is_not_claimed_when_it_cannot_be_computed():
    """
    No latest-data timestamp means no basis for the mark. Marking everything
    stale would be as wrong as marking nothing — it must simply not claim.
    """
    block = belief_store.as_block([belief()], latest_data=None, now=NOW)
    assert "UNCONFIRMED" not in block


def test_how_long_it_has_been_held_is_shown():
    """
    "Held eleven days" is the sentence that makes a view feel like something
    somebody has been carrying rather than a cached answer.
    """
    assert "held 11 days" in belief_store.as_block([belief()], now=NOW)


def test_a_view_formed_today_does_not_claim_to_be_old():
    block = belief_store.as_block([belief(held_since=NOW)], now=NOW)
    assert "held since today" in block


# ----------------------------------------------------------------- shape


def test_believing_nothing_produces_no_block():
    """
    The first conversation ever must carry no empty scaffolding — an "I believe
    nothing" header would be noise in every new deployment.
    """
    assert belief_store.as_block([]) is None
    assert belief_store.as_block([], latest_data=NOW) is None


def test_every_belief_carries_its_id_so_it_can_be_revised():
    """Without the id George cannot supersede a view, only duplicate it."""
    assert "[id: b1]" in belief_store.as_block([belief()], now=NOW)


def test_the_block_says_these_are_views_and_not_figures():
    block = belief_store.as_block([belief()], now=NOW)
    assert "not tool results" in block
    assert "carry no figures" in block


def test_the_block_is_capped_and_says_how_many_it_left_out():
    """
    A view of the business somebody can hold in their head is a handful. Past
    the cap it stops being context and becomes a document — and silently
    truncating would hide views George still holds.
    """
    many = [belief(id=f"b{i}", subject=f"Shop {i}") for i in range(belief_store.MAX_IN_PROMPT + 3)]
    block = belief_store.as_block(many, now=NOW)
    assert block.count("[id: ") == belief_store.MAX_IN_PROMPT
    assert "and 3 more not shown" in block


# --------------------------------------------------------------- wiring


def test_the_tool_is_gated_on_an_injected_store():
    """
    No store, no tool in the schema — the capability IS the injection, exactly
    as it is for pinning and for pages.
    """
    assert write_tools.WRITE_TOOL_REQUIRES["record_belief"] == "belief_store"
    assert "record_belief" in write_tools.WRITE_TOOL_FUNCTIONS


def test_the_tool_is_absent_without_a_store():
    from agent.write_tools import WriteContext
    assert "record_belief" not in george_loop.injected_surface(WriteContext())


def test_the_tool_is_present_with_one():
    from agent.write_tools import WriteContext

    class Store:
        async def record(self, accepted):
            return []

    assert "record_belief" in george_loop.injected_surface(WriteContext(belief_store=Store()))


def test_beliefs_reach_the_loop_as_a_question_block_not_a_tool():
    """
    What George believes shapes the whole turn, so it arrives WITH the question
    rather than being fetched during it — the same way recall does. Fetching it
    mid-turn would mean the frame arrived after the reading had started.
    """
    import inspect
    params = inspect.signature(george_loop.run).parameters
    assert "beliefs" in params
    assert "belief_store" in params


def test_the_prompt_tells_george_to_read_them_first_and_never_contradict_silently():
    section = george_loop.JUDGMENT_SECTION
    assert "KEEPING A VIEW" in section
    assert "never contradict it silently" in section
    assert "A STORED VIEW CARRIES NO" in section
