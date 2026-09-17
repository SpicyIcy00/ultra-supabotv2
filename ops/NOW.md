# NOW — read this first

The state of play for George, kept current. **Every working session starts by
reading this file.** It exists so a prompt can be one line without a fresh
session having to re-derive where everything is.

Five files, five jobs: **CLAUDE.md** holds the rules that do not change (1,493
words since P0.2), **ops/STANDARD.md** holds the owner's FINAL PRODUCT VISION (2026-09-16; it replaced the 26) — the
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
- **THE LAST THING ON SCREEN IS WHAT THE OWNER HAS TO DO. Short, plain, and
  numbered.** Added 2026-09-14, when he read a full close-out and asked *"so
  what do i need to do?"* — which is the question a close-out has to answer
  and had not.

  The close-out above it stays: it is the record, and the next session reads
  it. What changes is that it is not the END. After it, **three lines at most,
  a numbered list, no numbers in them**, saying only what is HIS to do:
  usually push or not, then what to look at and what to say if it is wrong.
  Nothing he cannot act on goes in it — a shortfall belongs in the close-out,
  not in his list, unless it is a thing he decides.

  **If there is nothing for him to do, say that in one line.** "Nothing —
  I'll carry on with the next card" is a complete answer and is better than
  inventing a task.
- **UPDATE BOTH COPIES OF THE PLAN, IN THE SAME COMMIT.** §3 is what a session
  reads; **`ops/plan/plan.html` is what the OWNER reads**, published at the
  link in §6. Closing a card, adding one, or changing what one costs changes
  both. `tests/test_plan_alignment_contract.py` fails if they disagree — on
  which cards are open, what each spends, the totals, the per-phase counts, or
  two cards sharing a prompt — so this is enforced, not remembered. Then
  republish: the Artifact tool, `url` set to the link in §6, `file_path` to
  `ops/plan/plan.html`. **They drifted four times on 2026-09-13** and a person
  caught every one; the page lived in a session's scratchpad, which is deleted
  when that session ends, so no later session COULD have updated it. That is
  why it is in the repo.
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
| Head | **`0b1808c` — pushed 2026-09-17: 43 commits (the standard, the artifact series, the Phase 2S plan), none touching deployable code, so nothing moved on Railway or Vercel.** Before them, the last deployable change: two dogfood fixes off his screenshots — a `QueryCanceled` was the whole answer, and `[Calls behind this answer: …]` was printed as prose. **BACKEND** (`agent/loop.py`, `tools/purchase_plan.py`, `definitions/metrics.yaml`, `ops/sweep_gaps.py`) so Railway deploys it and `/health` confirms it; **no migration**; **prompt byte-identical at 1,797 words, sha `bf57bd75`** — the new `failures` block is read at failure time, not into the cached prefix. 1,836 → 1,848 pure. Before it, **`22252c9` — pushed and live 2026-09-16 (Vercel).** Two tiles are PLACED, not balanced by height. **The morning's row rule fixed the wrong case**: read out of `george.posts`, the turn he screenshotted composed ONE block (a `change` to an object carried from an earlier turn) and both charts are `default_blocks`, so the board is three objects with both charts in the PACK — `data-rest="2"`, where a `data-rest="1"` rule could never fire. And the pack used `columns: 2`, which places by balancing HEIGHT: right for a pack of many, a coin toss for two equal tiles. Two and three are a grid now. **No backend file.** **MEASURED ON VERCEL: bundle read 05:34:25, pushed 05:34:28, `index-DqYRonHn.js` serving at 05:35:31 — 63 s**, against 50 s on `2017d79`; two measured frontend swaps now where the project had none. **VERIFIED FROM THE SERVED STYLESHEET** `index-BXJxoV6_.css`: the pack rule reads `display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start`, the row rule is there for the one-each case, one `--measure: 1320px`. **Still nobody has seen a pixel.** Before it, **`2017d79` — pushed 2026-09-16, and the FIRST FRONTEND DEPLOY THIS PROJECT HAS EVER MEASURED OR VERIFIED.** A page is a frame and a frame does not move: `--measure` no longer comes from the object count, the room has one frame, and a small board is a row rather than a stack. **No backend file** — the newest commit Railway runs is still `8f6824b`, already live inside `15d4ef7`, so Railway has nothing here to deploy and its sha label will drift to this commit on its own schedule meaning nothing. **MEASURED ON VERCEL, which no session has been able to do before**: bundle read at 05:11:53 UTC as `index-Dv-DyaVm.js`, pushed 05:11:55, `index-Dfdlylb6.js` serving at **05:12:45 — 50 s push to live**, no failed fetch in the window. **AND VERIFIED FROM PRODUCTION RATHER THAN FROM THE WORKING TREE**, which is the part that matters after three blind layout fixes: the live stylesheet `index-CXiM_7T8.css` carries `[data-rest="1"]:has(.r-board-lead){display:grid;grid-template-columns:1fr 1fr…}`, declares exactly one measure (`--measure: 1320px`), and contains **zero** rules setting a measure from `data-rest`. `:has()` and `:not(:has())` both survive minification. **What that still does not say is whether it LOOKS right** — no session has rendered a pixel. Before it, **`15d4ef7` — pushed and live 2026-09-16**: P2.m, the ladder climbed for an intent and a view owed (`8f6824b`, plus this row's own docs commit). **No migration.** **`SYSTEM_PROMPT` MOVED FOR THE FIRST TIME SINCE `c87fda5`: 1,791 → 1,797 words, sha `ee1d17d1` → `bf57bd75`**, and the `get_sales` tool schema with it — so this is a BACKEND deploy and `/health` can confirm it. The only files it runs are `definitions/metrics.yaml` and `agent/loop.py`; no frontend file is touched. Before it, **`815a614` — pushed and live 2026-09-15**: a chart of seven shops opens no shop. A block's subject fell back to `subjectOf(rows[0])`, so clicking a chart of the estate opened whichever shop sorted first — Greenhills. **No migration**, no backend file. Before it, **`46043e3` — pushed and live 2026-09-15**: a name may contain spaces, and categories have a door. Two of his reports in one message. **The client closed the `@` mention at the first space**, so `@Kiamoy strips` was never sent — and **3,719 of 3,728 product names contain a space**, so that door had worked for nine products since it was built. `tools/products.get_product_categories()` is the session's one new read (17 categories, verified against production) and is deliberately **not** in the model's schema. **No migration**, prompt byte-identical at 1,791 words sha `ee1d17d1`, schema still 15 tools. Before it, **`463c21f` — pushed and live 2026-09-15**: a warehouse in the `@` menu says it is one. Before it, **`fe60ce3` — pushed and live 2026-09-15.** Three estate corrections, all his own reports on P2.g inside one evening: AJI CMG is a warehouse and vending is the business; neither warehouse is filed as `retail` any more; and **the switch is BUSINESSES, so the warehouses lost their pills** — All · Aji Ichiban · vending. **No migration on any of them**, prompt byte-identical throughout at 1,791 words sha `ee1d17d1`. The third one found a THIRD copy of the store groups in Python (`backend/app/services/mentions.py`) and fixed it, without which `@AJI CMG` completed to nothing and the pill it replaces was its only door. **No migration**, prompt untouched at 1,791 words sha `ee1d17d1`; the only backend file is `definitions/metrics.yaml` and `agent/surface.py`, neither on the cached prefix. Before it, **`3bb55f2` — pushed and live 2026-09-15**: P2.g, the estate switch — four pills above the board, and which business a question is about travels beside the selection. **No migration.** `SYSTEM_PROMPT` is byte-identical at **1,791 words, sha `ee1d17d1`**: the estate rides the QUESTION, never the cached prefix, and the one prompt edit reads "AJI CMG" out of `stores.vending_stock_location` instead of having it typed — the same bytes, from the definitions. It touches BOTH platforms: Railway for `/definitions/desk` and the `desk.estate` field, Vercel for the pills. Before it, **`fd1ca6a` — pushed 2026-09-15**: a claim about two rows may light two rows. **It is `origin/main` and this file did not say so** — the row below still named `4cede90` as head, so a session reading it would have believed the emphasise fix was unpushed. No `/health` reading was taken for it. Before it, **`4cede90` — pushed and live 2026-09-15**: "compare these" is a question and the shop token is gone. **No migration**, prompt untouched at 1,791 words sha `ee1d17d1`. Before it, **`15e02d3` — pushed and live 2026-09-15**: a token names two shops instead of printing their ids. **No migration**, prompt untouched at 1,791 words sha `ee1d17d1`. Before it, **`f2d2585` — pushed and live 2026-09-15.** The opened object draws a change through `Delta` like every other surface, and its FIRST tests: it was `vi.mock`ed out of five suites and rendered by none, which is how it kept a second visual vocabulary. **No migration**, prompt untouched at 1,791 words sha `ee1d17d1`. Before it, **`b5f8791` — committed, NOT pushed.** The opened object draws a change through `Delta` like every other surface. Before it, **`eeb9aae` — pushed and live 2026-09-15**: the memory that stopped at four, and a refusal outliving its gesture. **No migration on either**, and `SYSTEM_PROMPT` is untouched at 1,791 words, sha `ee1d17d1`. Before it, **`fb6c4f5` — pushed and live 2026-09-15.** One commit: the dogfood log's top three items — the tap that was never built, and the refusal written for the model. **No migration.** `SYSTEM_PROMPT` is byte-identical at 1,791 words, sha `ee1d17d1`: the only `definitions/metrics.yaml` change is a `surface.desk.replay` block nothing on the model path reads. It touches BOTH platforms — Railway for the route serving `surface.prose.leaks`, Vercel for the room — and `/health` can only confirm the first. Before it, **`c87fda5` — pushed and live 2026-09-15.** One commit: P2.f, the memory drawn as a finding, what a person taught him, and Forget. **IT CARRIES THE FIRST MIGRATION SINCE P1.h** — `x8y9z0a1b2c3`, five columns on `george.beliefs`, a `NOT VALID` grounding check and the partial index re-cut. **It had been run on no machine at all before this push** (no local Postgres, no Docker, and `ops/local_postgres.py` wants binaries the checkout does not carry), so Railway executed that DDL first and cold. **It ran**: `/health` reports `x8y9z0a1b2c3` current and expected. `SYSTEM_PROMPT` moved for the first time since P2.c — 1,799 → 1,791 words, sha `fa166e19` → `ee1d17d1` — and the `record_belief` tool schema with it. Before it, **`2de57c9` — pushed and live 2026-09-15.** Two commits: P2.e, the walk, and the build fix under it. **No migration, and the only backend file is `definitions/metrics.yaml`** — a `surface.desk.work.replay` block that nothing on the model path reads, so `SYSTEM_PROMPT` is byte-identical at **1,799 words, sha `fa166e19`**, the same value P2.d recorded. Before it, **`f8762a4` — pushed and live 2026-09-15.** One commit: the colourless-rows fix off his second report of the day — every store keeps the direction its own tool measured, emphasis is weight. **No migration, no backend file.** Before it, **`e561a29` — live 2026-09-15.** One commit: P2.l, the shell stops carrying identity. **No migration, and no backend file** — the only Python touched is none at all; it is `frontend/src/room` plus the four ops documents. `SYSTEM_PROMPT` is untouched at 1,799 words. **THE SWAP WAS NOT WATCHED**: `/health` was read once, after it had already happened, so there is no 502 count for this one and none should be invented. **The room is served by VERCEL**, not by the build `/health` names, so a healthy backend is not evidence the new board is being served — a hard refresh is. Before it, **`51af583` — pushed and live 2026-09-15.** One commit: P2.c, the id behind a tapped subject, the `@` door and the two-shop comparison. **No migration.** It is the first commit since P1.h to touch a MODEL-FACING file: `definitions/metrics.yaml` gained a fourth subject dimension, and the desk sentence lists them, so `SYSTEM_PROMPT` went 1,798 → 1,799 words. Before it, **`b21533c` — live 2026-09-15.** One commit: P2.b, the figure markers, the two-voice scan and the five-colour guard. **No migration**, and **no backend file at all** — the only Python touched is `tests/test_visible_work_contract.py`, which tightened an existing contract onto the new rendering. A docs commit recording this deploy sits above it and is docs-only. Before it, `81c677c`: P2.0 (`13795bb`), the plan page (`07a7d3a`), the Fable-review correction (`81c677c`), and `896805c`, the Fable 5.1 review paragraph, which was already uncommitted in the tree when the P2.0 session started and was committed on its own rather than swept in. |
| Live | **AND THE ROOM HAS AN ADDRESS AT LAST: `https://thesupabot.vercel.app`.** It came off the STATUS BAR of his own screenshot 2026-09-16, not from anybody asking — nine close-outs have said "nobody has seen it in a browser" and the Live row has said Vercel's origin is written down nowhere. It is written down now, here and in §4. **AND IT HAS A BUILD FINGERPRINT AFTER ALL**, which is the part worth having: the SPA's entry bundle is content-hashed, so `curl -s https://thesupabot.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9._-]*\.js'` names the build — `index-Dv-DyaVm.js` at 05:0x UTC 2026-09-16, the same on `/` and on `/dashboard`. **It is not a sha and cannot be mapped to a commit**, but it CHANGES when the built content does, so a frontend swap can be watched exactly as Railway's is: read it before the push, poll until it differs. That is the thing nine close-outs said did not exist. **What it still cannot do is tell you the page LOOKS right** — that is a hard refresh and a human pair of eyes. **`15d4ef77`**, confirmed from `/health` 2026-09-16: healthy, schema `x8y9z0a1b2c3` current and expected, deployment `7a2233d3`, `george_pool` cap 8 with nothing in use, **no migration**. **MEASURED, AND THE TIGHTEST BOUND THE LOG HAS**: pushed 04:33:27 UTC, `cab4b62f` served continuously from 04:33:38 to **04:34:10**, and 200 on `15d4ef77` at **04:34:16** — so the swap is inside a six-second window and push-to-live is **43–49 s**. `GET /george/definitions/desk` and `GET /george/mentions?q=Seik` both answer **401**, so the routes are served and gated. **THIS IS THE FIRST DEPLOY SINCE `c87fda5` THAT CHANGES WHAT THE MODEL READS** — prompt 1,791 → 1,797 words, sha `ee1d17d1` → `bf57bd75` — so unlike the last nine rows, `/health` confirming the sha IS confirmation of the change. **AND THE FIRST POLL CORRECTED THE ROW BELOW.** It read **`cab4b62f`**, not `815a6148`: Railway had deployed `af92b70`, `d43eda5`, `5228984` and `cab4b62` after all. So the previous row's reading — that a frontend/ops commit produces no Railway swap — is **WRONG**, and the manual redeploy it describes was not needed for the reason it gives. What is true is narrower and still worth keeping: **a docs or frontend commit changes nothing Railway RUNS**, so its swap is invisible in behaviour and not worth watching — but the sha label does move, on its own schedule, and a session must not conclude from a label that has not moved in six minutes that it never will. The previous reading, kept: **`815a6148`**, confirmed from `/health` 2026-09-16 — and **one commit behind `main` ON PURPOSE, which cost a manual redeploy to learn.** He watched `5228984` not swap for six minutes and redeployed Railway by hand, saying *"something was wrong"*. Nothing was: **the newest commit containing ANY backend code is `46043e3`**, and `815a614` is newer than that. Everything after it — `af92b70`, `d43eda5`, `5228984` — is `frontend/` and `ops/` only. **Railway is not behind on a single line it runs**; its sha label is behind, and the label is the only thing that is. **SO `/health` CANNOT CONFIRM A FRONTEND FIX, AND A SESSION MUST SAY SO RATHER THAN WATCH FOR A SWAP THAT IS NOT COMING.** Before watching, check whether the commit touches `backend/ agent/ tools/ definitions/ alembic/ requirements.txt` at all: `git log -1 --format=%h -- backend/ agent/ tools/ definitions/`. If the answer is older than the live sha, the deploy to watch is **Vercel's** and there is nothing here to see. **AND VERCEL CANNOT BE CHECKED FROM A TERMINAL AT ALL, because its origin is written down nowhere.** `DEPLOYMENT_GUIDE.md` has `https://your-app.vercel.app` placeholders and nothing else; no ops file names the real one. That is why "nobody has seen it in a browser" has been the shortfall on nine cards running: **there is no `/health` for the half of the product he actually looks at.** One URL from the owner closes it. The reading itself: healthy, schema `x8y9z0a1b2c3` current and expected, deployment `1a28baba`, **no migration**. The previous reading, kept: **`815a6148`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **MEASURED, AND THE FIRST SWAP THIS SESSION THAT IS**: pushed 15:57:59 UTC, `3f632962` served continuously to 16:00:58, **one 502 at 16:01:11**, and 200 on `815a6148` at **16:01:23** — **204 s push to live**, 25 of 26 polls served. **That is two to four times the 52–92 s of the measured swaps earlier today**, on a commit carrying no backend file at all (the only Python is `tests/`), so it is the platform's and not the diff's — and it is the widest spread the log has on this number. The watcher's `$TEMP` fix is what makes this row measurable at all. The previous reading, kept: **`46043e37`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, deployment `d6882c73`, **no migration**. **ZERO 502s — 48 of 48 polls served over 8m 56s**, watched from 8 s after the push, which is the second clean swap of the eighteen watched. `GET /george/definitions/desk` and `GET /george/mentions?q=Kiamoy%20strips` both answer **401**, so the routes this change touches are served and gated. **AND THE WATCHER'S OWN BUG IS FIXED, WITH THE CAUSE I GAVE IT LAST TIME CORRECTED.** The previous row said the per-poll build parse failed because it used "the system `python`, not the venv's". **That was wrong.** `curl` under Git Bash writes `/tmp/h.json`, which Git Bash maps to a real Windows path; the venv's Python is a NATIVE Windows interpreter, where `/tmp` means `C:\tmp` and does not exist. Either interpreter fails the same way, and the venv one did. A probe that writes with one toolchain and reads with another has to use a path both agree on (`$TEMP`). **What that costs the record: `fe60ce3`'s swap timing stays bounded and unmeasured, and this row is the first with a build attributed per poll.** **The room is VERCEL's**, so a healthy backend is not evidence the `@` menu is fixed — a hard refresh is. The previous reading, kept: **`fe60ce37`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, deployment `c1c1eaa4`, `george_pool` cap 8 with nothing in use, **no migration**. **ONE 502, at 14:52:55 UTC, and 44 of 45 polls served over 8m 21s** with nothing after it. **The poll started BEFORE the swap this time** — `/health` read `3bb55f22` immediately before the push at ~14:51:35 — so the swap is bounded at about **91 s**. **It is bounded and not measured, and the reason is a bug in the watcher, not in the deploy**: the per-poll build parse failed on every line (the system `python`, not the venv's), so every reading says 200 and none says which sha answered. The 502 is attributed to the restart because that is the pattern of the last six swaps, not because a reading says so. **A session quoting this should say which.** `GET /george/definitions/desk` and `GET /george/mentions?q=CMG` both answer **401** on the live build, so the two routes this change touches are served and gated. **The room is VERCEL's**, so a healthy backend is not evidence the three pills are being drawn — a hard refresh is. The previous reading, kept: **`3bb55f22`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, deployment `1eb96c2e`, `george_pool` cap 8 with nothing in use, **no migration**. **ONE 502 at 14:12:09 UTC**, 200 either side of it, **39 of 40 polls served over 8m 20s** with nothing after the swap. **The poll started after the push and the first readings were not attributed to a build**, so push-to-live is NOT measured for this one and nothing narrower than "inside three minutes" should be claimed. **It carries the estate switch with the pill the owner then corrected**, so the live build says AJI CMG is vending and the fix is unpushed. The previous reading, kept: **`4cede908`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **Pushed 13:19:19 UTC, one 502 at 13:20:05, 200 on `4cede908` at 13:20:11 — 52 s push to live, measured**, and **149 of 150 polls served over 9m 10s** with nothing after the swap. The previous reading, kept: **`15e02d3d`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **Pushed 13:06:35 UTC, 502s at 13:08:27, :31 and :34, 200 on `15e02d3d` at 13:08:39 — 124 s push to live, measured**, and **147 of 150 polls served over 9m 27s** with nothing after the swap. **THREE 502s, THE WORST OF THE LAST FOUR** and on a commit carrying no backend file at all — the only Python touched is `tests/`. Fourth confirmation that the 502s are the platform's restart and not the diff. The previous reading, kept: **`f2d2585c`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **Pushed 12:18:49 UTC, one 502 at 12:19:38, 200 on `f2d2585c` at 12:19:42 — 53 s push to live, measured**, and **149 of 150 polls served over 9m 32s** with nothing after the swap. **Three consecutive swaps now at exactly one 502 and a clean tail, all three watched from before the push** — which is what the ordinary reading looks like when it is measured rather than sampled. The previous reading, kept: **`eeb9aae3`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **Pushed 12:07:35 UTC, one 502 at 12:08:58, 200 on `eeb9aae3` at 12:09:07 — 92 s push to live, measured**, and **149 of 150 polls served over 10m 3s** with nothing after the swap. Two swaps running now at one 502 and a clean tail, both watched from before the push. `b5f8791` is committed and not pushed, so the live build does NOT have the panel's change colour. The previous reading, kept: **`fb6c4f59`**, confirmed from `/health` 2026-09-15: healthy, schema `x8y9z0a1b2c3` current and expected, **no migration**. **THE CLEANEST SWAP OF THE FIFTEEN, AND THE FIRST WATCHED PROPERLY ALL THE WAY THROUGH.** Pushed 11:48:55 UTC, 200 on `a14f2454` from 11:48:48, **one 502 at 11:49:41**, 200 on `fb6c4f59` at 11:49:47 — **52 s push to live, measured**, and **149 of 150 polls served over 8m 47s** with nothing after the swap at all. That last clause is the point: the previous swap's monitor stopped the moment the new sha answered and missed a second restart two minutes later. This one polled seven minutes past it and there was genuinely nothing. `GET /george/definitions/desk` and `POST /george/beliefs/{id}/forget` both answer **401**, so both are served and gated. The previous reading, kept: **`c87fda56`**, confirmed from `/health` 2026-09-15: healthy, **schema `x8y9z0a1b2c3` current and expected**, deployment `ece27020`, `george_pool` cap 8 with nothing in use. **THE MIGRATION RAN, AND THAT IS THE ONE THING THIS READING IS FOR** — the DDL had been rehearsed nowhere, so the deploy was the rehearsal. **THE SWAP WAS WATCHED FROM BEFORE THE PUSH, so the latency is MEASURED and not bounded for the first time**: pushed 11:17:46 UTC, 200 on `68ce93dc` continuously from 11:17:49, **two 502s at 11:18:46 and 11:18:49**, and 200 on `c87fda56` at 11:18:52 — **66 s push to swap**, 23 of 25 polls served. **This is the first watched swap that carried a migration at all**, so it is the only data point on that path: two 502s and 66 s, against an ordinary reading of one 502. It says nothing about the 50-minute outage on `8b0325a`, which is still unexplained. `POST /api/v1/george/beliefs/{id}/forget` answers **401** on the live build rather than 404, so the new route is served and gated. **AND THE MIGRATION COST THE SWAP NOTHING, which is the one thing a single data point could not have said.** The poller ran on for another six minutes and caught the DOCS commit `183a3aa` deploying behind it — 502s at 11:20:48 and 11:20:52, **two, the same as the migration's**, on a commit carrying no Python, no schema and no frontend. Two swaps 116 s apart, one with five columns of DDL and one with a markdown file, cost the same. So the 502s are the platform's restart, as `f8762a4`'s 18 already suggested, and `alembic upgrade head` added nothing measurable. **4 of 130 polls failed over 7m 15s**, in those two pairs and nowhere else. `schema_checked` read `cached` on the second probe and `live` is what the first reported; neither is a fault. The previous reading, kept: **`2de57c9c`**, confirmed from `/health` 2026-09-15: healthy, schema `w7x8y9z0a1b2` current and expected, deployment `13121632`, `george_pool` cap 8 with nothing in use and a peak of 0, **no migration**. **THE SWAP WAS WATCHED AND COST ONE 502** — a poll at ~3 s read 200 on `7cb1ea5f` from 10:31:07 UTC, one 502 at 10:31:24, and 200 on `2de57c9c` at 10:31:27, with 12 of 12 polls 200 after it. **Push to swap is under 60 s** and nothing narrower should be claimed, because the poll started after the push again. **WHAT THIS READING CORRECTS: the backend was never red.** `/health` was serving `7cb1ea5f` before this push, so Railway deployed P2.d's commit fine — the `tsc -b` failure is **VERCEL's**, which serves the room, and no session has looked at a Vercel build from a terminal yet. So "nothing has deployed since `8037259`" was true of the FRONTEND and false of the backend, and a session should say which. The previous reading, kept: **`f8762a46`**, confirmed from `/health` 2026-09-15: healthy, schema `w7x8y9z0a1b2` ok, deployment `17bc522f`, **no migration**, and 15 of 15 polls 200 after it settled. **THIS SWAP WAS WATCHED AND IT COST 18 CONSECUTIVE 502s** — the worst of the twelve watched, against a previous worst of 4 — on a commit carrying no backend file and no migration, so the outage is the platform's restart and nothing in the diff. **Nobody should quote "one or two 502s" as the ordinary reading again without saying this one happened.** The previous reading, kept: **`e561a294`**, confirmed from `/health` 2026-09-15: healthy, schema `w7x8y9z0a1b2` current and expected, deployment `61a2cf3a`, `george_pool` cap 8 with nothing in use and a peak of 0, **no migration**. Read once, after the swap, so **no 502 count for this deploy**. The previous reading, kept: **`51af583e`**, confirmed from `/health`: healthy, schema `w7x8y9z0a1b2` current and expected, deployment `c978adc5`, `george_pool` cap 8 with nothing in use and a peak of 3, **no migration**. **ONE 502 in the swap** — a poll at ~3 s read 200 from 07:45:30 UTC, one 502 at 07:46:04, and 200 on `51af583e` after it: 99 of 100 polls served. `GET /api/v1/george/mentions?q=Seik` answers **401** on the live build rather than 404, so the new route is served and gated. The previous reading, kept: **`b21533ca`**, from `/health`: healthy, schema `w7x8y9z0a1b2` current and expected, deployment `633119fb`, `george_pool` cap 8 with nothing in use, **no migration**. **THE SWAP COST NOTHING — not one 502.** A poll at ~3 s read 200 continuously from 06:49:52 UTC on `4ade8c43`, and **200 on `b21533ca` at 06:50:41**, with no failed reading between them: the first clean swap of the ten watched. **The push-to-swap latency is BOUNDED, not measured**, because the poll started after the push again — the first reading was 06:49:52 and the new build answered at 06:50:41, so it is **under 55 s** and nothing narrower should be claimed. Read `/health` rather than believing this row. |
| Last deploy | `815a614`, and before it `3f63296` (docs), and before it `46043e3`, and before it `463c21f`, and before it `b866592` (docs), and before it `fe60ce3`, and before it `3bb55f2`, and before it `fd1ca6a`, and before it `4cede90`, and before it `15e02d3`, and before it `f2d2585`, and before it `eeb9aae`, and before it `fb6c4f5`, and before it `183a3aa` (docs) and `c87fda5`, and before it `2de57c9`, and before it `f8762a4`, `e561a29`, `51af583`, `b21533c`, `81c677c`, `1267b52`, `e1ceb5e`, `9261c2e`, `ab01579`, `69d1fbf`, `1edf8fb`, `079359f` and `8ba0080`. **The 502 count per swap now reads 1, 0, 1, 1, 1, 3, 1, 1, 1, 2, 2, 1, 18, 1, 0, 1, 1, 1, 1, 0, 2, 4, 2, newest first** — `46043e3` cost NOTHING over a 9-minute watch started 8 s after the push, the second clean swap of the eighteen watched — today's `fe60ce3` and `3bb55f2` cost one each, which is the ordinary reading; `fd1ca6a` was pushed by a session that took no reading at all and is counted from neither, so the two newest entries are the two estate deploys — today's `c87fda5` cost two and is the only one of them carrying a MIGRATION; `2de57c9` cost one, which is the ordinary reading; yesterday's 18 on `f8762a4` remains five times the previous worst and is still unexplained by any diff. `e561a29`'s swap is not in the list because nobody watched it. Thirteen of the fourteen carried no migration; `c87fda5` is the first that did, and it cost two 502s and 66 s — **the same two the docs-only `183a3aa` cost 116 s later**, which is as close to a control as this log gets and says the DDL added nothing. Neither explains the 50-minute outage on `8b0325a`. |
| Phase | **1 is CLOSED — P1.a through P1.k and P1.✓, every card of it.** **Phase 2 is under way: P2.0, P2.a, P2.b, P2.c, P2.l, P2.d, P2.e, P2.f, P2.g and P2.m are closed, four cards and the close remain.** **Its gate is further away again — the log's Open went from empty to five on 2026-09-15 and the count restarts from the first day it is empty. It was already further away than it had been that morning**: the log's Open must be empty **five days running**, it reached day two, and **2026-09-15 put two items back in it** — the colour question, and the claim-over-another-shop's-figure found underneath it. **The count is back to zero and starts again the first day Open is empty.** By the log's own rule nothing in section 3 is started while Open has anything in it, so the next session takes the log, not P2.d. The other three gate conditions are met or named — median 17.1 s against < 10 s with its cause on the card, a navigation fragment redraws with no model call at 760 ms, trust rows unchanged. **The Fable 5.1 review of Phase 1 HAS happened** (2026-09-14, recorded in `ops/DECISIONS.md`, confirmed by the owner 2026-09-15). It confirms every number in the close-out and names four things Phase 2 should not trust: **760 ms is a unit timer**, in-process with no HTTP, browser or render, so the gate's fragment condition is met by a measurement nobody has seen on the live build; **19.0 → 17.1 includes `correction` reading nothing at low effort**, and low is most turns in a one-thread UI; **effort is unobservable in production** — not persisted, and a revoked beta pins the process to high; and **five empty days are vacuous if the room is not used**. |
| Next card | **P2S.1 CLOSED 2026-09-17, UNPUSHED — the beside room is built and measured in headless Chrome (§3); next is P2S.2, the drawing.** THE PLAN WAS RE-DERIVED 2026-09-17 (§6): the owner declared the beside room of *George, Ahead of Me* the design — *"everything ive been leading you to this final artifact is it. except the alive we can workshop the shape color and everything."* Phase 2S below builds it in four sessions, re-cut from nine at his word: P2S.1 the room first.** The dogfood log still outranks it: **six Open**, two waiting on the owner (NOT VERIFIED BY ANYBODY), the top one a session can act on is the tile explaining itself to the reader — and P2S.1(c)/P2S.2(f) are where that tile is redrawn, so a session reads the log entry before either. **Phase 2 merged into Phase 2S on 2026-09-17** (P2.k → P2S.3(g), P2.i → P2S.4, P2.✓ → P2S.✓, P2.j → P3.g, P2.h parked): after Phase 2S comes Phase 3. The finding that still stands from 2026-09-15: **0 standing questions, 0 watches, 0 workflow schedules ever created** — feature 12 has never spoken; switching it on is the first Phase 3 act, not a build. |

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

**A FULL RUN IS v2 AND COSTS $1.51, MEASURED at P1.e, 2026-09-14** — eleven
scenarios, eleven live turns, nothing unscored, from `harness.METER` and
recorded in `verification/p1e-v2.json` and `spend_ledger.jsonl`. It is the
first eval figure in this file to come in UNDER its estimate ($1.84), and the
estimate was derived from v1's per-scenario costs rather than guessed. **The
gate alone is four turns**, measured at $0.64 (P1.g) and $0.75 (P1.c).

**The history below is v1's and is kept because the errors are the lesson.**
A full run of the FIRST TWELVE was $2.90 — deleted in P1.e, so that number
can no longer be spent, only compared against. **The figure was wrong twice,
in both directions, and this is the third statement of it.** It said
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
have seen it.** A new comparison (`P2S.4`, `P3.f`) is a capability no gate
scenario asks for, so a run there proves nothing; `P2.c`, `P2.d` and `P2.f`
are context and rendering; `P1.c` breaks or fixes compose refusals, which are
its own numbers. **Three live runs across 14 open cards, $3.66** (P2S.3's subset and two full closes, after the 2026-09-17 merge) — P2.m closed 2026-09-16 and **its own run has not been made**, so the paragraph below it is the record of what that costs — the two
phase closes still to come, at $1.51 each on v2, the measured price.
Every remaining gate was dropped or absorbed, so two FULL runs is the whole
of it.
**P1.g, P1.c, P1.e, P1.f, P1.h and P1.✓ are closed**, and their runs cost
**$0.64, $0.75, $1.51, $1.62, $1.62 and $1.23 against $0.63, $0.63, $1.84,
$1.51, $1.51 and $1.51** — **P1.✓ is the second to come in UNDER**, by 19%,
on a turn that made 28 calls where P1.h's made 37.
P1.h went over by the same 7% and for the same reason P1.f did. P1.g's was the
first figure here to survive contact with a live run, and P1.c's overspend was
a first run made with `-x`, which stops on the first scenario and pays for it
twice. **P1.f went over by 7%, and the reason
is the card**: every turn now writes three slots as well as an answer, so
output tokens rose. $1.51 is still the right estimate for a run that changes
nothing about what George says. **Drop `-x` on a gate run**; four
scenarios is the unit, and a partial one buys a fifth of the signal for a
third of the price.
**The earlier $9.10 and $11.04 were both wrong, because the meter was and then
the price was.** Against v1 at its true $2.90 the same runs would have been
~$18; v2 at its measured $1.51 is a little under half that. The real gain from dropping
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
2. **P1.h was supposed to be the real discount and was not, measured.**
   Effort per turn cuts iterations — 4.0 → 3.0 median, and corrective round
   trips 7 → 1 — and iterations are 72% of the bill. The run still cost
   **$1.62, the same as P1.f's.** Fewer, deeper turns is not fewer tokens:
   output fell 19,183 → 13,889 and cache WRITES rose 121,040 → 144,093, which
   is the thinking that used to be spread over a rewrite arriving in one
   iteration instead. **$1.51 stays the estimate for a phase close.** The
   saving this card bought is WALL-CLOCK, not money, and saying otherwise
   would be the third wrong eval figure in this file.
3. **NEVER run the gate with `-x`, and the ledger proved why.** P1.c's two
   runs, from `verification/spend_ledger.jsonl`: the first stopped on scenario
   one after **1 turn for $0.25**; the second did all four for **$0.50**. So
   **the first turn of a run costs about three times a later one** — it pays
   the cold prefix write, and turns 2–4 averaged $0.083. Stopping early and
   rerunning pays that write twice: $0.75 where $0.50 was the price, a 50%
   surcharge for a flag. Let the gate finish and read all four failures at
   once.
4. **Keep a pair of runs inside the hour.** `PREFIX_TTL` is 1h, so the second
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
scenario in v2. And P1.h (effort per turn) was expected to cut every later
run, because cost is round trips. **Measured 2026-09-14, it did not**: the
same eleven questions cost $1.62 with a third fewer round trips. It is
correctly absent from the totals below.

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

`agent/loop.py` writes a row to `george.gaps` for **23 kinds** of trouble.
Fourteen are literals — `api_error`, `api_retry`, `unhandled`, `tool_refused`,
`convergence_cap`, `iteration_cap`, `no_tool_call`, `empty_result`,
`duplicate_read`, `notice_forced`, `volunteering_over_cap`,
`tool_vocabulary_leaked`, `transaction_wording`, and `answer_without_prose`
(P1.c: a turn that drew the board and said nothing) — and nine more are built
at the call site and were missed every time anyone counted: `restated_figure`,
`misstated_figure`, `enumerated_remainder`, and
`{pin,save,page}_{claimed,promised}_not_made`. The catalogue in
`ops/sweep_gaps.py` names all twenty-three, and a contract test holds it
against the call sites so kind twenty-four cannot go unread the way eleven
did.

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

**AND WHAT THE PHASE ACTUALLY REACHED, measured at P1.✓ on 2026-09-14**
(`verification/p1close-v2.json`, the eleven — so the last column of the table
above is a target the twelve set and the eleven answered):

| | target | **at the close** |
|---|---|---|
| median answer, wall-clock | < 10 s | **17.1 s** · p90 28.3 · worst 45.2 |
| first visible change | < 2 s | **7.3 s** on a model turn · **0.76 s** on a fragment |
| iterations per turn, median / max | ≤ 2.5 | **3.0 / 4** |
| calls per turn, median | unchanged | **2** |
| label calls as a share of all calls | ≤ 25% | **36%** (10 of 28) |
| questions where `compose` was rejected | ≤ 1 | **1 of 11** |
| notices surfaced · forced · invented figures | unchanged | **10 of 10 · 0 · 0** |
| a navigation fragment, no model call | the third target | **760 ms** median |

**Three of eight met.** The reasoning for each miss is on the P1.✓ card and is
not repeated here; the short version is that every latency target left is
bounded below by the first model round trip, and the label-share row now falls
when READS fall, which is not what it was built to watch.

**THE TWELVE ARE DELETED, AND THE TABLE ABOVE IS STILL THE BASELINE.** P1.e
removed `tests/evals/test_voice_evals.py` and the suite is
`test_voice_evals_v2.py` — **eleven scenarios, five of them one thread, $1.51 a
full run.** The column above cannot be re-measured, because the questions that
produced it no longer exist; it stays because the numbers Phase 1 has to move
are wall-clock and round trips, and those are properties of the loop and not of
which twelve questions were asked. **A Phase 1 card reports its latency against
that column and its trust rows against v2**, and says which is which.
Where the two overlap — label share, compose rejections, iterations — v2's
first run is the new zero: `verification/p1e-v2.json`, 2026-09-14.

**A RUN IS A SAMPLE, NOT A PASS/FAIL GATE — read this before quoting a
score.** Four real-model runs of the twelve exist (2026-09-13): **12/12,
11/12, 10/12, 11/12**, and a different scenario fails each time. Separate the two kinds of
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
  not others. **v2 acts on this**: style is reported as a rate and asserted
  only under `GEORGE_VOICE_STRICT=1`, which is why §4 now says not to set it.
  P1.e's run set it and got 8 "failures" of which 7 were this one row, over a
  run whose every trust check was clean.

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

- [x] **P1.c the reading leaves the widgets** — the top three Open items in
      the dogfood log, done as the log's AGREED FIX says: `text` is REMOVED
      from the compose vocabulary; the reading is a permanent region above
      the board drawn from the turn's prose, never a tile; a turn with no
      prose is recorded as a gap. Subtraction, not a fallback tile.

      **AND TWO BUGS THAT ARE BOTH IN ONE 20-LINE FUNCTION** — `fmt()` in
      `room/data.ts`, not where the card used to say. Checked 2026-09-13
      because the owner asked whether fixing his complaints is wasted when the
      design is being replaced:
      - **the peso sign on counts** is `PESO.test(key)` guessing money from a
        COLUMN NAME, and `value` is in the pattern. The fix is not to edit the
        regex — it is to read the unit the rows already carry (`tiles.tsx`
        line ~535 already checks `r.unit === 'PHP'`), so formatting stops
        guessing. A name-based guess will be wrong again on the next column.
      - **`[object Object]`** is `fmt`'s last line, `return String(v)`, on a
        value that is an object. It reached the caption through
        `constant.push(fmt(k, rows[0][k]))`.

      **Neither is wasted work, and that is why they stay.** `fmt` is imported
      by SIX modules — ObjectPanel, Spec, tiles, render, Room, Working — and
      P1.e replaces the widget KINDS in tiles/render, not the formatter. The
      object panel in particular is untouched by the whole redesign and would
      keep both bugs. **A shared helper survives a redesign of the thing that
      calls it**, which is the test to apply before deciding a fix is
      redundant.

      **AND THE DECISION THE LOG'S TOP ITEM ASKS FOR, because it is this
      card's own question.** P1.g's gate run found all four scenarios passing
      every trust check and then failing `grounded_numerals`: **not one figure
      any tool returned appears in any of the four answers.** Two rules ask
      for opposite things. `voice.restatement.max_restated_sentences: 0`
      forbids a sentence restating a DRAWN figure; everything George reads IS
      drawn; so every figure he could cite is corrected out, and an assertion
      that he cite one can never pass.
      **The answer is the one the Ideal UI already assumes: a reading may
      carry the figure its claim is about.** Reciting the board is what needed
      forbidding, and 0 forbids more than that. "OPUS added ₱130,016, more
      than the next two together" is the claim; a second sentence walking the
      rows is the recitation. So **`max_restated_sentences: 0 → 1`** in
      metrics.yaml, with the reason recorded beside it. The log says this
      "should be answered once, for both" — the other entry it points at is
      the same question wearing widgets, which is P1.e.
      Done when: "how are we doing" and "any problems" both show George's
      words above whatever is drawn, on the live build; **the four gate
      scenarios carry a real figure without the restatement correction firing
      on the claim, while a two-figure recitation still trips it**; the two
      display bugs gone. **Eval: subset** — the gate, $0.64 measured at P1.g.
      This card now changes a CORRECTION RULE, which the gate can see; it did
      not when the card was only a vocabulary change.

      **CLOSED 2026-09-14. Suites exact: 1,546 pure (was 1,544), 805 vitest
      (was 791), `tsc -b` and `build` clean. Two gate runs, $0.25 + $0.50 =
      $0.75 against the $0.64 estimate** — the first was `-x` and stopped on
      the first scenario, which is the whole of the overspend.

      **THE SUBTRACTION HAPPENED.** `text` is out of `composition.widgets` and
      `prose` is out of the grammar's marks — both, because a `prose` mark is
      the same thing wearing a spec and would have drawn the answer a second
      time inside a box. `TextTile`, `editsFor`'s fallback tile and the
      renderer's special case (the one whose own comment said the sentence
      "ends up three columns away from the thing it explains") all deleted
      themselves. The reading is `frontend/src/room/Reading.tsx`: a region
      above the board, drawn from `turn.text`, with the turn's caveats above
      it. A stored `text` block from before today is DROPPED by the board
      rather than drawn, so an old thread reads correctly instead of twice.
      A turn that says nothing is now `answer_without_prose` in the gap log —
      the 23rd kind, and the first time that silence is recorded anywhere but
      in the owner's own words.

      **AND THE ROOM IS NO LONGER EMPTY WHEN HE ONLY TALKS.** `board.length
      === 0` was the test for the greeting, so a turn that read nothing and
      said something threw the answer away. It is now "no objects, no words
      and no caveats".

      **THE DECISION, AND WHAT IT MOVED.** `max_restated_sentences: 0 → 1`,
      with the reason in the yaml beside it, and the prompt turned the same
      way ("name the figure your point rests on"; "the board drawing it is no
      reason to leave it out; reciting the rest is"). The correction message
      now says what must SURVIVE a rewrite, which it never did: *the rewrite
      still carries 1 figure … none is not the safe answer.* Measured on the
      four gate scenarios, one draw each, against the P1.g run on the same
      four (`verification/dogfood-remainder-caveats.json` →
      `verification/p1c-gate-2.json`):

      | | before | after |
      |---|---|---|
      | cited a figure a tool returned | 0/4 | **4/4** |
      | restated sentences in the standing answer | 0,0,0,0 | 1,1,1,1 |
      | led with a reading (STYLE) | 4/4 | 2/4 |

      Every standing answer carries exactly its allowance — the one figure the
      claim rests on — and the correction still fires on the first draft in
      three of four, as it did in three of four before. What it takes out now
      is the recitation rather than every figure in the answer.

      **THREE SHORTFALLS, and the first is the one that matters.**
      1. **The live-build half of Done-when was not done.** "how are we doing"
         and "any problems" on a running build needs
         `ops/local_dogfood_serve.py --allow-model`, and that flag is never
         passed unasked. What stands in its place is DOM evidence, not the
         same thing: `Reading.dom.test.tsx` drives the exact composition from
         the report — four figures, no text block — and asserts his words are
         on screen and no tile holds them.
      2. **`leads_with_reading` fell 4/4 → 2/4.** "It wasn't up — North Edsa
         fell 2.8% last week" is a reading whose first sentence carries the
         figure it is about, and that check is "the first sentence carries no
         figure". The two now pull against each other by design. It is a
         STYLE rate, not a gate (NOW.md 2b), and it is left standing rather
         than quietly relaxed to make this card look clean.
      3. **The gate is still 3 failed / 1 passed under `GEORGE_VOICE_STRICT`,
         and one of those is a TRUST row.** `caveats` failed `attribution` on
         "those account for 75% of the units the plan requests" — which is
         `get_replenishment`'s own notice, quoted: *"those lines account for
         4,764 of the 6,344 units requested, 75% of the plan."* The check
         reads the phrase, not the receipt. Filed in the dogfood log; the fix
         is in `checks.attribution_claims`, not in George. The other two are
         the style row above.
- [x] **P1.d the board transforms; it never accumulates** — the rule decided
      in the log: a question sharing no subject with the board CLEARS it; one
      sharing a subject TRANSFORMS it in place; earlier turns fold to one
      quiet tappable line above the finding. Absorbs the old P2.b. Done
      when: "how are we doing" then "any problems" leaves one finding;
      "why?" transforms the OPUS finding; a board test holds both. No eval.

      **CLOSED 2026-09-14. Suites exact: 1,551 pure (was 1,546), 822 vitest
      (was 805), `tsc -b` and `build` clean. No live run — the card asks for
      none, and the one eval number below came from replaying a recorded run
      for $0.00.**

      **THE RULE IS `travel` IN `room/board.ts`, AND IT IS ABOUT WHAT A
      QUESTION IS FOR.** What the turn is about — the subjects its blocks
      named, and the scope its reads were filtered to — against what the board
      is about. Share a subject and the board transforms; share nothing and it
      clears, with what the person KEPT spared, as it is spared from expiry.
      Where NEITHER side names a subject both are about the whole estate and
      there is no intersection to take, so the BUSINESS decides: widening from
      one shop to the estate is one piece of work, and `get_attention` after
      `get_sales` is not. That last clause is what actually closes his
      complaint, because "how are we doing" is estate-wide and names nobody.

      **THREE THINGS THAT WOULD HAVE MADE IT WRONG, all found by the suite.**
      A default composition keys its first read `read-0` every turn, so a key
      match counted for anything but HIS blocks means nothing ever clears —
      the key clause reads `turn.composition` only. An edit that only names
      keys (`quiet this`, `drop that`) reads nothing and names nobody, so it
      has no topic to share and would have cleared the board it was editing —
      a turn about nothing new is not a new question. And the read identity
      the board already uses is checked first, so the same read run again is
      the same object however it is keyed.

      **THE FOLD IS THE OTHER HALF, and the complaint has two.** A question
      that DOES share a subject rightly keeps what was there, and four turns
      in the finding is one tile among nine. `folded` takes everything the
      newest turn did not touch out of the drawing; `Earlier.tsx` draws it as
      one quiet line above the reading, which opens and folds again on the
      next answer. **The BOARD still holds every object** — this folds the
      screen — so `boardContext` is unchanged and the next question still
      travels with all of them. What was kept and what is being looked at
      never fold; what was set aside is not counted, because that row says it
      once already.

      **AND THE LOG'S TOP TWO OPEN ITEMS, both of which this card owns.**
      The composed shape invisible to the next question was
      `board_sentence` skipping every kind that is not a widget: the kind is
      now declared (`composition.composed_kind`) and allowed beside them, so a
      leading shape is what "why?" resolves against, and a made-up kind is
      still ignored. The gate failing on a share the TOOL computed was
      `checks.attribution_claims` reading the phrase and not the receipt —
      each pattern now says whether a receipt could excuse it, "accounts for
      N%" is excused when N is a figure the results carried, and a share of a
      CHANGE never is. **Verified by replay, not by a run**
      (`tests/evals/corpus.py`): `verification/p1c-gate-2.json` went from 1 of
      4 would fail to **0 of 4**, and nothing newly fired on `p1b-final.json`.

      **TWO SHORTFALLS.**
      1. **Nothing was run against a live build.** The Done-when is a board
         test and that is what holds it — but the four-widget board he
         actually reported has never been rebuilt here, so the evidence is the
         fixtures' shape, taken from the recorded runs, and not his screen.
      2. **"And OPUS?" while looking at Rockwell now CLEARS the board.** Two
         shops that share nothing are two questions under this rule, and the
         old P1.d absorbed is the card that wanted that pair to transform. It
         is left as the rule says rather than special-cased, because the log
         decided this way round deliberately and the reversal is written
         down — fold instead of clear, one line. It is in the log as the case
         to watch.
- [x] **P1.e six marks, drawn one way each** — the renderer's fourteen
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

      **CLOSED 2026-09-14. Suites exact: 1,551 pure (unchanged — this card is
      renderer-only and the one contract test it touched was rewritten, not
      added to), 880 vitest (was 822), `tsc -b` and `build` clean. One full v2
      run, `verification/p1e-v2.json`, $1.51 measured against the $1.84
      estimate** — the first eval figure in this file to come in UNDER what it
      said, and the meter counted every turn, so there is no unscored half
      hiding behind it.

      **THE CATALOGUE IS `frontend/src/room/catalogue.ts` AND THE DRAWINGS ARE
      `marks.tsx`.** Seven tile components are gone — subject, comparison,
      table, chart, distribution, timeline, recommendation — and with them
      `Against`, whose caption ("the track is the period before · the fill is
      this one") was the owner's third failure in his own words. `render.tsx`
      went from fourteen `case` arms to four and a default. Every block is
      framed the same way round now: claim-title, subtitle off `meta`
      (metric · window · comparison · unit · rows), the mark, its source line.

      **TWO DEVIATIONS, BOTH DELIBERATE.**

      **1. Four kinds keep their tiles and are not marks.** `draft`, `control`,
      `state`, `system`. A mark is a way of drawing what a read RETURNED;
      those four are objects you do something to — a draft whose quantities
      you edit and whose total follows them is the gesture the whole purchase
      arc turns on, and mapping it onto `table` would have deleted it. The
      list is `catalogue.NOT_A_MARK`, each with its reason, and
      `test_every_widget_is_drawn_by_the_renderer_and_nothing_else_is` holds
      it to `render.tsx`'s four cases in both directions, so a kind cannot
      quietly fall out of both. Every OTHER declared widget is a reading and
      draws as one of the six.

      **2. The claim-title is George's `note`, or the read's own name.** The
      grammar has no field for a title and must not get one — a claim typed
      into a block is a sentence with no receipt. `note` is what he already
      has: a characterisation, validated to carry no digits. A recommendation
      is the one exception and leads with his VERB ("Order Aji Mix"), because
      that is the one word a read has not got.

      **COLOUR IS DIRECTION, WHICH REVERSES A TEST.** Four data colours —
      `up`, `down`, `flat`, and `george` for the emphasised row of a read that
      declared no direction — held by `palette.test.ts`, which reads the
      source: one `paint()` producing every colour, no literal hex or rgb
      anywhere, `--accent` refused, and identity's `--hue` allowed exactly
      once, on the object panel's wrapper, outside every drawing. Proven to
      fail both ways round: a fifth token in a mark, and a fifth entry in
      `DATA_COLOURS`. `room.dom.test.tsx`'s "paints each shop in its own
      colour" is now "paints by direction, not by which shop it is" — the
      reversal is the owner's second failure, and it is written down where the
      old assertion stood.

      **THE DONE-WHEN'S RECORDED RUNS, AND WHAT THEY DO NOT COVER.**
      `ops/recorded_board.py` rebuilds the board each recorded run held —
      rows and `meta` lifted whole out of the eval report, blocks through
      `agent/default_composition` — into
      `frontend/src/room/__fixtures__/recorded-runs.json`, and
      `marks.dom.test.tsx` renders every one for real. **Eight runs, 13
      blocks, all six-or-fewer marks, all with a source line.** The bound: an
      eval report does NOT record the blocks George composed, only that he
      composed some, so these are the loaded default — a real board state, and
      not his. It reaches figure, dumbbell, ranked and table; contributors and
      line are held by row-shape tests instead, and by `catalogue.test.ts`,
      which walks every kind in the yaml's own `composition.widgets`.

      **THE TAIL RAN AND THE GATE AGREED — EXCEPT ONCE, WHICH IS THE FINDING.**
      The four gate questions are byte-identical to `p1b-final.json`'s, and on
      every check both suites share (`status`, `notice_forced`,
      `ungrounded_numerals`, `internal_vocabulary`, `attribution`) all eleven
      v2 scenarios are clean — where p1b-final recorded two failures, which are
      the two P1.g closed. `tests/evals/test_voice_evals.py` is deleted.

      **The disagreement was v2's own new assertion, and it was the check.**
      `caveats` failed "he cited no figure any tool returned" on an answer that
      names the product emptying today and the 1 unit left on it — both
      `get_replenishment` figures. `grounded_numerals` was excusing them as
      presentation integers, an exclusion it inherited from
      `ungrounded_numerals` on the stated principle that the two share every
      one. **That principle is wrong**: for "did he INVENT one" a bare 4 must
      be excused; for "did he CITE one" a 4 the rows account for is a citation.
      Fixed there, and **verified by replay for $0.00**
      (`tests/evals/corpus.py`): `dogfood-remainder-caveats.json` goes from
      **4 of 4 "cited no figure" to 2 of 4**, `p1c-gate-2.json` stays at
      **0 of 4**, and nothing newly fires anywhere. The loosening is one-way —
      it can only add a citation, never remove a forbidden numeral.

      **THREE SHORTFALLS.**
      1. **The run was made with `GEORGE_VOICE_STRICT=1`**, which is §4's
         recipe for the OLD twelve and wrong for v2, where style is a rate and
         not a gate by design. So 8 of 11 "failed" on style — 7 on
         `leads_with_reading`, which is the flapping row v2 exists to stop
         asserting. Nothing was re-run: the trust rows are all in the report
         and they are what matters. §4's command is repointed and the flag is
         gone with it.
      2. **`corpus.py` disagreed with the run it was verifying, on threads.**
         A later turn cites rows an earlier one read; the report stored only
         each turn's own, so `correction` replays with three ungrounded
         numerals the run passed. `harness.Report.add` now records the carried
         rows; `p1e-v2.json` predates that and is read with corpus.py's own
         paragraph beside it. It also crashed on `₱` under Windows cp1252,
         mid-list — fixed.
      3. **Nothing was rebuilt in front of the owner.** Same shortfall P1.d
         closed with: the evidence is recorded rows rendered by the real
         renderer, not his screen.
- [x] **P1.f compose narrows to the catalogue; the text gets three slots** —
      the label grammar becomes the six marks plus a claim-title per block;
      the findings roles become claim (one highlight) · caveat (whole, above
      the figures) · next (one sentence, always last — the ladder's stop
      sentence lands here). Coercion stays; what it validates gets smaller.
      Done when: rejections ≤ 1 question, label share not worse than 33%,
      trust rows unchanged, every answer has a claim and a next; style checks
      NOT widened. **Eval: full.**

      **CLOSED 2026-09-14, `6fd8c00`. Suites exact: 1,542 pure (was 1,551 —
      27 finding-frame tests deleted with the roles, 28 reading-frame tests
      added, one for the Decimal), 903 vitest (was 880), `tsc -b` and `build`
      clean. One full v2 run, `verification/p1f-v2.json`, $1.62 against the
      $1.51 P1.e measured** — over, and the extra is output tokens, because
      every turn now writes three slots as well as the answer.

      | | P1.e run, 09-14 | **P1.f, 09-14** | this card's target |
      |---|---|---|---|
      | questions where `compose` was refused | 0 of 11 | **0 of 11** | ≤ 1 |
      | label calls as a share of all calls | 33% (P1.a's twelve) | **29%** (10 of 34) | not worse than 33% |
      | notices surfaced · forced · figures no tool returned | 15 · 0 · 0 | **15 · 0 · 0** | unchanged |
      | tool vocabulary leaked · attribution shares | 0 · 0 | **0 · 0** | unchanged |
      | iterations median / max | 4 / 5 | **4 / 5** | — |

      **THE SHORTFALL IS THE DONE-WHEN'S LAST CLAUSE: not every answer has a
      claim and a next.** Claim 9 of 11, next 7 of 11. Two of the eleven said
      nothing in any slot — `pin` (a page confirmation) and `run-monday` (a
      capability refusal), where there is arguably nothing to claim. The other
      four losses are **my own no-digits rule refusing what he wrote**: five
      slots across four turns, three caveats and two nexts, plus one caveat
      refused for length. So the number to report is not "George did not say
      it" — it is "he said it and the validator dropped it".

      **THE CLAIM IS THE PART THAT WORKED: 9 of 9 landed.** Every claim he
      submitted appears word for word in the answer he then wrote, so every
      one was lit. That is the whole safety argument for a text channel, and
      it held on the first live run without a single `claim_not_said`.

      **TWO FIXES CAME OUT OF THE RUN, both cheap.** `caveat` goes 240 → 320
      characters: the bound refused the `caveats` scenario outright, and the
      Ideal UI's own morning caveat is 243 characters — a bound the design it
      is built toward cannot fit is a bound on saying the second thing. And a
      refused slot now records WHAT WAS SAID, not only why: "next carries no
      digits" over "order 806 units" is the rule working and over "check the
      8-week window" is the rule costing a slot, and the reason alone cannot
      tell them apart. **The digits question is left open on purpose** —
      loosening it blind would be the one change that could let a figure onto
      the screen through prose that the answer's own gates never see.

      **AND THE RUN FOUND A CHECK THAT WAS WRONG, NOT AN ANSWER.**
      `order` was reported as citing a figure no tool returned — "729 units" —
      and the row behind it says `suggested_order_qty` 729.
      `prose.allowed_numbers` could not see a **Decimal**, which is what
      Postgres `numeric` arrives as, so every quantity `get_purchase_plan`
      returns was invisible to every check in that module. Replaying the same
      answer against the same recorded rows was clean, because a report is
      serialized and a raw row is not — a check that disagrees with its own
      evidence depending on which side of `json` it is read from is worse than
      no check. Fixed one-way (it can only add a number the tools DID return),
      held by `tests/test_eval_checks_contract.py`, and verified by replay for
      **$0.00**: `p1f-v2.json` replays clean on `order`.

      **TWO SHORTFALLS BEYOND THE NUMBERS.** Nothing was rebuilt in front of
      the owner — the third card running. The evidence is the recorded run,
      the replay and the suites, not his screen.

      **And a live suite was started a second time BY ACCIDENT**, to re-read a
      summary that was already sitting in `verification/p1f-v2.json`. It was
      killed inside a minute, which is why there is no second line in
      `spend_ledger.jsonl` — the meter writes at interpreter exit and the
      process never reached one — so an unknown amount, one or two turns'
      worth, was spent and is not in the ledger. **A recorded run is read from
      its report, never by running it again**; the report holds every number
      the summary printed and `tests/evals/corpus.py` replays it for $0.00.
- [x] **P1.g arithmetic in prose, and a column name in the answer** — done
      2026-09-13, `c508965`. The two trust failures George filed himself
      ("and 45 others"; `warning_stock`; a forced caveat). Pure suite
      **1,497 → 1,535**, 30 skipped, 0 failing; frontend room 103. Gate run,
      four live turns, **$0.64**: `ungrounded_numerals` `[]`,
      `notice_forced` false and `internal_vocabulary` `[]` on all four.
      Full write-up in `ops/DECISIONS.md` and the log's Fixed section.

      **TWO DEVIATIONS FROM THIS CARD, both deliberate.**

      **The gate fires on a CONSTRUCTION, not on sums of board figures.**
      The card asked for "a numeral equal to a simple sum or difference of two
      figures on the board". That was not built, for two reasons: with N drawn
      figures there are ~N² sums and differences, so nearly any numeral
      matches one and the gate would fire on coincidence; and it would not
      reliably catch `45` anyway, which needs `3` — how many products George
      CHOSE to name — to be a drawn figure, and it is not. What shipped fires
      on the shape: a count beside "others"/"more"/"the other" is by
      definition what is LEFT once the writer chose how many to name, so no
      tool can have returned it. Rows are consulted only to excuse.
      `voice.enumerated_remainder`, kind twenty-two, 31 contract cases.

      **The replay criterion could not be met, because it asks the impossible.**
      "`tests/evals/corpus.py` replays every recorded run clean — including
      `p1b-final.json`" cannot happen: replay runs today's checks over a FIXED
      recorded ANSWER, and that answer contains the leaked text. `p1b-final`
      is the record OF the defect and will report it forever. What the fix can
      be held to is the run after it, and
      `verification/dogfood-remainder-caveats.json` replays clean of both.
      **Worth keeping: a Done-when that asks a recording to change is not a
      test of the fix, it is a test of the past.**

      **The card's "NO EVAL, $0.00" was also wrong, and cost $0.64.** It is
      true that a check is a pure function of (answer, results). But half of
      this card was a FINGERPRINT and a notice MESSAGE — both model-facing —
      so it changed what George sees, and the conftest's own rule (run `-m
      gate` on anything model-facing) applied. The gate is what proved the
      forced caveat gone.

      **It left one thing behind**, filed at the top of the dogfood log: all
      four gate answers now cite no figure any tool returned. Not caused by
      this card — the new gate fired on none of the four turns — but v2's
      first recorded live run, and it belongs to P1.c.
- [x] **P1.h cheaper turns** — **CLOSED 2026-09-14.** Effort per turn rides a
      mid-conversation system message (`{"role": "system", "content": [],
      "output_config": {"effort": ...}}`, beta
      `mid-conversation-output-config-2026-07-01`, probed against the live API
      before anything was spent) so the cached prefix survives — a top-level
      `effort` change invalidates the messages cache and, on some models, the
      tools and system caches with it, which is the ~9.2k tokens 139 of 141
      turns read back. The kinds, phrases and levels are in
      `definitions/metrics.yaml` `effort`, matched in yaml order:
      **ladder and broad high, fresh medium, follow-up and label-only low.**
      `MAX_ROWS_TO_MODEL` stays 200.

      **The run — one full v2 run, $1.62, `verification/p1h-v2.json`, 11 of 11
      passing.** Against P1.f's run (`verification/p1f-v2.json`), the same
      eleven questions:

      | | P1.f, 09-14 | **P1.h, 09-14** | target |
      |---|---|---|---|
      | median answer, wall-clock | 27.4 s · p90 37.9 · worst 65.8 | **19.0 s** · p90 34.7 · worst 49.0 | < 10 s |
      | corrective turns, total / median | 7 / 1 | **1 / 0** | down |
      | iterations per turn, median / max | 4.0 / 5 | **3.0 / 5** | ≤ 2.5 |
      | questions where `compose` was rejected | 0 of 11 | **3 of 11** | ≤ 1 |
      | label calls as a share of all calls | 29% (10 of 34) | **35% (13 of 37)** | ≤ 25% |
      | notices · forced · invented figures | 15 · 0 · 1 | **11 · 0 · 0** | unchanged |
      | cited a figure a tool returned | 10 of 11 | **10 of 11** | unchanged |

      **The card's own two numbers moved and the trust rows held.** Notices
      forced 0, figures in prose no tool returned **0** (P1.f's run had one),
      attribution shares 0, refusals still refusing (`cannot` and `run-monday`
      both pass), and the figure-citing row is where it was. Median is still
      1.9x the < 10 s target and iterations are 3.0 against 2.5; only P1.i and
      P1.j, which answer without a model call at all, can reach those.

      **THE SHORTFALL, and it is the board rows.** `compose` was rejected in
      **3 of 11 against P1.f's 0**, and label share went **29% → 35%**, both
      the wrong way. Reported as a regression rather than explained away — and
      two things are true beside it. That row has now read **5, 0 and 3 across
      the last three runs**, which is what NOW.md's own "a run is a sample"
      note is about; and **five of the eight `reading_rejected` refusals are
      the no-digits rule**, which is the question P1.f left open on the record,
      not something this card introduced. The three `composition_rejected` are
      three different things (a subject absent from the rows, a `get_object`
      composed over, a claim over its length), none of them concentrated at the
      low level. **A second run was not bought**: there is no fix to confirm,
      and $1.62 to resample a flapping row is the spend the two-run rule exists
      to stop.

      **TWO OF THE SIX GATES BECAME DETERMINISTIC, NOT THREE, AND THE CARD SAID
      THREE.** Volunteering and restatement/misstatement/remainder now DELETE
      the offending sentences instead of buying a second answer — that gate
      alone was 6, 7 and 6 of the 8, 7 and 7 corrective round trips in the
      three most recent recorded runs, which is where the 7 → 1 comes from.
      **The notice gate kept its model turn**, against the card's "a model turn
      only for a false write claim". `unsurfaced_notice` fired in 2 of the last
      3 recorded runs and the model's rewrite fixed it both times, leaving
      `notice_forced` at 0; a deterministic version forces the caveat in by
      construction, every time it fires, and the same card fails if any quality
      row moves. The Done-when was taken over the method. **That is the owner's
      trade to make, and it is the one open question this card leaves.**

      **The edit refuses two things**, and both are held by tests: it never
      empties an answer, and it never removes a sentence whose loss would
      unsurface a notice. When neither deletion can be applied — a remainder in
      the only sentence there is — **the old rewrite still happens, word for
      word**, so no guarantee is traded for the speed. `corrective_turns` now
      counts only round trips actually spent and `deterministic_edits` counts
      what was done without one; both are on the `done` frame and in the eval
      report, which is why the comparison above exists at all.

      **The beta can be taken away without taking the turn.** A 400 naming
      per-turn effort drops the marker for the life of the process and the turn
      runs at the default level — which is what every turn did before this
      card. Held by `tests/test_effort_per_turn_contract.py` (23 cases).

      Suites exact: **1,569 pure** (was 1,542), **903 vitest**, `tsc -b` and
      `build` clean. No frontend file was touched.
- [x] **P1.i replay: the endpoint** — **CLOSED 2026-09-14.**
      `POST /george/replay` takes a stored call NAMED, not sent: `{post, seq,
      argument, value}`. The arguments come off `payload.calls` — what the
      loop recorded from `dict(b.input)` — so the only thing a client can
      change is the one argument it asked to change. **It used to take a whole
      call list from the request body and run it**, which meant a figure could
      reach the screen under a receipts line with no record that it was ever
      read that way.

      **The five are `surface.desk.replay.arguments` and say where each
      lands**: `window` through the per-tool map the backtest already keeps
      (`get_dead_stock` is `window`, `get_purchase_plan` is `lookback_days`),
      `store` into `filters.store`, the other three by their own names. `null`
      takes an argument OFF rather than passing a null into a tool that never
      asked for one, and an empty `filters` goes with it. A control's own name
      resolves through `from_control` before anything runs, so the two
      vocabularies meet in the yaml and not in a component.

      **THE NUMBERS, live against real data** (`tests/test_replay_live.py`,
      13 tests): "last week" → "August" on the stored OPUS call is **0.46 s
      median against the 1.5 s budget** (0.44–0.49 across four argument kinds),
      with `2026-08-01`/`2026-09-01` in `filters_applied`, `last_week` gone
      from it, OPUS still on it, and a snapshot timestamp. A window still in
      progress is refused in **0.00 s** — before a connection is opened — in
      the tool's own sentence naming `this_month` AND `last_month`. The
      endpoint adds two application-database statements around the read,
      measured at **33 ms each** from here.

      **IT FOUND A LIVE BUG AND THE CARD COULD NOT HAVE PASSED WITHOUT IT.**
      `pin_runner._enum_for` took the FIRST `oneOf` branch carrying an enum
      whatever the value's shape was, so `date_range: ["2026-08-01",
      "2026-09-01"]` — the explicit half-open window the tool documents — was
      refused as `'2026-08-01' is no longer a valid value`. Every pin over an
      explicit window was unrunnable too. The branch is now chosen by the
      value's shape.

      **The record is `answer_post_payload`, not `transient_until_next_turn`**:
      each replay appends `{seq, tool, argument, was, value, status, at}` to
      the post, capped at 40, ordered, touching no key the answer carries —
      proved against Postgres over literals, which is the half a stubbed
      session cannot check. `recorded` is the UPDATE's own rowcount, so a turn
      whose post was never written says false rather than claiming otherwise
      (UI rule 8).

      **THE SHORTFALL: nothing reads the record back.** A reload still draws
      the stored window, because restoring a replay onto the board is P1.j,
      where a tap becomes the ordinary way the board moves. The `blocks` the
      endpoint returns — `default_composition` over the replayed rows, `key`
      `read-{seq}`, no claim and no emphasis — are on the response and used by
      nothing yet, for the same reason.

      **No eval, $0.00, and the reason rather than the assertion**: the only
      definitions changed are under `surface.desk.replay`, which
      `_desk_section` does not read (it reads `direct_manipulation` and
      `selection.dimensions`); `SYSTEM_PROMPT` is byte-identical at 1,798
      words and contains no occurrence of "replay"; no tool schema, tool
      docstring or compose vocabulary moved.

      Suites exact: **1,623 pure** (was 1,575), **903 vitest** (unchanged —
      no frontend test covered the replay call and the two that changed are
      Python), `tsc -b` and `build` clean, **13 live** in
      `tests/test_replay_live.py`.
- [x] **P1.j read-as tokens, and fragments that skip the model** — **CLOSED
      2026-09-14.** The scope the work on screen is on is drawn between the
      reading and the board — the window, the shop, the cut, how many — read
      off `payload.calls`, which is what the tools accepted and answered.
      Tapping one offers its alternatives; typing one of the same words is
      the same act through the same path. A replay, no model.

      **THE NUMBERS, live against real data** (`tests/test_fragment_live.py`,
      6 tests, measured through `tests/evals/timing.py fragment_change_ms`):
      a navigation fragment over TWO reads is **727 ms median against a 2 s
      budget** (720–732 over five), over one read **529 ms**; an analytical
      one has its figure in **614 ms** (575–652). The rule for which read a
      person waits for is the SLOWEST of the batch, because a board half on
      August and half on last week has not changed, it has broken.

      **THE VOCABULARY IS THE ALTERNATIVES ON SCREEN, which is why there is
      no keyword list anywhere.** A fragment resolves only against the tokens
      drawn (`fragments.resolves_against: drawn_tokens`), and the words each
      answers to are SERVED (`tokens.spoken`) — no stemmer, no fuzzy match,
      no "did you mean". Two tokens answering to one word is an ambiguity and
      goes to George; so does anything over four words, anything asked with a
      selection, and anything that does not resolve. **The failure mode of the
      whole feature is a model turn**, which is what would have happened
      anyway.

      **IT FOUND TWO THINGS, and the second is a shipped bug.**
      **`net_sales` declines a product grouping** — it is transaction grain,
      and the ladder localizes by product through `product_revenue`, a
      different METRIC and so a different call, which a replay cannot reach.
      So a `group_by` token offers only what the call's own metric permits
      (`permitted_by`, from `metrics.<metric>.valid_group_by`), intersected
      across every read it would move, and **"products" on a sales board is
      still George's question**. And **the replay endpoint was sending rows
      the loop would have withheld**: over `MAX_ROWS_TO_CLIENT` the loop sends
      `rows_complete: false` and NO rows, and this sent 200 whole — so moving
      a window on a day-grouped read over a year put 365 rows into a mark
      drawn over twelve. All of them or none now, and the board does not move,
      in the definitions' own sentence (`replay.rows_incomplete_says`).

      **P1.i's two shortfalls are closed.** `replaysToRestore` reads the
      record back on opening — the newest change per call, RUN AGAIN and never
      restored from a copy, because the record keeps the change and not the
      rows and a number wears the time it was read (UI rule 6). And the
      endpoint's `blocks` are used: for a change that reshapes the rows
      (`replay.changes_shape`) the object keeps its key, its turn and the
      person's arrangement, and loses the claim, the note and the emphasis —
      those were said about rows that are no longer there.

      **A THIRD BUG, in code this card had to touch.** `retuned` was keyed by
      `seq` alone and `seq` restarts every turn, so a replay on turn three's
      first read redrew turn one's object with turn three's rows — a figure
      under somebody else's label. Keyed `turn:seq` now (`retunedKey`).

      **THE SHORTFALL: "why?" is not under 2 s and cannot be.** It is the
      card's second analytical example and it names no scope — the ladder
      answers it by reading the metric's declared DRIVERS, which is a
      different call, and a replay changes one argument of one call. It goes
      to George, as it always did. **And a tapped shop in the rows is still a
      selection, not a navigation fragment**: the store token moves the shop,
      and changing what a tap on a row means would be a rebuild of a
      load-bearing mechanism for no complaint anybody has made.

      **"Not what I meant" costs the turn and asks for the belief by name.**
      The sentence is a definition (`fragments.correction.asks`), not a string
      in a button — and whether a belief is recorded is HIS act: the room
      holds no writer and may not (architecture rule 4). Say that rather than
      claiming the token records one.

      **No eval, $0.00, and the reason rather than the assertion**:
      `SYSTEM_PROMPT` is **byte-identical** at 1,798 words with no occurrence
      of token, fragment, replay, spoken or permit, and the tool schemas hash
      the same before and after — checked, not assumed. Every definition added
      is under `surface.desk.tokens`, `surface.desk.fragments` and
      `surface.desk.replay`, none of which `_desk_section` reads.

      Suites exact: **1,642 pure** (was 1,623), **938 vitest** (was 903),
      `tsc -b` and `build` clean, **19 live** (13 replay, 6 fragment).
- [x] **P1.k visible work, for free** — **CLOSED 2026-09-14.** Four things
      the frames already carried, drawn. The **line above the claim** is four
      counts off the turn's own record — reads that landed, calls made, the
      turn's clock, caveats raised — and it is what is LEFT of the work once
      the trail goes: until today the steps vanished the moment the answer
      landed and the person was left with a paragraph and nothing behind it.
      The **steps** each carry their own `duration_ms` off their own
      `tool_result` frame and open on their own receipts. **Behind it** is
      every read of the THREAD with its source, its filters and the moment it
      was read. And a **figure in the claim that some read returned is
      underlined and jumps to that read**.

      **THE NUMBERS, over the eight recorded runs** (`__fixtures__/
      recorded-runs.json`, the same board P1.e replayed): **16 of 16 reads
      draw a source, a filter list and a read time**; **75 of the 79 filters
      carry the definition that applied them**, drawn as "stores active
      retail" with the predicate under it, and the **other four are lines the
      tools wrote as words with no provenance at all** ("brief written on
      2026-09-14 (Asia/Manila)"), drawn whole. The split is on the `#` the
      tools write — never on a guess about which half reads as English.

      **NOTHING MODEL-WRITTEN IN A MONO LINE IS A SCAN, NOT A REVIEW.**
      `visibleWork.dom.test.tsx` reads `room.css` for every class whose rule
      sets `var(--mono)`, renders all three surfaces, and fails if one of his
      words lands in one — his words being the ones that appear nowhere in
      the turn's frames, because a shop is named in the rows AND in his
      sentence and a receipt printing "Rockwell" is printing what the tool
      returned. P2.b extends the same scan the other way.

      **THE FIGURE LINK IS THE SERVER'S MATCHER, PORTED** (`figures.ts` from
      `agent/prose.py`): a numeral matches a returned number when it is that
      number rounded to the precision written, dates and years and counts to
      31 excused. `test_visible_work_contract.py` compares the two files'
      constants by value, because a looser client would underline what the
      server calls ungrounded. **A numeral no read holds gets no underline** —
      an underline is a promise there is something behind it, and CLAUDE.md
      rule 9 still stands: production checks no prose numeral against a row.

      **THE SHORTFALL: a declined read has no receipts, and cannot.** The
      card's done-when says every read in Behind it has source, filters and
      time; a read the tool refused returned no meta, so it is drawn as
      declined in the tool's own sentence and claims none. 16 of 16 is over
      reads that LANDED. **And the per-call clock is not in the recorded
      runs** — an eval report does not keep `duration_ms` — so the durations
      are held by the frame type and by a fixture, not by the replay.

      **A new question closes the view.** Behind it is a view on what has
      been read; an answer arriving behind a list nobody is looking at is
      "stuff came out but it just disappeared" all over again.

      **No eval, $0.00, checked rather than assumed**: `SYSTEM_PROMPT` is
      byte-identical at **1,798 words** (sha 28efc756) and the 16 tool
      schemas hash the same (9099fea1) before and after. Every definition
      added is under `surface.desk.work`, which `_desk_section` does not
      read — it reads `direct_manipulation` and `selection.dimensions`, and
      the contract test asserts that.

      Suites exact: **1,657 pure** (was 1,642), **974 vitest** (was 938),
      `tsc -b` and `build` clean.
- [x] **P1.✓ close the phase** — **CLOSED 2026-09-14.** One full v2 run,
      `verification/p1close-v2.json`, **11 of 11 for $1.23 against the $1.51
      estimate** — the second eval figure in this file to come in under its
      estimate, and the reason is two cards back: 28 calls where P1.h's run
      made 37, and 9,870 output tokens where it wrote 13,889.

      **EVERY PHASE 1 TARGET AGAINST ITS NUMBER. Three met, five not.** The
      left column is P0.3's run of the twelve, which is deleted and cannot be
      re-measured; the right is today's eleven. A latency figure compared
      across two question sets is not a measurement, so the v2 chain is given
      under the table and is the honest one.

      | target | P0.3, the twelve | **today, the eleven** | met |
      |---|---|---|---|
      | median answer, wall-clock | 27.4 s · p90 45.1 · worst 71.8 | **17.1 s** · p90 28.3 · worst 45.2 | **no — 1.7x the < 10 s target** |
      | first visible change | 7.0 s (P1.b) | **7.3 s** on a model turn · **0.76 s** on a fragment | **no on the turn** · yes where there is no model |
      | iterations per turn, median / max | 5.5 / 8 | **3.0 / 4** | **no — against ≤ 2.5** |
      | label calls as a share of all calls | 50% (28 of 56) | **36% (10 of 28)** | **no — against ≤ 25%** |
      | questions where `compose` was refused | 5 of 12, 9 refusals | **1 of 11** | **yes — ≤ 1** |
      | calls per turn, median | 5 | **2** | moved down; the target was "unchanged" |
      | notices surfaced · forced · figures no tool returned | 12 · 0 · 0 | **10 of 10 · 0 · 0** | **held** |
      | a navigation fragment answered with no model call | did not exist | **760 ms** median over two reads | **yes** |

      **The v2 median chain, the same eleven questions each time: 24.1 (P1.e)
      → 27.4 (P1.f) → 19.0 (P1.h) → 17.1 (today).** Against the twelve's
      27.4 s the fall is 38%, and the target is still missed by 7.1 s.

      **WHAT DID NOT MOVE, AND WHY — the five.**

      1. **Median 17.1 s against < 10 s.** A turn is still three model round
         trips at 4–8 s each, and nothing in this phase removed the first
         one. P1.a took iterations 5.5 → 4.0, P1.h 4.0 → 3.0, and 3.0 is
         where a turn that must read, then think about rows, then write,
         sits. The cause is named rather than the number excused: **only a
         path with no model in it gets under 10 s, and that path is
         P1.i/P1.j, which answers a different question** — a change of scope,
         not a question.
      2. **First visible change 7.3 s against < 2 s**, which is P1.b's
         finding unchanged: the board and the shaped object are both bounded
         below by the first round trip plus the read. Today's worst is 24.1 s
         (`order`, a purchase plan over a supplier). The 0.76 s is real and is
         a **different act** — a fragment on work already on screen.
      3. **Iterations 3.0 / 4 against ≤ 2.5.** Same cause as 1.
      4. **Label share 36% against ≤ 25%, and it went the wrong way from
         P1.f's 29% while the label calls themselves FELL 13 → 10.** Total
         calls fell faster, 37 → 28. **The measure is now reporting fewer
         reads rather than more labelling**, which is the opposite of what it
         was built to watch; per TURN it is 0.9 label calls today against 1.2
         at P1.f. Phase 2 should not read this row as a regression, and the
         row should be counted per turn or dropped.
      5. **The gate's own first condition: Open empty five days running.**
         Today is **day one of five** — the last item closed 2026-09-14, hours
         before this card. Nothing a session can do moves that.

      **WHICH CARDS PAID, from `verification/spend_ledger.jsonl` and the
      reports themselves.** P1.a's run is **unmetered** — a legacy report with
      no `spend` key at all — and `p1b-after` is **scored-only**, so it omits
      its setup turns the way `p1b-final` did before the meter was fixed.
      Everything else is measured:

      | card | live spend | what it bought |
      |---|---|---|
      | P1.a | **not recorded** | compose rejections 0.75 → 0.33 a turn |
      | P1.b | $0.23 + $0.43 + $1.59* + **$2.90** | first COMPOSED object 16.8 → 8.2 s |
      | P1.c | $0.25 + $0.50 | the reading left the widgets; cited figures 0/4 → 4/4 |
      | P1.d | $0.00 | the board transforms; it never accumulates |
      | P1.e | $1.51 | six marks; the twelve deleted for the eleven |
      | P1.f | $1.62 | `compose` refused 0 of 11; the three slots |
      | P1.g | $0.64 | arithmetic in prose, and a column name in the answer |
      | P1.h | $1.62 | median 27.4 → 19.0 s; corrective turns 7 → 1 |
      | P1.i · P1.j · P1.k | $0.00 each | replay, tokens, visible work |
      | P1.✓ | $1.23 | this run |

      **$12.52 is what the phase is RECORDED as having spent**, and the true
      figure is higher by P1.a's whole run and by `p1b-after`'s setup turns.
      *Starred figures are scored-only and understate. **The three $0.00 cards
      are the phase's best trade**: each proved the model could not see its
      change by hashing the prompt and the tool schemas, instead of buying a
      run to discover the same thing.

      **TWO FINDINGS, AND BOTH ARE RECORD-KEEPING RATHER THAN BEHAVIOUR.**

      **`deterministic_edits` was never once recorded.** P1.h's close-out says
      the number is "on the `done` frame and in the eval report";
      `p1h-v2.json` was written at 18:12 and the harness learned to keep that
      key at 18:17, in P1.h's own commit. The claim was true of the code and
      false of every artifact. **Today is the first run to carry it: 6
      deterministic edits across 11 turns, with 0 corrective round trips** —
      P1.h's mechanism observed rather than inferred from a round-trip count.

      **Every report's `passed` key is a hardcoded `False`.**
      `tests/evals/test_voice_evals_v2.py:163` calls `report.add(...,
      passed=False)` before the assertions run and never revises it, so all
      four v2 reports say every scenario failed while pytest said 11 passed.
      **A recorded run cannot tell a later reader whether it passed**, which
      is exactly what "read a recorded eval, never re-run it" depends on. Not
      fixed here — it changes what a report means, so it is a card and not an
      adjacent one-liner.

      **THE RELAXED CAVEAT RULE, CONFIRMED LIVE.** Slot refusals fell **8 →
      2** against P1.h's run, and the two survivors are the two the dogfood
      entry predicted: the remainder George worked out himself ("the other 87
      products") and the 320-character bound, which `order`'s caveat still
      overruns. The replay said 7 of that run's 8 would stand; live, on
      different sentences, 6 of the 8 never arose at all.

      **THE RUN'S INPUT WAS BYTE-IDENTICAL TO P1.h's** — `SYSTEM_PROMPT`
      1,798 words, sha `28efc756`, and the 16 tool schemas sha `9099fea1`,
      computed before the run. **So the median moving 19.0 → 17.1 is a
      resample and is not claimed as an effect.** What the run actually gated
      is the 118 changed lines of `agent/` since P1.h — `reading.py` (82),
      `prose.py` (17), `loop.py` (12), `compose.py` (7) — which is the
      riding-cards trade §2b describes, paid once, here.

      **THE GATE TO PHASE 2: three of four.** Median under 10 s — **no, and
      the shortfall is named with its cause above**, which is what the gate
      asks for. A navigation fragment with no model call — **yes**,
      re-measured today at 760 ms over two reads, 518 ms over one and 602 ms
      for an analytical figure, all against a 2 s budget
      (`tests/test_fragment_live.py`, `tests/test_replay_live.py`, **19 live
      tests passing**). Trust rows unchanged — **yes**. Open empty five days
      running — reached **day two** on 2026-09-15 and reset to zero the
      same day, when two items went back into Open.

      **THE FABLE 5.1 REVIEW HAPPENED 2026-09-14** and is in `ops/DECISIONS.md`
      under that date. It recomputed every figure here from `p1close-v2.json`,
      the ledger, the prompt and schema hashes, the `agent/` diff and both
      suites, and found nothing in this close-out wrong. What it says not to
      trust is on the Phase row in §2, and the gate's fragment condition is
      the one to read twice: **760 ms is `run_call` timed in-process from a
      laptop** — no HTTP, no browser, no render — so that condition is met by
      a unit timer and not by the live build.

      Suites exact: **1,657 pure**, **974 vitest**, `tsc -b` and `build`
      clean, **19 live**. No production file was changed by this card: the
      edits are `ops/NOW.md`, `ops/plan/plan.html`, `ops/DECISIONS.md` and the
      one line of `tests/test_plan_alignment_contract.py` that could not count
      a phase with no cards left in it.

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

**CLOSED BY MERGE 2026-09-17 — nothing open remains under this heading.** The
owner: *"are you sure we should still do the remain original phase 2 with the
new phase 2S? could you just merge them together cause i dont know if the old
functions are good to carry thtough"*. Each open card was judged against the
standard (`ops/STANDARD.md`, 2026-09-16) rather than against the plan it came
from, and they went four different ways — see the MERGE paragraph at the top
of Phase 2S. In one line: **P2.k → P2S.3(g)**, **P2.i → P2S.4**, **P2.✓ →
P2S.✓**, **P2.j → P3.g**, and **P2.h was parked** because the standard's own
sentence rules out the version it described — **then restored the same day as
P2S.5 at the owner's word**, built to that sentence's bar instead.

- [x] **P2.0 a report says whether it passed** — **CLOSED 2026-09-15.** The
      outcome is no longer something a caller can claim: `Report.add` has no
      `passed` argument at all, and `tests/evals/conftest.py` writes the
      verdict from `pytest_runtest_makereport` when the test body ends —
      `true`, or `false` with the assertion in a new `failure` key, or `null`
      for a scenario the run never reached. Three-valued deliberately: a run
      that stopped early did not fail what it never ran, and saying it did is
      the same lie the other way round. Proven end to end on a throwaway
      module of three tests — one passing, one failing, one skipped — which
      wrote `passed 1/3, failed ['two'], unscored ['three']` and carried
      `AssertionError: figures no tool returned: ['801']` on the failure.
      **The four v2 reports are not rewritten and cannot be re-scored**: the
      score was never written anywhere, so a new top-level `scoring` block
      marks every report from today on, and its ABSENCE is how a reader knows.
      `tests/evals/corpus.py` prints the paragraph saying so — confirmed
      against `p1close-v2.json`, which also replays 1 of 11 on today's checks.
      **The key-list half found a live gap**: `cache_hit` and `cache_measured`
      were on the `done` frame and in no report, so the four recorded runs
      carry neither. `harness.DONE_KEPT` and `DONE_DROPPED` now declare all 17
      keys and `tests/test_eval_report_contract.py` reads the frame out of
      `agent/loop.py` by AST and fails on a key in neither — verified in both
      directions. **The shortfall: nothing can recover the four**, and no live
      run has exercised the hook, so the first report that says whether it
      passed will be P2.✓'s. **24 new pure tests; no eval, $0.00** — no
      production file and no model-facing file was touched.

- [x] **P2.a a thread is already a page** — **CLOSED 2026-09-15.** The thread
      has a header with three views — **Talk · Behind it · Page** — and Behind
      it, which P1.k built as a view with nowhere to be reached from, is now
      one of them. **Keep as page is one write**: `POST /george/pages` grew an
      `analyses` field and BOTH cases — empty and with sections — now go
      through `page_operations.build_page`, the same service function George's
      own `create_page` reaches through the injected writer, so the page and
      its pins commit together or not at all and the button cannot grow a
      second set of bounds. The route writes as `USER`, never as `george`.
      **The Page view says what it would leave off, and why, before anything
      is written** — `room/keeping.ts` is a pure plan over the thread's turns:
      one section per question, named by the PERSON'S words and never by
      George's, holding the calls the loop marked `pinnable` on its own frame.
      Four reasons a turn is left off, each in words: it read nothing that can
      be run again; it took more reads than one section holds; every read
      behind it is already kept above; it is older than the six a page is kept
      at a time. **The cap is measured over turns that had something to keep**,
      so a thread with four empty turns does not lose four good ones to a bound
      it never reached. **The no-read-twice rule is predicted, not discovered**:
      `json.dumps(sort_keys=True)` is what the service keys on, so the client
      sorts every level too — a `date_range` pair nested in an argument reads
      as a duplicate on both sides, which is the 422 nobody could have read in
      advance. **A kept thread shows its page**, off a new `thread_id` scope on
      `GET /george/pins`: a pin records the conversation it was made in, a
      thread is a list of conversations, and `thread_access.conversations_in_thread`
      is that resolution given a name rather than a second copy of `get_chat`'s
      SQL. Two scopes on one listing is a 422 naming both, because one of them
      would otherwise have been silently ignored. Four renderings of the kept
      state and the first two never borrow the last two's words: *checking*,
      *could not be read*, *kept as ‹name›*, *not kept*. **Nothing wears the
      accent** and nothing on the Page view is a figure — the only numbers are
      counts of reads.
      **The bounds are one set in three languages**, held by value:
      `MAX_SECTIONS` and `MAX_CALLS_PER_SECTION` read out of `keeping.ts` by
      the contract test against `page_operations.MAX_ANALYSES_PER_BUILD`,
      `pin_writer.MAX_TOOL_CALLS_PER_PIN` and
      `pages.workshop.max_analyses_per_build`.
      **The round trip is proven against the real database, rolled back**:
      `tests/test_thread_as_page_live.py` keeps a two-section page and finds it
      again through the thread — and the resolver excludes another person's
      turn in the same thread, a hidden turn of the caller's own, and a page
      built against no conversation at all. A conversation from before
      `thread_id` existed is still its own thread.
      Suites exact: **1,700 pure in CI, 1,704 on a machine that has the
      recorded runs** (was 1,681 / 1,685), **1,006 vitest** (was 974),
      `tsc -b` and `build` clean, **app-db live 7** (was 3). **Quote the CI
      number**: the four extra are `verification/*-v2.json` parametrized into
      the report scan, and that directory is gitignored, so a pure count taken
      here is four higher than anywhere else. This card's first close-out said
      1,701 and that number exists on one laptop.
      **The shortfall, and it is the honest one: nobody has pressed the button
      in a browser.** Every number above is a suite: the dom test drives
      `ThreadHeader` and `ThreadPage` directly and the live test drives the
      service directly, and **`Room.tsx` itself is still rendered by no test**
      — which is the gap `room.dom.test.tsx`'s own header has named since
      2026-09-11, not something this card introduced. So the three views, the
      header's place above Noticed and the return to Talk when a question is
      asked are held by the typecheck and the build and by nothing that
      renders them. **And a second keep makes a second page**: nothing merges a
      thread into the page it is already kept as, which is stated on the view
      rather than fixed. No eval, $0.00 — no model-facing file was touched:
      `SYSTEM_PROMPT` and the tool schemas are byte-identical.
- [x] **P2.b markers on figures, two voices, five colours** — **CLOSED
      2026-09-15.** Three claims, each held by a scan rather than by a review.

      **A FIGURE NOW SAYS WHICH READ, AND A FIGURE WITH NO READ SAYS THAT.**
      P1.k made a placed figure tappable and stopped there, so a numeral
      George worked out himself and a numeral a tool returned were drawn
      IDENTICALLY — the only way to tell them apart was to tap one and see
      whether anything happened. A placed figure now carries the read's index
      after it (`.r-figure-n`, the receipt face, `--ink-3`), so two figures out
      of the same read wear the same number and that read's rung in the work
      trail wears it too (`.r-work-i`); an unplaced one is drawn in the
      caveat's own ink with no underline and no marker. `readIndexes` in
      `work.ts` is the single definition of "which read is this" — a landed,
      non-duplicate read only — and the trail and the markers both read it, so
      a marker cannot count something the steps do not.
      **The scan runs over the WHOLE answer, not the lit claim.** It ran over
      `reading.claim`'s span alone, so whether a figure could be opened
      depended on where in his paragraph he had put it; the claim slot is the
      few words that ARE the point and the figures qualifying them are usually
      in the sentence after it.
      **`figuresIn`'s span was one character too long** and this card is where
      it showed: `\s?(suffix)?` ate the space after a figure with no suffix, so
      "₱18,400 more" cut the gap out with the number. The space moved inside
      the suffix's own group. Same numerals, same values, same matches —
      `agent/prose.py` reads the groups and never the span, which is why it
      never mattered there.

      **THE DONE-WHEN, OVER THE FOUR RECORDED RUNS.**
      `__fixtures__/recorded-answers.json` is 44 real answers from
      `p1e-v2`, `p1f-v2`, `p1h-v2` and `p1close-v2` with the rows those turns
      really read (511 KB; results carried from an earlier turn of a thread are
      NOT attached, because the room hands the reading THIS turn's calls).
      **82 figures across 38 turns, every one placed and every one marked, and
      not one unplaced.** That is the evals' own trust row — *0 figures no tool
      returned* — seen from the client for the first time, and it means the
      corpus does not exercise the unplaced branch at all: the synthetic
      ₱18,400 case holds that. The count is asserted exactly rather than as a
      floor, so a change to the matcher has to say so. **Six of the 44 called
      nothing** — a follow-up, a correction, "run it Monday" — and those mark
      NOTHING either way: no record here is not no evidence (UI rule 8).
      And the reading still says exactly what he said, word for word, with the
      markers removed by element rather than by searching for a digit.

      **TWO VOICES, BOTH DIRECTIONS, ONE FILE.** `voices.dom.test.tsx` reads
      room.css for every SELECTOR setting `var(--sans)` and `var(--mono)` —
      selectors, not class names, because `.r-spec-cell em` is prose and
      `.r-spec-cell b` is a receipt in one cell and a class-name scan had to
      argue with itself about it. Nothing model-written in a receipt line
      (P1.k's, moved here from `visibleWork.dom.test.tsx` to sit beside its
      mirror) and nothing frame-derived in a prose line: a tool name, a source
      table, an argument key, the predicate half of a filter. **Both excuses
      are computed off the frames, not listed**: a word of his that appears
      anywhere in the turn's frames is not evidence of his prose, and a machine
      string inside a tool's ERROR is the tool talking in sentences, which is
      deliberately drawn in prose type. A prose line reads its OWN text, so
      `read sales · 1 row · 412ms` — his voice with the frames' counts inside
      it — is the shape the scan encourages rather than the shape it fails on.
      **And the scan bites**: a test puts `new_transactions` in a prose line
      and asserts the same two functions find it.

      **FIVE COLOURS.** `accentUse.test.ts` guarded one — the accent — and
      `palette.test.ts` bounds the other four from INSIDE a mark; nothing
      bounded them from outside, which is the same hole that let the room's
      needs-you badge wear `--down`. `--up` and `--down` may now be named by
      **no file at all** (a mark reaches them through `paint()`), `--flat` by
      `marks.tsx` and `room.css`, `--george` by four files with a reason each.
      Comments are stripped first, so a token named in a docstring is not a
      token used.
      **The card's "quiet" is the room's `--flat`** — the colour of a row
      nobody emphasised — and the token was NOT renamed: three files and
      `palette.test.ts` read that name by value, and a rename is a word
      changing, not a meaning. Say so rather than quietly picking one.

      Suites exact: **1,704 pure locally / 1,700 in CI** (unchanged — the one
      Python edit tightened an existing contract rather than adding a case),
      **1,052 vitest** (was 1,006), `tsc -b` and `build` clean.
      **No eval, $0.00** — nothing under `agent/`, `backend/` or `definitions/`
      was touched, so the prompt and the tool schemas are byte-identical.
      **The shortfall, and it is the same one P2.a left:** nobody has seen this
      in a browser. Every number above is a suite. And **the marker's number is
      drawn in the work trail but NOT in Behind it**, which is where a tapped
      figure actually lands — Behind it is a view on the THREAD and a per-turn
      index would repeat across turns, so the focused entry's edge is all that
      says "this one". A thread-wide numbering is the honest fix and it is not
      in this card.
- [x] **P2.c a subject becomes an id — by tap, and by `@`** — **CLOSED
      2026-09-15.** The bug was one line: the room sent
      `{id: label, label}`, so every subject reached George as a WORD while
      the rows had carried `store_id` two columns away the whole time.
      **`room/subjects.ts` reads the declared identity column out of the row
      it tapped** — `selection.identity` and a new `selection.label_columns`,
      both served — and the subject says where its id came from (`rows`,
      `mention`, or `label` where the identity IS the name, which is true by
      definition of a category and of a supplier: there is no supplier master).
      **A supplier is now a subject dimension**, because `@Seikyo` had nowhere
      to travel and would have arrived as a word in the question.
      **The `@` door is `GET /george/mentions`**, five kinds off the reads
      that already define them — the store list, `get_product(name=)`,
      `get_purchasing(group_by=supplier)`, the caller's own pages, the
      company's rules. **No SQL in the service and no model anywhere on the
      path**, both held by an AST scan. What each kind BINDS is the
      definitions' to say: three are subjects, a page binds `page_scope`, and
      a rule binds nothing — there is no request field for a workflow — so it
      travels as `desk.references` and running it stays his tool call.
      **"Compare these" with two shops picked is a replay**: 528 ms median
      over five runs against a 2 s budget, the two `store_id`s in
      `filters.store`, two rows out, `default_composition` drawing a
      **dumbbell** with no claim on it. That needed `resolve_store` to take a
      LIST — the predicate was always `store_id IN (...)`, so one shop was
      never a different shape of query, only a shorter list; an unknown name
      in a list refuses by that name and an empty list refuses rather than
      meaning the estate. **The composer came out of `Room.tsx` as
      `Composer.tsx`** so the `@` menu has something a test can mount, which
      is the first thing in the room's composer that a dom test drives.
      **The supplier list is cached 60 s in-process** — it is a grouping over
      every PO ever written (811 ms) and does not depend on the prefix, so a
      menu read went 811 → 378 ms — and **no figure is drawn beside a name**,
      on purpose: a figure wears the time it was read (UI rule 6) and a
      completion menu has nowhere to put one.
      **1,726 pure locally / 1,722 in CI, 1,100 vitest, live 10 (5 read-only,
      5 app-db rolled back); no eval, $0.00.**
      **THE SHORTFALL, and one of them is model-facing.** `SYSTEM_PROMPT` is
      **NOT byte-identical**: it went 1,798 → **1,799 words**, sha `28efc756`
      → `fa166e19`, because the desk sentence lists the subject dimensions off
      the yaml and there is now a fourth. One extra word, one cache write on
      the first turn after a deploy, and **one word of headroom left against
      `voice.budget.max_words` 1,800** — the next card that adds a word to a
      served list fails `test_voice_contract`. The tool schemas are unchanged
      (`9099fea1`). And the same shortfall P2.a and P2.b left stands: **nobody
      has typed `@` in a browser** — every number above is a suite or a live
      read from a test process. **`Room.tsx` is still rendered by no test**,
      so the wiring from a tap to the chip is held by the typecheck and by the
      two halves being tested apart. **A page mentioned inside an open thread
      binds nothing**: `scopeForAsk` fixes a thread's scope when it starts, by
      a rule older than this card, so an `@page` chip only moves the scope on
      a new thread — it is drawn, and it is not yet drawn differently.
- [x] **P2.l colour means one thing** — **CLOSED 2026-09-15.** It came out of
      the dogfood log, which outranks this list, which is why it sat before
      P2.d. **His words:** *"what do the colors mean now? does this make
      sense?"*, asked of `51af583` on the live build. It did not: colour meant
      four things at once — the tile's wash was IDENTITY (`identity.ts`), its
      brightness MAGNITUDE with no direction (`--i`), the dots, bars and pills
      DIRECTION — and three of the seven shop hues sat on the three semantic
      colours.
      **THE SHELL CARRIES NO IDENTITY AND NO MAGNITUDE.** `Shell` lost `hue`,
      `change`, `solid` and `george`; `.r-tile` lost its hue border, its
      `--bloom` wash, the fully coloured `--solid` variant and the twelve
      rules that bridged the room's ink onto it; hover, focus and picked are
      the chrome's greys, where they were the object's hue at three alphas.
      **One hue is left and it is an OPENED object** — `.r-obj`, one thing on
      screen, named in its own heading — and `marks.tsx` is its only caller.
      The same move went one layer deeper than the card asked, because the
      grammar had the same hole: `Spec.colourOf` looked a non-direction column
      up as an identity, so `colour: store` drew the seven hues inside a
      composed shape after P1.e had taken them out of the six marks. **A
      direction, or flat.**
      **THE MAGNITUDE QUESTION WAS ANSWERED BY THE CODE, NOT BY TASTE, AND THE
      ANSWER IS THAT THE CHANNEL WAS ALREADY DEAD.** P1.e deleted the last
      tile that passed a `change` to `Shell` on 2026-09-14, so every tile has
      rendered at `--i: 0.000` since — seen in this session's own failure
      output against `51af583`: `--hue: 222, 138, 11; --i: 0.000; --d: 0ms`.
      The dogfood log described the brightness as a live meaning a day later.
      A channel whose absence nobody can see is not a channel, so it is gone
      with `intensity()` and `INTENSITY_CAP_PCT`.
      **THE TWO GUARDS COVER THE SHELL INSTEAD OF EXEMPTING IT.**
      `palette.test.ts` wrote the exemption in its own words — *"identity keeps
      its hue where identity is the point — the tile's edge and wash"* — and
      now PARSES the stylesheet (the `keptChrome` lesson: a comment closed
      twice hid a dead rule from a string search) to prove `var(--hue)` reaches
      exactly one selector — **13 rules painted with it before today, eight of
      them a tile** — that no `.r-tile` rule paints with an
      identity or a magnitude, and that `--i` and `--bloom` are declared and
      read nowhere. `accentUse.test.ts` gained the identity family beside its
      five colours: three files may name `hueFor` or `--hue`, each with its
      reason.
      **AND IT IS DRAWN, NOT READ: `palette.dom.test.tsx`** renders a board of
      the seven shops and all 13 blocks of the eight recorded runs through the
      real renderer, and scans every inline style for every identity triple
      `identity.ts` holds — built through `hueFor`, so a shop added there is
      forbidden here without anybody remembering. **18 tests; on the shipped
      renderer 15 of them fail**, which is the evidence the card asked for and
      the reason to keep this file rather than only the source scans.
      **It found a live defect in the colour guard itself**: `ACCENT` carried a
      literal backspace where `\b` was meant (a heredoc collapse, committed
      before today), so one of its three alternatives had been matching
      nothing. Repaired — and it caught a real breach on the next run.
      **1,726 pure locally / 1,722 in CI (unchanged, no backend file touched),
      1,100 → 1,124 vitest, typecheck clean; no eval, $0.00** — no
      model-facing file is touched, `SYSTEM_PROMPT` is untouched at 1,799
      words.
      **THE SHORTFALL. Nobody has seen the new board in a browser** — the
      fourth card running with that gap, and this one is a LOOK: every number
      above is a test process, and what a tile with no wash reads like on the
      dark ground is unknown until he opens it. **Nothing was added where a hue
      could still earn its place** — a subject chip is uncoloured, because
      adding colour is not what he reported. **The other log item is still
      open**: `marks.tsx` `Figure` still falls back to `?? rows[0]`, so a claim
      can still draw another shop's figure. That is the next session, and it is
      the worse of the two.
- [x] **P2.d actions that say why; grey text that finishes the question** —
      CLOSED 2026-09-15 (`0897b8f`). `compose` carries a THIRD statement:
      `{act, seq, target, reason}`, validated in `agent/actions.py`. The
      target passes the same `_backs` a block's subject passes, so an offer
      sits on a row or on nothing; the reason is held to the annotation rule
      and carries no digit, because the figure is on the row beneath it with
      its own receipts. **The cost is DERIVED** — each act declares "~1s" or
      "a turn" in `metrics.yaml`, the validator copies it onto the offer, and
      the schema has no property for it, so a model's opinion about speed has
      nowhere to arrive. **`replay` is written down as the act that is NOT
      offered**, with its reason: it needs a VALUE as well as an argument and
      the presets live in the renderer, so it would draw a button that cannot
      be tapped — which is what the control validator already refuses.
      **Placement is decided ONCE for the whole screen** (`room/actions.ts`
      `placement`) rather than by each mark filtering for itself, because the
      foot needs the other half of the same decision: a targeted offer lands
      inside the mark on its own row, everything else — including one aimed at
      a row the board drew as a line chart — lands at the foot beside `next`.
      Held by a test that every offer is drawn **exactly once and none
      nowhere**, which found a bug where two objects over one read each drew
      the same button. **Ghosts** complete the line from what is on screen: a
      window the board is not already on (a replay), a name the board is
      drawing, a page whose title names one of them. Tab accepts, Enter still
      sends what was typed, the `@` menu wins the key while it is up, and no
      model call is ever made — the one request is the cached mentions read
      the `@` door already makes. **The prompt is byte-identical at 1,799
      words, sha `fa166e19`** (the catalogue is on the tool, read at the moment
      of choosing); tool schemas `9099fea1` → `4d86b47a`. **1,727 → 1,744
      pure, 1,127 → 1,196 vitest, typecheck clean; no eval, $0.00.**
      **THE SHORTFALL. Nobody has seen any of it in a browser** — the fifth
      card running with that gap, and `Room.tsx` is still rendered by no test,
      so the ghost's position under the caret and the offer's place inside a
      row are held by jsdom and by nothing that lays out. **`replay` is not
      offered at all**, which is one of the three acts the card names and the
      only one whose cost label the card spelled out. **And no live turn has
      produced an offer**: every test drives the validator and the renderer
      directly, so whether George reaches for the channel unprompted is
      unknown until P2.✓.
- [x] **P2.e replay an investigation** — CLOSED 2026-09-15. **Replay is the
      thread's fourth view**, beside Talk, Behind it and Page: every STEP of
      the conversation in the order it ran, one at a time, with the rows it
      brought back, its receipts and its own clock. `walkOf` in `room/work.ts`
      is the list and `room/Replay.tsx` draws it. **It is not Behind it.**
      Behind it is the EVIDENCE — the reads, flat, receipts only, answering
      *where did these numbers come from*. Replay is the WORK — every step,
      the compose and the pin included, answering *what did he do, and what
      did he see*. **Nothing on the path asks anything**: no planner, no
      re-read, no model turn, held by a test that the component names no
      client, no api module and no `fetch`. A refusal is the tool's own
      sentence and draws no receipts, because it has none.
      **THE WALK IS THE ONE WORK SURFACE THAT DRAWS FIGURES**, so UI rule 6
      bites here and it is enforced: rows with no `snapshot_timestamp` on
      their read are WITHHELD and the rung says the receipts were not kept.
      Four states, four renderings — landed with rows, landed with the rows
      not kept, declined, running.
      **IT FOUND A WRONG FIGURE THAT HAS BEEN ON SCREEN SINCE P1.k.** The
      loop sends a read's rows all or none: past `MAX_ROWS_TO_CLIENT` the
      frame carries `rows: []` with `rows_complete: false`. `stepsOf` counted
      the array, so a read that returned 214 rows has been drawing **"0
      rows"** in the live work trail and in Behind it — a number nothing
      measured. It reads `row_count` now, which also gives a reopened thread
      its counts back.
      **Two things that were two definitions are now one**: which columns a
      table of rows draws (`data.tableShape`, shared with the board's own
      table) and which question an answer was given under (`work.asked`,
      shared with the page a thread would be).
      **1,744 → 1,762 pure, 1,196 → 1,220 vitest, `tsc -b --force` clean,
      `npm run build` clean; no eval, $0.00.**
      **THE SHORTFALL. Nobody has seen it in a browser** — the sixth card
      running with that gap, and `Room.tsx` is still rendered by no test, so
      the fourth tab's place in the header and the walk's layout at phone
      width are held by jsdom and by nothing that lays out. **The walk is
      thread-scoped and has no way in from an answer**: the header tab is the
      only door, so a person reading one answer taps Replay and lands at step
      one of the whole conversation rather than at that answer's first rung.
      **And no stored thread has actually been walked** — every test drives
      the component and `restoreFromPosts` directly; whether a real reopened
      thread yields rows at every rung depends on what its post kept, and
      that is unknown until somebody opens one.
- [x] **P2.f what do you remember?** — CLOSED 2026-09-15. **`view_memory` is
      drawn as a finding**, over a fifth kind that is not a mark
      (`composition.widgets.memory`, `room/tiles.MemoryTile`): every view he
      holds, one line each, saying what he thinks, WHEN he learned it, what it
      RESTS ON, and how many questions it has been carried into — with a
      **Forget** on every row and the read's own receipts under them.
      `default_composition` draws it by the TOOL rather than by the columns,
      which is its only such branch and is why the register is not a table:
      by columns alone it is one, and a table draws no Forget.
      **"NOT WHAT I MEANT" WAS STRUCTURALLY IMPOSSIBLE UNTIL TODAY.** A belief
      named the calls behind it, so "we means the shops, not the warehouse" —
      the one correction nobody but the owner can settle — was refused as
      ungrounded every time. `judgment` gains a sixth stance, `means`, and
      `judgment.taught`: a `means` view names `told`, their own words, and no
      calls; every reading stance names calls and may not name `told`. EXACTLY
      ONE GROUND PER VIEW, refused in the validator and again by a check on
      the table. In the prompt block a taught line says YOU WERE TOLD and is
      **never marked unconfirmed** — no amount of new data makes it less true
      that this is what they meant.
      **FORGET IS A PERSON'S GESTURE AND GEORGE HAS NO TOOL FOR IT.**
      `POST /george/beliefs/{id}/forget` stamps `forgotten_at` and the hand
      that did it; the row stays and stops being current, which takes it out
      of the prompt and out of `view_memory` in the same breath. The absence
      from his schema is the guarantee, as for every write. A second Forget on
      the same view is a 404, not a success.
      **"HOW OFTEN APPLIED" IS A COUNT OF ATTACHMENTS AND SAYS SO.**
      `mark_applied` moves the counter for exactly the ids `in_prompt` put in
      the block, so it cannot drift from what was handed over — and the read's
      note and the tile both say *carried into N questions*, never *changed N
      answers*, because nothing on this path observes an answer changing.
      Counted on the standing path too: a scheduled question is a question.
      **One migration, `x8y9z0a1b2c3`** — `told`, `applied_count`,
      `last_applied_at`, `forgotten_at`, `forgotten_by`, the grounding check
      `NOT VALID` so a legacy row cannot fail the deploy, and the partial
      index re-cut to match the new "current".
      **`SYSTEM_PROMPT` 1,799 → 1,791 words, sha `fa166e19` → `ee1d17d1`**;
      the sixth stance and the correction clause cost 28 words and were paid
      for by two duplications inside JUDGMENT (the stance list already said
      "not worth attention" and "moved and I cannot establish why"; KEEPING A
      VIEW already said "record the change against its id with the reason").
      Tool schemas changed: `evidence` left `required` and `told` did not join
      it, because which ground a view needs depends on its stance.
      **1,762 → 1,787 pure in CI (1,791 here), 1,220 → 1,232 vitest,
      `tsc -b --force` clean, `npm run build` clean; no eval, $0.00.**
      **SHIPPED AND CONFIRMED THE SAME SESSION.** Pushed as `c87fda5`; the
      migration ran on Railway — which had never been run anywhere else, there
      being nothing here to run it on — and `/health` reports
      `x8y9z0a1b2c3` current and expected on `c87fda56`. The swap cost two
      502s over 66 s, watched from before the push, and
      `POST /george/beliefs/{id}/forget` answers 401 rather than 404, so the
      route is served and gated.
      **THE SHORTFALL. The done-when is not held by anything that ran.**
      "We means the shops, taught once, changes the next how are we doing" is
      two model behaviours — forming the view on a correction, and scoping the
      next answer to it — and behaviour is held by the evals, which this card
      does not run. Every mechanism under it is tested; whether George reaches
      for them is unknown until P2.✓. **And nobody has seen any of it in a
      browser** — the seventh card running with that gap.
- [x] **P2.g the estate switch** — CLOSED 2026-09-15. **Four pills above
      everything — All · 7 shops · AJI BARN · AJI CMG** — and pressing one
      scopes the NEXT question, which is why nothing below them redraws and
      the gesture costs no turn. `surface.desk.estate` in the yaml; the pills,
      their words and their places are served by `/definitions/desk` and a
      part names a PATH into `stores` rather than a shop, so opening a shop
      moves the pill, the sentence and the ids in one edit.
      **THE DEFAULT TRAVELS AS NOTHING, and that is the whole guarantee.**
      `all` is what every question has meant until today, so a question asked
      with the switch untouched is byte-identical to one asked before this
      existed — held by a test that drives two turns and compares the user
      content. The switch can only narrow.
      **IT ENFORCES NOTHING, BECAUSE THE ENFORCEMENT ALREADY EXISTED.** It
      rewrites no call, narrows no tool schema and filters no row: `get_sales`
      at the warehouse has refused in its own words since 2026-09-13
      (`filters.excluded_from_sales`), and vending is its own domain read
      through the `_php` views. What the card adds is the scope in FRONT of
      that, named to George on the question beside the selection — widest
      clause first, since a subject and a window sit inside one estate.
      **`SYSTEM_PROMPT` IS BYTE-IDENTICAL** at 1,791 words, sha `ee1d17d1`:
      the estate rides the question, never the cached prefix, and the one
      prompt edit was `_scope_sentence` reading "AJI CMG" out of
      `stores.vending_stock_location` instead of having it typed — the last
      literal store name in the prompt, and the same row the vending pill
      scopes to.
      **IT FOUND A REAL BUG AND THE PILL IS WHAT MADE IT MATTER.**
      `tools/_common._STORE_GROUPS` was a tuple of five group names in Python
      while the yaml had six: `vending_stock_location` was never added, so
      `resolve_store("AJI CMG")` answered **"Unknown store 'AJI CMG'"** — the
      exact sentence the warehouse fix exists to prevent, about a real row
      with 3,534 inventory rows behind it. The groups are `stores.groups` now
      and `estate()` reads them, so the sweep cannot drift from the store list
      again; the count it finds is 22, which is `total_rows_in_stores_table`,
      and a test says so.
      **1,796 → 1,817 pure here (1,813 in CI), 1,268 → 1,284 vitest,
      `tsc -b --force` clean, `npm run build` clean; no eval, $0.00.**
      **HE READ IT AN HOUR AFTER IT SHIPPED AND CAUGHT A REAL ERROR.**
      *"aji barn and aji cmg are our warehouses, but if in the future it can be
      a whole new buisness then ok"*. The card shipped with ONE pill reading
      **AJI CMG · vending**, scoped to `stores.vending_stock_location` and
      answered by `get_vending` — **the join this yaml forbids, twice over**:
      that row is a stock location that takes no transactions and is
      explicitly *"NOT the vending business"*, and `get_vending` has no store
      argument at all, only `machine`. Corrected the same hour: **AJI CMG is a
      warehouse**, read like the barn, and **vending is a BUSINESS** with
      `has_no_store_scope: true`, no store list, machines for places. Five
      pills. That also answers his second clause — a genuinely new business is
      a part shaped like vending's, and it is a block in the yaml.
      **AND THEN A SECOND WORD, ONE LAYER DOWN.** *"aji barn is also a
      warehouse"* — the pills had said so since the first commit, so there was
      nothing on screen to fix and saying only that would have answered the
      wrong question. In the yaml BOTH warehouse parts still carried
      `domain: retail`, the word standing in for "the store side, not
      vending". Nothing reads that field at runtime, which is how a wrong word
      survives in one: it is what the next person reads. The vocabulary is the
      file's own pair now — `surface.desk.estate.domains: [store, vending]`,
      after `vending.never_join_to_store_domain` — and **a part that says
      `warehouse` and is filed anywhere but `store` fails a test**.
      **AND THEN HE DREW THE SHAPE, WHICH IS THE THIRD REPORT ON THIS CARD
      IN ONE EVENING.** *"barn and cmg are warehouses so they should be builit
      into aji ichiban all stores so they dont need their own pill"*. Four
      pills mixed BUSINESSES with PLACES — two of them were single rows of
      `stores`. **The switch is for businesses**; a place inside one is the
      SELECTION's job and has been since P2.c. **Three pills now: All · Aji
      Ichiban · vending**, the first covering the shops and both warehouses,
      named from `business.name` rather than typed.
      **AND IT COST SOMETHING THAT HAD TO BE CHECKED.** With no pill, `@` is
      the only door to one warehouse — `@AJI BARN` worked and **`@AJI CMG` did
      not**: `backend/app/services/mentions.py` kept its own tuple of store
      groups, missing `vending_stock_location`, exactly as `tools/_common`'s
      had. **A third copy of the same list, and removing the pill first would
      have left AJI CMG reachable by no gesture at all.** Both read the yaml
      now. `count_places` was deleted with the pill it drew for.
      **1,817 → 1,821 pure here (1,817 in CI), 1,284 vitest unchanged.**
      **THE SHORTFALL. Two of the three done-whens are not held by anything
      that ran.** "Scoped to the barn reads stock, not sales" and "scoped to
      vending returns the honest state" are model BEHAVIOUR — whether George,
      told the scope, reaches for `get_stock` instead of `get_sales` — and
      behaviour is held by the evals, which this card does not run. Every
      mechanism under them is tested: the sentence, the refusal it tells him
      to expect, and that vending's profit flag and stock staleness are still
      mandatory. Whether he reaches for them is unknown until P2.✓.
      **The switch does not survive reopening a thread.** The part is kept on
      the question post's payload, and nothing reads it back — so a reopened
      thread draws All under answers that were asked at the barn. **The
      SELECTION has the same gap and has had it since P2.c**, which is why
      this was left rather than fixed here. **And nobody has seen it in a
      browser** — the eighth card running with that gap.
- [x] **P2.m "analyze" is an investigation, not a lookup** — CLOSED
      2026-09-16. **His words, 2026-09-15:** *"it only showed me 1 chart when i
      thought i would go in depth products per store and what i thinks … i
      feels very limited not limitless"*. **And his words opening this session,
      which widened it:** *"the root problem is george isnt thinking for
      himself he actually just analyzed the data i want him to see the data and
      make his own, this is not just a chatbot"*.
      **THE GATE IS THE INTENT NOW.** `investigation.opens_when` in the yaml:
      eight verbs of the intent ("why", "what happened", "analyze", "look
      into", "break it down", "dig into", "go deep", "in depth"), the three
      message kinds that carry it without a verb, and `not_gated_on_the_word:
      why` recording what it used to be. The prompt sentence went from *"'Why'
      is an investigation"* to *"TAKING A FIGURE APART is an investigation …
      the word 'why' is not the gate"*, built from that entry.
      **FOCUSED NAMES ITS SECOND READ, WHICH BROAD HAS DONE SINCE UNDERSTAND.**
      `scope.kinds.focused.taken_apart`: floor of 2 reads, the second being
      the drivers in the same batch or the dimension under the one named. It
      is a floor on the READING and not a quota — a read that establishes
      nothing is not made to reach it — and the mechanics sit on `get_sales`,
      where the call is chosen, not in the prompt.
      **AND THE HALF HE ADDED THIS MORNING.** `judgment.a_view_is_owed`:
      `may.rank_importance` has PERMITTED a view since that section was
      written, and permission is not a request, so the prompt now says A VIEW
      IS OWED, in three clauses off the yaml. Nothing is relaxed: `grounding`
      and every `may_not` are untouched and tested to be.
      **THE BUDGET PAID FOR IT RATHER THAN BEING RAISED.** 1,791 → **1,797
      words against 1,800**, 9 rules, 13 prohibitions. The localizing call
      shapes and the driver-batch mechanics moved to `get_sales` (voice.budget's
      own route), and three duplicated sentences were cut: THE SURFACE's "READ
      AS WIDELY AS THE INTENT IS WIDE" (SCOPE says it in full), THE DESK's "a
      headline set … so 'why?' is answered without reading again" — **which
      told him the opposite of this card** — and THE DESK's ask-one-question
      clause, which WHO YOU ARE and SCOPE's AMBIGUOUS both already say.
      **1,825 → 1,836 pure here (1,821 → 1,832 in CI), 1,284 vitest untouched
      — no frontend file changed.** Eleven new tests, all eleven red before the
      change.
      **THE SHORTFALL, AND IT IS THE WHOLE OF THE CARD'S EVIDENCE. The run has
      not been made, and the run the card named could not have seen this
      anyway.** Every one of the eleven voice scenarios already carries "why",
      "which", "dig deeper" or "what caused", so all eleven climbed the ladder
      before this change and all eleven climb it after: a full run measures the
      REGRESSION (more reads, more chances at an ungrounded figure) and not one
      thing this card did. **Two scenarios that CAN see it are added to
      `tests/evals/test_investigation_evals.py`** — "analyze tradsnax per store
      …" asserting a second, different, deeper read, and "how did Rockwell do
      …" asserting a lookup was not widened — and **neither has been run**.
      Whether George reaches for the second read, and whether he says what he
      thinks, is unknown until one is. The depth is asserted; the VIEW is
      recorded and not gated, for v2's own reason — what he chooses to say
      flaps run to run.
      **And nobody has seen it in a browser** — the ninth card running with
      that gap, though this one changes no pixel.
**Phase 2S — the design, built.** Four sessions, re-cut from nine on
2026-09-17 at the owner's word (*"can we do it faster by putting stuff
together? only do it if we still preserve function"*). Function is preserved
because only one card here touches what George reads or writes; the other
work is how the same data is drawn and placed, and every done-when below is
still its own test. The nine cards survive as the numbered parts inside the
four, each committed on its own inside the session, one deploy per session.
Measure everything against `ops/ideal/george-ahead-of-me.html`, the `beside`
room — **and port its markup and CSS into the React room rather than
re-deriving them from a description: the page is already the thing.**

**THE MERGE, 2026-09-17 — Phase 2S IS NOW ALL OF WHAT WAS LEFT OF PHASE 2.**
Five sessions. The owner asked whether the old open cards should still run
after this phase, *"cause i dont know if the old functions are good to carry
thtough"*. **The answer splits in two, and the split is the point:**

* **The old FUNCTIONS carry through, because the new standard names every one
  of them** — reading slots (§4 "what is happening … what is still unknown
  … what we should do next"), selection and "these two" (§8), memory (§9),
  keep as page (§12), the business switch (§17), the draft and approvals
  (§11, §15). The table below is where each one lands in the room. Two are on
  trial because the artifact never drew them — the known/likely/possible/
  unknown line and the thread's four tabs — and P2S.1 is where he sees them.
* **The old UI does not carry through.** It is deleted card by card under the
  rule below, against 10,510 lines on 2026-09-17.

**The five old cards, one by one, against the standard:**

| Card | Decision | Why |
|---|---|---|
| P2.k one renderer for a kept page | **into P2S.3 as part (g)** | its goal is §12 ("without feeling like I switched to a completely different product"), but it ported pages onto the six-mark `marks.tsx` that P2S.2 redraws and P2S.3 replaces — building it first is porting onto a renderer about to go. Pages draw with P2S.3's shapes; its deletion list moves with it. |
| P2.i same-store year-over-year | **kept, renamed P2S.4** | changes what George can SAY, not how it looks; §1 lists "historical periods" among what he investigates. Independent of the redraw, so it may be pulled ahead of any P2S card any day — it is the seasonal one. |
| P2.✓ close | **into P2S.✓** | two closes walking the same four scenes against the same artifact is one close. The merged close keeps P2.✓'s full run and its gate to Phase 3. |
| P2.j stock watch before the stock-out | **moved to Phase 3 as P3.g** | §10 ("notice situations himself") and §13–14; a watch is operating mode, not the design. Backend only, no surface. |
| P2.h voice, hands-free | **parked by the merge, then RESTORED as P2S.5 the same day** — the owner: *"we need to make it"*. Built to §8's first-class bar, not as the dictation P2.h described. Why it was parked, kept for the record: | §8 says, in the owner's words: *"Eventually voice should become a first-class way of operating George rather than simply speech-to-chat."* P2.h was browser speech into the composer — speech-to-chat, the version the standard rules out, for a capability it calls "eventually". Parked under Candidates with that sentence. |

Eval spend is unchanged at **$3.66**: P2S.3's subset, the merged close's full
run, and P3.✓'s. Open cards 16 → 13, then 14 when voice came back as P2S.5.

**THE FIFTEEN SCENES — WHAT "THE IDEAL UI" ACTUALLY CONTAINS, AND WHERE EACH ONE
IS FINISHED (2026-09-17).** The owner: *"so at the end of p2s we will have my ideal
ui? make sure we will and is this the best way to do it?"* **At the end of Phase 2S
he has the room and EIGHT of the fifteen scenes — not all fifteen, and nothing
may say otherwise.** The design has one scene per part of his vision
(`data-scene` in `ops/ideal/george-ahead-of-me.html`); five need Phase 3's
surfaces and two need a source only he can supply. This table is held by
`tests/test_plan_alignment_contract.py`: every scene in the artifact appears
here exactly once, and the close it names must name the scene in its own card.

| Scene (`data-scene`) | Vision § | What it shows | Built by | Closes at |
|---|---|---|---|---|
| `situation` | 1·4·5 | Rockwell, already investigated, reads and one ruled out | P2S.1–P2S.3 on an asked question; **unasked it is P3.b's morning** | P2S.✓ |
| `doing` | 2·6 | "how are we doing?" | P2S.1–P2S.3 | P2S.✓ |
| `nothing` | 5·6 | "nothing important", and where he looked | P2S.1, P2S.3 | P2S.✓ |
| `judgment` | 3 | disagrees, was wrong | P2S.1 (words), P2.m's views | P2S.✓ |
| `touch` | 7·8 | tap anything, then words — or speak them | P2.c + P2S.1(h) + P2S.5 | P2S.✓ |
| `memory` | 9 | what he believes, with Forget | P2.f redrawn by P2S.2 | P2S.✓ |
| `draw` | 6 | how he draws | P2S.2 | P2S.✓ |
| `vocab` | 6 | everything he can draw | P2S.3 | P2S.✓ |
| `morning` | 10 | the proactive morning | P3.b, and the first standing question actually switched on | P3.✓ |
| `decide` | 15 | needs you | P3.a | P3.✓ |
| `build` | 11 | build it with me, versions | P3.d, P3.e | P3.✓ |
| `life` | 12·13 | temporary → permanent → automation | P3.c, P3.d, P3.e | P3.✓ |
| `run` | 14·15 | handle this, running | P3.d, P3.g | P3.✓ |
| `docs` | 16 | a supplier's invoice | nothing until a document source exists | S.4 |
| `team` | 17·18 | businesses + team | the businesses half is built (P2.g); the team half needs people | S.6 |

**HOW "FRAME FOR FRAME" IS HELD — BY PIXELS, NOT BY JSDOM.** Nine cards in a row
closed with *"nobody has seen it in a browser"*. That is not necessary any more:
on 2026-09-17 a session rendered the artifact headless in the installed Chrome
at 1920×1080 and read the screenshot back. So every Phase 2S card's done-when
includes **a frame check**: the scene it owns rendered from a recorded fixture
thread in headless Chrome at 1440 and 1920, sidebar open and closed, saved
beside the same scene of the artifact rendered the same way, and both images
looked at before the card closes. P2S.1 writes the script that does it
(`ops/frames.py`); every later card reuses it.

**LOOK AND BEHAVIOUR ARE TWO CHECKS, NOT ONE.** The artifact's words and figures
are authored; George's live answer to the same question will not match them word
for word, and should not be forced to. So the LOOK is held on fixtures — the same
rows drawn the same way — and the BEHAVIOUR is held live at the close: the eight
scenes' questions asked on the live build in the full run, including the two
questions P2.m wrote and never ran (*"analyze tradsnax per store"*, *"how did
Rockwell do"*).

**Is this the best way — the session's answer, recorded.** Yes on the build
order, with the verification above added. Porting the artifact into the room
keeps ten closed cards of working behaviour (selection, memory, the ladder,
actions, the business switch) and deletes the old screens under a line-count
rule; rebuilding from the artifact as a new app would throw that away and is
what §1 of this file forbids. What was weak was never the order but the proof:
four of fifteen scenes checked, in jsdom, against a design whose words George
does not write. That is what this block changes.

**THE AUDIT, 2026-09-17 — Phase 2S checked line by line against the artifact's
code, CLAUDE.md, and every module in `frontend/src/room/`.** The owner: *"please go
over all the instrunctions again and make sure everything we discussed will be
built exactly how we want it and with functions"*. Three kinds of gap were found,
and each is now written into the card that closes it. **A card is not done while
any row below that names it is missing from the screen and from a test.**

**1. What the artifact's beside room LEAVES OUT and the rules require.** The
artifact is the look; CLAUDE.md's rules are not negotiable and win where the two
differ. `buildBeside()` builds each figure from `sceneParts()`, which keeps a
step's `say`, `ev` and `out` and **drops its `details.src` receipt** — the line
every OTHER room on the same page draws under each figure (*"receipt · get_sales ·
Rockwell · by day · read 07:49"*). So the beside room, as drawn, shows numbers
with no read time and no receipts.

| Rule | What the beside room must carry that the artifact omits | Card |
|---|---|---|
| UI 3, UI 6 — every number inspectable; no number without a time | **a receipt line under every figure**: the source in words, the window, `read HH:MM` off the call's `snapshot_timestamp`, in the artifact's own `.src` style (mono, `--ink-3`); a tap opens the receipts in place | P2S.1(c) draws it; P2S.2(f) opens it |
| UI 4 — a caveat stays whole and ABOVE the figure it qualifies; may be one line naming it, explanation on tap; never the accent | **a figure's own caveat**: one line between its `READ n` label and its mark; **the turn's caveat**: one line directly above the claim in the words column | P2S.1(c) |
| UI 8 — loading, failed, loaded are three renderings | the figures area while a read is running, and a read that failed, each drawn as itself — never an empty column that looks finished | P2S.1(c) |
| UI 5 — one colour means needs you | the artifact's needs-you items (Systems "needs you") keep the accent; nothing else in the port may | P2S.1(a), `accentUse.test.ts` |

**2. Functions the room has today that the function table did not place.**
Found by reading every module in `frontend/src/room/`. Each gets a place, decided
here and said why, so the owner can point rather than design:

| Function today (module) | In the beside room | Why |
|---|---|---|
| read-as tokens: window · grouped · how many, re-run with no model turn (`Tokens.tsx`, `tokenShape.ts`, P1.i–j) | **the composer's chips** — the artifact already draws *"last 90 days"*, *"products"*, *"why?"* on the composer line; tapping one is the same replay path, no model turn | it is the artifact's own device for the same act |
| "not what I meant" (P2.f) | a chip on the composer line beside them | same row as every other steer |
| `@` completion over shops, products, categories, suppliers, pages, rules (`mentions.ts`) | unchanged, in the one-line composer | the artifact's composer is a text line; `@` lives in the line |
| Tab grey completion (`ghosts.ts`, P2.d) | unchanged, in the same line | as above |
| drag, resize, bring forward, undo (`drag.ts`, `arrangement.ts`) | **removed** | his rows 6 and 7 ask the figures to flow left to right, then down, filling the space; a hand-placed figure breaks the rule he gave, and undo exists only to undo the drag. Deleted with the layout they served |
| set aside a figure | **removed** — no control on the figure, no set-aside list; `Local.closed`, the "set aside" chips in `Room.tsx` and their tests are deleted | the owner: *"remove"* (2026-09-17) |
| keep a figure (P2.a pins) | **the per-figure keep control is removed** — the owner: *"remove"* (2026-09-17). Keeping itself stays, because standard §12 asks for it: saying *"keep this"* / *"make this a page"* (George's pin and page tools, unchanged) and the thread header's Page view with *Keep as page* (P2.a), which is now the one save gesture (UI rule 2) | nothing that §12 asks for is lost; only the button on each chart goes |
| after a turn: *"4 reads · 7 tools · 3 caveats · behind it"* (`Working.tsx` WorkLine) | the thread header, beside its tabs | it describes the thread, not the answer |
| *"since you last looked · N answers arrived"* (`history.ts`) | one quiet line above the turn caveat, only when N > 0 | UI 8: drawn only from a loaded count |
| a refused replay's line (`refusalForPerson`) | under the composer chips, where the replay was asked | a refusal belongs to the gesture that caused it |
| Behind it, Replay, Page (`BehindIt.tsx`, `Replay.tsx`, `ThreadPage.tsx`) | the thread header's tabs — **on trial**, the artifact has no tabs | kept until he points |
| the estate switch (`EstateSwitch.tsx`) | the sidebar, top, as the artifact draws it | already the row above |
| the object panel (`ObjectPanel.tsx`) | in place over the figures column | already the row above |
| the voice mic button the artifact draws on the composer | **drawn and working — built by P2S.5** | the owner overruled the park: *"we need to make it"*. P2S.1 leaves its place on the composer line and draws NO mic until P2S.5 lands, because a button that does nothing teaches that buttons do nothing |

**THE OWNER'S ANSWERS TO TABLE 2, 2026-09-17:** the composer chips, `@` and Tab —
*"yes we keep that"*; drag, resize and undo removed — *"yes we can remove that"*;
set aside and keep on the figure — first confirmed, then **removed**, *"remove"*; the mic — **overruled**, *"we need to
make it"*, so voice is card P2S.5. These rows are decisions now, not proposals.

**3. What the artifact's code does EXACTLY, which the cards had only paraphrased.**
From `buildBeside()`, `place()`, `wire()`, `arrows()`, `draw()`:

| Behaviour | Exactly | Card |
|---|---|---|
| columns | **1** figure → 1 column; **2–4** → 2; **5+** → 3; **≤ 900px wide → 1** | P2S.1(c) |
| placement | each figure, in order, into the column whose height is smallest (ties to fewest children) | P2S.1(c) |
| arrival | in order, the first at 200 ms then one every 260 ms, each drawing itself; the mark is `reading` while they land and `idle` after the last; reduced motion shows all at once. **His row 13 "arrive together" means not narrated sentence by sentence — this reveal is the artifact's, and the artifact is final** | P2S.1(c) order and timing; P2S.2(d)(f) the mark and the draw |
| wires | 1px, `rgba(138,143,152,.32)`, dashed `2 5`; from the mark's centre to the claim's top-right corner, and to each figure's top-left (+18, +8) only while that figure is inside the figures area; redrawn when a figure lands, on resize and on scroll | P2S.1(c) |
| arrows | up hidden within 2px of the top, down hidden within 2px of the bottom; each moves 80% of the area's height; smooth unless reduced motion; no scrollbar anywhere | P2S.1(b) |
| words | claim: serif, 20–26px, max 30ch, emphasis in italic; standing: serif 15.5px, max 56ch, read superscripts; *what I'd do next*: serif 14px, max 44ch, a mono uppercase label, a 3px rule on its right | P2S.1(c) |
| ≤ 900px | him (max 420px wide) → words left-aligned, *next*'s rule moves to its left → figures in one column; no wires, no arrows; the page scrolls | P2S.1(b) |
| sidebar | open by default when the window is wider than 820px, remembered per browser, `[` toggles it (not while typing) | P2S.1(h) |
| the mark | a 680×420 canvas; idle breathes with three motes on a wide orbit; reading pulses once per read and turns a ring; writing settles the motes close and steadies the ring; need is warm and still | P2S.1(b) place and size; P2S.2(d) life |
| **not product** — the artifact's own devices | the console switch, the example-scene list, double-click "back to how George brought it", the hidden `.bs-mood` line | not built |

**AND THE TRANSLATION, HONESTLY.** The owner asked whether moving the artifact into
the product is hard. **Half of it is copying and half of it is not.** The tokens,
fonts, sidebar, words, composer look and the two-column grid are CSS and markup —
copied, not re-derived. The mark (~40 lines of canvas), the wires, the column flow
and the arrows are small pieces of vanilla script that port to React directly. **The
part that is real work is that the artifact is hand-authored and the product is
not**: every claim, figure and number on that page was typed by a person for one
scene, and **its sixteen chart shapes are static SVG with fixed coordinates**
(the `vocab` scene), not renderers. In the room each must be produced from George's
actual turn — the read order, the say line per figure, which read was ruled out (a
flag that does not exist until P2S.3), and sixteen shapes drawn from real rows with
their empty, one-row and too-many-row cases. That is why P2S.3 is a card of its own
with golden renders, and why "frame for frame" is held on recorded fixtures rather
than by expecting live answers to match hand-written ones.

**THE OWNER'S FIXES — every one he asked for in the artifact on 2026-09-16, the
part that builds it, and what holds it.** *"i dont want a thing missing."* A
card is not done while one of its rows is not on screen and in a test.

| # | His words (2026-09-16) | Built by | Held by |
|---|---|---|---|
| 1 | "i dont like the color scheme" → the graphite ground, one warm accent, Geist / Geist Mono / Newsreader | P2S.1(a) | token block; `accentUse.test.ts` |
| 2 | "too wide … should be space of the sides for a sidebar for pages workflows, automations etc" | P2S.1(b)(h) | rail present; composition centred test |
| 3 | "make the sidebar to the left edge and collapseable" | P2S.1(h) | `[` toggles; slide test |
| 4 | "the middle console should always stay centered" / "it should stay centered when sidebar is opened" / "when sidebar opens it shrinks the whole thing, that should not happen" | P2S.1(b) | centre = room centre at 1440/1920, rail open and closed; widths fixed |
| 5 | "i kinda dont like how its inside a box visually" / "the charts still feel like they are in boxes" / "it still feels like its in squares" | P2S.1(c) | `Shell` has no border/background/shadow except draft/approval (css test) |
| 6 | "if theres open space with the answer it should fill it … dont need to save space" | P2S.1(c) | shortest-column flow; placement test for 2/3/4/5 |
| 7 | "charts should go from left to right then down on the right not on the left" | P2S.1(c) | placement test |
| 8 | "here it gets cut … it should feel all connected" | P2S.1(b) | nothing clipped: no `overflow` cut inside the composition (css test) |
| 9 | "i dont really ever want to see a scroll down on the charts … maybe just up and down arrows" / "why is there scroll bar on the edge now? … only charts area should be able to be scrolled" | P2S.1(b) | no visible scrollbar in the room (css test); arrows appear only when there is more (dom test) |
| 10 | "add those like leading lines from stage" | P2S.1(c) | a line per figure, and one to the claim (dom test) |
| 11 | "put the text like on the side of the visuals" → his mock: him top-left, words bottom-left set toward the figures, figures right | P2S.1(b)(c) | the Rockwell thread frame for frame |
| 12 | "text is too low it can be almost directly under the blob" / "it should kinda feel like its coming from alive" | P2S.1(c) | words under the mark; the claim's leading line |
| 13 | "dont narrate it … no need to narrate the visuals … fill out the right" | P2S.1(c) | nothing typed out; figures arrive together |
| 14 | "alive is too small … make the alive a more wide horizontal figure but it has to be bigger" / "you made it smaller it should stay big" | P2S.1(b) size · P2S.2(d) form | the mark spans its column (test on drawn size) |
| 15 | "dont make it just an oval make it abnormal" | P2S.2(d) | the irregular form is one of the three on the switch; **shape and colour still his to workshop** |
| 16 | "the right more alive" / "a moving thing like jarvis when processing like alive" | P2S.2(d) | four states, four drawings (dom test) |
| 17 | "the line if its up or down should be green or red meaning good or bad not the same color as the stores" | P2S.2(e) | verdict on every row's segment and dots; identity on the swatch only |
| 18 | identity colour, drawing-in, hover — "ok implement that" (after the research) | P2S.2(e)(f) | hue stable across figures; tooltip on every mark kind |
| 19 | "it should have the ability to make all those different kinds of charts and visualizations like pie and others cause if it builds a dashboard it needs that" | P2S.3 | sixteen golden renders; "make that one a pie" stays |
| 20 | "should they show more charts?" → not more, by rule: the claim picks the shape unasked | P2S.3 | the *reaches for it when* rules in `metrics.yaml` |
| 21 | "in these types of charts … " the dumbbell keeps the swatch, the store colour never on the line | P2S.2(e) | dumbbell render test |
| 22 | "remove, beside is the final now" — no console switch, no status line | P2S.1(h) | neither exists in the product; nothing to hold |
| 23 | "move the example selectors to a sidebar" — the examples were the artifact's own device | — | not a product feature; the sidebar carries Pages / Systems / Automations / People instead |
| 24 | "its not centered … its probably like the zone size" — the mark's body spans its column, the glow may run past it | P2S.1(b) | drawn-size test: body ≥ 70% of the column width |

**WHERE EVERY EXISTING FUNCTION LIVES IN THE ROOM — nothing built since P0 is
dropped by the redraw.** The artifact's `beside` room shows the claim, the
standing text, *next* and the figures; these are where the rest goes, and
each is a row a card must show:

| Function (card) | In the beside room |
|---|---|
| the six marks + receipts under every number (P1.e, P2.b) | the figures; receipts open in place on tap (P2S.2 f) |
| the reading leads, three text slots (P1.c, P1.f) | the words under the mark: claim · standing · next |
| the ladder — known / likely / possible / unknown (P2.b, the standard §3) | **one line under the claim**, each word a tap to its figures — *assumed; the owner has not seen it and may point elsewhere* |
| actions on the row they are about (P2.d) | on the figure's row, as now; the offers row on the composer |
| selection as context — "this", "these two" (P2.c) | tap anything → the composer chip "tap anything above to bring it here" (P2S.1 h) |
| the business switch (P2.g) | the sidebar, top |
| a thread is a page: Talk · Behind it · Page · Replay (P2.a, P2.e) | the thread's name in the sidebar under Pages; the four readings stay as the thread header's tabs — *the artifact has no tabs; kept until the owner points* |
| memory with Forget (P2.f) | a figure like any other, its rows with Forget |
| the draft you edit, approvals (P0–P1) | the one thing that keeps a box (P2S.1 c) |
| visible work while a turn runs (`Working.tsx`) | the mark's states (P2S.2 d); the elapsed line stays under the composer |
| Earlier (history), Noticed (attention) | the sidebar: Pages; the attention queue (`details.queue` in the artifact) above the figures when non-empty |
| the estate object panel — tap a shop opens it in ~1 s | in place, over the figures column, no route |
| kept pages / pins, the same renderer (was P2.k, now P2S.3(g)) | a page of pins draws with P2S.3's shapes, one per pin |
| dark / light (`theme.ts`) | the three-theme tokens of P2S.1(a); the toggle stays in the sidebar |
| the four board scenarios (was P2.✓, now P2S.✓) | re-pointed to the artifact's scenes |

**WHAT GOES — no old UI stays because it exists.** Counted 2026-09-17:
`frontend/src/components/george/` is **10,510 non-test lines** — the OLD
George surface (river feed, `PinnedPage.tsx` 637, `Instruments.tsx` 449,
`workUnit.ts` 707, result surface, workspace). The room imports two of its
modules (`threadHistory`, `pageScope`); the rest is reached only by
`InboxPage`, `PagesPage`, `WorkflowsPage` and `RiverPreview`. **Rule for the
phase: every card ends with a deletion list — what it made unreachable is
deleted in the same commit, and the close-out states the directory's line
count, which must fall at every close and reach zero by P3.✓.** In order:
P2S.1 deletes `RiverPreview` and its `/george/preview` route, the `--measure`
frame and the 2/3-tile grid rules, the console-less leftovers in `room.css`;
P2S.3 deletes `markFor`'s mapping of the seven retired widget names once a
migration rewrites stored boards (or keeps it with a test that says why);
**P2S.3(g)** (was P2.k) deletes the kept-page renderer (`PinnedPage`, `PinTile`,
`Instruments`, `ResultSurface`, `ResultBlocks`, their shapes) — it is written
into that card below; **P3.a** deletes `InboxPage` and the river feed;
**P3.d** deletes `WorkflowsPage`. **Not touched without the owner's word:**
`pages/AIChatPage.tsx` is the Supabot chatbot (freehand SQL, CLAUDE.md "George
is not the existing chatbot") — deleting it is a product decision, not
cleanup; he decides.


- [x] **P2S.1 the room** — four parts, one pass over `room.css` / `Room.tsx` /
      `Rail.tsx` / `Composer.tsx`, each its own commit:
      **(a) the ground** — the artifact's tokens replace the room's: graphite
      ground (`#0f1011`, paper `#17181a`, sunk, raise), the ink steps, ONE warm
      accent for needs-you (`#E8B04B` dark / `#B7791F` light), up `#2FA874`/
      `#1A8A5A`, down `#E8624B`/`#C8442B`; Geist, Geist Mono, Newsreader off
      Google Fonts with fallback stacks; the three-theme token structure.
      `accentUse.test.ts` and the palette tests stay and pass.
      **(b) the composition** — two fixed columns, 580 and 940 with 40 between,
      centred in the room; him top-left, his words under him set toward the
      figures, the figures right.
      **THE ALIVE MARK'S PLACE AND SIZE ARE THIS CARD'S, NOT P2S.2's** (moved
      2026-09-17, when the owner asked where the alive, the words and the
      figures were in the card and the session found the mark arriving one
      card after the lines drawn from it and the frame that contains it).
      From the artifact's own rules (`.bs-him`, `.bs-left` in
      `ops/ideal/george-ahead-of-me.html`): the grid is `"him right" "words
      right"`; the mark's canvas is **136% of its 580 column**, aspect
      680:420, pulled up by `-6vh` and out by `-18%` each side so its glow
      runs past the column while its BODY spans at least 70% of it (his
      rows 14 and 24); the words are pulled up under it by `-10vh`,
      right-aligned toward the figures (row 12). This card draws the mark
      STILL, in the artifact's irregular form, so the lines have an origin
      and the frame check has the real picture; P2S.2(d) makes it move.
      The rail SLIDES the composition and never
      shrinks it; no page scrollbar; only the figures area moves, by an up and
      a down arrow that appear only when there is more, never a scrollbar; on a
      phone the three stack. Replaces the `--measure` frame and the 2/3-tile
      grid rules of 2026-09-16; `layout.test.ts` re-derived as arithmetic on
      the two widths.
      **(c) no boxes; the figures flow; lines from him** — `Shell` loses its
      border, background and shadow (a box stays only on a draft or an
      approval). A figure is `READ n[ · RULED OUT]`, its say line, its mark.
      Each figure, in order, goes to whichever column is shortest (two columns
      up to four figures, three after). An SVG overlay draws a dashed line from
      the mark to the claim and to every figure, redrawn on resize and on the
      figures area moving. The words: claim, standing text with read
      superscripts, *what I'd do next*, right-aligned toward the figures.
      **(h) the chrome** — the rail as the artifact's sidebar: George, the
      date, the business switch (P2.g), Pages, Systems with state, Automations
      · Watches, People (whoever the system already knows), collapsible with
      `[`; the composer as one line with its prompts, the offers, "tap anything
      above to bring it here" carrying the selection (P2.c), ↑ sends. No
      console switch, no status line.
      **Done when:** every surface renders from the new tokens and the accent
      is found on approvals only; at 1440 and 1920 with the rail open and closed
      the composition's centre equals the room's centre (a test on the
      numbers); a test scanning `room.css` finds no visible scrollbar; a test
      asserts the column each of 2, 3, 4 and 5 figures lands in; the Rockwell
      thread renders as the artifact frame for frame — **held by pixels**:
      `ops/frames.py` (written here) renders the `situation`, `doing` and
      `nothing` scenes from recorded fixture threads in headless Chrome at
      1440 and 1920, rail open and closed, beside the same scenes of the
      artifact, and the images are looked at before close; every rail item
      opens what it names; the mark's drawn body is at least 70% of its
      column and the claim starts within its lower edge, both held by a test
      on the numbers; **every row of the AUDIT naming P2S.1 is on screen and in
      a test** — in particular a receipt line with `read HH:MM` under every
      figure, a figure's caveat above its mark and the turn's above the claim,
      the column counts for 1, 2–4, 5+ figures and ≤ 900px, the reveal order,
      the wire endpoints, the composer's chips replaying with no model turn,
      `@` and Tab still working in the new line, NO set-aside or keep control
      on a figure (keeping still works by words and by the Page view), no mic button yet (P2S.5 draws it), and `drag.ts` deleted; `tsc -b --force` and vitest green. No eval.
      **CLOSED 2026-09-17, unpushed — `421e5ab` (a), `5cd7be8` (b)(c)(h), `128323e`
      frames, `8952aff` deletes.** (b), (c) and (h) are ONE commit, not three:
      they share `Room.tsx`, `room.css` and the composer and no split of them
      typechecks. **Held by pixels, measured in the browser** (`ops/frames.py`,
      `verification/frames/p2s1/measure.json`): on all 12 frames — situation,
      doing, nothing × 1440/1920 × sidebar open/closed — the composition's
      centre is **0 px** from the room's, the columns are **580/940 at 1920 and
      433/703 at 1440 whether the sidebar is open or closed**, no scrollbar is
      drawn, the page does not scroll, the claim starts inside the mark's lower
      edge, and there is one line per landed figure plus one to the claim. The
      mark's body is **80% of its column** (≥ 70%). The scenes are recorded
      turns from `p1close-v2.json`, not the artifact's words: situation ←
      "how about rockwell", doing ← "how are we doing?", nothing ← "What is
      running low at Greenhills?". Images looked at: situation, doing and
      nothing beside the design. **Suites:** vitest 86 files / 1,302 → 68 /
      1,022 (21 files of deleted modules gone; 3 added — `beside`,
      `sidebar`, `figuresArea` — and `layout` re-derived), pure 1,852 + 1
      failing → 1,850, `tsc -b --force` clean, `vite build` clean.
      **`frontend/src/components/george/`: 10,510 → 5,087 non-test lines** —
      RiverPreview was the last importer of 32 old river modules.
      **SHORTFALLS, each a row above not fully met:** the known / likely /
      possible / unknown line is not drawn — no turn carries one, and a line
      drawn from nothing breaks UI rule 8; the object panel still opens under
      its figure, not over the figures column; the figures area's loading and
      failed states are drawn (the work trail while busy, the error in the
      words) but no dom test holds them, because `Room.tsx` is rendered by no
      test; the sidebar lists standing questions but not watches, because no
      route lists watches, and Systems / Automations open `/workflows` rather
      than the item; "frame for frame" holds the frame, not the figures'
      content — the marks are P2S.2 and P2S.3; under 1,824 px the columns are
      narrower than 580/940 by the sidebar's width, the price of never
      shrinking when it opens. **Lost with the controls:** the room no longer
      writes `kept` or `dismissed` decisions for `attention.learning`.
      **Nobody has seen it live** — unpushed.
- [ ] **P2S.2 the drawing** — three parts, one pass over `marks.tsx` /
      `identity.ts` / `tiles.tsx`, each its own commit:
      **(d) the alive mark** — its place and size are already set by
      P2S.1(b), drawn still; this part makes it ALIVE. One canvas mark driven by the turn stream the
      room already carries (`Working.tsx`), not a timer: idle breathes; reading
      pulses on each read landing and turns a ring; writing steadies; need
      warms (the accent's one exemption; its error state changes the drawing,
      never the colour). The artifact's wide irregular form — an edge of slow
      sines, halo, motes and rings following it — **but the shape and colour
      are the owner's to workshop**, so it ships a `?form=` switch with three
      forms (round, the wide irregular, one more) for him to point at, and
      nothing else depends on which.
      **(e) identity on the swatch, verdict on the mark** — a store keeps one
      hue everywhere: slots in the validated categorical palette by order of
      `stores.active_retail`, read at runtime (never a name or a count in
      code); products take slots 5–8 by a stable hash. A swatch before every
      name in a row, band or cell; a series carries its hue when a figure holds
      more than one; the mark's own segment and dots carry the VERDICT — up
      green, down red — on every row. The accent untouched. Palette validated
      on both grounds with the dataviz validator, checked into `ops/`. Revisits
      P2.l deliberately: colour still means one thing per channel, and the
      channel for identity is the swatch.
      **(f) alive figures, and touch** — a figure draws itself on arrival:
      rows in turn, bars grow, cells fill, a line is drawn; reduced motion
      draws it still. Hover or tap on any row or mark shows the exact figure
      and `read HH:MM` off the call's `snapshot_timestamp`; a tap opens the
      receipts in place (rule 3).
      **Done when:** a dom test with a mocked canvas sees four distinct
      drawings for the four states; Rockwell is the same hue in a dumbbell
      swatch, a line, a bar and a pie in one thread (test); `accentUse.test.ts`
      passes; every mark kind has the tooltip and a dom test reads its text off
      a recorded run; **every row of the AUDIT naming P2S.2 is on screen and in
      a test**; **frames** of `draw` and `memory` beside the artifact's.
      No eval.
- [ ] **P2S.3 the vocabulary, and "ruled out"** — alone, because it is the one
      card that changes what George sees. The catalogue grows from six marks to
      the artifact's sixteen shapes: bar against usual, small multiples, area,
      stacked, pie, scatter, heatmap, calendar, waterfall, treemap, funnel,
      gauge with its bullet, map — figure, dumbbell, ranked, contributors, line
      and table stay. `composition.widgets` in `definitions/metrics.yaml` names
      them with a *reaches for it when* rule per shape (change over time →
      line; a few compared → bar; where in the week → calendar or heatmap;
      exact pesos → table) and marks pie, treemap and gauge *only when asked*;
      an asked-for shape is honoured and remembered on the pin, so "make that
      one a pie" makes a pie that stays one. A block may carry `ruled_out:
      true` from the ladder and is drawn `READ n · RULED OUT`, dimmed. Touches
      the compose grammar, so **eval: subset**. `ops/DECISIONS.md`: P1.f closed
      the catalogue at six on purpose; this reopens it on purpose, with the
      rule that decides unasked.
      **(g) one renderer for a kept page — was P2.k, merged 2026-09-17.** His
      words, 2026-09-15: *"it doesnt feel like its from the same app and its
      beacause its not, so make it."* A kept page is still drawn by
      `PinnedPage` → `PinTile` → `ResultBlocks`/`Instruments`, the pre-P1.e
      renderer. The seam exists: `agent/default_composition.blocks` is what the
      board and `/george/replay` are drawn from, so the pin-run route returns
      the same blocks and a page draws them with THIS card's sixteen shapes —
      which is why it lives here and not before P2S.2: done earlier, it would
      port pages onto a renderer this phase replaces. The page's controls
      survive as room controls; an asked-for shape ("make that one a pie") is
      the same pin on the board and on the page.
      **Deletes** (the phase rule): `PinnedPage.tsx`, `PinTile.tsx`,
      `Instruments.tsx`, `ResultSurface.tsx`, `ResultBlocks.tsx`, their
      `*Shape.ts` modules and tests — and states the line count of
      `frontend/src/components/george/` at close, against 10,510 on
      2026-09-17.
      **Done when:** each shape has a golden render test off recorded rows;
      "make that one a pie" changes that pin and only that pin, on the board
      and on its page alike; a kept page and the board draw the same read
      identically, held by a dom test over a recorded run; the old renderer's
      files are gone; **frames** of `vocab` beside the artifact's; the four
      gate scenarios pass.
- [ ] **P2S.4 same-store year-over-year** — **was P2.i, kept by the merge
      2026-09-17 because it changes what George can SAY, not how it looks,
      and so is untouched by the redraw.** It may be taken ahead of any P2S
      card on any day; it is the seasonal one.
      `comparisons.not_supported.same_period_last_year` refuses YoY because
      the estate is a different shape a year apart (5 stores traded Aug 2025,
      7 traded Aug 2026) and it names its own fix: *"Define that rule first,
      then add the comparison."* `previous_period` cannot see a December
      against last December: December against November is not a comparison.
      **Not the owner's word:** an earlier version of this card said Christmas
      and Chinese New Year are his two biggest questions; that was a session's
      inference (corrected 2026-09-15, he said *"i guess"*) and is not quoted.
      Build: a `same_store` rule in metrics.yaml (a store counts if it traded
      in BOTH windows — the owner confirms the wording, it is a definition,
      not a design question), `compare_to='same_period_last_year'` computed in
      the tool over both windows in one statement like `previous_period`, and
      `meta` naming which stores were counted and which were excluded and why.
      An excluded store is never silently dropped.
      Done when: "how did last December go against the year before" answers
      with the comparable set named; a store that opened mid-window is
      excluded BY NAME in the receipts. **No eval** — a new comparison is a
      new CAPABILITY and no gate scenario asks for one; its contract tests are
      the check, and it rides the phase close.
- [ ] **P2S.5 voice — a first-class way of operating George** — **restored by
      the owner 2026-09-17**, after the merge had parked it: *"we need to make
      it"*. The bar is his own standard, §8: *"Eventually voice should become a
      first-class way of operating George rather than simply speech-to-chat"*,
      and *"Language is for intent. Direct interaction is for reference. They
      should work naturally together."* So this is NOT dictation into a box.
      Needs P2S.1's composer line; changes nothing George reads. Five parts:
      **(a) speaking goes with pointing** — hold the mic (or tap to start, tap to
      stop) and speak; the words appear in the composer line as they are heard
      and send on release; whatever is selected on screen travels with them
      exactly as with typing, so tapping two shops and saying "compare these"
      is ONE gesture.
      **(b) a spoken steer is a steer** — "last 90 days", "products", "why?"
      spoken resolve through the same fragment path as the composer chips: a
      window, grouping or count change replays with no model turn.
      **(c) hands-free** — a switch on the composer line: when an answer lands
      George reads the CLAIM aloud (browser speech synthesis) and nothing else,
      never the figures or the receipts; the claim is lit while he speaks;
      speaking or tapping anything stops him at once; "read it to me" reads the
      current claim on demand.
      **(d) states you can see** — the mic shows it is listening; the words
      appear live and, outside hands-free, can be corrected before sending; no
      permission, no speech service, or nothing heard each say which in one line
      and never pretend to have heard.
      **(e) only where it works** — speech recognition exists in Chrome, Edge and
      current Safari; where the browser has none the mic is not drawn and one
      line says voice is not available in this browser. **Chrome's recognition
      sends the audio to Google's speech service**; the close-out says so
      plainly, and George stores nothing spoken beyond the question text, exactly
      as if it had been typed.
      Done when: hold the mic, say "how are we doing", release — the words appear
      as heard and send; with two shops tapped, a spoken "compare these" sends
      both as the selection (a test on the request); a spoken "last 90 days"
      replays with no model call (a test); hands-free reads the claim and nothing
      else and a tap stops it mid-sentence (a dom test on a mocked speech
      synthesis); a browser without recognition draws no mic and says why (a
      test); a **frame** of the composer listening beside the artifact's mic;
      `tsc -b --force` and vitest green. No eval — a spoken question is a typed
      question; nothing on the model path changes.
- [ ] **P2S.✓ close: it feels right** — **the one close for all of Phase 2,
      merged with P2.✓ 2026-09-17.** **All eight scenes it owns in the ledger
      above — `situation`, `doing`, `nothing`, `judgment`, `touch`, `memory`,
      `draw`, `vocab` — not four.** The LOOK: each rendered by `ops/frames.py`
      beside its frame of the beside room. The BEHAVIOUR: each scene's
      question asked on the live build inside the full run, plus P2.m's two
      unrun questions — and voice on the live build in Chrome: hold, speak,
      release; two shops tapped and "compare these" spoken; hands-free read
      and interrupted. The owner says it feels right or names the next fix to
      the same surface. **The close-out states plainly that seven scenes are
      not part of this phase** and names where each is finished. **One full
      run** (eval: full, $1.51) — kept from P2.✓, because this close covers
      P2S.3's new vocabulary and P2S.4's new comparison together, and the
      subset cannot see either. Suites exact, numbers at close, the old
      surface's line count against 10,510. **Gate to Phase 3:** Open empty
      five days; the four scenes work as drawn; median still under target.

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
- [ ] **P3.g the stock watch fires before the stock-out, not after** — was
      P2.j, moved here by the merge 2026-09-17: a watch is operating mode
      (standard §10, *"George notices it … determines whether it actually
      matters"*), and it touches no surface. Today a watch fires when a line
      crosses zero, which reports a stock-out that has already cost the sale.
      The useful condition is "will cross zero before it can be restocked".
      The primitives exist: `tools/replenishment.py`, `tools/purchase_plan.py`
      and a units/week rate over closed weeks. The missing input is LEAD TIME,
      and it does NOT need the frozen PO export (S.2): architecture rule 6
      allows a definition to declare a **bounded setting** a person binds and
      every run records, so "Seikyo takes 3 weeks" is a number typed once,
      with bounds, in metrics.yaml. A line with no lead time set is reported
      as having none — never defaulted to a guess.
      Done when: a watch on AJI BARN fires for a line still above zero whose
      cover is under its supplier's lead time, naming both numbers; a line
      with no lead time set says so instead of firing. **No eval** — a
      scheduled watch makes no model call at all (rule 7).
- [ ] **P3.✓ close: the Seikyo arc, timed** — and the five scenes the ledger
      gives it, `morning`, `decide`, `build`, `life` and `run`, rendered by
      `ops/frames.py` beside the artifact's. End to end on the live build as
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
  Feature 23 was designed-not-built (P2.g), not blocked, and the switch
  landed 2026-09-15. Two live constraints that ARE real:
  `vending.never_join_to_store_domain: true`, so the two domains are compared
  side by side and never joined; and vending profit is
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
three a dogfood fix: **25 open cards at four a week is six to seven weeks of
cards, so nine to eleven weeks** to the Phase 3 gate. Phase 1 is seven cards,
Phase 2 eleven, Phase 3 seven. (Twelve remain open as of 2026-09-15: five of
Phase 2, seven of Phase 3, and the two closes among them.) (P1.m was a card until 2026-09-13 and is now the tail
of P1.e: the letter is retired, not reused.) The sources
decide whether 8, 23, 24 and 25 land inside that or after. The readable copy
of this plan, with every card's prompt, is **George, The Build Plan** in §6.

---

## 4. Commands

Run from the repo root. The interpreter is `.venv\Scripts\python.exe`; a system
`python` cannot import the backend (pinned SQLAlchemy).

    .venv\Scripts\python.exe ops/verify_integration.py pure     # 1,762 here, 1,758 in CI

**THE PURE COUNT IS FOUR HIGHER HERE THAN IN CI, and that is not a fault.**
`tests/test_eval_report_contract.py` parametrizes over every
`verification/*-v2.json`, and `verification/` is gitignored — a recorded run
carries real rows off the estate. A close-out that quotes the local number
quotes a figure no other machine can reproduce, so **quote the CI number and
say which it is.**
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
    cd frontend && npx vitest run                               # 1,022 expected (P2S.1)
    .venv\Scripts\python.exe ops/frames.py                      # the room beside the design, headless Chrome
    cd frontend && npx tsc -b --force                           # NOT -p, NOT bare -b
    cd frontend && npm run build

**THE ROOM IS SERVED BY VERCEL AT `https://thesupabot.vercel.app`** — recorded 2026-09-16 off the status bar of the owner's own screenshot. There is no `/health` there, but the entry bundle is content-hashed, so this is the frontend's build fingerprint:

    curl -s https://thesupabot.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9._-]*\.js'

**Read it BEFORE the push and poll until it changes** — the same discipline as the Railway watch, and the reason those swaps are measured and these have never been. **First measured 2026-09-16 on `2017d79`: 50 s, read at 05:11:53, pushed 05:11:55, new bundle at 05:12:45.** And the stronger move is the one after it — fetch the live CSS/JS the bundle names and grep it for the rule you changed. That is verification from production instead of from your own tree, and it is what nine close-outs meant by "nobody has seen it". It is not a sha and maps to no commit; it says only that the built content differs. `/health` on Railway confirms the BACKEND only, and a session reporting a frontend fix as live off it is reporting the wrong half.

**`npx tsc --noEmit -p tsconfig.json` CHECKS NOTHING IN THIS REPO** and a
session reported "typecheck clean" off it three times. `frontend/tsconfig.json`
is `{"files": [], "references": [...]}` — a solution file — so `-p` exits 0
having compiled no files at all. Plain `tsc -b` can also report clean off a
stale `.tsbuildinfo`. **`npx tsc -b --force` is the check**, and it is the one
Railway runs: P2.d shipped a duplicate interface member past all three of the
weaker commands and main was red on origin for a day.

The voice eval — real model, real reads, nothing written, opt-in. **It is v2
and only v2 since P1.e**: `test_voice_evals.py`, the first twelve, is deleted,
and every number in this file that came from it is marked as such.

    set GEORGE_EVALS=1
    set GEORGE_EVAL_REPORT=verification/<name>.json
    .venv\Scripts\python.exe -m pytest tests/evals/test_voice_evals_v2.py -q          # full, 11 turns, $1.51
    .venv\Scripts\python.exe -m pytest tests/evals/test_voice_evals_v2.py -q -m gate  # the gate, 4 turns

**DO NOT SET `GEORGE_VOICE_STRICT=1`.** It belonged to the twelve. In v2 style
is a rate and not a gate — deliberately, because `leads_with_reading` was every
non-trust failure across four recorded runs — and the flag turns those rates
back into assertions. P1.e's run set it and reported 8 of 11 "failed" on style
with every trust row clean, which is the first thing it will do to you too.

The environment comes from `backend/.env` and the run needs
`GEORGE_DATABASE_URL` and `ANTHROPIC_API_KEY` in it. Load it with
`dotenv.load_dotenv("backend/.env")` in a wrapper rather than echoing anything:
a probe prints the NAME and whether it is set, never the value.

Replaying a recorded run through today's checks costs **$0.00** and is how a
card that changes only a CHECK is verified:

    .venv\Scripts\python.exe -m tests.evals.corpus verification/<name>.json

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

**THE DESIGN IS SETTLED — 2026-09-17.** `ops/STANDARD.md` is the owner's
FINAL PRODUCT VISION (twenty sections, 2026-09-16); its §20 unlocked the
visual direction, and the owner then reached the design himself by pointing
at thirty-nine versions of one page: **George, Ahead of Me** —
https://claude.ai/artifact/BnwXtA3pPJxwui82FiKbpo (source:
`ops/ideal/george-ahead-of-me.html`, the `beside` room; the other rooms in
that file are the record of how it was reached and are not targets). His
words, 2026-09-17: *"remember all the things i told you today about this
artifact is exactly what i want from my design everything ive been leading
you to this final artifact is it. except the alive we can workshop the shape
color and everything."* What it is: him big at the top-left as a wide,
irregular, state-driven mark; his words directly under him set toward the
figures, a leading line from him to the claim; the figures on the right
flowing into columns, never a grid of boxes, a dashed line from him to each;
a fixed-width composition centred in the room that the sidebar slides and
never shrinks; no scrollbar anywhere, arrows where there is more; no box
around evidence; a store's hue on the swatch and the verdict's colour on the
mark; figures that draw themselves in and answer to a hover; the full drawing
vocabulary, chosen by the claim unasked and by name when asked. **Phase 2S in
§3 is that page, card by card.** The plan below it was derived from the old
standard and re-pointed on 2026-09-17; the links that follow are kept as the
record of the earlier reading.

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
the sources only the owner can supply, and the calendar.

**Its source is `ops/plan/plan.html`, in this repository** — it lived in a
session's scratchpad until 2026-09-13, which is deleted when that session
ends, so no later session could update it and it drifted from §3 four times in
one day. To republish after editing: the **Artifact** tool with
`url` = the link above and `file_path` = `ops/plan/plan.html`. Passing the
`url` is what keeps the owner's link working; publishing without it makes a
second artifact and leaves him reading the old one.

**§3 is the source of truth and the page is the readable copy, but BOTH are
updated in the same commit** (§1), and
`tests/test_plan_alignment_contract.py` fails if they disagree.

**THE TEST DOES NOT REACH THE PUBLISHED PAGE, and on 2026-09-14 that showed.**
It compares §3 with `ops/plan/plan.html` — two files in the repo — so a
session that edits both and does not republish leaves the owner reading a
stale page with a green suite behind it. P1.c's close was committed on
2026-09-14 and never published, so the link was **two cards behind** the repo
until P1.d republished it. Nothing can check this from here: publishing is a
tool call, not a file. **Republish as the last act of the card**, and say in
the close-out that you did.

The owner's two prompts are "Log this: …" and "Read ops/NOW.md. Do the next
card." — nothing else is needed to run it.

**A phase ends when the owner says it feels right — and it may never end with a
rebuild.** If it does not feel right, the answer is the next fix to the same
surface, measured against the same numbers.
