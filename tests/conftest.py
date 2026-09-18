"""
Shared pytest setup for the golden suite.

The tools connect through tools/_common.connect(), which refuses to run without
GEORGE_DATABASE_URL and refuses superuser or admin roles. That guard is NOT
bypassed here — these tests exercise the same connection path production uses.

Consequence: the suite needs George's own read-only role to exist. Until
tools/george_ro_role.sql has been applied and GEORGE_DATABASE_URL is set, the
whole module skips with a clear reason rather than reporting failures that are
really a missing credential.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


# The real log URL, taken OUT of the environment at import — before any test
# module is collected, and therefore before anything can read it. Kept here so
# a test that genuinely wants it can opt in and get it back.
#
# Popping is the structural half: a test cannot connect to a database whose
# address it cannot see. The assertion in the fixture below is the tripwire for
# anything that puts it back.
_REAL_LOG_URL = os.environ.pop("GEORGE_LOG_DATABASE_URL", None)


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "uses_real_log: this test genuinely needs GEORGE_LOG_DATABASE_URL. It "
        "will WRITE to that database. Skipped when the variable is unset.",
    )
    config.addinivalue_line(
        "markers",
        "gate: one of the five voice scenarios that make up the TRUST GATE "
        "(caveats, why, cannot, morning, broad). Five live model turns. Run "
        "with -m gate on any card that can change what the model sees; the "
        "full suite only at a phase close. See tests/evals/test_voice_evals_v2.py.",
    )
    config.addinivalue_line(
        "markers",
        "depth: the two questions that show whether George goes deep enough "
        "and no deeper (P2.m wrote them, P2S.6 first ran them) — 'analyze "
        "tradsnax per store' and 'how did Rockwell do?'. Two live turns; run "
        "with -m depth on a card that changes how far he reads.",
    )
    config.addinivalue_line(
        "markers",
        "core: the owner's core questions, in his own wording "
        "(ops/EVAL_QUESTIONS.md, 2026-09-18) — 'how are we doing?', the "
        "Rockwell premise, foot traffic, net sales by store yesterday, and "
        "the per-gram instruction once P2S.11 builds it. Run with -m core at "
        "a phase close or when choosing a model.",
    )


@pytest.fixture(autouse=True)
def _george_log_isolation(request):
    """
    No test touches a database it did not ask for.

    Unmarked tests — every test in this suite today — run with
    GEORGE_LOG_DATABASE_URL absent, so ConversationLog.enabled is false and
    `_exec` returns before it connects. A test that wants the real log marks
    itself `uses_real_log` and gets the variable back for its duration, which
    makes the write visible in the test's own source rather than in whatever
    the shell happened to export.

    The assertion is deliberate rather than another pop: something that puts
    the variable back mid-run has undone the isolation, and failing loudly is
    the only way that gets noticed.
    """
    if request.node.get_closest_marker("uses_real_log"):
        if _REAL_LOG_URL is None:
            pytest.skip("GEORGE_LOG_DATABASE_URL is not set")
        os.environ["GEORGE_LOG_DATABASE_URL"] = _REAL_LOG_URL
        try:
            yield
        finally:
            os.environ.pop("GEORGE_LOG_DATABASE_URL", None)
        return

    assert "GEORGE_LOG_DATABASE_URL" not in os.environ, (
        "GEORGE_LOG_DATABASE_URL is set during a test that did not ask for it. "
        "That variable points at the production conversation log; a test that "
        "drives the loop will WRITE to it. Mark the test `uses_real_log` if "
        "that is genuinely intended."
    )
    yield


# WHAT THIS ISOLATION IS FOR, kept because the reason is not obvious from the
# code. agent.loop.run() builds its own ConversationLog and nothing patched it:
# test_chats_contract patched `_exec` only for its direct tests of the log, and
# test_river_contract deleted the variable only for its own. Every other test
# that drove the loop ran against whatever the shell exported.
#
# With backend/.env exported — the configuration this repo's notes recommend
# for changes touching agent/ or tools/ — that is the PRODUCTION log. A green
# run was quietly inserting rows.
#
# DELETED 2026-09-05, one reviewed transaction, children before parents:
#
#     conversations  321 -> 185   (136 removed)
#     tool_calls    1110 -> 808   (302 removed)
#     gaps           417 -> 301   (116 removed)
#     posts          582 -> 310   (272 removed, backfilled from the same rows)
#
# Scoped to `user_id IS NULL`, which is what a test turn looks like and what a
# real one never is: 136 rows, 13 distinct questions, 55 of them exact fixture
# strings ("pin that", "sales by day?", "net sales by store?").
#
# `user_id = 'coverage'` was NOT deleted, though it was proposed. It is 145
# turns over 40 distinct real questions ("Which vending products never sell?")
# with ZERO fixture strings — a deliberate evaluation sweep, not pollution.
# Checking that before deleting is the only reason it still exists.
#
# The gap log is the record of what George could NOT do — the half that usually
# goes unmeasured — so junk in it is not cosmetic; it is a metric somebody
# reads.
#
# This is not swallowing a signal. A logging failure SHOULD surface as
# `logging_failed`, and it still does in real use. These are contract tests
# with a stubbed model client: they have no business opening a connection to
# any real database, and the writes were incidental rather than intended.
#
# A second effect, worth naming because it looked like a regression: the
# suite's result no longer depends on migration state. Code writing a column or
# table not yet in the database was turning seven passing tests red, which
# reads as a broken change and is really a deploy-order fact.

# Make the repo root importable so `from tools import ...` works when pytest is
# invoked from anywhere.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# Make backend/ importable too, so `from app.services...` works. The backend
# runs with cwd=backend in production (see Procfile), so its own modules import
# each other as `app.*`.
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


# Four modules that are pure without saying so in their name. Everything else
# pure is a *_contract.py, which the rule below covers by construction.
PURE_BY_NAME = (
    "test_brief_render",
    "test_notice_fingerprints",
    "test_storehub_parser",
    "test_undefined_names",
)


def _needs_database(item) -> bool:
    """
    Whether a test needs George's read-only role.

    THE RULE IS THE FILE'S NAME, and it used to be a list. Every `*_contract.py`
    is pure — that is what the suffix means in this repo, and `*_live.py` is
    what a database-backed test is called. The list was an allowlist of pure
    modules, so a new contract file was database-backed until somebody
    remembered to add it, and "somebody remembered" failed twice: every
    test in test_compose_contract.py was skipped from the day it was written,
    and test_standing_contract.py was skipped on its first run.

    A SKIPPED TEST THAT COULD HAVE RUN IS THE SAME FAILURE AS ONE THAT CANNOT.
    Either way the result does not mean what it says — and this direction is
    the worse of the two, because it reports success. The whole-suite guard in
    ops/verify_integration.py only catches a run where EVERY test skipped, so
    one silently skipped module passes CI looking green.

    A contract test that genuinely needs a database has been named wrong: call
    it `*_live.py`, where the live suites will run it against a verified
    target.
    """
    name = item.nodeid
    if "_contract" in name:
        return False
    return not any(pure in name for pure in PURE_BY_NAME)


def pytest_collection_modifyitems(config, items):
    """Skip the database-backed tests, with a useful reason, when the role is unavailable."""
    if not os.environ.get("GEORGE_DATABASE_URL"):
        skip = pytest.mark.skip(
            reason=(
                "GEORGE_DATABASE_URL is not set. These tests run against George's "
                "read-only Postgres role — apply tools/george_ro_role.sql and set "
                "the variable. The suite deliberately does not fall back to an "
                "application or admin connection string."
            )
        )
        for item in items:
            if _needs_database(item):
                item.add_marker(skip)
        return

    try:
        from tools._common import connect

        connect().close()
    except Exception as exc:  # noqa: BLE001 - the reason text is the point
        skip = pytest.mark.skip(reason=f"cannot connect as George's role: {exc}")
        for item in items:
            if _needs_database(item):
                item.add_marker(skip)
