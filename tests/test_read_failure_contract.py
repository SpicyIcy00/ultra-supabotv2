"""
A read the database stops is a refusal in words; a turn that breaks is a
sentence, never an exception. 2026-09-16, off two of the owner's screenshots.

NO DATABASE, NO API. The loop is driven with the same fakes the correction and
convergence contracts use.

WHAT WENT WRONG, twice, in one morning:

  1. "can we make a ordering system from @Judy JUD001 supplier?" — the
     supplier's purchase plan ran past george_ro's 30 s statement_timeout.
     `_call_tool` caught ValueError, KeyError and RuntimeError, and a
     `psycopg.errors.QueryCanceled` is none of those, so it went past every
     handler in run() to the last one, which streamed it raw. The whole
     answer on screen: "QueryCanceled: canceling statement due to statement
     timeout". UI rule 4 in as many words: raw diagnostics never reach the
     answer.
  2. "that monday was a holiday" — a good answer, then
     `[Calls behind this answer: compose({...}), record_belief({...})]`.
     Every prior Bob turn in the seeded history ended with that marker,
     so the model ended its own the same way.
"""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

import psycopg                                                          # noqa: E402

from agent import loop as bob_loop                                   # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse    # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock     # noqa: E402
from tools._common import load_defs, req                                # noqa: E402

DEFS = load_defs()
ROOT = Path(__file__).resolve().parents[1]

RAW = "canceling statement due to statement timeout"


# ---------------------------------------------------------------------------
# 1. The definitions, and the number they carry
# ---------------------------------------------------------------------------

def test_the_timeout_the_sentence_names_is_the_one_the_role_carries():
    """
    The sentence says "the 30-second limit". That number lives in
    tools/george_ro_role.sql, so the yaml is held to it: a role file changed
    without the definition would tell the owner a limit that is not the one
    that stopped his read.
    """
    declared = int(req(DEFS, "failures.reads.statement_timeout_s"))
    sql = (ROOT / "tools" / "george_ro_role.sql").read_text(encoding="utf-8")
    m = re.search(r"ALTER ROLE george_ro SET statement_timeout = '(\d+)s'", sql)
    assert m, "the role file no longer sets a statement_timeout in seconds"
    assert int(m.group(1)) == declared


def test_every_failure_sentence_is_plain_and_names_no_exception():
    for path in ("failures.reads.timed_out", "failures.reads.database",
                 "failures.turn.model_unavailable", "failures.turn.unhandled"):
        text = str(req(DEFS, path))
        assert text.strip(), path
        for word in ("QueryCanceled", "Error", "exception", "Traceback", "psycopg"):
            assert word not in text, f"{path} names the machinery: {word}"


# ---------------------------------------------------------------------------
# 2. A read the database stops is a refusal, not an escape
# ---------------------------------------------------------------------------

def _tool_that_times_out(**_kw):
    raise psycopg.errors.QueryCanceled(RAW)


def _tool_that_breaks(**_kw):
    raise psycopg.errors.UndefinedTable('relation "nope" does not exist')


def test_a_query_timeout_returns_a_refusal_in_words(monkeypatch):
    monkeypatch.setitem(bob_loop.TOOL_FUNCTIONS, "get_sales", _tool_that_times_out)
    payload, err, _ms = asyncio.run(bob_loop._call_tool("get_sales", {}))
    assert err, "the timeout must come back as an error result, not raise"
    seconds = int(req(DEFS, "failures.reads.statement_timeout_s"))
    assert f"{seconds}-second limit" in err
    assert RAW not in err and "QueryCanceled" not in err
    assert payload["rows"] == [] and payload["meta"]["error"] == err
    # The raw text survives for the gap log, on the key run() strips.
    assert RAW in payload[bob_loop.DIAGNOSTIC_KEY]


def test_any_other_database_error_is_a_refusal_too(monkeypatch):
    monkeypatch.setitem(bob_loop.TOOL_FUNCTIONS, "get_sales", _tool_that_breaks)
    payload, err, _ms = asyncio.run(bob_loop._call_tool("get_sales", {}))
    assert err == " ".join(str(req(DEFS, "failures.reads.database")).split())
    assert "UndefinedTable" in payload[bob_loop.DIAGNOSTIC_KEY]


def test_the_three_refusal_classes_still_come_back_the_same_way(monkeypatch):
    def refuses(**_kw):
        raise ValueError("compare_to='previous_period' needs a closed window")
    monkeypatch.setitem(bob_loop.TOOL_FUNCTIONS, "get_sales", refuses)
    _payload, err, _ms = asyncio.run(bob_loop._call_tool("get_sales", {}))
    assert err == "compare_to='previous_period' needs a closed window"


def test_a_timed_out_read_reaches_the_model_as_words_and_the_turn_still_answers(monkeypatch):
    """
    End to end: the read times out, the model is told the sentence, the model
    answers, and nothing raw is in any frame or in what the model was sent.
    """
    monkeypatch.setitem(bob_loop.TOOL_FUNCTIONS, "get_purchase_plan", _tool_that_times_out)
    fake = FakeClient([
        [_ToolUse("tu-1", "get_purchase_plan", {"supplier": "Judy JUD001"})],
        [_TextBlock("I couldn't read Judy's plan in the time one read is allowed; "
                    "ask me for their list first and I'll go supplier by supplier.")],
    ])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("make an ordering system from Judy")]
    frames = asyncio.run(collect())
    text = "\n".join(frames)
    assert "event: done" in text
    assert "event: error" not in text, "a timed-out read is not a broken turn"
    assert RAW not in text and "QueryCanceled" not in text
    sent = json.dumps(fake.messages.requests, default=str)
    assert "QueryCanceled" not in sent and RAW not in sent
    assert "second limit" in sent, "the model was not told the sentence"


# ---------------------------------------------------------------------------
# 3. A turn that breaks is a sentence
# ---------------------------------------------------------------------------

class _ClientThatBreaks:
    class messages:                                    # noqa: N801 - mirrors the SDK
        @staticmethod
        def stream(**_kw):
            raise RuntimeError("ZZ-RAW-EXCEPTION-TEXT")


def test_an_unhandled_exception_is_told_in_words_and_logged_raw(monkeypatch):
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: _ClientThatBreaks())
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("how are we doing?")]
    frames = asyncio.run(collect())
    errors = [json.loads(f.split("data: ", 1)[1]) for f in frames if f.startswith("event: error")]
    assert errors, "no error frame"
    assert errors[0]["message"] == " ".join(str(req(DEFS, "failures.turn.unhandled")).split())
    assert "ZZ-RAW-EXCEPTION-TEXT" not in "\n".join(frames)
    # And the raw text went where it belongs.
    log = StubLog.instances[-1]
    gaps = [p for sql, p in log.statements if "INTO george.gaps" in sql]
    assert any("ZZ-RAW-EXCEPTION-TEXT" in json.dumps(p, default=str) for p in gaps)


# ---------------------------------------------------------------------------
# 4. The call list is not something the model can copy
# ---------------------------------------------------------------------------

SALES = {"tool": "get_sales", "arguments": {"group_by": "store", "date_range": "last_month"}}


def test_the_call_list_opens_the_turn_after_the_answer_not_the_answer_itself():
    messages = bob_loop._seed_history([
        {"role": "user", "text": "how did we do", "tool_calls": []},
        {"role": "bob", "text": "OPUS led.", "tool_calls": [SALES]},
        {"role": "user", "text": "why?", "tool_calls": []},
        {"role": "bob", "text": "Footfall.", "tool_calls": []},
    ], {})
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
    assert messages[1]["content"] == "OPUS led."
    assert messages[2]["content"].startswith(bob_loop.HISTORY_MARKER)
    assert "get_sales(" in messages[2]["content"] and messages[2]["content"].endswith("why?")


def test_an_answer_with_no_turn_after_it_keeps_its_list():
    """The pin follow-up copies arguments out of the LAST message; it must still find them."""
    messages = bob_loop._seed_history([
        {"role": "user", "text": "q", "tool_calls": []},
        {"role": "bob", "text": "a", "tool_calls": [SALES]},
    ], {})
    assert bob_loop.HISTORY_MARKER in messages[-1]["content"]
    assert messages[-1]["role"] == "assistant"


def test_an_echoed_call_list_is_stripped_from_the_answer():
    said = ("That settles it — a holiday Monday.\n\n[Calls behind this answer: "
            "compose({\"blocks\": []}), record_belief({\"beliefs\": []})]")
    answer, echoed = bob_loop._strip_history_marker(said)
    assert echoed and answer == "That settles it — a holiday Monday."
    # An unterminated echo — the history is cut at MAX_HISTORY_TEXT — goes too.
    answer, echoed = bob_loop._strip_history_marker("Fine.\n\n[Calls behind this answer: compose({")
    assert echoed and answer == "Fine."
    # And an answer with none is untouched.
    assert bob_loop._strip_history_marker("Fine.") == ("Fine.", False)


def test_the_echo_is_stripped_in_the_loop_and_recorded(monkeypatch):
    fake = FakeClient([[_TextBlock("Nothing to read.\n\n[Calls behind this answer: compose({})]")]])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("anything?")]
    frames = asyncio.run(collect())
    text = "\n".join(frames)
    assert "history_marker_echoed" in text
    done = [json.loads(f.split("data: ", 1)[1]) for f in frames if f.startswith("event: done")]
    assert done and "[Calls behind" not in json.dumps(done[0])


# ---------------------------------------------------------------------------
# 3. A call its tool cannot take is a refusal he can correct (dogfood
#    2026-09-18: the Sonnet 5 trial sent get_sales without group_by, and the
#    TypeError ended 3 of 7 turns as "Something broke on my side")
# ---------------------------------------------------------------------------

def test_a_missing_required_argument_comes_back_naming_it():
    payload, err, _ms = asyncio.run(bob_loop._call_tool(
        "get_sales", {"date_range": "last_week", "metric": "net_sales"}))
    assert err and "get_sales was not run" in err and "it needs group_by" in err
    assert payload["rows"] == [] and payload["meta"]["error"] == err


def test_an_argument_the_tool_does_not_take_comes_back_naming_it():
    _payload, err, _ms = asyncio.run(bob_loop._call_tool(
        "get_sales", {"group_by": "store", "date_range": "last_week", "shop": "OPUS"}))
    assert err and "it takes no shop" in err and "filters" in err


def test_a_tool_that_does_not_exist_is_refused_not_raised():
    _payload, err, _ms = asyncio.run(bob_loop._call_tool("get_weather", {}))
    assert err and "get_weather" in err


def test_a_type_error_inside_a_tool_is_not_blamed_on_the_arguments(monkeypatch):
    """Only the signature decides 'you called it wrong'; a bug inside stays a bug."""
    def broken(group_by, date_range):
        raise TypeError("unsupported operand")
    monkeypatch.setitem(bob_loop.TOOL_FUNCTIONS, "get_sales", broken)
    with pytest.raises(TypeError, match="unsupported operand"):
        asyncio.run(bob_loop._call_tool("get_sales", {"group_by": "store", "date_range": "x"}))


def test_the_turn_survives_a_call_missing_an_argument(monkeypatch):
    fake = FakeClient([
        [_ToolUse("t1", "get_sales", {"date_range": "last_week"})],
        [_TextBlock("I could not read that.")],
    ])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("net sales last week")]
    frames = asyncio.run(collect())
    done = [json.loads(f.split("data: ", 1)[1]) for f in frames if f.startswith("event: done")]
    assert done and done[0]["status"] == "ok"
    sent = [b for m in fake.messages.requests[-1]["messages"] if m["role"] == "user"
            and isinstance(m["content"], list) for b in m["content"]
            if isinstance(b, dict) and b.get("type") == "tool_result"]
    assert sent and sent[0].get("is_error") and "it needs group_by" in sent[0]["content"]
