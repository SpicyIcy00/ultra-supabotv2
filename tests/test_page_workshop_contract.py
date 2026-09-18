"""
Pure tests for George's page tools: create_page and edit_page.

NO DATABASE. Every decision that makes a conversational page write safe is
decidable without one, and all of them live here:

  1. THE CAPABILITY IS THE INJECTION. No page writer, neither tool in the
     schema; the tools sort after every read tool whatever they are called;
     neither takes a username, an owner, or a way to name another person's
     page; a page can never hold view_page or a write, because the schema's
     enum is the read surface.
  2. PROVENANCE. An analysis is built from calls that RAN in this conversation
     — the same executed set pin_answer checks — or an existing pin id. A call
     that did not run is refused before the writer is reached, and a refusal
     from the writer reaches the model as a real answer, not a crash.
  3. THE FRAME AND THE CLAIM. A committed write is announced as a page_changed
     frame from the tool's result; a claimed change that never happened is
     corrected once; "both drivers moved" is not a page claim.
  4. THE BOUNDS ARE ONE SET. What the prompt says, what the tools refuse and
     what the service enforces are the same numbers.

test_page_workshop_live.py exercises the service against the real database.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import uuid

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import composite_tools, loop as george_loop, write_tools              # noqa: E402
from agent.write_tools import (                                                   # noqa: E402
    PAGE_EDIT_OPERATIONS,
    PageBuildSpec,
    PageEditSpec,
    PageRefused,
    WriteContext,
    call_key,
    create_page,
    edit_page,
)
from app.services import page_operations, page_writer                             # noqa: E402
from tools._common import load_defs, req                                          # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse             # noqa: E402
from tests.test_loop_correction_contract import (                                 # noqa: E402
    StubLog,
    _TextBlock,
    answer_of,
    frames_of,
)


def _run(coro):
    return asyncio.run(coro)


SALES = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"}}
TX = {"tool": "get_sales",
      "arguments": {"metric": "transaction_count", "group_by": "store", "date_range": "last_month"}}
DAILY = {"tool": "get_sales",
         "arguments": {"metric": "net_sales", "group_by": "day", "date_range": "last_month"}}


class FakeWriter:
    """Stands in for the writer the web process injects. Records what it was asked."""

    def __init__(self, raises: Exception | None = None) -> None:
        self.builds: list[PageBuildSpec] = []
        self.edits: list[PageEditSpec] = []
        self.raises = raises

    def _page(self, title="Rockwell Weekly", n=2, ops=None):
        return {
            "owner": "ice",
            "page": {
                "page_id": "00000000-0000-0000-0000-00000000aa11",
                "title": title, "purpose": "Watch Rockwell.",
                "created_at": "2026-09-08T00:00:00+00:00",
                "updated_at": "2026-09-08T01:00:00+00:00",
                "analyses": [{"pin_id": f"pin-{i}", "title": f"A{i}", "position": i,
                              "tools": ["get_sales"], "calls": [SALES]} for i in range(n)],
                "analysis_count": n,
            },
            "operations": ops or [],
        }

    async def create(self, spec: PageBuildSpec) -> dict:
        if self.raises:
            raise self.raises
        self.builds.append(spec)
        return self._page(spec.title, len(spec.analyses),
                          [{"op": "create"}] + [{"op": "add"}] * len(spec.analyses))

    async def edit(self, spec: PageEditSpec) -> dict:
        if self.raises:
            raise self.raises
        self.edits.append(spec)
        return self._page(ops=[{"op": o["op"]} for o in spec.operations])


def _ctx(writer=None, executed=()):
    ctx = WriteContext(page_writer=writer, question="make a page", conversation_id=str(uuid.uuid4()))
    for c in executed:
        ctx.executed[call_key(c["tool"], c["arguments"])] = dict(c)
    return ctx


def _schema(name):
    return next(s for s in george_loop.build_tool_schemas(include_write=True) if s["name"] == name)


# ---------------------------------------------------------------------------
# 1. Injected, nameless, and after every read
# ---------------------------------------------------------------------------

def test_the_tools_are_absent_without_a_writer_and_present_with_one():
    assert "create_page" not in george_loop.injected_surface(_ctx())
    assert "edit_page" not in george_loop.injected_surface(_ctx())
    surface = george_loop.injected_surface(_ctx(FakeWriter()))
    assert {"create_page", "edit_page"} <= set(surface)


def test_the_registries_agree():
    for name in ("create_page", "edit_page"):
        assert name in write_tools.WRITE_TOOL_FUNCTIONS
        assert write_tools.WRITE_TOOL_REQUIRES[name] == "page_writer"
        assert name not in george_loop.TOOL_FUNCTIONS
        assert name not in composite_tools.COMPOSITE_TOOL_FUNCTIONS
    assert set(write_tools.PAGE_WRITE_TOOLS) == {"create_page", "edit_page"}


def test_the_tools_take_no_owner_and_no_way_to_name_another_person():
    for name in ("create_page", "edit_page"):
        props = _schema(name)["input_schema"]["properties"]
        assert "ctx" not in props
        for word in ("user", "username", "owner", "created_by"):
            assert word not in props
    assert set(_schema("create_page")["input_schema"]["properties"]) == {"title", "analyses", "purpose"}
    assert set(_schema("create_page")["input_schema"]["required"]) == {"title"}
    assert set(_schema("edit_page")["input_schema"]["properties"]) == {"operations", "page_id"}
    assert set(_schema("edit_page")["input_schema"]["required"]) == {"operations"}


def test_the_read_prefix_holds_by_construction_whatever_the_names():
    """
    create_page and edit_page sort before "get_..." alphabetically. The
    schema builder now puts reads first and injected tools after, so the
    cached prefix is still shared — and the guarantee no longer depends on
    the name a tool happens to have.
    """
    read = george_loop.build_tool_schemas()
    both = george_loop.build_tool_schemas(include_write=True)
    assert both[: len(read)] == read
    # Reads sorted, then the label tools sorted: the structure the builder
    # guarantees, which is what a shared prefix needs. Since 2026-09-10 the
    # second label tool ("compose") sorts before "get_...", so the prefix as
    # a whole is no longer alphabetical — and never needed to be.
    assert [s["name"] for s in read] == (
        sorted({*george_loop.TOOL_FUNCTIONS, *george_loop.one_call.FUNCTIONS}) + sorted(george_loop.FINDING_TOOL_FUNCTIONS)
    )
    injected = [s["name"] for s in both[len(read):]]
    assert injected == sorted(injected)
    # The property is that the injected names are SORTED and disjoint from the
    # reads, so a session with one capability shares a byte-identical prefix
    # with a session that has another. Which name happens to sort last was
    # incidental, and stopped being view_page when George gained the two reads
    # that let him see his own views and his own rules (2026-09-11).
    assert injected[0] == "create_page"
    assert composite_tools.PAGE_CONTEXT_TOOL in injected
    assert set(injected) >= set(composite_tools.COMPOSITE_TOOL_FUNCTIONS)


def test_a_page_can_never_hold_a_page_read_or_a_write():
    items = _schema("create_page")["input_schema"]["properties"]["analyses"]["items"]
    allowed = items["properties"]["tool_calls"]["items"]["properties"]["tool"]["enum"]
    assert set(allowed) == set(george_loop.TOOL_FUNCTIONS)
    for forbidden in ("view_page", "pin_answer", "create_page", "edit_page", "run_workflow"):
        assert forbidden not in allowed
    ops = _schema("edit_page")["input_schema"]["properties"]["operations"]["items"]
    assert set(ops["properties"]["op"]["enum"]) == set(PAGE_EDIT_OPERATIONS)
    add_tools = ops["properties"]["tool_calls"]["items"]["properties"]["tool"]["enum"]
    assert set(add_tools) == set(george_loop.TOOL_FUNCTIONS)


def test_placement_in_the_schema_is_relational_only():
    place = _schema("edit_page")["input_schema"]["properties"]["operations"]["items"]["properties"]["place"]
    assert set(place["properties"]) == {"before", "after", "at"}
    assert place["properties"]["at"]["enum"] == ["top", "bottom"]
    assert place["additionalProperties"] is False
    assert "position" not in place["properties"]


def test_destination_titles_are_not_a_write_identity():
    props = _schema("edit_page")["input_schema"]["properties"]["operations"]["items"]["properties"]
    assert "page_title" not in props
    w = FakeWriter()
    with pytest.raises(PageRefused, match="page_id"):
        _run(edit_page([{"op": "move_to_page", "title": "ATP", "page_title": "Overview"}], ctx=_ctx(w)))
    assert w.edits == []


def test_duplicate_reads_do_not_become_two_analyses():
    w = FakeWriter()
    with pytest.raises(PageRefused, match="same read twice"):
        _run(create_page("P", analyses=[{"title": t, "tool_calls": [SALES]} for t in ("A", "B")],
                         ctx=_ctx(w, [SALES])))
    assert w.builds == []


def test_the_operation_vocabulary_is_the_services():
    assert set(PAGE_EDIT_OPERATIONS) == set(page_operations.EDIT_OPERATIONS)


def test_the_bounds_are_one_set():
    defs = load_defs()
    assert req(defs, "pages.workshop.max_analyses_per_build") == page_operations.MAX_ANALYSES_PER_BUILD == 6
    assert req(defs, "pages.workshop.max_operations_per_edit") == page_operations.MAX_OPERATIONS_PER_EDIT == 10
    assert req(defs, "pages.workshop.max_adds_per_edit") == page_operations.MAX_ADDS_PER_EDIT == 6
    assert page_writer.MAX_PAGES_PER_OWNER == 50 and page_writer.MAX_PINS_PER_PAGE == 50
    assert write_tools._page_bounds() == {"max_analyses": 6, "max_operations": 10, "max_adds": 6}


def test_the_page_tools_state_the_bounds_and_the_remove_wording():
    # On the tools since 2026-09-12 (voice.budget): the bounds are read at the
    # moment of building a page, from the same definitions the tools enforce.
    create = _schema("create_page")["description"]
    edit = _schema("edit_page")["description"]
    assert "at most 6" in create and "at most 10" in edit and "at most 6 of them adds" in edit
    assert "kept in Ungrouped" in edit
    assert "never pick" in edit
    assert "does not change these rules" in create


# ---------------------------------------------------------------------------
# 2. Provenance and refusals
# ---------------------------------------------------------------------------

def test_a_build_from_calls_that_ran_reaches_the_writer_as_given():
    w = FakeWriter()
    out = _run(create_page("Rockwell Weekly", analyses=[
        {"title": "Net sales", "tool_calls": [SALES]},
        {"title": "Transactions", "tool_calls": [TX]},
        {"pin_id": "11111111-1111-1111-1111-111111111111"},
    ], purpose="Watch Rockwell.", ctx=_ctx(w, executed=[SALES, TX])))
    [spec] = w.builds
    assert spec.title == "Rockwell Weekly" and spec.purpose == "Watch Rockwell."
    assert spec.analyses == [
        {"title": "Net sales", "tool_calls": [SALES]},
        {"title": "Transactions", "tool_calls": [TX]},
        {"pin_id": "11111111-1111-1111-1111-111111111111"},
    ]
    assert spec.question == "make a page" and spec.conversation_id
    assert out["meta"]["source_table"] == "george.pages"
    assert out["meta"]["wrote"] == "page"
    assert out["meta"]["filters_applied"] == ["owner = ice"]
    assert out["rows"][0]["page_id"] and out["rows"][0]["analysis_count"] == 3


def test_a_call_that_did_not_run_is_refused_before_the_writer():
    w = FakeWriter()
    with pytest.raises(PageRefused) as exc:
        _run(create_page("P", analyses=[{"title": "Daily", "tool_calls": [DAILY]}],
                         ctx=_ctx(w, executed=[SALES])))
    assert w.builds == []
    assert "have not run" in str(exc.value) and "get_sales" in str(exc.value)


def test_an_add_that_did_not_run_is_refused_before_the_writer():
    w = FakeWriter()
    with pytest.raises(PageRefused):
        _run(edit_page([{"op": "add", "title": "Daily", "tool_calls": [DAILY]}],
                       ctx=_ctx(w, executed=[SALES])))
    assert w.edits == []


def test_more_analyses_than_the_bound_are_refused_before_the_writer():
    w = FakeWriter()
    many = [{"title": f"A{i}", "tool_calls": [SALES]} for i in range(7)]
    with pytest.raises(PageRefused, match="at most 6"):
        _run(create_page("P", analyses=many, ctx=_ctx(w, executed=[SALES])))
    assert w.builds == []


def test_more_operations_or_adds_than_the_bound_are_refused_before_the_writer():
    w = FakeWriter()
    with pytest.raises(PageRefused, match="at most 10"):
        _run(edit_page([{"op": "set_purpose", "purpose": "x"}] * 11, ctx=_ctx(w)))
    with pytest.raises(PageRefused, match="at most 6"):
        _run(edit_page([{"op": "add", "title": "A", "tool_calls": [SALES]}] * 7,
                       ctx=_ctx(w, executed=[SALES])))
    assert w.edits == []


def test_an_unknown_operation_is_refused_by_name():
    with pytest.raises(PageRefused, match="explode"):
        _run(edit_page([{"op": "explode"}], ctx=_ctx(FakeWriter())))


def test_an_analysis_must_be_calls_or_a_pin_never_both_or_neither():
    w = FakeWriter()
    with pytest.raises(PageRefused):
        _run(create_page("P", analyses=[{"title": "x"}], ctx=_ctx(w)))
    with pytest.raises(PageRefused):
        _run(create_page("P", analyses=[{"pin_id": "a", "tool_calls": [SALES]}],
                         ctx=_ctx(w, executed=[SALES])))
    assert w.builds == []


def test_the_page_id_is_passed_through_untouched_and_omitted_means_this_page():
    w = FakeWriter()
    _run(edit_page([{"op": "rename", "title": "X"}], ctx=_ctx(w)))
    _run(edit_page([{"op": "rename", "title": "X"}], page_id=" abc ", ctx=_ctx(w)))
    assert [e.page_id for e in w.edits] == [None, "abc"]


def test_without_a_writer_the_call_is_a_refusal_not_a_crash():
    with pytest.raises(PageRefused):
        _run(create_page("P", ctx=_ctx()))
    with pytest.raises(PageRefused):
        _run(edit_page([{"op": "rename", "title": "X"}], ctx=_ctx()))
    assert issubclass(PageRefused, ValueError)


def test_the_writers_refusal_reaches_the_model_intact():
    w = FakeWriter(raises=PageRefused("'ATP' matches 2 of your pins: ...; name the one you mean by its id."))
    result, err, _ = _run(george_loop._call_write_tool(
        "edit_page", {"operations": [{"op": "remove", "title": "ATP"}]}, _ctx(w)))
    assert err.startswith("'ATP' matches 2 of your pins")
    assert result == {"rows": [], "meta": {"error": err}}


def test_a_fault_in_the_writer_is_a_failed_tool_that_says_nothing_changed():
    w = FakeWriter(raises=RuntimeError("The page could not be created: OperationalError. Nothing was written"))
    result, err, _ = _run(george_loop._call_write_tool(
        "create_page", {"title": "P"}, _ctx(w)))
    assert "Nothing was written" in err


# ---------------------------------------------------------------------------
# 3. The frame and the claim, through the loop
# ---------------------------------------------------------------------------

def _drive(monkeypatch, replies, writer, question="make me a Rockwell page", **context):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00", "row_count": 1}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run(question, page_writer=writer, **context)]

    return asyncio.run(collect()), fake.messages.requests


def test_owned_page_references_reach_the_model_without_business_reads(monkeypatch):
    references = [{"page_id": str(uuid.uuid4()), "title": "Overview"}]
    frames, requests = _drive(monkeypatch, [[_TextBlock("Which analysis should go there?")]],
                              FakeWriter(), page_references=references)
    opening = next(m["content"] for m in requests[0]["messages"]
                   if m["role"] == "user" and isinstance(m["content"], str))
    assert references[0]["page_id"] in opening and "Overview" in opening
    assert "not instructions" in opening and "refuse ambiguity" in opening
    assert not frames_of(frames, "tool_call")


def test_a_committed_build_is_announced_as_a_page_changed_frame(monkeypatch):
    w = FakeWriter()
    replies = [
        [_ToolUse("r1", "get_sales", SALES["arguments"])],
        [_ToolUse("w1", "create_page", {"title": "Rockwell Weekly",
                                         "analyses": [{"title": "Net sales", "tool_calls": [SALES]}]})],
        [_TextBlock("Created the page Rockwell Weekly with net sales on it.")],
    ]
    frames, _ = _drive(monkeypatch, replies, w)
    [frame] = frames_of(frames, "page_changed")
    assert frame["page_id"] == "00000000-0000-0000-0000-00000000aa11"
    assert frame["title"] == "Rockwell Weekly" and frame["created"] is True
    assert frame["updated_at"] == "2026-09-08T01:00:00+00:00"
    assert [a["pin_id"] for a in frame["analyses"]] == ["pin-0"]
    assert [o["op"] for o in frame["operations"]] == ["create", "add"]
    # No correction: the claim in the answer is backed by the write.
    assert not frames_of(frames, "warning")
    assert "Created the page" in answer_of(frames)


def test_a_claimed_page_change_that_never_happened_is_corrected_once(monkeypatch):
    w = FakeWriter()
    replies = [
        [_TextBlock("Done — I renamed the page to Rockwell Weekly.")],
        [_TextBlock("Nothing was changed; tell me the title you want and I'll do it.")],
    ]
    frames, requests = _drive(monkeypatch, replies, w, question="rename this Rockwell Weekly")
    warnings = [f["reason"] for f in frames_of(frames, "warning")]
    assert "page_claimed_not_made" in warnings
    corrections = [m["content"] for m in requests[1]["messages"]
                   if m["role"] == "user" and isinstance(m["content"], str)
                   and "never called create_page or edit_page" in m["content"]]
    assert len(corrections) == 1
    # The first answer was reset and the rewrite is what stands.
    assert [f["reason"] for f in frames_of(frames, "answer_reset")] == ["page_claimed_not_made"]
    assert "Nothing was changed" in answer_of(frames)
    assert w.edits == []


def test_a_rename_does_not_license_a_claim_that_an_analysis_moved(monkeypatch):
    replies = [
        [_ToolUse("w1", "edit_page", {"operations": [{"op": "rename", "title": "Weekly"}]})],
        [_TextBlock("Renamed the page. Moved it to Overview.")],
        [_TextBlock("Renamed the page. No analysis was moved.")],
    ]
    frames, _ = _drive(monkeypatch, replies, FakeWriter())
    assert "page_claimed_not_made" in [f["reason"] for f in frames_of(frames, "warning")]
    assert "No analysis was moved" in answer_of(frames)


def test_committed_operation_claim_check_keeps_negations():
    defs = load_defs()
    assert george_loop._page_claim("Renamed the page.", defs, {"rename"}) is None
    assert george_loop._page_claim("I have not moved it to Overview.", defs, {"rename"}) is None
    assert george_loop._page_claim("Created the page.", defs, {"rename"}) == "claimed"
    assert george_loop._page_claim("Moved it to Overview.", defs, {"move_to_page"}) is None


def test_a_promised_page_change_is_corrected_too(monkeypatch):
    replies = [
        [_TextBlock("I'll create the page once you confirm the title.")],
        [_TextBlock("Which title would you like for the page?")],
    ]
    frames, _ = _drive(monkeypatch, replies, FakeWriter())
    assert "page_promised_not_made" in [f["reason"] for f in frames_of(frames, "warning")]


def test_ordinary_investigation_prose_is_not_a_page_claim():
    defs = load_defs()
    for text in (
        "Both drivers moved by similar amounts, so I would not pick one.",
        "Transactions moved less than ATP; basket value is the stronger driver.",
        "That SKU was removed from the range in June.",
        "I moved on to the product ranking next.",
    ):
        assert george_loop._page_claim(text, defs) is None, text


def test_a_denied_page_change_is_not_a_claim():
    defs = load_defs()
    assert george_loop._page_claim("I could not rename the page: that title is taken.", defs) is None
    assert george_loop._page_claim("I haven't moved it to Aji Overview yet.", defs) is None


def test_without_a_writer_no_page_claim_is_checked(monkeypatch):
    fake = FakeClient([[_TextBlock("I renamed the page to Rockwell Weekly.")]])
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in george_loop.run("rename it")]

    frames = asyncio.run(collect())
    assert not [f for f in frames_of(frames, "warning") if f["reason"].startswith("page_")]


def test_a_page_write_satisfies_the_pin_claim_too(monkeypatch):
    """create_page added analyses; "added to the page" is then true and not a pin claim."""
    w = FakeWriter()
    replies = [
        [_ToolUse("r1", "get_sales", SALES["arguments"])],
        [_ToolUse("w1", "create_page", {"title": "P",
                                         "analyses": [{"title": "Net sales", "tool_calls": [SALES]}]})],
        [_TextBlock("Net sales is added to the page P, which re-runs when opened.")],
    ]
    frames, _ = _drive(monkeypatch, replies, w)
    assert not [f for f in frames_of(frames, "warning") if "pin_" in f["reason"]]


def test_the_page_sentence_names_the_page_and_never_its_id():
    with_writer = george_loop._page_sentence(
        None, {"page_id": "abc-123", "name": "Rockwell"}, True, True)
    assert "their page 'Rockwell'" in with_writer
    assert "edit_page without page_id" in with_writer
    assert "abc-123" not in with_writer
    ungrouped = george_loop._page_sentence(None, {"page_id": None, "name": None}, True, True)
    assert "ungrouped pins" in ungrouped and "cannot be edited" in ungrouped
    # Reader without writer: the sentence it always had.
    assert "edit_page" not in george_loop._page_sentence(
        None, {"page_id": "abc", "name": "Rockwell"}, True)


def test_the_context_carries_the_writer_and_the_loop_accepts_it():
    assert WriteContext().page_writer is None
    assert "page_writer" in inspect.signature(george_loop.run).parameters
    src = inspect.getsource(george_loop.run)
    assert "page_writer=page_writer" in src


def test_the_route_binds_the_writer_to_the_owner_and_the_scope():
    from pathlib import Path
    src = (Path(__file__).resolve().parents[1] / "backend" / "app" / "api" / "v1"
           / "routes" / "george.py").read_text(encoding="utf-8")
    assert "class _PageWriter:" in src
    ask = src[src.index("async def ask("):]
    assert "page_writer=_PageWriter(" in ask
    assert "user.username" in ask[ask.index("_PageWriter("):ask.index("_PageWriter(") + 300]
    # The writer's actor is George, in the conversation the request logs.
    assert "george_actor(spec.conversation_id)" in src
    # Every refusal type the service raises is a PageRefused to the model.
    for name in ("AmbiguousTarget", "NotAPage", "PageQuotaError", "SimilarPageError"):
        assert name in src[src.index("class _PageWriter:"):src.index("async def _resolve_scope")]
