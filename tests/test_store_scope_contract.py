"""
The store scope is counted from the definitions, never typed into a prompt.

NO DATABASE. Definitions and one module constant.

WHY THIS EXISTS. Three files described the same estate and disagreed: CLAUDE.md
said 9 candy stores, agent/loop.py's system prompt said 7, and metrics.yaml said
7 active retail plus 2 storefronts that have never transacted. Every one of them
was right about something and none of them said what it was counting, so the
disagreement looked like an error in whichever file you happened to read second.

The prompt now derives its sentence from stores.active_retail,
stores.pending_retail and stores.warehouse at import. This holds that in place —
a hardcoded count would pass every other test in this suite and be wrong the day
a store opens.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop            # noqa: E402
from tools._common import load_defs, req         # noqa: E402

DEFS = load_defs()


def test_the_scope_sentence_is_read_from_the_definitions_not_typed():
    """
    The guarantee, held without holding a phrase.

    Until 2026-09-12 this asserted the sentence's exact English ("N active
    retail candy stores"), which pinned wording as a side effect of pinning a
    count. What matters is that the count and the names come from the yaml: add
    a shop there and the sentence must change on its own. So the definitions are
    mutated and the sentence rebuilt, the same way the judgment section's
    sentinel test works. A hardcoded count cannot survive this.
    """
    import copy

    grown = copy.deepcopy(DEFS)
    grown["stores"]["active_retail"] = list(grown["stores"]["active_retail"]) + [
        {"id": "sentinel", "name": "SENTINEL SHOP", "display_name": "SENTINEL SHOP"},
    ]
    grown["stores"]["warehouse"] = [
        {"id": "w", "name": "SENTINEL DEPOT", "display_name": "SENTINEL DEPOT"},
    ]

    before = george_loop._scope_sentence(DEFS)
    after = george_loop._scope_sentence(grown)

    assert before != after, "the sentence does not move when the definitions do"
    assert str(len(req(grown, "stores.active_retail"))) in after
    assert "SENTINEL DEPOT" in after
    assert "SENTINEL DEPOT" not in before

    # And the built sentence is what the prompt actually opens with.
    assert george_loop.SYSTEM_PROMPT.startswith(before)


def test_the_scope_sentence_states_no_count_the_definitions_do_not_support():
    """A count that is not in the yaml may not appear in the sentence at all."""
    counts = {
        len(req(DEFS, "stores.active_retail")),
        len(req(DEFS, "stores.pending_retail")),
        len(req(DEFS, "stores.warehouse")),
    }
    sentence = george_loop._scope_sentence(DEFS)
    for wrong in {1, 6, 7, 8, 9, 10} - counts:
        assert str(wrong) not in sentence, f"{wrong} is in the sentence and in no definition"
