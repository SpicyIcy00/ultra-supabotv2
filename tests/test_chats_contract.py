"""
Chats are sessions, not pages.

NO DATABASE, NO API. Three things are under test, none of which needs either:

  1. The loop names the thread. A new chat's first turn IS the thread — its own
     conversation id — and a continued chat echoes the id it was given. Both
     arrive in the `start` and `done` frames, so the client can send the id
     back on the next turn.
  2. The log row carries the thread id, full notice objects and the receipts.
     george_log is INSERT-only, so nothing can be read back to check — the
     statement itself is inspected instead.
  3. A stored chat rebuilds into the same turn shape a live stream produces,
     legacy notice kinds included, so a reopened chat renders through the one
     conversation component.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                 # noqa: E402
from app.services.chat_history import (                               # noqa: E402
    LEGACY_NOTICE_SOURCE,
    TITLE_MAX,
    build_turns,
    normalise_notices,
    question_of,
    title_of,
)
from tests.test_loop_correction_contract import FakeClient, frames_of  # noqa: E402


def _drive(monkeypatch, replies, **run_kwargs):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)

    async def collect():
        return [f async for f in george_loop.run("net sales yesterday?", **run_kwargs)]

    return asyncio.run(collect())


# ---------------------------------------------------------------------------
# 1. The loop names the thread
# ---------------------------------------------------------------------------

def test_a_new_chat_is_its_own_thread(monkeypatch):
    frames = _drive(monkeypatch, ["₱13,544 at Rockwell on Wed 2 Sep 2026."])
    start = frames_of(frames, "start")[0]
    done = frames_of(frames, "done")[0]

    assert start["thread_id"] == start["conversation_id"]
    assert done["thread_id"] == start["thread_id"]
    uuid.UUID(start["thread_id"])          # a real id, not a placeholder


def test_a_continued_chat_echoes_the_thread_it_was_given(monkeypatch):
    thread = str(uuid.uuid4())
    frames = _drive(monkeypatch, ["Same again."], thread_id=thread)
    start = frames_of(frames, "start")[0]
    done = frames_of(frames, "done")[0]

    assert start["thread_id"] == thread
    assert done["thread_id"] == thread
    # This turn is a NEW row in the thread, not the thread's first row.
    assert start["conversation_id"] != thread


# ---------------------------------------------------------------------------
# 2. The log row
# ---------------------------------------------------------------------------

def test_the_log_row_carries_thread_notices_and_receipts(monkeypatch):
    captured: list[tuple[str, tuple]] = []
    log = george_loop.ConversationLog(thread_id="thread-1")
    monkeypatch.setattr(log, "_exec", lambda sql, params: captured.append((sql, params)))

    notice = {"kind": "low_stock_not_operational", "message": "Thresholds unset.",
              "source": "metrics.yaml: inventory"}
    receipts = {"source_table": "inventory", "snapshot_timestamp": "2026-09-03T15:00:00+00:00"}
    log.conversation(
        user_id="admin", asked_at=datetime.now(timezone.utc), question="low stock?",
        final_answer="None — thresholds are unset.", iterations=1, status="ok",
        notices=[notice], receipts=receipts,
    )

    sql, params = captured[0]
    assert "thread_id" in sql and "receipts" in sql
    assert params[1] == "thread-1"
    # Full objects, not bare kinds: a reopened answer must show its caveat in words.
    assert json.loads(params[11]) == [notice]
    assert json.loads(params[14]) == receipts


def test_a_new_log_defaults_its_thread_to_itself():
    log = george_loop.ConversationLog()
    assert log.thread_id == log.conversation_id


# ---------------------------------------------------------------------------
# 3. Rebuilding a stored chat
# ---------------------------------------------------------------------------

def test_title_is_the_first_question_on_one_line():
    assert title_of("  What were\nnet sales   yesterday? ") == "What were net sales yesterday?"
    assert title_of(None) == "Untitled chat"
    long = "Let's build a reorder workflow for AJI BARN. What's moving, what's dead, and " \
           "what should we order from Dried Fruits this week?"
    t = title_of(long)
    # 40 characters plus the ellipsis, cut on a word boundary. A rail is
    # navigation: the full question travels beside the title for the hover.
    assert t.endswith("…") and len(t) <= TITLE_MAX + 1
    assert not t[:-1].endswith(" ")
    assert t[:-1] in long, "the title must be a prefix of the question, not a paraphrase"


def test_a_single_word_longer_than_the_limit_is_cut_hard():
    # No boundary to find. Better a hard cut than a title that is only "…".
    t = title_of("x" * 60)
    assert t == "x" * TITLE_MAX + "…"


def test_the_full_question_travels_beside_the_title():
    # The hover shows what the label was cut FROM, so the two derivations have
    # to agree about everything except the cut.
    raw = "  How much did Rockwell   sell\nlast week compared with last year? "
    whole = question_of(raw)
    assert whole == "How much did Rockwell sell last week compared with last year?"
    assert title_of(raw).rstrip("…").rstrip(" ,;:") in whole
    assert question_of(None) == ""


def test_legacy_notice_kinds_become_notices_that_say_so():
    out = normalise_notices(["stale_sources", {"kind": "x", "message": "m", "source": "s"}, 7])
    assert [n["kind"] for n in out] == ["stale_sources", "x"]
    assert out[0]["source"] == LEGACY_NOTICE_SOURCE
    assert "not kept" in out[0]["message"]
    assert out[1] == {"kind": "x", "message": "m", "source": "s"}


def _row(cid, thread, question, answer, status="ok", notices=None, receipts=None):
    return {
        "id": cid, "thread_id": thread,
        "asked_at": datetime(2026, 9, 3, 15, 41, tzinfo=timezone.utc),
        "logged_at": datetime(2026, 9, 3, 15, 42, tzinfo=timezone.utc),
        "question": question, "final_answer": answer, "iterations": 2,
        "input_tokens": 10, "output_tokens": 5, "cache_read_tokens": 3,
        "notices": notices, "notice_forced": False, "status": status,
        "receipts": receipts,
    }


def test_a_stored_chat_rebuilds_as_alternating_turns_with_calls_in_seq_order():
    thread = uuid.uuid4()
    c1, c2 = thread, uuid.uuid4()
    rows = [
        _row(c1, thread, "net sales yesterday?", "₱13,544.", receipts={"source_table": "new_transactions"}),
        _row(c2, thread, "and last week?", "", status="api_error"),
    ]
    calls = {
        str(c1): [
            {"seq": 2, "tool": "get_sales", "arguments": {"date_range": "yesterday"},
             "row_count": 1, "truncated": False, "source_table": "new_transactions",
             "duration_ms": 40, "error": None},
            {"seq": 1, "tool": "get_sales", "arguments": {"date_range": "bogus"},
             "row_count": None, "truncated": None, "source_table": None,
             "duration_ms": 3, "error": "Unknown date_range"},
        ],
    }
    pins = {str(c1): [{"id": uuid.uuid4(), "title": "Net sales", "page": None,
                       "tool_calls": [{"tool": "get_sales", "arguments": {}}]}]}

    turns = build_turns(rows, calls, pins, {None: 2}, {str(c2): "APIStatusError: 529"})

    assert [t["role"] for t in turns] == ["user", "george", "user", "george"]
    g1 = turns[1]
    # Calls keep the order they were given (the route orders by seq) and keep
    # their error field — the client's own history filter drops errored ones.
    assert [c["seq"] for c in g1["tool_calls"]] == [2, 1]
    assert g1["tool_calls"][1]["result"]["error"] == "Unknown date_range"
    assert g1["receipts"] == {"source_table": "new_transactions"}
    assert g1["pinned"][0]["page"] is None and g1["pinned"][0]["pins_on_page"] == 2
    assert g1["done"]["thread_id"] == str(thread)
    assert g1["done"]["tool_calls"] == 2 and g1["done"]["cache_hit"] is True
    assert g1["error"] is None

    g2 = turns[3]
    assert g2["text"] == "" and g2["done"]["status"] == "api_error"
    assert g2["error"] == "APIStatusError: 529"
    assert g2["tool_calls"] == [] and g2["pinned"] == []


def test_a_row_without_a_thread_is_its_own_thread():
    cid = uuid.uuid4()
    turns = build_turns([_row(cid, None, "q", "a")], {}, {}, {}, {})
    assert turns[1]["done"]["thread_id"] == str(cid)
