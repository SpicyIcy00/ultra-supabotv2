"""
Stock cover, live (W1.5, 2026-09-22): what runs out, and where to get it.

Two turns in the owner's own words — the capability test's "Handle the AJI BARN
reorder." (refused as outside the replenishment scope, then the 12-call cap)
and the warning he asked for, "what's about to run out?". Opt-in, like every
eval:

    set -a; . backend/.env; set +a
    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
        tests/evals/test_stock_cover_evals.py -k <case> -q -s

The trust rows are v2's own (`_voice`): no figure a tool did not return, no
internal vocabulary, the read budget, no forced notice. On top of them, the
card's "Done when".
"""
from __future__ import annotations

import re

import pytest

from agent import loop as bob_loop
from tests.evals import checks
from tests.evals.harness import required, run_turn, say, turn_usd
from tests.evals.test_voice_evals_v2 import _voice


@pytest.fixture(autouse=True)
def _live():
    required()


def _record(name: str, turn) -> None:
    say(f"\n== {name}: {turn.done.get('duration_ms')} ms · "
        f"{turn.done.get('iterations')} rounds · ${turn_usd(turn):.4f} · "
        f"calls {[(c.get('tool'), c.get('arguments')) for c in turn.calls]}")
    say(turn.answer)


def _cover_results(turn, view: str) -> list[dict]:
    return [r["result"] for r in turn.results
            if r["tool"] == "get_stock_cover" and not r["error"]
            and (r["arguments"].get("view") or "cover") == view]


def _figures(answer: str) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", answer.replace(",", "")))


def _strings(node) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [s for v in node.values() for s in _strings(v)]
    if isinstance(node, list):
        return [s for v in node for s in _strings(v)]
    return []


def _written(turn) -> str:
    """Everything he wrote: the answer, and the words on the page he composed."""
    page = [s for c in turn.calls if c.get("tool") == bob_loop.COMPOSE_TOOL
            for key in ("reading", "arrangement") for s in _strings((c.get("arguments") or {}).get(key))]
    return "\n".join([turn.answer, *page])


def _drew(turn, view: str) -> bool:
    """Whether a composed block draws a get_stock_cover read of this view."""
    seqs = {c.get("seq") for c in turn.calls if c.get("tool") == "get_stock_cover"
            and ((c.get("arguments") or {}).get("view") or "cover") == view}
    return any(b.get("seq") in seqs for c in turn.calls if c.get("tool") == bob_loop.COMPOSE_TOOL
               for b in (c.get("arguments") or {}).get("blocks") or [])


def test_stock_running_out(monkeypatch):
    """A line above zero whose cover is under its window is named with BOTH numbers."""
    turn = run_turn(monkeypatch, "what's about to run out?")
    _record("running_out", turn)
    results = _cover_results(turn, "cover")
    assert results, f"the cover read was not made: {[c.get('tool') for c in turn.calls]}"
    firing = [row for res in results for row in res["rows"]
              if row.get("state") == res["meta"]["fires"]]
    assert firing, "no line was running out on the day read — nothing to name"
    # BOTH NUMBERS: in his words or on the page he wrote, or on the drawn rows
    # themselves, which carry cover_days and window_days on every line.
    said = _figures(_written(turn))
    named = [row for row in firing
             if f"{float(row['cover_days']):g}" in said and str(row["window_days"]) in said]
    assert named or _drew(turn, "cover"), (
        "no running-out line was named with both its cover and its window, and the "
        f"read was not drawn: {turn.answer[:400]!r}")
    # expects_figure=False: the figures are on the page he composed (checked
    # above); whether a figure also belongs in his words is the answer-size
    # rule, which is W1.1's. Every other trust row of v2 still applies.
    _voice("stock_running_out", turn, expects_figure=False)


def test_barn_reorder(monkeypatch):
    """The capability test's words: a draft instead of a refusal, inside the call cap."""
    turn = run_turn(monkeypatch, "Handle the AJI BARN reorder.")
    _record("barn_reorder", turn)
    drafts = _cover_results(turn, "draft")
    assert drafts, f"no draft was read: {[(c.get('tool'), c.get('arguments')) for c in turn.calls]}"
    rows = [row for d in drafts for row in d["rows"]]
    assert rows, "the draft came back empty"
    assert checks.asked_reads(turn.calls) < bob_loop.MAX_TOOL_CALLS, "hit the call cap again"
    low = turn.answer.lower()
    assert "not in scope" not in low and "outside" not in low, turn.answer[:400]
    # The draft reaches him: drawn as a block (its rows carry every quantity and
    # reason), or its quantities in what he wrote.
    said = _figures(_written(turn))
    assert _drew(turn, "draft") or any(str(r["quantity"]) in said for r in rows), (
        f"the draft was neither drawn nor quoted: {turn.answer[:400]!r}")
    # expects_figure=False: the figures are on the page he composed (checked
    # above); whether a figure also belongs in his words is the answer-size
    # rule, which is W1.1's. Every other trust row of v2 still applies.
    _voice("barn_reorder", turn, expects_figure=False)
