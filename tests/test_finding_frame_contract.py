"""
The finding frame: what the model may say about composition, and what the loop
refuses to let it say.

UI System V2 Stage 3. The model may put ONE of four words on a call that
already ran — primary, driver, breakdown, context — and nothing else reaches
the surface through this channel: no figure, no label, no colour, no component,
no layout, no threshold, no order. Every label is checked against the executed
set and against metrics.yaml before it is emitted, and what fails is dropped
with a reason rather than corrupting the answer.

THREE THINGS UNDER TEST.

  1. The validator, as a pure function over a record of calls. Every check in
     agent/findings.py has a case here that would pass without it.
  2. The loop's wiring: the tool is offered, sits inside the shared prefix, is
     kept OUT of what a pin or a workflow may hold, is never charted, never
     becomes the receipts, and its accepted labels are persisted beside the
     snapshot so a reload composes the answer the way it composed live.
  3. The frame: driven end-to-end with the model and the log both stubbed,
     exactly as test_interim_prose_contract drives the loop.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
pytest.importorskip("yaml")

import yaml                                                            # noqa: E402

from agent import findings                                             # noqa: E402
from agent import loop as george_loop                                  # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _TextBlock, _ToolUse  # noqa: E402
from tests.test_loop_correction_contract import StubLog                # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_DEFS = yaml.safe_load((_ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8"))

# ---------------------------------------------------------------------------
# A record of calls, as the loop keeps it
# ---------------------------------------------------------------------------

WINDOW = {"date_range": "last_week", "filters": {"store": "Rockwell"},
          "compare_to": "previous_period"}


def _call(tool="get_sales", *, error=None, duplicate=False, is_read=True, **args):
    return {"tool": tool, "arguments": {**WINDOW, **args}, "error": error,
            "duplicate": duplicate, "is_read": is_read}


CALLS = {
    1: _call(metric="net_sales", group_by=[]),                       # the primary
    2: _call(metric="transaction_count", group_by=[]),               # a driver
    3: _call(metric="average_transaction_value", group_by=[]),       # a driver
    4: _call(metric="product_revenue", group_by=["product"],
             top_n=8, rank_by="biggest_drop"),                       # a breakdown
    5: _call(metric="net_sales", group_by=["store"]),                # a breakdown by store
    6: _call("get_stock", store="Rockwell"),                         # context at most
    7: _call(metric="net_sales", group_by=[], error="refused"),      # failed
    8: _call(metric="net_sales", group_by=[], duplicate=True),       # a re-read
    9: _call("pin_answer", is_read=False),                           # a write
    10: _call(metric="transaction_count", group_by=[], date_range="last_month"),  # a driver, other window
    11: _call(metric="returns_value", group_by=[]),                  # not a driver
    12: _call(metric="net_sales", group_by=["product"]),             # refused grouping
    13: _call(metric="net_sales", group_by=["day"]),                 # a time bucket
}


def _validate(submitted):
    return findings.validate(submitted, CALLS, _DEFS)


def _roles(accepted):
    return [(a["seq"], a["role"], a["of"]) for a in accepted]


# ---------------------------------------------------------------------------
# 1. The validator
# ---------------------------------------------------------------------------


def test_a_whole_investigation_is_accepted():
    accepted, rejected = _validate([
        {"seq": 1, "role": "primary"},
        {"seq": 2, "role": "driver", "of": 1},
        {"seq": 3, "role": "driver", "of": 1},
        {"seq": 4, "role": "breakdown", "of": 1},
        {"seq": 6, "role": "context"},
    ])
    assert rejected == []
    assert _roles(accepted) == [
        (1, "primary", None), (2, "driver", 1), (3, "driver", 1),
        (4, "breakdown", 1), (6, "context", None),
    ]


def test_the_primary_comes_first_whatever_order_it_was_submitted_in():
    accepted, _ = _validate([{"seq": 2, "role": "driver", "of": 1},
                             {"seq": 1, "role": "primary"}])
    assert [a["role"] for a in accepted] == ["primary", "driver"]


def test_no_findings_is_a_valid_outcome():
    assert _validate([]) == ([], [])
    assert _validate(None) == ([], [])


def test_a_call_that_did_not_run_is_rejected():
    _, rejected = _validate([{"seq": 99, "role": "primary"}])
    assert rejected == [{"seq": 99, "role": "primary", "reason": "call 99 did not run in this turn"}]


def test_a_call_that_failed_is_rejected():
    _, rejected = _validate([{"seq": 7, "role": "primary"}])
    assert "did not succeed" in rejected[0]["reason"]


def test_a_duplicate_read_is_rejected():
    # Its rows are the original's, already on screen.
    _, rejected = _validate([{"seq": 8, "role": "primary"}])
    assert "repeats an earlier call" in rejected[0]["reason"]


def test_a_write_is_rejected():
    _, rejected = _validate([{"seq": 9, "role": "context"}])
    assert "not a trusted read" in rejected[0]["reason"]


def test_two_primaries_keep_the_first_and_refuse_the_second():
    accepted, rejected = _validate([{"seq": 1, "role": "primary"},
                                    {"seq": 5, "role": "primary"}])
    assert _roles(accepted) == [(1, "primary", None)]
    assert "one primary fact" in rejected[0]["reason"]


def test_a_role_outside_the_closed_set_is_rejected():
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 2, "role": "insight"}])
    assert "not a role" in rejected[0]["reason"]


def test_a_driver_without_a_primary_is_rejected():
    _, rejected = _validate([{"seq": 2, "role": "driver", "of": 1}])
    assert "needs a primary fact" in rejected[0]["reason"]


def test_a_driver_must_name_the_primary():
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 2, "role": "driver", "of": 5}])
    assert "must name the primary fact" in rejected[0]["reason"]


def test_a_driver_must_be_declared_in_the_definitions():
    # returns_value is a real metric and is not in metrics.net_sales.drivers.
    # The model does not get to nominate one.
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 11, "role": "driver", "of": 1}])
    assert "not a declared driver of net_sales" in rejected[0]["reason"]


def test_a_driver_read_over_another_window_is_rejected():
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 10, "role": "driver", "of": 1}])
    assert "different window" in rejected[0]["reason"]


def test_a_breakdown_must_group_by_a_subject():
    # A time bucket is the lag series metrics.yaml records as not built.
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 13, "role": "breakdown", "of": 1}])
    assert "not grouped by a subject" in rejected[0]["reason"]


def test_a_breakdown_the_definitions_refuse_is_refused_here_too():
    # net_sales is transaction grain; valid_group_by has no `product`.
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 12, "role": "breakdown", "of": 1}])
    assert "may not be broken down by product" in rejected[0]["reason"]


def test_a_breakdown_by_store_of_the_same_metric_is_accepted():
    accepted, rejected = _validate([{"seq": 1, "role": "primary"},
                                    {"seq": 5, "role": "breakdown", "of": 1}])
    assert rejected == []
    assert _roles(accepted)[1] == (5, "breakdown", 1)


def test_a_call_may_hold_one_role():
    _, rejected = _validate([{"seq": 1, "role": "primary"},
                             {"seq": 1, "role": "context"}])
    assert "already the primary fact" in rejected[0]["reason"]


def test_a_non_metric_read_can_be_context_and_nothing_more():
    accepted, rejected = _validate([{"seq": 1, "role": "primary"},
                                    {"seq": 6, "role": "context"},
                                    {"seq": 6, "role": "driver", "of": 1}])
    assert _roles(accepted) == [(1, "primary", None), (6, "context", None)]
    assert "already has a role" in rejected[0]["reason"]


def test_garbage_is_rejected_not_raised():
    accepted, rejected = _validate(["primary", 42, {"role": "primary"}])
    assert accepted == []
    assert len(rejected) == 3


def test_the_role_vocabulary_is_the_ladder_s():
    assert findings.roles_for(_DEFS) == ("primary", "driver", "breakdown", "context")
    with pytest.raises(ValueError):
        findings.roles_for({"investigation": {"ladder": {"verify": {}}}})


def test_the_tool_result_names_no_source():
    # The loop keeps the last meta that names a source_table as the receipts.
    # A label read nothing and must never become the figures' provenance.
    out = findings.record_findings([{"seq": 1, "role": "primary"}], calls=CALLS, defs=_DEFS)
    assert "source_table" not in out["meta"]
    assert out["rows"] == [{"seq": 1, "role": "primary", "of": None, "tool": "get_sales",
                            "identity": "net_sales = transaction_count x average_transaction_value"}]


def test_the_identity_on_a_primary_is_the_definitions_and_only_for_a_metric_with_drivers():
    # The Driver Split prints it. It comes from metrics.yaml, never the model.
    accepted, _ = _validate([{"seq": 6, "role": "primary"}])        # get_stock
    assert accepted[0]["identity"] is None
    accepted, _ = _validate([{"seq": 11, "role": "primary"}])       # returns_value: no drivers
    assert accepted[0]["identity"] is None
    accepted, _ = _validate([{"seq": 1, "role": "primary"}])
    assert accepted[0]["identity"] == _DEFS["metrics"]["net_sales"]["drivers"]["identity"]


# ---------------------------------------------------------------------------
# 2. The loop's wiring
# ---------------------------------------------------------------------------


def test_the_tool_is_offered_to_every_session():
    names = [t["name"] for t in george_loop.build_tool_schemas()]
    assert george_loop.FINDING_TOOL in names


def test_the_tool_sits_inside_the_shared_prefix():
    # After every read, before anything injected — so a session with a pin
    # writer and one without share a byte-identical prefix up to the tail.
    bare = [t["name"] for t in george_loop.build_tool_schemas()]
    full = [t["name"] for t in george_loop.build_tool_schemas(include_write=True)]
    assert full[: len(bare)] == bare
    # Reads sorted, then the label tools sorted (two since 2026-09-10: the
    # roles and the composition). Both read nothing and both are offered to
    # every session, so both sit inside the shared prefix.
    reads = sorted(george_loop.TOOL_FUNCTIONS)
    assert bare == reads + sorted(george_loop.FINDING_TOOL_FUNCTIONS)
    assert george_loop.FINDING_TOOL in bare and george_loop.COMPOSE_TOOL in bare


def test_a_pin_and_a_workflow_can_never_hold_a_label():
    assert george_loop.FINDING_TOOL not in george_loop.TOOL_FUNCTIONS
    from app.services.pin_runner import PinValidationError, validate_call
    with pytest.raises(PinValidationError):
        validate_call({"tool": george_loop.FINDING_TOOL, "arguments": {"findings": []}})


def test_the_schema_has_no_field_for_anything_but_a_seq_and_a_role():
    schema = next(t for t in george_loop.build_tool_schemas()
                  if t["name"] == george_loop.FINDING_TOOL)
    items = schema["input_schema"]["properties"]["findings"]["items"]
    assert set(items["properties"]) == {"seq", "role", "of"}
    assert items["additionalProperties"] is False
    assert items["properties"]["role"]["enum"] == list(findings.ROLES)


def test_the_prompt_asks_for_the_roles_and_says_what_they_cannot_do():
    section = george_loop.INVESTIGATING_SECTION
    assert "record_findings" in section
    assert "meta.call_seq" in section
    assert "cannot compute, order or colour" in section


# ---------------------------------------------------------------------------
# 3. The frame, end to end
# ---------------------------------------------------------------------------

SALES = {"group_by": [], "date_range": "last_week", "metric": "net_sales",
         "compare_to": "previous_period", "filters": {"store": "Rockwell"}}
TX = {**SALES, "metric": "transaction_count"}


def _frames_of(frames, event):
    out = []
    for f in frames:
        head, _, body = f.partition("\n")
        if head == f"event: {event}":
            out.append(json.loads(body.removeprefix("data: ")))
    return out


def _drive(monkeypatch, replies):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0, "baseline": 2.0, "change_pct": -50.0,
                           "direction": "down", "baseline_status": "ok"}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00",
                          "row_count": 1}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("why is Rockwell down?")]

    return asyncio.run(collect()), fake


def test_the_model_is_shown_each_call_s_seq(monkeypatch):
    _, fake = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    # By type, not by position: the fake keeps the loop's own message list,
    # which goes on growing past the tool result once the answer is appended.
    blocks = [c for m in fake.messages.requests[1]["messages"]
              if m["role"] == "user" and isinstance(m["content"], list)
              for c in m["content"] if isinstance(c, dict) and c.get("type") == "tool_result"]
    assert json.loads(blocks[0]["content"])["meta"]["call_seq"] == 0


def test_accepted_roles_become_a_frame_and_are_persisted(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES), _ToolUse("tu-2", "get_sales", TX)],
        [_ToolUse("tu-3", george_loop.FINDING_TOOL,
                  {"findings": [{"seq": 0, "role": "primary"},
                                {"seq": 1, "role": "driver", "of": 0}]})],
        [_TextBlock("Rockwell fell against the week before; transactions fell too.")],
    ])
    (frame,) = _frames_of(frames, "finding")
    assert [(f["seq"], f["role"], f["of"]) for f in frame["findings"]] == [
        (0, "primary", None), (1, "driver", 0),
    ]
    assert frame["rejected"] == []

    # Persisted beside the snapshot, and only the validated list.
    log = StubLog.instances[0]
    answer_sql = [p for sql, p in log.statements if "'answer','george'" in sql]
    assert answer_sql, "no answer post was written"
    payload = json.loads(answer_sql[0][5])
    assert payload["findings"] == frame["findings"]


def test_a_rejected_role_is_named_and_the_rest_stand(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.FINDING_TOOL,
                  {"findings": [{"seq": 0, "role": "primary"},
                                {"seq": 42, "role": "driver", "of": 0}]})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    (frame,) = _frames_of(frames, "finding")
    assert [f["role"] for f in frame["findings"]] == ["primary"]
    assert frame["rejected"][0]["seq"] == 42
    warnings = _frames_of(frames, "warning")
    assert any(w.get("reason") == "findings_rejected" and "call 42" in w.get("detail", "")
               for w in warnings)


def test_a_label_is_never_charted_never_pinnable_and_never_the_receipts(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.FINDING_TOOL,
                  {"findings": [{"seq": 0, "role": "primary"}]})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    results = _frames_of(frames, "tool_result")
    label = next(r for r in results if r["tool"] == george_loop.FINDING_TOOL)
    assert label["rows"] == [] and label["rows_complete"] is False
    assert label["pinnable"] is False
    # The receipts are the read's, not the label's.
    (receipts,) = _frames_of(frames, "receipts")
    assert receipts["source_table"] == "new_transactions"
    # And the label is not among the calls a pin may replay.
    log = StubLog.instances[0]
    answer_sql = [p for sql, p in log.statements if "'answer','george'" in sql]
    payload = json.loads(answer_sql[0][5])
    assert [c["tool"] for c in payload["calls"]] == ["get_sales"]
    assert [c["tool"] for c in payload["charted"]] == ["get_sales"]


def test_a_later_recording_replaces_an_earlier_one(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.FINDING_TOOL,
                  {"findings": [{"seq": 0, "role": "context"}]})],
        [_ToolUse("tu-3", george_loop.FINDING_TOOL,
                  {"findings": [{"seq": 0, "role": "primary"}]})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    first, second = _frames_of(frames, "finding")
    assert [f["role"] for f in first["findings"]] == ["context"]
    assert [f["role"] for f in second["findings"]] == ["primary"]
    log = StubLog.instances[0]
    payload = json.loads([p for sql, p in log.statements if "'answer','george'" in sql][0][5])
    assert [f["role"] for f in payload["findings"]] == ["primary"]


def test_no_recording_means_no_frame_and_no_payload_key(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    assert _frames_of(frames, "finding") == []
    log = StubLog.instances[0]
    payload = json.loads([p for sql, p in log.statements if "'answer','george'" in sql][0][5])
    assert "findings" not in payload
