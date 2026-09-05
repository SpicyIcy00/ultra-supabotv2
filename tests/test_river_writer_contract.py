"""
George's own posts: ids, idempotency, and which kinds are wired.

NO DATABASE. The session is a stub that records the statement and its
parameters, the same technique test_chats_contract uses on the INSERT-only log
— what is under test is what these writers SAY, not that Postgres accepts it.

THE ASSERTION WORTH HAVING is the last one: every kind in POST_KINDS either has
a writer or is on a short list of kinds deliberately left unwritten. A kind
added to the schema and never wired renders as nothing at all, which no test
would otherwise notice.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import date, datetime, timezone

import pytest

pytest.importorskip("sqlalchemy", reason="the writers build SQLAlchemy text()")

from app.models.george_post import (  # noqa: E402
    POST_KINDS,
    PRIVATE_GEORGE_KINDS,
    default_visibility,
)
from app.services import river_writer  # noqa: E402
from app.services.river_writer import (  # noqa: E402
    post_approval,
    post_brief,
    post_id,
    post_pin_confirmation,
    post_workflow_run,
)


class _Result:
    def __init__(self, rowcount): self.rowcount = rowcount


class FakeSession:
    """
    Records statements. `rowcount` is 0 for a row the database would have
    rejected as a duplicate, which is what ON CONFLICT DO NOTHING reports.
    """

    def __init__(self, rowcount: int = 1) -> None:
        self.rowcount = rowcount
        self.calls: list[tuple[str, dict]] = []

    async def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params or {}))
        return _Result(self.rowcount)

    def params(self, i: int = 0) -> dict:
        return self.calls[i][1]


GREETING = {
    "kind": "item",
    "headline": "Greenhills took P62,410 on Thu 4 Sep 2026.",
    "item": {"section": "sales_vs_same_weekday",
             "receipts": {"source_table": "new_transactions"}},
    "notices": [{"kind": "low_stock_not_operational", "message": "Unset.",
                 "source": "metrics.yaml: inventory.states"}],
    "meta": {"source_table": "brief"},
    "blind_sections": [],
    "follow_ups": [{"label": "Why? Greenhills", "question": "Why was Greenhills up?"}],
}


# ---------------------------------------------------------------------------
# Ids
# ---------------------------------------------------------------------------

def test_ids_are_derived_from_the_event_not_a_clock() -> None:
    """
    Same rule ConversationLog.post_ids() and the backfill use, so every
    deterministic id in this system is produced one way.
    """
    got = post_id("brief", "2026-09-05")
    expected = uuid.UUID(hashlib.md5(b"brief:2026-09-05").hexdigest())
    assert got == expected


def test_the_kind_is_part_of_the_key() -> None:
    """Two different events sharing a key must not collide."""
    assert post_id("brief", "x") != post_id("approval", "x")


def test_the_same_event_always_gets_the_same_id() -> None:
    assert post_id("workflow_run", "abc") == post_id("workflow_run", "abc")


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------

def test_a_second_write_of_the_same_event_reports_nothing_written() -> None:
    """
    ON CONFLICT DO NOTHING, and the return value distinguishes the two cases so
    a caller can tell "posted" from "already posted" without reading back.

    This is not a nicety. POST /brief/send has no claim mechanism at all, so an
    n8n retry after a timeout would otherwise post the morning brief twice.
    """
    first = asyncio.run(post_brief(FakeSession(rowcount=1),
                                   greeting=GREETING, as_of=date(2026, 9, 5)))
    again = asyncio.run(post_brief(FakeSession(rowcount=0),
                                   greeting=GREETING, as_of=date(2026, 9, 5)))
    assert first is not None
    assert again is None
    assert first == post_id("brief", "2026-09-05")


def test_every_writer_uses_on_conflict_do_nothing() -> None:
    """
    A check-then-insert would leave the race between the two statements, which
    on two scheduler replicas is exactly where a duplicate comes from.
    """
    for run in (
        lambda s: post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)),
        lambda s: post_workflow_run(s, run_id=uuid.uuid4(), workflow_name="W",
                                    version=1, outcome={"status": "ok", "steps": []}),
        lambda s: post_approval(s, version_id=uuid.uuid4(), workflow_name="W",
                                version=1, created_by="ice", backtested=False),
    ):
        session = FakeSession()
        asyncio.run(run(session))
        assert "ON CONFLICT (id) DO NOTHING" in session.calls[0][0]


# ---------------------------------------------------------------------------
# What a post carries
# ---------------------------------------------------------------------------

def test_the_brief_post_is_the_greeting() -> None:
    """
    Not a second rendering. build_greeting already produces a standalone
    sentence a voice layer could speak, and re-rendering it here would be two
    descriptions of one morning that could disagree.
    """
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)))
    p = s.params()
    assert p["body"] == GREETING["headline"]
    assert p["kind"] == "brief"


def test_the_brief_post_carries_the_items_own_receipts() -> None:
    """
    A brief mixes sources of different ages, so the brief-level timestamp would
    lend the freshest source's credibility to the stalest source's facts. Same
    choice Greeting.tsx makes.
    """
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)))
    assert json.loads(s.params()["receipts"]) == {"source_table": "new_transactions"}


def test_the_brief_post_falls_back_to_the_briefs_meta_with_no_item() -> None:
    quiet = {**GREETING, "kind": "quiet", "item": None,
             "headline": "Nothing moved beyond normal today."}
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=quiet, as_of=date(2026, 9, 5)))
    assert json.loads(s.params()["receipts"]) == {"source_table": "brief"}


def test_no_writer_drops_a_notice() -> None:
    """UI rule 4 applies to every kind, so no writer may omit the field."""
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)))
    assert json.loads(s.params()["notices"]) == GREETING["notices"]

    s = FakeSession()
    notice = {"kind": "version_divergence", "message": "v3 ran; the schedule fires v2."}
    asyncio.run(post_workflow_run(
        s, run_id=uuid.uuid4(), workflow_name="Monday", version=3,
        outcome={"status": "ok", "steps": [1, 2], "notices": [notice],
                 "ran_at": "2026-09-05T06:00:00+00:00"}))
    assert json.loads(s.params()["notices"]) == [notice]


def test_a_failed_run_is_posted_like_any_other() -> None:
    """
    A job that fails silently is indistinguishable from a quiet morning —
    the same reason the scheduler delivers a failure to Telegram.
    """
    s = FakeSession()
    asyncio.run(post_workflow_run(
        s, run_id=uuid.uuid4(), workflow_name="Monday", version=2,
        outcome={"status": "failed", "steps": [], "notices": []}))
    assert "failed" in s.params()["body"]


def test_an_approval_post_states_no_figure_and_carries_no_receipts() -> None:
    """The receipts rules govern numbers, and an approval states none."""
    s = FakeSession()
    asyncio.run(post_approval(s, version_id=uuid.uuid4(), workflow_name="BARN",
                              version=1, created_by="admin", backtested=False))
    assert s.params()["receipts"] is None
    assert "Never backtested" in s.params()["body"]


def test_an_approval_distinguishes_its_two_blocking_reasons() -> None:
    """They have different fixes: run a backtest, or go and promote it."""
    s = FakeSession()
    asyncio.run(post_approval(s, version_id=uuid.uuid4(), workflow_name="BARN",
                              version=2, created_by="admin", backtested=True))
    assert "waiting for an administrator" in s.params()["body"]


# ---------------------------------------------------------------------------
# Visibility, and the kinds that are wired
# ---------------------------------------------------------------------------

def test_georges_own_posts_are_org_level() -> None:
    """From default_visibility, not decided per writer."""
    for run, kind in (
        (lambda s: post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)), "brief"),
        (lambda s: post_workflow_run(s, run_id=uuid.uuid4(), workflow_name="W",
                                     version=1, outcome={"status": "ok", "steps": []}),
         "workflow_run"),
        (lambda s: post_approval(s, version_id=uuid.uuid4(), workflow_name="W",
                                 version=1, created_by="ice", backtested=False),
         "approval"),
    ):
        s = FakeSession()
        asyncio.run(run(s))
        assert s.params()["visibility"] == "org" == default_visibility(kind)


def test_georges_posts_never_have_an_author() -> None:
    """author_user is who WROTE it, and George has no account."""
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)))
    assert "'george', NULL," in s.calls[0][0]


def test_an_org_post_belongs_to_nobody_in_particular() -> None:
    """
    owner_user is whose a post is WHILE PRIVATE. An org post has no owner, and
    the CHECK that forbids a private post without one is satisfied because
    these are org.
    """
    s = FakeSession()
    asyncio.run(post_brief(s, greeting=GREETING, as_of=date(2026, 9, 5)))
    assert s.params()["owner_user"] is None
    assert s.params()["visibility"] == "org"


# ---------------------------------------------------------------------------
# A pin somebody made — the one kind George writes that is NOT org
# ---------------------------------------------------------------------------

def test_a_pin_confirmation_is_private_and_owned() -> None:
    """
    "A pin is one person's tile" (CLAUDE.md).

    This defaulted to 'org' with the rest of George's kinds until the writer
    was wired, which would have announced "Ice pinned Rockwell net sales" to
    the whole company the first time anybody pinned anything.
    """
    assert default_visibility("pin_confirmation") == "private"
    s = FakeSession()
    asyncio.run(post_pin_confirmation(
        s, pin_id=uuid.uuid4(), title="Rockwell net sales", page="Replenishment",
        owner="ice", tool_calls=1))
    assert s.params()["visibility"] == "private"
    assert s.params()["owner_user"] == "ice"
    # Still authored by George — he made the pin, it is theirs.
    assert "'george', NULL," in s.calls[0][0]


def test_a_pin_confirmation_states_no_figure() -> None:
    """
    It says a tile exists and that it re-runs. No receipts, because the
    receipts rules govern numbers and this states none.
    """
    s = FakeSession()
    asyncio.run(post_pin_confirmation(
        s, pin_id=uuid.uuid4(), title="Rockwell net sales", page="Replenishment",
        owner="ice", tool_calls=3))
    assert s.params()["receipts"] is None
    body = s.params()["body"]
    assert "Replenishment" in body and "re-runs" in body and "3 calls" in body


def test_a_pin_with_no_page_says_so_rather_than_inventing_one() -> None:
    s = FakeSession()
    asyncio.run(post_pin_confirmation(
        s, pin_id=uuid.uuid4(), title="T", page=None, owner="ice", tool_calls=1))
    assert "no page" in s.params()["body"]
    assert "its call" in s.params()["body"]


def test_a_pin_announces_itself_once() -> None:
    pid = uuid.uuid4()
    first = asyncio.run(post_pin_confirmation(
        FakeSession(rowcount=1), pin_id=pid, title="T", page=None,
        owner="ice", tool_calls=1))
    again = asyncio.run(post_pin_confirmation(
        FakeSession(rowcount=0), pin_id=pid, title="T", page=None,
        owner="ice", tool_calls=1))
    assert first == post_id("pin_confirmation", str(pid))
    assert again is None


# The kinds nothing writes yet, each with the reason. A kind leaves this list
# by being wired, not by being added to it.
UNWIRED = {
    # Reserved for Watch — "George noticed something BETWEEN briefs". Filling
    # it with the brief's other items would make a one-post morning into seven
    # and spend the word before the concept arrives (CLAUDE.md, Watch).
    "notice",
    # Written by the agent loop through ConversationLog, not from here.
    "question", "answer",
    # The app speaking about itself. Nothing raises one yet.
    "system",
}

WIRED = {"brief": post_brief, "workflow_run": post_workflow_run,
         "approval": post_approval, "pin_confirmation": post_pin_confirmation}


def test_every_kind_is_either_wired_or_deliberately_not() -> None:
    """
    A kind in the schema that nothing writes renders as nothing at all, and no
    other test would notice. This one fails the moment a kind is added without
    a writer or an entry saying why it has none.
    """
    accounted = set(WIRED) | UNWIRED
    assert accounted == set(POST_KINDS), (
        f"unaccounted kinds: {set(POST_KINDS) ^ accounted}"
    )


def test_the_private_george_kinds_are_the_two_that_belong_to_somebody() -> None:
    """
    George AUTHORS all of his kinds; only two BELONG to a person. Conflating
    those is what made pin_confirmation default to org.
    """
    assert set(PRIVATE_GEORGE_KINDS) == {"answer", "pin_confirmation"}
    for kind in PRIVATE_GEORGE_KINDS:
        assert default_visibility(kind) == "private", kind


def test_the_notice_kind_is_still_reserved() -> None:
    """
    Asserted rather than assumed, because the temptation is constant: the
    brief's other items are RIGHT THERE and would fit the kind perfectly.
    """
    assert "notice" in UNWIRED
    assert not hasattr(river_writer, "post_notice")
