"""
THE LAYOUT STANDS, AND THE TOOL NOW SAYS SO (2026-09-21).

`compose` told the model: *"Optional; leave it out and it is packed."* The loop
has never done that — it keeps the arrangement for the rest of the turn, "exactly
as a block he does not mention stays". So the two ends disagreed, and the model
believed the tool.

WHAT THAT COST, measured on the six broad turns of 2026-09-21 (george.tool_calls,
`compose` arguments, bytes of JSON):

    09-21 07:38   arrangement 2,818   blocks 1,291     (2.2x the figures)
    09-21 09:03   arrangement 3,073   blocks 1,804
    09-21 09:34   arrangement 3,543   blocks 2,714  -> recompose 2,794 / 657
    09-21 10:56   arrangement 4,722   blocks 1,867  -> recompose 4,115 / 891

The arrangement is the largest single thing in a compose, and most broad turns
compose two or three times — 09:34 composed three, re-emitting the whole tree
each time to protect a layout that was never at risk. A broad turn's whole
answer is ~9,700 output tokens and takes 47-85 s in ONE model call; the layout
re-sends are a sixth of it, bought for nothing.

Instruction is the right instrument HERE, and only here: nothing can refuse
tokens after they are generated, so the loop cannot enforce this the way it
enforces the page gate. What it can do is stop lying about it, and count what a
re-send still costs (`arrangement_resent`) so the next session reads a number.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from agent import compose

ROOT = Path(__file__).resolve().parents[1]
LOOP = (ROOT / "agent" / "loop.py").read_text(encoding="utf-8")
SWEEP = (ROOT / "ops" / "sweep_gaps.py").read_text(encoding="utf-8")
SAID = compose.compose.__doc__ or ""
ARG = next(ln for ln in SAID.splitlines() if ln.strip().startswith("arrangement:"))


# ------------------------------------------------------- what the tool now says

def test_the_tool_no_longer_promises_a_packing_that_never_happens():
    # The exact sentence that caused it. Its absence is the fix.
    assert "leave it out and it is packed" not in SAID
    # And the case where packing IS true — nothing given yet — is still stated,
    # because a first compose with no arrangement really is packed.
    assert "packed" in ARG


def test_the_tool_says_the_layout_stands_for_the_turn():
    low = ARG.lower()
    assert "stands" in low
    assert "later call" in low, "it has to say what a SECOND compose should do"


# ------------------------------------------------- what the loop actually does

def test_the_loop_only_replaces_the_layout_when_one_is_sent():
    """The keep is a real branch, not a comment about one."""
    assert re.search(r'sent\s*=\s*result\["meta"\]\.get\("arrangement"\)', LOOP)
    assert re.search(r"if sent:\s*\n", LOOP)
    assert re.search(r"arrangement_recorded\s*=\s*sent", LOOP)
    # Never unconditionally, which would drop the standing layout on a
    # recompose that sent none — the bug this whole file is about, inverted.
    assert 'arrangement_recorded = result["meta"]["arrangement"]' not in LOOP


def test_a_layout_re_sent_unchanged_is_recorded():
    assert 'log.gap("arrangement_resent"' in LOOP
    assert "arrangement_resent" in SWEEP, "an unregistered kind breaks the sweep"


# ------------------------------------------------- and the tool's own behaviour

@pytest.fixture(scope="module")
def defs():
    from tools._common import load_defs
    return load_defs()


def _rows():
    return {1: {"tool": "get_sales", "rows": [{"store": "Magnolia", "net_sales": 10.0}],
                "meta": {"source_table": "new_transactions", "filters_applied": [],
                         "snapshot_timestamp": "2026-09-21T00:00:00+08:00"}}}


def test_a_compose_that_sends_no_arrangement_returns_none_so_the_loop_keeps_the_old(defs):
    """
    The loop's keep only works because the tool reports nothing rather than a
    packed default. If `meta.arrangement` came back filled on every call, the
    standing layout would be overwritten by a pack on every recompose.
    """
    out = compose.compose(
        blocks=[{"key": "shops", "kind": "figure", "seq": 1, "weight": "lead",
                 "claim": "Magnolia took the most"}],
        calls=_rows(), defs=defs, question="how are the stores?")
    assert not out["meta"].get("arrangement")


def test_a_compose_that_sends_one_returns_it(defs):
    tree = {"layout": "stack", "children": [
        {"lede": "Magnolia took the most this week."}, {"block": "shops"}]}
    out = compose.compose(
        blocks=[{"key": "shops", "kind": "figure", "seq": 1, "weight": "lead",
                 "claim": "Magnolia took the most"}],
        arrangement=tree, calls=_rows(), defs=defs, question="how are the stores?")
    got = out["meta"].get("arrangement")
    assert got and compose.is_a_document(got)
