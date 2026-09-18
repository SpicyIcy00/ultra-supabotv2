# CLAUDE.md — the rulebook

The rules that do not change. If a task seems to need one broken, stop and ask.

- **`ops/NOW.md`** — where we are, the cards, how we work. **Read it first.**
- **`ops/STANDARD.md`** — the owner's FINAL PRODUCT VISION (2026-09-16, twenty
  sections; it replaced the 26-feature list). **The standard work is measured
  against**, never a plan distilled from it.
- **`ops/DECISIONS.md`** — why these rules got there, and every reading CLAUDE.md
  carried before 2026-09-12.

## What we're building

**Bob — an AI operator for our businesses.** He **understands** the business,
**builds** systems with you, and **runs** them: *"My business is here. Bob
understands it. We operate it together."* **Trustworthiness about numbers is the
FLOOR, not the job** — `ops/STANDARD.md` is the job.

**The estate:** candy stores in the Philippines, **AJI BARN** (warehouse), **AJI
CMG** (vending). **The store list lives in `definitions/metrics.yaml` and nowhere
else** — `stores.active_retail`, `pending_retail`, `warehouse`, `closed`. Never
write a store count into a file, prompt or tool.

## Architecture rules

1. **Tools NEVER write freehand SQL against raw tables.** No model-generated
   SQL, no string-built queries — vetted, parameterized queries only.
2. **Every tool returns `{rows, meta}`**, `meta` always carrying `source_table`,
   `filters_applied` (implicit ones included) and `snapshot_timestamp`. Never a
   bare list, never a sentence in place of rows.
3. **All business definitions live in `definitions/metrics.yaml`**, read at
   runtime. Never hardcode a formula, threshold, grouping or date-window
   convention in a tool; if one is missing, add it there and read it.
4. **Bob uses a read-only Postgres role.** No writes, no DDL, no temp tables.
   A capability needing a write or a privileged read is a **writer injected by
   the web process**, bound to the authenticated user, calling its HTTP
   route's service function; the agent holds no credential. **No writer
   injected means the tool is absent from the model's schema.**
5. **Keep the agent loop shallow.** No planner, decomposition step, sub-agents
   or multi-stage scaffolding. Model → tool call → answer; depth goes in the
   tools.
6. **A workflow composes read tools; it does not join them.** No expressions,
   conditionals, loops, or a step consuming another's rows — two results
   combined is a **definition**, and definitions live in the yaml behind vetted
   SQL. A **parameter** is scope; a threshold is not. A definition MAY declare a
   bounded **setting** (meaning, type, bounds, default, where it participates)
   that a person binds and every run records.
7. **Nothing runs unattended until backtested and promoted.** A schedule pins a
   version id, never "whatever is current"; an edit makes a new ungated version;
   promotion is an administrator's act against a recorded backtest of a closed
   window. Bob may accept "every Monday at 6" — the schedule is born
   **off**. With no authored logic to backtest (a scheduled question),
   **capability** stands in its place: reads, `compose`, `view_memory`,
   `view_automations`, `record_belief`, enforced by absence.
8. **Divergence is allowed; silent divergence is not.** A manual run uses the
   newest version, a schedule fires the promoted one. Any run diverging from an
   enabled schedule's pinned version carries a `version_divergence` notice
   naming which ran, which each schedule fires and why, on the run record and in
   the answer. Promoting never repoints a schedule.
9. **Important figures come from deterministic code and trusted definitions.
   The model selects, investigates, explains and interprets; it never computes
   one.** One-way: definition → vetted SQL → the tool's comparison →
   `{rows, meta}` → Bob's reasoning → the surface. A ratio worked out in
   prose has no receipt; a group total is a READ (`group_by: []`), never a sum
   of rows on screen. **Enforced by the definitions, the tools and the golden
   tests — production does not check numerals in prose against rows**, which is
   an eval only. Claim no more.
10. **An investigation is reasoning behaviour in an ordinary conversation** — a
    bounded ladder (verify, decompose, localize, explain, stop) climbed in
    rounds; not an object, tool, table or page. The primary fact is verified
    first and a false premise stops the investigation. Drivers are declared in
    the yaml and read in the same batch, window, filters and comparison as it.
    The reading is qualitative: **attribution shares are unsupported**,
    localization is not cause, and what the data does not establish belongs in
    the answer.

## The repo

**Ultra Supabot v2** — async FastAPI/SQLAlchemy/Postgres, React + TypeScript +
Vite ([main.py](backend/app/main.py), [services/](backend/app/services/),
[routes/](backend/app/api/v1/routes/)). Datetime logic is **Asia/Manila**
timezone-aware throughout.

**Bob is not the existing chatbot.** `sql_generator.py`, `query_executor.py`,
`query_validator.py` and `routes/chatbot.py` generate freehand SQL from a schema
prompt — the pattern rule 1 forbids. Never extend them or reuse that path;
`business_rules.yaml` is theirs. Reading them for schema is fine.

When no tool can answer, say so and propose the tool; never reach around a rule.

### Never print a secret's value

**Any shell probe reading environment variables prints the variable NAME and
whether it is set — never the value, never a prefix, never a "redacted" slice.**
No exception for "just checking":

    [ -n "${!k}" ] && echo "$k: set" || echo "$k: unset"   # correct
    echo "$k: ${v:+set}${v:-MISSING}"                      # WRONG — prints the value

Shell defaulting syntax reads as a guard and is not one: that second line
printed the model key and both role passwords in full. Every mechanism counts —
`env`, `printenv`, `set`, `cat` of a `.env`, a secret in a log line or an error.
To check a value, assert a property of it and print the assertion. `backend/.env`
holds a superuser `DATABASE_URL`, both role passwords, `BRIEF_TOKEN` and the
model key.

## UI/UX

**Visual direction: the `beside` room of *Bob, Ahead of Me***
(`ops/ideal/bob-ahead-of-me.html`, https://claude.ai/artifact/BnwXtA3pPJxwui82FiKbpo),
declared by the owner 2026-09-17 after STANDARD §20 unlocked the direction; only the
alive mark's shape and colour are still open. NOW.md §3 Phase 2S builds it. The rule
under it stays: a representation earns its place by communicating better than the
alternatives, it never changes factual meaning, and every expressive channel is driven
by a value the data carries.

### Vocabulary — eight words, eight meanings

Use them in code, copy and conversation; no synonyms. A forbidden word seeming
necessary means the concept is probably wrong.

- **Pin** — an answer becomes a live tile that re-runs. One person's.
- **Save** — logic becomes a versioned rule: a **workflow** of named steps and
  parameters as immutable **versions**, a **run** one execution of one, a
  **backtest** a run over a past window. The company's rule, so org-level. Not
  "recipe", "job", "automation", "template".
- **Page** — a persistent collection of pins (`george.pages`; `page_id` is
  identity, the title presentation).
- **Post** — one utterance in the river, with its receipts and notices.
- **Thread** — a post and its replies; not started, it **emerges**.
- **Watch** — a saved condition checked on a schedule, posting only when the
  answer **changes**; silence is normal. Not "alert" or "trigger".
- **System** — something built with Bob that persists: a workflow as its
  logic, plus its settings, schedule, runs and approvals.
- **Standing question** — asked on a schedule, answered fresh by the ordinary
  loop. It always speaks, what it says undecided in advance. One person's.

**Desk** (the workspace model) and **Selection** (subject ids and labels the rows
carried, never a label the model inferred and never a figure) are internal names.

### Rules

1. **Bob is on every page, not a page you navigate to**, and receives that
   page as context.
2. **One save gesture**: same icon, placement and confirmation everywhere.
3. **Every number is inspectable.** Clicking a figure shows its receipts in the
   same panel wherever it came from, with no new route or modal stack.
4. **A notice is drawn when it says a figure may be wrong** — stale,
   incomplete, disagreeing, a version divergence — identically everywhere, ABOVE
   the number. One that only explains how a figure was measured is not drawn
   (the owner, 2026-09-17: *"we dont need those disclaimers unless it has wrong
   data"*). Which is which is `surface.desk.notices`; an unlisted kind is drawn.
   Raw diagnostics never reach the answer.
5. **One colour means "needs you"** — approvals, nothing else. **A notice never
   wears the accent**: a caveat takes prominence from position and structure,
   never hue. Bob's mark is the one exemption, and its error state changes
   the DRAWING, never the colour. Held by `accentUse.test.ts`, not by review.
6. **No number displays without a timestamp.** A number with no time on it is a
   claim with no expiry.
7. **Mobile-first.** The phone layout is the real one; desktop is it with room
   beside it.
8. **A claim about state renders from a loaded result, never a literal.**
   "Nothing needs you", "0 pending" and "all fresh" are assertions about the
   world. Not-yet-loaded is its own state: *loading*, *failed* and *loaded* are
   three renderings, the first two never borrowing the third's.

An annotation on a chart may **point** at rows and **characterise** them, never
name a number.

### Levels of automation

**Analysis** is as automatic as the definitions allow, inventing no threshold or
cause. **Decision is level four**: he recommends one course, the owner
decides. **Action is never above level five**: everything leaving Bob's hands
is a person's veto point. **Reasoning is shown every time** — an operator who
cannot see why cannot take over. Moving a level is recorded in `ops/DECISIONS.md`
first, with the test that holds it, before it is built.
