"""
Boot refuses a schema it cannot use.

NO DATABASE. The decision — is alembic_version at the head these scripts
define — is a pure comparison, and that is what is tested. The part that reads
alembic_version is two lines of SQL and is exercised by every deploy.

Background: on 2026-09-04 production served 500s on the chats routes because
the database was two migrations behind the code, and nothing at boot noticed.
"""

from __future__ import annotations

import pytest

pytest.importorskip("alembic", reason="the check reads the migration scripts through alembic")
pytest.importorskip("sqlalchemy")

from app.core import schema_check as sc  # noqa: E402


def test_the_shipped_scripts_have_exactly_one_head():
    heads = sc.expected_heads()
    assert len(heads) == 1, f"branched migration history: {heads}"


def test_at_head_is_ok():
    (head,) = sc.expected_heads()
    s = sc.compare([head], [head])
    assert s.ok and s.problem is None
    assert s.as_dict()["current"] == [head]


def test_behind_is_named_as_behind():
    (head,) = sc.expected_heads()
    # The revision the 2026-09-04 incident found production sitting at.
    s = sc.compare(["j4k5l6m7n8o9"], [head])
    assert not s.ok
    assert "BEHIND" in s.problem and "j4k5l6m7n8o9" in s.problem and head in s.problem


def test_a_revision_these_scripts_do_not_know_is_named_as_ahead():
    (head,) = sc.expected_heads()
    s = sc.compare(["zzzzzzzzzzzz"], [head])
    assert not s.ok
    assert "AHEAD" in s.problem


def test_no_alembic_version_means_migrations_never_ran():
    (head,) = sc.expected_heads()
    s = sc.compare([], [head])
    assert not s.ok and "never run" in s.problem


def test_two_revisions_in_the_table_is_a_failure():
    (head,) = sc.expected_heads()
    s = sc.compare([head, "j4k5l6m7n8o9"], [head])
    assert not s.ok and "2 revisions" in s.problem


def test_a_branched_script_history_cannot_deploy():
    s = sc.compare(["a"], ["a", "b"])
    assert not s.ok and "branched" in s.problem


def test_mode_defaults_to_fail_and_ignores_garbage(monkeypatch):
    monkeypatch.delenv("SCHEMA_CHECK", raising=False)
    assert sc.mode() == "fail"
    monkeypatch.setenv("SCHEMA_CHECK", "WARN")
    assert sc.mode() == "warn"
    monkeypatch.setenv("SCHEMA_CHECK", "maybe")
    assert sc.mode() == "fail"


def test_verify_raises_in_fail_mode_and_returns_in_warn_mode(monkeypatch):
    import asyncio

    (head,) = sc.expected_heads()

    async def behind(_engine):
        return ("j4k5l6m7n8o9",)

    monkeypatch.setattr(sc, "read_current", behind)
    monkeypatch.delenv("SCHEMA_CHECK", raising=False)
    with pytest.raises(sc.SchemaMismatch):
        asyncio.run(sc.verify(engine=None))

    monkeypatch.setenv("SCHEMA_CHECK", "warn")
    status = asyncio.run(sc.verify(engine=None))
    assert not status.ok and status.expected == (head,)
