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
| Head | `ee29fa5` — **pushed and live 2026-09-13**, carrying P0.6 (`cedd6b3`) and the bill (`4c0c9f9`). |
| Live | **`ee29fa5`**, confirmed from `/health`: healthy, schema `w7x8y9z0a1b2` current and expected, deployment `844cb3d1`. **The swap took 21 s with zero non-200s** — the second clean one in a row, and the second that carried NO migration. Read `/health` rather than believing this row: `a01706b` sat here as live while three commits had landed since. |
| Last deploy | `a01706b`, **live and healthy when recorded**, and the swap was clean — polled every 20 s across it, zero non-200s, old build to new in about a minute. It carried NO migration (the schema was already at head), so the launcher took its `already at head` branch and ran no alembic at all. That is evidence the outage below lives in the migration path specifically, not in the boot or the build — evidence, not the deploy log. Before it, `8b0325a`. `8b0325a` carried P0.3 and P0.4, and applying migration `w7x8y9z0a1b2` cost **~50 minutes of 502**: the first boots crashlooped, the migration did not apply, and nothing was readable from outside. It came up on a later retry. Root cause still unknown — the Railway deploy log for that build has not been read. `69b51bd` is the fix for the *invisibility*, not for the cause. |
| Phase | 0, consolidating |
| Next card | **P1.b.** P1.a closed 2026-09-13: rejections per turn 0.75 → 0.33 (met), label share 50% → 33% (target 25%, **missed**), iterations 5.5 → 4.0 (target 2.5, **missed**), trust gate whole, 11 of 12 with `cannot` failing a wording-matched refusal check. The remaining label calls are one `compose` a turn, so the rest of both misses is READS, which is P1.c and P1.d. *(Superseded note, kept for the reason it gives: P1.a.)* Open is empty again: the "800 grams-worth" defect closed 2026-09-13 — George had rounded a drawn 801, and the gate that would have caught him quoting it EXACTLY was silent on the rounded one, so imprecision was the way past the guard. **Read the note under the baseline table before reporting any Phase 1 number against the twelve.** P0.6 also moved the cost lever: **the bill is round trips, not cache misses**, so P1.a and P1.b are the cost cards as well as the speed ones. |

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
schema the code expects beside the schema the database is on, **which build is
running** (`build.commit`, `build.short`, and `build.source` naming where the
answer came from), and **whether the schema was read just now or at boot**
(`schema_checked`: `live`, `cached`, or `startup`). 503 on a mismatch.

**Confirmed in production 2026-09-13**, which is the answer to the one part of
P0.4 no session could check from here: Railway does inject the sha, and the
live readout is `"source": "environment (RAILWAY_GIT_COMMIT_SHA)"` with the
branch, deployment id, service and environment beside it. `git` locally.
**If it ever reads `unknown`, believe it** — nothing is guessed, and the fix is
Railway's git variables or a `backend/BUILD_REVISION` stamp, which
`app/core/build.py` already reads.

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

    Read ops/NOW.md, then run the weekly sweep and the cost report.

`ops/sweep_gaps.py` is the sweep (P0.5). It reads, groups and samples; a
session reads the output, **checks each finding against today's code before
filing it**, and puts what is still live into the dogfood log.

    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7
    .venv\Scripts\python.exe ops/cost_report.py --days 7

**`ops/cost_report.py` is NOT the bill**, and the weekly sweep must not treat
it as one. It reads `george.conversations`, which holds only turns that
reached `ConversationLog` — **no eval turn is in it**, because the harness
stubs the log, and neither are retries or turns that died before writing.
Measured 2026-09-13: the script saw 9.4M presented tokens over 30 days while
the console showed **51.6M on the same key**. 18%. Two confident conclusions
came out of that gap in one afternoon and both were wrong.

**For the bill, read the Anthropic console** — filter by the `george` API key,
group by *token type*, and read the day, not a rolling window. The token-type
split is the part that matters and the script cannot produce it. One heavy day
(2026-09-13, $18.20):

| | | |
|---|---|---|
| cache WRITE | $8.03 | 44% |
| cache READ | $5.90 | 32% |
| output | $4.27 | 23% |
| uncached input | ~$0.00 | 0% |

**Caching is working and is not a lever: 9.5 read per write, saving 74%.** Do
not reopen the TTL or chase the hit rate. What that day actually was: roughly
six full eval runs and the turns sessions fired while building, against 193
real turns in the whole month. **The bill is the building, not the product.**

Use `cost_report.py` for what it is good for — comparing George's own turns
with each other, across builds with `--since`.

Checking first is not optional. The first run's loudest finding was 89
refusals of `top_n must be an integer, got str.` — already fixed in `0ba0b4e`
the same day it stopped happening. A stale gap filed as a defect costs a whole
session.

### When to run the twelve — it costs real money, every time

**A full run is roughly $5–7** (61–75 iterations at the production per-iteration
rate). Seven runs are already on disk. That is comparable to a month of real
traffic, and **it does not appear in `ops/cost_report.py`**: the harness stubs
`ConversationLog`, so an eval turn never reaches `george.conversations`. The
report now prints its own spend and keeps it under `spend` in the JSON, which
is the only place that number can come from.

**The default is DON'T.** Most cards cannot change what the model sees or how
it thinks, and for those a run buys nothing at all:

| Change | Run the twelve? |
|---|---|
| Docs, ops scripts, tests | **No** |
| Frontend, routing, CSS | **No** |
| Deploy, migration, health | **No** |
| **Cache TTL / caching shape** | **No** — byte-identical input to the model |
| Prompt or tool-description text | Yes |
| Effort per turn | Yes |
| Iteration structure (P1.a, P1.b) | Yes |
| `compose` validation, findings roles | Yes |

**When it IS needed, don't start with twelve.** Run three or four that exercise
the path you changed, iterate on those, and run the full twelve **once** at the
end to confirm. Cheap signal while working, the full set only at the gate.

**A card's own text may not ask for a run it does not need.** P0.6's first
draft said "report the standing trust gate", which would have cost $6 to prove
that a cache lifetime does not change an answer — and it cannot, because the
model receives the same bytes either way. The standing gate applies to cards
that can move behaviour; for the others, say why no run was needed and move on.

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
- [x] **P0.4 the deploy migrates itself** — and `main` is deployable again.
      `app/start.py` now reads the schema BEFORE launching and brings the
      database to head when it is behind, **whatever `AUTO_MIGRATE_ON_START`
      says**. That setting claimed an explicit release step migrates the
      database; Railway has it off and has no release step, which is the whole
      defect. It is now a checked claim: at head the launcher does nothing and
      says the claim held, behind it migrates and says the claim did not, so
      the deploy log names the missing release step instead of hiding it.
      Ahead or branched it migrates nothing and says so — `upgrade head` cannot
      fix a rollback, and a launcher that tried would spread one process's
      outage across the estate. The upgrade runs under a postgres advisory
      lock so two replicas booting together cannot race the same DDL, and
      `check=True` fails the deploy where the deploy log is.
      **`/health` reports the build** (`build.commit`, `short`, `source`) and
      **re-reads the schema** rather than replaying the boot snapshot, with
      `schema_checked` saying which and a 30 s cache so a poller does not
      hammer the database. Nothing is guessed: no source, `"source":
      "unknown"`.
      `start.sh` ran uvicorn directly — a fallback that skipped the migration
      entirely — and now goes through `app.start` like every other path; a
      test holds all four.
      Suites exact: **1,372 pure** (was 1,355), 781 vitest, `tsc -b` and
      `build` clean. 17 new cases, and one old one **deleted because it
      asserted the defect**: `test_launcher_does_not_migrate_when_disabled`
      pinned the behaviour that took production down twice.
      Verified against the live database without writing to it: the launcher
      dry-run chose to migrate (flag off, database behind — Railway's exact
      condition), `alembic upgrade ... --sql` generates four idempotent
      statements and the version bump inside one transaction, and `/health`
      answered 503 naming `v6w7x8y9z0a1` against `w7x8y9z0a1b2`.
      **Not done here: the migration was NOT applied.** Applying it is the
      deploy's job now, which is the point of the card, and deploying is the
      owner's word to give.
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
- [x] **P0.3 clock** — `duration_ms`, `iteration_ms` and `corrective_turns` on
      `george.conversations` (alembic `w7x8y9z0a1b2`), off ONE monotonic clock
      inside the turn; elapsed seconds in the room's Working line; and
      `ops/turn_clock.py`, which reports median, p90 and worst for turn time,
      per round trip, iterations, calls and corrective turns over a window.
      **The first median is 27.4 s** — the target is under 10, so the gap is
      2.7x. Suites exact: 1,355 pure (was 1,331), 781 vitest (was 774),
      `tsc -b` and `build` clean. The twelve were re-run for the wall-clock
      number and **12 of 12 passed**, including the strict `why` that failed
      at P0.1.
      **Two things this card could not do.** The measured clock cannot be
      backfilled — those turns never read a clock — so the production reading
      below is derived, not measured, and it says so. And **this card adds a
      migration while P0.4 is open**: deploying it as it stands boots code
      expecting `w7x8y9z0a1b2` against a database on `v6w7x8y9z0a1`, and
      startup refuses to serve — the 09-12 crashloop exactly. P0.4, or a
      deliberate `alembic upgrade head`, comes before this reaches Railway.

- [x] **P0.6 the bill** — done 2026-09-13, and **the card's own premise did not
      survive the measurement it asked for.** The three steps were done; step 2
      is what broke it.

      **The 26.2% was never a fact about this build.** The message-tail
      breakpoint landed in `e067ba7` on 2026-09-05, and the 30-day window
      mostly predates it — 90 of the 138 billed turns are one scripted
      `coverage` sweep on 09-02, on a build with no tail breakpoint, and they
      carry **5.80M of the 6.80M uncached tokens**. Split at that commit:

      | | turns | uncached input | hit rate |
      |---|---|---|---|
      | before `e067ba7`, scripted | 90 | 5,798,145 | 14.5% |
      | before `e067ba7`, a person | 42 | 997,472 | 40.3% |
      | **since `e067ba7`** (current) | **6** | **58** | **87.3%** |

      **Fifty-eight tokens.** On the build that is live, uncached input is ~12
      tokens a turn and the target was already met. Caching is not where the
      money is; `e067ba7` closed it eight days ago and nobody had read the
      number since.

      1. **TTL raised** — `PREFIX_TTL = "1h"` on the tools and system markers
         (`agent/loop.py`). The tail stays 5m deliberately: it is rewritten
         every iteration, seconds apart, and is the *largest* block, so 2x
         there would be a pure surcharge. Mixed TTLs are legal in exactly this
         order — longer renders before shorter, and no explicit marker sits on
         the last block (the documented 400). **9 cases in
         `tests/test_cache_breakpoints_contract.py`; nothing had ever asserted
         `cache_control` at all.**
      2. **The tools array is NOT stable — four arrays, not "two or three".**
         `/ask` varies on `GEORGE_ENABLE_WORKFLOW_WRITES` (process-level) and
         on whether a page is in scope (**per question, same session**). The
         read+label block — 17 tools — is byte-identical by construction, but
         the marker sits on tool 26–28, so all four write separate entries and
         the first divergence is at index 22. Moving the marker to the end of
         the shared block is a real, free change; it is NOT done here.
      3. **Re-ran, and the target cannot be met by re-running** — `--ttl`
         reprices historical writes and cannot move a hit rate measured from
         tokens the API already recorded. Said so in the report, and added
         `--since <date>` so one build's bill can be read on its own.

      **What the TTL is actually worth: cents, and possibly negative.** Every
      inter-turn gap on the current build is either **under 5 minutes** (3 of 5
      — the 5m TTL already covers it) or **over 7 hours** (2 of 5 — no TTL
      covers it). The 5–60 minute band the 1h TTL exists for has **zero turns
      in it.** Writes are 2.1% of the bill, so the whole lever moves under a
      dollar a month either way. It is kept as insurance for when there is more
      than one user and gaps land in that band; on today's evidence it is not a
      fix, and one line reverts it.

      **The bill's real shape, which is a Phase 1 finding, not a Phase 0 one.**
      Per turn on the current build is **$0.39**, *higher* than the $0.23
      headline, and mean iterations are **6.0** against 2.41 over the window.
      Cost per turn is round trips, not cache misses — so **P1.a and P1.b are
      the cost cards**, and the re-measure after them is the one that matters.

      **RISK, RANKED — and one lever is refused.** Nothing here can touch
      trustworthiness: figures still come from tools, notices still surface,
      refusals still refuse, and those are held by the loop and the
      definitions, not by token count. What CAN degrade is reasoning quality,
      and the levers differ:
      - *Free.* The TTL. A cache hit and a miss present byte-identical input to
        the model; it changes the bill and nothing else. The array check is
        diagnostic.
      - *Bounded, already gated.* Fewer iterations (P1.a/P1.b) removes round
        trips spent LABELLING, not database reads — George sees the same
        evidence in fewer trips. Effort per turn (P1.c) genuinely could dull
        him, which is why that card already fails if any quality check on the
        twelve regresses.
      - **REFUSED: cutting `MAX_ROWS_TO_MODEL` from 200.** It was on the list
        and came off on 2026-09-13. It is the one lever that makes George worse
        at his job: it reduces what he can SEE, so more answers land as "this
        is a sample" instead of a reading. Truncation is honest — he is told it
        is a sample and told not to total visible rows, and `meta` aggregates
        are never truncated — but that is a reason it is safe, not a reason to
        do it. **Do not reopen this to save a few dollars.**
      - **Do not cascade models.** Caches are model-scoped, so routing cheap
        turns to a cheaper model forfeits cache reuse and usually costs more.
        One model, varying effort.

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

**The measured baseline** (the twelve questions). `verification/` is
**gitignored**, so this table is the record, not the JSON. Three real-model
runs now: 09-12 is the original, P0.1's re-run is in brackets beside it, and
**P0.3's run on 2026-09-13 is the one that carries the clock** — it is the
column a Phase 1 card reports against.

| | 09-12 [P0.1] | **P0.3, 09-13** | after Phase 1 |
|---|---|---|---|
| **median answer, wall-clock** | unmeasured | **27.4 s** · p90 45.1 · worst 71.8 | **< 10 s** |
| per model round trip, median | unmeasured | 4.8 s · p90 10.6 · worst 31.9 | — |
| iterations per turn, median / max | **5.5 / 8** [6.0 / 10] | 5.5 / 8 | ≤ 2.5 |
| calls per turn, median | 5 [5] | 5 | unchanged |
| label calls as a share of all calls | **51%** (28 of 55) [52%, 33 of 63] | 50% (28 of 56) | ≤ 25% |
| questions where `compose` was rejected | **8 of 12** [6 of 12] | 5 of 12, 9 rejections | ≤ 1 |
| corrective turns per turn, median | unmeasured | 0 · 5 across the twelve, worst 2 | — |
| notices surfaced · forced · invented figures | — | 12 · 0 · 0 | unchanged |

**THE TWELVE ARE A SAMPLE, NOT A PASS/FAIL GATE — read this before quoting a
score.** Four real-model runs now exist (2026-09-13): **12/12, 11/12, 10/12,
11/12**, and a different scenario fails each time. Separate the two kinds of
check, because they behave differently:

- **The trust properties are stable.** Across all four runs: notices surfaced
  100%, forced 0, tool vocabulary leaked 0, attribution shares claimed 0, and
  **exactly one ungrounded figure ever** — `morning`'s "800", which was the
  defect and is now gated. These are what the standing gate names, and they do
  not flap.
- **The style checks flap, and `leads_with_reading` is all of it.** It failed
  on `morning`, then `product` and `follow-up`, then `order` — every non-trust
  failure in four runs. The check is not broken: `order` genuinely opened with
  "...for the whole 90 days". George simply leads with a figure some runs and
  not others.

So **one run is a sample of a stochastic system**, and "12 of 12" recorded at
P0.3 was one draw, not a property. A Phase 1 card that reports a style score
off a single run is reporting noise; the trust row is the one that means
something from one run.

**27.4 s is the number Phase 1 has to move, and the arithmetic says where
from.** 5.5 round trips at a 4.8 s median is most of the turn; the reads
inside them are already batched and already concurrent. Getting to 10 s means
removing round trips, which is what P1.a, P1.c and P1.d each do — so the
per-round-trip row is the one to watch for a card that made a turn cheaper
without making it shorter.

**And what real use looks like, which is not the twelve**
(`ops/turn_clock.py --days 30`, read 2026-09-13). 193 turns, 133 answered, but
145 of them are the one scripted `coverage` sweep; `--user-only` leaves 46
answered turns by a person. Turn time there is **derived, not measured** —
`logged_at - asked_at`, which is the database's insert clock minus the web
process's start clock, and the two are 1.82 s apart at least, because some
turn in that window derives to −1.82 s. Derived median 25.8 s over everything,
20.4 s over people only; iterations per turn 3.0, calls 2.0. **No measured
figure will exist until a build carrying `w7x8y9z0a1b2` serves real turns** —
the column starts NULL and there is nothing to backfill it from.

**Read this before planning any Phase 1 card.** An iteration is one sequential
model round trip, and it is iterations — not database reads — that make a turn
slow. Reads are already batched and already run concurrently
(`asyncio.gather`, `agent/loop.py`), so **parallelism is not a lever and is not
a card.** Half of all tool calls are George labelling his own work, and
`compose` is refused in two questions out of three, each refusal costing a
whole round trip. One question ("cannot") spent 8 iterations and 4 `compose`
calls to answer "I can't see foot traffic".

- [x] **P1.a compose stops round-tripping** — done 2026-09-13. Measured on a
      live run of the twelve against P0.3's column, and **two of the three
      measures moved without meeting their target**:

      | | P0.3, 09-13 | **P1.a, 09-13** | target |
      |---|---|---|---|
      | compose rejections per turn | 0.75 (9, in 5 of 12) | **0.33** (4, in 4 of 12) | ≤ 1 question |
      | label calls as a share of all calls | 50% (28 of 56) | **33%** (14 of 42) | ≤ 25% |
      | iterations per turn, median / max | 5.5 / 8 | **4.0 / 6** | ≤ 2.5 |
      | median answer, wall-clock | 27.4 s · p90 37.5 · worst 71.8 | 24.5 s · p90 29.7 · worst 41.9 | < 10 s |

      **The shortfall: label share is 33% against 25%, and iterations are 4.0
      against 2.5.** Rejections met their target; the other two did not, and
      the remaining label calls are now one `compose` per turn (14 calls across
      12 turns) — so 25% is not reachable by removing more label calls, only by
      removing READS, which is P1.c and P1.d's business. Say that plainly
      rather than counting this card as having hit its numbers.

      **The standing trust gate held, and is the row that means something from
      one run**: notices surfaced 12 of 12, forced 0, figures in prose that no
      tool returned **0**, tool vocabulary leaked 0, attribution shares 0.
      Refusals still refuse — what is refused is now a smaller and better
      set.

      **The twelve scored 11 of 12, and `cannot` is the failure.** It is a
      wording match, not a trust failure, and it is reported as a failure
      anyway. George answered *"There's no footfall counter at Rockwell —
      nothing in the system counts people through the door, so the closest I
      can give you is transactions rung up, and that's receipts, not
      visitors… what that doesn't settle is whether more people came or the
      same people came more often; nothing here can separate those."* That is
      a refusal in plain English. The check wants `pushback.refusal`'s
      phrases, and it holds "there is no" against his "There's no" — a
      contraction — while `_LIMITATION` lists "nothing here says/shows/tells"
      but not "nothing here can separate", and "what THAT doesn't settle" is
      not among its subjects. **The check was not widened to make the run
      pass**: fitting a measure to a result is what P0.2 deleted 91
      assertions for. The owner decides whether the phrase list moves.

      (a) **What was actually being refused was not what the card guessed.**
      The card named a second `lead`, a `change` carrying a stray field and a
      no-op `change`; across four recorded runs those occur **once between
      them**. Replaying all 46 refusals gave the real distribution: 15 a
      figure or hero naming no subject over a ONE-ROW read, 11 a spec node
      saying `type`/`kind`/`node`/the bare key where the grammar says
      `layout`/`mark` **carrying the grammar's own words as the value**, 5 a
      comparison naming no subjects, 1 a `quiet` restating its seq, 1 a note
      with a digit. The card's three were built anyway — they are cheap and
      correct — but the win came from the two it had not seen.
      The `cannot` scenario is the whole argument: George read
      transaction_count filtered to Rockwell, composed a hero subject
      "Rockwell", and was refused because `group_by: []` had left no column
      carrying the word; dropped the subject, refused; tried a figure,
      refused; **re-read the identical number grouped by store so the word
      would appear in a cell.** 7 iterations, 6 calls, 4 composes, 3
      rejections, to say he cannot see foot traffic. It now runs in **4
      iterations, 3 calls, 1 compose, 0 rejections.**
      So: a subject the read's own `filters_applied` declares is BACKED, and a
      one-row read with no subject draws that row and is captioned from the
      read's scope — never from anything the model supplied. **A many-row read
      with no subject is still refused**, because choosing which of seven
      shops a figure draws is a judgement and one made by defaulting to row
      zero is the worst kind.
      **One coercion came back off the list.** Dropping a stray field and
      drawing the rest was in the card; a block carrying `value: 412884`,
      `colour`, `width` or `title` is not a misspelling but the attempt
      `compose.py` exists to stop, it costs no round trip to refuse
      (`additionalProperties: false`, and zero occurrences in four runs), and
      the six trust cases that assert the refusal were kept.
      Every adjustment comes back on `meta.coerced` in words: silent
      divergence is the thing that is not allowed.
      (b) **Done, and used.** `record_findings` is gone from the schema and
      the roles ride `compose(findings=...)`. In the live run **12 of 14
      composes carried findings and record_findings was called 0 times**,
      against 8 calls and 20 composes at P0.3. `agent/findings.py` is
      untouched and still owns every rule — what moved is the door. The name
      is kept in `Working.tsx` and declared retired in
      `test_surface_contract`, because every conversation recorded before
      today holds real calls to it and a stored turn reading "thinking…" has
      lost the thing that line is for.
      (c) **DONE 2026-09-12.** Prose written beside a LABEL call is the
      answer, not narration: the `interim_prose` reset fired on any
      `tool_use`, including `compose`. Held by four cases in
      `tests/test_interim_prose_contract.py`.
      Suites exact: **1,468 pure** (was 1,440), 781 vitest, `tsc -b` and
      `build` clean. 26 new cases in
      `tests/test_compose_coercion_contract.py`; four old ones rewritten
      because they asserted the refusal, and none deleted.
      **Not done here, and it is a measurement gap:** the eval report did not
      keep a warning's DETAIL, so the four earlier runs had to be
      reconstructed by replaying stored arguments through the validator —
      which cannot see the rows and guessed wrong about which refusals were
      real. `warning_detail` is now on the record; the next session reads the
      reasons instead of inferring them.
      **And a note on the commit.** The code landed inside `f955306`, whose
      message is about eval cost: a second session committed in this
      repository while this card was in flight and swept the working tree in
      with its own change. Nothing was lost and no history was rewritten —
      but `f955306` is where P1.a is, not what it says.
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

**The standing gate on every Phase 1 card, and on P0.6.** This phase dismantles
the machinery that enforces George's trust guarantees, so each card re-runs the
twelve and reports, beside its own number: notices surfaced (must stay 100%),
no figure in prose that no tool returned, refusals still refusing. A card that
buys speed **or cheapness** by losing one of those has failed — say so rather
than keeping the win.

**And the separation that gate rests on, because it decides which levers are
even allowed.** *Trustworthiness* and *reasoning quality* are two different
things. Trustworthiness is structural: figures come from tools, notices
surface, refusals refuse, and no amount of caching, batching or budget work
can make George invent a figure. Reasoning quality is not structural — it
depends on what he can see and how hard he thinks, so anything that narrows
context or lowers effort can dull him without tripping a single guarantee.
**A lever that only costs money is free; a lever that narrows what he reads is
the product.** That is why P0.6 refuses the row cap and accepts the TTL.

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

    .venv\Scripts\python.exe ops/verify_integration.py pure     # 1,410 expected
    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7
    .venv\Scripts\python.exe ops/cost_report.py --days 7

**`ops/cost_report.py` is NOT the bill**, and the weekly sweep must not treat
it as one. It reads `george.conversations`, which holds only turns that
reached `ConversationLog` — **no eval turn is in it**, because the harness
stubs the log, and neither are retries or turns that died before writing.
Measured 2026-09-13: the script saw 9.4M presented tokens over 30 days while
the console showed **51.6M on the same key**. 18%. Two confident conclusions
came out of that gap in one afternoon and both were wrong.

**For the bill, read the Anthropic console** — filter by the `george` API key,
group by *token type*, and read the day, not a rolling window. The token-type
split is the part that matters and the script cannot produce it. One heavy day
(2026-09-13, $18.20):

| | | |
|---|---|---|
| cache WRITE | $8.03 | 44% |
| cache READ | $5.90 | 32% |
| output | $4.27 | 23% |
| uncached input | ~$0.00 | 0% |

**Caching is working and is not a lever: 9.5 read per write, saving 74%.** Do
not reopen the TTL or chase the hit rate. What that day actually was: roughly
six full eval runs and the turns sessions fired while building, against 193
real turns in the whole month. **The bill is the building, not the product.**

Use `cost_report.py` for what it is good for — comparing George's own turns
with each other, across builds with `--since`.        # the weekly sweep
    .venv\Scripts\python.exe ops/turn_clock.py --days 7        # the clock (P0.3)
    .venv\Scripts\python.exe ops/turn_clock.py --days 30 --user-only
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
