"""
The answer post is written, or the thread is lost.

NO DATABASE. `ConversationLog` with no GEORGE_LOG_DATABASE_URL is disabled, so
`_exec` returns without connecting and everything here exercises the part that
broke: building the statement, not running it.

WHAT HAPPENED, 2026-09-19. The owner: "my most recent chat just disappears
after i hard refresh which didnt happen before." One turn in his data had a
conversation row holding the whole answer, a question post, and no answer post.
The chain:

  1. `_answer_payload` passed five of its six fields straight to json.dumps.
     Only `charted` had been through `_json_safe`, because it is sanitised
     where it is collected. A Decimal or a datetime in a composition block, a
     reading, an action or a page read raised TypeError.
  2. The raise was outside `_exec`'s swallow AND outside the turn's own
     try/except, so it escaped `log.posts` and killed the generator.
  3. The question post was already written. The answer post never was.
  4. No answer post meant no `post` frame.
  5. No `post` frame meant the browser never called `setStoredThread`, so the
     url stayed `/bob` instead of becoming `/w/<thread>`.
  6. A hard refresh had no address to return to. The conversation was in the
     database the whole time and unreachable from the room.

Two things are held here, and either one alone would have prevented it:
sanitise every field, and never let this method raise.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from agent import loop as bob_loop
from agent.loop import REDUCED_KEY, ConversationLog, _answer_payload


class _Unserialisable:
    """A type `_json_safe` has never heard of."""


DECIMAL_BLOCK = [{"kind": "figure", "seq": 0, "value": Decimal("1.5")}]
WHEN = datetime(2026, 9, 19, 1, 15)


# ---------------------------------------------------------------------------
# Every field, not just the charts
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("field,value", [
    ("charted", [{"seq": 0, "tool": "get_sales", "arguments": {},
                  "rows": [{"v": Decimal("1.5")}], "meta": {}}]),
    ("calls", [{"seq": 0, "tool": "get_sales", "arguments": {"d": Decimal("2")}}]),
    ("page_context", {"page_id": "p1", "read_at": WHEN}),
    ("reading", {"claim": "sales fell", "at": WHEN}),
    ("actions", [{"kind": "order", "cost": Decimal("10")}]),
    ("composition", DECIMAL_BLOCK),
    ("default_composition", DECIMAL_BLOCK),
])
def test_a_decimal_or_a_datetime_anywhere_in_the_payload_still_stores(field, value):
    """
    EVERY field, because the asymmetry is what caused this. `charted` was safe
    and the other six were not, and which one carries a Decimal on a given turn
    is not something anybody can predict.
    """
    kwargs = {"charted": None, "calls": None}
    kwargs[field] = value
    stored = _answer_payload(**kwargs)
    assert stored is not None
    back = json.loads(stored)
    assert REDUCED_KEY not in back, "nothing had to be dropped"
    # And the value survives as a number or a string, never as a repr.
    assert "Decimal(" not in stored
    assert "datetime.datetime(" not in stored


def test_the_composition_keeps_his_blocks_and_the_default_apart():
    stored = _answer_payload(None, None, composition=DECIMAL_BLOCK,
                             default_composition=DECIMAL_BLOCK)
    composition = json.loads(stored)["composition"]
    # P1.b: merging them would make the machine's shapes indistinguishable
    # from his on reload.
    assert composition["blocks"] == [{"kind": "figure", "seq": 0, "value": 1.5}]
    assert composition["default_blocks"] == composition["blocks"]


def test_nothing_to_carry_is_still_no_payload():
    assert _answer_payload(None, None) is None
    assert _answer_payload([], [], None, None, None, None, None) is None


# ---------------------------------------------------------------------------
# And if something still will not serialise
# ---------------------------------------------------------------------------

def test_an_unknown_type_costs_its_own_field_and_not_the_thread():
    """
    A type the sanitiser does not know is a bug to fix. It is NOT a reason to
    lose the answer post, because without the post there is no address to
    return to and the whole conversation goes on the next refresh.
    """
    stored = _answer_payload(
        charted=[{"seq": 0, "tool": "get_sales", "arguments": {}, "rows": [{"a": 1}], "meta": {}}],
        calls=None,
        actions=[{"kind": "order", "what": _Unserialisable()}],
    )
    back = json.loads(stored)
    assert back["charted"], "what could be stored was stored"
    assert "actions" not in back
    assert back[REDUCED_KEY]["dropped"] == ["actions"]
    assert "whole thread" in back[REDUCED_KEY]["why"]


def test_a_payload_that_is_entirely_unserialisable_still_writes_something():
    stored = _answer_payload(charted=None, calls=None, actions=[_Unserialisable()])
    back = json.loads(stored)
    assert back[REDUCED_KEY]["dropped"] == ["actions"]


# ---------------------------------------------------------------------------
# And the method itself may never raise
# ---------------------------------------------------------------------------

def _log() -> ConversationLog:
    log = ConversationLog(thread_id="t-1")
    assert not log.enabled, "no log url in a pure test, so nothing connects"
    return log


def test_posts_records_a_build_failure_instead_of_raising(monkeypatch):
    """
    The second guard, and the one that makes the first one belt-and-braces.
    `_exec` has always swallowed a failed STATEMENT; nothing swallowed a
    failure while BUILDING one, which is where the raise came from.
    """
    log = _log()

    def explode(**_kw):
        raise TypeError("Object of type Decimal is not JSON serializable")

    monkeypatch.setattr(ConversationLog, "_posts", lambda self, **kw: explode(**kw))

    log.posts(user_id="ice", asked_at=WHEN, question="q", final_answer="a")

    assert log.errors and "Decimal" in log.errors[0]


def test_a_whole_turn_logs_without_raising_whatever_it_carries():
    log = _log()
    log.posts(
        user_id="ice", asked_at=WHEN, question="How are our products doing?",
        final_answer="The catalogue is not softening.",
        charted=[{"seq": 0, "tool": "get_sales", "arguments": {},
                  "rows": [{"v": Decimal("1.5")}], "meta": {"read_at": WHEN}}],
        calls=[{"seq": 0, "tool": "get_sales", "arguments": {}}],
        composition=DECIMAL_BLOCK, default_composition=DECIMAL_BLOCK,
        reading={"claim": "x", "at": WHEN},
        actions=[{"kind": "order", "cost": Decimal("10")}],
        page_context={"page_id": "p1", "read_at": WHEN},
        receipts={"read_at": WHEN}, notices=[], desk=None, parent_id=None,
    )
    assert log.errors == []


def test_a_question_with_no_answer_writes_only_the_question():
    """
    A crashed turn is a question nobody answered, which is true and worth
    seeing — not an empty answer implying Bob said nothing.
    """
    log = _log()
    log.posts(user_id="ice", asked_at=WHEN, question="q", final_answer=None)
    assert log.errors == []


# ---------------------------------------------------------------------------
# The chain that turned a lost chart into a lost conversation
# ---------------------------------------------------------------------------

def test_the_post_frame_is_what_the_browser_navigates_on():
    """
    Held by reading, because the two halves are in different languages. The
    loop emits `post` with the thread id only AFTER the posts are written; the
    room sets the address only from that frame. Neither may quietly start
    trusting the earlier `start` frame instead — that is where "That thread
    isn't available." came from — and neither may stop emitting it, which is
    what took the conversation this time.
    """
    from pathlib import Path
    loop_src = Path(bob_loop.__file__).read_text(encoding="utf-8")
    assert 'yield _sse("post", {' in loop_src
    assert '"answer_post_id": answer_post if answer else None' in loop_src

    room = Path(__file__).resolve().parents[1] / "frontend/src/hooks/useBobStream.ts"
    stream = room.read_text(encoding="utf-8")
    assert "case 'post':" in stream
    assert "setStoredThread(data.thread_id)" in stream


# ---------------------------------------------------------------------------
# The arrangement reaches the post (P6.j, 2026-09-21)
# ---------------------------------------------------------------------------

def test_the_post_carries_the_page_he_laid_out():
    """
    `posts()` has taken an `arrangement` since P3.p and never passed it on:
    `_posts` called `_answer_payload` with seven positional arguments and
    stopped, so `arrangement` defaulted to None on every turn ever logged. The
    page was right live and the packing came back on every reopen — the board
    the owner reopened on 2026-09-21, twelve blocks drawn over one another.
    """
    tree = {"layout": "stack", "children": [{"block": "a"}, {"next": True}]}
    rows: list[tuple] = []
    log = bob_loop.ConversationLog()
    log._exec = lambda sql, params: rows.append((sql, params))    # noqa: SLF001
    log._posts(                                                   # noqa: SLF001
        user_id="owner", asked_at=datetime(2026, 9, 21, tzinfo=timezone.utc),
        question="how are we doing", final_answer="Down on the week.",
        composition=[{"kind": "figure", "key": "a", "seq": 0}],
        arrangement=tree,
    )
    answer = [p for sql, p in rows if "george.posts" in sql][-1]
    payload = json.loads(next(x for x in answer if isinstance(x, str) and '"composition"' in x))
    assert payload["composition"]["arrangement"] == tree

