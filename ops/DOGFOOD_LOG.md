# Dogfood log — what is wrong with George

**This is where problems go.** Not the card list, not CLAUDE.md, not a
decision record. Something behaved wrong, it lands here, and it gets fixed
before any card about making things faster.

---

## How to put something in it

**Say it in chat, the moment you see it. Claude writes it down here.** You
should never have to edit markdown to report a bug — if reporting is work, it
stops happening, and then the plan goes back to measuring speed and assuming
everything works.

**Reporting is not fixing.** Saying it costs one sentence and does not derail
whatever session is in flight: Claude appends it here, confirms, and carries
on with its card. Fixing is a separate session. That separation is the whole
point — it is what lets you report immediately instead of saving things up
until the detail has gone.

    Log this: <what you did> — <what happened>          report, do not fix
    Fix this now: <what you did> — <what happened>      jump the queue

The four prompts, including the weekly sweep of the errors George records
about himself, are in `ops/NOW.md` section 2b.

Three lines is a complete report:

    what I did      "asked 'how are we doing'"
    what happened   "stuff came out but it just disappeared"
    what I expected  (only if it isn't obvious)

No severity, no priority, no reproduction steps, no labels. "It felt wrong
when I tapped the shop" is a valid entry. Vagueness is Claude's problem to
resolve by reading the code, not yours to solve before reporting.

## What happens to it

1. It is written into **Open** below, newest first, in your words.
2. The next session takes the **top** item, finds the cause, fixes it, and
   moves the entry to **Fixed** with the commit that closed it.
3. If the fix is bigger than about an hour, it becomes a card in
   `ops/NOW.md` section 3 — but still ahead of every speed card.

**The rule: no speed card is started while Open has anything in it.** This is
the rule the plan was missing. On 2026-09-12 the plan measured latency and
assumed correctness, and the owner found an answer-losing defect that was
already sitting inside a card labelled "make it fast".

Your words are kept verbatim. A session may add what it found underneath, but
never rewrites the report into engineering language — "stuff came out but it
just disappeared" is the evidence, and it says more than "answer state cleared
on compose frame" does.

---

## Open

### 2026-09-18 — found by the session: the sales record has no autumn 2024

Found building P2S.4 (year over year). `new_transactions` has every shop on
every day of August 2024 and of January 2025, and between them only **six
days**: 2, 3, 10, 17 and 24 September and 1 October 2024 — none in November or
December. So "last December against the year before" cannot be answered, and
any year-over-year read touching September–December 2024 compares against a
fragment. **George now says so** (P2S.4's record check refuses an empty window
and draws a notice over a partial one), so nothing is wrong on screen — but the
figures are missing. **Needs the owner:** a StoreHub transaction export for
2024-09-01 to 2024-12-31, if StoreHub still holds it. Fairview's first sale on
record (2024-10-01) and Magnolia's (2025-01-01) fall at the edges of the hole,
so either may have opened earlier than the record shows.

### 2026-09-17 — "its failing here" (an ordering system for the top 5 suppliers)

> *"its failing here"*

Said of the live build `634423e` with three screenshots of one turn, read back
from `george.posts` (14:57 UTC): *"lets building an ordering system for our top 5
suppliers"*. Four reads — suppliers by ordered value last 30 days, an unscoped
`get_purchase_plan`, suppliers this year, and a GZ aji mix plan that came back
empty — one composed block (a ranking of suppliers this year), and an answer that
stops before building: *"two of the top five are the same name spelled two ways"*
(KD kiss delicious / kiss delicous; Judy JUD001 / JU Judy aji mix), next *"Tell me
if kiss delicous is the same supplier … and I will draft the five plans."*

**What failed on screen, found underneath (not fixed):**

1. **George's own validator messages are drawn to the owner as caveats.** Above
   the headline: *"caveat: caveat is at most 320 characters — it is one thing said
   once (voice.reading.slots.caveat) — said. which ones"* and a bare
   *"header_total_mismatch"*. They are loop warnings — `reading_rejected` (his first
   caveat was too long and was refused) and `unsurfaced_notice` (naming a notice
   kind) — and the room's filter of process warnings (`data.ts` `PROCESS`) lists
   `composition_rejected`, `findings_rejected`, `restated_figure`,
   `misstated_figure`, `enumerated_remainder` and not these two, or
   `actions_rejected`. CLAUDE.md UI rule 4: raw diagnostics never reach the answer.
   Minutes to fix; the list should come from the definitions rather than be typed.
   **Fixed in `0c9376d`:** every `warning` frame arrives as `source: 'loop'` and
   none is drawn as a caveat (`render.turnNotices`).
2. **A figure that draws nothing.** READ 2, *"purchase plan"* — the unscoped plan
   read George did not compose, placed by the default board — shows only a "show"
   button and a read time: a table of more than eight rows opens collapsed when
   quiet. It reads as broken, and it is the largest thing on the left. **Fixed in `0c9376d`:** a
   folded table draws its first eight rows and "all N".
3. **The same point said three times on one chart.** READ 3 carries a sentence of
   his answer placed on it (*"On this year's spend GZ aji mix leads at ₱5.75M …"*,
   `beside.thoughtsOf`), then the notice, then the title *"Two of the top five are
   the same name spelled two ways"*, then his thought saying it again. **Fixed in
   `0c9376d`:** a chart that carries his own thought takes no sentence of the
   answer; the sentence stays in "more from George". Item 4 and what he did are
   still open; what he did is P2S.6.
4. **An offer drawn as a box inside the ranking** (*OPEN the most regularly ordered
   of the five, twelve documents this year ~1s*) between two rows.

**And what he did.** He was asked to build and did not: the data does not say who
supplies a product (321 of 596 selling products trace to no supplier), supplier
names are free text, and the biggest supplier's plan came back empty. Stopping to
ask about the duplicate names is defensible — merging suppliers is a judgement —
but he built none of the five while asking about two, and "an ordering system" is
the build arc (P3.d, the Seikyo acceptance test) that the room does not yet draw
as a thing being built.

### 2026-09-17 — "how are we doing … its not saying why and then it suggests me to ask why next"

> *"and look this is what it shows me when i ask how are we doing but this is
> basically a dashboard and its telling me what stores are down but its not
> saying why and then it suggests me to ask why next but it should be like that
> when i ask a question like how are doing, i except it to show me those things
> already plus simple times it gave me i shouldnt need to ask why, it has
> intiative, it really reads the data on its owm and forms its own opinions not
> just reading it back to me"*

Said of the live build `634423e`, with two screenshots of *"how are we doing"*:
three reads, all by store (net sales, transactions, basket), a headline that North
Edsa is carrying the shortfall on fewer transactions, asks *"Why is North Edsa
down?"* / *"Is Greenhills still losing both?"*, and *what I'd do next: "Worth
checking whether North Edsa's lost transactions are concentrated in particular
hours or days before treating it as lost demand."*

**Found underneath (not fixed), and it is his instructions doing exactly what they
say.** `SYSTEM_PROMPT`, HOW WIDE TO READ: a BROAD question gets *"net_sales,
transaction_count, average_transaction_value grouped by store over a closed
window, compared, at most 5 reads"* — so it stops at the estate by store. The
ladder that goes further (VERIFY → DECOMPOSE → **LOCALIZE** → explain) runs only
for *"TAKING A FIGURE APART … 'why', 'what happened', 'analyze' …"*. So on "how are
we doing" he verifies and decomposes (he did say *transactions, not basket*) and
is not allowed to localize — which is precisely the check he then recommends to
the owner as `next` and offers as a question to tap. **The owner's standard
(ops/STANDARD.md) is that he goes and looks on his own**; the rule was written for
speed and a small answer (P1 era), and it now contradicts the product. This is
also why P2S.3's shapes go unused (the entry below): the localizing reads — by
hour, by day, by product — are the ones those shapes draw.

**Two defects visible in the same screenshots, noted here rather than lost:** the
headline in the words column is shown from its middle (*"against the same point
last week, and it's transactions doing it:54² fewer …"* — its start is above the
top of the column, and a figure's superscript runs into the colon); and the
refused-replay line sits on top of the charts rather than under the message box.

**The two defects, in `0c9376d`:** the words column returns to its top when a
turn settles, and the space before a figure is kept ("it: 54"). The refused line
now closes (below). **The rest is card P2S.6** — BUILT 2026-09-18 as a restructure of the prompt's reading policy, unpushed, not verified live or by him — written 2026-09-17 and taken before
P2S.4.

**What a fix is, and its size.** A broad question climbs the ladder for what it
finds: the one or two shops that moved most get their drivers localized (hours,
days, products) in the same turn, bounded, and the answer says why — a view, not
a readback — with `next` left for what the reads could NOT settle. It changes what
he reads and says, so it is the prompt (1,797 of 1,800 words — something has to
give) and needs a gate run and likely the latency budget rethought (more reads per
broad turn). **A card, not a same-day fix.**

### 2026-09-17 — "its not using any new charts or displays, does it know it has access to those stuff now?"

> *"and also its not using any new charts or displays, does it know it has
> access to those stuff now?"*

Said of the live build `634423e`, the evening P2S.3 shipped.

**Checked against his own turns, read-only from `george.posts`.** Since the deploy
he answered *"make me a store dashboard"* with four reads, **all
`get_sales(group_by='store')`**, drawn as dumbbell, contributors, contributors,
dumbbell; and *"how are we doing"* with three store reads, drawn as contributors,
dumbbell, dumbbell. Given those reads, those are the right shapes by the new rules —
a compared set of shops IS a dumbbell. **So yes, he knows the shapes, and no, he
never gets to use them:** they are listed on the `compose` tool, which he reads
AFTER choosing what to read, and his instructions steer every broad question to
the same read — *"net_sales, transaction_count, average_transaction_value grouped
by store over a closed window, compared"*. A heatmap needs a read by store AND
hour, a calendar a read by day, a stacked bar store by category; nothing tells
him a dashboard (or a question about when / what it is made of / the rhythm of
the weeks) wants reads of those shapes. The P2S.3 gate saw the same: no new shape
unasked on four questions. **Not fixed.** The fix changes what he reads, so it is
the prompt (at 1,797 of 1,800 words) or the read-side tool descriptions, and it
needs a gate run — it is a card, not a same-day fix.

### 2026-09-17 — "this should stay where it is in everypage and should know context"

> *"this should stay where it is in everypage and should know context."*

Said of the live build `634423e`, with a screenshot of the message line (*say
what you mean · "why?" · "these two" · "last 90 days" · HOW MANY top 10 · not
what I meant*).

**Found underneath (not fixed), and it is CLAUDE.md UI rule 1** — *"George is on
every page, not a page you navigate to, and receives that page as context"* —
which the room does not keep. The message line is drawn by `Room.tsx` only, so it
exists at `/george` and `/w/:id` and nowhere else: Kept, Needs you and Running
(`RoomShell`) have no line, a kept page has its own different ask box at its foot
(P2S.3(g)), and the BI pages (Dashboard, Analytics, Warehouse …) have none. The
context half exists already — a page question carries `pageScope` / `pageContext`
— but only the kept page sends it. The fix: one fixed message line in a shared
shell for every screen, sending that screen as context (the page id on a kept
page, the screen's name elsewhere) and opening the answer in the room. **Bigger
than an hour** — it touches every shell and the BI `Layout` — so by §2b it
becomes a card rather than a same-day fix, unless he says to jump the queue.

**PARTLY FIXED 2026-09-19**, after he asked again in the same words: *"also
remeber the text bar should be global same spot everypage"*. The room's shell
now draws one line — no chips, no mentions, no voice, because nothing on those
screens is picked — inside `.r-line-wrap`, the board composer's own wrapper, so
it is the same shape in the same fixed place. It names the screen it was asked
from and opens the board, because an answer needs somewhere to land.

**WHAT IS STILL OPEN:** the BI pages (Dashboard, Analytics, Warehouse, Packing,
StoreHub exports is in Bob's chrome and has it) draw no line, because they are
in the other shell entirely; and a kept page still has its own different ask box
at its foot rather than this one. Two shells, one line, is the rest of the
card.

### 2026-09-17 — found by the session: a product chart names every row after its shop

Not reported by the owner; seen in the frames of the recorded gate turns
(`verification/frames/thoughts`). A ranked chart over `get_replenishment` rows
labels all fifteen rows **"Greenhills"**, and one over `get_attention` labels its
rows **"AJI BARN"** — the rows are products, each carrying the shop it is in.
`data.subjectOf` looks for `store` before `product`, so any row that carries both
is named after the shop. The bars and figures are right; the names are wrong,
and so would be the swatches, a tap to pick, and `why` on that row. **Not fixed**:
the fix is the dimension a read is grouped by (its `group_by`, or the tool's own
subject column) deciding which column names the row, and it touches every mark.

### 2026-09-16 — "the ui doesnt feel like what i was told we were building"

> *"1st. the ui doesnt feel like what i was told we were buidling:
> https://claude.ai/code/artifact/7d69541a-ab54-4cfc-b622-77be5c7679c4 , i find
> the widgets not good for what were building and i asked you before to steal
> good things from other market leaders but ours doesnt feel like this yet alot
> different. its charts feel very limited perhaps beacause of the widgets. the
> way it talks feels very limited too. i think also just the main way it
> arranges the things it outputs feels wrong."*

Said in answer to *"where is phase 2 going? cause theres alot wrong in the main
structure"*. **This is the FIRST item, by his own numbering, and it is a report
against the standard** — the Ideal UI is the screen every card was to build
toward (NOW.md §6). Four things in it, kept apart because they are four:
the widgets, the borrowings, the voice, the arrangement. Reviewed below in a
Fable session, against the artifact, before anything is built.

**REVIEWED 2026-09-16 (Fable 5.1), against the artifact, with production numbers.**

**The catalogue landed; the FORM did not.** The Ideal UI draws an answer as ONE
document in a 760px column: top line, the ask, tokens, the claim in serif, the
caveat, then evidence BLOCKS stacked down the page — each a sentence George
wrote, a chart under it, a source line under that — then next, then actions.
"Why is Rockwell down" is three such blocks. What is built is a reading on top
and a dashboard under it: tiles in a 1320px column, packed. Six marks, three
slots, receipts, tokens, `@`, row actions, ghost text — all present. The
container is not. A tile is a peer in a grid; a block is a paragraph in an
argument. That is his fourth point and it is upstream of the other three.

**And the two fixes shipped this morning went the wrong way**: the room was
widened to 1320 and tiles put side by side; the approved design is 760 with
blocks one under another. Fixed against the report, not against the standard.

**Half of what is on the board is not George's.** Last 27 answers in
`george.posts`: George put 43 blocks (41 carrying a claim); the surface
default-composed 44 (`default_blocks`). A default tile has no sentence, no
emphasis, no `because`; its title is the measure name. Both charts in his
screenshot were defaults — that turn George composed one `change`.

**The talk is capped by a rule.** Three short sentences once figures are
drawn; a block claim is "a few words, no digits". The Ideal finding is the
claim + caveat + a full sentence on EVERY block + next: seven or eight
sentences per investigation, each tied to the chart under it. P2.m opened the
number of reads; it did not touch the form of what he says.

**Borrowings: ~14 of 24 are in the code.** Missing are the ones that make it
feel like the products named: "one sentence + one small chart as the unit of
evidence" (Borrowed II #18), "the chart title is the claim" (#11, true only
for the composed half), and all of Phase 3 (#5–9, #14, #22).

**Recommended: one card, ahead of P2.h/i/j — draw the finding as designed.**
Objects become evidence blocks inside the finding column at the mockup's
width, each titled by George's sentence; a read he did not compose gets its
sentence (compose titles every read it shows) or is drawn as a quiet appendix,
never a peer tile. Not a rebuild: marks, slots, receipts, tokens, actions stay;
the container and the width change. Take it with P2.k. One full run.

**And a standing change to how sessions close:** every surface close-out names
the Ideal UI scenario it matches and where it does not. Nine cards shipped
without that line, and this entry is the bill.

### 2026-09-15 — a comparison that drew no comparison

> *"when it compares it didnt generate any charts or anything"*

**There WAS a chart, and reading the answer he actually got is what found the
real defect.** Read out of `george.posts`, his turn composed:

    {"kind": "dumbbell", "seq": 0, "weight": "lead",
     "claim": "Both selected shops gave back basket value in August",
     "emphasise": "Magnolia"}

over `get_sales(average_transaction_value, group_by=store,
compare_to=previous_period, last_month)` — **no store filter, seven rows**.

**`emphasise` took ONE name.** He compared two shops, the grammar let him
point at one, so he lit Magnolia, cooled Greenhills with the other five, and
wrote "Both selected shops" as the claim — a sentence the drawing could not
support. The comparison went into the prose instead (*"Greenhills' basket
slipped 1.7%… Magnolia's 5.4%"*), which is figures in sentences because the
picture had nowhere to hold them.

**Fixed: a block may emphasise the two or three rows a claim is about.** One
name is still stored as a string, so every board made before today draws
exactly as it did; past three it is refused, because lighting most of a chart
emphasises nothing. Six backend tests and five renderer tests, three of which
fail without the change.

**WHAT THIS DOES NOT DO, AND HE SHOULD SAY WHICH HE WANTED.** The chart still
draws all seven shops, with the two he picked lit. It is not a chart of only
those two. George read the estate — the desk line already tells him *"read
for these subjects by name"* and he read every shop anyway — so scoping the
READ to a selection is a separate question and is not answered here.

### 2026-09-15 — "compare" still did not compare, so the shortcut was removed

> *"compare still doesnt work, it just puts it here which i dont need so
> remove it and make sure next push it can actually can compare"*

Said of the build where the token had just been fixed to draw the two shops'
NAMES — `Greenhills, Magnolia` — rather than their ids. **That is what settles
it: the label was never the whole of it.** The gesture worked and still said
nothing, because narrowing a chart to two shops makes no claim ABOUT them,
and "compare" asks for something said. The standard's feature 7 is *"Select
two stores → Compare these"*, and what it asks for is an answer.

**Removed, both halves, at his word.** `selection.comparison` is gone from
the definitions and the branch is gone from `Room.tsx`; the shop token is
gone from `surface.desk.tokens.arguments`. Nothing replaced either — with
subjects picked, a short instruction already falls through to George with
them attached, so **the absence is the behaviour**. Three contract tests that
held the old rule now hold that it stays gone, and the room's own assertion
reads the shipped yaml rather than a fixture, because a fixture asserting
about itself would pass while the real definitions grew it back.

**The trade, stated rather than hidden:** it was 528 ms and no model turn; it
is now an ordinary turn, ~17 s. Speed that communicates nothing is not a
feature, but the seconds are real and this is where they went.

**Window, grouping and count tokens stay.** He pointed at the shop one, which
is the one "compare these" wrote into. If the other three should go too it is
one line, and it is his call, not a session's.

**NOT VERIFIED BY ANYBODY.** No session has seen two shops picked and
"compare" asked on a live build, and the suites cannot see it: what George
says about two shops is behaviour, and behaviour is held by the evals. This
is the second time this feature has been reported fixed — it is not fixed
until he says so.

### 2026-09-15 — the Page view does not say what it is for

> *"this is page i dont really know what its supposed to do"*

P2.a. It draws WHAT WOULD BE KEPT and WHAT WOULD NOT BE, AND WHY — correctly,
by the look of it — and never says that this is a preview of a page it has not
written yet, or what pressing anything would do. A screen whose first job is
to be understood before you commit to it is failing at exactly that.

*Found by the session underneath:* the not-kept list repeats "how are all
stores doing?" three times and "how are we doing?" twice, each with a
different reason, which reads as a bug before it reads as a list of turns.

### 2026-09-15 — what do you remember only half works

> *"what do you remember kinda works i guess"*

The memory draws: six views, each with its stance, *learned 9/13/2026 · from
get_sales · carried into 2 questions · unconfirmed since new data landed*, and
a FORGET on every one. What "kinda" covers is not established and the session
did not ask him to be more specific in the moment. **The half that is known
not to be tested is the other one**: whether telling him "we means the shops"
once changes the next answer. That is the card's own done-when.

---

## Fixed

### 2026-09-19 — "what does this chart mean and is it a bug its showed up like this in multiple answers?"

> *"what does this chart mean and is it a bug its showed up like this in multiple answers?"*

The attention read, drawn as VALUE · CHANGE PCT · RANK · SIZE · UNIT over
seventeen rows, of which two carried a value and fifteen drew an em dash. The
rank column was drawn in pesos — `₱1`, `₱2` — and nothing named what any row
was about. It is the same defect as the 2026-09-19 entry above it, which
reported the tool's identity strings; the columns changed, the table stayed
unreadable.

**Fixed 2026-09-19. Three faults, all in `tableShape`:**

1. **The columns were read off `rows[0]`.** `get_attention` returns rows of
   three shapes — a shop whose sales moved, a product that went out of stock,
   one that went dead — sharing only `subject`, `rank` and `size`. The first
   row's private fields were advertised as columns for all seventeen. The
   keys are now the union over every row.
2. **A column most rows cannot fill is not drawn at all.** Once the rows are
   of more than one shape, the table draws what they have in common; a column
   only two of them carry reads as a measurement that came back empty rather
   than one that was never taken. Where every column is whole — nearly every
   read — nothing changed.
3. **The tool's machinery was eligible to be a column.** `identity`,
   `section`, `floor`, `measure`, `source` and `threshold_applied` joined
   `NOT_A_COLUMN`, and `subject` got a rank so it stops losing the
   five-column cap to fields nobody can read.

And the row's unit is applied per COLUMN now (`unitFor`), so a rank is a rank
and not money. `src/room/tableShape.test.ts`, 10 tests, built on the real row
shapes read from the live tool.

**Still open, deliberately:** the attention read draws `subject · rank · size`,
and `size` is the tool's word for "how big the thing that crossed its floor
is" — ₱13,350 on one row and 5 on the next, each correct, the header jargon.
Attention is three different measurements in one result and wants its own
drawing rather than a table. That is a card.

### 2026-09-19 — "why is there a scroller on this chart when theres clearly space on the right"

> *"also why is there a scroller on this chart when theres clearly space on the right if it needed to be bigger"*

A stockout read — store, days out of stock, current stockout run, longest
stockout run — drawn in half the figures area, cut off at the right with a
scrollbar, while the other half stood empty.

**Fixed 2026-09-19.** `needsWidth` asked whether a table had more than four
columns. This one has four, and sixty characters of heading. It now measures
what the columns NEED: each column is at least its heading and never narrower
than the figures under it, and past what fits across one of the two figure
columns the table takes the whole area instead of scrolling inside half of it.
Four short columns still sit in a column, as they always did.

### 2026-09-19 — "i dont need to see it reading"

> *"also it i dont need to see it reading maybe a more cleaner way like 1 reading sales with progess and secounds and then done and then another just do whats optimal and ideal and simple"*

Eighteen lines of `read sales · 7 rows · 192ms` down the side of a turn.

**Fixed 2026-09-19.** The trail draws the read happening now — or the last to
land, if none is running — and one quiet count of what is behind it ("7 reads
done"). A log is something you read afterwards; what a person waiting needs is
what is happening now and how long it has taken.

**A REFUSAL IS NOT PART OF THE LOG THAT WENT.** A read that declined stays on
screen however many have gone past it: it is the tool saying, in its own
sentence, that it will not produce a misleading number. Nothing else is lost —
every read's rows, timing and receipts are on the figure it produced, which is
UI rule 3.

### 2026-09-19 — "default should be aji ichiban not all not vending"

> *"also default room should be aji ichiban not all"*

**Fixed 2026-09-19.** `surface.desk.estate.default` is `aji_ichiban`.

**AND THE HARD HALF, which would have made this a lie on screen.** "The
default" and "the part that narrows nothing" were the same part, and three
places read the default to mean "nothing travels" — `estateFor` in the room,
`_estate_words` in the surface, and the endpoint's own docstring. Had those
kept reading the default, the board would have drawn his shops' pill over
answers that had counted the vending business. The part that means everything
now says so (`everything: true`) and that is what all three read. The estate
tests assert the invariant directly: the pill and the scope never disagree.

### 2026-09-19 — "disclaimers can be hid and you can open it if you want to see it"

> *"disclaimers can be hid and you can open it if you want to see it"*

**Fixed 2026-09-19.** Two or more notices fold to one line — "2 notes on these
figures" — in the place the notices were, and open on it.

**WHAT IS NOT GIVEN UP.** UI rule 4 draws a notice that says a figure may be
WRONG, above the figure, and this still does: a person cannot look at the
number without seeing that something qualifies it. What folds is the words.
One notice stays open, because folding a sentence behind a word nearly as long
saves nothing and costs a click.

### 2026-09-19 — "when hovering some are cut it should not"

> *"also when hovering some are cut it should not"*

**Fixed 2026-09-19.** The figures area clips horizontally — it must, or a wide
mark would spill into his words — and the tip was centred on the mark, so one
near the left edge lost its first characters. `anchorFor` hangs the tip from
whichever edge it is near and centres it everywhere else, which is how the
design draws it.

### 2026-09-18 — found by the session: the memory figure prints a stance as its raw name

**Fixed 2026-09-19.** `judgment.stance_words` names all seven — *Noticed*,
*Checked*, *Still open*, *Cannot see*, *Waiting*, *You told me* — the memory
read carries `stance_said` beside the stance, and the room draws the word,
falling back to the key where the file names none. The CSS no longer
uppercases it: the transform was there to hide an enum's underscores, and
uppercasing a word turns it back into a label.
`tests/test_stance_words_contract.py` fails if a stance goes unnamed, if a
word is its own key, or if the uppercase comes back.

### 2026-09-18 — found by the session: five live tests fail on HEAD

**Fixed 2026-09-19.** The four in `tests/golden.py` filtered on the literal
`"Shang"`, which stopped resolving when the shop's display name became
"Shangri-La" on 2026-09-10; they read the name out of `stores.active_retail`
now, so the next rename moves them with it.
`test_comparison_live.py::test_the_comparison_words_are_the_definitions_and_the_shop_is_a_replay_scope`
read `surface.desk.selection.comparison`, which went when the "compare"
shortcut was removed on 2026-09-15 — it asserts the block is absent and keeps
the half that is still true, that a subject travels by id. All five run green
against the live database.

### 2026-09-19 — "get rid of this" (the cold open's "Morning. / What are we looking at?")

> *"get rid of this"* — a screenshot of the greeting and its line.

**Fixed 2026-09-19 the same hour.** The cold open draws nothing: no greeting,
no line, no suggested questions. Only the loading state ("Opening…") still
draws, so a thread being opened is never mistaken for an empty room. The
`greeting()` helper and the two `.r-greeting` rules are gone (`Room.tsx`,
`room.css`). Front end only. vitest 986, tsc clean.

### 2026-09-18 — "it does feel slow and really rough, it didn't feel like it was investigating"

> *"Its does feel slow and really rough, It didn't feel like it was investigating, Is there ways to make this better in the way it works and uses tools or something?"*

Said after P2S.7 (`4338529`) was pushed. The recorded runs agree on the slow
half: in `verification/p2s7-gate-2.json` a broad turn took 85 s in 5 model
rounds, the morning 84 s in 6, "analyze tradsnax" 117 s in 7 — about 17 s a
round, each one thinking at high effort before the next reads can start. Not
yet diagnosed on the live build.

**Fixed 2026-09-19 (the speed fix), measured on one live run
(`verification/speedfix-v2.json`, $3.50):** median answer 76.6 s → 24.3 s over
the fourteen questions, $0.34 → $0.25 a turn, 8 → 11 of 14 passed. Six
changes: effort back to medium for follow-ups and fresh questions (the ladder,
broad questions and building stay high; "analyze", "investigate", "compare"
now open the ladder); a figure in prose that no read returned is said exactly
when one read explains its rounding, else bought one rewrite, else removed with
its sentence (`voice.grounding`); an ask or an action refused no longer costs a
rewrite round; an unknown block field is dropped instead of refused, a typed
figure still refused; one round for the drivers after the verify; the eval
harness keeps an api_error's reason from the gaps log. Held by
`tests/test_grounding_gate_contract.py`. What is still slow: "analyze" (127 s,
7 rounds) and the order draft (108 s) — building and digging at high effort.

### 2026-09-18 — found by the session: rounded ranges in his prose that no tool returned

In the P2S.✓ full run (`verification/p2sclose-v2.json`) three answers carried
figures no read returned: *"₱28,000–36,700"* and *"₱13,500–21,000"* as the run
of days, and *"₱6,569 down to ₱398"* for a product — each a rounding or a
pairing George did in prose over day rows (rule 9: a figure in prose has no
receipt). The board's figures were fine; the sentence was not. Likely P2S.6's
reading policy (initiative over the rows), not bisected. In the same run
`analyze tradsnax per store` had a notice forced into the answer and `run it
every monday at 6` died on an `anthropic.APIError` after four rounds, detail
lost because the harness stubs the gaps log; and the `cannot` check's regex
does not recognise *"I don't have footfall"* as saying what he cannot tell —
the check is stale, not the answer. Not fixed: the close.

**Fixed 2026-09-19 (the speed fix).** The loop now runs the eval's own
matcher on the answer (`agent/prose.unreturned_prose_figures`): a rounding one
read explains is replaced by the read's figure with no round trip, what no read
explains buys one rewrite, and what survives goes with its sentence or is named
under the answer. On the live run the three rows passed; a fourth ("how are we
doing", "₱27,000–48,000" over drawn days) was an echo the misstatement gate
had given up on, and the repair now takes those too. The api_error's reason is
kept in the report; the `cannot` check recognises "I don't have" and "we don't
count". Still open in that run: one threaded answer cited no figure at all.

### 2026-09-18 — found by the session: a tool call missing a required argument breaks the whole answer

Found running the owner's Sonnet 5 trial (*"Trying using sonnet in one of your
tests and let me know how it goes"*): 3 of 7 turns ended in "Something broke on
my side". Underneath, every time: `TypeError: get_sales() missing 1 required
positional argument: 'group_by'`. The model called a read without an argument
the schema marks required, and the loop called the Python function anyway, so
the exception killed the turn instead of going back to the model as a tool
error it could correct. Opus 5 has not tripped it in any recorded run; any model
can.

**Fixed 2026-09-18 (P2S.10's session), not seen live.** Every read, write and
workflow call is checked against its tool's signature before it runs
(`loop._unfit_arguments`); a missing or unknown argument comes back to the model
as an error result naming it, in the words of `failures.reads.arguments`, and
he can correct it next round. A name no tool has is refused the same way
instead of raising. A `TypeError` raised INSIDE a tool is still a bug and is
not dressed up as a wrong argument. Five tests in
`test_read_failure_contract.py`, one of them the whole turn surviving.

### 2026-09-18 — "no not on top and before of the charts with the charts thats it related to … i dont want it to get to crowded"

> *"no not on top and before of the charts with the charts thats it related to. and if its not related then it can go under the blob. read the text its showing could they be with the charts instead? or whats another way i dont want it to get to crowded"*

Said of `589af9f` with five screenshots: whole answers stacked above one chart,
"Three." alone, bold headings cut from their lines, `*number*` printed.
**Found:** `589af9f` gave everything no chart took to the lead chart, ABOVE it.

**Fixed in `56b40d2`, not verified by him.** A sentence about a
chart is drawn UNDER that chart; one about no chart is under him; a repeat of
what is on screen is not drawn. A heading or lead-in goes wherever the line it
heads goes, and `*x*` is emphasis, never asterisks. `wordsOnCharts` is deleted.
**Not solved, and said:** most of his sentences about a chart carry no numeral
("Second week running that its tills stay busy"), and "about this chart" is
matched by the figures a sentence cites — so those stay under him. The fix
that removes the crowding is upstream: George writes his words about a chart
into that chart's thought and keeps the answer to what no chart shows.

### 2026-09-18 — "theres still alot of text on the left … that should only be the headline and suggestions what to do next"

> *"also theres still alot of text on the left remeber that should only be the headline and suggestions what to do next and stuff like thaat like i dont want it tell me what i tihnks about data with charts cause that should be with those charts simple logic you know"*

Said with a screenshot of the live build: under the headline, a long run of his
analysis (Dikiam Sweet Taiwan's shops, Greenhills' restocking, 1,854 dead lines).
**Found:** `5b40454` had drawn the whole rest under him, and `f13df40` only
removed repeats — what no chart took, and his caveat, still sat on the left.

**Fixed in `589af9f`, not verified by him.** Under him now: the
question, the headline, what he'd do next and the questions to tap. His reading
of the data is on the charts: each sentence on the chart it cites, and what no
chart took, with his caveat, on the chart the headline rests on (the one his
claim cites, else the one he weighted lead, else the first he drew). Only a turn
that drew no chart keeps them under him. `wordsOnCharts` in `beside.ts`, held by
`trackBack.dom.test.tsx`; frame-checked at 1440.

### 2026-09-18 — "i dont like how alot of text is grey … dont desaturate or lower other things to emphsize something else"

> *"also i dont like how alot of text is grey if it says something in a chart it should already be white just use other methods to emphasize things you want to dont lower others like maybe color to hightlight it just dont desaturate or lower other things to emphsize something else"*

Said with three screenshots: two chart thoughts, and the words under him on the
live build. **Found:** his prose was drawn a step or two below the headline
everywhere — chart titles and thoughts, the rest, the caveat (`--ink-2`), his
narration (`--ink-3`) — and emphasis worked by DIMMING: every row he did not
point at at 75% (`COOL`), the grammar's shapes at 28%, table rows at 40%, a
ruled-out figure at 55%, a quiet tile at 86%. The third screenshot's `- ` mid-line
is the pre-`f13df40` build; the new one strips the marker but ran list items
into one paragraph.

**Fixed in `f7335f1`, not verified by him.** Everything George says is `--ink`;
nothing is drawn at reduced opacity for not being the point; the row he points
at gains a band of his own colour (`--george`) with its name in weight and its
swatch ringed; list items and paragraphs under him stay lines. Grey is left to
labels, axis ticks and read-times — the frame, not his words. Held by
`ink.test.ts`; frame-checked at 1440.

**And the band was refused the same day.** Three screenshots of the live
`f7335f1` build — the lit rows of a bar chart, a dumbbell and a stock table —
and *"wtf happend here dont do that"*. On the dark ground the `--george` band
read as grey slabs, and neighbouring lit rows stacked into one. **Removed**:
the row he points at keeps its weight and ringed swatch, nothing behind it, and
nothing else dimmed; `ink.test.ts` now fails on any background or shadow on a
lit row.

### 2026-09-18 — "if its stating whats already stated or shown in the page … then dont make it say that"

> *"ok what is more from george text tho we just fixed? if its stating whats already stated or shown in the page (meaning charts section) then dont make it say that"*

Said of `5b40454`, which drew the rest of his words under the headline. **What it
was, read against every recorded answer:** the whole body of the answer. Every
chart he draws carries its own thought, and a sentence citing a chart with a
thought was deliberately left "with the rest of his words" (2026-09-17) — so no
sentence was ever placed, and the rest restated the charts and closed on his
`next` word for word. **Found underneath:** a sentence citing a read he did NOT
draw was placed on a chart that did not exist, and vanished.

**Fixed in `f13df40`, not verified by him.** Under him now is only what the
screen does not already say: no sentence citing a drawn read, none restating
the headline, `next`, an ask or a chart's title or thought, none carrying on
from or leading into one that went ("So…", "Where it sits:"); the caveat loses
what the answer says, even across two or three sentences. A sentence about an
undrawn read stays. On the current prompt's recorded answers, "Why was North
Edsa up" goes from 47 words to 10, "What should I look at today" from 213 to
124. Held by `trackBack.dom.test.tsx`. **Still through:** the same point in
different words — "Nothing counts people through the door" beside the caveat's
"There is no door counter" — is not caught; it compares words, not meaning.

### 2026-09-18 — "it stops too early … whats more from george? why is it hiding? … i should see what i ask … a track back feature"

> *"but some small changes it stops too early. it should stop almost right before the text bar. also whats more from george? why is it hiding? theres more space it can reach the end of where the blob reaches. i should see what i ask too like around the area of the blob just something small and also be a track back feature i dont know whats the best way to do it but when you can go to your last question and its last resutls"*

Said of the live build with three screenshots (a replenishment answer, "Yes — but not the engine."). Fixes to the room as it is — the UI freeze of the same day is on redesign, not on these. Found underneath, not fixed:

1. **The figures and words stop 150 px above the bottom.** `.r-beside` pads its
   bottom by 150 px (`room.css`), while the message line needs about 90. Stop
   them just above the line.
2. **"more from George" hides his words on purpose** — the 2026-09-17 rule put
   only the headline and asks under the mark and the rest one tap away. With
   the column's height free, show it all, down to the line, scrolling in place.
   **And a real bug under it:** the opened text prints markdown raw
   (`**Three.`) — the "rest" part is not rendered as the headline is.
3. **His question is nowhere on screen.** A small line near the mark: what he
   asked, in his words.
4. **No way back to the last question.** Decided here, not asked: arrows on
   that question line step to the previous question and back, redrawing its
   words and charts exactly as they were from the stored turn — no new model
   call, no cost — and "latest" returns.

**Fixed in `5b40454`, not verified by him.** All four, as found:
1. The room's foot is 86 px, not 150: the words and the figures stop 12 px above
   the message line.
2. "more from George" is gone; his caveat and every sentence no chart took are
   drawn under the headline, the column scrolling in place. The `**Three.` was a
   bold span across two sentences, cut from the raw text so each half kept one
   marker; sentences are cut from the unmarked text now and his emphasis is drawn
   in weight — on the chart thoughts too, which had the same bug.
3. "YOU ASKED" and his question, small, at the top of the words under the mark.
4. ‹ › on that line step to the previous or next answer; the board is rebuilt
   from the stored turns up to it, so no model call and no read; "latest"
   returns, and asking (or a new answer) returns to the newest.

Held by `trackBack.dom.test.tsx` (8 tests). Frame-checked headless at 1440
(`ops/frames.py`) for 1–3; the fixtures hold one answer, so no frame shows the
arrows. Still open: when the chips above the line are showing, they sit over the
last 30 px or so of the words, where the column fades.

### 2026-09-17 — "down arrow should be in the center of the charts"

> *"and down arrow should be in the center of the charts."*

Said with a crop of the figures area's down arrow. It is drawn at the area's
right edge (`.r-arr { right: -6px }`, P2S.1, copied from the design's
`arrows()`); he wants it centred under the charts. **Not fixed**; a CSS change
to `.r-arr` in `room.css`, minutes.

**Fixed in `0c9376d`, not verified by him:** `.r-arr` centred on the figures area; held by `ownerReports.dom.test.tsx`.

### 2026-09-17 — "this stays its not closeable"

> *"That change cannot be made to this read. The figures have not moved. why"
> — and this stays its not closeable.*

Said with a crop of the line under the message box. It is the refused-replay
line (`refusalForPerson`, drawn by `Composer` from `Room`'s `refusal`). It is
cleared only by asking a question, starting another replay or opening another
thread (`setRefusal(null)` in `Room.tsx`) — there is no way to dismiss it, so a
refused chip or fragment leaves it under every later look at the board. **Not
fixed**; a close control and clearing it when the board changes, under an hour.

**Fixed in `0c9376d`, not verified by him:** the refused line has a close (×); held by `ownerReports.dom.test.tsx`. It still sits over the figures while open, as a popover above the message line.

### 2026-09-17 — "why is there 2 thinkings it should only be around the blob"

> *"also why is there 2 thinkings it should only be around the blob and should
> be more in depth on what its doing with progess per thing its running but
> just small."*

Said of the live build `634423e` (P2S.3), with a screenshot of a turn in
progress: a list at the top of the figures area (*1 read sales · 7 rows · 99ms,
2 read sales …, kept what he now thinks 16ms … 38s*) and, under the mark, *kept
what he now thinks · thinking… 38s*.

**Found underneath (not fixed).** Two components draw the same stream while he
works: `Working` (the step list, `Room.tsx` in the figures area, `busy &&`) and
`Doing` (one line under the mark, added 2026-09-17 when the owner asked for "a
line under the mark while he works"). Neither knew about the other. The fix his
words describe: one place, under the mark — `Doing` becomes the small per-step
progress (each read, its state, rows and time), and `Working` stops drawing in
the figures area. About an hour; `working.dom.test.tsx` and
`visibleWork.dom.test.tsx` hold the trail today and move with it.

**Fixed in `0c9376d`, not verified by him:** the trail over the figures is gone; `Doing` draws it under the mark — each step with rows and time, small — and a foot saying reading… or thinking… beside the clock. Held by `ownerReports.dom.test.tsx`; no frame of a turn in progress exists, because the frames harness draws a finished turn.

### 2026-09-17 — "we need more text with each chart if needed explaination with the visuals"

> *"the text should reach the end of the alive where it can move not its
> borders and text can be scrollable if its too long but also i think we need
> more text with each chart if needed explaination with the visuals. and what
> are these disclaimers? what is baseline is something wrong"*

Said 2026-09-17 of the live build `c288831`, with three screenshots of one
Shangri-La turn ("the basket moved into the weighed mix"): the whole room, a
caveat over READ 1, and the words column under the mark.

**Found underneath (not fixed), and it is the Fable review of 2026-09-16 again.**
A figure carries one line George wrote — a block `claim`, "a few words, no
digits" (P1.f) — and a read he did not compose carries none. The design's
figures carry a sentence of reading each (`say` per block). More words per chart
changes the compose grammar and the prompt, so it is **P2S.3's** to decide with
its eval subset, not a room fix; it is written here so that card reads it.

**Fixed, in two steps, and not verified by him.** `c6226ee` gave every block
George composes a `thought` — a sentence of what the chart shows, drawn beside
it — and questions to tap under the headline; P2S.3 (`eeb7c7d`, `3af501e`,
`dbf9dac`) closed the card this was written to, with the shapes to carry it. A
read he did not compose still carries no thought.

### 2026-09-17 — "these things keep getting slightly cut we cant accept that"

> *"also look these things keep getting slightly cut we cant accept that"*

Said with five crops of the live build: the store dots at the left edge of
ranked and contributors rows, the ringed dot of the row George pointed at cut
flat on its left.

**Found and fixed the same day, and now MEASURED rather than looked for.** The
dot sat inside the name's box, and the two-line name clamp (added that morning)
needs `overflow: hidden` — so the box clipped the dot's left edge and the ring a
lit dot wears. The figures area also clips horizontally with no room for a ring
at its edge. The dot is now a sibling of the clamped words, the name box has room
on every side, the figures area keeps 8px inside its clip, and the dot is centred
on the first line at any font size. **`ops/frames.py` now measures it:** every
dot, ring, segment, bar, figure and label inside a figure is checked against each
ancestor that clips (`clipped` in measure.json), and `--lit NAME` draws the
ringed case. On the code before the fix it reads **3 clipped** (the ringed OPUS
dots, `verification/frames/clip-before`); after, **0 on all ten frames**
(`clip-after`, `clip-after2`). **Not verified by him.**

### 2026-09-17 — "we also dont need anything of these anymroe"

> *"we also dont need anything of these anymroe"*

Said with two screenshots: the line above the composer, *"tap anything above to
bring it here, then say what you mean"*, and the thread header — *KEPT AS Estate
Week · Talk · Behind it · Replay · Page* and *2 reads · 4 tools · 2 caveats ·
behind it*.

**Done the same day, and it is a removal of features, so what went is named.**
The hint, the header, the four views and the work line are deleted with their
code and tests (DECISIONS.md, same date). Lost: Replay, Behind it, and the Keep
as page button — keeping a thread is by saying so to George. Each figure's
receipts still open in place under it, and a figure in his words now scrolls to
its figure. Seen in `verification/frames/noheader`. **Not verified by him.**

### 2026-09-17 — "why are these bars diiferent size depending on the size of the name?"

> *"why are these bars diiferent size depending on the size of the name? shoudlbt it be standard ?"*

Said of the live build `315b59d`, with six screenshots of ranked and contributors
charts: a transactions change per shop, basket value per shop, products at
Shangri-La, categories at Shangri-La.

**Found and fixed the same day.** Every row of a mark was its own CSS grid, so
`fit-content(40%)` sized the name column to THAT row's name: "Tong Garden Salted
Broad Beans 500G" pushed its bar right and shortened it, and a diverging chart's
zero line moved row to row — a chart read down its bars could not be read. The
track list now lives on the mark (`.r-mk-dumbbells`, `.r-mk-ranked`,
`.r-mk-contributors`) and every row and the scale take it by `subgrid`, so the
widest name sets the column once. Held by `palette.test.ts`; seen in
`verification/frames/subgrid/draw-1440-open-room.png` (every track starts and
ends at one x). **Not verified by him.**

### 2026-09-17 — "it still feels like the charts and stuff are still in boxes and grids"

> *"we dont need those disclaimers, and also all charts dont need to be the
> same size or small it should decide based on the space it has and how
> important it is to make it bigger beacuse it should have his ai thoughts with
> the charts to aside from the text below alive its more of like the bigger
> picture get it? it still feels like the charts and stuff are still in boxes
> and grids but we dont want it like that"*

Said 2026-09-17 of the live build `c288831`, right after the answer about
what "baseline" meant.

**The complaint, restated (NOW.md §1: his prompts are complaints, not designs).**
Every figure is the same width in an even column grid, so the answer reads as a
dashboard of equal tiles rather than one picture with a point: the figure the
claim rests on does not dominate, and the figures carry no reasoning of their
own — his thinking lives only in the words under the mark.

**Found underneath (not fixed).** P2S.1(c) ported the design's `place()`
exactly: 1 / 2–4 / 5+ figures → 1 / 2 / 3 equal columns, each figure into the
shortest (`beside.columnsFor`, `placeFigures`), held by `layout.test.ts`. A
block's `weight` (`lead` / `supporting` / `quiet`) exists and changes nothing
about a figure's size since P2S.1 removed the lead row. So "boxes and grids" is
the column grid itself, not a border — the borders went in P2S.1. **This moves
past the design page** (his rows 6 and 7, *"fill it"*, *"left to right then
down"*, were answered with that grid), so the session that takes it decides the
new rule and says why, and he reacts to the frames — he is not asked to design
it. The size rule must come from values the answer carries (the block's
`weight`, whether the claim cites the read, how many rows it draws), never from
a guess. The "his ai thoughts with the charts" half is the entry below this one
("more text with each chart"), which is P2S.3's.

**Fixed 2026-09-17 (`def5956`, `2489425`).** The figure his claim cites (else the block he weighted `lead`) goes first and reads larger, and spans the whole figures area when it has rows to spread; the rest flow in at most two columns. Held by `beside.test.ts` and `room.dom.test.tsx`; seen in `verification/frames/fixes-0917b`. **Not verified by him.** The sizing is two steps (lead, the rest), not a continuous scale.

### 2026-09-17 — "we dont need those disclaimers"

> *"we dont need those disclaimers, and also all charts dont need to be the
> same size or small it should decide based on the space it has and how
> important it is to make it bigger beacuse it should have his ai thoughts with
> the charts to aside from the text below alive its more of like the bigger
> picture get it? it still feels like the charts and stuff are still in boxes
> and grids but we dont want it like that"*

Said 2026-09-17 of the live build `c288831`, right after the answer about
what "baseline" meant.

**A rule is in the way, so this one is HIS to decide, and nothing was changed.**
CLAUDE.md UI rule 4: *"Notices always surface … A caveat may be reduced to one
line naming it, explanation on tap, but wherever a figure is ANSWERED it stays
whole and ABOVE the number."* Removing them breaks that rule, and CLAUDE.md
says a task that needs a rule broken stops and asks. What the rule already
allows, and what the session proposes by default: every caveat becomes **one
short plain line** above its chart (*"110 of 173 products have no change to
show"*), the rest on tap — no status keys, no timestamps, no box — which is also
the fix for the entry *"what are these disclaimers?"* below. If he wants them
gone entirely, that is a change to CLAUDE.md, recorded in `ops/DECISIONS.md`
with the test that holds it, before it is built.

**Fixed 2026-09-17 (`d428871`), at his word: *"remove them, change the rule we dont need those disclaimers unless it has wrong data"*.** CLAUDE.md UI rule 4 changed and recorded in DECISIONS.md: the room draws a notice only when it says a figure may be wrong (`surface.desk.notices`, unlisted kinds still drawn). **George's own words may still mention one** — the loop that makes him surface notices in prose is the trust machinery and was not touched.

### 2026-09-17 — "what are these disclaimers? what is baseline is something wrong"

> *"the text should reach the end of the alive where it can move not its
> borders and text can be scrollable if its too long but also i think we need
> more text with each chart if needed explaination with the visuals. and what
> are these disclaimers? what is baseline is something wrong"*

Said 2026-09-17 of the live build `c288831`, with three screenshots of one
Shangri-La turn ("the basket moved into the weighed mix"): the whole room, a
caveat over READ 1, and the words column under the mark.

**Nothing is wrong with the figures; the sentence is written for the model, and
the room hands it to him raw.** The read compared this week so far (Monday to
Thursday 14:20) with the same stretch last week (7 Sep 00:00 to 10 Sep 14:20),
product by product. 110 of 173 products have no percentage because one side is
empty — 48 sold this week and not in last week's stretch, 58 sold last week and
not this week (his own prose says both), the rest a zero baseline — and the tool
refuses to invent one. That is correct and worth saying. What reached the
screen is `tools/sales.py`'s `comparison_incomplete` message verbatim: *"110 of
173 compared row(s) could not be compared against the 2026-09-07 00:00:00 to
2026-09-10 14:20:23 baseline: 48 no_baseline (the baseline window returned no
figure (NULL) — nothing to compare against)"* — `row(s)`, a status key, `NULL`,
raw timestamps, built from `comparisons.*.baseline_statuses` in metrics.yaml,
whose wording is for George. CLAUDE.md UI rule 4: *"Raw diagnostics never reach
the answer."* The fix is a person's sentence for the notice (a `says` beside each
status in the definitions, read by the tool — e.g. "110 of 173 products have no
change to show: 48 are new this week, 58 sold last week and not yet this week"),
drawn by `OwnCaveat`; the model keeps its own wording in `guidance`. **Also on the
same screen:** the turn's caveat sentence (*"Shangri-La, Monday to this afternoon
against the same stretch of last week — a bit over half the week"*) is drawn
twice — above the claim and again in the standing text.

**Fixed 2026-09-17 (`d428871`).** `comparison_incomplete` is `explains_only`, so that box is no longer drawn; the repeated caveat sentence is drawn once (`Reading.unsaid`). The tool's message is still engineering wording where George reads it; nothing a person sees carries it now.

### 2026-09-17 — "the text should reach the end of the alive where it can move not its borders and text can be scrollable if its too long"

> *"the text should reach the end of the alive where it can move not its
> borders and text can be scrollable if its too long but also i think we need
> more text with each chart if needed explaination with the visuals. and what
> are these disclaimers? what is baseline is something wrong"*

Said 2026-09-17 of the live build `c288831`, with three screenshots of one
Shangri-La turn ("the basket moved into the weighed mix"): the whole room, a
caveat over READ 1, and the words column under the mark.

**Found underneath (not fixed).** P2S.1 pulled the words up `-10vh` so the claim
starts inside the mark's lower edge (his row 12, *"almost directly under the
blob"*), measured against the canvas box. With the mark now moving (P2S.2(d))
its reach is bigger than its resting body — breath, the pulse, the ring at
`r + 24` — so a long caveat above the claim sits on top of the blob (screenshot
one: *"Shangri-La, Monday to this afternoon…"* over the shape). And the words
column does not scroll or stop: a long answer runs down under the composer, and
*what I'd do next* is drawn through *"tap anything above to bring it here"*.
The fix: start the words at the mark's furthest reach (the ring's extent, from
`alive.ts`, not the canvas box), and give the words column the figures area's
own treatment — bounded above the composer, scrolling with no visible bar.
Row 12's "directly under" is then under what moves, which is what he said.

**Fixed 2026-09-17 (`6975200`).** The words begin at the canvas's lower edge — past his breath, pulse and ring — and fill the column above the composer, scrolling with no bar and fading at the foot. Held by `beside.test.ts`; seen in the frames. **Not verified by him.**

### 2026-09-17 — "color mapping should be more like these colors but in our theme style"

> *"color mapping should be more like these colors but in our theme style and
> the alive not saying any text for awhile but it came out maybe it just took
> long to load take a look at that. and some charts are still getting cut, and
> we dont need the feature where when you click the chart it rearranges"*

Said 2026-09-17 of the live build `c288831` (P2S.1 + P2S.2), with four
screenshots: Supabot's Settings → store display names and colours, the room
mid-answer, and one contributors chart. One message, four reports, kept apart
because they are four.

**Found underneath (not fixed).** The colours in his screenshot are not a
design idea — they are **data he already set**: `stores.color`, edited on
Supabot's Settings page, served by `GET /api/v1/analytics/stores`, and used by
every BI chart (`dashboardStore.getStoreColor`). P2S.2(e) ignored that column
and dealt out the dataviz palette by `stores.active_retail` order instead, so
Rockwell is blue in George and red everywhere else in Supabot. The fix: a
store's swatch takes its own `stores.color` (matched by id to the served
`locations`), adapted per theme — hue kept, lightness and chroma brought into
the room's band for the dark and light grounds — with the palette slot only as
the fallback for a store that has no colour set. Re-run the validator on the
adapted seven and record it; his red for Rockwell and green for Greenhills sit
near `--down` / `--up`, which he has now seen and chosen.

**Fixed 2026-09-17 (`3f36831`).** A store's dot is its `stores.color` from Settings, matched by id, toned in OKLCH for each ground; the palette slot only where no colour is set. Validated in `ops/palette/stores.txt`: OPUS teal and Shangri-La pink cannot be told apart under deuteranopia, raw or toned — the name beside each dot is the relief, recorded in REPORT.md. **Not verified by him.**

### 2026-09-17 — "the alive not saying any text for awhile but it came out maybe it just took long to load"

> *"color mapping should be more like these colors but in our theme style and
> the alive not saying any text for awhile but it came out maybe it just took
> long to load take a look at that. and some charts are still getting cut, and
> we dont need the feature where when you click the chart it rearranges"*

Said 2026-09-17 of the live build `c288831` (P2S.1 + P2S.2), with four
screenshots: Supabot's Settings → store display names and colours, the room
mid-answer, and one contributors chart. One message, four reports, kept apart
because they are four.

**Found underneath (not fixed).** It did take long: `ops/turn_clock.py --days 1`
reads today's two turns at **53 s and 73 s**, 4 model round trips each, the
slowest round trip 31 s — against the 17.1 s median P1.✓ measured. The words
stream as he writes (`text` deltas), but only the last round trip writes the
answer, so for most of a minute the words column under the mark is empty. And
**since P2S.1 the room draws nothing he says before it**: interim prose ("let me
look at the drivers") is kept as `turn.narration` and a rewrite's draft as
`turn.superseded`, and no room component renders either (grep finds no
reader). The work trail is on the right, not under him. The fix is a line under
the mark while he works, off the stream — the running step's words, his
narration when he wrote any — not a made-up status. Why today's turns took 4
round trips at 12–31 s each is a separate question for the clock, not the room.

**The room half fixed 2026-09-17 (`6975200`).** While he works and before his answer arrives, one line under him: the read running or "thinking…", the turn's clock, and his narration (`Doing`, `doing.dom.test.tsx`). **The time itself is not fixed:** 53 s and 73 s, 4 round trips — that is the clock's question, not the room's.

### 2026-09-17 — "some charts are still getting cut"

> *"color mapping should be more like these colors but in our theme style and
> the alive not saying any text for awhile but it came out maybe it just took
> long to load take a look at that. and some charts are still getting cut, and
> we dont need the feature where when you click the chart it rearranges"*

Said 2026-09-17 of the live build `c288831` (P2S.1 + P2S.2), with four
screenshots: Supabot's Settings → store display names and colours, the room
mid-answer, and one contributors chart. One message, four reports, kept apart
because they are four.

**Found underneath (not fixed), and not yet pinned to one cause.** The figures
area (`.r-figs`) is `overflow-y: auto; overflow-x: hidden`, so two things clip:
a figure at the bottom edge is cut in half with the ↓ arrow beside it (his
screenshot shows three titles with their charts below the edge), and anything
wider than its column is cut on the right. The next session renders his layout
in `ops/frames.py` (three columns, 9+ figures) and looks before choosing. **Also
seen in the same screenshot, a separate defect:** figures "from earlier" in a
reopened, kept thread draw *"Nothing to draw here: this read came back without
rows"* — an earlier turn's rows are not restored, so its chart is empty rather
than cut.

**Fixed 2026-09-17 (`def5956`, `2489425`).** The cut he screenshotted was product names ellipsed in three ~290px columns ("P4 kiamoy s…"): at most two columns now, and a name wraps to two lines before it clips. The figures area fades at its edge instead of slicing a chart beside the arrow. A reopened read whose rows were not kept says so instead of "came back without rows". **Not fixed:** why that kept page's earlier reads lost their rows (`payload.charted` did not keep them) — a backend question, still open underneath.

### 2026-09-17 — "we dont need the feature where when you click the chart it rearranges"

> *"color mapping should be more like these colors but in our theme style and
> the alive not saying any text for awhile but it came out maybe it just took
> long to load take a look at that. and some charts are still getting cut, and
> we dont need the feature where when you click the chart it rearranges"*

Said 2026-09-17 of the live build `c288831` (P2S.1 + P2S.2), with four
screenshots: Supabot's Settings → store display names and colours, the room
mid-answer, and one contributors chart. One message, four reports, kept apart
because they are four.

**Found underneath (not fixed).** Clicking a figure calls `on.open` →
`setFocused` (`Room.tsx`), and `board.inOrder` makes the focused object the
lead and moves it to the front of the flow; opening its object panel under it
also changes its height, so `placeFigures` re-flows the other figures across
columns. Both are the rearrange. The fix is to take the click off the figure
(`Shell onOpen` in `marks.tsx` / `tiles.tsx`) and the focus reordering out of
`inOrder`; an object panel stays reachable from a row's own `open` offer. The
per-tile `opened` decision for `attention.learning` goes with it — say so in the
fix.

**Fixed 2026-09-17 (`abf3692`).** A figure takes no click, and focus no longer reorders the flow. A row's name still picks it; a row's `open` offer still opens its panel. The per-figure `opened` decision for `attention.learning` is no longer written from a figure click.

### 2026-09-15 — a tile explaining itself to the reader

Not reported by the owner; seen in his screenshot and logged because the
sentence is addressed to the wrong person:

> **Basket value fell too, far less** · Average transaction value · last month
> · vs previous period · ₱
> *George composed this from Rockwell, which this read does not carry.*

A block named a subject its read does not carry, and the tile says so where
the figures should be. That the surface refuses rather than drawing a wrong
number is right. Saying it in those words, to the owner, is not: it is about
George's composing and not about his business.

**Fixed 2026-09-17, with P2S.2 (`bad1582`).** Both sentences now speak about the
read, to the reader: *"Greenhills is not in this read, so there is no figure for
it here"*, and a read with nothing at all says *"Nothing to draw here: this read
came back without rows"*. Refusing to draw a wrong number is unchanged.
`marks.dom.test.tsx` holds that the sentence names the subject and does not say
"George" or "composed". Not reported by the owner, so not waiting on him.

### 2026-09-16 — a database error was the whole answer, and tool calls were printed as prose

> *"also: QueryCanceled: canceling statement due to statement timeout happended
> when i asked to make a ordering system for a supplier and when i told it a day
> was a holiday it said of this data"*

Two screenshots. (1) A supplier selected (JUDY JUD001), asked for an ordering
system: the answer is the single line `QueryCanceled: canceling statement due
to statement timeout` — 0 reads, 2 tools, 35.1s. A raw Postgres error reached
the answer (UI rule 4: raw diagnostics never reach the answer). (2) Told a day
was a holiday: a good answer, then `[Calls behind this answer: compose({...}),
record_belief({...})]` — the tool-call JSON printed after his prose.

**BOTH FIXED, SAME DAY, WITH THE CAUSES READ OUT OF PRODUCTION.**

**(1) The timeout.** `george.conversations`: status `error`, one iteration,
35,058 ms; `george.gaps`: `unhandled — QueryCanceled`. The tool wrapper caught
ValueError, KeyError and RuntimeError and nothing else, so a Postgres
`QueryCanceled` went past every handler in `run()` to the last one, which
streamed the exception as the answer. Reproduced read-only: the plan for
Judy JUD001 (18 products) took **25.1 s cold, 7.6 s warm** against the role's
30 s cap. `EXPLAIN (ANALYZE, BUFFERS)` showed why: the planner walked all
**28,377** lines those products ever sold, then looked each transaction up by
key to keep 2,303 — 133,879 buffers. Three fixes: the wrapper now turns any
`psycopg.Error` into a refusal in words from `failures.reads` (the sentence
names the 30 s, held equal to the role file by a test), the raw text riding
the diagnostic key to the gap log only; the two outer handlers say a sentence
from `failures.turn` instead of the exception; and the demand query reads the
56-day window first, `MATERIALIZED`, so the planner cannot choose that plan
again — **35,059 buffers**, that statement 4.0 s → 1.4 s. **Not closed:** the
plan is still ~8 s because its other two statements swing 1–3 s with load;
the sentence is the safety net, not a promise it never fires.

**(2) The bracket.** `_seed_history` closed every prior George turn with
`[Calls behind this answer: …]` so the model could see what ran — and a
model shown twenty answers that all end the same way ends its own the same
way. The list now opens the user turn that FOLLOWS the answer, where nothing
is imitated (an answer with no turn after it keeps it, because the pin
follow-up reads the last message); and an echo is stripped deterministically
— it is this file's own template — and recorded as `history_marker_echoed`.
**1,836 → 1,848 pure**, prompt byte-identical at sha `bf57bd75`.


### 2026-09-16 — one frame, or three? The gaps, the cut names and the stack

> *"now also look at the differnece why in this talking page is the side gaps
> different from other pages? and why does this chart not fill out the names
> there is clearly space and why arent the charts side by side there is clearly
> space, i dont want you to just fix this exact problem cause its clearly a
> bigger structural issue that needs to be addressed"*

**HIS THIRD REPORT OF THE SAME RULE, AND HE IS RIGHT THAT IT IS STRUCTURAL.**
09-14 *"lots of empty space on the right"*, 09-15 *"why is still cropped"*,
now this. Two of the three symptoms he names are one cause and the third is a
second cause underneath it.

**MEASURED OFF HIS OWN TWO SCREENSHOTS, not estimated.** Window 1,863px.
`.r-main` reserves 56px of rail plus `clamp(18px, 3vw, 40px)` each side, so
1,727px is available.

| screen | measure | content | empty |
|---|---|---|---|
| the thread | `--measure` at `data-rest="1"` | **680px** | **1,183px, 63%** |
| Needs you | `--measure-list` | **1,120px** | 743px, 40% |

Both centred, so his eye compared two frames 440px apart and read it
correctly before reading anything in either.

**CAUSE ONE: the page was sized by how many objects the answer happened to
have.** `--measure` was set from `data-rest` — how many objects sit below the
lead — at 680 / 940 / 1040 / 1320px. So the chrome, the reading and the
composer were a function of the answer, and **the cut names are that too**:
the row label is capped at 40% of its TILE (`fit-content(40%)`, fixed 09-16),
and 40% of a tile inside a 680px page is ~180px. The label rule was right and
was being squeezed by a page that had nothing to do with labels. Nothing was
wrong with the chart.

**CAUSE TWO, and no width fixes it: the board is two containers stacked.**
What LEADS is `.r-board-lead`, what packs is `.r-board-rest`, and they are
siblings in a column. A board of two objects is one above the other at 680px
and still one above the other at 1320px. *"there is clearly space"* was true
and the layout had no way to use it.

**BOTH CAUSES CLOSED, 2026-09-16, and the 680px strip entry below goes with
them.**

1. **The count sizes the board; it never again sizes the page.** The four
   `data-rest` → `--measure` rules and the `data-board="0"` rule are deleted.
   A page is a frame and a frame does not move.
2. **One frame for the room.** `--measure-list` is gone; `.r-column` — Kept,
   Needs you, Running — reads `--measure`. Their CONTENT still differs: prose
   keeps 62ch, the reading keeps 66ch, so nothing sprawls at 1,320px, and
   1,320 clears the 820px that was breaking "AJI BARN Reorder" mid-item.
3. **A small board is a row, not a stack.** With one thing in the pack, the
   lead and the pack are a two-column grid, `align-items: start`. **Both
   containers survive** — `drag.ts` decides lead-or-rest by which one the
   pointer is over, so merging them in `render.tsx` would have made a board
   you cannot promote a tile into. Conditioned on `:has(.r-board-lead)`,
   because ONE object George did not weight `lead` is also `data-rest="1"`
   and a single tile in a two-column row is the empty right half he reported
   on 09-14. That tile is capped at 760px and centred instead.
4. **The natural width of one object moved onto the region**, where it is
   content, rather than onto the frame.

**THE NUMBERS NOW, by the same arithmetic**: 1,320px of a 1,863px window is
**71% occupied** against 36%, and every screen in the room is the same frame.

**AND THE CHECK THAT WOULD HAVE CAUGHT IT EXISTS NOW.** `layout.test.ts`
computes what the rules PRODUCE — the narrowest `--measure` any rule can set,
against `.r-main`'s padding, at 1440 / 1663 / 1863 / 1920px — and fails below
65% occupied. **Reading only the default on `.room` is how such a check would
have passed on the stylesheet that caused this**, so it takes the minimum of
every rule. Six tests, all six red on the old stylesheet, `1,297 → 1,301`.

**HE LOOKED AGAIN AND THEY WERE STILL STACKED.** *"charts still not beside
each other"*, with the names now whole — so the label half was closed and the
side-by-side half was not.

**THE FIRST FIX TARGETED THE WRONG CASE, and reading his own turn out of
`george.posts` is what showed it.** The composition for that turn is ONE
block — a `change` to `opus-drops`, an object carried from an earlier turn —
and his two charts are `default_blocks`: `read-0` weight `lead`, `read-1`
weight `quiet`. After `oneLead()` the carried object leads, so the board is
**three objects with BOTH charts in the pack**, `data-rest="2"`. The row rule
added this morning fires on `data-rest="1"` — one thing leading, one thing
packed — and **was never going to apply to the screen he was looking at**.
Lead-versus-pack was the wrong axis; his two charts are pack-versus-pack.

**AND THE PACK DECIDED BY BALANCING, WHICH IS A GUESS FOR TWO.** `columns: 2`
is multi-column: it places an item by balancing column HEIGHT. That is the
right mechanism for a pack of many — it is why a tall table beside two short
figures packs tight — and for two equal tiles it is a coin toss the
stylesheet cannot state. **A grid PLACES them**: first item first column,
second item second, no height involved. Two and three now use
`display: grid; grid-template-columns: 1fr 1fr; align-items: start`; three
wrap to a second row rather than taking a 428px third column, which is what
the multi-column rule did and is still right. Four and more keep multi-column,
where packing is what you want. The phone rule had to learn grid too, because
a grid ignores `columns`.

**WHAT I COULD NOT ESTABLISH, and did not guess at:** whether the screenshot
was taken on this morning's build at all. A 652px tile is consistent with the
new grid AND with two balanced multi-column columns, so the pixels do not
separate them. What separates them is the composition above, which is read
from production and says the row rule could not have fired either way.

**1,301 → 1,302 vitest.** The pack rule is now asserted as PLACEMENT — grid,
two columns, `align-items: start` — rather than as the text `columns: 2 340px`.

**WHAT IS NOT DONE, AND IT IS THE POINT OF HIS SENTENCE.** This is the THIRD
layout fix shipped without anybody seeing it, and the first two each produced
the next report. The arithmetic above is a model of two CSS rules, not a
browser: it cannot see a line wrap, a tile's real height, or whether two
charts abreast actually read. **`thesupabot.vercel.app` is now written down**
(§3 of NOW.md) — it came off the status bar of his own screenshot, and it is
the address nine close-outs have said was recorded nowhere. Seeing it is
still his to do.

**THE THIRD THING, which is why this got past 1,284 tests three times:**
**nothing in the room can see a width.** jsdom does no layout and there is no
browser in the toolchain, so `layout.test.ts` reads the stylesheet as a
STRING — it asserted the narrowing rules were PRESENT, which is the opposite
of catching them. A string match cannot see that 680 in 1,863 leaves 63% of
the screen black.


### 2026-09-15 — a 680px strip in a 1900px window, and no chart in it

> *"why is still cropped? and why are the charts missing text? it should fill
> it"*

**TWO HALVES. ONE IS ESTABLISHED, THE OTHER IS NOT, AND THEY ARE WRITTEN APART
ON PURPOSE.**

**THE WIDTH IS THE RULE WORKING AS WRITTEN, WHICH IS WHY "STILL".** `--measure`
is set from `data-rest` — **how many objects sit BELOW the lead** — and this
turn's board has one or two, with **ten more folded into "10 things from
earlier"**. One or fewer below the lead means **680px**. His window is ~1863px
wide, so roughly **63% of the screen is black**.

The rule was added 2026-09-14 off his own report, *"at 100% size theres lots of
empty space on the right and its not centered"*, and it fixed the half it was
aimed at: a board of two things no longer sits in a column built for six. **It
did not fix the screen.** A column sized to the board is still a strip when the
board is small, and he has now reported that shape TWICE. **That is evidence
the rule is wrong rather than that it misfired**, and it is a design change to
the one variable every surface in the room reads — the board, the composer, the
list screens — so it is a card, not a midnight edit.

**HALF OF IT ANSWERED ITSELF, 2026-09-16.** He scrolled and sent the charts:
**they render.** "Product revenue" and "Units sold", ten rows each, dumbbells
drawn, figures beside them. **Nothing was missing — they were below the fold,
under the composer.** The second candidate below was the right one and the
first is closed: no `Missing` line, no rowless block.

**WHAT HE SAW INSTEAD, AND IT IS WORSE:** *"the product name are cut and they
arent even beside each other when theres space"*. The cut names are their own
entry under Fixed and are done. **The side-by-side half is still this entry**,
and it is now evidenced rather than inferred — two tiles of ~460px stacked
vertically inside a page with room for both, beside a "Needs you" screen that
fills its width. Same `--measure` question, and the same card.

**WHAT WAS WRITTEN HERE BEFORE HE SCROLLED, kept because the reasoning was
wrong in an instructive way:** The block
in the screenshot is cut off by the bottom of the window with its caveat and
its title (*"Units sold"*) drawn and the mark below the fold, so the picture
cannot tell *"the chart is under the composer"* from *"the chart did not
render"*. Two candidates, both real, neither confirmed:

* a read past `MAX_ROWS_TO_CLIENT` (120) arrives with **no rows at all** — all
  of them or none — and a block over no rows draws `Missing`, which is the
  sentence already Open above as *"a tile explaining itself to the reader"*.
  The visible caveat says **74 compared rows**, under the cap, but that is the
  compared count and not necessarily the read's;
* or nothing is wrong and it is simply below the fold.

**WHAT WOULD SETTLE IT IN ONE LOOK:** scroll that same answer down, and if a
chart is there the second half of this entry closes. If instead there is a grey
line reading *"George composed this from rows, which this read does not
carry"*, it is the first candidate and it is a different fix.

**CLOSED BY THE 2026-09-16 ENTRY ABOVE IT IN Fixed**, which is his third
report of this rule and carries the diagnosis, the arithmetic and the fix.
The side-by-side half named here was the second cause: two stacked
containers, not a width.

### 2026-09-15 — "analyze tradsnax per store" answered with one chart

> *"the way it answered 'analyze tradsanx per store' in the first place is
> kinda of weird it only showed me 1 chart when i thought i would go in depth
> products per store and what i thinks and do we only 1 chart option? i feels
> very limited not limitless"*

**Half of what looked wrong was the click defect under it** — everything below
the chart in his screenshot ("what George thinks", "what it took last week",
"how many bought") is the **Greenhills object panel**, opened by the bug that
is now fixed. So the ANSWER really was one chart and nothing else, and the rest
was the wrong shop's page stacked under it.

**What the definitions actually allowed, read rather than guessed.** "analyze
tradsnax per store" names a subject and a dimension, so
`investigation.scope.kinds` classifies it **FOCUSED**: *"the smallest set that
completely answers it"*, **max 4 reads**. And `presentation` asks for **2 to 4
findings**. **George made ONE read and said one thing.** He was inside the
policy and well under it — so this is not a cap that needs raising, it is
George choosing the floor of his own allowance.

**And no, there is not one chart option.** The catalogue is **six marks**
(figure, dumbbell, ranked, contributors, line, table) and a board holds up to
**12 objects**. He saw one because one read was made, not because one shape
exists.

**WHY THIS IS NOT FIXED HERE.** Whether George reads once or four times for a
word like "analyze" is BEHAVIOUR, and behaviour is held by the evals, which no
card in this phase runs. It wants a card of its own: either a message kind that
says "analyze/in depth" is a request to decompose, or a FOCUSED read set that
names a second read the way BROAD's does. **Neither is a line of code and both
change every answer**, so it is written here rather than done at midnight.

**CLOSED BY P2.m, 2026-09-16 — the mechanism, not the behaviour.** The gate is the INTENT now and not the word "why"; a narrow question asked to be taken apart has a floor of two reads instead of "the smallest set"; and a view is OWED rather than permitted, which is the half he added on the day: *"george isnt thinking for himself … i want him to see the data and make his own"*. **What is not closed: nobody has asked him this since.** The eleven standing eval questions all contain "why", "which" or "dig deeper", so they could never have seen this; two that can were written and neither has been run. Until one is, the second read and the view are asserted by the definitions and unobserved in a conversation.

### 2026-09-16 — every product name in a chart was cut at 13 characters

> *"look at the difference between the other pages and look at these charts the
> product name are cut and they arent even beside each other when theres
> space"*

**THE COLUMN WAS `minmax(6ch, 13ch)`, AND 13ch WAS MEASURED AGAINST THE WRONG
POPULATION.** It was written when every mark drew SHOPS. Measured against
production 2026-09-16:

| what a row can be | how many | longest | fits 13ch |
|---|---|---|---|
| shops | 9 | 10ch ("Greenhills") | **100%** |
| categories | 17 | 14ch ("Store supplies") | the longest is cut |
| products | **3,728** | 61ch, median 22ch | **6.8%** |

**3,473 of 3,728 product names could not fit.** On his screen "Aji Kiamoy
Stri…" and "Aji Kiamoy Wh…" are two different products and the chart could not
tell them apart.

**THIS IS THE SECOND BOUND IN TWO DAYS REASONED AGAINST THE WRONG POPULATION.**
The `@` menu refused a query containing a space; 99.8% of product names have
one. Both were sound reasoning about a population nobody counted, and both were
right for shops and wrong for the catalogue.

**Fixed with `fit-content(40%)`** — the column takes what the longest label
needs and no more than 40% of the tile. A chart of shops is unchanged (10ch is
far under the cap, and the track keeps its width); categories stop being cut at
all; products get roughly twice the characters in the same tile and more in a
wider one. On a phone it tightens to 33%, because there the picture is the
scarce thing. The scale below a mark uses the same track list, deliberately:
its ends sit under the track's ends.

**AND THE TEST FOR IT WAS VACUOUS ON THE FIRST TRY, WHICH IS WORTH RECORDING.**
The helper it uses folded every matching rule together, so `.r-mk-row`
resolved to the phone override inside a media query and the assertion passed
against the exact defect it was written for. It reads the FIRST match now — the
base rule, which is the one that drew his screen — and was checked in both
directions: it fails against `minmax(6ch, 13ch)` and passes against the fix.


### 2026-09-15 — clicking a chart of seven shops opened Greenhills

> *"why when click on a chart made for 'analyze tradsanx per store' it opens
> greenhills for some reason"*

**Because Greenhills was the first row.** A block's subject was read as
`o.subject ?? subjectOf(rows[0])`, so a block George composed over a SET —
which declares no subject, because it is not about one thing — **borrowed
whichever row the read happened to sort first**. Focusing the tile then opened
that shop's whole page underneath it.

**The subject was chosen by nobody.** Not by him, not by George, not by the
read: by the `ORDER BY`. That is exactly the *"a label the model inferred"*
that `surface.desk`'s Selection rule refuses, arriving through a `??` in a
renderer rather than through the model.

**Fixed: one row IS its own subject and still opens; many rows open nothing.**
A row is opened by tapping the ROW — `pick`, `why` and an `open` offer all
already do that, each carrying the row's own name. Five tests, two of which
fail against the old line, including one that reverses the rows and checks
that nothing opens either way: a subject that moves with the sort is not a
subject.

### 2026-09-15 — "is this open feature really part of the plan?"

> *"and is this open feature really part of the plan?"*

**Yes — P2.d, closed 2026-09-15,** and it is not new capability. `open` is one
of the two acts George may offer on a row, and pressing it makes the same ~1 s
read the tile's own tap already makes. The label *"~1s"* is not his: the cost
is a fact about the machine, stored beside the act, with no field on his side
to put a speed in.

Recorded as answered rather than as a defect — but the question was fair,
because the button he was looking at was sitting above a panel that had opened
the wrong shop, which makes any control look like it is doing something nobody
asked for.


### 2026-09-15 — a name with a space in it matched nothing

> *"and when you search with spaces it doesnt show anything example: 'Kiamoy
> strips' nothing"*

**THE SERVER WAS NEVER THE PROBLEM.** `get_product(name=)` is a substring match
across name and nickname and finds *four* products for that exact phrase —
`kiamoy strips 1 gram`, `kiamoy strips 3kg`, `Kiamoy strips 3kg`,
`Kiamoy strips freetst 1g`. **The client closed the mention at the first
space**, so the query was never sent. One line: `if (/\s/.test(query)) return
null`.

**MEASURED, RATHER THAN ESTIMATED, THE SAME HOUR.** Of 3,728 products with a
name, **3,719 contain a space — 99.8%**. So `@product` has worked for **nine
products** since it was built. Names run to 11 words; 6 covers 95.2% and 8
covers 99.4%, and 8 is where the bound is set.

**Fixed, and the bound is the definitions'** (`mentions.max_words`), read by
the client rather than assumed — served nothing, it falls back to the old
one-word behaviour rather than widening a query the server never agreed to.
**What actually closes a long mention is the RESULT**: once a query with a
space comes back empty there is nothing to offer, so it stops being a mention
and becomes a sentence. A one-word miss still says *"nothing by that name"*,
because right after `@` that is feedback rather than noise — and a kind that
could not be READ still says so, which is a different fact (UI rule 8).
Accepting a completion now closes the menu, or the thing just picked would be
re-offered under the caret.

### 2026-09-15 — there was no way to type a category

> *"there should also be product categories"*

**A category has been a subject since the desk existed** — it is in
`selection.dimensions`, and `selection.identity.category` says its name IS its
id — so tapping a row could already bind one. **Typing one could not, because
nothing read the SET.** `get_product(category=)` filters by one exact category;
`get_sales(group_by=category)` groups sales by it. Neither returns the list, so
a menu of categories could only have been a list typed into a client — the
thing CLAUDE.md forbids about the store list, for the same reason.

**`tools/products.get_product_categories()` is that read**: one SELECT, the
category expression taken from `products.category_normalization`, `{rows,
meta}` like every other tool. Verified against production the same hour —
**17 categories over 3,728 products**, the largest 968 and the smallest 1, so
the whole set fits a menu.

**Deliberately NOT in George's schema.** This is a person's completion list,
not a question he is asked; he reaches for `get_product(category=)` when a
category is named. Adding a tool would rewrite the 1-hour cached prefix on
every request in the deploy to serve a menu. A test holds that.

**And no count beside it.** Each category knows how many catalogue rows carry
it, and the read says in as many words that this is a count of rows and not a
quantity sold, held or ordered — but a figure on this surface carries the time
it was read, and a completion list has nowhere to put one. Same refusal the
supplier kind already makes about its order count.


### 2026-09-15 — a warehouse in the @ menu with nothing saying it was one

> *"what can you @?"*

A question rather than a report, and answering it honestly meant listing what
the menu actually draws — which is how this was found. **`@AJI` offers both
warehouses together and drew them as `AJI BARN · warehouse` and then `AJI CMG`
with nothing beside it.** A bare name in a list of seven shops reads as an
eighth shop.

**Introduced the same evening, by the fix above this one.** The service decided
the word by comparing the group's NAME against the string `"warehouse"`, and
AJI CMG lives in a group called `vending_stock_location`. Adding that group to
the menu without noticing the comparison is what put an unlabelled warehouse in
front of him.

**Fixed: the word is a definition, per group.** `kinds.store.groups` is a map
now — each group to the word drawn beside a name, or nothing. Both warehouses
say warehouse, which is his word, twice; a shop says nothing, because a shop is
what the list is mostly made of.


### 2026-09-15 — the switch was a list of two different kinds of thing

> *"vending can be different but barn and cmg are warehouses so they should be
> builit into aji ichiban all stores so they dont need their own pill — aji
> ichiban is the pill with all stores and warehouses, vending is a pill for
> vending machine buisness of aji ichiban but its diferrent products and
> everything so thats why its a different pill"*

**His third report on the same card in one evening, and this one is the
design.** It shipped as four pills — shops, AJI BARN, AJI CMG, vending — and
that row mixed BUSINESSES with PLACES. Two of the four were single rows of
`stores`.

**The switch is for businesses.** A place inside one is what the SELECTION is
for and has been since P2.c: `@AJI BARN` binds it, a tap on a row binds it,
and both travel as ids with a chip you can see. Giving one a pill of its own
put the same job in two places with different rules.

**Three pills now: All · Aji Ichiban · vending.** Aji Ichiban covers the seven
shops and both warehouses; vending is the machines. His reason for the split
is the one the definitions already gave — *"its diferrent products and
everything"* is `vending.never_join_to_store_domain`, and `get_vending` has no
store argument at all.

**WHAT FOLDING THEM IN COST, CHECKED RATHER THAN ASSUMED.** There is no
one-press way to scope to the barn now. `@AJI BARN` was the answer and already
worked — **`@AJI CMG` did not**. The mentions service kept its OWN tuple of
store groups, missing `vending_stock_location`, exactly as `tools/_common`'s
had. **Removing the pill without noticing that would have left AJI CMG
reachable by no gesture at all.** Both lists read `metrics.yaml` now.

**And the warehouses keep their behaviour without keeping their pill.** One
scope over seven shops that sell and two warehouses that do not has to say
which is which, so the sentence names them from the lists: *"AJI BARN and AJI
CMG are warehouses and in no sales figure, so what they hold and what moves
through them is the answer for those"*.

**One thing was deleted rather than kept.** `count_places` drew "7 shops" on
the one pill that was a plural common noun. That pill is gone, so the field is
gone — a channel nothing sets is one whose absence nobody can see, which is the
lesson P2.l is named after.

**The business is named once.** The Aji Ichiban pill reads
`surface.desk.business.name` rather than typing the name a second time.

**NOT SEEN IN A BROWSER**, and the live build has none of this.


### 2026-09-15 — a warehouse filed as retail, where nobody could see it

> *"aji barn is also a warehouse"*

**The pills were already right.** AJI BARN has read **AJI BARN · warehouse**
since the first commit of P2.g, and AJI CMG had just been corrected to match.
So on screen there was nothing to fix, and saying only that would have been a
true answer to the wrong question.

**One layer down it was still wrong.** Both warehouse parts carried
`domain: retail` in `metrics.yaml`, where "retail" was standing in for "the
store side, not vending" — the same category error, in the field a person
never sees. **Nothing reads it at runtime**, which is exactly how a wrong word
survives in it: it is not what the code does, it is what the next person
reads before writing code.

**Fixed in the file's own words.** The two data worlds here are the **store**
domain (StoreHub: `stores`, transactions, inventory) and the **vending**
domain (Weimi) — the pair `vending.never_join_to_store_domain` already names.
`surface.desk.estate.domains` declares them, every part is checked against
them, and **a part that says `warehouse` and is filed anywhere but `store`
fails a test**. The shops are still retail, and say so on the pill, which is a
word for a person rather than a data world.

### 2026-09-15 — the estate switch called two warehouses a business

> *"push  but does that make sense? aji barn and aji cmg are our warehouses,
> but if in the future it can be a whole new buisness then ok"*

Said of P2.g an hour after it shipped, and **he is right in the one way that
breaks something.** The switch drew a pill reading **AJI CMG · vending**, scoped
to `stores.vending_stock_location` and answered by `get_vending`.

**That joined the two things `metrics.yaml` says must never be joined.** The
note above that row reads: *"NOT retail, NOT the warehouse, and NOT the vending
business. It holds store-side stock (3,534 inventory rows) and takes no
transactions. The vending DOMAIN is Weimi … the two must never be conflated."*
And `get_vending` has **no store argument at all** — only `machine`. So the pill
handed George a store id the reads it named cannot take, under a word for a
business that row is not.

**Fixed as two parts, which is what they are.** **AJI CMG** is a warehouse,
said so and read so — stock and movement, in no sales figure, exactly like AJI
BARN. **vending** is a BUSINESS: no store scope at all, its places are
machines, read with `get_vending` and `get_vending_stock`, never joined to or
totalled with the shops. Five pills now: All · 7 shops · AJI BARN · AJI CMG ·
vending.

**And it answers the second half of what he said.** *"if in the future it can
be a whole new buisness then ok"* — vending is now the first part shaped like
one, and `has_no_store_scope` is the shape a new business takes here: its own
tables, its own reads, no shops in it. A second one is a block in the yaml.

Two backend tests fail without the change; the correction is also held by a
test that reads `get_vending`'s signature, so `has_no_store_scope` cannot
become a sentence nobody rechecked.

**NOT SEEN IN A BROWSER.** The build he was looking at when he said this is
`3bb55f22`, which has the wrong pill on it. The fix is not pushed.


### 2026-09-15 — "compare" put two shops in the shop filter, and the filter showed raw ids

### 2026-09-15 — "compare" puts two shops in the shop filter, and the filter shows raw ids

> *"when i click 2 stores and say compare it just puts them in the store
> filterer i dont know we really need any those i think we might have to
> remove it, it doesnt fit the build."*

**THE TOKEN IS DRAWING DATABASE IDS AT THE OWNER.** His screenshot:

> SHOP · `67612230a740d90007464e26 → 668a43f60fa9990007cfa158`

That is the shop token's moved state — was, then now — with both values
rendered as the id rather than the name the row carried. P2.c's whole point
was that a subject travels as an id and is SHOWN as a label; the showing half
is missing here. It is also why the feature "doesn't fit the build": the
Ideal UI's own token reads `last week · 31 Aug – 6 Sep` and `7 shops · active
retail`, in words.

**AND THE READ DID NOT NARROW.** The board under it still draws seven shops
(`7 rows`, `read Sep 15, 8:13 PM`), so whatever the replay did, it did not
scope the read to the two picked. The chips stay in the composer afterwards,
which is the third thing that makes it read as "nothing happened".

*The session's own reading of the removal question, for the record rather
than as a decision:* the Ideal UI keeps the tokens (feature 6, "Contextual
conversation", marked built, with the pop-out and "not what I meant"). What
it does not have is an id where a name should be. That is an argument for
fixing the label, not for removing the row — but it is the owner's call and
it is written here so it is made once rather than drifted into.

**Fixed, and the diagnosis corrected: there was ONE bug, not two.**

`tokensFor` set a token's words with `match?.label ?? said(value)`, and
`said` on a list joined the raw elements with an arrow. A shop alternative is
keyed by **id** with the name as its label, so one shop resolved to its name
and the two-id list that "compare these" sets matched no single alternative
and fell through to the raw join. A token now resolves a list element by
element in the definitions' own words, and **never draws an opaque identifier
at all** — where it cannot name them it says how many. That last rule is the
general one, so this cannot come back through a different argument.

**THE READ DID NARROW ALL ALONG, AND THE SESSION WAS WRONG TO LOG THAT IT HAD
NOT.** Checked against the real catalogue: two ids resolve to 2 shops, one to
1, no filter to 7. `check_value` accepts a list, `retarget` lands it at
`filters.store`, and `resolve_store` has taken a list since P2.c. The board
drew seven shops in his screenshot because it was caught before the replay
landed, or because he read the gibberish token and stopped — either way
nothing was broken underneath. What he actually saw was a correct gesture
wearing an unreadable label, which is exactly what *"it just puts them in the
store filterer"* describes.

**A CORRECTION TO THE EXISTING SUITE CAUGHT A REAL DISTINCTION.** The first
fix flattened a date range into a comma list: `['2026-08-01','2026-09-01']`
is ONE window read from its two ends and has always been drawn with an arrow,
while two shop ids are two subjects and read as a set. They are told apart by
whether the definitions NAME the elements — not by which argument they
arrived on, which would be a second copy of the definitions. And
`test_tokens_contract` refused the first draft of the comment for naming a
served preset and a shop; the guard cannot tell code from prose and is right
not to try.

Five tests, four of which fail without the fix, plus the one that already
held the date range.


### 2026-09-15 — a change column with no colour in the opened panel

### 2026-09-15 — a change column with no colour in the opened panel

> *"why do these have no color? there should be color right?"* — of the tables
> inside an opened object

**A THIRD RENDERER, and this one is a defect rather than a design choice.**
`ObjectPanel.Rows` builds its own table and calls `fmt()` on every cell,
`change_pct` included, so `+1.5%` is plain text there while the same figure on
the board wears an arrow and its direction's colour through `Delta`. The
comment above it says so in as many words: *"this panel is untouched by the
board's redesign."*

It is the same shape as P2.k — *"it doesnt feel like its from the same app and
its beacause its not"* — in a surface no card mentions. The calendar and the
dots in his other screenshot are NOT this: those are `Spec` marks in the room,
flat because the rows carry no direction, which is what P2.l decided.

**Fixed, and only this.** The panel's table draws `change_pct` through
`Delta` — the one definition of what a measured change looks like — so it
wears the same arrow and the same direction colour it wears everywhere else.
Nothing else about the panel moved: its columns, its cap of five rows and its
receipts are untouched.

**AND THE PANEL NOW HAS TESTS, WHICH IS THE REAL FINDING.** It was
`vi.mock`ed out of five suites and rendered by none, so it had never been
drawn by a test since it was built — which is exactly how it grew a second
visual vocabulary in the one place nobody looked. Five tests render it for
real against a stubbed read; two of them fail without the fix.

**THE CALENDAR AND THE DOTS WERE NOT THIS AND ARE NOT CHANGED.** Those are
`Spec` marks in the room, flat because their rows carry no direction, which is
what P2.l decided off his own report. Asked whether to add a sequential ramp
for magnitude — the one of colour's four jobs this palette has never filled —
the owner said **"just fix the panel"**. The ramp is not built and is not a
pending item; it is a decision taken, and taken against.


### 2026-09-15 — the memory stopped after four and said nothing about the rest

### 2026-09-15 — the memory stops after four and says nothing about the rest

> *"am i supposed to be able to scroll this memory"*

**No.** It is a defect, shipped this morning in P2.f. `.r-tile` is
`max-height: 560px; overflow: hidden` and `.r-tile > *` pins every direct
child to `flex: 0 0 auto`, so the register of views is silently cut — six
held, four drawn, no scrollbar and no line saying so. The card's own words are
*"every view he holds"* and *"a memory you cannot see all of is not a memory
you can check"*, and the screen contradicts both.

**Fixed.** The list scrolls inside the tile now — which is what `.r-scroll`
has always done for a long table — and **the label says how many there are**,
so a list that scrolls is not a list that ends. The count is the read's own
(`meta.held`, which counts every view he holds and can exceed the rows the
read returns), falling back to the rows where it gave none, and absent
entirely when there is nothing to count. Five tests, including that six rows
draw six Forgets rather than the four that fit.


### 2026-09-15 — a tap on a store did nothing but move the widget

### 2026-09-15 — a tap on a store does nothing but move the widget

> *"this is how are doing looks like, but tapping doesnt work it just moves or
> expands the widget so again for 2. i cant click any store cause theres no
> tap."*

The whole of P2.c's first half. `@` works — he said so — so an id can reach
George by typing; it cannot reach him by pointing, which is the gesture the
card is named after and the one everything downstream of it assumes.

*Found by the session underneath, unverified:* the tile is `role="button"`
with an `onClick` on the whole of it (`Shell`, `room/tiles.tsx`), and a mark's
row sits inside it, so a click on a row may be reaching the tile's open/drag
handler and never the row's own. That is a lead, not a diagnosis.

### 2026-09-15 — the three changers above the figures do not work

> *"these 3 changers no really work"* — of `WINDOW last month · SHOP Rockwell ·
> GROUPED store`

The read-as tokens from P1.j. They are drawn with the right words off the
arguments the tools accepted, and they do not change anything when pressed.
Same shape of failure as the tap above and possibly the same cause, which is
a reason to look at them together and not a reason to assume it.

**Fixed.** There was no tap. `r-mk-name` was a plain `<span>` in every mark
and nothing anywhere called `pick` except the `compare` button under a tile —
so P2.c shipped with `subjects.ts` resolving ids, `subjectOnBoard` tested, the
composer drawing chips, and no gesture joining them. Every piece was covered
and the thing between them was not. A row's name is a button now, in the
dumbbell, the ranked and the contributors marks and in the subject cell of a
table; it takes the row's OWN dimension, the way `why` already did.

The second half of his sentence was the second half of the bug: the tile is
`role="button"` with an `onClick` over the whole of it, so the click reached
the tile and opened it. `stopPropagation` on the name. Both halves had to go
or the tap would have selected the row and opened the object at once.

**Held by eight tests that fail without it** (`marks.dom.test.tsx`), driven
through the whole board rather than against `pick` — a unit test of `pick`
would have passed the entire time this was broken.

### 2026-09-15 — the three changers "did not work", and a raw diagnostic was sitting in the answer

### 2026-09-15 — a raw diagnostic is sitting in the answer

Not reported by the owner; **seen in his screenshot** and logged because UI
rule 4 forbids it in those words — *raw diagnostics never reach the answer*.
Under the tokens on the `@Rockwell lost last month` turn:

> compare_to='previous_period' cannot be grouped by hour: each bucket against
> its own predecessor is a lag series, which is not built (metrics.yaml
> comparisons.not_supported.per_bucket_lag). Group by category, product, store
> or by nothing, or drop compare_to and read the series as a chart.

It names a yaml key and a file path. That sentence is written for George, and
it is on the owner's screen.

**One defect, not two, and this is what the session found.** The changers
fired. He moved GROUPED to hour on the `@Rockwell lost last month` turn, the
replay was refused — correctly, a lag series is not built — and what he was
shown was the refusal `tools/sales.py` writes **for the model**, naming the
argument and the yaml key so George can fix his own call. From his side a
changer did nothing and said something unreadable, which is exactly the report
he gave.

**Fixed at the surface, not at the tool.** The tool's sentence is right where
it is and George still gets it whole. `refusalForPerson` in `tokenShape.ts`
checks it against `surface.prose.leaks` — the SAME list the loop already scans
an answer with, now served with the replay definitions so no component keeps a
second copy — and where it leaks, draws `replay.refused_leaks_says` with the
tool's own words behind `why`. That is UI rule 4 exactly: reduced to one line
naming it, explanation on tap. A refusal that leaks nothing is shown whole, as
before. **No sentence in the definitions is not a licence to show the raw
one**: it still withholds the machinery and says only that it was refused.

**Not verified in a browser by anybody.** The changers may still be wrong in
some way this did not touch — what is established is that they fire, that a
refusal is what he saw, and that the refusal no longer leaks. If they are
still dead after this, that is a new report and a different cause.

---

### 2026-09-15 · a claim about Greenhills over Rockwell's number

Found while answering the colour report below, in the same screenshot, and it
is not what he asked about — it is worse than what he asked about.

One tile reads **"Greenhills turned down on a smaller basket"**, and under it:
**₱206,800**, a **green ▲+1.5%**, and a dumbbell row labelled **Rockwell**. The
lead tile on the same screen says Greenhills did ₱278,266 and Rockwell did
₱206,800. So the claim names one shop and every figure under it belongs to
another, with the other shop's name printed inside the tile.

**The code path that does this is `marks.tsx` `Figure`, line 70:** it looks for
the row matching the block's `subject` and falls back to **`?? rows[0]`** when
it finds none. So a block whose subject the read does not hold silently draws
the FIRST row of that read and captions it with George's claim. The `Missing`
component on the next line is unreachable whenever the read returned anything
at all.

**This is the one thing the whole system exists to prevent** — a figure under a
claim that is not about it (CLAUDE.md rule 9). What it is NOT: George inventing
a number. ₱206,800 is real and was read; it is attached to the wrong sentence.
Whether he composed a Greenhills block over a Rockwell-scoped read, or wrote a
Greenhills claim onto a Rockwell block, is not decidable from the screenshot —
the fallback hides which, and removing the fallback is what makes it visible.

**FIXED: a mark that draws ONE number now asks which row it may draw it from,
and the answer can be none.** `data.rowUnderClaim` replaces `rowFor(...) ??
rows[0]`, and the rule is about what the ROWS can contradict rather than about
matching text:

- the subject is in the rows → **that** row, and never another;
- the rows name no subject of their own and there is exactly **one** of them →
  that row. This is the case the plain fix would have broken: *"Why was North
  Edsa up so much last week?"* returns a single row with **no `store` column**,
  because the shop is in the read's FILTERS, not in its data. Nothing in that
  row can disagree with the claim;
- anything else → **null, and no number is drawn**. Rows that name subjects and
  do not name this one say the block is about something the read does not hold.
  Several unnamed rows say the read is not about one thing at all.

Where the figure was, the tile now says *"George composed this from Greenhills,
which this read does not carry"* — and it keeps its title, its own caveat and
its source line, because all three of those were still true. `Missing` replaces
a whole tile and was the wrong shape for this; `MissingRow` is the same
sentence in the one place that was lying.

**Held over the recorded runs, and the old code fails 7 of them** — the
screenshot rebuilt exactly (Greenhills over a Rockwell-led read: no `.r-mk-num`,
no "206,800", no "Rockwell"), plus every read in `__fixtures__/recorded-runs.json`
that returned rows, captioned with a subject none of them holds. Six of the
seven failures are real reads from real runs, not a pair I thought of. The
reads whose rows name several subjects are also checked the other way: each
named subject draws **its own row's** figure.

**1,127 → 1,148 vitest, typecheck clean.** Which way round the original mistake
was — a Greenhills claim written onto a Rockwell read, or a Greenhills block
composed against one — is still not decidable from the screenshot; it is now
**visible on the board** the next time it happens, which is what the fallback
was hiding.

### 2026-09-15 · two different colours of black

> and why are there 2 different colors of black here? a navy ish and a more
> greyish?

Asked of `f8762a4`, the board an hour after P2.l, with a screenshot of the
lead tile's tail, the two ranked tiles and the two figure tiles.

**What the room actually declares, measured rather than eyeballed:**

| surface | value | what it is | hue |
|---|---|---|---|
| `--ground` | `#0B0B11` | the page | blue over red by 6 |
| `--card` | `#14141C` | a tile you READ | blue over red by 8 |
| `--paper` over the ground | `#121218` | a COOLED tile (`.r-tile--quiet`) | blue over red by 6 |
| `--sunk` | `#1B1B26` | rail buttons, the send button, a mention menu | blue over red by 11 |

**So the room's own two tile blacks are not it.** A read tile and a cooled tile
are `#14141C` and `#121218` — two units of lightness apart, the same hue. That
is a difference you can measure and not one anybody would call navy against
grey.

**The likelier answer is that there are TWO PALETTES in this app.** The
pre-room BI components carry their own dark family — `#1c1e26`, `#252833`,
`#2e303d` (`components/analytics/*`), which is a cool GREY — against the room's
`#0B0B11`/`#14141C`, which is violet. Navy against greyish is exactly that
pair. It is the same root as *"it doesnt feel like its from the same app and
its beacause its not"*, already carded as **P2.k**.

**HE SENT A SECOND SHOT AND IT SETTLED IT — the table above was measured
right and read wrong.** *"look its still different shades of black"*, with the
four tiles side by side: the left column visibly lighter and greyer than the
right. That is `--card` (`#14141C`) against a COOLED tile's `--paper` over the
ground (`#121218`) — the pair I had ruled out as "two units of lightness, you
would not call that navy against grey". **Two units of 255 is a rounding error
in the middle of the scale and a tenth of the luminance at the bottom of it**,
and these tiles are at the bottom of it. The reasoning was arithmetic applied
where perception was the question.

**FIXED: a tile is ONE black.** `.r-tile--quiet` no longer sets a background;
cooled is said by what it does not have — no shadow, and a rule down its left
side. Held by a test that walks the stylesheet and fails unless every
background any `.r-tile` rule sets is `--card`, and there is exactly one of
them. 1,126 → 1,127 vitest.

**The other palette is still there and is still P2.k.** `components/analytics/*`
carries `#1c1e26`, `#252833`, `#2e303d` — a cool grey against the room's violet
— so a BI page beside the room is a second family of blacks. That is the card
about one renderer, not this fix.

### 2026-09-15 · why are the other names not highlighted?

> why are the other names not highlighted? the other charts not colored?

Asked of `e561a29` — the build P2.l put live an hour earlier — with a screenshot
of the morning board: the lead dumbbell with OPUS's name in white and the other
six shops grey, and the two ranked tiles with one coloured bar each (Rockwell
green, OPUS pink) and every other bar grey.

**Both questions have one cause, and it is one function.** `catalogue.colourOf`
takes the row's change AND whether the row is lit, and **an unlit row returns
`flat` whatever the tool measured** (`catalogue.ts:241`). `isLit` is false for
every row except the one the block's `emphasise` names (`tiles.tsx:300`), and
the same lit-ness sets the row's opacity to 0.5, which is what greys the NAME.
So emphasis is doing two jobs at once: it says "this is the one that matters"
AND it takes away the direction the tool declared for all six others.

**On his screen that is six shops whose direction is on the record and not on
the page.** Greenhills, Magnolia, Shangri-La, North Edsa and Fairview each have
a `direction` in the same read that coloured OPUS; the dumbbell draws them in
the colour of no direction. A reader cannot tell "fell, but not the point" from
"did not move".

**It predates P2.l — and P2.l is why it is visible.** `colourOf` has read this
way since P1.e. Until this morning every tile also carried its shop's wash, so
the board was never colourless; take the wash away and the honest state of the
marks shows: colour is drawn once per tile, on one row in seven.

**And he said what it should do**, which is the half a session should not
decide for him: *"i think it should still color each store atleast brighter,
cause all stores still matter not full focus on one"*.

**FIXED the same hour, in three places, because it was one rule in three
dimmings.** `colourOf` returns the direction a row's own tool measured whether
it is lit or not; `lit` now decides one case only — a row that declared NO
direction is his mark when he pointed at it and flat when he did not, because
flat is the colour of exactly that. `COOL` went **0.5 → 0.75**, so a row nobody
pointed at is quieter rather than faint. And `.r-mk-name` is the primary ink for
every row, with the emphasised one at weight 600: **one channel says which row
he meant, and it is weight.**

Held by three tests — a cooled row that fell is `--down` and not `--flat`, a
cooled row still draws its bar in the up colour, and a directionless row is
still flat unless it is the one he named. **1,124 → 1,126 vitest, 1,726 pure
unchanged.** Nobody has seen it in a browser; that is the same gap this card
has carried all day.

### 2026-09-15 · what do the colors mean now?

> what do the colors mean now? does this make sense?

Asked with a screenshot of the live build (`51af583`), dark theme: the lead
dumbbell washed amber, a blue tile, two more amber tiles, one teal, pink and
green marks inside them.

**It does not make sense, and the answer is that colour means four things at
once.** Read off the code rather than the picture:

| what you see | what it means | where it is decided |
|---|---|---|
| the tile's background hue | WHICH shop or kind it is about | `identity.ts` — seven shops named by hand |
| how brightly that wash burns | HOW HARD it moved — magnitude, **no direction** | `--i`, \|change\| capped at 30% |
| a dot or a bar's colour | WHICH WAY it moved | `--up` / `--down` / `--flat` |
| the pill | which way, with a sign | same three |

**And three of the seven shop hues sit on top of the three semantic colours:**
OPUS is amber (`222,138,11`) and so is George's own mark and the reserved
approvals accent (`#D2691E`); Magnolia is rose (`224,68,102`) and `--down` on
dark is pink (`255,92,138`); Greenhills is green and `--up` is green.
`identity.ts` names the Greenhills collision in its own docstring and says the
pill handles it — the pill is twelve pixels and the wash is the whole tile.

**This is his seven-shops-seven-hues report from P1.e, one layer out.** That
card took identity colour out of the MARKS and left it on the tile SHELL,
which on the dark theme is `--bloom: 0.62` — the loudest thing on the screen.
The complaint came back at the layer that was left alone, which is the honest
reading of it.

**FIXED by `P2.l`, 2026-09-15.** The tile shell carries no identity and no
magnitude: `Shell` lost `hue`, `change`, `solid` and `george`, the bloom and the
fully coloured tile are gone, and hover, focus and picked are the chrome's own
greys. `var(--hue)` now reaches exactly one selector — `.r-obj`, an OPENED
object, one thing on screen named in its own heading — and `marks.tsx` is its
only caller. The grammar had the same hole one layer deeper and it went too:
`Spec` painted a non-direction column as an identity, so `colour: store` drew
the seven hues inside a composed shape; it is a direction or flat now.

**The brightness question answered itself.** `--i` was |change| with no
direction in it, and it had been **dead since 2026-09-14** — P1.e deleted the
last tile that fed it, so every tile has rendered at `--i: 0.000`, including
the one in his screenshot, and the table above described it as a live meaning
anyway. Read off that build by the new test: `--hue: 222, 138, 11; --i: 0.000`.

`palette.test.ts` and `accentUse.test.ts` now cover the shell instead of
exempting it, and `palette.dom.test.tsx` draws a board of seven shops and all
13 blocks of the eight recorded runs and scans the rendered styles for every
shop hue by value — **15 of its 18 tests fail on the build he was looking at**.
**Not seen in a browser by anybody**, which for a card about what the screen
looks like is the whole shortfall.

### 2026-09-15 · saved pages look really weird

> saved pages look really weird i think theyre broken using old ui elemets

Reported with a screenshot of a kept page, **Estate Week**, opened from Kept on
the live build: headings and figures in a dark blue that all but vanished into
the ground, and the receipts lines drawn as white blocks.

**He was right about the cause.** `/pages/:id` renders `PinnedPage` and the tree
under it — `PinTile`, `ResultBlocks`, `Instruments`, `ReceiptsBlock` — and every
colour in that tree comes from **six `george-*` chrome tokens** that were six
fixed hexes describing one surface: a cream page with navy text. The three LIST
screens (Kept, Needs you, Running) were converted to room classes on 2026-09-12
and `RoomShell`'s own docstring says "every class in the three screens is a room
class". True of the lists. **The page you open FROM Kept was never converted** —
164 old-palette class uses, 0 room classes — and nothing said so. The room's
default theme is dark, so navy (`#12233F`) landed on near-black and
`george-paper` (`#FFFDF8`) landed as white pills.

**P2.a made this visible by making Kept a destination.** Keep as page sends you
there; before that, almost nothing did.

**Fixed by the six tokens, not by 164 class names.** They are CSS variables now
(`src/index.css`, as RGB channels so `bg-george-line/40` keeps working),
redefined inside `.room` per theme in `room/room.css`. No class in any component
changed, so nothing on a surface still on cream can have moved, and the light
room is left on the exact hexes it always had — it was never the broken one.

**And the doubled word in the screenshot.** "vs vs previous period": every
`comparisons.*.display_name` already begins with "vs", and `receiptShape.ts`
prefixed another. `room/catalogue.ts` fixed this on 09-14 and this older copy
never heard; both are now checked by the same test.

**What this does NOT do**, and it is the honest half: legibility is not the
redesign. Those are still the pre-P1.e widgets — fourteen shapes where the room
draws six, framed the pre-P1.e way. Drawing a kept page with the room's own
marks is **P3.c**, and this report is the reason to consider pulling it forward.

**It took two goes, and the first one shipped dead.** The comment above the new
block was closed twice, so three lines of prose became part of the selector —
`body reported that ... in one commit. */ .room`, which matches nothing. The
declarations were in the file, in the bundle, and inert, and the page looked
exactly as it had. He asked *"are you sure you fixed it?"* and the answer was
no. **The test is why it got through**: it searched `room.css` for the text
`--g-navy:` and found it. It parses the stylesheet now and asserts the six apply
on a rule whose selector is exactly `.room`, with a general guard that no
selector anywhere has swallowed a comment — both checked by putting the defect
back (7 failures, six naming the dark room).

**Then a third report, the same day, and the important one:**

> ok but still it isnt like what the george showed its not centered its a
> different font, it doesnt feel like its from the same app and its beacause
> its not, so make it

All three named things were real and two were one-liners. **Not centred:**
`.r-column` — what Kept, Needs you and Running are drawn in — had
`max-width: 820px` and no `margin-inline: auto`, which `.r-measure` has carried
since the room existed. One declaration, three screens. **A different font:**
those headings and that one big figure are set in a system serif and the room
has no serif at all, so `george-serif` is bridged to `--sans` inside the room by
the same mechanism as the colours. **And the bars had gone white** — the bridge
mapped `george-navy` to the room's ink, and a ranking's bar was filled with it;
a bar is a mark, not a word, so it has its own token now.

**His third sentence is the one that matters, and it is a card**, not a fix:
*"its beacause its not"*. A kept page really is a different renderer — 1,623
lines from before the board learned its six marks. **P2.k** is that, and it
deletes a renderer rather than adding one.

**And a fourth, once it was centred:**

> ok its good now but dont you think the center is too small? like it should
> occupy more on the center?

820px in a ~1900px window. Widened to its own token, `--measure-list: 1120px`,
beside the board's `--measure: 1320px` — two measures because a grid of tiles
and a list of rows are two kinds of content, and both named so neither is a
number somebody typed into a rule.

**Widening the column alone would have changed almost nothing visible**, which
is the part worth keeping: every paragraph on those screens is `.r-note`, capped
at 62ch, so a wider column moves prose LEFT rather than stretching it. What uses
the width is the one line that is a list and not a sentence — the questions a
kept page holds, joined with `·`, which at 820px was breaking mid-item on "AJI
BARN Reorder". It has its own class now. Prose keeps its measure here and in
the reading, because running an answer the full width of a 1900px screen is the
thing a measure exists to prevent.

**And a fifth, because the first widening missed a screen:**

> it didnt change for the laking page

It hadn't. The talking page is not `.r-column` — it is `.r-measure`, which the
room sizes from **how many objects sit below the lead** (`data-rest`), a rule
added 09-14 answering his own "lots of empty space on the right". That rule is
right while there IS a board. But `data-rest="0"` is true of two different
pages — one lead tile with nothing under it, and **nothing at all** — and only
the first is a board being sized. A turn that read nothing (he was looking at
"Saved as Estate Week", `0 reads · 1 tool`) therefore got the narrowest page in
the room: a 680px strip of chrome, reading and composer in a 1900px window.

`data-board` is the precise signal and was already on the element. With no
board the page is now sized like the room's other non-board screens — one
width when George is just talking — and the reading inside it does not move,
because 66ch is prose and that was decided in P1.c.

`frontend/src/room/keptChrome.test.ts`, 27 cases — and every new assertion was
checked by reintroducing its own defect, nine for nine. One of them checks the
SOURCE ORDER of the new rule, because it has the same specificity as the ones
it has to beat.


### 2026-09-14 · the caveat is forbidden a number, and George keeps trying

Found by reading `verification/p1h-v2.json`'s `warning_detail`, not by a
person. **Not a new fault — P1.h's close-out named it ("the no-digits rule
P1.f already left open"). What was not visible is the SIZE**, because the
close-out's table reports `composition_rejected` and this is
`reading_rejected`, a different row that no table carries.

Across the three recorded v2 runs: **0 → 6 → 8**, and it is now the largest
single warning kind in a run. Total warnings are flat (15, 16, 16), so nothing
regressed — this was always there and is only now countable.

**Six of the eight are one rule**, from `voice.reading.slots`:

    5x  why      caveat carries no digits — it characterises the figures,
                 it never states one
    1x  morning  next carries no digits — same rule

Seven of eleven scenarios trip it: caveats, follow-up, morning, order, taught,
vague, why.

**It is the same question already decided for the claim, asked again one slot
over.** On 2026-09-13 `max_restated_sentences` went 0 → 1 because "a reading
may carry the figure its claim is about" — reciting the board was what needed
forbidding, not citing one figure. The caveat slot still forbids digits
outright, so George cannot write *"19 products had no figure on one side"* —
a count `meta.comparison.not_ranked` returned — and must reach for "roughly
half" instead. **The rule makes him vaguer than his evidence.**

**Not decided here.** Either a caveat may carry the figure it is about, as the
claim may — in which case the slot rule relaxes the same way and for the same
reason — or caveats stay figure-free deliberately, in which case the prompt
should stop asking George for something the validator will refuse eight times
a run. Both are defensible; being refused eight times is not.

Report: `verification/p1h-v2.json`, `warning_detail` where
`reason = reading_rejected`.

**DECIDED: a caveat may carry a figure a read returned, and no other.**
The first of the two readings above, for the reason the second slot was
already decided on 2026-09-13 — `max_restated_sentences` went 0 → 1 because a
reading may carry the figure its claim is about, and what needed forbidding
was RECITING the board rather than citing it once. The caveat sits above the
figures it qualifies; refusing it the count the tool itself returned made
George vaguer than his evidence, which is the one thing a caveat cannot afford
to be.

The slot rule is now `figures: returned` (metrics.yaml `voice.reading.slots`),
checked with the matcher the answer's own gates use (`agent/prose`), so a slot
and a sentence excuse the same dates, day numbers and counts to 31. The model
is TOLD the rule in the slot's own description, which it never was — that is
half of why it kept trying.

**What is still refused is the half that was protecting something.** Replayed
through the new rule, the run's own refusals: **7 of the 8 now stand, and the
one still refused is "the other 87 products that sold are outside this list"**
— 87 is 97 less the ten he named, the remainder arithmetic `prose` catches in
the answer, and no tool computed it. Two further refusals in the same run were
LENGTH, not digits; they are untouched, and the recorded text is truncated at
200 characters so they cannot be re-judged from the report.

A block's `claim` is unchanged and still carries no digit at all: that one IS
an annotation on a mark that draws the figure underneath it, which is what
CLAUDE.md bounds. The reading is not an annotation — it is what George says.

Closed by `0daa0d6`. Verified by replay of `verification/p1h-v2.json`, not
by a new run: the eval costs $1.51 and nothing here needs the model to decide
it. The next recorded run is what says whether the rate falls.

### 2026-09-14 · text overlapping text

> theres also some text overlap but the rest are fixed

**MINE, AND AN HOUR OLD.** The fix above needed `min-height: 0` so the mark's
body could shrink and scroll inside a capped tile — and it was put on EVERY
child of the tile rather than on the one that scrolls. A caveat is a block of
text with nowhere to scroll to, so shrinking it hid nothing; it just let the
words run over the title underneath. Every child holds its size now and the
body says otherwise itself (`.r-tile > .r-mk-body`), named with the tile so it
wins on specificity rather than on file order.

**Two more in the same screenshots, both read rather than reported.**

- **"vs vs previous period"** in a subtitle. Every
  `comparisons.*.display_name` in the definitions already starts with "vs",
  and P1.e prefixed another. Say it as the yaml says it.
- **A table's caption as a row of loose digits** — `OPUS · 0 · 2026-09-13 · 7
  · 2026-09-07 · 7 · 7 · 7`. A column with one value on every row is a fact
  about the table, said once above it; it used to be joined to the title and
  the row count, which gave a bare `0` something to lean on. The frame took
  those, so the values are named now: `store OPUS · on order 0`.

**CONFIRMED ON HIS SCREEN, same day: "ok fixed".**

### 2026-09-14 · the table is cut off, and the page sits left

> should i be able to scroll down on this? and at 100% size theres lots of
> empty space on the right and its not centered

The first sitting on the six marks (`91dec69`, live). **Three faults, all
fixed the same day**, none of them introduced by P1.e — the first predates it
and the other two go back to the room's first layout.

1. **No, you should not have to, and you could not.** A tile caps at 560px and
   hides what overflows; the body inside it never had `min-height: 0`, so it
   kept its full height and was simply clipped — a sixteen-row table ending
   mid-row with nothing to scroll. The mark's body is now the one child
   allowed to give way, and it scrolls. The title, the subtitle and the source
   line never do: a figure whose receipts scroll out of sight is a number with
   no time on it.
2. **The page was not centred and the composer was.** `.r-board` capped itself
   at 1320px with no auto margin; `.r-line` capped at the same width and
   centred. On a wide window that put the answer hard left under a centred
   composer. Both now sit in ONE wrapper, `.r-measure`, so they cannot drift
   onto different axes again.
3. **The board reserved three columns however little was in it.** Multi-column
   balances by height, so one tall table and two short figures fill the first
   two and leave the third empty — which is most of the space you were looking
   at. The count is capped by the object count now, and the measure narrows
   with it: 680px for one thing, 940 for two, 1040 for three, 1320 from four.

**Held by `frontend/src/room/layout.test.ts`**, which reads the stylesheet
rather than the screen — jsdom does no layout, so a dom test could only prove
the attributes are there. There is no browser driver in this repo, so nothing
here was checked by eye from this side.

**CONFIRMED ON HIS SCREEN, same day: "ok fixed".** That covers the scrolling,
the centring and the columns. **It also covers the measure moving with the
board** — a page that resizes between questions was a judgement made without
him, flagged as such, and left alone.

### 2026-09-14 · "i dont really know what im looking at"

> with the widgets i dont really know what im looking at, what visual language
> is better

**ALL FIVE ARE FIXED** — 1 in P1.c on 2026-09-14, and 2 to 5 in P1.e the same
day. The diagnosis stands and is worth keeping: the board was drawing
EXPLORATORY — every series equal weight, colour for identity, nothing
annotated — while George is explanatory by definition, because he has already
done the analysis. So it handed back the look-for-yourself problem he was asked
to solve.

1. **Transactions rendered as `₱1,187`** — a count labelled as money.
   **FIXED in P1.c**, from the UNIT the rows and the read carry rather than
   from the column's name. Six modules call `fmt`, the object panel among
   them, so it was not work the redesign threw away.
2. **Seven shops, seven hues.** **FIXED in P1.e.** Inside a mark colour is
   DIRECTION — four data colours, `up`, `down`, `flat`, and `george` for the
   emphasised row of a read that declared none — and the one that matters is
   lit while the rest cool. Identity keeps its hue where identity is the
   point: the tile's edge and wash, the object panel. `palette.test.ts` reads
   the source and fails on a fifth, proved both ways round.
3. **"the track is the period before · the fill is this one".** **FIXED in
   P1.e**, by deleting the encoding rather than the caption. A **dumbbell** —
   a hollow dot where it was, a filled dot where it is, a line between —
   reads without a sentence under it. `Against`, the bullet that needed one,
   is gone.
4. **`₱556.6 / ₱545.91`** — two numbers, a slash, no labels. **FIXED in
   P1.e.** Every block now carries a title and a line under it saying what was
   measured, over which days, against what, and in what unit — all four off
   `meta`, none of them a figure — and the marks label their own ends. No
   legends anywhere.
5. **Four tiles at equal weight** for a question whose answer is one or two
   facts. **FIXED across P1.c and P1.e.** The reading is a region above the
   board (P1.c) and the marks are its evidence, each framed the same way round
   (P1.e).

**And the sixth thing, which was deliberately not a card: "widgets just feel
like KPIs."** Six of the fourteen kinds were ways to show a measurement, so
George reaching for something found one. The decision then was to fix the
silence, look again, and only decide afterwards whether the vocabulary needs
fewer measurements and more nouns. **Both have now happened** — the silence in
P1.c, and fourteen shapes down to six in P1.e — so this is the thing to look
at next. **The binding never changed**: the model names a read and a field and
can never author a figure.

**NOT CHECKED ON YOUR SCREEN.** The evidence is eight recorded runs rendered
by the real renderer, not a build you looked at. Full write-up with sources in
the report linked from NOW.md section 6.

### 2026-09-14 · a shape George composed is invisible to his next question

Found by a session reading the code during P1.c, not by a person, and checked
against today's code before filing (`agent/surface.board_sentence`).

The board line names every object by `kind`, and it skips any object whose kind
is not in `composition.widgets`. A composed shape's kind is `spec`, which is
not a widget — so a board whose LEADING object is a shape George composed says
nothing about it:

    [On the board: shops (table, quiet). … resolve it against the LEADING
    object …]

The shape is the thing being looked at and the line does not mention it, so
"why?" resolves against a quiet table and a follow-up can only put a second
object beside the one meant. Reproduced with two objects, one `spec` and one
`table`; the `spec` never appears.

**FIXED in P1.d, 2026-09-14**, which is the card that owns the board's travel
with the question. The kind is declared — `composition.composed_kind` — and
`board_sentence` allows it beside the widgets, so a shape George composed is
named on the line like anything else and a leading one is what "why?" resolves
against. A made-up kind is still ignored: the word comes from the definitions,
not from the block. Held by `test_the_board_line_names_a_shape_george_composed`
beside the test that still refuses an `iframe`.

### 2026-09-14 · the gate fails on a share the TOOL computed

Found by P1.c's gate run. `caveats` passed every other trust check and failed
`attribution`, on this sentence:

> "…those account for 75% of the units the plan requests"

`get_replenishment`'s own notice says *"those lines account for 4,764 of the
6,344 units requested, 75% of the plan"*. George quoted the tool, in the
tool's words, and the check read the phrase "account for 75%" as an
attribution share he had worked out.

**A share of a CHANGE is what is forbidden** (CLAUDE.md 10) — a share of a
total the read itself states is a figure with a receipt. As it stands the
check will fail this scenario on every future run, which is how a gate stops
being read. The fix is in `tests/evals/checks.attribution_claims`, not in
George: excuse a share the results account for, the way `grounded_numerals`
already does.

**FIXED 2026-09-14, in the check, and it cost nothing to verify.** Each
pattern now carries whether a receipt could ever excuse it. "Accounts for N%"
is a share of whatever follows — which may be a total the read stated — so it
is excused when N is a figure the results carried, off the same
`allowed_numbers` `grounded_numerals` uses. Nothing else is: a share of a
CHANGE is arithmetic no tool performs, so no row can carry one and a numeral
that happens to match is a coincidence, not a receipt. "82% of the decline
came from ATP" still fails with 82 in the rows. The two are told apart by
which pattern fired, never by reading the figure.

Verified by replaying the recorded run rather than buying another
(`tests/evals/corpus.py`, $0.00): `verification/p1c-gate-2.json` went from
**1 of 4 would fail** — `caveats · ATTRIBUTION account for 75%` — to **0 of
4**, and nothing newly fired on `p1b-final.json`. Held by
`test_a_share_the_read_itself_stated_is_not_attribution_math`.

### 2026-09-13 · George drew the board and never said anything

> i asked how are doing like and those 4 widgets are all the poped up, and then
> i asked for problems and what we can fix and only this one widget popped up,
> no text no george actually talking to me, and also when i ask to look for
> problems all the rest of the widgets still stayed

Four defects in one report, kept together because they came from one sitting
and may share a cause. Screenshots with the owner.

**ALL FOUR ARE FIXED** — 1, 2 and 4 in P1.c (2026-09-14), and 3 in P1.d the
same day, which is what closed this entry. Each is marked under its own
paragraph below.

1. **No prose at all.** "How are we doing" drew four widgets — ATV, net sales,
   transactions, an OPUS hero — and George said nothing. Not a short answer: no
   text. The reading is the product; the widgets are the receipts for it.
2. **Same again on the second question.** "Look for problems and what we can
   fix" drew one attention widget and, again, no words.
3. **The board accumulated instead of transforming.** The four widgets from the
   first question were still there after the second. Feature 2 of the standard:
   a follow-up transforms the workspace, it does not stack under it.
   **FIXED in P1.d** — see the decision and what was built at the foot of this
   entry.
4. **`[object Object]` in a widget header** — `ATTENTION · 16 ROWS ·
   [object Object] · · NO`. Something is being stringified that is not a
   string, and the double separator says a field beside it is empty too.

**Cause of 1 and 2, found 2026-09-13 and NOT the first hypothesis.** It is
not the figure gate — that is bounded, one corrective turn and the answer
stands. It is `room/board.ts editsFor`:

    if (composed?.length) return [...seeded…, ...composed];   // his blocks ONLY
    if (seeded.length) return seeded;                          // the seed ONLY
    const out = turn.text ? [ a text tile ] : [];               // fallback

**George's prose reaches the board ONLY as a `text` block he composed.** The
fallback that turns his answer into a reading tile fires only when NOTHING
composed. So a turn that composes figures and omits a text block drops the
answer on the floor: it is in the turn, the board has nowhere to put it, and
the person sees shapes and silence. The screenshots show exactly that — ATV,
net sales, transactions, an OPUS hero, and not one word.

The server-side default composition (`defaultComposition`) has the same hole
on a path nobody chose: if the seed carries no text block, the same silence
happens without George having decided anything.

**The fix is a floor, not a nudge.** A prompt line asking him to remember the
text block is the same class of instruction the compose coercion work already
rejected — the board should not be able to lose the answer. Draw the reading
whenever `turn.text` is non-empty and no composed block already carries it,
at whatever weight George's own blocks leave free. Then a forgotten text block
costs placement, never the answer.

**AGREED FIX for 1, 2 and 6 — one change, and it is a SUBTRACTION.** The
owner, on seeing the reading drawn as a tile: *"putting the text in a widget
it just doesnt work."* He is right, and the code already agreed with him:
`render.tsx` has a special case that drags the reading out of wherever George
weighted it and pins it beside whatever leads, with a comment saying that
otherwise "the sentence explaining it ends up three columns away from the
thing it explains". That hack exists because prose is not a peer of a tile.

A tile is something you look at; a reading is something you read, and it is
ABOUT everything else on the board — a layer above the objects, not one of
them. Boxed, it becomes a peer of the things it interprets, which is what
makes the screen a dashboard with a caption.

So: **remove `text` from the widget vocabulary.** The reading becomes a
permanent region of the turn — one paragraph, top, reading type, no border,
full measure — with the objects below it as its evidence. Then it cannot be
forgotten (George no longer composes it), cannot be evicted (it is not an
object competing for space or subject to expiry), and cannot be boxed. The
renderer's special case and `TextTile` both delete themselves, and the turn's
caveats sit above the reading where they already belong.

**Do NOT implement the floor as "draw a text tile when one is missing."** It
would fix the silence and cement the thing that feels wrong.

**3, the board accumulated — DECIDED 2026-09-13, and not by the owner.** He
was asked to choose and answered that he cannot describe what he wants, which
is fair and is the session's job anyway (see NOW.md 1). So, decided here with
the reasoning, and reversible:

**A question that shares no subject with the board clears it. A question that
names a subject already on the board adds to it.**

Why that way round: the only evidence we have is his complaint, and his
complaint was that stale tiles STAYED. Defaulting to what he observed as
wrong is the safer error. "Compare with OPUS" while looking at OPUS keeps the
board because OPUS is on it; "look for problems" clears it because it shares
nothing. The subject comparison already exists — `surfaceAnchor` relates
subjects as same / expanded / narrowed / disjoint, and disjoint is the clear
case. **If clearing turns out to feel abrupt, the fix is to let cleared
objects fade rather than vanish, not to go back to keeping them.**

**BUILT IN P1.d, 2026-09-14, and in two halves because the complaint has
two.** `board.ts travel` compares what the question is about with what the
board is about — the subjects a block named, and the scope its read was
filtered to — and clears when they share nothing. Where NEITHER side names a
subject both are about the whole estate, so the business decides instead:
widening from a shop to the estate is one piece of work, and "look for
problems" after "how are we doing" is not. What the person KEPT survives the
clear, as it survives expiry.

The other half is that a question which DOES share a subject rightly keeps
what was there, and four turns in the finding is one tile among nine. So
`folded` takes everything the newest turn did not touch out of the drawing and
`Earlier.tsx` draws it as one quiet line above the reading, which opens. The
BOARD still holds every object — this folds the screen — so the next question
still travels with all of them. Held by `board.travel.test.ts` (both Done-when
cases, and the four-shop stack) and `Earlier.dom.test.tsx`.

The case to watch when you next use it: **"and OPUS?" while looking at
Rockwell now clears the board**, because two shops that share nothing are two
questions by this rule. If that feels wrong, say so — the fix is to fold
rather than clear, and it is one line.

**4, `[object Object]` in `ATTENTION · 16 ROWS · [object Object] · · NO`** —
a value that is not a string is being interpolated into that header, and the
doubled separator says the field beside it is empty too. No design in it.

**FIXED in P1.c, and it was two lines of one function.** `fmt`'s last line was
`return String(v)`, and a brief row carries two objects — `receipts` and
`threshold_applied`. `String({})` is "[object Object]"; `String([])` is the
empty string, which is the doubled separator beside it. A value a person
cannot read is now drawn as one that has none (`—`), a list of plain values
reads as a list, and a tile's caption no longer offers a column it has nothing
to say about. Held by `format.test.ts` and by a tile test over attention rows.

**1 AND 2 FIXED in P1.c, as the agreed fix says: `text` is gone from the
vocabulary.** The reading is a region above the board drawn from the turn's
own words (`frontend/src/room/Reading.tsx`), so George no longer composes it,
cannot forget it, and cannot box it. `TextTile`, the renderer's special case
and the grammar's `prose` mark all deleted themselves. A turn that says
nothing is now a gap the loop records (`answer_without_prose`) rather than a
silence only the owner could report. Held by `Reading.dom.test.tsx`.

### 2026-09-13 · every gate answer now carries no figure at all

Found by the gate run that verified the fix above, not by a person — and it is
a finding about the SUITE as much as about George.

All four gate scenarios (`caveats`, `why`, `cannot`, `morning`) passed every
trust check and then failed one assertion: `grounded_numerals` is empty. Not
one figure any tool returned appears in any of the four answers. The suite
calls that "a shrug".

**The mechanism is visible in the run and is not a mystery.**
`voice.restatement.max_restated_sentences` is **0**, and everything a turn
reads is drawn on the board — so any figure George could cite IS a drawn
figure, and the restatement gate rewrites the answer to take it out.
`restated_figure` fired on three of the four, and the standing answers carry
zero numerals between them. **The two checks ask for opposite things**: say no
figure the board draws, and say at least one figure a tool returned.

This is v2's first recorded live run, so there is no earlier number saying it
ever passed — `grounded_numerals` landed in `bfb168f` and no recorded report
before `verification/dogfood-remainder-caveats.json` carries stored evidence to
replay it against. Nothing here was caused by the fix above: the new gate
(`enumerated_remainder`) fired on none of the four turns.

**Not fixed here, because it is a decision, not a bug.** Either the board is
allowed to be the only place a figure appears — and the assertion is wrong —
or a reading is allowed to carry the one or two figures it is ABOUT, and
`max_restated_sentences: 0` is wrong. That is the same question the widgets
entry below is circling, and it should be answered once, for both.

Report: `verification/dogfood-remainder-caveats.json`.

**FIXED in P1.c, 2026-09-14 — by deciding it, which is what this entry asked
for.** `voice.restatement.max_restated_sentences: 0 → 1`. A reading may carry
the figure its claim is about; a second sentence walking the rows is the
recitation, and that still costs a rewrite. The prompt says the same thing in
the same direction ("name the figure your point rests on").

Measured on the same four scenarios, one draw each, against
`verification/dogfood-remainder-caveats.json`:

| | before | after |
|---|---|---|
| cited a figure a tool returned | 0/4 | **4/4** |
| restated sentences in the standing answer | 0,0,0,0 | 1,1,1,1 |
| led with a reading (STYLE, flaps) | 4/4 | 2/4 |

The middle row is the point: every standing answer now carries exactly the one
figure its claim rests on, which is the allowance and not an accident. The
correction still fires on the first draft in three of four — as it did in
three of four before — and what it takes out now is the recitation rather than
every figure in the answer. Report: `verification/p1c-gate-2.json`.

**What it cost, said plainly: `leads_with_reading` went 4/4 to 2/4.** "It
wasn't up — North Edsa fell 2.8% last week" is a reading whose first sentence
carries the figure it is about, and that check is "the first sentence carries
no figure". The two now pull against each other by design. It is a STYLE rate,
not a gate, and it is left standing rather than quietly relaxed.

### 2026-09-13 · two trust failures the twelve caught, that George filed himself — FIXED in 235d236..HEAD

Found by the P1.b run of the twelve, not by a person — but an error the evals
catch is a defect report like any other, and neither is explained away by the
run being one draw. The run immediately before, on code differing only in when
a default composition frame fires, had both at zero.

1. **A figure in prose that no tool returned** (`why`). "…48 sold last week
   with nothing in the week before (Aji Cuttlefish Japanese, Aji Golden Plum,
   Aji Squid Hokkaido Slices **and 45 others**)". 48 minus the three he named.
   The subtraction is his, the receipt behind it is not — and the figure gate
   did not catch it because 45 is not a restatement of anything on the board.
   This is the same class as the "800 grams-worth" defect closed the same day:
   arithmetic in prose is the way past a gate that checks quoting.
2. **A caveat had to be FORCED, and a table name reached the answer**
   (`caveats`). `notice_forced: true` after two corrective turns, and
   `warning_stock` — an internal column — printed in George's own words.
   Forced has been 0 across every recorded run until this one.

Report: `verification/p1b-final.json`, scenarios `why` and `caveats`.


**BOTH FIXED, and the second report was wrong about where the leak was.**

**1. The figure with no receipt — `enumerated_remainder`, the third gate.**
"and 45 others" is 48 minus the three he named, and neither existing gate could
see it: `restated_sentences` fires on a drawn figure said again, and 45 restates
nothing; `misstated_figures` fires on a drawn figure rounded off, and 45 is a
rounding of nothing. Both ask *what is on the board*, and this number is on the
board nowhere.

**What fires is the CONSTRUCTION, not a missing row.** A count that sits beside
"others", "more" or "the other" is by definition what is LEFT once the writer
chose how many members to name — no tool can ever have returned it, so the
shape is the proof. Rows are consulted only to EXCUSE, exactly as the rounding
gate excuses an exact match: a drawn delta reading as "45 more" is the board's
own figure and is left alone. **An ordinary ungrounded numeral still sails
past.** That is `ungrounded_numerals`, it is an eval, and CLAUDE.md rule 9
keeps it one. Vocabulary in `voice.enumerated_remainder`, gate in
`agent/prose.enumerated_remainders`, sharing the restatement gate's one
corrective turn rather than buying a round trip. Kind twenty-two.

**2. The forced caveat, and `warning_stock` — which was NOT in George's words.**
The report said the column was "printed in George's own words". It was not. His
prose read *"the shop's low-stock warning level has never been set on a single
product, so nothing can ever be flagged as low"* — the caveat, said better than
the notice says it. The column name is in the `**Caveats**` block the LOOP
appended, which is the notice `message` verbatim.

So one cause, two faces. The fingerprint's first group held
`[threshold, thresholds, warning_stock]` and he wrote "warning level", so
`_unsurfaced` reported the caveat missing, spent the corrective turns, and
forced it — and the forced text was
`"inventory.warning_stock is NULL on 100% of rows"`, interpolated into a
reader-facing message from `inventory.low_stock_blocked_reason`.

Both halves closed. The fingerprint now holds the words a person uses, and
`warning_stock` came OUT of it — **a fingerprint an answer can satisfy by
naming an internal column rewards the leak the notice contract exists to
prevent** (`metrics.yaml` came out of `definitions_drift` for the same reason).
The reason string is now the reader's sentence, with the schema's version of
the same fact in `guidance`, which is never rendered.

**Two more live leaks of the same class, found while checking and fixed with
it**: `objects.thin_reasons` named `purchase_orders`, `stock_transfers` and
`received_qty` in a notice message, and a ratio's undefined notice read "the
denominator (transaction_count) is zero". The literal scan in
`test_prose_contract` could see none of the three, because each is assembled at
runtime from a literal and a yaml value. It now checks those values directly,
on one property: **reader prose contains no snake_case**.

**Numbers.** Pure suite 1,497 → 1,535 passing, 30 skipped, 0 failing (+38:
`test_enumerated_remainder_contract.py` is 31 of them). Frontend room suite 103
passing. Gate run, four live turns, $0.64: `ungrounded_numerals` [] on all four
(was `["45"]` on `why`), `notice_forced` false on all four (was true on
`caveats`), `internal_vocabulary` [] on all four (was `["warning_stock"]`). All
four still fail one OTHER assertion, filed as its own entry above.


### 2026-09-13 · George put a weight in the answer that no tool returned — FIXED in cedd6b3..HEAD

> asked "What should I look at today?" — "nothing sells 800 grams-worth of one
> line and then some"

**The figure was 801.** `tools.attention` drew the sampaloc line as
`was: 801.0, now: -211.0`; George wrote 800. Rounded to read better, which
makes it a number the receipts behind it do not match.

**Correcting my own report.** It said `800` appears nowhere in either call's
payload. That checked the ARGUMENTS: `ops`-side eval reports store only
`seq, tool, arguments, error, row_count`, never the returned rows. The
conclusion held — the eval's own check reads the full results and is the
authority — but the evidence quoted for it did not.

**The cause, and it is the interesting half.** The loop already gated figures
in prose: `restated_sentences` fires when the answer quotes a figure the board
draws, and the turn is rewritten. It matches at the precision written, so

    "801 grams-worth"   gate fires   -> rewritten, figure comes off screen
    "800 grams-worth"   gate SILENT  -> the wrong figure ships

**Imprecision was the way past the guard**, and the further off George was the
safer he was from it. Nothing in production saw it; the eval caught it offline,
on the one run in three where it happened.

**The fix.** `agent/prose.py` gains `misstated_figures`: a prose numeral that is
a drawn figure rounded off — deterministic, bounded by how many of the drawn
figure's own digits survive (`voice.misstatement`, two), so 801 as 800 is caught
and 801 as 1000 is a different number and left alone. It shares the restatement
gate's one corrective turn rather than spending a round trip, records its own
gap kind (`misstated_figure`, the twenty-first), and the correction names both
numbers: "you wrote 48200; the figure is 48210".

Still only about figures the board DRAWS — CLAUDE.md rule 9's line is intact,
and nothing here asks whether a figure absent from the board came from a tool.

20 cases in `tests/test_misstated_figure_contract.py`, seven of them driving the
real loop. Four eval runs since: the ungrounded figure has not recurred.


### 2026-09-13 · a failed save records only the name of the exception

> The workflow could not be saved: ProgrammingError. The answer above is
> unaffected; tell the user it did not save.

Twice, 2026-09-03 23:47, both on "add top sellers by sales not units, i value
sales more". The owner was told it did not save, which is correct behaviour —
raw diagnostics must not reach an answer (UI rule 4).

But the gap row records the same sanitised sentence, so **what actually failed
is not recoverable from the log at all**. `routes/george.py:1714` formats
`type(exc).__name__` and drops the exception. A defect feed that records that a
write broke, and nothing about how, cannot be swept. The message to the model
is right; the row written beside it should carry the cause.

**Cause.** Nothing was ever lost. Every failing route already raises
`from exc` — 23 of them — so the real exception has been sitting on
`__cause__` since the first commit and read by nobody. The loop turned the
exception into one string, `str(exc)`, and that string was both what the model
was told and what the gap row recorded.

**Fixed** in `agent/loop.py`. A refused or failed call now carries the cause
out beside the sanitised sentence, and `run()` strips it before anything the
model is sent is built. The gap row records the sentence FIRST — so a
truncated row still says what the model was told — and the cause after it.

**A credential in a cause is redacted.** A connection error carries the URL and
the URL carries a password; the gap log is a row a person reads, so it gets the
same rule as a shell probe.

**Two things this nearly got wrong**, both caught by testing the fix rather
than trusting it. `_truncate` returns the SAME dict when the rows fit, and a
refusal has no rows — so the payload the model is sent IS the payload the
diagnostic travels on, and only the strip separates them. The first version of
the leak test asserted on the SSE frames instead, and **passed against a loop
with the strip deliberately removed**; it now asserts on what the client
recorded being sent, and a mutation check confirms it fails without the fix.
The second was a sentinel collision: the tool schemas are part of every
request and contain ordinary English, so searching them for "does not exist"
matched a `get_sales` parameter description.

9 cases in `tests/test_gap_diagnostic_contract.py`, including a guard on the
guard.


### 2026-09-13 · get_dead_stock calls AJI BARN an unknown store

> Unknown store 'AJI BARN'. Valid stores: Fairview, Greenhills, Magnolia,
> North Edsa, OPUS, Rockwell, Shang.

Filed by the weekly sweep of `george.gaps`, not by a person — three turns,
2026-09-03 18:46 to 2026-09-04 00:49, every one of them the owner trying to
build the BARN reorder workflow ("Let's build a reorder workflow for AJI
BARN. What's moving, what we're holding, what's already on order, and what's
dead").

The exclusion is deliberate and right: `tools/dead_stock.py` scopes to
`stores.active_retail` because BARN's quantities are dispatch counters, not
stock, so "held but not selling" means nothing there. The refusal is what is
wrong. It says the warehouse does not exist and lists seven shops, so George
cannot tell the owner *why* — he can only guess, in the middle of the one
workflow the owner was actually building. A deliberate exclusion should refuse
in its own words and name the reason the tool already documents.

**Cause.** `_common.resolve_store` had one refusal for two different mistakes.
A name it could not find in the scoped catalog was reported as not existing,
whether it was a typo or a store deliberately left out — and ten tools scope a
catalog, so every one of them told the owner the warehouse was not a store.

**Fixed** in `tools/_common.py`. A name that resolves anywhere in the estate is
now refused as OUT OF SCOPE, naming the group it is in and the reason the
calling tool declares; a name that resolves nowhere is still unknown, because
that is a different mistake with a different fix.

**Three tools exclude the warehouse, for three different reasons**, and one
shared sentence would have been wrong for two of them. Each now passes its own,
read from `definitions/metrics.yaml` rather than written into the tool:

    get_dead_stock     dispatch counters, not stock — a dead list would be noise
    get_sales          records no transactions; the shops record the sales
    get_replenishment  what a plan ships FROM, never a destination

`dead_stock.barn_excluded_reason` already existed and nothing read it. The
other two were written for this.

Non-trading rows — Aji Packing, AJI ONLINE, the vending locations — are named
the same way rather than denied.

Checked live against the real database: all three refuse in their own words,
and an in-scope read is unchanged (7 stores, 3 dead-stock rows for Rockwell).
17 cases in `tests/test_store_scope_contract.py`.


### 2026-09-13 · George is marked down for saying what he cannot see

> I can't see foot traffic anywhere — nobody counts people through the door,
> only tills. The closest thing is transactions, and Rockwell's were up on the
> week to 6 September against the week before; that's sales made, not people
> who walked in, so a busier shop that sold less would look identical.

Filed from the P0.3 eval run, not by a person — twelve questions, real model,
real reads, 2026-09-13. That answer is George at his best: asked for foot
traffic, he refuses, names what the data is instead, and says what the
substitute would hide. It is exactly what CLAUDE.md rule 10 asks for.

He got a `transaction_wording` gap for it. `agent/surface.py
transaction_synonyms` matches whole words from
`surface.prose.transaction_synonyms_not_established` — customers, people,
visits, visitors, traffic, footfall, shoppers — whenever the answer also says
"transactions". It has **no notion of negation**, so "that's sales made, **not
people** who walked in" trips the same wire as calling transactions footfall
would. The check cannot tell a leak from a refusal that names the thing being
refused, and the refusal is the behaviour we want most.

Checked against today's code before filing, per the P0.5 rule: the scan is
live and unchanged at `agent/surface.py:436`.

**The other hit in the same run is probably real**, which is why this is worth
separating rather than switching the check off: on "No — I meant last week",
George wrote *"this was footfall through the till, not bigger purchases"* — and
"footfall through the till" really does blur a transaction into a person. One
false positive and one true one, from the same flat word list.

**What the rest of that run's seven warnings were, so nobody files them twice.**
Four `restated_figure` and one `volunteering_over_cap` were the gates working:
every one fired mid-turn, George rewrote, and all twelve final answers ended
with zero restated sentences. They are not defects — they are **five corrective
round trips out of twelve questions**, which is cost, and it is P1.c's number
rather than this log's.

**Cause.** `transaction_synonyms` was a flat whole-word match with no notion of
negation, so the sentence that DENIES the translation tripped the same wire as
the one that makes it.

**What it turned on, in the end.** Not distance. "Rockwell didn't grow, but
customers were up" puts the negator exactly as close to the word as "nobody
counts people" does — three words — and the first is a leak while the second is
care. The comma and the "but" are the whole difference, so the lookback is the
**clause** the word sits in, not the sentence and not a count of words. A
sentence was too wide (it would clear "footfall through the till, not bigger
purchases", where the "not" belongs to the purchases); a word count was too
blunt. `negation_markers` and the bound live in `definitions/metrics.yaml`
beside the synonym list, not in the scanner.

A term is cleared only when **every** use of it is denied. One bare use is
still a leak, however carefully it is disclaimed elsewhere.

**Fixed** in `agent/surface.py`. Checked against the twelve real answers that
produced the report: the refusal is clean, and `footfall` in the "correction"
answer is still reported. 8 cases in `tests/test_surface_contract.py`,
including both real sentences verbatim and the clause-boundary case that broke
the first attempt at this fix.

### 2026-09-12 · "stuff came out but it just disappeared"

> asked "how are we doing" — stuff came out but it just disappeared

**Cause.** The loop treated prose as a preamble whenever the same iteration
also called a tool, and `compose` — the tool that arranges the board — is a
tool. So the sentence George had just written was moved into the collapsed
activity panel every time he arranged what you see: two to four times in a
normal answer, and once more per refused compose, which is 8 of the 12 eval
questions. When the last compose placed few tiles there was nothing left on
screen, because the board's fallback only fires when NOTHING composed.

**Fixed** in `b571b05`. The reset now fires only when a READ is in the batch.
Four cases in `tests/test_interim_prose_contract.py` hold it, including the
exact shape reported. **Committed, not deployed** — it keeps happening on the
live build until Railway redeploys.
