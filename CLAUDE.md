# CLAUDE.md

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

### The plan

*Added 2026-09-09.* Six phases. **A phase ends when the person using George
says it feels right — never when the architecture is finished.** That rule is
the whole process change: the previous three weeks produced milestones that
satisfied their specifications exactly and still felt like an analytics
chatbot, because completion was measured against the spec instead of against
the feeling.

Each phase must be usable on its own. No phase may be built as infrastructure
for the next one.

- **0 · The honest baseline.** Correct what George is wrong about. The store
  list is the live example: 22 stores exist and the definitions know 11, so
  **AJI PINA's 92 transactions are missing from every figure George quotes**,
  and two rows called `Test stoee` and `test store 2` are in the production
  store table. Also: apply the `shipment_plans` grant so the replenishment tool
  can run.
- **1 · George forms a view and keeps it.** The world becomes real objects, and
  George records what he believes about each one — with the evidence, when he
  last confirmed it, and what changed his mind. Judgment is unblocked.
  *Done when:* you stop asking questions to find out what is happening.
- **2 · The workspace transforms.** One evolving situation instead of stacked
  answers. Point and speak. Hierarchy follows George's judgment, so what matters
  is large and what does not is quiet.
  *Done when:* after five steers you are still in one piece of work.
- **3 · George works when you are not there.** The between-times. He notices a
  real change, investigates, and may conclude that nothing important happened.
  Truthful about what he actually watched.
  *Done when:* he tells you something you did not know to ask.
- **4 · BUILD.** George proposes a definition, metric or system; it is
  backtested; a person approves it; it becomes permanent. **This is the existing
  workflow promotion gate generalised**, and it is how George grows without
  inventing a number.
- **5 · RUN.** He operates what was built. "Three things need you" because three
  systems reached states needing a decision.

**The order is not arbitrary.** Everything in phases 3–5 needs phase 1: a
George with no memory cannot notice a change, cannot hold a system's state, and
cannot tell you what he did while you were away.

**What blocks progress is rarely code.** Today it is three data facts: the
estate list is wrong, `george_ro` has no grant on `shipment_plans`, and only 456
of the 1,130 products that sold in the last 90 days can be traced to a supplier
at all — which is a gap in purchase-order history, not in any tool.

Three things below were written for a question-answering agent and now sit in
tension with the mission. They are **not repealed here** — repealing a trust
rule by implication is exactly how numbers stop being trustworthy — but each
needs a deliberate decision rather than silent erosion:

- **Architecture rule 5 (shallow loop)** forbids planning and decomposition.
  "Investigates on his own" will press on it. The 2026-09-08 reading already
  bent it once by putting the investigation ladder in the prompt instead of the
  loop; that trick does not extend to Build.
- **Architecture rule 4 (read-only role)** has been extended four times by
  injecting a narrow writer per capability. Build and Run need more writers
  than that pattern comfortably carries, and the pattern should be reviewed
  before the fifth.
- **Architecture rule 7 (nothing runs unattended until backtested and
  promoted)** is the right shape for Run and is the one piece of the future
  already built. It is also the mechanism by which George could safely extend
  himself: propose, backtest, an administrator promotes. Today it applies only
  to workflows.

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
