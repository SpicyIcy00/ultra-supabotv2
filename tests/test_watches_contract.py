"""
Pure tests for watches — a condition George checks, which posts when it fires.

NO DATABASE. A watch's whole correctness is a decision about whether to speak,
and that decision is a pure function of two firing sets, so it is all testable
here:

  1. IT SPEAKS ON CHANGE, NEVER ON TRUTH. A shop down five mornings running is
     one post. This is the property that makes a watch readable, and the one
     an implementation loses first.
  2. "NOTHING FIRED" AND "I COULD NOT LOOK" ARE DIFFERENT ANSWERS. Collapsing
     them announces that every shop recovered on the morning a source went
     stale — good news, invented, and indistinguishable from the real thing.
  3. IT CARRIES NO NUMBERS. The tool has no threshold argument, the table has
     no threshold column, and the condition names a definition.
  4. IT CANNOT RUN UNBACKTESTED, and the backtest counts POSTS rather than
     firing days, because that is the number somebody decides on.
  5. THE CACHED PREFIX SURVIVES the new injected tool.
"""

from __future__ import annotations

import asyncio
import inspect
from datetime import date

import pytest

from agent import loop, write_tools
from app.services import watches
from tools._common import load_defs, req

DEFS = load_defs()


def _sales(subject: str, direction: str, pct: float) -> dict:
    return {"section": "sales_vs_same_weekday", "subject": subject,
            "direction": direction, "change_pct": pct, "value": 1000.0}


def _stock(subject: str, store: str) -> dict:
    return {"section": "stock_crossed_out", "subject": subject, "store": store,
            "sku": "X1", "was": 5.0, "now": 0.0}


RAN = {"sales_vs_same_weekday": {"ran": True}, "stock_crossed_out": {"ran": True}}


# ---------------------------------------------------------------------------
# 1. It speaks on change, never on truth
# ---------------------------------------------------------------------------

def test_the_same_news_two_mornings_running_is_said_once():
    """The property the whole design exists for."""
    monday = {"Rockwell": "down", "Fairview": "down"}
    tuesday = {"Rockwell": "down", "Fairview": "down"}
    assert watches.diff(monday, tuesday) == {"added": [], "cleared": []}


def test_a_new_subject_is_news():
    changed = watches.diff({"Rockwell": "down"},
                           {"Rockwell": "down", "OPUS": "down"})
    assert changed == {"added": ["OPUS"], "cleared": []}


def test_recovering_is_news_too():
    """
    "Rockwell is back to normal" is the half people otherwise never get told,
    and it is what makes the alerts trustworthy rather than only alarming.
    """
    changed = watches.diff({"Rockwell": "down"}, {})
    assert changed == {"added": [], "cleared": ["Rockwell"]}


def test_a_direction_flip_is_news_although_the_subject_is_unchanged():
    """
    Down 40% yesterday and up 40% today is a different fact about the same
    shop. Comparing subjects alone would call that "more of the same".
    """
    changed = watches.diff({"Rockwell": "down"}, {"Rockwell": "up"})
    assert changed["added"] == ["Rockwell"]


def test_a_first_check_with_nothing_firing_says_nothing():
    """
    Otherwise a watch switched on during a quiet week announces its own
    silence, which is the least useful post it could ever write.
    """
    assert watches.diff(None, {}) == {"added": [], "cleared": []}


def test_a_first_check_with_something_firing_is_news():
    assert watches.diff(None, {"Rockwell": "down"})["added"] == ["Rockwell"]


# ---------------------------------------------------------------------------
# 2. Nothing fired vs could not look
# ---------------------------------------------------------------------------

def test_a_section_that_could_not_run_returns_no_state_at_all():
    """
    None, not {} — and the distinction is the point. An empty firing set means
    "I looked and everything is fine"; None means "I could not look". Treated
    as the same thing, a stale source reads as every shop recovering at once.
    """
    state, detail, blind = watches.firing_from(
        [], {"sales_vs_same_weekday": {"ran": False, "reason": "transactions are stale"}},
        condition="sales_moved", direction="either", stores=None, defs=DEFS,
    )
    assert state is None and detail == []
    assert "stale" in blind


def test_a_section_that_ran_and_found_nothing_is_an_empty_set():
    state, detail, blind = watches.firing_from([], RAN, condition="sales_moved",
                                               direction="either", stores=None,
                                               defs=DEFS)
    assert state == {} and blind is None


def test_blindness_never_reads_as_recovery():
    """The two previous facts, composed — which is where the bug would live."""
    yesterday = {"Rockwell": "down"}
    state, _, _ = watches.firing_from(
        [], {"sales_vs_same_weekday": {"ran": False}},
        condition="sales_moved", direction="either", stores=None, defs=DEFS,
    )
    assert state is None
    # The runner leaves last_state alone in this case; the diff is never taken.
    # If it were taken against an empty set it would claim a recovery:
    assert watches.diff(yesterday, {})["cleared"] == ["Rockwell"]


# ---------------------------------------------------------------------------
# Scope and direction
# ---------------------------------------------------------------------------

def test_a_store_condition_scopes_on_the_subject():
    rows = [_sales("Rockwell", "down", -40), _sales("OPUS", "down", -35)]
    state, _, _ = watches.firing_from(rows, RAN, condition="sales_moved",
                                      direction="either", stores=["Rockwell"],
                                      defs=DEFS)
    assert state == {"Rockwell": "down"}


def test_a_product_condition_scopes_on_the_store_the_product_is_in():
    """
    "Tell me when something goes out of stock at Rockwell" is a scope over
    locations, and the product row carries the location in a different field.
    """
    rows = [_stock("Aji Mix", "Rockwell"), _stock("Aji Dilis", "AJI BARN")]
    state, _, _ = watches.firing_from(rows, RAN, condition="stock_crossed_out",
                                      direction="either", stores=["Rockwell"],
                                      defs=DEFS)
    assert state == {"Aji Mix": "—"}


def test_scope_matching_is_case_insensitive():
    rows = [_sales("North Edsa", "down", -40)]
    state, _, _ = watches.firing_from(rows, RAN, condition="sales_moved",
                                      direction="either", stores=["north edsa"],
                                      defs=DEFS)
    assert state == {"North Edsa": "down"}


def test_a_direction_filters_before_the_state_is_built():
    rows = [_sales("Rockwell", "down", -40), _sales("OPUS", "up", 52)]
    state, _, _ = watches.firing_from(rows, RAN, condition="sales_moved",
                                      direction="down", stores=None, defs=DEFS)
    assert state == {"Rockwell": "down"}


def test_no_scope_means_every_shop():
    rows = [_sales("Rockwell", "down", -40), _sales("OPUS", "up", 52)]
    state, _, _ = watches.firing_from(rows, RAN, condition="sales_moved",
                                      direction="either", stores=None, defs=DEFS)
    assert set(state) == {"Rockwell", "OPUS"}


# ---------------------------------------------------------------------------
# 3. It carries no numbers
# ---------------------------------------------------------------------------

def test_the_tool_has_nowhere_to_put_a_threshold():
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.WATCH_TOOL)
    props = schema["input_schema"]["properties"]

    numeric = {n for n, spec in props.items()
               if spec.get("type") in ("integer", "number")}
    assert numeric == {"hour", "minute"}

    for forbidden in ("threshold", "pct", "percent", "amount", "floor",
                      "metric", "window", "compare_to", "value"):
        assert forbidden not in props


def test_the_condition_is_a_closed_set_from_the_definitions():
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.WATCH_TOOL)
    declared = sorted(req(DEFS, "watches.conditions"))
    assert schema["input_schema"]["properties"]["condition"]["enum"] == declared


def test_every_condition_points_at_a_threshold_that_already_exists():
    """
    The rule that stops a watch from disagreeing with the morning brief: its
    numbers are the brief's, by reference, and the reference has to resolve.
    """
    for name, spec in req(DEFS, "watches.conditions").items():
        ref = spec["thresholds_ref"]
        assert req(DEFS, ref), f"{name} references {ref}, which does not exist"
        # And the section it reads is one the brief actually produces.
        assert spec["section"] in req(DEFS, "brief")


def test_an_unknown_condition_is_refused_with_the_real_ones_named():
    with pytest.raises(watches.WatchRefused) as caught:
        watches.condition_or_refuse("deliveries_late", DEFS)
    message = str(caught.value)
    assert "sales_moved" in message and "definition" in message


def test_deliveries_are_recorded_as_unavailable_with_what_would_fix_them():
    """
    An absence reads as George being bad at something. This is the record that
    it is a data problem, and the record of what would end it.
    """
    gap = req(DEFS, "watches.not_available.deliveries")
    assert "frozen" in gap["reason"]
    assert "received" in gap["needs"]
    assert "deliveries" not in req(DEFS, "watches.conditions")


def test_the_table_has_no_threshold_column():
    from app.models.george_watch import GeorgeWatch

    columns = set(GeorgeWatch.__table__.columns.keys())
    for forbidden in ("threshold", "pct", "percent", "floor", "amount", "metric"):
        assert forbidden not in columns
    numeric = {c.name for c in GeorgeWatch.__table__.columns
               if str(c.type).upper().startswith("INTEGER")}
    assert numeric == {"hour", "minute"}


# ---------------------------------------------------------------------------
# 4. It cannot run unbacktested
# ---------------------------------------------------------------------------

def test_the_backtest_gate_is_a_constraint_not_only_a_service_rule():
    from app.models.george_watch import GeorgeWatch

    checks = {c.name: str(c.sqltext) for c in GeorgeWatch.__table__.constraints
              if hasattr(c, "sqltext")}
    gate = checks.get("ck_watches_backtested_before_enabled")
    assert gate and "enabled" in gate and "backtest" in gate


def test_switching_on_without_a_backtest_is_refused_in_the_owners_terms():
    source = inspect.getsource(watches.switch)
    assert "not been backtested" in source
    # And the refusal explains the consequence, not the policy.
    assert "how often" in source


def test_a_backtest_measured_under_other_definitions_does_not_count():
    source = inspect.getsource(watches.switch)
    assert "definitions_version" in source


def test_a_watch_is_created_switched_off():
    assert "enabled=False" in inspect.getsource(watches.create)


def test_the_backtest_counts_posts_not_firing_days():
    """
    The number somebody decides on is "how often would this have bothered me",
    which is posts. A shop down nine mornings running is one, not nine —
    counting firing days would promise nine and deliver one.
    """
    from app.services import watch_runner

    source = inspect.getsource(watch_runner.backtest)
    assert "previous" in source and "fired_on.append" in source
    # Blind days are excluded from the denominator rather than counted quiet.
    assert "days_unreadable" in source


def test_a_watch_over_no_shops_is_refused():
    with pytest.raises(watches.WatchRefused):
        watches._clean_stores([])


def test_a_shop_that_does_not_exist_is_refused_with_the_list():
    with pytest.raises(watches.WatchRefused) as caught:
        watches._clean_stores(["Rockwel"])
    assert "Rockwell" in str(caught.value)


def test_no_scope_is_not_the_same_as_an_empty_one():
    assert watches._clean_stores(None) is None


# ---------------------------------------------------------------------------
# 5. Capability, and the cached prefix
# ---------------------------------------------------------------------------

def test_without_a_writer_the_tool_refuses_rather_than_writing():
    with pytest.raises(write_tools.WatchRefused):
        asyncio.run(write_tools.set_watch(
            "create", condition="sales_moved", hour=8,
            ctx=write_tools.WriteContext(),
        ))


def test_a_scheduled_ask_is_not_given_the_watch_writer():
    """
    Nothing that runs unattended may change what else runs unattended — the
    same reason the standing writer is withheld there.
    """
    from app.services import standing_runner

    assert "watch_writer" not in inspect.getsource(standing_runner.ask)

    ctx = write_tools.WriteContext(memory_reader=lambda: None,
                                   automations_reader=lambda: None,
                                   belief_store=object())
    assert write_tools.WATCH_TOOL not in loop.injected_surface(ctx)


def test_the_new_tool_does_not_break_the_shared_prefix():
    from agent import composite_tools

    names = [s["name"] for s in loop.build_tool_schemas(include_write=True)]
    injected = [n for n in names if n not in loop.TOOL_FUNCTIONS
                and n not in loop.FINDING_TOOL_FUNCTIONS]
    assert injected == sorted(injected)
    assert write_tools.WATCH_TOOL in injected
    assert injected[-1] == composite_tools.PAGE_CONTEXT_TOOL


def test_the_registry_agrees_with_the_context():
    assert write_tools.WRITE_TOOL_REQUIRES[write_tools.WATCH_TOOL] == "watch_writer"
    assert hasattr(write_tools.WriteContext(), "watch_writer")


# ---------------------------------------------------------------------------
# What a fired watch hands to the reply
# ---------------------------------------------------------------------------

def test_a_watch_post_carries_the_read_behind_it():
    """
    "Investigate this" has to start from a fact. The post stores the exact
    call, so a reply re-runs it rather than working from the sentence —
    which is what keeps an investigation an ordinary conversation instead of
    a second machine (architecture rule 10).
    """
    from app.services import watch_runner

    source = inspect.getsource(watch_runner.check)
    assert '"tool": "get_brief"' in source
    assert "as_of" in source


def test_the_post_names_what_changed_rather_than_what_is_true():
    from app.services import river_writer

    source = inspect.getsource(river_writer.post_watch)
    assert "added" in source and "cleared" in source
    assert "back to normal" in source


def test_the_label_is_derived_so_it_cannot_lie():
    """
    There is no name column: a stored label could say something the watch does
    not do, and nothing would ever catch it.
    """
    from app.models.george_watch import GeorgeWatch

    assert "name" not in GeorgeWatch.__table__.columns.keys()

    class _W:
        condition, direction, stores = "sales_moved", "down", ["Rockwell"]
    text = watches.label(_W(), DEFS)
    assert "Rockwell" in text and "down" in text


def test_every_check_is_recorded_including_the_quiet_ones():
    """
    Without this, "quiet for eleven days" and "broken for eleven days" are the
    same observation from outside, and the second is the one somebody needs.
    """
    from app.services import watch_runner

    source = inspect.getsource(watch_runner.check)
    # Every path through the check writes one.
    assert source.count("record_check") >= 4
    assert bool(req(DEFS, "watches.firing.quiet_checks_recorded"))


# ---------------------------------------------------------------------------
# Rescoping — the one dial a too-noisy backtest leaves you
# ---------------------------------------------------------------------------

def test_rescoping_throws_the_backtest_away():
    """
    A watch over Rockwell is a DIFFERENT WATCH from one over seven shops: 47
    firing mornings becomes 4. Keeping the old number would leave somebody
    holding evidence for a rule that no longer exists, which is the exact
    failure the gate exists to prevent.
    """
    source = inspect.getsource(watches.rescope)
    assert "watch.backtest = None" in source
    assert "watch.enabled = False" in source
    # And the state, or the first check after rescoping would diff against
    # subjects that are no longer in scope and announce them as recovered.
    assert "watch.last_state = None" in source


def test_widening_back_to_every_shop_is_its_own_argument():
    """
    `stores=None` already means "leave the scope alone", so clearing it needs
    a separate word — an omitted argument and a deliberate clearing cannot be
    the same value.
    """
    sig = inspect.signature(watches.rescope)
    assert "all_shops" in sig.parameters
    schema = next(s for s in loop.build_tool_schemas(include_write=True)
                  if s["name"] == write_tools.WATCH_TOOL)
    assert schema["input_schema"]["properties"]["all_shops"]["type"] == "boolean"


def test_narrowing_is_offered_where_raising_the_threshold_is_not():
    """
    When a backtest says a watch would fire too often there is exactly one
    honest dial, and the tool says which it is.
    """
    doc = write_tools.set_watch.__doc__
    assert "narrowing the scope is allowed" in doc
    assert "changing the threshold is not" in doc


def test_every_service_that_claims_a_slot_is_allowed_to():
    """
    The claim's SQL names a table, and the set of names is closed in code so a
    caller's string can never reach it. That guard did its job the first time
    watches ran — and refused them, because the new table had not been added
    to the set. A fourth schedule will make the same mistake unless this test
    is here to make it a failure rather than a silent tick error.
    """
    from app.services import slots, standing_questions, watches as watch_service
    from app.services import workflow_scheduler

    for service in (standing_questions, watch_service, workflow_scheduler):
        assert service.TABLE in slots.CLAIMABLE, (
            f"{service.__name__} claims slots in {service.TABLE}, which "
            f"slots.claim refuses"
        )
