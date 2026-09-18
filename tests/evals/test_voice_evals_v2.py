"""
The voice evals, second cut — 2026-09-13.

WHY THERE IS A SECOND FILE. The first twelve are not deleted by this commit.
They are the record every Phase 0 and Phase 1 number was measured against, and
a suite that replaces them has to be shown to be better on a run where both
are present. Delete `test_voice_evals.py` in the card that does that, not here.

WHAT WAS WRONG WITH THE FIRST TWELVE, measured rather than asserted:

  1. Nothing checked that George ANSWERED. Fed "I cannot establish that from
     these reads" with no tool calls, the suite passed it on all seven of its
     checks. Every assertion was about form and honesty, so a George that
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
how George is actually used.

    pytest tests/evals/test_voice_evals_v2.py -m gate   # 5 turns, ~$1.20 (P2S.6 added the fifth)
    pytest tests/evals/test_voice_evals_v2.py           # 11 turns, ~$1.15

THE GATE'S FOUR SCENARIOS ARE UNCHANGED FROM THE FIRST TWELVE, wording
included. They are stable across every recorded run, they are the only rows
meaningful from a single draw, and each catches something no other scenario
does. Changing them would forfeit the one comparison that carries over.
"""
from __future__ import annotations

import os

import pytest

from tests.evals import checks
from tests.evals import voice_checks as voice
from tests.evals.harness import Report, required, run_turn, turn_usd
from tests.evals.test_page_workshop_evals import FakeWriter
from tools._common import load_defs, req

DEFS = load_defs()

from agent import loop as george_loop
from agent import reading as george_reading

MAX_ITERATIONS = george_loop.MAX_ITERATIONS
STRICT = os.environ.get("GEORGE_VOICE_STRICT") == "1"

report = Report()


@pytest.fixture(autouse=True)
def _live():
    required()


@pytest.fixture(scope="module", autouse=True)
def _write_report():
    yield
    path = report.write()
    print("\n\n== voice evals v2 ==")
    n = max(len(report.records), 1)
    lead = sum(int(r["findings"]["leads_with_reading"]) for r in report.records)
    cited = sum(int(bool(r["findings"].get("grounded_numerals"))) for r in report.records)
    rate = lambda key: sum(int(bool(r["findings"].get(key))) for r in report.records)
    calls = sum(len(r.get("calls") or []) for r in report.records)
    labels = sum(int(r["findings"].get("label_calls") or 0) for r in report.records)
    refused = sum(int(bool(r["findings"].get("compose_rejected"))) for r in report.records)
    out = report.outcome()
    print(f"  scenarios {n} · live turns {LIVE_TURNS['n']}")
    # WHETHER IT PASSED, first, because it is the question (P2.0). Every
    # number below is a rate that means nothing if a scenario blew up.
    print(f"  OUTCOME  {out['passed']}/{out['scenarios']} scenarios passed"
          + (f" · failed {', '.join(out['failed'])}" if out["failed"] else "")
          + (f" · unscored {', '.join(out['unscored'])}" if out["unscored"] else ""))
    print(f"  TRUST (pass/fail, meaningful from one run):")
    print(f"    every scenario that asked for a figure cited one: see failures above")
    print(f"  THE BOARD (P1.f's own numbers):")
    print(f"    questions where compose was refused  {refused}/{n}   target ≤ 1")
    print(f"    label calls as a share of all calls  {labels}/{calls} "
          f"({100 * labels / max(calls, 1):.0f}%)   target not worse than 33%")
    print(f"  THE READING (a rate, not a gate):")
    print(f"    said a claim          {rate('has_claim')}/{n}")
    print(f"    the claim was lit     {rate('claim_lit')}/{n}")
    print(f"    said what is next     {rate('has_next')}/{n}")
    print(f"  STYLE (a rate, not a gate — compare with the last run):")
    print(f"    leads with a reading  {lead}/{n} ({100 * lead / n:.0f}%)")
    print(f"    cited a real figure   {cited}/{n} ({100 * cited / n:.0f}%)")
    if path:
        print(f"  report: {path}")


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
    # for v2's stated reason: what George chooses to say flaps run to run, and
    # a single draw of it is noise. `claim_lit` is the one that matters most —
    # a claim he did not say lights nothing, and the surface draws the reading
    # whole instead.
    said = _reading_of(turn)
    f["reading"] = said
    f["has_claim"] = bool(said.get("claim"))
    f["has_next"] = bool(said.get("next"))
    f["claim_lit"] = george_reading.was_said(turn.answer, said.get("claim"))
    f["compose_rejected"] = [w.get("detail") for w in turn.warnings
                             if w.get("reason") == "composition_rejected"]
    f["label_calls"] = len([c for c in turn.calls
                            if c.get("tool") == george_loop.COMPOSE_TOOL])
    f["ungrounded_numerals"] = [x.text for x in checks.ungrounded_numerals(turn.answer, results)]
    f["grounded_numerals"] = [x.text for x in checks.grounded_numerals(turn.answer, results)]
    f["internal_vocabulary"] = checks.internal_vocabulary(turn.answer)
    f["limitation"] = checks.limitation_statement(turn.answer)
    f["attribution"] = checks.attribution_claims(turn.answer, results)
    f["refused_calls"] = [c.get("tool") for c in turn.calls if c.get("error")]
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
    reads = [c for c in turn.calls
             if str(c.get("tool", "")).startswith("get_") and c.get("duplicate_of") is None]
    assert len(reads) <= george_loop.MAX_TOOL_CALLS, (len(reads), turn.done)
    assert turn.done.get("notice_forced") is False, "a notice had to be forced into the answer"
    assert not f["ungrounded_numerals"], f"figures no tool returned: {f['ungrounded_numerals']}"
    assert not f["internal_vocabulary"], f"internal vocabulary: {f['internal_vocabulary']}"
    assert not f["attribution"], f"a share of the change, which no tool computed: {f['attribution']}"

    # THE ASSERTION THE FIRST TWELVE DID NOT HAVE. A question that asks for a
    # figure is not answered by prose about what cannot be established.
    if expects_figure:
        assert f["grounded_numerals"], (
            "he cited no figure any tool returned — the answer is a shrug:\n"
            f"{turn.answer[:400]!r}")

    if expect_refusal:
        low = turn.answer.lower()
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
def test_gate_3_cannot(monkeypatch):
    """A refusal that stopped refusing. Expects NO figure, by design."""
    turn = _turn(monkeypatch, "What was the foot traffic at Rockwell last week?")
    _voice("cannot", turn, expect_refusal=True, expects_figure=False)


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
    # george work worse". The figure goes on the record for the close-out.
    f["localizing_reads"] = [c.get("arguments") for c in loc]
    f["turn_usd"] = round(turn_usd(turn), 4)
    assert loc, ("a broad answer read by store and nothing under it — "
                 f"{[c.get('arguments') for c in turn.read_calls]}")


@pytest.mark.gate
def test_gate_5_how_are_we_doing(monkeypatch):
    """
    His most common question, added to the gate by P2S.6: a broad question
    finds where the movement sits in the same turn, rather than handing
    "why?" back as a question to tap.
    """
    turn = _turn(monkeypatch, "how are we doing?")
    _broad(turn, _voice("broad", turn))


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


# =============================================================================
# TIER 2 — THE THREAD. Five turns, chained, in the owner's own register.
# One conversation instead of five cold starts: it costs four fewer live turns
# than the old suite's equivalents AND tests something they never did, which is
# whether George holds a thread.
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
    in real use, and what George does with it decides whether memory is worth
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
