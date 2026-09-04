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


@pytest.fixture(autouse=True, scope="session")
def _never_write_to_the_real_log():
    """
    The suite never writes to George's conversation log. Not ever.

    WHAT WAS HAPPENING. agent.loop.run() builds its own ConversationLog, and
    nothing patches it — test_chats_contract patches `_exec` only for its
    direct tests of the log, and test_river_contract deletes this variable only
    for its own. Every other test that drives the loop (the correction and
    convergence contracts) ran with whatever GEORGE_LOG_DATABASE_URL happened
    to be in the shell.

    With backend/.env exported — the configuration this repo's own notes
    recommend for changes touching agent/ or tools/ — that variable points at
    the PRODUCTION log. So a green test run was quietly inserting rows into
    george.conversations and george.gaps. Found 2026-09-05: 57 conversation
    rows and 84 gap rows whose question is a test fixture ("pin that", "how did
    Rockwell do?") and whose user_id is NULL, which no real turn has.

    The gap log is the record of what George could NOT do — the half that
    usually goes unmeasured — so junk in it is not cosmetic; it is a metric
    somebody reads.

    WHY UNSET RATHER THAN PATCH. This is not swallowing the signal. A logging
    failure SHOULD surface as a `logging_failed` warning, and it still does in
    real use. These are contract tests with a stubbed model client: they have
    no business opening a connection to any real database, and the writes were
    incidental rather than intended. Unsetting the variable makes
    ConversationLog.enabled false, so `_exec` returns before it connects.

    A side effect worth naming: the suite's result no longer depends on
    migration state. Before this, code that wrote a column or table not yet in
    the database turned seven passing tests red — which reads as a regression
    and is really a deploy-order fact.
    """
    previous = os.environ.pop("GEORGE_LOG_DATABASE_URL", None)
    try:
        yield
    finally:
        if previous is not None:
            os.environ["GEORGE_LOG_DATABASE_URL"] = previous

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


def _needs_database(item) -> bool:
    """
    Whether a test needs George's read-only role.

    The StoreHub tests are pure — the parser is bytes in, documents out, and the
    importer tests check statement construction and the parser/model contract
    without connecting. They must NOT be swept up in the database skip below.
    Skipping a test that could have run is the same failure as running one that
    cannot: either way the result does not mean what it says.
    """
    pure = ("test_storehub_parser", "test_storehub_import_contract",
            "test_storehub_tools_contract", "test_pins_contract",
            "test_pin_answer_contract", "test_config_contract",
            "test_loop_correction_contract", "test_notice_fingerprints",
            "test_brief_render", "test_undefined_names",
            "test_workflows_contract", "test_store_scope_contract",
            "test_chats_contract", "test_schema_check_contract",
            "test_connection_gate_contract", "test_convergence_cap_contract",
            "test_chart_rows_contract", "test_greeting_contract",
            "test_recall_contract", "test_approvals_contract",
            "test_voice_contract", "test_river_contract")
    return not any(name in item.nodeid for name in pure)


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
