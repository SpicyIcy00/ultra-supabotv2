"""
A recorded eval run says whether it passed, and keeps every key the loop emits.

PURE. No database, no API, no live turn.

TWO FINDINGS OF P1.✓, HELD HERE SO NEITHER CAN RECUR.

  1. `tests/evals/test_voice_evals_v2.py` wrote `passed=False` into every
     record before its first assertion ran and never revised it, so all four
     v2 reports claim eleven failures over runs pytest scored 11 of 11. The
     score existed only in a terminal line nothing keeps — and ops/NOW.md §2b
     asks a reader to trust the file instead of buying a new run.

  2. `deterministic_edits` went onto the `done` frame for P1.h and into the
     report's key list five minutes AFTER the run that was meant to
     demonstrate it, so P1.h's close-out quoted a number no artifact held.
     Nothing failed; a session noticed, three cards later.

Both are the same shape: a claim about a run that the run's own record could
not support. The tests below are about the RECORD, not about Bob.
"""

from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path

import pytest

from tests.evals import conftest as evals_conftest
from tests.evals import harness
from tests.evals.checks import Turn
from tests.evals.harness import DONE_DROPPED, DONE_KEPT, Report

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------------------
# The `done` frame's keys, read out of the loop
# ---------------------------------------------------------------------------

def _done_frame_keys() -> list[str]:
    """
    Every key of the `done` frame, read from `agent/loop.py` itself.

    The source and not a live turn, because the point is to catch a key the
    day it is ADDED — a live turn costs a model call, and a key nobody records
    is invisible until a close-out quotes it.
    """
    tree = ast.parse((ROOT / "agent" / "loop.py").read_text(encoding="utf-8"))
    frames = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or len(node.args) != 2:
            continue
        fn, first, second = node.func, node.args[0], node.args[1]
        if not (isinstance(fn, ast.Name) and fn.id == "_sse"):
            continue
        if not (isinstance(first, ast.Constant) and first.value == "done"):
            continue
        assert isinstance(second, ast.Dict), "the done frame is no longer a dict literal"
        keys = [k.value for k in second.keys if isinstance(k, ast.Constant)]
        assert len(keys) == len(second.keys), "the done frame has a computed key"
        frames.append(keys)
    assert len(frames) == 1, f"expected one done frame in agent/loop.py, found {len(frames)}"
    return frames[0]


def test_every_done_key_is_either_kept_or_declared_dropped():
    """
    The finding, as a test. A key added to the frame fails here until somebody
    decides whether a report keeps it — which is the decision that was skipped.
    """
    emitted = set(_done_frame_keys())
    declared = set(DONE_KEPT) | set(DONE_DROPPED)
    assert emitted - declared == set(), (
        "the loop emits done keys the eval report neither keeps nor declares "
        f"dropped: {sorted(emitted - declared)}. Add each to harness.DONE_KEPT, "
        "or to harness.DONE_DROPPED with the reason a report does not need it."
    )
    assert declared - emitted == set(), (
        "harness declares done keys the loop no longer emits: "
        f"{sorted(declared - emitted)}"
    )


def test_the_report_keeps_the_keys_it_declares():
    turn = Turn(question="q", answer="a")
    turn.done = {k: k for k in _done_frame_keys()}
    report = Report()
    report.add("scenario", turn, {}, None)
    assert set(report.records[0]["done"]) == set(DONE_KEPT)
    for dropped in DONE_DROPPED:
        assert dropped not in report.records[0]["done"]


def test_the_clock_and_the_tokens_are_kept():
    """
    The keys a later reader cannot recover from anywhere else: an eval turn is
    not in `george.conversations` (the log is stubbed), so if the report drops
    these, what the run cost and how long it took are gone.
    """
    for key in ("duration_ms", "iteration_ms", "usage", "deterministic_edits",
                "effort", "corrective_turns"):
        assert key in DONE_KEPT


# ---------------------------------------------------------------------------
# The outcome — written when the test ends, by the runner, or not at all
# ---------------------------------------------------------------------------

def test_add_cannot_be_told_an_outcome():
    """
    The structural half. `passed=False` was passable as an argument at the top
    of a function that had checked nothing; now there is no argument to pass.
    """
    params = inspect.signature(Report.add).parameters
    assert "passed" not in params
    assert "failure" not in params


def _recorded(nodeid: str = "tests/evals/test_x.py::test_y") -> Report:
    harness.begin(nodeid)
    report = Report()
    report.add("scenario", Turn(question="q", answer="a"), {}, None)
    return report


def test_a_fresh_record_claims_nothing():
    record = _recorded().records[0]
    assert record["passed"] is None
    assert record["failure"] is None
    assert record["test"] == "tests/evals/test_x.py::test_y"


def test_a_pass_is_recorded_when_the_test_ends():
    report = _recorded()
    assert report.score("tests/evals/test_x.py::test_y", True) == 1
    assert report.records[0]["passed"] is True
    assert report.records[0]["failure"] is None
    assert report.outcome()["passed"] == 1
    assert report.outcome()["failed"] == []


def test_a_failure_is_recorded_with_the_assertion_that_failed():
    report = _recorded()
    report.score("tests/evals/test_x.py::test_y", False,
                 "AssertionError: figures no tool returned: ['801']")
    record = report.records[0]
    assert record["passed"] is False
    assert "801" in record["failure"]
    assert report.outcome()["failed"] == ["scenario"]


def test_another_tests_verdict_does_not_reach_this_scenario():
    report = _recorded()
    assert report.score("tests/evals/test_x.py::test_other", False, "boom") == 0
    assert report.records[0]["passed"] is None


def test_a_verdict_is_not_overturned():
    report = _recorded()
    report.score("tests/evals/test_x.py::test_y", True)
    report.score("tests/evals/test_x.py::test_y", False, "boom")
    assert report.records[0]["passed"] is True


def test_a_scenario_the_run_never_reached_stays_unscored():
    """
    Three-valued, deliberately: a run that stopped early did not fail its
    remaining scenarios, and a report that says it did is the same lie in the
    other direction.
    """
    report = _recorded()
    outcome = report.outcome()
    assert outcome["unscored"] == ["scenario"]
    assert outcome["passed"] == 0
    assert outcome["failed"] == []


def test_a_rerecorded_scenario_is_scored_by_the_test_that_rewrote_it():
    """
    The investigation and page-workshop suites upsert: `_common` records the
    findings, `_record` replaces the record with the judge's verdict attached.
    The replacement must still be scorable.
    """
    report = _recorded()
    report.add("scenario", Turn(question="q", answer="a"), {}, {"clean": True})
    assert report.score("tests/evals/test_x.py::test_y", True) == 1
    assert report.records[0]["judge"] == {"clean": True}
    assert report.records[0]["passed"] is True


# ---------------------------------------------------------------------------
# The assertion text, off pytest's own failure representation
# ---------------------------------------------------------------------------

def test_the_assertion_lines_are_what_is_kept():
    longrepr = (
        "def test_gate_2_why(monkeypatch):\n"
        '        turn = _turn(monkeypatch, "Why was North Edsa up so much last week?")\n'
        '>       _voice("why", turn)\n'
        "E       AssertionError: figures no tool returned: ['801']\n"
        "E       assert not ['801']\n"
        "\n"
        "tests/evals/test_voice_evals_v2.py:210: AssertionError"
    )
    text = harness.assertion_text(longrepr)
    assert text == "AssertionError: figures no tool returned: ['801'] assert not ['801']"


def test_a_failure_with_no_assertion_line_still_says_something():
    assert harness.assertion_text("Failed: DID NOT RAISE") == "Failed: DID NOT RAISE"
    assert harness.assertion_text(None) is None


def test_the_assertion_text_is_bounded():
    longrepr = "E       AssertionError: " + "x" * 5000
    assert len(harness.assertion_text(longrepr)) <= 600


# ---------------------------------------------------------------------------
# What the recorded reports can and cannot say
# ---------------------------------------------------------------------------

# THE REPORTS THIS RUNS OVER, AND WHY TWO OF THEM ARE IN THE REPOSITORY.
#
# `verification/` is gitignored, and rightly: a recorded run carries real rows
# off the estate, and those do not belong in git. But the rule below — absence
# of the `scoring` block is how a reader knows a report predates 2026-09-15 —
# is a rule about the FORMAT, and it has to hold on every machine. Read only
# from `verification/`, it held on one laptop and nowhere else: in CI the glob
# is empty, the parametrize collapses to a single "empty parameter set" skip,
# and the guard that was meant to catch exactly that failed the build instead.
# Red on `main` from 13795bb (P2.0) until 2026-09-15, because nobody pushed in
# between.
#
# So the rule is held against two FIXTURES the repository carries — one of each
# kind, synthetic, no business figures in either — and the local reports are
# scanned as well wherever they exist. CI proves the rule; a developer machine
# proves it and checks its own records at the same time.
FIXTURE_REPORTS = sorted((ROOT / "tests" / "evals" / "fixtures").glob("*-v2.json"))
LOCAL_REPORTS = sorted((ROOT / "verification").glob("*-v2.json"))
V2_REPORTS = FIXTURE_REPORTS + LOCAL_REPORTS


def test_both_kinds_of_report_are_on_hand_to_reason_about():
    """
    The parametrize below is only worth anything if it sees one of each. An
    empty or one-sided set is the failure this test exists to name — and it
    must never be a SKIP, because ops/verify_integration.py treats any skip in
    the pure suite as the suite not having run.
    """
    kinds = {"scoring" in json.loads(p.read_text(encoding="utf-8")) for p in FIXTURE_REPORTS}
    assert kinds == {True, False}, (
        "tests/evals/fixtures needs one report with a `scoring` block and one "
        f"without; found {len(FIXTURE_REPORTS)} carrying {kinds or 'nothing'}."
    )


@pytest.mark.parametrize("path", V2_REPORTS, ids=lambda p: p.name)
def test_a_report_written_before_the_fix_is_identifiable_by_its_own_content(path):
    """
    The four recorded runs cannot be re-scored — the outcome was never written
    down — so the only honest thing is that they SAY SO. Absence of the
    top-level `scoring` block is the marker, and `tests/evals/corpus.py` prints
    the sentence when it reads one.

    This test does not rewrite them. A record is a record; the fix is forward.
    """
    report = json.loads(path.read_text(encoding="utf-8"))
    if "scoring" in report:
        assert report["scoring"]["since"] == harness.SCORING_SINCE
        assert set(report["scoring"]) >= {"passed", "failed", "unscored", "scenarios"}
        # Three-valued, and the block agrees with the cases it counts.
        outcomes = [case.get("passed") for case in report["cases"]]
        assert set(outcomes) <= {True, False, None}
        assert report["scoring"]["scenarios"] == len(report["cases"])
        assert report["scoring"]["passed"] == outcomes.count(True)
        assert len(report["scoring"]["failed"]) == outcomes.count(False)
        assert len(report["scoring"]["unscored"]) == outcomes.count(None)
        # A failed scenario carries the assertion; a passed one carries none.
        for case in report["cases"]:
            if case.get("passed") is False:
                assert case.get("failure"), f"{case['scenario']} failed and says nothing"
            else:
                assert case.get("failure") is None
        return
    # Predates 2026-09-15: every `passed` is the hardcoded False.
    assert all(case.get("passed") is False for case in report["cases"])


def test_the_marker_is_the_absence_and_nothing_else():
    """
    A reader decides by ONE fact. Not by the date on the file, not by its name,
    not by whether its `passed` values look plausible — by whether the block is
    there. `tests/evals/corpus.py` reads it the same way, and this holds the two
    readings equal.
    """
    from tests.evals import corpus

    for path in FIXTURE_REPORTS:
        report = json.loads(path.read_text(encoding="utf-8"))
        assert bool(corpus.scoring(str(path))) is ("scoring" in report)


# ---------------------------------------------------------------------------
# The runner's half: the hooks that stamp and score
# ---------------------------------------------------------------------------

class _FakeItem:
    def __init__(self, nodeid): self.nodeid = nodeid


class _FakeReport:
    def __init__(self, when, passed, skipped=False, longrepr=None):
        self.when, self.passed, self.skipped, self.longrepr = when, passed, skipped, longrepr


class _FakeOutcome:
    def __init__(self, report): self._report = report
    def get_result(self): return self._report


def _makereport(item, report):
    """Drive the conftest's hookwrapper the way pytest does."""
    gen = evals_conftest.pytest_runtest_makereport(item, None)
    next(gen)
    try:
        gen.send(_FakeOutcome(report))
    except StopIteration:
        pass


def test_the_hooks_live_where_the_eval_suites_are():
    """
    They are registered by being in `tests/evals/conftest.py` and nowhere else:
    a scoring hook in the root conftest would run for all 1,600 pure tests,
    every one of which records nothing.
    """
    source = (ROOT / "tests" / "evals" / "conftest.py").read_text(encoding="utf-8")
    assert "def pytest_runtest_setup" in source
    assert "def pytest_runtest_makereport" in source


def test_the_runner_stamps_and_then_scores():
    item = _FakeItem("tests/evals/test_voice_evals_v2.py::test_gate_1_caveats")
    evals_conftest.pytest_runtest_setup(item)
    report = Report()
    report.add("caveats", Turn(question="q", answer="a"), {}, None)
    assert report.records[0]["passed"] is None
    _makereport(item, _FakeReport("call", passed=True))
    assert report.records[0]["passed"] is True


def test_the_runner_writes_the_assertion_that_failed():
    item = _FakeItem("tests/evals/test_voice_evals_v2.py::test_gate_2_why")
    evals_conftest.pytest_runtest_setup(item)
    report = Report()
    report.add("why", Turn(question="q", answer="a"), {}, None)
    _makereport(item, _FakeReport(
        "call", passed=False,
        longrepr="E       AssertionError: figures no tool returned: ['801']"))
    assert report.records[0]["passed"] is False
    assert "801" in report.records[0]["failure"]


def test_setup_and_teardown_do_not_decide_the_outcome():
    """
    Only the `call` phase. A fixture that fails in teardown did not fail the
    scenario, and the report is written in teardown, so a verdict given there
    would land after the file.
    """
    item = _FakeItem("tests/evals/test_voice_evals_v2.py::test_gate_3_cannot")
    evals_conftest.pytest_runtest_setup(item)
    report = Report()
    report.add("cannot", Turn(question="q", answer="a"), {}, None)
    _makereport(item, _FakeReport("setup", passed=True))
    _makereport(item, _FakeReport("teardown", passed=False, longrepr="E boom"))
    assert report.records[0]["passed"] is None


def test_a_skipped_scenario_is_not_a_failure():
    """
    Every eval skips when GEORGE_EVALS is unset, which is how the whole suite
    runs in CI. A skip that scored False would fill the report with failures
    nobody ran.
    """
    item = _FakeItem("tests/evals/test_voice_evals_v2.py::test_gate_4_morning")
    evals_conftest.pytest_runtest_setup(item)
    report = Report()
    report.add("morning", Turn(question="q", answer="a"), {}, None)
    _makereport(item, _FakeReport("call", passed=False, skipped=True))
    assert report.records[0]["passed"] is None
