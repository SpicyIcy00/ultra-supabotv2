"""
W4.3 — a system you can run, backtest, promote and switch on.

THE DEFECT THIS FILE HOLDS SHUT (DOGFOOD 2026-09-23). Asked "how do i turn it
on and what its telling me to do?" of a screen saying Morning Runout was "not
mine to switch on", Bob answered that it stays off "until an administrator
backtests version one and switches it on… Tell me who holds that and I will
prepare it for them" — to the only administrator there is. He named the OFFICE
and sent the man holding it away, because the read behind him carried a policy
string and no people.

NO DATABASE. `_who_may_promote` takes a session and runs one statement, so the
session is stubbed: everything this file checks is decidable from the
definitions and the function, which is also a statement about the design.

RULE 7 IS NOT WHAT THIS TOUCHES. Naming the person who may promote is not
promoting, and nothing here is a path past the gate: the backtest requirement,
the closed-window requirement and the admin-only policy are asserted to be
exactly where they were.
"""

from __future__ import annotations

import asyncio

import pytest

pytest.importorskip("sqlalchemy", reason="self_reader imports the session type")
pytest.importorskip("psycopg", reason="the definitions loader pulls in the tools")

from backend.app.services import self_reader  # noqa: E402
from tools._common import load_defs  # noqa: E402


DEFS = load_defs()


# ---------------------------------------------------------------------------
# A session that answers the one statement the function runs
# ---------------------------------------------------------------------------

class _Mappings:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return _Mappings(self._rows)


class _Session:
    """Answers every execute with the same login rows."""

    def __init__(self, rows):
        self._rows = rows
        self.statements = []

    async def execute(self, statement, params=None):
        self.statements.append(str(statement))
        return _Result(self._rows)


ADMIN = {"username": "admin", "display_name": "Isaiah", "role": "admin"}
STAFF = {"username": "warehouse", "display_name": "Warehouse", "role": "warehouse_staff"}


def _who(rows, *, username, app_role=None):
    session = _Session(rows)
    return asyncio.run(self_reader._who_may_promote(
        session, username=username, app_role=app_role))


# ---------------------------------------------------------------------------
# The words are definitions, not prose in a tool
# ---------------------------------------------------------------------------

def test_the_sentences_live_in_the_yaml():
    promotion = DEFS["systems"]["promotion"]
    for key in ("act_is", "who_may", "you_hold_it", "someone_else_holds_it",
                "nobody_holds_it", "never_backtested_is"):
        assert promotion[key], key


def test_nothing_says_find_an_administrator_when_you_are_one():
    said = DEFS["systems"]["promotion"]["you_hold_it"].lower()
    assert "never tell them to find an administrator" in said


def test_the_policy_the_words_point_at_is_the_one_the_writer_enforces():
    # who_may is a path into the file, not a copy of the answer: one policy,
    # named once, so the sentence and the gate cannot drift apart.
    path = DEFS["systems"]["promotion"]["who_may"].split(".")
    node = DEFS
    for part in path:
        node = node[part]
    assert node == "admin_only"


def test_rule_7_has_not_moved():
    promotion = DEFS["workflows"]["promotion"]
    assert promotion["requires_backtest"] is True
    assert promotion["backtest_must_be_past"] is True
    assert promotion["promoted_by"] == "admin_only"


# ---------------------------------------------------------------------------
# Who may promote, by name
# ---------------------------------------------------------------------------

def test_the_only_administrator_is_told_that_he_is():
    who = _who([ADMIN], username="admin", app_role="admin")
    assert who["you_may_promote"] is True
    assert who["administrators"] == ["Isaiah"]
    assert who["you_are"] == "Isaiah"
    assert who["how_to_say_it"] == DEFS["systems"]["promotion"]["you_hold_it"]


def test_the_row_decides_even_when_the_request_carried_no_role():
    # The token is what the route has; the login table is the authority. A
    # missing role on the request must not turn an administrator into a guest.
    who = _who([ADMIN], username="admin", app_role=None)
    assert who["you_may_promote"] is True


def test_somebody_who_does_not_hold_it_is_given_the_names_not_the_office():
    who = _who([ADMIN], username="warehouse", app_role="warehouse_staff")
    assert who["you_may_promote"] is False
    assert who["administrators"] == ["Isaiah"]
    assert who["how_to_say_it"] == DEFS["systems"]["promotion"]["someone_else_holds_it"]


def test_nobody_holding_it_is_its_own_answer():
    who = _who([], username="warehouse", app_role="warehouse_staff")
    assert who["you_may_promote"] is False
    assert who["administrators"] == []
    assert who["how_to_say_it"] == DEFS["systems"]["promotion"]["nobody_holds_it"]


def test_an_unnamed_login_falls_back_to_its_username_and_never_to_a_blank():
    who = _who([{"username": "admin", "display_name": None, "role": "admin"}],
               username="admin", app_role="admin")
    assert who["administrators"] == ["admin"]
    assert who["you_are"] == "admin"


def test_only_active_admin_logins_are_read():
    session = _Session([ADMIN])
    asyncio.run(self_reader._who_may_promote(session, username="admin", app_role="admin"))
    sql = " ".join(session.statements[0].split()).lower()
    assert "public.app_users" in sql
    assert "active is true" in sql
    assert "role = 'admin'" in sql


def test_no_password_or_hash_is_selected():
    session = _Session([ADMIN])
    asyncio.run(self_reader._who_may_promote(session, username="admin", app_role="admin"))
    sql = session.statements[0].lower()
    assert "hash" not in sql and "passcode" not in sql


# ---------------------------------------------------------------------------
# The tool says it
# ---------------------------------------------------------------------------

def test_the_tool_tells_him_to_name_the_person():
    from agent import composite_tools

    said = " ".join((composite_tools.view_automations.__doc__ or "").split())
    assert "meta.promotion" in said
    assert "Never tell somebody to find an administrator" in said
    # And it does not quietly become a promotion route.
    assert "promotes anything" in said


def test_a_never_backtested_version_is_named_as_such_and_not_as_a_queue():
    said = DEFS["systems"]["promotion"]["never_backtested_is"]
    assert "does not appear in Needs you" in said
    assert "system's own page" in said
