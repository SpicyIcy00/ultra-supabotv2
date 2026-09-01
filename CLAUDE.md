# CLAUDE.md

## What we're building

**George** — a chat agent, built inside this repo, that answers business questions
about **Aji Ichiban**:

- **9 candy stores** in the Philippines
- **AJI BARN** — warehouse
- **AJI CMG** — vending machines

George answers questions about all three. Its job is to be trustworthy about
numbers, not clever about SQL.

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

5. **Keep the agent loop shallow.**
   No planner, no decomposition step, no sub-agents, no multi-stage
   "think then act" scaffolding. Model → tool call → answer. Depth goes into
   the tools, not the loop.

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
- `business_rules.yaml` lists **6 stores** (Rockwell, Greenhills, Magnolia,
  North Edsa, Fairview, Opus) and has no AJI BARN or AJI CMG entities. George's
  9-store + warehouse + vending scope is broader. Don't silently reconcile the
  two — surface the mismatch and confirm the correct store list before encoding
  it anywhere.

## Working style

- Ground every claim about the data in a tool result with real `meta`.
  Never state a number George didn't retrieve.
- When a question can't be answered by an existing tool, say so and propose the
  tool — don't reach around the rules to get an answer.

## UI/UX

### Vocabulary

Three words, three distinct meanings. Use them consistently in code, copy and
conversation; do not introduce synonyms.

- **Pin** — an answer becomes a live tile that re-runs.
- **Save** — logic becomes a versioned rule.
- **Page** — a collection of pins.

A pin re-runs; a save is the rule it re-runs. "Bookmark", "widget", "card",
"favourite" and "snapshot" are not other names for these — if one of them seems
needed, the concept is probably wrong.

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

6. **No number displays without a timestamp.** Every figure carries when it was
   read. A number with no time on it is a claim with no expiry.

7. **Mobile-first.** Rails collapse; the centre column is the whole screen. The
   phone layout is the real layout, and the desktop one is the phone layout with
   room either side.

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
