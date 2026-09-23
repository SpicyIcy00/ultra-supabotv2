"""
D2 — the left is the bigger picture, and the disclaimers go.
LIVE MODEL, LIVE DATABASE, OPT IN. The OWNER'S OWN QUESTIONS, 2026-09-23.

    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 ENVIRONMENT=staging \
        .venv/Scripts/python.exe -m pytest tests/evals/test_left_column_evals.py \
        -k <case> -q -s

  d2_why_greenhills  "Why is Greenhills down?" — the turn that ran 82.8 s over
                     five rounds and wrote 403 words, cut to 66, and offered
                     "Why is Greenhills down?" back to tap.
  d2_why             "why?" in that thread — 82.6 s, 246 words cut to 64.
  d2_check_products  "check all products" — 59.0 s, the turn whose first thing
                     under the question was "2,180 stock counts are below
                     zero, the lowest -78,291…".

WHAT IS MEASURED. What his COLUMN draws — the body, against the bound the
answer's size gives it — and, beside it, what he says before the first figure
at all (`reading.drawn_left`: the body plus the caveat sentences it does not
already carry, the room's own `unsaid`). Since D2 the caveat is drawn at the
head of the FIGURES, with the notices code placed, so the second number is
what moved off his side rather than what is still on it. Which notices the
room would draw is printed by kind. Turns, seconds and dollars are printed,
never asserted.
"""
from __future__ import annotations

import pytest

from agent import compose as _compose
from agent import reading as _reading
from tests.evals.harness import Report, required, run_turn, say, turn_usd
from tools._common import load_defs, req

DEFS = load_defs()
EXPLAINS_ONLY = set(req(DEFS, "surface.desk.notices.explains_only"))

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


def _clock(turn) -> str:
    d = turn.done or {}
    return (f"rounds={d.get('iterations')} seconds={(d.get('duration_ms') or 0) / 1000:.1f} "
            f"usd={turn_usd(turn):.4f} size={d.get('answer_size')} ceiling={d.get('size_ceiling')}")


def _reading_frame(turn) -> dict:
    said: dict = {}
    for event, data, _at in turn.frames:
        if event == "reading":
            said = {k: v for k, v in data.items() if k in ("claim", "caveat", "next", "asks")}
    return said


def _drawn(turn) -> tuple[int, int, str]:
    """(words HIS COLUMN draws, the bound for this size, the caveat drawn with the figures)."""
    said = _reading_frame(turn)
    size = (turn.done or {}).get("answer_size") or "focused"
    bound = int(_compose.size_spec(size, DEFS).get("max_words")
                or req(DEFS, "voice.body.max_words"))
    return (len((turn.answer or "").split()), bound,
            _reading.caveat_unsaid(said.get("caveat"), turn.answer or ""))


def _drawn_notices(turn) -> list[str]:
    """The kinds the room would draw — every one not `explains_only` (UI rule 4)."""
    return [str(n.get("kind")) for n in turn.notices
            if str(n.get("kind")) not in EXPLAINS_ONLY]


def _measure(case: str, turn) -> None:
    words, bound, caveat = _drawn(turn)
    said = _reading_frame(turn)
    before_a_figure = _reading.drawn_left_words(turn.answer, said)
    say(f"\n  {case}: {_clock(turn)}")
    say(f"  HIS COLUMN: {words} words against {bound}")
    say(f"  before the first figure: {before_a_figure} words "
        f"({len(caveat.split())} of them the caveat, now drawn with the figures)")
    say(f"  notices drawn: {_drawn_notices(turn)}  (raised: "
        f"{[str(n.get('kind')) for n in turn.notices]})")
    say(f"  asks: {said.get('asks')}")
    say(f"  body: {turn.answer!r}")
    report.add(case, turn, {"his_column_words": words, "bound": bound,
                            "words_before_a_figure": before_a_figure,
                            "caveat_drawn_with_the_figures": caveat,
                            "asks": said.get("asks"),
                            "notices_drawn": _drawn_notices(turn)}, None)


def _holds(turn) -> None:
    """The three things D2 enforces, on the turn that just ran."""
    words, bound, _caveat = _drawn(turn)
    assert turn.done.get("status") == "ok", turn.warnings
    assert words <= bound, (
        f"his column draws {words} words and it holds {bound} "
        f"(composition.size.kinds.*.max_words)")
    asks = _reading_frame(turn).get("asks") or []
    at = float(req(DEFS, "voice.reading.asks.not_the_question_at"))
    repeated = [a for a in asks if _reading.already_asked(a, [turn.question], at)]
    assert not repeated, f"offered back the question just asked: {repeated}"
    raw = [n for n in turn.notices
           if str(n.get("kind")) == "purchase_plan_negative_on_hand"
           and str(n.get("kind")) not in EXPLAINS_ONLY]
    assert not raw, "the purchase plan's negative-stock note is drawn again"


def test_d2_why_greenhills(monkeypatch):
    turn = run_turn(monkeypatch, "Why is Greenhills down?")
    _measure("d2_why_greenhills", turn)
    _holds(turn)


def test_d2_why(monkeypatch):
    first = run_turn(monkeypatch, "Why is Greenhills down?")
    turn = run_turn(monkeypatch, "why?", history=first.history_turns())
    _measure("d2_why", turn)
    _holds(turn)


def test_d2_check_products(monkeypatch):
    turn = run_turn(monkeypatch, "check all products")
    _measure("d2_check_products", turn)
    _holds(turn)
