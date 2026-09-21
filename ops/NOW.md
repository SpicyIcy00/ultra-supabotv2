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
  - **The system prompt has no room** (1,799 of 1,800 words). Anything a card
    needs to tell Bob goes on its tool's description or in the yaml, never into
    `SYSTEM_PROMPT`.
  - **An agent never edits** `ops/NOW.md`, `ops/plan/plan.html`,
    `ops/DECISIONS.md` or `CLAUDE.md`. The lead does, once, after the merge.
  - **Before returning**, an agent runs in its own worktree: the backend suite,
    `ops/verify_integration.py pure` (it fails on ANY skip), and for frontend
    changes `cd frontend && npx vitest run` and `npx tsc -b --force`. It returns
    the counts and what it did not finish, never "done" alone.
  - **An agent spends no live model money.** Live measurement is the lead's,
    once per wave.
- **The lead merges in the order the wave lists**, runs every suite after EACH
  merge, and resolves conflicts itself — a conflict in a hotspot is read, not
  taken from one side.
- **Measure once per wave, then say what it bought.** After the merge, the lead
  runs the capability test (`cd backend && ../.venv/Scripts/python.exe
  ../ops/captest.py all`, then `ops/capclean.py` and `--delete` — it writes to the
  live george tables as `bob-capability-test`) and the speed set (a fact, a
  narrow question and a broad one, three runs each). **Several runs, never
  one**: DeepSeek answers one question in 90 to 325 s with the same settings,
  and on 2026-09-21 a "twice as fast" result failed to repeat twice. A
  regression is traced to its card before the wave closes. Report the
  shortfall, never the improvement.
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
- **Never push or deploy** without the owner saying so in that session. Every
  push to `main` redeploys Railway, notes included, so a notes-only commit rides
  the next real push.
- **The owner's prompts are complaints, not designs**, and his diagnosis has
  been right every time. He reports what is wrong; the session decides the fix
  and says why; he reacts to the result. Do not ask him design questions — build
  one and let him point.
- **Rules 5 and 9 bind every card.** No planner, no sub-agents, no multi-stage
  scaffolding: model → tool call → answer, and depth goes in the tools. The
  model never computes a figure; code writes every digit.

---

## 2. Where we are

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
where they were. Scripts: the session scratchpad `captest.py` and `capclean.py`.

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
now, and two agents never edit the same lines. **Eval spend: $0.00** — each wave
is measured once, on live answers (about five cents each, several runs).

### Wave 1 — the base, five agents at once

**The lead's prompt:** *"Read ops/NOW.md. Run wave 1 as a workflow: one agent per
card, each in its own worktree, then merge in order and measure."* Merge order:
W1.1, W1.2, W1.3, W1.5, W1.4 — the broadest change to `agent/loop.py` first, the
frontend last.

- [ ] **W1.1 answers and checks** — the answer is the size of the question, and the checks fix instead of argue (was B1 + B2; decisions in DECISIONS 2026-09-22). **Size:** the scope kinds already exist (`investigation.scope.kinds`: lookup, focused, broad) — tie the ANSWER to them and ENFORCE it in `compose` (a bound per kind, refused like any other over-bound). Lookup: prose and at most one figure, no arrangement. Focused: a short answer, two or three figures at most, and an offer of a page instead of one. Broad: the page. The read budget counts QUERIES run, not decisions made (`get_change` is one decision and seven reads). "Remember that…" is one line and no investigation. DeepSeek gets its effort TOP-LEVEL (it has no `medium` and does not read the per-message marker). A round settles once a compose carries a lede and names the claim. **Checks:** a missing notice is placed by code beside the figure it qualifies, in its reader's line, and the "rewrite the full answer" round goes (`agent/loop.py` 4253-4294); the `negative_on_hand` fingerprint takes "below zero" (`metrics.yaml` ~4832); the forced block stops listing a notice twice; a correction's reply never becomes the answer or its headline; a page resolves only against its own turn's blocks, so no `{key}` borrows an earlier turn's figure or draws "–" after a reload (board.ts `bounded`, render.tsx `inline`); `get_stock group_by state` stops summing negative on-hand (`metrics.yaml` ~5665 against `inventory.history.negative_on_hand.exclude_from_sums`) and draws states as words; the plan list is bounded (four short steps); the single-store `previous_period` comparisons refused six times on "how did Rockwell do" are fixed. **Region:** the gates in `agent/loop.py`, `agent/compose.py`, `agent/reading.py`, the `composition`, `voice` and `notices` keys of the yaml, frontend `board.ts` / `render.tsx` / `doc.tsx`. **Done when:** a fact answers in ~5–15 s and a narrow question in ~20–40 s with an offer rather than a page, and the dashboard turn, replayed, has a headline that is an answer, no forced box, no dash and no negative total.
- [ ] **W1.2 your action words do what they say** — each phrase does exactly one thing and confirms in one line: "keep this" PINS (today it records beliefs and pins nothing); "every Monday" on a workflow delivers to his room (today: *"A schedule needs somewhere to deliver to"*); "I want this every Monday" schedules the REPORT, not the watch; "build it" makes a system whose changes CHANGE it ("add lead time" edits the plan in place, never adds a tile beside it); "what do you remember" reads memory and writes nothing. **Region:** `agent/write_tools.py`, the write services in `backend/app/services/` (pin, workflow, page, standing, watch writers), their tool descriptions in `build_tool_schemas`, and the yaml keys for those tools. **Done when:** the capability test's `keep` and `build` scenarios pass in the same words.
- [ ] **W1.3 one read that already has the picture** — `get_overview` (was B4 + B8): the reads his best broad answers make (the warning list; estate and shops on net sales, transactions and basket against the week before; each shop's week by day; what rose and fell; stockouts), run in code and returned ranked, each finding a one-line FACT written by code with its receipts — the Tableau Pulse pattern — and among them **what caused most of it**: concentration and top-driver findings as yaml definitions ("one shop carried most of the fall"), computed by code, never a share he writes (rule 10). A composite read, so rules 5 and 9 hold; the drill-down tools stay. **Region:** a new module under `tools/`, its registration in the READ dict of `agent/loop.py`, a new `overview:` key in the yaml. **Done when:** a fresh broad question is one read and two rounds, and names the shop or line that carried the change from a read's own row.
- [ ] **W1.4 alive on every page** — one ask line mounted once above both chromes (App.tsx), so `/dashboard`, `/analytics`, `/warehouse`, `/packing` and `/vending` get it too; he answers IN PLACE beside the page (a panel on desktop, a sheet on the phone) with "open in Bob", instead of navigating to `/bob` (RoomShell.tsx:114-115, KeptPage.tsx:239, :461); each page registers what it is and what it shows (`page_id` for kept pages so `view_page` and `edit_page` bind; key, subjects and window for BI pages — never figures); the conversation follows the page (a new thread when the page differs — reverses DECISIONS 1692, "scope belongs to the thread"; the lead records it); and the small bugs: `threadScope` passed on reopen (Room.tsx:180), the rail's New resets (RoomShell.tsx:45), `screenName` for nested paths (RoomShell.tsx:57). **Region:** the frontend shell and hooks, and `page_scope` handling in `backend/app/api/v1/routes/bob.py`. **Done when:** "add date filters to this" on a kept page reads and edits that page without leaving it, and a question on `/warehouse` is answered on `/warehouse`.
- [ ] **W1.5 stock: what runs out, and where to get it** — (was B7 + B10) **running out**: sales speed against what is left, per shop and line, from the per-store levels the products import brings in — a yaml definition, a read, a watch condition, and a line for the morning; a count below zero says it is a broken record, a line with no level says so rather than firing. **Where from**: "Handle the AJI BARN reorder" works (today the warehouse is refused as outside the replenishment scope), and moves from AJI BARN to a shop, or between shops, are suggested before an order — ranked, each with its reason, as a draft the owner keys into StoreHub (its API has no transfer route). **Region:** `tools/replenishment.py`, `tools/purchase_plan.py`, stock tools, a new `stock_cover:` key and the inventory keys of the yaml. **Done when:** a line above zero whose cover is under its window is flagged naming both numbers, and the reorder turn returns a draft instead of a refusal.

### Wave 2 — ahead of you, and running things with you, four agents at once

Starts only when wave 1 is merged and measured. **The lead's prompt:** *"Read
ops/NOW.md. Run wave 2 as a workflow: one agent per card, each in its own
worktree, then merge in order and measure."* Merge order: W2.2, W2.1, W2.3, W2.4.

- [ ] **W2.1 the morning, answered before you ask** — a standing question at the slot the owner names (born off; he switches it on, rule 7) answers "how are we doing" on `get_overview`, and the room opens on it; asked again that day it is reused until the data changes, stamped with its read time; `usual_weekday` (the same weekday over several closed weeks) defined in the yaml; the attention line carries no internal id. **Needs from the owner: the time, and the switch.** **Done when:** the room opens on the morning's page with nothing typed, and a same-day repeat costs no model turn.
- [ ] **W2.2 authority, requests and approvals** — the owner's §15 as real rules: a threshold setting ("under ₱20,000, don't interrupt me") that routes drafts to a list instead of a notification; requests from other people ("managers request, I approve") as a queue he approves, rejects or changes; "you don't need my approval for this anymore" kept as a versioned rule with its history. Level five holds — nothing is sent on its own. **Needs from the owner: who the managers are** (the users table has a role column and no managers). **Done when:** a draft under the line lands in the list quietly, and one over it arrives as a decision with Approve · Change · Look into it.
- [ ] **W2.3 dismiss it with a reason, and he learns** — dismissing a watch post, a morning finding or a proactive item takes one tap for why ("known", "not important", "wrong"); the reason becomes a belief that quiets that kind of item next time, with a way to see and undo what he has learned. **Done when:** a dismissed kind stops reappearing and the memory view shows why.
- [ ] **W2.4 the big answers as designed pages** — from the research: every product that feels designed uses a fixed human design, an outline first, a few layouts and restraint. Bob picks a page type built from `ops/ideal/the-page-bob-writes.html` — the week, one finding, a comparison — and writes into it; code builds it to the design. "Build me a dashboard" opens the real dashboard (george.pages) in the room instead of a report. **Done when:** a broad page reads like the target and a dashboard request opens a dashboard.

### Wave 3 — a new source

- [ ] **W3.1 photograph a delivery receipt** — a photo becomes a draft receiving record matched to its purchase order, each line confirmed by a person and marked as extracted, never trusted as vetted data. **Needs from the owner:** a yes to a paid image-reading model for photos only (DeepSeek's cheap tier cannot read images), and where the photos come from. **Done when:** a real receipt photo produces a draft whose every line he can accept or correct.

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
    .venv\Scripts\python.exe ops/cost_report.py --days 7
    .venv\Scripts\python.exe ops/sweep_gaps.py --days 7

**`ops/frames.py --scenes` REWRITES `frontend/src/frames/scenes.json` WITH ONLY
THE SCENES NAMED** — restore it before committing (it went from seven scenes to
one on 2026-09-21 and was committed that way).

**Where a turn's time went** is in `george.conversations.iteration_ms` (one entry
per round) and `george.tool_calls` (every read, with its arguments); which model
answered is `george.conversations.model`. Read the record before re-running
anything paid.

Railway: `https://ultra-supabotv2-production.up.railway.app/health` names the
live build. The room is Vercel, at `https://thesupabot.vercel.app`.

---

## 5. Standing facts a session keeps getting wrong

- **Never print a secret's value** — the NAME and set/unset only. See CLAUDE.md.
- **The store list lives in `definitions/metrics.yaml` and nowhere else.**
- **Bob answers on DeepSeek (`deepseek-chat`) by default**; its `v4-pro` is five
  times slower and worse on this loop, and `medium` is `high` there.
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
