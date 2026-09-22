"""
W2.4 — the big answers as designed pages, and a dashboard that is a dashboard.
LIVE MODEL, LIVE DATABASE, OPT IN.

    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv/Scripts/python.exe -m pytest \
        tests/evals/test_page_types_evals.py -k <case> -q -s

  w24_week_page   "how are we doing?" is a broad answer, and its page is one of
                  the designed types (composition.page_types): a lede, the
                  type's required sections, every block he put on the page.
                  The turn is written to verification/frames_fixtures/
                  w24-week.json so ops/frames.py can draw it beside the design.
  w24_dashboard   "build me a dashboard" builds a KEPT PAGE (create_page, a
                  fake writer — nothing reaches george.pages) from reads that
                  ran, and composes no report page of its own.

What is asserted is structure, never wording; turns, seconds and dollars are
printed, never asserted.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tests.evals import checks
from tests.evals.harness import Report, required, run_turn, say, turn_usd
from tests.evals.test_page_workshop_evals import FakeWriter
from tools._common import load_defs, req

DEFS = load_defs()
ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "verification" / "frames_fixtures" / "w24-week.json"

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


def _clock(turn) -> str:
    d = turn.done or {}
    return (f"iterations={d.get('iterations')} seconds={(d.get('duration_ms') or 0) / 1000:.1f} "
            f"usd={turn_usd(turn):.4f} reads={checks.asked_reads(turn.calls)}")


def _pages(turn) -> list:
    return [data.get("arrangement") for event, data, _at in turn.frames
            if event == "compose" and data.get("arrangement")]


def _coerced(turn) -> list[str]:
    return [c for event, data, _at in turn.frames if event == "compose"
            for c in data.get("coerced") or []]


def _fixture(turn) -> None:
    """The turn as a frames fixture — his own words, blocks, page and reads."""
    composes = [data for event, data, _at in turn.frames if event == "compose"]
    reading: dict = {}
    for event, data, _at in turn.frames:
        if event == "reading":
            reading = {k: v for k, v in data.items() if k in ("claim", "caveat", "next", "asks")}
    by_key = {}
    for r in turn.results:
        if not r["error"]:
            by_key[json.dumps([r["tool"], r["arguments"]], sort_keys=True, default=str)] = r["result"]
    calls = []
    at = None
    for c in turn.calls:
        if c.get("tool") == "compose" or "seq" not in c:
            continue
        res = by_key.get(json.dumps([c.get("tool"), c.get("arguments")], sort_keys=True, default=str))
        if not res:
            continue
        meta = res.get("meta") or {}
        at = at or meta.get("snapshot_timestamp")
        calls.append({"seq": c["seq"], "tool": c["tool"], "arguments": c.get("arguments") or {},
                      "result": {"rows": res.get("rows") or [], "meta": meta}})
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({
        "why": ("W2.4's live broad turn, recorded by tests/evals/test_page_types_evals.py: "
                "his question, his answer, his blocks, the page type he wrote into and "
                "every read, exactly as the run returned them. Nothing written by a session."),
        "question": turn.question, "answer": turn.answer, "at": at,
        "blocks": (composes[-1].get("blocks") if composes else []) or [],
        "arrangement": next((p for p in reversed(_pages(turn))), None),
        # His blocks ARE the composition (ops/frames.py reads `default_blocks`
        # as the mark of a recorded post whose `blocks` are his).
        "default_blocks": [],
        "reading": reading, "calls": calls,
    }, default=str, ensure_ascii=False, indent=1), encoding="utf-8")
    say(f"  fixture: {FIXTURE.relative_to(ROOT)}")


def test_w24_week_page(monkeypatch):
    turn = run_turn(monkeypatch, "how are we doing?")
    say(f"\n  w24_week_page: {_clock(turn)}")
    pages = _pages(turn)
    page = pages[-1] if pages else None
    types = req(DEFS, "composition.page_types.types")
    report.add("w24_week_page", turn, {"page_type": (page or {}).get("type"),
                                       "coerced": _coerced(turn)}, None)
    _fixture(turn)
    say(f"  page type: {(page or {}).get('type')}; coerced: {_coerced(turn)}")
    assert turn.done.get("status") == "ok", turn.warnings
    assert turn.done.get("size_ceiling") == "broad", turn.done
    assert page, "a broad answer drew no page"
    assert page.get("type") in types, f"the page is not one of the designed types: {page}"
    kids = page.get("children") or []
    assert kids and "lede" in kids[0], "the page does not open with a lede"
    missing = [c for c in _coerced(turn) if "needs its" in c]
    assert not missing, missing
    left = [c for c in _coerced(turn) if "NOT on the page" in c]
    assert not left, left
    # Every figure in his words is a figure a read returned (the room draws all of it).
    results = [r["result"] for r in turn.results if not r["error"]]
    assert not [x.text for x in checks.ungrounded_numerals(turn.answer, results)]


def test_w24_dashboard(monkeypatch):
    w = FakeWriter(title="Dashboard")
    turn = run_turn(monkeypatch, "build me a dashboard", page_writer=w)
    say(f"\n  w24_dashboard: {_clock(turn)}")
    report.add("w24_dashboard", turn, {"builds": len(w.builds), "edits": len(w.edits),
                                       "pages": _pages(turn)}, None)
    say(f"  create_page x{len(w.builds)}; analyses "
        f"{[a.get('title') for b in w.builds for a in b.analyses]}; answer: {turn.answer[:200]!r}")
    assert turn.done.get("status") == "ok", turn.warnings
    assert len(w.builds) == 1, f"expected one kept page built, got {len(w.builds)} (edits {len(w.edits)})"
    assert 1 <= len(w.builds[0].analyses) <= 6
    assert turn.page_changes and turn.page_changes[-1].get("page_id"), "no page_changed frame for the room"
    assert not _pages(turn), f"a dashboard request wrote a report page too: {_pages(turn)}"
    assert turn.done.get("size_ceiling") != "broad", turn.done
