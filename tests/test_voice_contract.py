"""
Voice, volunteering and pushback — the prompt contract.

NO DATABASE, NO API. The Anthropic client is replaced with the stub from
test_loop_correction_contract, because what is under test is the LOOP's
behaviour and the PROMPT's content, and the model is exactly the part that
cannot be relied upon to produce either.

WHAT CAN AND CANNOT BE TESTED HERE, STATED PLAINLY.

  Testable   the prompt says the thing; the definitions and the prompt agree;
             the loop counts volunteered lines and spends one corrective turn;
             the vocabularies for "wouldn't" and "can't" are disjoint; a
             second, insisting turn is not blocked.

  NOT        that the model actually writes in the register. No test here
             asserts George is dry, and none could. Those are the live samples,
             which are read by a person.

The cap is the honest part of volunteering: it counts lines that ANNOUNCE
themselves and does not verify that a volunteered figure came from a tool
result. metrics.yaml says so in as many words, and so does this file, because a
cap mistaken for provenance would be worse than no cap.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                    # noqa: E402
from agent.loop import SYSTEM_PROMPT                                     # noqa: E402
from tools._common import load_defs, req                                 # noqa: E402
from tests.test_loop_correction_contract import (                        # noqa: E402
    answer_of,
    drive,
    frames_of,
)

DEFS = load_defs()


# ---------------------------------------------------------------------------
# 1-4. The prompt itself
# ---------------------------------------------------------------------------

def test_voice_section_is_present_and_first_person() -> None:
    """The register is stated, and stated as first person."""
    assert "VOICE" in SYSTEM_PROMPT
    assert req(DEFS, "voice.person") == "first"
    assert "first person" in SYSTEM_PROMPT.lower()


def test_system_prompt_is_byte_stable() -> None:
    """
    Rebuilt from the same definitions, it is the same bytes.

    This is what makes the prompt cacheable: the scope sentence is BUILT at
    import from metrics.yaml, and anything non-deterministic in it — a clock, a
    uuid, a dict iteration order — would invalidate the cached prefix on every
    single request and quietly multiply the bill.
    """
    once = george_loop._scope_sentence(load_defs())
    twice = george_loop._scope_sentence(load_defs())
    assert once == twice
    assert SYSTEM_PROMPT.startswith(once)


def test_voice_register_and_bans_come_from_the_definitions() -> None:
    """
    The prompt and metrics.yaml describe the same voice.

    Not a copy check for its own sake: the register is meant to be tunable
    without touching code, and a prompt that had drifted from the yaml would
    make that tuning silently ineffective.
    """
    low = SYSTEM_PROMPT.lower()
    for word in req(DEFS, "voice.register"):
        assert word.lower() in low, f"register word missing from the prompt: {word}"
    for word in req(DEFS, "voice.never"):
        assert word.lower() in low, f"banned register missing from the prompt: {word}"
    for opener in req(DEFS, "voice.banned_openers"):
        assert opener.lower() in low, f"banned opener missing from the prompt: {opener}"


def test_wit_never_softens_a_caveat_is_stated() -> None:
    """
    The one rule in VOICE that is not style.

    The notice fingerprints are matched against the final answer, so a jokier
    register is precisely what starts failing them. If this sentence is ever
    dropped from the prompt, the enforcement below is all that is left.
    """
    assert req(DEFS, "voice.caveat_is_never_softened") is True
    assert "WIT NEVER SOFTENS A CAVEAT" in SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 5-7. Volunteering, and the cap the loop actually enforces
# ---------------------------------------------------------------------------

MARKERS = [m for m in req(DEFS, "volunteering.markers") if isinstance(m, str)]
MAX_VOLUNTEERED = req(DEFS, "volunteering.max_per_answer")


def _with_markers(n: int) -> str:
    body = "Rockwell took P48,210 on Wed 2 Sep 2026."
    extras = " ".join(f"{MARKERS[i]}: something else was true." for i in range(n))
    return f"{body} {extras}".strip()


def test_one_volunteered_line_is_left_alone(monkeypatch) -> None:
    """The behaviour is the point of the feature; only excess is corrected."""
    frames, _ = drive(monkeypatch, [_with_markers(1)], question="how did Rockwell do?")
    warnings = [w["reason"] for w in frames_of(frames, "warning")]
    assert "volunteering_over_cap" not in warnings
    assert MARKERS[0] in answer_of(frames)


def test_no_volunteered_line_is_left_alone(monkeypatch) -> None:
    """Saying nothing extra is always allowed. The cap is a ceiling, not a floor."""
    frames, _ = drive(monkeypatch, ["Rockwell took P48,210 on Wed 2 Sep 2026."],
                      question="how did Rockwell do?")
    assert "volunteering_over_cap" not in [w["reason"] for w in frames_of(frames, "warning")]


def test_two_volunteered_lines_are_corrected(monkeypatch) -> None:
    """
    Over the cap, the loop rewrites rather than trimming the text itself.

    A rewrite, because dropping a sentence mechanically could take a caveat
    with it — the correction says so, and the model is the only thing that can
    tell which line was the useful one.
    """
    frames, requests = drive(
        monkeypatch,
        [_with_markers(2), _with_markers(1)],
        question="how did Rockwell do?",
    )
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "volunteering_over_cap"]
    assert len(warnings) == 1
    assert warnings[0]["limit"] == MAX_VOLUNTEERED
    assert warnings[0]["found"] == 2

    # The draft is discarded, or the rewrite lands under the text it replaces.
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == [
        "volunteering_over_cap"
    ]

    # And the instruction protects the things the cap is NOT about.
    sent = [m["content"] for req_ in requests for m in req_["messages"]
            if m["role"] == "user" and isinstance(m["content"], str)]
    correction = [c for c in sent if "volunteered" in c]
    assert correction, "no corrective message was sent"
    assert "caveat" in correction[0].lower()


def test_the_volunteering_correction_is_capped(monkeypatch) -> None:
    """
    One corrective turn, then the answer stands.

    The same shape as the notice and pin corrections: a gate, not a loop. A
    model that keeps volunteering must not cost an unbounded number of turns.
    """
    over = _with_markers(3)
    frames, _ = drive(monkeypatch, [over, over, over], question="how did Rockwell do?")
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "volunteering_over_cap"]
    assert len(warnings) == req(DEFS, "volunteering.max_corrective_turns") == 1
    # It gave up and kept the answer rather than spinning.
    assert answer_of(frames)


def test_the_cap_does_not_claim_to_verify_sourcing() -> None:
    """
    The limit, asserted so it cannot be quietly forgotten.

    _volunteered COUNTS announced lines. Nothing in this system checks a
    numeral in prose against a tool result, and a cap mistaken for provenance
    would be more dangerous than no cap at all.
    """
    assert george_loop._volunteered("Worth knowing: the moon is made of cheese.", DEFS)
    # No numeral anywhere, no tool result anywhere, and it still counts as one.
    assert len(george_loop._volunteered("Worth noting: nothing.", DEFS)) == 1


# ---------------------------------------------------------------------------
# 8-10. Pushback, which is not refusal
# ---------------------------------------------------------------------------

def test_disagreement_and_refusal_vocabularies_are_disjoint() -> None:
    """
    "I wouldn't" and "I can't" may never be the same phrase.

    This is the distinction the whole section exists to protect: an opinion in
    the language of impossibility takes a decision away from the person whose
    decision it is.
    """
    disagreement = {p.lower() for p in req(DEFS, "pushback.disagreement")}
    refusal = {p.lower() for p in req(DEFS, "pushback.refusal")}
    assert disagreement and refusal
    assert disagreement.isdisjoint(refusal)
    for phrase in disagreement:
        assert not any(phrase in r or r in phrase for r in refusal), phrase


def test_the_prompt_draws_the_distinction_and_demands_an_alternative() -> None:
    """Pushback with no alternative is an objection, and the prompt says so."""
    assert "I can't" in SYSTEM_PROMPT and "I wouldn't" in SYSTEM_PROMPT
    assert req(DEFS, "pushback.must_offer_alternative") is True
    assert "instead" in SYSTEM_PROMPT.lower()


def test_an_opinion_yields_when_the_user_insists(monkeypatch) -> None:
    """
    George says his piece once, then does what he is asked.

    Tested where it is testable: the loop must not block or correct a second
    attempt at the same request. Nothing in the loop may turn a stated opinion
    into a refusal to proceed.
    """
    assert req(DEFS, "pushback.complies_when_insisted") is True
    assert req(DEFS, "pushback.max_restatements") == 1

    history = [
        {"role": "user", "text": "compare last week to yesterday", "tool_calls": []},
        {"role": "george",
         "text": "I wouldn't compare those two — one is a week and one is a day. "
                 "I'd put yesterday against the same weekday instead.",
         "tool_calls": []},
    ]
    frames, _ = drive(monkeypatch, ["Comparing them as asked: ..."],
                      question="do it anyway")
    assert not [w for w in frames_of(frames, "warning")
                if w["reason"] in {"volunteering_over_cap", "unsurfaced_notice"}]
    assert answer_of(frames)
    # The prior turn is replayable as ordinary history; nothing special-cases it.
    assert george_loop._seed_history(history, {})
