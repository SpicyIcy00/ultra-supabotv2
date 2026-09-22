"""
Reads asked as one call (P2S.10, 2026-09-18): get_change and get_stock_health.

NO DATABASE, NO API. Scripted client, stubbed reads, stubbed log — the loop's
bookkeeping and the definitions are what is under test.

The owner: "build more case specific tools … based of the things were testing
and the logs cause they might help other questions too". His own 30 days in
george.conversations and the 177 recorded test turns asked the same reads
piece by piece over two or three rounds. Each tool here is one call for the
model and the listed EXISTING reads for everything else — own seq, frames,
receipts, board object and pin — so what is read, drawn and kept is unchanged
and there is still one calculation path per figure.
"""

from __future__ import annotations

import asyncio
import inspect
import json
from datetime import datetime, timedelta

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                          # noqa: E402
from agent import one_call                                                      # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of # noqa: E402
from tests.test_rounds_contract import _assert_answered, _tool_results          # noqa: E402
from tools import windows                                                       # noqa: E402
from tools._common import load_defs, req                                        # noqa: E402

DEFS = load_defs()
ANSWER = "North Edsa fell on fewer transactions."


def _drive(monkeypatch, replies, refuse=lambda name, args: None,
           question="how is north edsa doing?"):
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)
    executed: list[tuple[str, dict]] = []
    real_call_tool = bob_loop._call_tool

    async def fake_read(name, args):
        if name in one_call.FUNCTIONS:          # a one-call tool that would not expand
            return await real_call_tool(name, args)
        executed.append((name, dict(args)))
        reason = refuse(name, args)
        if reason:
            return ({"rows": [], "meta": {"error": reason}}, reason, 1)
        return ({"rows": [{"store": "North Edsa", "value": float(len(executed))}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-18T00:00:00+00:00",
                          "row_count": 1}}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in bob_loop.run(question)]

    return asyncio.run(collect()), fake.messages.requests, executed


def _listed(name: str) -> list[dict]:
    return req(DEFS, f"one_call_reads.tools.{name}.reads")


# ---------------------------------------------------------------------------
# One call for the model, the listed reads for everything else
# ---------------------------------------------------------------------------

def test_get_change_is_one_call_for_the_model_and_its_reads_for_everything_else(monkeypatch):
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "north edsa"})],
        [_TextBlock(ANSWER)],
    ])
    headline = req(DEFS, "metric_sets.sales_headline.metrics")
    parts = [r["part"] for r in _listed("get_change")]
    # The headline read names a metric set, so it is its three metrics.
    expected_parts = [p for p in parts for _ in (headline if p == "headline" else [None])]

    calls = frames_of(frames, "tool_call")
    assert [c["one_call"]["part"] for c in calls] == expected_parts
    assert {c["one_call"]["of"] for c in calls} == {0}, "every read answers to the one call"
    assert {c["one_call"]["asked"] for c in calls} == {"get_change"}
    assert [c["tool"] for c in calls] == [n for n, _ in executed]
    assert all(r["pinnable"] for r in frames_of(frames, "tool_result")), "each is an ordinary read"

    shown = _tool_results(requests[-1])
    assert len(shown) == 1 and shown[0]["id"] == "c1", "one call, one result"
    payload = shown[0]["payload"]
    assert payload["call"] == "get_change"
    assert [r["part"] for r in payload["results"]] == expected_parts
    assert [r["meta"]["call_seq"] for r in payload["results"]] == list(range(len(expected_parts)))
    _assert_answered(requests[-1]["messages"])

    done = frames_of(frames, "done")[0]
    assert done["asked_reads"] == 1 and done["executed_calls"] == len(expected_parts)


def test_each_read_keeps_the_calls_shop_and_window(monkeypatch):
    _frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "North Edsa", "date_range": "last_week"})],
        [_TextBlock(ANSWER)],
    ])
    today = datetime.now(one_call.MANILA).date()
    (cs, ce), (bs, _be) = windows.previous_period_preset(DEFS, "last_week", today)
    sales = [a for n, a in executed if n == "get_sales"]
    assert all(a["filters"] == {"store": "North Edsa"} for a in sales)
    compared = [a for a in sales if a.get("compare_to")]
    assert compared and all(a["date_range"] == "last_week" for a in compared)
    assert all(a["compare_to"] == req(DEFS, "one_call_reads.tools.get_change.default_compare_to")
               for a in compared)
    # The baseline's own days and the window's, one series, never compared.
    days = next(a for a in sales if a["group_by"] == "day")
    assert days["date_range"] == [bs.isoformat(), ce.isoformat()] and "compare_to" not in days
    # Stock history takes inclusive days: the window's first and last.
    shelf = next(a for n, a in executed if n == "get_stock_history")
    assert shelf["store"] == "North Edsa"
    assert (shelf["start"], shelf["end"]) == (cs.isoformat(), (ce - timedelta(days=1)).isoformat())


def test_with_no_store_it_is_the_whole_estate(monkeypatch):
    _frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {})],
        [_TextBlock(ANSWER)],
    ])
    assert executed and all("filters" not in a and "store" not in a for _n, a in executed)
    headline = [a for n, a in executed if a.get("metric") in
                req(DEFS, "metric_sets.sales_headline.metrics") and a.get("group_by") == "store"]
    assert len(headline) == 3, "every shop, compared, for the three drivers"


def test_the_morning_compares_a_day_with_the_same_weekday():
    """p2s7-gate-2.json's morning read yesterday against the same weekday a week before."""
    calls = one_call.get_change("North Edsa", date_range="yesterday",
                                compare_to="same_weekday_last_week")
    today = datetime.now(one_call.MANILA).date()
    start, end = (windows.as_date(d) for d in windows.resolve_preset(DEFS, "yesterday", today))
    offset = int(req(DEFS, req(DEFS, "comparisons.same_weekday_last_week.offset_days")))
    compared = [c["arguments"] for c in calls if c["arguments"].get("compare_to")]
    assert compared and {a["compare_to"] for a in compared} == {"same_weekday_last_week"}
    days = next(c["arguments"] for c in calls if c["part"] == "days")
    assert days["date_range"] == [(start - timedelta(days=offset)).isoformat(), end.isoformat()]


def test_a_comparison_the_definition_does_not_list_is_refused():
    with pytest.raises(ValueError, match="compares with"):
        one_call.get_change(compare_to="to_date_same_elapsed")


def test_with_a_category_it_reads_what_a_category_can_be_read_by():
    """
    net_sales and its drivers are whole-till figures and stock history has no
    category filter, so a category is its own revenue, by shop, by day and by
    product — and nothing that would not be about the category.
    """
    calls = one_call.get_change(category="tradsnax")
    listed = req(DEFS, "one_call_reads.tools.get_change.reads_with_a_category")
    assert [c["part"] for c in calls] == [r["part"] for r in listed]
    assert all(c["tool"] == "get_sales" for c in calls)
    assert all(c["arguments"]["filters"] == {"category": "tradsnax"} for c in calls)
    assert {c["arguments"]["metric"] for c in calls} == {"product_revenue"}
    assert not [c for c in calls if c["tool"] == "get_stock_history"]
    both = one_call.get_change(store="OPUS", category="tradsnax")
    assert all(c["arguments"]["filters"] == {"store": "OPUS", "category": "tradsnax"} for c in both)


def test_no_read_waits_on_another(monkeypatch):
    """Every read is fixed before any runs: none consumes another's rows (rule 6)."""
    calls = one_call.get_change("OPUS")
    again = one_call.get_change("OPUS")
    assert calls == again
    assert all(set(c) == {"part", "tool", "arguments"} for c in calls)
    frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "OPUS"})],
        [_TextBlock(ANSWER)],
    ])
    # One batch: every read was dispatched before any result came back.
    assert len({c["one_call"]["of"] for c in frames_of(frames, "tool_call")}) == 1
    assert len(executed) == len(calls) + len(req(DEFS, "metric_sets.sales_headline.metrics")) - 1


# ---------------------------------------------------------------------------
# A refusal is said once, and a read that refuses does not take the rest
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("args,said", [
    ({"store": "AJI BARN"}, "cannot be asked about 'AJI BARN'"),
    ({"store": "Nowhere"}, "cannot be asked about 'Nowhere'"),
    ({"date_range": "this_week"}, "still in progress"),
    ({"shop": "OPUS"}, "it takes no shop"),
])
def test_a_call_that_cannot_expand_is_refused_once_and_reads_nothing(monkeypatch, args, said):
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", args)],
        [_TextBlock("I could not read that.")],
    ])
    assert executed == [], "nothing was read"
    shown = _tool_results(requests[-1])
    assert len(shown) == 1 and shown[0]["is_error"]
    assert said in shown[0]["payload"]["meta"]["error"]
    assert frames_of(frames, "done")[0]["status"] == "ok"
    _assert_answered(requests[-1]["messages"])


def test_a_warehouse_has_no_plan_and_the_shelf_still_reads(monkeypatch):
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("s1", "get_stock_health", {"store": "AJI BARN"})],
        [_TextBlock("The shelf is below.")],
    ], refuse=lambda name, args: "not in scope" if name == "get_replenishment" else None)
    assert [n for n, _ in executed] == [r["tool"] for r in _listed("get_stock_health")]
    shown = _tool_results(requests[-1])[0]
    assert shown["is_error"] is False, "an error only when every read in it is"
    errors = {r["part"]: bool(r["meta"].get("error")) for r in shown["payload"]["results"]}
    assert errors == {"states": False, "emptiest": False, "plan": True, "to_ship": True}


# ---------------------------------------------------------------------------
# The budget counts what Bob decided to read
# ---------------------------------------------------------------------------

def _broad_turn():
    return [
        [_ToolUse("h", "get_sales", {"metric": "sales_headline", "group_by": "store",
                                     "date_range": "last_week", "compare_to": "previous_period"}),
         _ToolUse("a", "get_attention", {})],
        [_ToolUse("c1", "get_change", {"store": "North Edsa"}),
         _ToolUse("c2", "get_change", {"store": "OPUS"})],
        [_ToolUse("x", "get_sales", {"metric": "net_sales", "group_by": "hour",
                                     "date_range": "last_week", "filters": {"store": "OPUS"}})],
        [_TextBlock(ANSWER)],
    ]


def test_the_cap_counts_a_call_asked_as_one_once(monkeypatch):
    """
    A broad turn as the policy now asks it — the headline and get_attention,
    then get_change at two shops — is four calls and seventeen reads. The
    CONVERGENCE CAP counts calls and guards against a subject per call, and a
    check read after it still runs.

    REWRITTEN 2026-09-22 (W1.1, DECISIONS "the answer is the size of the
    question"): this ran on "how is north edsa doing?", a FOCUSED question,
    and held that seventeen reads fit because they were five decisions. The
    read budget counts QUERIES now — "get_change is one decision and seven
    reads" — so the shape is a BROAD turn's here, and the focused half is the
    test after this one.
    """
    frames, _requests, executed = _drive(monkeypatch, _broad_turn(),
                                         question="how are we doing?")
    assert not [w for w in frames_of(frames, "warning") if w.get("reason") == "convergence_cap"]
    assert executed[-1][1].get("group_by") == "hour", "the check read after them ran"
    done = frames_of(frames, "done")[0]
    assert done["asked_reads"] == 5 and done["executed_calls"] > bob_loop.MAX_TOOL_CALLS
    assert done["executed_calls"] <= int(req(DEFS, "composition.size.kinds.broad.max_queries"))


def test_a_focused_question_is_held_to_its_budget_in_queries(monkeypatch):
    """
    The same shape on a FOCUSED question: the headline and the attention read
    run (a turn's first batch always does); two get_changes are fourteen more
    queries, past composition.size.kinds.focused.max_queries, so they are
    refused before they run — answered as tool results, and said.
    """
    budget = int(req(DEFS, "composition.size.kinds.focused.max_queries"))
    frames, _requests, executed = _drive(monkeypatch, _broad_turn(),
                                         question="why is north edsa down?")
    over = [w for w in frames_of(frames, "warning")
            if w.get("reason") == req(DEFS, "composition.size.warning_reason")]
    assert over and over[0]["size"] == "focused" and over[0]["limit"] == budget
    assert not [a for n, a in executed if a.get("filters", {}).get("store") == "OPUS"
                and a.get("compare_to")], "a get_change read ran past the budget"
    assert len(executed) <= budget
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert refused and all("Not run" in r["error"] for r in refused)


# ---------------------------------------------------------------------------
# The definitions: existing reads only, arguments each tool takes
# ---------------------------------------------------------------------------

def test_every_listed_read_is_an_existing_read_its_tool_accepts():
    spec = req(DEFS, "one_call_reads")
    assert spec["executes_nothing"] is True
    assert set(spec["tools"]) == set(one_call.FUNCTIONS)
    shop = req(DEFS, "stores.active_retail")[0]["display_name"]
    variants = {"get_change": ({}, {"store": shop}, {"category": "tradsnax"},
                               {"store": shop, "date_range": "yesterday",
                                "compare_to": "same_weekday_last_week"}),
                "get_stock_health": ({}, {"store": shop})}
    assert set(variants) == set(one_call.FUNCTIONS)
    for name, fn in one_call.FUNCTIONS.items():
        for kw in variants[name]:
            for call in fn(**kw):
                assert call["tool"] in bob_loop.TOOL_FUNCTIONS, call
                args = dict(call["arguments"])
                if args.get("metric") in req(DEFS, "metric_sets"):
                    args["metric"] = req(DEFS, f"metric_sets.{args['metric']}.metrics")[0]
                tool = bob_loop.TOOL_FUNCTIONS[call["tool"]]
                assert bob_loop._unfit_arguments(call["tool"], tool, args) is None, call


def test_the_tools_are_offered_and_never_pinnable():
    schemas = {s["name"]: s for s in bob_loop.build_tool_schemas()}
    for name in one_call.FUNCTIONS:
        assert name in schemas, name
        assert name not in bob_loop.TOOL_FUNCTIONS, "a pin holds the reads, never the call"
        doc = inspect.getdoc(one_call.FUNCTIONS[name]) or ""
        assert "Args:" in doc
    retail = [s["display_name"] for s in req(DEFS, "stores.active_retail")]
    assert schemas["get_change"]["input_schema"]["properties"]["store"]["enum"] == retail
    assert schemas["get_change"]["input_schema"]["required"] == []
    # Offered among the reads, ahead of compose: the cached prefix is reads, then labels.
    names = [s["name"] for s in bob_loop.build_tool_schemas()]
    assert names.index("get_change") < names.index(bob_loop.COMPOSE_TOOL)


def test_every_shop_at_a_glance_is_already_one_call():
    """The card's second tool is P2S.9(b)'s set; a second name for it would be a choice."""
    sales = next(t for t in bob_loop.build_tool_schemas() if t["name"] == "get_sales")
    assert "sales_headline" in sales["input_schema"]["properties"]["metric"]["enum"]
    assert "every shop at a glance" not in json.dumps(req(DEFS, "one_call_reads.tools"))


def test_the_prompt_names_it_where_the_rounds_are_decided():
    # THE SECOND ROUND WENT WITH P6.c (2026-09-20): a broad question is
    # designed as a page first and every read it needs goes in ONE round, so
    # there is no "then in one more" to name. The one-call headline read is
    # still named where the rounds are decided, which is what this holds.
    assert "ONE round" in bob_loop.SCOPE_SECTION
    assert "get_change reads VERIFY to CHECK in one call." in bob_loop.SYSTEM_PROMPT
