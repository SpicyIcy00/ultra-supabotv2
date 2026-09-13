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
- **DO NOT ASK THE OWNER DESIGN QUESTIONS.** Added 2026-09-13, after a session
  spent asking him to choose between design options and he said: *"i cant
  really answer your questions cause i dont really know what i want and how to
  describe it, thats why i needed you to research cause everytime my ideas i
  think theyll be good but arent."*

  **His diagnosis has been right every time and his prescriptions have not.**
  "Stuff came out but it just disappeared", "where did my other pages go",
  "putting the text in a widget doesnt work", "i dont really know what im
  looking at" — every one correct, and two of them led straight to a cause in
  the code. But "make george a page" then "make it full screen with a back
  button" was a design he had to revise the next day. That is the ordinary
  shape of being the person who USES a thing, and asking him to design is
  asking for the half he has already said he cannot do.

  So: **he reports what is wrong; the session decides the fix and says why;
  he reacts to the result.** A question like "should a new question clear the
  board?" is the session's to answer. When a preference genuinely cannot be
  derived — a real fork with no evidence either way — **build one, show it,
  and let him point.** Never make him describe it in advance.
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
| Next card | **Whatever is Open in `ops/DOGFOOD_LOG.md`, then P1.c.** The remaining cards were rewritten 2026-09-13 into the plan that reaches the Ideal UI: P1.c–P1.k, P2.a–P2.h, P3.a–P3.f, and Phase 4 sources. P1.c, P1.d, P1.e and P1.g ARE the Open items, in the log's own agreed fixes. P1.b closed 2026-09-13: first composed object 16.8 → 8.2 s, first visible object unmoved at 7.0 s (bounded by the first round trip; only replay, P1.i/P1.j, can reach 2 s). The bill is round trips, not cache misses. Read the note under the baseline table before reporting any Phase 1 number against the twelve. |

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

**A full run of the FIRST TWELVE is $2.90. The figure here has now been wrong
twice, in both directions, and this is the third statement of it.** It said
$5–7 (an iteration estimate). It was corrected to $1.65 on the harness's own
`spend`. **`spend()` was itself understating by 40%**: it summed only the
SCORED scenarios, and four setup turns — "How is Rockwell doing?" re-asked for
follow-up, correction and keep-page, plus the Seikyo draft for run-monday —
never reached it. Measured from `verification/p1b-final.json`: $1.71 scored
plus **$1.19 unscored = $2.90**.
`harness.METER` now counts every turn at `run_turn`, and the report prints
scored and setup separately, so this cannot happen a fourth time. The old figure sat here while a close-out 500 lines below said it was
a fifth of that, and an inflated price is not a safe error: it makes a session
skip a run that would have caught a trust failure. It does not appear in
`ops/cost_report.py` — the harness stubs `ConversationLog`, so an eval turn
never reaches `george.conversations`, and the JSON's `spend` key is the only
place the number comes from.

**WHEN A CARD RUNS ANYTHING AT ALL — the rule, so it is not re-decided per
card.** A live run happens only when a card **changes the trust machinery
itself** (the prompt, the compose grammar and its roles, the figure gate, the
notice path, effort per turn) **or at a phase close.** Everything else RIDES
the close.

Tightened 2026-09-13, after the owner asked whether so many cards needed one.
**Six gates were dropped**, and the reason is not thrift: they sat on cards
where a regression was speculative AND **the four gate scenarios could not
have seen it.** A new comparison (`P2.i`, `P3.f`) is a capability no gate
scenario asks for, so a run there proves nothing; `P2.c`, `P2.d` and `P2.f`
are context and rendering; `P1.c` breaks or fixes compose refusals, which are
its own numbers. **Six live runs across 28 cards, ~$11.04** — P1.e's tail,
P1.f, P1.h and the three phase closes at ~$1.84 each on v2; **P1.g is $0.00**,
replayed through `tests/evals/corpus.py`. Folding P1.m into P1.e removed a
SESSION, not a run: the same six runs happen.
**The earlier $9.10 was wrong, because the meter was.** Against v1 at its true
$2.90 the same seven runs would have been ~$18. The real gain from dropping
the six gates is six sessions that do not stop to run something that could not
inform them; the money is secondary and always was.

**What this does NOT buy back: attribution.** A regression landing in a riding
card surfaces at the close, with up to eight cards behind it. That is the
accepted cost, accepted because those six runs could not have caught it
anyway. If a close ever fails on a trust row, the bisect is the price.

**THREE WAYS TO SPEND LESS, and only one of them is "run fewer questions".**
Measured from `p1b-final.json`: cache WRITE $0.70, cache READ $0.54, output
$0.47, uncached input $0.00. **~72% of a run scales with ITERATIONS, not with
how many questions you ask** (2,231 cache-write tokens per iteration, 50
iterations in that run).

1. **Replay recorded answers instead of buying new ones —
   `tests/evals/corpus.py`, $0.00.** Every trust check is a pure function of
   `(answer, results)`, so a card that changes only a CHECK never needs a live
   turn. **P1.g is exactly that card**, and its $0.63 gate comes off the plan.
   Proven on the day it was written: replayed against `p1b-final.json` it found
   the `warning_stock` leak in `caveats` unaided, for nothing. Reports now
   store bounded evidence (30 rows per result) so this works from here on;
   the seven older reports carry no rows and only the two answer-only checks
   replay against them, which the tool says rather than quietly reporting less.
2. **P1.h is the real discount, and it is a card not a trick.** Effort per
   turn cuts iterations, and iterations are 72% of the bill. At its target
   (4.0 → 2.5) a run goes from ~$1.84 to ~$1.25. **It currently sits AFTER
   P1.f and P1.g, so only the three phase closes get the discount.** Moving it
   to just after P1.m would put every later run on the cheaper rate and save
   roughly $2.80 — at the cost of changing effort and the compose grammar in
   adjacent cards, which makes a regression harder to pin on either. Not done:
   it is a real trade and the owner's to make.
3. **Keep a pair of runs inside the hour.** `PREFIX_TTL` is 1h, so the second
   run of the two-run cap re-reads the prefix instead of writing it. Runs on
   different days pay the write twice. Costs nothing to obey.

**What does NOT work, so it is not re-proposed:** a cheaper model (caches are
model-scoped and the eval must run what production runs), and cutting
scenarios (they are 28% of the cost between them — the gate's four are $0.63
of a $2.90 run).

**THE TRUST GATE — four scenarios, $0.63 MEASURED, and it is what "subset"
means.**
Do not pick scenarios by feel. Across every recorded run the **trust rows are
stable and the style checks flap**, so a run's value is almost entirely in
four scenarios:

| scenario | what only it catches |
|---|---|
| `caveats` | a notice not surfaced, or FORCED after corrections |
| `why` | a figure in prose no tool returned; attribution shares |
| `cannot` | a refusal that stopped refusing |
| `morning` | the volunteering cap, and the rounded-figure gate (the "801") |

Measured per scenario from `p1b-final.json`: `why` $0.24 (7 iterations, an
investigation), `caveats` $0.16, `cannot` $0.12, `morning` $0.11.

Run those four for any card that touches the trust machinery. Run the full
suite **only at the three phase closes**.

**The per-scenario table is also where to look for a cheaper run.** `shop`
cost **$0.34 and 6 iterations** — the single most expensive scenario in the
suite, dearer than the investigation — which is one reason it is not a scored
scenario in v2. And P1.h (effort per turn) should cut every later run, because
cost is round trips: it is not counted in the totals below, deliberately,
because it has not been measured.

**Two runs per card, maximum.** One to see the problem, one to confirm the
fix. **A third failure means the card is wrong, not the code** — stop, write
what happened in DECISIONS.md, and let the owner decide. Iterating a live
model against a failing check is where eval money actually goes: the $18.20
day was ~6 full runs, and none of them was a gate.

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
        evidence in fewer trips. Effort per turn (P1.h) genuinely could dull
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

**Read before any surface work (2026-09-13, from the review of the 26).** The
standard describes TWO kinds of screen and one surface kept trying to be
both — that is the five rebuilds. *Answering* (a question, one finding, its
evidence, transforms predictably, short-lived) and *operating* (a page, a
system, the queue: many objects, STABLE, does not recompose on a question,
long-lived). The finding is the answering surface. Pages/inbox/workflows are
the operating surface and are their own thing, not pinned answers. "Keep
this" is the bridge. **Feature 4 (expressive visuals) is dropped; feature 1
is narrowed to a fixed catalogue of marks chosen by what the claim asserts.**
Reasoning in DECISIONS.md.

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
removing round trips, which is what P1.a, P1.h and P1.j each do — so the
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
      removing READS, which is P1.h and P1.j's business. Say that plainly
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
- [x] **P1.b the board fills when data lands** — done 2026-09-13, and **the
      card's own measure did not move, because the thing it assumed was empty
      was not.** Built as written: `agent/default_composition.py` composes a
      default the moment reads land, through `compose.validate` — the same
      gate, the same closed vocabulary, so a default block and one of George's
      are the same object. It rides the `compose` frame saying `default: true`,
      is stored on the answer post beside his, and his supersede it BY SEQ
      (he never sees the default's keys, so he cannot name one).

      | | P1.a, 09-13 | **P1.b, 09-13** | target |
      |---|---|---|---|
      | time to first visible object, median | 7.0 s · worst 15.0 | **7.0 s** · worst 15.0 | < 2 s |
      | time to first COMPOSED object, median | 16.8 s · worst 27.8 | **8.2 s** · worst 14.8 | — |
      | median answer, wall-clock | 24.5 s | 24.6 s · p90 36.7 · worst 43.6 | < 10 s |
      | iterations per turn, median / max | 4.0 / 6 | 5.0 / 7 | ≤ 2.5 |

      **The first number did not move at all, and the card's premise is why.**
      The board was never empty when reads landed: `editsFor` in
      `room/board.ts` has always drawn a quiet table per read while a turn is
      in flight. What it was empty of was anything SHAPED — and that is the
      row that moved, 16.8 s to 8.2 s median, on 8 of the 10 turns that
      compose anything at all. The other two (`shop`, `product`) are unchanged
      because George composed BEFORE their composable reads landed; nothing
      here can beat him to it.

      **2 s is missed 3.5x, and this card cannot reach it — say that rather
      than the 8.2.** Both numbers are bounded below by the first model round
      trip plus the read: the fastest first object in the twelve is 4.3 s and
      the fastest composed one 4.7 s. **Nothing that waits for a read can be
      under 2 s.** The only path to it is P1.j, which answers a navigation
      fragment with no model call at all.

      **The standing trust gate, and it is not whole — on a run whose input to
      the model is byte-identical to the run before it.** The twelve scored
      **10 of 12**: `why` put "and 45 others" in prose (48 uncompared products
      minus the 3 he named — a figure no tool returned) and `caveats` leaked
      `warning_stock` and had a notice FORCED after two corrections. Notices
      surfaced 12 of 12, attribution shares 0. The run immediately before, on
      code differing only in *when* the default frame fires, was 12 of 12 with
      forced 0, ungrounded 0 and leaked 0 — and both scenarios got a default
      in both runs, so the default is not the cause. Both are logged in
      DOGFOOD_LOG rather than explained away.

      **What it does NOT do, deliberately.** It never carries a note, an
      emphasis or a finding — those are readings, and a reading is George's.
      And it never reaches `_drawn_on_the_board`: a caveat is discharged by a
      person deciding to draw the read that raised it, not by a default doing
      it for him. Held by `tests/test_default_composition_contract.py` (22
      cases).

      **And it inherits the top Open defect on a path nobody chose.** With a
      default on the board, `editsFor` no longer falls through to the reading
      tile — so a turn George never composes text into is shapes and silence,
      which is exactly complaint 1 above. **The floor was not built here**,
      because the log forbids that shape of fix: the agreed change is to
      remove `text` from the widget vocabulary entirely and draw the reading
      as a region above the board, which closes this path and his together.

      **Measurement built, and it is the half that was missing.** Nothing
      recorded when the screen first had something on it — `duration_ms` says
      how long a turn took, not when a person stopped looking at an empty
      room. Every frame now carries milliseconds since the turn started
      (`tests/evals/harness.py`), and `tests/evals/timing.py` replays them
      through the room's own board rule, with `with_default=False` giving the
      before off the same frames. One run, both numbers, none of the noise of
      comparing two draws of a stochastic system.
      Suites exact: **1,497 pure** (was 1,468), **791 vitest** (was 781),
      `tsc -b` and `build` clean. Two live runs of the twelve, $1.59 and $1.71
      — a fifth of the $5–7 this file estimates.

**The letters after P1.b were reassigned 2026-09-13, and a close-out above may
still read oddly because of it.** The cards from here on were rewritten to
reach the Ideal UI (§6). Two ids changed meaning: the old **P1.c "cheaper
turns" is now P1.h**, and the old **P1.d "fragments skip the model" is now
P1.j**. Four pointers inside P0.6's, P1.a's and P1.b's close-outs were
repointed to the new ids so they still name the card they meant; **no finding,
number or reasoning in any close-out was changed.** If a close-out names a card
whose description does not match what it is claiming, this is why — check here
before believing it.

- [ ] **P1.c the reading leaves the widgets** — the top three Open items in
      the dogfood log, done as the log's AGREED FIX says: `text` is REMOVED
      from the compose vocabulary; the reading is a permanent region above
      the board drawn from the turn's prose, never a tile; a turn with no
      prose is recorded as a gap. Also the PESO match in `room/data.ts`
      (a `value` column that is a count is not money) and the
      `[object Object]` header. Subtraction, not a fallback tile.
      Done when: "how are we doing" and "any problems" both show George's
      words above whatever is drawn, on the live build; three of the twelve
      re-run with prose on every turn. **No eval** — the vocabulary change
      is model-facing, but the four gate scenarios cannot see it: what this
      card breaks or fixes is COMPOSE refusals and where prose lands, both of
      which are the card's own numbers. It rides P1.f's run.
      model-facing).
- [ ] **P1.d the board transforms; it never accumulates** — the rule decided
      in the log: a question sharing no subject with the board CLEARS it; one
      sharing a subject TRANSFORMS it in place; earlier turns fold to one
      quiet tappable line above the finding. Absorbs the old P2.b. Done
      when: "how are we doing" then "any problems" leaves one finding;
      "why?" transforms the OPUS finding; a board test holds both. No eval.
- [ ] **P1.e six marks, drawn one way each** — the renderer's fourteen
      widget kinds become the catalogue in the Ideal UI: figure, dumbbell
      (before/after), ranked (bars in cells), contributors (drivers), line
      (baseline dotted when the tool returned one), table. Every block: a
      claim-title, a subtitle derived from `meta` (metric, window, unit),
      its own source line. Colour is direction only; digits mono and
      tabular; direct labels, no legends. Existing compose blocks are MAPPED
      onto the six so nothing George says stops rendering. Done when: every
      block in four recorded runs renders as one of the six with a source
      line; a palette test fails on a fifth data colour.

      **AND THE TAIL THAT WAS P1.m, ~30 minutes plus one run (~$1.84).** It
      was a card until 2026-09-13, and it should not have been: the work is
      already written and committed, and what is left is not a session.
      **It rides HERE and nowhere else**, because this card is renderer-only —
      no model-facing change is in flight, so v2's first run is clean and a
      gate failure means v2, not something else. It cannot ride P1.f, where a
      gate failure would be ambiguous between the suite being wrong and the
      compose rewrite breaking something.

      Already built (`tests/evals/test_voice_evals_v2.py`, `checks.grounded_numerals`,
      the `gate` marker, `harness.METER`, `tests/evals/corpus.py`); 11 tests
      collect and the 1,497 pure tests pass. **Nothing live has been run.**
      What is left: **run v2 once**; confirm its four gate scenarios agree
      with the same four recorded in `verification/p1b-final.json` (they are
      byte-identical between the suites, which is why the comparison holds);
      **delete `tests/evals/test_voice_evals.py`**; repoint §2b and the
      baseline table at v2. **Do not re-run v1** — $2.90 to watch seven
      scenarios be replaced. If the gate DISAGREES, v2 is wrong: fix it and
      say so rather than deleting the evidence that caught it.
      **Eval: full, once, v2 only.** Report what it actually cost from the
      new meter — ~$1.84 is an estimate derived from v1's per-scenario costs.
- [ ] **P1.f compose narrows to the catalogue; the text gets three slots** —
      the label grammar becomes the six marks plus a claim-title per block;
      the findings roles become claim (one highlight) · caveat (whole, above
      the figures) · next (one sentence, always last — the ladder's stop
      sentence lands here). Coercion stays; what it validates gets smaller.
      Done when: rejections ≤ 1 question, label share not worse than 33%,
      trust rows unchanged, every answer has a claim and a next; style checks
      NOT widened. **Eval: full.**
- [ ] **P1.g arithmetic in prose, and a column name in the answer** — the two
      trust failures George filed himself ("and 45 others"; `warning_stock`;
      a forced caveat). The figure gate learns that a numeral equal to a
      simple sum or difference of two figures on the board is a calculation
      and strikes it with the same one corrective turn; the leak list gains
      the missing column; the forced caveat is traced through stored frames.
      Done when: the new gate case is a contract test, and
      `tests/evals/corpus.py` replays every recorded run clean — including
      `p1b-final.json`, which today reports the `warning_stock` leak this card
      fixes. **NO EVAL, $0.00.** This card changes CHECKS, and a check is a
      pure function of (answer, results): recorded answers prove it without a
      live turn. Only if the corrective BEHAVIOUR changes does it ride P1.h.
- [ ] **P1.h cheaper turns** — effort per turn via the mid-conversation
      effort message (low: label-only or follow-up; medium: fresh question;
      high: the ladder) so the cache survives; the six corrective gates
      become deterministic edits, a model turn only for a false write claim.
      `MAX_ROWS_TO_MODEL` stays 200. Done when: median turn time and
      corrective turns per turn down, every quality row on the twelve
      unchanged — any quality row moving fails the card. **Eval: full.**
- [ ] **P1.i replay: the endpoint** — `POST /george/replay`: a stored call
      with ONE argument changed among those the tool accepts (window, store,
      group_by, rank_by, top_n), run as `george_ro`, returning `{rows, meta}`
      and a board frame; no model; refusals in the tool's words; the changed
      argument recorded on the post. Done when: "last week" → "August" on the
      stored OPUS call returns in < 1.5 s with correct receipts; an
      in-progress window is refused by name; contract tests hold both. No
      eval.
- [ ] **P1.j read-as tokens, and fragments that skip the model** — the
      arguments the loop accepted drawn as tokens under every ask; a tap is a
      replay. NAVIGATION fragments ("last month", a tapped shop, the window
      control) redraw with no model call; ANALYTICAL fragments ("products",
      "why?") draw from the replay and George's reading follows in the same
      turn — never dropped for the number. "Not what I meant" is the one
      token that costs a turn and records a belief. Done when: first visible
      change for a navigation fragment < 2 s, for an analytical one < 2 s to
      the figure, measured by `tests/evals/timing.py`. **No eval** — the
      tokens are rendered from arguments the loop already accepted and a
      fragment SKIPS the model, so nothing here changes what it sees.
- [ ] **P1.k visible work, for free** — from frames already carried: the line
      above the claim (reads, tools, time, caveat count); the Working line as
      a step list with a result and `duration_ms` per step, tappable;
      "Behind it" as a view on the thread — reads with receipts, never code;
      an underlined figure in a claim jumps to its read. Done when: "why is
      Rockwell down" shows four steps with times and a finding after; nothing
      model-written appears in a mono line. No eval.
- [ ] **P1.✓ close the phase** — every target against its number, which
      cards paid, what did not move and why; one full run of the twelve.
      Then a Fable 5.1 review session reads the close-outs against the code
      and names what Phase 2 should not trust. **Gate to Phase 2:** Open
      empty five days running; median < 10 s or the shortfall named with its
      cause; a navigation fragment redraws with no model call; trust rows
      unchanged.

**The standing gate on every Phase 1 card, and on P0.6.** This phase dismantles
the machinery that enforces George's trust guarantees, so each card that is
model-facing re-runs the twelve and reports, beside its own number: notices
surfaced (must stay 100%), no figure in prose that no tool returned, refusals
still refusing. A card that buys speed **or cheapness** by losing one of those
has failed — say so rather than keeping the win. *Trustworthiness* is
structural and cannot be bought away; *reasoning quality* is not, so a lever
that only costs money is free and a lever that narrows what he reads is the
product. That is why P0.6 refuses the row cap and accepts the TTL.

**Phase 2 — the finding, to the Ideal UI.** Only after P1.✓. Eleven sessions.
Answering mode reaches the screens in the Ideal UI (§6).

- [ ] **P2.a a thread is already a page** — header with three views, Talk ·
      Behind it · Page, and an unkept state; "Keep as page" calls
      `create_page` on the calls the loop marked pinnable and the header
      turns to the page's name; the Page view lists what would be kept and
      what is not pinnable and why. Done when: Keep as page → the page opens
      in Kept re-running; a kept thread shows its page; a dom test holds it.
      No eval.
- [ ] **P2.b markers on figures, two voices, five colours** — the client
      matches numerals in the claim to the turn's rows (as the eval does) and
      draws the read's index after each; an unmatched numeral gets no marker
      and the caveat colour. A scan test: model prose only in the serif,
      frame-derived strings only in the mono. The accent scan extends to up,
      down, george, quiet. No eval.
- [ ] **P2.c a subject becomes an id — by tap, and by `@`** — ONE mechanism
      with two doors, which is why they are one card. **Tap:** a shop, product
      or driver in the evidence adds its ID FROM THE ROWS as a composer chip.
      **Type `@`:** completion over stores, suppliers, products and the
      caller's own pages, resolved from the same reads `get_object` already
      makes, landing as an id — so "@Rockwell" can never be read as a product
      name, and an `@page` binds `page_scope`. Both produce the same chip and
      travel in the same request field. Short things then resolve against the
      board, not the transcript ("these two", "why?", "exclude the barn",
      "last month"); two subjects + "compare these" is a replay.
      Absorbs the old P2.a. **The `@` half was missing from this plan until
      2026-09-13** — it is borrowing 10 (Hex's `@` data source, Linear's `@`),
      it is drawn in the Ideal UI's composer, and no card had it.
      Done when: tap OPUS, tap Rockwell, "compare these" → a dumbbell in
      < 2 s with no model call; typing "@Seik" offers the supplier, the page
      and the rule, distinguished; the resolved id reaches the tool argument;
      tests on the resolution, not the wording. **No eval** — rides P2.✓.
- [ ] **P2.d actions that say why; grey text that finishes the question** —
      label actions gain a TARGET (a row's subject id) and a REASON (a
      characterisation, never a number — the annotation rule); the renderer
      places a targeted action on its row, the rest at the foot; the cost
      label (replay · ~1s · a turn) is derived. Ghost completions built
      deterministically from the board (last read with one argument changed,
      subjects on screen, pages naming them); Tab accepts; none ever needs a
      model call. **No eval** — rides P2.✓.
- [ ] **P2.e replay an investigation** — a finished ladder walked from the
      post's stored calls: each step's rows, receipts, time; a refusal shows
      as a refusal; no planner. No eval.
- [ ] **P2.f what do you remember?** — `view_memory` drawn as a finding:
      every belief, when, from what, how often applied; Forget on each; "not
      what I meant" → `record_belief` and the next answer uses it. Beliefs
      are readings, never figures. Done when: "we means the shops" taught
      once changes the next "how are we doing"; Forget removes it after.
      **No eval** — rides P2.✓, where the thread's "i value sales more" turn
      is the scenario that exercises this.
- [ ] **P2.g the estate switch** — shops · AJI BARN · AJI CMG as a scope on
      the next question, travelling as store scope, from `metrics.yaml`'s
      lists and nowhere else. Vending is READ (`get_vending`, the `_php`
      views); what is missing is the switch. The domains are compared side by
      side and NEVER joined (`vending.never_join_to_store_domain: true`), and
      any vending profit figure carries its overstated-on-72.7% flag. No eval.
- [ ] **P2.h voice, and hands-free** — browser speech into the same
      composer, carrying the same selection; hands-free reads the claim
      aloud, shows the one line, evidence a tap away, interruptible. No new
      surface. Absorbs the old P2.d. No eval.
- [ ] **P2.i same-store year-over-year** — **the highest-value card in this
      file, and it is seasonal.** `comparisons.not_supported.same_period_last_year`
      refuses YoY because the estate is a different shape a year apart (5
      stores traded Aug 2025, 7 traded Aug 2026) and it names its own fix:
      *"Define that rule first, then add the comparison."* Aji Ichiban sells
      Chinese candy in the Philippines — **Christmas and Chinese New Year are
      the year**, and `previous_period` cannot see either: December against
      November is not a comparison, December against last December is.
      Today George structurally cannot answer the owner's two biggest
      questions.
      Build: a `same_store` rule in metrics.yaml (a store counts if it traded
      in BOTH windows — the owner confirms the wording, it is a definition,
      not a design question), `compare_to='same_period_last_year'` computed in
      the tool over both windows in one statement like `previous_period`, and
      `meta` naming which stores were counted and which were excluded and why.
      An excluded store is never silently dropped.
      Done when: "how did last December go against the year before" answers
      with the comparable set named; a store that opened mid-window is
      with the comparable set named; a store that opened mid-window is
      excluded BY NAME in the receipts. **No eval** — a new comparison is a
      new CAPABILITY, and no gate scenario asks for one, so a run here proves
      nothing. Its contract tests are the check; it rides P2.✓.
      **TIMING:** at one card a day this lands ~mid-November, which is late
      for a Christmas run-up. If the owner wants it sooner it is the one card
      worth pulling ahead of the Phase 2 surface work — it changes what
      George can SAY, not how it looks.
- [ ] **P2.j the stock watch fires before the stock-out, not after** — today
      a watch fires when a line crosses zero, which reports a stock-out that
      has already cost the sale. The useful condition is "will cross zero
      before it can be restocked". The primitives exist: `tools/replenishment.py`,
      `tools/purchase_plan.py` and a units/week rate over closed weeks.
      The missing input is LEAD TIME, and it does NOT need the frozen PO
      export (S.2): architecture rule 6 already allows a definition to declare
      a **bounded setting** a person binds and every run records, so "Seikyo
      takes 3 weeks" is a number typed once, with bounds, in metrics.yaml.
      A line with no lead time set is reported as having none — never
      defaulted to a guess, which would be a threshold nobody chose.
      Done when: a watch on AJI BARN fires for a line still above zero whose
      cover is under its supplier's lead time, naming both numbers; a line
      with no lead time set says so instead of firing. **No eval** — a
      scheduled watch makes no model call at all (rule 7), so the twelve
      cannot see this card.
- [ ] **P2.✓ close** — walk the four board scenarios in the Ideal UI on the
      live build, report each against it, one full run. **Gate to Phase 3:**
      Open empty five days; the four scenarios work as drawn; median still
      under target.

**Candidates, not cards — parked 2026-09-13 so they are neither lost nor
started.** Each is grounded in data that already exists; none is scheduled,
and none is begun without the owner saying so.

- **Negative stock as a data-integrity measure.** Fuan Haw reached −14: the
  book is wrong, and negative lines per store per month is a shrinkage /
  receiving-accuracy signal computable from `inventory_levels` with no new
  source. It answers a question that has never been askable.
- **Transfers drawn as flow.** CLAUDE.md declined the map and the stock gauge
  and explicitly did NOT decline weighted arrows, because
  `movement.bases.transfer_records` sets `names_destination: true`. Barn → shop,
  weighted by volume. It is the one expressive form with real data behind it,
  and it returns part of feature 4 honestly.
- **Deliver the morning where the owner already is.** `tools/brief.py` and
  `BRIEF_TOKEN` exist and CLAUDE.md already calls Telegram a window onto the
  same river. Feature 12 fails if being proactive requires remembering to open
  a browser tab.
- **Basket affinity** from `new_transaction_items` — real for an assortment
  retailer, but it needs a definition and misleads easily. Lowest confidence
  of the four; parked deliberately behind the others.

**Phase 3 — operating mode.** Seven sessions. Stable surfaces of many
objects; none recomposes on a question.

- [ ] **P3.a Needs you as a queue** — one queue, per-kind verbs (Promote,
      Switch on, Look into it), Later to tomorrow or Monday (a small per-user
      snooze table — migration), keys j/k/e/l. Promote stays the only accent
      action; a fired watch never wears it; empty and failed render without
      it from a loaded result. No eval.
- [ ] **P3.b Today is a list that ends** — three groups: what the morning
      question found, what is due today (Needs you rows, watches dated
      today), what you asked him to bring back ("ask me Thursday" is an item
      on the snooze table); loading / failed / loaded are three renderings;
      the end line only from a loaded empty result (UI rule 8). No eval.
- [ ] **P3.c Kept: a page is a calm home** — a tile draws a sparkline and a
      delta only when its call carried a series or a comparison, else a
      figure and a time; under the pins the page's river from `page_events`
      and posts naming it; tap a tile → the object in ~1 s. Never recomposed
      by a question. No eval.
- [ ] **P3.d the thing being built stays put** — consecutive turns sharing a
      subject render as ONE pinned object with versions beside a narrower
      finding, revised in place, version arrows back; every proposed write in
      one PROVISIONAL frame (Keep · Discard · Try again · Not what I meant)
      that turns solid only on the write's confirmation frame. The
      acceptance arc, drawn as the Ideal UI draws it. **No eval** — the frame
      and the version arrows are rendering over write proposals that already
      exist; the model's schema is unchanged.
- [ ] **P3.e a change is a diff** — an edit to a rule, page or standing
      question renders as before/after of its arguments over two versions,
      never prose alone; Keep as version 2 makes an ungated version;
      Backtest first queues one; the schedule still pins v1 and the
      divergence notice says so; Running gains "see the diff". No eval.
- [ ] **P3.f "usual" as a definition, then as a band** — `usual_weekday` in
      metrics.yaml (same weekday over the last N closed weeks: low, high,
      middle band, computed in the tool), THEN the band mark with today's
      marker. George may not draw "usual" before the definition exists.
      **No eval** — same reason as P2.i: no gate scenario asks for a usual
      band. Contract tests are the check; it rides P3.✓.
- [ ] **P3.✓ close: the Seikyo arc, timed** — end to end on the live build as
      the Ideal UI's build scenario draws it: morning finding → draft →
      revise in place → save → page → Monday question → backtest → promote →
      the v2 diff; every step timed; nothing described that is not shown.
      **One full run** of v2 beside it, as the other two closes do — this one
      closes the plan, so the trust rows are reported against Phase 1's
      baseline one last time. (Added 2026-09-13: this card said nothing about
      a run while the plan's total counted one for it. The total was right and
      the card was silent.)

**Phase 4 — sources. The owner's, and they start now.** Four of the 26
cannot be built by any session because nothing is behind them; building a
shape with nothing behind it is forbidden. Each becomes a card the day its
source exists (`Log this: I have <the source> at <where>. Write the card
for it.`):

- **S.1 supplier per product** (feature 8, the purchasing arc) — a
  product → supplier list, even rough; `ops/propose_supplier_map.py` runs
  against it; the field lands in metrics.yaml.
- **S.2 arrivals and open orders** (8) — the frozen PO export unfrozen, or a
  dated weekly export; then cover accounts for lead time.
- ~~**S.3 AJI CMG's vending feed**~~ — **WITHDRAWN 2026-09-13, it was never
  blocked.** A session listed it as a source the owner had to supply, twice,
  and then checked: `tools/vending.py`, the `get_vending` tool, the
  `v_vending_order_lines_php` / `v_vending_orders_php` / `v_vending_goods_php`
  views and a whole `vending:` domain in `definitions/metrics.yaml` all exist
  and are read today. **George already covers two businesses, not one.**
  Feature 23 is designed-not-built (P2.g), not blocked. Two live constraints
  that ARE real: `vending.never_join_to_store_domain: true`, so the two
  domains are compared side by side and never joined; and vending profit is
  computable but **overstated on 72.7% of lines** where cost was never
  entered, which carries a mandatory flag. Retail profit stays unsupported
  (`store_profit_do_not_reintroduce: true`) and that is unchanged.
- **S.4 a document source** (24) — one mailbox or folder invoices arrive in
  that a service can read; then `read_document` returns `{rows, meta}`.
- **S.5 a supplier channel** (25) — how an order goes to Seikyo today; then
  "Send" is the one action that leaves his hands, behind the provisional
  frame, level five.
- **S.6 people and permissions** (8) — who else uses George and what each
  may see.

**Calendar, honestly.** One card a day, Fridays for the sweep, one session in
three a dogfood fix: **28 open cards at four a week is seven weeks of cards,
so nine to eleven weeks** to the Phase 3 gate. Phase 1 is ten cards, Phase 2
eleven, Phase 3 seven. (P1.m was a card until 2026-09-13 and is now the tail
of P1.e: the letter is retired, not reused.) The sources
decide whether 8, 23, 24 and 25 land inside that or after. The readable copy
of this plan, with every card's prompt, is **George, The Build Plan** in §6.

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

**The design is one page: George, Ideal UI** —
https://claude.ai/code/artifact/7d69541a-ab54-4cfc-b622-77be5c7679c4.
A working mockup with all 26 functions in it, and a "26" button on its rail
that maps each function to where it lives and whether it is built, designed
there, or waiting on a source only the owner can supply. **When a card
touches the surface, this is the screen to build toward.** It supersedes
the four earlier renders (Whole, Borrowed, Borrowed II, Assembled), which
stay only as the reasoning behind it; the borrowings and what was declined
are in `ops/DECISIONS.md` under 2026-09-13.

**The plan to build it: George, The Build Plan** —
https://claude.ai/code/artifact/41329abe-5de8-4168-af7a-9817798877d5.
The same cards as section 3, with every session's prompt, the phase gates,
the six sources only the owner can supply, and the calendar. Section 3 is
the source of truth; the page is the readable copy. The owner's two prompts
are "Log this: …" and "Read ops/NOW.md. Do the next card." — nothing else is
needed to run it.

**A phase ends when the owner says it feels right — and it may never end with a
rebuild.** If it does not feel right, the answer is the next fix to the same
surface, measured against the same numbers.
