"""
The morning, live (W2.1, 2026-09-22): answered before you ask.

Two cases, in order, sharing one turn:

  morning_page     the morning question asked exactly as the 08:00 standing
                   question asks it — its words, its standing instructions, and
                   an unattended turn's capabilities (no writer of any kind,
                   app.services.standing_runner) — answered on get_overview,
                   with yesterday against the usual weekday among its findings.
  morning_repeat   the same question asked again the same day, through the
                   real /bob/ask route: today's answer is found (the turn
                   above, as its stored post would carry it), the REAL data
                   check runs on the read-only role against what has landed
                   since the turn's reads, and the route answers with the
                   morning's thread — no model turn, the loop never entered.

Opt-in, like every eval:

    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
        tests/evals/test_morning_evals.py -q -s

Nothing reaches george.* from here: the harness stubs the log, and the repeat
replaces the george.posts lookup with the turn it just ran.
"""
from __future__ import annotations

import asyncio
import json
import time
from datetime import datetime, timezone

import pytest

from app.services import morning, standing_runner
from tests.evals.harness import required, run_turn, say, turn_usd
from tests.evals.test_voice_evals_v2 import _voice
from tools._common import load_defs, req

SPEC = req(load_defs(), "morning")
_TURN: dict = {}


@pytest.fixture(autouse=True)
def _live():
    required()


class _Row:
    """The morning as its standing question row carries it."""
    owner = "bob-eval"
    question = SPEC["question"]
    instructions = list(SPEC["instructions"])


def _overview_rows(turn) -> list[dict]:
    return [row for r in turn.results
            if r["tool"] in ("get_overview", "get_overview_findings") and not r["error"]
            for row in (r["result"] or {}).get("rows") or []]


def test_morning_page(monkeypatch):
    turn = run_turn(monkeypatch, SPEC["question"],
                    standing=standing_runner.instructions_block(_Row()))
    _TURN["turn"] = turn
    say(f"\n== morning_page: {turn.done.get('duration_ms')} ms · "
        f"{turn.done.get('iterations')} rounds · ${turn_usd(turn):.4f} · "
        f"calls {[c.get('tool') for c in turn.calls]}")
    say(turn.answer)
    asked = [(c.get("seq"), c.get("arguments")) for c in turn.calls
             if c.get("tool") in ("get_overview", "get_overview_findings")]
    say(f"  overview asked: {asked} · iteration_ms {turn.done.get('iteration_ms')}")
    rows = _overview_rows(turn)
    assert rows, f"the morning was not answered on the overview: {[c.get('tool') for c in turn.calls]}"
    usual = [r for r in rows if r.get("finding") == "usual_day"]
    assert usual, "no usual-weekday finding in the overview"
    say(f"  usual_day: {[r['fact'] for r in usual][:2]}")
    say(f"  says 'usual': {'usual' in turn.answer.lower()}")
    _voice("morning_page", turn)


def test_morning_repeat(monkeypatch):
    turn = _TURN.get("turn")
    if turn is None:
        pytest.skip("morning_page did not run first")
    from app.api.v1.routes import bob as route

    # THE STORED POST, as the loop writes it: the answer, its last read's meta
    # as receipts, and every call it made — each with its snapshot_timestamp.
    metas = [(r["result"] or {}).get("meta") or {} for r in turn.results if not r["error"]]
    stored = {"question": SPEC["question"], "thread_id": "morning-eval-thread",
              "answer_id": "a-1", "answered_at": datetime.now(timezone.utc),
              "receipts": metas[-1] if metas else None,
              "payload": json.loads(json.dumps({"calls": metas}, default=str))}

    class _Posts:
        async def execute(self, sql, params):
            class R:
                def mappings(self):
                    return self

                def all(self):
                    return [stored]
            return R()

    class _Session:
        async def __aenter__(self):
            return _Posts()

        async def __aexit__(self, *a):
            return False

    ran = []

    def never(*a, **k):
        ran.append(a)
        raise AssertionError("a same-day repeat entered the loop")

    monkeypatch.setattr(route, "AsyncSessionLocal", lambda: _Session())
    monkeypatch.setattr(route.bob_loop, "run", never)

    class User:
        username, role = "bob-eval", "admin"

    async def go():
        response = await route.ask(route.AskRequest(question="how are we doing?"), user=User())
        return [c async for c in response.body_iterator]

    started = time.perf_counter()
    frames = asyncio.run(go())
    seconds = time.perf_counter() - started
    events = [f.partition("\n")[0].removeprefix("event: ") for f in frames]
    say(f"\n== morning_repeat: {seconds:.2f} s · events {events} · model turns {len(ran)} · $0")
    read_at = morning.read_time(stored["receipts"], stored["payload"])
    say(f"  read_at {read_at.isoformat() if read_at else None}")
    assert events == ["start", "reused", "done"], (
        f"the repeat was not reused (did data land since the read?): {events}")
    done = json.loads(frames[-1].partition("data: ")[2])
    assert done["iterations"] == 0 and done["tool_calls"] == 0
    assert not ran
