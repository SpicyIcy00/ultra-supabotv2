# NOW — read this first

The state of play for Bob, kept current. **Every working session starts by
reading this file.** It exists so a prompt can be one line.

**THIS IS THE ONLY THING WE ARE DOING.** Replaced 2026-09-21 at the owner's word:
*"i want you to fully replace the now.md and plan artifact for now this is the
only thing were doing."* One goal — **the page, fast** — and the five cards in §3.
Every card, decision and number from before today is in
`ops/archive/NOW-to-2026-09-21.md` (the old plan page beside it); nothing in
it is lost and none of it is being worked on.

Five files, five jobs: **CLAUDE.md** — the rules that do not change;
**ops/STANDARD.md** — the owner's product vision, the standard work is measured
against; **ops/DECISIONS.md** — why the rules got there, and every investigation
in full (today's is under 2026-09-21, *"why a broad answer takes minutes"*);
**ops/DOGFOOD_LOG.md** — what is wrong with Bob in the owner's own words;
**this** — where we are. If this file disagrees with a memory or an old plan,
this file wins. **A defect under Open in DOGFOOD_LOG outranks every card here.**

---

## 1. How we work

- **One branch: `main`.** No feature branches, no worktrees left behind.
- **One session, one card**, in the order of §3. Do not start the next card in
  the same session.
- **Measure, then say what it bought.** Every card ends with the same broad
  question answered before and after, **on several runs, not one**. DeepSeek
  answers the same question in anywhere from 90 to 325 seconds with the same
  settings, so one fast run is luck, and on 2026-09-21 a "twice as fast" result
  failed to repeat twice. Report the shortfall, never the improvement.
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

**The page works and it is slow.** "How are we doing?" takes **~240 s on
DeepSeek** (the default provider) and ~125 s on Opus. On Sept 14–16 it took
**~30 s**.

**Measured 2026-09-21, from `george.conversations`:**

- **It was not the page.** The jump came on the evening of Sept 17 — when Bob
  was asked to write a thought for every chart (`c6226ee`) and choose from 17
  chart types instead of 6 (`eeb7c7d`) — three days before the page. The
  compose tool grew 11,705 → 27,413 characters and 11 → 19 fields per block,
  with no bound on it.
- **On DeepSeek, 75–91% of everything generated is thinking.** The whole page is
  about a tenth. Thinking runs at roughly 1,000 characters a second, so thinking
  is most of the wall-clock.
- **One round — the one that builds the page — is a median 59 s of a 130 s
  turn.** A typical broad answer takes 6 rounds; 18 of 25 spent at least one
  round correcting itself.
- **Reads went 4 → 20–30** per broad answer, and it is the same investigation
  every time, redone from scratch against data that syncs once a night.
- **DeepSeek has no `medium`** (it maps to high) and does not document the
  per-message effort marker the loop uses, so in production **it very likely
  thinks at full strength on every question.** Top-level `low` averaged ~152 s
  against ~241 s at high on three runs, with half the thinking and good pages —
  a lean, not proof.
- **Switching thinking off is not the answer:** 24 s, and it said the estate was
  "flat" when it fell 4.5%.

**The provider.** DeepSeek's cheap tier (`deepseek-chat`, an alias for
`deepseek-v4-flash`) is the default in `agent/provider.py`; `BOB_PROVIDER=anthropic`
restores Opus. Railway needs only `DEEPSEEK_API_KEY`.

---

## 3. The cards

The order is the owner's, agreed 2026-09-21. **Estimated, not measured:** a
fresh broad question ~40–70 s after F1 and F3; the morning and a same-day repeat
~0 s after F2. Each card replaces an estimate with a number. **Eval spend for
the five: $0.00** — each is measured on a handful of live answers instead, about
five cents each.

- [ ] **F1 one read that already has the picture** — `get_overview`: every read his best broad answers make, run in code and returned COMPACT and RANKED. What they make, measured over 23 broad turns since Sept 19: the warning list (`get_attention`, 22 of 23); the estate and each shop on net sales, transactions and average basket against the week before (16–19 of 23); each shop's week by day (19); what rose and what fell by product (15–16); the shelf — stockouts over the week (19). Each finding comes back as a ONE-LINE FACT written by code, with its row and receipts beside it — the Tableau Pulse pattern (models reason over templated facts far more easily than raw rows), and rule 9 holds because code writes every digit. A composite read like `get_change`, so rule 5 holds. The drill-down tools stay, so the breadth the blind panel rewarded is kept, computed once. **Done when:** a fresh broad question is one read and two rounds, measured over several runs, and the page is judged against today's.
- [ ] **F2 the morning, answered before he asks** — the data syncs once a night and he asked the broad question seven times on 2026-09-21 against identical data, redoing every read each time. A standing question answers "how are we doing" at the slot the owner names — born off, switched on by him (rule 7) — and the room opens on its page; asked again the same day, the answer is reused until the data changes, stamped with when it was read (rule 6). Also from the old P3.b: the attention figure carries no internal name (`sales_vs_same_weekday|Fairview|` is an identity, never text), and `usual_weekday` — the same weekday over several closed weeks — is defined in metrics.yaml before anything draws it. **Needs from the owner: the time, and the switch.** **Done when:** the room opens on the morning's page with no question typed, and a same-day repeat costs no model turn.
- [ ] **F3 he writes the findings, code lays them out** — he emits, per section, a `head` that states the finding, one to three `say` lines and the keys of the figures it rests on; code derives chart type (`default_composition.shape_for`, his override kept), size (`roomFor`), pairing (`pageOf`'s PAIRABLE) and caveat placement, and compiles the same arrangement the renderer already draws, so posts and the frontend do not change. Every word stays his; the layout is written once instead of twice; "left a figure off the page" becomes impossible, so the page gate's round goes. Keys stay his, for change-by-key and "this is that"; compiled blocks must not carry `default`. The derivation thresholds move into metrics.yaml. It is also the flat, self-contained shape that makes F5 possible. **Done when:** a broad page is written as sections and draws within measure of today's, measured for time over several runs.
- [ ] **F4 what the other cards leave** — **(a)** DeepSeek gets its effort TOP-LEVEL, where it reads it, never `medium`, and `low` on broad questions if F1–F3 have not already made it moot — measured, because it is a lean from three runs; **(b)** a round settles once a compose carries a lede and names the claim, instead of costing another round for words beside it (the first live page lost ~100 s to that); **(c)** the text that asks for fields no page draws — `voice.reading.path`, the board addendum's `question`/`under` sentences, the compose docstring's "a thought: one or two sentences" — and the unused `spec` (0 of 186 blocks), if F3 has not removed them; **(d)** the recipe asks for a `span` and forbids the `thought` a span needs, and the validator drops a span without one, so every span he is asked for is thrown away; **(e)** after a correction, DeepSeek's answer replied to the correction instead of the owner ("You're right —") 2 of 7 times — a controlled test did not reproduce it, so find the cause before claiming a fix. **Done when:** each is measured before and after, and the ones that bought nothing are said to.
- [ ] **F5 the page appears while it is written** — mark `compose` for eager input streaming, forward `input_json_delta` (the loop drops it today), parse leniently and draw each section as it closes, shown as provisional (UI rule 8) until the checks pass. It hides only the last part of the wait, because most of the time is thinking before any of the page is written; and whether DeepSeek streams tool arguments at all is undocumented, so measure it first. **Done when:** the first section is on screen before the turn ends, on the provider Bob runs on.

**One decision that is the owner's, and it is open:** the costliest correction is
"you did not surface this caveat — rewrite your whole answer." Code could place
the notice beside the figure it qualifies itself and save that round, but saying
it in his own words is a trade the owner chose (`agent/loop.py` 3859–3867).
Nobody changes it without his word.

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
