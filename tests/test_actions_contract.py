"""
WHAT GEORGE MAY OFFER TO DO ABOUT A ROW, and what he may not.

NO DATABASE. The vocabulary and the validator (agent/actions.py, P2.d).

The danger an action carries is the same one a block's `claim` carries and one
more besides. The same one: it is a channel for George's OWN words sitting over
figures that have receipts, so a digit in it would be a figure with no source,
stated above one that has. The extra one: it is a BUTTON, and a button that
does nothing when it is tapped is worse than no button — so an act is one of
the closed set the surface performs, and a target is a row the read holds.

WHAT THE MODEL MAY NOT SAY AT ALL is what a thing costs. "~1s" and "a turn" are
facts about this machine; each act declares its own in metrics.yaml, the
validator copies it onto the accepted offer, and the schema has no property for
it, so there is nowhere for the model's opinion about speed to arrive.
"""

import pytest

from tools._common import load_defs, req
from agent import actions, compose, loop


@pytest.fixture(scope="module")
def defs():
    return load_defs()


ROWS = [
    {"store": "Rockwell", "net_sales": 412884, "direction": "down"},
    {"store": "OPUS", "net_sales": 121451, "direction": "up"},
    {"store": "Magnolia", "net_sales": 288110, "direction": "down"},
]

CALLS = {
    1: {"tool": "get_sales", "arguments": {}, "error": None, "duplicate": False,
        "is_read": True, "rows": ROWS},
    # One row, no store column, scoped by a filter — the shape that made
    # `_backs` necessary in the first place.
    2: {"tool": "get_sales", "arguments": {}, "error": None, "duplicate": False,
        "is_read": True, "rows": [{"net_sales": 412884}],
        "filters": {"store": "North Edsa"}},
}


def take(submitted, defs):
    return actions.validate(submitted, CALLS, defs)


def one(submitted, defs):
    """The single offer that stood, or the single refusal's reason."""
    accepted, rejected = take([submitted], defs)
    if accepted:
        return accepted[0]
    return rejected[0]["reason"]


# ---------------------------------------------------------------------------
# What stands
# ---------------------------------------------------------------------------

def test_an_offer_names_an_act_a_read_a_row_and_a_reason(defs):
    stood = one({"act": "why", "seq": 1, "target": "Magnolia",
                 "reason": "the only shop that fell while takings rose"}, defs)
    assert stood["act"] == "why"
    assert stood["seq"] == 1
    assert stood["target"] == "Magnolia"
    assert stood["reason"] == "the only shop that fell while takings rose"


def test_an_offer_about_the_answer_names_no_row(defs):
    """
    Not every suggestion is about one shop. One with no target is drawn at the
    foot beside `next`, and refusing it would push George back into saying it
    in the sentence — which is where the old `recommendation` tile lost.
    """
    stood = one({"act": "open", "seq": 1, "reason": "worth a look before the order"}, defs)
    assert stood["target"] is None


def test_a_row_the_read_only_declares_in_its_filters_is_still_a_row(defs):
    """
    `get_sales(group_by=[], filters={store: North Edsa})` returns one row of
    totals with no store column. The read IS about North Edsa — its own
    `filters_applied` says so — and refusing an offer on it is the four-
    iteration loop `compose._backs` was written to end.
    """
    stood = one({"act": "why", "seq": 2, "target": "North Edsa",
                 "reason": "it moved further than anything else"}, defs)
    assert stood["target"] == "North Edsa"


# ---------------------------------------------------------------------------
# What the model never supplies
# ---------------------------------------------------------------------------

def test_the_cost_is_derived_from_the_act_and_not_submitted(defs):
    """
    The one number-shaped thing on the button, and the model never writes it.
    Both halves are checked: what the yaml declares comes out on the offer, and
    what the model tries to say about it is ignored rather than trusted.
    """
    declared = req(defs, "composition.actions.acts")
    for act, spec in declared.items():
        stood = one({"act": act, "seq": 1, "target": "OPUS",
                     "reason": "the one that moved"}, defs)
        assert stood["costs"] == spec["costs"]
        assert stood["model_turn"] is bool(spec.get("model_turn"))
    # And an attempt to say it is refused by the whitelist of fields, because
    # the schema has no property for it — `additionalProperties: False`.
    schema = next(t for t in loop.build_tool_schemas() if t["name"] == "compose")
    item = schema["input_schema"]["properties"]["actions"]["items"]
    assert item["additionalProperties"] is False
    assert "costs" not in item["properties"]
    assert "model_turn" not in item["properties"]
    assert "label" not in item["properties"]


def test_a_turn_costing_act_says_so_and_a_read_costing_one_does_not(defs):
    """
    The distinction the label exists for: whether tapping it costs a second or
    a conversation. A person choosing between two buttons is entitled to it.
    """
    asked = one({"act": "why", "seq": 1, "target": "OPUS", "reason": "it led"}, defs)
    opened = one({"act": "open", "seq": 1, "target": "OPUS", "reason": "it led"}, defs)
    assert asked["model_turn"] is True and asked["costs"] == "a turn"
    assert opened["model_turn"] is False and opened["costs"] != asked["costs"]


# ---------------------------------------------------------------------------
# What is refused
# ---------------------------------------------------------------------------

def test_a_reason_carrying_a_digit_is_refused(defs):
    """
    The annotation rule, in the place it is easiest to break: the reason IS the
    argument for tapping, and the most persuasive argument is a number. The
    number is already on the row underneath, with the read that returned it and
    the moment it was read.
    """
    said = one({"act": "why", "seq": 1, "target": "Magnolia",
                "reason": "it fell 9%"}, defs)
    assert "no digits" in said


def test_an_offer_with_no_reason_is_refused(defs):
    """A button with no argument is a control, and the card is about the WHY."""
    said = one({"act": "why", "seq": 1, "target": "Magnolia", "reason": "  "}, defs)
    assert "WHY" in said


def test_a_reason_longer_than_the_definitions_allow_is_cut_at_a_word(defs):
    """P2S.7: a length is not about truth, so the offer stands with its first
    words rather than being refused and taking the button with it."""
    longest = int(req(defs, "composition.actions.reason.max_length"))
    long = "it moved further than any other shop this week and nobody has looked yet at why"
    assert len(long) > longest
    stood = one({"act": "why", "seq": 1, "target": "OPUS", "reason": long}, defs)
    assert len(stood["reason"]) <= longest and long.startswith(stood["reason"])


def test_an_act_the_surface_cannot_perform_is_refused(defs):
    """
    Nothing may be offered that the room cannot do when it is tapped. `order`
    is the shape of the thing that would be worst: an act that sounds like it
    leaves George's hands.
    """
    said = one({"act": "order", "seq": 1, "target": "OPUS", "reason": "it is running out"}, defs)
    assert "an act is one of" in said


def test_a_target_no_row_and_no_filter_carries_is_refused(defs):
    """
    The same test a block's subject passes, and the same reason: an offer on a
    row that is not there sits on nothing. This is the action half of the
    Greenhills-over-Rockwell defect — a claim about one shop attached to
    another's figures.
    """
    said = one({"act": "why", "seq": 1, "target": "Greenhills",
                "reason": "it fell while the rest rose"}, defs)
    assert "no row for" in said


def test_a_read_that_did_not_run_is_refused(defs):
    said = one({"act": "why", "seq": 9, "target": "OPUS", "reason": "it led"}, defs)
    assert "did not run" in said


def test_more_than_the_cap_is_refused_and_the_first_ones_stand(defs):
    """
    Past the cap the person is choosing between suggestions instead of reading
    figures. The extras are DROPPED, not the whole statement — one bad offer
    never costs the good ones, exactly as one bad block never costs the board.
    """
    cap = int(req(defs, "composition.actions.max"))
    many = [{"act": "why", "seq": 1, "target": ROWS[n % 3]["store"],
             "reason": f"reason {chr(97 + n)}"} for n in range(cap + 2)]
    # Distinct fingerprints: vary the act as well so the duplicate guard is not
    # what does the refusing.
    for n, item in enumerate(many):
        item["act"] = "why" if n % 2 == 0 else "open"
    accepted, rejected = take(many, defs)
    assert len(accepted) == cap
    assert rejected and all("at most" in r["reason"] for r in rejected)


def test_the_same_offer_on_the_same_row_twice_is_one_offer(defs):
    """
    Two rounds of composing in a turn is normal. The second one repeating the
    first would otherwise draw the same button twice on the same row.
    """
    accepted, rejected = take([
        {"act": "why", "seq": 1, "target": "OPUS", "reason": "it led"},
        {"act": "why", "seq": 1, "target": "opus", "reason": "it led"},
    ], defs)
    assert len(accepted) == 1
    assert "already offered" in rejected[0]["reason"]


def test_an_argument_is_refused_while_no_act_takes_one(defs):
    """
    `replay` is written down in metrics.yaml as the act that is NOT offered,
    with the reason — it would need a value as well as an argument, and the
    preset values live in the renderer. Until it comes back, an argument
    arriving is the model reaching for an act that does not exist.
    """
    assert not any(a.get("needs_argument")
                   for a in req(defs, "composition.actions.acts").values())
    said = one({"act": "why", "seq": 1, "target": "OPUS", "reason": "it led",
                "argument": "date_range"}, defs)
    assert "changes no argument" in said
    schema = next(t for t in loop.build_tool_schemas() if t["name"] == "compose")
    assert "argument" not in schema["input_schema"]["properties"]["actions"]["items"]["properties"]


def test_nothing_submitted_is_no_offers_and_no_refusals(defs):
    assert actions.validate(None, CALLS, defs) == ([], [])


# ---------------------------------------------------------------------------
# On the tool, beside the other two statements
# ---------------------------------------------------------------------------

def test_compose_carries_all_three_statements_on_one_call(defs):
    """
    One tool, three statements. They are about the same reads, made at the same
    moment, and none of them reads anything — splitting them would buy a round
    trip each and nothing else.
    """
    result = compose.compose(
        [{"op": "put", "kind": "ranked", "key": "shops", "weight": "lead", "seq": 1,
          "claim": "Magnolia is the one that went the other way"}],
        {"claim": "Magnolia is the one that went the other way"},
        [{"act": "why", "seq": 1, "target": "Magnolia", "reason": "it went the other way"}],
        calls=CALLS, defs=defs,
    )
    assert result["rows"], "the board still composed"
    assert result["meta"]["reading"]["claim"]
    assert result["meta"]["actions"][0]["target"] == "Magnolia"
    assert result["meta"]["rejected_actions"] == []
    assert result["meta"]["acts"] == list(req(defs, "composition.actions.acts"))


def test_a_refused_offer_costs_the_board_nothing(defs):
    """The three statements are independent: one failing never empties another."""
    result = compose.compose(
        [{"op": "put", "kind": "ranked", "key": "shops", "weight": "lead", "seq": 1,
          "claim": "the shops, ranked"}],
        None,
        [{"act": "why", "seq": 1, "target": "Magnolia", "reason": "it fell 9%"}],
        calls=CALLS, defs=defs,
    )
    assert len(result["rows"]) == 1
    assert result["meta"]["actions"] == []
    assert "no digits" in result["meta"]["rejected_actions"][0]["reason"]


def test_the_acts_the_schema_offers_are_the_yamls_and_carry_their_own_words(defs):
    """
    The catalogue lives on the tool, not in the prompt — read at the moment of
    choosing, which is the only moment it is needed, and the reason the prompt
    is still 1,799 words.
    """
    schema = next(t for t in loop.build_tool_schemas() if t["name"] == "compose")
    item = schema["input_schema"]["properties"]["actions"]["items"]
    declared = req(defs, "composition.actions.acts")
    assert item["properties"]["act"]["enum"] == list(declared)
    for act, spec in declared.items():
        assert spec["about"] in item["properties"]["act"]["description"]
    assert item["properties"]["reason"]["maxLength"] == int(
        req(defs, "composition.actions.reason.max_length"))
    assert "NO DIGITS" in item["properties"]["reason"]["description"]
    assert item["required"] == ["act", "seq", "reason"]
