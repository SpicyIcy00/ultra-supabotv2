"""
The home of George's work: the river's two streams, and who reads which.

ASK: I go to George. TODAY: George comes to me. So /ask reads the WORK stream
of the river — questions and answers, from persistence, every visit — and
/today reads the ATTENTION stream, what George initiated. One table, one
visibility clause, one cursor; the split is a WHERE on `kind` and nothing a
caller may not see in one stream can appear in the other.

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
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "george.py"
_ASK = _ROOT / "frontend" / "src" / "pages" / "AskPage.tsx"
_TODAY = _ROOT / "frontend" / "src" / "pages" / "TodayPage.tsx"
_HOME = _ROOT / "frontend" / "src" / "components" / "george" / "askHome.ts"
_RIVER_HOOK = _ROOT / "frontend" / "src" / "hooks" / "useRiver.ts"


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
    from app.api.v1.routes.george import read_river

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


def test_the_attention_stream_is_everything_george_initiated():
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


def test_ask_reads_the_work_stream_from_persistence():
    ask = _source(_ASK)
    assert "useRiver('work')" in ask


def test_today_reads_the_attention_stream_and_never_the_work():
    today = _source(_TODAY)
    assert "useRiver('attention')" in today
    assert "useRiver('work')" not in today
    assert "useRiver()" not in today


def test_today_has_no_general_composer():
    # One canonical river of user-directed work, not two. A brief's follow-up
    # chip may still ask George; the work it starts lands in Ask.
    today = _source(_TODAY)
    assert "<AskComposer" not in today
    assert "navigate('/ask')" in today


def test_today_fabricates_nothing():
    today = _source(_TODAY)
    for word in ("alert", "recommend", "health", "score", "watch"):
        assert not re.search(rf"\b{word}", today, re.I), f"Today mentions {word!r}"
    assert "NothingToSurface" in today


def test_ask_has_no_new_chat_no_thread_picker_and_no_recent_list():
    ask = _source(_ASK)
    for word in ("New chat", "Recent", "listChats", "thread picker"):
        assert word not in ask, f"Ask still offers {word!r}"


def test_ask_does_not_navigate_to_a_thread_address_on_ask():
    # Following the post frame to /ask/:id on every question made the URL a
    # chat. The work stays at the root; /ask/:id is a focus you arrive at.
    ask = _source(_ASK)
    assert "FollowThread" not in ask
    assert "navigate(`/ask/" not in ask


def test_ask_keeps_no_client_side_source_of_truth():
    for path in (_ASK, _HOME, _RIVER_HOOK):
        src = _source(path)
        for forbidden in ("localStorage", "sessionStorage", "indexedDB"):
            assert forbidden not in src, f"{path.name} keeps history in {forbidden}"


def test_the_deep_link_folds_only_the_thread_read_in():
    # The thread read is filtered by the same visibility clause; folding its
    # posts into the river exposes nothing the river would not.
    home = _source(_HOME)
    assert "export function withFocus" in home
    ask = _source(_ASK)
    assert "withFocus(river.posts, thread.posts)" in ask


def test_a_foreign_thread_stays_a_404_and_the_river_still_shows_own_work():
    ask = _source(_ASK)
    assert "thread.unavailable" in ask
    assert "Your own work is here" in ask
