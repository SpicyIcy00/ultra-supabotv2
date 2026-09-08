"""
Runs one question through the real loop and collects everything a check needs.

The loop is untouched. Two seams are used, both of which the contract tests
already use: the read dispatcher `_call_tool` is wrapped to CAPTURE every
full result (rows the frames may not carry, because a large result sends no
rows to the client) and, for one scenario, to inject a notice the live data
cannot produce; and the conversation log is the stub, so nothing is written
to george.* — conftest has already removed GEORGE_LOG_DATABASE_URL.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Callable, Optional

import pytest

from agent import loop as george_loop
from tests.evals.checks import Turn
from tests.test_loop_correction_contract import StubLog

Inject = Callable[[str, dict, dict], dict]


def required():
    """Skip unless the eval is opted in and both live dependencies are present."""
    if os.environ.get("GEORGE_EVALS") != "1":
        pytest.skip("behavioural evals are opt-in: set GEORGE_EVALS=1")
    for k in ("GEORGE_DATABASE_URL", "ANTHROPIC_API_KEY"):
        if not os.environ.get(k):
            pytest.skip(f"{k} is not set")


def _parse(frames: list[str]) -> list[tuple[str, dict]]:
    out = []
    for f in frames:
        head, _, rest = f.partition("\n")
        event = head.removeprefix("event: ")
        try:
            data = json.loads(rest.partition("data: ")[2])
        except json.JSONDecodeError:
            data = {}
        out.append((event, data))
    return out


def run_turn(monkeypatch, question: str, *, history: Optional[list[dict]] = None,
             inject: Optional[Inject] = None, page_reader=None,
             page_scope: Optional[dict] = None, page_writer=None,
             page_references: Optional[list[dict]] = None) -> Turn:
    """
    One live turn, as a Turn.

    `page_writer` is the Page Workshop seam: a fake that records what George
    asked to be written and answers as the committed write would. Nothing
    reaches george.pages from here — the eval is about what George CHOOSES
    to write, and the service is proven separately.
    """
    captured: list[dict] = []
    real = george_loop._call_tool

    async def wrapped(name: str, args: dict):
        result, err, ms = await real(name, args)
        if inject is not None and err is None:
            result = inject(name, args, result)
        captured.append({"tool": name, "arguments": args, "result": result, "error": err})
        return result, err, ms

    StubLog.instances.clear()

    async def collect():
        return [f async for f in george_loop.run(
            question, history=history, page_reader=page_reader, page_scope=page_scope,
            page_writer=page_writer,
            page_references=page_references,
        )]

    # Restore the dispatcher after each turn: a second turn must not append
    # its results into the first turn's captured evidence.
    with monkeypatch.context() as turn_patch:
        turn_patch.setattr(george_loop, "_call_tool", wrapped)
        turn_patch.setattr(george_loop, "ConversationLog", StubLog)
        frames = _parse(asyncio.run(collect()))

    turn = Turn(question=question, answer="", results=captured)
    text: list[str] = []
    narration: list[str] = []
    calls: dict[int, dict] = {}
    for event, data in frames:
        if event == "text":
            text.append(str(data.get("delta", "")))
        elif event == "answer_reset":
            if data.get("reason") == "interim_prose":
                narration.append("".join(text).strip())
            text = []
        elif event == "tool_call":
            calls[int(data["seq"])] = dict(data)
        elif event == "tool_result":
            calls.setdefault(int(data["seq"]), {}).update(data)
        elif event == "notice":
            turn.notices.append(data)
        elif event == "warning":
            turn.warnings.append(data)
        elif event == "done":
            turn.done = data
        elif event == "page_context":
            turn.page_context = data
        elif event == "page_changed":
            turn.page_changes.append(data)
        elif event == "error":
            turn.warnings.append({"reason": "error", **data})
    turn.answer = "".join(text).strip()
    turn.narration = "\n\n".join(n for n in narration if n)
    turn.calls = [calls[k] for k in sorted(calls)]
    return turn


def evidence_summary(turn: Turn, max_rows: int = 15) -> str:
    """
    The captured results, compactly, for the judge and the report.

    Whole enough to judge by: every row of a grouped result up to the cap,
    the window, the comparison block (statuses, the not-ranked subjects) and
    the full notice text. The first run's judge called figures "fabricated"
    that were in meta.comparison.not_ranked — the summary had left them out,
    so the judge was auditing George against less than George had read.
    """
    lines = []
    for r in turn.results:
        a = json.dumps(r["arguments"], sort_keys=True, default=str)
        if r["error"]:
            lines.append(f"{r['tool']} {a} -> REFUSED: {r['error'][:300]}")
            continue
        rows = r["result"].get("rows") or []
        meta = r["result"].get("meta") or {}
        notice = meta.get("notice")
        lines.append(f"{r['tool']} {a} -> {len(rows)} rows (full set {meta.get('full_row_count')})")
        if meta.get("window"):
            lines.append("   window: " + json.dumps(meta["window"], default=str))
        if meta.get("comparison"):
            comp = {k: v for k, v in meta["comparison"].items()
                    if k in ("baseline", "baseline_statuses", "rank_by", "not_ranked", "ranking_note")}
            lines.append("   comparison: " + json.dumps(comp, default=str)[:1500])
        for k in ("zero_total_transactions", "baseline_zero_total_transactions", "evidence"):
            if k in meta:
                lines.append(f"   {k}: {json.dumps(meta[k], default=str)[:600]}")
        if notice:
            lines.append("   notice: " + notice.get("message", "")[:800])
        for row in rows[:max_rows]:
            lines.append("   " + json.dumps(row, default=str)[:400])
        if len(rows) > max_rows:
            lines.append(f"   ... {len(rows) - max_rows} more rows")
    return "\n".join(lines)


class Report:
    """Per-scenario records, written as JSON at the end of the session when asked."""

    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []

    def add(self, name: str, turn: Turn, findings: dict[str, Any], judge: Optional[dict],
            passed: Optional[bool] = None) -> None:
        """Upsert by scenario, so a failing scenario is still on the record."""
        self.records = [r for r in self.records if r["scenario"] != name]
        self.records.append({
            "passed": passed,
            "scenario": name,
            "question": turn.question,
            "answer": turn.answer,
            "narration": turn.narration,
            "calls": [{k: c.get(k) for k in ("seq", "tool", "arguments", "error", "row_count", "duplicate_of")}
                      for c in turn.calls],
            "notices": [n.get("kind") for n in turn.notices],
            "warnings": [w.get("reason") for w in turn.warnings],
            "done": {k: turn.done.get(k) for k in ("iterations", "tool_calls", "executed_calls",
                                                    "duplicate_reads", "status", "notice_forced")},
            "findings": findings,
            "judge": judge,
        })

    def write(self) -> Optional[str]:
        path = os.environ.get("GEORGE_EVAL_REPORT")
        if not path:
            return None
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(self.records, fh, indent=2, default=str)
        return path
