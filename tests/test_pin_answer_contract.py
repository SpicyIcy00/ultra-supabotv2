"""
Pure tests for George's write surface: pin_answer.

NO DATABASE. Every decision that makes a chat-driven pin safe is decidable
without one, and all three live here:

  1. The write tool is not part of the READ surface, so a pin can never contain
     a pin and the pin RUNNER can never write.
  2. George may only pin calls he actually ran in this conversation. That single
     rule is what forces "pin that but daily" to re-run the adjusted call — and
     to show the user its result — before it can be pinned.
  3. The write is a capability handed IN. No writer, no tool in the schema, and
     the identity and the conversation id come from the loop rather than from
     anything the model emitted.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                       # noqa: E402
from agent.write_tools import (                             # noqa: E402
    PinRefused,
    PinSpec,
    WriteContext,
    call_key,
    pin_answer,
)
from tools._common import load_defs as _load_defs, req                 # noqa: E402
from app.services.pin_runner import PinValidationError, validate_call  # noqa: E402


def _run(coro):
    return asyncio.run(coro)


SALES = {
    "tool": "get_sales",
    "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"},
}
DAILY = {
    "tool": "get_sales",
    "arguments": {"metric": "net_sales", "group_by": "day", "date_range": "last_month"},
}


class FakeWriter:
    """Stands in for the writer the web process injects. Records what it was asked."""

    def __init__(self, raises: Exception | None = None) -> None:
        self.spec: PinSpec | None = None
        self.raises = raises

    async def __call__(self, spec: PinSpec) -> dict:
        if self.raises:
            raise self.raises
        self.spec = spec
        return {
            "pin_id": "6f1d0a2e-0000-0000-0000-000000000001",
            "title": spec.title,
            "page": spec.page,
            "created_by": "ice",
            "created_at": "2026-09-03T01:02:03+00:00",
            "pins_on_page": 4,
        }


def _ctx(*ran, writer=None, **kw) -> WriteContext:
    ctx = WriteContext(writer=writer or FakeWriter(), **kw)
    for call in ran:
        ctx.executed[call_key(call["tool"], call["arguments"])] = call
    return ctx


# ---------------------------------------------------------------------------
# 1. The write surface is not the read surface
# ---------------------------------------------------------------------------

def test_pin_answer_is_not_a_pinnable_tool():
    """
    TOOL_FUNCTIONS is the set of calls a pin may CONTAIN, not just a dispatch
    table. A write tool in there would let a pin hold a pin, and would let
    pin_runner.run_call write while replaying a tile.
    """
    assert "pin_answer" not in george_loop.TOOL_FUNCTIONS


def test_a_stored_call_can_never_be_a_write():
    with pytest.raises(PinValidationError, match="no longer one of George's tools"):
        validate_call({"tool": "pin_answer", "arguments": {}})


def test_the_read_schema_does_not_advertise_the_write_tool():
    """The default matters: pin_runner validates stored calls against this."""
    names = [s["name"] for s in george_loop.build_tool_schemas()]
    assert "pin_answer" not in names


def test_the_write_tool_appears_only_when_asked_for():
    names = [s["name"] for s in george_loop.build_tool_schemas(include_write=True)]
    assert "pin_answer" in names


def test_the_read_prefix_is_unchanged_by_the_write_tool():
    """
    Tools render first in the cached prefix. Every INJECTED tool sorts after
    every read tool, so sessions with different capabilities share a
    byte-identical prefix up to the tail — a reordering here would silently
    halve the cache hit rate.

    Checked as a property rather than by naming the last tool: there are three
    injected tools now (pin_answer, run_workflow, save_workflow) and there will
    be more, and a test that names one is a test that fails on the next.
    """
    read = george_loop.build_tool_schemas()
    both = george_loop.build_tool_schemas(include_write=True)
    assert both[: len(read)] == read

    injected = [s["name"] for s in both[len(read):]]
    assert injected == sorted(injected)
    assert set(injected) == set(george_loop.write_tools.WRITE_TOOL_FUNCTIONS) | set(
        george_loop.composite_tools.COMPOSITE_TOOL_FUNCTIONS
    )
    last_read = read[-1]["name"]
    assert all(name > last_read for name in injected), (
        f"{[n for n in injected if n <= last_read]} sort before the last read "
        f"tool ({last_read}), which would break the cached prefix"
    )


def test_a_pin_cannot_be_declared_to_hold_a_write():
    schema = next(s for s in george_loop.build_tool_schemas(include_write=True)
                  if s["name"] == "pin_answer")
    allowed = schema["input_schema"]["properties"]["tool_calls"]["items"]["properties"]["tool"]
    assert "pin_answer" not in allowed["enum"]
    assert set(allowed["enum"]) == set(george_loop.TOOL_FUNCTIONS)


def test_the_loops_own_arguments_are_not_offered_to_the_model():
    """
    ctx carries the injected writer and the record of what has run. It is
    keyword-only, and keyword-only parameters are the loop's — if one leaked
    into the schema the model could hand itself a writer.
    """
    schema = next(s for s in george_loop.build_tool_schemas(include_write=True)
                  if s["name"] == "pin_answer")
    props = schema["input_schema"]["properties"]
    assert "ctx" not in props
    assert set(schema["input_schema"]["required"]) == {"tool_calls", "title"}
    assert set(props) == {"tool_calls", "title", "page", "allow_similar_page"}


# ---------------------------------------------------------------------------
# 2. Provenance — you may only pin what you ran
# ---------------------------------------------------------------------------

def test_pin_that_pins_the_exact_calls_of_the_answer():
    writer = FakeWriter()
    ctx = _ctx(SALES, writer=writer, question="net sales by store last month",
               conversation_id="c-1")

    out = _run(pin_answer([SALES], title="Net sales by store", page="Replenishment", ctx=ctx))

    assert writer.spec is not None
    assert writer.spec.tool_calls == [SALES]
    assert out["rows"][0]["page"] == "Replenishment"


def test_a_variant_that_has_not_been_run_is_refused():
    """
    "Pin that but daily" — the adjusted call is not in the executed set, so the
    pin cannot happen until it has been run and its result seen. This is the
    whole mechanism: the re-run is not requested of the model, it is required.
    """
    ctx = _ctx(SALES)
    with pytest.raises(PinRefused, match="have not run"):
        _run(pin_answer([DAILY], title="Daily net sales", ctx=ctx))


def test_the_refusal_says_what_to_do_and_what_has_run():
    ctx = _ctx(SALES)
    with pytest.raises(PinRefused) as exc:
        _run(pin_answer([DAILY], title="Daily net sales", ctx=ctx))
    message = str(exc.value)
    assert "get_sales" in message
    assert "Run it now" in message
    assert "Tools run so far" in message


def test_the_variant_pins_once_it_has_been_run():
    writer = FakeWriter()
    ctx = _ctx(SALES, DAILY, writer=writer)
    _run(pin_answer([DAILY], title="Daily net sales", ctx=ctx))
    assert writer.spec.tool_calls == [DAILY]


def test_argument_order_is_not_a_different_call():
    """
    The model rewrites argument order freely between turns. A pin refused over
    key order would be a mystery to everyone involved.
    """
    reordered = {
        "tool": "get_sales",
        "arguments": {"date_range": "last_month", "store": None, "metric": "net_sales"},
    }
    same = {
        "tool": "get_sales",
        "arguments": {"metric": "net_sales", "store": None, "date_range": "last_month"},
    }
    assert call_key(reordered["tool"], reordered["arguments"]) == call_key(
        same["tool"], same["arguments"]
    )


def test_an_explicit_none_is_not_the_same_call_as_an_omitted_argument():
    """
    Deliberate, and the reason is get_movement: `store` DEFAULTS to "AJI BARN",
    while `store=None` means every location. Treating an omitted argument and an
    explicit None as the same call would let a tile re-run over a scope the user
    never saw. A refusal here costs one re-run; the alternative is a tile that
    quietly answers a different question.
    """
    omitted = {"tool": "get_movement", "arguments": {"date_range": "last_30_days"}}
    explicit = {"tool": "get_movement",
                "arguments": {"date_range": "last_30_days", "store": None}}
    assert call_key(omitted["tool"], omitted["arguments"]) != call_key(
        explicit["tool"], explicit["arguments"]
    )
    with pytest.raises(PinRefused, match="have not run"):
        _run(pin_answer([explicit], title="Movement", ctx=_ctx(omitted)))


def test_history_makes_pin_that_work_as_a_follow_up():
    """
    The loop is stateless per request. "Pin that" arrives in a request where
    nothing has run, so the calls behind the previous answer come from the
    client's replayed history — and seeding them is what makes the follow-up
    form work at all.
    """
    executed: dict = {}
    messages = george_loop._seed_history([
        {"role": "user", "text": "net sales by store last month", "tool_calls": []},
        {"role": "george", "text": "OPUS led at ₱2.4M.", "tool_calls": [SALES]},
    ], executed)

    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert call_key(SALES["tool"], SALES["arguments"]) in executed

    writer = FakeWriter()
    ctx = WriteContext(writer=writer, question="pin that")
    ctx.executed.update(executed)
    _run(pin_answer([SALES], title="Net sales by store", ctx=ctx))
    assert writer.spec.tool_calls == [SALES]


def test_replayed_calls_are_rendered_in_the_form_that_matches():
    """
    The model pins by copying an argument list out of the replayed text. That
    text is rendered with sorted keys — call_key's own form — so what it copies
    matches what ran.
    """
    messages = george_loop._seed_history(
        [{"role": "george", "text": "an answer", "tool_calls": [DAILY]}], {}
    )
    assert messages == [] or "get_sales(" in messages[-1]["content"]

    seeded = george_loop._seed_history([
        {"role": "user", "text": "q", "tool_calls": []},
        {"role": "george", "text": "a", "tool_calls": [DAILY]},
    ], {})
    rendered = seeded[-1]["content"]
    assert '"date_range": "last_month"' in rendered
    assert rendered.index('"date_range"') < rendered.index('"group_by"')


def test_history_never_produces_a_message_list_the_api_will_reject():
    """
    Blank turns dropped, consecutive same-role turns merged, and a replay that
    starts mid-answer discarded down to a leading user message. A client that
    sends something odd must not take the request down before it starts.
    """
    messages = george_loop._seed_history([
        {"role": "george", "text": "orphaned answer", "tool_calls": []},
        {"role": "user", "text": "  ", "tool_calls": []},
        {"role": "user", "text": "first", "tool_calls": []},
        {"role": "user", "text": "second", "tool_calls": []},
        {"role": "george", "text": "answer", "tool_calls": []},
    ], {})

    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == "first\n\nsecond"
    assert all(m["content"].strip() for m in messages)


def test_history_is_bounded():
    turns = [{"role": "user", "text": f"q{i}", "tool_calls": []} for i in range(200)]
    messages = george_loop._seed_history(turns, {})
    # All one role, so they merge — what matters is that only the tail was read.
    assert "q0" not in messages[0]["content"]
    assert f"q{199}" in messages[0]["content"]

    long_turn = [{"role": "user", "text": "x" * 99999, "tool_calls": []}]
    assert len(george_loop._seed_history(long_turn, {})[0]["content"]) \
        <= george_loop.MAX_HISTORY_TEXT


def test_a_multi_call_answer_needs_every_call_to_have_run():
    ctx = _ctx(SALES)
    with pytest.raises(PinRefused, match="have not run"):
        _run(pin_answer([SALES, DAILY], title="Both", ctx=ctx))


def test_a_malformed_call_list_is_refused_before_the_writer_is_reached():
    writer = FakeWriter()
    ctx = _ctx(SALES, writer=writer)
    for bad in ([], "get_sales", [{"arguments": {}}], [{"tool": "get_sales", "arguments": 3}]):
        with pytest.raises(PinRefused):
            _run(pin_answer(bad, title="x", ctx=ctx))
    assert writer.spec is None


def test_a_pin_needs_a_title():
    with pytest.raises(PinRefused, match="needs a title"):
        _run(pin_answer([SALES], title="   ", ctx=_ctx(SALES)))


# ---------------------------------------------------------------------------
# A pin claimed but never made
#
# Observed live 2026-09-03 on "pin that but weekly": George re-ran the weekly
# query, wrote "Ran the weekly version first, then pinned it", and never called
# the tool. Nothing was written and no tile existed — the answer was the only
# evidence of the pin, and it was wrong.
# ---------------------------------------------------------------------------

DEFS = _load_defs()


def test_a_claimed_pin_is_detected():
    for answer in (
        "Ran the weekly version first, then pinned it.",
        'Pinned "Net sales by store" to the Replenishment page.',
        "Done — the tile is now on Replenishment.",
        "I've pinned that for you.",
    ):
        assert george_loop._pin_claim(answer, DEFS) == "claimed", answer


def test_a_promised_pin_is_detected():
    """
    The live failure the second time: it said it would, then didn't. A promise
    the user believes is as misleading as a false claim.
    """
    for answer in (
        "I'll run the weekly version first, then pin that exact call.",
        "Let me pin that for you.",
        "I'll pin it to Replenishment.",
    ):
        assert george_loop._pin_claim(answer, DEFS) == "promised", answer


def test_a_refusal_to_pin_is_neither():
    """
    George declining to pin is George behaving correctly. Correcting him for it
    would train the behaviour out.
    """
    for answer in (
        "I could not pin that, because the weekly call has not been run.",
        "Nothing was pinned — pinning needs a signed-in user.",
        "I haven't pinned it yet; tell me which page you want.",
        "That can't be pinned without running it first.",
        "I ran it but did not pin it, since you only asked for the figures.",
        "I won't pin it until you say which page.",
    ):
        assert george_loop._pin_claim(answer, DEFS) is None, answer


def test_a_claim_outranks_an_intent():
    """An answer that does both has already asserted the stronger thing."""
    assert george_loop._pin_claim(
        "I'll pin that now. Pinned to Replenishment.", DEFS) == "claimed"


def test_an_ordinary_answer_is_neither():
    assert george_loop._pin_claim(
        "Net sales last month were ₱8,069,394.16 across seven stores.", DEFS
    ) is None


def test_the_claim_vocabulary_comes_from_the_definitions():
    """Not hardcoded in the loop — CLAUDE.md rule 3."""
    spec = req(DEFS, "pins.claim_check")
    assert spec["claims"] and spec["intents"] and spec["negations"]
    assert spec["negation_window"] > 0


# ---------------------------------------------------------------------------
# 3. The capability is handed in, and so is the identity
# ---------------------------------------------------------------------------

def test_without_a_writer_there_is_no_write():
    ctx = WriteContext(writer=None)
    ctx.executed[call_key(SALES["tool"], SALES["arguments"])] = SALES
    with pytest.raises(PinRefused, match="not available"):
        _run(pin_answer([SALES], title="Net sales", ctx=ctx))


def test_the_question_and_conversation_come_from_the_loop():
    """
    Not from the model. They are not parameters of the tool at all, so an
    answer cannot attribute its pin to another conversation.
    """
    writer = FakeWriter()
    ctx = _ctx(SALES, writer=writer, question="what were net sales last month?",
               conversation_id="c-42")
    _run(pin_answer([SALES], title="Net sales", ctx=ctx))
    assert writer.spec.question == "what were net sales last month?"
    assert writer.spec.conversation_id == "c-42"


def test_a_write_returns_rows_and_meta_like_every_other_tool():
    """Architecture rule 2 has no exception for writes."""
    out = _run(pin_answer([SALES], title="Net sales", page="Replenishment",
                          ctx=_ctx(SALES)))
    assert set(out) == {"rows", "meta"}

    meta = out["meta"]
    assert meta["source_table"] == "george.pins"
    assert meta["snapshot_timestamp"]
    assert meta["filters_applied"] == ["created_by = ice"]

    row = out["rows"][0]
    assert row["pin_id"] and row["title"] == "Net sales"
    assert row["tool_calls"] == [SALES]
    assert row["pins_on_page"] == 4


def test_the_writers_refusal_reaches_the_model_intact():
    """
    A page-name collision is a decision for the user, not a guess for George.
    The writer's words are the words POST /pins already uses.
    """
    writer = FakeWriter(raises=PinRefused(
        "You already have a page called 'Replenishment'. You sent 'replenishment', "
        "which differs only by capitalisation. Reuse the existing name, or resend "
        "with allow_similar_page=true to keep both."
    ))
    with pytest.raises(PinRefused, match="allow_similar_page=true"):
        _run(pin_answer([SALES], title="Net sales", page="replenishment",
                        ctx=_ctx(SALES, writer=writer)))


def test_a_refusal_is_a_value_error_so_the_loop_reports_it_as_an_answer():
    """
    agent/loop.py catches (ValueError, KeyError, RuntimeError) around a tool and
    hands the message back to the model. If PinRefused stopped being one of
    those, a refused pin would kill the whole turn instead of being explained.
    """
    assert issubclass(PinRefused, ValueError)
