"""A failed write records what broke, and tells the model only that it broke.

THE DEFECT, from the dogfood log. On 2026-09-03 two workflow saves failed and
george.gaps recorded, both times:

    The workflow could not be saved: ProgrammingError. The answer above is
    unaffected; tell the user it did not save.

That sentence is the RIGHT thing to tell the model — raw diagnostics must not
reach an answer (UI rule 4) — and it was also the only thing written to the
log, so what actually failed is not recoverable from those rows at all. A
defect feed that records THAT a write broke and nothing about HOW cannot be
swept, which is the whole point of ops/sweep_gaps.py.

Nothing was ever lost. Every one of those routes raises `from exc`, so the real
exception has been sitting on __cause__ and read by nobody.

Two properties, and they pull in opposite directions — which is why both are
held here:

    the model sees the sanitised sentence and NOTHING else
    the gap row carries the cause
"""
from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop  # noqa: E402
from tests.test_loop_correction_contract import StubLog  # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse  # noqa: E402

SANITISED = ("The workflow could not be saved: ProgrammingError. The answer "
             "above is unaffected; tell the user it did not save.")

# A marker that cannot occur anywhere else in a request. The tool SCHEMAS are
# part of what is sent to the model and they contain ordinary English — an
# earlier version of this file searched for "does not exist" and matched a
# get_sales parameter description.
CAUSE = 'column "intent" does not exist [ZZ-CAUSE-MARKER]'


def _raised_from(inner: BaseException, message: str) -> BaseException:
    """The exact shape routes/george.py raises: a sanitised sentence, `from exc`."""
    try:
        raise inner
    except BaseException as exc:  # noqa: BLE001
        try:
            raise RuntimeError(message) from exc
        except RuntimeError as outer:
            return outer


# ---------------------------------------------------------------------------
# The two halves, as units
# ---------------------------------------------------------------------------
def test_the_model_is_told_only_that_it_broke():
    exc = _raised_from(ValueError(CAUSE), SANITISED)
    payload, err, _ms = george_loop._refusal(exc, 0.0)
    assert err == SANITISED
    assert payload["meta"]["error"] == SANITISED
    assert "ZZ-CAUSE-MARKER" not in err
    assert "ZZ-CAUSE-MARKER" not in payload["meta"]["error"]


def test_the_cause_is_carried_beside_it():
    exc = _raised_from(ValueError(CAUSE), SANITISED)
    payload, _err, _ms = george_loop._refusal(exc, 0.0)
    assert CAUSE in payload[george_loop.DIAGNOSTIC_KEY]


def test_a_refusal_with_no_cause_carries_no_diagnostic():
    """
    A read tool refusing says the whole truth in its own message — there is no
    second half, and an empty key would be noise in every row.
    """
    payload, _err, _ms = george_loop._refusal(ValueError("Unknown store 'Narnia'."), 0.0)
    assert george_loop.DIAGNOSTIC_KEY not in payload


def test_a_chain_of_causes_is_followed_but_bounded():
    inner = _raised_from(KeyError("deepest"), "middle")
    outer = _raised_from(inner, SANITISED)
    diagnostic = george_loop._refusal(outer, 0.0)[0][george_loop.DIAGNOSTIC_KEY]
    assert "middle" in diagnostic and "deepest" in diagnostic
    assert len(diagnostic) <= 1500


def test_a_credential_in_the_cause_is_redacted():
    """
    A connection error carries the URL and the URL carries a password. The gap
    log is a row a person reads, so it gets the same rule as a shell probe —
    see CLAUDE.md, "Never print a secret's value".
    """
    exc = _raised_from(
        OSError("could not connect: postgresql://george_log:hunter2@db.host:5432/postgres"),
        "The workflow could not be saved: OSError.")
    diagnostic = george_loop._refusal(exc, 0.0)[0][george_loop.DIAGNOSTIC_KEY]
    assert "hunter2" not in diagnostic
    assert "george_log:hunter2" not in diagnostic
    # Still useful: the host and the failure survive.
    assert "db.host" in diagnostic and "could not connect" in diagnostic


# ---------------------------------------------------------------------------
# End to end, through the loop
# ---------------------------------------------------------------------------
def _drive_a_failing_write(monkeypatch):
    """One turn whose save_workflow fails the way the real route fails."""
    replies = [
        [_ToolUse("tu-1", "save_workflow",
                  {"name": "Top sellers", "steps": [], "parameters": []})],
        "It did not save.",
    ]
    # ONE client, kept — what it recorded is what the model was actually sent,
    # and that is the surface this file exists to police. An earlier version of
    # this helper built a second FakeClient to return, so the leak assertions
    # were reading an empty request list and passed against a deliberately
    # broken loop.
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)

    async def failing_write(name, args, ctx):
        return george_loop._refusal(
            _raised_from(ValueError(CAUSE), SANITISED), 0.0)

    monkeypatch.setattr(george_loop, "_call_write_tool", failing_write)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def writer(spec):                    # presence enables the tool
        raise AssertionError("not reached")

    async def collect():
        return [f async for f in george_loop.run(
            "add top sellers by sales not units", workflow_writer=writer)]

    frames = asyncio.run(collect())
    return frames, StubLog.instances[-1], fake.messages.requests


def test_the_gap_row_carries_the_sanitised_sentence_and_the_cause(monkeypatch):
    _frames, log, _ = _drive_a_failing_write(monkeypatch)
    gaps = [params for sql, params in log.statements if "INTO george.gaps" in sql]
    refused = [p for p in gaps if p[2] == "tool_refused"]
    assert refused, "a failed write must be recorded"
    detail = refused[0][4]
    # The sentence FIRST, so a truncated row still says what the model was told.
    assert detail.startswith(SANITISED)
    # And the half that was missing.
    assert CAUSE in detail


def test_the_diagnostic_never_reaches_the_model(monkeypatch):
    """
    The half that must not leak, and the one that needs care to test.

    `_truncate` returns the SAME dict object when the rows fit — and a refusal
    has no rows — so the payload the model is sent IS the payload the
    diagnostic travelled on. Only the strip in run() separates them. This
    asserts on what the client recorded being sent, which is the surface that
    matters; asserting on the SSE frames instead passes against a loop with the
    strip deliberately removed.
    """
    _frames, _log, requests = _drive_a_failing_write(monkeypatch)
    assert requests, "the model was never called"
    sent = json.dumps(requests, default=str)
    assert george_loop.DIAGNOSTIC_KEY not in sent, "the transport key reached the model"
    assert "ZZ-CAUSE-MARKER" not in sent, "the cause reached the model"
    # The sanitised sentence did reach it — the tool still reports the failure.
    assert "could not be saved" in sent


def test_the_diagnostic_never_reaches_the_client_either(monkeypatch):
    frames, _log, _requests = _drive_a_failing_write(monkeypatch)
    streamed = json.dumps(frames)
    assert george_loop.DIAGNOSTIC_KEY not in streamed
    assert "ZZ-CAUSE-MARKER" not in streamed


def test_the_leak_test_actually_bites(monkeypatch):
    """
    A guard on the guard. If run() stops stripping, the payload the model is
    sent carries the cause — so this reproduces that by hand and proves the
    assertion above would catch it, rather than passing for some other reason.
    """
    payload, _err, _ms = george_loop._refusal(
        _raised_from(ValueError(CAUSE), SANITISED), 0.0)
    unstripped = george_loop._truncate(payload)
    assert unstripped is payload, "_truncate passes a rowless payload straight through"
    assert george_loop.DIAGNOSTIC_KEY in json.dumps(unstripped), (
        "without the strip the cause is in what the model would be sent"
    )
