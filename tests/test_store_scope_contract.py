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

from pathlib import Path

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


# ---------------------------------------------------------------------------
# A deliberate exclusion refuses in its own words
#
# WHY THIS EXISTS. Ten tools scope their catalog to a subset of the estate, and
# every one of them used to tell a caller asking about an excluded store that it
# did not exist: "Unknown store 'AJI BARN'. Valid stores: Fairview, ...". AJI
# BARN is the warehouse. It was left out on purpose, for a reason already
# written down in metrics.yaml, and the refusal said the opposite of that — so
# George could not explain it and could only guess, three times, in the middle
# of the one workflow the owner was actually building.
# ---------------------------------------------------------------------------
from tools._common import resolve_store, store_catalog  # noqa: E402


def _retail() -> dict:
    return store_catalog(DEFS, [s["id"] for s in req(DEFS, "stores.active_retail")])


def test_an_excluded_store_is_out_of_scope_not_unknown():
    with pytest.raises(ValueError) as caught:
        resolve_store("AJI BARN", _retail(), DEFS,
                      out_of_scope_reason=req(DEFS, "dead_stock.barn_excluded_reason"))
    said = str(caught.value)
    assert "not in scope for this reading" in said
    assert "it is a real store" in said.lower(), "the refusal must not deny it exists"
    assert "Unknown store" not in said
    # Which group it is in, and the reason the caller declared — so George can
    # say WHY rather than guess.
    assert "warehouse" in said
    assert "dispatch counters" in said
    # And still what this reading does cover.
    assert "Rockwell" in said


def test_the_reason_is_read_from_the_definitions_not_written_in_the_tool():
    from tools import _common

    source = (Path(_common.__file__)).read_text(encoding="utf-8")
    assert "dispatch counter" not in source.lower(), (
        "the reason a store is excluded is a business definition; it belongs in "
        "metrics.yaml, which dead_stock reads and passes in"
    )


def test_a_store_that_exists_nowhere_is_still_unknown():
    """A different mistake with a different fix, and it must keep its own words."""
    with pytest.raises(ValueError) as caught:
        resolve_store("Narnia", _retail(), DEFS)
    said = str(caught.value)
    assert "Unknown store 'Narnia'" in said
    assert "not in scope" not in said


def test_a_caller_that_declares_no_reason_never_says_the_word_none():
    with pytest.raises(ValueError) as caught:
        resolve_store("AJI BARN", _retail(), DEFS)
    said = str(caught.value)
    assert "not in scope" in said
    assert "None" not in said, "a missing reason must be no sentence, not the word None"


def test_the_old_behaviour_survives_when_no_definitions_are_passed():
    """
    `defs` is optional, so every existing caller is unchanged until it opts in.
    Without it there is no estate to check against and unknown is all that can
    honestly be said.
    """
    with pytest.raises(ValueError) as caught:
        resolve_store("AJI BARN", _retail())
    assert "Unknown store" in str(caught.value)


def test_a_store_in_scope_still_resolves():
    ids = resolve_store("Rockwell", _retail(), DEFS)
    assert len(ids) == 1 and ids[0] in _retail()
    assert resolve_store(None, _retail(), DEFS) == list(_retail())


def test_dead_stock_passes_its_declared_reason():
    from tools import dead_stock

    source = (Path(dead_stock.__file__)).read_text(encoding="utf-8")
    assert "dead_stock.barn_excluded_reason" in source, (
        "the tool that excludes BARN must hand the resolver the reason it "
        "documents, or the refusal cannot explain itself"
    )


@pytest.mark.parametrize("tool,key,says", [
    ("dead_stock", "dead_stock.barn_excluded_reason", "dispatch counters"),
    ("sales", "sales_scope.warehouse_excluded_reason", "records no transactions"),
    ("replenishment", "replenishment.warehouse_excluded_reason", "ships FROM"),
])
def test_every_tool_that_excludes_the_warehouse_says_why(tool, key, says):
    """
    Three tools scope to active retail and so refuse AJI BARN. Each must give
    its OWN reason — a dead stock list, a sales figure and a replenishment plan
    exclude the warehouse for three different reasons, and one shared sentence
    would be wrong for two of them.
    """
    with pytest.raises(ValueError) as caught:
        resolve_store("AJI BARN", _retail(), DEFS, out_of_scope_reason=req(DEFS, key))
    said = str(caught.value)
    assert "not in scope" in said and "Unknown store" not in said
    assert says in said, f"{tool} did not give its own reason"


def test_the_three_reasons_are_actually_different():
    reasons = {req(DEFS, k) for k in (
        "dead_stock.barn_excluded_reason",
        "sales_scope.warehouse_excluded_reason",
        "replenishment.warehouse_excluded_reason",
    )}
    assert len(reasons) == 3, "a shared sentence would be wrong for two of them"


@pytest.mark.parametrize("module,key", [
    ("sales", "sales_scope.warehouse_excluded_reason"),
    ("replenishment", "replenishment.warehouse_excluded_reason"),
    ("dead_stock", "dead_stock.barn_excluded_reason"),
])
def test_each_tool_hands_the_resolver_its_declared_reason(module, key):
    import importlib

    mod = importlib.import_module(f"tools.{module}")
    source = Path(mod.__file__).read_text(encoding="utf-8")
    assert key in source, (
        f"tools/{module}.py excludes the warehouse but does not pass the reason, "
        f"so its refusal cannot explain itself"
    )


def test_a_non_trading_location_is_named_rather_than_denied():
    """
    Aji Packing and AJI ONLINE are rows in the stores table too. "Unknown store"
    is wrong about them for the same reason it was wrong about the warehouse.
    """
    with pytest.raises(ValueError) as caught:
        resolve_store("Aji Packing", _retail(), DEFS)
    said = str(caught.value)
    assert "not in scope" in said and "non trading" in said
