# CLAUDE.md

## What we're building

**George** — a colleague, built inside this repo, who answers business questions
about **Aji Ichiban**:

- **candy stores** in the Philippines
- **AJI BARN** — warehouse
- **AJI CMG** — vending machines

George answers questions about all three. Its job is to be trustworthy about
numbers, not clever about SQL.

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

6. **A workflow composes existing read tools. It does not join them.**
   Steps do not pass data to each other: no expressions, no conditionals, no
   loops, and no step consuming another step's rows. The moment two results are
   combined, the combination is a **definition** — and definitions live in
   `metrics.yaml` behind vetted SQL, not in a saved workflow. If a workflow
   wants a fifth step that joins the other four, the answer is a new tool.

   A workflow **parameter** is scope — which store, which window, how many rows.
   A business threshold is not a parameter.

7. **Nothing runs unattended until it has been backtested and promoted.**
   A schedule pins a version id, never "whatever is current". An edit makes a
   new version, which starts ungated; the schedule keeps running the promoted
   one. Promotion is an administrator's act against a recorded backtest of a
   window that has closed, enforced in
   [workflow_writer.py](backend/app/services/workflow_writer.py) and again by a
   CHECK constraint. George may accept "every Monday at 6" in conversation — the
   schedule is created switched **off**.

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

Six words, six distinct meanings. Use them consistently in code, copy and
conversation; do not introduce synonyms.

- **Pin** — an answer becomes a live tile that re-runs.
- **Save** — logic becomes a versioned rule.
- **Page** — a collection of pins.
- **Post** — one utterance in the river, by George or by a person. Every George
  post carries its receipts and its notices; UI rules 3, 4 and 6 apply to all
  of them without exception.
- **Thread** — a post and its replies. A thread is not started, it **emerges**:
  the first reply to a post makes one. Nobody ever opens an empty one.
- **Watch** — a saved condition George checks, which posts when it fires.

A pin re-runs; a save is the rule it re-runs. "Bookmark", "widget", "card",
"favourite" and "snapshot" are not other names for these — if one of them seems
needed, the concept is probably wrong.

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

2. **One save gesture.** Same icon, same placement, same confirmation,
   everywhere. A user who learns to save once has learned to save everywhere.

3. **Every number is inspectable.** Clicking any figure shows its receipts in
   the same panel — no new route, no modal stack — and it works identically
   whether the figure came from chat or from a tile.

4. **Notices always surface.** Identically in chat, on tiles, and in the
   approval queue. A notice must never be swallowed by a card with room for
   only a number: if a tile cannot show the caveat, the tile is the wrong shape.

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
