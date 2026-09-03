"""
Pure tests for the pin runner: validation and page naming.

NO DATABASE. These cover the two decisions that make a pin trustworthy without
running anything — whether a stored tool call can still run at all, and whether
a page name is a new page or a typo of an existing one.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as george_loop                       # noqa: E402
from app.services.pin_runner import (                       # noqa: E402
    PinValidationError,
    find_similar_page,
    normalize_page,
    validate_call,
    validate_calls,
)

# A call that is valid against the live tool surface today.
GOOD = {
    "tool": "get_sales",
    "arguments": {"metric": "net_sales", "group_by": "store", "date_range": "last_month"},
}


def _args(**over):
    return {**GOOD["arguments"], **over}


# ---------------------------------------------------------------------------
# Validation — the `unrunnable` state
# ---------------------------------------------------------------------------

def test_a_valid_call_survives_validation():
    tool, args = validate_call(GOOD)
    assert tool == "get_sales"
    assert args == GOOD["arguments"]


def test_a_tool_that_no_longer_exists_is_caught():
    with pytest.raises(PinValidationError, match="no longer one of George's tools"):
        validate_call({"tool": "get_revenue", "arguments": {}})


def test_a_renamed_or_unknown_argument_is_caught():
    """
    Pins rot. This repo has already renamed a metrics.yaml key; a tool parameter
    will go the same way eventually, and the tile must say so rather than crash.
    """
    with pytest.raises(PinValidationError, match="unexpected keyword argument 'metrik'"):
        validate_call({"tool": "get_sales", "arguments": _args(metrik=1)})


def test_an_argument_that_became_required_is_caught():
    with pytest.raises(PinValidationError, match="missing a required argument"):
        validate_call({"tool": "get_sales", "arguments": {"metric": "net_sales"}})


def test_a_value_removed_from_the_definitions_is_caught():
    """
    Closed vocabularies come from metrics.yaml through the generated schema, so
    deleting a metric there invalidates its pins automatically instead of
    failing later inside the tool.
    """
    with pytest.raises(PinValidationError, match="no longer a valid value"):
        validate_call({"tool": "get_sales", "arguments": _args(metric="gross_profit")})


def test_a_dead_value_inside_a_list_argument_is_caught():
    with pytest.raises(PinValidationError, match="no longer a valid value"):
        validate_call({"tool": "get_sales", "arguments": _args(group_by=["store", "supplier"])})


def test_a_valid_list_argument_is_accepted():
    tool, args = validate_call({"tool": "get_sales", "arguments": _args(group_by=["store", "month"])})
    assert args["group_by"] == ["store", "month"]


def test_every_registered_tool_can_back_a_pin():
    """
    A tool George can call is a tool an answer can be pinned from. If one cannot
    even be named here, pinning its answers would fail at an odd moment.
    """
    for name in george_loop.TOOL_FUNCTIONS:
        with pytest.raises(PinValidationError) as exc:
            validate_call({"tool": name, "arguments": {"definitely_not_a_param": 1}})
        # It fails on the ARGUMENT, never on the tool being unknown.
        assert "no longer one of George's tools" not in str(exc.value)


def test_a_pin_needs_at_least_one_call():
    for empty in ([], None, "get_sales"):
        with pytest.raises(PinValidationError, match="at least one tool call"):
            validate_calls(empty)


def test_malformed_calls_are_rejected_with_a_reason():
    with pytest.raises(PinValidationError, match="missing a tool name"):
        validate_call({"arguments": {}})
    with pytest.raises(PinValidationError, match="must be an object"):
        validate_call({"tool": "get_sales", "arguments": "everything"})


# ---------------------------------------------------------------------------
# Page names
# ---------------------------------------------------------------------------

def test_normalize_trims_and_collapses_but_keeps_case():
    assert normalize_page("  Replenishment   Plan ") == "Replenishment Plan"
    assert normalize_page("PO Maker") == "PO Maker"
    # Case is what the user typed and is theirs to choose.
    assert normalize_page("replenishment") == "replenishment"


def test_blank_pages_become_ungrouped():
    for blank in ("", "   ", "\t\n", None):
        assert normalize_page(blank) is None


def test_a_case_only_difference_is_reported_as_a_near_duplicate():
    assert find_similar_page("replenishment", ["Replenishment", "PO Maker"]) == "Replenishment"
    assert find_similar_page("PO MAKER", ["Replenishment", "PO Maker"]) == "PO Maker"


def test_an_exact_match_is_the_same_page_not_a_duplicate():
    assert find_similar_page("Replenishment", ["Replenishment"]) is None


def test_matching_is_not_fuzzy():
    """
    "Replenishing" and "Replenishment" may well be two real pages. Merging them
    on a similarity score would look authoritative while being a guess — the
    same rule the store alias map follows.
    """
    assert find_similar_page("Replenishing", ["Replenishment"]) is None
    assert find_similar_page("Replenishment 2", ["Replenishment"]) is None
    assert find_similar_page("Repl", ["Replenishment"]) is None


def test_no_existing_pages_means_no_duplicate():
    assert find_similar_page("Anything", []) is None
    assert find_similar_page(None, ["Replenishment"]) is None
