"""
Visible work, for free. P1.k (2026-09-14).

What the frames already carried, drawn: the Working line as a step list with a
result and a duration per step, and a figure in the claim that finds its read.

THE LINE ABOVE THE CLAIM AND BEHIND IT WENT ON 2026-09-17, at the owner's word
("we also dont need anything of these anymroe"), with the Replay and Page views
and the thread header. Every figure's receipts open in place under it, and a
figure in his words scrolls to the figure it came from.

WHAT THIS HOLDS.

  1. The definitions. `surface.desk.work` names what a step carries and how
     a figure in the claim is matched.

  2. It costs nothing. Every field these surfaces read is already on a frame
     the loop sends: `duration_ms` on the tool result, `duration_ms` on the
     `done` frame, the notices, the meta. Nothing was added to the model's
     schema and nothing was added to the prompt.

  3. The two matchers agree. The client places a figure in the claim against
     the numbers the reads returned; the server matches prose numerals against
     the same numbers in the restatement gate, in the caveat slot and in the
     evals. A looser client would underline what the server calls ungrounded.
     The constants are compared here, in both files, by value.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytest.importorskip("yaml")

from tools._common import load_defs  # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_ROOM = _ROOT / "frontend" / "src" / "room"
_WORK_TS = _ROOM / "work.ts"
_FIGURES_TS = _ROOM / "figures.ts"
_WORKING_TSX = _ROOM / "Working.tsx"
_READING_TSX = _ROOM / "Reading.tsx"
_ROOM_TSX = _ROOM / "Room.tsx"

DEFS = load_defs()
WORK = DEFS["surface"]["desk"]["work"]


# ----------------------------------------------------------------- 1. the yaml

def test_a_step_carries_its_result_and_its_own_clock():
    steps = WORK["steps"]
    assert steps["per_step"] == ["words", "result", "duration_ms"]
    assert steps["opens"] == "receipts"
    # A read the loop served out of the turn's own record was not work.
    assert steps["excludes"] == "duplicate_calls"


def test_an_unmatched_figure_is_drawn_as_he_wrote_it():
    link = WORK["figure_link"]
    assert link["matches"] == "returned_numbers"
    assert link["rule"] == "agent.prose"
    assert link["unmatched"] == "drawn_as_written"


# --------------------------------------------------------- 2. it costs nothing

def test_every_field_the_work_surfaces_read_is_already_on_a_frame():
    """
    The card is free because nothing had to be asked for. `duration_ms` on the
    tool result and on `done`, the notices, the meta — the loop has sent all of
    them since P0.3, and this fails if one is dropped from the frames.
    """
    loop = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    assert '"duration_ms"' in loop
    assert '_sse("notice"' in loop
    types = (_ROOT / "frontend" / "src" / "types" / "bob.ts").read_text(encoding="utf-8")
    assert "duration_ms: number;" in types, "the tool result's own clock"
    assert "duration_ms?: number;" in types, "the turn's clock on the done frame"


def test_the_prompt_is_not_touched_by_this_card():
    """
    `_desk_section` reads `direct_manipulation` and `selection` and nothing
    else under `surface.desk`, so a `work` block cannot reach the model — which
    is why this card ran no eval.
    """
    loop = (_ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
    section = loop[loop.index("def _desk_section"):loop.index("DESK_SECTION = ")]
    assert "work" not in re.findall(r'req\(desk, "([a-z_.]+)"\)', section)


# ------------------------------------------------------- 3. the two matchers

def _number(source: str, name: str) -> str:
    m = re.search(rf"{name}\s*[:=]\s*([0-9]+)", source)
    assert m, f"{name} not found"
    return m.group(1)


def test_the_client_matcher_mirrors_the_server_matcher():
    """
    THE SAME RULE, BOTH SIDES. The server decides whether a prose numeral is a
    figure a tool returned in three places — the restatement gate, the caveat
    slot, the evals. A client that placed figures by a looser rule would
    underline numerals the server calls ungrounded and leave grounded ones
    bare, and the disagreement would be invisible in both.
    """
    prose = (_ROOT / "agent" / "prose.py").read_text(encoding="utf-8")
    figures = _FIGURES_TS.read_text(encoding="utf-8")

    assert _number(prose, "PRESENTATION_MAX") == _number(figures, "PRESENTATION_MAX")
    # The years excused as years, not as business figures.
    years = set(re.findall(r"20\d\d", re.search(r"n in \(([^)]*)\)", prose).group(1)))
    assert years == set(re.findall(r"20\d\d", re.search(
        r"YEARS = new Set\(\[([^\]]*)\]", figures).group(1)))
    # Half a unit of the last digit written, and the same epsilon.
    assert "0.5 * 10 ** (-decimals) + 1e-9" in prose
    assert "0.5 * 10 ** -decimals + 1e-9" in figures


def test_a_figure_with_no_read_behind_it_gets_no_underline():
    """
    An underline is a promise that there is something behind it, and it is
    still only made for a figure a read holds — CLAUDE.md rule 9 kept:
    production does not check the answer's numerals against the rows, and this
    does not either.

    WHAT CHANGED ON 2026-09-15 (P2.b): a numeral no call holds used to be
    dropped back into the prose and drawn identically to the words around it,
    so the screen said nothing at all about the difference between a figure you
    can open and one you cannot. It now comes back as a piece of its own,
    marked `unplaced`, never carrying a `seq` — so the reading can draw it
    quietly instead of invisibly, and the door is still only on the placed one.
    """
    figures = _FIGURES_TS.read_text(encoding="utf-8")
    block = figures[figures.index("export function placeFigures"):]
    assert "{ text: span, unplaced: true }" in block
    # The two are alternatives of one expression: nothing can be both.
    assert "? { text: span, seq: call.seq, index: numbered.get(call.seq) }" in block
    reading = (_ROOM / "Reading.tsx").read_text(encoding="utf-8")
    # The door, and only the door, is a button.
    assert 'className="r-figure"' in reading
    assert 'className="r-figure-bare"' in reading
    css = (_ROOM / "room.css").read_text(encoding="utf-8")
    bare = css[css.index(".r-figure-bare"):css.index(".r-figure-bare") + 120]
    assert "text-decoration" not in bare


# ------------------------------------------------------ 4. no code on screen

def test_the_work_surfaces_draw_no_model_text():
    """
    Nothing model-written appears in a mono line, which is the card's own
    done-when. The model's channels are `text`, `reading.claim`, `claim` and
    `note` on a block; none of them is read by either work surface.
    """
    for path in (_WORK_TS, _WORKING_TSX):
        source = path.read_text(encoding="utf-8")
        for channel in ("turn.text", "reading.claim", ".note", "narration"):
            assert channel not in source, f"{path.name} draws {channel}"




def test_the_views_that_went_stay_gone():
    """2026-09-17, the owner: "we also dont need anything of these anymroe" —
    the thread header, its four views and the work line. A file coming back is
    a decision reversed without anybody making it."""
    for gone in ("BehindIt.tsx", "Replay.tsx", "ThreadHeader.tsx", "ThreadPage.tsx"):
        assert not (_ROOM / gone).exists(), f"{gone} is back"
    room = _ROOM_TSX.read_text(encoding="utf-8")
    for tag in ("<WorkLine", "<BehindIt", "<Replay", "<ThreadHeader", "<ThreadPage"):
        assert tag not in room, f"Room.tsx draws {tag}"
    # A figure in his words still finds its read — on the board now.
    assert "onFigure={showFigure}" in room
    assert "placeFigures" in _READING_TSX.read_text(encoding="utf-8")
