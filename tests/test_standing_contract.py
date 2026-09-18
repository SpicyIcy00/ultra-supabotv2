"""
Pure tests for standing questions — a question George is asked on a schedule.

NO DATABASE. Everything that makes an unattended model call safe is decidable
without one, and all of it lives here:

  1. WHAT AN UNATTENDED GEORGE IS GIVEN. The scheduled ask injects reads,
     compose, his own memory and nothing else. Not "refuses the rest" — the
     rest is absent from the schema, which is a stronger property and the one
     CLAUDE.md rule 4 actually promises.
  2. WHAT MAY BE STORED. A time, weekdays and sentences. There is no argument
     anywhere for a threshold, a metric, a window or a store list, so
     "alert me at 10% instead of 30%" cannot be half-saved.
  3. THE SCHEDULE IS ONE DEFINITION. Slots and claims are shared with the
     workflow scheduler rather than copied, so the two can never disagree
     about which slot is due.
  4. THE CACHED PREFIX SURVIVES a new injected tool.
  5. A NEW QUESTION DOES NOT FIRE. Created switched off, every time.
"""

from __future__ import annotations

import asyncio
import inspect
from datetime import datetime, timedelta

import pytest

from agent import loop, write_tools
from app.services import slots, standing_questions, standing_runner
from app.models.george_standing import MAX_INSTRUCTIONS, MAX_INSTRUCTION_LENGTH

MANILA = slots.MANILA


# ---------------------------------------------------------------------------
# 1. What an unattended George is given
# ---------------------------------------------------------------------------

class _Row:
    """Enough of a standing question for the runner. Not the ORM, on purpose."""

    def __init__(self, **kw):
        self.id = kw.get("id", "s-1")
        self.owner = kw.get("owner", "ice")
        self.question = kw.get("question", "how are we doing?")
        self.instructions = kw.get("instructions", [])
        self.kind = kw.get("kind", "daily")
        self.hour = kw.get("hour", 6)
        self.minute = kw.get("minute", 0)
        self.days_of_week = kw.get("days_of_week")
        self.enabled = kw.get("enabled", True)
        self.last_slot = kw.get("last_slot")


def _capture_run(monkeypatch) -> dict:
    """Run the scheduled ask against a loop that records how it was called."""
    seen: dict = {}

    async def fake_run(question, **kwargs):
        seen["question"] = question
        seen["kwargs"] = kwargs
        yield 'event: start\ndata: {"thread_id": "t-1"}\n\n'
        yield 'event: done\ndata: {"status": "ok", "thread_id": "t-1"}\n\n'

    monkeypatch.setattr(standing_runner.george_loop, "run", fake_run)

    async def no_beliefs():
        return None

    monkeypatch.setattr(standing_runner, "_beliefs_block", no_beliefs)
    return seen


def test_a_scheduled_ask_can_read_think_and_remember(monkeypatch):
    seen = _capture_run(monkeypatch)
    outcome = asyncio.run(standing_runner.ask(_Row(), slot=datetime.now(MANILA)))

    assert outcome["status"] == "ok" and outcome["thread_id"] == "t-1"
    kwargs = seen["kwargs"]
    # The three that make an answer worth having overnight: what he already
    # thinks, what he has been doing, and somewhere to keep what he concludes.
    assert kwargs["memory_reader"] is not None
    assert kwargs["automations_reader"] is not None
    assert kwargs["belief_store"] is not None


def test_a_scheduled_ask_cannot_change_the_shape_of_anything(monkeypatch):
    """
    The withheld half, and it is enforced by ABSENCE.

    A capability that is not injected is not a tool the model can see, so
    there is no refusal to get wrong and no prompt rule to ignore.
    """
    seen = _capture_run(monkeypatch)
    asyncio.run(standing_runner.ask(_Row(), slot=datetime.now(MANILA)))
    kwargs = seen["kwargs"]

    for capability in ("pin_writer", "workflow_writer", "workflow_runner",
                       "page_reader", "page_writer", "standing_writer"):
        assert kwargs.get(capability) is None, (
            f"a scheduled ask was given {capability}; nobody is watching it"
        )


def test_the_withheld_capabilities_really_do_remove_the_tools():
    """
    The point of the previous test, proven at the layer that matters: with the
    context a scheduled ask builds, those tool NAMES are not in the schema.
    """
    ctx = write_tools.WriteContext(
        memory_reader=lambda: None,
        automations_reader=lambda: None,
        belief_store=object(),
    )
    offered = set(loop.injected_surface(ctx))

    assert offered == {"view_memory", "view_automations", "record_belief"}
    for withheld in ("pin_answer", "save_workflow", "create_page", "edit_page",
                     "run_workflow", "view_page", write_tools.STANDING_TOOL):
        assert withheld not in offered


def test_a_question_that_could_reschedule_itself_is_the_one_ruled_out():
    """
    Stated on its own because it is the specific failure this design fears: a
    standing question with the standing tool could move its own slot, switch
    itself on, or spawn another — overnight, unwatched.
    """
    source = inspect.getsource(standing_runner.ask)
    assert "standing_writer" not in source


def test_an_instruction_is_labelled_as_attention_not_as_truth():
    block = standing_runner.instructions_block(
        _Row(instructions=["show more of Rockwell", "skip vending"])
    )
    assert "show more of Rockwell" in block and "skip vending" in block
    # The distinction the model has to be able to make. An instruction steers
    # what is looked at; it can never make a figure true.
    lowered = block.lower()
    assert "not definitions" in lowered and "not evidence" in lowered
    assert "tool result" in lowered

    assert standing_runner.instructions_block(_Row(instructions=[])) is None


def test_a_missed_morning_is_told_to_george_not_hidden(monkeypatch):
    seen = _capture_run(monkeypatch)
    now = datetime.now(MANILA)
    asyncio.run(standing_runner.ask(
        _Row(), slot=now, missed=[now - timedelta(days=1), now - timedelta(days=2)],
    ))
    standing = seen["kwargs"]["standing"]
    assert "2" in standing and "skipped" in standing.lower()


# ---------------------------------------------------------------------------
# 2. What may be stored
# ---------------------------------------------------------------------------

def test_the_tool_has_nowhere_to_put_a_threshold():
    """
    The constraint that keeps a preference from becoming a definition. Every
    number this tool accepts is a time.
    """
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.STANDING_TOOL)
    props = schema["input_schema"]["properties"]

    numeric = {name for name, spec in props.items()
               if spec.get("type") in ("integer", "number")}
    assert numeric == {"hour", "minute"}

    for forbidden in ("threshold", "metric", "window", "store", "stores",
                      "percent", "change", "compare_to", "date_range"):
        assert forbidden not in props


def test_days_are_a_list_of_integers_in_the_schema():
    """
    The bug class that made George hold zero beliefs for a fortnight: a
    list[int] falling through to the int branch, the model sending one number,
    and the tool rejecting every call.
    """
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.STANDING_TOOL)
    days = schema["input_schema"]["properties"]["days"]
    assert days["type"] == "array"
    assert days["items"] == {"type": "integer", "minimum": 0, "maximum": 6}


def test_the_actions_are_a_closed_list():
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.STANDING_TOOL)
    action = schema["input_schema"]["properties"]["action"]
    assert action["enum"] == list(write_tools.STANDING_ACTIONS)
    assert schema["input_schema"]["required"] == ["action"]


def test_the_tool_has_no_argument_for_whose_question():
    """Bound to the owner in the web process, exactly like the page writer."""
    sig = inspect.signature(write_tools.set_standing_question)
    for name in ("owner", "user", "username", "user_id"):
        assert name not in sig.parameters
    assert sig.parameters["ctx"].kind is inspect.Parameter.KEYWORD_ONLY


def test_without_a_writer_the_tool_refuses_rather_than_writing():
    with pytest.raises(write_tools.StandingRefused):
        asyncio.run(write_tools.set_standing_question(
            "create", question="how are we doing?", hour=6,
            ctx=write_tools.WriteContext(),
        ))


def test_an_unknown_action_is_refused_before_anything_is_written():
    class _Writer:
        called = False

        async def apply(self, action, fields):
            _Writer.called = True
            return {}

    with pytest.raises(write_tools.StandingRefused):
        asyncio.run(write_tools.set_standing_question(
            "delete_everything",
            ctx=write_tools.WriteContext(standing_writer=_Writer()),
        ))
    assert _Writer.called is False


# ---- the service's own bounds, which need no database ----------------------

def test_a_time_is_the_only_number_the_service_accepts():
    assert standing_questions._clean_slot(None, 9, 30, None) == {
        "kind": "daily", "hour": 9, "minute": 30, "days_of_week": None,
    }
    assert standing_questions._clean_slot(None, 6, None, [0, 3])["kind"] == "weekly"
    assert standing_questions._clean_slot(None, 6, None, [3, 0, 3])["days_of_week"] == [0, 3]

    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_slot(None, 25, 0, None)
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_slot(None, None, 0, None)
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_slot(None, 6, 0, [9])
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_slot("weekly", 6, 0, None)


def test_a_question_is_one_line_and_an_instruction_is_short():
    assert standing_questions._clean_question("  how are we doing?  ") == "how are we doing?"
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_question("hi")
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_question("what\nnow?")
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_question("x" * 501)

    assert standing_questions._clean_instruction(" show  more of Rockwell ") == \
        "show more of Rockwell"
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_instruction("   ")
    with pytest.raises(standing_questions.StandingRefused):
        standing_questions._clean_instruction("x" * (MAX_INSTRUCTION_LENGTH + 1))


def test_the_bounds_the_tool_states_are_the_bounds_the_service_holds():
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.STANDING_TOOL)
    props = schema["input_schema"]["properties"]
    assert props["instruction"]["maxLength"] == MAX_INSTRUCTION_LENGTH
    assert props["question"]["maxLength"] == 500
    # The instruction count is a CHECK constraint and a service refusal; the
    # model is told about it in prose rather than by a schema it cannot express.
    assert MAX_INSTRUCTIONS == 8


# ---------------------------------------------------------------------------
# 3. One definition of a slot
# ---------------------------------------------------------------------------

def test_the_workflow_scheduler_and_standing_questions_share_one_slot_rule():
    """
    The extraction's whole point. If these ever diverge, two things that fire
    on their own disagree about what "06:00" means.
    """
    from app.services import workflow_scheduler

    class _Schedule:
        kind, hour, minute = "daily", 6, 0
        days_of_week = day_of_month = None

    now = datetime(2026, 9, 11, 7, 30, tzinfo=MANILA)
    assert workflow_scheduler.slot_for(_Schedule(), now) == slots.slot_for(
        kind="daily", hour=6, minute=0, now=now
    )


def test_a_slot_before_its_time_belongs_to_yesterday():
    now = datetime(2026, 9, 11, 5, 59, tzinfo=MANILA)
    assert slots.slot_for(kind="daily", hour=6, minute=0, now=now) == \
        datetime(2026, 9, 10, 6, 0, tzinfo=MANILA)


def test_a_weekly_question_with_no_days_can_never_fire():
    now = datetime(2026, 9, 11, 9, 0, tzinfo=MANILA)
    assert slots.slot_for(kind="weekly", hour=6, minute=0, days_of_week=[],
                          now=now) is None


def test_a_first_run_has_missed_nothing():
    slot = datetime(2026, 9, 11, 6, 0, tzinfo=MANILA)
    assert slots.skipped_slots(kind="daily", hour=6, minute=0,
                               slot=slot, last_slot=None) == []


def test_missed_mornings_are_counted_not_replayed():
    slot = datetime(2026, 9, 11, 6, 0, tzinfo=MANILA)
    missed = slots.skipped_slots(kind="daily", hour=6, minute=0, slot=slot,
                                 last_slot=datetime(2026, 9, 8, 6, 0, tzinfo=MANILA))
    assert missed == [datetime(2026, 9, 10, 6, 0, tzinfo=MANILA),
                      datetime(2026, 9, 9, 6, 0, tzinfo=MANILA)]


def test_a_slot_can_only_be_claimed_in_a_table_named_here():
    """
    The claim's SQL interpolates a table name — the one thing in it that is
    not a bound parameter. The set of names is closed in code.
    """
    assert "george.standing_questions" in slots.CLAIMABLE
    assert "george.workflow_schedules" in slots.CLAIMABLE

    async def attempt():
        await slots.claim(object(), table="public.users", row_id=1,
                          slot=datetime.now(MANILA))

    with pytest.raises(ValueError):
        asyncio.run(attempt())


# ---------------------------------------------------------------------------
# 4. The cached prefix
# ---------------------------------------------------------------------------

def test_the_new_tool_does_not_break_the_shared_prefix():
    """
    Tools render first in the cached prefix, so reads sorted, then labels, then
    injected sorted — and only view_page is conditional, so only it may sort
    last. A new injected name that sorted after it would silently invalidate
    the cache for every session with a page in scope.
    """
    from agent import composite_tools

    schemas = loop.build_tool_schemas(include_write=True)
    names = [s["name"] for s in schemas]
    injected = [n for n in names
                if n not in loop.TOOL_FUNCTIONS and n not in loop.FINDING_TOOL_FUNCTIONS
                and n not in loop.one_call.FUNCTIONS]

    assert injected == sorted(injected)
    assert write_tools.STANDING_TOOL in injected
    assert injected[-1] == composite_tools.PAGE_CONTEXT_TOOL


def test_a_session_without_the_writer_is_a_prefix_of_one_with_it():
    without = [s["name"] for s in loop.build_tool_schemas(
        extra=loop.injected_surface(write_tools.WriteContext()))]
    with_it = [s["name"] for s in loop.build_tool_schemas(
        extra=loop.injected_surface(
            write_tools.WriteContext(standing_writer=object())))]
    assert with_it[:len(without)] == without
    assert write_tools.STANDING_TOOL in with_it


# ---------------------------------------------------------------------------
# 5. Nothing starts firing because a conversation drifted that way
# ---------------------------------------------------------------------------

def test_a_new_standing_question_is_created_switched_off():
    source = inspect.getsource(standing_questions.create)
    assert "enabled=False" in source


def test_the_registry_agrees_with_the_context():
    assert write_tools.WRITE_TOOL_REQUIRES[write_tools.STANDING_TOOL] == "standing_writer"
    assert hasattr(write_tools.WriteContext(), "standing_writer")
    assert write_tools.WRITE_TOOL_FUNCTIONS[write_tools.STANDING_TOOL] is \
        write_tools.set_standing_question
