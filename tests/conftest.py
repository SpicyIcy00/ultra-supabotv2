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
            "test_voice_contract")
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
