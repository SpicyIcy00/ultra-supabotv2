"""
Page Workshop V1 — behavioural evals. LIVE MODEL, LIVE DATABASE, OPT IN.

What is under test is what Bob CHOOSES to write, not whether the write
lands: the page writer is a fake that records every spec and answers as the
committed write would, so nothing reaches george.pages, while the reads are
the real tools against the real database on CLOSED windows. The service
itself is proven by tests/test_page_workshop_live.py.

Every scenario asserts structure, not wording: that a page was built from
calls that actually ran this conversation and from nothing else; that a
build stays inside the bound and prefers a few analyses; that "make this a
page" after an investigation re-runs nothing and saves only pinnable calls —
never view_page, never a duplicate, never prose; that an edit in page scope
names no page_id and uses the pin ids the page read gave; that an ambiguous
title is put to the user rather than picked; that "remove" is said as kept
in Ungrouped and never as deleted; that every figure in the prose is a
figure a tool returned; and that no page-claim correction was needed.

Run: set -a; . backend/.env; set +a; export ENVIRONMENT=production GEORGE_EVALS=1
     pytest tests/evals/test_page_workshop_evals.py -q -s
"""

from __future__ import annotations

import json

import pytest

from agent.write_tools import PageBuildSpec, PageEditSpec, PageRefused, call_key
from tests.evals import checks
from tests.evals.harness import Report, evidence_summary, required, run_turn
from tests.evals.judge import judge

MAX_ITERATIONS = 6
MAX_CALLS = 8
CLOSED_WEEK = "the week of 24 to 30 August 2026"

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    print("\n\n== page workshop evals ==")
    for r in report.records:
        d = r["done"]
        print(f"  {_outcome(r):<4} {r['scenario']:<28} calls={d.get('tool_calls')} "
              f"exec={d.get('executed_calls')} iters={d.get('iterations')} "
              f"writes={r['findings'].get('writes')} warnings={','.join(r['warnings']) or '-'}")
    if path:
        print(f"  report: {path}")


def _outcome(record) -> str:
    """PASS, FAIL, or `----` for a scenario the run never scored (P2.0)."""
    passed = record.get("passed")
    return "----" if passed is None else ("PASS" if passed else "FAIL")


# ---------------------------------------------------------------------------
# The fake writer, and a page Bob can read
# ---------------------------------------------------------------------------

PAGE_ID = "11111111-2222-3333-4444-555555555555"
PIN_NS = "aaaaaaaa-0000-0000-0000-000000000001"
PIN_TX = "aaaaaaaa-0000-0000-0000-000000000002"
PIN_ATP = "aaaaaaaa-0000-0000-0000-000000000003"

WEEK = ["2026-08-24", "2026-08-31"]
NS_CALL = {"tool": "get_sales", "arguments": {"metric": "net_sales", "group_by": "store",
                                              "filters": {"store": "Rockwell"}, "date_range": WEEK,
                                              "compare_to": "previous_period"}}
TX_CALL = {"tool": "get_sales", "arguments": {**NS_CALL["arguments"], "metric": "transaction_count"}}
ATP_CALL = {"tool": "get_sales", "arguments": {**NS_CALL["arguments"], "metric": "average_transaction_value"}}


class FakeWriter:
    """Records what Bob asked to be written; answers as a committed write would."""

    def __init__(self, title="Rockwell", pins=None, refuse_edit: Exception | None = None):
        self.title = title
        # The kind the page is, once anybody has said (W4.1). None is nobody
        # having said, which is what a fresh fake page is.
        self.kind: str | None = None
        self.pins = list(pins or [])
        self.builds: list[PageBuildSpec] = []
        self.edits: list[PageEditSpec] = []
        self.refuse_edit = refuse_edit

    def _summary(self, title, analyses, ops, kind=None):
        return {
            "owner": "eval",
            "page": {
                "page_id": PAGE_ID, "title": title, "purpose": None,
                "created_at": "2026-09-08T00:00:00+00:00", "updated_at": "2026-09-08T01:00:00+00:00",
                "analyses": analyses, "analysis_count": len(analyses),
                # W4.1: a page shape never carries a null kind. The committed
                # write answers with what was set, or with the default a
                # derivation would give a page nobody has said anything about.
                "kind": kind or self.kind or "collection",
                "kind_set_by": "bob" if (kind or self.kind) else "derived",
            },
            "operations": ops,
        }

    async def create(self, spec: PageBuildSpec) -> dict:
        self.builds.append(spec)
        self.kind = spec.kind or self.kind
        analyses = [{"pin_id": f"new-{i}", "title": a.get("title") or "existing", "position": i,
                     "tools": [c["tool"] for c in a.get("tool_calls", [])]}
                    for i, a in enumerate(spec.analyses)]
        return self._summary(spec.title, analyses, [{"op": "create"}] + [{"op": "add", "title": a["title"]} for a in analyses])

    async def edit(self, spec: PageEditSpec) -> dict:
        if self.refuse_edit is not None:
            raise self.refuse_edit
        self.edits.append(spec)
        title = self.title
        ops = []
        for o in spec.operations:
            if o["op"] == "rename":
                title = o["title"]
                ops.append({"op": "rename", "from": self.title, "to": title})
            elif o["op"] == "remove":
                ops.append({"op": "remove", "pin_id": o.get("pin_id"), "title": o.get("title") or "ATP",
                            "from_page": self.title, "to": "ungrouped"})
            elif o["op"] == "add":
                ops.append({"op": "add", "pin_id": "new-1", "title": o["title"], "position": len(self.pins), "source": "new"})
            elif o["op"] == "set_kind":
                self.kind = o["kind"]
                ops.append({"op": "set_kind", "to": self.kind, "set_by": "bob"})
            elif o["op"] == "move_to_page":
                ops.append({"op": "move_to_page", "pin_id": o.get("pin_id"), "title": o.get("title") or "ATP",
                            "from_page": self.title, "to_page_id": o["page_id"], "to_page": "Aji Overview"})
            else:
                ops.append({"op": o["op"]})
        analyses = [{"pin_id": p["pin_id"], "title": p["title"], "position": i, "tools": ["get_sales"]}
                    for i, p in enumerate(self.pins)]
        return self._summary(title, analyses, ops)


class FakeReader:
    """The page as view_page(figures=False) would report it: definitions, ids, no figures."""

    def __init__(self, pins):
        self.pins = pins
        self.calls = []

    async def __call__(self, pins, figures):
        self.calls.append((pins, figures))
        entries = []
        for i, p in enumerate(self.pins):
            entries.append({
                "pin_id": p["pin_id"], "title": p["title"], "question": p["title"],
                "page": "Rockwell", "page_id": PAGE_ID, "position": i,
                "pinned_at": "2026-09-08T00:00:00+00:00",
                "calls": [p["call"]], "last_run_at": None, "last_ok_at": None, "last_status": None,
                "read": "not_read", "not_read_reason": "figures_not_requested",
                "results": [], "notices": [],
            })
        return {
            "owner": "eval", "page_id": PAGE_ID, "page": "Rockwell", "purpose": "Watch Rockwell.",
            "page_updated_at": "2026-09-08T00:00:00+00:00", "empty": not entries,
            "read_at": "2026-09-08T02:00:00+00:00", "figures": False, "requested": None,
            "pins_total": len(entries), "pins_limit": 5, "pins": entries, "remainder": [],
            "unavailable": [], "deadline_s": 60.0,
        }


ROCKWELL_PINS = [
    {"pin_id": PIN_NS, "title": "Net sales", "call": NS_CALL},
    {"pin_id": PIN_TX, "title": "Transactions", "call": TX_CALL},
    {"pin_id": PIN_ATP, "title": "ATP", "call": ATP_CALL},
]
SCOPE = {"page_id": PAGE_ID, "name": "Rockwell"}


# ---------------------------------------------------------------------------
# Shared structural assertions
# ---------------------------------------------------------------------------

def _common(name: str, turn: checks.Turn, writer: FakeWriter, *, max_calls: int = MAX_CALLS,
            extra_results: list | None = None) -> dict:
    findings: dict = {
        "writes": [c["tool"] for c in turn.page_writes],
        "builds": [{"title": b.title, "analyses": len(b.analyses)} for b in writer.builds],
        "edits": [{"page_id": e.page_id, "ops": [o["op"] for o in e.operations]} for e in writer.edits],
        "page_changes": len(turn.page_changes),
    }
    results = [r["result"] for r in turn.results if not r["error"]] + list(extra_results or [])
    results += [{"rows": [change]} for change in turn.page_changes]
    if turn.page_context:
        results.append({"rows": [turn.page_context]})
    findings["ungrounded_numerals"] = [f.text for f in checks.ungrounded_numerals(turn.answer, results)]
    findings["enumeration"] = checks.enumeration(turn.read_calls)
    report.add(name, turn, findings, None)

    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    assert turn.done["iterations"] <= MAX_ITERATIONS, turn.done
    assert turn.done.get("executed_calls", turn.done["tool_calls"]) <= max_calls, turn.done
    assert not [w for w in turn.warnings if w.get("reason") == "convergence_cap"]
    assert not [w for w in turn.warnings if w.get("reason", "").startswith("page_")], \
        f"a page claim had to be corrected: {turn.warnings}"
    assert turn.done.get("notice_forced") is False
    assert not findings["enumeration"], f"fanned out over subjects: {findings['enumeration']}"
    assert not findings["ungrounded_numerals"], f"figures no tool returned: {findings['ungrounded_numerals']}"
    # Every committed write was announced as a frame, and only committed ones.
    ok_writes = [c for c in turn.page_writes if not c.get("error")]
    assert len(turn.page_changes) == len(ok_writes), (turn.page_changes, ok_writes)
    return findings


def _record(name, turn, findings):
    report.add(name, turn, findings, judge(turn.question, turn.answer, evidence_summary(turn)))


def _executed_keys(turn: checks.Turn) -> set[str]:
    return {call_key(c["tool"], c["arguments"]) for c in turn.ok_calls}


def _build_calls_ran(spec: PageBuildSpec, executed: set[str]) -> None:
    """Every new analysis is calls that ran; nothing else can be in it."""
    for a in spec.analyses:
        if "tool_calls" in a:
            for c in a["tool_calls"]:
                assert c["tool"].startswith("get_"), c
                assert call_key(c["tool"], c["arguments"]) in executed, (
                    f"an analysis was saved from a call that did not run: {c}")


# ---------------------------------------------------------------------------
# 1. Build a page from a request
# ---------------------------------------------------------------------------

def test_a_page_is_built_from_a_few_reads_that_ran(monkeypatch):
    w = FakeWriter()
    turn = run_turn(monkeypatch, f"Make me a Rockwell performance page for {CLOSED_WEEK}.", page_writer=w)
    f = _common("build_from_request", turn, w)
    assert len(w.builds) == 1, f"expected one create_page, got {f['writes']}"
    [spec] = w.builds
    assert 1 <= len(spec.analyses) <= 6
    assert len(spec.analyses) <= 5, "the prompt prefers three or four; more than five is a dashboard"
    assert "rockwell" in spec.title.lower()
    _build_calls_ran(spec, _executed_keys(turn))
    # The reads happened BEFORE the build, in this turn: the page is made from them.
    assert turn.ok_calls, "no reads ran before the page was built"
    assert turn.page_changes[0]["created"] is True
    f["analysis_titles"] = [a.get("title") for a in spec.analyses]
    _record("build_from_request", turn, f)


# ---------------------------------------------------------------------------
# 2. An investigation, then "make this a page"
# ---------------------------------------------------------------------------

def test_make_this_a_page_saves_the_investigations_calls_and_reruns_nothing(monkeypatch):
    first = run_turn(monkeypatch, f"Why was OPUS down in {CLOSED_WEEK} compared with the week before?")
    assert first.done.get("status") == "ok", first.warnings
    history = first.history_turns()
    prior = {call_key(c["tool"], c["arguments"]) for c in first.ok_calls if c.get("pinnable")}
    assert prior, "the investigation made no pinnable reads"

    w = FakeWriter()
    turn = run_turn(monkeypatch, "Make this a page called OPUS Weekly.", history=history, page_writer=w)
    f = _common("investigation_to_page", turn, w, extra_results=[r["result"] for r in first.results if not r["error"]])
    assert len(w.builds) == 1, f"expected one create_page, got {f['writes']}"
    [spec] = w.builds
    assert spec.analyses, "the page was created empty"
    # Saved from what already ran — nothing re-read merely to save it.
    assert turn.done.get("executed_calls") == 0, f"reads were re-run to save them: {[c['arguments'] for c in turn.read_calls]}"
    for a in spec.analyses:
        assert "tool_calls" in a, a
        for c in a["tool_calls"]:
            assert c["tool"] != "view_page"
            assert call_key(c["tool"], c["arguments"]) in prior, f"not a call the investigation made: {c}"
    # No two analyses save the same call.
    keys = [call_key(c["tool"], c["arguments"]) for a in spec.analyses for c in a["tool_calls"]]
    assert len(keys) == len(set(keys)), "a call was saved twice"
    f["saved_calls"] = len(keys)
    _record("investigation_to_page", turn, f)


# ---------------------------------------------------------------------------
# 3-5. Edits in page scope
# ---------------------------------------------------------------------------

def test_rename_in_scope_edits_this_page_without_naming_it(monkeypatch):
    w = FakeWriter(pins=ROCKWELL_PINS)
    reader = FakeReader(ROCKWELL_PINS)
    turn = run_turn(monkeypatch, "Rename this page Rockwell Weekly.", page_writer=w,
                    page_reader=reader, page_scope=SCOPE)
    f = _common("rename_in_scope", turn, w)
    assert len(w.edits) == 1, f['writes']
    [spec] = w.edits
    assert spec.page_id in (None, PAGE_ID), "must use the scoped Page or its stable id"
    assert [o["op"] for o in spec.operations] == ["rename"]
    assert spec.operations[0]["title"] == "Rockwell Weekly"
    assert turn.done.get("executed_calls") == 0, "a rename read the warehouse"
    _record("rename_in_scope", turn, f)


def test_remove_by_title_uses_the_pages_ids_and_says_kept_not_deleted(monkeypatch):
    w = FakeWriter(pins=ROCKWELL_PINS)
    reader = FakeReader(ROCKWELL_PINS)
    turn = run_turn(monkeypatch, "Remove the ATP one from this page.", page_writer=w,
                    page_reader=reader, page_scope=SCOPE)
    f = _common("remove_in_scope", turn, w)
    assert len(w.edits) == 1, f['writes']
    [spec] = w.edits
    assert spec.page_id in (None, PAGE_ID)
    [op] = spec.operations
    assert op["op"] == "remove"
    assert op.get("pin_id") == PIN_ATP or (op.get("title") or "").strip().lower() == "atp", op
    low = turn.answer.lower()
    assert "ungrouped" in low, "the answer must say where the analysis went"
    assert "kept" in low or "ungrouped" in low
    assert turn.done.get("executed_calls") == 0, "a removal read the warehouse"
    _record("remove_in_scope", turn, f)


def test_an_ambiguous_title_is_put_to_the_user_not_picked(monkeypatch):
    two = ROCKWELL_PINS + [{"pin_id": "aaaaaaaa-0000-0000-0000-000000000004", "title": "ATP", "call": ATP_CALL}]
    refusal = PageRefused(
        "'ATP' matches 2 of your pins: 'ATP' (id aaaaaaaa-0000-0000-0000-000000000003, on 'Rockwell'); "
        "'ATP' (id aaaaaaaa-0000-0000-0000-000000000004, on 'Rockwell'). Name the one you mean by its id."
    )
    w = FakeWriter(pins=two, refuse_edit=refusal)
    reader = FakeReader(two)
    turn = run_turn(monkeypatch, "Remove the ATP one from this page.", page_writer=w,
                    page_reader=reader, page_scope=SCOPE)
    f = _common("ambiguous_title", turn, w)
    edits = turn.page_writes
    # Refused once is fine; refused, then retried with one of the two ids
    # picked by Bob, is the guess this test exists to catch.
    assert len(edits) <= 1, f"retried without clarification: {[e.get('arguments') for e in edits]}"
    assert not w.edits and not turn.page_changes
    assert all(not o.get("pin_id") for e in edits for o in e["arguments"].get("operations", [])), \
        "selected an ambiguous pin without asking the user"
    low = turn.answer.lower()
    assert "two" in low or "2" in low or "both" in low or "which" in low, turn.answer
    assert "ungrouped" not in low or "which" in low or "?" in turn.answer, "claimed a removal that was refused"
    _record("ambiguous_title", turn, f)


def test_add_in_scope_reads_first_then_adds_that_exact_call(monkeypatch):
    w = FakeWriter(pins=ROCKWELL_PINS)
    reader = FakeReader(ROCKWELL_PINS)
    turn = run_turn(monkeypatch, f"Add category performance for {CLOSED_WEEK} to this page.",
                    page_writer=w, page_reader=reader, page_scope=SCOPE)
    f = _common("add_in_scope", turn, w)
    assert len(w.edits) == 1, f['writes']
    [spec] = w.edits
    assert spec.page_id in (None, PAGE_ID)
    adds = [o for o in spec.operations if o["op"] == "add"]
    assert len(adds) == 1, [o["op"] for o in spec.operations]
    [add] = adds
    executed = _executed_keys(turn)
    for c in add["tool_calls"]:
        assert call_key(c["tool"], c["arguments"]) in executed, f"added a call that did not run: {c}"
        assert "category" in json.dumps(c["arguments"]), c
    _record("add_in_scope", turn, f)


def test_human_destination_title_resolves_to_an_owned_id_without_replay(monkeypatch):
    destination = "11111111-2222-3333-4444-666666666666"
    w = FakeWriter(pins=ROCKWELL_PINS)
    turn = run_turn(monkeypatch, "Move the ATP analysis to Aji Overview.",
                    page_writer=w, page_reader=FakeReader(ROCKWELL_PINS), page_scope=SCOPE,
                    page_references=[{"page_id": PAGE_ID, "title": "Rockwell"},
                                     {"page_id": destination, "title": "Aji Overview"}])
    f = _common("move_by_stable_id", turn, w)
    assert len(w.edits) == 1
    [op] = w.edits[0].operations
    assert op["op"] == "move_to_page" and op["page_id"] == destination
    assert "page_title" not in op
    assert op.get("pin_id") == PIN_ATP or op.get("title", "").lower() == "atp"
    assert turn.done.get("executed_calls") == 0
    _record("move_by_stable_id", turn, f)


def test_empty_page_creation_needs_no_business_reads(monkeypatch):
    w = FakeWriter()
    turn = run_turn(monkeypatch, "Create an empty page called Weekly Review with purpose Weekly review notes.",
                    page_writer=w)
    f = _common("empty_page", turn, w)
    [spec] = w.builds
    assert spec.title == "Weekly Review" and spec.analyses == []
    assert spec.purpose and "weekly review" in spec.purpose.lower()
    assert turn.done.get("executed_calls") == 0
    _record("empty_page", turn, f)


def test_reorder_uses_relational_placement(monkeypatch):
    w = FakeWriter(pins=ROCKWELL_PINS)
    turn = run_turn(monkeypatch, "Put the ATP analysis at the top of this page.",
                    page_writer=w, page_reader=FakeReader(ROCKWELL_PINS), page_scope=SCOPE)
    f = _common("reorder", turn, w)
    [spec] = w.edits
    [op] = spec.operations
    assert op["op"] == "place"
    assert op["place"] in ({"at": "top"}, {"before": PIN_NS})
    assert "position" not in op and turn.done.get("executed_calls") == 0
    _record("reorder", turn, f)
