"""
The big answers as designed pages, and a dashboard that is a dashboard
(W2.4, 2026-09-22).

From the research: every product that feels designed uses a fixed human
design, an outline first, a few layouts and restraint. Until now Bob laid out
every broad page himself on `arrangement`, and no two read alike. Now he PICKS
a page type (composition.page_types) and writes into its slots; code builds the
tree to the design — the section order, where a figure sits against its words,
the caveat's place and the plan's — and that tree is checked exactly as
any arrangement is, so no digit of his and no figure but by {key} reaches it.

And "build me a dashboard" was a broad question answered as a report. It is its
own effort kind now, told to build a kept page (create_page) instead of a size,
held to no page of its own, and the room opens the page it built.

NO DATABASE, NO API.
"""
from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import compose                                                      # noqa: E402
from agent import loop as bob_loop                                             # noqa: E402
from tests.test_convergence_cap_contract import FakeClient                     # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock            # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()
TYPES = req(DEFS, "composition.page_types")


def _call(rows):
    return {"tool": "get_sales", "arguments": {"metric": "net_sales"}, "error": None,
            "duplicate": False, "is_read": True, "rows": rows,
            "meta": {"row_count": len(rows), "source_table": "new_transactions",
                     "filters_applied": [], "snapshot_timestamp": "2026-09-21T12:25:00+08:00"}}


ONE = [{"value": 1621528.0, "baseline": 1698060.0, "change": -76532.0, "change_pct": -4.5,
        "baseline_status": "ok"}]
SHOPS = [{"store": "OPUS", "value": 450944.0, "baseline": 467102.0, "change_pct": -3.5},
         {"store": "Greenhills", "value": 241519.0, "baseline": 278266.0, "change_pct": -13.2}]
CALLS = {0: _call(ONE), 1: _call(SHOPS), 2: _call(SHOPS), 3: _call(SHOPS), 4: _call(SHOPS)}
BLOCKS = [
    {"op": "put", "key": "net", "kind": "figure", "seq": 0, "weight": "lead", "claim": "down on the week"},
    {"op": "put", "key": "days", "kind": "line", "seq": 1, "weight": "supporting", "claim": "one Saturday"},
    {"op": "put", "key": "shops", "kind": "dumbbell", "seq": 2, "weight": "supporting", "claim": "three carry it"},
    {"op": "put", "key": "fell", "kind": "contributors", "seq": 3, "weight": "supporting", "claim": "what fell"},
    {"op": "put", "key": "rose", "kind": "contributors", "seq": 4, "weight": "supporting", "claim": "what rose"},
]
READING = {"claim": "We are down on the week", "caveat": "Many stock counts are below zero.",
           "next": ["Ask Greenhills what changed."]}
# WRITTEN OUT OF ORDER ON PURPOSE: the order on the page is the type's.
WEEK = {"type": "week", "lede": "We took {net} {net.change} last week.",
        "sections": {
            "moved": {"head": "What moved on the shelf", "figures": ["fell", "rose"],
                      "says": ["The kiamoy money moved rather than left."]},
            "when": {"head": "Most of the gap is one day", "figures": ["days"],
                     "says": ["Saturday carried it.", "The other days held."]},
            "where": {"head": "Three shops carry it", "figures": ["shops"],
                      "says": ["**Greenhills gave back the most.**"]},
        }}


def _compose(page, *, reading=READING, size="broad", ceiling="broad", arrangement=None):
    return compose.compose(blocks=[dict(b) for b in BLOCKS], reading=reading, page=page,
                           arrangement=arrangement, size=size, ceiling=ceiling,
                           calls=CALLS, defs=DEFS, question="how are we doing?")["meta"]


def _leaves(tree):
    out = []
    for kid in tree.get("children") or []:
        out.append(kid)
    return out


# ------------------------------------------------------------ the types exist

def test_the_types_are_the_designs_three():
    assert set(TYPES["types"]) == {"week", "finding", "comparison"}
    for name, t in TYPES["types"].items():
        assert any((s or {}).get("required") for s in t["sections"].values()), name
        assert t["caveat_in"] in t["sections"], name
    assert TYPES["applies_to_sizes"] == ["broad"]


# ------------------------------------------------- code builds it to the design

def test_a_week_page_is_built_in_the_types_order_whatever_order_he_wrote():
    meta = _compose(WEEK)
    tree = meta["arrangement"]
    assert tree["type"] == "week"
    kids = _leaves(tree)
    heads = [k["head"] for k in kids if "head" in k]
    assert heads == ["Most of the gap is one day", "Three shops carry it",
                     "What moved on the shelf"]
    assert "lede" in kids[0]
    # A FIGURE COMES BEFORE ITS WORDS, so the room sets it beside them.
    at = next(i for i, k in enumerate(kids) if k.get("block") == "days")
    assert kids[at + 1] == {"say": "Saturday carried it."}
    # WHAT FELL FACES WHAT ROSE, in a row, under the words that read them.
    row = next(k for k in kids if k.get("layout") == "row")
    assert [c["block"] for c in row["children"]] == ["fell", "rose"]
    # HIS CAVEAT is the margin note of the section the type says it qualifies.
    moved = next(i for i, k in enumerate(kids) if k.get("head") == "What moved on the shelf")
    assert kids[moved + 1] == {"caveat": True}
    # THE PLAN LAST; the room draws its heading, so the tree adds none.
    assert kids[-1] == {"next": True} and "head" not in kids[-2]


def test_every_block_is_on_the_page_and_the_figure_in_the_lede_is_a_reference():
    meta = _compose(WEEK)
    assert not [c for c in meta["coerced"] if "NOT on the page" in c]
    assert "{net}" in meta["arrangement"]["children"][0]["lede"]


def test_a_figure_already_in_his_sentence_does_not_take_the_sections_drawing():
    # His first live week page named the estate's total in the lede AND first
    # among the shops' section figures: placed twice, it was dropped, and the
    # shops' dumbbell went after the words as an extra.
    page = {**WEEK, "sections": {**WEEK["sections"],
                                 "where": {"head": "Three shops carry it",
                                           "figures": ["net", "shops"],
                                           "says": ["Greenhills gave back the most."]}}}
    meta = _compose(page)
    kids = meta["arrangement"]["children"]
    at = next(i for i, k in enumerate(kids) if k.get("head") == "Three shops carry it")
    assert kids[at + 1] == {"block": "shops"}
    assert kids[at + 2] == {"say": "Greenhills gave back the most."}
    assert not [c for c in meta["coerced"] if "already placed" in c]


def test_a_digit_of_his_is_caught_exactly_as_on_any_page():
    page = {**WEEK, "sections": {**WEEK["sections"],
                                 "when": {"head": "Most of it is one day", "figures": ["days"],
                                          "says": ["Saturday took 339,293 pesos."]}}}
    meta = _compose(page)
    assert "339,293" not in str(meta["arrangement"])
    assert any("carries no digits" in c for c in meta["coerced"])


def test_a_required_section_left_out_is_named_and_the_page_still_stands():
    page = {**WEEK, "sections": {k: v for k, v in WEEK["sections"].items() if k != "where"}}
    meta = _compose(page)
    assert meta["arrangement"]["type"] == "week"
    assert any("needs its 'where' section" in c for c in meta["coerced"])


def test_a_type_that_does_not_exist_is_no_page_and_says_which_do():
    meta = _compose({"type": "dashboard", "lede": "x", "sections": {}})
    assert meta["arrangement"] is None
    assert any("is not a page type" in c for c in meta["coerced"])


def test_a_section_the_type_does_not_have_is_left_out_and_named():
    page = {**WEEK, "sections": {**WEEK["sections"], "shelf": {"head": "x", "says": ["y"]}}}
    meta = _compose(page)
    assert any("has no 'shelf' section" in c for c in meta["coerced"])


def test_paragraphs_past_the_sections_bound_are_cut_and_said():
    most = int(TYPES["max_says_per_section"])
    page = {**WEEK, "sections": {**WEEK["sections"],
                                 "when": {"head": "One day", "figures": ["days"],
                                          "says": [f"Paragraph {'abcdefgh'[i]}." for i in range(most + 2)]}}}
    meta = _compose(page)
    assert sum(1 for k in meta["arrangement"]["children"]
               if str(k.get("say", "")).startswith("Paragraph")) == most


def test_a_page_type_replaces_a_free_arrangement_and_says_so():
    meta = _compose(WEEK, arrangement={"layout": "stack", "children": [{"lede": "mine"}]})
    assert meta["arrangement"]["type"] == "week"
    assert any("laid out by its type" in c for c in meta["coerced"])


def test_a_page_on_a_focused_answer_is_left_out_like_any_page():
    meta = _compose(WEEK, size="focused", ceiling="focused")
    assert meta["arrangement"] is None


def test_no_caveat_places_no_margin_note_and_no_next_places_no_plan():
    meta = _compose(WEEK, reading={"claim": "We are down on the week"})
    kids = meta["arrangement"]["children"]
    assert {"caveat": True} not in kids and {"next": True} not in kids


# ------------------------------------------------------ he is told what he makes

def test_the_compose_tool_offers_the_types_and_says_the_page_is_one():
    schema = next(t for t in bob_loop.build_tool_schemas() if t["name"] == "compose")
    page = schema["input_schema"]["properties"]["page"]
    assert page["properties"]["type"]["enum"] == list(TYPES["types"])
    for name, t in TYPES["types"].items():
        for section in t["sections"]:
            assert section in page["properties"]["sections"]["properties"]
    assert "DESIGNED PAGE" in schema["description"]
    about = " ".join(str(TYPES["about"]).split())
    assert about in bob_loop._board_addendum(DEFS)
    # The free layout is the exception now, and he is told so.
    assert "no type fits" in bob_loop._board_addendum(DEFS)


# ------------------------------------------------ a dashboard is a dashboard

def test_a_dashboard_is_its_own_kind_and_never_a_broad_report():
    for q in ("build me a dashboard", "can you make me a sales dashboard"):
        _level, kind = bob_loop.turn_effort(q, None, DEFS)
        assert kind == req(DEFS, "composition.dashboard.effort_kind") == "dashboard"
        # Held to no page of its own: the page is the kept one it builds.
        ceiling = bob_loop.size_ceiling(kind, DEFS)
        assert not compose.size_spec(ceiling, DEFS).get("page")
    assert "dashboard" not in req(DEFS, "effort.kinds.broad.phrases")
    assert bob_loop.turn_effort("how are we doing?", None, DEFS)[1] == "broad"


def test_a_dashboard_is_told_to_build_the_kept_page_not_a_size(monkeypatch):
    fake = FakeClient([[_TextBlock("Built it.")]])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("build me a dashboard")]

    asyncio.run(collect())
    first = fake.messages.requests[0]
    question = next(m["content"] for m in first["messages"]
                    if m["role"] == "user" and isinstance(m["content"], str))
    told = " ".join(str(req(DEFS, "composition.dashboard.sentence")).split())
    assert told in question and "create_page" in told
    assert "[This message may be answered" not in question
    assert told not in bob_loop.SYSTEM_PROMPT
