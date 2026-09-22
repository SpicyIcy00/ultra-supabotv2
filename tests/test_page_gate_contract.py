"""
THE PAGE IS CHECKED BEFORE THE TURN MAY END (P14, 2026-09-21).

His live page of 17:05 composed nine figures and put ONE on it. The room drew the
other eight after the plan and the owner's word for it was *"wtf happened here
its just all wrong"*. Every departure had been named on `coerced` — in the result
of the last call of the turn, which he never reads, because composing was the last
thing he did.

Instruction had already failed twice. agent/prose.py says why, about the same class
of problem: *"The 8,623-word prompt asked for it in three places and got 22%; the
1,793-word prompt asked once and got 19.5%. Words do not move it, so the loop
enforces it."* So the page joins every other rule here — measured, one corrective
round, then it stands.

The gate is deliberately narrow: it fires only where he wrote a page AS a page (a
lede or a head) and left two or more of HIS OWN figures off it. A block the machine
composed is not his. One forgotten block is a slip. A good page never costs a round.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from agent import compose
from tools._common import load_defs, req

LOOP = (Path(__file__).resolve().parents[1] / "agent" / "loop.py").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def voc(defs):
    return compose.vocabulary(defs)


def _blocks(*keys, default=()):
    return [{"key": k, "kind": "figure", **({"default": True} if k in default else {})}
            for k in keys]


# ---------------------------------------------------------------- what a page is


def test_a_page_written_as_a_page_is_one(voc):
    assert compose.is_a_document({"layout": "stack", "children": [{"lede": "We took less."}]})
    assert compose.is_a_document({"layout": "stack", "children": [
        {"layout": "row", "children": [{"head": "Three shops fall"}]}]})


def test_an_arrangement_that_only_places_blocks_is_not_a_document(voc):
    # It is a layout, and `left_off` has nothing to say about it: the room lays
    # a board out for him (pageOf) and nothing has been left anywhere.
    tree = {"layout": "stack", "children": [{"block": "a"}, {"block": "b"}]}
    assert not compose.is_a_document(tree)
    assert compose.left_off(tree, _blocks("a", "b", "c"), voc) == []


# ---------------------------------------------------------------- what it measures


def test_it_names_the_figures_he_left_off(voc):
    tree = {"layout": "stack", "children": [
        {"lede": "We took less."}, {"head": "The shops"}, {"block": "shops"}]}
    assert compose.left_off(tree, _blocks("shops", "days", "movers"), voc) == ["days", "movers"]


def test_a_figure_inside_a_sentence_is_on_the_page(voc):
    # It is in the sentence; that is where he put it.
    tree = {"layout": "stack", "children": [{"lede": "We took {net}{net.change} last week."}]}
    assert compose.left_off(tree, _blocks("net"), voc) == []


def test_a_control_carried_on_a_figure_is_on_the_page(voc):
    tree = {"layout": "stack", "children": [
        {"head": "The shops"}, {"block": "shops", "control": "window"}]}
    assert compose.left_off(tree, _blocks("shops", "window"), voc) == []


def test_a_block_the_machine_composed_is_not_his_to_place(voc):
    # agent/default_composition.py draws the reads he never wrote up. Counting
    # them would fire the gate on every turn that read more than it said.
    tree = {"layout": "stack", "children": [{"lede": "We took less."}, {"block": "shops"}]}
    assert compose.left_off(tree, _blocks("shops", "read-2", default={"read-2"}), voc) == []


def test_it_says_nothing_about_a_page_he_did_not_write(voc):
    assert compose.left_off(None, _blocks("a", "b"), voc) == []
    assert compose.left_off({}, _blocks("a", "b"), voc) == []


def test_it_finds_what_his_own_live_page_left_off(voc):
    """
    The real one, 2026-09-21 17:05, from george.posts — nine figures composed,
    `gh-rose` placed, and `movers-rose` placed but never composed.
    """
    tree = {"layout": "stack", "children": [
        {"lede": "The estate took {estate} last week."},
        {"head": "The fall is transactions"},
        {"say": "Every peso of the gap is traffic through the tills."},
        {"head": "Greenhills"},
        {"block": "gh-rose"},
        {"block": "movers-rose"},
        {"caveat": True},
        {"next": True},
    ]}
    blocks = _blocks("estate", "estate-txn", "estate-atv", "shops", "estate-days",
                     "movers-fell", "gh-txn", "gh-fell", "gh-rose",
                     "read-0", default={"read-0"})
    off = compose.left_off(tree, blocks, voc)
    assert "gh-rose" not in off and "estate" not in off      # placed, and in the lede
    assert set(off) == {"estate-txn", "estate-atv", "shops", "estate-days",
                        "movers-fell", "gh-txn", "gh-fell"}
    assert len(off) >= int(req(load_defs(), "composition.arrangement.gate.min_left_off"))


# ---------------------------------------------------------------- and the loop uses it


def test_the_bound_is_declared_where_every_other_one_is(defs):
    """
    REWRITTEN 2026-09-22 (W1.1, DECISIONS "checks fix; they do not argue" — the
    page gate is named among the decisions reversed that day). It held one
    corrective round: "give the arrangement again, whole". The room already
    draws every block he did not place, before the plan, so the round bought
    nothing a reader could see and cost the dashboard turn one of its six. The
    bound stays declared — at NO rounds — and what is left off is recorded.
    """
    gate = req(defs, "composition.arrangement.gate")
    assert int(req(gate, "max_corrective_turns")) == 0
    # One is a slip; two is a page that forgot its figures.
    assert int(req(gate, "min_left_off")) >= 2


def test_the_turn_may_not_end_on_a_page_that_left_them_off():
    """
    The gate is worth nothing if the turn settles anyway: `rounds.settle` ends a
    turn on a composes-only round that named the claim and wrote the answer, and
    that is exactly the round a forgotten figure arrives in.
    """
    assert "compose.left_off(" in LOOP, "the loop never measures the page"
    assert "compose.is_a_document(" in LOOP, "the gate fires on a board, not only on a page"
    assert "page_left_blocks_off" in LOOP, "the gap is not recorded"
    # The settle condition consults it.
    settle = LOOP[LOOP.index("                settled = True"):]
    before = LOOP[:LOOP.index("                settled = True")]
    assert "not page_held" in before[-600:], "a page that left figures off can still settle"
    assert settle


def test_it_costs_no_round_and_is_still_recorded(defs):
    """
    REWRITTEN 2026-09-22 (W1.1): "one corrective turn at most" became none. The
    measure still runs and records its gap once a turn; the round-buying path
    stays behind `max_page_gate`, which the yaml sets to 0.
    """
    assert "page_gate_turns < max_page_gate" in LOOP
    assert "not max_page_gate" in LOOP, "with no round the gap is still recorded"
    assert LOOP.count('log.gap("page_left_blocks_off"') == 2
