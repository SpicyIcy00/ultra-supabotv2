"""
The voice evals, second cut — 2026-09-13.

WHY THERE IS A SECOND FILE. The first twelve are not deleted by this commit.
They are the record every Phase 0 and Phase 1 number was measured against, and
a suite that replaces them has to be shown to be better on a run where both
are present. Delete `test_voice_evals.py` in the card that does that, not here.

WHAT WAS WRONG WITH THE FIRST TWELVE, measured rather than asserted:

  1. Nothing checked that Bob ANSWERED. Fed "I cannot establish that from
     these reads" with no tool calls, the suite passed it on all seven of its
     checks. Every assertion was about form and honesty, so a Bob that
     shrugs at everything scored full marks — and the trust machinery pushes
     him toward exactly that. `checks.grounded_numerals` is the fix and
     `expects_figure` is where it is applied.
  2. Three of the twelve carried little. `shop` and `product` are the same
     shape (entity lookup); `by-hour` matches nothing anyone has ever asked.
     `shop` is not dropped — it becomes the thread's opening turn, where it
     earns its cost twice.
  3. The register was wrong. The evals asked "How is Rockwell doing?"; the
     owner types "how about rockwell". Every question below outside the gate
     is taken from `george.conversations`.

AND THE COST, which is the reason the shape changed. The old suite ran 16
live turns for 12 scenarios: "How is Rockwell doing?" was asked FOUR times
(scored once, then re-run as the setup for follow-up, correction and
keep-page), and the Seikyo draft twice. Here the setup turns are shared, so
11 turns cover 11 scenarios — about 31% cheaper per full run, and the thread
is a real conversation rather than five cold starts, which is also closer to
how Bob is actually used.

    pytest tests/evals/test_voice_evals_v2.py -m gate   # 5 turns, ~$1.20 (P2S.6 added the fifth)
    pytest tests/evals/test_voice_evals_v2.py           # 11 turns, ~$1.15

THE GATE'S FOUR SCENARIOS ARE UNCHANGED FROM THE FIRST TWELVE, wording
included. They are stable across every recorded run, they are the only rows
meaningful from a single draw, and each catches something no other scenario
does. Changing them would forfeit the one comparison that carries over.
"""
from __future__ import annotations

import json
import os

import pytest

from tests.evals import checks, timing
from tests.evals import voice_checks as voice
from tests.evals.harness import Report, required, run_turn, say, turn_usd
from tests.evals.test_page_workshop_evals import FakeWriter
from tools._common import load_defs, req

DEFS = load_defs()

from agent import loop as bob_loop
from agent import reading as bob_reading

MAX_ITERATIONS = bob_loop.MAX_ITERATIONS
STRICT = os.environ.get("GEORGE_VOICE_STRICT") == "1"

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    say("\n\n== voice evals v2 ==")
    n = max(len(report.records), 1)
    lead = sum(int(r["findings"]["leads_with_reading"]) for r in report.records)
    cited = sum(int(bool(r["findings"].get("grounded_numerals"))) for r in report.records)
    rate = lambda key: sum(int(bool(r["findings"].get(key))) for r in report.records)
    calls = sum(len(r.get("calls") or []) for r in report.records)
    labels = sum(int(r["findings"].get("label_calls") or 0) for r in report.records)
    refused = sum(int(bool(r["findings"].get("compose_rejected"))) for r in report.records)
    out = report.outcome()
    say(f"  scenarios {n} · live turns {LIVE_TURNS['n']}")
    # WHETHER IT PASSED, first, because it is the question (P2.0). Every
    # number below is a rate that means nothing if a scenario blew up.
    say(f"  OUTCOME  {out['passed']}/{out['scenarios']} scenarios passed"
          + (f" · failed {', '.join(out['failed'])}" if out["failed"] else "")
          + (f" · unscored {', '.join(out['unscored'])}" if out["unscored"] else ""))
    say(f"  TRUST (pass/fail, meaningful from one run):")
    say(f"    every scenario that asked for a figure cited one: see failures above")
    say(f"  THE BOARD (P1.f's own numbers):")
    say(f"    questions where compose was refused  {refused}/{n}   target ≤ 1")
    say(f"    label calls as a share of all calls  {labels}/{calls} "
          f"({100 * labels / max(calls, 1):.0f}%)   target not worse than 33%")
    say(f"  THE READING (a rate, not a gate):")
    say(f"    said a claim          {rate('has_claim')}/{n}")
    say(f"    the claim was lit     {rate('claim_lit')}/{n}")
    say(f"    said what is next     {rate('has_next')}/{n}")
    say(f"  STYLE (a rate, not a gate — compare with the last run):")
    say(f"    leads with a reading  {lead}/{n} ({100 * lead / n:.0f}%)")
    say(f"    cited a real figure   {cited}/{n} ({100 * cited / n:.0f}%)")
    if path:
        say(f"  report: {path}")


@pytest.fixture(scope="module")
def monkeypatch_module():
    """
    A module-scoped monkeypatch, because the thread and the build fixtures are
    module-scoped and pytest's own `monkeypatch` is function-scoped. Without
    this the shared turns cannot exist, and without shared turns the suite is
    back to re-asking the same question four times.
    """
    mp = pytest.MonkeyPatch()
    yield mp
    mp.undo()


LIVE_TURNS = {"n": 0}


def _turn(monkeypatch, question, **kw):
    LIVE_TURNS["n"] += 1
    return run_turn(monkeypatch, question, **kw)


def _reading_of(turn: checks.Turn) -> dict:
    """
    The three slots this turn said, off the `reading` frames (P1.f).

    The LAST one wins, exactly as the client's does: a later compose is the
    model refining one reading, not adding a second.
    """
    said: dict = {}
    for event, data, _at in turn.frames:
        if event == "reading":
            said = {k: v for k, v in data.items()
                    if k in ("claim", "caveat", "next") and isinstance(v, str)}
    return said


def _voice(name: str, turn: checks.Turn, *, extra_results: list | None = None,
           expect_refusal: bool = False, expects_figure: bool = True) -> dict:
    results = [r["result"] for r in turn.results if not r["error"]] + list(extra_results or [])
    f = voice.voice_findings(turn.answer, results, notices=len(turn.notices))
    # WHETHER THE READING HAS ITS THREE PARTS (P1.f). A rate and not a gate,
    # for v2's stated reason: what Bob chooses to say flaps run to run, and
    # a single draw of it is noise. `claim_lit` is the one that matters most —
    # a claim he did not say lights nothing, and the surface draws the reading
    # whole instead.
    said = _reading_of(turn)
    f["reading"] = said
    f["has_claim"] = bool(said.get("claim"))
    f["has_next"] = bool(said.get("next"))
    f["claim_lit"] = bob_reading.was_said(turn.answer, said.get("claim"))
    f["compose_rejected"] = [w.get("detail") for w in turn.warnings
                             if w.get("reason") == "composition_rejected"]
    f["label_calls"] = len([c for c in turn.calls
                            if c.get("tool") == bob_loop.COMPOSE_TOOL])
    # WHAT HE SAYS IS EVERYTHING THE ROOM DRAWS (2026-09-22). Since the answer
    # is the size of the question, a lookup's answer is its claim alone and its
    # figures sit in the caveat and next slots, which Reading.tsx draws above
    # and below it. Both numeral checks read all three: a figure there is said,
    # and an invented one there is caught.
    drawn = " ".join([turn.answer] + [" ".join(map(str, v)) if isinstance(v, list) else str(v)
                                      for v in (said.get("caveat"), said.get("next")) if v])
    f["ungrounded_numerals"] = [x.text for x in checks.ungrounded_numerals(drawn, results)]
    f["grounded_numerals"] = [x.text for x in checks.grounded_numerals(drawn, results)]
    f["internal_vocabulary"] = checks.internal_vocabulary(turn.answer)
    f["limitation"] = checks.limitation_statement(drawn)
    f["attribution"] = checks.attribution_claims(turn.answer, results)
    f["refused_calls"] = [c.get("tool") for c in turn.calls if c.get("error")]
    # P2S.7's rows, read off the turn at no cost: a refusal that was not about
    # truth, the board building, what the turn cost.
    f["refused_for_ceremony"] = checks.refused_for_what_is_not_truth(turn.warnings, turn.calls)
    f["board_growth"] = timing.board_growth(turn.frames, turn.done)
    f["turn_usd"] = round(turn_usd(turn), 4)
    # The carried rows go ON THE RECORD, not just into the checks: a thread's
    # later turn cites figures its earlier turns read, and a report without
    # them makes `corpus.py` report ungrounded numerals the run did not.
    report.add(name, turn, f, None, extra_results=list(extra_results or []))

    # --- TRUST. These are the rows that mean something from one run. --------
    assert turn.done.get("status") == "ok", (turn.warnings, turn.answer[:300])
    assert turn.answer, "no answer"
    assert turn.done["iterations"] <= MAX_ITERATIONS, turn.done
    # READS, as the loop's own cap counts them since 2026-09-18 — a compose,
    # a view or a pin is not searching. p2s6-gate.json's `analyze` made 11
    # reads and 2 composes, inside the loop's budget and outside this check
    # while it still counted every call; the check followed the definition.
    # And since P2S.10 in CALLS, as the cap counts them: a get_change is one
    # decision and seven reads (checks.asked_reads).
    reads = checks.asked_reads(turn.calls)
    assert reads <= bob_loop.MAX_TOOL_CALLS, (reads, turn.done)
    assert turn.done.get("notice_forced") is False, "a notice had to be forced into the answer"
    assert not f["ungrounded_numerals"], f"figures no tool returned: {f['ungrounded_numerals']}"
    assert not f["internal_vocabulary"], f"internal vocabulary: {f['internal_vocabulary']}"
    assert not f["attribution"], f"a share of the change, which no tool computed: {f['attribution']}"
    # P2S.7: nothing refused for a length, an emphasis count or a subject the
    # read is filtered to — each is coerced now — and nothing drawn moves.
    assert not f["refused_for_ceremony"], f"refused for what is not truth: {f['refused_for_ceremony']}"
    assert not f["board_growth"]["moved"], f"something drawn earlier moved: {f['board_growth']['moved']}"

    # THE ASSERTION THE FIRST TWELVE DID NOT HAVE. A question that asks for a
    # figure is not answered by prose about what cannot be established.
    if expects_figure:
        assert f["grounded_numerals"], (
            "he cited no figure any tool returned — the answer is a shrug:\n"
            f"{turn.answer[:400]!r}")

    if expect_refusal:
        low = drawn.lower()   # every slot the room draws, as the numeral checks read
        said_no = any(ph.lower() in low for ph in req(DEFS, "pushback.refusal"))
        assert f["refused_calls"] or f["limitation"] or said_no, "he should have said what he cannot tell"

    # --- STYLE. A RATE, NOT A GATE. These flapped on every recorded run and
    # `leads_with_reading` was every non-trust failure across four of them.
    # They are reported above and only assert under GEORGE_VOICE_STRICT=1.
    if STRICT:
        assert f["leads_with_reading"], f"led with a figure: {turn.answer[:160]!r}"
        assert f["paragraphs"] <= f["paragraph_budget"], (
            f"{f['paragraphs']} paragraphs for {f['notices']} caveats")
        assert f["restated_sentences"] <= 1, "restates the board"
        assert f["closing_offers"] <= 1, "ends with a menu, not an offer"
    return f


# =============================================================================
# TIER 1 — THE GATE. Five turns, ~$1.20 since P2S.6 (four were $0.72). Run on
# every model-facing card.
# The first four are unchanged from the first twelve, wording included; the
# fifth is his most common question (P2S.6). Each catches something
# no other scenario does; together they are every failure that has mattered.
# =============================================================================

@pytest.mark.gate
def test_gate_1_caveats(monkeypatch):
    """A notice unsurfaced, or forced in after corrections."""
    turn = _turn(monkeypatch, "What is running low at Greenhills?")
    _voice("caveats", turn)


@pytest.mark.gate
def test_gate_2_why(monkeypatch):
    """A figure no tool returned, and attribution shares. Caught "and 45 others"."""
    turn = _turn(monkeypatch, "Why was North Edsa up so much last week?")
    _voice("why", turn)


@pytest.mark.gate
@pytest.mark.core          # the owner's core question 4 (ops/EVAL_QUESTIONS.md)
def test_gate_3_cannot(monkeypatch):
    """A refusal that stopped refusing. Expects NO figure, by design."""
    turn = _turn(monkeypatch, "What was the foot traffic at Rockwell last week?")
    _voice("cannot", turn, expect_refusal=True, expects_figure=False)
    # P2S.7: saying a transaction is NOT a person is the refusal working.
    assert "transaction_wording" not in [w.get("reason") for w in turn.warnings], turn.answer


@pytest.mark.gate
def test_gate_4_morning(monkeypatch):
    """The volunteering cap, and the rounded-figure gate. Caught the "801"."""
    turn = _turn(monkeypatch, "What should I look at today?")
    _voice("morning", turn)


def _broad(turn: checks.Turn, f: dict) -> None:
    """
    A broad answer found WHERE the movement sits (P2S.6), read off the call
    arguments, and what the turn cost, read off the done frame and recorded.
    Neither costs anything to check.
    """
    loc = checks.localizing_reads(turn.calls)
    # COST IS REPORTED, NEVER ASSERTED (2026-09-18). A $0.50 ceiling was set
    # here the same morning and the owner withdrew it: "cost should not hold
    # us back in functionality, i just want to optimize cost not make our
    # bob work worse". The figure goes on the record for the close-out.
    f["localizing_reads"] = [c.get("arguments") for c in loc]
    f["turn_usd"] = round(turn_usd(turn), 4)
    # ONE READ THAT ALREADY HAS THE PICTURE (W1.3, 2026-09-22). The card's
    # done-when reverses the shape P2S.6/P2S.7 held here — the headline by
    # store drawn first, then localizing reads landing before the final
    # round: a broad question is now ONE read, get_overview, whose findings
    # are the shops, the days and the lines already localized, and two
    # rounds. So when the overview answered, what is held is that its
    # findings localize and that the answer names what carried the change
    # from the overview's own row; the reads and rounds are recorded as the
    # card's measure, never asserted — one run is a sample.
    # Asked as one call since 2026-09-22 (after wave 1): its findings arrive as
    # the get_overview_findings read, beside the parts a page draws.
    overview = [r for r in turn.results
                if r["tool"] in ("get_overview", "get_overview_findings") and not r["error"]]
    if overview:
        rows = [row for r in overview for row in (r["result"] or {}).get("rows") or []]
        f["overview_asked_reads"] = checks.asked_reads(turn.calls)
        f["overview_rounds"] = turn.done.get("iterations")
        f["overview_iteration_ms"] = turn.done.get("iteration_ms")
        f["overview_carriers"] = checks.overview_carriers(
            turn.answer + " " + json.dumps(_reading_of(turn)), [r["result"] for r in overview])
        say(f"  overview: {f['overview_asked_reads']} read(s), {f['overview_rounds']} rounds "
            f"{f['overview_iteration_ms']}, carrier {f['overview_carriers']}")
        assert any(row.get("finding") in ("shop", "concentration") for row in rows), (
            "the overview returned no shop or concentration finding to localize with")
        return
    assert loc, ("a broad answer read by store and nothing under it — "
                 f"{[c.get('arguments') for c in turn.read_calls]}")
    # P2S.7: THE FIGURES FIRST, AND THEN IT BUILDS. The first thing drawn is
    # the shops, and at least one deeper block lands before the final round.
    growth = f["board_growth"]
    first = next((data for event, data, _at in turn.frames
                  if event == "compose" and data.get("blocks")), {})
    by_seq = {c.get("seq"): c for c in turn.calls}
    f["first_drawn"] = [(by_seq.get(b.get("seq")) or {}).get("arguments") for b in first.get("blocks") or []]
    assert any("store" in str((a or {}).get("group_by")) for a in f["first_drawn"]), f["first_drawn"]
    assert growth["deeper_before_final"], f"nothing new was drawn before the final round: {growth}"


@pytest.mark.gate
@pytest.mark.core          # the owner's core question 1 (ops/EVAL_QUESTIONS.md)
def test_gate_5_how_are_we_doing(monkeypatch):
    """
    His most common question, added to the gate by P2S.6: a broad question
    finds where the movement sits in the same turn, rather than handing
    "why?" back as a question to tap.
    """
    turn = _turn(monkeypatch, "how are we doing?")
    _broad(turn, _voice("broad", turn))


# =============================================================================
# CORE — the owner's own questions (ops/EVAL_QUESTIONS.md, 2026-09-18: "just
# keep main questions that you need to know to make sures its functional").
# Questions 1 and 4 are the gate's broad and cannot, marked core above.
# Question 3 — the per-gram instruction, then "how are our products?" — is
# P2S.11's done-when and is written with the memory seam that card builds.
# Every RUBRIC line is read by a person off the report; the CLOCK is recorded,
# never asserted.
# =============================================================================

def _core_only(request) -> None:
    """
    The two core questions the full run does not already ask run only under
    -m core, so the full run stays the eleven turns its measured $1.51 is for.
    """
    if "core" not in (request.config.getoption("markexpr") or ""):
        pytest.skip("a core question: run with -m core")


@pytest.mark.core
def test_core_2_a_premise(monkeypatch, request):
    """Judgment: yes or no, and disagreeing when the data says so (RUBRIC)."""
    _core_only(request)
    turn = _turn(monkeypatch, "I think Rockwell is our biggest problem. Am I right?")
    f = _voice("premise", turn)
    f["reads"] = [c.get("arguments") for c in turn.ok_calls]


def _pages(turn: checks.Turn) -> list:
    """Every arrangement the turn's compose frames carried — a page, when non-empty."""
    return [data.get("arrangement") for event, data, _at in turn.frames
            if event == "compose" and data.get("arrangement")]


def _sized(turn: checks.Turn, f: dict) -> None:
    """
    THE ANSWER IS THE SIZE OF THE QUESTION (W1.1, 2026-09-22): a narrow question
    is not a page, and the size it was held to is on the done frame. The clock
    is recorded, never asserted — the card's targets are measured over runs.
    """
    f["size"] = {"answer": turn.done.get("answer_size"), "ceiling": turn.done.get("size_ceiling")}
    f["clock"] = {"duration_ms": turn.done.get("duration_ms"),
                  "iterations": turn.done.get("iterations"),
                  "iteration_ms": turn.done.get("iteration_ms")}
    offer = req(DEFS, "composition.size.kinds.focused.offer")
    asks = [data.get("asks") or [] for event, data, _at in turn.frames if event == "reading"]
    f["offered_the_page"] = any(offer in a for a in asks)
    assert turn.done.get("size_ceiling") != "broad", turn.done
    assert not _pages(turn), f"a narrow question was answered as a page: {_pages(turn)}"


@pytest.mark.core
def test_core_5_a_simple_lookup_is_fast(monkeypatch, request):
    """Simple is fast: one or two reads, every figure from one (AUTO); the clock is reported."""
    _core_only(request)
    turn = _turn(monkeypatch, "Net sales by store yesterday")
    f = _voice("simple", turn)
    f["asked_reads"] = checks.asked_reads(turn.calls)
    _sized(turn, f)
    assert f["asked_reads"] <= 2, f"{f['asked_reads']} reads for a lookup"


# =============================================================================
# DEPTH — written by P2.m (2026-09-16) and first run by P2S.6. One asks for
# the work in a verb that is not "why"; the other is a lookup, which is
# explained only if it moved. Opt-in with -m depth.
# =============================================================================

@pytest.mark.depth
def test_depth_1_analyze(monkeypatch):
    """Taken apart: the read it names, then the one it cannot show."""
    turn = _turn(monkeypatch, "analyze tradsnax per store")
    f = _voice("analyze", turn)
    f["reads"] = [c.get("arguments") for c in turn.ok_calls]
    floor = int(req(DEFS, "investigation.scope.kinds.focused.taken_apart.min_reads"))
    assert len(turn.ok_calls) >= floor, f"{len(turn.ok_calls)} reads for a message taken apart"


@pytest.mark.depth
def test_depth_2_lookup(monkeypatch):
    """A lookup: the read it names, and under it only if it moved."""
    turn = _turn(monkeypatch, "how did Rockwell do?")
    f = _voice("lookup", turn)
    f["reads"] = [c.get("arguments") for c in turn.ok_calls]
    # "How did Rockwell do", 2026-09-21: six refusals of a single-store
    # comparison sent as `group_by: "[]"` (W1.1). None now.
    assert not [c for c in turn.calls if c.get("error") and "cannot be grouped by" in c["error"]]
    _sized(turn, f)


@pytest.mark.replay
def test_replay_the_dashboard_turn(monkeypatch, request):
    """
    THE DASHBOARD TURN OF 2026-09-21 15:37, replayed (W1.1's Done-when). Its
    headline was his reply to the notice gate — "The caveat needs the magnitude
    and it belongs beside the counts it qualifies…" — over a forced box that
    listed one notice twice, a page with a dash where a figure was, and a stock
    total below zero. Replayed: a headline that is an answer, no forced box, no
    reference to a figure this turn did not compose, and no negative total.

    AND SINCE W2.4 (2026-09-22) IT IS NOT A REPORT AT ALL. "Build me a
    dashboard" builds a kept page (create_page) and the room opens it; this
    held the dashboard as a broad page of prose until then. So: one page built,
    no report page composed — and the W1.1 checks that still apply.
    """
    if "replay" not in (request.config.getoption("markexpr") or ""):
        pytest.skip("a replay: run with -m replay")
    writer = FakeWriter(title="Dashboard")
    turn = _turn(monkeypatch, "build me a dashboard", page_writer=writer)
    f = _voice("dashboard", turn, expects_figure=False)
    f["built"] = len(writer.builds)
    assert len(writer.builds) == 1, f"a dashboard request built {len(writer.builds)} kept pages"
    assert not _pages(turn), f"a dashboard request wrote a report page: {_pages(turn)}"
    f["clock"] = {"duration_ms": turn.done.get("duration_ms"),
                  "iterations": turn.done.get("iterations"),
                  "iteration_ms": turn.done.get("iteration_ms")}
    head = turn.answer.split("\n")[0]
    f["headline"] = head
    assert "added automatically" not in turn.answer, "a forced box"
    assert not [w for w in turn.warnings if w.get("reason") == "unsurfaced_notice"]
    assert not any(w in head.lower() for w in ("caveat needs", "rewrite", "restating")), head
    said = [(n.get("kind"), n.get("message")) for n in turn.notices]
    assert len(said) == len(set(said)), "a notice listed twice"
    # Every {key} on the page names a figure THIS turn composed.
    import re as _re
    composed: set = set()
    for event, data, _at in turn.frames:
        if event == "compose":
            composed |= {b.get("key") for b in data.get("blocks") or []}
    refs: set = set()

    def walk(node):
        if isinstance(node, dict):
            for leaf in ("lede", "head", "say", "note"):
                if isinstance(node.get(leaf), str):
                    refs.update(m.group(1) for m in _re.finditer(r"\{([a-z0-9][a-z0-9_-]*)", node[leaf]))
            for kid in node.get("children") or []:
                walk(kid)
    for page in _pages(turn):
        walk(page)
    assert refs <= composed, f"a figure in a sentence names nothing this turn drew: {refs - composed}"
    # No grouped stock total below zero.
    for r in turn.results:
        if r["tool"] == "get_stock" and not r["error"]:
            for row in (r["result"] or {}).get("rows") or []:
                if "total_quantity" in row and row["total_quantity"] is not None:
                    assert float(row["total_quantity"]) >= 0, row


# =============================================================================
# TIER 2 — THE THREAD. Five turns, chained, in the owner's own register.
# One conversation instead of five cold starts: it costs four fewer live turns
# than the old suite's equivalents AND tests something they never did, which is
# whether Bob holds a thread.
# =============================================================================

@pytest.fixture(scope="module")
def thread(monkeypatch_module):
    """The five-turn conversation, run once. Every question is from the log."""
    mp = monkeypatch_module
    out = {}
    history: list[dict] = []
    carried: list[dict] = []

    def step(key, question, **kw):
        nonlocal history, carried
        t = _turn(mp, question, history=list(history) or None, **kw)
        out[key] = (t, list(carried))
        history = history + t.history_turns()
        carried = carried + [r["result"] for r in t.results if not r["error"]]
        return t

    step("vague", "how are we doing?")
    step("follow-up", "how about rockwell")
    step("correction", "no i meant last week")
    step("taught", "add top sellers by sales not units, i value sales more")
    step("pin", "can you make it a page?", page_writer=FakeWriter())
    return out


def test_thread_1_vague(thread):
    """His most common question, and the one the old suite never asked."""
    turn, carried = thread["vague"]
    _broad(turn, _voice("vague", turn, extra_results=carried))


def test_thread_2_follow_up(thread):
    """"how about rockwell" — a fragment that only the board can resolve."""
    turn, carried = thread["follow-up"]
    _voice("follow-up", turn, extra_results=carried)


def test_thread_3_correction(thread):
    """A correction with no subject in it: only the thread says what "it" is."""
    turn, carried = thread["correction"]
    _voice("correction", turn, extra_results=carried)


def test_thread_4_a_preference_taught(thread):
    """
    "i value sales more" is a BELIEF arriving mid-conversation, and the first
    twelve had no scenario for one. It is the shape "not what I meant" takes
    in real use, and what Bob does with it decides whether memory is worth
    anything.
    """
    turn, carried = thread["taught"]
    _voice("taught", turn, extra_results=carried)


def test_thread_5_pin_that(thread):
    """
    "can you make it a page?" — his words, against the suite's "Keep that as a
    page called Rockwell weekly." Expects no figure: the answer is a
    confirmation, and a page write claimed but not made is the failure.
    """
    turn, carried = thread["pin"]
    f = _voice("pin", turn, extra_results=carried, expects_figure=False)
    claimed = [c for c in turn.page_writes if not c.get("error")]
    assert claimed or f["limitation"], "he neither wrote the page nor said why not"


# =============================================================================
# TIER 3 — THE BUILD. Two turns, chained.
# =============================================================================

@pytest.fixture(scope="module")
def build(monkeypatch_module):
    mp = monkeypatch_module
    first = _turn(mp, "lets brainstorm ideas for a po system for seikyo, 8 weeks of cover")
    carried = [r["result"] for r in first.results if not r["error"]]
    # No workflow writer is injected, so scheduling is not his to do this
    # turn: the eval is how he says so. Capability is enforced by ABSENCE.
    second = _turn(mp, "run it every monday at 6", history=first.history_turns())
    return {"order": (first, []), "monday": (second, carried)}


def test_build_1_an_order(build):
    turn, carried = build["order"]
    _voice("order", turn, extra_results=carried)


def test_build_2_run_it_monday(build):
    turn, carried = build["monday"]
    _voice("run-monday", turn, extra_results=carried,
           expect_refusal=True, expects_figure=False)
