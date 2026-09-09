# George Experience Reset — Phases 1 and 2

Recorded 2026-09-09 on `integration/george-v1`. The decision record for the
milestone: what the dogfood showed, what was built, what was deleted, what
enforces each claim, and how a person judges it.

## 1. The diagnosis, and what it was not

Generative Workspace V3 composed correctly and still read as
question → answer → question → answer. The engine was not the problem; three
things above it were.

- **The surface was a document.** `WorkSurface` composed a plan and then drew
  a vertical article — title, trail, caveats, sections, reading. A composed
  article is still something you read from top to bottom, so the composer's
  rank of primary / supporting / context arrived as vertical ORDER instead of
  spatial hierarchy.
- **Subjects were labels, not objects.** A store was a row in a comparison and
  a chip. It could not be clicked into focus, selected with two others, or
  excluded — so every manipulation had to be typed, and typing is chat.
- **Every step was a turn.** Changing the window, switching the metric,
  looking at products: all model turns with tool reads. Nothing could feel
  immediate, because interpretation and manipulation shared one slow path.

Two further facts about the shape of the product: Ask was a room you entered
(a hero mark and "Ask anything" says *you are not in your business*), and
attention was a feed (a list of posts is Slack; marks on the things they
concern is an environment).

## 2. What was built

```
tool results ({rows, meta})        persisted posts (charted, calls, findings)
        │                                      │
        ▼                                      ▼
   workUnit → surfaceAnchor → surfaceCompose → SurfacePlan     (V3, unchanged)
        │
        ▼
   deskCompose(plan, deskState) → DeskLayout                   (NEW)
        │        stage: field | anatomy | compare | figures | statement
        │        receded, attention, refinements, scope, level
        ▼
   Field · Anatomy · Compare · Stage · Trail · Inspector · DeskLine
        │
        ▼
   deskActions → a local view change, or one question in business words
```

- **`subject.ts`** — a store, product or category with an identity taken off
  the row that carried it (`store_id`, `product_id`, `category`; the
  definitions' own keys). A store falls back to its display name, because a
  read scoped by filter returns no id column and the same shop must be one
  subject either way.
- **`deskState.ts`** — selection, focus, window, inspector, trail step, list
  view. Transient by construction: no `localStorage`, no route state that has
  to survive. `restoreDeskState` recovers focus from what the newest question
  CARRIED, which is on its stored post.
- **`deskCompose.ts`** — the layout. Position, size and fill come off rows;
  `strongerDriver` reads the larger of two percentages the tool returned and
  refuses a reading when they are equal or either is missing. No score, no
  threshold, no share. Pure, so the suite holds a fingerprint across two
  builds.
- **`fieldLayout.ts`** — geometry. Area ∝ value (radius by square root), zero
  always in a change domain, a single axis spread down the plot in the tool's
  row order and labelled on x alone.
- **`replay.ts` + `POST /george/replay`** — the same calls, one scope argument
  moved, through the validation a pin passes and the runner a tile uses. Roles
  carry across by position, so the field recomposes with the same primary and
  drivers.
- **`agent/surface.py desk_sentence` + `desk` on the ask request** — the
  selection reaches the model as NAMES on the question, beside the work
  sentence, never in the cached prefix and never as a figure. Labels are
  neutralised (one line, no brackets) because they are client-supplied text.
- **`GET /george/definitions/desk`** — the business, the presets and which
  include today, the window argument per tool, the resting reads, the
  selection bounds, the locations. Served so the client keeps no copy.

## 3. The decisions, and why each went the way it did

**The desk is not a word the product uses.** It is the internal name of the
workspace model. The product is George; the screen is the business.

**Ask and Today were deleted, not kept.** They were the metaphor the reset
exists to remove. Their behaviour is absorbed: Ask is the line at the foot of
the workspace, Today is the workspace at rest. Every path redirects.

**The estate recedes to a BAND, not behind a disclosure.** The first draft
folded the field away when a store was focused, and the multi-select test
could not reach the second shop — which is exactly what a person would hit.
Context recedes in scale and opacity and stays live, so the next shop is a
shift-click away rather than a name to type. That is the difference between
"clicking was faster" and "clicking was a dead end".

**A field is offered only where it earns its place.** Seven stores on the two
drivers of net sales shows every store's driver mix at once, which a bar chart
cannot. Where there is no such advantage the encoding falls back to a single
axis, and the same rows are one control away as the conventional instrument.
A subject the tool could not place is NAMED, never drawn at zero — a dot at
the origin reads as "no change", the opposite of what happened to a product
that vanished.

**The luminous language is presentation and encodes nothing.** The core of
each ramp is `george-data-up` / `george-data-down` exactly — the pair
measured for protan and deutan separation on this cream — so the dense centre
the eye fixes and every printed mark keep the validated contrast. The cloud is
the same hue dissolving outward. Removing the glow removes no information;
the suite asserts every object prints its name, its figure and its delta, and
carries all three in its accessible name.

**The accent list went from four to five, and it was argued.** The desk's line
carries the needs-you count for the surface a person lives on; the shell's
rail still carries it for the three rooms. The same fact in two chromes during
the migration, not a second meaning. It returns to four when the rooms move
onto the desk.

**A window change is transient.** Nothing is written; the record of it is the
next question, which carries the window in `desk.window`. A comparison needs a
closed window, so a partial preset is drawn as unavailable with the closed one
the definitions name — the tool's own refusal, read from the server.

**Selection joins work that its reads would split.** "Compare that with
Magnolia" may arrive as a single scoped read of Magnolia alone; judged on its
reads the anchor relation is `disjoint` and the work would split, which is the
one thing the person did not mean. `withSelection` adds the subjects the
question CARRIED before the relation is taken. It is the stored selection, not
the question's text, and a selection in another dimension adds nothing.

**Declared bounded settings were amended into rule 6, and nothing is declared
yet.** The contract is in `metrics.yaml settings`: meaning, type, bounds,
default, and where it participates. The first declarations arrive with the
purchasing definitions, which this milestone deliberately does not build.

**System is the seventh word.** The user-facing object for something built
with George; workflow stays the name of the executable rule inside it. Nothing
was built on it here — it is recorded so the build grammar cannot arrive
calling the same object a job or an automation.

## 4. What enforces this, stated exactly

- **The model still reaches nothing.** Its channels are the finding frame and
  its prose, as before. `surfaceViolations` is unchanged; the desk composer
  has no arithmetic in it and its figures are row fields reached by seq and
  row index.
- **The definitions and the client agree** — `tests/test_desk_contract.py`
  holds the desk vocabulary, the subject identity keys, the refinement ops on
  both sides, the replay bound against the pin's own limit, and that the
  resting reads are calls a pin could hold and are over a closed window.
- **The selection channel is bounded server-side** — `DeskContext` refuses an
  unknown dimension and more subjects than the definitions allow; the sentence
  is built from arguments only and a hostile label cannot break out of its
  line.
- **Nothing updates or deletes a post** — asserted over the routes, the writer
  and the loop; the one UPDATE is the share, which changes visibility.
- **The interaction model is held against the DOM** —
  `desk.dom.test.tsx`: the business reorganises rather than reporting, a focus
  transforms one object and appends nothing, a click never reaches the model,
  a selection travels as trusted ids, a window change replays without a turn,
  the whole model survives reduced motion, and every figure on screen is a
  figure a row carried.
- **Production still does not verify prose numerals against rows.** Rule 9's
  statement of enforcement is unchanged and this milestone adds no claim
  beyond it.

## 5. What was NOT built, deliberately

Purchasing definitions and the order ledger; Prepare, Build, Decide and
Operate as grammars (named in `surface.desk.grammars_deferred` so they cannot
arrive under other names); Watches; voice; FFR anything; a node editor; a
free-form canvas; a notification centre; multiple desks; any new AI framework.

## 6. Known limitations

- **The attention stream has no reader.** Today read it; the desk shows what
  George initiated as the morning sentence, the counts and History. A brief's
  follow-up chips are not on the desk. If the dogfood wants them back they
  belong on the resting workspace, not as a feed.
- **The trail's step view is presentational.** Stepping back shows the earlier
  steps of the same surface; it does not re-derive the plan as it stood then,
  so a folded section that arrived later is still folded. Honest, and narrower
  than it looks.
- **The inspector is desktop only** (`xl` and up) and is not yet a sheet on a
  phone. Receipts under the stage carry the same provenance at every width.
- **A replayed window is not re-read by George.** The reading on screen
  belongs to the earlier window until he is asked; the desk does not yet say
  so in the trail.
- **`figures` is the fallback stage** for anything the grammar cannot yet
  place — a time series, a mixed result. It draws through the existing
  primitives, which is correct but is not the desk.
- **No behavioural evals were run.** They call the real model against the real
  database and are opt-in.

## 6b. The refinement (2026-09-09, after the human dogfood)

The workspace behaved like a workspace and did not feel like George. Eight
things were wrong, and each has a decision.

**1. The explanation was detached from the visual.** George's reading sat in
the left rail; the figures it read sat in the middle. Two failures at once —
the explanation was in the one place a reader's eye does not go, and the
persistent navigation a workspace needs had nowhere to live. The left column
is now navigation (Home, Needs you, Running, Kept, History, Operations) and a
test forbids prose, receipts, a summary and a recommendation from it, because
all four drifted there once.

**2. Words and visual did not explain each other.** The workspace now composes
ONE answer in one reading order: the caveat, the figure, the reading, the
drivers, the visual, what the data singles out, George's next move, the other
moves. The reading sits BETWEEN the figure and the drivers it is about.

**3. The reading was a paragraph.** It is one sentence and carries no numeral
— "transactions rose while average transaction value fell, and transactions
moved more; it carried the rise". That is a characterisation of rows, the same
warrant `attentionLine` has had since V3, and it is why the composer may author
it at all. George's own prose is drawn beneath, lead sentence first, the rest
behind a disclosure.

**4. A spatial field was drawn whether or not position said anything.** The
default is now `ranked` — the conventional instrument, one row per subject with
its label, bar, figure and delta — and a plane must earn its second axis. The
test is structural: do the subjects fall into more than one QUADRANT of the two
driver changes? One quadrant means both drivers moved the same way for
everyone and a ranked list says it in one dimension. It reads the sign of a
change the tool computed and counts distinct quadrants; there is no threshold
and no arithmetic on a business figure.

The resting desk reads ONE metric, so it is ranked and always will be. The
plane appears for the three-read headline set when the estate's drivers
disagree — which is when it is worth two axes.

**5. Novel visuals needed explaining.** A plane now carries one line saying
what each axis means, what size means and what a click does. A conventional
drawing carries nothing, because a caption on a bar chart is noise. The ranked
view carries a one-line hint that shift-click compares, since a control nobody
knows about does not exist.

**6. Technical warnings dominated.** "105 of 256 compare row(s) could not be
compared... 56 no_baseline... NULL" was drawn at full size above the answer.
Caveats are now levelled by CONSEQUENCE:

| level | when | how it is drawn |
|---|---|---|
| answer_limiting | nothing comparable | whole, above everything, and says what still stands |
| relevant | some subjects excluded | one line in business words beside the answer |
| non_material | everything else | one quiet mark; detail in the inspector |

"56 products are new this week, so they are left out of the growth comparison"
replaces the statuses. A scan holds `baseline_status`, `no_baseline`,
`no_current`, `zero_baseline`, `NULL` and `row_count` out of the answer, and
the tool's own sentence survives whole underneath. UI rule 4 is unchanged —
this is its 2026-09-05 amendment, surfacing without spelling out.

A notice whose consequence cannot be read stays at `relevant` with the tool's
own words. Unknown consequence is not the same as none, and quietening
something we cannot read would be guessing.

**7. Past work disappeared.** The work trail is above the work: "The business →
What's going on with the stores? → Why? → Products". Each step is a question
and the desk it was asked from — both on the question's own post — so a step is
server truth and clicking one recomposes the workspace at that state. The one
step that is not stored is the one being made now; it is marked `current` and
becomes server truth the moment anything is asked. No transcript, no
localStorage, no client snapshot.

**8. George waited to be asked.** He now explains, recommends and asks.
Explain and recommend are DERIVED from trusted rows and the definitions'
ladder: a recommendation is produced only by one of four grounds
(`drivers_diverge`, `against_the_majority`, `ranked_first`,
`no_breakdown_yet`), names that evidence, and carries the action that performs
it. There is no path from an empty screen to a suggestion — a bare figure with
no measured change gets nothing, because localizing is a rung under a change.
Asking is the model's and is held by the PROMPT, not by a mechanism, and
`initiative.ask.enforced_by: prompt` records that rather than pretending
otherwise.

**One thing found while building it.** Whether a product breakdown EXISTS is a
question about the definitions, not about the headline metric: net sales is
transaction grain and refuses a product grouping, while the ladder localizes by
product through `product_revenue`. A client reading `meta.valid_group_by` would
therefore never offer the one move the ladder is built around. The desk
definitions endpoint now serves `breakdown_dimensions`, computed from
`metrics.yaml`, and the client decides nothing.

### What still is not George

- The `figures` fallback stage still draws through the old result primitives
  for anything the grammar cannot place — a time series, a mixed result.
- Inbox, Pages and Workflows keep the old chrome, so leaving the desk still
  feels like leaving.
- ASK is prompt behaviour with no mechanical check, exactly as recorded.
- The trail's step view is presentational: it shows earlier steps of the same
  surface, it does not re-derive the plan as it stood then.
- A replayed window is not re-read by George, and the desk does not yet say
  that the reading belongs to the earlier window.

## 6c. UNDERSTAND (2026-09-09, after the second human dogfood)

The workspace was coherent and still felt like a chatbot with charts. Thirteen
concrete failures were traced to root causes before any code was written; the
inspection is summarised here so a later reader can see what was actually
wrong rather than what was changed.

### What was broken, and why

| Reported | Root cause |
|---|---|
| follow-ups don't reliably work | the desk never called `open`, so history, `thread_id` and `parent_id` were all empty after a reload |
| repeated backend 500s | two raw statements in `get_chat` still selected `george.pins.page`, dropped by Page Workshop V1 — 11 of 11 calls failed |
| submitted messages not acknowledged | a live turn with no evidence composed to `statement`, which drew nothing, and the resting figures were dropped with it |
| broad questions return too little | the prompt's "SMALLEST SURFACE" rule governed every message, including "how are we doing?" |
| George waits to be told where to look | the same rule, plus no vocabulary for a message that is not a question |
| I cannot watch George work | the desk imported no activity view; the loop's per-call frames reached the client and were discarded |
| one chart dominates the answer | `attentionWords` joined a plural, per-subject, tool-derived list into one sentence under one drawing |
| chart labels overlap | labels were placed at a fixed offset with only a left/right flip |
| sidebar tabs map incorrectly | two hand-typed vocabularies for the same four destinations |
| date changes mix old and new | the ribbon moved on the click; the replay followed |
| new questions sometimes cannot send | the composer returned early while busy, and `ask` already cancels |
| analytics endpoint errors | the local dogfood database lacks `v_new_transaction_items_resolved`; legacy Operations only |
| frontend startTime undefined | unresolved — see below |

### The six stages

1. **Continuity.** `get_chat` reads the page title through the foreign key.
   `useDesk` opens the thread from `useThread`'s `chat` and `ready`, which
   existed for exactly this and had no caller.
2. **Presence.** Work with no evidence does not replace what is drawn; the
   resting read stays enabled while the focused work is empty; the
   instruction is drawn on the render after submit; one line says what has
   been read and what is being read; the composer never refuses a question.
3. **Understanding.** `surface.desk.context` declares a bounded channel for
   what is DRAWN, what was singled out and the move already offered. The
   grouping matrix is stated in the prompt from each metric's own
   `valid_group_by`.
4. **Breadth.** `investigation.scope` declares broad, focused and ambiguous,
   with the reads and the bound for each; `investigation.message_kinds`
   declares the five things a message can be besides a question. The
   minimalism rule is replaced. `MAX_TOOL_CALLS` does not move.
5. **Findings.** `findings.ts` unflattens the attention marks into 2-4
   per-subject findings, each with its ground, its own figures, a numeral-free
   reading and one next move. `drivers_diverge` is added as a third ground,
   read off the sign of two changes the tool computed.
6. **Coherence.** One navigation list. Atomic window transitions. Label
   deconfliction with a ranked fallback. The legacy `figures` path is named
   as a fallback. The History drawer reads the river only when opened.

### What is still not George

- ASK is prompt behaviour with no mechanical check, as recorded in V1.
- The `figures` fallback still draws through the older primitives; it is now
  labelled rather than passed off as the workspace's own drawing.
- Inbox, Pages and Workflows keep the old chrome, so leaving the desk still
  feels like leaving — though it no longer renames everything on the way.
- A replayed window is not re-read by George; the ribbon says so, and the
  reading still belongs to the earlier window until he is asked.
- The scope policy is prompt behaviour. It is held by contract tests and by
  the definitions, and its BEHAVIOUR needs the opt-in live evals to confirm.

### Found by the live dogfood: a group total was being summed in prose

The first live broad answer said "₱1.78m against ₱1.49m across the group". A
store-grouped read returns one row per shop and **no total** — verified against
the running tool: `meta` carries the window, the comparison, the row count and
the grain, and nothing that adds the rows up. So that figure was a sum
performed in prose, which architecture rule 9 forbids and which has no receipt.

It is a pre-existing gap — CLAUDE.md rule 9 has recorded since 2026-09-07 that
nothing checks prose numerals against rows — but broad scope makes the
temptation structural: a question about the business invites a business-level
figure, and the reads that answer it are per shop.

So the rule is stated where the breadth is decided. `group_by: []` is how the
estate's own total is READ, `investigation.scope.kinds.broad` records it, and
the SCOPE section says a group total is a read and never a sum. Re-run against
the live model, the summed figure was gone and every number in the answer was
one a tool had returned.

### The unresolved one

`startTime` appears nowhere in `frontend/src`. In the production bundle it
ships from exactly two places, both React 19.2.0's own: the scheduler's timer
queue (`timer.startTime`, guarded), and the performance-track
`estimateBandwidth` helper (`overlapEntry.startTime`, whose loop is bounded by
`resourceEntries.length`). Neither has an unguarded read that static reading
can fault, no application code ships the identifier, and the service worker
does not contain it at all.

**What would close it:** the browser console stack trace from a reproduction —
the frame that threw, and whether it appears with the service worker
unregistered and with React DevTools disabled. Without that, any change would
be a guess at somebody else's code.

## 7. Human dogfood

See the dogfood script in the milestone report. The environment is
[LOCAL_DOGFOOD.md](LOCAL_DOGFOOD.md), unchanged: local writable PostgreSQL for
everything George remembers, the guarded `george_ro` pooler for real Aji
figures, and the model key omitted unless `--allow-model` is passed.
