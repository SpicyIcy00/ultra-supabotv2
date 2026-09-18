"""
The home of Bob's work: the river's two streams, and who reads which.

THE STREAMS ARE UNCHANGED AND ARE STILL INFRASTRUCTURE. One table, one
visibility clause, one cursor; the split is a WHERE on `kind`, and nothing a
caller may not see in one stream can appear in the other.

WHO READS THEM CHANGED ON 2026-09-09, with the Experience Reset. Ask and Today
were two pages: one read the WORK stream, the other the ATTENTION stream. They
are not pages any more — the desk is the environment, its own line is where
Bob is asked, and its resting state is the business rather than a feed. So
the WORK stream is read by the desk, to compose the work a person has done;
the whole river is read by History, which is the river's one remaining
user-facing role; and what Bob initiated reaches a person as the morning
sentence, the needs-you count and the marks on the objects themselves, rather
than as a second feed to scroll.

The route is driven with the same fake session test_river_v2_contract uses.
The client-side rules are read from source, as accentUse.test.ts does.
"""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

pytest.importorskip("fastapi", reason="the route module imports fastapi")

from fastapi import HTTPException                                      # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "bob.py"


def _source(path: Path) -> str:
    text = re.sub(r"/\*[\s\S]*?\*/", "", path.read_text(encoding="utf-8"))
    return re.sub(r"^\s*//.*$", "", text, flags=re.MULTILINE)


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self):
        self.statements: list[tuple[str, dict]] = []

    async def execute(self, statement, params=None):
        self.statements.append((str(statement), dict(params or {})))
        return _Result([])


class _User:
    username = "ice"


def _read(stream=None):
    from app.api.v1.routes.bob import read_river

    session = _FakeSession()
    asyncio.run(read_river(limit=40, before=None, stream=stream, db=session, user=_User()))
    return session.statements[0][0]


# ---------------------------------------------------------------------------
# The route
# ---------------------------------------------------------------------------


def test_no_stream_is_the_whole_river_as_before():
    sql = _read(None)
    assert "p.kind IN" not in sql and "p.kind NOT IN" not in sql


def test_the_work_stream_is_questions_and_answers():
    sql = _read("work")
    assert "p.kind IN ('question', 'answer')" in sql


def test_the_attention_stream_is_everything_bob_initiated():
    sql = _read("attention")
    assert "p.kind NOT IN ('question', 'answer')" in sql


def test_a_stream_never_loosens_visibility():
    # The kind filter is ADDED to the visibility clause, never a replacement
    # for it. A stream is a narrower read of the same river.
    for stream in (None, "work", "attention"):
        sql = _read(stream)
        assert "visibility = 'org' OR p.owner_user = :me" in sql, sql


def test_an_unknown_stream_is_refused():
    with pytest.raises(HTTPException) as raised:
        _read("everything")
    assert raised.value.status_code == 422


# ---------------------------------------------------------------------------
# Who reads which
# ---------------------------------------------------------------------------


# Removed 2026-09-12 with the desk and the river hooks they scanned:
#   test_the_desk_reads_the_work_stream_from_persistence
#   test_history_reads_the_whole_river_and_is_the_rivers_user_facing_role
#   test_the_desk_at_rest_reads_the_definitions_not_a_feed
#   test_the_desk_invents_no_judgement_of_its_own
#   test_the_desk_has_no_new_chat_no_thread_picker_and_no_recent_list
#   test_the_desk_keeps_no_client_side_source_of_truth
#   test_the_focus_is_restored_from_the_server_and_never_from_the_client
#   test_the_deep_link_folds_only_the_thread_read_in
#   test_a_foreign_piece_of_work_stays_a_404_and_the_desk_still_stands
# Each was a property of a frontend file that no longer exists. The room
# is the only surface now; equivalents for it are a decision, not a
# rename, and are recorded in ops/DECISIONS.md.

