"""
Continuing a thread: who may, what a reply carries, and what George sees.

NO DATABASE, NO API. Three things are under test, none of which needs either:

  1. The decision. Exactly two ways into a thread — the caller's own
     conversation, or a root post George wrote at org level — expressed as a
     pure function and two SQL strings the suite inspects. This is an
     authorization boundary on private content; it stays narrow, and this
     file is what keeps it narrow.
  2. The reply. A question may name the post it replies to; the loop writes
     that onto the question post as given, and the route validates it is in
     the thread before the stream opens.
  3. What George sees. A history that opens with a George post — the brief
     somebody is replying to — is KEPT, behind THREAD_OPENER, instead of
     being dropped as it was until 2026-09-07.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                                  # noqa: E402
from app.services.thread_access import (                               # noqa: E402
    ORG_ROOT_SQL,
    OWN_CONVERSATION_SQL,
    PARENT_IN_THREAD_SQL,
    continuable,
)
from tests.test_loop_correction_contract import FakeClient, StubLog   # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "george.py"
_HOOK = _ROOT / "frontend" / "src" / "hooks" / "useGeorgeStream.ts"
_HISTORY = _ROOT / "frontend" / "src" / "components" / "george" / "threadHistory.ts"


def _run(monkeypatch, replies, **kwargs):
    """Drive the loop with the model and the log both stubbed."""
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def collect():
        return [f async for f in george_loop.run("and for Rockwell?", **kwargs)]

    return asyncio.run(collect()), fake.messages.requests


# ---------------------------------------------------------------------------
# 1. The decision
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("owns, root, expected", [
    (False, False, False),
    (True, False, True),
    (False, True, True),
    (True, True, True),
])
def test_either_fact_opens_the_thread_and_nothing_else_does(owns, root, expected):
    assert continuable(owns, root) is expected


def test_the_own_conversation_rule_is_the_old_rule_unchanged():
    assert "george.conversations" in OWN_CONVERSATION_SQL
    assert "c.user_id = :u" in OWN_CONVERSATION_SQL
    assert "COALESCE(c.thread_id, c.id) = :t" in OWN_CONVERSATION_SQL
    # A hidden (deleted) chat cannot be continued.
    assert "c.hidden_at IS NULL" in OWN_CONVERSATION_SQL


def test_the_org_root_rule_reads_the_root_and_only_the_root():
    # The root is the post whose id IS the thread id. A reply somebody shared
    # into the thread must not open it: it is not its own thread.
    assert "p.id = :t AND p.thread_id = :t" in ORG_ROOT_SQL
    assert "p.author = 'george'" in ORG_ROOT_SQL
    assert "p.visibility = 'org'" in ORG_ROOT_SQL
    assert "p.hidden_at IS NULL" in ORG_ROOT_SQL
    # Ownership plays no part in the org branch: an org root belongs to
    # nobody in particular, and consulting owner_user here would either
    # widen or narrow the rule by accident.
    assert "owner_user" not in ORG_ROOT_SQL
    assert ":u" not in ORG_ROOT_SQL and ":me" not in ORG_ROOT_SQL


def test_a_reply_may_only_name_a_post_it_can_see_in_its_own_thread():
    assert "p.id = :p AND p.thread_id = :t" in PARENT_IN_THREAD_SQL
    # The river's own visibility clause, on owner_user — never author_user,
    # which made every private answer invisible once already.
    assert "(p.visibility = 'org' OR p.owner_user = :me)" in PARENT_IN_THREAD_SQL
    assert "author_user" not in PARENT_IN_THREAD_SQL
    assert "p.hidden_at IS NULL" in PARENT_IN_THREAD_SQL


def test_the_route_uses_the_new_check_and_the_old_one_is_gone():
    source = _ROUTE.read_text(encoding="utf-8")
    assert "_thread_belongs_to" not in source
    assert "await _thread_continuable(" in source
    assert "await _parent_in_thread(" in source
    # A parent without a thread is a malformed request, not a lookup.
    assert "parent_id needs a thread_id" in source


def test_the_request_model_accepts_a_parent():
    from app.api.v1.routes.george import AskRequest
    assert "parent_id" in AskRequest.model_fields
    assert "thread_id" in AskRequest.model_fields
    req = AskRequest(question="why?", thread_id=uuid.uuid4(), parent_id=uuid.uuid4())
    assert req.parent_id is not None


# ---------------------------------------------------------------------------
# 2. The reply
# ---------------------------------------------------------------------------

def _question_insert(log: StubLog):
    """The question post's row, bound by column name. Literals stay literal."""
    for sql, params in log.statements:
        if "INSERT INTO george.posts" in sql and "'question'" in sql:
            columns = [c.strip() for c in sql.split("(", 1)[1].split(")", 1)[0].split(",")]
            values = sql.split("VALUES", 1)[1].split("(", 1)[1].split(")", 1)[0].split(",")
            bound = iter(params)
            return {name: (next(bound) if v.strip() == "%s" else v.strip())
                    for name, v in zip(columns, values)}
    raise AssertionError("no question post was written")


def test_the_question_post_carries_the_parent_it_replies_to(monkeypatch):
    thread, parent = str(uuid.uuid4()), str(uuid.uuid4())
    _run(monkeypatch, ["Rockwell took ₱9,120."], user_id="ice",
         thread_id=thread, parent_id=parent)
    row = _question_insert(StubLog.instances[-1])
    assert row["thread_id"] == thread
    assert row["parent_id"] == parent
    # Still private, still the replier's: replying publishes nothing.
    assert row["owner_user"] == "ice"


def test_a_question_that_opens_its_own_thread_has_no_parent(monkeypatch):
    _run(monkeypatch, ["₱9,120."], user_id="ice")
    row = _question_insert(StubLog.instances[-1])
    assert row["parent_id"] is None


# ---------------------------------------------------------------------------
# 3. What George sees
# ---------------------------------------------------------------------------

BRIEF = "Fairview took ₱18,400 on Sat 6 Sep 2026 — 41% below the same Saturday last week."


def test_a_history_that_opens_with_george_is_kept_behind_the_opener():
    executed: dict = {}
    messages = george_loop._seed_history(
        [{"role": "george", "text": BRIEF, "tool_calls": []}], executed,
    )
    assert messages == [
        {"role": "user", "content": george_loop.THREAD_OPENER},
        {"role": "assistant", "content": BRIEF},
    ]
    # No calls were replayed, so nothing is recorded as executed — a brief
    # post carries no tool provenance and must not seed any.
    assert executed == {}


def test_a_history_that_opens_with_a_person_gets_no_opener():
    messages = george_loop._seed_history(
        [{"role": "user", "text": "sales?", "tool_calls": []},
         {"role": "george", "text": "₱9,120.", "tool_calls": []}], {},
    )
    assert messages[0] == {"role": "user", "content": "sales?"}
    assert george_loop.THREAD_OPENER not in [m["content"] for m in messages]


def test_an_empty_history_is_still_empty():
    assert george_loop._seed_history([], {}) == []
    assert george_loop._seed_history(None, {}) == []


def test_the_model_is_shown_the_post_being_replied_to(monkeypatch):
    _, requests = _run(
        monkeypatch, ["Confectionery carried most of the drop."],
        history=[{"role": "george", "text": BRIEF, "tool_calls": []}],
    )
    sent = requests[0]["messages"]
    assert sent[0] == {"role": "user", "content": george_loop.THREAD_OPENER}
    assert sent[1] == {"role": "assistant", "content": BRIEF}
    # Then the person's actual question, as the LAST user turn — since P1.h an
    # effort marker can sit between the history and the question, and what
    # matters is that the replayed post precedes it and it is still his words.
    after = sent[2:]
    at = next(i for i, m in enumerate(after) if m["role"] == "user")
    assert all(m["role"] == "system" for m in after[:at])
    assert "and for Rockwell?" in after[at]["content"]


def test_the_opener_is_a_statement_and_not_a_question():
    # It names a fact about the thread. If it ever grew into an instruction
    # or a paraphrase of the post, George would be answering the opener.
    assert george_loop.THREAD_OPENER.startswith("[") and george_loop.THREAD_OPENER.endswith("]")
    assert "?" not in george_loop.THREAD_OPENER


def test_the_client_never_sends_tool_calls_for_a_george_post():
    # threadHistory.ts builds the history for a thread the caller has no
    # chat detail for: post bodies only. A George post's charted rows have
    # no arguments, and inventing them would fabricate provenance.
    if not _HISTORY.exists():
        pytest.skip("threadHistory.ts not written yet")
    source = _HISTORY.read_text(encoding="utf-8")
    # The turn shape's field is toolCalls; toHistory maps it to tool_calls on
    # the wire. A George post's turn is built with the empty list, literally.
    assert re.search(r"toolCalls:\s*\[\]", source), (
        "threadHistory.ts must build a George post's turn with no tool calls"
    )
    # The charted rows live in `payload`; a history builder that never reads
    # the payload cannot reconstruct a call from them.
    assert "payload" not in source, (
        "threadHistory.ts must not read a post's payload — the charted rows "
        "carry no arguments, and calls rebuilt from them would be invented"
    )
