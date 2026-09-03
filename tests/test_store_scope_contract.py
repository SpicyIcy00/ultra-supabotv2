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


def test_the_system_prompt_counts_stores_from_the_definitions():
    """
    The prompt said 7, CLAUDE.md said 9, and metrics.yaml said 7 active plus 2
    that have never transacted. All three described the same estate. Only the
    definitions say it now.
    """
    active = len(req(DEFS, "stores.active_retail"))
    pending = len(req(DEFS, "stores.pending_retail"))
    prompt = george_loop.SYSTEM_PROMPT

    assert f"{active} active retail candy stores" in prompt
    assert f"{pending} more storefronts" in prompt
    for store in req(DEFS, "stores.warehouse"):
        assert (store.get("display_name") or store["name"]) in prompt


def test_the_prompt_never_states_a_store_count_the_definitions_do_not_support():
    active = len(req(DEFS, "stores.active_retail"))
    pending = len(req(DEFS, "stores.pending_retail"))
    head = george_loop.SYSTEM_PROMPT.split("\n", 1)[0]
    for wrong in {1, 6, 7, 8, 9, 10} - {active, pending}:
        assert f"{wrong} active retail" not in head
