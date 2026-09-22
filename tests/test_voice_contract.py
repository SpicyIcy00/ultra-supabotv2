"""
Voice, volunteering and pushback — the prompt contract.

NO DATABASE, NO API. The Anthropic client is replaced with the stub from
test_loop_correction_contract, because what is under test is the LOOP's
behaviour and the PROMPT's content, and the model is exactly the part that
cannot be relied upon to produce either.

WHAT CAN AND CANNOT BE TESTED HERE, STATED PLAINLY.

  Testable   the prompt says the thing; the definitions and the prompt agree;
             the loop counts volunteered lines and spends one corrective turn;
             the vocabularies for "wouldn't" and "can't" are disjoint; a
             second, insisting turn is not blocked.

  NOT        that the model actually writes in the register. No test here
             asserts Bob is dry, and none could. Those are the live samples,
             which are read by a person.

The cap is the honest part of volunteering: it counts lines that ANNOUNCE
themselves and does not verify that a volunteered figure came from a tool
result. metrics.yaml says so in as many words, and so does this file, because a
cap mistaken for provenance would be worse than no cap.
"""

from __future__ import annotations

import pytest

pytest.importorskip("psycopg", reason="agent.loop imports the tools, which import psycopg")
pytest.importorskip("anthropic", reason="agent.loop imports anthropic")

from agent import loop as bob_loop                                    # noqa: E402
from agent.loop import SYSTEM_PROMPT                                     # noqa: E402
from tools._common import load_defs, req                                 # noqa: E402
from tests.test_loop_correction_contract import (                        # noqa: E402
    answer_of,
    drive,
    frames_of,
)

DEFS = load_defs()


# ---------------------------------------------------------------------------
# 1-4. The prompt itself
# ---------------------------------------------------------------------------

def test_the_voice_is_first_person_in_the_definitions() -> None:
    """The register is stated in the definitions the prompt is built from."""
    assert req(DEFS, "voice.person") == "first"


def test_system_prompt_is_byte_stable() -> None:
    """
    Rebuilt from the same definitions, it is the same bytes.

    This is what makes the prompt cacheable: the scope sentence is BUILT at
    import from metrics.yaml, and anything non-deterministic in it — a clock, a
    uuid, a dict iteration order — would invalidate the cached prefix on every
    single request and quietly multiply the bill.
    """
    once = bob_loop._scope_sentence(load_defs())
    twice = bob_loop._scope_sentence(load_defs())
    assert once == twice
    assert SYSTEM_PROMPT.startswith(once)


def test_wit_never_softens_a_caveat_is_stated() -> None:
    """
    The one rule in VOICE that is not style.

    The notice fingerprints are matched against the final answer, so a jokier
    register is precisely what starts failing them. If this sentence is ever
    dropped from the prompt, the enforcement below is all that is left.
    """
    assert req(DEFS, "voice.caveat_is_never_softened") is True


# ---------------------------------------------------------------------------
# 5-7. Volunteering, and the cap the loop actually enforces
# ---------------------------------------------------------------------------

MARKERS = [m for m in req(DEFS, "volunteering.markers") if isinstance(m, str)]
MAX_VOLUNTEERED = req(DEFS, "volunteering.max_per_answer")


def _with_markers(n: int) -> str:
    body = "Rockwell took P48,210 on Wed 2 Sep 2026."
    extras = " ".join(f"{MARKERS[i]}: something else was true." for i in range(n))
    return f"{body} {extras}".strip()


def test_one_volunteered_line_is_left_alone(monkeypatch) -> None:
    """The behaviour is the point of the feature; only excess is corrected."""
    frames, _ = drive(monkeypatch, [_with_markers(1)], question="how did Rockwell do?")
    warnings = [w["reason"] for w in frames_of(frames, "warning")]
    assert "volunteering_over_cap" not in warnings
    assert MARKERS[0] in answer_of(frames)


def test_no_volunteered_line_is_left_alone(monkeypatch) -> None:
    """Saying nothing extra is always allowed. The cap is a ceiling, not a floor."""
    frames, _ = drive(monkeypatch, ["Rockwell took P48,210 on Wed 2 Sep 2026."],
                      question="how did Rockwell do?")
    assert "volunteering_over_cap" not in [w["reason"] for w in frames_of(frames, "warning")]


def test_two_volunteered_lines_are_trimmed_without_a_round_trip(monkeypatch) -> None:
    """
    Over the cap, the extra line is DELETED (P1.h) — no second answer is bought.

    Until 2026-09-14 this cost a whole model round trip: the answer was thrown
    away and rewritten. Deletion is exact and one-way — it cannot introduce a
    figure, a claim or a caveat Bob did not write — and the cap is on what
    he ADDED, so the first volunteered line stays exactly as he wrote it.
    """
    frames, requests = drive(
        monkeypatch,
        [_with_markers(2)],
        question="how did Rockwell do?",
    )
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "volunteering_over_cap"]
    assert len(warnings) == 1
    assert warnings[0]["limit"] == MAX_VOLUNTEERED
    assert warnings[0]["found"] == 2
    assert warnings[0]["corrected"] == "deterministic"
    assert warnings[0]["removed"] == 1

    # The draft on screen is replaced by the edit, not added to.
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == [
        "volunteering_over_cap"
    ]
    standing = _standing_answer(frames)
    assert MARKERS[0] in standing, "the line the cap allows was kept"
    assert MARKERS[1] not in standing, "the line over the cap was not"
    assert "Rockwell took P48,210" in standing, "the answer itself is untouched"

    # AND NOTHING WAS PUT TO THE MODEL. One request answered this turn.
    assert len(requests) == 1
    sent = [m["content"] for req_ in requests for m in req_["messages"]
            if m["role"] == "user" and isinstance(m["content"], str)]
    assert not [c for c in sent if "You volunteered" in c]


def test_a_single_volunteered_line_over_the_cap_still_costs_the_rewrite(monkeypatch) -> None:
    """
    THE EDIT REFUSES TO EMPTY AN ANSWER, and then the model is asked after all.

    An answer that is nothing but volunteered lines cannot be trimmed to
    nothing — so the round trip P1.h removes is not removed here, it is moved
    to the case that needs it. Said out loud because "deterministic" would
    otherwise read as "always".
    """
    only_extras = f"{MARKERS[0]}: one. {MARKERS[1]}: two."
    frames, requests = drive(monkeypatch, [only_extras, _with_markers(1)],
                             question="how did Rockwell do?")
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "volunteering_over_cap"]
    assert len(warnings) == 1 and warnings[0]["corrected"] == "deterministic"
    assert warnings[0]["removed"] == 1, "one of the two went; emptying it is refused"
    assert _standing_answer(frames).startswith(MARKERS[0])


def test_the_volunteering_gate_runs_once_and_costs_nothing(monkeypatch) -> None:
    """
    One pass, then the answer stands — and since P1.h the pass is free.

    The same shape as the notice and pin corrections: a gate, not a loop. The
    budget is the same yaml key that bounded the round trip it replaces.
    """
    over = _with_markers(3)
    frames, requests = drive(monkeypatch, [over], question="how did Rockwell do?")
    warnings = [w for w in frames_of(frames, "warning")
                if w["reason"] == "volunteering_over_cap"]
    assert len(warnings) == req(DEFS, "volunteering.max_corrective_turns") == 1
    assert warnings[0]["removed"] == 2, "the two over the cap went, the first stayed"
    assert len(requests) == 1, "the gate bought no second answer"
    assert _standing_answer(frames)


def test_the_cap_does_not_claim_to_verify_sourcing() -> None:
    """
    The limit, asserted so it cannot be quietly forgotten.

    _volunteered COUNTS announced lines. Nothing in this system checks a
    numeral in prose against a tool result, and a cap mistaken for provenance
    would be more dangerous than no cap at all.
    """
    assert bob_loop._volunteered("Worth knowing: the moon is made of cheese.", DEFS)
    # No numeral anywhere, no tool result anywhere, and it still counts as one.
    assert len(bob_loop._volunteered("Worth noting: nothing.", DEFS)) == 1


# ---------------------------------------------------------------------------
# 8-10. Pushback, which is not refusal
# ---------------------------------------------------------------------------

def test_disagreement_and_refusal_vocabularies_are_disjoint() -> None:
    """
    "I wouldn't" and "I can't" may never be the same phrase.

    This is the distinction the whole section exists to protect: an opinion in
    the language of impossibility takes a decision away from the person whose
    decision it is.
    """
    disagreement = {p.lower() for p in req(DEFS, "pushback.disagreement")}
    refusal = {p.lower() for p in req(DEFS, "pushback.refusal")}
    assert disagreement and refusal
    assert disagreement.isdisjoint(refusal)
    for phrase in disagreement:
        assert not any(phrase in r or r in phrase for r in refusal), phrase


def test_pushback_must_offer_an_alternative() -> None:
    """Pushback with no alternative is an objection, and the definitions say so."""
    assert req(DEFS, "pushback.must_offer_alternative") is True


def test_an_opinion_yields_when_the_user_insists(monkeypatch) -> None:
    """
    Bob says his piece once, then does what he is asked.

    Tested where it is testable: the loop must not block or correct a second
    attempt at the same request. Nothing in the loop may turn a stated opinion
    into a refusal to proceed.
    """
    assert req(DEFS, "pushback.complies_when_insisted") is True
    assert req(DEFS, "pushback.max_restatements") == 1

    history = [
        {"role": "user", "text": "compare last week to yesterday", "tool_calls": []},
        {"role": "bob",
         "text": "I wouldn't compare those two — one is a week and one is a day. "
                 "I'd put yesterday against the same weekday instead.",
         "tool_calls": []},
    ]
    frames, _ = drive(monkeypatch, ["Comparing them as asked: ..."],
                      question="do it anyway")
    assert not [w for w in frames_of(frames, "warning")
                if w["reason"] in {"volunteering_over_cap", "unsurfaced_notice"}]
    assert answer_of(frames)
    # The prior turn is replayable as ordinary history; nothing special-cases it.
    assert bob_loop._seed_history(history, {})


# ---------------------------------------------------------------------------
# The budget (2026-09-12): the prompt is one screen, and the suite says so
# ---------------------------------------------------------------------------

def test_the_prompt_is_within_the_budget_the_definitions_set() -> None:
    """
    AgentIF: 707 real agent prompts average 1,723 words and models already
    perform poorly at that length. The plan set 1,800 and the first carve
    landed at 4,137 without saying so. This holds the number so it cannot go
    unsaid again: anything the prompt would teach past it belongs on the
    tool it describes, where the model reads it at the moment of choosing.
    """
    import re
    budget = req(DEFS, "voice.budget")
    words = len(SYSTEM_PROMPT.split())
    rules = len(re.findall(r"^\s*\d+\. ", SYSTEM_PROMPT, re.M))
    low = SYSTEM_PROMPT.lower()
    prohibitions = low.count("never") + low.count("do not") + low.count("don't")
    assert words <= int(budget["max_words"]), f"{words} words; the budget is {budget['max_words']}"
    assert rules <= int(budget["max_numbered_rules"]), f"{rules} numbered rules"
    assert prohibitions <= int(budget["max_prohibitions"]), f"{prohibitions} prohibitions"


# ---------------------------------------------------------------------------
# The path (2026-09-19): the order of his paragraphs IS the order of the page
# ---------------------------------------------------------------------------

def test_the_path_is_taught_on_compose_and_not_in_the_prompt() -> None:
    """
    P3.o. Since P3.j the room draws his paragraphs in the order he wrote them
    (frontend/src/room/page.ts), and nothing told him so — he was writing
    findings and the room was drawing a path he did not know he was laying.

    The sentence that closes that rides on the `compose` tool, where he reads
    it at the moment he names the three slots, and NOT in the prompt, which is
    at its budget. This holds both halves, because either one alone is a
    regression: in the prompt it costs words the budget has not got, and
    missing from `compose` it is not said at all.
    """
    from agent.loop import _board_addendum                              # noqa: PLC0415

    path = req(load_defs(), "voice.reading.path")
    said = " ".join(str(path["about"]).split())
    addendum = _board_addendum(load_defs())
    assert said in addendum, "the path is not on the compose tool"
    assert said not in SYSTEM_PROMPT, "the path is in the prompt, where it costs budget"
    # The fact it exists to convey, in whatever words it is later rewritten.
    # It said "your paragraphs are the page" for one day; the page is the
    # STEPS since 2026-09-20 and his paragraphs are the conclusion, left.
    assert "steps are the page" in said.lower()
    assert req(path, "steps"), "the path names no steps"


# ---------------------------------------------------------------------------
# The restatement gate (2026-09-12): a figure the board draws is not said again
# ---------------------------------------------------------------------------

import asyncio                                                              # noqa: E402
from agent import prose                                                     # noqa: E402
from tests.test_convergence_cap_contract import FakeClient, _ToolUse         # noqa: E402
from tests.test_loop_correction_contract import StubLog, _TextBlock          # noqa: E402

ROWS = [{"store": "Rockwell", "value": 48210.0}, {"store": "OPUS", "value": 61500.5}]
META = {"source_table": "new_transactions", "filters_applied": [],
        "snapshot_timestamp": "2026-09-11T00:00:00+00:00"}


def _drive_drawn(monkeypatch, texts, rows=ROWS):
    """One read that gets charted, then the scripted answers."""
    fake = FakeClient([[_ToolUse("tu-1", "get_sales", {"group_by": "store", "date_range": "last_week"})]]
                      + [[_TextBlock(t)] for t in texts])
    monkeypatch.setattr(bob_loop.anthropic, "AsyncAnthropic", lambda *a, **k: fake)
    StubLog.instances.clear()
    monkeypatch.setattr(bob_loop, "ConversationLog", StubLog)

    async def fake_read(name, args):
        return ({"rows": list(rows), "meta": {**META, "row_count": len(rows)}}, None, 3)

    monkeypatch.setattr(bob_loop, "_call_tool", fake_read)

    async def collect():
        return [f async for f in bob_loop.run("how did the shops do?")]

    return asyncio.run(collect()), fake.messages.requests


def _standing_answer(frames) -> str:
    """The text after the last reset — the answer that stands, not every draft."""
    out = []
    for f in frames:
        head, _, rest = f.partition("\n")
        if head == "event: answer_reset":
            out = []
        elif head == "event: text":
            import json as _json
            out.append(_json.loads(rest.partition("data: ")[2]).get("delta", ""))
    return "".join(out)


# ONE SENTENCE CARRYING THE FIGURE ITS CLAIM IS ABOUT. Allowed since P1.c
# (2026-09-14): everything Bob reads is drawn, so at 0 every figure he could
# cite was corrected out and the standing answers carried none at all.
CLAIM = "OPUS took ₱61,500.50 last week, and that is the week — Rockwell never got close."
# ONE PAST THE ALLOWANCE, WHICH IS THE RECITATION THE GATE IS FOR. Since
# 2026-09-18 a finding may carry its figure — one sentence per finding, up to
# presentation.findings_max — so reciting the board is the sentence past that:
# here the fifth, walking rows already drawn and said.
RECITING = ("Rockwell took ₱48,210 last week. OPUS took ₱61,500.50. "
            "That leaves Rockwell at ₱48,210. And OPUS at ₱61,500.50. "
            "Once more, OPUS took ₱61,500.50. Rockwell is the one to watch.")
READING = "OPUS carried the week and Rockwell did not; the split is on the board. Worth a look at OPUS's products?"


def test_the_gate_is_a_definition_and_the_evals_measure_with_the_same_function() -> None:
    r = req(DEFS, "voice.restatement")
    # One figure-sentence per finding (2026-09-18), held to the findings bound.
    assert r["max_restated_sentences"] == req(DEFS, "investigation.scope.presentation.findings_max")
    assert r["max_corrective_turns"] == 1
    assert r["warning_reason"] == "restated_figure"
    from tests.evals import checks, voice_checks
    assert checks.allowed_numbers is prose.allowed_numbers
    assert voice_checks.restated_sentences(RECITING, [{"rows": ROWS, "meta": META}]) == \
        prose.restated_sentences(RECITING, [{"rows": ROWS, "meta": META}])
    assert len(prose.restated_sentences(RECITING, [{"rows": ROWS, "meta": META}])) == 5
    assert len(prose.restated_sentences(CLAIM, [{"rows": ROWS, "meta": META}])) == 1
    assert prose.restated_sentences(READING, [{"rows": ROWS, "meta": META}]) == []


def test_a_recitation_of_the_board_costs_nothing_now(monkeypatch) -> None:
    """
    THE CARD'S WHOLE NUMBER (P1.h). This gate was 6, 7 and 6 of the 8, 7 and 7
    corrective round trips in the three most recent recorded runs. The recited
    sentence is deleted instead, and the answer is not bought twice.
    """
    frames, requests = _drive_drawn(monkeypatch, [RECITING])
    warnings = [w for w in frames_of(frames, "warning") if w["reason"] == "restated_figure"]
    limit = req(DEFS, "voice.restatement.max_restated_sentences")
    assert len(warnings) == 1 and warnings[0]["found"] == 5 and warnings[0]["limit"] == limit
    assert warnings[0]["corrected"] == "deterministic" and warnings[0]["removed"] == 1
    assert [r["reason"] for r in frames_of(frames, "answer_reset")] == ["restated_figure"]
    standing = _standing_answer(frames)
    # THE ALLOWANCE IS WHAT KEEPS A FIGURE ON SCREEN. P1.c raised it 0 -> 1
    # because a reading with no figure in it is its own failure; the edit keeps
    # the first restating sentence for the same reason and drops the recitation.
    assert "48,210" in standing and "61,500.50" in standing, "each finding kept its figure"
    assert "Once more" not in standing, "the sentence past the allowance did not"
    assert "Rockwell is the one to watch." in standing, "the reading is untouched"
    assert len(prose.restated_sentences(standing, [{"rows": ROWS, "meta": META}])) == limit
    # And nothing was put to the model: the read and the answer, nothing more.
    assert len(requests) == 2
    sent = [m["content"] for req_ in requests for m in req_["messages"]
            if m["role"] == "user" and isinstance(m["content"], str)]
    assert not [c for c in sent if "board already draws" in c]


def test_the_figure_a_claim_is_about_is_not_corrected(monkeypatch) -> None:
    """
    THE DECISION P1.c MADE, held here. A reading may carry the figure its claim
    is about; reciting the board may not. At 0 those were the same thing — the
    gate rewrote every cited figure out, and the P1.g gate run found all four
    scenarios answering with no figure at all, which the suite calls a shrug.
    """
    frames, _ = _drive_drawn(monkeypatch, [CLAIM])
    assert "restated_figure" not in [w["reason"] for w in frames_of(frames, "warning")]
    assert answer_of(frames) == CLAIM
    assert "61,500.50" in answer_of(frames), "the answer kept the figure it is about"


def test_a_reading_over_drawn_figures_is_left_alone(monkeypatch) -> None:
    frames, _ = _drive_drawn(monkeypatch, [READING])
    assert "restated_figure" not in [w["reason"] for w in frames_of(frames, "warning")]
    assert answer_of(frames) == READING


def test_the_restatement_gate_runs_once_per_turn(monkeypatch) -> None:
    frames, requests = _drive_drawn(monkeypatch, [RECITING])
    warnings = [w for w in frames_of(frames, "warning") if w["reason"] == "restated_figure"]
    assert len(warnings) == req(DEFS, "voice.restatement.max_corrective_turns") == 1
    assert len(requests) == 2, (
        "the read and the answer; the gate is a pass over the text, not a round trip")


def test_the_edit_never_takes_a_caveat_off_the_screen(monkeypatch) -> None:
    """
    THE GUARD THAT MATTERS. A sentence can both recite a drawn figure AND be
    the only place a notice is surfaced; deleting it would trade a caveat for
    a style rule, and notices surfaced is a floor. So it stays, and the gate
    reports that nothing could go.
    """
    from agent import loop as _loop
    # "C." is the only place the caveat is surfaced, so it stays whatever
    # else goes: the guard refuses the drop rather than reporting it.
    kept = _loop._drop_safely("A. B. C.", ["B.", "C."], lambda text: "C." in text)
    assert kept == ("A. C.", ["B."])


def test_the_edit_never_empties_the_answer() -> None:
    from agent import loop as _loop
    assert _loop._drop_safely("Only this.", ["Only this."], lambda _t: True) == (
        "Only this.", [])


def test_the_edit_never_strands_a_sentence_that_points_back() -> None:
    """P2S.7: verification/p2s6-gate-2.json `caveats` — the sentence under
    "That's a bookkeeping problem" was deleted and left it about nothing."""
    from agent import loop as _loop
    text = ("The rest of what that plan asks for I wouldn't trust. 99 of 456 "
            "lines have negative stock. That's a bookkeeping problem, not a "
            "shelf problem.")
    out, dropped = _loop._drop_safely(text, ["99 of 456 lines have negative stock."],
                                      lambda _t: True)
    assert dropped == [] and out == text


def test_the_edit_never_breaks_a_count_it_was_announced_with() -> None:
    """P2S.7: verification/p2s6-gate.json `analyze` — "Two things temper the
    size of the drop." with both things deleted under it."""
    from agent import loop as _loop
    text = ("Two things temper the size of the drop. OPUS fell 44,114. Magnolia "
            "fell 11,785. Magnolia and North Edsa I'd leave alone.")
    out, dropped = _loop._drop_safely(text, ["OPUS fell 44,114.", "Magnolia fell 11,785."],
                                      lambda _t: True)
    assert dropped == [] and out == text


def test_a_sentence_nothing_leans_on_still_goes() -> None:
    from agent import loop as _loop
    text = "OPUS is the shop that moved. It fell 15.9% to 467,102. Greenhills held."
    out, dropped = _loop._drop_safely(text, ["It fell 15.9% to 467,102."], lambda _t: True)
    assert dropped == ["It fell 15.9% to 467,102."]
    assert out == "OPUS is the shop that moved. Greenhills held."


def test_the_edit_never_removes_what_a_paragraph_opens_with() -> None:
    """P2S.7, verification/p2s7-gate-2.json `morning`: the barn's negative
    count went, and the paragraph's explanation of it stayed, about nothing."""
    from agent import loop as _loop
    text = ("North Edsa is the thing today.\n\nF9 at the barn went from 4,703 to "
            "-297. A negative count is a receiving or counting error, not an empty shelf.")
    out, dropped = _loop._drop_safely(text, ["F9 at the barn went from 4,703 to -297."],
                                      lambda _t: True)
    assert dropped == [] and out == text


def test_a_deleted_sentence_leaves_the_rest_byte_for_byte() -> None:
    from agent import loop as _loop
    text = "First one. Second one. Third one."
    out = _loop._without_sentences(text, ["Second one."])
    assert out == "First one. Third one."


def test_a_figure_with_nothing_drawn_is_not_gated(monkeypatch) -> None:
    """No result on the board means nothing on screen to restate; the numeral rules stay the evals'."""
    frames, _ = drive(monkeypatch, ["Rockwell took P48,210 on Wed 2 Sep 2026."], question="how did Rockwell do?")
    assert "restated_figure" not in [w["reason"] for w in frames_of(frames, "warning")]


def test_the_client_treats_the_warning_as_process_not_caveat() -> None:
    from pathlib import Path
    # PROCESS moved to room/data.ts with P1.k: the count of caveats on the
    # work line has to leave out exactly what the region above the board does.
    src = Path(__file__).resolve().parents[1].joinpath("frontend/src/room/data.ts").read_text(encoding="utf-8")
    assert "'restated_figure'" in src.split("const PROCESS")[1].split(";")[0]


# ---------------------------------------------------------------------------
# A notice is written for the person reading it (voice.plain, 2026-09-20)
# ---------------------------------------------------------------------------

def test_no_tool_notice_speaks_in_the_instrument_s_words() -> None:
    """
    THE HOLE voice.plain LEFT, found on a live turn the day it shipped. The
    rule is taught on `compose`, so it governs what Bob WRITES — his claims,
    his thoughts, his prose. A tool's notice is none of those: it is written in
    Python, surfaced above the answer by UI rule 4, and read by the owner as
    though Bob had said it. One of them said *"449 stock records in this window
    are NEGATIVE, the lowest -26,170"* directly above his headline.

    A HEURISTIC, AND IT SAYS SO. This reads the source rather than running the
    notices, because building one needs a database. It scans the message text
    of every `notices.append` block for the instrument words, which catches the
    class that failed; a message assembled from a variable would slip through,
    and that is the bound on what this proves.
    """
    import re
    from pathlib import Path

    banned = {w.lower() for w in req(load_defs(), "voice.plain.instrument_words")}
    tools = Path(__file__).resolve().parents[1] / "tools"
    offenders: list[str] = []
    for path in sorted(tools.glob("*.py")):
        src = path.read_text(encoding="utf-8")
        for block in re.findall(r'"message":\s*\(((?:[^()]|\([^()]*\))*)\)', src, re.S):
            said = " ".join(re.findall(r'"([^"]*)"', block)).lower()
            for word in banned:
                if re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", said):
                    offenders.append(f"{path.name}: {word!r} in {said[:70]!r}")
    assert not offenders, (
        "a notice is drawn to the person above the answer (UI rule 4), so it is held to "
        "voice.plain like everything else he says:\n  " + "\n  ".join(offenders))


def test_the_prompt_says_he_writes_a_page() -> None:
    """
    P12, 2026-09-21. The owner, reading the answers: *"the way it answers it
    still doesnt know it can generate pages."*

    It did not. Every word in the prompt about the surface was the board
    era's — *"The right of the screen is your reasoning: each block you
    compose is a STEP — the question it answered, your claim answering it,
    the figure"* — and the page existed only in the `compose` tool's
    description, which he reads at the moment he composes, long after he has
    decided what to read and what to say. What a model is told it is making
    is what it makes.
    """
    assert "A PAGE YOU WRITE" in SYSTEM_PROMPT
    assert "each block you compose is a STEP" not in SYSTEM_PROMPT
    # And WHAT a page is, in the parts the room actually draws.
    for part in ("opening sentence", "headings", "paragraphs", "beside"):
        assert part in SYSTEM_PROMPT, f"the prompt does not say a page has {part}"
    # REWRITTEN 2026-09-22 (W1.1, DECISIONS "the answer is the size of the
    # question", which reverses the P12/P14 recipe that every answer is a
    # page): the page is the BROAD answer's, and the prompt says so — a lookup
    # is a sentence and a focused answer offers the page rather than making it.
    # "THE PAGE CARRIES THE FIGURES AND THE REASONING" said the opposite of a
    # lookup and left the prompt with the board era's section.
    assert "THE ANSWER IS THE SIZE OF THE QUESTION" in SYSTEM_PROMPT
    assert "BROAD — the business as a whole, or the page asked for — is A PAGE YOU WRITE" \
        in SYSTEM_PROMPT
    assert "the page is offered, not made" in SYSTEM_PROMPT
    assert "THE PAGE CARRIES THE FIGURES AND THE REASONING" not in SYSTEM_PROMPT
