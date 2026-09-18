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

from agent import loop as bob_loop
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
    """Without the id Bob cannot supersede a view, only duplicate it."""
    assert "[id: b1]" in belief_store.as_block([belief()], now=NOW)


def test_the_block_says_these_are_views_and_not_figures():
    block = belief_store.as_block([belief()], now=NOW)
    assert "not tool results" in block
    assert "carry no figures" in block


def test_the_block_is_capped_and_says_how_many_it_left_out():
    """
    A view of the business somebody can hold in their head is a handful. Past
    the cap it stops being context and becomes a document — and silently
    truncating would hide views Bob still holds.
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
    assert "record_belief" not in bob_loop.injected_surface(WriteContext())


def test_the_tool_is_present_with_one():
    from agent.write_tools import WriteContext

    class Store:
        async def record(self, accepted):
            return []

    assert "record_belief" in bob_loop.injected_surface(WriteContext(belief_store=Store()))


def test_beliefs_reach_the_loop_as_a_question_block_not_a_tool():
    """
    What Bob believes shapes the whole turn, so it arrives WITH the question
    rather than being fetched during it — the same way recall does. Fetching it
    mid-turn would mean the frame arrived after the reading had started.
    """
    import inspect
    params = inspect.signature(bob_loop.run).parameters
    assert "beliefs" in params
    assert "belief_store" in params


# ------------------------------------------------------- the wiring itself


def test_the_stream_wrapper_forwards_everything_it_accepts():
    """
    THE TEST THAT WAS MISSING, and the bug it now catches actually shipped.

    `_safe_stream` sits between the route and the loop purely so a crash can
    close the stream cleanly. It is a pass-through, and a pass-through that
    quietly drops an argument is invisible: the route builds a capability, the
    wrapper accepts it, the loop never receives it, and nothing fails until a
    person asks a question. Adding `beliefs` and `belief_store` to the route
    and the loop while forgetting the wrapper produced a 500 on the first real
    question with 1,097 tests passing.

    Two properties, and together they close the gap from both sides: every
    parameter the wrapper takes is handed on, and everything it hands on is
    something the loop accepts.
    """
    import inspect
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
    from app.api.v1.routes import bob as route

    src = inspect.getsource(route._safe_stream)
    wrapper = [n for n in inspect.signature(route._safe_stream).parameters
               if n not in ("question", "user_id")]
    dropped = [n for n in wrapper if f"{n}={n}" not in src]
    assert not dropped, f"_safe_stream accepts but never forwards: {dropped}"

    accepted_by_loop = set(inspect.signature(bob_loop.run).parameters)
    unknown = [n for n in wrapper if n not in accepted_by_loop]
    assert not unknown, f"_safe_stream forwards what the loop cannot take: {unknown}"


def test_the_route_only_passes_the_wrapper_what_it_accepts():
    """
    The other direction, and the half that actually broke: an argument the
    route hands to _safe_stream that the wrapper has no parameter for. Read
    from the syntax tree rather than by matching text, so a reformatted call
    site cannot make this test quietly stop looking.
    """
    import ast
    import inspect
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))
    from app.api.v1.routes import bob as route

    accepted = set(inspect.signature(route._safe_stream).parameters)
    tree = ast.parse(pathlib.Path(route.__file__).read_text(encoding="utf-8"))

    passed: set[str] = set()
    for node in ast.walk(tree):
        if (isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "_safe_stream"):
            passed |= {kw.arg for kw in node.keywords if kw.arg}

    assert passed, "no call to _safe_stream found; this test has stopped looking"
    unknown = passed - accepted
    assert not unknown, f"the route passes _safe_stream arguments it cannot take: {unknown}"


# ---------------------------------------------------------------------------
# WHAT HE WAS TOLD, WHAT WAS APPLIED, AND WHAT WAS FORGOTTEN (P2.f)
#
# Still no database: the block, the cap and the SQL's SHAPE. What the three
# statements actually do to rows was verified against the real table.
# ---------------------------------------------------------------------------

TAUGHT = dict(
    id="t1", subject_kind="estate", subject="we", stance="means",
    claim="When they say we they mean the retail shops, not the warehouse.",
    evidence=[], told="no, we means the shops",
    confirmed_at=NOW - timedelta(days=2), held_since=NOW - timedelta(days=2), why=None,
)


def test_a_taught_view_says_it_was_told_and_quotes_them():
    """
    The block is where "we means the shops" reaches the next question, so the
    line has to say it was TOLD rather than read — otherwise the strongest
    thing on the block is indistinguishable from a reading Bob made up.
    """
    block = belief_store.as_block([TAUGHT], latest_data=NOW, now=NOW)
    assert "you were told" in block
    assert "no, we means the shops" in block
    assert "[id: t1]" in block


def test_a_taught_view_is_never_marked_unconfirmed():
    """
    THE ONE PLACE THE FRESHNESS RULE MUST NOT APPLY. Data landing since cannot
    make it less true that this is what they meant, and telling Bob to
    re-read before relying on it would be sending him to find a fact no read
    contains. The reading beside it is still marked, in the same block.
    """
    block = belief_store.as_block([TAUGHT, belief()], latest_data=NOW, now=NOW)
    told_line, read_line = [ln for ln in block.splitlines() if ln.startswith("- ")]
    assert "UNCONFIRMED" not in told_line
    assert "UNCONFIRMED" in read_line


def test_the_block_says_a_taught_line_is_not_up_for_re_checking():
    block = belief_store.as_block([TAUGHT], now=NOW)
    assert "YOU WERE TOLD" in block


def test_what_is_counted_as_applied_is_exactly_what_the_block_carried():
    """
    The count and the block cannot drift, because the same function decides
    both. A count of applications that did not happen would be a figure
    nothing measured — the one thing this repo refuses everywhere.
    """
    many = [belief(id=f"b{i}") for i in range(belief_store.MAX_IN_PROMPT + 3)]
    carried = belief_store.in_prompt(many)
    block = belief_store.as_block(many, now=NOW)
    assert len(carried) == belief_store.MAX_IN_PROMPT
    for i in carried:
        assert f"[id: {i}]" in block
    assert "b12" not in carried and "[id: b12]" not in block


def test_the_reads_never_return_a_view_that_was_forgotten_or_superseded():
    """
    Both endings take a view out of every path that reaches a question, and
    neither deletes the row. Read off the statements themselves, because the
    clause is the whole guarantee and a missing one is invisible until a
    forgotten view turns up in tomorrow's prompt.
    """
    import inspect
    src = inspect.getsource(belief_store)
    for statement in ("FROM george.beliefs\n        WHERE superseded_by IS NULL",):
        assert f"{statement} AND forgotten_at IS NULL" in src
    assert "DELETE FROM" not in src.upper()


def test_forgetting_is_not_superseding_and_asks_for_no_reason():
    """
    Superseding says "I was wrong, here is what I think now" and carries a
    successor and a reason. Forgetting says "stop holding that" and carries
    neither — demanding an explanation would make the easiest gesture on the
    surface the one that costs the most.
    """
    import inspect
    params = inspect.signature(belief_store.forget).parameters
    assert set(params) == {"session", "belief_id", "by"}
    src = inspect.getsource(belief_store.forget)
    assert "forgotten_by = :by" in src
    assert "superseded_by = " not in src


def test_a_second_forget_on_the_same_view_is_not_reported_as_a_success():
    """
    Telling somebody it worked twice is telling them something untrue once.
    The statement's own WHERE is what makes the second one match nothing.
    """
    import inspect
    src = inspect.getsource(belief_store.forget)
    assert "forgotten_at IS NULL" in src
    assert "BeliefNotHeld" in src


def test_applying_a_view_never_touches_one_that_is_no_longer_held():
    import inspect
    src = inspect.getsource(belief_store.mark_applied)
    assert "applied_count = applied_count + 1" in src
    assert "superseded_by IS NULL AND forgotten_at IS NULL" in src
