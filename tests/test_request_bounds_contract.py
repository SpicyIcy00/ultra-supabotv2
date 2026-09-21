"""
WHAT THE CLIENT MAY SEND AND WHAT THE SERVER TAKES ARE ONE NUMBER (P11).

2026-09-21: the first question after a deploy came back "Bob returned 422".
`/bob/ask` raises only 400 and 404 of its own, so a 422 is Pydantic refusing
the request — and the two bounds that could refuse it had both been widened on
the client alone:

  * P7 stopped counting a figure that lives in a sentence, and a control
    carried on a figure, against `composition.max_objects` in the room; the
    server's `desk.board` still took `max_objects`.
  * P6.j stopped counting `compose` against the convergence cap, so a turn can
    make more tool calls than the 20 the server takes per history turn.

Neither is visible to the person and neither can be undone by them: the next
question simply fails. So the numbers are held together here, across the two
languages, the way `beside.test.ts` holds the composition's arithmetic against
the stylesheet.
"""
from __future__ import annotations

import re
from pathlib import Path

from tools._common import load_defs, req

ROOM = Path(__file__).resolve().parents[1] / "frontend" / "src" / "room"
HOOKS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "hooks"
ROUTE = Path(__file__).resolve().parents[1] / "backend" / "app" / "api" / "v1" / "routes" / "bob.py"


def _number(text: str, name: str) -> int:
    m = re.search(rf"{name}\s*=\s*([0-9]+)\s*;", text)
    assert m, f"{name} is not declared as a number"
    return int(m.group(1))


def test_the_room_draws_no_more_objects_than_it_says_it_does() -> None:
    board = (ROOM / "board.ts").read_text(encoding="utf-8")
    defs = load_defs()
    assert _number(board, "MAX_OBJECTS") == int(req(defs, "composition.max_objects"))


def test_the_board_the_room_may_send_is_the_board_the_server_takes() -> None:
    board = (ROOM / "board.ts").read_text(encoding="utf-8")
    defs = load_defs()
    in_words = int(req(defs, "composition.arrangement.refs.max_in_words"))
    # The room's own ceiling: what it draws, plus what a page holds in its words.
    m = re.search(r"MAX_BOARD_SENT\s*=\s*MAX_OBJECTS\s*\+\s*([0-9]+)\s*;", board)
    assert m, "board.ts does not bound what it sends"
    assert int(m.group(1)) == in_words

    route = ROUTE.read_text(encoding="utf-8")
    assert 'composition.arrangement.refs.max_in_words' in route, (
        "the server's board bound does not know about a figure held in words")

    from backend.app.api.v1.routes import bob as route_module  # noqa: PLC0415
    assert route_module._BOARD_MAX == int(req(defs, "composition.max_objects")) + in_words


def test_the_room_sends_no_more_calls_a_turn_than_the_server_takes() -> None:
    stream = (HOOKS / "useBobStream.ts").read_text(encoding="utf-8")
    route = ROUTE.read_text(encoding="utf-8")
    server = re.search(r"tool_calls: List\[HistoryCall\][^\n]*max_length=([0-9]+)", route)
    assert server, "the server does not bound a history turn's calls"
    assert _number(stream, "MAX_HISTORY_CALLS") == int(server.group(1))
    # And it is applied where the history is built, not merely declared.
    assert ".slice(-MAX_HISTORY_CALLS)" in stream


def test_a_refusal_says_what_the_server_said() -> None:
    # "Bob returned 422" and nothing else cost an afternoon.
    stream = (HOOKS / "useBobStream.ts").read_text(encoding="utf-8")
    assert "res.clone().json()" in stream
    assert "detail" in stream
