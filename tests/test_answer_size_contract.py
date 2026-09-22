"""
The answer is the size of the question, and the checks fix instead of argue
(W1.1, 2026-09-22; DECISIONS the same day, decisions 1 and 2).

NO DATABASE, NO API. Scripted client, stubbed reads, stubbed log — the loop's
bookkeeping, compose's bounds and the definitions are what is under test.

What each half answers to, in the owner's record:

  SIZE. Small questions took 10-25 s when they stayed small and 150 s when he
  inflated them; the dashboard turn took 462 s. So code reads how large a
  message may be answered (composition.size, from the effort table's own
  phrases), he declares the size on compose, and compose HOLDS it — figures
  past the bound refused, a page on a lookup or a focused answer left out, the
  page offered instead — and the read budget counts QUERIES run.

  CHECKS. The dashboard turn's headline was his reply to the notice gate:
  "The caveat needs the magnitude and it belongs beside the counts it
  qualifies…", with a forced box under it listing one notice twice. So a
  notice is placed, not argued for; it is raised once; a correction's reply is
  never the headline; the fingerprint takes "below zero".
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import compose, reading                                             # noqa: E402
from agent import loop as bob_loop                                             # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()
SIZE = req(DEFS, "composition.size")

SALES = {"group_by": [], "date_range": "last_week", "metric": "net_sales",
         "compare_to": "previous_period", "filters": {"store": "Rockwell"}}


def _meta(n: int, **extra) -> dict:
    return {"source_table": "new_transactions", "filters_applied": [],
            "snapshot_timestamp": f"2026-09-22T00:00:0{n % 10}+00:00", "row_count": 1,
            **extra}


def _drive(monkeypatch, replies, question="how did Rockwell do last week?",
           notice=None, history=None, pin_writer=False):
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)
    executed: list[tuple[str, dict]] = []

    async def fake_read(name, args):
        executed.append((name, dict(args)))
        n = len(executed)
        meta = _meta(n, **({"notice": notice} if notice else {}))
        return ({"rows": [{"store": "Rockwell", "value": float(n), "baseline": 2.0,
                           "change": float(n) - 2.0, "change_pct": -10.0,
                           "direction": "down", "baseline_status": "ok"}],
                 "meta": meta}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)
    kwargs = {"history": history}
    if pin_writer:
        async def writer(spec):
            raise AssertionError("not reached")
        kwargs["pin_writer"] = writer

    async def collect():
        return [f async for f in bob_loop.run(question, **kwargs)]

    return asyncio.run(collect()), fake.messages.requests, executed


def _final(frames) -> str:
    """What the reader is left with: the text after the last answer_reset frame."""
    import json
    out = ""
    for f in frames:
        head, _, rest = f.partition("\n")
        if head == "event: answer_reset":
            out = ""
        elif head == "event: text":
            out += json.loads(rest.partition("data: ")[2]).get("delta", "")
    return out


def _question(request) -> str:
    """The turn's question message (the loop's list grows as the turn runs)."""
    return next(m["content"] for m in request["messages"]
                if m["role"] == "user" and isinstance(m["content"], str))


def _block(key, seq, kind="figure"):
    return {"op": "put", "key": key, "kind": kind, "weight": "supporting", "seq": seq,
            "subject": "Rockwell", "claim": "Rockwell fell"}


def _calls(n=3):
    return {i: {"tool": "get_sales", "arguments": dict(SALES), "error": None,
                "duplicate": False, "is_read": True, "filters": {"store": "Rockwell"},
                "rows": [{"store": "Rockwell", "value": 10.0 + i, "baseline": 9.0,
                          "change": 1.0, "change_pct": 5.0, "baseline_status": "ok"}],
                "meta": {"row_count": 1}}
            for i in range(n)}


# ---------------------------------------------------------------------------
# The ceiling is read from the message, with the effort table's own phrases
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("question, expected", [
    ("how are we doing", "broad"),
    ("Make it a full page", "broad"),
    ("build me a dashboard", "broad"),
    ("remember that Rockwell closes on Mondays", "remember"),
    # The definitions' own lookup example, and a fact asked: a lookup at most.
    ("how did Rockwell do last week?", "lookup"),
    ("what were Rockwell's sales yesterday", "lookup"),
    # A message that digs is focused at most.
    ("why is Rockwell down?", "focused"),
    ("analyze tradsnax per store", "focused"),
])
def test_the_ceiling_is_read_with_the_effort_tables_phrases(question, expected):
    _level, kind = bob_loop.turn_effort(question, None, DEFS)
    assert bob_loop.size_ceiling(kind, DEFS) == expected


def test_the_offer_is_a_broad_phrase_so_taking_it_is_a_broad_question():
    offer = req(SIZE, "kinds.focused.offer")
    _level, kind = bob_loop.turn_effort(offer, [{"role": "bob", "text": "x"}], DEFS)
    assert bob_loop.size_ceiling(kind, DEFS) == "broad"


def test_the_size_is_said_on_the_question_and_never_in_the_cached_prefix(monkeypatch):
    _frames, requests, _ = _drive(monkeypatch, [[_TextBlock("Rockwell fell.")]])
    question = _question(requests[0])
    assert "at most lookup" in question and question.endswith("how did Rockwell do last week?")
    assert "at most lookup" not in bob_loop.SYSTEM_PROMPT


def test_a_surface_act_is_not_told_a_size(monkeypatch):
    history = [{"role": "user", "text": "net sales"}, {"role": "bob", "text": "₱1."}]
    _frames, requests, _ = _drive(monkeypatch, [[_TextBlock("Nothing to pin yet.")]],
                                  question="pin that", history=history)
    assert "[This message may be answered" not in _question(requests[0])


# ---------------------------------------------------------------------------
# Compose holds the size (pure)
# ---------------------------------------------------------------------------

def test_a_size_above_the_ceiling_is_brought_down_and_said():
    coerced: list[str] = []
    assert compose.resolve_size("broad", "focused", DEFS, coerced) == "focused"
    assert coerced and "at most focused" in coerced[0]
    assert compose.resolve_size("lookup", "focused", DEFS) == "lookup"
    assert compose.resolve_size(None, "broad", DEFS) == "broad"
    assert compose.resolve_size("nonsense", None, DEFS) == SIZE["order"][-1]


def test_a_lookup_draws_one_figure_and_refuses_the_second():
    out = compose.compose([_block("net", 0), _block("txns", 1)], size="lookup",
                          calls=_calls(), defs=DEFS, ceiling="focused", own=[])
    assert [b["key"] for b in out["rows"]] == ["net"]
    [refused] = out["meta"]["rejected"]
    assert refused["block"]["key"] == "txns" and "lookup" in refused["reason"]
    assert out["meta"]["size"] == "lookup"


def test_a_focused_answer_carries_at_most_its_figures_counted_over_the_turn():
    most = int(req(SIZE, "kinds.focused.max_figures"))
    own = [{"key": f"k{i}", "kind": "figure"} for i in range(most)]
    out = compose.compose([_block("k0", 0), _block("another", 1)], size="focused",
                          calls=_calls(), defs=DEFS, ceiling="focused", own=own)
    assert [b["key"] for b in out["rows"]] == ["k0"], "a change of one already put is not new"
    assert [r["block"]["key"] for r in out["meta"]["rejected"]] == ["another"]


def test_a_page_on_a_focused_answer_is_left_out_and_the_page_is_offered():
    page = {"layout": "stack", "children": [{"lede": "Rockwell fell {net}."}, {"block": "net"}]}
    out = compose.compose([_block("net", 0)], {"claim": "Rockwell fell"}, None, page,
                          "focused", calls=_calls(), defs=DEFS, ceiling="focused", own=[])
    assert out["meta"]["arrangement"] is None
    assert any("not a page" in c for c in out["meta"]["coerced"])
    assert out["meta"]["reading"]["asks"][0] == req(SIZE, "kinds.focused.offer")


def test_a_broad_answer_keeps_its_page_and_is_offered_nothing():
    page = {"layout": "stack", "children": [{"lede": "Rockwell fell {net}."}, {"block": "net"}]}
    out = compose.compose([_block("net", 0)], {"claim": "Rockwell fell"}, None, page,
                          "broad", calls=_calls(), defs=DEFS, ceiling="broad", own=[])
    assert out["meta"]["arrangement"] is not None
    assert "asks" not in out["meta"]["reading"]


def test_a_figure_in_a_sentence_resolves_only_against_this_turns_blocks():
    """
    No {key} borrows an earlier turn's figure: "estate" is on the board from an
    earlier answer, not in this turn, so the line naming it is left out.
    """
    page = {"layout": "stack", "children": [
        {"lede": "The estate closed at {estate}."}, {"say": "Rockwell fell {net}."},
        {"block": "net"}]}
    earlier = [{"key": "estate", "kind": "figure"}]
    out = compose.compose([_block("net", 0)], {"claim": "Rockwell fell"}, None, page,
                          "broad", calls=_calls(), defs=DEFS, board=earlier,
                          ceiling="broad", own=[])
    said = [n for n in out["meta"]["arrangement"]["children"] if "lede" in n or "say" in n]
    assert all("{estate}" not in (n.get("lede") or n.get("say") or "") for n in said)
    assert any("{net}" in (n.get("lede") or n.get("say") or "") for n in said)
    assert any("names no `figure` block of this turn" in c for c in out["meta"]["coerced"])


# ---------------------------------------------------------------------------
# The budget counts queries; a thing to remember reads nothing
# ---------------------------------------------------------------------------

def test_a_thing_to_remember_reads_nothing(monkeypatch):
    frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_TextBlock("Noted: Rockwell closes on Mondays.")],
    ], question="remember that Rockwell closes on Mondays")
    assert executed == [], "a read ran on a message that asked for nothing to be read"
    [refused] = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert "Not run" in refused["error"]
    assert frames_of(frames, "done")[0]["effort_kind"] == "remember"


def test_a_list_sent_as_a_string_is_read_as_the_list(monkeypatch):
    """How did Rockwell do, 2026-09-21: `group_by: "[]"`, refused six times."""
    _frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", {**SALES, "group_by": "[]"}),
         _ToolUse("r2", "get_sales", {**SALES, "metric": "transaction_count",
                                      "group_by": '["store"]'})],
        [_TextBlock("Rockwell fell.")],
    ])
    assert [a["group_by"] for _n, a in executed] == [[], ["store"]]


def test_a_string_that_is_not_json_is_left_as_sent():
    b = _ToolUse("x", "get_sales", {"group_by": "store", "date_range": "[not json"})
    bob_loop._unstring_arguments(b)
    assert b.input == {"group_by": "store", "date_range": "[not json"}


# ---------------------------------------------------------------------------
# Checks fix; they do not argue
# ---------------------------------------------------------------------------

NOTICE = {"kind": "negative_on_hand", "source": "definitions/metrics.yaml: x",
          "message": "16,430 stock counts are below zero, the lowest -25,641,517. A count "
                     "below zero is a broken record and not a shelf."}


def test_a_notice_raised_by_two_reads_is_raised_once_and_placed_without_a_round(monkeypatch):
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES),
         _ToolUse("r2", "get_sales", {**SALES, "metric": "transaction_count"})],
        [_TextBlock("Rockwell fell on fewer transactions.")],
    ], notice=NOTICE)
    assert len(frames_of(frames, "notice")) == 1, "one caveat, drawn once"
    assert len(requests) == 2, "no rewrite round"
    said = "".join(f["delta"] for f in frames_of(frames, "text"))
    assert "added automatically" not in said and "below zero" not in said
    assert frames_of(frames, "done")[0]["corrective_turns"] == 0


def test_the_negative_stock_fingerprint_takes_the_notices_own_words():
    said = "Thousands of stock counts are below zero, so an empty line may be a bad count."
    assert bob_loop._unsurfaced([NOTICE], said, DEFS) == []
    for kind in ("replenishment_negative_on_hand", "purchase_plan_negative_on_hand"):
        assert bob_loop._unsurfaced([{**NOTICE, "kind": kind}], said, DEFS) == []


def test_a_correction_reply_that_does_not_say_the_claim_is_never_the_headline(monkeypatch):
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_TextBlock("Rockwell fell on the week. I pinned it to your page."),
         _ToolUse("c1", "compose", {"blocks": [_block("net", 0)],
                                    "reading": {"claim": "Rockwell fell on the week"}})],
        [_TextBlock("You're right, I never called the pin tool — nothing was pinned.")],
    ], pin_writer=True)
    assert len(requests) == 3, "the write correction keeps its round"
    final = _final(frames)
    assert final.split("\n\n")[0] == "Rockwell fell on the week", final
    assert "nothing was pinned" in final, "what he says about the write stays, under it"


def test_a_round_that_settles_on_its_lede_ends_the_turn_with_the_claim(monkeypatch):
    page = {"layout": "stack", "children": [
        {"lede": "Rockwell fell on the week, to {net}."}, {"block": "net"}]}
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_ToolUse("c1", "compose", {"blocks": [_block("net", 0)], "size": "broad",
                                    "reading": {"claim": "Rockwell fell on the week"},
                                    "arrangement": page})],
        [_TextBlock("not reached: the lede said it")],
    ], question="how are we doing")
    assert len(requests) == 2, "the page's lede is the answer; no round for a closing line"
    done = frames_of(frames, "done")[0]
    assert done["rounds_saved"] == 1
    said = "".join(f["delta"] for f in frames_of(frames, "text"))
    assert said.strip() == "Rockwell fell on the week"


# ---------------------------------------------------------------------------
# get_stock grouped by state, and the plan
# ---------------------------------------------------------------------------

def test_a_grouped_stock_total_never_sums_a_negative_count():
    measures = req(DEFS, "ranking.stock_grouping.measures")
    assert "FILTER (WHERE i.quantity_on_hand >= 0)" in measures["total_quantity"]
    assert "quantity_on_hand < 0" in measures["negative_count"]
    assert req(DEFS, "inventory.history.negative_on_hand.exclude_from_sums") is True
    src = (bob_loop.Path(bob_loop.__file__).parents[1] / "tools" / "inventory.py").read_text(
        encoding="utf-8") if hasattr(bob_loop, "Path") else None
    if src is None:
        from pathlib import Path
        src = (Path(bob_loop.__file__).resolve().parents[1] / "tools" / "inventory.py").read_text(
            encoding="utf-8")
    assert "SUM(i.quantity_on_hand)     AS total_quantity" not in src
    assert 'ranking.stock_grouping.measures' in src


def test_states_are_drawn_as_words():
    words = req(DEFS, "ranking.stock_grouping.state_words")
    states = [s["name"] for s in req(DEFS, "inventory.states")]
    assert set(states) <= set(words)
    assert all("_" not in w for w in words.values())


def test_the_plan_is_four_short_steps():
    spec = req(DEFS, "voice.reading.slots.next")
    most, longest = int(spec["max_steps"]), int(spec["max_step_length"])
    assert most == 4
    steps = [f"Step {i}: " + "check the counts again " * 40 for i in range(6)]
    coerced: list[str] = []
    said, rejected = reading.validate({"next": steps}, DEFS, set(), coerced)
    assert rejected == []
    parts = said["next"].split("\n\n")
    assert len(parts) == most and all(len(p) <= longest for p in parts)
    # And paragraphs separated by a blank line are steps too.
    said, _ = reading.validate({"next": "\n\n".join(steps)}, DEFS, set(), [])
    assert len(said["next"].split("\n\n")) == most


def test_a_block_past_the_count_is_refused_and_the_round_still_stands():
    """
    The broad turn of 2026-09-22 composed nineteen blocks; the ones past
    composition.max_blocks were refused, the round did not stand, and the
    recompose moved the page under the reader and cost 47 s. A count is the
    bound working: refused, not drawn, and the answer is not held for it.
    """
    most = int(req(DEFS, "composition.max_blocks"))
    calls = _calls(most + 2)
    blocks = [_block(f"b{i}", i, kind="ranked") for i in range(most + 1)]
    out = compose.compose(blocks, {"claim": "Rockwell fell"}, calls=calls, defs=DEFS,
                          ceiling="broad", own=[])
    over = [r for r in out["meta"]["rejected"] if r.get("bound") == "count"]
    assert len(over) == 1, out["meta"]["rejected"]
    assert bob_loop._refusal_keeps_the_round(out["meta"], DEFS) is False
    # A refusal about TRUTH still keeps its round.
    truth = {"rejected": [{"block": {"key": "x"}, "reason": "read 9 has no row"}]}
    assert bob_loop._refusal_keeps_the_round(truth, DEFS) is True


def test_a_page_whose_prose_never_says_its_claim_leads_with_the_claim(monkeypatch):
    page = {"layout": "stack", "children": [
        {"lede": "Rockwell fell on the week, to {net}."}, {"block": "net"}]}
    frames, _requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_TextBlock("Reads are in. Composing the page."),
         _ToolUse("c1", "compose", {"blocks": [_block("net", 0)], "size": "broad",
                                    "reading": {"claim": "Rockwell fell on the week"},
                                    "arrangement": page})],
    ], question="how are we doing")
    assert _final(frames).strip() == "Rockwell fell on the week"


# ---------------------------------------------------------------------------
# A broad answer is the overview alone (2026-09-22, finishing W1.3): once
# get_overview has run, nothing more is read — a drill-down into a flagged
# shop is the next step offered, not a second round of this answer.
# ---------------------------------------------------------------------------

def test_after_the_overview_a_broad_answer_reads_nothing_more(monkeypatch):
    drill = {"store": "Greenhills"}
    frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("o1", "get_overview", {})],
        [_ToolUse("c1", "get_change", drill)],
        [_TextBlock("Down on traffic, and no one shop carried it.")],
    ], question="how are we doing")
    ran = [name for name, _args in executed]
    assert "get_overview_findings" in ran
    assert not any(args.get("filters", {}).get("store") == "Greenhills" or args.get("store") == "Greenhills"
                   for _name, args in executed), "a drill-down ran after the overview"
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert refused and all("get_overview already read" in r["error"] for r in refused)
    assert req(DEFS, "composition.size.kinds.broad.answered_by") == ["get_overview"]


def test_the_overview_does_not_stop_a_focused_answer_reading(monkeypatch):
    # Only a BROAD answer is the overview alone; a focused question that asks
    # for it keeps its own budget.
    frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("o1", "get_overview", {})],
        [_ToolUse("r1", "get_sales", SALES)],
        [_TextBlock("Rockwell fell.")],
    ], question="why is Rockwell down?")
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert not any("get_overview already read" in (r["error"] or "") for r in refused)


def test_after_get_change_a_focused_answer_reads_nothing_more(monkeypatch):
    frames, _requests, executed = _drive(monkeypatch, [
        [_ToolUse("c1", "get_change", {"store": "Rockwell"})],
        [_ToolUse("r1", "get_stock_history", {"view": "stockouts", "store": "Rockwell"})],
        [_TextBlock("Rockwell fell on traffic.")],
    ], question="why is Rockwell down?")
    assert not any(name == "get_stock_history" and "view" in args and args.get("rank_by") is None
                   for name, args in executed), "a read ran after get_change on a focused answer"
    refused = [r for r in frames_of(frames, "tool_result") if r["error"]]
    assert refused and all("get_change already read" in r["error"] for r in refused)
    assert req(DEFS, "composition.size.kinds.focused.answered_by") == ["get_change"]


def test_a_condition_to_watch_is_not_sized_as_a_lookup():
    """
    2026-09-22, the capability test's one step backwards: "Tell me if any
    shop's sales drop more than they usually do" read as `fresh`, was told it
    was a LOOKUP, and answered one fact instead of setting up a watch. A
    condition to watch is the `automate` kind and is told no size.
    """
    q = "Tell me if any shop's sales drop more than they usually do."
    _level, kind = bob_loop.turn_effort(q, None, DEFS)
    assert kind == "automate"
    assert kind in req(DEFS, "composition.size.not_said_on_effort_kind")
    # A why that happens to name a weekday is still a why.
    assert bob_loop.turn_effort("why do sales drop every monday", None, DEFS)[1] == "ladder"
