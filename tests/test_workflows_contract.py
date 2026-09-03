"""
Saved workflows: the guarantees that must not quietly stop holding.

NO DATABASE. Everything here is decidable from the definitions, the tool
signatures and pure functions — which is also a statement about the design: if
a rule needed a live Postgres to check, it would be a rule nobody checks.

What is covered, and why each one is worth a test rather than a comment:

  THE BACKTEST CLASSIFICATION IS TOTAL. Every tool is named in exactly one of
  metrics.yaml's four backtest groups. An unclassified tool falls through to
  "reproducible", and a backtest would present today's figure as a past
  morning's — the single failure this whole feature must not have.

  A PRESET STATES ITSELF TWICE AND THE COPIES MUST AGREE. The SQL form is
  anchored on now(); the `relative` form is anchored on a day. Two expressions
  of one definition is exactly what metrics.yaml exists to prevent, so they live
  beside each other and this checks the second one is present and sane.

  THE REGISTRIES STAY SEPARATE. run_workflow must be callable by the model and
  unstorable inside a pin or a step. That is the whole reason it is not in
  TOOL_FUNCTIONS, and it is one careless line away from being undone.

  CAPABILITY IS PER TOOL. A caller with a pin writer and no workflow writer must
  not be offered save_workflow.

  PROVENANCE SURVIVED PARAMETERS. A workflow may only hold steps whose defaulted
  call has actually run.

  THE SLOT ARITHMETIC. Weekly walk-back, month-end clamping and the count of
  skipped slots are the parts of a scheduler that are wrong for six weeks before
  anyone notices, because being wrong looks like nothing happening.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
pytest.importorskip("sqlalchemy", reason="the scheduler imports the models")

from agent import composite_tools, loop as george_loop, write_tools   # noqa: E402
from agent.write_tools import (                                       # noqa: E402
    WorkflowRefused,
    WorkflowSpec,
    WriteContext,
    call_key,
)
from app.models.george_workflow import GeorgeWorkflowSchedule         # noqa: E402
from app.services import workflow_scheduler, workflow_telegram        # noqa: E402
from app.services.pin_runner import PinValidationError, validate_call  # noqa: E402
from app.services.workflow_runner import (                            # noqa: E402
    MAX_STEPS,
    WorkflowValidationError,
    bind_step,
    cap_for_storage,
    default_calls,
    describe_slot,
    resolve_bindings,
    resolve_preset,
    run_version,
    validate_parameters,
    validate_steps,
)
from tools._common import load_defs, req                              # noqa: E402

MANILA = ZoneInfo("Asia/Manila")

DEFS = load_defs()

# A Thursday, so the weekly arithmetic below is not accidentally checked on a
# Monday where every walk-back is a no-op.
ANCHOR = date(2026, 9, 3)

SALES_STEP = {
    "name": "What's moving",
    "tool": "get_sales",
    "arguments": {"metric": "units_sold", "group_by": "product",
                  "date_range": {"$param": "window"}},
    "why": "Velocity over the window the user chose.",
}
WINDOW_PARAM = {"name": "window", "type": "date_range", "default": "last_30_days"}


# ---------------------------------------------------------------------------
# The backtest classification
# ---------------------------------------------------------------------------

def _groups() -> dict:
    return req(DEFS, "workflows.backtest")


def test_every_tool_is_classified_for_backtesting():
    """
    An unclassified tool is treated as fully reproducible, so a backtest would
    hand back today's figure with a past date on it. The classification has to
    be total, and it has to stay total as tools are added.
    """
    g = _groups()
    classified = (
        set(g["as_of_arguments"])
        | set(g["window_arguments"])
        | set(g["point_in_time_tools"])
    )
    tools = set(george_loop.TOOL_FUNCTIONS)
    assert not (tools - classified), (
        "These tools are not classified in metrics.yaml workflows.backtest, so a "
        f"backtest would silently claim they reproduce the past: "
        f"{sorted(tools - classified)}"
    )
    assert not (classified - tools), (
        f"classified but no longer a tool: {sorted(classified - tools)}"
    )


def test_the_classification_groups_do_not_overlap():
    g = _groups()
    as_of, window, frozen = (
        set(g["as_of_arguments"]), set(g["window_arguments"]),
        set(g["point_in_time_tools"]),
    )
    assert not (as_of & window) and not (as_of & frozen) and not (window & frozen)


def test_partially_reproducible_tools_are_also_window_tools():
    """
    "Partial" qualifies a rebind; a tool with no window to rebind cannot be
    partially anything.
    """
    g = _groups()
    assert set(g["partially_reproducible"]) <= set(g["window_arguments"])


def test_the_named_time_arguments_actually_exist_on_the_tools():
    """
    metrics.yaml says get_dead_stock's window argument is `window` and
    get_stock's is `as_of`. If a tool renames one, the backtest would silently
    stop moving that step and report the present as the past.
    """
    import inspect

    g = _groups()
    for group in ("as_of_arguments", "window_arguments"):
        for tool, arg in g[group].items():
            sig = inspect.signature(george_loop.TOOL_FUNCTIONS[tool])
            assert arg in sig.parameters, (
                f"metrics.yaml workflows.backtest.{group} says {tool} takes "
                f"{arg!r}, but its signature is {tuple(sig.parameters)}"
            )


# ---------------------------------------------------------------------------
# Presets, anchored on a day that is not today
# ---------------------------------------------------------------------------

def test_every_preset_can_be_anchored_on_a_past_day():
    for name in req(DEFS, "sales_day.presets"):
        start, end = resolve_preset(DEFS, name, ANCHOR)
        assert start < end, f"{name} resolved to an empty or inverted window"


@pytest.mark.parametrize("preset,expected", [
    ("today", ["2026-09-03", "2026-09-04"]),
    ("yesterday", ["2026-09-02", "2026-09-03"]),
    ("last_7_days", ["2026-08-27", "2026-09-03"]),
    ("last_30_days", ["2026-08-04", "2026-09-03"]),
    # 2026-09-03 is a Thursday; the week starts Monday, matching
    # sales_day.week_start and Postgres date_trunc('week').
    ("this_week", ["2026-08-31", "2026-09-07"]),
    ("last_week", ["2026-08-24", "2026-08-31"]),
    ("this_month", ["2026-09-01", "2026-10-01"]),
    ("last_month", ["2026-08-01", "2026-09-01"]),
    ("this_year", ["2026-01-01", "2027-01-01"]),
])
def test_a_preset_resolves_to_the_window_it_would_have_covered(preset, expected):
    assert resolve_preset(DEFS, preset, ANCHOR) == expected


def test_rolling_windows_still_exclude_the_anchor_day():
    """
    sales_day.presets records a DECISION: the rolling windows are complete days
    ending yesterday, never a partial today. Anchoring must not quietly reverse
    it — a backtest that included the anchor day would compare 31 days against
    30 everywhere else.
    """
    for preset in ("last_7_days", "last_30_days"):
        _, end = resolve_preset(DEFS, preset, ANCHOR)
        assert end == ANCHOR.isoformat()


def test_month_arithmetic_crosses_a_year_boundary():
    assert resolve_preset(DEFS, "last_month", date(2026, 1, 15)) == [
        "2025-12-01", "2026-01-01"
    ]


def test_an_unknown_preset_is_refused_by_name():
    with pytest.raises(WorkflowValidationError, match="Unknown window"):
        resolve_preset(DEFS, "last_fortnight", ANCHOR)


# ---------------------------------------------------------------------------
# Parameters and binding
# ---------------------------------------------------------------------------

def test_a_parameter_without_a_default_is_refused():
    """
    The defaulted binding is what gets validated at save time and what proves
    the step has run. Without one there is nothing to check against.
    """
    with pytest.raises(WorkflowValidationError, match="no default"):
        validate_parameters([{"name": "store", "type": "string"}])


def test_a_binding_the_workflow_does_not_declare_is_refused_not_ignored():
    """
    Ignoring it would silently use the default, and a run answering a different
    question than the one asked is the failure the whole system exists to avoid.
    """
    params = validate_parameters([WINDOW_PARAM])
    with pytest.raises(WorkflowValidationError, match="no parameter called"):
        resolve_bindings(params, {"windows": "last_7_days"})


def test_a_boolean_is_not_accepted_where_a_number_belongs():
    """isinstance(True, int) is True in Python; top_n=True would become top_n=1."""
    params = validate_parameters([{"name": "top_n", "type": "integer", "default": 10}])
    with pytest.raises(WorkflowValidationError, match="whole number"):
        resolve_bindings(params, {"top_n": True})


def test_a_parameter_reaches_a_step_argument():
    params = validate_parameters([WINDOW_PARAM])
    bound = bind_step(SALES_STEP, resolve_bindings(params, {"window": "last_week"}),
                      DEFS, as_of=None)
    assert bound["arguments"]["date_range"] == "last_week"


def test_a_parameter_reaches_a_nested_argument():
    """`filters` is an object; parameterising the SKU inside it is ordinary."""
    params = validate_parameters([{"name": "sku", "type": "string", "default": "A1"}])
    step = {"name": "One SKU", "tool": "get_sales",
            "arguments": {"metric": "net_sales", "group_by": "product",
                          "date_range": "last_month",
                          "filters": {"sku": {"$param": "sku"}}}}
    bound = bind_step(step, resolve_bindings(params, {"sku": "Z9"}), DEFS, as_of=None)
    assert bound["arguments"]["filters"]["sku"] == "Z9"


def test_a_step_referring_to_an_undeclared_parameter_is_refused():
    with pytest.raises(WorkflowValidationError, match="does not declare"):
        bind_step(SALES_STEP, {}, DEFS, as_of=None)


# ---------------------------------------------------------------------------
# What a backtest says about itself
# ---------------------------------------------------------------------------

def test_a_backtest_rewrites_a_preset_to_the_dates_it_would_have_covered():
    params = validate_parameters([WINDOW_PARAM])
    bound = bind_step(SALES_STEP, resolve_bindings(params, None), DEFS, as_of=ANCHOR)
    assert bound["arguments"]["date_range"] == ["2026-08-04", "2026-09-03"]
    assert bound["reproducible"] == "full"


def test_a_point_in_time_step_says_the_figure_is_todays():
    step = {"name": "Cost history", "tool": "get_cost_history",
            "arguments": {"sku": "A1"}}
    bound = bind_step(step, {}, DEFS, as_of=ANCHOR)
    assert bound["reproducible"] == "none"
    assert "TODAY" in bound["reproducible_reason"]


def test_a_step_with_no_window_bound_is_not_reproducible():
    """
    get_purchasing's date_range defaults to None, meaning all time — which in a
    backtest includes everything that happened AFTER the anchor. Reported rather
    than quietly rebound: choosing a window on the author's behalf would be
    inventing the rule.
    """
    step = {"name": "Everything ordered", "tool": "get_purchasing", "arguments": {}}
    bound = bind_step(step, {}, DEFS, as_of=ANCHOR)
    assert bound["reproducible"] == "none"
    assert "all time" in bound["reproducible_reason"]


def test_a_partially_reproducible_step_says_which_half_moved():
    step = {"name": "Dead stock", "tool": "get_dead_stock",
            "arguments": {"window": "last_30_days"}}
    bound = bind_step(step, {}, DEFS, as_of=ANCHOR)
    assert bound["reproducible"] == "partial"
    assert "stock side is read live" in bound["reproducible_reason"]


def test_an_explicitly_pinned_date_is_left_alone_by_a_backtest():
    """A date the author wrote is a choice, not a window waiting to be moved."""
    step = {"name": "A fixed month", "tool": "get_sales",
            "arguments": {"metric": "net_sales", "group_by": "store",
                          "date_range": ["2026-01-01", "2026-02-01"]}}
    bound = bind_step(step, {}, DEFS, as_of=ANCHOR)
    assert bound["arguments"]["date_range"] == ["2026-01-01", "2026-02-01"]


def test_a_live_run_marks_nothing_as_reproduced():
    bound = bind_step({"name": "Stock", "tool": "get_stock", "arguments": {}},
                      {}, DEFS, as_of=None)
    assert bound["arguments"].get("as_of") is None


# ---------------------------------------------------------------------------
# Validation against the live tool surface
# ---------------------------------------------------------------------------

def test_a_step_is_validated_at_its_defaults_when_saved():
    params = validate_parameters([WINDOW_PARAM])
    stored = validate_steps([SALES_STEP], params)
    # Stored with the parameter reference intact — the bound form exists only to
    # prove the step runs.
    assert stored[0]["arguments"]["date_range"] == {"$param": "window"}
    assert stored[0]["why"].startswith("Velocity")


def test_a_step_whose_default_is_not_a_valid_value_is_refused_at_save_time():
    params = validate_parameters([
        {"name": "window", "type": "date_range", "default": "last_fortnight"}
    ])
    with pytest.raises(WorkflowValidationError, match="What's moving"):
        validate_steps([SALES_STEP], params)


def test_two_steps_may_not_share_a_name():
    with pytest.raises(WorkflowValidationError, match="Step names"):
        validate_steps([SALES_STEP, dict(SALES_STEP)], validate_parameters([WINDOW_PARAM]))


def test_a_workflow_is_capped_at_a_readable_number_of_steps():
    params = validate_parameters([WINDOW_PARAM])
    many = [dict(SALES_STEP, name=f"Step {i}") for i in range(MAX_STEPS + 1)]
    with pytest.raises(WorkflowValidationError, match="at most"):
        validate_steps(many, params)


def test_default_calls_are_concrete():
    calls = default_calls([SALES_STEP], validate_parameters([WINDOW_PARAM]))
    assert calls == [{"tool": "get_sales",
                      "arguments": {"metric": "units_sold", "group_by": "product",
                                    "date_range": "last_30_days"}}]


# ---------------------------------------------------------------------------
# The registries stay separate
# ---------------------------------------------------------------------------

def test_run_workflow_is_not_a_storable_call():
    """
    TOOL_FUNCTIONS is the set of calls a pin may CONTAIN and a step may BE.
    run_workflow in there would let a pin hold a workflow and a workflow step
    hold another workflow, and would let the pin runner reach a capability the
    pin's owner never granted.
    """
    assert "run_workflow" not in george_loop.TOOL_FUNCTIONS
    with pytest.raises(PinValidationError, match="no longer one of George's tools"):
        validate_call({"tool": "run_workflow", "arguments": {"name": "PO Maker"}})


def test_a_workflow_step_cannot_be_a_workflow_or_a_write():
    with pytest.raises(WorkflowValidationError, match="no longer one of George's tools"):
        validate_steps([{"name": "Nested", "tool": "run_workflow",
                         "arguments": {"name": "PO Maker"}}], [])
    with pytest.raises(WorkflowValidationError, match="no longer one of George's tools"):
        validate_steps([{"name": "Sneaky", "tool": "pin_answer", "arguments": {}}], [])


def test_the_schema_cannot_express_a_step_that_is_not_a_read():
    schema = next(s for s in george_loop.build_tool_schemas(include_write=True)
                  if s["name"] == "save_workflow")
    allowed = schema["input_schema"]["properties"]["steps"]["items"]["properties"]["tool"]
    assert set(allowed["enum"]) == set(george_loop.TOOL_FUNCTIONS)
    assert "run_workflow" not in allowed["enum"]
    assert "save_workflow" not in allowed["enum"]


def test_the_read_schema_advertises_neither_new_tool():
    """The default matters: workflow steps are validated against this."""
    names = [s["name"] for s in george_loop.build_tool_schemas()]
    assert "save_workflow" not in names and "run_workflow" not in names


# ---------------------------------------------------------------------------
# Capability is per tool, not per session
# ---------------------------------------------------------------------------

class _FakeWorkflowWriter:
    def __init__(self) -> None:
        self.saved: list[WorkflowSpec] = []

    def default_calls(self, steps, parameters):
        return default_calls(steps, parameters)

    async def save(self, spec: WorkflowSpec) -> dict:
        self.saved.append(spec)
        return {
            "workflow_id": "w1", "name": spec.name, "version": 1,
            "created_by": "ice", "created_at": "2026-09-03T00:00:00+00:00",
            "schedule": None, "awaiting_promotion": True,
            "queue_name": req(DEFS, "workflows.promotion.queue_name"),
        }


def test_a_session_with_only_a_pin_writer_is_not_offered_save_workflow():
    ctx = WriteContext(writer=object())
    assert set(george_loop.injected_surface(ctx)) == {"pin_answer"}


def test_a_session_with_only_a_workflow_writer_is_not_offered_pin_answer():
    ctx = WriteContext(workflow_writer=_FakeWorkflowWriter())
    assert set(george_loop.injected_surface(ctx)) == {"save_workflow"}


def test_the_workflow_runner_gates_run_workflow_on_its_own():
    async def runner(name, bindings, as_of):
        return {}

    assert set(george_loop.injected_surface(WriteContext(workflow_runner=runner))) == {
        "run_workflow"
    }


def test_no_injection_means_no_extra_tools_at_all():
    assert george_loop.injected_surface(WriteContext()) == {}


def test_every_injected_tool_declares_what_it_needs():
    """
    A tool added to a registry without a REQUIRES entry would raise a KeyError
    on the first request of every session.
    """
    assert set(write_tools.WRITE_TOOL_REQUIRES) == set(write_tools.WRITE_TOOL_FUNCTIONS)
    assert (set(composite_tools.COMPOSITE_TOOL_REQUIRES)
            == set(composite_tools.COMPOSITE_TOOL_FUNCTIONS))
    for field in (list(write_tools.WRITE_TOOL_REQUIRES.values())
                  + list(composite_tools.COMPOSITE_TOOL_REQUIRES.values())):
        assert hasattr(WriteContext(), field), f"WriteContext has no {field!r}"


# ---------------------------------------------------------------------------
# Provenance survived parameters
# ---------------------------------------------------------------------------

def _ctx_with(*ran, writer=None) -> WriteContext:
    ctx = WriteContext(workflow_writer=writer or _FakeWorkflowWriter())
    for tool, args in ran:
        ctx.executed[call_key(tool, args)] = {"tool": tool, "arguments": args}
    return ctx


def test_a_step_that_has_not_been_run_cannot_be_saved():
    ctx = _ctx_with()
    with pytest.raises(WorkflowRefused, match="has not been run|have not run"):
        asyncio.run(write_tools.save_workflow(
            name="PO Maker", steps=[SALES_STEP], parameters=[WINDOW_PARAM], ctx=ctx,
        ))


def test_the_refusal_says_what_to_do():
    ctx = _ctx_with()
    with pytest.raises(WorkflowRefused) as exc:
        asyncio.run(write_tools.save_workflow(
            name="PO Maker", steps=[SALES_STEP], parameters=[WINDOW_PARAM], ctx=ctx,
        ))
    message = str(exc.value)
    assert "Run each step at its default values first" in message
    assert "Tools run so far: none" in message


def test_a_step_saved_at_the_binding_it_was_run_at_is_accepted():
    """
    The provenance rule, extended rather than excepted: the DEFAULTED call must
    have run. Other values of that parameter are then permitted, because the
    tools validate them and the call shape is one the user has watched return.
    """
    writer = _FakeWorkflowWriter()
    ctx = _ctx_with(
        ("get_sales", {"metric": "units_sold", "group_by": "product",
                       "date_range": "last_30_days"}),
        writer=writer,
    )
    result = asyncio.run(write_tools.save_workflow(
        name="PO Maker", steps=[SALES_STEP], parameters=[WINDOW_PARAM],
        intent="Reorder without double-ordering.", ctx=ctx,
    ))
    assert writer.saved and writer.saved[0].name == "PO Maker"
    assert result["rows"][0]["version"] == 1
    assert result["meta"]["source_table"] == "george.workflow_versions"
    assert result["meta"]["wrote"] == "workflow"


def test_a_saved_workflow_reports_that_it_is_not_yet_scheduled():
    """
    Saving is not scheduling, and the difference is carried in the RESULT rather
    than left to the answer's wording.
    """
    ctx = _ctx_with(
        ("get_sales", {"metric": "units_sold", "group_by": "product",
                       "date_range": "last_30_days"}),
    )
    result = asyncio.run(write_tools.save_workflow(
        name="PO Maker", steps=[SALES_STEP], parameters=[WINDOW_PARAM], ctx=ctx,
    ))
    assert result["rows"][0]["awaiting_promotion"] is True
    assert result["meta"]["queue"] == req(DEFS, "workflows.promotion.queue_name")


def test_a_step_without_a_name_is_refused():
    ctx = _ctx_with()
    step = {k: v for k, v in SALES_STEP.items() if k != "name"}
    with pytest.raises(WorkflowRefused, match="needs a 'name'"):
        asyncio.run(write_tools.save_workflow(
            name="PO Maker", steps=[step], parameters=[WINDOW_PARAM], ctx=ctx,
        ))


def test_saving_is_unavailable_without_a_writer():
    with pytest.raises(WorkflowRefused, match="signed-in user"):
        asyncio.run(write_tools.save_workflow(
            name="PO Maker", steps=[SALES_STEP], ctx=WriteContext(),
        ))


# ---------------------------------------------------------------------------
# The claim check
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("answer,expected", [
    ("I've saved it as a workflow called PO Maker.", "claimed"),
    ("That workflow now exists and runs on demand.", "claimed"),
    ("I'll save that as a workflow once you tell me the name.", "promised"),
    ("I could not save it as a workflow — the weekly step has not been run.",
     None),
    ("I won't save that as a workflow yet.", None),
    ("Net sales last month were PHP 8,069,394.16.", None),
])
def test_a_save_claim_is_detected_and_a_denial_is_not(answer, expected):
    assert george_loop._save_claim(answer, DEFS) == expected


def test_the_two_claim_checks_do_not_answer_for_each_other():
    """
    Separate vocabularies, so a correction never names the wrong write. An
    answer about pinning must not trip the workflow check, or George would be
    told to call save_workflow about a tile.
    """
    pinned = 'Pinned "Net sales by store" to the Replenishment page.'
    assert george_loop._pin_claim(pinned, DEFS) == "claimed"
    assert george_loop._save_claim(pinned, DEFS) is None


# ---------------------------------------------------------------------------
# Runs, notices and receipts
# ---------------------------------------------------------------------------

def _fake_run(**over) -> dict:
    base = {
        "status": "ok", "mode": "scheduled", "as_of": None, "bindings": {},
        "definitions_version": req(DEFS, "version"),
        "ran_at": "2026-09-03T06:00:00+00:00",
        "run_notices": [],
        "notices": [],
        "steps": [{
            "name": "What's moving", "tool": "get_sales", "status": "ok",
            "why": "Velocity over 30 days.",
            "rows": [{"product": "Mango Gummy", "units_sold": 412}],
            "meta": {"source_table": "new_transactions", "row_count": 1,
                     "snapshot_timestamp": "2026-09-03T06:00:01+00:00",
                     "filters_applied": ["is_cancelled = false"]},
            "notices": [],
        }],
    }
    base.update(over)
    return base


def test_a_rendered_run_carries_a_timestamp_for_its_figures():
    """UI rule 6 has no exception for a Telegram message."""
    messages = workflow_telegram.render(_fake_run(), workflow_name="PO Maker",
                                        version=3)
    joined = "\n".join(messages)
    assert "new_transactions" in joined
    assert "2026-09-03T06:00:01" in joined


def test_a_run_level_notice_is_rendered_above_the_figures():
    run = _fake_run(run_notices=[{
        "kind": "definitions_drift",
        "message": "The definitions have changed since this was saved.",
    }])
    messages = workflow_telegram.render(run, workflow_name="PO Maker", version=3)
    body = messages[0]
    assert "definitions have changed" in body
    assert body.index("definitions have changed") < body.index("What's moving")


def test_a_steps_own_notice_is_rendered_beside_that_step():
    run = _fake_run()
    run["steps"][0]["notices"] = [{
        "kind": "ambiguous_sku",
        "message": "That SKU is three different products.",
    }]
    joined = "\n".join(workflow_telegram.render(run, workflow_name="PO Maker",
                                                version=1))
    assert "three different products" in joined


def test_a_failed_step_is_reported_not_dropped():
    """
    A shorter list with nothing said about the missing part reads as "there was
    less to report".
    """
    run = _fake_run(status="refused")
    run["steps"][0].update({"status": "refused", "rows": [],
                            "error": "That SKU matches three products."})
    joined = "\n".join(workflow_telegram.render(run, workflow_name="PO Maker",
                                                version=1))
    assert "What's moving" in joined
    assert "declined to answer" in joined
    assert "three products" in joined


def test_an_empty_step_says_it_ran():
    """Empty is not quiet, and the two must never look alike."""
    run = _fake_run()
    run["steps"][0]["rows"] = []
    run["steps"][0]["meta"]["row_count"] = 0
    joined = "\n".join(workflow_telegram.render(run, workflow_name="PO Maker",
                                                version=1))
    assert "The step ran" in joined


def test_a_slot_that_did_not_run_still_produces_a_message():
    """A job that fails silently is indistinguishable from a quiet morning."""
    messages = workflow_telegram.render_failure(
        workflow_name="PO Maker", version=2,
        slot=datetime(2026, 9, 7, 6, 0, tzinfo=MANILA),
        reason="get_sales no longer accepts 'metrik'.",
    )
    body = messages[0]
    assert "did not run" in body
    assert "2026-09-07 06:00" in body
    assert "not a quiet" in body


def test_a_stored_run_keeps_its_receipts_and_samples_its_rows():
    steps = [{
        "name": "Everything", "tool": "get_sales", "status": "ok",
        "rows": [{"n": i} for i in range(300)],
        "meta": {"source_table": "new_transactions", "row_count": 300},
        "notices": [],
    }]
    stored = cap_for_storage(steps)[0]
    assert stored["meta"]["row_count"] == 300, "meta is never trimmed"
    assert stored["rows_returned"] == 300
    assert len(stored["rows"]) == stored["rows_stored"] < 300
    assert "do not total the stored rows" in stored["rows_note"]


def test_a_run_of_nothing_is_refused_before_it_reaches_a_tool():
    with pytest.raises(WorkflowValidationError, match="at least one step"):
        asyncio.run(run_version(steps=[], parameters=[]))


# ---------------------------------------------------------------------------
# A whole run, with the tool substituted
#
# The tool itself is replaced rather than the runner: everything between
# bind_step and the assembled notices is then real, including validation, the
# concurrency, the status rollup and the four states.
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_sales(monkeypatch):
    def install(fn):
        monkeypatch.setitem(george_loop.TOOL_FUNCTIONS, "get_sales", fn)
        return fn
    return install


def _sales_ok(**kwargs):
    return {
        "rows": [{"product": "Mango Gummy", "units_sold": 412}],
        "meta": {"source_table": "new_transactions", "row_count": 1,
                 "filters_applied": ["is_cancelled = false"],
                 "snapshot_timestamp": "2026-09-03T06:00:01+00:00"},
    }


def test_a_run_returns_each_steps_own_receipts(fake_sales):
    fake_sales(_sales_ok)
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], validate_parameters([WINDOW_PARAM])),
        parameters=validate_parameters([WINDOW_PARAM]),
    ))
    assert run["status"] == "ok"
    step = run["steps"][0]
    assert step["name"] == "What's moving"
    assert step["meta"]["source_table"] == "new_transactions"
    assert step["meta"]["snapshot_timestamp"]


def test_a_run_says_when_the_definitions_moved_under_it(fake_sales):
    fake_sales(_sales_ok)
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], validate_parameters([WINDOW_PARAM])),
        parameters=validate_parameters([WINDOW_PARAM]),
        saved_definitions_version=req(DEFS, "version") - 1,
    ))
    kinds = [n["kind"] for n in run["run_notices"]]
    assert "definitions_drift" in kinds


def test_a_run_at_the_same_definitions_version_says_nothing(fake_sales):
    fake_sales(_sales_ok)
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], validate_parameters([WINDOW_PARAM])),
        parameters=validate_parameters([WINDOW_PARAM]),
        saved_definitions_version=req(DEFS, "version"),
    ))
    assert run["run_notices"] == []


def test_a_refusing_step_becomes_a_notice_and_the_run_status(fake_sales):
    def refuses(**kwargs):
        raise ValueError("That SKU matches three different products.")

    fake_sales(refuses)
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], validate_parameters([WINDOW_PARAM])),
        parameters=validate_parameters([WINDOW_PARAM]),
    ))
    assert run["status"] == "refused"
    assert [n["kind"] for n in run["run_notices"]] == ["workflow_step_failed"]
    assert "three different products" in run["run_notices"][0]["message"]


def test_a_backtest_says_which_steps_report_the_present(fake_sales):
    fake_sales(_sales_ok)
    steps = validate_steps(
        [SALES_STEP, {"name": "Cost history", "tool": "get_cost_history",
                      "arguments": {"sku": "A1"}}],
        validate_parameters([WINDOW_PARAM]),
    )
    # get_cost_history is not stubbed, so it will fail to connect — which is
    # itself the point of the assertion below: the reproducibility notice is
    # about the SHAPE of the step and does not depend on it returning data.
    run = asyncio.run(run_version(
        steps=steps, parameters=validate_parameters([WINDOW_PARAM]),
        as_of=ANCHOR, mode="backtest",
    ))
    kinds = [n["kind"] for n in run["run_notices"]]
    assert "backtest_not_reproducible" in kinds
    message = next(n["message"] for n in run["run_notices"]
                   if n["kind"] == "backtest_not_reproducible")
    assert "Cost history" in message
    assert "What's moving" not in message, "the rebound step reproduces fine"


# ---------------------------------------------------------------------------
# Divergence is allowed; silent divergence is not
#
# A manual run uses the NEWEST version so that editing a rule and trying it does
# not need an approval first. A schedule fires the PROMOTED one so that editing
# a rule does not change what goes out unattended. Both halves are deliberate,
# and together they mean the same workflow can legitimately show one number in
# chat and another on Monday. What must never happen is two people comparing
# those numbers without knowing they came from different rules.
# ---------------------------------------------------------------------------

def _context(version=4, promoted=False, scheduled=(), name="PO Maker") -> dict:
    return {"workflow": name, "version": version, "promoted": promoted,
            "scheduled": list(scheduled)}


def _slot(version=2, enabled=True, slot="Mondays at 06:00") -> dict:
    return {"schedule_id": "s1", "version": version, "enabled": enabled,
            "slot": slot}


def _run_with(context, fake_sales, **kw):
    fake_sales(_sales_ok)
    params = validate_parameters([WINDOW_PARAM])
    return asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], params), parameters=params,
        version_context=context, **kw
    ))


def test_a_run_that_differs_from_the_schedule_says_so(fake_sales):
    run = _run_with(_context(scheduled=[_slot()]), fake_sales)
    assert run["diverges"] is True
    notice = run["run_notices"][0]
    assert notice["kind"] == "version_divergence"
    assert "version 4" in notice["message"]
    assert "version 2" in notice["message"]
    assert "Mondays at 06:00" in notice["message"]


def test_the_divergence_notice_says_which_of_the_two_reasons_it_is(fake_sales):
    """
    "These differ" sends the reader off to guess, and the two real causes have
    different fixes: promote the newer version, or repoint the schedule at it.
    """
    unpromoted = _run_with(_context(promoted=False, scheduled=[_slot()]),
                           fake_sales)
    assert "has not been promoted" in unpromoted["run_notices"][0]["message"]

    promoted = _run_with(_context(promoted=True, scheduled=[_slot()]), fake_sales)
    message = promoted["run_notices"][0]["message"]
    assert "has been promoted" in message
    assert "still" in message and "pinned" in message


def test_the_divergence_is_also_structured_not_only_prose(fake_sales):
    """
    The run record and any UI have to state which version ran and which the
    schedule fires without parsing a sentence.
    """
    run = _run_with(_context(scheduled=[_slot()]), fake_sales)
    notice = run["run_notices"][0]
    assert notice["ran_version"] == 4
    assert notice["scheduled_versions"] == [
        {"version": 2, "slot": "Mondays at 06:00", "schedule_id": "s1"}
    ]
    assert run["version"] == 4
    assert run["diverging_schedules"] == [_slot()]


def test_agreeing_with_the_schedule_says_nothing(fake_sales):
    """A caveat raised when there is nothing to caveat trains the reader to skim."""
    run = _run_with(_context(version=2, promoted=True, scheduled=[_slot(version=2)]),
                    fake_sales)
    assert run["diverges"] is False
    assert run["run_notices"] == []


def test_a_disabled_schedule_is_not_a_divergence(fake_sales):
    """It sends nothing, so there is no second answer for anyone to be confused by."""
    run = _run_with(_context(scheduled=[_slot(enabled=False)]), fake_sales)
    assert run["diverges"] is False
    assert run["run_notices"] == []
    # Still reported, so a caller can say what exists rather than only what fires.
    assert run["schedules"] == [_slot(enabled=False)]


def test_a_workflow_with_no_schedule_at_all_diverges_from_nothing(fake_sales):
    run = _run_with(_context(scheduled=[]), fake_sales)
    assert run["diverges"] is False and run["schedules"] == []


def test_a_scheduled_run_does_not_disagree_with_itself(fake_sales):
    """
    Telling Monday's message that it differs from Monday's schedule is noise,
    and noise in a scheduled message is how the real caveats get skimmed past.
    """
    run = _run_with(_context(version=2, promoted=True, scheduled=[_slot(version=2)]),
                    fake_sales, mode="scheduled")
    assert run["diverges"] is False


def test_running_an_older_version_deliberately_also_reports_it(fake_sales):
    """The check is symmetric: what matters is that the two are not the same."""
    run = _run_with(_context(version=1, promoted=False, scheduled=[_slot(version=3)]),
                    fake_sales)
    assert run["diverges"] is True
    assert "version 1" in run["run_notices"][0]["message"]
    assert "version 3" in run["run_notices"][0]["message"]


def test_divergence_is_reported_before_anything_else(fake_sales):
    """
    Which RULE produced the figures comes first. A reader holding the wrong
    version in mind has misread everything below it, the other caveats included.
    """
    fake_sales(_sales_ok)
    params = validate_parameters([WINDOW_PARAM])
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], params), parameters=params,
        version_context=_context(scheduled=[_slot()]),
        saved_definitions_version=req(DEFS, "version") - 1,
        as_of=ANCHOR, mode="backtest",
    ))
    assert [n["kind"] for n in run["run_notices"]][0] == "version_divergence"


def test_the_divergence_notice_can_be_satisfied_by_honest_prose():
    """
    A fingerprint too strict to satisfy costs a corrective turn every time and
    then appends the caveat under prose that already carried it — the failure
    test_notice_fingerprints exists for. Checked in both directions.
    """
    conveys = (
        "These figures come from version 4 of PO Maker. The Mondays at 06:00 "
        "schedule still sends version 2, which is the last one promoted, so "
        "Monday's message will not match this."
    )
    ignores = "Units sold last month came to 41,204 across the seven stores."
    notice = {"kind": "version_divergence"}
    assert george_loop._unsurfaced([notice], conveys, DEFS) == []
    assert george_loop._unsurfaced([notice], ignores, DEFS) == [notice]


def test_the_run_record_keeps_the_divergence(fake_sales):
    """
    The reply and the run row must BOTH say so. cap_for_storage trims rows; the
    notices are what record_run stores, and they must survive whole.
    """
    run = _run_with(_context(scheduled=[_slot()]), fake_sales)
    assert [n["kind"] for n in run["notices"]][0] == "version_divergence"
    assert run["notices"][0]["scheduled_versions"][0]["version"] == 2


# ---------------------------------------------------------------------------
# Describing a slot
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("kwargs,expected", [
    ({"kind": "daily", "hour": 6}, "every day at 06:00"),
    ({"kind": "weekly", "hour": 6, "days_of_week": [0]}, "Mondays at 06:00"),
    ({"kind": "weekly", "hour": 17, "minute": 30, "days_of_week": [0, 3]},
     "Mondays and Thursdays at 17:30"),
    # Listed in week order whatever order they were stored in.
    ({"kind": "weekly", "hour": 6, "days_of_week": [4, 1, 0]},
     "Mondays, Tuesdays and Fridays at 06:00"),
    ({"kind": "monthly", "hour": 6, "day_of_month": 1}, "the 1st at 06:00"),
    ({"kind": "monthly", "hour": 6, "day_of_month": 2}, "the 2nd at 06:00"),
    ({"kind": "monthly", "hour": 6, "day_of_month": 3}, "the 3rd at 06:00"),
    ({"kind": "monthly", "hour": 6, "day_of_month": 11}, "the 11th at 06:00"),
    ({"kind": "monthly", "hour": 6, "day_of_month": 22}, "the 22nd at 06:00"),
    # 31 means the last day, so naming "the 31st" would be wrong in February.
    ({"kind": "monthly", "hour": 6, "day_of_month": 31},
     "the last day of the month at 06:00"),
])
def test_a_slot_reads_as_a_person_would_say_it(kwargs, expected):
    assert describe_slot(**kwargs) == expected


def test_the_flat_notice_list_leads_with_the_run_level_ones(fake_sales):
    """
    A caveat about the whole run has to be read before any single number, and
    the flat list is what the run record and the agent loop both consume.
    """
    def with_notice(**kwargs):
        result = _sales_ok()
        result["meta"]["notice"] = {"kind": "ambiguous_sku",
                                    "message": "Three different products."}
        return result

    fake_sales(with_notice)
    run = asyncio.run(run_version(
        steps=validate_steps([SALES_STEP], validate_parameters([WINDOW_PARAM])),
        parameters=validate_parameters([WINDOW_PARAM]),
        saved_definitions_version=req(DEFS, "version") - 1,
    ))
    assert [n["kind"] for n in run["notices"]] == [
        "definitions_drift", "ambiguous_sku",
    ]


# ---------------------------------------------------------------------------
# Slots
# ---------------------------------------------------------------------------

def _schedule(**kw) -> GeorgeWorkflowSchedule:
    return GeorgeWorkflowSchedule(
        kind=kw.pop("kind", "weekly"), hour=kw.pop("hour", 6),
        minute=kw.pop("minute", 0), days_of_week=kw.pop("days_of_week", [0]),
        day_of_month=kw.pop("day_of_month", None), **kw
    )


def test_a_daily_slot_before_now_is_todays():
    now = datetime(2026, 9, 3, 7, 30, tzinfo=MANILA)
    slot = workflow_scheduler.slot_for(_schedule(kind="daily"), now)
    assert slot == datetime(2026, 9, 3, 6, 0, tzinfo=MANILA)


def test_a_daily_slot_after_now_is_yesterdays():
    now = datetime(2026, 9, 3, 5, 30, tzinfo=MANILA)
    slot = workflow_scheduler.slot_for(_schedule(kind="daily"), now)
    assert slot == datetime(2026, 9, 2, 6, 0, tzinfo=MANILA)


def test_a_weekly_slot_walks_back_to_its_weekday():
    # Thursday 2026-09-03, schedule is Mondays at 06:00.
    now = datetime(2026, 9, 3, 9, 0, tzinfo=MANILA)
    slot = workflow_scheduler.slot_for(_schedule(days_of_week=[0]), now)
    assert slot == datetime(2026, 8, 31, 6, 0, tzinfo=MANILA)
    assert slot.weekday() == 0


def test_a_weekly_slot_on_its_own_day_before_the_hour_goes_back_a_week():
    now = datetime(2026, 8, 31, 5, 0, tzinfo=MANILA)  # Monday, before 06:00
    slot = workflow_scheduler.slot_for(_schedule(days_of_week=[0]), now)
    assert slot == datetime(2026, 8, 24, 6, 0, tzinfo=MANILA)


def test_a_monthly_slot_clamps_to_the_last_day_of_a_short_month():
    """day_of_month 31 means the last day, as scheduled_reports already uses."""
    now = datetime(2026, 2, 28, 23, 0, tzinfo=MANILA)
    slot = workflow_scheduler.slot_for(
        _schedule(kind="monthly", day_of_month=31), now
    )
    assert slot == datetime(2026, 2, 28, 6, 0, tzinfo=MANILA)


def test_a_schedule_that_can_never_fire_returns_no_slot():
    assert workflow_scheduler.slot_for(_schedule(days_of_week=[]),
                                       datetime.now(MANILA)) is None


def test_a_first_run_has_missed_nothing():
    """Never having fired is not the same as having been missed."""
    schedule = _schedule(kind="daily")
    slot = datetime(2026, 9, 3, 6, 0, tzinfo=MANILA)
    assert workflow_scheduler.skipped_slots(schedule, slot, None) == []


def test_an_outage_reports_the_slots_nobody_received():
    schedule = _schedule(kind="daily")
    slot = datetime(2026, 9, 3, 6, 0, tzinfo=MANILA)
    missed = workflow_scheduler.skipped_slots(
        schedule, slot, datetime(2026, 8, 31, 6, 0, tzinfo=MANILA)
    )
    assert missed == [
        datetime(2026, 9, 2, 6, 0, tzinfo=MANILA),
        datetime(2026, 9, 1, 6, 0, tzinfo=MANILA),
    ]


def test_a_slot_already_run_counts_as_nothing_missed():
    schedule = _schedule(kind="daily")
    slot = datetime(2026, 9, 3, 6, 0, tzinfo=MANILA)
    assert workflow_scheduler.skipped_slots(schedule, slot, slot) == []


def test_a_long_outage_stops_counting_rather_than_enumerating_a_year():
    schedule = _schedule(kind="daily")
    slot = datetime(2026, 9, 3, 6, 0, tzinfo=MANILA)
    missed = workflow_scheduler.skipped_slots(
        schedule, slot, slot - timedelta(days=400)
    )
    assert len(missed) == workflow_scheduler.MAX_SKIPPED_COUNTED


def test_catch_up_is_the_policy_the_definitions_state():
    """
    The code runs only the most recent slot. If somebody changes the definition
    they must change the scheduler too, and this is what tells them.
    """
    assert req(DEFS, "workflows.schedule.catch_up") == "latest_slot_only"
