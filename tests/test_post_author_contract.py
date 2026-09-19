"""
Every value Bob writes into a checked column is a value the check permits.

NO DATABASE. The three things compared are the raw SQL literals in the two
writers, the CheckConstraints on the models, and the migration that puts those
constraints in the database. All three are text in this repository.

WHAT THIS EXISTS TO CATCH, 2026-09-19. The rename `044d3e7` changed the author
literal in two INSERT statements from 'george' to 'bob' and updated the models
to match. The live CHECK constraints still said 'george', because a value a
CHECK permits is not a column, a type or an index, and nothing in this
repository compared them. So from the moment it deployed, EVERY post Bob
authored was rejected by the database:

    ck_posts_author        author = ANY (ARRAY['george', 'user'])
    ck_posts_actor         ... OR author = 'george'
    ck_page_events_actor   actor = ANY (ARRAY['user', 'george'])

The question post survived, because its author is 'user'. The answer post did
not. That is the whole of "my most recent chat just disappears after i hard
refresh": a thread with a question, no answer, and therefore no address for
the browser to return to. Page events would have failed the same way the first
time Bob created a page, and nobody had tried.

THE SUITE RAN GREEN THROUGHOUT. It would have run green forever: the models
agreed with the code, the code agreed with itself, and the only disagreement
was with a database no test connects to. This file closes that by reading the
migration text, which is the one place the database's rules exist on disk.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.models.bob_post import POST_AUTHORS
from app.models.bob_page import PAGE_EVENT_ACTORS

REPO = Path(__file__).resolve().parents[1]
VERSIONS = REPO / "backend/alembic/versions"

# Bob's name in this vocabulary. The DATABASE keeps its george names — the
# schema, the roles, the env vars, the migration ids — and this is not one of
# those: it is a value the product reads, and the frontend's PostAuthor has
# said 'bob' since the rename.
BOB = "bob"


def _migrations() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in VERSIONS.glob("*.py"))


def _latest_constraint(name: str) -> str:
    """
    The last definition of a named CHECK in migration order.

    Filename order is revision order here: every script is dated, and the one
    that redefines a constraint is always newer than the one that made it.
    """
    # A WHOLE Python string literal. A constraint body is full of single
    # quotes, so a lazy `'.*?'` stops at the first one and the test then reads
    # "(author = '" and concludes the migration does not permit anything.
    literal = r'("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')'
    found = ""
    for path in sorted(VERSIONS.glob("*.py")):
        # UPGRADE ONLY. Every downgrade that undoes a constraint re-creates the
        # OLD one, and it sits later in the file, so scanning the whole script
        # reads the rule this migration exists to replace.
        text = path.read_text(encoding="utf-8").split("def downgrade")[0]
        for match in re.finditer(
            r"create_check_constraint\(\s*['\"]" + re.escape(name) + r"['\"],"
            r"\s*['\"][a-z_]+['\"],\s*\n?\s*" + literal, text, re.S):
            found = match.group(1)
        # A table created with the constraint inline counts too.
        for match in re.finditer(
            r"CheckConstraint\(\s*" + literal + r"\s*,\s*name=['\"]"
            + re.escape(name) + r"['\"]", text, re.S):
            found = match.group(1)
    assert found, f"no migration defines {name}"
    return found


# ---------------------------------------------------------------------------
# The literals the code actually writes
# ---------------------------------------------------------------------------

def test_the_answer_post_is_written_with_the_author_the_models_allow():
    loop = (REPO / "agent/loop.py").read_text(encoding="utf-8")
    written = re.findall(r"VALUES \(%s,%s,%s,'answer','(\w+)'", loop)
    assert written == [BOB], f"the answer post writes author={written}"
    assert BOB in POST_AUTHORS


def test_every_other_post_bob_writes_uses_the_same_author():
    """
    river_writer's one INSERT carries briefs, watches, approvals, workflow runs
    and pin confirmations. It spells the author inline, so it is the second
    place this can drift and the one nobody would think to look at.
    """
    writer = (REPO / "backend/app/services/river_writer.py").read_text(encoding="utf-8")
    written = re.findall(r"VALUES\s*\n?\s*\(:id, :thread_id, NULL, :kind, '(\w+)'", writer)
    assert written == [BOB], f"river_writer writes author={written}"


def test_no_writer_still_spells_him_george():
    """
    The database keeps its george NAMES. A value is not a name, and a writer
    that still spells one is a row the CHECK will refuse at 3am.
    """
    for rel in ("agent/loop.py", "backend/app/services/river_writer.py"):
        source = (REPO / rel).read_text(encoding="utf-8")
        for line in source.splitlines():
            if "INSERT INTO george.posts" in line or "VALUES" in line:
                assert "'george'" not in line, f"{rel}: {line.strip()[:90]}"


# ---------------------------------------------------------------------------
# And the database is told the same thing
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("constraint,must_allow", [
    ("ck_posts_author", POST_AUTHORS),
    ("ck_page_events_actor", PAGE_EVENT_ACTORS),
])
def test_the_migrations_permit_exactly_what_the_models_permit(constraint, must_allow):
    latest = _latest_constraint(constraint)
    for value in must_allow:
        assert f"'{value}'" in latest, (
            f"{constraint} in the migrations does not permit {value!r}: {latest}"
        )
    assert "'george'" not in latest, (
        f"{constraint} still permits 'george'; the writers stopped spelling it "
        f"that way in 044d3e7 and every Bob post was refused until z0a1b2c3d4e5"
    )


def test_the_actor_check_names_bob_and_not_george():
    latest = _latest_constraint("ck_posts_actor")
    assert "author = 'bob'" in latest
    assert "'george'" not in latest


def test_a_migration_moved_the_rows_that_already_said_george():
    """
    Widening the check alone would leave 175 answers spelling him one way and
    every later one spelling him another, in a column the timeline reads.
    """
    migrations = _migrations()
    assert "UPDATE george.posts SET author = 'bob' WHERE author = 'george'" in migrations
    assert "UPDATE george.page_events SET actor = 'bob' WHERE actor = 'george'" in migrations


def test_the_frontend_agrees_with_the_backend_about_his_name():
    river = (REPO / "frontend/src/types/river.ts").read_text(encoding="utf-8")
    declared = re.search(r"export type PostAuthor = (.+);", river)
    assert declared, "PostAuthor changed shape; this test reads nothing"
    for value in POST_AUTHORS:
        assert f"'{value}'" in declared.group(1)
    assert "'george'" not in declared.group(1)
