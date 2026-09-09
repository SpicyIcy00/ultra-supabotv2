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

## 7. Human dogfood

See the dogfood script in the milestone report. The environment is
[LOCAL_DOGFOOD.md](LOCAL_DOGFOOD.md), unchanged: local writable PostgreSQL for
everything George remembers, the guarded `george_ro` pooler for real Aji
figures, and the model key omitted unless `--allow-model` is passed.
