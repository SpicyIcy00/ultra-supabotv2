"""
The loop's correction of a pin that was claimed but never made.

NO DATABASE, NO API. The Anthropic client is replaced with a stub that returns
scripted replies, because the behaviour under test is the loop's, and the model
is exactly the part that cannot be relied upon to produce it: three live runs of
the same question gave a false claim, a silent omission, and a correct pin.

What the detector treats as a claim is tested in test_pin_answer_contract.py.
This file tests what the loop DOES about one — that a second turn actually
happens, and that it carries an instruction the model can act on.
"""

from __future__ import annotations

import asyncio
import json

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                       # noqa: E402


# ---------------------------------------------------------------------------
# A stub client: scripted text replies, no tool use, no network
# ---------------------------------------------------------------------------

class _Delta:
    def __init__(self, text): self.type, self.text = "text_delta", text


class _Event:
    def __init__(self, text): self.type, self.delta = "content_block_delta", _Delta(text)


class _TextBlock:
    def __init__(self, text): self.type, self.text = "text", text


class _Usage:
    input_tokens = output_tokens = cache_read_input_tokens = 0


class _Final:
    def __init__(self, text): self.content, self.usage = [_TextBlock(text)], _Usage()


class _Stream:
    def __init__(self, text): self._text = text

    async def __aenter__(self): return self

    async def __aexit__(self, *exc): return False

    def __aiter__(self):
        async def gen():
            yield _Event(self._text)
        return gen()

    async def get_final_message(self): return _Final(self._text)


class _Messages:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def stream(self, **kwargs):
        self.requests.append(kwargs)
        return _Stream(self.replies.pop(0) if self.replies else "")


class FakeClient:
    def __init__(self, replies): self.messages = _Messages(replies)


async def _writer(spec):                     # never reached; its presence is
    raise AssertionError("the stub never calls a tool")   # what enables the tool


class StubLog(george_loop.ConversationLog):
    """
    A ConversationLog that records its statements and never opens a connection.

    THE MODEL IS STUBBED HERE; THE LOG HAS TO BE TOO. `run()` constructs its
    own ConversationLog, so patching `_exec` on some other instance — which is
    what test_chats_contract does for its direct tests — leaves the loop's own
    log entirely unpatched. With GEORGE_LOG_DATABASE_URL exported, that log
    connected to the PRODUCTION database and wrote a row for every scripted
    turn. conftest now removes the variable, and this is the second half of the
    same guarantee: even handed a real URL, nothing here reaches a network.

    Subclassed rather than faked so the parts under test stay real — thread_id
    defaulting, and post_ids() deriving the ids the river will use. Only the
    connection is removed.
    """

    instances: list["StubLog"] = []

    def __init__(self, thread_id=None):
        super().__init__(thread_id=thread_id)
        self.url = None            # `enabled` is False; nothing would connect
        self.statements: list[tuple[str, tuple]] = []
        StubLog.instances.append(self)

    def _exec(self, sql, params):
        self.statements.append((sql, params))


def drive(monkeypatch, replies, question="pin that"):
    """
    Run the loop against scripted replies. Returns (frames, requests).

    Both external dependencies are stubbed by default: the Anthropic client, and the
    conversation log. A test that wants either for real has to say so.
    """
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in george_loop.run(question, pin_writer=_writer)]

    return asyncio.run(collect()), fake.messages.requests


def frames_of(frames, event):
    out = []
    for f in frames:
        head, _, rest = f.partition("\n")
        if head == f"event: {event}":
            out.append(json.loads(rest.partition("data: ")[2]))
    return out


def answer_of(frames):
    return "".join(d.get("delta", "") for d in frames_of(frames, "text"))


def corrections(requests):
    """
    The loop's own messages to the model.

    Read from the message list rather than by index: the loop passes the SAME
    list object on every request and mutates it in place, so each recorded
    request holds the conversation as it finished, not as it was sent.
    """
    seen = []
    for req in requests:
        for m in req["messages"]:
            if m["role"] == "user" and isinstance(m["content"], str) and m not in seen:
                seen.append(m)
    return [m["content"] for m in seen]


# ---------------------------------------------------------------------------
# The correction
# ---------------------------------------------------------------------------

def test_a_claimed_pin_that_never_happened_is_corrected(monkeypatch):
    frames, requests = drive(monkeypatch, [
        'Pinned "Net sales by store" to the Replenishment page.',
        "Nothing was pinned — I never called the tool. Say the word and I will.",
    ])

    assert [w["reason"] for w in frames_of(frames, "warning")] == ["pin_claimed_not_made"]
    assert len(requests) == 2, "the loop must take a second turn"

    # The question, then the correction the loop injected.
    said = corrections(requests)
    assert len(said) == 2 and said[0] == "pin that"
    assert "never called pin_answer" in said[1]
    assert "call pin_answer now" in said[1]

    # The corrected answer is what the user ends up with.
    assert "Nothing was pinned" in answer_of(frames)


def test_a_promised_pin_that_never_happened_is_corrected(monkeypatch):
    """
    The gentler case: George may legitimately be waiting on the user, so the
    instruction offers that as a way out rather than demanding a write.
    """
    frames, requests = drive(monkeypatch, [
        "I'll pin that to Replenishment for you.",
        "I have not pinned it — tell me which page and I will.",
    ])

    assert [w["reason"] for w in frames_of(frames, "warning")] == ["pin_promised_not_made"]
    correction = corrections(requests)[1]
    assert "Saying you will pin it does not pin it" in correction
    assert "waiting on the user" in correction


def test_an_answer_claiming_nothing_is_left_alone(monkeypatch):
    frames, requests = drive(monkeypatch, ["Net sales last month were ₱8,069,394.16."])
    assert frames_of(frames, "warning") == []
    assert len(requests) == 1


def test_a_refusal_to_pin_is_left_alone(monkeypatch):
    """Correcting George for declining would train the behaviour out."""
    frames, requests = drive(monkeypatch, [
        "I could not pin that — the weekly call has not been run in this conversation.",
    ])
    assert frames_of(frames, "warning") == []
    assert len(requests) == 1


def test_the_loop_corrects_once_and_then_lets_the_answer_stand(monkeypatch):
    """
    A budget, not a loop. If the model keeps claiming a pin it did not make, the
    user still gets an answer — the gap log is what records that it happened.
    """
    frames, requests = drive(monkeypatch, [
        "Pinned to Replenishment.",
        "Pinned to Replenishment, really this time.",
    ])
    assert len(frames_of(frames, "warning")) == 1
    assert len(requests) == 2
    assert frames_of(frames, "done")[0]["status"] == "ok"
