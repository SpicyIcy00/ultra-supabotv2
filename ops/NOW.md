# NOW — read this first

The state of play for George, kept current. **Every working session starts by
reading this file.** It exists so a prompt can be one line without a fresh
session having to re-derive where everything is.

Five files, five jobs: **CLAUDE.md** holds the rules that do not change (1,493
words since P0.2), **ops/STANDARD.md** holds the owner's own 26 features — the
standard everything is measured against — **ops/DECISIONS.md** holds why the
rules got there plus the archive CLAUDE.md used to carry,
**ops/DOGFOOD_LOG.md** holds what is wrong with George right now in the
owner's own words, and **this** holds where we are.

If this file disagrees with a memory or an old plan, this file wins. **If
DOGFOOD_LOG has anything under Open, it wins over the card list here** — a
reported defect outranks every number in this file.

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
  **The deploy was the test, and it answered on 2026-09-13.** The first two
  complaints after deploying were not about speed: the BI pages were
  unreachable behind George, and an answer vanished as it was written.
  Phase 1 was re-ordered accordingly — correctness first — and that is a
  decision recorded in DECISIONS.md, not a failure of the plan.

---

## 2. Where we are

| | |
|---|---|
| Product branch | `main` — `feature/workspace` merged into it 2026-09-12 |
| Head | `d44249c` — **pushed 2026-09-13**, `main` and `origin/main` identical |
| Last deploy | `d44249c`, pushed 2026-09-13. **No migration in it** — schema stays `v6w7x8y9z0a1`, which the live database already has, so the schema-behind crashloop of 09-12 cannot repeat here. Railway was healthy before the push and watched across it. |
| Phase | 0, consolidating |
| Next card | **P0.4, the deploy migrates itself** — but DOGFOOD_LOG has two Open entries from the P0.5 sweep, and Open wins |

**Where the app actually is.** Frontend on **Vercel**, backend on **Railway**
at `https://ultra-supabotv2-production.up.railway.app`, both auto-deploying
`origin/main`. The browser only ever talks to the Vercel origin: every client
call is the relative `/api/v1`, and **`frontend/middleware.ts` rewrites those
to Railway** — `frontend/routing/backend.ts` holds the origin and fails closed
on a preview deployment without staging config. It is NOT in `vercel.json`,
which is what `VERCEL_ENV_SETUP.md` and the comment in `useGeorgeStream.ts`
both claim; they are stale, the middleware is real, and `routing.test.ts`
covers it.

Health, and the only honest way to know which build is live:
`GET https://ultra-supabotv2-production.up.railway.app/health` returns the
schema the code expects beside the schema the database is on. It does NOT
report which revision is running — that is part of card P0.4.

**The product is Supabot BI, and George is a tab in it** (the owner,
2026-09-12: *"this is still supabot, just make george a page"*, and 09-13:
*"can you put george just in the tabs of the main page"*). `/` redirects to
the first page a person may see, which is the Dashboard. George sits in the
same sidebar as Analytics, Warehouse and Packing, renders **inside the same
chrome**, and owns tabs of its own — Board, Needs you, Kept, Running — the
way Dashboard owns Stores and Vending.

From 09-09 to 09-12 `/` RENDERED George and the rest of the BI app, though
still routed and still allowed, was reachable from nowhere a person stood.
**A surface you cannot leave is not a page** — if a future change makes
George the landing again, this is the reason not to.

George's own surface is **the room** (`frontend/src/room/`, at `/george` and
`/w/:threadId`, with its tabs at `/inbox`, `/pages` and `/workflows`). Its
fixed left rail became `GeorgeTabs.tsx` on 09-13. The desk, the river pages,
the shell chrome and the `/w2` renderer were deleted on 09-12; a reference to
any of them is stale prose, not code.

---

## 2b. When something goes wrong

**Reporting is not fixing, and they are separate acts.** Reporting costs one
sentence and happens the moment you see it; fixing is a session. Keeping them
apart is what lets you report without derailing whatever is in flight.

**Report immediately, never in a batch.** Detail decays within the hour —
"stuff came out but it just disappeared" was enough to find the cause because
it was fresh. Saving defects up buys nothing, because an open defect already
blocks every speed card.

### The four prompts

**1. Report it, any time, even mid-session.** Claude writes it into
`ops/DOGFOOD_LOG.md` verbatim, confirms, and carries on with the card in
flight. It does NOT start fixing.

    Log this: asked "how are we doing" — stuff came out but it just disappeared

**2. Fix the top one.** A session of its own.

    Read ops/NOW.md. Fix the top item in the dogfood log.

**3. Jump the queue**, for something that blocks you right now. Logged and
fixed in the same session; the card in flight waits.

    Fix this now: <what you did> — <what happened>

**4. The weekly sweep, for errors nobody reported.** See below.

    Read ops/NOW.md, then run the weekly sweep.

`ops/sweep_gaps.py` is the sweep (P0.5). It reads, groups and samples; a
session reads the output, **checks each finding against today's code before
filing it**, and puts what is still live into the dogfood log.

    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7

Checking first is not optional. The first run's loudest finding was 89
refusals of `top_n must be an integer, got str.` — already fixed in `0ba0b4e`
the same day it stopped happening. A stale gap filed as a defect costs a whole
session.

### George already records his own failures, and nobody reads them

`agent/loop.py` writes a row to `george.gaps` for **20 kinds** of trouble.
Thirteen are literals — `api_error`, `api_retry`, `unhandled`, `tool_refused`,
`convergence_cap`, `iteration_cap`, `no_tool_call`, `empty_result`,
`duplicate_read`, `notice_forced`, `volunteering_over_cap`,
`tool_vocabulary_leaked`, `transaction_wording` — and seven more are built at
the call site and were missed every time anyone counted: `restated_figure`,
and `{pin,save,page}_{claimed,promised}_not_made`. The catalogue in
`ops/sweep_gaps.py` names all twenty, and a contract test holds it against the
call sites so kind twenty-one cannot go unread the way eleven did.

**Exactly two of them are ever read back** — `api_error` and `unhandled`, and
only when rebuilding a stored chat so a failed turn shows its error
(`routes/george.py`). The other **eleven have been written since the first
commit and read by nothing**. A turn that hit its iteration cap, refused a
tool, or forced a caveat in has been recorded every time and seen by no one.

That is a defect feed nobody is reading, which is why the weekly sweep exists
and why P0.5 makes it routine. Rule: **an error George records is a defect
report he filed himself** — it goes through the dogfood log like any other,
rather than being fixed silently or ignored.

### While Claude is working

If a session finds a defect that is not its card, it **logs it and carries
on** — it does not fix it inline. One session, one target. The exception is
something trivially adjacent to the card being worked, and even then the fix
is named in the close-out.

---

## 3. The cards

**Check `ops/DOGFOOD_LOG.md` first. Anything under Open comes before any card
here** — that is where reported defects live, in the owner's own words, and no
speed card is started while one is outstanding. If Open is empty, do the first
card below that is not marked done. One per session either way.

**Phase 0 — consolidate**

- [x] **P0.0 the cut** — 100 files / 16,660 lines deleted, production-reachable
      files unchanged at 194. `d7fedb4`.
- [x] **P0.1 merge** — fast-forward of 166 commits, `5354ef6`. Suites exact:
      1,326 pure, 774 vitest (after `npm ci` — node_modules predated the
      branch), `tsc` and `build` clean. The twelve: 11 passed, 1 failed
      (`why`, strict `leads_with_reading`). Pushed 2026-09-13.
- [x] **P0.2 rulebook** — CLAUDE.md **1,493 words**, from 22,218, with every
      rule kept. The owner's 26 features moved verbatim to `ops/STANDARD.md`;
      the ~20,000 words of readings moved verbatim to the archive at the foot
      of `ops/DECISIONS.md`; AGENTS.md is a pointer, not a second copy.
      **91 prompt-wording assertions gone across exactly the 15 files predicted
      (97 removed, 6 written back), taking 21 test functions** — the card said
      ~33, so nearly three times as many were pinning wording as it thought.
      Suites exact: 1,306 pure (was 1,326), 774 vitest, `tsc -b` and `build`
      clean. The twelve were NOT re-run: the prompt is byte-identical, so
      nothing about the model's behaviour changed. Pushed 2026-09-13.
- [ ] **P0.4 the deploy migrates itself** — `AUTO_MIGRATE_ON_START` is false in
      Railway, so 2026-09-12's deploy booted against a schema four migrations
      behind and refused to serve; the next deploy does the same. Either set it
      true or migrate as an explicit release step, and make `/health` say which
      revision is live. A schema check that only runs at startup means the gap
      is invisible until something restarts.
- [x] **P0.5 read the gaps** — `ops/sweep_gaps.py`, 25 cases in
      `tests/test_gap_sweep_contract.py`, wired into prompt 4 above. No table,
      no writer, four fixed statements, read-only. **20 kinds, not 13** — seven
      are built at the call site and had never been counted. What a week of
      real use contains: **there has not been one.** 193 turns have ever been
      logged; 145 are one scripted `coverage` user on 2026-09-02 and only 44
      are a person. The last 7 days hold **4 turns and 2 gaps**. Two defects
      filed (dead_stock/AJI BARN, a save recording only an exception name);
      the loudest finding, 89 `top_n must be an integer`, was already fixed in
      `0ba0b4e` — which is why the prompt now says check before filing.
- [ ] **P0.3 clock** — `duration_ms` per turn and per iteration on
      `george.conversations`; elapsed time in the room's Working line; a query
      reporting median and p90 turn time, calls, iterations and corrective
      turns per turn over 7 days. **Its first median is the Phase 1 baseline.**

**Phase 1 — make it work, then make it fast. In that order.**

*Reordered 2026-09-12, on the owner's report: "there are still a lot of
problems, it doesn't even function right — I sent 'how are we doing', stuff
came out but it just disappeared."* The plan as written measured speed and
assumed correctness. That was the wrong way round, and the bug he hit was
already sitting inside a card I had labelled a latency optimisation: prose was
being wiped off the screen by `compose`. **A correctness complaint outranks
every number in this file.** Speed targets stay, and no speed card is started
while a reported defect is open.

The daily dogfood log is what drives this phase, not the card order. Targets
once it works: **first visible change < 2 s, median answer < 10 s, navigation
fragments answered with no model call at all.** Every card reports against the
baseline below and the twelve-question eval.

**The measured baseline** (the twelve questions, 2026-09-12 — wall-clock is the
one number missing and P0.3 adds it). `verification/` is **gitignored**, so this
table is the record, not the JSON; P0.1's re-run is in brackets, and the spread
between the two is what one real-model run costs a figure:

| | now | after Phase 1 |
|---|---|---|
| iterations per turn, median / max | **5.5 / 8** [6.0 / 10] | ≤ 2.5 |
| calls per turn, median | 5 [5] | unchanged |
| label calls as a share of all calls | **51%** (28 of 55) [52%, 33 of 63] | ≤ 25% |
| questions where `compose` was rejected | **8 of 12** [6 of 12] | ≤ 1 |
| median answer, wall-clock | unmeasured | < 10 s |

**Read this before planning any Phase 1 card.** An iteration is one sequential
model round trip, and it is iterations — not database reads — that make a turn
slow. Reads are already batched and already run concurrently
(`asyncio.gather`, `agent/loop.py`), so **parallelism is not a lever and is not
a card.** Half of all tool calls are George labelling his own work, and
`compose` is refused in two questions out of three, each refusal costing a
whole round trip. One question ("cannot") spent 8 iterations and 4 `compose`
calls to answer "I can't see foot traffic".

- [~] **P1.a compose stops round-tripping** — the biggest single win, and
      **half correctness, not speed**. Part (c) is DONE (2026-09-12): the
      answer no longer disappears when George composes. (a) and (b) remain.
      (a) Most refusals are structural, not about truth: a second block
      weighted `lead`, a `change` carrying a field it may not, a `change` that
      changes nothing. **Coerce those instead of refusing** — demote the second
      lead, drop the stray field, ignore the no-op — and keep a refusal only
      where drawing it would put a wrong or unbacked figure on screen (a seq
      that did not run, a failed read, a subject with no row, an object
      carrying a figure). `agent/compose.py` already has the precedent.
      (b) Fold `record_findings` into `compose`: one schema, one call.
      (c) **DONE.** Prose written beside a LABEL call is the answer, not
      narration: the `interim_prose` reset fired on any `tool_use`, including
      `compose`, so the sentence George had just written was pulled off screen
      into the activity disclosure every time he arranged the board — and again
      on every refused compose. Held by four cases in
      `tests/test_interim_prose_contract.py`.
      Measure for (a) and (b): rejections per turn, label share, iterations per
      turn.
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
    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7        # the weekly sweep
    cd frontend && npm ci                                       # after any merge
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
