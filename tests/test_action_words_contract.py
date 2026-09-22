"""
Pure tests for W1.2 — each of the owner's action words does exactly one thing.

NO DATABASE. The capability test (ops/captest.py, 2026-09-22) said his
phrases through the real wiring and recorded what Bob wrote:

  "Keep this."                    three beliefs, no pin
  "I want this every Monday."     the watch moved, the report not scheduled
  "Turn this into a workflow."    the Monday slot refused: "A schedule needs
                                  somewhere to deliver to"
  "Build it — …"                  a page; every change after it ADDED a tile
  "What do you remember …?"       memory read AND a new view recorded

The phrases are in metrics.yaml `action_words`, and the write tool a phrase
does NOT mean refuses it, naming the one it does. Everything here holds that
in the owner's own words — the capability test's phrases, verbatim.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import composite_tools, loop as bob_loop, write_tools          # noqa: E402
from agent.write_tools import (                                              # noqa: E402
    PageRefused,
    PinRefused,
    WatchRefused,
    WriteContext,
    action_word,
    call_key,
)
from app.services import page_operations, workflow_scheduler, workflow_writer  # noqa: E402
from tools._common import load_defs, req                                     # noqa: E402


def _run(coro):
    return asyncio.run(coro)


PLAN = {"tool": "get_purchase_plan", "arguments": {"supplier": "Seikyo SEK001", "top_n": 30}}
PLAN_30 = {"tool": "get_purchase_plan",
           "arguments": {"supplier": "Seikyo SEK001", "top_n": 30, "lookback_days": 30}}
SALES = {"tool": "get_sales", "arguments": {"metric": "net_sales", "group_by": "store",
                                            "filters": {"store": "Rockwell"},
                                            "compare_to": "previous_period",
                                            "date_range": "last_week"}}


def _ctx(question, *ran, **kw) -> WriteContext:
    ctx = WriteContext(question=question, **kw)
    for call in ran:
        ctx.executed[call_key(call["tool"], call["arguments"])] = call
    return ctx


# ---------------------------------------------------------------------------
# 1. The phrases, in his words
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question, family", [
    ("Keep this.", "keep"),
    ("keep that", "keep"),
    ("Pin it.", "keep"),
    ("What do you remember about Rockwell?", "recall"),
    ("what do you know about AJI BARN", "recall"),
    ("I want this every Monday.", "schedule_the_answer"),
    ("Send me that every morning", "schedule_the_answer"),
    ("Build it — a weekly purchase plan for our top Seikyo products.", "build"),
    ("build me a reorder system for the shops", "build"),
])
def test_the_capability_tests_phrases_name_one_action_each(question, family):
    found = action_word(question)
    assert found is not None and found["family"] == family, (question, found)


@pytest.mark.parametrize("question", [
    "how did Rockwell do last week?",
    "Make this a page.",
    "Watch this.",
    "Turn this into a workflow.",
    "Check stockouts at AJI BARN every morning at 7.",
    "Tell me if any shop's sales drop more than they usually do.",
    "Remember that Rockwell is under renovation until October.",
    "Add supplier lead time.",
    "Use 30-day velocity.",
    # the words inside a longer sentence are not the gesture
    "keep it in mind that Rockwell is renovating until October, it changes things",
    # a page asked for by name is a page
    "Build me a Rockwell page",
    "Build me a dashboard",
    # a condition on a schedule is a watch
    "watch it every morning",
    "tell me if this drops, every Monday",
])
def test_ordinary_questions_and_the_other_actions_name_none_of_them(question):
    assert action_word(question) is None, (question, action_word(question))


def test_every_family_names_a_real_tool_and_refuses_only_real_tools():
    spec = req(load_defs(), "action_words")
    real = set(write_tools.WRITE_TOOL_FUNCTIONS) | set(composite_tools.COMPOSITE_TOOL_FUNCTIONS)
    for family in ("keep", "recall", "schedule_the_answer", "build"):
        assert spec[family]["means"] in real, family
        assert spec[family]["refuses"], family
        assert set(spec[family]["refuses"]) <= set(write_tools.WRITE_TOOL_FUNCTIONS), family
        assert spec[family]["means"] not in spec[family]["refuses"], family


# ---------------------------------------------------------------------------
# 2. "Keep this." pins, and holds no view
# ---------------------------------------------------------------------------

class _Beliefs:
    def __init__(self):
        self.recorded = []

    async def record(self, accepted):
        self.recorded.extend(accepted)
        return [{"outcome": "new", **b} for b in accepted]


VIEW = {"subject_kind": "store", "subject": "Rockwell", "stance": "unremarkable",
        "claim": "Rockwell is ahead of the week before on a bigger basket.",
        "evidence": [SALES]}


def test_keep_this_refuses_a_view_and_names_the_pin():
    store = _Beliefs()
    with pytest.raises(PinRefused, match="pin_answer"):
        _run(write_tools.record_belief([VIEW], ctx=_ctx("Keep this.", SALES, belief_store=store)))
    assert store.recorded == []


def test_what_do_you_remember_writes_nothing():
    store = _Beliefs()
    with pytest.raises(PinRefused, match="view_memory"):
        _run(write_tools.record_belief(
            [VIEW], ctx=_ctx("What do you remember about Rockwell?", SALES, belief_store=store)))
    assert store.recorded == []


def test_a_view_on_an_ordinary_question_is_still_recorded():
    store = _Beliefs()
    out = _run(write_tools.record_belief(
        [VIEW], ctx=_ctx("how did Rockwell do last week?", SALES, belief_store=store)))
    assert out["meta"]["held"] == 1 and len(store.recorded) == 1


def test_keep_this_pins_the_calls_behind_the_answer():
    seen = {}

    async def writer(spec):
        seen["spec"] = spec
        return {"pin_id": "p-1", "title": spec.title, "page": None, "created_by": "ice",
                "created_at": "2026-09-22T01:00:00+00:00", "pins_on_page": 0}

    out = _run(write_tools.pin_answer([SALES], "Rockwell's week",
                                      ctx=_ctx("Keep this.", SALES, writer=writer)))
    assert out["meta"]["wrote"] == "pin" and seen["spec"].tool_calls[0]["tool"] == "get_sales"


# ---------------------------------------------------------------------------
# 3. "I want this every Monday." is the report on a schedule, not the watch
# ---------------------------------------------------------------------------

class _Applier:
    def __init__(self):
        self.calls = []

    async def apply(self, action, fields):
        self.calls.append((action, dict(fields)))
        return {"rows": [{"action": action, **fields}], "meta": {}}


def test_every_monday_does_not_move_the_watch():
    watches = _Applier()
    for action in ("reschedule", "create", "rescope"):
        with pytest.raises(WatchRefused, match="set_standing_question"):
            _run(write_tools.set_watch(action, hour=6, days=[0], which="w-1",
                                       ctx=_ctx("I want this every Monday.", watch_writer=watches)))
    assert watches.calls == []


def test_a_watch_named_is_still_moved():
    watches = _Applier()
    _run(write_tools.set_watch("reschedule", hour=6, days=[0], which="w-1",
                               ctx=_ctx("Move the watch to every Monday.", watch_writer=watches)))
    assert watches.calls and watches.calls[0][0] == "reschedule"


def test_every_monday_with_no_time_is_asked_at_the_default_hour():
    standing = _Applier()
    _run(write_tools.set_standing_question(
        "create", question="how did Rockwell do last week?", days=[0],
        ctx=_ctx("I want this every Monday.", standing_writer=standing)))
    slot = req(load_defs(), "action_words.default_slot")
    action, fields = standing.calls[0]
    assert action == "create" and fields["hour"] == slot["hour"] and fields["days"] == [0]
    assert fields["minute"] == slot["minute"]


def test_a_time_they_said_is_kept():
    standing = _Applier()
    _run(write_tools.set_standing_question(
        "create", question="how are we doing?", hour=9, minute=30,
        ctx=_ctx("every morning at 9:30", standing_writer=standing)))
    assert standing.calls[0][1]["hour"] == 9 and standing.calls[0][1]["minute"] == 30


# ---------------------------------------------------------------------------
# 4. "Every Monday" on a workflow is delivered to his room
# ---------------------------------------------------------------------------

def test_a_schedule_with_no_chat_is_delivered_to_the_room():
    defs = load_defs()
    assert "room" in req(defs, "workflows.schedule.delivery")
    assert workflow_writer.delivery_for(defs, None)["channels"] == ["room"]
    both = workflow_writer.delivery_for(defs, ["-100123"])
    assert both["channels"] == ["room", "telegram"] and both["telegram_chat_ids"] == ["-100123"]


def test_with_no_room_and_no_chat_it_is_still_refused():
    defs = {"workflows": {"schedule": {"delivery": ["telegram"]}}}
    with pytest.raises(workflow_writer.WorkflowValidationError, match="somewhere to deliver"):
        workflow_writer.delivery_for(defs, [])


def test_a_room_delivered_run_is_a_delivery_not_a_failure():
    d = workflow_scheduler.room_delivery()
    assert d["ok"] is True and d["channel"] == "room"


class _WF:
    def __init__(self):
        self.spec = None

    def default_calls(self, steps, parameters):
        return [{"tool": s["tool"], "arguments": s["arguments"]} for s in steps]

    async def save(self, spec):
        self.spec = spec
        return {"workflow_id": "w", "name": spec.name, "version": 1, "created_by": "ice",
                "created_at": "2026-09-22T01:00:00+00:00",
                "schedule": {**(spec.schedule or {}), "enabled": False},
                "awaiting_promotion": True, "queue_name": "Approval queue",
                "new_version": False}


def test_every_monday_on_a_workflow_takes_the_default_hour_and_is_weekly():
    wf = _WF()
    out = _run(write_tools.save_workflow(
        "Rockwell Weekly", [{"name": "The week", "tool": "get_sales",
                             "arguments": SALES["arguments"]}],
        schedule={"days_of_week": [0]},
        ctx=_ctx("Every Monday.", SALES, workflow_writer=wf)))
    slot = req(load_defs(), "action_words.default_slot")
    assert wf.spec.schedule["hour"] == slot["hour"] and wf.spec.schedule["kind"] == "weekly"
    row = out["rows"][0]
    assert row["hour_defaulted"] is True and row["new_version"] is False


class _Version:
    def __init__(self, steps, parameters):
        self.steps, self.parameters = steps, parameters


def test_the_same_steps_saved_again_are_the_same_version():
    steps = [{"name": "The plan", "tool": "get_purchase_plan", "arguments": PLAN["arguments"],
              "why": None}]
    assert workflow_writer.same_rule(_Version(steps, []), [dict(s) for s in steps], [])
    changed = [{**steps[0], "arguments": PLAN_30["arguments"]}]
    assert not workflow_writer.same_rule(_Version(steps, []), changed, [])
    assert not workflow_writer.same_rule(None, steps, [])


# ---------------------------------------------------------------------------
# 5. "Build it" is a system, and a change to it changes it
# ---------------------------------------------------------------------------

class _Pages:
    def __init__(self):
        self.builds, self.edits = [], []

    async def create(self, spec):
        self.builds.append(spec)
        return {"page": {"page_id": "pg", "title": spec.title, "analyses": []}, "owner": "ice"}

    async def edit(self, spec):
        self.edits.append(spec)
        return {"page": {"page_id": "pg", "title": "Seikyo", "analyses": []},
                "owner": "ice", "operations": spec.operations}


def test_build_it_is_not_a_page_of_tiles():
    pages = _Pages()
    with pytest.raises(PageRefused, match="save_workflow"):
        _run(write_tools.create_page(
            "Seikyo Weekly Purchase Plan", [{"title": "Draft", "tool_calls": [PLAN]}],
            ctx=_ctx("Build it — a weekly purchase plan for our top Seikyo products.",
                     PLAN, page_writer=pages)))
    assert pages.builds == []


def test_a_page_asked_for_is_still_made():
    pages = _Pages()
    _run(write_tools.create_page("Rockwell", [{"title": "Week", "tool_calls": [SALES]}],
                                 ctx=_ctx("Build me a Rockwell page", SALES, page_writer=pages)))
    assert len(pages.builds) == 1


def test_a_change_op_reaches_the_writer_with_the_calls_that_ran():
    pages = _Pages()
    _run(write_tools.edit_page(
        [{"op": "change", "pin_id": "p-1", "tool_calls": [PLAN_30]}], page_id="pg",
        ctx=_ctx("Use 30-day velocity.", PLAN_30, page_writer=pages)))
    op = pages.edits[0].operations[0]
    assert op["op"] == "change" and op["pin_id"] == "p-1"
    assert op["tool_calls"][0]["arguments"]["lookback_days"] == 30


def test_a_change_to_calls_that_never_ran_is_refused():
    pages = _Pages()
    with pytest.raises(PageRefused, match="not run"):
        _run(write_tools.edit_page(
            [{"op": "change", "pin_id": "p-1", "tool_calls": [PLAN_30]}], page_id="pg",
            ctx=_ctx("Use 30-day velocity.", PLAN, page_writer=pages)))
    with pytest.raises(PageRefused, match="name the analysis"):
        _run(write_tools.edit_page(
            [{"op": "change", "tool_calls": [PLAN_30]}], page_id="pg",
            ctx=_ctx("Use 30-day velocity.", PLAN_30, page_writer=pages)))
    assert pages.edits == []


def test_a_variant_of_what_is_on_the_page_is_the_same_subject():
    assert page_operations.same_subject([PLAN_30], [PLAN])
    other = {"tool": "get_purchase_plan", "arguments": {"supplier": "GZ aji mix", "top_n": 30}}
    assert not page_operations.same_subject([other], [PLAN])
    tx = {"tool": "get_sales", "arguments": {**SALES["arguments"], "metric": "transaction_count"}}
    assert not page_operations.same_subject([tx], [SALES])
    week = {"tool": "get_sales", "arguments": {**SALES["arguments"], "date_range": "last_month"}}
    assert page_operations.same_subject([week], [SALES])


def test_the_refusal_of_an_add_names_the_change_it_is():
    class Pin:
        id, title = "p-1", "Seikyo draft"
    text = page_operations.change_instead(0, Pin())
    assert '"op": "change"' in text and "p-1" in text and "beside: true" in text


def test_the_operation_vocabulary_is_still_one_set():
    assert write_tools.PAGE_EDIT_OPERATIONS == page_operations.EDIT_OPERATIONS
    assert "change" in page_operations.EDIT_OPERATIONS


# ---------------------------------------------------------------------------
# 6. What Bob is told, on the tools and not in the prompt
# ---------------------------------------------------------------------------

def test_each_tool_says_which_words_are_its_own():
    schemas = {s["name"]: s["description"]
               for s in bob_loop.build_tool_schemas(include_write=True)}
    assert "KEEP THIS" in schemas["pin_answer"]
    assert "BUILD IT" in schemas["save_workflow"]
    assert "EVERY MONDAY" in schemas["set_standing_question"]
    assert "WHAT DO YOU REMEMBER" in schemas["view_memory"]
    assert "CHANGE TO AN ANALYSIS CHANGES IT" in schemas["edit_page"]


# ---------------------------------------------------------------------------
# 7. The service: a change is made where the analysis stands
# ---------------------------------------------------------------------------

def _plan_pin(page, calls, title="Seikyo draft"):
    from tests.test_page_writer_contract import _pin
    pin = _pin(title=title, page=page)
    pin.tool_calls = [dict(c) for c in calls]
    return pin


def test_a_change_replaces_the_calls_where_the_analysis_stands():
    from tests.test_page_writer_contract import FakeSession, _page
    page = _page(title="Seikyo Weekly")
    pin = _plan_pin(page, [PLAN])
    s = FakeSession(pages=[page], pins=[pin])
    result = _run(page_operations.apply_edit(s, owner="ice", page_id=page.id, operations=[
        {"op": "change", "pin_id": str(pin.id), "tool_calls": [PLAN_30]}]))
    assert pin.tool_calls[0]["arguments"]["lookback_days"] == 30
    assert pin.position == 0 and pin.page_id == page.id
    [op] = result.operations
    assert op["op"] == "change" and op["pin_id"] == str(pin.id)
    events = [a for a in s.added if getattr(a, "operation", None) == "change"]
    assert len(events) == 1 and events[0].before["tool_calls"][0]["arguments"] == PLAN["arguments"]
    assert len(result.page["analyses"]) == 1


def test_an_add_of_the_same_subject_is_refused_and_names_the_change():
    from tests.test_page_writer_contract import FakeSession, _page
    from app.services.page_writer import PageValidationError
    page = _page(title="Seikyo Weekly")
    pin = _plan_pin(page, [PLAN])
    s = FakeSession(pages=[page], pins=[pin])
    with pytest.raises(PageValidationError, match='"op": "change"'):
        _run(page_operations.plan_edit(s, owner="ice", page_id=page.id, operations=[
            {"op": "add", "title": "A month's demand", "tool_calls": [PLAN_30]}]))
    assert s.added == []
    # asked for both side by side, it is added
    plan = _run(page_operations.plan_edit(s, owner="ice", page_id=page.id, operations=[
        {"op": "add", "title": "A month's demand", "tool_calls": [PLAN_30], "beside": True}]))
    assert plan.steps[0]["op"] == "add"
