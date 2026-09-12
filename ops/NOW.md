# NOW — read this first

The state of play for George, kept current. **Every working session starts by
reading this file.** It exists so a prompt can be one line without a fresh
session having to re-derive where everything is.

Three files, three jobs: **CLAUDE.md** holds the rules that do not change,
**ops/DECISIONS.md** holds why they got there, and **this** holds where we are
right now. If this file disagrees with a memory or an old plan, this file wins.

---

## 1. How we work

Agreed 2026-09-12, after five surface rebuilds in eight days produced nothing
shippable. The full diagnosis is the report linked in section 6.

- **One branch: `main`.** No feature branches, no new worktrees, no `v2`
  branches. Short-lived branch merged the same day if a session truly needs one.
- **No rebuilds.** A new surface, vocabulary word, CLAUDE.md section or
  prompt-wording test is never the answer to "it feels wrong". The answer is
  the next fix to the surface that exists. If a task seems to need a rebuild,
  say so and stop — the owner decides, and the default is no.
- **One session, one card.** Cards are in section 3. Take the first one that is
  not done. Do not start the next card in the same session.
- **Close with numbers.** Every session ends with: suites run and their result,
  the card's number before and after, and what is not done. Report the
  shortfall, never the improvement. Then append ≤10 lines to
  `ops/DECISIONS.md` — never to CLAUDE.md.
- **Never push or deploy** without the owner saying so in that session.
- **The owner's prompts are complaints, not designs.** "Tap Rockwell, say
  products: 30 s and a second tile" is the good shape. If a prompt arrives as a
  design, restate it as the complaint it answers before building.
- **The daily dogfood fix does not derail the phase.** Fix the top line if it
  is an hour or less. If it is bigger, write it as a card in section 3 and
  carry on with the current one — a queue of small fixes is how a phase dies.
- **The plan's central assumption is still untested**, and honesty about it is
  part of the job. Phase 1 assumes latency is what makes George feel like a
  chatbot. That came from reading the code and the recorded evals, not from the
  owner using the room — which is two days old and has never been dogfooded.
  **P0.1's deploy is the test.** If the first real complaint after deploying is
  not about speed, Phase 1 is re-ordered around the complaint that arrives, and
  that re-ordering is a decision to record, not a failure.

---

## 2. Where we are

| | |
|---|---|
| Product branch | `feature/workspace` — **not yet merged to `main`** |
| Head | `d7fedb4` (the cut), unpushed |
| `main` | `db4b22f`, 163 commits behind, 0 ahead |
| Last deploy | none since 2026-09-07 |
| Phase | 0, consolidating |
| Next card | **P0.1, merge** |

The live surface is **the room** (`frontend/src/room/`, route `/`). The desk,
the river pages, the shell chrome and the `/w2` renderer were deleted on
2026-09-12; if you find a reference to one, it is stale prose, not code.

---

## 3. The cards

Do the first one not marked done. One per session.

**Phase 0 — consolidate**

- [x] **P0.0 the cut** — 100 files / 16,660 lines deleted, production-reachable
      files unchanged at 194. `d7fedb4`.
- [ ] **P0.1 merge** — fast-forward `main` to `feature/workspace`, run
      everything in section 4, report. Do not push; the owner says when.
- [ ] **P0.2 rulebook** — CLAUDE.md under 1,500 words; history moved to
      `ops/DECISIONS.md`; AGENTS.md merged or deleted; delete the assertions
      that hold exact system-prompt wording (15 files, ~33 assertions). The
      twelve-question eval becomes the only voice gate.
- [ ] **P0.3 clock** — `duration_ms` per turn and per iteration on
      `george.conversations`; elapsed time in the room's Working line; a query
      reporting median and p90 turn time, calls, iterations and corrective
      turns per turn over 7 days. **Its first median is the Phase 1 baseline.**

**Phase 1 — make the one surface fast.** No new features. Targets for the
phase: **first visible change < 2 s, median answer < 10 s, navigation
fragments answered with no model call at all.** Every card reports against the
baseline below and the twelve-question eval.

**The measured baseline** (from `verification/voice-after.json`, the twelve
questions, 2026-09-12 — wall-clock is the one number missing and P0.3 adds it):

| | now | after Phase 1 |
|---|---|---|
| iterations per turn, median / max | **5.5 / 8** | ≤ 2.5 |
| calls per turn, median | 5 | unchanged |
| label calls as a share of all calls | **51%** (28 of 55) | ≤ 25% |
| questions where `compose` was rejected | **8 of 12** | ≤ 1 |
| median answer, wall-clock | unmeasured | < 10 s |

**Read this before planning any Phase 1 card.** An iteration is one sequential
model round trip, and it is iterations — not database reads — that make a turn
slow. Reads are already batched and already run concurrently
(`asyncio.gather`, `agent/loop.py`), so **parallelism is not a lever and is not
a card.** Half of all tool calls are George labelling his own work, and
`compose` is refused in two questions out of three, each refusal costing a
whole round trip. One question ("cannot") spent 8 iterations and 4 `compose`
calls to answer "I can't see foot traffic".

- [ ] **P1.a compose stops round-tripping** — the biggest single win.
      (a) Most refusals are structural, not about truth: a second block
      weighted `lead`, a `change` carrying a field it may not, a `change` that
      changes nothing. **Coerce those instead of refusing** — demote the second
      lead, drop the stray field, ignore the no-op — and keep a refusal only
      where drawing it would put a wrong or unbacked figure on screen (a seq
      that did not run, a failed read, a subject with no row, an object
      carrying a figure). `agent/compose.py` already has the precedent.
      (b) Fold `record_findings` into `compose`: one schema, one call.
      (c) Prose written beside a LABEL call is the answer, not narration —
      reset only when a READ is called (`agent/loop.py`, the `interim_prose`
      branch fires on any `tool_uses` today).
      Measure: rejections per turn, label share, iterations per turn.
- [ ] **P1.b the board fills when data lands** — when reads land and no
      `compose` has arrived, compose a default server-side from `inferShape`;
      George's later `compose` replaces it in place by key. Measure: time to
      first visible object. This is the card that has to hit 2 s.
- [ ] **P1.c cheaper turns** — effort per turn (low for a label-only or
      follow-up turn, medium for a fresh question, high for the investigation
      ladder) via the mid-conversation effort message so the cache survives;
      the six corrective gates become deterministic edits, keeping a model turn
      only for a false write claim. Measure: median turn time, corrective turns
      per turn, and every quality check on the twelve unchanged.
- [ ] **P1.d fragments skip the model** — route through
      `POST /george/replay`. **Two kinds, and they differ:** a NAVIGATION
      fragment (the window control, a tapped subject, "last month") redraws
      with no model call at all; an ANALYTICAL fragment ("products", "why?",
      "compare these") draws instantly from the replay and George's reading
      follows in the same turn. A reading is the point of an analytical
      question and must not be dropped to win a latency number.
      Measure: time to first visible change for each kind.
- [ ] **P1.✓ close the phase** — every target reported against its number,
      plus which cards actually paid.

**The standing gate on every Phase 1 card.** This phase dismantles the
machinery that enforces George's trust guarantees, so each card re-runs the
twelve and reports, beside its own number: notices surfaced (must stay 100%),
no figure in prose that no tool returned, refusals still refusing. A card that
buys speed by losing one of those has failed — say so rather than keeping the
speed.

**Phase 2 — deepen the seven.** Only after P1.✓ meets its numbers.

- [ ] **P2.a** short things resolve against the board, not the transcript
      ("these two", "why?", "exclude Air", "last month").
- [ ] **P2.b** "Why?" and "and OPUS?" transform what is on the board instead of
      adding beneath it.
- [ ] **P2.c** one expressive form, through the grammar, for one real question
      from the dogfood log that a conventional chart answered badly.
- [ ] **P2.d** voice into the room's composer, carrying the same board
      selection a typed question carries.

After Phase 2: proactive investigation (already built — watches, standing
questions and `get_attention` all work; what it needs is living with, not
building), build-with-George beyond pages and workflows.

**Blocked on data, not on code — and these have lead time.** Four of the
owner's 26 features cannot be started by any session here, because no source
exists: **people and permissions** (feature 8/16), **documents and
unstructured information** (24), **actions into the tools the business
actually uses** (25), and **cross-business** (23 — the database holds one
business; the FFR record in `metrics.yaml data_availability.ffr` lists what an
authoritative source must provide). Building shapes with nothing behind them is
forbidden. These are the owner's to source, and starting them in parallel with
Phase 1 is the only way they are ready when the interaction work lands.

---

## 4. Commands

Run from the repo root. The interpreter is `.venv\Scripts\python.exe`; a system
`python` cannot import the backend (pinned SQLAlchemy).

    .venv\Scripts\python.exe ops/verify_integration.py pure     # 1,326 expected
    cd frontend && npx vitest run                               # 774 expected
    cd frontend && npx tsc -b --noEmit
    cd frontend && npm run build

The twelve-question eval — real model, real reads, nothing written, opt-in:

    set GEORGE_EVALS=1
    set GEORGE_VOICE_STRICT=1
    set GEORGE_EVAL_REPORT=verification/<name>.json
    .venv\Scripts\python.exe -m pytest tests/evals/test_voice_evals.py -q

Local dogfood backend (omits the model key unless `--allow-model`, which is a
structural gate — never pass it unasked):

    .venv\Scripts\python.exe ops/local_dogfood_serve.py --port 8000

Restart the backend after any change to `agent/loop.py`, `definitions/` or a
tool: uvicorn runs without `--reload`, and a stale server answers `/health`
happily while serving old code. Probe a new route before trusting one.

---

## 5. Standing facts a session keeps getting wrong

- **Never print a secret's value.** `backend/.env` holds a superuser
  `DATABASE_URL`, both George role passwords, `BRIEF_TOKEN` and the model key.
  Print the variable NAME and set/unset, never the value or a prefix. See
  CLAUDE.md — this rule was written after a probe printed all of them.
- **The store list lives in `definitions/metrics.yaml` and nowhere else.**
- **George's model is `claude-opus-5`**, never Fable in the interactive loop.
  Claude Code sessions: Opus 5 to build, Fable 5.1 to review and for the weekly
  numbers.
- **A test that asserts prompt wording is not a guarantee.** Behaviour is held
  by the evals; phrases are not held at all after P0.2.
- `*_contract.py` is pure (no database), `*_live.py` is not. The filename is
  the rule.

---

## 6. The standard, and the reasoning

The owner's own 26-line definition of George is the standard every piece of
work is measured against — not a plan distilled from it. It is in Claude's
project memory as `george-what-it-must-be`.

The diagnosis behind this plan, the research, and the literal prompt for every
card: **George, Eleven Days In** —
https://claude.ai/code/artifact/90f62cb2-81f5-4ca1-b444-9ef3c92c858a

**A phase ends when the owner says it feels right — and it may never end with a
rebuild.** If it does not feel right, the answer is the next fix to the same
surface, measured against the same numbers.
