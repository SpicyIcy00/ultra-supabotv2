"""
The voice — behavioural evals. LIVE MODEL, LIVE DATABASE, OPT IN.

Twelve fixed questions, the same before and after the prompt rewrite (plan
phase A), each recorded with what the voice checks measure: words, whether
the reading comes first, how many sentences restate a drawn figure, how many
paragraphs, whether it ends with one offer. The trust checks from the
investigation evals hold on every one of them — no invented figure, no
internal vocabulary, no forced notice — because a rewrite that made him
sound better and read worse would be a regression.

TWO MODES. By default the voice findings are RECORDED and only the trust
properties are asserted: that is the before-run, a measurement. With
GEORGE_VOICE_STRICT=1 the voice is asserted too — the after-run, the
acceptance in the plan: reading first, one paragraph plus one per caveat,
at most one restated figure, at most one offer.

Run:  GEORGE_EVALS=1 GEORGE_EVAL_REPORT=verification/voice-before.json
      pytest tests/evals/test_voice_evals.py -q
"""

from __future__ import annotations

import os

import pytest

from tests.evals import checks
from tests.evals import voice_checks as voice
from tests.evals.harness import Report, required, run_turn
from tests.evals.test_page_workshop_evals import FakeWriter
from tools._common import load_defs, req

DEFS = load_defs()

from agent import loop as george_loop

MAX_ITERATIONS = george_loop.MAX_ITERATIONS   # the loop's own cap, not a tighter one
MAX_CALLS = 12
STRICT = os.environ.get("GEORGE_VOICE_STRICT") == "1"

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    print("\n\n== voice evals ==")
    tw = tr = ts = lead = 0
    for r in report.records:
        f = r["findings"]
        tw += f["words"]; tr += f["restated_sentences"]; ts += f["sentences"]; lead += int(f["leads_with_reading"])
        print(f"  {'PASS' if r.get('passed') else 'FAIL'} {r['scenario']:<14} words={f['words']:4d} paras={f['paragraphs']}/{f['paragraph_budget']} "
              f"restated={f['restated_sentences']}/{f['sentences']} reading-first={f['leads_with_reading']} "
              f"offers={f['closing_offers']} notices={f['notices']}")
    n = max(len(report.records), 1)
    print(f"  words avg {tw / n:.0f} · restated {tr}/{ts} ({100 * tr / max(ts, 1):.0f}%) · reading-first {lead}/{n}")
    if path:
        print(f"  report: {path}")


def _voice(name: str, turn: checks.Turn, *, extra_results: list | None = None,
           expect_refusal: bool = False) -> dict:
    results = [r["result"] for r in turn.results if not r["error"]] + list(extra_results or [])
    findings = voice.voice_findings(turn.answer, results, notices=len(turn.notices))
    findings["ungrounded_numerals"] = [f.text for f in checks.ungrounded_numerals(turn.answer, results)]
    findings["internal_vocabulary"] = checks.internal_vocabulary(turn.answer)
    findings["limitation"] = checks.limitation_statement(turn.answer)
    findings["refused_calls"] = [c.get("tool") for c in turn.calls if c.get("error")]
    report.add(name, turn, findings, None, passed=False)

    # The trust properties hold on both sides of the rewrite.
    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    assert turn.done["iterations"] <= MAX_ITERATIONS, turn.done
    assert turn.done.get("executed_calls", turn.done["tool_calls"]) <= MAX_CALLS, turn.done
    assert turn.done.get("notice_forced") is False, "a notice had to be forced into the answer"
    assert not findings["ungrounded_numerals"], f"figures no tool returned: {findings['ungrounded_numerals']}"
    assert not findings["internal_vocabulary"], f"internal vocabulary: {findings['internal_vocabulary']}"
    if expect_refusal:
        # A refusal in his own words: the definitions' refusal phrases ("I can't",
        # "there is no"), a tool's refusal, or a limitation statement.
        low = turn.answer.lower()
        said_no = any(ph.lower() in low for ph in req(DEFS, "pushback.refusal"))
        assert findings["refused_calls"] or findings["limitation"] or said_no, "he should have said what he cannot tell"

    if STRICT:
        assert findings["leads_with_reading"], f"led with a figure: {turn.answer[:160]!r}"
        assert findings["paragraphs"] <= findings["paragraph_budget"], (
            f"{findings['paragraphs']} paragraphs for {findings['notices']} caveats")
        assert findings["restated_sentences"] <= 1, f"restates the board: {voice.restated_sentences(turn.answer, results)}"
        assert findings["closing_offers"] <= 1, "ends with a menu, not an offer"
    report.add(name, turn, findings, None, passed=True)
    return findings


# ---------------------------------------------------------------------------
# The twelve
# ---------------------------------------------------------------------------

def test_01_the_morning(monkeypatch):
    turn = run_turn(monkeypatch, "What should I look at today?")
    _voice("morning", turn)


def test_02_a_why(monkeypatch):
    turn = run_turn(monkeypatch, "Why was North Edsa up so much last week?")
    _voice("why", turn)


def test_03_a_shop(monkeypatch):
    turn = run_turn(monkeypatch, "How is Rockwell doing?")
    _voice("shop", turn)


def test_04_a_product(monkeypatch):
    turn = run_turn(monkeypatch, "How is Aji Mix selling?")
    _voice("product", turn)


def test_05_an_order(monkeypatch):
    turn = run_turn(monkeypatch, "Draft a Seikyo order for the next 8 weeks.")
    _voice("order", turn)


def test_06_a_follow_up(monkeypatch):
    first = run_turn(monkeypatch, "How is Rockwell doing?")
    turn = run_turn(monkeypatch, "And OPUS?", history=first.history_turns())
    _voice("follow-up", turn, extra_results=[r["result"] for r in first.results if not r["error"]])


def test_07_a_correction(monkeypatch):
    first = run_turn(monkeypatch, "How is Rockwell doing this week?")
    turn = run_turn(monkeypatch, "No — I meant last week, not this week.", history=first.history_turns())
    _voice("correction", turn, extra_results=[r["result"] for r in first.results if not r["error"]])


def test_08_what_he_cannot_answer(monkeypatch):
    turn = run_turn(monkeypatch, "What was the foot traffic at Rockwell last week?")
    _voice("cannot", turn, expect_refusal=True)


def test_09_three_caveats(monkeypatch):
    turn = run_turn(monkeypatch, "What is running low at Greenhills?")
    _voice("caveats", turn)


def test_10_by_hour(monkeypatch):
    turn = run_turn(monkeypatch, "When during the day does OPUS sell?")
    _voice("by-hour", turn)


def test_11_keep_as_a_page(monkeypatch):
    first = run_turn(monkeypatch, "How is Rockwell doing?")
    writer = FakeWriter()
    turn = run_turn(monkeypatch, "Keep that as a page called Rockwell weekly.",
                    history=first.history_turns(), page_writer=writer)
    _voice("keep-page", turn, extra_results=[r["result"] for r in first.results if not r["error"]])


def test_12_run_it_monday(monkeypatch):
    first = run_turn(monkeypatch, "Draft a Seikyo order for the next 8 weeks.")
    # No workflow writer is injected here, so scheduling is not his to do
    # this turn: the eval is how he says so.
    turn = run_turn(monkeypatch, "Run it every Monday at 6.", history=first.history_turns())
    _voice("run-monday", turn, extra_results=[r["result"] for r in first.results if not r["error"]],
           expect_refusal=True)
