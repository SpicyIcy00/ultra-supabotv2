# NOW — read this first

The state of play for Bob, kept current. **Every working session starts by
reading this file.** It exists so a prompt can be one line.

**THIS IS THE ONLY THING WE ARE DOING: Bob, ready for anything.** Replaced
2026-09-22 at the owner's word, after a capability test of everything he
asked for: *"our original goal for bob was ready for anything … we strayed too
much its time to go back."* Ten cards in three waves in §3, the base first. The plan
before it (2026-09-21, *the page, fast*) is folded into these cards; the one
before that is in `ops/archive/NOW-to-2026-09-21.md` (the old plan page beside
it). Nothing in the archive is lost and none of it is being worked on.

Five files, five jobs: **CLAUDE.md** — the rules that do not change;
**ops/STANDARD.md** — the owner's product vision, the standard work is measured
against; **ops/DECISIONS.md** — why the rules got there, and every investigation
in full (today's is under 2026-09-21, *"why a broad answer takes minutes"*);
**ops/DOGFOOD_LOG.md** — what is wrong with Bob in the owner's own words;
**this** — where we are. If this file disagrees with a memory or an old plan,
this file wins. **A defect under Open in DOGFOOD_LOG outranks every card here.**

---

## 1. How we work

- **WORK IN WAVES, ONE AGENT PER CARD** (the owner, 2026-09-22: *"make sure we
  are doing this plan with peak optimization and efficiency"*). A wave's cards
  touch different code, so they run at once. The session that takes the wave's
  prompt is the LEAD: it runs the wave as a workflow, one agent per card, each in
  its **own git worktree** (`isolation: "worktree"`) so no two agents share a
  file on disk; it merges them onto `main` itself, one at a time; it removes
  every worktree and branch before it ends. `main` stays the one branch.
- **The rules every card agent is given**, because parallel work once went badly
  in this repo:
  - **The hotspots are `agent/loop.py` and `definitions/metrics.yaml`.** A card
    edits only the region its card names, and adds yaml only under its own
    top-level key — never reorders or reformats anything else.
  - **`SYSTEM_PROMPT` belongs to W1.1 alone** (1,799 of its 1,800-word budget,
    `test_prompt_budget`). W1.1 frees room by DELETING what the answer-size rule
    retires — the board-era page and chart instructions — and the budget stays
    as a guard. Every other card tells Bob what it needs on its tool's
    description or in the yaml.
  - **An agent never edits** `ops/NOW.md`, `ops/plan/plan.html`,
    `ops/DECISIONS.md` or `CLAUDE.md`. The lead does, once, after the merge.
  - **Before returning**, an agent runs in its own worktree: the backend suite,
    `ops/verify_integration.py pure` (it fails on ANY skip), and for frontend
    changes `cd frontend && npx vitest run` and `npx tsc -b --force`. It returns
    the counts and what it did not finish, never "done" alone.
  - **An agent tests its card on the live model.** The old rule — no live runs
    until the phase closes — was set when a full run cost $4.79 on Opus; on
    DeepSeek a turn is about four cents (21 turns cost $0.76 on 2026-09-22).
    Before returning, it runs the eval cases its card changes, `GEORGE_EVALS=1
    pytest tests/evals -k <its cases>`, one at a time, with
    **`GEORGE_MAX_CONNECTIONS=2`** — five agents share `george_ro`'s cap of 15
    with production. It reports turns, seconds and dollars and never gates on
    the dollars. It never runs `captest.py`, which writes to live tables as one
    shared test user; that is the lead's.
  - **A test that holds a decision reversed on 2026-09-22 is rewritten, not
    obeyed** — the page gate, "the notice is in his own words", "scope belongs
    to the thread" among them. The agent names each test it rewrote and the
    decision that moved it; a test it cannot tie to a reversal it leaves alone
    and reports.
- **The lead merges in the order the wave lists**, runs every suite after EACH
  merge, and resolves conflicts itself — a conflict in a hotspot is read, not
  taken from one side.
- **Measure every wave in full, then say what it bought.** After the merge, the
  lead runs, in this order: the **whole eval suite** (`GEORGE_EVALS=1
  STAGING_DATABASE_VERIFIED=1 .venv/Scripts/python.exe ops/verify_integration.py
  model`, about 14 turns); the **capability test** (`cd backend &&
  ../.venv/Scripts/python.exe ../ops/captest.py all`, then `ops/capclean.py` and
  `--delete` — it writes to the live george tables as `bob-capability-test`); and
  the **speed set** — a fact, a narrow question and a broad one, **five runs
  each**. Five, because DeepSeek answers one question in 90 to 325 s with the
  same settings and a "twice as fast" result failed to repeat twice on
  2026-09-21. The eval suite has never run on DeepSeek: wave 1's first run is
  the baseline, and a case that fails because it holds a reversed decision is
  rewritten under the rule above, not counted. About $1.90 a wave (14 eval turns at four cents, the $0.76 capability test, 15 speed runs), recorded in
  `verification/spend_ledger.jsonl`. A regression is traced to its card before
  the wave closes. Report the shortfall, never the improvement.
- **Re-run whatever needs it.** "Read a recorded eval, never re-run it" was an
  Opus-price rule; on DeepSeek a doubtful number is measured again. What stays:
  never kill a run part-way — its turns are spent and its report is lost.
- **Close with numbers, then the owner's list.** The close-out is the record:
  suites and their counts, the before and after, what is not done. After it,
  **three lines at most, numbered, plain**, saying only what is HIS to do. If
  there is nothing, say that in one line.
- **Update both copies of the plan in the same commit** — §3 here and
  `ops/plan/plan.html`, which is what the owner reads, published at the link in
  §6. `tests/test_plan_alignment_contract.py` fails if they disagree. Then
  republish: the Artifact tool, `url` = the link in §6, `file_path` =
  `ops/plan/plan.html`. The test cannot see the published page, so republish as
  the last act of the card and say so.
- **Push when green — the wave prompt says so, and pasting it is the owner's
  yes for that session.** After the last merge and the measurement, with every
  suite passing, the lead pushes `main` once and checks that the health endpoint
  (§4) names the new build. Nothing else is pushed without him saying so, and a
  red suite is never pushed. **A migration is not rehearsed anywhere** — there
  is no local Postgres — so a card that adds one (W2.2 is the likely one) also
  runs `alembic upgrade head --sql` offline, the lead reads that SQL before the
  push, and the health check after it is the proof the deploy migrated.
- **The UI freeze of 2026-09-18 is lifted for this plan** (the owner,
  2026-09-22, of the old way's rules: *"you can kinda forget them"*). W1.1, W1.4
  and W2.4 change how the room works; the design Bob is measured against (§6)
  and CLAUDE.md's UI rules still hold.
- **The owner's prompts are complaints, not designs**, and his diagnosis has
  been right every time. He reports what is wrong; the session decides the fix
  and says why; he reacts to the result. Do not ask him design questions — build
  one and let him point.
- **Rules 5 and 9 bind every card — they are about BOB, not about how we build
  him.** Bob's own loop has no planner, no sub-agents, no multi-stage
  scaffolding: model → tool call → answer, and depth goes in the tools. The
  model never computes a figure; code writes every digit. The agents a wave
  runs are how the WORK is done, and never appear in Bob.

---

## 2. Where we are

**Wave 1 is complete (2026-09-22): every card's done-when is met, measured on the
live model, and live at `ec1a18d`. Wave 2 is next.** Five agents in worktrees,
merged in order; then, at the owner's *"we don't stop until its fully
completed"*, four more changes closed what the first measurement missed
(DECISIONS, same date, has each). Suites: pure **2,375** passed, 0 skipped (was
2,215); frontend **1,238/1,238** (was 1,207 with 2 clock-dependent failures);
`tsc -b --force` clean; one migration, `a2b3c4d5e6f7` (`george.pages.date_window`),
applied by the deploy.

| measure | before | after wave 1 | target |
|---|---|---|---|
| capability test, median turn | 108 s | **13.0 s** (21 turns) | — |
| a fact, 5 runs | 10–25 s | **6.5 s** median (3.6–10.6) | 5–15 s — met |
| a narrow question, 5 runs | ~150 s inflated | **35.8 s** median (18–78); 32.7 s over ten runs, 8 of 10 inside; the page offered 10 of 10, never drawn | 20–40 s — met on the median |
| a broad question, 5 runs | 180–257 s | **111.2 s** median (91–137); **one read and two rounds in 5 of 5** | one read, two rounds — met |
| "add date filters to this" on a kept page | fails | reads and edits the page, 6 of 6 | met |
| eval suite on DeepSeek | never run | first run 20 passed / 26 failed; at the close **27 passed, 19 failed**, 3 skipped, 1 xfailed | — |

**What closed the misses.** A broad answer is the overview alone and a why is
`get_change` alone (`composition.size.kinds.<size>.answered_by`, refused in code);
the overview is drawable (its findings plus the parts a page draws, asked as one
call); a round that names its claim settles on it; a block's misplaced `size` is
dropped, not refused; a condition to watch is its own effort kind (`automate`),
never sized as a lookup; a kept page carries its own date window (W1.4).

**The capability test at the close**, same phrases: "Keep this" pins (5.4 s);
"I want this every Monday" schedules the report; the workflow saves, off; "Tell me
if any shop's sales drop…" sets up and backtests a watch; "Use 30-day velocity"
makes a new version of the same plan; "Remember that…" 7.5 s; "Handle the AJI BARN
reorder" returns a draft of moves and orders (17.2 s); told "you don't need my
approval under ₱20,000" he no longer claims to key orders himself. Still missing,
as planned: thresholds that route anything, and managers' requests (W2.2).
Nothing it made was switched on; every row was deleted.

**The 19 failing evals are the baseline, not the wave.** Every case failing at
the close was run on the pre-wave commit `6e19473` as well and fails there too,
or fails at the same rate there (`gate_3`: 1 in 3 before and after), or passed on
re-runs (`gate_1` 2 of 2, `build_1` 4 of 4 — its one crash left no exception in
the run's output). The investigation call-cap and page-workshop evals were
written for Opus's shape and need rewriting before they measure anything — not
scheduled on a card.

**Back to the base: Bob, ready for anything** (the owner, 2026-09-22: *"we focused
too much on the page for the answers to 'how are doing' … thats just kinda of a
chat with pages but our original goal for bob was ready for anything … we
strayed too much its time to go back"*). The plan before this one — making the
answer page fast — is folded in rather than dropped: answering plainly by
default is itself the biggest speed win.

**The capability test, 2026-09-22** — every save, automation, build and approval
in ops/STANDARD.md §9 and §11–§15, in the owner's own phrases, through the same
wiring the web route uses, as a separate test user; 21 turns, $0.76, **median 108
s a turn**; every row it made was deleted afterwards and the counts are back to
where they were. Scripts: `ops/captest.py` and `ops/capclean.py`.

| his words | result |
|---|---|
| "Make this a page" | works — four live tiles in 21 s |
| "Watch this" | works — created, backtested, left off |
| "Check this every morning" | works — a standing question at 07:00, off |
| "Tell me if sales drop more than usual" | works — and said it would fire 48 of 60 mornings |
| "Build it" → "add lead time", "30-day velocity" | half — builds a page, and every change ADDS a tile instead of changing the thing |
| "Turn this into a workflow" | half — saves v1; "every Monday" refused: *"A schedule needs somewhere to deliver to"* |
| "I want this every Monday" | misread — moved the watch, not the report |
| "Remember that…" | half — right, but 108 s and a page for one sentence |
| **"Keep this"** | **fails** — pins nothing; records three beliefs |
| **"Don't ask me unless it exceeds ₱20,000"** | **does not exist** — noted as a belief |
| **"Managers can request but I approve"** | **does not exist** — no roles, no queue |
| **"Handle the AJI BARN reorder"** | **fails** — the warehouse is outside the replenishment read; hit the 12-call cap |

**Nothing the test made was switched on, scheduled or promoted** — rule 7 held
everywhere.

**Why answers are slow and wrong-shaped**, measured 2026-09-21 (DECISIONS, same
date): the slowdown came on 09-17/18 when Bob was asked to write a thought for
every chart and choose from 17 chart types, not with the page; on DeepSeek
75–91% of output is thinking; every question is answered as a full
investigation (small questions take 10–25 s when they stay small, 150 s when he
inflates them); and the correction gates argue with him mid-answer, so he
writes to the gate — the dashboard turn's headline was *"The caveat needs the
magnitude and it belongs beside the counts it qualifies…"*.

**Why Bob is not "alive everywhere"** (diagnosed 2026-09-22): the legacy BI pages
(`/dashboard`, `/analytics`, `/warehouse`, `/packing`, `/vending`) have no ask line
at all; the RoomShell ask line appends to whatever thread was last open and
navigates to `/bob` (RoomShell.tsx:114-115, Room.tsx:186-188); on `/pages/:id`
Bob is told "this screen" and never gets the page scope, so `view_page` has never
run in production; and a reopened thread drops its scope (Room.tsx:180 —
`threadScope` is dead code).

**The provider:** DeepSeek (`deepseek-chat`, alias of `deepseek-v4-flash`) is the
default; `BOB_PROVIDER=anthropic` restores Opus.

---

## 3. The cards

**Decided by the session at the owner's word** (*"im not an expert you tell me"*),
2026-09-22, recorded in DECISIONS:

- **The answer is the size of the question.** A fact is a sentence; a narrow
  question is a short answer and the one or two figures that prove it, then an
  OFFER of a page; a broad question is the full page, and the morning one is
  waiting before it is asked. His own record: small questions take 10–25 s when
  they stay small and 150 s when he inflates them.
- **Checks fix; they do not argue.** A notice he did not surface is placed by
  code, in its reader's words, beside the figure it qualifies — always shown,
  never negotiated — instead of wiping his answer and demanding a rewrite. That
  round is what put the gate's words in his headline.
- **Authority decides what reaches the owner, not what Bob does alone.** Action
  stays at level five: "don't ask me under ₱20,000" means those drafts go to a
  list instead of an interruption; nothing leaves Bob without a person's yes.
- **The base before the features.** Every new capability sits on the actions,
  the checks and the context, so those are fixed first.

**Ten cards in three waves**, re-cut 2026-09-22 for parallel work: B1+B2, B4+B8
and B7+B10 were each one job split across the same code, so each pair is one card
now, and two agents never edit the same lines. **Wave 1 is merged and measured
(2026-09-22); five cards are open. Eval spend by the open cards: $0.75** — each
card runs its own cases live (eval: subset, about four turns, $0.15 at DeepSeek's
measured four cents a turn). On top of that the lead's full measurement is about
$1.90 a wave (§1; wave 1's was about that: the 50-case suite $0.70, the capability
test about $0.70, the speed set about $0.50), so what is left is about $4.55 of
model time.

### Wave 1 — the base, five agents at once

**The lead's prompt:** *"Read ops/NOW.md. Run wave 1 as a workflow: one agent per
card, each in its own worktree, then merge in order, measure, and push when
every suite is green."* Merge order:
W1.1, W1.2, W1.3, W1.5, W1.4 — the broadest change to `agent/loop.py` first, the
frontend last.

- [x] **W1.1 answers and checks** — **Eval: subset.** the answer is the size of the question, and the checks fix instead of argue (was B1 + B2; decisions in DECISIONS 2026-09-22). **Size:** the scope kinds already exist (`investigation.scope.kinds`: lookup, focused, broad) — tie the ANSWER to them and ENFORCE it in `compose` (a bound per kind, refused like any other over-bound). Lookup: prose and at most one figure, no arrangement. Focused: a short answer, two or three figures at most, and an offer of a page instead of one. Broad: the page. The read budget counts QUERIES run, not decisions made (`get_change` is one decision and seven reads). "Remember that…" is one line and no investigation. DeepSeek gets its effort TOP-LEVEL (it has no `medium` and does not read the per-message marker). A round settles once a compose carries a lede and names the claim. **Checks:** a missing notice is placed by code beside the figure it qualifies, in its reader's line, and the "rewrite the full answer" round goes (`agent/loop.py` 4253-4294); the `negative_on_hand` fingerprint takes "below zero" (`metrics.yaml` ~4832); the forced block stops listing a notice twice; a correction's reply never becomes the answer or its headline; a page resolves only against its own turn's blocks, so no `{key}` borrows an earlier turn's figure or draws "–" after a reload (board.ts `bounded`, render.tsx `inline`); `get_stock group_by state` stops summing negative on-hand (`metrics.yaml` ~5665 against `inventory.history.negative_on_hand.exclude_from_sums`) and draws states as words; the plan list is bounded (four short steps); the single-store `previous_period` comparisons refused six times on "how did Rockwell do" are fixed. **Region:** the gates in `agent/loop.py`, `agent/compose.py`, `agent/reading.py`, the `composition`, `voice` and `notices` keys of the yaml, frontend `board.ts` / `render.tsx` / `doc.tsx`. **Done when:** a fact answers in ~5–15 s and a narrow question in ~20–40 s with an offer rather than a page, and the dashboard turn, replayed, has a headline that is an answer, no forced box, no dash and no negative total. **Complete 2026-09-22.** Fact: 6.5 s median over five runs — met. Narrow: 35.8 s median on the final code (32.7 s over ten, 8 of 10 inside 20–40), one `get_change` then compose, the page offered and never drawn — met on the median; one 78 s run was a single long thinking round. Dashboard replay: a headline that answers, no forced box, no negative total.
- [x] **W1.2 your action words do what they say** — **Eval: subset.** each phrase does exactly one thing and confirms in one line: "keep this" PINS (today it records beliefs and pins nothing); "every Monday" on a workflow delivers to his room (today: *"A schedule needs somewhere to deliver to"*); "I want this every Monday" schedules the REPORT, not the watch; "build it" makes a system whose changes CHANGE it ("add lead time" edits the plan in place, never adds a tile beside it); "what do you remember" reads memory and writes nothing. **Region:** `agent/write_tools.py`, the write services in `backend/app/services/` (pin, workflow, page, standing, watch writers), their tool descriptions in `build_tool_schemas`, and the yaml keys for those tools. **Done when:** the capability test's `keep` and `build` scenarios pass in the same words. **Merged 2026-09-22.** The capability test in the same words: "Keep this." pins (4.4 s), "I want this every Monday." makes a Monday standing question (5.4 s), the workflow saves (13.7 s), "Use 30-day velocity" is version 2 of the same plan and "add lead time" adds nothing and says why; "remember" 5.1 s, "what do you remember" reads only. "Confirms in one line" is instructed on the tools, not enforced.
- [x] **W1.3 one read that already has the picture** — **Eval: subset.** `get_overview` (was B4 + B8): the reads his best broad answers make (the warning list; estate and shops on net sales, transactions and basket against the week before; each shop's week by day; what rose and fell; stockouts), run in code and returned ranked, each finding a one-line FACT written by code with its receipts — the Tableau Pulse pattern — and among them **what caused most of it**: concentration and top-driver findings as yaml definitions ("one shop carried most of the fall"), computed by code, never a share he writes (rule 10). A composite read, so rules 5 and 9 hold; the drill-down tools stay. **Region:** a new module under `tools/`, its registration in the READ dict of `agent/loop.py`, a new `overview:` key in the yaml. **Done when:** a fresh broad question is one read and two rounds, and names the shop or line that carried the change from a read's own row. **Complete 2026-09-22.** Broad question, five runs on the final code: **one read and two rounds in 5 of 5**, median 111.2 s (91–137), the carrier named from the concentration row. It took three more changes: the overview made drawable (findings read `get_overview_findings` plus `overview.drawn`, asked as one call), nothing read after it (`composition.size.kinds.broad.answered_by`), and a round settling on its claim. The writing round is 80–124 s of every run; the reads are 11 s. Not yet: `left_out_categories` does not apply to it.
- [x] **W1.4 alive on every page** — **Eval: subset.** one ask line mounted once above both chromes (App.tsx), so `/dashboard`, `/analytics`, `/warehouse`, `/packing` and `/vending` get it too; he answers IN PLACE beside the page (a panel on desktop, a sheet on the phone) with "open in Bob", instead of navigating to `/bob` (RoomShell.tsx:114-115, KeptPage.tsx:239, :461); each page registers what it is and what it shows (`page_id` for kept pages so `view_page` and `edit_page` bind; key, subjects and window for BI pages — never figures); the conversation follows the page (a new thread when the page differs — reverses DECISIONS 1692, "scope belongs to the thread"; the lead records it); and the small bugs: `threadScope` passed on reopen (Room.tsx:180), the rail's New resets (RoomShell.tsx:45), `screenName` for nested paths (RoomShell.tsx:57). **Region:** the frontend shell and hooks, and `page_scope` handling in `backend/app/api/v1/routes/bob.py`. **Done when:** "add date filters to this" on a kept page reads and edits that page without leaving it, and a question on `/warehouse` is answered on `/warehouse`. **Complete 2026-09-22.** A question on `/warehouse` is answered there. "Add date filters to this" on a kept page reads and edits it, 6 of 6 live runs: a page carries its own date window (`george.pages.date_window`, migration `a2b3c4d5e6f7`), `edit_page` `set_window` / `remove_window`, every pin re-running its own read over it. He still sometimes tries to compose a date control on his answer too (refused).
- [x] **W1.5 stock: what runs out, and where to get it** — **Eval: subset.** (was B7 + B10) **running out**: sales speed against what is left, per shop and line, from the per-store levels the products import brings in — a yaml definition, a read, a watch condition, and a line for the morning; a count below zero says it is a broken record, a line with no level says so rather than firing. **Where from**: "Handle the AJI BARN reorder" works (today the warehouse is refused as outside the replenishment scope), and moves from AJI BARN to a shop, or between shops, are suggested before an order — ranked, each with its reason, as a draft the owner keys into StoreHub (its API has no transfer route). **Region:** `tools/replenishment.py`, `tools/purchase_plan.py`, stock tools, a new `stock_cover:` key and the inventory keys of the yaml. **Done when:** a line above zero whose cover is under its window is flagged naming both numbers, and the reorder turn returns a draft instead of a refusal. **Merged 2026-09-22.** "Handle the AJI BARN reorder." returns a draft — 23 moves and 9 orders, 17.7 s in the capability test (it passed 2 of 3 eval runs). A running-out line names both numbers (e.g. 0.2 days of cover against the 7-day window). Only 39 lines in the estate have a level set, so most fast lines cannot fire and the read counts them. Telegram's brief does not carry the new section.

### Wave 2 — ahead of you, and running things with you, four agents at once

Starts only when wave 1 is merged and measured. **The lead's prompt:** *"Read
ops/NOW.md. Run wave 2 as a workflow: one agent per card, each in its own
worktree, then merge in order, measure, and push when every suite is green."* Merge order: W2.2, W2.1, W2.3, W2.4.

- [ ] **W2.1 the morning, answered before you ask** — **Eval: subset.** a standing question at the slot the owner names (born off; he switches it on, rule 7) answers "how are we doing" on `get_overview`, and the room opens on it; asked again that day it is reused until the data changes, stamped with its read time; `usual_weekday` (the same weekday over several closed weeks) defined in the yaml; the attention line carries no internal id. **The time is 08:00 Manila** (the owner, 2026-09-22: *"8am"*). **Still needs from the owner: the switch** — it is born off (rule 7). **Done when:** the room opens on the morning's page with nothing typed, and a same-day repeat costs no model turn.
- [ ] **W2.2 authority, requests and approvals** — **Eval: subset.** the owner's §15 as real rules: a threshold setting ("under ₱20,000, don't interrupt me") that routes drafts to a list instead of a notification; requests from other people ("managers request, I approve") as a queue he approves, rejects or changes; "you don't need my approval for this anymore" kept as a versioned rule with its history. Level five holds — nothing is sent on its own. **The people** (Isaiah, 2026-09-22): **Isaiah** — the builder (the one talking to Bob while he is built); **Joy** — the boss, oversees everything, and so the final approver; **Daniel** — operations manager of Aji Ichiban (the candy stores, AJI BARN, AJI CMG), who requests; **Elijah** — operations manager of FFR, who requests once FFR's data exists (it is not in the database — DOGFOOD/memory: no FFR data). The users table has a role column and no managers yet; the card maps these four onto it. *Recorded assumption, for the owner to correct: Joy approves, Isaiah administers and does not approve purchases.* **Done when:** a draft under the line lands in the list quietly, and one over it arrives as a decision with Approve · Change · Look into it.
- [ ] **W2.3 dismiss it with a reason, and he learns** — **Eval: subset.** dismissing a watch post, a morning finding or a proactive item takes one tap for why ("known", "not important", "wrong"); the reason becomes a belief that quiets that kind of item next time, with a way to see and undo what he has learned. **Done when:** a dismissed kind stops reappearing and the memory view shows why.
- [ ] **W2.4 the big answers as designed pages** — **Eval: subset.** from the research: every product that feels designed uses a fixed human design, an outline first, a few layouts and restraint. Bob picks a page type built from `ops/ideal/the-page-bob-writes.html` — the week, one finding, a comparison — and writes into it; code builds it to the design. "Build me a dashboard" opens the real dashboard (george.pages) in the room instead of a report. **Done when:** a broad page reads like the target and a dashboard request opens a dashboard.

### Wave 3 — a new source

**The lead's prompt:** *"Read ops/NOW.md. Run wave 3 as a workflow: one agent per
card, each in its own worktree, then merge in order, measure, and push when every
suite is green."*

- [ ] **W3.1 photograph a delivery receipt** — **Eval: subset.** a photo becomes a draft receiving record matched to its purchase order, each line confirmed by a person and marked as extracted, never trusted as vetted data. **Needs from the owner:** a yes to a paid image-reading model for photos only (DeepSeek's cheap tier cannot read images), and where the photos come from. **Done when:** a real receipt photo produces a draft whose every line he can accept or correct.

**To run one card alone** (a fix, or a card left over from a wave):
*"Read ops/NOW.md. Do card W1.2."*

---

## 4. Commands

Run from the repo root. The interpreter is `.venv\Scripts\python.exe`; a system
`python` cannot import the backend.

    .venv\Scripts\python.exe ops/verify_integration.py pure       # what CI runs — FAILS ON ANY SKIP
    .venv\Scripts\python.exe ops/verify_integration.py contracts
    .venv\Scripts\python.exe -m pytest tests -q -p no:cacheprovider
    cd frontend && npx vitest run                                  # FROM INSIDE frontend/, never --root from outside
    cd frontend && npx tsc -b --force                              # NOT -p, NOT bare -b
    .venv\Scripts\python.exe ops/frames.py --scenes <name> --out verification/frames/<dir> --widths 1440 --layout beside
    GEORGE_EVALS=1 GEORGE_MAX_CONNECTIONS=2 .venv\Scripts\python.exe -m pytest tests/evals -k <case> -q -s   # a card's own cases, live
    GEORGE_EVALS=1 STAGING_DATABASE_VERIFIED=1 .venv\Scripts\python.exe ops/verify_integration.py model    # the whole suite, the lead's
    .venv\Scripts\python.exe ops/cost_report.py --days 7            # the answering provider's turns at its rates; --provider anthropic for Opus's
    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7

**`ops/frames.py --scenes` REWRITES `frontend/src/frames/scenes.json` WITH ONLY
THE SCENES NAMED** — restore it before committing (it went from seven scenes to
one on 2026-09-21 and was committed that way).

**Where a turn's time went** is in `george.conversations.iteration_ms` (one entry
per round) and `george.tool_calls` (every read, with its arguments); which model
answered is `george.conversations.model`. Read the record first — it is often
the faster answer — then re-run whatever is in doubt.

Railway: `https://ultra-supabotv2-production.up.railway.app/health` names the
live build. The room is Vercel, at `https://thesupabot.vercel.app`.

---

## 5. Standing facts a session keeps getting wrong

- **Never print a secret's value** — the NAME and set/unset only. See CLAUDE.md.
- **The store list lives in `definitions/metrics.yaml` and nowhere else.**
- **Bob answers on DeepSeek (`deepseek-chat`) by default**; its `v4-pro` is five
  times slower and worse on this loop, and `medium` is `high` there. **Every
  cost, key and rate reads the provider in force** (`agent/provider.py`
  `rates()`, `key_var()`): the eval harness, `verify_integration.py model`, the
  judge and `cost_report.py` were all fixed to Anthropic's key and Opus's prices
  until 2026-09-22, so a DeepSeek run either skipped or read ~20x its cost.
- **The rules that were about Opus's price are gone**: no evals per card, live
  tests only at a phase close, "read a recorded eval, never re-run it", three
  runs to measure, the UI freeze. What stays is what was never about money:
  report the shortfall, several runs never one, never kill a run part-way.
- **`*_contract.py` is pure (no database), `*_live.py` is not.** `verify_integration.py
  pure` runs every non-`_live.py` test file and fails on any skip, so a test that
  needs the database goes in a `_live.py` file, never behind a skip.
- **A skipped check is not a neutral one, and a command that ran the wrong thing
  is worse than no number.** Run the command CI runs, not the one test.
- **Tell him what he is making.** A rebuilt surface keeps producing its old self
  until the prompt, the tool text and the field descriptions are all rewritten —
  and every field he is asked for is something he thinks about.

---

## 6. Links

**The plan, as the owner reads it: Bob, The Build Plan** —
https://claude.ai/artifact/93xBc9gC4yd6XxsXjSjskp (also
https://claude.ai/code/artifact/41329abe-5de8-4168-af7a-9817798877d5). Its source is
`ops/plan/plan.html`; republish with that `url`, or a second artifact is made
and the owner keeps reading the old one.

**The design Bob's page is measured against:** `ops/ideal/the-page-bob-writes.html`
(https://claude.ai/artifact/1ndAsibAefg4iHrdGdfcTf), and the room it sits in,
**Bob, Ahead of Me** — https://claude.ai/artifact/BnwXtA3pPJxwui82FiKbpo
(`ops/ideal/bob-ahead-of-me.html`, the `beside` room).

**Everything before 2026-09-21:** `ops/archive/NOW-to-2026-09-21.md` and
`ops/archive/plan-to-2026-09-21.html`.
