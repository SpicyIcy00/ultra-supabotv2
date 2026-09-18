"""
Fewer rounds for the same work (P2S.9, 2026-09-18).

NO DATABASE, NO API. Scripted client, stubbed read, stubbed log — the loop's
bookkeeping is what is under test.

The owner: "is our tool use really optimized?" Measured on
verification/p2s7-gate-2.json: 65 rounds for 81 reads, ~14 s a round, and
59% of what George reads back is `meta`. Three changes, each held here:

  (a) NO EMPTY LAST ROUND. A round of composes only — each standing whole,
      one naming the claim, words beside them — is the answer. The loop
      does not send the compose back for a closing line; the answer goes
      through the same gates, and a gate that asks for a rewrite still gets
      its round, in one user turn with the results first.
  (b) THE SALES HEADLINE IN ONE CALL. `metric='sales_headline'` is one call
      for the model and three ordinary reads for everything else: three
      seqs, three frames, three pinnable calls, one tool_result back.
  (c) SHORTER RECEIPTS FOR THE MODEL. An explanatory note reaches him once
      a turn; after that an identical value is a pointer to the call that
      carried it. Source, filters, window, read time and every notice are
      whole on every read, and the person's receipts are never touched.
"""

from __future__ import annotations

import asyncio
import copy
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                          # noqa: E402
from agent.model_receipts import ModelReceipts                                 # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse           # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()

SALES = {"group_by": [], "date_range": "last_week", "metric": "net_sales",
         "compare_to": "previous_period", "filters": {"store": "Rockwell"}}
HEADLINE = {**SALES, "metric": "sales_headline"}
ANSWER = "Rockwell fell on fewer transactions; the basket held."
NOTE = ("Size of the complete result set before top_n or the row cap. When it "
        "exceeds row_count, the rows shown are the top slice.")
FILTERS = ["t.is_cancelled = false   # metrics.yaml: filters.cancelled",
           "t.store_id IN (1: Rockwell)   # metrics.yaml: stores.active_retail"]


def _meta(n: int, **extra) -> dict:
    return {"source_table": "new_transactions", "filters_applied": list(FILTERS),
            "window": {"start": "2026-09-07", "end": "2026-09-14"},
            "snapshot_timestamp": f"2026-09-18T00:00:0{n}+00:00", "row_count": 1,
            "full_row_count_note": NOTE,
            "definitions_path": "C:\\somewhere\\definitions\\metrics.yaml",
            **extra}


def _drive(monkeypatch, replies, notice=None):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)
    executed: list[tuple[str, dict]] = []

    async def fake_read(name, args):
        executed.append((name, dict(args)))
        n = len(executed)
        if args.get("metric") == "average_transaction_value" and args.get("date_range") == "refuse":
            reason = "refused"
            return ({"rows": [], "meta": {"error": reason}}, reason, 1)
        noticed = notice and args.get("date_range") == "last_month"
        meta = _meta(n, **({"notice": notice} if noticed else {}))
        return ({"rows": [{"store": "Rockwell", "value": float(n), "baseline": 2.0,
                           "change": float(n) - 2.0, "change_pct": -10.0,
                           "direction": "down", "baseline_status": "ok"}],
                 "meta": meta}, None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("how did Rockwell do last week?")]

    return asyncio.run(collect()), fake.messages.requests, executed


def _compose(claim: bool = True, seq: int = 0) -> dict:
    out = {"blocks": [{"op": "put", "key": "rockwell", "kind": "figure",
                       "weight": "lead", "seq": seq, "claim": "Rockwell fell"}]}
    if claim:
        out["reading"] = {"claim": "Rockwell fell"}
    return out


def _tool_results(request) -> list[dict]:
    out = []
    for m in request["messages"]:
        if m["role"] == "user" and isinstance(m["content"], list):
            for b in m["content"]:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    out.append({"id": b["tool_use_id"], "is_error": b.get("is_error", False),
                                "payload": json.loads(b["content"])})
    return out


def _assert_answered(messages: list[dict]) -> None:
    """The API's rule: each tool_use is answered by the very next (user) turn, once."""
    for i, m in enumerate(messages):
        if m["role"] != "assistant":
            continue
        ids = [b.id for b in m["content"] if getattr(b, "type", "") == "tool_use"]
        if not ids:
            continue
        nxt = messages[i + 1]
        assert nxt["role"] == "user"
        got = [b["tool_use_id"] for b in nxt["content"]
               if isinstance(b, dict) and b.get("type") == "tool_result"]
        assert sorted(got) == sorted(ids)
        first_other = next((j for j, b in enumerate(nxt["content"])
                            if not (isinstance(b, dict) and b.get("type") == "tool_result")),
                           len(nxt["content"]))
        assert all(isinstance(b, dict) and b.get("type") == "tool_result"
                   for b in nxt["content"][:first_other]), "results lead the turn"
    roles = [m["role"] for m in messages if m["role"] != "system"]
    assert all(not (a == b == "user") for a, b in zip(roles, roles[1:])
               if a == "user"), "no two user turns in a row"


# ---------------------------------------------------------------------------
# (a) No empty last round
# ---------------------------------------------------------------------------

def test_a_round_that_composes_names_the_claim_and_writes_is_the_answer(monkeypatch):
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_TextBlock(ANSWER), _ToolUse("c1", "compose", _compose())],
        [_TextBlock("A closing line nobody should have waited for.")],
    ])
    assert len(requests) == 2, "the closing round is not sent"
    done = frames_of(frames, "done")[0]
    assert done["iterations"] == 2 and done["rounds_saved"] == 1
    assert len(done["iteration_ms"]) == 2
    assert done["status"] == "ok"
    conv = [p for sql, p in StubLog.instances[0].statements
            if "INSERT INTO george.conversations" in sql]
    assert any(isinstance(p, str) and p.strip() == ANSWER for p in conv[0]), "the answer is his words"
    assert frames_of(frames, "error") == []


@pytest.mark.parametrize("second", [
    pytest.param([_ToolUse("c1", "compose", _compose())], id="no words beside it"),
    pytest.param([_TextBlock(ANSWER), _ToolUse("c1", "compose", _compose(claim=False))],
                 id="no claim named"),
    pytest.param([_TextBlock(ANSWER), _ToolUse("c1", "compose", _compose(seq=9))],
                 id="a block refused"),
    pytest.param([_TextBlock(ANSWER), _ToolUse("c1", "compose", _compose()),
                  _ToolUse("r2", "get_sales", {**SALES, "date_range": "last_month"})],
                 id="a read beside it"),
])
def test_anything_short_of_a_settled_round_keeps_its_round(monkeypatch, second):
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        second,
        [_TextBlock(ANSWER)],
    ])
    assert len(requests) == 3
    assert frames_of(frames, "done")[0]["rounds_saved"] == 0


def test_a_settled_answer_still_faces_the_gates_and_a_rewrite_gets_its_round(monkeypatch):
    """
    A caveat the words leave out is asked for, in ONE user turn, results
    first. The noticed read is one the board does not draw, so nothing on
    screen discharges it.
    """
    notice = {"kind": "partial_window",
              "message": "The month is missing two days of Rockwell's register data.",
              "must_convey": ["missing"]}
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES),
         _ToolUse("r2", "get_sales", {**SALES, "date_range": "last_month"})],
        [_TextBlock(ANSWER), _ToolUse("c1", "compose", _compose())],
        [_TextBlock(ANSWER + " Two days are missing from the week, so this is partial.")],
    ], notice=notice)
    assert len(requests) == 3, "the gate's rewrite is a real round"
    assert frames_of(frames, "done")[0]["rounds_saved"] == 1
    last = requests[-1]["messages"]
    _assert_answered(last)
    tail = [m for m in last if m["role"] == "user"][-1]["content"]
    assert tail[0]["type"] == "tool_result" and tail[-1]["type"] == "text"
    assert "caveats" in tail[-1]["text"]


def test_the_compose_tool_says_the_claim_ends_the_turn():
    compose = next(t for t in george_loop.build_tool_schemas() if t["name"] == "compose")
    said = " ".join(str(req(DEFS, "rounds.settle.tool_sentence")).split())
    assert said in compose["description"]


# ---------------------------------------------------------------------------
# (b) The sales headline in one call
# ---------------------------------------------------------------------------

def test_the_headline_is_one_call_for_the_model_and_three_reads_for_everything_else(monkeypatch):
    frames, requests, executed = _drive(monkeypatch, [
        [_ToolUse("h1", "get_sales", HEADLINE)],
        [_TextBlock(ANSWER)],
    ])
    metrics = req(DEFS, "metric_sets.sales_headline.metrics")
    assert [a["metric"] for _, a in executed] == list(metrics), "each metric read, in order"
    assert all({k: v for k, v in a.items() if k != "metric"}
               == {k: v for k, v in HEADLINE.items() if k != "metric"} for _, a in executed)

    calls = frames_of(frames, "tool_call")
    assert [c["seq"] for c in calls] == [0, 1, 2]
    assert [c["arguments"]["metric"] for c in calls] == list(metrics)
    results = frames_of(frames, "tool_result")
    assert all(r["pinnable"] and r["rows_complete"] for r in results)

    shown = _tool_results(requests[-1])
    assert len(shown) == 1 and shown[0]["id"] == "h1", "one call, one result"
    payload = shown[0]["payload"]
    assert payload["set"] == "sales_headline"
    assert [r["metric"] for r in payload["results"]] == list(metrics)
    assert [r["meta"]["call_seq"] for r in payload["results"]] == [0, 1, 2]
    assert all(r["rows"] for r in payload["results"])
    _assert_answered(requests[-1]["messages"])

    done = frames_of(frames, "done")[0]
    assert done["tool_calls"] == 3 and done["executed_calls"] == 3


def test_a_headline_member_already_read_is_served_not_run(monkeypatch):
    frames, _, executed = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES)],
        [_ToolUse("h1", "get_sales", HEADLINE)],
        [_TextBlock(ANSWER)],
    ])
    assert len(executed) == 3, "net_sales was read once"
    assert frames_of(frames, "tool_call")[1]["duplicate_of"] == 0


def test_the_set_is_an_error_only_when_every_read_in_it_is(monkeypatch):
    _frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("h1", "get_sales", {**HEADLINE, "date_range": "refuse"})],
        [_TextBlock(ANSWER)],
    ])
    shown = _tool_results(requests[-1])[0]
    assert shown["is_error"] is False
    assert [bool(r["meta"].get("error")) for r in shown["payload"]["results"]] == [False, False, True]


def test_the_set_is_offered_by_the_definitions_and_still_executes_nothing():
    spec = req(DEFS, "metric_sets.sales_headline")
    assert spec["executes_nothing"] is True
    assert spec["asked_as_one_call"]["tool"] == "get_sales"
    sales = next(t for t in george_loop.build_tool_schemas() if t["name"] == "get_sales")
    assert "sales_headline" in sales["input_schema"]["properties"]["metric"]["enum"]
    # The tool itself has no idea a set exists: no second calculation path.
    from tools.sales import get_sales
    with pytest.raises(ValueError, match="Unknown metric"):
        get_sales(group_by=[], date_range="last_week", metric="sales_headline")


def test_the_broad_policy_names_the_one_call():
    assert "metric='sales_headline'" in george_loop.SCOPE_SECTION


# ---------------------------------------------------------------------------
# (c) Shorter receipts for the model
# ---------------------------------------------------------------------------

def test_a_note_goes_once_and_what_a_figure_is_trusted_by_goes_every_time():
    receipts = ModelReceipts(DEFS)
    notice = {"kind": "k", "message": "x" * 80}
    first = {"rows": [{"value": 1}], "meta": _meta(1, notice=notice)}
    second = {"rows": [{"value": 2}], "meta": _meta(2, notice=notice)}
    before = copy.deepcopy(second)

    a = receipts.copy(first, 0)
    b = receipts.copy(second, 1)
    assert second == before, "the result itself is never changed"
    assert a["meta"]["full_row_count_note"] == NOTE
    assert b["meta"]["full_row_count_note"] == "same as call 0"
    for key in ("source_table", "filters_applied", "window", "snapshot_timestamp", "notice"):
        assert b["meta"][key] == second["meta"][key], key
    assert "definitions_path" not in a["meta"] and "definitions_path" not in b["meta"]
    assert b["rows"] == second["rows"]
    # The same call carrying it again — a result re-copied — is not a pointer to itself.
    assert receipts.copy(first, 0)["meta"]["full_row_count_note"] == NOTE


def test_a_block_that_differs_somewhere_still_sends_its_repeated_parts_once():
    receipts = ModelReceipts(DEFS)
    baseline = {"start": "2026-08-31", "end": "2026-09-07", "convention": "half-open [start, end)"}
    one = {"meta": {"comparison": {"baseline": baseline, "baseline_statuses": {"ok": 7}}}}
    two = {"meta": {"comparison": {"baseline": dict(baseline), "baseline_statuses": {"ok": 1}}}}
    receipts.copy(one, 4)
    shown = receipts.copy(two, 5)["meta"]["comparison"]
    assert shown["baseline"] == "same as call 4"
    assert shown["baseline_statuses"] == {"ok": 1}


def test_the_person_keeps_every_receipt_the_model_is_spared(monkeypatch):
    frames, requests, _ = _drive(monkeypatch, [
        [_ToolUse("r1", "get_sales", SALES),
         _ToolUse("r2", "get_sales", {**SALES, "date_range": "last_month"})],
        [_TextBlock(ANSWER)],
    ])
    results = frames_of(frames, "tool_result")
    assert all(r["meta"]["full_row_count_note"] == NOTE for r in results)
    assert all("definitions_path" in r["meta"] for r in results)
    shown = [r["payload"]["meta"] for r in _tool_results(requests[-1])]
    assert shown[0]["full_row_count_note"] == NOTE
    assert shown[1]["full_row_count_note"] == "same as call 0"
    assert shown[1]["filters_applied"] == FILTERS
