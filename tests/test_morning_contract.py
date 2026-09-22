"""
Pure tests for the morning (W2.1, 2026-09-22) — answered before you ask.

NO DATABASE. What is held here:

  1. THE MORNING IS A STANDING QUESTION, at the slot metrics.yaml `morning`
     names (08:00 Manila, the owner's "8am"), created SWITCHED OFF (rule 7) —
     and a yaml edit cannot make it start on its own.
  2. WHAT COUNTS AS ASKING IT AGAIN is the yaml's list, exactly; a question
     that only resembles it is a different question.
  3. AN ANSWER IS AS OLD AS ITS OLDEST READ: the read time is the earliest
     snapshot_timestamp anywhere in the stored answer.
  4. A SAME-DAY REPEAT COSTS NO MODEL TURN: the route answers with today's
     thread — start, reused, done with no rounds and no calls — and never
     enters the loop; and it does so only when nothing has landed since.
  5. "DATA CHANGED" is vetted, parameterized statements in the yaml, bounded
     by the two clocks they are given.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import date, datetime, timedelta, timezone

import pytest

from app.services import morning, slots, standing_questions
from tools import morning as morning_read
from tools._common import load_defs, req

DEFS = load_defs()
SPEC = req(DEFS, "morning")
MANILA = slots.MANILA


# ---------------------------------------------------------------------------
# 1. A standing question at 08:00, born off
# ---------------------------------------------------------------------------

def test_the_morning_is_at_eight_manila_and_born_off():
    assert SPEC["at"] == {"hour": 8, "minute": 0}
    assert SPEC["kind"] == "daily"
    assert SPEC["born_enabled"] is False
    assert morning.is_morning(SPEC["question"])


class _Session:
    """Enough of an AsyncSession for standing_questions.create."""

    def __init__(self):
        self.added = []

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        return None


def _no_rows(monkeypatch, rows=()):
    async def list_for(session, owner):
        return list(rows)
    monkeypatch.setattr(standing_questions, "list_for", list_for)


def test_ensure_creates_the_morning_switched_off_at_its_slot(monkeypatch):
    _no_rows(monkeypatch)
    session = _Session()
    row = asyncio.run(morning.ensure(session, "joy"))
    assert row is session.added[0]
    assert row.enabled is False
    assert (row.hour, row.minute, row.kind) == (8, 0, "daily")
    assert row.owner == "joy" and row.question == SPEC["question"]
    assert row.instructions == list(SPEC["instructions"])


def test_ensure_returns_the_morning_already_there(monkeypatch):
    class Row:
        id, question, enabled = "s-1", "how are we doing?", True
    _no_rows(monkeypatch, [Row()])
    session = _Session()
    assert asyncio.run(morning.ensure(session, "joy")).id == "s-1"
    assert session.added == []


def test_a_person_at_the_limit_gets_no_morning_rather_than_losing_one(monkeypatch):
    _no_rows(monkeypatch)

    async def full(*a, **k):
        raise standing_questions.StandingRefused("limit")
    monkeypatch.setattr(standing_questions, "create", full)
    assert asyncio.run(morning.ensure(_Session(), "joy")) is None


def test_a_yaml_that_says_born_on_is_refused(monkeypatch):
    monkeypatch.setattr(morning, "_spec", lambda: {**SPEC, "born_enabled": True})
    _no_rows(monkeypatch)
    with pytest.raises(ValueError):
        asyncio.run(morning.ensure(_Session(), "joy"))


# ---------------------------------------------------------------------------
# 2. Asking it again
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("said", ["How are we doing?", "how are we doing today",
                                  "  How's business?? ", "HOW IS THE BUSINESS DOING"])
def test_the_morning_question_in_other_words_is_the_morning(said):
    assert morning.is_morning(said)


@pytest.mark.parametrize("said", ["how did Rockwell do?", "how are we doing on stock?",
                                  "how did we do yesterday", ""])
def test_a_question_that_only_resembles_it_is_a_different_question(said):
    assert not morning.is_morning(said)


# ---------------------------------------------------------------------------
# 3. The read time
# ---------------------------------------------------------------------------

def test_the_read_time_is_the_earliest_read_anywhere_in_the_answer():
    receipts = {"snapshot_timestamp": "2026-09-22T00:05:00+00:00"}
    payload = {"charted": [{"receipts": {"snapshot_timestamp": "2026-09-22T00:01:30+00:00"}}],
               "calls": [{"meta": {"parts": {"a": {"snapshot_timestamp": "2026-09-22T00:03:00Z"}}}}]}
    assert morning.read_time(receipts, payload) == datetime(2026, 9, 22, 0, 1, 30, tzinfo=timezone.utc)
    assert morning.read_time(None, {"charted": []}) is None


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _Posts:
    def __init__(self, rows):
        self.rows = rows
        self.params = None

    async def execute(self, sql, params):
        self.params = params
        return _Result(self.rows)


def _post(question, at, stamp="2026-09-22T00:01:00+00:00", thread="t-1"):
    return {"question": question, "thread_id": thread, "answer_id": "a-" + thread,
            "answered_at": at, "receipts": {"snapshot_timestamp": stamp}, "payload": None}


NOW = datetime(2026, 9, 22, 9, 30, tzinfo=MANILA)


def test_today_is_the_newest_answer_to_the_morning_question_this_manila_day():
    session = _Posts([_post("why is Fairview down?", NOW, thread="t-9"),
                      _post("How are we doing?", NOW - timedelta(hours=1), thread="t-1")])
    found = asyncio.run(morning.today(session, "joy", now=NOW))
    assert found["thread_id"] == "t-1"
    assert found["read_at"] == datetime(2026, 9, 22, 0, 1, tzinfo=timezone.utc)
    start, end = session.params["start"], session.params["end"]
    assert start == datetime(2026, 9, 22, tzinfo=MANILA) and end - start == timedelta(days=1)
    assert session.params["owner"] == "joy"


# ---------------------------------------------------------------------------
# 4. A same-day repeat costs no model turn
# ---------------------------------------------------------------------------

def _landed(changed: bool, calls: list):
    def check(read_at):
        calls.append(read_at)
        return {"rows": [], "meta": {"changed": changed, "snapshot_timestamp": "2026-09-22T01:30:00+00:00"}}
    return check


def test_the_morning_asked_again_with_nothing_landed_is_reused():
    calls: list = []
    session = _Posts([_post("How are we doing?", NOW - timedelta(hours=1))])
    got = asyncio.run(morning.reusable(session, "joy", "how are we doing?", now=NOW,
                                       landed=_landed(False, calls)))
    assert got["thread_id"] == "t-1" and got["read_at"] == calls[0]
    assert got["checked_at"] == "2026-09-22T01:30:00+00:00"


def test_something_landed_since_and_it_is_asked_fresh():
    calls: list = []
    session = _Posts([_post("How are we doing?", NOW - timedelta(hours=1))])
    assert asyncio.run(morning.reusable(session, "joy", "how are we doing?", now=NOW,
                                        landed=_landed(True, calls))) is None
    assert calls, "the data check was not made"


def test_another_question_is_never_checked_and_never_reused():
    calls: list = []
    session = _Posts([_post("How are we doing?", NOW - timedelta(hours=1))])
    assert asyncio.run(morning.reusable(session, "joy", "why is Fairview down?", now=NOW,
                                        landed=_landed(False, calls))) is None
    assert calls == [] and session.params is None


def test_an_answer_with_no_read_time_is_never_reused():
    calls: list = []
    row = _post("How are we doing?", NOW - timedelta(hours=1))
    row["receipts"] = None
    assert asyncio.run(morning.reusable(_Posts([row]), "joy", "how are we doing?", now=NOW,
                                        landed=_landed(False, calls))) is None
    assert calls == []


def _frames(chunks) -> list[tuple[str, dict]]:
    out = []
    for chunk in chunks:
        head, _, rest = chunk.partition("\n")
        out.append((head.removeprefix("event: "), json.loads(rest.partition("data: ")[2])))
    return out


def test_the_reused_stream_says_no_round_and_no_call_was_spent():
    from app.api.v1.routes import bob as route
    frames = _frames(route._reused_stream_frames({
        "thread_id": "t-1", "question": "How are we doing?",
        "answered_at": NOW, "read_at": NOW - timedelta(minutes=2), "checked_at": None}))
    assert [e for e, _ in frames] == ["start", "reused", "done"]
    assert frames[0][1] == {"thread_id": "t-1", "reused": True}
    assert frames[1][1]["read_at"] == (NOW - timedelta(minutes=2)).isoformat()
    done = frames[2][1]
    assert done["iterations"] == 0 and done["tool_calls"] == 0 and done["status"] == "ok"


def test_the_route_answers_a_repeat_without_entering_the_loop(monkeypatch):
    from app.api.v1.routes import bob as route

    async def reuse(username, question):
        assert username == "joy"
        return {"thread_id": "t-1", "question": question, "answered_at": NOW,
                "read_at": NOW, "checked_at": None}

    def never(*a, **k):
        raise AssertionError("a reused morning must not run the loop")

    monkeypatch.setattr(route, "_morning_reuse", reuse)
    monkeypatch.setattr(route.bob_loop, "run", never)

    class User:
        username, role = "joy", "admin"

    async def go():
        response = await route.ask(route.AskRequest(question="How are we doing?"), user=User())
        return [c async for c in response.body_iterator]

    frames = _frames(asyncio.run(go()))
    assert [e for e, _ in frames] == ["start", "reused", "done"]


def test_a_reply_to_a_post_is_never_a_repeat():
    import inspect

    from app.api.v1.routes import bob as route
    source = inspect.getsource(route.ask)
    assert "if request.parent_id is None:" in source
    assert source.index("_morning_reuse") < source.index("_safe_stream(")


def _opening(monkeypatch, *, standing, today):
    from app.api.v1.routes import bob as route

    async def latest(db, owner):
        return standing

    async def found_today(db, owner, **k):
        return today

    async def find(db, owner, spec=None):
        return None

    monkeypatch.setattr(route.standing_questions, "latest_answer", latest)
    monkeypatch.setattr(route.morning_service, "today", found_today)
    monkeypatch.setattr(route.morning_service, "find", find)

    class User:
        username = "joy"
    return asyncio.run(route.latest_standing(db=None, user=User()))


def test_the_room_opens_on_todays_morning_with_its_read_time(monkeypatch):
    today = {"thread_id": "m-1", "question": "How are we doing?", "answered_at": NOW,
             "read_at": NOW - timedelta(minutes=2)}
    older = {"thread_id": "s-9", "question": "Remind me", "answered_at": NOW - timedelta(hours=3),
             "standing_question_id": "s-9"}
    got = _opening(monkeypatch, standing=older, today=today)
    assert got.thread_id == "m-1" and got.morning is True
    assert got.read_at == NOW - timedelta(minutes=2)
    got = _opening(monkeypatch, standing=None, today=today)
    assert got.thread_id == "m-1"


def test_a_newer_standing_answer_still_opens_first_and_none_is_none(monkeypatch):
    today = {"thread_id": "m-1", "question": "How are we doing?",
             "answered_at": NOW - timedelta(hours=3), "read_at": None}
    newer = {"thread_id": "s-9", "question": "Remind me", "answered_at": NOW,
             "standing_question_id": "s-9"}
    got = _opening(monkeypatch, standing=newer, today=today)
    assert got.thread_id == "s-9" and got.morning is False
    assert _opening(monkeypatch, standing=None, today=None) is None


# ---------------------------------------------------------------------------
# 5. "Data changed", as definitions
# ---------------------------------------------------------------------------

def test_every_source_is_a_parameterized_statement_on_the_declared_clocks():
    allowed = {"read_at", "read_day", "covers_from", "today"}
    for name, source in SPEC["reuse"]["sources"].items():
        sql = source["sql"]
        assert sql.lstrip().upper().startswith("SELECT"), name
        assert set(re.findall(r"%\((\w+)\)s", sql)) <= allowed, name
        assert "{" not in sql and ";" not in sql, name
        assert source["says"].strip(), name


def test_the_bounds_are_manila_days_from_the_two_clocks():
    read_at = datetime(2026, 9, 21, 23, 30, tzinfo=timezone.utc)   # 07:30 on the 22nd, Manila
    b = morning_read.bounds(read_at, NOW, 35)
    assert b["read_day"] == date(2026, 9, 22)
    assert b["today"] == datetime(2026, 9, 22, tzinfo=MANILA)
    assert b["covers_from"] == datetime(2026, 8, 18, tzinfo=MANILA)
    assert b["read_at"] == read_at


def test_the_look_back_covers_the_widest_read_the_morning_makes():
    usual = req(DEFS, "comparisons.usual_weekday")
    widest = int(req(DEFS, usual["offset_days"])) * int(usual["weeks"]) + 1
    assert int(SPEC["reuse"]["covers_days"]) >= widest
