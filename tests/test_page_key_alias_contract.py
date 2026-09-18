"""
A renamed page key still answers to the row that granted it (2026-09-19).

NO DATABASE. The rename to Bob changed `george` to `bob` in code and left the
table alone, so the owner's room vanished from the sidebar: his role's row
said `george` and the guard asked for `bob`. These hold the alias both ways.
"""
from __future__ import annotations

import pytest

pytest.importorskip("sqlalchemy")

from app.models.role_page_access import (  # noqa: E402
    PAGE_KEYS, PAGE_KEY_ALIASES, canonical_page_key, stored_keys_for,
)


def test_a_stored_george_grants_bob_and_reads_as_bob() -> None:
    assert stored_keys_for("bob") == ("bob", "george")
    assert canonical_page_key("george") == "bob"
    assert canonical_page_key("bob") == "bob"
    assert canonical_page_key("dashboard") == "dashboard"


def test_every_alias_points_at_a_page_that_exists() -> None:
    for current, olds in PAGE_KEY_ALIASES.items():
        assert current in PAGE_KEYS, current
        for old in olds:
            assert old not in PAGE_KEYS, f"{old!r} is both current and an alias"


def test_the_seed_grants_bob_to_admin_and_not_to_staff() -> None:
    src = open("backend/app/services/startup_bootstrap.py", encoding="utf-8").read()
    assert "('admin',           'bob',       TRUE)" in src
    assert "('warehouse_staff', 'bob',       FALSE)" in src
