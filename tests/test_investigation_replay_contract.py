"""
Replay — a finished ladder, walked. P2.e (2026-09-15).

The owner's feature 9 is that George decides where to look next instead of
being told every query. This is how that decision is audited afterwards: the
steps of the thread in the order they ran, one at a time, each showing what
came back.

WHAT THIS HOLDS.

  1. The definitions. `surface.desk.work.replay` names what a rung shows, that
     it walks EVERY step rather than every read, that it runs nothing, and the
     four states it draws.

  2. It costs nothing, and that is structural. The walk makes no request: the
     component takes turns and a callback and reaches for no client, no api
     module and no fetch. Architecture rule 5 is kept by there being nothing
     to plan — the list is what happened.

  3. It is not the other replay. `surface.desk.replay` is the ACT that re-runs
     one stored read with one argument changed, over a query; this view runs
     nothing. Both names stay, and each says so.

  4. No code on screen, the rule Behind it has: a read is drawn by what it IS
     in words and by the receipts the tool wrote, never by the call.

  5. A row carries its time (UI rule 6). The walk draws figures — the rows
     themselves, which no other work surface does — so it is the one place
     that has to refuse to draw what it is holding when the record kept no
     snapshot_timestamp.

  6. One table shape. The board draws a read as a table and the walk draws the
     same read at the rung that fetched it; two column pickers would let one
     disagree with the other on one screen.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytest.importorskip("yaml")

from tools._common import load_defs  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROOM = _ROOT / "frontend" / "src" / "room"
_REPLAY_TSX = _ROOM / "Replay.tsx"
_WORK_TS = _ROOM / "work.ts"
_DATA_TS = _ROOM / "data.ts"
_MARKS_TSX = _ROOM / "marks.tsx"
_HEADER_TSX = _ROOM / "ThreadHeader.tsx"
_ROOM_TSX = _ROOM / "Room.tsx"
_KEEPING_TS = _ROOM / "keeping.ts"

DEFS = load_defs()
WALK = DEFS["surface"]["desk"]["work"]["replay"]


# ----------------------------------------------------------------- 1. the yaml

def test_it_walks_every_step_and_not_every_read():
    """
    The difference from Behind it, and the reason both exist. A compose read
    nothing and a pin read nothing; both are things he DID, and an account
    that left them out would say the workspace arranged itself.
    """
    assert WALK["scope"] == "thread"
    assert WALK["walks"] == "every_step"


def test_a_rung_shows_what_came_back_and_how_long_it_took():
    """The card's own words: each step's rows, receipts, time."""
    assert WALK["per_step"] == ["words", "rows", "receipts", "duration_ms"]
    # The ROWS, not a count of them — the count is what the work line and
    # Behind it already show, and it is not evidence.
    assert WALK["shows"] == "rows"


def test_it_runs_nothing_and_asks_nothing():
    """
    No planner, no re-read, no model turn (architecture rule 5). A finished
    ladder is walked out of the record, which is the whole reason it is free.
    """
    assert WALK["reruns_nothing"] is True
    assert WALK["model_calls"] == 0


def test_four_facts_four_renderings():
    """
    UI rule 8. A read that landed with its rows, one whose rows the record did
    not keep, one that was refused and one still running are four things.
    """
    assert WALK["states"] == ["landed", "rows_not_kept", "declined", "running"]


def test_a_refusal_travels_in_the_tools_own_words():
    assert WALK["refusal"] == "the_tools_own_words"


def test_rows_are_not_drawn_without_the_moment_they_were_read():
    """UI rule 6, and the walk is the one work surface that draws figures."""
    assert WALK["rows_need"] == "snapshot_timestamp"


def test_it_may_never_show_code():
    """The same closed list Behind it carries."""
    assert set(WALK["never"]) == {"tool_names", "tool_arguments", "model_text"}


def test_the_two_replays_each_say_they_are_not_the_other():
    """
    ONE WORD, TWO THINGS, AND BOTH ADMIT IT. `surface.desk.replay` is the act
    that re-runs a stored read with one argument changed — a query, a second,
    a scope somebody moved. `surface.desk.work.replay` is this view, which
    runs nothing. The hazard is a session reading one and building the other,
    so each block points at its twin.
    """
    text = (_ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8")
    act = DEFS["surface"]["desk"]["replay"]
    assert act["model_consulted"] is False
    # The act runs a call; the view does not. That is the whole distinction.
    assert "max_calls" in act and "reruns_nothing" not in act
    assert "NOT `work.replay`, WHICH IS A DIFFERENT THING WITH THE SAME NAME" in text
    assert "NOT THE SAME THING AS `surface.desk.replay` EITHER" in text


# --------------------------------------------------------- 2. it costs nothing

def test_the_walk_reaches_for_no_network():
    """
    Structural, not careful. The component takes the turns and a way back and
    holds nothing else: a query client, an api module or a bare fetch on this
    path would make walking a finished investigation cost a request.
    """
    source = _REPLAY_TSX.read_text(encoding="utf-8")
    for reached in ("useQuery", "useMutation", "fetch(", "axios",
                    "Api'", "api'", "askGeorge", "/api/"):
        assert reached not in source, f"Replay.tsx reaches for {reached}"


def test_the_prompt_is_not_touched_by_this_card():
    """
    `_desk_section` reads `direct_manipulation` and `selection` and nothing
    else under `surface.desk`, so a `work.replay` block cannot reach the
    model — which is why this card ran no eval.
    """
    loop = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    section = loop[loop.index("def _desk_section"):loop.index("DESK_SECTION = ")]
    assert "work" not in re.findall(r'req\(desk, "([a-z_.]+)"\)', section)


def test_every_field_a_rung_draws_already_arrives():
    """
    Nothing was added to any frame for this card. The call's own clock and its
    error are on the tool_result frame and in george.tool_calls; the rows come
    off the answer post's `charted`, which the loop has written since
    2026-09-07 and `restoreFromPosts` already puts back.
    """
    loop = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    assert '"duration_ms": ms' in loop
    assert '"rows": full_rows if rows_complete else []' in loop
    chat = (_ROOT / "backend" / "app" / "services" / "chat_history.py").read_text(encoding="utf-8")
    assert '"duration_ms": int(c.get("duration_ms") or 0)' in chat
    assert '"error": c.get("error")' in chat
    restore = (_ROOM / "restore.ts").read_text(encoding="utf-8")
    assert "payload.charted" in restore


# ------------------------------------------------------- 3. no code on screen

def test_the_walk_draws_no_tool_name_and_no_argument():
    """
    The obvious build is the call list with its arguments, and that is the one
    thing this view may not be. What he did is in words; what it was scoped to
    is in the receipts, where the definitions wrote it.
    """
    source = _REPLAY_TSX.read_text(encoding="utf-8")
    assert ".arguments" not in source
    assert "{rung.tool}" not in source and "rung.tool" not in source
    assert "rung.words" in source


def test_the_walk_draws_no_model_text():
    """
    Its channels are the tool's: rows, meta, and the tool's own refusal. None
    of the model's — `text`, `reading.claim`, `claim`, a block's `note`.
    """
    source = _REPLAY_TSX.read_text(encoding="utf-8")
    for channel in ("turn.text", "reading.claim", ".note", "narration"):
        assert channel not in source, f"Replay.tsx draws {channel}"


# ---------------------------------------------------- 4. a figure has a time

def test_the_rows_are_withheld_when_the_record_kept_no_snapshot():
    """
    UI rule 6 has no exemption for evidence. `drawable` is the gate and it is
    the only way into the table, so there is no second path that draws rows
    without asking.
    """
    source = _REPLAY_TSX.read_text(encoding="utf-8")
    gate = source[source.index("export function drawable"):]
    assert "meta?.snapshot_timestamp" in gate.split("}")[0]
    # One caller, one gate: the table is drawn behind `shows` and nowhere else.
    assert source.count("<Brought") == 1
    assert "shows && <Brought" in source


def test_a_count_of_rows_is_the_tools_own_when_the_rows_are_not_here():
    """
    THE DEFECT THIS CARD FOUND. The loop sends a read's rows all or none: past
    MAX_ROWS_TO_CLIENT the frame carries `rows: []` with `rows_complete:
    false`. Counting the array reported **0 rows** for a read that returned two
    hundred — a figure on the screen that nothing measured — in the live work
    trail and in Behind it, both of which have been drawing it since P1.k.
    """
    work = _WORK_TS.read_text(encoding="utf-8")
    counter = work[work.index("function rows(result"):work.index("function kept(result")]
    assert "rows_complete !== false" in counter
    assert "result.row_count ?? null" in counter


# ------------------------------------------------------- 5. one of each thing

def test_one_table_shape_for_the_board_and_the_walk():
    """
    A column that is a caption on the board is a caption in the walk. Two
    pickers would put the same read on one screen twice, read two ways.
    """
    assert "export function tableShape" in _DATA_TS.read_text(encoding="utf-8")
    for path in (_MARKS_TSX, _REPLAY_TSX):
        assert "tableShape(" in path.read_text(encoding="utf-8"), f"{path.name}"


def test_one_pairing_of_answers_to_the_questions_that_caused_them():
    """
    The page a thread would be names its sections by the question its turn
    answered; the walk heads its rungs by the same one. One function.
    """
    work = _WORK_TS.read_text(encoding="utf-8")
    assert "export function asked(" in work
    assert "asked(turns)" in _KEEPING_TS.read_text(encoding="utf-8")
    assert "function paired(" not in _KEEPING_TS.read_text(encoding="utf-8")


def test_the_thread_has_a_fourth_view_and_the_room_draws_it():
    header = _HEADER_TSX.read_text(encoding="utf-8")
    assert "'talk' | 'behind' | 'replay' | 'page'" in header
    assert "replay: 'Replay'" in header
    room = _ROOM_TSX.read_text(encoding="utf-8")
    assert "<Replay" in room
    # A view, not a panel: it stands where Behind it and Page stand, which is
    # instead of the conversation rather than under it.
    assert "view === 'replay'" in room
