"""
The reading's three slots: what the model may say about its own words, and
what the loop refuses to let it say.

P1.f, 2026-09-14. This file replaces `test_finding_frame_contract.py`, which
held the channel that used to ride `compose`: a ROLE on a call that already ran
— primary, driver, breakdown, context. Every rule in it was enforced and none
of it was drawn: the room has never rendered a role, and the one surface that
did (`components/george`) is reachable only at `/george/preview`. So the model
paid a schema and up to twelve items of it on every turn to label work nobody
looked at. The channel is now the reading — claim, caveat, next — which the
room draws every turn, above the board and under it.

THREE THINGS UNDER TEST, the same three that file tested.

  1. The validator, as a pure function (agent/reading.py). Every check has a
     case here that would pass without it.
  2. The loop's wiring: the tool is offered, sits inside the shared prefix, is
     kept OUT of what a pin or a workflow may hold, and its accepted slots are
     persisted beside the snapshot so a reopened thread draws the answer the
     way it was drawn live.
  3. The frame: driven end-to-end with the model and the log both stubbed.

AND THE ONE GUARANTEE THAT MAKES A TEXT CHANNEL SAFE: the claim is a
HIGHLIGHT. It is drawn only where the answer already carries those words, so
it cannot put a character on screen the answer does not have — and `caveat`
and `next` carry only a figure one of this turn's reads returned
(`figures: returned`, 2026-09-14; they carried no digit at all before it).
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")
pytest.importorskip("yaml")

import yaml                                                            # noqa: E402

from agent import reading                                              # noqa: E402
from agent import loop as george_loop                                  # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _TextBlock, _ToolUse  # noqa: E402
from tests.test_loop_correction_contract import StubLog                # noqa: E402

_ROOT = Path(__file__).resolve().parents[1]
_DEFS = yaml.safe_load((_ROOT / "definitions" / "metrics.yaml").read_text(encoding="utf-8"))

CLAIM = "OPUS added more than the next two shops together"
CAVEAT = "Basket value fell at Magnolia and North Edsa even as their takings rose"
NEXT = "Draft the Seikyo order, since three of the five lines are theirs"


#: What "the reads returned" is, for the validator's own cases. The loop builds
#: this from the calls themselves (agent/compose.py).
RETURNED = {130016.0, 44.0, 118.0, 12.0, 1828.0, 11.5}


def _validate(submitted, returned=RETURNED):
    return reading.validate(submitted, _DEFS, returned)


# ---------------------------------------------------------------------------
# 1. The validator
# ---------------------------------------------------------------------------

def test_a_whole_reading_is_accepted():
    accepted, rejected = _validate({"claim": CLAIM, "caveat": CAVEAT, "next": NEXT})
    assert rejected == []
    assert accepted == {"claim": CLAIM, "caveat": CAVEAT, "next": NEXT}


def test_the_slots_come_back_in_the_order_they_are_drawn():
    accepted, _ = _validate({"next": NEXT, "claim": CLAIM, "caveat": CAVEAT})
    assert list(accepted) == list(reading.SLOTS) == ["claim", "caveat", "next"]


def test_no_reading_at_all_is_a_valid_outcome():
    assert _validate(None) == ({}, [])
    assert _validate({}) == ({}, [])


def test_each_slot_stands_on_its_own():
    for slot, text in (("claim", CLAIM), ("caveat", CAVEAT), ("next", NEXT)):
        accepted, rejected = _validate({slot: text})
        assert accepted == {slot: text} and rejected == []


def test_a_caveat_may_carry_a_figure_a_read_returned():
    # THE FIX, 2026-09-14. The rule was "no digits", and it made George vaguer
    # than his evidence: a count the tool itself put on `meta` could not be
    # said. What qualifies these figures may name one of them.
    accepted, rejected = _validate(
        {"caveat": "44 of 118 products have no figure on one side, so they carry no change"})
    assert rejected == [] and "44 of 118" in accepted["caveat"]


def test_a_caveat_carrying_a_figure_no_read_returned_is_still_refused():
    # 87 is 97 less the ten he chose to name, and no tool computed it. This is
    # the half of the old rule that was protecting something.
    accepted, rejected = _validate({"caveat": "The other 87 products are outside this list"})
    assert accepted == {}
    assert rejected[0]["slot"] == "caveat"
    assert "no read returned" in rejected[0]["reason"] and "87" in rejected[0]["reason"]


def test_a_next_may_carry_the_figure_that_is_the_reason_to_act():
    accepted, rejected = _validate(
        {"next": "Ask OPUS to recount — a shelf cannot hold minus 1,828 of anything"})
    assert rejected == [] and accepted["next"].endswith("of anything")


def test_a_next_carrying_a_figure_no_read_returned_is_refused():
    accepted, rejected = _validate({"next": "Order 806 units from Seikyo"})
    assert accepted == {} and rejected[0]["slot"] == "next"
    assert "no read returned" in rejected[0]["reason"]


def test_a_turn_that_read_nothing_may_say_no_figure_at_all():
    # Not a stricter rule: with no read behind it, every figure is invented.
    accepted, rejected = _validate({"caveat": "Basket value fell 12% at Magnolia"},
                                   returned=set())
    assert accepted == {} and rejected[0]["slot"] == "caveat"


def test_a_date_a_day_number_and_a_small_count_were_never_figures():
    # Four of the eight refusals in the recorded run were these: the window the
    # comparison covers, said plainly. The matcher is agent/prose's, so a slot
    # and the gate on the answer excuse exactly the same things.
    accepted, rejected = _validate(
        {"caveat": "This is last week, 7 to 13 September, against the seven days before it",
         "next": "Tell me whether 8 weeks should count from delivery"},
        returned=set())
    assert rejected == [] and len(accepted) == 2


def test_a_claim_may_carry_its_figure_because_it_is_the_answer_s_own_words():
    # voice.restatement is what governs a figure in the answer, and since P1.c
    # a reading may carry the one its claim rests on. The claim slot points at
    # words the answer already has; it does not add one.
    accepted, rejected = _validate({"claim": "OPUS added ₱130,016, more than the next two"})
    assert rejected == [] and "130,016" in accepted["claim"]


def test_a_slot_past_its_bound_is_refused_and_the_others_stand():
    long = "word " * 200
    accepted, rejected = _validate({"claim": CLAIM, "caveat": long})
    assert accepted == {"claim": CLAIM}
    assert "at most" in rejected[0]["reason"]


def test_a_slot_nobody_declared_is_refused_by_name():
    accepted, rejected = _validate({"claim": CLAIM, "summary": "and this too"})
    assert accepted == {"claim": CLAIM}
    assert rejected[0]["slot"] == "summary" and "not a slot" in rejected[0]["reason"]


def test_an_empty_slot_is_refused_rather_than_drawn_empty():
    accepted, rejected = _validate({"claim": "   "})
    assert accepted == {} and rejected[0]["slot"] == "claim"


def test_a_reading_that_is_not_three_named_slots_is_refused_whole():
    accepted, rejected = _validate(["a claim"])
    assert accepted == {} and rejected[0]["slot"] is None


def test_whitespace_is_flattened_so_a_wrapped_claim_still_matches():
    accepted, _ = _validate({"claim": "OPUS added\n  more  than the rest"})
    assert accepted["claim"] == "OPUS added more than the rest"


def test_the_bounds_are_the_definitions_and_not_this_file():
    spec = _DEFS["voice"]["reading"]["slots"]
    assert set(spec) == set(reading.SLOTS)
    assert (spec["caveat"]["figures"] == spec["next"]["figures"]
            == reading.FIGURES_RETURNED)
    # The claim declares no rule at all: it is a span of the answer, governed
    # by voice.restatement like every other figure the answer carries.
    assert "figures" not in spec["claim"] and "no_digits" not in spec["claim"]
    # A rule nobody implemented raises rather than quietly allowing anything.
    bent = {"voice": {"reading": {"slots": {"caveat": {"figures": "anything"}}}}}
    with pytest.raises(ValueError):
        reading.validate({"caveat": "a caveat"}, bent)


def test_what_is_not_a_figure_is_one_number_in_one_place():
    # Declared in the definitions and shared with the gate on the answer's
    # prose; two rules disagreeing about what a figure is would be the measure
    # and the gate drifting apart.
    from agent import prose

    assert reading.presentation_max(_DEFS) == prose.PRESENTATION_MAX


# ---------------------------------------------------------------------------
# 2. The claim is a HIGHLIGHT — the whole of why a text channel is safe
# ---------------------------------------------------------------------------

def test_a_claim_the_answer_carries_was_said():
    assert reading.was_said(f"Every shop is up. {CLAIM}, which is the story.", CLAIM)


def test_case_and_line_breaks_do_not_lose_a_claim():
    assert reading.was_said("every shop is up.\nopus added more\n  than the next two shops together.",
                            CLAIM)


def test_a_claim_the_answer_does_not_carry_was_not_said():
    # It lights nothing. The reading still draws whole; the loop records the
    # miss in the gap log so the rate is measured, not assumed.
    assert not reading.was_said("Every shop is up on last week.", CLAIM)
    assert not reading.was_said("", CLAIM)
    assert not reading.was_said("anything at all", None)


def test_a_paraphrase_is_not_a_highlight():
    assert not reading.was_said("OPUS added more than the next two combined", CLAIM)


def test_what_he_said_this_turn_is_the_answer_plus_the_caveat_and_the_next():
    said = reading.said_this_turn("Every shop is up.",
                                  {"claim": CLAIM, "caveat": CAVEAT, "next": NEXT})
    assert "Every shop is up." in said and CAVEAT in said and NEXT in said
    # The claim is a span of the answer already; repeating it here would let a
    # notice gate pass on words drawn nowhere.
    assert said.count(CLAIM) == 0
    assert reading.said_this_turn("just this", None) == "just this"


# ---------------------------------------------------------------------------
# 3. The loop's wiring
# ---------------------------------------------------------------------------

def test_the_tool_is_offered_and_takes_the_board_and_the_reading():
    assert george_loop.FINDING_TOOL not in george_loop.FINDING_TOOL_FUNCTIONS
    schema = next(t for t in george_loop.build_tool_schemas()
                  if t["name"] == george_loop.COMPOSE_TOOL)
    assert set(schema["input_schema"]["properties"]) == {"blocks", "reading"}
    # The reading is optional: a confirmation has nothing to say in three
    # parts, and requiring it would put an empty slot on every such turn.
    assert schema["input_schema"]["required"] == ["blocks"]


def test_the_tool_sits_inside_the_shared_prefix():
    # After every read, before anything injected — so a session with a pin
    # writer and one without share a byte-identical prefix up to the tail.
    bare = [t["name"] for t in george_loop.build_tool_schemas()]
    full = [t["name"] for t in george_loop.build_tool_schemas(include_write=True)]
    assert full[: len(bare)] == bare
    reads = sorted(george_loop.TOOL_FUNCTIONS)
    assert bare == reads + sorted(george_loop.FINDING_TOOL_FUNCTIONS)
    assert george_loop.COMPOSE_TOOL in bare


def test_a_pin_and_a_workflow_can_never_hold_a_reading():
    assert george_loop.COMPOSE_TOOL not in george_loop.TOOL_FUNCTIONS
    from app.services.pin_runner import PinValidationError, validate_call
    with pytest.raises(PinValidationError):
        validate_call({"tool": george_loop.COMPOSE_TOOL, "arguments": {"reading": {}}})


def test_the_schema_has_no_field_but_the_three_slots():
    schema = next(t for t in george_loop.build_tool_schemas()
                  if t["name"] == george_loop.COMPOSE_TOOL)
    said = schema["input_schema"]["properties"]["reading"]
    assert set(said["properties"]) == set(reading.SLOTS)
    assert said["additionalProperties"] is False
    # Bounded in the schema as well as in the validator, so the model is told
    # the length rather than refused for it.
    for name, spec in said["properties"].items():
        assert spec["type"] == "string"
        assert spec["maxLength"] == _DEFS["voice"]["reading"]["slots"][name]["max_length"]


# ---------------------------------------------------------------------------
# 4. The frame, end to end
# ---------------------------------------------------------------------------

SALES = {"group_by": [], "date_range": "last_week", "metric": "net_sales",
         "compare_to": "previous_period", "filters": {"store": "Rockwell"}}


def _frames_of(frames, event):
    out = []
    for f in frames:
        head, _, body = f.partition("\n")
        if head == f"event: {event}":
            out.append(json.loads(body.removeprefix("data: ")))
    return out


def _drive(monkeypatch, replies):
    fake = FakeClient(replies)
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0, "baseline": 2.0, "change_pct": -50.0,
                           "direction": "down", "baseline_status": "ok"}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00",
                          "row_count": 1}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("why is Rockwell down?")]

    return asyncio.run(collect()), fake


def _payload():
    log = StubLog.instances[0]
    answer_sql = [p for sql, p in log.statements if "'answer','george'" in sql]
    assert answer_sql, "no answer post was written"
    return json.loads(answer_sql[0][5])


def test_the_accepted_slots_become_a_frame_and_are_persisted(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.COMPOSE_TOOL,
                  {"reading": {"claim": "Rockwell fell against the week before",
                               "caveat": CAVEAT, "next": NEXT}})],
        [_TextBlock("Rockwell fell against the week before, and it is the only one.")],
    ])
    (frame,) = _frames_of(frames, "reading")
    assert frame["claim"] == "Rockwell fell against the week before"
    assert frame["caveat"] == CAVEAT and frame["next"] == NEXT
    assert frame["rejected"] == []
    payload = _payload()
    assert payload["reading"] == {"claim": frame["claim"], "caveat": CAVEAT, "next": NEXT}


def test_a_refused_slot_is_named_and_the_rest_stand(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.COMPOSE_TOOL,
                  {"reading": {"claim": "Rockwell fell",
                               "next": "Check the 4,120 lines behind it"}})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    (frame,) = _frames_of(frames, "reading")
    assert frame["claim"] == "Rockwell fell" and "next" not in frame
    assert frame["rejected"][0]["slot"] == "next"
    warnings = _frames_of(frames, "warning")
    assert any(w.get("reason") == "reading_rejected" and "next" in w.get("detail", "")
               for w in warnings)


def test_a_later_reading_replaces_an_earlier_one(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.COMPOSE_TOOL, {"reading": {"claim": "one thing"}})],
        [_ToolUse("tu-3", george_loop.COMPOSE_TOOL, {"reading": {"claim": "another thing"}})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    first, second = _frames_of(frames, "reading")
    assert first["claim"] == "one thing" and second["claim"] == "another thing"
    assert _payload()["reading"] == {"claim": "another thing"}


def test_no_reading_means_no_frame_and_no_payload_key(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    assert _frames_of(frames, "reading") == []
    assert "reading" not in _payload()


def test_the_reading_is_never_charted_never_pinnable_and_never_the_receipts(monkeypatch):
    frames, _ = _drive(monkeypatch, [
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.COMPOSE_TOOL, {"reading": {"claim": "Rockwell fell"}})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    results = _frames_of(frames, "tool_result")
    label = next(r for r in results if r["tool"] == george_loop.COMPOSE_TOOL)
    assert label["rows"] == [] and label["rows_complete"] is False
    assert label["pinnable"] is False
    (receipts,) = _frames_of(frames, "receipts")
    assert receipts["source_table"] == "new_transactions"
    payload = _payload()
    assert [c["tool"] for c in payload["calls"]] == ["get_sales"]
    assert [c["tool"] for c in payload["charted"]] == ["get_sales"]


def test_a_caveat_in_its_own_slot_surfaces_the_notice_it_paraphrases(monkeypatch):
    """
    THE ONE REGRESSION THIS CARD COULD HAVE CAUSED. A caveat moved out of the
    paragraph and into its own slot is drawn whole, above the figures — more
    surfaced than it was. A notice gate reading only the paragraph would have
    called it missing and forced a duplicate underneath, which is a trust row
    (notices forced: 0) going backwards for a presentational change.
    """
    kind = "low_stock_not_operational"
    fingerprint = _DEFS["notices"][kind]["must_convey"]
    says = "No " + " ".join(group[0] for group in fingerprint) + " anywhere"

    fake = FakeClient([
        [_ToolUse("tu-1", "get_sales", SALES)],
        [_ToolUse("tu-2", george_loop.COMPOSE_TOOL,
                  {"reading": {"claim": "Rockwell fell", "caveat": says}})],
        [_TextBlock("Rockwell fell against the week before.")],
    ])
    monkeypatch.setattr(george_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(george_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": [{"value": 1.0}],
                 "meta": {"source_table": "new_transactions", "filters_applied": [],
                          "snapshot_timestamp": "2026-09-08T00:00:00+00:00",
                          "row_count": 1,
                          "notice": {"kind": kind,
                                     "message": "no low-stock thresholds are set"}}},
                None, 3)

    monkeypatch.setattr(george_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in george_loop.run("why is Rockwell down?")]

    frames = asyncio.run(collect())
    assert _frames_of(frames, "warning") == [] or not any(
        w.get("reason") in ("notice_forced", "unsurfaced_notice")
        for w in _frames_of(frames, "warning"))
    (done,) = _frames_of(frames, "done")
    assert done["notice_forced"] is False
