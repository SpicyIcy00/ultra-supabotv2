"""
The river's shape, held from three sides at once.

NO DATABASE, NO API. The Pydantic model and the shaping service are imported,
the TypeScript is read as text, and the migration is read as text. What is
under test is that four separate declarations of "what a post is" agree:

    migration n8o9p0q1r2s3   KINDS + the CHECK constraint
    app/models/george_post   POST_KINDS
    routes/george.RiverPost  the wire model
    types/river.ts           PostKind + Post

A kind that exists in one and not the others renders as a blank card, or is
rejected by the database at 06:00 on a Monday. Neither failure announces
itself, which is why they are worth a test.

THE VISIBILITY ASYMMETRY IS A PRODUCT RULE, not a per-caller preference
(CLAUDE.md, "The river"), so default_visibility is asserted here rather than
left to whichever service happens to insert a post.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytest.importorskip("pydantic", reason="the route module defines Pydantic models")

from app.models.george_post import (  # noqa: E402
    GEORGE_KINDS,
    POST_AUTHORS,
    POST_KINDS,
    POST_VISIBILITY,
    default_visibility,
)
from app.services.river import build_post, build_river, next_cursor  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_TS = _ROOT / "frontend" / "src" / "types" / "river.ts"
_MIGRATION = (
    _ROOT / "backend" / "alembic" / "versions"
    / "2026_09_05_0001-n8o9p0q1r2s3_add_george_posts.py"
)


def _ts_union(source: str, name: str) -> set[str]:
    """The string literals of an exported TS union type."""
    m = re.search(rf"export type {name} =(.+?);", source, re.S)
    assert m, f"no `export type {name}` in {_TS.name}"
    return set(re.findall(r"'([a-z_]+)'", m.group(1)))


def _ts_interface_fields(source: str, name: str) -> set[str]:
    start = re.search(rf"export interface {name} \{{", source)
    assert start, f"no `export interface {name}` in {_TS.name}"
    depth, body_start = 0, start.end() - 1
    for i in range(body_start, len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                body = source[body_start + 1:i]
                break
    else:  # pragma: no cover
        pytest.fail(f"unbalanced braces in {name}")
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    fields, depth = set(), 0
    for line in body.splitlines():
        stripped = line.strip()
        if depth == 0:
            m = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\??\s*:", stripped)
            if m:
                fields.add(m.group(1))
        depth += stripped.count("{") - stripped.count("}")
    return fields


@pytest.fixture(scope="module")
def ts() -> str:
    assert _TS.exists(), f"{_TS} is missing — the client types are part of the contract"
    return _TS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def migration() -> str:
    assert _MIGRATION.exists(), f"{_MIGRATION} is missing"
    return _MIGRATION.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# The four declarations of "what a post is"
# ---------------------------------------------------------------------------

def test_kinds_agree_between_model_and_typescript(ts: str) -> None:
    assert set(POST_KINDS) == _ts_union(ts, "PostKind")


def test_kinds_agree_between_model_and_migration(migration: str) -> None:
    """The CHECK constraint and POST_KINDS are the same set."""
    m = re.search(r"^KINDS = \((.+?)\)", migration, re.S | re.M)
    assert m, "no KINDS tuple in the migration"
    assert set(re.findall(r'"([a-z_]+)"', m.group(1))) == set(POST_KINDS)

    check = re.search(r"CONSTRAINT ck_posts_kind CHECK \(kind IN \(\{kinds\}\)\)", migration)
    assert check, "the kind CHECK constraint is not built from KINDS"


def test_authors_and_visibility_agree(ts: str) -> None:
    assert set(POST_AUTHORS) == _ts_union(ts, "PostAuthor")
    assert set(POST_VISIBILITY) == _ts_union(ts, "PostVisibility")


def test_the_wire_model_and_typescript_carry_the_same_fields(ts: str) -> None:
    from app.api.v1.routes.george import RiverPost

    assert _ts_interface_fields(ts, "Post") == set(RiverPost.model_fields)


def test_a_post_always_offers_receipts_and_notices(ts: str) -> None:
    """
    UI rules 3, 4 and 6 apply to all eight kinds without exception, so the
    fields that satisfy them are not optional per kind — they are on the type.
    """
    fields = _ts_interface_fields(ts, "Post")
    for required in ("receipts", "notices", "created_at"):
        assert required in fields


# ---------------------------------------------------------------------------
# Visibility — the asymmetry, in one place
# ---------------------------------------------------------------------------

def test_georges_own_posts_are_org_level() -> None:
    """
    A brief that fires into a group chat at 06:00 is not private, and
    pretending otherwise would make the app the least informed place to read it.
    """
    for kind in ("brief", "notice", "approval", "workflow_run", "system"):
        assert default_visibility(kind) == "org", kind


def test_a_question_and_its_answer_are_private_until_shared() -> None:
    """
    Not because private is better, but because the choice is not reversible:
    a private default can be opened per post by its owner, and a public default
    cannot un-show what was shown.
    """
    assert default_visibility("question") == "private"
    assert default_visibility("answer") == "private"


def test_every_kind_has_a_default() -> None:
    for kind in POST_KINDS:
        assert default_visibility(kind) in POST_VISIBILITY


def test_george_kinds_are_a_subset_of_the_kinds() -> None:
    assert set(GEORGE_KINDS) <= set(POST_KINDS)
    assert "question" not in GEORGE_KINDS


# ---------------------------------------------------------------------------
# Shaping
# ---------------------------------------------------------------------------

def _row(**kw):
    row = {
        "id": "11111111-1111-1111-1111-111111111111",
        "thread_id": "11111111-1111-1111-1111-111111111111",
        "parent_id": None,
        "kind": "answer",
        "author": "george",
        "author_user": None,
        "visibility": "org",
        "body": "Rockwell took P28,782 on Thu 4 Sep 2026.",
        "payload": None,
        "receipts": {"source_table": "new_transactions"},
        "notices": [],
        "conversation_id": None,
        "created_at": None,
    }
    row.update(kw)
    return row


def test_mine_is_the_viewer_and_never_a_filter() -> None:
    """`mine` decides whether a share action is offered, and nothing else."""
    assert build_post(_row(author="user", author_user="ice", kind="question"), "ice")["mine"]
    assert not build_post(_row(author="user", author_user="sam", kind="question"), "ice")["mine"]
    # George's posts belong to nobody, so they are never "mine".
    assert not build_post(_row(), "ice")["mine"]


def test_notices_are_normalised_and_never_dropped() -> None:
    """
    A legacy bare-string kind becomes a real notice rather than disappearing.
    A missing caveat is the worst outcome (UI rule 4), so this reuses
    chat_history.normalise_notices rather than reimplementing the rule.
    """
    out = build_post(_row(notices=["snapshot_coverage_gap"]), "ice")["notices"]
    assert len(out) == 1
    assert out[0]["kind"] == "snapshot_coverage_gap"
    assert out[0]["message"]

    obj = [{"kind": "k", "message": "m", "source": "s"}]
    assert build_post(_row(notices=obj), "ice")["notices"] == obj


def test_receipts_pass_through_whole() -> None:
    receipts = {"source_table": "new_transactions", "snapshot_timestamp": "2026-09-05T01:00:00Z"}
    assert build_post(_row(receipts=receipts), "ice")["receipts"] == receipts


def test_the_river_is_reversed_for_rendering() -> None:
    """
    The query reads newest-first so paging backwards never counts from the
    beginning; the page renders oldest-first like any thread. Both facts live
    here rather than leaving a client to discover the order is upside down.
    """
    rows = [_row(id=f"0000000{i}-0000-0000-0000-000000000000") for i in range(3)]
    out = build_river(rows, "ice")
    assert [p["id"] for p in out] == [r["id"] for r in reversed(rows)]


def test_the_cursor_reports_a_real_end() -> None:
    """
    None means the river has been read to its beginning — an end the UI states
    rather than spinning on (UI rule 8).
    """
    assert next_cursor([_row()], limit=40) is None
    full = [_row(created_at="2026-09-05T01:00:00+00:00")] * 2
    assert next_cursor(full, limit=2) == "2026-09-05T01:00:00+00:00"
