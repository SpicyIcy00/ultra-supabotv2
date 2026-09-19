"""
A stance is drawn as a word, and the word is in the definitions.

WHAT WAS WRONG. The memory screen printed each view's stance as its enum,
uppercased by CSS: `NEEDS_ATTENTION`, `MEANS`. Found on the P2S close frame
`memory-1920-open-room.png` and open in the dogfood log since 2026-09-18. It is
the tool's key doing a label's job, which UI rule 4 forbids — raw diagnostics
never reach the answer — and the design says *Noticed*, *Checked*, *Still open*.

WHERE THE WORD LIVES. `judgment.stance_words` in metrics.yaml, because it is
what the stance MEANS and CLAUDE.md rule 3 says meaning lives there. Not in the
client, which would put the vocabulary in two places and let them drift; and
not invented at render time, which is how a stance nobody named would quietly
acquire a word nobody chose.

A STANCE WITH NO WORD IS DRAWN AS ITS KEY. Visibly wrong, and this test fails
first — which is the point of it.
"""

from __future__ import annotations

import re
from pathlib import Path

from tools._common import load_defs, req

REPO = Path(__file__).resolve().parents[1]


def test_every_stance_has_a_word_and_every_word_has_a_stance():
    defs = load_defs()
    stances = set(req(defs, "judgment.stances").keys())
    words = req(defs, "judgment.stance_words")
    assert set(words) == stances, (
        f"unnamed: {sorted(stances - set(words))}, "
        f"named but not a stance: {sorted(set(words) - stances)}"
    )


def test_no_word_is_the_key_it_names():
    """`needs_attention: "needs_attention"` would pass the test above and fix nothing."""
    for stance, word in req(load_defs(), "judgment.stance_words").items():
        assert word != stance
        assert "_" not in word, f"{stance} is named {word!r}, which is still a key"
        assert word[:1].isupper(), f"{stance} is named {word!r}, which is not a word"


def test_the_design_words_are_the_ones_used():
    """
    The three the design names, so a later edit cannot quietly reword the
    screen the close was checked against.
    """
    words = req(load_defs(), "judgment.stance_words")
    assert words["needs_attention"] == "Noticed"
    assert words["unremarkable"] == "Checked"
    assert words["unexplained"] == "Still open"


def test_the_memory_read_carries_the_word_beside_the_stance():
    source = (REPO / "backend/app/services/self_reader.py").read_text(encoding="utf-8")
    assert '"stance_said"' in source
    assert "judgment.stance_words" in source or "stance_words" in source


def test_the_surface_draws_the_word_and_falls_back_to_the_key():
    tiles = (REPO / "frontend/src/room/tiles.tsx").read_text(encoding="utf-8")
    assert re.search(r"row\.stance_said\s*\?\?\s*row\.stance", tiles), \
        "the room draws the stance without preferring its word"

    css = (REPO / "frontend/src/room/room.css").read_text(encoding="utf-8")
    block = css.split(".r-belief-stance {")[1].split("}")[0]
    assert "text-transform: uppercase" not in block, \
        "the stance is uppercased, which turns a word back into a label"
