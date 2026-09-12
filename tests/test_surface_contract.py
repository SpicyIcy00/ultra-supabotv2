"""
The surface: what George is told the user is looking at, and what his prose
may not say about it. Generative Workspace V3, 2026-09-09.

THREE THINGS UNDER TEST.

  1. agent/surface.py as pure functions. The work sentence is built from
     ARGUMENTS ONLY — it names metrics by their definitions' display names,
     the subject, the window and the comparison, and it can never contain a
     figure because it never reads a row. The prose scans find exactly the
     vocabulary metrics.yaml lists, as whole words, and nothing else.

  2. The loop's wiring. The sentence rides on the QUESTION (never the cached
     system prompt), from the newest George turn's calls; the scans emit
     warning frames and never rewrite the answer.

  3. The prompt and the definitions agree with the client. The SURFACE
     section is built from metrics.yaml; the refinement ops the yaml lists are
     the ops surfaceModel.ts closes over; the prompt's own examples no longer
     translate transactions into traffic; attention declares no score.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

pytest.importorskip("yaml")
import yaml                                                            # noqa: E402

from tools._common import load_defs                                    # noqa: E402
from agent import surface                                              # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_MODEL_TS = _ROOT / "frontend" / "src" / "components" / "george" / "surfaceModel.ts"
_ANCHOR_TS = _ROOT / "frontend" / "src" / "components" / "george" / "surfaceAnchor.ts"

DEFS = load_defs()

OPUS = [
    {"tool": "get_sales", "arguments": {"metric": "net_sales", "date_range": "last_week",
                                        "filters": {"store": "OPUS"}, "compare_to": "previous_period", "group_by": []}},
    {"tool": "get_sales", "arguments": {"metric": "transaction_count", "date_range": "last_week",
                                        "filters": {"store": "OPUS"}, "compare_to": "previous_period", "group_by": []}},
    {"tool": "get_sales", "arguments": {"metric": "average_transaction_value", "date_range": "last_week",
                                        "filters": {"store": "OPUS"}, "compare_to": "previous_period", "group_by": []}},
]


# ---------------------------------------------------------------- the sentence --

def test_work_sentence_names_the_work_from_arguments_only():
    line = surface.work_sentence(OPUS, DEFS)
    assert line is not None
    for metric in ("net_sales", "transaction_count", "average_transaction_value"):
        assert DEFS["metrics"][metric]["display_name"].lower() in line
    assert "for OPUS" in line
    assert "last week" in line
    assert "compared with the previous period" in line
    # Nothing here reads a row, so nothing here can carry a figure.
    assert not re.search(r"\d", line)


def test_work_sentence_is_deterministic_and_order_insensitive_for_subjects():
    a = surface.work_sentence(OPUS, DEFS)
    b = surface.work_sentence(OPUS, DEFS)
    assert a == b
    chain = [{"tool": "get_sales", "arguments": {"metric": "net_sales", "date_range": "last_week",
                                                  "group_by": "store", "compare_to": "previous_period"}}]
    assert "by store" in surface.work_sentence(chain, DEFS)


def test_work_sentence_is_absent_without_a_metric_read():
    assert surface.work_sentence([], DEFS) is None
    assert surface.work_sentence([{"tool": "get_stock", "arguments": {"store": "AJI BARN"}}], DEFS) is None


def test_work_sentence_lists_the_definitions_refinements():
    line = surface.work_sentence(OPUS, DEFS)
    for op in DEFS["surface"]["refinements"]:
        assert op.replace("_", " ") in line


# ------------------------------------------------------------------- the scans --

def test_leaked_terms_finds_the_listed_vocabulary_as_whole_words():
    found = surface.leaked_terms(
        "I used get_sales with rank_by='biggest_drop'. Unchanged from a moment ago.", DEFS)
    assert set(found) == {"get_sales", "rank_by", "biggest_drop", "unchanged from a moment ago"}
    # Business prose that merely contains a listed word inside another is clean.
    assert surface.leaked_terms("Net sales were compared with the previous week.", DEFS) == []
    assert surface.leaked_terms("The top five products by revenue.", DEFS) == []


def test_transaction_synonyms_are_read_only_beside_transactions():
    assert surface.transaction_synonyms("Transactions rose; more customers came in.", DEFS) == ["customers"]
    assert surface.transaction_synonyms("Suppliers: people are slow to reply.", DEFS) == []
    assert surface.transaction_synonyms("Transactions rose 11.6% and basket value 2.0%.", DEFS) == []


# ------------------------------------------------------------------- the loop --

def _loop():
    pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
    pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
    from agent import loop as george_loop
    return george_loop


def _drive(monkeypatch, replies, question, history=None):
    george_loop = _loop()
    from tests.test_convergence_cap_contract import FakeClient
    from tests.test_loop_correction_contract import StubLog
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0, "baseline": 2.0, "change_pct": -50.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00", "row_count": 1}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run(question, history=history)]

    return asyncio.run(collect()), fake.messages.requests


def _frames(frames, event):
    from tests.test_loop_correction_contract import frames_of
    return frames_of(frames, event)


def test_the_work_sentence_rides_on_the_question_not_the_system_prompt(monkeypatch):
    from tests.test_loop_correction_contract import _TextBlock
    history = [
        {"role": "user", "text": "How did OPUS do last week?", "tool_calls": []},
        {"role": "george", "text": "OPUS is up.", "tool_calls": OPUS},
    ]
    _, requests = _drive(monkeypatch, [[_TextBlock("Basket value led it.")]], "Why?", history)
    # The loop appends its own reply to the same list, so read the last USER
    # message rather than the last message.
    last_user = [m for m in requests[-1]["messages"] if m["role"] == "user"][-1]
    assert "[The work in front of the user:" in last_user["content"]
    assert "for OPUS" in last_user["content"]
    assert last_user["content"].rstrip().endswith("Why?")
    system = requests[-1]["system"]
    system_text = system if isinstance(system, str) else "".join(b.get("text", "") for b in system)
    assert "[The work in front of the user:" not in system_text


def test_no_history_means_no_work_sentence(monkeypatch):
    from tests.test_loop_correction_contract import _TextBlock
    _, requests = _drive(monkeypatch, [[_TextBlock("Nothing yet.")]], "How did OPUS do last week?")
    user_messages = [m for m in requests[-1]["messages"] if m["role"] == "user"]
    assert "[The work in front of the user:" not in user_messages[-1]["content"]


def test_leaks_and_transaction_wording_are_warned_never_rewritten(monkeypatch):
    from tests.test_loop_correction_contract import _TextBlock, answer_of
    text = "I ran get_sales for you. Transactions rose, so more customers came in."
    frames, requests = _drive(monkeypatch, [[_TextBlock(text)]], "How did OPUS do?")
    reasons = [w["reason"] for w in _frames(frames, "warning")]
    assert "tool_vocabulary_leaked" in reasons
    assert "transaction_wording" in reasons
    # One request: nothing was sent back to the model to fix.
    assert len(requests) == 1
    assert answer_of(frames) == text


def test_a_clean_answer_raises_no_prose_warning(monkeypatch):
    from tests.test_loop_correction_contract import _TextBlock
    frames, _ = _drive(monkeypatch, [[_TextBlock("OPUS is up on the previous week; basket value led it.")]],
                       "How did OPUS do?")
    reasons = [w["reason"] for w in _frames(frames, "warning")]
    assert "tool_vocabulary_leaked" not in reasons
    assert "transaction_wording" not in reasons


# ------------------------------------------------------ prompt and definitions --

def test_refinement_ops_agree_between_definitions_and_client():
    ops = DEFS["surface"]["refinements"]
    ts = _MODEL_TS.read_text(encoding="utf-8")
    m = re.search(r"SURFACE_OPS[^=]*=\s*\[([^\]]*)\]", ts)
    assert m, "surfaceModel.ts no longer declares SURFACE_OPS"
    client = re.findall(r"'([a-z_]+)'", m.group(1))
    assert sorted(client) == sorted(ops)


def test_identity_and_shape_are_declared_and_attention_has_no_score():
    s = DEFS["surface"]
    assert s["executes_nothing"] is True
    assert "window" in s["identity"] and "business" in s["identity"]
    assert "subjects" in s["shape"] and "grouping" in s["shape"]
    assert s["attention"]["score"] == "not_supported"
    assert s["attention"]["threshold"] == "not_supported"
    assert sorted(s["attention"]["reasons"]) == ["against_the_majority", "ranked_first"]
    # The client's subject-filter list is the server's.
    ts = _ANCHOR_TS.read_text(encoding="utf-8")
    for key in surface._SUBJECT_FILTERS:
        assert f"'{key}'" in ts


def test_every_tool_george_can_call_has_words_on_the_room_surface():
    """
    THE OWNER'S FEATURE 13: feel him working. That means the screen says what
    he is DOING, in words — "reading sales", not `get_sales {...}`, which is
    implementation detail dressed as progress.

    The room's map had stopped keeping up: thirteen tools — every one added in
    the last week, and every write — had no entry, so opening a shop, checking
    what he thinks, saving a rule and setting a watch all appeared as
    "thinking…". A tool with no words is a tool whose work is invisible.

    This fails the moment a tool is added without them.
    """
    import re
    from pathlib import Path

    from agent import composite_tools, loop, write_tools

    source = (Path(__file__).resolve().parents[1]
              / "frontend" / "src" / "room" / "Working.tsx").read_text(encoding="utf-8")
    block = source[source.index("export const WORDS"):source.index("function rows(")]
    named = set(re.findall(r"^\s{2}(\w+):\s*\[", block, re.M))

    every = (set(loop.TOOL_FUNCTIONS)
             | set(loop.FINDING_TOOL_FUNCTIONS)
             | set(write_tools.WRITE_TOOL_FUNCTIONS)
             | set(composite_tools.COMPOSITE_TOOL_FUNCTIONS))

    assert not (every - named), (
        f"these tools have no words on the room surface, so their work shows "
        f"as 'thinking…': {sorted(every - named)}"
    )
    assert not (named - every), (
        f"words for tools that do not exist: {sorted(named - every)}"
    )
