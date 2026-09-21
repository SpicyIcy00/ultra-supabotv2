"""
A LONG THING PRESENT WITHOUT BEING A WALL (P15.a, 2026-09-21).

The design folds the ten zero-lines and the caveat. The page had no disclosure of
any kind, so everything Bob had was shown in full or left out — and the owner's
complaint about his own pages was the wall: *"theres alot of text i think alot of
it is useless."* Absent a fold, his only options were to write less than he knew
or to bury the answer.

A FOLD IS A LAYOUT, NOT A LEAF, so it costs the same `max_nodes` and `max_depth`
as a row and what is inside it is ordinary page. Closed at rest, which is the
whole point: the page's first still frame is the short one.

AND IT MUST SAY WHAT IS INSIDE IT. A fold with no label hides something behind
the word "more", so it is laid out as a stack instead and the departure is named
on `coerced` — the page refuses as little as it can and never refuses the
composition. Its label carries no digit, because a count is the DRAWING's to make
off the children and never a figure he asserted (architecture rule 9).
"""
from __future__ import annotations

import pytest

from agent import compose
from tools._common import load_defs, req


@pytest.fixture(scope="module")
def defs():
    return load_defs()


@pytest.fixture(scope="module")
def voc(defs):
    return compose.vocabulary(defs)


CALLS = {1: {"tool": "get_sales", "rows": [{"store": "A", "net_sales": 10.0}],
             "meta": {"source_table": "new_transactions", "filters_applied": [],
                      "snapshot_timestamp": "2026-09-21T00:00:00+08:00"}}}
BLOCK = [{"key": "shops", "kind": "figure", "seq": 1, "weight": "lead", "claim": "A took most"}]


def _page(fold: dict) -> dict:
    return {"layout": "stack", "children": [{"lede": "Seven shops took less."}, fold]}


def _compose(tree, defs):
    return compose.compose(blocks=list(BLOCK), arrangement=tree, calls=CALLS, defs=defs,
                           question="how are the stores?")["meta"]


def _find(node, layout):
    if not isinstance(node, dict):
        return None
    if node.get("layout") == layout:
        return node
    for kid in node.get("children") or []:
        found = _find(kid, layout)
        if found:
            return found
    return None


# ----------------------------------------------------------------- it exists

def test_the_page_has_a_fold_at_all(voc):
    assert "fold" in (voc["arrangement"].get("extra_layouts") or [])
    assert req(load_defs(), "composition.arrangement.fold.closed_at_rest") is True


def test_a_labelled_fold_stands(defs):
    meta = _compose(_page({"layout": "fold", "label": "the ten lines that sold nothing",
                           "children": [{"say": "Ten traded the week before, none last week."}]}), defs)
    fold = _find(meta["arrangement"], "fold")
    assert fold and fold["label"] == "the ten lines that sold nothing"
    assert len(fold["children"]) == 1


# ------------------------------------------------- and it says what is inside

def test_a_fold_with_no_label_is_a_stack_and_says_so(defs):
    meta = _compose(_page({"layout": "fold",
                           "children": [{"say": "Behind the word 'more'."}]}), defs)
    assert _find(meta["arrangement"], "fold") is None
    assert any("plain label saying what is inside" in c for c in meta.get("coerced") or [])
    # NEVER REFUSED: the words are still on the page, in a stack.
    assert "Behind the word 'more'." in str(meta["arrangement"])


def test_a_label_may_not_assert_a_number(defs):
    # A count is the drawing's, off the children (rule 9). "10 lines" in his
    # label would be a figure in his prose with no receipt.
    meta = _compose(_page({"layout": "fold", "label": "the 10 lines that sold nothing",
                           "children": [{"say": "Ten traded the week before."}]}), defs)
    assert _find(meta["arrangement"], "fold") is None


def test_an_empty_fold_is_not_a_fold(defs):
    meta = _compose(_page({"layout": "fold", "label": "nothing in here", "children": []}), defs)
    assert _find(meta["arrangement"], "fold") is None


def test_the_label_is_bounded_like_every_other(defs):
    cap = int(req(load_defs(), "composition.arrangement.fold.label_max_length"))
    meta = _compose(_page({"layout": "fold", "label": "x" * (cap + 40),
                           "children": [{"say": "Long label."}]}), defs)
    fold = _find(meta["arrangement"], "fold")
    assert fold and len(fold["label"]) == cap


# ------------------------------------------------------------ and he is told

def test_he_is_told_it_exists_and_when_to_use_it(defs):
    # A rebuilt surface keeps producing its old self until the TOOL TEXT says
    # otherwise -- P8's lesson, and P12's. The page's own grammar description is
    # what he reads at the moment he composes.
    said = " ".join(str(req(defs, "composition.arrangement.about")).split())
    low = said.lower()
    assert "`fold`" in said
    assert "without being a wall" in low
    # And what NOT to fold, because folding the answer would hide it and folding
    # a caveat would break UI rule 4.
    assert "never fold the answer" in low and "caveat that says a figure may be wrong" in low
