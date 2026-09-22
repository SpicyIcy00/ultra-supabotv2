"""
How hard Bob thinks, per turn (P1.h, 2026-09-14).

NO DATABASE, NO API. Scripted client, stubbed read, stubbed log.

WHAT THIS HOLDS, AND WHAT IT CANNOT. It holds the MECHANISM — which kind a
question is, that the level rides a mid-conversation system message and not the
top-level field, that the marker sits after the history and before the
question, that a turn at the default level sends nothing at all, and that
losing the beta costs the feature rather than the turn.

It does not hold that a lower level still answers well. Nothing here could:
that is the voice evals, run live, and the card fails on them rather than on
this file.

WHY THE MARKER AND NOT `output_config`. Changing the top-level effort between
requests invalidates the messages cache and, on models that render the thinking
configuration ahead of tools and system, those caches with it — which is the
~9.2k-token prefix that 139 of 141 measured turns read back. The marker changes
the level and leaves every cache entry matching. That is the whole reason this
is a system message, so it is asserted here rather than explained in a comment.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

import anthropic                                                               # noqa: E402

from agent import loop as bob_loop                                          # noqa: E402
from tests.test_convergence_cap_contract import FakeClient                     # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock, frames_of  # noqa: E402
from tools._common import load_defs, req                                       # noqa: E402

DEFS = load_defs()
BETA = req(DEFS, "effort.beta")
DEFAULT = req(DEFS, "effort.default")


# ---------------------------------------------------------------------------
# The definitions, and the loop reading them
# ---------------------------------------------------------------------------

def test_the_default_in_the_yaml_is_the_one_the_request_carries() -> None:
    """
    The two must agree or a turn at "the default level" is not at it.

    EFFORT is what every request sends top-level; effort.default is what the
    classifier calls "no marker needed". If they drift, the loop silently
    starts sending a marker for a level it was already at, or stops sending one
    for a level it is not.
    """
    assert bob_loop.EFFORT == DEFAULT


def test_every_kind_names_a_level_the_api_accepts() -> None:
    levels = set(req(DEFS, "effort.levels"))
    assert levels <= {"low", "medium", "high", "xhigh", "max"}
    for name, spec in req(DEFS, "effort.kinds").items():
        assert spec["level"] in levels, name


def test_exactly_one_kind_is_the_default_and_it_is_last() -> None:
    """
    The walk is ordered and ends somewhere. A second default kind would make
    the order decide which one wins, which is the kind of thing that is true
    until someone reorders the yaml.
    """
    kinds = list(req(DEFS, "effort.kinds").items())
    defaults = [n for n, s in kinds if s.get("default_kind")]
    assert defaults == [kinds[-1][0]]


# ---------------------------------------------------------------------------
# Which kind a question is
# ---------------------------------------------------------------------------

HISTORY = [{"role": "user", "text": "how did we do?", "tool_calls": []}]


@pytest.mark.parametrize("question,history,expected", [
    # The ladder outranks everything, including being a fragment in a thread:
    # "why?" is the most expensive question there is and the shortest.
    ("Why was North Edsa up so much last week?", None, ("high", "ladder")),
    ("why?", HISTORY, ("high", "ladder")),
    ("what's driving the drop", HISTORY, ("high", "ladder")),
    # Broad: it names nothing and has to decide what is worth saying.
    ("how are we doing?", None, ("high", "broad")),
    ("What should I look at today?", None, ("high", "broad")),
    # A surface act over work already done.
    ("can you make it a page?", HISTORY, ("low", "label_only")),
    ("pin that", HISTORY, ("low", "label_only")),
    # A fragment inside a thread moves the scope — and since 2026-09-18 the
    # new scope is understood before it is shown, so it is not hurried.
    ("how about rockwell", HISTORY, ("medium", "follow_up")),
    ("no i meant last week", HISTORY, ("medium", "follow_up")),
    # And everything else — high since 2026-09-18: "analyze tradsnax per
    # store" was landing here at medium, the question most wanting depth.
    ("What is running low at Greenhills?", None, ("medium", "fresh")),
    # Building stays high when fresh went back to medium (2026-09-19).
    ("lets brainstorm ideas for a po system for seikyo, 8 weeks of cover",
     None, ("high", "build")),
    ("analyze tradsnax per store", None, ("high", "ladder")),
])
def test_the_kind_a_question_is(question, history, expected) -> None:
    assert bob_loop.turn_effort(question, history, DEFS) == expected


def test_a_fragment_with_no_thread_behind_it_is_a_fresh_question() -> None:
    """
    THE FIRST TURN IS NEVER A FOLLOW-UP. "how about rockwell" as the opening
    message of a conversation has nothing to refine — there is no board and no
    previous reading — so it is a question in its own right and is not hurried.
    """
    assert bob_loop.turn_effort("how about rockwell", None, DEFS)[1] == "fresh"
    assert bob_loop.turn_effort("how about rockwell", [], DEFS)[1] == "fresh"


def test_a_long_message_in_a_thread_is_not_a_fragment() -> None:
    """
    Over the word bound it is a question, whatever came before it. "add top
    sellers by sales not units, i value sales more" is a preference being
    taught and the thing Bob does with it decides whether memory is worth
    anything — see the v2 evals' `taught`.
    """
    long_one = "add top sellers by sales not units, i value sales more"
    assert len(long_one.split()) > req(DEFS, "effort.follow_up_max_words")
    assert bob_loop.turn_effort(long_one, HISTORY, DEFS)[1] == "fresh"


# ---------------------------------------------------------------------------
# What the request carries
# ---------------------------------------------------------------------------

def _drive(monkeypatch, question, history=None, provider="anthropic"):
    # THE MARKER IS ANTHROPIC'S (W1.1, 2026-09-22): DeepSeek reads its effort
    # top-level (effort.top_level), so the marker tests name the provider they
    # hold, and the DeepSeek half is held at the foot of this file.
    monkeypatch.setenv("BOB_PROVIDER", provider)
    fake = FakeClient([[_TextBlock("Rockwell held up; nothing else moved.")]])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run(question, history=history)]

    return asyncio.run(collect()), fake.messages.requests


def test_a_default_level_turn_sends_no_marker_and_no_header(monkeypatch) -> None:
    """
    The request a turn at the default level makes is the one this loop made
    before P1.h. Nothing is added for the level that was already in force.
    """
    _, requests = _drive(monkeypatch, "Why was North Edsa up so much last week?")
    sent = requests[0]
    assert sent["output_config"] == {"effort": DEFAULT}
    assert all(m["role"] != "system" for m in sent["messages"])
    assert "extra_headers" not in sent


def test_a_lowered_turn_carries_the_marker_and_the_beta(monkeypatch) -> None:
    _, requests = _drive(monkeypatch, "pin that", history=HISTORY)
    sent = requests[0]
    markers = [m for m in sent["messages"] if m["role"] == "system"]
    assert markers == [{"role": "system", "content": [],
                        "output_config": {"effort": "low"}}]
    assert sent["extra_headers"] == {"anthropic-beta": BETA}


def test_the_top_level_effort_never_moves(monkeypatch) -> None:
    """
    THE POINT OF THE MARKER. A top-level change restarts the cached prefix;
    this one does not. So the top-level value is the same on a lowered turn as
    on a default one, and the difference is entirely inside `messages`.
    """
    _, low = _drive(monkeypatch, "pin that", history=HISTORY)
    _, high = _drive(monkeypatch, "Why was North Edsa up so much last week?")
    assert low[0]["output_config"] == high[0]["output_config"] == {"effort": DEFAULT}


def test_the_marker_sits_after_the_history_and_before_the_question(monkeypatch) -> None:
    """
    Placement is what keeps the history's bytes unchanged: everything a later
    turn has to reproduce renders before the marker, and the marker is followed
    by the question it governs.
    """
    _, requests = _drive(monkeypatch, "pin that", history=HISTORY)
    msgs = requests[0]["messages"]
    # The captured list is the loop's own and grows as the turn runs, so the
    # question is located rather than counted from the end.
    at = [i for i, m in enumerate(msgs) if m["role"] == "system"][0]
    assert msgs[at + 1]["role"] == "user"
    assert "pin that" in msgs[at + 1]["content"]
    assert all(m["role"] in ("user", "assistant") for m in msgs[:at])
    assert [m["role"] for m in msgs].count("system") == 1


def test_the_level_is_on_the_done_frame(monkeypatch) -> None:
    """
    Recorded, because it is what the card is measured on and nothing else can
    be asked for it afterwards.
    """
    frames, _ = _drive(monkeypatch, "pin that", history=HISTORY)
    done = frames_of(frames, "done")[0]
    assert done["effort"] == "low" and done["effort_kind"] == "label_only"


# ---------------------------------------------------------------------------
# Losing the beta costs the feature, not the turn
# ---------------------------------------------------------------------------

class _RefusingOnce:
    """A client that rejects the beta on the first request and answers after."""

    def __init__(self, fake):
        self._fake = fake
        self.refused = 0

    def stream(self, **kw):
        if "extra_headers" in kw:
            self.refused += 1
            raise anthropic.BadRequestError(
                message=("output_config.effort requires a model that supports "
                         "per-turn effort"),
                response=_FakeResponse(), body=None)
        return self._fake.messages.stream(**kw)

    @property
    def requests(self):
        return self._fake.messages.requests


class _FakeResponse:
    status_code = 400
    headers: dict = {}
    request = None


def test_an_unavailable_beta_drops_the_marker_and_answers_anyway(monkeypatch) -> None:
    """
    THE BETA MAY NOT BE OURS. Per-turn effort is documented as possibly
    allowlisted, so a 400 that names it must cost the feature and not the
    answer. The marker goes, the level falls back to the default, and the turn
    completes — which is exactly what every turn did before this card.
    """
    monkeypatch.setattr(bob_loop, "_EFFORT_BETA_OK", True)
    monkeypatch.setenv("BOB_PROVIDER", "anthropic")
    inner = FakeClient([[_TextBlock("Rockwell held up.")]])
    refusing = _RefusingOnce(inner)

    class _Client:
        messages = refusing

    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic",
                        lambda *a, **k: _Client())
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in bob_loop.run("pin that", history=HISTORY)]

    frames = asyncio.run(collect())
    done = frames_of(frames, "done")[0]
    assert refusing.refused == 1
    assert done["status"] == "ok" and done["effort"] == DEFAULT
    assert bob_loop._EFFORT_BETA_OK is False, (
        "it asks once per process, not once per turn")
    # And the request that succeeded carried neither the marker nor the header.
    last = refusing.requests[-1]
    assert "extra_headers" not in last
    assert all(m["role"] != "system" for m in last["messages"])


def test_a_400_that_is_not_about_the_beta_still_surfaces(monkeypatch) -> None:
    """
    Narrow on purpose. A bad request that has nothing to do with effort is a
    real error and must not be swallowed by a retry that drops a marker.
    """
    other = anthropic.BadRequestError(
        message="messages: at least one message is required",
        response=_FakeResponse(), body=None)
    assert bob_loop._effort_unsupported(other) is False
    named = anthropic.BadRequestError(
        message="output_config.effort requires a model that supports per-turn effort",
        response=_FakeResponse(), body=None)
    assert bob_loop._effort_unsupported(named) is True


# ---------------------------------------------------------------------------
# DeepSeek reads its effort TOP-LEVEL (W1.1, 2026-09-22)
# ---------------------------------------------------------------------------

def test_deepseek_gets_the_level_top_level_and_no_marker(monkeypatch) -> None:
    """
    DECISIONS 2026-09-21, "why a broad answer takes minutes": DeepSeek has no
    `medium` (it is `high` there) and does not read the per-message marker, so
    every production turn thought at full strength. On a provider named in
    effort.top_level the level is the request's own, in its own name.
    """
    levels = req(DEFS, "effort.top_level.levels.deepseek")
    _, lowered = _drive(monkeypatch, "pin that", history=HISTORY, provider="deepseek")
    sent = lowered[0]
    assert sent["output_config"] == {"effort": levels["low"]}
    assert all(m["role"] != "system" for m in sent["messages"]), "no marker on DeepSeek"
    assert "extra_headers" not in sent, "no Anthropic beta header on DeepSeek"

    _, fresh = _drive(monkeypatch, "what were rockwell's sales yesterday",
                      provider="deepseek")
    assert fresh[0]["output_config"] == {"effort": levels["medium"]}
    assert levels["medium"] != "medium", "DeepSeek has no medium: it would be high"

    _, digs = _drive(monkeypatch, "Why was North Edsa up so much last week?",
                     provider="deepseek")
    assert digs[0]["output_config"] == {"effort": levels["high"]} == {"effort": "high"}


def test_the_level_on_the_done_frame_is_the_one_deepseek_was_sent(monkeypatch) -> None:
    frames, requests = _drive(monkeypatch, "what were rockwell's sales yesterday",
                              provider="deepseek")
    done = frames_of(frames, "done")[0]
    assert done["effort"] == requests[0]["output_config"]["effort"]
