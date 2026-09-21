"""
Pure tests for view_page: how Bob reads the page he is on.

NO DATABASE, NO API. The reader is a fake handed in the way the web process
hands in the real one; the model is a stub. What is under test is the tool's
own contract and the loop's handling of it:

  1. It is INJECTED and NAMELESS. Present in the schema only when a reader
     was injected; no argument for a user or a page; it sorts after every
     other tool so a session without a page keeps a cached prefix that is a
     prefix of a session with one.
  2. It can never be PINNED and a pin can never CONTAIN it — by construction:
     it is not in TOOL_FUNCTIONS, the pin runner refuses it, and reading a
     page adds nothing to the executed set.
  3. It is COMPACT and HONEST. Rows carry no stored arguments (evidence does),
     rows are capped per result, per read and by size, every state a pin can
     be in survives as structure, and the two caveats a read can raise —
     partial, truncated — are notices with fingerprints the loop enforces.
  4. The LOOP treats it as evidence, not as a figure: a page_context frame,
     never charted, never a stored call, never the answer's receipts, and the
     compact evidence rides on the answer post.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import composite_tools, loop as bob_loop, write_tools          # noqa: E402
from agent.composite_tools import (                                           # noqa: E402
    MAX_PAGE_CONTEXT_BYTES,
    MAX_ROWS_PER_PAGE_READ,
    MAX_ROWS_PER_PAGE_RESULT,
    PAGE_CONTEXT_TOOL,
    PageContextUnavailable,
    view_page,
)
from agent.write_tools import PageReadRefused, PinRefused, WriteContext, call_key  # noqa: E402
from app.services import page_reader as service                                # noqa: E402
from app.services.pin_runner import PinValidationError, validate_call          # noqa: E402
from tools._common import load_defs                                            # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse          # noqa: E402
from tests.test_loop_correction_contract import (                              # noqa: E402
    StubLog,
    _TextBlock,
    frames_of,
)


def _run(coro):
    return asyncio.run(coro)


SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
STOCK = {"tool": "get_stock", "arguments": {"location": "AJI BARN"}}

META = {
    "source_table": "new_transactions",
    "filters_applied": ["is_cancelled = false   # metrics.yaml: filters.cancelled"],
    "snapshot_timestamp": "2026-09-07T01:00:00+00:00",
    "row_count": 3,
    "metric_unit": "PHP",
}


def _result(tool="get_sales", status="ok", rows=None, error=None, notices=None, **meta):
    rows = [{"store": f"S{i}", "value": 100.0 + i} for i in range(3)] if rows is None else rows
    out = {
        "tool": tool, "arguments": {}, "status": status, "duration_ms": 4,
        "rows": rows if status == "ok" else [],
        "meta": {**META, "row_count": len(rows), **meta} if status == "ok" else {},
        "notices": notices or [],
    }
    if error:
        out["error"] = error
    return out


def _pin(i, read="ok", results=None, calls=(SALES,), reason=None, notices=None):
    entry = {
        "pin_id": f"00000000-0000-0000-0000-00000000000{i}",
        "title": f"Pin {i}",
        "question": f"Question {i}?",
        "page": "AJI BARN Reorder",
        "pinned_at": f"2026-09-0{i}T00:00:00+00:00",
        "calls": [dict(c) for c in calls],
        "last_run_at": None, "last_ok_at": None, "last_status": None,
        "read": read,
        "results": [] if results is None else results,
        "notices": notices or [],
    }
    if read == "not_read":
        entry["not_read_reason"] = reason
    return entry


def _read(pins, remainder=(), unavailable=(), figures=True, requested=None, total=None):
    """What the backend reader returns, in its own shape."""
    return {
        "owner": "ice",
        "page_id": "00000000-0000-0000-0000-00000000aa11",
        "page": "AJI BARN Reorder",
        "purpose": None,
        "page_updated_at": "2026-09-07T01:00:00+00:00",
        "empty": False,
        "read_at": "2026-09-07T02:00:00+00:00",
        "figures": figures,
        "requested": requested,
        "pins_total": total if total is not None else len(pins) + len(remainder),
        "pins_limit": 5 if requested is None else 8,
        "pins": list(pins),
        "remainder": list(remainder),
        "unavailable": list(unavailable),
        "deadline_s": 60.0,
    }


class FakeReader:
    """
    Stands in for the reader the web process injects. Records what it was
    asked. `read` may be one result or a list of results served in order.
    """

    def __init__(self, read=None, raises=None) -> None:
        self.reads = list(read) if isinstance(read, list) else [read]
        self.raises = raises
        self.calls: list[tuple] = []

    async def __call__(self, pins, figures):
        self.calls.append((pins, figures))
        if self.raises:
            raise self.raises
        return self.reads.pop(0) if len(self.reads) > 1 else self.reads[0]


def _ctx(reader=None, **kw) -> WriteContext:
    return WriteContext(page_reader=reader, **kw)


def _pins_ok(n):
    return [_pin(i, results=[_result()]) for i in range(1, n + 1)]


# ---------------------------------------------------------------------------
# 1. Injected and nameless
# ---------------------------------------------------------------------------

def test_the_tool_is_absent_without_a_reader_and_present_with_one():
    assert PAGE_CONTEXT_TOOL not in bob_loop.injected_surface(_ctx())
    assert PAGE_CONTEXT_TOOL in bob_loop.injected_surface(_ctx(FakeReader()))


def test_the_tool_has_no_user_and_no_page_argument():
    [schema] = [s for s in bob_loop.build_tool_schemas(include_write=True)
                if s["name"] == PAGE_CONTEXT_TOOL]
    props = schema["input_schema"]["properties"]
    assert set(props) == {"figures", "pins"}
    assert props["figures"]["type"] == "boolean"
    assert props["pins"] == {"type": "array", "items": {"type": "string"},
                             "description": props["pins"]["description"]}
    assert schema["input_schema"]["required"] == []
    for word in ("user", "page_name", "name", "owner"):
        assert word not in props


def test_the_tool_sorts_after_every_other_tool():
    """
    So a session without a page has a tools list that is an exact PREFIX of a
    session with one, and the cached prefix is shared up to the tail.
    """
    names = [s["name"] for s in bob_loop.build_tool_schemas(include_write=True)]
    assert names[-1] == PAGE_CONTEXT_TOOL
    without = [s["name"] for s in bob_loop.build_tool_schemas(
        extra={k: v for k, v in write_tools.WRITE_TOOL_FUNCTIONS.items()}
        | {"run_workflow": composite_tools.run_workflow}
    )]
    assert names[: len(without)] == without


def test_the_capability_registries_agree():
    assert composite_tools.COMPOSITE_TOOL_REQUIRES[PAGE_CONTEXT_TOOL] == "page_reader"
    assert set(composite_tools.COMPOSITE_TOOL_REQUIRES) == set(composite_tools.COMPOSITE_TOOL_FUNCTIONS)


def test_without_a_reader_the_call_is_a_failed_tool_not_a_crash():
    with pytest.raises(PageContextUnavailable):
        _run(view_page(ctx=_ctx()))
    assert issubclass(PageContextUnavailable, RuntimeError)


def test_the_readers_refusal_reaches_the_model_intact():
    reader = FakeReader(raises=PageReadRefused("You have no page called 'Nowhere'."))
    result, err, _ = _run(bob_loop._call_composite_tool(PAGE_CONTEXT_TOOL, {}, _ctx(reader)))
    assert err == "You have no page called 'Nowhere'."
    assert result == {"rows": [], "meta": {"error": err}}


def test_the_arguments_reach_the_reader_as_given_and_nothing_else():
    reader = FakeReader(_read(_pins_ok(1)))
    _run(view_page(figures=False, pins=["a", "b"], ctx=_ctx(reader)))
    assert reader.calls == [(["a", "b"], False)]


# ---------------------------------------------------------------------------
# 2. Never pinnable, never pinned
# ---------------------------------------------------------------------------

def test_a_page_read_is_not_a_read_tool():
    assert PAGE_CONTEXT_TOOL not in bob_loop.TOOL_FUNCTIONS
    assert PAGE_CONTEXT_TOOL not in [s["name"] for s in bob_loop.build_tool_schemas()]


def test_a_pin_cannot_contain_a_page_read():
    """The pin runner validates stored calls against the read surface."""
    with pytest.raises(PinValidationError):
        validate_call({"tool": PAGE_CONTEXT_TOOL, "arguments": {}})


def test_a_page_read_cannot_be_pinned():
    """
    Even a model that puts the call in pin_answer gets a refusal: reading a
    page never enters the executed set, so the provenance rule stops it before
    the writer — and the writer would refuse it anyway (validate_calls).
    """
    async def writer(spec):
        raise AssertionError("never reached")

    ctx = WriteContext(writer=writer)
    with pytest.raises(PinRefused) as exc:
        _run(write_tools.pin_answer(
            [{"tool": PAGE_CONTEXT_TOOL, "arguments": {}}], "The page", ctx=ctx,
        ))
    assert "have not run" in str(exc.value)


# ---------------------------------------------------------------------------
# 3. Compact and honest
# ---------------------------------------------------------------------------

def test_rows_carry_no_stored_arguments_and_evidence_does():
    reader = FakeReader(_read([_pin(1, results=[_result()], calls=(SALES, STOCK))]))
    out = _run(view_page(ctx=_ctx(reader)))
    [row] = out["rows"]
    assert "calls" not in row and "arguments" not in row
    assert "arguments" not in row["results"][0]
    assert row["pin_id"] and row["title"] == "Pin 1" and row["question"] == "Question 1?"
    assert row["pinned_at"] and row["read"] == "ok"
    assert row["results"][0]["receipts"]["source_table"] == "new_transactions"
    assert row["results"][0]["receipts"]["snapshot_timestamp"] == META["snapshot_timestamp"]
    # The one place the arguments live.
    [ev] = out["meta"]["evidence"]["pins"]
    assert ev["calls"] == [SALES, STOCK]
    assert ev["status"] == "ok" and ev["snapshot_timestamp"] == META["snapshot_timestamp"]


def test_the_result_is_rows_and_meta_with_the_receipts_every_tool_carries():
    out = _run(view_page(ctx=_ctx(FakeReader(_read(_pins_ok(2))))))
    meta = out["meta"]
    assert meta["source_table"].startswith("george.pins")
    assert any("created_by = ice" in f for f in meta["filters_applied"])
    assert any("page_id = 00000000-0000-0000-0000-00000000aa11" in f
               for f in meta["filters_applied"])
    assert meta["snapshot_timestamp"] == "2026-09-07T02:00:00+00:00"
    assert meta["row_count"] == 2
    assert meta["pins_total"] == 2 and meta["pins_inspected"] == 2 and meta["pins_reproduced"] == 2
    assert "notice" not in meta
    assert not meta["partial"] and not meta["truncated"]


def test_rows_per_result_are_capped_with_a_note():
    big = _result(rows=[{"store": f"S{i}", "value": float(i)} for i in range(40)])
    out = _run(view_page(ctx=_ctx(FakeReader(_read([_pin(1, results=[big])])))))
    r = out["rows"][0]["results"][0]
    assert len(r["rows"]) == MAX_ROWS_PER_PAGE_RESULT == 15
    assert r["rows_omitted"] == 25 and r["row_count"] == 40
    assert "do not total" in r["truncation_note"]
    assert out["meta"]["truncated"] and out["meta"]["rows_omitted"] == 25
    assert out["meta"]["notice"]["kind"] == "page_context_truncated"


def test_rows_per_read_are_capped_across_pins_in_page_order():
    pins = [_pin(i, results=[_result(rows=[{"v": j} for j in range(15)]) for _ in range(2)])
            for i in range(1, 9)]
    out = _run(view_page(pins=[p["pin_id"] for p in pins],
                         ctx=_ctx(FakeReader(_read(pins, requested=[p["pin_id"] for p in pins])))))
    shown = sum(len(r["rows"]) for row in out["rows"] for r in row["results"])
    assert shown == MAX_ROWS_PER_PAGE_READ == 200
    # The first pins got their allowance; the last got none and says so.
    assert len(out["rows"][0]["results"][0]["rows"]) == 15
    last = out["rows"][-1]["results"][-1]
    assert last["rows"] == [] and last["rows_omitted"] == 15


def test_the_serialized_rows_are_capped_by_size_from_the_last_pin_first():
    wide = [{"sku": "X" * 900, "value": float(i)} for i in range(15)]   # ~70 KB in all
    pins = [_pin(i, results=[_result(rows=list(wide))]) for i in range(1, 6)]
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins)))))
    assert len(json.dumps(out["rows"], default=str)) <= MAX_PAGE_CONTEXT_BYTES
    # Dropped from the end: the first pin keeps its rows, a later one lost them
    # and still stands as a pin with its receipts.
    assert out["rows"][0]["results"][0]["rows"]
    dropped = [r for row in out["rows"] for r in row["results"] if not r["rows"]]
    assert dropped and all("size limit" in r["truncation_note"] for r in dropped)
    assert all(r["receipts"]["source_table"] for r in dropped)
    assert out["meta"]["evidence"]["rows_dropped"] > 0
    assert out["meta"]["notice"]["kind"] == "page_context_truncated"


def test_every_state_survives_as_structure():
    pins = [
        _pin(1, results=[_result()]),                                            # available
        _pin(2, results=[_result(rows=[])]),                                     # empty
        _pin(3, read="refused", results=[_result(status="refused", error="not configured")]),
        _pin(4, read="failed", results=[_result(status="failed", error="Timed out")]),
        _pin(5, read="unrunnable", results=[_result(status="unrunnable", error="gone")]),
        _pin(6, read="not_read", reason=service.NOT_READ_DEADLINE),              # deadline
    ]
    remainder = [_pin(7), _pin(8)]                                               # bound
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins, remainder=remainder)))))
    rows = out["rows"]
    assert [r["read"] for r in rows] == ["ok", "ok", "refused", "failed", "unrunnable", "not_read"]
    assert "empty" not in rows[0]["results"][0]
    assert rows[1]["results"][0]["empty"] is True and rows[1]["results"][0]["rows"] == []
    assert rows[2]["results"][0]["error"] == "not configured"
    assert rows[3]["results"][0]["error"] == "Timed out"
    assert rows[4]["results"][0]["error"] == "gone"
    assert rows[5]["not_read_reason"] == "deadline" and rows[5]["results"] == []
    meta = out["meta"]
    assert meta["pins_not_read"] == [{"pin_id": pins[5]["pin_id"], "title": "Pin 6", "reason": "deadline"}]
    assert [r["title"] for r in meta["remainder"]] == ["Pin 7", "Pin 8"]
    assert meta["calls"] == {"ok": 2, "refused": 1, "failed": 1, "unrunnable": 1, "not_read": 1}
    ev = meta["evidence"]
    assert [p["status"] for p in ev["pins"]] == ["ok", "ok", "refused", "failed", "unrunnable", "not_read"]
    assert ev["pins"][5]["reason"] == "deadline"
    assert [p["title"] for p in ev["not_inspected"]] == ["Pin 7", "Pin 8"]
    assert ev["partial"] and ev["truncated"]
    assert ev["pins_inspected"] == 6 and ev["pins_reproduced"] == 2 and ev["pins_total"] == 8


def test_partial_names_every_pin_that_did_not_come_back():
    pins = [_pin(1, results=[_result()]),
            _pin(2, read="refused", results=[_result(status="refused", error="thresholds unset")]),
            _pin(3, read="not_read", reason=service.NOT_READ_DEADLINE)]
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins, unavailable=["zzz"])))))
    notice = out["meta"]["notice"]
    assert notice["kind"] == "page_context_partial"
    assert "2 of 3 inspected pins" in notice["message"]
    assert "'Pin 2' (refused: thresholds unset)" in notice["message"]
    assert "'Pin 3' (the page read's time limit passed" in notice["message"]
    assert "1 requested pin id(s) are not on this page: zzz" in notice["message"]
    assert out["meta"]["unavailable_pin_ids"] == ["zzz"]


def test_definitions_only_is_not_partial():
    pins = [_pin(i, read="not_read", reason=service.NOT_READ_FIGURES_OFF) for i in range(1, 4)]
    out = _run(view_page(figures=False, ctx=_ctx(FakeReader(_read(pins, figures=False)))))
    assert not out["meta"]["partial"]
    assert "notice" not in out["meta"]
    assert all(r["not_read_reason"] == "figures_not_requested" for r in out["rows"])
    assert out["meta"]["calls"]["not_read"] == 3


def test_truncated_says_what_was_not_inspected_and_how_to_get_it():
    pins = _pins_ok(5)
    remainder = [_pin(i) for i in range(6, 9)]
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins, remainder=remainder)))))
    notice = out["meta"]["notice"]
    assert notice["kind"] == "page_context_truncated"
    # WHAT was not inspected is the reader's caveat and stays in `message`.
    assert "This page has 8 pins; 5 were read (the newest)" in notice["message"]
    assert "'Pin 6', 'Pin 7', 'Pin 8'" in notice["message"]
    # HOW to fetch them is an instruction to the model and moved to `guidance`
    # on 2026-09-08 (metrics.yaml notices.contract): `message` is rendered above
    # the figure, and a reader was being shown directions addressed to somebody
    # else, naming a field they have never heard of.
    assert "meta.remainder" not in notice["message"]
    assert "meta.remainder" in notice["guidance"]
    assert [r["pin_id"] for r in out["meta"]["remainder"]] == [p["pin_id"] for p in remainder]


def test_a_replayed_notice_is_carried_and_names_its_pin():
    low = {"kind": "low_stock_not_operational", "message": "thresholds not set", "source": "get_stock"}
    pins = [_pin(1, results=[_result(tool="get_stock", notices=[low])], notices=[low])]
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins)))))
    notice = out["meta"]["notice"]
    assert notice["kind"] == "low_stock_not_operational" and notice["pin"] == "Pin 1"
    assert out["meta"]["evidence"]["pins"][0]["notice_kinds"] == ["low_stock_not_operational"]
    assert out["meta"]["evidence"]["notice_kinds"] == ["low_stock_not_operational"]


def test_several_notices_become_the_container_the_loop_expands():
    pins = [_pin(1, read="refused", results=[_result(status="refused", error="x")])]
    out = _run(view_page(ctx=_ctx(FakeReader(_read(pins, remainder=[_pin(2)])))))
    notice = out["meta"]["notice"]
    assert notice["kind"] == "multiple"
    assert [n["kind"] for n in notice["items"]] == ["page_context_partial", "page_context_truncated"]
    assert [n["kind"] for n in bob_loop._notices_from(out)] == [
        "page_context_partial", "page_context_truncated",
    ]


def test_the_reasons_are_the_readers_reasons():
    assert composite_tools.NOT_READ_DEADLINE == service.NOT_READ_DEADLINE
    assert composite_tools.NOT_READ_FIGURES_OFF == service.NOT_READ_FIGURES_OFF


# ---------------------------------------------------------------------------
# Fingerprints: the two caveats are enforced, not merely emitted
# ---------------------------------------------------------------------------

def test_page_context_partial_is_the_model_s_to_obey_not_to_recite():
    """
    `page_context_partial` still reaches the MODEL, and is no longer forced into the answer.

    It said the page he was given was not the whole page — which is a fact
    about his own reading, not a warning that a figure on screen may be
    wrong. `surface.desk.notices` classifies it `explains_only`, so UI rule
    4 never drew it, and until P14 (2026-09-21) `must_convey` required it
    in his prose anyway and appended it verbatim when he left it out.

    The notice itself is unchanged: it rides the tool result with its
    `guidance`, so he still knows not to answer as though he had the whole
    page. Only the demand on his words is gone.
    """
    from agent import loop as bob_loop
    from tools._common import load_defs, req

    defs = load_defs()
    assert "page_context_partial" in (req(defs, "surface.desk.notices").get("explains_only") or [])
    # It keeps its fingerprint, so a turn that DOES state it is recognised.
    assert req(defs, "notices.page_context_partial.must_convey")
    assert not bob_loop._unsurfaced([{"kind": "page_context_partial"}], "The shops held.", defs)

def test_page_context_truncated_is_the_model_s_to_obey_not_to_recite():
    """
    `page_context_truncated` still reaches the MODEL, and is no longer forced into the answer.

    It said the page he was given was not the whole page — which is a fact
    about his own reading, not a warning that a figure on screen may be
    wrong. `surface.desk.notices` classifies it `explains_only`, so UI rule
    4 never drew it, and until P14 (2026-09-21) `must_convey` required it
    in his prose anyway and appended it verbatim when he left it out.

    The notice itself is unchanged: it rides the tool result with its
    `guidance`, so he still knows not to answer as though he had the whole
    page. Only the demand on his words is gone.
    """
    from agent import loop as bob_loop
    from tools._common import load_defs, req

    defs = load_defs()
    assert "page_context_truncated" in (req(defs, "surface.desk.notices").get("explains_only") or [])
    # It keeps its fingerprint, so a turn that DOES state it is recognised.
    assert req(defs, "notices.page_context_truncated.must_convey")
    assert not bob_loop._unsurfaced([{"kind": "page_context_truncated"}], "The shops held.", defs)

def _drive(monkeypatch, replies, captured, *, reader, page_scope=None, page_context=None):
    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"store": "Fame", "value": 1.0}], "meta": {**META, "row_count": 1}},
                None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    def capture(self, **kw):
        captured.append(kw)

    monkeypatch.setattr(StubLog, "posts", capture)

    async def collect():
        return [f async for f in bob_loop.run(
            "what's on here?", page_reader=reader, page_scope=page_scope,
            page_context=page_context,
        )]

    return asyncio.run(collect()), fake.messages.requests


def test_the_preamble_names_the_page_as_readable_and_unread(monkeypatch):
    captured: list = []
    _, requests = _drive(monkeypatch, [[_TextBlock("Hi.")]], captured,
                         reader=FakeReader(), page_scope={"name": "AJI BARN Reorder"},
                         page_context="Pages / AJI BARN Reorder")
    # The question as asked, which is the LAST user message of the first
    # request — an effort marker may sit in front of it (P1.h) and the list is
    # the loop's own and grows after.
    opening = [m for m in requests[0]["messages"]
               if m["role"] == "user"][-1]["content"]
    assert "their page 'AJI BARN Reorder'" in opening
    assert "You have not read it yet" in opening
    assert PAGE_CONTEXT_TOOL in opening
    # The scope sentence replaces the legacy one; the name came from the
    # scope, not from the display string.
    assert "[The user is on the Pages / " not in opening
    assert "what's on here?" in opening


def test_the_ungrouped_scope_is_said_as_such_and_never_as_a_name():
    sentence = bob_loop._page_sentence(None, {"name": None}, True)
    assert "ungrouped pins" in sentence and "'Ungrouped'" not in sentence


def test_a_scope_without_a_reader_falls_back_to_the_legacy_sentence():
    assert bob_loop._page_sentence("Pages / X", {"name": "X"}, False) == \
        "[The user is on the Pages / X page.]"


def test_legacy_page_context_callers_get_the_sentence_they_always_had():
    assert bob_loop._page_sentence("warehouse", None, False) == \
        "[The user is on the warehouse page.]"
    assert bob_loop._page_sentence(None, None, False) is None


def test_a_page_read_is_a_frame_and_evidence_never_a_figure(monkeypatch):
    captured: list = []
    reader = FakeReader(_read(_pins_ok(2), remainder=[_pin(3)]))
    replies = [
        [_ToolUse("t1", PAGE_CONTEXT_TOOL, {}), _ToolUse("t2", "get_sales", SALES["arguments"])],
        [_TextBlock("Two pins reproduced; one of the three pins is not inspected here.")],
    ]
    frames, _ = _drive(monkeypatch, replies, captured, reader=reader,
                       page_scope={"name": "AJI BARN Reorder"})

    # The frame, in the shape the UI draws.
    [ctx] = frames_of(frames, "page_context")
    assert ctx["page"] == "AJI BARN Reorder"
    assert ctx["pins_inspected"] == 2 and ctx["pins_total"] == 3
    assert [p["title"] for p in ctx["not_inspected"]] == ["Pin 3"]
    assert ctx["truncated"] and not ctx["partial"]

    # Its tool_result is not a figure: no rows, no meta, not pinnable.
    results = {r["tool"]: r for r in frames_of(frames, "tool_result")}
    page = results[PAGE_CONTEXT_TOOL]
    assert page["rows"] == [] and page["rows_complete"] is False
    assert page["meta"] is None and page["pinnable"] is False
    assert page["row_count"] == 2
    sales = results["get_sales"]
    assert sales["rows_complete"] is True and sales["pinnable"] is True

    # The receipts are the sales call's, never the page read's.
    [receipts] = frames_of(frames, "receipts")
    assert receipts["source_table"] == "new_transactions"

    # The post carries the sales snapshot and call, and the page evidence —
    # never a charted page read, never a page read as a call.
    [post] = captured
    assert [c["tool"] for c in post["charted"]] == ["get_sales"]
    assert [c["tool"] for c in post["calls"]] == ["get_sales"]
    assert post["page_context"]["pins_inspected"] == 2
    payload = json.loads(bob_loop._answer_payload(post["charted"], post["calls"],
                                                     post["page_context"]))
    assert set(payload) == {"charted", "calls", "page_context"}
    assert payload["page_context"]["page"] == "AJI BARN Reorder"

    # The notice went out as a frame, like every other.
    assert [n["kind"] for n in frames_of(frames, "notice")] == ["page_context_truncated"]


def test_a_page_read_adds_nothing_to_the_executed_set(monkeypatch):
    captured: list = []
    reader = FakeReader(_read(_pins_ok(1)))
    seen: dict = {}

    async def fake_write(name, args, ctx):
        seen["executed"] = dict(ctx.executed)
        return ({"rows": [], "meta": {"error": "no"}}, "no", 1)

    monkeypatch.setattr(bob_loop, "_call_write_tool", fake_write)
    replies = [
        [_ToolUse("t1", PAGE_CONTEXT_TOOL, {}),
         _ToolUse("t2", "pin_answer", {"tool_calls": [SALES], "title": "x"})],
        [_TextBlock("Nothing was pinned; the pin could not be made.")],
    ]

    async def writer(spec):
        raise AssertionError("never reached")

    fake = FakeClient(replies)
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run(
            "pin it", page_reader=reader, page_scope={"name": "P"}, pin_writer=writer,
        )]

    asyncio.run(collect())
    assert seen["executed"] == {}
    assert call_key(SALES["tool"], SALES["arguments"]) not in seen["executed"]


def test_two_reads_in_one_turn_are_one_record_of_what_was_considered(monkeypatch):
    captured: list = []
    first = _read(_pins_ok(5), remainder=[_pin(6), _pin(7)], total=7)
    ids = [p["pin_id"] for p in first["remainder"]]
    second = _read([_pin(6, results=[_result()]), _pin(7, read="refused",
                                                        results=[_result(status="refused", error="x")])],
                   remainder=_pins_ok(5), requested=ids, total=7)
    reader = FakeReader([first, second])
    replies = [
        [_ToolUse("t1", PAGE_CONTEXT_TOOL, {})],
        [_ToolUse("t2", PAGE_CONTEXT_TOOL, {"pins": ids})],
        [_TextBlock("All seven pins read; one pin could not be reproduced.")],
    ]
    frames, _ = _drive(monkeypatch, replies, captured, reader=reader, page_scope={"name": "P"})
    ctxs = frames_of(frames, "page_context")
    assert len(ctxs) == 2
    assert ctxs[0]["pins_inspected"] == 5 and ctxs[1]["pins_inspected"] == 7
    assert ctxs[1]["pins_reproduced"] == 6
    assert ctxs[1]["not_inspected"] == [] and ctxs[1]["truncated"] is False
    assert ctxs[1]["partial"] is True and ctxs[1]["reads"] == 2
    [post] = captured
    assert post["page_context"]["pins_inspected"] == 7


def test_merging_evidence_unions_pins_and_keeps_the_later_status():
    a = {"pins": [{"pin_id": "1", "status": "ok"}, {"pin_id": "2", "status": "refused"}],
         "not_inspected": [{"pin_id": "3"}], "partial": True, "truncated": True,
         "notice_kinds": ["page_context_partial"], "unavailable": []}
    b = {"pins": [{"pin_id": "2", "status": "ok"}, {"pin_id": "3", "status": "ok"}],
         "not_inspected": [{"pin_id": "1"}], "partial": False, "truncated": True,
         "notice_kinds": ["page_context_truncated"], "unavailable": ["zzz"]}
    m = bob_loop.merge_page_evidence(a, b)
    assert {p["pin_id"]: p["status"] for p in m["pins"]} == {"1": "ok", "2": "ok", "3": "ok"}
    assert m["not_inspected"] == [] and m["truncated"] is False
    assert m["partial"] is True and m["unavailable"] == ["zzz"]
    assert m["notice_kinds"] == ["page_context_partial", "page_context_truncated"]
    assert m["reads"] == 2 and m["pins_inspected"] == 3 and m["pins_reproduced"] == 3
    assert bob_loop.merge_page_evidence(None, b) == b


# ---------------------------------------------------------------------------
# 6. A compared pin keeps enough of its receipts to be understood
# ---------------------------------------------------------------------------

COMPARISON = {
    "kind": "previous_period", "display_name": "vs previous period",
    "method": "shift_back_by_window_length",
    "current": {"start": "2026-08-24", "end": "2026-08-31"},
    "baseline": {"kind": "explicit", "start": "2026-08-17", "end": "2026-08-24"},
    "baseline_statuses": {"ok": 6, "no_baseline": 1},
    "source": "definitions/metrics.yaml: comparisons.previous_period",
}


def test_a_page_read_keeps_the_comparison_and_the_metric_identity():
    """
    A pinned comparison replayed through a page read must hand Bob the
    current period, the baseline period, which metric it is and in what
    unit, and the per-row status counts — or he is reading change_pct
    rows with no baseline window to cite. Exactly those; the SQL, the
    formula and the diagnostics stay with the direct call.
    """
    rows = [{"store": "Rockwell", "value": 179058.5, "baseline": 215567.0,
             "change": -36508.5, "change_pct": -16.9, "direction": "down",
             "unit": "PHP", "baseline_status": "ok"}]
    result = _result(
        rows=rows, metric="net_sales", metric_kind="base", metric_label="Net sales",
        metric_unit="PHP", metric_sql="SUM(t.total)", comparison=COMPARISON,
        window={"kind": "explicit", "start": "2026-08-24", "end": "2026-08-31"},
        zero_total_transactions=27,
        metric_formula={"operation": "ratio"},
    )
    out = _run(view_page(ctx=_ctx(FakeReader(_read([_pin(1, results=[result])])))))
    receipts = out["rows"][0]["results"][0]["receipts"]

    assert receipts["window"]["start"] == "2026-08-24"
    assert receipts["comparison"]["baseline"]["start"] == "2026-08-17"
    assert receipts["comparison"]["baseline_statuses"] == {"ok": 6, "no_baseline": 1}
    assert receipts["metric"] == "net_sales"
    assert receipts["metric_kind"] == "base" and receipts["metric_label"] == "Net sales"
    assert receipts["metric_unit"] == "PHP"
    # The rows themselves travel whole, deltas included.
    assert out["rows"][0]["results"][0]["rows"][0]["change_pct"] == -16.9

    for extra in ("metric_sql", "metric_formula", "zero_total_transactions"):
        assert extra not in receipts, f"{extra} is the direct call's to show, not the page read's"


def test_an_uncompared_pin_carries_no_comparison_key():
    result = _result(rows=[{"value": 1.0}], metric="net_sales",
                     metric_kind="base", metric_label="Net sales")
    out = _run(view_page(ctx=_ctx(FakeReader(_read([_pin(1, results=[result])])))))
    receipts = out["rows"][0]["results"][0]["receipts"]
    assert "comparison" not in receipts
    assert receipts["metric_kind"] == "base"


# ---------------------------------------------------------------------------
# 9. Identity, purpose and the empty page (Page Workshop V1, 2026-09-08)
# ---------------------------------------------------------------------------

def _read_by_id(pins, **kw):
    """The reader's shape since pages became rows: identity beside the title."""
    read = _read(pins, **kw)
    read.update({
        "page_id": "00000000-0000-0000-0000-00000000aa11",
        "purpose": "Reorder AJI BARN before it runs out.",
        "page_updated_at": "2026-09-08T01:00:00+00:00",
        "empty": not pins and not kw.get("remainder"),
    })
    return read


def test_the_read_carries_the_pages_identity_and_labels_the_purpose_as_the_users():
    out = _run(view_page(ctx=_ctx(FakeReader(_read_by_id(_pins_ok(1))))))
    meta = out["meta"]
    assert meta["page_id"] == "00000000-0000-0000-0000-00000000aa11"
    assert meta["page_title"] == "AJI BARN Reorder" and meta["page"] == "AJI BARN Reorder"
    assert meta["page_purpose"] == "Reorder AJI BARN before it runs out."
    assert "not an instruction" in meta["page_purpose_is"]
    assert meta["page_updated_at"] == "2026-09-08T01:00:00+00:00"
    assert meta["empty"] is False
    # The filter names the identity, not the title: a rename cannot change
    # what the receipts say was read.
    assert any("page_id = 00000000-0000-0000-0000-00000000aa11" in f
               for f in meta["filters_applied"])
    assert not any("page = " in f for f in meta["filters_applied"])
    ev = meta["evidence"]
    assert ev["page_id"] == meta["page_id"] and ev["page"] == "AJI BARN Reorder"
    assert ev["purpose"] == meta["page_purpose"] and ev["empty"] is False


def test_an_empty_page_is_a_successful_read_that_says_so():
    out = _run(view_page(ctx=_ctx(FakeReader(_read_by_id([], total=0)))))
    meta = out["meta"]
    assert out["rows"] == []
    assert meta["empty"] is True and meta["pins_total"] == 0
    # Nothing was asked for and nothing was cut: neither caveat applies.
    assert meta["partial"] is False and meta["truncated"] is False
    assert "notice" not in meta
    assert "no analyses on it yet" in meta["note"] and "edit_page" in meta["note"]
    assert meta["evidence"]["empty"] is True
    assert meta["evidence"]["pins_inspected"] == 0


def test_the_ungrouped_scope_still_reads_as_page_id_is_null():
    read = _read([])
    read.update({"page": None, "page_id": None, "purpose": None,
                 "page_updated_at": None, "empty": True, "pins_total": 0})
    out = _run(view_page(ctx=_ctx(FakeReader(read))))
    meta = out["meta"]
    assert meta["page_id"] is None and meta["page"] is None
    assert any("page_id IS NULL" in f for f in meta["filters_applied"])
    assert "no ungrouped pins" in meta["note"]
