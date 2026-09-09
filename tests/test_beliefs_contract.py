"""
What George is allowed to believe.

NO DATABASE. The admissibility rules only; the store is injected and is tested
where it lives.

WHY THIS EXISTS. A wrong figure is embarrassing for one answer. A wrong BELIEF
is wrong every morning until somebody notices, and by then nobody remembers
where it came from. Persistence multiplies the cost of every failure this
system already guards against, so the guards have to be stricter here than
anywhere else, not looser.

Four rules, one test each, and each answers a specific way memory rots:

  1. GROUNDED — a belief names calls actually run. An invention that persists
     is worse than one that does not.
  2. NO FIGURE — a stored number goes stale silently. Words degrade gracefully.
  3. CLOSED STANCES — five words from the definitions, not a sixth invented at
     the keyboard.
  4. REVISION KEEPS THE OLD ONE AND SAYS WHY — a view that can be silently
     replaced cannot be wrong, and a view that cannot be wrong is not a view.
"""

import pytest

from tools._common import load_defs
from agent import beliefs


@pytest.fixture(scope="module")
def defs():
    return load_defs()


RAN = {"tool": "get_sales", "arguments": {"store": "Rockwell"}}
ALSO_RAN = {"tool": "get_stock", "arguments": {"store": "Rockwell"}}


def executed_only(*allowed):
    """A predicate standing in for the conversation's executed set."""
    keys = [(c["tool"], tuple(sorted(c["arguments"].items()))) for c in allowed]
    def is_executed(call):
        return (call["tool"], tuple(sorted(call["arguments"].items()))) in keys
    return is_executed


def good(**over):
    base = {
        "subject_kind": "store",
        "subject": "Rockwell",
        "stance": "needs_attention",
        "claim": "Rockwell is losing customers rather than smaller baskets.",
        "evidence": [RAN],
    }
    base.update(over)
    return base


def only(submitted, defs, is_executed=None):
    return beliefs.validate(
        submitted, defs, is_executed=is_executed or executed_only(RAN, ALSO_RAN))


# --------------------------------------------------------------- 1. grounded


def test_a_belief_is_held_when_it_names_a_call_that_ran(defs):
    accepted, rejected = only([good()], defs)
    assert rejected == []
    assert accepted[0]["subject"] == "Rockwell"
    assert accepted[0]["evidence"] == [RAN]


def test_a_belief_naming_a_call_that_never_ran_is_refused(defs):
    accepted, rejected = only([good(evidence=[{"tool": "get_sales",
                                               "arguments": {"store": "Fairview"}}])], defs)
    assert accepted == []
    assert "not run" in rejected[0]["reason"]


def test_a_belief_with_no_evidence_is_refused(defs):
    """The whole of judgment.grounding, made mechanical."""
    for missing in (None, [], {}):
        accepted, rejected = only([good(evidence=missing)], defs)
        assert accepted == [], f"evidence={missing!r} was accepted"


def test_a_read_that_established_nothing_still_grounds_a_belief(defs):
    """
    "I looked at OPUS and there is nothing there" rests on the looking. An
    empty result is evidence — refusing it would make `unremarkable` and
    `not_visible` unreachable, which are two of the five stances.
    """
    accepted, rejected = only([good(stance="unremarkable",
                                    claim="Nothing at OPUS concerns me.")], defs)
    assert rejected == []
    assert accepted[0]["stance"] == "unremarkable"


# -------------------------------------------------------------- 2. no figure


@pytest.mark.parametrize("claim", [
    "Rockwell is down 9.4%.",
    "Rockwell sold 412884 pesos last week.",
    "Basket value has been soft for 11 days.",
])
def test_a_claim_carrying_a_figure_is_refused(claim, defs):
    """
    The rule that keeps memory from becoming a lie. A stored number is false
    later and says so to nobody; the figures live in the evidence and can be
    re-read.
    """
    accepted, rejected = only([good(claim=claim)], defs)
    assert accepted == []
    assert "no figure" in rejected[0]["reason"]


def test_the_same_view_in_words_is_held(defs):
    accepted, _ = only([good(claim="Basket value has been soft for over a week.")], defs)
    assert len(accepted) == 1


def test_a_claim_the_length_of_an_answer_is_refused(defs):
    accepted, rejected = only([good(claim="x" * (beliefs.MAX_CLAIM + 1))], defs)
    assert accepted == []
    assert "an answer being stored" in rejected[0]["reason"]


# --------------------------------------------------------- 3. closed stances


def test_the_stances_come_from_the_definitions(defs):
    assert set(beliefs.stances_for(defs)) == set(defs["judgment"]["stances"])


def test_an_invented_stance_is_refused(defs):
    accepted, rejected = only([good(stance="critical")], defs)
    assert accepted == []
    assert "judgment.stances" in rejected[0]["reason"]


def test_an_invented_subject_kind_is_refused(defs):
    accepted, rejected = only([good(subject_kind="vibe")], defs)
    assert accepted == []
    assert "judgment.subject_kinds" in rejected[0]["reason"]


def test_a_view_must_be_about_something(defs):
    accepted, rejected = only([good(subject="  ")], defs)
    assert accepted == []
    assert "held about a thing" in rejected[0]["reason"]


# ------------------------------------------------------------- 4. revision


def test_changing_a_view_requires_a_reason(defs):
    accepted, rejected = only([good(supersedes="belief-1")], defs)
    assert accepted == []
    assert "needs a reason" in rejected[0]["reason"]


def test_changing_a_view_with_a_reason_is_held(defs):
    accepted, rejected = only([good(
        supersedes="belief-1",
        why="The shelf read shows every category fell together, so it is not the mix.",
    )], defs)
    assert rejected == []
    assert accepted[0]["supersedes"] == "belief-1"
    assert accepted[0]["why"]


# ------------------------------------------------------------------ bounds


def test_a_turn_cannot_rewrite_the_whole_picture(defs):
    """
    A turn that changes six views is an investigation, not a view. The cap is
    not about cost: it is about a single answer quietly replacing everything
    George thinks.
    """
    accepted, rejected = only([good(subject=f"Shop {chr(65+i)}")
                               for i in range(beliefs.MAX_BELIEFS_PER_TURN + 2)], defs)
    assert len(accepted) == beliefs.MAX_BELIEFS_PER_TURN
    assert rejected


def test_nothing_submitted_is_not_an_error(defs):
    assert only(None, defs) == ([], [])
    assert only([], defs) == ([], [])


def test_rubbish_is_refused_without_raising(defs):
    accepted, rejected = only(["a string", 7, None], defs)
    assert accepted == []
    assert len(rejected) == 3


# ------------------------------------------------------------- the tool body


def test_the_result_names_no_source_table(defs):
    """
    Like record_findings: the loop keeps the last meta describing real data as
    the answer's receipts, and this one read nothing. Naming a source would
    replace the figures' provenance with a label.
    """
    class Store:
        def record(self, accepted):
            return [dict(b, id=f"b{i}") for i, b in enumerate(accepted)]

    out = beliefs.record([good()], defs=defs,
                         is_executed=executed_only(RAN), store=Store())
    assert "source_table" not in out["meta"]
    assert out["meta"]["held"] == 1
    assert out["rows"][0]["id"] == "b0"


def test_a_refused_belief_never_reaches_the_store(defs):
    class Store:
        def __init__(self):
            self.seen = None
        def record(self, accepted):
            self.seen = accepted
            return []

    store = Store()
    beliefs.record([good(stance="critical")], defs=defs,
                   is_executed=executed_only(RAN), store=store)
    assert store.seen is None, "a refused belief was passed to the store"


# ---------------------------------------------------------------------------
# The schema the model is handed, and a list that arrives as its own JSON text.
#
# Found 2026-09-10, after a whole dogfood of `beliefs held: 0`: the parameter's
# annotation is list[dict], the schema builder had no branch for it, and the
# model was told {"type": "string"}. It obediently sent the list as a JSON
# string; the validator iterated the string's characters and refused each one
# as "not an object". George formed a view in prose every turn and held none.
# ---------------------------------------------------------------------------

def test_the_schema_offers_a_list_of_objects_and_not_a_string():
    from agent import loop as george_loop
    schema = next(t for t in george_loop.build_tool_schemas(include_write=True)
                  if t["name"] == "record_belief")
    beliefs_schema = schema["input_schema"]["properties"]["beliefs"]
    assert beliefs_schema["type"] == "array"
    items = beliefs_schema["items"]
    assert items["type"] == "object"
    assert set(items["required"]) == {"subject_kind", "subject", "stance", "claim", "evidence"}
    assert items["additionalProperties"] is False
    assert set(items["properties"]["stance"]["enum"]) == set(beliefs.stances_for(load_defs()))
    assert set(items["properties"]["subject_kind"]["enum"]) == set(beliefs.subject_kinds_for(load_defs()))


def test_a_list_that_arrives_as_json_text_is_still_that_list():
    import json
    view = {"subject_kind": "supplier", "subject": "Seikyo SEK001", "stance": "needs_attention",
            "claim": "The Seikyo range is chronically out of stock rather than merely low.",
            "evidence": [{"tool": "get_purchase_plan", "arguments": {"supplier": "Seikyo SEK001"}}]}
    accepted, rejected = beliefs.validate(json.dumps([view]), load_defs(), is_executed=lambda c: True)
    assert rejected == []
    assert len(accepted) == 1 and accepted[0]["subject"] == "Seikyo SEK001"
    # Text that is not JSON is one refusal with a reason, not a refusal per character.
    accepted, rejected = beliefs.validate("not json at all", load_defs(), is_executed=lambda c: True)
    assert accepted == [] and len(rejected) == 1
