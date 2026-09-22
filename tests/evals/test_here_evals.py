"""
W1.4 — alive on every page. LIVE MODEL, LIVE DATABASE, OPT IN.

The web UI cannot be driven against production from here, so each case
passes the page the way the route does: a kept page as `page_scope` (the
identity the route resolves and binds view_page and edit_page to) with its
display string as `page_context`; a BI page as the `page_context` sentence
`screen_context` builds from what the screen registered. The page writer is
the Page Workshop fake — nothing reaches george.pages — and the reads are
the real tools on the real database.

Done when (NOW.md §3 W1.4): "add date filters to this" on a kept page reads
and edits that page without leaving it, and a question on /warehouse is
answered on /warehouse. "Without leaving it" and "on /warehouse" are the
frontend's (askBar.dom.test.tsx holds them); what is measured here is that
Bob, given the page as the route gives it, reads the page and changes it,
and answers the warehouse question as a question about the warehouse.

Run: GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest tests/evals -k here -q -s
"""

from __future__ import annotations

import pytest

from app.api.v1.routes.bob import ScreenFrame, screen_context
from tests.evals import checks
from tests.evals.harness import Report, evidence_summary, required, run_turn, turn_usd
from tests.evals.judge import judge
from tests.evals.test_page_workshop_evals import (
    PAGE_ID, ROCKWELL_PINS, SCOPE, FakeReader, FakeWriter,
)

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    print("\n\n== alive on every page (W1.4) ==")
    for r in report.records:
        d = r["done"]
        f = r["findings"]
        print(f"  {r['scenario']:<26} status={d.get('status')} iters={d.get('iterations')} "
              f"calls={d.get('tool_calls')} seconds={f.get('seconds')} usd={f.get('usd')} "
              f"read_page={f.get('read_page')} edits={f.get('edits')}")
    if path:
        print(f"  report: {path}")


def _timing(turn: checks.Turn) -> dict:
    ms = (turn.done or {}).get("duration_ms")
    if ms is None and turn.frames:
        ms = turn.frames[-1][2]
    return {"seconds": round(float(ms) / 1000, 1) if ms is not None else None,
            "usd": round(turn_usd(turn), 4)}


def test_here_add_date_filters_on_a_kept_page_reads_and_edits_it(monkeypatch):
    w = FakeWriter(pins=ROCKWELL_PINS)
    reader = FakeReader(ROCKWELL_PINS)
    turn = run_turn(monkeypatch, "add date filters to this", page_writer=w, page_reader=reader,
                    page_scope=SCOPE, page_context="Pages / Rockwell")
    f = {
        **_timing(turn),
        "read_page": len(reader.calls),
        "edits": [{"page_id": e.page_id, "ops": [o["op"] for o in e.operations]} for e in w.edits],
        "writes": [c["tool"] for c in turn.page_writes],
        "page_changes": len(turn.page_changes),
        "answer": turn.answer[:600],
    }
    report.add("kept_page_date_filters", turn, f,
               judge(turn.question, turn.answer, evidence_summary(turn)))
    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    # READS THIS PAGE: view_page, which reads the page in scope and nothing else.
    assert reader.calls, "the page in scope was never read"
    # AND EDITS IT: an edit_page on the page in scope — no page_id, or its own.
    assert w.edits, f"the page was read and not changed: {turn.answer[:400]}"
    assert all(e.page_id in (None, PAGE_ID) for e in w.edits), f["edits"]
    assert len(turn.page_changes) == len([c for c in turn.page_writes if not c.get("error")])


def test_here_a_question_on_the_warehouse_is_answered_as_one(monkeypatch):
    context = screen_context(ScreenFrame(key="warehouse", label="Warehouse",
                                         view="Replenishment Reports"))
    turn = run_turn(monkeypatch, "what on here needs me today?", page_context=context)
    tools = [c.get("tool") for c in turn.calls]
    f = {**_timing(turn), "context": context, "tools": tools, "answer": turn.answer[:600]}
    report.add("warehouse_question", turn, f,
               judge(turn.question, turn.answer, evidence_summary(turn)))
    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    # No kept page is in scope, so no page tool may run.
    assert "view_page" not in tools and "edit_page" not in tools, tools
    # "Here" is the warehouse: he reads stock or replenishment, not only sales.
    assert any(t and ("replenish" in t or "stock" in t or "purchase" in t or "reorder" in t)
               for t in tools), f"the warehouse was not what he read: {tools}"
