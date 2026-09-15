r"""
Replay a recorded eval run through today's checks — for free.

WHY. A full live run is $2.90 (measured 2026-09-13) and about 72% of that is
cache writes and reads that scale with ITERATIONS, not with how many questions
you ask. So paying for a live run to test a changed regex is the worst trade
in the project.

Every trust check is a pure function of `(answer, results)`:

    ungrounded_numerals   did he state a figure no tool returned
    grounded_numerals     did he state one at all
    internal_vocabulary   did a column name reach the answer
    attribution_claims    did he split a change between drivers
    restated_sentences    did he read the board back

None of them needs the model. So a card that changes only a CHECK — P1.g is
exactly this — verifies against recorded runs at zero cost, and only a card
that changes what the model SEES has to buy new turns.

    .venv\Scripts\python.exe -m tests.evals.corpus verification/p1b-final.json

WHAT IT CANNOT DO, stated so nobody mistakes it for a run: it cannot tell you
whether George's BEHAVIOUR changed, because the answers are fixed. It tells
you whether the checks, as they stand today, agree with what was recorded. A
check that newly fires on a recorded answer is either a bug you just fixed or
a false positive you just introduced, and the replay says which answer it was
so you can read it.

Reports written before 2026-09-13 carry no `results`, so only the two
answer-only checks replay against them. The file says so rather than
silently reporting fewer findings.

AND ONE THING NO REPLAY CAN RECOVER, P2.0. Whether the run PASSED is not a
function of (answer, results): it is what the assertions decided on the day,
and until 2026-09-15 nothing wrote it down. `Report.add` took a `passed`
argument and every caller filled it in before the first assertion, so
`p1e-v2`, `p1f-v2`, `p1h-v2` and `p1close-v2` each claim eleven failures over
runs pytest scored 11 of 11. Those four cannot be re-scored. Reports written
from here on carry a top-level `scoring` block and this tool prints it; a
report without one gets that paragraph printed instead of a guess.

AND ONE MORE BOUND, FOUND IN P1.e. A THREADED scenario's later turns cite
figures an EARLIER turn read — "no i meant last week" is answered over rows
"how are we doing?" brought back — and the run gives the checks both. Reports
written before 2026-09-14 stored only each turn's own results, so replaying
one of those flags ungrounded numerals the run itself passed:
`verification/p1e-v2.json` replays with three on `correction`, and all three
are in the turn before it. `harness.Report.add` now records the carried rows
as `(carried from an earlier turn)`, so reports written from here on replay
faithfully; an older threaded report is read with this paragraph beside it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from tests.evals import checks
from tests.evals.harness import SCORING_SINCE


def load(path: str) -> list[dict]:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return d["cases"] if isinstance(d, dict) else d


def scoring(path: str):
    """
    What the report says about its own outcome, or None if it predates that.

    A report written before 2026-09-15 has no `scoring` block, and every
    `passed` in it is the hardcoded False `Report.add` used to be handed
    before a single assertion ran. It cannot be re-scored: the outcome was
    never written down anywhere, so there is nothing to recover it from.
    """
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return d.get("scoring") if isinstance(d, dict) else None


def replay(case: dict) -> dict:
    """Today's checks against one recorded answer."""
    answer = case.get("answer") or ""
    stored = case.get("results")
    # A share the READ stated is excused, so attribution reads the evidence
    # too. Without it, a report that predates the stored results is judged by
    # a stricter rule than a live run — which is the drift this file exists to
    # prevent, and `evidence` is already how that is said out loud.
    results = ([] if stored is None
               else [r["result"] for r in stored if not r.get("error") and r.get("result")])
    out = {
        "scenario": case.get("scenario"),
        "internal_vocabulary": checks.internal_vocabulary(answer),
        "attribution": checks.attribution_claims(answer, results),
        "evidence": stored is not None,
    }
    if stored is None:
        return out
    out["ungrounded"] = [f.text for f in checks.ungrounded_numerals(answer, results)]
    out["grounded"] = [f.text for f in checks.grounded_numerals(answer, results)]
    return out


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    # A FLAG QUOTES GEORGE, AND GEORGE WRITES IN PESOS. Windows hands a piped
    # stdout cp1252, which cannot encode ₱ — so this crashed halfway down the
    # list, after printing the clean rows and before printing the count, which
    # is the worst place for a verification tool to stop. Found in P1.e.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    rows = [replay(c) for c in load(argv[1])]
    no_evidence = [r for r in rows if not r["evidence"]]
    print(f"replayed {len(rows)} recorded answers through today's checks — $0.00\n")
    # WHAT THE RUN ITSELF SAID, before today's checks say anything. The two are
    # different questions: the run's outcome is what its assertions decided on
    # the day, and the replay below is what the checks would decide now.
    said = scoring(argv[1])
    if said is None:
        print("  THIS REPORT DOES NOT SAY WHETHER IT PASSED. It predates "
              + SCORING_SINCE + ", when the outcome was written into every "
              "record before the first assertion ran, so every `passed` in it "
              "is a hardcoded False and means nothing. The score existed only "
              "in a pytest line, which nothing kept, and it cannot be "
              "recovered.\n")
    else:
        line = f"  the run itself: {said['passed']}/{said['scenarios']} scenarios passed"
        if said.get("failed"):
            line += " - failed " + ", ".join(said["failed"])
        if said.get("unscored"):
            line += " - never scored " + ", ".join(said["unscored"])
        print(line + "\n")

    bad = 0
    for r in rows:
        flags = []
        if r["internal_vocabulary"]:
            flags.append("LEAKED " + ", ".join(r["internal_vocabulary"]))
        if r["attribution"]:
            flags.append("ATTRIBUTION " + r["attribution"][0][:60])
        if r.get("ungrounded"):
            flags.append("UNGROUNDED " + ", ".join(r["ungrounded"]))
        if r["evidence"] and not r.get("grounded"):
            flags.append("cited no figure a tool returned")
        if flags:
            bad += 1
        print(f"  {r['scenario']:<12} " + ("· ".join(flags) if flags else "clean"))
    if no_evidence:
        print(f"\n  {len(no_evidence)} case(s) carry no stored evidence (report predates "
              f"2026-09-13): only the two answer-only checks ran on them.")
    print(f"\n{bad} of {len(rows)} would fail today's checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
