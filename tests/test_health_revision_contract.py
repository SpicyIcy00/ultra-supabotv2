"""/health says which build is running, and reads the schema as of now.

Two defects this holds closed, both from card P0.4.

**Nothing identified the code.** /health reported the schema revision the
database was on and the one the code expected, and said nothing about which
build was doing the expecting. On 2026-09-13 two pushes went out and "is the
fix live yet" had no answer but trying it. The rule that matters is not that
a commit is reported — it is that a commit is NEVER INVENTED: when no source
knows, the answer is null and the source is "unknown", because a plausible
wrong sha is a readout somebody trusts while debugging code that is not
running.

**The check ran once.** The startup snapshot was replayed for the life of the
process, so a database that drifted while the app ran — a migration applied
beside it, a restore, half a rollback — stayed invisible until something
restarted. /health re-reads, and says whether what it is showing was read now
or at boot.
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.core import build as build_mod

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def _fresh_cache(monkeypatch):
    # app.main refuses to import on the placeholder signing key — deliberately,
    # and the reason is in config.py. Give it a usable one; nothing here signs
    # anything.
    from app.core.config import settings
    monkeypatch.setattr(settings, "SECRET_KEY", "x" * 64)
    # revision() is cached for the life of a process, which is right in
    # production and wrong across tests.
    build_mod.revision.cache_clear()
    yield
    build_mod.revision.cache_clear()


def _no_sources(monkeypatch):
    for name in build_mod.COMMIT_VARS + (
        "RAILWAY_GIT_BRANCH", "RAILWAY_DEPLOYMENT_ID",
        "RAILWAY_SERVICE_NAME", "RAILWAY_ENVIRONMENT_NAME",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(build_mod, "_from_stamp", lambda: None)
    monkeypatch.setattr(build_mod, "_from_git", lambda: None)


# ---------------------------------------------------------------------------
# The build
# ---------------------------------------------------------------------------
def test_the_platform_commit_is_the_authority(monkeypatch):
    _no_sources(monkeypatch)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "b4cccdcfeedfacedeadbeef0123456789abcdef0")
    monkeypatch.setattr(build_mod, "_from_stamp",
                        lambda: ("stampstampstamp", "build stamp"))
    got = build_mod.revision()
    assert got["commit"].startswith("b4cccdc")
    assert got["short"] == "b4cccdcf"
    assert "RAILWAY_GIT_COMMIT_SHA" in got["source"]


def test_a_stamp_is_used_when_the_platform_reports_nothing(monkeypatch):
    _no_sources(monkeypatch)
    monkeypatch.setattr(build_mod, "_from_stamp", lambda: ("abc123def456", "build stamp"))
    got = build_mod.revision()
    assert got["commit"] == "abc123def456" and got["source"] == "build stamp"


def test_an_unknown_build_says_unknown_rather_than_guessing(monkeypatch):
    _no_sources(monkeypatch)
    got = build_mod.revision()
    assert got["commit"] is None and got["short"] is None
    assert got["source"] == "unknown"
    # UI rule 8, applied to an operator's readout: not-known is its own state,
    # and it must not borrow the rendering of known.
    assert "commit" in got, "the key stays, so a reader sees it was asked"


def test_the_deploy_context_is_reported_only_when_it_exists(monkeypatch):
    _no_sources(monkeypatch)
    monkeypatch.setenv("GIT_COMMIT", "deadbeef")
    monkeypatch.setenv("RAILWAY_GIT_BRANCH", "main")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT_NAME", "")
    got = build_mod.revision()
    assert got["branch"] == "main"
    # Reported as empty is not the same fact as not reported, and neither is
    # shown as a value.
    assert "environment" not in got and "deployment" not in got


def test_a_blank_variable_is_not_a_commit(monkeypatch):
    _no_sources(monkeypatch)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "   ")
    monkeypatch.setattr(build_mod, "_from_stamp", lambda: ("realcommit", "build stamp"))
    assert build_mod.revision()["commit"] == "realcommit"


def test_reading_the_build_never_raises(monkeypatch):
    """A health route that dies on a readout is worse than one with a gap."""
    _no_sources(monkeypatch)
    monkeypatch.setattr(build_mod, "STAMP", Path("/nonexistent/BUILD_REVISION"))
    monkeypatch.setattr(build_mod, "REPO_DIR", Path("/nonexistent"))
    assert build_mod.revision()["source"] == "unknown"


# ---------------------------------------------------------------------------
# The health route
# ---------------------------------------------------------------------------
def _health(monkeypatch, *, current, expected=("head_rev",), fail=None):
    """Drive the route's schema readout with a scripted database."""
    import app.main as main
    from app.core import schema_check

    main.app.state.schema = {"ok": False, "current": ["boot_rev"],
                             "expected": list(expected), "problem": "at boot"}
    main.app.state.schema_live = None

    async def read(_engine):
        if fail is not None:
            raise fail
        return current

    monkeypatch.setattr(schema_check, "read_current", read)
    monkeypatch.setattr(schema_check, "expected_heads", lambda: expected)
    return main, asyncio.run(main._live_schema())


def test_health_reads_the_schema_now_rather_than_at_boot(monkeypatch):
    """
    The database has been migrated since this process started. The startup
    snapshot says mismatch; the truth is that it is fine, and /health must
    say the truth.
    """
    _, (schema, source) = _health(monkeypatch, current=("head_rev",))
    assert schema["ok"] is True and source == "live"
    assert schema["current"] == ["head_rev"]


def test_health_catches_drift_the_startup_check_could_not_see(monkeypatch):
    """The other direction: booted fine, and the database moved underneath."""
    import app.main as main
    from app.core import schema_check

    main.app.state.schema = {"ok": True, "current": ["head_rev"],
                             "expected": ["head_rev"], "problem": None}
    main.app.state.schema_live = None

    async def read(_engine):
        return ("something_else",)

    monkeypatch.setattr(schema_check, "read_current", read)
    monkeypatch.setattr(schema_check, "expected_heads", lambda: ("head_rev",))
    schema, source = asyncio.run(main._live_schema())
    assert schema["ok"] is False and source == "live"


def test_a_failed_recheck_falls_back_and_says_so(monkeypatch):
    _, (schema, source) = _health(
        monkeypatch, current=(),
        fail=RuntimeError("SENTINEL postgresql://user:secret@host/db"))
    assert source == "startup", "a boot snapshot must never be passed off as current"
    assert schema["recheck_error"] == "RuntimeError"
    # Never the payload: a connection error carries the URL.
    body = repr(schema)
    assert "SENTINEL" not in body and "secret" not in body and "postgresql://" not in body


def test_the_recheck_is_cached_so_a_poller_does_not_hammer_the_database(monkeypatch):
    import app.main as main
    from app.core import schema_check

    main.app.state.schema = {"ok": False, "current": [], "expected": [], "problem": "boot"}
    main.app.state.schema_live = None
    reads = []

    async def read(_engine):
        reads.append(1)
        return ("head_rev",)

    monkeypatch.setattr(schema_check, "read_current", read)
    monkeypatch.setattr(schema_check, "expected_heads", lambda: ("head_rev",))
    assert asyncio.run(main._live_schema())[1] == "live"
    assert asyncio.run(main._live_schema())[1] == "cached"
    assert len(reads) == 1
    assert main.SCHEMA_RECHECK_SECONDS > 0


def test_health_returns_the_build_and_503s_on_a_mismatch(monkeypatch):
    from fastapi import Response
    import app.main as main
    from app.core import schema_check

    _no_sources(monkeypatch)
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "abc1234567")
    main.app.state.schema = {"ok": True, "current": ["x"], "expected": ["x"], "problem": None}
    main.app.state.schema_live = None

    # The real shape of the outage this card exists for: the database is on
    # the revision before the head this build ships. Both are real revisions,
    # so the comparison walks the real script history and reaches BEHIND
    # rather than "a revision I have never heard of".
    async def read(_engine):
        return ("v6w7x8y9z0a1",)

    monkeypatch.setattr(schema_check, "read_current", read)
    monkeypatch.setattr(schema_check, "expected_heads", lambda: ("w7x8y9z0a1b2",))
    response = Response()
    body = asyncio.run(main.health_check(response))
    assert response.status_code == 503
    assert body["status"] == "schema_mismatch"
    assert body["build"]["short"] == "abc12345"
    assert body["schema_checked"] == "live"
    assert "BEHIND" in body["schema"]["problem"]
