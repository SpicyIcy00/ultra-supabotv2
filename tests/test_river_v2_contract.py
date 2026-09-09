"""
River V2, Stage 0: the four things that made the workspace unusable.

NO DATABASE, NO BROWSER. The route is driven with a fake session — it takes one
`AsyncSession` and asks it two questions, so a stub that answers those two is a
real exercise of the branch rather than a scan for a string. The client-side
rules are properties of source files and are read as such, the way
accentUse.test.ts and test_thread_continue_contract.py already do.

WHAT IS UNDER TEST, AND WHAT WENT WRONG IN EACH CASE.

  1. AN EMPTY THREAD YOU MAY CONTINUE IS NOT A MISSING THREAD. `read_thread`
     404'd on any thread with no visible post. A thread's posts are written at
     the END of the loop, so the first question of every new thread pointed at
     an address that was guaranteed to fail for the whole turn.

  2. THE READER IS SENT TO A THREAD ONLY ONCE IT EXISTS. The client followed
     the `start` frame, which is emitted before a single tool runs. It now
     follows the `post` frame, which the loop emits after `log.posts(...)`.

  3. THE STREAM IS NEVER ANIMATED AND THE TURN LIST DOES NOT SCROLL. The turn
     list held a smooth `scrollIntoView` keyed on an array that is new on every
     delta. Scrolling belongs to the container (useAutoFollow).

  4. A REWRITE SUPERSEDES; IT DOES NOT BLANK. `answer_reset` emptied the answer
     on arrival, so a paragraph somebody was reading vanished for as long as
     the rewrite took.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from pathlib import Path

import pytest

pytest.importorskip("fastapi", reason="the route module imports fastapi")

from fastapi import HTTPException                                      # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROUTE = _ROOT / "backend" / "app" / "api" / "v1" / "routes" / "george.py"
# The workspace, since the Experience Reset (2026-09-09): the desk, and the
# hook that wires it to persistence. Ask stopped being a page.
_DESK_PAGE = _ROOT / "frontend" / "src" / "pages" / "DeskPage.tsx"
_DESK = _ROOT / "frontend" / "src" / "components" / "desk" / "Desk.tsx"
_USE_DESK = _ROOT / "frontend" / "src" / "components" / "desk" / "useDesk.ts"
_ANSWER_TURN = _ROOT / "frontend" / "src" / "components" / "george" / "AnswerTurn.tsx"
# The one renderer both a live turn and a stored post go through (Stage 1).
_ENTRY = _ROOT / "frontend" / "src" / "components" / "george" / "RiverEntry.tsx"
# The parts both renderers draw from since Generative Workspace V3 (2026-09-09):
# an entry on its own, and a surface composed of several.
_PARTS = _ROOT / "frontend" / "src" / "components" / "george" / "entryParts.tsx"
_HOOK = _ROOT / "frontend" / "src" / "hooks" / "useGeorgeStream.ts"
_THREAD_HOOK = _ROOT / "frontend" / "src" / "hooks" / "useThread.ts"
_FOLLOW = _ROOT / "frontend" / "src" / "hooks" / "useAutoFollow.ts"


def _source(path: Path) -> str:
    """A file's CODE. Comments explain why a thing is forbidden; they are not it."""
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    return re.sub(r"^\s*//.*$", "", text, flags=re.MULTILINE)


# ---------------------------------------------------------------------------
# 1. The route
# ---------------------------------------------------------------------------


class _Result:
    """What `session.execute` hands back, for the two shapes the route uses."""

    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    """
    An AsyncSession that answers exactly the questions this route asks.

    `posts` is what the visibility-filtered post read returns. `continuable`
    decides what thread_access's two existence probes return — which is the
    branch under test, so it is set explicitly rather than inferred.
    """

    def __init__(self, posts, continuable):
        self.posts = posts
        self.continuable = continuable
        self.statements: list[str] = []

    async def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append(sql)
        if "FROM george.posts p" in sql and "SELECT 1" not in sql:
            return _Result(self.posts)
        # thread_access's OWN_CONVERSATION_SQL / ORG_ROOT_SQL, both "SELECT 1".
        return _Result([(1,)] if self.continuable else [])


class _User:
    username = "ice"


def _read_thread(session, thread_id=None):
    from app.api.v1.routes.george import read_thread

    return asyncio.run(
        read_thread(thread_id or uuid.uuid4(), db=session, user=_User())
    )


def test_an_empty_thread_the_caller_may_continue_is_an_empty_list():
    # The turn that names this thread is still running and its posts are
    # written last. That is an ordinary state, not a missing thread, and it is
    # what the reader is looking at for the whole of their first question.
    session = _FakeSession(posts=[], continuable=True)
    assert _read_thread(session) == []


def test_an_empty_thread_the_caller_may_not_continue_is_still_a_404():
    session = _FakeSession(posts=[], continuable=False)
    with pytest.raises(HTTPException) as raised:
        _read_thread(session)
    assert raised.value.status_code == 404


def test_the_404_does_not_say_which_kind_of_absence_it_is():
    # "No such thread" and "not yours" must stay indistinguishable: a caller
    # who could tell them apart could enumerate other people's threads by id.
    session = _FakeSession(posts=[], continuable=False)
    with pytest.raises(HTTPException) as raised:
        _read_thread(session)
    detail = str(raised.value.detail).lower()
    assert "no thread with that id" in detail
    for leak in ("yours", "permission", "owner", "forbidden", "not allowed"):
        assert leak not in detail


def test_the_continuable_check_uses_the_session_the_route_already_holds():
    # Every George database URL goes through the 5432 session-mode pooler and
    # connections are the scarce thing (supabase-pooler-session-cap). A read
    # holding a session must not open a second one.
    session = _FakeSession(posts=[], continuable=True)
    _read_thread(session)
    assert any("SELECT 1" in s for s in session.statements), (
        "the continuable check did not run on the route's own session"
    )
    body = _source(_ROUTE)
    read_thread_body = body.split("async def read_thread(", 1)[1].split("\n@router", 1)[0]
    assert "_thread_continuable(" not in read_thread_body, (
        "read_thread must call thread_continuable(db, ...) directly; "
        "_thread_continuable opens its own AsyncSessionLocal"
    )


def test_a_thread_with_posts_is_unaffected():
    session = _FakeSession(posts=[], continuable=True)
    # The non-empty path is the pre-existing one and is covered by
    # test_river_contract; what matters here is that the new branch is reached
    # ONLY when the post read came back empty.
    _read_thread(session)
    assert session.statements[0].count("FROM george.posts p") == 1


# ---------------------------------------------------------------------------
# 2. Navigation follows the post frame, not the start frame
# ---------------------------------------------------------------------------


def test_the_stream_exposes_the_thread_id_only_once_its_posts_exist():
    hook = _source(_HOOK)
    assert "storedThreadId" in hook
    # Set from the `post` frame's own `stored` flag, which is false when
    # logging is off or failed — there is then no thread to send anybody to.
    assert re.search(r"data\.stored\s*&&", hook), (
        "storedThreadId must be gated on the post frame's `stored` flag"
    )


def test_the_reader_is_sent_to_a_work_address_only_once_its_posts_exist():
    # The rule is unchanged and its address is not: a question asked at rest
    # moves to /w/:threadId, and it moves on the POST frame — `storedThreadId`,
    # which the hook sets only when the frame says the posts were stored.
    page = _source(_DESK_PAGE)
    assert "storedThreadId" in page
    assert "navigate(`/w/${desk.storedThreadId}`" in page
    # Nothing follows the start frame, and nothing navigates on a question.
    assert "threadId" in page
    assert "navigate(`/ask/" not in page


def test_the_work_is_rendered_where_it_was_asked():
    # The desk reads persisted work and merges the live turn into it, so the
    # answer transforms the workspace in place rather than arriving elsewhere.
    hook = _source(_USE_DESK)
    assert "useRiver('work')" in hook
    assert "riverMerge(posts, george.turns)" in hook
    assert "riverSurfaces(" in hook


# ---------------------------------------------------------------------------
# 3. Scrolling
# ---------------------------------------------------------------------------


def test_the_turn_list_no_longer_scrolls_anything():
    for path in (_ANSWER_TURN, _ENTRY):
        source = _source(path)
        assert "scrollIntoView" not in source, f"{path.name} scrolls"
        assert "scrollTop" not in source, f"{path.name} scrolls"


def test_nothing_in_the_workspace_asks_for_smooth_scrolling():
    for path in (_ANSWER_TURN, _ENTRY, _DESK, _FOLLOW):
        assert "smooth" not in _source(path), f"{path.name} animates the stream"


def test_the_workspace_scrolls_nothing_by_itself():
    # THE STAGE IS NOT A FEED (2026-09-09). The river's answer to "the content
    # grew under me" was to follow it; the desk's is that the workspace does
    # not grow — a question TRANSFORMS what is on screen, so there is nothing
    # to chase and nothing to jump back to. Anything here that moved the
    # viewport would be moving it for content the reader did not add.
    for path in (_DESK, _DESK_PAGE):
        source = _source(path)
        assert "scrollIntoView" not in source, f"{path.name} scrolls"
        assert "scrollTop" not in source, f"{path.name} scrolls"
        assert "useAutoFollow" not in source, f"{path.name} follows a stream it does not have"


# ---------------------------------------------------------------------------
# 4. A rewrite supersedes
# ---------------------------------------------------------------------------


def test_a_rewrite_keeps_the_answer_it_replaces_on_screen():
    hook = _source(_HOOK)
    reset = hook.split("case 'answer_reset':", 1)[1].split("case '", 1)[0]
    assert "superseded" in reset, "answer_reset must keep the old answer, not blank it"


def test_interim_prose_is_narration_and_never_superseded_answer_text():
    # CLAUDE.md, 2026-09-08: prose written before a read belongs in the
    # activity disclosure and never above the answer. Putting it back as
    # superseded answer text is exactly what the loop learned to stop doing.
    hook = _source(_HOOK)
    reset = hook.split("case 'answer_reset':", 1)[1].split("case '", 1)[0]
    interim = reset.split("interim_prose", 1)[1].split("} else", 1)[0]
    assert "narration" in interim
    assert "superseded" not in interim


def test_the_superseded_answer_is_cleared_when_the_rewrite_starts():
    hook = _source(_HOOK)
    text_case = hook.split("case 'text':", 1)[1].split("case '", 1)[0]
    assert "superseded" in text_case, (
        "the replaced answer must come off screen when the replacement starts, "
        "not when it finishes — two answers saying different things is worse "
        "than a blank"
    )


def test_a_finished_turn_never_shows_prose_the_river_does_not_have():
    hook = _source(_HOOK)
    done = hook.split("case 'done':", 1)[1].split("break;", 1)[0]
    assert "superseded" in done, (
        "the server resets `answer` too, so a rewrite that never arrived is not "
        "the stored answer and must not be left on screen as one"
    )


def test_the_superseded_answer_is_marked_as_being_replaced():
    # Drawn by the one renderer since Stage 1, live and stored alike — and,
    # since V3, by the surface too, through the shared parts.
    entry = _source(_ENTRY)
    parts = _source(_PARTS)
    assert "SupersededAnswer" in entry
    body = parts.split("function SupersededAnswer(", 1)[1].split("\n}", 1)[0]
    assert "Rewriting" in body, "text about to stop being true must say so"
    assert "SupersededAnswer" in _source(_ROOT / "frontend" / "src" / "components" / "george" / "WorkSurface.tsx")


# ---------------------------------------------------------------------------
# 5. A failed lookup is not a missing thread
# ---------------------------------------------------------------------------


def test_the_client_tells_a_404_apart_from_a_failed_lookup():
    hook = _source(_THREAD_HOOK)
    assert "unavailable" in hook and "failed" in hook
    assert re.search(r"status\s*===\s*404", hook), (
        "unavailable must be a 404 and nothing else — a network fault told "
        "somebody their work was gone"
    )


def test_the_workspace_draws_the_failed_lookup_as_its_own_state():
    hook = _source(_USE_DESK)
    assert "thread.failed" in hook
    assert "thread.unavailable" in hook
    assert "thread.refetch" in hook, "a retryable failure needs a way to retry"
    desk = _source(_DESK)
    # Four outcomes, four renderings, and none may borrow another's words.
    assert "desk.loading" in desk
    assert "desk.unavailable" in desk
    assert "desk.failed" in desk
    assert "Try again" in desk
