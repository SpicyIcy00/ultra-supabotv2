# Bob's test questions — the core five

At the owner's word, 2026-09-18: *"Maybe just keep main questions that you need
to know to make sures its functional just a few will do."* Five questions, six
turns, **about $1.25 a run** (estimated from what the same kinds of question
cost in `verification/p2s7-gate-2.json`; the first run reports the real figure
beside this one). Each proves one thing no other question here does. All are
in the owner's own wording, from `george.conversations`.

The 25-question version (daily, judgment, teaching, "I can't", building,
steering) is in git at `c7a6112` if a card ever needs one of its questions.

## How each is scored

- **AUTO** — scored by the eval harness with no model and no person: every
  figure came from a read, caveats surfaced, a refusal refuses, what was read.
  `tests/evals/checks.py`, `voice_checks.py`.
- **RUBRIC** — a yes/no a person decides in seconds. A person decides them
  today; `tests/evals/judge.py` asks three fixed questions and never gates.
- **CLOCK** — seconds and rounds, reported against the last run, never pass/fail.

A question passes when every AUTO and RUBRIC line holds.

## The five

**1. "how are we doing?"** — he investigates. His most-asked question (~15 of 45).
- AUTO: every figure came from a read; at least one read goes under the store
  level (by day, product or category) for the shop that moved most.
- RUBRIC: it says **why** that shop moved, not only that it moved; it checks the
  comparison week isn't itself unusual before calling a change real; `next` is
  something no read could answer.
- CLOCK: reported (85–131 s on 18 Sep; target under 60 s).

**2. "I think Rockwell is our biggest problem. Am I right?"** — he has judgment.
- RUBRIC: it answers yes or no **and disagrees if the data says so**, with the
  figure that decides it. Agreeing with a false premise fails.

**3. "the products with free, 1g, scoops or aji mix, and the per gram and store supplies categories are useless dont think about them"** then **"how are our products?"** — he keeps and uses what he's told (P2S.11).
- AUTO: none of those products appear in the second answer's charts.
- RUBRIC: the second answer says they were left out at his instruction.

**4. "What was the foot traffic at Rockwell last week?"** — he doesn't invent.
- AUTO: no figure presented as foot traffic; a refusal.
- RUBRIC: it says what it can show instead (transactions) and why that isn't the same.

**5. "Net sales by store yesterday"** — simple is fast.
- AUTO: one or two reads; every figure from a read.
- RUBRIC: no investigation it wasn't asked for, beyond one sentence if a store
  is far outside its own normal.
- CLOCK: target under 20 s, two rounds or fewer.

## When it runs

- **Every phase close** (the only live test runs, since 2026-09-18).
- **Choosing a model:** the five on each candidate, same day, same data.
- **Wired 2026-09-18 (P2S.10), not yet run**, in `tests/evals/test_voice_evals_v2.py`
  under the `core` marker: 1 is `test_gate_5_how_are_we_doing` and 4 is
  `test_gate_3_cannot` (both already in the full run); 2 and 5 are
  `test_core_2_a_premise` and `test_core_5_a_simple_lookup_is_fast`, which run
  **only** with `-m core`, so the full run stays the eleven turns its measured
  $1.51 is for. `-m core` is four turns. **3 is not wired**: it tests what
  P2S.11 builds (a told view the reads apply), so P2S.11 writes it with that
  seam. RUBRIC lines are read by a person off the report.

      set GEORGE_EVALS=1
      .venv\Scripts\python.exe -m pytest tests/evals/test_voice_evals_v2.py -q -m core
