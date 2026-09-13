# Decisions

Append-only. One entry per session, ten lines or fewer. The reasoning that the
code cannot say, and nothing else. CLAUDE.md holds the standing rules; this
holds why they got there. The standard itself is `ops/STANDARD.md`.

New entries go here, above the archive at the foot of the file — that archive is
the reasoning CLAUDE.md carried until 2026-09-12 and it stays last.

---

## 2026-09-13 — P1.b: the board was never empty, only shapeless

The card said the board fills when George composes. It does not: `editsFor`
has always drawn a quiet table per read while a turn is in flight, so time to
first visible object is **7.0 s median before and after** — unmoved. What moved
is the first COMPOSED object, 16.8 s → 8.2 s. **The 2 s target is missed 3.5x
and this card cannot reach it**: both numbers are bounded below by the first
model round trip plus the read, and the fastest object in the twelve is 4.3 s.
Only P1.d, which skips the model, can go under 2 s.

The default goes through `compose.validate`, not beside it, so it cannot say
anything George could not; it is kept out of `_drawn_on_the_board`, because a
caveat is discharged by a person choosing to draw the read that raised it.
Superseded BY SEQ, not by key — he never sees the default's keys.

Two runs of the twelve, byte-identical model input: 12/12 then 10/12 with a
forced notice and an ungrounded figure. Both logged, neither explained away.
The trust rows are not as stable as four runs had suggested.

---

## 2026-09-12 — The cut (Phase 0, session 2)

Deleted 100 files, 16,660 lines, from `feature/workspace`. What went: the desk
(`components/desk`, `DeskPage`), the retired `/w2` renderer (`workspace/`), the
shell chrome the room replaced (`GeorgeShell`, `shellNav`, `shellLayout`), the
mark and greeting nothing rendered, the river/auto-follow hooks the room does
not use, and 29 legacy Operations files (older chart, preset and replenishment
components, `services/api.ts`, `types/index.ts`) that no page imported. Two
backend orphans went too: `schema_builder.py` (the old chatbot's, nothing
imported it) and `chart_image.py` (Telegram PNGs, nothing imported it).

Nothing was deleted on judgement. An import graph from `main.tsx` (with the
`@/` alias) decided it: 340 code files, 194 production-reachable. After the cut,
245 files and the same 194 — the proof that only dead code went. Two files the
graph could not see were caught by the suites, because they name source by
string path, not by import (`workUnit.test.ts`, `accentUse.test.ts`).

`workspace/composition.ts` was the one live thing in a dead folder; only
`restoreFromPosts` survives, now `room/restore.ts`, because `room/data.ts`
already duplicated the rest.

**Coverage genuinely lost, not renamed.** 18 backend contract tests and ~200
frontend tests asserted properties of deleted files. Two were repointed where
the same claim holds (`RiverEntry`, and the room for smooth-scrolling). The
rest were dropped rather than aimed at the room, because asserting them of the
room is a new claim about untested code. Notably: the desk's identity-key check
does not transfer — the room identifies a subject by the column its name came
from, never by `store_id`. If the room deserves these guarantees they are a
task, not a rename.

The accent allowlist fell 7 → 4 without a decision being reversed: three
entries named chromes that no longer exist.

## 2026-09-12 — The plan reviewed against its own evidence

Reviewed the three-phase plan before starting it, by checking each card's
premise in the code and in `verification/voice-after.json` rather than
asserting it. Three of my own claims were wrong.

**Parallelism is not a lever.** Reads already dispatch through
`asyncio.gather` and the model already batches them (four `get_sales` in one
iteration). That card is deleted, not deferred.

**The bottleneck is labelling, not reading.** Median 5.5 iterations per turn,
max 8. 28 of 55 tool calls across the twelve are `compose`/`record_findings`,
and `compose` is REFUSED in 8 of the 12 questions — each refusal a whole model
round trip. "What was the foot traffic at Rockwell?" spent 8 iterations and 4
compose calls to answer "I can't see foot traffic". So the first Phase 1 card
is now: coerce the structural refusals (a second `lead`, a stray field on a
`change`, a no-op `change`) instead of refusing them, and keep refusals only
where drawing would put an unbacked figure on screen. The trust boundary is
"the model never authors a figure", never "exactly one lead".

**A latency target must not cost a reading.** "50% of follow-ups with no model
call" would have answered "why?" with figures and no interpretation, which is
the product. Split: navigation fragments take no model call; analytical
fragments draw instantly and the reading follows.

Two things the plan had no answer for, now written into `ops/NOW.md`: a
standing trust gate on every Phase 1 card, because the phase dismantles the
machinery that enforces the guarantees; and the fact that the central
assumption — that latency is what makes George feel like a chatbot — comes
from code and evals, not from the owner using the room, which has never been
dogfooded. The deploy after P0.1 is the test, and the plan re-orders around
whatever complaint actually arrives.

## 2026-09-12 — P0.1, main fast-forwarded (Phase 0, session 3)

`main` is `5354ef6`: a clean fast-forward of 166 commits, 161 ahead of
`origin/main` and 0 behind, so PR #1 was already in the branch and a push stays
a fast-forward. Unpushed by instruction.

The four deterministic suites are exact: **1,326** pure, **774** vitest, `tsc -b`
and `npm run build` clean. Vitest first reported 759 because `node_modules`
predated the branch's `@vercel/functions`; `npm ci` is part of taking the merge.

The twelve ran **11 passed, 1 failed** — `why` tripped the strict
`leads_with_reading` gate by opening "…transactions rose 34% while the average
basket fell 16%". A fresh run of a real-model eval, not a regression: the trust
properties held on all twelve (no forced notice, no ungrounded numeral), and the
figures moved both ways against the recorded baseline — iterations 6.0/10 median/max
(was 5.5/8), label share 52% (was 51%), compose rejected in 6 of 12 (was 8).
**`verification/` is gitignored**, so `voice-after.json` is gone and NOW.md's
table is the only durable baseline.
## 2026-09-12 — P0.2, the rulebook (Phase 0, session 4)

CLAUDE.md is **1,493 words**, from 22,218. Every rule survives; nothing was
repealed. The owner's 26 features went verbatim to `ops/STANDARD.md` because
they are the standard, not a reading of one, and the ~20,000 words of readings,
amendments and milestone records went verbatim to the archive at the foot of
this file. AGENTS.md was a stale copy that had drifted — six vocabulary words to
CLAUDE.md's seven, eight architecture rules to nine — so it is now a four-line
pointer rather than a second source.

**91 prompt-wording assertions went, across 15 files** — 97 removed, 6 written
back — **taking 21 test functions with them** (27 removed, 6 added: four renames
and the two store-scope replacements below). The pure suite is 1,326 -> 1,306;
the extra def is in `golden.py`, which pytest does not collect as a module. **The
card estimated ~33 and the file count was exactly right, so the shortfall is in
the other direction: nearly three times as many assertions were pinning wording
as the plan thought.** The rule they broke is that a phrase in a prompt is not a
guarantee: P1 rewrites that prompt, and a test failing on wording would have read
as a regression. What stayed is everything that holds a VALUE or a SHAPE — the budget (words, rules,
prohibitions), byte-stability for the cache, that a generated section is
included at all, the SENTINEL rebuild proving a section is built from the yaml,
and every tool-schema assertion, because the voice work deliberately moved
mechanics onto tool descriptions.

**The store-scope pair was replaced, not deleted.** It asserted "N active retail
candy stores" verbatim, which pinned wording as a side effect of pinning a
count. The guarantee — the estate is read from `metrics.yaml`, never typed — is
now held by mutating the definitions and rebuilding the sentence, so a hardcoded
count still cannot survive. One more went that the card did not name:
`test_claude_md_records_the_reset` asserted CLAUDE.md's own prose, including a
`### The desk` section describing a surface P0.0 deleted.


## 2026-09-13 — P0.5, reading the gaps (Phase 0, session 5)

The card assumed a week of real use. **There has not been one**: of 193 turns
ever logged, 145 are one scripted `coverage` user on 09-02 and 44 are a person;
the last 7 days hold 4. The sweep header names who asked, because a window is
not use because it has rows in it. The loop writes **20 kinds, not 13** — seven
built at the call site, so a test parses the call sites and kind 21 cannot hide.
One most-recent sample lies: `api_error`'s latest row was a malformed message
history and 54 of 58 were a billing outage, so the commonest detail is shown
beside it, keyed on 200 characters because a provider 400 spends its first
hundred on preamble. **A gap is not a defect until checked against today's
code** — the loudest, 89 × `top_n must be an integer`, was fixed in `0ba0b4e`
the same day it stopped. Two filed, both still live.

## 2026-09-13 — P0.3, the clock (Phase 0, session 6)

**Turn time looked derivable and is not.** `logged_at - asked_at` is the
database's insert clock minus the web process's start clock: across 193 turns
the api_error ones, which die in under a second, derive to a median of **minus
1.68 s**, so the two machines are at least 1.82 s apart. `duration_ms`,
`iteration_ms` and `corrective_turns` (alembic `w7x8y9z0a1b2`) come off one
monotonic clock inside the turn instead. `ops/turn_clock.py` prints both and
labels which is which; it works against an unmigrated database on purpose,
because a report you cannot run until the deploy is fixed is a report nobody
runs. **Corrective turns had never been logged at all** — six gates, six local
variables, and P1.c is measured on them. The first measured median, from the
twelve: **27.4 s against a target of 10**, with 5.5 round trips at 4.8 s each,
which is where the card's own reading says the time is. **The card leaves a
migration on `main` and P0.4 undone, so the next deploy crashloops** — said
here and at the top of NOW.md rather than discovered on Railway.

## 2026-09-13 — P0.4, the deploy migrates itself (Phase 0, session 7)

**A setting promised something and nothing kept the promise.**
`AUTO_MIGRATE_ON_START=false` was documented as "staging migrates as an
explicit release step"; Railway had it off and the release step did not exist,
so the else branch printed a sentence and launched a process that could not
serve — on 09-12, and again waiting for P0.3's migration. The promise is gone:
**the launcher brings the database to head before launching, whatever the
setting says**, and the setting is now a CHECKED claim — at head it says the
claim held, behind it migrates and names the missing release step. Not booting
is never preferred to migrating. Ahead or branched it migrates nothing and says
which: `upgrade head` cannot fix a rollback, and a launcher that tried would
spread one process's outage across the estate. **`/health` now names the build
and re-reads the schema** — the old check ran once at boot, so drift was
invisible until a restart, which is the card's second half. Nothing about the
build is guessed: no source means `"source": "unknown"`, because a plausible
wrong sha is a readout somebody trusts while debugging code that is not
running. `start.sh` was a fourth launch path that skipped migration entirely; a
test now holds all four. **One test was deleted for asserting the defect** —
`test_launcher_does_not_migrate_when_disabled` pinned the behaviour that took
production down.

**And then it took production down itself.** The first deploy carrying P0.4
went to 502 and stayed there ~50 minutes: the migration did not apply, the
container crashlooped, and from outside there was nothing to read. It came up
on a later Railway retry and is healthy on `8b0325a`. **The root cause is not
known** — the deploy log for that build has not been read, and no session
should claim to know without it.

Two lessons, one recorded in code and one in how work is reported.

**`check=True` fails the deploy where the deploy log is** was wrong. A
crashloop hides the deploy log from everyone not already watching Railway, and
refusing to start bought nothing: the migration had not run either. A failed
migration is now loud and NOT fatal (`69b51bd`) — the app starts, the schema
check refuses, and /health answers 503 naming both revisions. Same refusal,
readable from outside. `pg_advisory_lock` became `pg_try_advisory_lock` in a
bounded loop for the same reason: forever inside a launcher looks like a boot
timeout, not a lock.

**"Verified" was claimed for something only reasoned about.** The close-out
said `main` is deployable again, on the strength of a dry run with `_upgrade()`
STUBBED and a migration whose SQL was generated offline. The launcher had never
once executed a migration against a real database. The rule this leaves:
**naming what was exercised is not the same as exercising it — a stubbed dry
run is evidence about a decision, never about the thing it decided to do.**

## 2026-09-13 — the first dogfood fix: denial is not a leak

`transaction_synonyms` fired on the answer it most wanted. Asked for foot
traffic George refused, named what the data is, and said what the substitute
would hide — and was recorded as leaking "people" and "traffic" for saying so.
**A check that fires on the refusal it exists to encourage trains the refusal
out.**

The fix turned on something narrower than it first looked. **Not distance:**
"Rockwell didn't grow, but customers were up" puts the negator exactly as close
to the word as "nobody counts people" does, and the first is a leak while the
second is care. The first attempt used a three-word window and got that case
wrong; the test caught it. What separates them is the comma and the "but", so
the lookback is the **clause**, not the sentence (too wide — it would clear
"footfall through the till, not bigger purchases") and not a word count (too
blunt). A term is cleared only when EVERY use is denied; one bare use is still
a leak, which is what keeps the real hit in the same run reported.

Held by 8 cases carrying both real sentences verbatim, and checked against all
twelve recorded answers rather than against invented ones.

## 2026-09-13 — the second dogfood fix: an exclusion refuses in its own words

`resolve_store` had ONE refusal for TWO mistakes — a typo and a deliberate
exclusion — so ten scoped tools told the owner that AJI BARN, the warehouse,
was not a store. He hit it three times in the middle of the one workflow he was
actually building, and George could only guess at why.

A name that resolves anywhere in the estate is now out of scope, named by
group and by the reason the calling tool declares; a name that resolves nowhere
is still unknown. **Three tools exclude the warehouse for three different
reasons** — dispatch counters, no transactions, ships-from-not-to — so each
passes its own out of metrics.yaml. One shared sentence would have been wrong
for two of them. `dead_stock.barn_excluded_reason` had been sitting in the yaml
unread since the tool was written; the other two were written here.

Scope note: the entry named dead_stock. Fixing only that would have left George
explaining the warehouse for one reading and denying it exists for the next two,
so sales and replenishment went with it — one call site each.

## 2026-09-13 — the third dogfood fix, and Phase 0 closes

A failed write recorded "ProgrammingError" and dropped the exception, so the
defect feed said THAT a write broke and nothing about HOW. Nothing was ever
lost: 23 routes raise `from exc` and `__cause__` had been unread since the
first commit. The cause now travels beside the sanitised sentence and is
stripped before anything the model is sent is built — the sentence stays the
only thing the model sees (UI rule 4), the row gets both, credentials redacted.

**The lesson is about the test, not the fix.** `_truncate` returns the SAME
dict when rows fit, and a refusal has no rows, so the payload the model is sent
IS the one the diagnostic travels on — only the strip separates them. The first
leak test asserted on the SSE frames and **passed against a loop with the strip
deliberately removed**. A mutation check found that; the rule it leaves is
**delete the fix and watch the test fail before believing it**, which is the
same lesson P0.4 taught about stubbed dry runs, arriving from the other
direction.

Open is empty for the first time since the dogfood log was started, and
Phase 0 is closed. Phase 1 opens at P1.a against a measured median of 27.4 s.


---

# Archive — the readings CLAUDE.md carried until 2026-09-12

*P0.2 cut CLAUDE.md from 22,218 words to a rulebook that fits on one screen. The
rules themselves stayed there. Everything below is what came with them: the
readings, the amendments, the decisions recorded "because the code cannot say
why", and the milestone records. It is moved verbatim, not rewritten, and nothing
in it is repealed by the move — a rule in CLAUDE.md and its reasoning here are the
same rule. New session entries go ABOVE this line; this archive is the tail of the
file and stays there.*

*The one section that did NOT come here is the owner's own 26 features, which are
the standard rather than a reading of one: they are `ops/STANDARD.md`, verbatim.*

## What we're building

**George — an AI operator for our businesses.**

- **Understand.** George knows the business, investigates on his own, decides
  what matters, forms opinions from trusted facts, and admits when he doesn't
  know.
- **Build.** You and George create or change business systems together.
- **Run.** George operates those systems, monitors the business, and brings you
  in when you are needed.

The long-term flow is **Understand → Build → Run**, and every piece of work
should be placeable in it.

**The core feeling:** *"My business is here. George understands it. We operate
it together."*

Not "I am asking an AI questions." Not "I am reading AI-generated reports." Not
"I am using a dashboard with an AI attached."

**Being trustworthy about numbers is the FLOOR, not the job.** That sentence
replaces "trustworthy about numbers, not clever about SQL", which stood at the
top of this file from 2026-09-02 to 2026-09-09 and quietly set the ceiling for
everything built underneath it. The trust rules below are not weakened by this
— they are the reason any of the rest is worth having — but they were never the
point, and reading them as the point is what produced an analytics chatbot with
excellent provenance.

### What that means for the experience

- **The business is already there, and George lives inside it.** Opening George
  is arriving somewhere, not starting a session in front of a blank input. What
  is on screen does not exist because you asked for it.
- **Talk, click, point, or combine them.** Use the cheapest channel for the
  intent. Pointing at a shop and saying "why?" is one instruction, and most
  steering should not need a full sentence.
- **The workspace transforms; it does not stack answers.** A follow-up changes
  the thing on screen. It never appends another answer below the last one, and
  the conversation is not the visual history of the work.
- **George holds opinions and states them unequally.** What matters, what
  doesn't, what is unusual, what he cannot explain, what he cannot see. "There
  is nothing here, leave it alone" is a real answer and a good one. A screen
  where every finding has the same weight is a failure.

### Visual direction

Calm business OS + expressive widgets and information objects + living
intelligence. Warm cream ground, navy structure and typography, orange for
George and active intelligence, brighter semantic colour only where it carries
meaning.

**Not a normal dashboard with gradients applied to it.** Different kinds of
information are allowed different visual forms — a warehouse should not look
like a shop, and a thing with no figure should not look like a thing whose
figure is zero. A representation earns its place by communicating that
situation better than the alternatives, and conventional charts, tables and
numbers are correct whenever they do. Expressive treatment may never change
factual meaning, and every expressive channel must be driven by a value the
data actually carries.

### Where George actually is against this, 2026-09-09

Recorded so that no session builds around a constraint the mission has
superseded, and so nobody reports progress that has not happened.

- **Understand — partly built.** Trusted reads with receipts, definitions in one
  file, an investigation ladder, comparisons, findings, pins and pages. Since
  2026-09-09 also stock over time, the replenishment plan, and a purchase draft
  per supplier. What is missing is memory: George holds no view of the business
  between sessions, so every conversation starts cold and he can never say
  "this is the third week."
- **Build — barely started.** He can create and edit pages, and save workflows
  out of calls that already ran. He cannot add a metric, a tool, a data source
  or any capability of his own. Nothing in this repo lets George grow.
- **Run — does not exist.** There is no background process of any kind. George
  does not exist when nobody is looking at him, so he can never come to you.
  `Watch` is named in the vocabulary below and has never been built.

### The plan — how the 26 get built

*Rewritten 2026-09-10, keyed by number to the features at the top of this file.
It supersedes the six-phase plan of 2026-09-09, which was a reading of that
section and began to be used in place of it.*

**Every stage is ONE IDEA, delivers named features, and is usable the day it
lands. No stage may be built as infrastructure for the next. A stage ends when
the person using George says it feels right — never when the architecture is
finished.**

#### What is already true, and is not to be rebuilt

- **Feature 1, in its hardest part.** George composes the screen — `compose`
  (agent/compose.py) — validated so he can never emit a figure, a colour, a
  size or a subject that is not a row of a read that ran. Every previous
  attempt at the interface lacked this, and it is what makes the rest safe.
- **Feature 5.** Thirteen read tools: sales, stock, stock over time,
  replenishment, purchase plans, purchasing, movement, products, vending, dead
  stock, costs, the brief.
- **Feature 8.** `metrics.yaml` as the single source of business meaning, with
  notices, refusals and receipts on every figure.
- **Features 9 and 10, in prose.** He decomposes into drivers unasked and says
  what he would look at first.
- **Features 14, 17, 18 and 19 exist as CAPABILITIES WITH NO SURFACE.**
  `pin_answer`, `create_page`, `edit_page`, `save_workflow`, `run_workflow`,
  the approvals queue and the backtest-and-promote gate are all built. The
  workspace at `/w2` renders none of them and cannot navigate to any of them.
  Much of B and C is therefore connection, not construction.

#### A · The workspace is a place you work inside — 1, 2, 3, 4, 6, 7, 13

The screen is currently a function of the last question: it renders the newest
answer and folds everything before it into one line. That single fact is why 2,
3, 6, 7 and 13 are all partial.

1. **The board persists.** `compose` stops describing a screen and starts
   editing a board — put, change, quiet, drop — keyed by George's own object
   key. The board survives the turn, the thread and the reload. *(2)*
2. **Objects answer to touch immediately.** A closed set of client-side
   manipulations that cannot invent a figure: focus, expand, sort by a column
   the read returned, filter to rows already on the board, close, move.
   Anything needing a new fact is still a read. Today three things respond to
   touch and two of them are toggles. *(3, 7)*
3. **The vocabulary he actually reaches for.** Five of ten widgets have never
   been drawn once; `timeline`, `control` and `recommendation` from feature 1's
   own list do not exist. Add them, and make the choice of FORM part of what he
   is asked to judge. *(1, 4)*
4. **Work you can see.** Evidence lands on the board as each read returns,
   instead of one grey line for forty-five seconds. *(13)*
5. **Fragments resolve against the board, not the thread.** "Why?" "These two."
   "Products." "No, exclude Air." *(6)*

*Feels right when:* you are looking at Rockwell, you say "Products" and it
becomes products; "compare with OPUS" brings OPUS into the same workspace;
"why" reveals the evidence — and the Seikyo draft you opened an hour ago is
still where you left it.

*Stop and rethink if:* after 1 and 2 it still feels like a chatbot. Then the
problem is not layout, and reskinning a fifth time is the wrong move.

#### B · Nothing starts from zero — 11, 14, 21, 10, 22 in part

1. **George records what he believes.** The table, validator, store and schema
   are built and correct as of 2026-09-10; he still does not reach for the
   tool, because the prompt says "a handful a week, not one an answer" and he
   reads that as never. `beliefs held: 0` is the number to move. *(11)*
2. **The board persists across sessions**, so returning to a subject returns to
   the work. *(2, 11)*
3. **"Keep this" makes an object permanent.** Pages become boards of live
   objects rather than a list of tiles — the page capability already exists and
   is simply not connected. *(14, 22)*
4. **The cold open is what he already thinks:** what changed, what is
   unresolved, what he is waiting on. Not a dashboard, and not empty. *(21)*

*Feels right when:* you stop asking questions to find out what is happening,
and something you made last week is still there and still true.

#### C · You build things with him — 15, 16, 22

1. **Decide the three questions below first.** They are decisions, not code,
   and C cannot start honestly without them.
2. **Propose → backtest → approve → permanent.** George proposes a definition,
   metric, system or interface; anything carrying a figure is backtested; a
   person approves; it becomes a real part of the business. This is the
   existing promotion gate generalised beyond workflows.
3. **Change it by describing the change.** "Add supplier lead time." "Managers
   can request this but only I can approve it." "Show warehouse stock here."

*Feels right when:* you described a purchasing system in words and it exists,
and changing it does not mean opening an editor.

#### D · It runs without you — 12, 17, 18, 19, 20

1. **Watch** — a condition George checks on a schedule, which posts only when
   the answer changes. Named in the vocabulary since 2026-09-05 and never
   built. Silence is its normal state. *(12, 17)*
2. **He operates what was built:** prepares the weekly purchase orders, checks
   conditions, follows up, handles routine work, escalates the exceptions.
   *(18)*
3. **Inbox is what genuinely needs you**, and deciding is one action — approve,
   reject, change it, or give a standing instruction. *(19, 20)*

*Feels right when:* he tells you something you did not know to ask, and handles
something without you.

#### E · It reaches your real world — 23, 24, 25, 26

Cross-business, documents and unstructured information, actions in the tools
the businesses actually use, and voice. **E is a set, not a sequence** — each
needs a source or an integration that does not exist in this repo yet, and each
is separate groundwork that can start whenever its source arrives.

#### Three decisions that block C and D

Recorded 2026-09-09, still open, and each needs a deliberate answer rather than
silent erosion:

- **Architecture rule 5 (shallow loop)** forbids planning and decomposition.
  The 2026-09-08 reading bent it once by putting the investigation ladder in
  the prompt; that trick does not extend to Build.
- **Architecture rule 4 (read-only role)** has been extended five times by
  injecting a narrow writer per capability. Build and Run need more writers
  than that pattern comfortably carries. Review the pattern before the sixth.
- **Architecture rule 7 (nothing unattended until backtested and promoted)** is
  the right shape for Run and is the one piece of the future already built. It
  is also how George could safely extend himself. Today it covers workflows
  only.

#### Two things no code fixes

- **Supplier traceability.** Nothing records who supplies what; the map is
  inferred from purchase-order history and approved by the owner. In the live
  Seikyo run, 450 of the 787 products that sold could not be traced to any
  supplier. That bounds feature 18 for purchasing until the source improves.
- **There is no document source at all.** Feature 24 has nothing to read yet.

### The estate

- **candy stores** in the Philippines
- **AJI BARN** — warehouse
- **AJI CMG** — vending machines

**The store list lives in `definitions/metrics.yaml` and nowhere else.** Do not
write a store count into this file, into a prompt, or into a tool. Read
`stores.active_retail`, `stores.pending_retail`, `stores.warehouse` and
`stores.closed`. `agent/loop.py` builds George's opening sentence from them at
import, so opening a store is a change to the yaml and nothing else.

*Reconciled 2026-09-03:* this file said 9 candy stores, the system prompt said 7,
and metrics.yaml said 7 active retail plus 2 storefronts with zero transactions
to date. All three were describing the same estate: **7 trading + 2 not yet
trading = 9.** Neither of the other two numbers was wrong, and neither said what
it was counting.

## Architecture rules (do not deviate)

These are hard constraints. If a task seems to require breaking one, stop and ask
rather than working around it.

1. **Tools NEVER write freehand SQL against raw tables.**
   No model-generated SQL, no string-built queries against `new_transactions`,
   `new_transaction_items`, `products`, etc. Tools call vetted, parameterized
   queries only.

2. **Every tool returns `{rows, meta}`.**
   `meta` must always carry:
   - `source_table` — what the numbers actually came from
   - `filters_applied` — every filter in effect, including implicit ones
     (e.g. `is_cancelled = false`, store scope, date range)
   - `snapshot_timestamp` — when the data was read

   No tool returns a bare list. No tool returns a pre-formatted sentence in
   place of rows.

3. **All business definitions live in `/definitions/metrics.yaml`.**
   Tools read definitions from that file at runtime. Never hardcode a
   definition — a revenue formula, a "low stock" threshold, a store grouping,
   a date-window convention — inside a tool. If a definition is missing, add it
   to `metrics.yaml` and read it; do not inline it.

4. **George uses a read-only Postgres role.**
   No writes, no DDL, no temp tables. If something appears to need a write,
   it belongs outside George.

   *Reading of this rule, agreed 2026-09-03:* George can pin his own answer when
   asked in conversation, and a pin is a write — but it is a write that happens
   **outside** George, exactly as this rule requires. `george_ro` gains nothing;
   `george_log` keeps INSERT-without-SELECT on `george.*` and nothing else. The
   agent loop opens no connection for the write and holds no credential for it:
   the web process injects a writer bound to the authenticated user, and it
   calls the same service function `POST /pins` calls, on the application role.
   No writer injected means the write tool is not in the model's schema at all.
   *Extended 2026-09-03, saved workflows:* the second write surface followed
   that pattern exactly — a second writer, not a second role. `save_workflow`
   holds no credential; the web process injects a writer bound to the
   authenticated user AND their role, and it calls the same service function
   `POST /george/workflows` calls. Running a saved workflow is a READ, but it is
   injected the same way, because the workflows live in a schema `george_ro`
   cannot see. Capability is now per TOOL, not per session: a caller with a pin
   writer and no workflow writer is offered `pin_answer` and not `save_workflow`.
   A **scheduled** run holds no credential either — it makes no model call at
   all, so there is no tool schema for a write tool to be in. See
   [agent/write_tools.py](agent/write_tools.py) and
   [backend/app/services/workflow_scheduler.py](backend/app/services/workflow_scheduler.py).
   *Extended 2026-09-07, page reads:* the fourth capability is a READ, injected
   the same way and for the same reason — a person's pins live in the schema
   `george_ro` cannot see — and it keeps one more property on purpose. The
   reader in [page_reader.py](backend/app/services/page_reader.py) is closed
   over the authenticated user **and the exact page they asked from**
   (`page_scope` on the request), so the tool it gates, `view_page`, has no
   argument for either: "read Alice's Purchasing page" has nowhere to put the
   name. Definitions are read on the application role exactly as
   `GET /george/pins` reads them; figures come back through
   `pin_runner.run_pin` as `george_ro`, exactly as a tile's do. No page scope
   in the request means no reader and no tool. Nothing is written — not even
   the pins' own run bookkeeping, which stays the tile's.

5. **Keep the agent loop shallow.**
   No planner, no decomposition step, no sub-agents, no multi-stage
   "think then act" scaffolding. Model → tool call → answer. Depth goes into
   the tools, not the loop.

   *Reading of this rule, agreed 2026-09-03:* `run_workflow` is not a planner.
   The steps were fixed by a person when they saved them, no model is consulted
   between them, and nothing decides what to do next — it is one tool call that
   replays several vetted queries, which is what a pinned tile already does. It
   lives in `agent/composite_tools.py`, in its own registry, so it can be
   offered to the model while remaining impossible to store inside a pin or
   inside another workflow's steps.

   *Extended 2026-09-07:* `view_page` is the second composite and the same
   reading applies. It replays the pins a person already saved, decides
   nothing between them, and lives in the same registry so a pin can never
   contain a read of the page it sits on. It is named to sort after every
   other tool because tools render first in the cached prefix: a session
   without a page keeps a tools list that is an exact prefix of one with a
   page. Reading a page adds nothing to the executed set — a pin is a call the
   user watched George run, and looking at a tile is not that.

6. **A workflow composes existing read tools. It does not join them.**
   Steps do not pass data to each other: no expressions, no conditionals, no
   loops, and no step consuming another step's rows. The moment two results are
   combined, the combination is a **definition** — and definitions live in
   `metrics.yaml` behind vetted SQL, not in a saved workflow. If a workflow
   wants a fifth step that joins the other four, the answer is a new tool.

   A workflow **parameter** is scope — which store, which window, how many rows.
   A business threshold is not a parameter.

   *Amended 2026-09-09, George Experience Reset — **declared bounded
   settings**.* A vetted definition MAY expose a setting a person adjusts.
   A declaration states five things or it is not a declaration: what the
   setting **means**, its **type**, its **bounds** or allowed values, its
   **default**, and **where it participates** in the deterministic
   calculation. The formula stays in `metrics.yaml`; the person binds a
   value inside the bounds; the value is versioned with the System that
   used it and recorded on every run's receipts. George may explain a
   setting and, when asked, bind a value within its bounds through the
   same service a control uses. He may NOT invent a setting the definition
   does not declare, escape its bounds, supply a formula, replace a
   calculation with reasoning, or change a value without saying so. A
   bound value is still not a parameter in this rule's sense: a parameter
   is scope, a setting is a declared part of a definition. The contract is
   `metrics.yaml settings`; nothing is declared under it yet, and the
   first declarations arrive with the purchasing definitions.

7. **Nothing runs unattended until it has been backtested and promoted.**
   A schedule pins a version id, never "whatever is current". An edit makes a
   new version, which starts ungated; the schedule keeps running the promoted
   one. Promotion is an administrator's act against a recorded backtest of a
   window that has closed, enforced in
   [workflow_writer.py](backend/app/services/workflow_writer.py) and again by a
   CHECK constraint. George may accept "every Monday at 6" in conversation — the
   schedule is created switched **off**.

   *Reading of this rule, agreed 2026-09-11, standing questions:* a scheduled
   ASK is unattended execution and it is deliberately **not** put behind this
   gate — because the gate cannot mean anything here. A workflow version is
   gated because it computes: its steps are fixed, so a backtest against a
   closed window proves what it WOULD have said and an administrator approves
   exactly that. A question has no steps to backtest; the answer is whatever
   the morning's data makes true. A promotion ceremony over that would approve
   nothing, and pretending otherwise is worse than having no gate.

   **What stands in its place is capability, which is real.** The scheduled
   turn is given the read tools, `compose`, `view_memory`, `view_automations`
   and `record_belief` — and nothing else. It cannot pin, build or edit a page,
   save a workflow, run one, read a page, or touch a standing question,
   including its own: a question that can move its own slot or switch itself on
   is a thing that gets away from you overnight. The withheld half is enforced
   by ABSENCE, not by refusal — a tool with no injected capability is not in
   the model's schema at all (rule 4) — and by a contract test that asserts the
   offered set is exactly those three injected names.

   **Remembering is deliberately on the given side.** A morning read that
   settles what George thinks and then forgets it is the failure
   `george.beliefs` exists to end, and mornings are when most of his views will
   form. A belief is append-only, carries no figure, and names the calls behind
   it, so the worst an unattended one can do is be wrong in a sentence that is
   dated, attributable, and superseded by the next read.

   **Two properties are kept from the workflow scheduler rather than reinvented**
   (`app/services/slots.py`, extracted before this feature was written so the
   existing tests proved the extraction): the slot is computed each tick rather
   than registered as a cron trigger, so a restart cannot silently drop 06:00;
   and it is CLAIMED in the database before the run, so a failure is recorded
   rather than quietly re-delivered an hour later wearing the 06:00 timestamp.
   `last_thread_id` moves only on success, because the room opens on it: a
   morning that broke must not blank the screen.


8. **Divergence is allowed. Silent divergence is not.**
   A manual run uses the newest version so that editing a rule and trying it
   does not need an approval first; a schedule fires the promoted one so that
   editing a rule does not change what goes out unattended. Both halves are
   deliberate, and together they mean the same workflow can show one number in
   chat and another on Monday.

   So every run whose version differs from one an enabled schedule pins carries
   a `version_divergence` notice naming **which version ran, which each schedule
   fires and when, and why the two differ** — and the reason is derived, not
   generic, because the two causes have different fixes: promote the newer
   version, or repoint the schedule at it (`PATCH .../schedules/{id}` with a
   `version`). The notice is stored on the run record as well as surfaced in the
   answer, so a figure quoted from chat can always be traced to the rule that
   produced it rather than to the one somebody assumed.

   Promoting a version does **not** repoint any schedule. Fusing the two would
   mean approving a version silently changed every schedule that mentions the
   workflow — which is the behaviour versions exist to prevent.

9. **Important business figures come from deterministic code and trusted
   definitions. The model selects, investigates, explains and interprets; it
   never computes one.**

   *Locked 2026-09-07, with the metric model.* The path is one-way:

       trusted definition (metrics.yaml)
         → vetted calculation (a tool's SQL)
         → comparison / baseline (the tool, over both windows)
         → structured result metadata ({rows, meta})
         → George's reasoning
         → the Metric / Comparison surface

   "ATP appears to be the main driver" is a reading of figures the tools
   returned, and it is George's to make. Dividing net sales by transactions
   in prose, or taking a percentage between two windows he queried
   separately, is a calculation — and a calculation in prose has no receipt.
   So `average_transaction_value` is a **metric** (`metrics.yaml`, `kind:
   derived`, with a `formula` naming its dependencies beside the vetted SQL,
   and a contract test proving the two agree), and `compare_to=
   'previous_period'` puts `baseline`, `change`, `change_pct`, `direction`
   and `baseline_status` on every row of `get_sales`, computed there.

   **What enforces this, stated exactly.** The definitions (only the yaml
   can define a formula; the model never submits one), the tools (the
   figures exist, so there is something to ask for), prompt rule 16 (held
   by a test), and the golden tests. Nothing checks numerals in prose
   against rows — `metrics.yaml` volunteering has said so since 2026-09-03,
   and it is still true. A model that ignores rule 16 is not caught
   mechanically. Do not describe this rule as enforced beyond that.

   **The metric model** (`metrics.yaml` `metric_model`): every metric in
   every domain declares `kind` (base or derived), `domain` and
   `display_name`. Execution stays domain-specific — retail, vending and
   purchasing keep their own sections, aliases and group vocabularies —
   while applicability is described the same way everywhere. Additive
   entries carry `introduced` and do not bump `version` (`version_policy`);
   a change to an existing metric's meaning does.

   **One comparison in V1.** `previous_period`: the equal-length window
   ending where the current one starts, or for a closed preset the period
   before it by the preset's own calendar. Both windows run as the SAME
   statement with the other window bound. A window still in progress is
   refused by name. Year-over-year, to-date, per-bucket lag and custom
   baselines are recorded as not supported, with reasons, so they arrive as
   decisions and not as synonyms.

   *Amended 2026-09-12, projection by definition.* Two of those decisions
   arrived, and each is a **window rule and nothing else**: it `inherits`
   `previous_period` — row fields, statuses, the change arithmetic, the
   ranking, the groupings it allows — and the tool merges the parent under
   the child once, so nothing below the lookup knows which mode it is
   reading. `to_date_same_elapsed` is the pace read: the period so far
   against the same elapsed portion of the period before, Monday 00:00 to
   now against last Monday 00:00 to the same weekday and hour, bound as
   Manila timestamps read in the same transaction, with the elapsed share
   on `meta.comparison.elapsed` so a reader knows how much of the week a
   figure covers. It REQUIRES a window in progress, which is the mirror of
   the rule above, and a day's period before is the same weekday last week
   by reference to what the brief measured, never yesterday.
   `same_weekday_last_week` is the brief's own comparison promoted to a read
   for any closed day or explicit window — the window shifted back by that
   same measured offset — without the brief's noise floor, because the floor
   belongs to the judgement and not to the figure. What stays declined is
   named: `full_period_extrapolation`, "on pace for X this week", divides
   the figure so far by the share elapsed and assumes the afternoon sells
   like the morning; the same-point comparison is a fact and the pace is a
   convention. The arithmetic is `tools/windows.py`, held by
   `tests/test_comparison_contract.py` on fixed clocks. Beside it,
   `get_purchase_plan` rows now carry `run_out_date` — today plus whole days
   of cover, computed in SQL from the Manila date read in the same
   transaction, with what is on order NOT counted because Open does not mean
   received — so "when does it run out" is a date the tool wrote, not a
   number the reader turned into one.

   **FFR is a data-availability limitation, not a gap in George.** Verified
   2026-09-07: the database holds no Fame or Air stores, no restaurant
   tables, no drink, side or rice roles, no slushie or siomai products.
   Nothing FFR-specific is defined, stubbed or exampled anywhere; the record
   is `metrics.yaml` `data_availability.ffr`, which lists what an
   authoritative FFR source must provide before attachment metrics or FFR
   ATP can be defined. That is a separate data-source milestone.

10. **An investigation is reasoning behaviour inside an ordinary
    conversation. It is not an object, a tool, a table or a page.**

    *Locked 2026-09-08, Investigation V1.* "Why is Rockwell down?" is
    answered by a bounded ladder — **verify, decompose, localize, explain,
    stop** — that George climbs in rounds, each round's results deciding the
    next, and that he does not climb whole for every question. The loop is
    unchanged in shape (rule 5): no planner, no investigation table, no
    workflow, no page type, no `investigate_sales` composite. The vocabulary
    lives in `metrics.yaml` `investigation` and the prompt's INVESTIGATING
    section is built from it at import, exactly as the scope sentence is.

    **The primary fact is verified before any cause is looked for, and a
    false premise stops the investigation.** "Why is Rockwell down?" when
    Rockwell is up 4.2% is answered by saying the premise does not hold for
    the measured period. Nobody goes looking for the causes of a decline
    that did not occur.

    **Drivers are declared, and rest on a definition, not an assertion.**
    `metrics.net_sales.drivers` names `transaction_count` and
    `average_transaction_value` because that is the ATP formula rearranged
    (`net_sales = transaction_count × average_transaction_value`), and
    `tests/test_investigation_contract.py` holds the list to exactly the
    derived ratio whose numerator is net_sales plus that ratio's
    denominator. Drivers are read in the same batch as the primary fact,
    with the SAME window, filters and comparison — a decomposition never
    compares net sales for one period against ATP for another.

    **The reading is qualitative and there is no numeric "similar"
    threshold.** George names the driver whose `change_pct` is larger in
    magnitude and says "both moved" when they are close. He may say "ATP
    fell substantially more than transactions, so basket value is the
    stronger measured driver." He may NOT say "82% of the decline came from
    ATP": splitting a change in a product of two factors has no unique
    answer, so a share is a convention nobody chose — a definition — and
    `attribution_math: not_supported` records it. A percentage-point
    threshold for "similar" was declined for the same reason and because
    applying one would be arithmetic in prose; if the behavioural evals
    show George cannot tell dominant from mixed movement, that is reported
    and a deterministic contribution primitive is designed then, not a
    number invented on a branch.

    **Localization is one grouped or ranked call per dimension, and
    localization is not cause.** `get_sales` now compares by any SUBJECT —
    store, product, category — where the metric's own `valid_group_by`
    allows it (product_revenue and units_sold by product; net_sales and ATP
    stay refused by product; a time bucket stays refused as the lag series
    the definitions record as not built). `rank_by` — `value`,
    `biggest_drop`, `biggest_gain` — ranks a compared result INSIDE the tool
    after both windows are matched per subject, by absolute change in the
    metric's unit and never by `change_pct`, which a tiny baseline makes
    enormous. Only rows with a numeric change are ranked; a vanished product
    (`no_current`) or a new one (`no_baseline`) is counted and named in
    `meta.comparison.not_ranked` and never outranks a measured change
    because a null sorted somewhere. George never ranks two lists himself.
    "The largest measured revenue declines were A and B" is a fact;
    "customers switched to cheaper products" is a cause, and may be said
    only when evidence at that level is in the conversation.

    **Stopping is named.** A false premise; one driver clearly dominating
    with nothing more asked; the next step unsupported by any tool or
    refused; mixed evidence; a read that would repeat one already made;
    reads that cannot establish cause. Then George says what the data
    establishes, what it does not, and the one thing that would need to be
    checked next — and that sentence is part of the answer, not a
    volunteered fact (`volunteering.not_counted`, prompt rule 14). "Basket
    value fell much more than transactions; these reads don't establish
    why" beats a cause he invented.

    **Two loop mechanics arrived with this, and they are not investigation
    features.** An exact duplicate read — same tool, same `call_key`, same
    turn — is served once: successful, empty and refused reads are all
    recorded, the duplicate is answered with the ORIGINAL outcome (its own
    `snapshot_timestamp`, or its refusal) plus `duplicate_of`, gets a seq
    and frames, is never pinnable, sends no rows to be charted twice, and
    spends none of the read budget, which bounds database work. The record
    lives as long as `run()`; a later user turn re-reads freely. And prose
    written in an iteration that then calls tools is NARRATION: the loop
    resets it with reason `interim_prose`, the client moves it into the
    activity disclosure, and the live answer is the stored answer — until
    this date they disagreed, because the stored post kept the last
    iteration's text and the screen kept all of it.

    **Page evidence is evidence.** A pin that already carries a comparison
    — metric, window, baseline, receipts, freshness — is a verified primary
    fact and is not re-read merely because an investigation is under way;
    fresh reads are for dimensions the page does not show. The partial and
    truncated page notices stay mandatory.

    **What enforces this, stated exactly.** The definitions and their
    contract tests; the tool, which refuses what the definitions refuse and
    ranks what the model may not; the prompt section, held by tests; the
    duplicate guard and the interim reset, held by loop contract tests; and
    the behavioural evals in `tests/evals/`, which run the real model
    against the real database on CLOSED windows, opt-in, and assert
    structure: the tools called and their arguments, one window per round,
    no fan-out over subjects, bounded calls and iterations, every notice
    conveyed without being forced, no attribution math, and — as an EVAL
    only — that every figure in the prose is a figure a tool returned. A
    rubric judge is optional and never gates. **Production still does not
    mechanically verify prose numerals against rows**; rule 9's statement
    of enforcement is unchanged, and this rule adds no claim beyond it.
    The answer-level receipts line is still the last successful read's
    meta (a known limit, noted in `agent/loop.py`); each result keeps its
    own receipts on the surface, and widening that was deliberately kept
    out of this milestone.

## Repo context George lives in

This repo is **Ultra Supabot v2**, an existing retail BI app (FastAPI +
SQLAlchemy 2.0 async + PostgreSQL/asyncpg backend, React 19 + TypeScript + Vite
frontend). Relevant paths:

- Backend entry: [backend/app/main.py](backend/app/main.py)
- Services: [backend/app/services/](backend/app/services/)
- API routes: [backend/app/api/v1/routes/](backend/app/api/v1/routes/)
- Existing business rules for the old chatbot:
  [backend/business_rules.yaml](backend/business_rules.yaml)

All datetime logic is **Asia/Manila** timezone-aware.

### George is not the existing chatbot

The repo already contains an NL→SQL chatbot
([backend/app/services/sql_generator.py](backend/app/services/sql_generator.py),
[query_executor.py](backend/app/services/query_executor.py),
[query_validator.py](backend/app/services/query_validator.py),
[backend/app/api/v1/routes/chatbot.py](backend/app/api/v1/routes/chatbot.py)).
That system generates freehand SQL from a schema prompt — the exact pattern
George's rules forbid. Do not extend it when building George, and do not reuse
its SQL-generation path. Reading it for schema knowledge is fine.

### Known gaps to resolve, not assume

- `/definitions/metrics.yaml` **does not exist yet.** It is the intended home
  for business definitions; create it when the first definition is needed.
  *Resolved:* it exists and is the single source. See the note at the top of
  this file about the store list.
- `business_rules.yaml` lists **6 stores** (Rockwell, Greenhills, Magnolia,
  North Edsa, Fairview, Opus) and has no AJI BARN or AJI CMG entities.
  *Resolved 2026-09-01 in metrics.yaml `stores`, which records why:* those six
  names no longer match any `stores.name` value, Greenhills had been dropped
  from the sales scope while kept in inventory, and Shang existed in the data
  and in no config file. `business_rules.yaml` belongs to the old chatbot and is
  not George's source for anything.

## Working style

- Ground every claim about the data in a tool result with real `meta`.
  Never state a number George didn't retrieve.
- When a question can't be answered by an existing tool, say so and propose the
  tool — don't reach around the rules to get an answer.

### Never print a secret's value

**Any shell probe that reads environment variables prints the variable NAME and
whether it is set — never the value, and never a prefix of it.** This is a hard
rule with no exception for "just checking", no exception for a value assumed to
be short or harmless, and no exception for a redaction applied after the fact.

    # correct
    for k in ANTHROPIC_API_KEY DATABASE_URL; do
      [ -n "${!k}" ] && echo "$k: set" || echo "$k: unset"
    done

    # WRONG — prints the value whenever the variable IS set
    echo "$k: ${v:+set}${v:-MISSING}"

The second line was written on 2026-09-04 to report set/unset and did exactly
that for the unset case; `${v:-MISSING}` expands to the VALUE when the variable
is set, so it printed the Anthropic API key and both George role passwords in
full. Shell defaulting syntax reads as a guard and is not one.

**Why this is a hard rule and not a preference:** a value printed into a
terminal is in the transcript, the scrollback and any log that captured them,
and it stays there after the check that produced it is forgotten. The blast
radius is not the command, it is everything the credential opens — and the
remedy is rotating production secrets, which is disruptive and falls to somebody
else. `backend/.env` holds a superuser `DATABASE_URL`, both George role
passwords, `BRIEF_TOKEN` and the model key.

Applies to every mechanism, not just `echo`: no `env`, no `printenv`, no
`set`, no `cat` of a `.env`, no interpolating a variable into a log line or an
error message, and no "redacted" print that slices the first N characters. If
you need to know a value is correct, assert a property of it — its length, or
that a connection using it succeeds — and print the assertion, not the value.

## UI/UX

### Vocabulary

Seven words, seven distinct meanings. Use them consistently in code, copy
and conversation; do not introduce synonyms.

- **Pin** — an answer becomes a live tile that re-runs.
- **Save** — logic becomes a versioned rule.
- **Page** — a collection of pins.
- **Post** — one utterance in the river, by George or by a person. Every George
  post carries its receipts and its notices; UI rules 3, 4 and 6 apply to all
  of them without exception.
- **Thread** — a post and its replies. A thread is not started, it **emerges**:
  the first reply to a post makes one. Nobody ever opens an empty one.
- **Watch** — a saved condition George checks, which posts when it fires.
- **System** — something built with George that persists: its executable
  logic is a workflow (versions, backtest, promotion, unchanged), and
  around it the settings it was bound with, its schedule, its runs, its
  outputs and the approvals it waits on. "Workflow" stays the name of
  the rule inside. Approved 2026-09-09; `metrics.yaml systems`.

A pin re-runs; a save is the rule it re-runs. "Bookmark", "widget", "card",
"favourite" and "snapshot" are not other names for these — if one of them seems
needed, the concept is probably wrong. A System is not a "job", an
"automation", a "playbook", a "recipe" or a "template".

*Added 2026-09-09, George Experience Reset.* Two things that are NOT
user-facing words, recorded so they are not promoted into ones by accident:

- **Desk** is the internal name of the one workspace model — the business
  laid out in front of a person, with George working on it. A person is
  never asked to learn it; the product is George. It appears in code
  (`components/desk/`, `desk` on the ask request) and in these notes.
- **Selection** is a channel, not an object. Whatever is selected or
  focused on the desk — a set of subject ids and labels the rows carried —
  travels on the next question as `desk.selection`, is named to George on
  the question beside the work sentence, and is kept on the question
  post's payload. It is never a label the model inferred and never a
  figure.
- **Document** is reserved for a later phase (an order draft, a report)
  and is deliberately not built or placeholdered here.

*Amended 2026-09-08, Page Workshop V1:* **Page is a persistent personal
object in `george.pages`.** This supersedes Persistence V1's derived name
grouping. Empty Pages, purpose, rename-safe identity and explicit analysis
ordering now require a parent row. No sentinel Pins or name cascades.

`page_id` is identity; title is presentation. `/pages/:pageId` and
`/pages/ungrouped` are canonical. Ungrouped is virtual (`page_id = NULL`),
never a Page row. A Page's Pins use dense integer positions, normalized on
every membership/order write in the same transaction. New analyses append.

George's injected `create_page` and `edit_page` capabilities call the same
owner-scoped services as manual controls. They accept stable Page IDs and
reproducible calls that already executed, never prose or figures. Owned Page
references in request context allow title discovery without replaying content;
the write service does not resolve destination titles. Writes commit once
before `page_changed` confirms them. `george.page_events` is the structural
audit; no structural-edit River post kind is introduced.

Purpose is visible, editable, single-line descriptive metadata (200 characters),
explicitly user-authored when read by George. It never overrides system rules,
metrics definitions, tool constraints or ownership. A thread stays bound to its
Page UUID after rename. Legacy title-only posts recover scope only by an exact
current owner-scoped match; historical payloads are never rewritten.

**Remove from Page keeps the Pin in Ungrouped. Delete deletes the Pin.** Manual
Delete Page moves all Pins to Ungrouped; George has no Page deletion operation.
V1 provides ordered analyses. Sections are a V1.1 candidate and must preserve
`page_id` and position semantics. See [Page Workshop V1](ops/PAGE_WORKSHOP_V1.md)
for the migration, bounds, validation and verification record.

*Two more facts from the same milestone, recorded because the code cannot say
why.* **A pinned tile draws every result its run brought back**, through
`resultShape` like an answer does, and names what did not reproduce above
them; until this date it drew the first result only, so a pin of three figures
showed one. And **a stored answer keeps the calls behind it**: the loop writes
`calls` beside the charted snapshot — every read call that ran without error,
with the arguments the tool accepted, and nothing reconstructed — so a post can
be pinned after a reload. A post without complete calls (every post before this
date) offers no Pin, and the client never fills one in from rows or prose: an
invented call is the one thing a pin must never hold
([postShape.ts](frontend/src/components/george/postShape.ts), `storedCalls`).

**"Ask George about this page..."** originally handed Ask only the Page name.
At Persistence V1, George could not read its pins: `george_ro` cannot see that
schema. That historical limitation ended with the injected Page reader in
Page Context V1; it is not a current restriction.

*Amended 2026-09-07, Page Context V1; identity updated by Page Workshop V1
(2026-09-08):* `george.pages` is authoritative. UUID is Page identity; title is
mutable presentation. The composer sends `{page_id}` as `page_scope`, with null
for virtual Ungrouped (which is not a Page row). The web process resolves that
identity for the authenticated owner and binds `view_page` to it. George may
read the Page's analyses and their receipts through that injected reader.
Purpose is descriptive user metadata, never instructions. Context survives a
rename because scope and URLs use the UUID, never text parsed back out of
"Pages / …". The scope is what the web process binds a reader to, and George
is told he is on a page he can read and has not read; `view_page` is his to
call when the question needs it, and simply opening Ask from a page reads
nothing. Five decisions, recorded because the code cannot say why:

  - **Hybrid replay, model-initiated.** A default read takes the newest 5 pins
    (`DEFAULT_PINS`); an explicit read names at most 8 by id, deduplicated,
    returned in the page's order whatever order they were asked in. Replays
    run two at a time and once 60 seconds have passed no further pin is
    STARTED — a pin not read was never run, and is named with its reason. Rows
    are capped at 15 per result, 200 per read and 60 KB serialized, dropped
    from the last pins first and never a pin's record or its receipts.
  - **A page read is evidence, not a figure.** Its rows carry no stored
    arguments (the receipts already say what each result was filtered to);
    the arguments travel once, in `meta.evidence`. The loop never charts it,
    never stores it as a call, never makes it the answer's receipts. What the
    answer keeps is the compact evidence — page, time, each pin's status, what
    was not read and why — on the post, so a reopened thread shows what George
    considered and recovers its scope from it.
  - **Every state survives.** Available, empty, refused, failed, unrunnable,
    not read for the deadline, not inspected for the bound: distinct in the
    structure, and two notices carry the read's own caveats —
    `page_context_partial` and `page_context_truncated`, the only two entries
    added to `metrics.yaml`, because the loop cannot enforce a notice without
    its fingerprint.
  - **"What's changed here?" has no stored baseline.** A pin re-runs rather
    than remembering, so George reports what the page shows now, uses a
    comparison only where a tool supplied one, and says plainly that a pin
    keeps no history. Change is never inferred from when a pin was made. An
    origin snapshot beside the current figures is a later question, alongside
    the comparison layer.
  - **Scope belongs to the thread.** The first page-aware question binds a
    thread to its page; follow-ups keep it wherever the person has navigated;
    a scope offered mid-thread is ignored; a fresh Ask has none; opening
    another thread gives it its own or none. It lives on the stream the shell
    owns, not in route state, which was lost on the first navigation and was
    why page context used to survive exactly one turn
    ([pageScope.ts](frontend/src/components/george/pageScope.ts)).

**Superseded by Page Workshop V1 (2026-09-08):** George now creates and edits
Pages through the injected PageWriter described above. The PageReader remains
an owner-scoped read capability, bound to the stable Page ID.

*Amended 2026-09-05: **Chat is retired**, and Post and Thread replace it.* Chat
was defined here on 2026-09-04 as "a session: one thread of turns, one person's,
reopened and continued from `george.conversations`". The word carried three
assumptions that the river discards deliberately, and each one was a thing
George had to stop being:

  - **A session has a beginning you create.** So the product had a "New chat"
    button and a blank page behind it — George waiting to be summoned. A
    colleague you are already in a thread with has no such door.
  - **A session is one person's.** So everything George did was invisible to
    everyone else, and a brief delivered at 06:00 lived in Telegram because
    there was nowhere in the app it could belong to more than one reader.
  - **A session ends.** So continuity had to be rebuilt from the outside —
    `george_recall` exists precisely because a figure quoted last Tuesday was
    in a container that had closed.

None of those was wrong for a chatbot. All three are wrong for a colleague, and
the vocabulary had to move before the schema did — the words in the tables and
the words in this file agree from the first commit, not after a rename.

What is NOT discarded: `george.conversations` keeps its shape and its
INSERT-only role, because it is also the gap log and pin provenance. Posts are
written alongside it. "Ungrouped" still holds pins with no page and still never
holds a conversation.

*Added 2026-09-05: **Watch** is the fifth and sixth word arriving together, and
a fifth word is normally a sign the concept is wrong.* This one is not, because
nothing above can express it. A pin re-runs when you look at it; a workflow runs
when the clock says so; neither can say "tell me when this becomes true". A
watch is a **condition plus a channel**: George evaluates it on a schedule and
posts only when the answer changes. Silence is its normal state, and that is
what separates it from a pin — a pin that finds nothing still renders, a watch
that finds nothing says nothing at all. Not "alert", "trigger", "monitor" or
"rule". Deferred until after C.4; written down now so it cannot be built under
a different name in the meantime.

*Built 2026-09-11, and the reservation held.* Watch was written down on
2026-09-05 with no code behind it, precisely so it could not be built under a
different name in the meantime. What arrived is what was described: a condition
plus a channel, checked on a schedule, posting only when the answer changes.
Five decisions, recorded because the code cannot say why.

  - **A watch is one of the brief's own conditions, plus a scope, plus a slot.**
    `metrics.yaml` `watches.conditions` is a closed set of three —
    `sales_moved`, `stock_crossed_out`, `newly_dead` — and each REFERENCES a
    threshold in `brief:` that was measured against a noise floor with the
    measurement written down beside it. Evaluation is `get_brief` itself, not
    new SQL, so there is exactly one implementation of "Rockwell is down" and
    a watch cannot drift away from the morning it agrees with. **There is no
    threshold column and no threshold argument**: "alert me at 10% instead of
    30%" is a request to change a DEFINITION, and it is refused with the
    current number and the evidence for it, never half-saved.

  - **It posts on CHANGE, never on truth, and recovery is news too.** The state
    is the set of firing subjects with each one's direction; a check speaks only
    when that set differs from the last. A shop down five mornings running is
    one post, because five identical alerts is how a signal stops meaning
    anything. "Rockwell is back to normal" is the half people otherwise never
    get told, and it is what makes the alarming half trustworthy. A direction
    flip counts as new — down 40% yesterday and up 40% today is not more of the
    same. A first check with nothing firing says nothing, or a watch switched
    on during a quiet week would announce its own silence.

  - **"Nothing fired" and "I could not look" are different answers, and every
    check is written down.** `get_brief` says per section whether it `ran`; a
    section that could not run yields NO state rather than an empty one, the
    last thing actually seen is left untouched, and the blindness is said once
    when it starts. Collapsing the two would announce that every shop recovered
    on the morning a source went stale — good news, invented, and
    indistinguishable from the real thing. `george.watch_checks` records the
    quiet checks as well, because from outside, "quiet for eleven days" and
    "broken for eleven days" are otherwise the same observation, and the second
    is the one somebody needs.

  - **The backtest is the gate and it is also the feature.** Architecture rule
    7 applies — a watch computes — but there is no authored logic to promote:
    the condition is one of three and its numbers are the brief's, already
    reviewed. So there is no administrator's approval, and what a person must
    see instead is what the rule WOULD have done. `NOT enabled OR backtest IS
    NOT NULL` is a CHECK constraint, not just a service rule. It paid for
    itself on the first live use: asked to watch every shop for a sales cliff,
    George backtested it, reported **47 of the last 60 mornings**, and said "that
    is not a watch, that's a habit you'd mute by week two" — then narrowed the
    scope to two shops and got 25. The backtest counts POSTS, not firing days,
    walking the days in order and carrying the state, because the number
    somebody decides on is how often they would be interrupted. A backtest
    measured under a different `definitions_version` does not count, and
    **rescoping throws the backtest away and switches the watch off**: a watch
    over one shop is a different watch from one over seven, and 47 becomes 4.

  - **Narrowing the scope is the dial; the threshold is not.** When a backtest
    says a watch would fire too often there is exactly one honest lever, and
    the tool says which. This is the rule most likely to be eroded by a
    reasonable-sounding request, which is why it is written here and held by a
    test.

**No model call, and that is what makes it safe to run unattended** — a check
is one vetted read, a named condition and a comparison with the last result.
George thinks when you REPLY: the post carries the exact `get_brief` call
behind it, so "investigate this" re-runs a fact and he climbs the ordinary
ladder from there. No investigation object, no second path (architecture rule
10). Posts are `org`, like everything George initiates, and go to the river
only — a second delivery channel would be a second thing to keep in step.

**Delivery watches are NOT built, and `metrics.yaml`
`watches.not_available.deliveries` says why and what would end it.** Both
sources are frozen at ~64 days, `received_qty` is sparse and never reconciled
and may legitimately exceed what was ordered, transfers carry no per-line
received quantity, and "Open" does not mean "not received" — 8 of 151 orders
are Open with notes saying the goods arrived. A watch over them would evaluate
identical rows every morning forever. Recorded rather than left as an absence,
because an absence reads as George being bad at something.


*Added 2026-09-11: **Standing question** is the seventh word, and the bar for a
seventh is higher than it was for the fifth.* It is a question George is asked
on a SCHEDULE, answered fresh each time by the ordinary loop, waiting for you
when you open the room. "How are we doing?" every day at 06:00 is one. So is
"anything out of stock at Rockwell?" every Monday.

**Why nothing that already exists can say it.** A *pin* re-runs a call when you
look at it — no model, no judgment. A *workflow* replays fixed steps on a
schedule — no model, by design, and that is the property its promotion gate
rests on. A *watch* checks a condition and stays SILENT unless it fires. A
standing question always speaks, and what it says is not decided in advance: it
is the only one of the four where the model runs unattended, and that is the
entire point of it.

**The word matters because of what it replaces.** The owner asked for a morning
briefing he could steer by talking. The first attempt built the briefing — a
Python composer that read the tables, chose the shops, wrote the sentence and
handed George a finished object. He rejected it in one line: *"why do we need
to build the brief? we're supposed to make George able to make those briefs on
its own"*, and then *"make sure there's nothing else like this — parts where
we're building something instead of building George to build those things."*
So **there is no brief object, no brief table, no brief composer and no brief
renderer.** There is a question, a slot, and whatever George decides that
morning. `brief_board.py` and `make_example_board.py` were deleted the same
day; `tools/brief.py` remains a READ George may call, not a thing that speaks
on its own.

**Steering it is two sentences and two columns.** "Make it 9am instead of 8"
moves `hour`/`minute`. "Show more of Rockwell" appends to `instructions` — the
owner's own words, handed to the model labelled as preferences about ATTENTION,
never as definitions and never as evidence. There is no other numeric column on
the table, so "alert me when Rockwell drops 10% instead of 30%" has physically
nowhere to be written: it is refused, and told which comparison exists. A
schedule is scope; a business threshold is a definition and lives in
`metrics.yaml` where it was measured.

**A standing question is one person's** (unlike a workflow, which is the
company's rule) because its answer is a private post they own. **Answers
outlive the question**: removing it deletes no post, because a thread is a
record of something George actually said.



### Two visuals declined, and what would change the answer

*Recorded 2026-09-05.* Both were proposed, both were surveyed against the data,
and both were declined for the same kind of reason: the picture would assert
something nobody recorded. A chart is harder to caveat than a sentence — the
notice sits beside it while the shape does the talking — so a visual that needs
data we do not have is not a smaller version of a good idea, it is a confident
version of a wrong one.

- **Stores as places / a map.** `stores.active_retail` carries `id`, `name` and
  `display_name`, and nothing spatial. There are no coordinates anywhere in
  this repo. Placing seven shops approximately would be a drawing asserting
  positions nobody entered, and readers trust positions.
  **What would change it:** real coordinates on the store records, from a
  source that can be cited in `filters_applied` like any other field.

- **Stock as fullness.** Fullness needs a denominator and there is none:
  `warning_stock IS NULL on 31,617 rows (100%)` — the same fact the
  `low_stock_not_operational` notice already reports. A bar drawn "70% full"
  would invent the 100%, which is the notice's failure mode rendered as a
  graphic.
  **What would change it:** a per-product-per-location capacity or reorder
  level that is actually populated, at which point the low-stock notice
  becomes unnecessary too.

**Movement as weighted arrows is NOT declined** — `movement.bases.transfer_records`
sets `names_destination: true`, so from→to pairs are real data and the arrows
would be backed by something.

### What George may say about his own charts

An annotation may **point** at rows and may **characterise** them in prose. It
may never introduce a number.

"This is the level shift, not a soft month" is a claim about rows the tool
returned, and that is what makes it allowable — rule 1 is untouched, because no
figure has been invented. An annotation carries indices into the returned rows
and George's reading of them; the figures stay on the axis and in the receipts.
Break that and a chart becomes the one place in this app where the model can
write a number and have a picture vouch for it.

What a save produces is a **workflow**: named steps, parameters, and the
reasoning behind each choice, kept as immutable **versions**. A **run** is one
execution of one version; a **backtest** is a run against a past window. Not
"recipe", "job", "automation", "template" or "playbook".

A pin is one person's tile. A workflow is the company's rule — it is **org-level**
(anyone runs, the creator or an admin edits, an admin promotes), because a rule
that fires every Monday into a group chat should not die with one account.

### The river

One append-only timeline of everything George does and says, and everything
anyone says to him. There is no other surface: the morning brief, a workflow
run, an approval waiting on somebody, a question and its answer are all
**posts** in it. Telegram is a window onto the same river, not a parallel
channel with its own content.

**Visibility is per post, and the default is not the same for both authors.**
Decided 2026-09-05, and the asymmetry is the whole design:

- **`org`** — everything George initiates: briefs, notices, workflow runs,
  approvals, watches. These are already company-level facts. A brief that fires
  into a group chat at 06:00 is not private, and pretending otherwise inside
  the app would make the app the least informed place to read it.
- **`private`** — a question a person asks, and its answer. Visible to its
  author, with an explicit action to share it into the river.

**Why not org for everything, which is what a team room would be.** Because the
choice is not reversible. Today every conversation is private — `user_id`
scopes the list, ownership gates continuing one — and people have been asking
questions under that assumption for 208 conversations. Making them all public
retroactively publishes things nobody agreed to publish. Making a private
default public later is a decision each person can make per post; making a
public default private later cannot un-show what was shown.

So the default is the conservative one, and it is a **default, not a
ceiling**: sharing is one action, and if the room turns out to want everything
in the open, flipping the default is a one-line change to a query that already
reads `visibility = 'org' OR author = :me`.

### Rules

These are hard constraints, like the architecture rules above.

1. **George is available on every page, not a page you navigate to.**
   He is present wherever the user already is, and receives the current page as
   context. There is no "chat page" to go to and come back from.

   *Reading of this rule, agreed 2026-09-02:* the `/george` route is not a
   violation. It is George's **home** — where pins live and long conversations
   happen. The rule governs the second surface: a persistent affordance on every
   other page that starts a conversation in place and passes that page as
   context. The route is where work lands; the affordance is where it starts.
   Both reuse the same components and the same stream hook, so there is one
   George, not two. The route exists today; the per-page affordance does not yet
   — that is outstanding work, not a settled exception.

   *Amended 2026-09-07:* the home is now the shell (`/today`, `/ask`, …; see
   "The shell" below), and the legacy chrome's George link carries the page it
   was clicked from as `page_context`. That is a step toward the affordance,
   not the affordance: a question still starts in Ask, not in place.

2. **One save gesture.** Same icon, same placement, same confirmation,
   everywhere. A user who learns to save once has learned to save everywhere.

3. **Every number is inspectable.** Clicking any figure shows its receipts in
   the same panel — no new route, no modal stack — and it works identically
   whether the figure came from chat or from a tile.

4. **Notices always surface.** Identically in chat, on tiles, on posts and in
   the approval queue. A notice must never be swallowed by a card with room for
   only a number: if a tile cannot show the caveat, the tile is the wrong shape.

   *Amended 2026-09-05, the greeting:* the rule is that a caveat is **surfaced**,
   which is not the same as **spelled out**. A notice may be reduced to one line
   that NAMES it — "Thresholds not configured", visible without any interaction
   — with its explanation on tap, in exactly one place: **George's opening
   greeting**, and there the sentence comes first and the caveats follow it.

   Everywhere a figure is being ANSWERED, the caveat stays whole and stays
   ABOVE the number, because a caveat above a number is read on the way to it.

   The greeting is the one case where that reasoning inverts. It is the first
   thing on the page and nobody asked for it, so two full notice cards above it
   meant George opened by qualifying something the reader had not yet been told,
   and on a phone the sentence — the entire point of the greeting — started
   below the fold. A caveat that pushes the claim it qualifies off the screen
   has not surfaced anything.

   What stays forbidden is what the rule was written against: a caveat behind a
   disclosure that gives no hint it is there, and a card that shows a number
   with the caveat dropped for want of room. Both forms live in
   [NoticeBanner.tsx](frontend/src/components/george/NoticeBanner.tsx), which
   remains the only place a notice is rendered.

5. **One colour means "needs you".** Reserved for approvals. Nothing else may
   use it — not errors, not warnings, not emphasis. Its meaning is destroyed by
   a second use.

   *Named 2026-09-03:* the approval queue's first and only occupant is a
   **workflow version waiting to be promoted past the backtest gate**
   (`GET /george/workflows/approvals`, metrics.yaml
   `workflows.promotion.queue_name`). A failed run is not an approval and must
   not borrow the colour. Neither is a stale tile, a rotted pin or a notice.

   *Corrected 2026-09-05: **a notice is informational and never wears the
   accent.*** The line above already said so, and the code had been doing the
   opposite since before the rule was written. `NoticeBanner` — the single
   component every surface renders a caveat through — used the accent for its
   border, its icon and its heading, so **every notice in the app, in chat, on
   tiles and on posts, was spending the one colour reserved for "needs you"**.
   Two more did the same: a reconciliation disagreement in the receipts, and a
   refused tool call.

   None of that was a decision. It was the original mockup, made before this
   rule existed, carried forward because each of the three genuinely feels
   urgent — which is the pressure the rule describes. **The colour's meaning is
   destroyed by a second USE, not by a second feeling.** A notice needs nobody:
   it qualifies a number already on screen, and there is nothing to go and do.
   A refusal is the tool declining to mislead, which is a real answer. Measures
   disagreeing is a fact about a figure.

   So a caveat gets its prominence from **position and structure, never hue**:
   above the number it qualifies, never collapsible, with a rule down its left
   edge — the same treatment the approval row gets, in slate rather than
   accent, so the two read as the same kind of thing and differ only in whether
   they ask for anything. Notices are navy on `george-paper`.

   The boundary is held by a test rather than by review, because review is what
   missed it for two days: `accentUse.test.ts` scans the source and fails on any
   file naming the accent token that is not on a short, reasoned list.

   *Amended 2026-09-04, the brand mark:* **George's mark renders in the accent
   colour, and it is the only thing that may.** The rule protects a signal, and
   a signal is destroyed by a second USE — not by a second appearance. The mark
   is on every screen, in every state, whether or not anything needs doing;
   something permanently present cannot be read as a summons, and within a day
   it stops being read as anything but George. An approvals badge beside it
   still means what it always meant, because the badge appears and disappears
   while the mark never moves. What would have destroyed the signal is orange
   arriving to say *something happened* — and that is exactly what stays
   forbidden.

   So the exemption is bounded, and the boundary is the point: **the mark's
   error state must never add or intensify orange.** It dims to ~0.45 opacity
   and one petal gaps from the silhouette — form, never hue. An error learning
   to shout in the approvals colour is the failure this rule exists to prevent,
   and the mark is the easiest place for it to creep back in, because there the
   orange is already licensed. The six states are pinned by tests that assert
   error changes the DRAWING and not the colour, so the boundary has to be
   broken deliberately: see
   [markState.ts](frontend/src/components/george/markState.ts) and
   [markState.test.ts](frontend/src/components/george/markState.test.ts).

   The mark itself is a plum blossom (ume) in the spirit of a carved seal, and
   it is deliberately imperfect — uneven petals, stamens of differing length, a
   hub slightly off centre. It is one path whose stamens are knocked out as
   true negative space, so it is accent-on-cream in the app and cream-on-navy
   as an avatar without a second copy existing to drift.

6. **No number displays without a timestamp.** Every figure carries when it was
   read. A number with no time on it is a claim with no expiry.

7. **Mobile-first.** Rails collapse; the centre column is the whole screen. The
   phone layout is the real layout, and the desktop one is the phone layout with
   room either side.

8. **A claim about state renders from a loaded result, never a literal.**
   "Nothing needs you", "0 pending", "all fresh", "no notices" — every one of
   these is an assertion about the world, and the UI may only make it while
   holding a result that says so. A hardcoded `count={0}`, a placeholder empty
   state, a default that renders before the first fetch: each is the app
   stating a fact it never checked.

   *Named 2026-09-04, from the case that prompted the rule:* George's right
   rail said "Nothing needs you. Approvals will appear here when the queue
   exists." The queue existed — `GET /george/workflows/approvals` had been live
   since 2026-09-03 — the frontend had never called it, and one version was
   genuinely waiting on somebody in production. The screen was not out of date;
   it had never asked.

   So **not-yet-loaded is its own state and must look like one.** Three
   outcomes, three renderings, and the first may never borrow the third's
   words: *loading* ("Checking…"), *failed* (say the lookup failed), *loaded*
   (the rows, or a genuine empty state). Collapsing loading or failed into
   "nothing here" is the same failure as reporting a number without its
   notice — a confident claim with nothing behind it, which is the one thing
   this whole system exists to prevent.

   This is architecture rule 2's guarantee arriving at the last step. A tool
   returns `{rows, meta}` so a number can never be shown without its
   provenance; this rule says the ABSENCE of rows cannot be shown without its
   provenance either. And it binds rule 5: the approvals colour may only be
   worn by a row that came back from the server, so a failed lookup and an
   empty queue are both navy.

### The shell

*Added 2026-09-07, George Shell V1.* George is the primary environment, and
the existing application sits behind it as **Operations**. Recorded here
because each line is a decision that cannot be read back from the code.

*Superseded 2026-09-09 by the desk ("The desk", below) in one respect:*
**Today, Ask, Inbox, Pages and Workflows are no longer destinations.** Ask
is the input line on the desk; Today is the desk at rest; Needs you,
Running and Kept are rails on the desk; History is a drawer over it. The
old paths redirect and nothing bookmarked stops resolving. Everything else
in this section — Operations as the migration boundary, one George above
both chromes, the mark's real states, reconciliation by post id, a
stopped turn never looking finished, thread access, disclosure by
position — is unchanged and is what the desk is built on.

- **Five words, one key.** Today, Ask, Inbox, Pages, Workflows all sit behind
  the `george` page key. Operations lists every legacy page the caller may
  see, at its existing path, in its existing chrome. Warehouse, Packing,
  Barcodes, reporting and StoreHub are business applications that may stay
  permanently; the boundary is where migration happens, not a queue for
  retirement. [shellNav.ts](frontend/src/components/shell/shellNav.ts) is
  the list and the test.
- **`/` is a redirect and nothing else.** A person with George lands on
  `/ask`; everyone else lands where they always did. Ask rather than Today
  is deliberate: Ask is the strongest real George experience, and Today
  will not be manufactured as an executive page before George can say what
  deserves attention. The dashboard has `/dashboard`; `/george` and
  `/george/t/:id` forward to `/today` and `/ask/:id`.
- **One George above both chromes.** The stream hook is mounted once, in
  [GeorgeStreamProvider.tsx](frontend/src/components/george/GeorgeStreamProvider.tsx),
  inside SessionGuard, so an answer keeps arriving while the person moves
  from Ask to Inbox. This is persistent ownership of one live HTTP response
  in the browser. The backend has no background job; logout tears the
  provider down with the session; nothing survives a reload and nothing
  pretends to.
- **The mark draws real states only.**
  [presence.ts](frontend/src/components/george/presence.ts) decides: the
  stream's state while a turn runs; `listening` from a focused composer or
  an unsent draft while George is at rest. "Waiting for the user" has no
  frame behind it and is not drawn. "Waiting for approval" is a fact about
  the queue: the count beside Inbox, never the mark. No caption under the
  mark on an empty Ask — its behaviour says it is ready.
- **A persisted exchange renders exactly once, by post id.**
  [riverMerge.ts](frontend/src/components/george/riverMerge.ts) drops a
  live turn when one of the ids from its `post` frame is among the fetched
  posts, and for no other reason — never the question text, the answer
  text or a timestamp. A turn with no frame, a stopped turn, and a frame
  saying `stored: false` are all kept, because each is the only rendering
  there is.
- **A stopped turn never looks finished.** Cancelling marks the turn
  `cancelled`; it has no `done` and no `post`, and the note says the answer
  may still appear in the thread, because whether the server finished and
  stored it is unknown from the client.
- **Threads George opens are starting points.** A thread can be continued
  by the person whose conversation it is, or by anyone when its ROOT post
  is George's and org-visible — exactly two ways in, in
  [thread_access.py](backend/app/services/thread_access.py), contract-tested.
  A reply is private and owned by the replier; nothing is published by
  replying. The loop keeps a history that opens with George behind
  `THREAD_OPENER` instead of dropping it, so the post being replied to is
  the one thing George can see. The caller's own chat supplies the calls
  behind its answers; a George post or another person's shared exchange
  travels as text with no tool calls, because a call rebuilt from charted
  rows would be invented ([threadHistory.ts](frontend/src/components/george/threadHistory.ts)).
- **Inbox decides; Workflows describes.** Inbox holds the approval queue and
  Promote — the one accent-coloured action in the app, administrators only,
  enforced server-side. Workflows reads each rule as a living thing: where
  it is in its life, when and which version it runs, its last run with that
  run's notices whole, and the one thing that would move it on. No builder.
- **Disclosure is by position, never by hiding.** Notices, then the answer,
  then the figures with their receipts. The newest answer leads and earlier
  turns go quieter — slate prose, charts behind a line that names them —
  and a notice or a receipts line is never quieter
  ([turnShape.ts](frontend/src/components/george/turnShape.ts)).

  *Amended 2026-09-07, the activity:* it used to stand OPEN while a turn ran,
  because watching real execution is worth something. What that put on screen
  as the most prominent thing a waiting person saw was
  `get_sales {"group_by":["store"]}` — implementation detail dressed as
  progress. It now waits behind one line that says what George did in words,
  in both phases: "Reading sales and counting stock…", then "Read sales and
  counted stock — 412 rows". Every word of it is derived from the frames, so
  it may be read as fact, unlike the model's reasoning inside the disclosure.
  Nothing was removed and nothing moved that the rule protects: a notice, a
  receipts line, a stopped note and a pin or save confirmation are still drawn
  by the turn itself, above and below, and cannot be collapsed.
- **The accent exemption list is still four:** the mark, the status band's
  count, the shell's Inbox count, and the Inbox page. PostCard's dead branch
  and the drawer gave up their places; the scan now covers `components/shell`.
- **A thread names its page, and an answer names what it read of it** (added
  2026-09-07). One line above the composer — "Page context · AJI BARN
  Reorder", linking back — and nothing of the page duplicated in Ask. Under an
  answer that read the page, one line always visible, "Read 5 of 7 saved
  analyses · 2 not inspected", drawn from the `page_context` frame and never
  from the prose, with the pins, their states and their read times behind the
  same disclosure the receipts use
  ([PageContextBlock.tsx](frontend/src/components/george/PageContextBlock.tsx)).
  The same block on a stored post, from what George recorded. Nothing in it
  wears the accent; nothing in it is a figure. A live turn offers Pin only for
  the calls the loop marked `pinnable` on the frame — read, never decided
  from a name.

### Objects

*Added 2026-09-11.* A shop, a product, a supplier or an order, opened up:
`get_object(kind, name)` returns every section of one thing in a single call.
Recorded here because each line is a decision the code cannot state.

- **It writes no SQL — not even vetted SQL.** Everything an object view shows
  is already defined somewhere: a shop's week is `get_sales`, its shelf is
  `get_stock`, a product's costs are `get_cost_history`. So the tool CALLS
  those and keeps each result whole. The consequence is the point: there is one
  definition of what a shop's week is, shared by the object view, the morning
  brief, a watch and anything George reasons with. A second implementation
  would be a second definition, and the two would disagree on a Tuesday with
  nobody able to say which was right.

- **Tapping must not cost a model turn.** Asking George to open Rockwell takes
  a model call and ~40 seconds; the same five reads take about a second and
  involve no judgement, so the client calls the tool directly through
  `POST /george/object`. Sections run concurrently (four at a time — the
  read-only role is capped and `connect()` gates at 8 per process), which took
  a shop from 4.8s to ~1.0s over HTTP. **George is given the identical tool**,
  so what a person sees when they tap and what he sees when he thinks cannot
  drift apart.

- **Nothing is joined across sections**, for the reason a workflow may not join
  its steps (architecture rule 6): a combination of two results is a
  definition. One exception is named and bounded — resolving WHICH product
  "Aji Mix" means before reading anything about it, which is identity, not
  arithmetic, and the same act as matching a shop name against the store list.
  Where several products answer to one word, the view says so and refuses to
  pick: showing somebody another product's figures under the name they typed is
  worse than showing nothing.

- **The view carries no `snapshot_timestamp`, deliberately.** An object mixes a
  week of sales with a live stock snapshot; one timestamp over both would be
  the freshest source vouching for the stalest. Each section keeps its own
  receipts and its own call. For the same reason `get_object` is classified
  **partially_reproducible** in `workflows.backtest`: the window rebinds, the
  shelf does not.

- **Five section states, and they are five different facts** (UI rule 8):
  available, empty, **refused**, failed, unresolved. A refusal is the tool
  declining to produce a misleading number and is a real answer with a reason;
  a failure is something going wrong. One word for both would file "AJI BARN is
  a warehouse" beside "the database is down". A section is never dropped for
  being empty — a section that vanished reads as "there is nothing here".

- **A warehouse is never asked for its sales.** AJI BARN holds stock and
  records no transactions, so five refusals in a row read as a broken screen.
  The definitions already separate trading from not, so the tool reads that
  line and says once what a warehouse is, then shows the shelf it does have.

- **What George thinks is NOT a section**, and cannot be: beliefs live in the
  `george` schema, which the read-only role has no access to. That boundary is
  right rather than inconvenient — it means a replayed past morning can never
  show today's opinion. The view is composed on top by the endpoint, on the
  application role, carrying when it was formed, when it was last checked, and
  whether data has landed since. **Null is a real answer**: "he has not formed
  a view" is not "he thinks nothing is wrong".

- **Supplier and order are thin, and say why.** Both sit on frozen CSV imports
  ~64 days old with sparse, unreconciled `received_qty`. They return what the
  record HAS with its age, rather than being dropped — an omitted section reads
  as "nothing happened with this supplier" — and
  `objects.thin_reasons.purchasing_sources_frozen` records what a real source
  would have to provide.

**One shipped bug this uncovered**, fixed here and held by a test:
`get_sales(filters={'sku': ...}, compare_to=...)` raised
`query parameter missing: sku_product_ids` **every time**, for a valid SKU as
much as an unknown one, because `base_params` was snapshotted before the SKU
resolution added its parameter. "How did Aji Mix do against last week" could
not be answered at all, and nothing noticed until an object view made exactly
that call. `base_params` is now built where it is used.

### The board is arranged by moving things

*Added 2026-09-11.* George composes the board because he knows what matters;
the person rearranges it because they know what they want to look at. Three
decisions, recorded because the code cannot say why.

- **Arranging is a property of being ON the board, not of being a shape.**
  The row of controls used to be drawn by the tile, and only two of the
  fourteen kinds called it — so a real board of ten objects had nine that
  could not be moved, kept, resized or set aside, and the one that could was
  whichever happened to be a subject. `render.tsx` draws it once, under every
  object. `compare` and `why` stay conditional, because they are questions
  about a subject and an object with no subject has none to ask. It is quiet
  until the pointer is on the object or something in it has focus, and always
  visible where there is no hover (UI rule 7).

- **Moving is a drag, and the arrows are gone.** A pair of buttons that swap a
  tile with its neighbour is a machine for producing an arrangement, not the
  arrangement — you have to count the presses. [drag.ts](frontend/src/room/drag.ts)
  is pointer events with WINDOW listeners and no `setPointerCapture`, because
  the dragged tile moves between the lead row and the body of the board and a
  captured pointer dies with the element that captured it. It hit-tests with
  `elementFromPoint` rather than modelling the CSS-columns layout, reorders
  live so the board moves out of the way under the hand, and the carried tile
  is `pointer-events: none` so it finds the board and not itself. The arrow
  KEYS survive on the grip: a board that can only be arranged with a pointer
  is a board somebody cannot arrange.

- **`Local.size` gained `normal`, which no button sets.** Dropping a tile in
  the lead row means "this is the point" and dropping it in the body means it
  is not; with only `big` and `small` there was nowhere to record the second,
  so George's lead sprang back to the top the moment it was let go — the
  arrangement losing to the weight, which is the opposite of every other line
  here.

**And the three other screens wear the room's chrome.** What needs a decision,
what you kept and what runs on its own rendered in the shell that existed
BEFORE the room — a wide rail of words, serif display headings, its own type
scale — so following a link off the board landed in what looked like another
application. They are lists, not boards, so they get a column rather than a
packing grid ([RoomShell.tsx](frontend/src/room/RoomShell.tsx)); a run's
notices are drawn through the room's own caveat, whole, and nothing about
which notices surface changed.

### How George talks — the prompt is one screen

*Added 2026-09-12, and corrected the same day.* The system prompt is built
from four things, in this order, and it has a budget the suite enforces.

- **Character, as traits.** WHO YOU ARE: the colleague who has read
  everything and says the one thing; the same voice for good news and bad;
  "I can't" (a fact about the system) kept apart from "I wouldn't" (an
  opinion); acts on nothing alone. Traits generalise to the situation no
  rule anticipated; a rule covers its own case.
- **The shape of an answer.** Reading first, caveats as clauses in the same
  breath, what the figures do not establish, one offer. The morning is one
  line per thing that changed. Figures are spoken only when no shape on
  the board holds them.
- **Nine rules, every one held by code as well.** Numbers from tools,
  notices surfaced, refusals followed, one grouped read, no arithmetic in
  prose, a write only when its tool returned, one volunteered fact, no tool
  vocabulary. Nothing in the rules is a preference.
- **Mechanics live on the tools, not in the prompt.** Which metric breaks
  down by which subject is on `get_sales`; how a board is worked — the
  edits, the weights, one object per read — is on `compose`; the page
  bounds and the remove wording are on `create_page` and `edit_page`
  (`agent/loop.py _tool_addenda`, appended to a tool's description by
  `build_tool_schemas`, generated from the same definitions). The model
  reads a tool's description at the moment of choosing it, which is where
  a sentence about a tool belongs. The sections that remain — SCOPE,
  JUDGMENT, INVESTIGATING, THE SURFACE, THE DESK, THE BOARD — are still
  built from `metrics.yaml` at import, and each is now a paragraph.

**The budget** (`metrics.yaml voice.budget`, held by
`tests/test_voice_contract.py`): at most 1,800 words, 10 numbered rules and
20 prohibitions ("never", "do not", "don't"). The numbers, and why they are
written down:

| | Words | Numbered rules | Prohibitions |
|---|---|---|---|
| Before the voice work | 8,623 | many | 57 "never" alone |
| First carve, reported as done | 4,233 | 18 | 64 |
| Second carve, budget met | 1,793 | 9 | 18 |
| AgentIF average (707 real agent prompts) | 1,723 | 11.9 constraints | |

The research the plan rested on said models already perform poorly at
AgentIF's length and that the thirty-seventh rule competes with the first
thirty-six. The first carve moved the easy 4,000 words and left the
generated sections whole, and the shortfall against the plan's 1,800 went
unsaid until the owner quoted the research back. The budget test exists so
that cannot happen silently again: the target is a definition, the suite
holds it, and anything the prompt would teach past it goes onto the tool it
describes. The behaviours the old sections taught are held by the same
contract tests as before, re-anchored to where the words now live.

**What the evals measured** (`tests/evals/test_voice_evals.py`, opt-in, the
real model on twelve fixed questions, same reads, same database;
`verification/voice-before.json` against the 8,623-word prompt,
`voice-after.json` against 1,793, `voice-after-transcripts.md` the twelve
answers for a person to read). Against the plan's own acceptance numbers:

| Measure | Plan's target | 8,623 words | 1,793 words | 1,793 + gate |
|---|---|---|---|---|
| Strict pass | 12 | 8 | 7 | 12 |
| Median words per answer | ≤ 90 | 109.5 | 93.5 | 87 |
| Sentences restating a drawn figure | 0% | 22% | 19.5% | 0% |
| Reading first (no figure in the first sentence) | ≥ 11 of 12 | 7 | 7 | 12 |
| One paragraph | | 3 of 12 | 12 of 12 | 12 of 12 |
| Ends with at most one offer | 12 | 12 | 12 | 12 |
| Notices surfaced | 100% | 11 | 12 | 12 |
| Refusal kept, internal vocabulary leaked, ungrounded numerals | kept, 0, 0 | kept, 0, 0 | kept, 0, 0 | kept, 0, 0 |
| Tool calls across the twelve | | 58 | 61 | 55 |

Nothing got worse for the cut, and three things got better on the cut
alone: the answer is one paragraph every time, the notices all reach it,
and the median fell. Three targets the cut left open — the median 3.5 words
over, a fifth of sentences restating a figure the board draws, the reading
leading in seven of twelve — were not met by the long prompt either, and
the five that failed reading-first all opened with the reading and put the
figure in the same sentence ("Rockwell had a good week — up nearly 14% on
the week before"). The check was not loosened to make the number; the gate
below was added instead, and **with it every target in the table is met.**
Read with care: one run each, the model varies between runs, and the gate
fired in only three of the twelve — the other nine came in clean on their
own that run. What the gate guarantees is the ceiling: a restated figure
costs one rewrite and the answer stands.

**Restatement is now a gate, not a request** (`metrics.yaml
voice.restatement`, [agent/prose.py](agent/prose.py)). The long prompt
asked for no restated figures in three places and got 22%; the short one
asked once and got 19.5%. Words do not move it, so the loop enforces it the
way it enforces the volunteering cap: when something is drawn and a
sentence carries a figure a drawn row already holds, one corrective turn
names the sentences and asks for the reading instead, then the answer
stands. The check is the evals' own function, moved into `agent/` so the
measure and the gate cannot drift; matched on digits, with dates and small
counts excused. The warning (`restated_figure`) is process, drawn in the
activity and never as a caveat. What it does not do: verify a figure that
is NOT on the board — that stays an eval, and rule 9's statement of what
production enforces is unchanged.

### The board maintains, not accumulates

*Added 2026-09-12.* Measured on George's own record since the 10th: 168 `put`
edits to 3 `change` and 4 `quiet`. Asked the same thing again, he put a twin
beside the object he had, under a fresh key, and every multi-turn board held
1.2–2.0× as many objects as distinct reads — the same net sales per shop
drawn as a table, two bar charts and two sets of solid tiles at once.

- **An object is identified by the read it draws** — tool, arguments and the
  one `subject` it is scoped to — not by the key George chose. A later `put`
  of that read replaces the object where it stands, under its old key, so the
  person's arrangement of it survives; the new key becomes an alias so his
  later edits under it land on the same object
  ([board.ts](frontend/src/room/board.ts) `readIdentity`, `buildBoard`).
  A comparison's `subjects` are a view of the read, not a scope, and are not
  part of identity: one board holds one of a read's views.
- **The server applies the same rule** so the stored composition matches the
  screen: the board travels with the question carrying each object's read,
  and `compose` rewrites a fresh `put` of a read already there into a
  `change` of the existing key — not a refusal; the model meant "show this"
  — and names the rewrite in `meta.rewritten` ([compose.py](agent/compose.py)).
- **A quiet object nobody touched for `composition.expire_after_turns` (6)
  turns leaves on its own**, unless the person kept it. Keeping outranks a
  count.
- The prompt says it in one line: *one object per read; change what is
  there; add only what is new.*
- **Measured on the twelve voice evals** (the plan's target was 1.0 objects
  per distinct read): by the identity rule above, 1.23× on the long prompt
  and 1.07× on the short one, with 15 duplicate `put`s per run rewritten to
  `change` by the server. Counted as raw `put` blocks — the way the plan
  first wrote it — it is 1.77× and 1.63×: George still emits a twin under a
  new key almost every time, and the rule is what makes that harmless.

### The agenda — what deserves attention today

*Added 2026-09-12.* The judgement layer, as one read. The morning used to be
a fixed read at a fixed time; `get_attention` ([tools/attention.py](tools/attention.py))
is the judgement over it, declared in `metrics.yaml attention`.

- **Every floor is a reference, never a number.** Each source names the
  definition it is judged against — the brief's own floors — and
  `tests/test_attention_contract.py` holds that every one resolves. A source
  with no definition of normal is listed under `cannot_notice` with the
  definition that records the gap, so the morning can say "I cannot see
  deliveries" instead of letting silence read as calm.
- **Every survivor ranked, money first, by absolute size against its floor,
  ties by name** — `brief.notability` generalised from the one opening line
  to the whole morning. Each row is a brief row, whole, with its receipts.
- **Every sense is dated.** `meta.senses` carries each source's last
  movement and, when blind, why: frozen, stale, could not run today, or no
  definition of normal.
- **Silence is the normal state.** `meta.silent` when nothing crossed. A
  scheduled question that read a silent morning is recorded with
  `last_status = 'silent'` (migration `u5v6w7x8y9z0`) — not `failed`, and not
  `ok`, which is the only status `latest_answer` offers — so the room does
  not open on a morning with nothing in it and falls through to the thread
  you left (history as context).
- `morning` is a message kind in `investigation.message_kinds`, so SCOPE
  teaches which read it is: one call, one line per thing that changed.

### The decision log — memory that acts

*Added 2026-09-12.* A shop raised every morning and set aside every morning
ranked first every morning, and George could never say "raised Tuesday,
left". `george.decisions` (migration `v6w7x8y9z0a1`,
[decisions.py](backend/app/services/decisions.py)) is what people DID with
what he raised, and the agenda reads it.

- **A decision is a recorded gesture, never an inference.** Five outcomes,
  a closed set held in the yaml, the model and the CHECK together: `kept`,
  `dismissed` (set aside), `opened`, `asked` (why?), `left` (the morning put
  away with it still on the board). The room writes them through
  `POST /george/decisions` from its own gestures on an agenda row
  ([decisions.ts](frontend/src/room/decisions.ts) decides whether an
  object IS one, from the read behind it) and for nothing else. A row
  nobody touched is a row nobody touched; nothing is written for it, and
  nothing decays.
- **Shared, like beliefs.** The agenda is about the business, and what its
  people did with it is one record; `decided_by` is provenance. Nothing is
  ever updated: kept on Tuesday and set aside on Thursday are two rows and
  both count.
- **The read back is injected, and the model never sees the argument.**
  `george_ro` cannot see the schema, so `get_attention` takes `decisions`
  keyword-only — absent from the schema by construction — and the loop
  fills it from a reader bound in the web process or the standing runner
  (`agent/loop.py INJECTED_READS`). A reader that fails hands the tool
  `{"error": …}` rather than nothing, so "no log" and "could not read the
  log" stay distinguishable on the result.
- **Three rules, each a definition, each written on the row it moved**
  (`attention.learning`): set aside three or more times in the window
  ranks below everything not so dismissed, whatever its size; kept, opened
  or asked about within seven days ranks first within its source, so money
  still leads; kept is marked on the row. `learning.reason` says why
  ("ranked lower: set aside 3 times"), every row carries its recent
  decisions newest first, and a log absent or unreadable leaves the order
  exactly as before and says so in `meta.learning`.
- **Proven live** against the dogfood log: three dismissals recorded the
  way the route records them, read back the way the loop reads them, and
  the row ranked last of thirteen with its reason. "Raised Tuesday, left"
  in a live answer waits on the model account having credits — the row
  carries it; whether George says it is the voice eval's to show.

### Levels of automation — the rules of engagement

*Added 2026-09-12, Phase F of the attention plan. A paragraph, no code:
every mechanism it names already exists and is already held by its own
tests. It is written down so that the next capability is built at the
same level and not one higher by accident.*

George's autonomy is not one setting. It is a different level for each of
the four stages of the work, and the levels are Sheridan's, deliberately:

- **Acquisition and analysis: as automatic as the definitions allow.** He
  reads every source on a schedule (standing questions, watches, the
  agenda), notices against floors that already exist, ranks, dates every
  blind sense, and learns from recorded gestures. None of this waits for
  anybody, and none of it invents a threshold, a score or a cause.
- **Decision: level four.** He recommends one course — the closed verbs on
  the recommendation widget, one offer at the end of an answer — and the
  owner decides. He does not choose among alternatives on the owner's
  behalf, and a row that says "leave it" is a recommendation too.
- **Action: never above level five.** Everything that leaves George's hands
  is a veto point for a person: a draft order is a draft; a page is the
  owner's to keep; a workflow version starts ungated and a schedule is born
  switched off; promotion past a backtest is an administrator's act; a
  watch posts and nothing else. No outward channel exists until one is
  attached and approved, and when one is, it enters at the same level.
- **Reasoning shown, every time (Bainbridge).** The receipts, the notices,
  the read behind every object, the reason on every re-ranked row, the
  version that ran and the one the schedule fires. An operator who cannot
  see why the automation did what it did cannot take over from it, and
  taking over is the whole point of a veto.

What would move a level is a decision recorded here first, with the test
that holds the new level, before the mechanism is built.

### The instruments

*Added 2026-09-12, from the design board.* Five marks joined the grammar —
`range`, `bullet`, `ring`, `dots`, `calendar` — and one read joined the
tools: `get_sales(group_by="hour")`. Recorded because each is a line that
could be crossed by accident.

- **An instrument is a second reading of a figure, never a word on it.** A
  range says *where* a day sits on its own thirty; a bullet says *how much
  of* a whole; a ring shows how each of a set stands; dots say *when*; a
  calendar shows the rhythm of the weeks. None takes a value, and none says
  good or bad. "Healthy / danger" bands are thresholds, and a threshold is a
  definition (metrics.yaml) or it does not appear — the same reason the
  fullness bar was declined above. The one word the board carries, "above
  the noise floor", is the one the brief defines.
- **A bullet's whole is a column of the same row.** `against` is a channel,
  checked against the same read, and never a second `seq`: a bar measured
  against another read's row would be a ratio nobody computed (the
  composition-is-adjacency rule below, applied inside a mark).
- **A calendar lights nothing for beating another day.** Each day against
  its own weekday a week earlier is a per-bucket lag, which
  `comparisons.not_supported.per_bucket_lag` records as not built. The
  board's streak calendar therefore does not exist in the grammar; brightness
  is the field, and the rhythm is what it shows. If a per-day same-weekday
  comparison is ever wanted, it arrives as a comparison mode in the
  definitions, not as renderer arithmetic.
- **Hour is a bucket, not a series.** Thirty days grouped by hour is one set
  of twenty-four figures — it orders by the hour, sums across the days, and
  is never compared, for the reason day, week and month are not.
- **A mark with no `colour` channel paints in the tile's own hue.** Until
  this date it drew in the neutral grey, so Rockwell's chart sat on
  Rockwell's violet tile in slate. A line now also names its high and its
  low — both rows the read returned, so both may be written.

### History as context

*Added 2026-09-12.* The one thing the research added to the plan: a Jarvis
infers context from **time**, **place** and **history** before it asks. The
room had the first two — the standing answer opens the morning; opening a
shop opens its object. This is the third.

- **The room reopens where you were.** "/" with nothing in hand opens this
  morning's standing answer *if it is newer than your last look at it*, and
  otherwise the thread you left. Nowhere to go back to and nothing new is a
  real answer, and stays the empty room. Clearing the board forgets the last
  thread on purpose — leaving must not walk straight back in.
- **What arrived since you last looked comes to the centre.** Per thread,
  the browser keeps the time of the newest answer that was on screen while
  you were looking. On return, every object touched by a later answer lands
  with the glow, and one line above the board says how many answers arrived
  — a count of turns with a time after that mark, never a guess (UI rule 8).
  Ask anything and you are no longer "back": the line and the glow stand
  down, and everything is marked seen as it settles.
- **Per viewer, per browser, never sent** — exactly like an arrangement.
  When you last looked is a fact about a person's attention and stays on
  their machine ([history.ts](frontend/src/room/history.ts)). A server-side
  record of attention is a different thing and was not built.

### The result vocabulary

*Added 2026-09-07.* George decides WHAT matters; this app decides how what he
returns may be drawn. The path is one-way and has no branch in it:

    tool result ({rows, meta})
      -> inferShape          which primitive, from the rows alone
      -> resultShape         how several results compose, from meta + arguments
      -> a fixed set of React components

There is no step where the model supplies markup, a component name, a colour,
a width or a figure. It may narrow a chart choice through a hint and it may
say anything it likes in prose; it may not reach the renderer.

- **Five primitives, and they are a closed set:** Metric, MetricGroup,
  Comparison, Chart, Table — plus the caveat, the receipts and the one action,
  which already existed. Insight is George's prose and is not a component: the
  lede paragraph is the finding, and CLAUDE.md's rule on annotations already
  governs it — characterise rows, never introduce a number.
  ([ResultBlocks.tsx](frontend/src/components/george/ResultBlocks.tsx))
- **Selection is one function for every surface.** `inferShape` decides the
  shape of a figure in an answer, on a stored post and on a pinned tile, so a
  number cannot look like one thing in chat and another on a page — the
  divergence UI rule 3 exists to prevent. Metric and Table used to be private
  to PinTile and agreed with the answer's rendering only by coincidence.
- **Comparison renders a delta the TOOL supplied, and never computes one.**
  Which baseline a period-over-period figure is measured against is a
  **definition** — `brief.sales_vs_same_weekday` rejected `previous_day` in
  favour of `same_weekday_last_week` after measuring it — so a renderer
  choosing its own would be writing a business rule into the presentation
  layer.

  *Amended 2026-09-07:* `get_sales` now supplies deltas through
  `compare_to='previous_period'` (architecture rule 9), so a row is a
  comparison when it carries a numeric `change_pct` **or** a
  `baseline_status` saying the tool tried and could not. `change_pct` may
  then be null and the renderer draws the tool's own words for it — no
  baseline, the previous period was zero, no figure this period — with the
  baseline figure beside it where there is one; `flat` is drawn as "no
  change". Nothing is filled in from `value` and `baseline`. `get_brief`
  still supplies its own deltas as before.
- **Composition is adjacency and nothing else.** Two figures sit under one
  heading only when their calls agree on the window, on every filter applied,
  and on the store argument. Nothing is summed, ratioed, ranked or differenced
  across results: a fourth number derived from three others is a definition,
  which is the same reason a workflow may not join its own steps
  (architecture rule 6). The heading comes from `meta.window` and the
  arguments the model passed — never parsed from prose.

  *Amended 2026-09-07:* one compared total is groupable like a bare figure,
  so net sales, transactions and ATP asked with the same `compare_to` sit
  abreast under one heading, each with its delta. A comparison of several
  subjects stays whole. A compared figure never groups with an uncompared
  one: its baseline window is on `filters_applied`, so the scopes differ.
  A single compared figure names its metric from `meta.metric_label`, never
  from prose.
- **A group shares one receipts line only when it provably shares one** — same
  table, same read, same filters. Otherwise each figure keeps its own, because
  one line over two sources names a source that produced half the screen.
- **The column is sized by the result, not by the question.** A chart and a
  table take the room; prose, a figure and a comparison keep a readable
  measure. No question text reaches the decision, there is no per-question
  rule, and below `md` nothing changes at all
  ([workspaceWidth.ts](frontend/src/components/george/workspaceWidth.ts)).
- **The mark gained `building` and `complete`, and still refuses `waiting`.**
  `building` is `answering` over results that have already landed WHOLE —
  a refused call and one the loop could not send entire are not counted, or
  the mark would claim to be assembling something out of nothing. `complete`
  is the `done` frame, held briefly and settling on its own; it is not busy,
  so the composer takes the next question immediately. "Waiting for the user"
  has no frame behind it, and an approval waiting is a fact about the QUEUE
  that stays the count beside Inbox (UI rule 5).

### The work surface

*Added 2026-09-09, Generative Workspace V3.* A piece of work is ONE object on
screen that refinements deepen and recompose; the posts underneath stay
separate, append-only, and are what a reload rebuilds it from. Recorded here
because each line is a decision the code cannot read back
([ops/GENERATIVE_WORKSPACE_V3.md](ops/GENERATIVE_WORKSPACE_V3.md) is the full
record, including the AG-UI / A2UI / CopilotKit evaluation — adapt the
concepts, adopt nothing).

- **Identity is not shape.** Business, window and population filters are the
  work's identity; comparison, grouping, metric and subjects are its shape.
  "Why?", "compare it with Rockwell" and "the products" change shape and stay
  on the surface; a different window or a disjoint subject ("And Magnolia?")
  starts new work. Subjects are related — same, expanded, narrowed,
  disjoint — never matched by equality
  ([surfaceAnchor.ts](frontend/src/components/george/surfaceAnchor.ts)).
  The reply link and the thread are still required; the question TEXT is
  never consulted.
- **The Surface Composer asks one question: the smallest surface that
  completely answers this.** Facts are deduplicated across the surface's
  steps, so a refinement's re-read of the figure it explains is not drawn
  twice and its drivers re-hang on the figure already on screen. Sections
  are ranked by role; context that reaches outside the anchor's subjects is
  FOLDED behind a line that names it, never dropped
  ([surfaceCompose.ts](frontend/src/components/george/surfaceCompose.ts)).
- **The plan is data the model cannot author.** `surfaceModel.ts` declares
  the closed vocabularies and `surfaceViolations` fails any plan carrying
  markup, a colour, a dimension, a component name, or a numeral the
  evidence does not carry. The model's channel into composition is still
  the finding frame and nothing else.
- **Attention is the data's or absent.** A subject is singled out only
  because it moved against the majority or the tool ranked it first under a
  change ranking it performed; `metrics.yaml surface.attention` records
  score, threshold and severity as `not_supported`. The attention line
  characterises rows and carries no number.
- **A UI event is a semantic instruction, not a scraped string.** `explain`,
  `break_down`, `compare_subject`, `focus_subject`, with values from trusted
  state, become a business-language question in one place
  ([surfaceEvents.ts](frontend/src/components/george/surfaceEvents.ts)).
  That seam is what voice will speak through.
- **George is told the same state the screen composes**, from the same
  facts: a line on the question naming the work the previous answer left —
  metrics, subject, window, comparison — built from CALLS and carrying no
  figure ([agent/surface.py](agent/surface.py)). It rides on the question,
  never in the cached prefix.
- **Prose is secondary once the figures are drawn.** The prompt's SURFACE
  section says so; tool and implementation vocabulary and transaction
  synonyms no definition establishes are recorded as gaps and warning frames
  — RECORDED, NOT CORRECTED, because rule 17's exception cannot be told
  from a leak mechanically. Rule 9's statement of enforcement is unchanged.

### The desk

*Added 2026-09-09, George Experience Reset, Phases 1 and 2.* One workspace:
the business laid out in front of a person, with George working on it. The
product is George; "desk" is the model's name in code and in these notes.
Recorded here because each line is a decision the code cannot read back
([ops/EXPERIENCE_RESET_V1.md](ops/EXPERIENCE_RESET_V1.md) is the full record).

- **Five regions, one dominant.** A shell line (the mark, the business and
  the narrowest subject in focus, the needs-you count, Running, Kept,
  History); a trail column (how we got here, George's reading, then the
  quiet rails); the workspace, which is the only region that transforms; an
  inspector that exists only while something is opened (receipts, a
  subject, a notice) and closes on Escape; and the line, where a person
  talks to George, which shows the context it will send and never grows
  into a column. Below `lg` the trail and the inspector become sheets and
  the workspace is the screen.
- **`/` is the business at rest.** The resting field is a deterministic
  replay of `metrics.yaml surface.desk.rest.reads` — one grouped read over a
  closed window against the period before it — with George's morning
  sentence above it and the composer's own attention rule on it. It is not
  a KPI dashboard: every object is a subject a person can focus, select and
  ask about, and nothing on it is a literal (UI rule 8). A piece of work has
  its own address, `/w/:threadId`, which a turn started at rest moves to
  once its posts exist, so a reload keeps the person in the work.
- **A grammar is derived, never chosen.** Which interaction grammar the
  workspace is in comes from the state of the work: read tools only is
  Investigate. Prepare, Build, Decide and Operate are named in
  `surface.desk.grammars_deferred` so they cannot arrive under other names.
  Within a grammar the composer decides composition, hierarchy, focus,
  representation, controls, what recedes and what is suppressed — from
  trusted rows and meta. The model reaches none of it: its channels are the
  finding frame and its prose, as before.
- **The field encodes only what rows carry.** Position is a change the tool
  computed (or a value it returned), size is a value, fill is the tool's own
  direction, a halo is the composer's attention or the person's selection.
  Seven stores on the two drivers of net sales is a field because it shows
  every store's driver mix at once, which bars cannot; a ranked list stays
  a ranked list where that reads better. Colour is never the only carrier:
  every object prints its figure, and the same rows are one control away as
  the conventional instrument. Every position and size is a ratio of two
  figures the tool returned, which is geometry and not a metric.
- **Direct manipulation never costs a model turn.** Select, focus, clear,
  back, change the window, sort, show as a list, inspect, restore a step of
  the trail: each is a change of view over rows already on screen, or a
  deterministic replay of calls already recorded. George is consulted for
  interpretation and for evidence the desk does not hold, and for nothing a
  click can do. `metrics.yaml surface.desk.direct_manipulation` is the list.
- **Selection is context.** The subjects selected or focused travel on the
  next question as ids and labels the rows carried (`desk.selection`), the
  loop names them to George beside the work sentence, and the question post
  keeps them in its payload. "Why?" with a store focused is enough; "Compare
  these" with three stores selected becomes one question naming the three.
  Continuity reads it too: a reply whose selection keeps a subject of the
  work above joins that work even when its own reads name a different one,
  which is how "compare that with Magnolia" stays one piece of work.
- **"Why?" deepens the object in front of the person.** When the desk already
  holds the focused subject's figures (a headline set grouped by store), the
  anatomy is drawn from those rows — the primary and its declared drivers —
  and George is asked to interpret, not to re-read. He reads only what the
  desk does not hold. Nothing is appended beneath; the workspace transforms
  and the reading is replaced, with the earlier reading kept behind a line
  that names it.
- **A window change is a replay, and a replay is transient.** The same
  calls, one scope argument changed, through the validation a pin passes
  (`POST /george/replay`, read tools only, at most eight) and the runner a
  tile uses. Its figures carry their own receipts and read time. It is not
  stored: the record of a window change is the next thing George is asked,
  which carries the window in `desk.window`. A comparison needs a closed
  window, so a partial preset is offered only where the work is uncompared
  — the refusal is the tool's own, drawn as a refusal.
- **Presence is where George is reading.** A soft light under the objects a
  running call names, from `tool_call` frames and nothing else, in the ink
  and never in the approvals colour. No orb, no avatar, no idle animation
  on the field. The mark keeps its tested states.
- **History is a drawer, not the surface.** The river is unchanged as
  storage, provenance, reconstruction and audit. The drawer lists work,
  briefs, runs and approvals by time; opening one rebuilds the workspace
  from its posts, exactly as a reload does. Nothing on the client is a
  source of truth: no `localStorage`, no route state that must survive.
- **Motion says what happened.** A focused object moves to the centre and
  the rest recede; a comparison enters beside the focus; deeper evidence
  grows from the object it explains; a reading fades in under the figures.
  Nothing plays without a frame or a click behind it, and under
  `prefers-reduced-motion` every transition collapses to a crossfade or
  nothing, with the interaction model unchanged.
- **Two rules that did not move.** The accent still means "needs you" and
  nothing else: the mark, the count in the sidebar, and the Needs-you rail
  with its one Promote. A notice still sits above the figure it qualifies,
  whole, wherever it would change what the figure means.

*Refined 2026-09-09, after the human dogfood.* The workspace behaved like a
workspace and still did not feel like George: the explanation sat in the left
rail away from the figures it explained, a spatial field was drawn whether or
not position said anything, technical diagnostics took the most prominent place
on the screen, and George waited to be asked. Seven decisions, each recorded
because the code cannot say why
([ops/EXPERIENCE_RESET_V1.md](ops/EXPERIENCE_RESET_V1.md) carries the full
record).

- **The left column is navigation, and holds nothing that belongs in the
  work.** George, the business, then the states of his environment — Home,
  Needs you, Running, Kept, History — and Operations at its foot. It held
  George's reading before, which put the explanation in the one place a
  reader's eye does not go AND left the persistent navigation a workspace
  needs with nowhere to live. A test forbids prose, receipts, a summary and a
  recommendation from that column, because all four drifted there once.
- **One answer, not a picture with a caption.** The workspace composes the
  caveat, the figure, George's reading, the drivers, the visual, what the data
  singles out, his suggested next move and the few other moves as ONE object
  in one reading order. The reading sits between the figure and the drivers it
  is about, so the words and the figures explain each other rather than
  occupying different parts of the screen.
- **The reading carries no numeral, and that is what lets the composer write
  it.** "Transactions rose while average transaction value fell, and
  transactions moved more — it carried the rise" is a characterisation of
  rows, the same warrant the attention line has had since V3. The figures are
  an inch away; repeating them in prose is the failure the surface rules
  already name. George's own words are drawn beneath, lead sentence first,
  the rest behind a disclosure — brief, and never a column.
- **The conventional drawing wins by default.** `ranked` is the default
  representation and a plane must EARN its second axis: it is used only when
  the two driver changes disagree across subjects, which is the structural
  test of whether the subjects fall into more than one quadrant. Every subject
  in one quadrant means both drivers moved the same way for everyone, and a
  ranked list says exactly that in one dimension with its labels intact.
  Generative UI means George chooses the representation that communicates
  fastest, optimising for comprehension, relevance, continuity, interaction
  and expression in that order. Novelty is not on the list.
- **A drawing a person has to be taught carries the teaching.** One line,
  attached to it, always visible, saying what each axis means, what size means
  and what a click does — a control nobody knows about is a control that does
  not exist. A conventional drawing gets nothing, because a caption on a bar
  chart is noise. If a representation needs more than a line every time, it is
  the wrong representation.
- **A caveat is drawn by what it COSTS the reader, not by what kind of thing
  it is.** Three levels: answer-limiting takes attention and says what still
  stands; relevant is one line in business words beside the answer ("56
  products are new this week, so they are left out of the growth
  comparison"); non-material is one quiet mark with the detail in the
  inspector. No raw diagnostic ever reaches the answer — a scan holds
  `baseline_status`, `no_baseline`, `no_current`, `zero_baseline`, `NULL` and
  `row_count` out of it — and the tool's own sentence survives whole
  underneath. UI rule 4 is unchanged: this is its 2026-09-05 amendment,
  surfacing without spelling out, applied to a comparison.
- **The work trail is states, not messages.** "The business → What's going on
  with the stores? → Why? → Products", above the work, each step a question
  and the desk it was asked from — both of which are on the question's own
  post, so a step is server truth and clicking one recomposes the workspace at
  that state. The one step that is not stored is the one being made now: it is
  marked current, and it becomes server truth the moment anything is asked.
  Nothing scrolls to an old message and no answer is repeated.
- **George has initiative, and it is grounded or absent.** He explains what
  the figures mean, recommends ONE next move, and asks when the business
  intent genuinely changes what to read next. Explain and recommend are
  DERIVED from trusted rows and the definitions' own ladder — a recommendation
  is produced only by one of four facts a tool established (the declared
  drivers went opposite ways, a subject moved against the rest, the tool's
  ranking put something first, a breakdown exists that nobody has read), it
  names that evidence, and it carries the action that performs it. There is no
  path from an empty screen to a suggestion. Asking is the model's and is held
  by the prompt, not by a mechanism, and `initiative.ask.enforced_by: prompt`
  says so rather than pretending otherwise.
- **Whether a breakdown EXISTS is the definitions' question, and the server
  answers it.** Net sales is transaction grain and refuses a product grouping,
  while the investigation ladder localizes by product through product revenue
  — so a client reading the headline metric's own `valid_group_by` would never
  offer the one move the ladder is built around. `breakdown_dimensions` on the
  desk definitions is computed from `metrics.yaml` and served.

*Understood 2026-09-09, after the second human dogfood.* The workspace was
coherent and still felt like a chatbot with charts: a broad question came back
with one figure, the screen went empty the moment anybody asked anything, a
follow-up after a reload had no memory of what it was following up, and George
waited to be told where to look. Nine decisions, each recorded because the code
cannot say why. The full record is
[ops/EXPERIENCE_RESET_V1.md](ops/EXPERIENCE_RESET_V1.md) section 6c.

- **The desk OPENS the thread it is on, and that is what gives George a
  memory.** `useGeorgeStream` sends the history it holds and it holds nothing
  until a thread is opened into it. Nothing in the desk ever called `open`, so
  after any reload a question travelled with an empty history, no `thread_id`
  and — because the hook drops a parent when it has no thread — no
  `parent_id`. Every follow-up silently began a NEW thread. Inside one
  unbroken session it worked, because the first turn's own frame set the
  thread, and that is exactly why it failed "sometimes". Both reads it needed
  already existed and were already documented as existing for this purpose:
  the river's thread read is what is SHOWN, the chats read is what George is
  TOLD, and `threadHistory` merges them.
- **How much George READS is decided by scope; how much he SHOWS is decided by
  what the figures establish.** These are two dials and both used to be set to
  narrow. "THE SMALLEST SURFACE THAT COMPLETELY ANSWERS THE QUESTION" governed
  every message including "how are we doing?", and it is why a broad intent
  came back with a single number. It is replaced by
  `investigation.scope`: a BROAD message is investigated without asking where
  to look — the headline set grouped by store, one grouped call per metric,
  then one localization on whichever driver moved more; a FOCUSED one is not
  widened because it could be; an AMBIGUOUS one is resolved from the
  workspace before anybody is asked anything. **Clarification is not the
  default**: a question that could have been answered from the screen is a
  question that should not have been asked.
- **A message is not always a question.** The prompt described questions and
  answers and nothing else, so an observation was answered as though it had
  been asked. `investigation.message_kinds` names the five other things a
  person sends — intent, instruction, observation, correction, steering — and
  an observation is a PREMISE, verified before it is used, exactly as the
  ladder verifies one.
- **The workspace never blanks, and it FORMS.** Asking at rest made the live
  turn the work in focus before it had read anything; a surface with no
  evidence composes to `statement`, which drew nothing, and the resting
  figures went with it. So work with no evidence yet does not replace what is
  on screen. Nothing new was built for the forming: `composeDesk` is pure over
  whatever results exist and a live turn accumulates them frame by frame, so
  the workspace already assembled itself as reads landed — the empty case was
  simply winning first.
- **The instruction appears before the request opens.** `ask` appends the user
  turn synchronously, so it is available on the very next render. Until now
  nothing drew it and the only acknowledgement was a truncated line above the
  composer, which is why a submitted question could not be told from one that
  never sent.
- **Watching George work is two clauses of business language, not a log.**
  What he has read and what he is reading, both through the vocabulary the
  mark's narration already used (`cognition.describeCall`), which derives from
  the arguments the loop actually dispatched. No plan, no stage, no checklist:
  there is no such thing on the wire and inventing one would narrate work that
  is not happening. The reads themselves are already visible — they become the
  workspace.
- **A finding is the unit of a broad answer, and it is not a second primary
  fact.** `plan.attention` was already plural, per-subject and tool-derived,
  and `attentionWords` joined the whole of it into one run-on sentence under
  one hero chart: ten discoveries arrived and one line went out. Unflattened,
  each is a subject, the fact a tool established about it, that subject's own
  figures and the one move that investigates it. They are several readings of
  the SAME grouped read, which is why **the one-primary rule in
  `agent/findings.py` is untouched** and must stay so. There is no score, no
  rating and no composite anywhere in them; order is by which KIND of fact,
  never by magnitude, so no ranking is invented on top of the tool's own.
- **The workspace tells George what it is showing, and it is all names.**
  `desk_sentence` returned nothing unless something was selected, so a
  question asked from a full screen said nothing about what the person was
  looking at — and "show me", "is that actually bad?" and "what would you do?"
  had no referent at all. It now carries what is DRAWN, what the rows singled
  out and the move already offered, each checked against a vocabulary in
  `metrics.yaml` before it is repeated (`surface.desk.context`). **Nothing on
  that channel is a figure**, and George still reads every number from a tool
  result.
- **The acknowledgement lives at the composer, because the answer scrolls and
  the composer does not.** Drawing the instruction at the head of the answer
  region was correct in principle and invisible in practice: after reading one
  answer a person has scrolled, so the next question was acknowledged above
  the fold. Scrolling them back was declined — the workspace transforms in
  place and moves nobody's viewport, which is a rule with its own test. What
  you said, what George is reading, and any failure now sit directly above the
  box you typed into.
- **The work can be put down, and putting it down deletes nothing.** A trail
  four or five steps long stops being orientation and becomes clutter, and
  there was no way back to a clean desk except reloading. Clear ends the piece
  of work — the stream resets so the next question starts its own thread, and
  the address returns to the business at rest, which drops the focus, the
  selection, the window and the trail because all four are derived from the
  work in focus. It writes nothing to the river, every step stays in History,
  and the control says so; that is what makes it one click with no
  confirmation, because there is nothing to lose.
- **A group total is a READ, not a sum.** Found in the first live dogfood of
  the broad policy: a store-grouped read returns one row per shop and no
  total, and George answered "across the group" with a figure he had added up.
  A calculation in prose has no receipt (architecture rule 9). `group_by: []`
  is how the estate's own total is read, and it is the only way that figure
  may be stated.
- **Which metrics break down by which subject is STATED, not discovered by
  refusal.** One `group_by` enum cannot depend on another argument's value, so
  the schema offers the union of every metric's `valid_group_by` — George was
  offered `product` for net sales and then refused for it, and the ladder's
  central move looked unavailable until a call had already failed. The matrix
  is now a sentence built from the same entry `agent/findings.py` validates
  against, so he cannot be told one thing and held to another.
- **A window label never sits over figures read for another window.** The
  ribbon moved on the click and the replay followed, so between them the chip
  said one window over another window's numbers — and a failed replay left it
  there. The state now moves only when the rows arrive, the pending window is
  drawn as pending, and the line says the figures below are still the earlier
  window's.
- **A legible drawing beats an interesting one.** Labels were placed at a
  fixed offset with only a left/right flip, so subjects sitting close together
  — on a plane, exactly the interesting case — printed their names on top of
  each other. Labels are nudged apart with a leader line, the OBJECT never
  moves because its position is the measurement, and where nudging cannot
  separate them inside the plot the field falls back to the ranked list, which
  cannot overlap at all.
- **One environment has one set of names.** Home, Needs you, Running and Kept
  were typed in the desk's sidebar and typed again — as Desk, Inbox,
  Workflows and Pages — in the shell's rail, so leaving the desk renamed every
  destination. Both render `shellNav.PRIMARY` now, and a count is attached by
  PATH rather than by label so renaming a word cannot move a number onto the
  wrong entry.

### These rules are already backed by the tool contract

Rules 3, 4 and 6 are not aspirations the frontend has to invent — every tool
already returns what they need, on every call (see architecture rule 2):

| UI rule | Comes from |
|---|---|
| Every number is inspectable | `meta.source_table`, `meta.filters_applied` — each filter cites the `metrics.yaml` key that defines it |
| Notices always surface | `meta.notice` — `{kind, message, source}`; `agent/loop.py` refuses to finish an answer while one is unsurfaced |
| No number without a timestamp | `meta.snapshot_timestamp` — when the data was actually read, not when the tile rendered |

A tile that cannot show these is not missing data; it is discarding data the
tool already handed it. Design the tile around the receipts, not the number.

## 2026-09-12 — The first deploy in five days, and why it crashlooped

Pushing `main` took production down, and the cause was already there. The
database was at `r2s3t4u5v6w7` (`george.beliefs`, 2026-09-10) — **ahead** of the
build serving since 2026-09-07, which had never heard of that revision.
`schema_check` runs at startup only, so the old container kept serving and
**any** restart since 09-10 would have crashlooped. The push was the restart.

So a rollback would NOT have restored service: the old build hits the same check
by the AHEAD branch. The only way up was forward.

**`AUTO_MIGRATE_ON_START` is false in Railway**, overriding the `True` in
`config.py`. `alembic/env.py` uses the same `settings.DATABASE_URL` as the app,
so this was never a URL mismatch — the migration simply never ran, and the same
thing will happen on the next deploy. Card P0.4.

Four migrations were applied by hand from a local checkout, additive and in one
transaction; the database is at `v6w7x8y9z0a1`, the revision the code expects.
The service still needs a restart: its replica had spent all ten retries.

## 2026-09-12 — George is a page in Supabot BI again

The owner, looking at the deployed app: *"what happened to the other pages of
my supabot bi? this is still supabot, just make george a page."*

Nothing had been deleted. Dashboard, Analytics, AI Chat, Warehouse, Packing,
Settings and Admin were all still routed, still in `role_page_access`, still
rendered by the legacy chrome with their own nav. What had happened is that
the Experience Reset (2026-09-09) made `/` RENDER the room rather than
redirect, and George first in `PAGES` — so `landingPathFor` sent everyone with
George into George, and the room's rail links only to George's own screens.
Every other page was reachable from nowhere a person actually stood.

So the reversal is narrow and it is the owner's call: `/` is a redirect again,
Dashboard leads `PAGES`, George has its own path at `/george`, and the rail
carries a link back to Supabot. The room keeps its full-bleed surface rather
than rendering inside the legacy chrome — it is `100dvh` with a fixed rail, and
nesting it would mean CSS surgery on the one surface that currently works.
Being a page is about being reachable and leavable, not about being in a
frame.

**The rule this leaves behind: a surface you cannot leave is not a page.**
If George is ever made the landing again, that is the reason not to.

Also corrected here: the previous entry claimed the `/api/v1` rewrite existed
only in the Vercel dashboard. It does not — `frontend/middleware.ts` performs
it, `frontend/routing/backend.ts` holds the Railway origin and fails closed on
a preview without staging config, and `routing.test.ts` covers both.
`VERCEL_ENV_SETUP.md` and a comment in `useGeorgeStream.ts` say it is in
`vercel.json`; those two are stale, and the claim I wrote from them was wrong.
Railway itself is healthy: schema `v6w7x8y9z0a1`, code and database agreeing.

## 2026-09-12 — The answer disappeared, and the plan had it filed under speed

The owner, on the deployed build: *"it doesn't even function right — I sent
'how are we doing', stuff came out but it just disappeared."*

**Cause.** `agent/loop.py` emitted `answer_reset(interim_prose)` whenever an
iteration produced text AND any `tool_use`. `compose` is a `tool_use`. The
client's handler for that reason moves the written text into the activity
disclosure and sets `t.text = ''` — deliberately, and without the `superseded`
protection the other reset reasons get, because narration is not meant to
reappear. So every time George arranged the board, the sentence he had just
written was taken off the screen. He composes two to four times in a typical
answer, and `compose` is refused in 8 of the 12 eval questions, each refusal
costing another call. When the final compose landed few blocks, there was
nothing left on screen at all — the board's empty-composition fallback only
fires when NOTHING composed, not when little did.

**Fix.** The reset now fires only when a READ is in the batch. The rule it was
written for is untouched: "Rockwell is down; let me look at the drivers" before
a read is a preamble to work not yet done. A label call reads nothing and
discovers nothing, so prose beside it is the answer. Four cases hold it,
including the exact shape reported (compose, refused, composed again) and the
original guarantee.

**What this says about the plan, which matters more than the bug.** This fix
was already in the plan — as item (c) of a card called "compose stops
round-tripping", filed under Phase 1, *make the one surface fast*. It was
never a speed problem. The plan measured latency and assumed correctness, and
the owner found the defect before the plan would have. Phase 1 is reordered:
**make it work, then make it fast**, the daily dogfood log drives the order,
and no speed card starts while a reported defect is open.

## 2026-09-13 — George is a tab on the main page

The owner: *"can you put george just in the tabs of the main page."* This
finishes the reversal begun yesterday. Yesterday George got its own path and a
link back, but still opened a full-bleed surface with its own fixed rail —
reachable and leavable, yet plainly a second app. It is now drawn inside the
Supabot chrome like Dashboard or Warehouse.

**George owns tabs, which is the app's existing pattern.** Dashboard owns
Stores and Vending; Warehouse owns Replenishment and Barcodes; George owns
Board, Needs you, Kept and Running. Each keeps its own URL, so links,
bookmarks and the back button work. `Rail.tsx` became `GeorgeTabs.tsx`: a
horizontal strip, not a fixed left rail, because a second vertical rail beside
the app's own sidebar is chrome inside chrome.

**Running (`/workflows`) joins the strip.** It was routed but reachable only
from a single link inside Inbox, which is not navigation.

**Two layout facts the CSS could not say.** The room stood on a `100dvh`
floor because it used to own the screen; inside a content area that added a
blank screen under every short answer, so it is `min-height: 100%` now. And
the composer is the one thing fixed to the VIEWPORT rather than laid out in
the page — it escapes the chrome's `lg:ml-64` and carried a 56px offset for
the rail that is gone. A fixed element cannot inherit that offset, so the
chrome states it: Layout puts `chrome-sidebar-open` on the same div it puts
`lg:ml-64` on, and a descendant selector reaches a fixed child regardless of
positioning context. The breakpoint in `room.css` mirrors `lg` exactly.

The accent allowlist keeps its four entries; `Rail.tsx` is replaced in it by
`GeorgeTabs.tsx`, carrying the same needs-you count for the same reason.

## 2026-09-13 — George takes the whole screen, and the rail is the way back

The owner, after using the tabbed version: *"when you open george in supabot
tab it should cover the whole screen, no more supabot, but there should be a
back button on sidebar."*

So `d44249c` is reverted. George opens from the Supabot sidebar and then
replaces it: full-bleed, its own rail, no chrome behind it. **What survives
from the reverted commit is the part that was right** — Running joins the rail,
because it was routed and reachable only from one link inside Inbox, so a
person who had never opened an approval could not find it at all.

**The back arrow is the rail's FIRST item.** Yesterday it sat second, under
the mark, when the chrome was still drawn behind George and the arrow was a
convenience. It is now the only way out of a surface that covers the screen,
and it goes where a person looks for a way back.

**Why the tabbed version was wrong, recorded so it is not retried by
accident.** Putting George in the chrome meant two vertical rails side by
side, and a board that wants the width of the screen squeezed into a content
column. "A page in the app" and "a surface that owns the screen" are both
legitimate, and the deciding fact is the board: it is the product, and it
needs the room. The rule from 09-12 is unchanged and is what makes this safe
— **a surface you cannot leave is not a page** — so the back arrow is not
decoration, it is the condition on which full-screen is allowed.

Kept from the tab work and now dead: nothing. `chrome-sidebar-open` went with
the revert, since the composer no longer sits inside an offset chrome.

## 2026-09-13 — The bill, and the one optimisation that is refused

The owner: *"is optimising api usage also part of the plan like caching etc?
cause it costs a lot."* It was not, and the reason it was not is the same
reason turn time was not: nobody had looked.

`agent/loop.py` has written `input_tokens`, `output_tokens`,
`cache_read_tokens` and `cache_creation_tokens` to `george.conversations`
since the first commit. Nothing had ever read them. `ops/cost_report.py` now
does, and the first run over 30 days says: **193 turns, $44.64, $0.2313 a
turn, 26.2% cache hit rate**, with **76% of the bill in uncached input**.
Caching exists and is saving 20%.

**The likely cause is one word in a comment.** The three breakpoints are
placed correctly — tools, system, and a moving one on the message tail — and
the comment beside them reads "Both TTLs are the default 5m". The stable
prefix is ~9,200 tokens and this usage is bursty, so it expires between
sessions and is rebuilt at full price on most turns. A 1-hour TTL is a
one-line change per breakpoint.

**The distinction that decides which levers are allowed, and it is the real
content of this entry.** *Trustworthiness* is structural: figures come from
tools, notices surface, refusals refuse, held by the loop and the
definitions. No amount of caching or batching can make George invent a
figure. *Reasoning quality* is not structural — it depends on what he can see
and how hard he thinks. So:

- The TTL is **free**. A cache hit and a miss present byte-identical input;
  it changes the bill and cannot change an answer.
- Fewer iterations (P1.a/P1.b) removes round trips spent LABELLING, not
  database reads. Same evidence, fewer trips.
- Effort per turn could genuinely dull him, which is why P1.c already fails
  if a quality check regresses.
- **Cutting `MAX_ROWS_TO_MODEL` from 200 is REFUSED.** It was on my own list
  and came off the same day. It is the only lever that reduces what George
  can SEE, so more answers would land as "this is a sample" instead of a
  reading. Truncation is honest and `meta` aggregates are never truncated —
  that makes it safe, not worth doing. **A lever that only costs money is
  free; a lever that narrows what he reads is the product.**
- Model cascades are refused too: caches are model-scoped, so routing cheap
  turns elsewhere forfeits cache reuse and usually costs more.

At 193 turns a month $45 is nothing. 23 cents a question is the problem,
because it does not survive real use.

## 2026-09-13 · P0.6 — the bill, and the number that measured a dead build

- The 26.2% hit rate P0.6 was written on came from a 30-day window that mostly
  predates `e067ba7` (2026-09-05, the message-tail breakpoint): 90 of 138
  billed turns are one scripted sweep on a build that no longer exists, and
  they carry 85% of the uncached tokens. Since `e067ba7`: 6 turns, **58**
  uncached tokens, **87.3%**. The target was met before the card was written.
- **Rule: a cost or latency number is read per build, not per window.** Added
  `--since` to `ops/cost_report.py`, and said in the report that `--ttl`
  reprices history and cannot move a measured hit rate.
- TTL raised to 1h on the static prefix anyway, as insurance — but on the
  evidence it is worth cents: every gap on this build is under 5 minutes or
  over 7 hours, and the 5–60 minute band it covers has zero turns in it. The
  tail stays 5m; mixed TTLs need longer-before-shorter. 9 cases hold it, where
  nothing had ever asserted `cache_control`.
- The tools array is four arrays, not one — `view_page` enters per QUESTION —
  and the breakpoint sits past the 17-tool shared block. Free to fix, not done.
- **Cost per turn is $0.39 on this build at 6.0 iterations, not the $0.23
  headline. The bill is round trips.** P1.a/P1.b are the cost cards.

## 2026-09-13 · the dogfood fix — imprecision was the way past the figure gate

- "800 grams-worth" over a row drawn as 801. The loop already rewrote an answer
  that quoted a drawn figure EXACTLY (`restated_sentences`, matched at the
  precision written), so quoting it WRONG tripped nothing and shipped. The
  further off George was, the safer he was from the guard.
- `agent/prose.py` gains `misstated_figures`: a prose numeral that is a drawn
  figure rounded off, bounded by how many of that figure's own digits survive
  (`voice.misstatement.min_significant_digits`, 2). Shares the restatement
  gate's single corrective turn — no new round trip — and records kind
  twenty-one, `misstated_figure`. 20 cases, 7 through the real loop.
- **Rule 9's line is intact**: it only ever asks about figures the board DRAWS.
  Whether a figure absent from the board came from a tool stays an eval.
- The catalogue guarantee was weaker than NOW.md claimed: the contract test
  scanned string literals, and a yaml-sourced kind reaches `log.gap` as a
  VARIABLE. `restated_figure` was held by a hand-written test of its own and
  kind twenty-one would have had none. Now the class is held, not each member.
- **The twelve are a sample.** 12/12, 11/12, 10/12, 11/12 over four runs; every
  non-trust failure is `leads_with_reading`, and the trust properties never
  moved. Do not report a style score off one run.

## 2026-09-13 — How often the twelve actually need to run

The owner: *"how many times do we really need to run the 12 question eval
cause i have to pay for it using my api."*

**A full run is ~$5–7** — 61–75 iterations at the production per-iteration
rate — and seven runs were already on disk, comparable to a month of real
traffic. **None of it appears in `ops/cost_report.py`**, because the harness
stubs `ConversationLog` and an eval turn never reaches `george.conversations`.
So the harness now keeps the `usage` the done frame was already carrying, and
prints the run's cost on stdout. The report's top level changed from a bare
list to `{"spend", "cases"}`; nothing in the repository parses it, and the
seven older files are still lists.

**The rule, in `NOW.md` 2b: the default is DON'T.** Docs, ops, tests,
frontend, routing, deploys and anything to do with caching cannot move model
behaviour, so a run buys nothing. Prompt text, tool descriptions, effort,
iteration structure and `compose` validation can, so they need one. And when
one is needed, run three or four that exercise the changed path while
iterating, and the full twelve **once** at the gate.

**A card may not ask for a run it does not need.** My own P0.6 draft said
"report the standing trust gate", which would have spent $6 proving that a
cache lifetime does not change an answer — it cannot, because the model gets
the same bytes either way.

**And a correction I owe this entry.** I recommended the TTL change off a
26.2% hit rate measured over a rolling 30-day window. The window spanned
`e067ba7`, which added the message-tail breakpoint on 09-05, so it averaged
two different builds into a number describing neither. The P0.6 session split
it: **87.3% on the current build**, target already met, and the TTL is worth
cents or less. The lesson is the one `--since` now exists for — a rolling
window across a behavioural change measures nothing.

---

## 2026-09-13 · P1.a — where a refusal earns its round trip

**The card guessed wrong about what was being refused, and the measurement
said so.** It named a second `lead`, a stray field on a `change` and a no-op
`change`; four recorded runs of the twelve contain **one** of those between
them. The real 46: a figure with no subject over a one-row read (15), a spec
node spelling the discriminator `type`/`kind`/`node` while carrying the
grammar's own words as the value (11), a comparison with no subjects (5).
Build the card's list, but measure before believing its reasons.

**The line, in one sentence, and it is the thing to hold:** a coercion may
change which WORD holds a value; it may never change which value is drawn, or
introduce one. A rename is a coercion. A demotion is a coercion. Choosing
which of seven rows a figure draws is not, and is still refused.

**`filters_applied` is evidence, not an argument.** A read scoped to Rockwell
is about Rockwell even when the grouping left no column carrying the word.
Refusing that sent George to re-read an identical figure grouped by store so
the word would appear in a cell — four iterations for a label the tool had
already declared in `meta`.

**One coercion came back off the list**, and this is the precedent: dropping a
block's stray `value`/`colour`/`title` and drawing the rest buys no round trip
(the schema is `additionalProperties: false`; zero occurrences in four runs)
and blunts the boundary the file exists for. A coercion that saves nothing and
costs a guarantee is a bad trade in one direction only.

**Two of three targets were missed and the card is still closed.** Label share
33% against 25%, iterations 4.0 against 2.5. The residue is one `compose` a
turn — so the rest is READS, which is P1.c and P1.d's work, not more
squeezing here. Say the shortfall.

**A failing check was not widened to pass.** `cannot` refused in plain English
and failed on a contraction (`There's no` vs the definitions' `there is no`)
and a verb `_LIMITATION` does not list. Fitting the measure to the result is
what P0.2 deleted 91 assertions for; the phrase list is the owner's to move.


## 2026-09-13 — The bill reconciled against the console, and two wrong calls

The owner filtered the Anthropic console by the `george` API key: **51.6M
tokens in over 30 days**, against the 9.4M `ops/cost_report.py` reports from
`george.conversations`. **The script sees 18% of the traffic.** Every eval
turn is missing, because `tests/evals/harness.py` stubs `ConversationLog`, and
so are retries and turns that died before writing.

**Two conclusions I drew from that 18% were wrong, both stated confidently.**

  1. *"Cache hit rate is 26.2%, raise the TTL."* The window spanned `e067ba7`,
     which added the message-tail breakpoint, so it averaged two builds into a
     number describing neither. P0.6 split it: the live build was at 87.3% and
     the target was met eight days earlier.
  2. *"76% of the bill is uncached input."* The console's token-type breakdown
     for 2026-09-13 ($18.20 in one day) is cache WRITES 44%, reads 32%, output
     23%, uncached input **effectively zero**. The opposite of what I said.

**What the console actually shows, and it closes caching as a topic.** 9.5
cached tokens read per token written; the same day uncached would have been
$69 instead of $18, a 74% saving. **Caching is working. Do not reopen the TTL
or chase the hit rate.**

**And the real finding: the bill is the building, not the product.** 13.2M
tokens on 2026-09-13 — about six full eval runs plus the turns sessions fired
while working — against **193 real turns in the entire month**. At that rate
it is $546/month, and almost none of it is anyone using George. The levers, in
order: run the twelve far less (2b), then P1.b and P1.c, which cut writes,
reads and output together because every iteration writes a new tail and
generates thinking.

`cost_report.py` now says all of this in its own output. A report that reads
like the whole truth while showing a fifth of it is worse than no report —
that is how both wrong calls got made.

## 2026-09-13 — The 26 reviewed against the market, and the split that explains five rebuilds

The owner: *"is this what your research brought you was the best way to go
for what i want? ... do a full research too on functions and basically
everything cause i dont even know if my ideas are good."*

**They are.** Twenty-one of the twenty-six are supported by products people
pay for; sixteen of those are built here. The category he named — an AI
operating system for a business — is where the whole industry moved in 2026
(Salesforce, ServiceNow, Make all repositioned onto "agentic OS"); he is
building the version for a business his size, which none of them are. Full
review: https://claude.ai/code/artifact/1cb5dffa-972c-4988-8f20-7f745be88bd8 ("The 26, Reviewed").

**The finding that reorganises the plan: the 26 describe TWO kinds of screen,
and one surface kept trying to be both.**

  - *Answering* — "how are we doing", "why", "compare", "products". One
    question, one finding, its evidence, what next. Transforms predictably.
    Short-lived.
  - *Operating* — a purchasing system, the approval queue, a kept page, a
    thing George built. Many objects and controls, arranged and STABLE. Does
    not recompose when you ask something. Long-lived.

Hex is built exactly this way (Threads for conversation; Notebooks and Apps
for the thing you operate; a bridge between). The generative-UI field's
production lesson says the same from the other side: *"users need to
understand why the interface changed; if it feels arbitrary, it feels
broken."* A board that recomposes on every question is arbitrary by design.
That sentence explains all five rebuilds.

**So the finding redesign (13 Sep) was right for the complaint and incomplete
for the vision.** It is the answering surface. It is the wrong shape for a
purchasing system or a page, and the operating surface — pages, inbox,
workflows, already half-built — is its own thing, not pinned answers. "Keep
this" is the bridge.

**Feature 4, expressive/tactile/spatial visualisation, is DROPPED.** It is the
one feature the evidence contradicts: tactile-chart research is for blind and
low-vision readers; spatial encodings add cognitive load for value lookup
versus a table; and "i dont really know what im looking at" is what novelty
costs. Explanatory visualisation wins by restraint.

**Feature 1 is narrowed to what is validated:** a fixed catalogue of marks
chosen by what the claim asserts, drawn one way. The binding stays; free
arrangement goes.

**Three warnings from the market, now standing rules:** proactive systems die
of noise (3% of alerts warrant attention — silence-by-default is not to be
loosened); an interface that changes for no visible reason reads as broken;
built-by-AI systems rot without governance, and the promotion gate is the
part to protect as "build it" gets more capable.

**Features 8, 23, 24, 25 are a third of the standard and are blocked on
sources only the owner can supply.** Start them now, in parallel.

## 2026-09-13 — Copy what works: ten patterns borrowed from named products

Artifact: **George, Borrowed** —
https://claude.ai/code/artifact/bdf022de-6279-4e48-8422-d3c078d95810

The owner asked for the design to borrow directly from products that already
solved parts of this, not to be derived from principle alone. Ten patterns,
each drawn as it appears in its source and again in George, with the
features it serves and the one build change it implies:

1. Hex Threads (verified from docs): one object, three views (Agent /
   Notebook / App), "Unlisted → Save as project", cell refs jump to the
   logic. → a thread is already a page: Talk · Behind it · Page, "unkept →
   Keep as page"; Behind it is reads with receipts, never code.
2. ThoughtSpot: the interpreted question as editable tokens; coaching. →
   "Read as" tokens under every ask; a token tap is a replay through
   `POST /george/replay`, no model call. This is P1's 50%-no-model lever
   with a face.
3. Perplexity: sources above the answer, steps behind one plain line. →
   one derived line above the claim: reads, tools, time, caveat count.
4. Manus / Devin: a live step list with a result per step, replay when
   done. → the Working line becomes the ladder's rungs as they happen, each
   tappable, with duration_ms; no planner (rule 5); replay = stored calls
   in order.
5. Canvas / Artifacts / v0: the built thing stays pinned and each turn
   revises it, with version arrows. → shared subject = one pinned object
   with versions, finding column narrows; no shared subject = clear.
6. Cursor / GitHub: a change is a diff you accept. → every proposed write
   (save_workflow, edit_page, standing question) renders as before/after of
   arguments; Keep makes a version; Promote stays in Needs you.
7. Linear Triage: nothing enters until accepted; snooze; per-kind verbs;
   keyboard. → Needs you gains Later and per-kind actions; j/k/e.
8. Things 3 / Superhuman: Today is a list that ends. → three groups
   (George found, Due today, You added) and an end line rendered only from
   a loaded empty result (UI rule 8).
9. Stripe / Mercury home: few figures, sparkline + delta, feed under, every
   figure opens a detail. → a pin draws a sparkline only when the tool gave
   a series; a page keeps its own river; tap = object in ~1s.
10. Hex @ data source / Linear @: → composer @ resolves shops, suppliers,
    products, pages to ids that land in tool arguments.

**Six things deliberately not copied,** each against a rule already written:
Liveboard/Power BI tile grids (the KPI feeling), Manus's second column
(rule 7), Hex's SQL cells (rule 1), Devin's editable plan (rule 5),
Perplexity's generic Related chips (cost), Cursor's accept-all (rule 7 on
promotion).

**Order of adoption:** 3 and 4 are free (frames already carry the data);
2 is P1.b/replay wearing a face; 1, 5, 6, 7, 8, 9, 10 wait for Phase 2.
None of it changes the two-modes split or the finding design.

## 2026-09-13 — Borrowed II: how data is drawn, text written, suggestions offered

Artifact: **George, Borrowed II** — see `ops/NOW.md` §6 for the link.

Fourteen more borrowings, this time for the content inside the finding.
The sources are news graphics desks, health apps and writing tools, not
the AI chat products, which mostly get this wrong.

Data (11–18): the chart's title is the claim and the subtitle is the
measure (FT/Economist); a source line under every chart, not only under
the finding (Datawrapper); drivers as contributor bars with no shares
(Oura/Whoop); "usual" as a baseline, drawn as a band with today's marker
(Google Maps popular times, Google Flights) — REQUIRES a `usual_weekday`
comparison defined in metrics.yaml first; previous period as a dotted
line on one axis (Stripe/Vercel); colour is direction only and digits
are mono tabular (Bloomberg) — extend the accent scan to the four data
colours; bars inside table cells for ranked results (Hex/Notion); one
sentence + one small chart as the unit of evidence (Apple Health
Highlights).

Text (19–21): three fixed slots — claim, caveat, next — with "next" always
one sentence and always last (Axios Smart Brevity); a read-index marker
after every figure in prose, derived by matching numerals to rows, so an
unmatched numeral is visibly marker-less (Perplexity citations); two
voices told apart by type — serif is George's reading, mono is derived
from frames or rows — as a tested rule, no sparkle badge ever (Gmail
Smart Compose / GitHub Copilot labels, inverted).

Suggestions (22–24): a provisional dashed frame with Keep / Discard /
Try again / Not what I meant for every unkept thing (Notion AI); ghost
text completing the question, built deterministically from the board's
rows and offering only replays and object opens, Tab accepts (Copilot,
Gmail); a suggestion carries its reason and sits on the row it's about
(Netflix "Because you watched", Siri Suggestions) — the label tool's
actions gain a target subject and a reason, the reason bound by the
annotation rule.

Not copied: ChatGPT headers/bullets, Apple Health rings (fullness needs a
denominator — already declined), Oura's composite score (a definition
nobody chose; rule 9), Robinhood whole-screen colour, Perplexity's answer
length, Copilot completing anything.

Adoption: the evidence block and the three text slots are P1 finding
work; three new marks and the provisional frame are P2; targeted actions
and ghost completions P2; the "usual" band waits on its definition.

## 2026-09-13 — One page: George, Ideal UI

https://claude.ai/code/artifact/7d69541a-ab54-4cfc-b622-77be5c7679c4

The owner asked for one thing: the ideal UI and UX for all 26 functions,
not more research. This mockup is it. It folds the 24 borrowings into the
working screens and adds what the earlier renders lacked: an estate
switch (23) that is honest about AJI CMG having no feed; a memory view
(11) where every belief can be forgotten; a document scenario (24) where
an invoice is read into a matched delivery, provisional until kept and
labelled as needing a source; a "Send the order" frame (25) as the one
veto point, with no channel connected; a mic in the composer (26);
selection-as-context (7) by tapping a row; ghost completions built from
rows. The "26" rail button is the coverage map: built / designed here /
needs a source, per function, in the owner's order.

Status by that map: 17 built, 6 designed here (4, 7, 16, 20, 21, 26),
4 need a source (8 in part, 23, 24, 25). Nothing on the map is claimed
built that the code does not do today.

## 2026-09-13 — The plan to the Ideal UI, session by session

Artifact: George, The Build Plan (link in NOW.md §6). NOW.md §3 rewritten
from P1.c onward: 31 sessions in four phases, one card each. Phase 1 (11)
puts the three Open complaints first as cards P1.c/d/e/g, then speed (P1.h
effort, P1.i replay endpoint, P1.j tokens and fragments), then visible work
for free (P1.k). Phase 2 (9) brings answering mode to the Ideal UI: thread as
page, markers, taps as context, targeted actions and ghost completions,
investigation replay, memory view, estate switch, voice. Phase 3 (7) is
operating mode: the queue, Today, Kept, the pinned object with versions and
the provisional frame, diffs, the usual_weekday definition. Phase 4 is the
six sources only the owner can supply, each a card the day it exists.
Gates between phases are five days of empty Open plus the phase's numbers.
Every prompt is "Read ops/NOW.md. Do the next card." — cold-session safe by
construction. Honest calendar: eight to ten weeks to the Phase 3 gate.
Old P2.a/b/d absorbed into P2.c, P1.d, P2.h; old P2.c (one expressive form)
dropped with feature 4.

## 2026-09-13 — Model switching (Opus → Sonnet): still no, now with the arithmetic

P0.6 recorded "do not cascade models" in one line. The question came back, so
here is the measurement behind it. Read from `cost_report.py --since
2026-09-05` (the current build, 10 real turns, $2.50 total):

| per turn | tokens | share of turn |
|---|---|---|
| cache read | 138,590 | 27.7% |
| cache write | 20,527 | 51.4% |
| output | 2,084 | 20.9% |
| uncached input | ~9 | 0% |

Four reasons, in order of how much they decide it.

1. **The premise.** Production is $0.25/turn and ~10 turns a week. One eval
   run is $1.59–$1.71 and a heavy build day was $18.20. Zeroing the
   production model bill entirely saves ~$10/month. It is 3% of the bill.
2. **The cache is model-scoped, so the saving is smaller than the price
   ratio and can invert.** The prefix is ~30k tokens (138,590 read over 4.6
   iterations). A turn routed to a second model pays a full cold prefix
   WRITE at that model's write rate, and cache write is already 51% of the
   bill. At a 5x price gap routing still saves ~$0.16/turn; at a 1.7x gap it
   costs ~$0.01/turn MORE. Exact Sonnet 5 rates were not pinned here, so the
   sign of the answer is unknown — which is itself the reason not to build
   on it.
3. **The cheap turns are being DELETED, not routed.** P1.a cut label calls
   50% → 33%; P1.f shrinks compose further; P1.i/P1.j answer navigation
   fragments with **no model call at all**. A turn that costs $0 beats a
   turn that costs 40% less. You cannot route a turn that no longer exists.
4. **What survives that is judgment**, which is rule 9's "the model selects,
   investigates, explains and interprets" — the product. NOW.md's own line
   decides it: a lever that only costs money is free; a lever that narrows
   what he reads or dulls how he thinks is the product. The TTL is the
   first kind. Model choice is the second.

**And it would break the measure.** The twelve measure George's behaviour.
Mixed models make a run a blend, and a flapping style check unattributable.

**Where model switching already happens, correctly:** across SESSIONS, not
turns — Opus 5 builds, Fable 5.1 reviews. Whole task, own context, no shared
cache to forfeit. That is in the working protocol and stays.

**When to revisit, named so it is not re-litigated sooner:** when production
turns exceed build turns in the bill. The design then is a fixed split by
SURFACE, not per-turn routing — unattended watches and standing questions run
hours apart and pay a cold write anyway, so they forfeit no cache. Note even
then that the morning standing question is the highest-judgment turn of the
day and is the worst candidate on the list.

## 2026-09-13 — A source that was never blocked, a tally that was wrong, two cards

**AJI CMG was never blocked, and a session said twice that it was.** It listed
"the vending feed" as S.3, a source the owner had to supply, in both the plan
and the Ideal UI map. Then it checked: `tools/vending.py`, the `get_vending`
tool, `v_vending_order_lines_php` / `v_vending_orders_php` /
`v_vending_goods_php` and a full `vending:` domain in `definitions/metrics.yaml`
all exist and are read today. **George already covers two businesses.**
S.3 withdrawn; feature 23 is designed-not-built (P2.g), not source-blocked.
Two constraints that ARE real and stay: `never_join_to_store_domain: true`
(the domains sit side by side, never joined), and vending profit is computable
but overstated on 72.7% of lines where cost was never entered, with a
mandatory flag. Retail profit stays unsupported —
`store_profit_do_not_reintroduce: true`, because `products.cost` is a single
current scalar with no history and 636 of 3,678 products have none.

**The 26-tally was wrong in the plan's favour.** It read 17 built · 6 designed
· 3 source-blocked; the map's own rows say **16 · 7 · 3** and the old figure
double-counted feature 8. Corrected in the plan page. The honest answer to
"will everything be operational" is 16 of 26 as written, with feature 4
dropped, four narrowed (1, 15, 16, 17), three source-blocked (8 in part, 24,
25) and feature 12 closable only by living with it.

**Two capability cards added (P2.i, P2.j).** Both change what George can SAY,
not how it looks, and neither needs a new source:
- **P2.i same-store year-over-year.** `same_period_last_year` is refused
  because the estate is a different shape a year apart, and the refusal names
  its own fix: define a same-store rule first. For a Chinese-candy retailer
  in the Philippines, Christmas and Chinese New Year ARE the year, and
  `previous_period` cannot see either. Seasonally time-boxed: at one card a
  day it lands ~mid-November, so it is the one card worth pulling ahead.
- **P2.j the watch fires before the stock-out.** Crossing zero reports a lost
  sale. "Will cross zero before it can be restocked" is computable from the
  replenishment and purchase-plan tools plus a units/week rate; lead time
  arrives as a BOUNDED SETTING (architecture rule 6), not as the frozen PO
  export, and a line with no lead time says so rather than defaulting.

**Four candidates parked in NOW.md, not started:** negative stock as a
data-integrity measure, transfers drawn as weighted flow (the one expressive
form CLAUDE.md did NOT decline), delivering the morning brief to Telegram
where `tools/brief.py` and BRIEF_TOKEN already exist, and basket affinity
(lowest confidence, parked behind the rest).

## 2026-09-13 — Reviewing the two pages found four more errors, all mine

Asked to check the artifacts were right. A checker over both pages
(`scratchpad/review.py`: every data-screen, data-go, data-ref, data-pop and
data-open target resolves; the map is 26 rows in order; tag and button
balance; the page's card list against NOW.md §3) found no structural faults
and four content ones:

1. **Feature 8's map row still said "the vending feed" was a source** the
   owner must supply — the same error withdrawn as S.3 an hour earlier, in a
   second place. Now names supplier-per-product, arrivals, documents, people.
2. **P2.g's done-when still said "AJI CMG says it has no feed"**, in the plan
   page AND in NOW.md. Both now say vending is read and the switch is what is
   missing, with the never-join rule and the overstated-profit flag beside it.
3. **Every session count was wrong.** The headline said thirty-three (and
   thirty-one before that) against **28** open cards; Phase 1 said eleven for
   ten; Phase 2 said nine for eleven. Phase 3's seven was right. The calendar
   bands were redrawn and the estimate moved from eight-to-ten weeks to
   **nine to eleven**, which is what 28 cards at four a week plus one fix in
   three actually comes to.
4. **"3 open defects"** should be 3 open REPORTS holding ten defects between
   them.

`review.py` now FAILS on a wrong count rather than printing it, so the next
edit cannot quietly desynchronise the page from §3. **The lesson worth
keeping: every tally stated in prose in this project has been wrong at least
once** — 17/6/3 double-counted a feature, three session counts, and a source
that was never blocked. Derive a count or check it; never restate one.

## 2026-09-13 — A borrowed pattern had no card, and the plan's labels were unreadable

The owner asked what the pills on each card mean, asked to be told when to
switch model, and asked whether the plan really covers the UI work discussed.
Auditing the 24 borrowed patterns against the 28 cards found **one with no
card at all**:

**Borrowing 10, `@` names a thing (Hex's @ data source, Linear's @).** It is
drawn in the Ideal UI's composer and no card had it. P2.c was tap-to-select
and P2.d was ghost-text completion; neither is @-resolution. **Folded into
P2.c** rather than given its own card, because it is one mechanism with two
doors: a tap and an `@` both resolve a subject to an ID FROM THE ROWS,
produce the same chip and travel in the same request field. An `@page` binds
`page_scope`. The other 23 patterns all map to a card; so do the three open
dogfood reports (P1.c, P1.d, P1.e, P1.g) and the hands-free mode discussed
under the Jarvis question (P2.h).

**The card labels were bare numbers with no key** — "2 · 6" next to
"no eval" told the owner nothing. The plan page now carries a legend, and
feature pills read "#2 · #6" so they read as references to his own 26 rather
than as a date or a count.

**Model switching is now stated, not implied.** Opus 5 builds every card;
Fable 5.1 is for exactly two moments, and both are marked on the cards: after
each phase closes (P1.✓, P2.✓, P3.✓ each carry a "switch to Fable after"
pill and a review prompt), and any time a close-out surprises the owner.
Never mid-card.

**One rule kept, at a cost.** The switch-model pill was drawn in the accent
first. Changed: this page is read beside the product, the accent means
"needs you" and nothing else, and teaching a second association on a
planning page is how the rule erodes. It is cream now.

## 2026-09-13 — "Do we always need to eval?" No, and the plan over-prescribed it

The owner said evals have been costing a lot. Checking found a contradiction
and three over-tagged cards.

**The stated price was 3–4x the measured one.** §2b said a full run is
"roughly $5–7", derived from an iteration count. The harness now prints its
own spend and P1.b's two live runs came in at **$1.59 and $1.71**. The
close-out saying so sat 500 lines below the estimate that contradicted it.
Corrected to ~$1.65. **An inflated price is not a safe error** — it makes a
session skip a run that would have caught a trust failure.

**"Subset" was undefined and is now the TRUST GATE: four fixed scenarios,
~$0.55.** Across every recorded run the trust rows are stable and the style
checks flap, so the value is concentrated: `caveats` (a notice unsurfaced or
forced), `why` (a figure no tool returned; attribution), `cannot` (a refusal
that stopped refusing), `morning` (the volunteering cap and the rounded-figure
gate). Picking scenarios by feel is what "subset" used to mean and it is
replaced. The full twelve runs only at the three phase closes and on the two
cards that rewrite the compose grammar or change effort.

**Two runs per card, maximum — this is where the money actually went.** One
to see the problem, one to confirm the fix; a third failure means the card is
wrong, not the code. The $18.20 day was ~6 full runs and none of them was a
gate: it was a live model iterated against a failing check.

**Three cards were tagged for an eval that cannot see them.** P1.j (tokens
render from arguments the loop already accepted, and a fragment SKIPS the
model), P2.j (a scheduled watch makes no model call at all, rule 7), P3.d
(the provisional frame and version arrows render over write proposals that
already exist). All three now say No eval, with the reason.

**The whole plan's eval spend, computed rather than estimated: $12.10** —
7 trust gates at $0.55 plus 5 full runs at $1.65, and under $25 even if every
one of those needs its second run. Over nine to eleven weeks. The bill is
still build sessions, not the gates.

## 2026-09-13 — Are the twelve good? Partly. Three real weaknesses, one serious

The owner asked whether the twelve questions are a good test and why twelve.
Read the suite (`tests/evals/test_voice_evals.py`) and compared it against the
real questions in `george.conversations`.

**Why twelve: it accreted.** They are `test_01` … `test_12` with no coverage
argument written anywhere. As MODE coverage they are reasonable — proactive,
investigation, entity, entity, build, follow-up, correction, refusal, notices,
time-bucket, page write, schedule refusal — but `shop` and `product` are the
same shape, and `by-hour` matches nothing anyone has ever asked.

**1. SERIOUS: nothing checks that the answer is USEFUL.** Every assertion is
about form and honesty — status ok, iterations capped, no forced notice, no
ungrounded numeral, no internal vocabulary, and a refusal only where one is
expected. **A George that replied "I can't establish that from what I can
read" to all twelve would pass almost every assertion.** The suite cannot
distinguish a useful colleague from a maximally cautious one, which is exactly
the failure mode the trust machinery pushes toward. This is the gap that
matters, because the owner's complaint was never "he lied", it was "it doesn't
function right".

**2. The register is wrong, and the real questions are on disk.** The evals
ask well-formed, fully-specified questions. The owner writes fragments:

| the evals ask | he actually asks |
|---|---|
| "How is Rockwell doing?" | "how about rockwell" · "lets focus on rockwell hows it doing?" |
| "What should I look at today?" | "focus on the problems and what we can improve on" |
| "Why was North Edsa up so much last week?" | "how are we doing?" |
| "Keep that as a page called Rockwell weekly." | "pin that" · "can you make it a page?" |

And whole real patterns are untested: a bare **"hi"**; assent (**"ok"**,
**"yes go"**); a preference taught mid-stream (**"add top sellers by sales not
units, i value sales more"** — that is a belief); a question about George
himself (**"so how can i use it>"**); a scope shift that is not a question at
all (**"lets focus on greenhills"**); and asking his opinion (**"what do you
think?"**). **The twelve test an easier George than the one in production.**

**3. One run is a sample, scored as a grade.** Four runs gave 12, 11, 10, 11
with a different scenario failing each time, and `leads_with_reading` is every
non-trust failure. A style check that passes ~90% of the time should be a
REPORTED RATE across runs, not a gate that fails a build. The trust rows are
the only ones meaningful from a single draw, which §2b already says.

**Not changed here.** This is an assessment, not a rebuild; the owner decides.
The shape proposed if he wants it: keep the four-scenario trust gate as is;
rewrite the other eight in his own register drawn from the log; add the one
missing assertion (for a question that asks for a figure, the answer must
carry a figure a tool returned); demote the style checks to reported rates;
and report each run against the previous one rather than as an absolute score.

## 2026-09-13 — P1.m: fix the measure, and where it sits

The eval assessment above became a card rather than a rebuild. **P1.m runs
after P1.e and before P1.f**, not first: the three open dogfood complaints
(P1.c, P1.d, P1.e) are the owner's actual experience of the product being
broken and outrank a measurement fix, and they report through the four trust
scenarios, which this card does not touch. What needs the rewritten suite is
P1.f (the voice rewrite) and P1.✓ (which reports every Phase 1 number).

**The letter is out of sequence on purpose.** Renumbering on 2026-09-13 broke
four cross-references inside closed close-outs. Order is POSITION in §3's
list, which is what "do the next card" already reads; the letter is only a
label. This is now stated in the card itself so the next session does not
"tidy" it.

Plan totals: 29 open cards, Phase 1 eleven. Eval spend $14 for the whole
plan, under $28 if every card needs a second run.

## 2026-09-13 — Six eval gates dropped, because they could not have caught anything

The owner asked whether so many cards really need a run and whether it could
wait until the end. Both halves were right, for a reason better than thrift.

**The rule now, stated once so it is not re-decided per card:** a live run
happens only when a card **changes the trust machinery itself** — the prompt,
the compose grammar and its roles, the figure gate, the notice path, effort
per turn — **or at a phase close.** Everything else rides the close.

**Six gates dropped, and not to save money: the four gate scenarios could not
have seen those changes.** `P2.i` and `P3.f` add a new COMPARISON, and no gate
question asks for one, so a run there proves nothing; their contract tests are
the real check. `P2.c`, `P2.d` and `P2.f` are context and rendering. `P1.c`
breaks or fixes compose refusals, which are its own reported numbers.

**Seven runs across 29 cards, $9.10**, down from ~$14.90 — and after P1.m the
suite is v2, so a full run is $1.15 rather than $1.65. What survives: P1.g
(the gate, because it changes the figure gate), P1.f and P1.h (full, compose
grammar and effort), P1.m (both suites, $2.80), and the three closes.

**What this does not buy back is attribution**, and that is the accepted cost.
A regression landing in a riding card surfaces at the close with up to eight
cards behind it, and the bisect is then the price. Accepted because those six
runs could not have caught it anyway.

**The saving was never the point and the money was never the gates.** $5.80
across ten weeks. The $18.20 day was six full runs in ONE day — a session
iterating a live model against a failing check — which the two-runs-per-card
cap already stopped.

## 2026-09-13 — The eval meter was understating by 40%, and it is now fixed

The owner refused a cost figure he had been given twice and asked for it to be
verified before any run was spent. He was right, and the fault was in the
instrument, not the estimate.

**`Report.spend()` summed only the SCORED scenarios.** A setup turn never
reaches `add`, and the first twelve run four of them: "How is Rockwell doing?"
is re-asked as the setup for follow-up, correction and keep-page, and the
Seikyo draft for run-monday. Measured from `verification/p1b-final.json`:

| | |
|---|---|
| recorded (scored 12) | $1.71 |
| four setup turns, never counted | **$1.19** |
| **true cost of a v1 run** | **$2.90** |

**So the stated price has now been wrong three times** — $5–7 (an iteration
estimate), then $1.65 (the broken meter), now $2.90 (measured). Each
correction was published as fact. `harness.METER` counts at `run_turn`, and
the report prints scored and setup separately, so the gap cannot reopen.

**Measured per-scenario, which is also where the cheap runs are.** The gate is
**$0.63**, not the $0.55 asserted: `why` $0.24 (7 iterations), `caveats`
$0.16, `cannot` $0.12, `morning` $0.11. And **`shop` cost $0.34 over 6
iterations — the most expensive scenario in the suite, dearer than the
investigation** — which is a second reason it is not scored in v2.

**One run cut on the evidence, worth $2.90.** P1.m no longer re-runs v1. The
four gate scenarios are byte-identical between suites, so v2's gate compares
directly against v1's RECORDED gate in `p1b-final.json`; the other seven v1
scenarios are the ones being replaced, and re-running them to watch them be
replaced settles nothing.

**Plan total: ~$11.67, not the $9.10 published an hour ago** — that figure
inherited the broken meter. On v1 at its true price the same seven runs would
be ~$18. v2 at ~$1.84 is still an ESTIMATE derived from v1's per-scenario
costs; P1.m's first duty is to report what it actually cost from the new
meter. P1.h (effort per turn) should cut every later run because cost is round
trips, and it is deliberately NOT counted in the total, because it has not
been measured.
