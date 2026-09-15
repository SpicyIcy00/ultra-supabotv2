"""
The runner writes the outcome of an eval scenario. Nothing else may claim one.

WHY THIS FILE EXISTS, 2026-09-15 (P2.0). A scenario's record is written before
its first assertion runs — deliberately, because a scenario that FAILS is the
one most worth reading afterwards. Until today the record carried a `passed`
argument as well, and every caller filled it in at that same moment, before
anything had been checked: `test_voice_evals_v2.py` wrote `passed=False` and
never revised it, so `p1e-v2`, `p1f-v2`, `p1h-v2` and `p1close-v2` each claim
eleven failures over runs pytest scored 11 of 11.

The score existed only in the terminal line pytest prints, which nothing keeps.
So `ops/NOW.md` §2b — read a recorded eval, never re-run it — asked a reader to
trust a file about the one thing the file could not say.

The outcome is a fact about the END of the test, so it is written at the end of
the test, by the only thing that knows it. `harness.Report.add` no longer has
an argument for it.
"""

from __future__ import annotations

import pytest

from tests.evals import harness


@pytest.hookimpl(tryfirst=True)
def pytest_runtest_setup(item):
    """Stamp every record this test writes with the test that wrote it."""
    harness.begin(item.nodeid)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """
    The scenario's outcome, the moment the test body ends.

    The `call` phase and not teardown: a module-scoped report is written in the
    teardown of the module's last test, so a verdict given any later would miss
    the file. A test that errored in SETUP recorded nothing, and a scenario
    that was never reached stays `null` — which is the honest reading of a run
    that stopped early, and is why `passed` is three-valued rather than two.
    """
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or report.skipped:
        return
    harness.score(
        item.nodeid,
        report.passed,
        None if report.passed else harness.assertion_text(report.longrepr),
    )
