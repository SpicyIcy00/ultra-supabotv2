# Generative Workspace V3 — Surface Composer and the living Work Surface

Recorded 2026-09-09 on `integration/george-v1`. This is the decision record
for the milestone: what was inspected, what was evaluated and declined, what
was built, what enforces it, and how a person judges it.

## 1. What the dogfood showed, and the diagnosis

Workspace V2 removed the chat *look* — no bubbles, evidence before prose, a
follow-up drawn indented under the work it followed — and the human dogfood
still read as

    question → rendered answer → follow-up → another rendered answer

because the architecture still **was** that. Three facts, read from the code:

- **There was no object for "Why?" to change.** `workUnit.ts` was the largest
  unit of meaning: one question, one turn, one answer. Composition
  (`composeWork.ts`) ran *within* a turn. A refinement could be drawn attached
  to the work above it, but its figures were its own, so re-reading net sales
  to explain it drew net sales twice.
- **Continuity was whole-scope equality.** `continuesWork` required the same
  window, the same filters and the same comparison. "Why?" survived; "compare
  it with Rockwell" (drops the store filter) and anything that added a
  comparison started a new answer. Identity and analysis shape were one key.
- **Every result earned screen space.** Nothing between the tools and the
  primitives asked whether a read was the answer, the evidence, or merely
  something George looked at on the way. A chain-wide comparison read beside
  a single-store question was drawn at full size because it existed.

Everything else was sound and is preserved: the finding frame as the model's
only channel into composition, `inferShape`/`resultShape`/`dedupe`, the
instruments, receipts, notices, the append-only river, thread access, page
scope, the live→stored handoff by post id, auto-follow, the accent rule.

## 2. AG-UI, A2UI, CopilotKit — evaluated against what George needs

| | AG-UI | A2UI | CopilotKit |
|---|---|---|---|
| What it is | An event protocol between an agent runtime and a UI: run lifecycle, text deltas, tool call start/args/end, `STATE_SNAPSHOT` / `STATE_DELTA`, custom events, over SSE/WS | A declarative UI protocol: the agent emits a component tree in JSON against a client-side catalog; the client renders it and reports events back | A React SDK: provider, shared agent/app state (`useCoAgent`), generative UI hooks, human-in-the-loop actions; speaks AG-UI to a runtime |
| Would replace / simplify | Our SSE frame vocabulary (`_sse` in `agent/loop.py`: `tool_call`, `tool_result`, `text`, `thinking`, `notice`, `finding`, `page_context`, `post`, `done`) and `useGeorgeStream`'s reducer | The `ResultBlocks`/`Instruments` selection path, if the model chose components | `GeorgeStreamProvider`, `useGeorgeStream`, the composer, the action chips |
| Overlaps code we have | Almost one-to-one. Our frames are already typed, mirrored in `types/george.ts`, and carry things AG-UI has no slot for: `notice` with `must_convey` fingerprints, `finding` (validated roles), `page_context` (evidence, never a figure), `post` (persistence ids for the handoff) | `inferShape` + `resultShape` + `composeWork` already ARE a declarative composition — from **rows and meta**, never from the model | The provider, the stream hook, the presence model, Pin/Save gestures, the approvals colour rule |
| Complexity now | Adapter both sides, a second frame vocabulary to keep in sync, custom-event escape hatches for every George-specific frame. Net increase | A catalog the model can address is a third vocabulary beside `metrics.yaml` and the finding roles. Net increase, plus a new attack surface | Two providers and two state owners for one live HTTP response; the client-side "shared state" is exactly the second source of truth Part 5 forbids |
| Deterministic truth, security, provenance | Neutral on truth; but `STATE_DELTA` from the agent is a write into UI state the model authors, which is the reach architecture rule 9 forbids unless every field is validated server-side (which is what `finding` already does, narrowly) | **Violates it as designed.** A model-emitted component tree can name a component, a colour, a width, a label with a figure in it. Our rule is that the model may not reach the renderer | Its generative-UI hooks render on tool-call arguments the model wrote. Same problem |
| Future: voice, bidirectional state, approval, tool events, surface mutation, workflows | Good shape for tool events and approval; voice is orthogonal; surface mutation would need our semantics on top anyway | Bidirectional events are its strength; nothing about mutation semantics | Approval flows are its strength; everything else is a React layer we already have |
| Migration cost | Medium: an adapter on the loop and a reducer rewrite, plus retesting every contract that reads frames | High: every instrument re-expressed as catalog entries; every contract test that holds the one-way path rewritten | High: provider swap, state ownership change, and it drags AG-UI in |
| Lock-in / coupling | Protocol lock-in is mild; the schema is open. The coupling cost is a second vocabulary | Strong coupling of the model to a catalog we would have to freeze | Strong: React-level coupling to a vendor SDK on the primary surface |

**Decision: adapt, do not adopt.**

- **AG-UI — defer, and adopt one concept.** Our frames are already an event
  protocol with richer, validated semantics. What AG-UI has that we lacked is
  the *idea* of a typed, versioned **state snapshot** as a first-class thing
  the UI reasons about. That concept is what `SurfaceAnchor`/`SurfacePlan` is
  — derived deterministically from persisted frames, never emitted by the
  model. If a second client (voice, Telegram) ever needs our frames, an AG-UI
  adapter on top of `_sse` is a contained afternoon and is not needed now.
- **A2UI — adopt the concept, reject the implementation.** A declarative,
  validated description of the surface is right, and it is now
  `surfaceModel.ts`. The difference is *who authors it*: the composer, from
  trusted results, with `surfaceViolations` failing any plan that carries
  markup, a colour, a dimension, a component name or a figure the evidence
  does not carry. The model's channel stays the finding frame.
- **CopilotKit — defer.** It would replace working, tested code with a vendor
  layer and introduce the second source of truth this milestone explicitly
  forbids. Nothing it offers is on the critical path for A–F.

No dependency was added.

## 3. What was built

```
tool results ({rows, meta})          persisted posts (charted, calls, findings)
        │                                       │
        ▼                                       ▼
   workUnit.ts  ── one turn: sources, findings, blocks (unchanged)
        │
        ▼
   surfaceAnchor.ts   identity (business, window, population filters)
                      vs shape (comparison, grouping, metric, subjects);
                      subjects by RELATION: same / expanded / narrowed / disjoint
        │
        ▼
   surfaceCompose.ts  riverSurfaces(items) → Surface[]      (grouping)
                      composeSurface(steps) → SurfacePlan   (THE COMPOSER)
        │
        ▼
   surfaceModel.ts    SurfaceAnchor · SurfaceGoal · SurfaceSectionPlan (rank,
                      folded) · SurfaceAttention · SurfaceRefinement ·
                      surfaceViolations()
        │
        ▼
   WorkSurface.tsx    draws a plan with the existing primitives (entryParts.tsx)
        │
        ▼
   surfaceEvents.ts   SurfaceInstruction → business-language question (the seam)
```

### 3.1 The Surface Model (`surfaceModel.ts`)

`SurfacePlan { id, anchor, goal, title, sections[], attention[],
refinements[], notices[], evidence[], suppressed[], receipts }`.

- `anchor` — business, subjects (sorted; `[]` = the whole estate), the
  subject dimension, the window **from `meta.window`**, and every filter that
  is not a subject.
- `goal` — closed: `performance | investigation | comparison | breakdown |
  listing | statement`, derived from roles and shapes.
- `sections[]` — the composeWork rungs with a **rank** (`primary |
  supporting | context`) and a **folded** flag.
- `attention[]` — subjects the data singles out; `reason ∈
  {against_the_majority, ranked_first}`; no score anywhere.
- `refinements[]` — semantic instructions the definitions permit.
- `evidence[]` — `SurfaceSource`: a `ResultSource` renumbered across steps,
  carrying `unitId` and `localSeq` so receipts and pins keep the loop's own
  numbers.

`surfaceViolations(plan)` fails: any authored string containing a tag, an
escaped tag, `style=`, `className`, a hex or functional colour, a dimension
unit, `javascript:`, `React`/`useState`/`=>`; any numeral not present in the
trusted vocabulary (subject names, metric labels, window bounds); a goal,
rank, instrument or op outside its closed set; a block drawing a seq not in
`evidence`; an attention subject no row returned.

### 3.2 The Surface Composer (`surfaceCompose.ts`)

`composeSurface(id, steps, anchor)` — a pure function:

1. **Union and renumber** every step's sources; remap findings.
2. **Dedupe across steps** (`dedupeSources`, unchanged rules): a refinement's
   re-read of a fact already on screen is suppressed; the drivers it recorded
   are **re-hung on the surviving figure** (`surfaceFindings`, via
   `coveredBy`). This is the whole mechanism of "Why?" deepening rather than
   restating.
3. **One primary, the newest that survived.** A genuinely new primary
   ("compare it with Rockwell") takes the lead; the earlier one becomes
   context. A dependent whose primary is shown by nothing becomes context.
   Nothing is dropped.
4. `composeWork` builds the sections; rank by role; **fold a context section
   whose every result reaches outside the anchor's subjects**
   (`broaderThanAnchor`). A whole-estate anchor folds nothing.
5. `attentionIn` — only when the composition is structured (findings stood),
   only in unfolded sections, only from `majorityDirection` exceptions and
   the first row of a tool-performed ranking.
6. `refinementsFor(primaryResult, anchor)` — only where `meta.drivers` /
   `meta.valid_group_by` permit.
7. Title: `GOAL_LABEL · subjects (≤3) · window label`.

`riverSurfaces(items)` walks the river once; a work unit opens a surface and
a following question+answer joins it when `belongsToSurface` holds — the
reply link, one thread, a continuing anchor relation. Presentation only; posts
are untouched.

### 3.3 Current Surface State (`surfaceAnchor.ts`)

Derived, never stored: the anchor is read from the arguments the tools
accepted and the meta they returned, on the live turn and on the stored post
alike (the loop already persists `charted[].arguments`, `calls`, `findings`).
No new column, no migration, no client store. A reload rebuilds the same
surface from the same posts; the suite holds the plan byte-equal across two
builds and holds the live composition structurally equal to the stored one.

The model is told the same state the same way: `agent/surface.py
work_sentence` builds `[The work in front of the user: net sales,
transactions and average transaction value for OPUS, last week, compared
with the previous period. …]` from the newest George turn's **calls** — no
row, no figure — and the loop puts it on the question beside the page
sentence, never in the cached system prompt. "Why?" now has a deterministic
referent on both sides.

### 3.4 The semantic event seam (`surfaceEvents.ts`)

`SurfaceInstruction = explain | break_down(dimension) |
compare_subject(subject) | focus_subject(subject)`. A chip, a row click and
(later) a spoken phrase all become one of these; `instructionQuestion` turns
it into the business-language question George is asked — deterministically,
from meta and anchor, with no DOM read and no tool vocabulary. `actionShape`
now delegates here so a lone entry and a surface phrase identical questions.
Instructions do not call tools, choose formulas or reach the renderer; they go
through the ordinary loop and arrive with receipts and notices.

### 3.5 Prose becomes secondary

- Prompt: a **THE SURFACE** section built from `metrics.yaml surface` — the
  smallest sufficient surface, single-store performance is not a chain read,
  "compare A with B" is one grouped call, 0–3 sentences when the figures are
  drawn, the leak list, transaction wording, causal words to avoid. The
  prompt's own examples no longer say "traffic-led" or "traffic or basket".
- Loop: `surface.leaked_terms` and `surface.transaction_synonyms` scan the
  final answer; a hit is a gap (`tool_vocabulary_leaked`,
  `transaction_wording`) and a `warning` frame. **Recorded, not corrected**:
  rule 17's exception (being asked how a figure was got) cannot be told from
  a leak mechanically.
- Frontend: `proseLeak.ts` (`leakedTerms`, `transactionSynonyms`,
  `coveredFigures`) — a lint for fixtures and golden answers.

### 3.6 Rendering (`WorkSurface.tsx`, `entryParts.tsx`)

One `<article data-work data-surface>` per surface: intent; a quiet trail of
refinements; the title line; activity; caveats above the figures (union
across steps, each said once); sections in rank order with context folded
behind a line that names it; the attention line (a characterisation of rows,
no numeral); the latest prose as the reading; earlier readings behind
"Earlier in this work"; every step's notes (pin, save, page change, stop,
page evidence) never folded; refinements and Pin; time, share, open.
`RiverEntry` (one item alone) keeps drawing from the same parts for Today,
the legacy chrome and the single-entry contract.

## 4. What enforces this, stated exactly

- **The model cannot reach the surface** except through the finding frame,
  which `agent/findings.py` validates against the executed set and
  `metrics.yaml`. Unchanged.
- **The composer cannot invent** — held by `surfaceViolations` in the suite
  for every composed fixture, and by having no arithmetic in the file.
- **Continuation is structural** — reply link, thread, anchor relation. The
  question text is never consulted; a test proves unrelated words continue
  and a related-sounding question over Magnolia does not.
- **Attention has no score** — `metrics.yaml surface.attention` records
  `score/threshold/severity: not_supported`; a test scans the plan for those
  keys.
- **The definitions and the client agree** — the backend contract test holds
  `surface.refinements` to `SURFACE_OPS` and the subject-filter list to
  `surfaceAnchor.ts`.
- **Prose leakage is recorded** as gaps and warnings. It is **not**
  mechanically corrected, and rule 9's statement of enforcement is unchanged:
  nothing verifies numerals in prose against rows in production.

## 5. Security and privacy

No new endpoint, no new capability, no new role, no new persisted field, no
dependency. The surface is composed on the client from posts the viewer was
already permitted to read through the river's visibility clause; grouping
posts into a surface exposes nothing the list did not. Thread access, page
scope, ownership, the reader/writer injection and `george_ro` are untouched.
The work sentence contains arguments only — never a row, never a figure — so
the prompt gains no data it did not already carry in `[Calls behind this
answer: …]`.

## 6. Persistence / promotion seam

A surface is `{anchor, goal, evidence}` and evidence is the calls that ran.
A Pin already stores calls; a Page is ordered Pins; a Workflow is versioned
steps of calls. So a surface promotes without reconstructing meaning: Pin =
the latest step's pinnable calls (offered today); Page = the surface's
evidence in section order (a later gesture); Workflow = the same calls as
steps with the anchor as parameters (Workshop, deferred). Nothing built here
makes that harder; `SurfaceSource.localSeq`/`unitId` exist so the way back to
the loop's own call numbers is never lost.

## 7. Known limitations

- **Disjoint subjects under a typed reply start a new surface.** "Compare it
  with Rockwell" typed as prose depends on George making the grouped chain
  call (the prompt now says so, and rule 6 already pushes that way). Two
  scoped reads, one per shop, also join (subjects union). A single scoped
  read of Rockwell alone would stand apart — deliberately, because "And
  Magnolia?" must.
- **A change of window starts new work**, by design (Part 11 names date range
  as identity). `change_period` is therefore not a refinement op; it is a
  new question.
- **Prose leaks are warned, not rewritten.** See §3.6.
- **The answer-level receipts line is still the last read's meta** when
  nothing is drawn (pre-existing, noted in `agent/loop.py`).
- **Behavioural evals** (`tests/evals/`) were not run: they call the real
  model against the real database and are opt-in.
- `groupsWithItem`/`quiet` for standalone entries between surfaces is kept;
  surfaces themselves never group with neighbours.

## 8. Local startup

Unchanged from [LOCAL_DOGFOOD.md](LOCAL_DOGFOOD.md):

```powershell
$Python = Resolve-Path ..\..\.venv\Scripts\python.exe
& $Python ops/local_postgres.py start
& $Python ops/local_dogfood.py provision          # once
& $Python ops/local_dogfood_serve.py --check
& $Python ops/local_dogfood_serve.py --allow-model   # the sequence below needs the model
cd frontend; npm run dev -- --host 127.0.0.1
```

Sign in with the passcode in `verification/postgres/dogfood-login.txt`, open
`http://127.0.0.1:5173/ask`.

## 9. Human dogfood A–F

Ask each line in order, in one sitting, as a reply to the previous (the
composer continues the newest own thread by default).

**A. "How did OPUS do last week?"** — Expect one object titled *Why it moved ·
OPUS · Last week* (or *Performance · OPUS · Last week* if George recorded no
driver roles): the figure, then *What moved it* as one split; no chain data
unless a folded line *Also read — outside this work's scope* names it; prose
of one to three sentences under the figures.

**B. "Why?"** — Expect the SAME object: a `↳ Why?` line in the trail, the
primary figure drawn once (not re-drawn), the drivers under it, the new
reading replacing the old one, *Earlier in this work* holding the previous
reading. Not a second avatar, not a second title.

**C. "Compare it with Rockwell."** — Expect the same object retitled
*Compared · Last week*: the store comparison leads, the earlier OPUS set
becomes a lower section, the trail shows three lines. If George reads only
Rockwell alone the object splits — that is the limitation in §7, and it is
worth recording which he did.

**D. "Show me the products."** — Expect *Where it sits* added beneath, as a
change ranking of product revenue at OPUS (the definitions refuse net sales
by product; George should say so if asked for that). If the tool refuses, the
refusal is the answer and the surface does not change.

**E. "Compare all stores last week and show me what deserves attention."** —
New surface (no reply link to a related anchor is required; ask it fresh).
Expect one subject comparison, no table, no second instrument of the same
facts, and a navy-ruled line naming the stores that moved against the rest —
with no number in it. Prose interprets; it does not list seven stores.

**F. Navigate to Pages, come back, reload.** — Expect the identical
composition: same titles, same trail, same folds. Nothing on the client
remembers it; the posts do.

Judge every answer for leaked vocabulary and for "customers/traffic/people"
beside transaction figures; the gap log (`george.conversations`) now records
both as `tool_vocabulary_leaked` and `transaction_wording`.
