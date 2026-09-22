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
import atexit
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

import pytest

from agent import loop as bob_loop
from agent import provider
from agent.model_receipts import ModelReceipts
from tests.evals import timing
from tests.evals.checks import Turn
from tests.test_loop_correction_contract import StubLog

Inject = Callable[[str, dict, dict], dict]


def say(text: str = "") -> None:
    """
    A report line, printed so ANY console can take it (P2S.7, 2026-09-18).

    The v2 summary prints "target ≤ 1", and a Windows console on cp1252 has no
    "≤": the print raised at the end of a paid run and its summary was lost.
    A character the console cannot show becomes "?"; the line is never lost.
    """
    enc = getattr(sys.stdout, "encoding", None) or "utf-8"
    print(str(text).encode(enc, "replace").decode(enc, "replace"))


def required():
    """Skip unless the eval is opted in and both live dependencies are present."""
    if os.environ.get("GEORGE_EVALS") != "1":
        pytest.skip("behavioural evals are opt-in: set GEORGE_EVALS=1")
    # The key of WHICHEVER model answers (2026-09-22): this still named
    # Anthropic's after Bob moved to DeepSeek, so with only a DeepSeek key the
    # suite skipped every case and looked like it had passed.
    for k in ("GEORGE_DATABASE_URL", provider.key_var()):
        if not os.environ.get(k):
            pytest.skip(f"{k} is not set")


def _parse(frames: list[tuple[str, float]]) -> list[tuple[str, dict, float]]:
    """
    Each frame with the milliseconds since the turn started beside it.

    THE CLOCK IS ON THE FRAME because P1.b's measure is when the SCREEN first
    had something on it, and the turn's `duration_ms` cannot answer that. One
    monotonic clock, read as each frame leaves the generator — the same clock
    discipline the loop already keeps for its own iterations (P0.3).
    """
    out = []
    for f, at in frames:
        head, _, rest = f.partition("\n")
        event = head.removeprefix("event: ")
        try:
            data = json.loads(rest.partition("data: ")[2])
        except json.JSONDecodeError:
            data = {}
        out.append((event, data, at))
    return out


def run_turn(monkeypatch, question: str, *, history: Optional[list[dict]] = None,
             inject: Optional[Inject] = None, page_reader=None,
             page_scope: Optional[dict] = None, page_writer=None,
             page_references: Optional[list[dict]] = None,
             page_context: Optional[str] = None, **injected) -> Turn:
    """
    One live turn, as a Turn.

    `page_writer` is the Page Workshop seam: a fake that records what Bob
    asked to be written and answers as the committed write would. Nothing
    reaches george.pages from here — the eval is about what Bob CHOOSES
    to write, and the service is proven separately.
    """
    captured: list[dict] = []
    real = bob_loop._call_tool

    async def wrapped(name: str, args: dict):
        result, err, ms = await real(name, args)
        if inject is not None and err is None:
            result = inject(name, args, result)
        captured.append({"tool": name, "arguments": args, "result": result, "error": err})
        return result, err, ms

    StubLog.instances.clear()

    async def collect():
        started = time.perf_counter()
        out = []
        async for f in bob_loop.run(
            question, history=history, page_reader=page_reader, page_scope=page_scope,
            page_writer=page_writer, page_context=page_context,
            page_references=page_references,
            # The other injected writers and readers (W1.2's fakes), passed
            # through untouched: nothing reaches george.* from an eval.
            **injected,
        ):
            out.append((f, (time.perf_counter() - started) * 1000))
        return out

    # Restore the dispatcher after each turn: a second turn must not append
    # its results into the first turn's captured evidence.
    with monkeypatch.context() as turn_patch:
        turn_patch.setattr(bob_loop, "_call_tool", wrapped)
        turn_patch.setattr(bob_loop, "ConversationLog", StubLog)
        frames = _parse(asyncio.run(collect()))

    turn = Turn(question=question, answer="", results=captured)
    # WHAT WENT TO THE GAPS LOG (2026-09-19). The P2S.✓ run's one api_error
    # lost its reason: the loop tells the person a sentence and writes the
    # exception to george.gaps, and the stub log threw the statement away.
    # The stubbed statements are read back here, so a report carries the
    # exception's own words without the stream ever carrying them.
    turn.gaps = [
        {"kind": params[2], "tool": params[3], "detail": params[4]}
        for log in StubLog.instances for sql, params in log.statements
        if "george.gaps" in sql and len(params) >= 5
    ]
    text: list[str] = []
    narration: list[str] = []
    calls: dict[int, dict] = {}
    turn.frames = list(frames)
    for event, data, _at in frames:
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
    METER.add(turn)
    return turn


def _result_sizes(turn: Turn) -> list[dict]:
    """Each read's size as handed to the model, and whole (P2S.9(c))."""
    receipts = ModelReceipts(bob_loop._load_defs())
    out = []
    for n, r in enumerate(turn.results):
        if r["error"] or not r["result"]:
            continue
        capped = bob_loop._truncate(r["result"] or {})
        seq = ((capped.get("meta") or {}).get("call_seq"))
        shown = receipts.copy(capped, int(seq) if isinstance(seq, int) else -1 - n)
        out.append({"tool": r["tool"], "rows": len(capped.get("rows") or []),
                    "chars_to_model": len(json.dumps(bob_loop._json_safe(shown))),
                    "chars_full": len(json.dumps(bob_loop._json_safe(capped)))})
    return out


def evidence_summary(turn: Turn, max_rows: int = 15) -> str:
    """
    The captured results, compactly, for the judge and the report.

    Whole enough to judge by: every row of a grouped result up to the cap,
    the window, the comparison block (statuses, the not-ranked subjects) and
    the full notice text. The first run's judge called figures "fabricated"
    that were in meta.comparison.not_ranked — the summary had left them out,
    so the judge was auditing Bob against less than Bob had read.
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


# The rates of whichever model answers, from agent/provider.py (2026-09-22).
# Fixed at Opus's, a DeepSeek run would have reported ~20x what it cost.
RATES = provider.rates()
RATES_AS_OF = f"{provider.provider_name()} {provider.rates_as_of()}"


def turn_usd(turn) -> float:
    """
    What one turn cost at the same rates the Meter uses (P2S.6) — recorded,
    never asserted: the owner, 2026-09-18, "cost should not hold us back in
    functionality, i just want to optimize cost".
    """
    usage = (turn.done or {}).get("usage") or {}
    if not isinstance(usage, dict):
        return 0.0
    return sum(int(usage.get(k) or 0) / 1e6 * RATES[k] for k in RATES)


class Meter:
    """
    What the session actually spent, counted at `run_turn`.

    WHY THIS EXISTS, 2026-09-13. `Report.spend()` summed `self.records`, which
    are the SCORED scenarios — so every setup turn a multi-turn scenario ran
    first was invisible. In the first twelve that is four: "How is Rockwell
    doing?" re-asked as the setup for follow-up, correction and keep-page, and
    the Seikyo draft for run-monday. Measured against
    `verification/p1b-final.json`, the recorded $1.71 was the scored twelve and
    those four setups cost **another $1.19**. A full run was $2.90 while
    NOW.md said $1.65 — after that figure had already been corrected once,
    down from $5-7.

    **Understating the meter by 40% is worse than any saving it could
    suggest**, because it is the number every decision about what to run gets
    made from. This counts a turn when the turn happens, so nothing can be
    spent without being seen.
    """

    def __init__(self) -> None:
        self.turns = 0
        self.tokens = {k: 0 for k in RATES}

    def add(self, turn) -> None:
        usage = (turn.done or {}).get("usage") or {}
        self.turns += 1
        for key in self.tokens:
            self.tokens[key] += int(usage.get(key) or 0)

    def usd(self) -> float:
        return sum(self.tokens[k] / 1e6 * RATES[k] for k in self.tokens)

    def snapshot(self) -> dict:
        return {"turns": self.turns, "tokens": dict(self.tokens),
                "usd": round(self.usd(), 4), "rates_as_of": RATES_AS_OF}


    def record(self) -> None:
        """
        Append this process's spend to the ledger, ALWAYS.

        WHY, 2026-09-13. `Report.write()` only wrote a file when
        `GEORGE_EVAL_REPORT` was set, so **a run started without it left no
        trace of any kind** — no tokens, no cost, no record that it happened.
        Thirteen reports exist for 2026-09-13 and eight carry no usage at all;
        their cost is unrecoverable, and runs with no env var are not even in
        that thirteen. The owner watched an API balance fall by ~$6.70 against
        a reported $0.64 and had no way to reconcile it, because most of the
        day's spend was never written down.

        This runs at interpreter exit, needs no environment variable, and
        appends one line per process. It is the only complete record there is.
        """
        if not self.turns:
            return
        try:
            path = Path(__file__).resolve().parents[2] / "verification" / "spend_ledger.jsonl"
            path.parent.mkdir(parents=True, exist_ok=True)
            row = self.snapshot()
            row["at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
            row["argv"] = " ".join(sys.argv[1:])[:300]
            row["report"] = os.environ.get("GEORGE_EVAL_REPORT") or None
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(row) + "\n")
            say(f"\n[spend] this process: {row['turns']} live turns, "
                  f"${row['usd']:.2f} — appended to {path.name}")
        except Exception as exc:            # never fail a run over bookkeeping
            say(f"\n[spend] LEDGER WRITE FAILED: {exc!r}")


METER = Meter()
atexit.register(METER.record)


# ---------------------------------------------------------------------------
# WHAT A REPORT KEEPS OFF THE `done` FRAME — declared here, held by a test.
#
# WHY IT IS A DECLARATION, 2026-09-15 (P2.0). `deterministic_edits` went onto
# the done frame for P1.h and into this list five minutes AFTER the run that
# was supposed to demonstrate it, so `verification/p1h-v2.json` carries no such
# key and P1.h's close-out claimed a number no artifact held. Nothing failed;
# a session noticed, three cards later. A key the loop emits and the report
# silently drops costs a live run to recover, and there is no reason for the
# two lists to disagree by accident.
#
# So every key of the frame is in exactly one of these two, and
# `tests/test_eval_report_contract.py` reads the frame out of `agent/loop.py`
# and fails if one is in neither.
# ---------------------------------------------------------------------------
DONE_KEPT = (
    "iterations", "tool_calls", "executed_calls", "duplicate_reads", "status",
    "notice_forced",
    # the reading calls Bob made, one asked as one counting once (P2S.10)
    "asked_reads",
    # the clock (P0.3)
    "duration_ms", "iteration_ms", "corrective_turns",
    # the closing rounds not sent because the round before was the answer
    # (P2S.9(a)) — what P2S.✓ measures that card by
    "rounds_saved",
    # the grounding gate's round trips (voice.grounding, 2026-09-19)
    "grounding_corrections",
    # what the gates did without a round trip, and how hard he thought (P1.h)
    "deterministic_edits", "effort", "effort_kind",
    # the four token counts, which are the only record of what a turn cost:
    # an eval turn is not in george.conversations, so cost_report cannot see it
    "usage", "cache_hit", "cache_measured",
    # the size the answer was held to and the most it could be, and the
    # notices placed by code rather than argued for (W1.1, 2026-09-22)
    "answer_size", "size_ceiling", "notices_placed",
)

DONE_DROPPED = {
    "conversation_id": "the stubbed log's id — nothing can reopen it afterwards",
    "thread_id": "same: identity of a turn that was never written down",
}


# ---------------------------------------------------------------------------
# THE OUTCOME OF A SCENARIO, AND WHEN IT IS KNOWN.
#
# A record is written BEFORE the first assertion, deliberately: a scenario that
# fails is the one most worth reading, and a report that only holds passes is
# the gap log all over again. But its OUTCOME is not known then — and until
# 2026-09-15 `add` took a `passed` argument, so every v2 call wrote
# `passed=False` at the top of the function and never revised it. Four reports
# claim eleven failures over runs pytest scored 11 of 11.
#
# Every rule in ops/NOW.md §2b about reading a recorded run instead of buying a
# new one rests on the file being readable, and this is the one fact it could
# not carry. So the outcome is not an argument any more: the runner writes it
# when the test ends, through `score`, and `add` has no way to claim one.
# ---------------------------------------------------------------------------
REPORTS: list["Report"] = []
CURRENT_TEST: Optional[str] = None

SCORING_SINCE = "2026-09-15"
SCORING_NOTE = (
    "`passed` is this scenario's outcome AFTER its assertions ran, and `failure` "
    "is the assertion that failed. `null` means the run ended before the "
    "scenario was scored. A report with no top-level `scoring` key was written "
    f"before {SCORING_SINCE}: every `passed` in it was written before the first "
    "assertion ran and never revised, so it says nothing about whether the run "
    "passed and cannot be re-scored."
)


def begin(nodeid: Optional[str]) -> None:
    """The test now running, stamped onto every record it writes."""
    global CURRENT_TEST
    CURRENT_TEST = nodeid


def score(nodeid: str, passed: bool, failure: Optional[str] = None) -> int:
    """Give every scenario that test recorded its outcome. Returns how many."""
    return sum(r.score(nodeid, passed, failure) for r in REPORTS)


def assertion_text(longrepr: Any) -> Optional[str]:
    """
    The assertion that failed, off pytest's own representation of the failure.

    The `E ` lines are the assertion and its message; the rest is source
    context a report does not need. Bounded, because one of these carries a
    whole answer in its message.
    """
    text = str(longrepr or "")
    lines = [ln[2:].strip() for ln in text.splitlines() if ln.startswith("E ")]
    if not lines:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()][-1:]
    return (" ".join(lines)[:600] or None) if lines else None


class Report:
    """
    Per-scenario records, written as JSON at the end of the session when asked.

    SHAPE CHANGED 2026-09-13: the file is now `{"spend": {...}, "cases": [...]}`
    where it used to be a bare list of cases. Nothing in the repository parses
    these — they are read by people — so the change costs nothing, but the
    seven reports written before that date are still bare lists and a script
    comparing runs across it has to handle both.

    AND AGAIN 2026-09-15: a top-level `scoring` block, and `passed`/`failure`
    on each case written by the runner when the test ends. Its ABSENCE is how
    a reader and `tests/evals/corpus.py` tell a report that predates the fix.
    """

    def __init__(self) -> None:
        self.records: list[dict[str, Any]] = []
        REPORTS.append(self)

    def score(self, nodeid: str, passed: bool, failure: Optional[str] = None) -> int:
        """
        The outcome of every scenario `nodeid` recorded, once.

        Only records still unscored are touched: a scenario re-recorded by a
        later upsert is scored by the test it was written in, and a second
        call cannot overturn a verdict already given.
        """
        n = 0
        for record in self.records:
            if record.get("test") == nodeid and record.get("passed") is None:
                record["passed"] = bool(passed)
                record["failure"] = None if passed else failure
                n += 1
        return n

    def outcome(self) -> dict[str, Any]:
        """Passed, failed and unscored, for the file and for stdout."""
        passed = [r["scenario"] for r in self.records if r.get("passed") is True]
        failed = [r["scenario"] for r in self.records if r.get("passed") is False]
        unscored = [r["scenario"] for r in self.records if r.get("passed") is None]
        return {
            "recorded": "end_of_turn", "since": SCORING_SINCE, "note": SCORING_NOTE,
            "scenarios": len(self.records), "passed": len(passed),
            "failed": failed, "unscored": unscored,
        }

    def add(self, name: str, turn: Turn, findings: dict[str, Any], judge: Optional[dict],
            extra_results: Optional[list[dict[str, Any]]] = None) -> None:
        """
        Upsert by scenario, so a failing scenario is still on the record.

        THERE IS NO `passed` ARGUMENT, and that is the point (P2.0). This runs
        before the first assertion — it has to, or a failing scenario would not
        be recorded at all — so at this moment nobody knows the outcome. It is
        written by `score`, from the runner, when the test ends.

        `extra_results` IS WHAT THE TURN COULD SEE BUT DID NOT READ — the rows
        an earlier turn of the same thread carried forward. The checks are
        given them at run time, so a report that left them out was judged by
        the replay under less evidence than the run had: P1.e's v2 run passed
        `correction` with no ungrounded numerals and `corpus.py` then reported
        three, every one of them a figure the turn before had returned. A
        verification tool that disagrees with the run it is verifying is worse
        than no tool.
        """
        self.records = [r for r in self.records if r["scenario"] != name]
        self.records.append({
            # Filled in by `score` when the test ends: True, False with the
            # assertion in `failure`, or null if the run never got that far.
            "passed": None,
            "failure": None,
            "test": CURRENT_TEST,
            "scenario": name,
            "question": turn.question,
            "answer": turn.answer,
            "narration": turn.narration,
            "calls": [{k: c.get(k) for k in ("seq", "tool", "arguments", "error", "row_count", "duplicate_of",
                                                   "one_call")}
                      for c in turn.calls],
            "notices": [n.get("kind") for n in turn.notices],
            "warnings": [w.get("reason") for w in turn.warnings],
            # AND WHAT THEY SAID. P1.a's measure is rejections per turn, and
            # the reasons were not on the record: four runs of the twelve had
            # to be reconstructed by replaying the stored arguments through
            # the validator, which cannot see the rows and so guessed wrong
            # about which refusals were real. A measurement whose reasons
            # nobody can read is the gap log all over again.
            "warning_detail": [
                {"reason": w.get("reason"), "detail": w.get("detail")}
                for w in turn.warnings if w.get("detail")
            ],
            # The exception behind an api_error or an unhandled turn, from
            # the gaps log rather than the stream (2026-09-19).
            "error_detail": [g for g in getattr(turn, "gaps", [])
                             if g.get("kind") in ("api_error", "unhandled")],
            # duration_ms, iteration_ms and corrective_turns are the clock
            # (P0.3). The twelve are where the Phase 1 wall-clock baseline
            # comes from — real model, real reads — and a measurement the
            # report does not keep is a measurement nobody can compare
            # against next time.
            # `usage` is the four token counts the API returned, and it was on
            # the done frame all along without being kept — so the cost of a
            # run has never been in a report. It matters because an eval turn
            # is NOT in `george.conversations`: ConversationLog is stubbed, so
            # `ops/cost_report.py` cannot see a single one of these and eval
            # spend was invisible in a way real traffic is not. Keeping it here
            # is the only place the number can come from.
            # `deterministic_edits`, `effort` and `effort_kind` are P1.h's own
            # numbers: what the gates did WITHOUT a round trip, and how hard
            # the turn was told to think. Neither can be recovered from
            # anywhere else afterwards, and a run that does not record them
            # cannot be compared with the run before it.
            "done": {k: turn.done.get(k) for k in DONE_KEPT},
            # TIME TO FIRST VISIBLE OBJECT (P1.b, 2026-09-13), replayed
            # through the room's own board rule (tests/evals/timing.py). Two
            # numbers, not one, because the card moves only the second:
            #
            #   board   when the board stopped being empty for good. The
            #           client's fallback already drew a quiet table per read,
            #           so this is the first read landing either way.
            #   shaped  when the board first held an object somebody CHOSE the
            #           shape of. `before` is Bob's own compose, a whole
            #           round trip after the rows; `after` is the loop's
            #           default, in the same iteration as the reads.
            #
            # `before` replays the same frames under the rule as it stood
            # before P1.b, which is how one run yields both without paying for
            # two — and with none of the noise of comparing two draws of a
            # stochastic system.
            "first_object_ms": {
                "board_before": timing.first_object_ms(turn.frames, with_default=False),
                "board_after": timing.first_object_ms(turn.frames, with_default=True),
                "shaped_before": timing.first_composed_object_ms(turn.frames, with_default=False),
                "shaped_after": timing.first_composed_object_ms(turn.frames, with_default=True),
            },
            # THE BOARD BUILDING AS HE WORKS (P2S.7): when it gained blocks,
            # whether one landed before the final round, and whether anything
            # drawn earlier moved (tests/evals/timing.board_growth).
            "board_growth": timing.board_growth(turn.frames, turn.done),
            # WHAT WAS COERCED rather than refused, per compose (P2S.7): each
            # entry is a length, an emphasis count or a rounding that used to
            # cost a refused compose and, usually, another round.
            "coerced": [c for event, data, _at in turn.frames if event == "compose"
                        for c in (data.get("coerced") or [])],
            # WHAT THE TURN COST, recorded and never asserted (the owner,
            # 2026-09-18: "cost should not hold us back in functionality").
            "turn_usd": round(turn_usd(turn), 4),
            # HOW BIG EACH READ WAS WHEN HANDED TO THE MODEL (P2S.7(f)) — the
            # characters the loop sends, after its own row cap. Measured, not
            # cut: in P2S.6's Greenhills turn $0.20 of $0.34 was caching
            # large stock and replenishment results, and the owner's rule is
            # that cost never makes Bob read less.
            #
            # SINCE P2S.9, `chars_to_model` is what the model was actually
            # sent — the receipts shortened as the loop shortens them, in the
            # order the turn read — and `chars_full` is the whole result, the
            # figure every report before P2S.9 recorded as chars_to_model.
            "result_sizes": _result_sizes(turn),
            # THE EVIDENCE, BOUNDED — added 2026-09-13 so a recorded run can be
            # REPLAYED through changed checks for free. Every trust check is a
            # function of (answer, results): `ungrounded_numerals`,
            # `grounded_numerals`, `restated_sentences`. Without the rows they
            # could only be re-verified by paying for another live run, which
            # is $2.90 to test a regex. With them, a card that changes only a
            # CHECK costs nothing (`tests/evals/corpus.py`).
            #
            # Bounded at 30 rows per result: `allowed_numbers` needs the
            # figures, not the whole table, and an unbounded report was 70 KB
            # already.
            "results": [
                {"tool": r["tool"], "arguments": r["arguments"], "error": r["error"],
                 "result": None if r["error"] else {
                     "rows": (r["result"].get("rows") or [])[:30],
                     "meta": r["result"].get("meta") or {},
                 }}
                for r in turn.results
            ] + [
                {"tool": "(carried from an earlier turn)", "arguments": {}, "error": None,
                 "result": {"rows": (r.get("rows") or [])[:30], "meta": r.get("meta") or {}}}
                for r in (extra_results or [])
            ],
            "findings": findings,
            "judge": judge,
        })

    def spend(self) -> dict[str, Any]:
        """
        What this run cost, from the tokens the API reported.

        Same rates as `ops/cost_report.py` and the same reason for holding them
        as a constant: a price that moves silently under a report keeps looking
        authoritative while meaning something else. If one changes, change both.
        """
        totals = {k: 0 for k in RATES}
        for record in self.records:
            usage = (record.get("done") or {}).get("usage") or {}
            for key in totals:
                totals[key] += int(usage.get(key) or 0)
        cost = sum(totals[k] / 1e6 * RATES[k] for k in totals)
        scored = {"turns": len(self.records), "tokens": totals,
                  "usd": round(cost, 4), "rates_as_of": RATES_AS_OF}
        # THE BILL IS THE METER, NOT THIS. `scored` here means RECORDED — a
        # scenario that reached `add` — and a setup turn never does. It is not
        # the `scoring` block, which is whether each one passed; the key is
        # `scored_only` in four recorded reports already, so it keeps its name.
        # Both are reported, so the gap between them can never go unnoticed.
        run = METER.snapshot()
        run["scored_only"] = scored
        run["unscored_turns"] = run["turns"] - scored["turns"]
        run["unscored_usd"] = round(run["usd"] - scored["usd"], 4)
        return run

    def write(self) -> Optional[str]:
        path = os.environ.get("GEORGE_EVAL_REPORT")
        if not path:
            return None
        spend = self.spend()
        outcome = self.outcome()
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"scoring": outcome, "spend": spend, "cases": self.records},
                      fh, indent=2, default=str)
        # On stdout as well as in the file: a run that cost real money should
        # say so where the person who started it is looking.
        say(f"\n[eval] {spend['turns']} live turns cost ${spend['usd']:.2f} "
              f"— {spend['scored_only']['turns']} scored (${spend['scored_only']['usd']:.2f}) "
              f"+ {spend['unscored_turns']} setup (${spend['unscored_usd']:.2f})")
        # AND WHETHER IT PASSED, which until 2026-09-15 existed only in a
        # pytest line nothing kept.
        say(f"[eval] {outcome['passed']}/{outcome['scenarios']} scenarios passed"
              + (f" — failed: {', '.join(outcome['failed'])}" if outcome["failed"] else "")
              + (f" — unscored: {', '.join(outcome['unscored'])}" if outcome["unscored"] else ""))
        return path
