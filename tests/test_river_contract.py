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


# ---------------------------------------------------------------------------
# The live write path (C.2)
#
# george_log is INSERT-only, so nothing can be read back to check — the
# statements themselves are inspected, the same technique
# test_chats_contract.py uses on the conversation row.
# ---------------------------------------------------------------------------

import hashlib          # noqa: E402
import json             # noqa: E402
import uuid as _uuid    # noqa: E402
from datetime import datetime, timezone  # noqa: E402

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop  # noqa: E402


def _capture(monkeypatch, thread_id=None):
    captured: list[tuple[str, tuple]] = []
    log = george_loop.ConversationLog(thread_id=thread_id)
    monkeypatch.setattr(log, "_exec", lambda sql, params: captured.append((sql, params)))
    return log, captured


def test_post_ids_match_the_backfills_rule() -> None:
    """
    The live write and the migration's backfill derive the SAME ids.

    This is what makes the backfill safe to re-run after live writes have
    started: it would compute ids that already exist and its NOT EXISTS guard
    would skip them. If these two derivations ever diverge, re-running the
    migration silently doubles the river.

    Verified against the real Postgres on 2026-09-05 over 400 derivations —
    `(md5(c.id::text || ':question'))::uuid` and this agree exactly.
    """
    log = george_loop.ConversationLog()
    question_id, answer_id = log.post_ids()
    for got, role in ((question_id, "question"), (answer_id, "answer")):
        digest = hashlib.md5(f"{log.conversation_id}:{role}".encode()).hexdigest()
        assert got == str(_uuid.UUID(digest))
    assert question_id != answer_id


def test_post_ids_are_stable_across_calls() -> None:
    """The SSE frame and the INSERT must name the same post."""
    log = george_loop.ConversationLog()
    assert log.post_ids() == log.post_ids()


def test_a_turn_writes_a_question_and_an_answer(monkeypatch) -> None:
    log, captured = _capture(monkeypatch, thread_id="11111111-1111-1111-1111-111111111111")
    receipts = {"source_table": "new_transactions"}
    notice = {"kind": "k", "message": "m", "source": "s"}
    log.posts(
        user_id="ice", asked_at=datetime.now(timezone.utc),
        question="How did Rockwell do yesterday?",
        final_answer="Rockwell took P28,782 on Thu 4 Sep 2026.",
        notices=[notice], receipts=receipts,
    )

    assert len(captured) == 2
    q_sql, q_params = captured[0]
    a_sql, a_params = captured[1]

    assert "'question','user'" in q_sql.replace(" ", "")
    assert "'answer','george'" in a_sql.replace(" ", "")
    # The question carries the person; the answer carries none (ck_posts_actor).
    assert q_params[2] == "ice"
    # Both in the same thread, and the answer replies to the question.
    assert q_params[1] == a_params[1] == "11111111-1111-1111-1111-111111111111"
    assert a_params[2] == q_params[0]
    # The answer carries its receipts and its caveat.
    assert json.loads(a_params[4]) == receipts
    assert json.loads(a_params[5]) == [notice]


def test_both_posts_are_private(monkeypatch) -> None:
    """
    A person's question and its answer are theirs until they share it. The
    default is expressed in the model layer so the loop, the scheduler and the
    brief route cannot each decide differently.
    """
    log, captured = _capture(monkeypatch)
    log.posts(user_id="ice", asked_at=datetime.now(timezone.utc),
              question="q", final_answer="a", notices=[], receipts=None)
    for sql, _ in captured:
        assert "'private'" in sql
    assert default_visibility("question") == "private"
    assert default_visibility("answer") == "private"


def test_a_turn_with_no_answer_writes_only_the_question(monkeypatch) -> None:
    """
    A crashed turn is a question nobody answered — true, and worth seeing. An
    empty answer post would imply George said nothing, which is a different
    claim. Matches what the backfill does and what chat_history already renders.
    """
    log, captured = _capture(monkeypatch)
    log.posts(user_id="ice", asked_at=datetime.now(timezone.utc),
              question="q", final_answer=None, notices=[], receipts=None)
    assert len(captured) == 1
    assert "'question'" in captured[0][0]


def test_an_anonymous_turn_still_satisfies_the_actor_constraint(monkeypatch) -> None:
    """
    ck_posts_actor requires a user on a user post. A turn logged with no
    user_id must not violate it — the row is written as 'unknown' rather than
    rejected, exactly as the backfill does with COALESCE.
    """
    log, captured = _capture(monkeypatch)
    log.posts(user_id=None, asked_at=datetime.now(timezone.utc),
              question="q", final_answer=None, notices=[], receipts=None)
    assert captured[0][1][2] == "unknown"


def test_the_stream_names_the_posts_it_wrote(monkeypatch) -> None:
    """
    A `post` frame carries both ids, so a client rendering the river can
    reconcile the turn it drew optimistically with the one that was stored
    rather than refetching to discover it already had it.

    `stored` is the honest part: with logging off, no post exists and the
    client must not pretend one does (UI rule 8 — a claim about state comes
    from a result, never a literal).
    """
    from tests.test_loop_correction_contract import drive, frames_of

    monkeypatch.delenv("GEORGE_LOG_DATABASE_URL", raising=False)
    frames, _ = drive(monkeypatch, ["Rockwell took P28,782 on Thu 4 Sep 2026."],
                      question="How did Rockwell do yesterday?")

    posts = frames_of(frames, "post")
    assert len(posts) == 1
    frame = posts[0]

    # The ids are derived from the conversation id, so the frame and the row
    # name the same post.
    digest = hashlib.md5(f"{frame['conversation_id']}:question".encode()).hexdigest()
    assert frame["question_post_id"] == str(_uuid.UUID(digest))
    assert frame["answer_post_id"]
    assert frame["visibility"] == "private"
    # Logging is off in this test, so nothing was written and the frame says so.
    assert frame["stored"] is False


def test_no_answer_means_no_answer_post_in_the_frame(monkeypatch) -> None:
    """The frame reports what exists, not what was planned."""
    from tests.test_loop_correction_contract import drive, frames_of

    monkeypatch.delenv("GEORGE_LOG_DATABASE_URL", raising=False)
    frames, _ = drive(monkeypatch, [""], question="something that produced nothing")
    posts = frames_of(frames, "post")
    assert posts and posts[0]["answer_post_id"] is None


# ---------------------------------------------------------------------------
# Isolation, tested rather than assumed
#
# The suite wrote 57 conversation rows and 84 gap rows into the PRODUCTION log
# before anyone noticed. These are the assertions that make that structural
# instead of a habit.
# ---------------------------------------------------------------------------

def test_no_test_can_see_the_real_log_url() -> None:
    """
    conftest pops GEORGE_LOG_DATABASE_URL at import, before any module is
    collected. A test cannot connect to a database whose address it cannot see.
    """
    import os

    assert "GEORGE_LOG_DATABASE_URL" not in os.environ


def test_the_loop_never_connects_even_when_handed_a_url(monkeypatch) -> None:
    """
    The second half of the guarantee, and the one that survives someone
    exporting the variable again: drive() replaces ConversationLog itself, so
    `run()` gets a log whose _exec records instead of connecting.

    Asserted with a POISONED url, so a real connection attempt would fail
    loudly rather than quietly succeeding against production.
    """
    from tests.test_loop_correction_contract import StubLog, drive

    monkeypatch.setenv("GEORGE_LOG_DATABASE_URL",
                       "postgresql://nobody:nobody@127.0.0.1:1/should_never_be_used")
    frames, _ = drive(monkeypatch, ["Rockwell took P28,782 on Thu 4 Sep 2026."],
                      question="How did Rockwell do yesterday?")

    assert StubLog.instances, "the loop did not use the stubbed log"
    log = StubLog.instances[0]
    assert log.enabled is False
    # It still RECORDED the statements it would have made — the conversation
    # row and both posts — so nothing about the write path went untested.
    tables = " ".join(sql for sql, _ in log.statements)
    assert "george.conversations" in tables
    assert tables.count("george.posts") == 2
    # And no error, because nothing was attempted over a socket.
    assert log.errors == []
    assert not [f for f in frames if "logging_failed" in f]


def test_the_stub_keeps_the_real_id_derivation(monkeypatch) -> None:
    """
    Subclassed, not faked: thread defaulting and post_ids stay real, because
    those are the parts under test. Only the connection is removed.
    """
    from tests.test_loop_correction_contract import StubLog

    log = StubLog()
    assert log.thread_id == log.conversation_id
    question_id, answer_id = log.post_ids()
    digest = hashlib.md5(f"{log.conversation_id}:question".encode()).hexdigest()
    assert question_id == str(_uuid.UUID(digest))
    assert answer_id != question_id
