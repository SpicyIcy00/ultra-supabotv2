"""
The watches page's shape, pure (W4.4, 2026-09-23) — "how do I turn it on?"

NO DATABASE, NO MODEL. What holds:

  1. ITS SLOT IS ALWAYS THERE. `when` is a time whether the thing is on or
     off, for both families. The rail used to draw "off" INSTEAD of
     "Mon at 08:00", so two rows in one group carried different facts.
  2. WHAT IT WAS TOLD IS READABLE. A standing question's `instructions[]`
     come out as `told`, marked as instructions; a watch's condition, its
     direction and its scope come out as `told`, marked as a condition —
     because a condition is what the watch IS and not a sentence somebody
     typed at it.
  3. RULE 7 IS READ BEFORE IT IS PRESSED. `switch_on_refusal` carries the
     service's own sentence for a watch that has no backtest, or whose
     backtest was measured under other definitions — the SAME sentence
     `watches.switch` raises, because both read `watches.why_not_on`.
  4. NOTHING HERE CREATES, PROMOTES OR FORCES. The route module offers switch,
     reschedule, rewrite and remove and no create of any kind, and no route
     takes an owner from a client.
  5. SILENCE IS NORMAL. A watch that has never fired says how many times it
     has been checked and how many of those it spoke on, off
     george.watch_checks, with the time of the last check beside them.
  6. `may` IS READ FROM THE SERVICES. A watch has no name to rewrite, so it
     says so rather than letting a page draw a control the server refuses.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

pytest.importorskip("psycopg", reason="the watch service reads the definitions")

from app.services import watches, watching                            # noqa: E402
from tools._common import load_defs, req                              # noqa: E402

DEFS = load_defs()
VERSION = str(req(DEFS, "version"))
NOW = datetime(2026, 9, 23, 8, 0, tzinfo=timezone.utc)
ROUTES = Path(__file__).resolve().parents[1] / "backend" / "app" / "api" / "v1" / "routes" / "bob_watching.py"


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# A world small enough to read
# ---------------------------------------------------------------------------

class _Result:
    def __init__(self, rows):
        self._rows = list(rows)

    def mappings(self):
        return self

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return list(self._rows)

    def scalars(self):
        return self


class FakeSession:
    """Answers the three text() reads watching.py makes, by their own SQL."""

    def __init__(self, answers=None, watch_posts=None, checks=None):
        self.answers = answers or {}
        self.watch_posts = watch_posts or {}
        self.checks = checks or {}
        self.seen: list[str] = []

    async def execute(self, stmt, params=None):
        sql = " ".join(str(stmt).split())
        self.seen.append(sql)
        params = params or {}
        if "FROM george.posts" in sql and "thread_id = :thread" in sql:
            return _Result(self.answers.get(params.get("thread"), []))
        if "george.watch_checks c" in sql:
            return _Result(self.watch_posts.get(params.get("watch"), []))
        if "count(*) AS checks" in sql:
            return _Result([self.checks.get(params.get("watch"),
                                            {"checks": 0, "spoke": 0, "newest": None})])
        raise AssertionError(f"unexpected read: {sql}")


def question(**over):
    row = SimpleNamespace(
        id=uuid.uuid4(), owner="isaiah", question="How are we doing?",
        instructions=["Show more of Rockwell."], kind="daily", hour=8, minute=0,
        days_of_week=None, enabled=False, last_run_at=None, last_status=None,
        last_error=None, last_thread_id=None,
    )
    for k, v in over.items():
        setattr(row, k, v)
    return row


def watch(**over):
    row = SimpleNamespace(
        id=uuid.uuid4(), owner="isaiah", condition=sorted(watches.conditions(DEFS))[0],
        direction="down", stores=None, kind="weekly", hour=8, minute=0,
        days_of_week=[0], enabled=False, backtest=None, last_state=None,
        last_checked_at=None, last_fired_at=None, last_status=None, last_error=None,
    )
    for k, v in over.items():
        setattr(row, k, v)
    return row


def backtest(days_fired=9, version=VERSION):
    return {"days_checked": 60, "days_fired": days_fired, "definitions_version": version}


# ---------------------------------------------------------------------------
# 1. The slot is always there
# ---------------------------------------------------------------------------

def test_an_off_row_still_carries_its_slot():
    """
    The rail's bug, as a rule: "off" is the SWITCH, never the slot.

    Rail.tsx drew `state === 'switched off' ? 'off' : when`, so an off row and
    an on row in one group said two different kinds of thing and could not be
    read down. Both families carry a time either way now.
    """
    for on in (True, False):
        q = _run(watching.question_row(FakeSession(), question(enabled=on)))
        assert q["when"] == "every day at 08:00"
        assert q["on"] is on
        w = _run(watching.watch_row(FakeSession(), watch(enabled=on, backtest=backtest()),
                                    DEFS))
        assert w["when"] == "Mon at 08:00"
        assert w["on"] is on
        # The switch is its own field; the words never stand in for it.
        assert isinstance(w["state"], str) and w["state"]


# ---------------------------------------------------------------------------
# 2. What it was told
# ---------------------------------------------------------------------------

def test_a_questions_instructions_are_readable():
    q = _run(watching.question_row(
        FakeSession(), question(instructions=["Show more of Rockwell.", "Skip AJI CMG."])))
    assert q["told"] == ["Show more of Rockwell.", "Skip AJI CMG."]
    assert q["told_by"] == "instructions"


def test_a_watch_is_told_by_its_condition_not_by_a_sentence():
    """
    A watch has no name and no instructions: it IS its condition, its
    direction and its scope. The page says which kind of telling it is, so it
    cannot offer to edit a condition as if it were a typed line.
    """
    w = _run(watching.watch_row(
        FakeSession(), watch(direction="down", stores=["Rockwell"], backtest=backtest()),
        DEFS))
    assert w["told_by"] == "condition"
    assert any("down" in line for line in w["told"])
    assert "Rockwell" in w["told"][-1]
    every = _run(watching.watch_row(FakeSession(), watch(stores=None, direction="either",
                                                         backtest=backtest()), DEFS))
    assert every["told"][-1] == "every shop"
    assert not any("moves" in line for line in every["told"])


# ---------------------------------------------------------------------------
# 3. Rule 7, read before it is pressed
# ---------------------------------------------------------------------------

def test_a_watch_with_no_backtest_says_so_where_it_is_read():
    w = _run(watching.watch_row(FakeSession(), watch(backtest=None), DEFS))
    assert w["switch_on_refusal"]
    assert "backtested" in w["switch_on_refusal"]
    assert w["state"] == "not backtested yet"


def test_the_refusal_read_is_the_refusal_raised():
    """
    One sentence, one source. A gate a person only meets as a failed click is
    a gate that reads as a bug, so the page shows it first — and the two must
    be the same words, which they are because both call `why_not_on`.
    """
    for made in (None, backtest(version="0.0.0-not-this-one")):
        row = watch(backtest=made)
        read = watching_refusal(row)
        raised = _raise_of(row)
        assert read == raised, (read, raised)
    assert watching_refusal(watch(backtest=backtest())) is None


def watching_refusal(row):
    return _run(watching.watch_row(FakeSession(), row, DEFS))["switch_on_refusal"]


def _raise_of(row) -> str:
    class _S:
        async def execute(self, *a, **k):
            return _Result([row])

        async def flush(self):
            pass

    try:
        _run(watches.switch(_S(), owner="isaiah", which=str(row.id), on=True))
    except watches.WatchRefused as exc:
        return str(exc)
    return ""


def test_a_backtested_watch_may_be_switched_on():
    w = _run(watching.watch_row(FakeSession(), watch(backtest=backtest()), DEFS))
    assert w["switch_on_refusal"] is None
    assert w["state"] == "ready — not switched on"
    assert w["backtest"] == "9 of the last 60 days"


# ---------------------------------------------------------------------------
# 4. Nothing here creates, promotes or forces
# ---------------------------------------------------------------------------

def test_the_routes_switch_and_never_create():
    source = ROUTES.read_text(encoding="utf-8")
    for offered in ("/questions/{question_id}/switch", "/watches/{watch_id}/switch",
                    "/questions/{question_id}/reschedule", "/questions/{question_id}/rewrite",
                    "/watches/{watch_id}/reschedule"):
        assert offered in source, offered
    # Creating is Bob's, and everything he creates is born off (rule 7).
    assert ".create(" not in source
    assert "record_backtest" not in source
    # No override of any kind, and no owner from a client. Read over the CODE:
    # the module's prose says there is no force, which is not a `force=`.
    code = " ".join(l for l in source.splitlines() if not l.lstrip().startswith("#"))
    code = code.split('"""', 2)[-1]
    for forbidden in ("force", "owner=body", "owner=owner", "skip_backtest"):
        assert forbidden not in code, forbidden
    # Every write binds the authenticated user as the owner.
    assert source.count("owner=user.username") == 7  # every write route


def test_every_write_goes_through_the_one_service():
    """Rule 4: the same functions Bob's injected writer calls, nothing else."""
    source = ROUTES.read_text(encoding="utf-8")
    assert "text(" not in source and "execute(" not in source
    assert "from app.services import standing_questions, watches, watching" in source


# ---------------------------------------------------------------------------
# 5. Silence is normal
# ---------------------------------------------------------------------------

def test_a_watch_that_has_never_spoken_says_how_often_it_looked():
    row = watch(backtest=backtest(), enabled=True,
                last_checked_at=NOW, last_status="quiet")
    session = FakeSession(checks={str(row.id): {"checks": 11, "spoke": 0, "newest": NOW}})
    w = _run(watching.watch_row(session, row, DEFS))
    assert w["checks"] == 11 and w["spoke"] == 0
    assert w["last_said"] is None
    # The count is a count of rows in a record, and it comes with the time of
    # the last one (UI rule 6).
    assert w["last_run_at"] == NOW


def test_what_a_watch_last_said_is_its_own_post():
    row = watch(backtest=backtest(), enabled=True, last_checked_at=NOW)
    said = {"id": uuid.uuid4(), "body": "Sales down — Rockwell down 12.0%",
            "created_at": NOW - timedelta(days=1),
            "receipts": {"snapshot_timestamp": "2026-09-22T00:05:00+00:00"},
            "payload": None, "as_of": None}
    session = FakeSession(watch_posts={str(row.id): [said]},
                          checks={str(row.id): {"checks": 9, "spoke": 1, "newest": NOW}})
    w = _run(watching.watch_row(session, row, DEFS))
    assert w["last_said"]["said"] == "Sales down — Rockwell down 12.0%"
    assert w["last_said"]["read_at"] is not None
    assert w["last_said"]["at"] == NOW - timedelta(days=1)


def test_what_a_question_last_said_is_the_answer_in_its_thread():
    thread = uuid.uuid4()
    row = question(enabled=True, last_thread_id=thread, last_run_at=NOW, last_status="ok")
    body = "Yesterday was ₱182,400 across the estate.\n\nRockwell carried most of it."
    session = FakeSession(answers={str(thread): [
        {"id": uuid.uuid4(), "body": body, "created_at": NOW,
         "receipts": {"snapshot_timestamp": "2026-09-23T00:02:00+00:00"}, "payload": None}]})
    q = _run(watching.question_row(session, row))
    # His own words, to the end of the first paragraph.
    assert q["last_said"]["said"] == "Yesterday was ₱182,400 across the estate."
    assert q["last_said"]["read_at"] is not None
    assert q["last_said"]["thread_id"] == str(thread)


def test_a_question_that_has_never_run_says_nothing_rather_than_guessing():
    q = _run(watching.question_row(FakeSession(), question()))
    assert q["last_said"] is None and q["last_run_at"] is None and q["last_status"] is None


def test_a_long_answer_is_bounded_and_marked():
    long = "x" * (watching.SAID_CHARS + 50)
    assert watching._said(long).endswith("…")
    assert len(watching._said(long)) == watching.SAID_CHARS + 1
    assert watching._said("   ") is None


# ---------------------------------------------------------------------------
# 6. `may` is read from the services
# ---------------------------------------------------------------------------

def test_a_watch_has_no_name_to_rewrite():
    w = _run(watching.watch_row(FakeSession(), watch(backtest=backtest()), DEFS))
    assert w["may"] == {"switch": True, "reschedule": True, "rewrite": False, "remove": True}
    q = _run(watching.question_row(FakeSession(), question()))
    assert q["may"] == {"switch": True, "reschedule": True, "rewrite": True, "remove": True}
    # And every one of those is a function the service actually exports.
    for name in ("switch", "reschedule", "remove"):
        assert callable(getattr(watches, name)) and callable(getattr(watches, name))
    for name in ("switch", "reschedule", "rewrite", "remove"):
        assert callable(getattr(__import__("app.services.standing_questions",
                                           fromlist=["x"]), name))


def test_both_families_answer_the_same_four_questions():
    """One reading shape, two kinds of thing — never merged, always comparable."""
    q = _run(watching.question_row(FakeSession(), question()))
    w = _run(watching.watch_row(FakeSession(), watch(backtest=backtest()), DEFS))
    assert set(q) == set(w)
    assert q["family"] == "question" and w["family"] == "watch"
    for key in ("asks", "when", "on", "state", "told", "last_run_at", "last_said"):
        assert key in q and key in w
