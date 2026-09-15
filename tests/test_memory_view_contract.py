"""
What "what do you remember?" actually returns — the read behind the finding.

NO DATABASE. `read_memory` is composed on top of `belief_store.current`, which
is where the SQL lives and is tested; what is checked here is the SHAPE of the
rows the room draws a memory from, because that shape is the card's whole
promise: every belief, when it was learned, what it rests on, and how often it
has been carried.

THE ONE THING THIS FILE IS REALLY FOR. `applied` is a number on a screen, and
a number that implies something nobody measured is the failure this repo is
built against. It counts the questions a view was ATTACHED to. It does not
count answers it changed, because nothing on this path can observe that — and
the read has to SAY so, in the rows' own company, or the figure is read as the
stronger claim by everyone who sees it.
"""

from datetime import datetime, timedelta, timezone

import pytest

pytest.importorskip("sqlalchemy")
import sys, pathlib                                        # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
from app.services import belief_store, decisions, self_reader   # noqa: E402

NOW = datetime(2026, 9, 15, 9, 0, tzinfo=timezone.utc)
LANDED = NOW - timedelta(hours=1)


def read(**over):
    base = dict(
        id="b1", subject_kind="store", subject="Rockwell", stance="needs_attention",
        claim="Rockwell is losing customers rather than smaller baskets.",
        evidence=[{"tool": "get_sales", "arguments": {"store": "Rockwell"}},
                  {"tool": "get_sales", "arguments": {"store": "Rockwell", "group_by": "hour"}},
                  {"tool": "get_stock", "arguments": {}}],
        told=None, confirmed_at=NOW - timedelta(days=3), held_since=NOW - timedelta(days=11),
        why=None, applied_count=9, last_applied_at=NOW - timedelta(minutes=5),
    )
    base.update(over)
    return base


def taught(**over):
    base = dict(
        id="t1", subject_kind="estate", subject="we", stance="means",
        claim="When they say we they mean the retail shops, not the warehouse.",
        evidence=[], told="no, we means the shops",
        confirmed_at=NOW - timedelta(days=3), held_since=NOW - timedelta(days=3),
        why=None, applied_count=2, last_applied_at=NOW - timedelta(minutes=5),
    )
    base.update(over)
    return base


@pytest.fixture
def held(monkeypatch):
    """The views George holds, for one call to read_memory."""
    rows: list[dict] = []

    async def current(session):
        return rows

    async def latest(session):
        return LANDED

    async def recent(session, window_days=7):
        return []

    monkeypatch.setattr(belief_store, "current", current)
    monkeypatch.setattr(belief_store, "latest_data_at", latest)
    monkeypatch.setattr(decisions, "recent", recent)
    return rows


def memory(held_rows):
    import asyncio
    held_rows[:] = held_rows
    return asyncio.run(self_reader.read_memory(None, username="ice"))


# ------------------------------------------------- every belief, and its life


def test_a_row_says_what_he_thinks_when_he_learned_it_and_what_it_rests_on(held):
    held.append(read())
    row = memory(held)["rows"][0]
    assert row["claim"].startswith("Rockwell is losing customers")
    assert row["held_since"] == NOW - timedelta(days=11)
    # THE READS BY NAME, DEDUPLICATED. Three calls, two tools: a row saying
    # "get_sales, get_sales, get_stock" reads as three different reads.
    assert row["rests_on"] == "get_sales, get_stock"
    assert row["stance"] == "needs_attention"
    assert row["id"] == "b1"


def test_a_row_says_how_often_it_has_been_carried_and_when_it_last_was(held):
    held.append(read())
    row = memory(held)["rows"][0]
    assert row["applied"] == 9
    assert row["last_applied"] == NOW - timedelta(minutes=5)


def test_the_count_says_what_it_measured_and_the_read_says_what_it_did_not(held):
    """
    The number is "questions this was attached to". Anybody reading it will
    take it for "answers this changed" unless the read itself says otherwise,
    and nothing anywhere measures that.
    """
    held.append(read())
    note = memory(held)["meta"]["note"]
    assert "ATTACHED" in note
    assert "not how many answers it changed" in note


def test_a_view_that_has_fallen_out_of_the_register_says_it_is_no_longer_carried(held):
    """
    Past the prompt's cap a view stops being attached to anything, so its
    count stops moving. Said on the row rather than inferred from a count that
    is not rising, which cannot tell "dropped out" from "formed this minute".
    """
    held.extend(read(id=f"b{i}") for i in range(belief_store.MAX_IN_PROMPT + 2))
    rows = memory(held)["rows"]
    assert rows[0]["carried"] is True
    assert rows[-1]["carried"] is False


# ------------------------------------------------------- the two grounds


def test_a_taught_view_rests_on_their_words_and_says_who_it_came_from(held):
    held.append(taught())
    row = memory(held)["rows"][0]
    assert row["told"] == "no, we means the shops"
    assert row["rests_on"] == "no, we means the shops"


def test_a_taught_view_is_never_unconfirmed_and_a_reading_still_is(held):
    """
    New data cannot make it less true that this is what they meant. The
    reading beside it, last checked before that data landed, still says so.
    """
    held.extend([taught(), read(confirmed_at=LANDED - timedelta(days=1))])
    rows = memory(held)["rows"]
    assert rows[0]["unconfirmed"] is False
    assert rows[1]["unconfirmed"] is True


# ----------------------------------------------------- receipts like any read


def test_the_view_has_receipts_like_any_read(held):
    """
    The card asks for this in those words. A memory drawn on the board carries
    a source, the filters that produced it and the time it was read, exactly
    as a sales read does — otherwise it is the one thing on screen asserting
    itself (CLAUDE.md rule 2, UI rule 6).
    """
    held.append(read())
    meta = memory(held)["meta"]
    assert meta["source_table"] == "george.beliefs"
    assert any("superseded_by IS NULL" in f for f in meta["filters_applied"])
    assert any("forgotten_at IS NULL" in f for f in meta["filters_applied"])
    assert isinstance(meta["snapshot_timestamp"], datetime)


def test_the_timestamp_is_when_the_memory_was_read_not_when_data_landed(held):
    """
    These rows are the state of george.beliefs as of now, and the figure under
    them is a count of applications — so the honest time on it is the read's,
    not the transaction stream's. When data last landed is its own key, where
    the unconfirmed mark is computed from it.
    """
    held.append(read())
    meta = memory(held)["meta"]
    assert meta["snapshot_timestamp"] > LANDED
    assert meta["latest_data_at"] == LANDED


# ---------------------------------------------------------------------------
# FORGET IS A PERSON'S GESTURE, AND IT IS WIRED AS ONE
#
# George may revise a view a read contradicts — `record_belief` against the
# id, with the reason. He may not decide to stop knowing something because
# somebody disagreed with him. So Forget is an HTTP route the room calls on
# the person's own authority, and there is no tool for it at all: the absence
# is the guarantee (CLAUDE.md rule 4).
# ---------------------------------------------------------------------------


def test_george_has_no_tool_that_forgets_a_view():
    from agent import loop as george_loop, write_tools
    from agent.write_tools import WriteContext

    assert not [n for n in write_tools.WRITE_TOOL_FUNCTIONS if "forget" in n]
    everything = george_loop.injected_surface(WriteContext(
        belief_store=object(), memory_reader=lambda: None))
    assert not [n for n in everything if "forget" in n]


def test_the_room_reaches_one_route_and_it_names_the_belief():
    from app.api.v1.routes import george as route
    paths = [r.path for r in route.router.routes if "belief" in r.path]
    assert paths == ["/beliefs/{belief_id}/forget"]


def test_a_forget_that_finds_no_held_view_is_a_404_and_not_a_shrug():
    """
    Telling somebody it worked twice is telling them something untrue once.
    """
    import inspect
    from app.api.v1.routes import george as route
    src = inspect.getsource(route.forget_belief)
    assert "BeliefNotHeld" in src
    assert "HTTP_404_NOT_FOUND" in src


def test_the_count_moves_with_the_block_and_never_costs_a_turn():
    """
    TWO PROPERTIES IN ONE PLACE, because they are the same line of code.

    The views counted as applied are the views `in_prompt` put in the block,
    so the count cannot drift from what was actually handed over. And a
    counter that fails never loses the answer: the block is returned either
    way, which is the rule every lookup on this path already follows.
    """
    import inspect
    from app.api.v1.routes import george as route
    src = inspect.getsource(route._beliefs_for)
    # The views counted are exactly the views the block carried.
    assert "mark_applied(" in src and "in_prompt(rows)" in src
    # And the counter is inside its own guard, so its failure is not the
    # turn's: the block is what comes back either way.
    counting = src[src.index("mark_applied("):]
    assert "except SQLAlchemyError" in counting and "rollback" in counting
    assert any(line.strip() == "return block" for line in src.splitlines())
