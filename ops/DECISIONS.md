# Decisions

Append-only. One entry per session, ten lines or fewer. The reasoning that the
code cannot say, and nothing else. CLAUDE.md holds the standing rules; this
holds why they got there. The standard itself is `ops/STANDARD.md`.

New entries go here, above the archive at the foot of the file — that archive is
the reasoning CLAUDE.md carried until 2026-09-12 and it stays last.

---

## 2026-09-20 · P6.a/b/d — the canvas, built locally against the target page

The owner, after the target page: *"implement your new page style and test
scenarios locally, i dont want to waste cost."* So: no model turn, the vetted
reads of the day recorded whole, three questions composed in the vocabulary and
rendered through the REAL room (`ops/frames.py --scenes canvas-doing
canvas-stores canvas-products`), beside `ops/ideal/how-are-we-doing-v2.html`.

**THE VOCABULARY WAS MOSTLY THERE, LOCKED INSIDE ONE CHART.** `line` already
drew the period before dotted; `multiples` existed; the arrangement (P3.p) laid
blocks out; steps (P3.r) were the right side. What the target needed and the
room could not draw was four things: a **pointed annotation** (`span` — the
first and last row of a stretch by the rows' own labels, the block's `thought`
drawn on the chart pointing at it; validated against the read, DROPPED and said
when it names a row the read does not hold, because presentation cannot change
a value); the **rows as a list** (`list`, for what a person goes and does
something about); a lead `figure` **at the size of the answer** (44 → 72); and
`multiples` **drawing the change** about a zero line — as values, seven shops'
weeks were seven of the same weekly rhythm and the two weeks every shop lost
were invisible.

**THE FIRST FRAME FOUND WHAT FIVE DOM TESTS COULD NOT, AGAIN.** `r-mk-band` is
the dumbbell's noise-floor band, and Chrome applies its CSS height to an SVG
rect, so the stretch drew as a ten-pixel bar at the head line. Renamed. And the
list named every row after its shop — the open defect of 2026-09-17 — because
`nameKeyOf` prefers the shop; a list names a row by what it IS first.

**HOW HE THINKS IS WRITTEN AND UNPROVEN.** The broad policy is page-first in
one round; the recipe is on `compose`; the prompt is at 1,799 of 1,800. Four
guards that pinned the two-round policy and the six-and-eleven were rewritten
to the decided rule, each naming which instruction superseded the one it held.
Whether HE composes the page is the next live turn's to answer, and by the
owner's rule that turn is his to spend.

**Found on the way:** a day matched by position over thirty days is not the
same weekday (`weekday_misaligned`, raised and drawn).

**Suites:** pure 2,142, vitest 1,119, `tsc -b --force` clean. Frames
`verification/frames/canvas2`.

---

## 2026-09-20 · P3.r — the right side is steps, the prose is the conclusion, and it is short

The owner, after his first live turn on the arranged room: *"it still kinda
feels the same, but now its more of a thread. not a page, and theres alot of
text … bob has to get his answer in the best way he can and i think that is
short concise … are you gonna do it or are you just gonna keep throwing reskins
of our original at me. maybe its not just the ui but the system prompt the way
he thinks. check it all and do it all."*

**HE WAS RIGHT, AND THE REASON IS STRUCTURAL.** Since P3.j the room drew his
paragraphs down the right-hand side with a chart under each one. That is a
thread by construction. Every change after it — step heads, relation lines, the
arrangement, plainer words, the period line — was layered ON TOP of that spine.
Four cards of reskins. The design he approved never had his prose on the right.

**SO, ALL OF IT AT ONCE.** His prose leaves the right side entirely: no beats,
no sentences under the charts they cite (`Room.tsx` sends neither `page` nor
`thoughts`; `bodyOf` puts the whole of it, less the headline and the next, under
him on the left). The right is steps only — question, one-line claim, figure —
and with nothing between them the design's own shape returns: the lead across
the top, the rest in pairs beneath (`render.tsx`; every point spanning was
P3.l's answer to widgets and, with the prose gone, made a single column). A
thought is one sentence (`composition.thought` 260 → 140).

**AND THE BODY HAS A LENGTH THE LOOP HOLDS.** `voice.body`: ninety words, one
corrective turn, then cut at the sentence that crosses it, on the run record. A
length the prompt merely asked for is the length that failed — the LENGTH
section has asked since P0. The slots are drawn separately, so a cut can never
take a caveat. The VOICE section was rewritten to the shape the screen now has
and the prompt sits at **1,797 of 1,800**.

**WHAT WAS NOT DONE.** Whether he composes an `arrangement` is still unread
(george.posts needs a permission). The `say` lines an arrangement places on the
right are still his to place, bounded at six — that is the playground he asked
for, not a return of the paragraphs. And no live turn has run on this build;
the frame is a fixture whose prose the session shortened to the bound.

**Suites:** pure 2,139, vitest 1,114, `tsc -b --force` and `build` clean. Four
tests rewritten to the new rule rather than deleted, each saying which owner
instruction superseded the one it held.

**AND THEN HE SAID IT WAS STILL THE SAME, AND HE WAS RIGHT AGAIN.** Prose off the
right side, steps only, a bound on the body — and the right side was still six
charts of one size in a column with a question on each. The canvas was being
filled with widgets. So the session stopped building machinery and designed the
page by hand: `ops/ideal/how-are-we-doing.html`, then — at his correction that
the reads should FOLLOW the page, not lead it — `how-are-we-doing-v2.html`,
designed from the question and then read for. Two reads on it he had never made
(the estate day by day over two months; what crossed to zero yesterday) and a
needs-you with an action. That page is the target; NOW.md Phase 6 is the work.
Found on the way: a day matched by position over thirty days is not the same
weekday (`weekday_misaligned`, now raised and drawn).

---

## 2026-09-20 · P3.q — a live turn, and the five things it found

The first turn the owner ran on the new build. **The new channels held**: he
used the step heads on every block, used `under`/`relation`, used the day
comparison the tool fix unlocked, and revised a recorded view of his own
unprompted. What broke was all older than this session.

**THE TOOL REFUSAL WAS COVERING A BROKEN JOIN.** `compare_to` with a time
bucket said "a lag series". It is not: the comparison matches the two windows
on the group key, and for `day` that key was the DATE, which two windows never
share. Matched on the bucket's offset from its own window's start, Monday meets
Monday. **And the fix had a bug found by using it** — counted in days,
`last_30_days` by week came back 10 of 10 uncomparable, because a bucket's date
is truncated to its own boundary. Counted in buckets it lines up.

**A NOTICE IS WRITTEN IN PYTHON, SO `voice.plain` DID NOT REACH IT.** The rule
is taught on `compose`, which governs what Bob WRITES; a tool's notice is
surfaced above the answer by UI rule 4 and read as though he had said it. One
said *"449 stock records in this window are NEGATIVE"* over his headline. A
contract test now holds the class and found **eleven**, not one. It reads source
rather than running the notices, which bounds what it proves.

**FOLDING IS A READING OF HIS PROSE, AND A READING CAN BE WRONG.** A seven-shop
chart drew ONE row under the claim "every shop rang fewer transactions" — his
sentence named only the worst of them. Whole is the default now; narrowing is
one tap. Drawing every row a read returned cannot be wrong.

**TWO CHARTS ARE ONLY WORTH LINING UP WHEN THEY COVER THE SAME PERIOD.**
`sameOrder` took the order from the first figure listing shops and imposed it on
a chart of a different week, so Rockwell drew below a smaller figure.

**AND THE PERIOD MOVED ABOVE THE FIGURE, where an answer spans more than one.**
A chart of the closed week sat directly under a headline about this week so far.
Neither was wrong or mislabelled — the period was in the source line BELOW the
chart, after the reader has taken the number in. Where periods differ it is
drawn at the head and LEAVES the source line, so it is read first and still said
once. One period, and nothing changes at all.

**THE AMBER MARK WAS NOT A BUG** and was checked rather than assumed: the mark
wears the accent only in `need`, and a failed turn changes the drawing
(`alive.markStateOf`, `AliveMark`). That is UI rule 5's stated exemption
working. It means an approval is waiting.

**WHAT THIS SESSION DID NOT DO.** `voice.plain` has no runtime check — a figure
said twice is caught, a method said twice is not, and the yaml says
`enforced: false` rather than implying a gate. Figures inside a `row` of an
arrangement split the width evenly and ignore `needsWidth`. And whether Bob
composed an `arrangement` on that turn is STILL UNKNOWN: reading `george.posts`
needs a permission this session was refused, so the side-by-side blocks may be
the older `under` gathering rather than the new channel.

**Suites:** pure 2,139, vitest 1,114, `tsc -b --force` and `build` clean.

---

## 2026-09-20 · P3.p — the right-hand side is his to lay out

The owner, after P3.o shipped and after four template variants were drawn for
him from a saved answer: *"i dont [want] it to just be text chart here this and
heres that, i want it to use that space like its designing its own page or
artifact for its answer. it doesnt have to have text before a chart … it needs
to find the best way to display its answer thats all. in that space its its
playground, but of course it should still feel like the rest of the app."*

**ALL FOUR VARIANTS WERE TEMPLATES, WHICH IS WHY HE REFUSED ALL FOUR.** A
document, steps, steps folded, and what ships — every one a form Bob fills in.
The thing none of them changed is the one he kept naming: **nothing Bob said
had ever reached the ARRANGEMENT.** `beside.placeFigures` dropped each figure
into whichever column was shortest, so "here's this and here's that" was the
literal algorithm, and P3.j's prose order and P3.o's question heads were both
changes to the CONTENT of a slot in a layout he did not control.

**AND THE VOCABULARY FOR IT ALREADY EXISTED, one level down.** `composition.
grammar` has let him build a shape nobody listed — `stack`, `row`, `grid`,
`panel` over marks bound to a read's field — since 2026-09-11, locked inside a
single chart. `composition.arrangement` is the same four layouts applied to the
page: no new word, no second vocabulary, and the grammar's own bounds.

**A LEAF IS ONE OF HIS BLOCK KEYS, WHICH IS THE WHOLE TRICK.** A page of raw
marks would have quietly dropped the receipts, the notice, the read time, the
emphasis and the tap-to-inspect that UI rules 3, 4 and 6 hang off a block. A
leaf names a block, so a figure keeps all of it wherever he puts it —
`drawFigure` is the same function the packing calls, told only that it is not
being packed. His words are a leaf too (`say`), which is the "it doesn't have
to have text before a chart" half, held to the claim's no-digit rule.

**NOT CALLED `page`.** That is one of the eight words and it means a collection
of pins; a second `page` on `compose` would collide with `page_id`,
`view_page` and `george.pages`. The word is the one the complaint used.

**A BLOCK IS NEVER LOST.** One he composed and did not place is named on
`coerced` and drawn after the tree. An arrangement that cannot be understood is
dropped whole and the board packs as before — it is the only one of `compose`'s
four statements that cannot touch a figure, so it never costs a round trip.

**THE FOURTH CHANNEL WAS DECIDED, NOT SLIPPED IN.**
`test_the_tool_is_offered_and_takes_the_board_and_the_reading` exists to catch
a channel arriving without anybody deciding it should. It caught this one, and
was updated with the owner's words as the reason.

**Suites:** pure 2,127 -> 2,133 (+6), vitest 1,104 -> 1,109 (+5), `tsc -b
--force` and `build` clean. Frame `verification/frames/p3p`, off
`ops/frames_fixtures/arranged.json` — the live board of 2026-09-19 with an
arrangement **the session wrote**, said in its own `why`, because no model has
ever composed one. **The first frame found what jsdom could not:** `.r-flow` is
a grid of 1px auto-rows, and his tree inherited it, so every part of the
arrangement landed in the same implicit row and drew on top of the one before.

---

## 2026-09-19 · P3.o — the page says what led to what, and he is told it is a page

The owner, of the right-hand side: *"a group of text and visualizations that
explain its answer and point in the best way possible in a well thought order so
you [see] what leads to what, what means what."* Two things, and neither was
styling.

**THE WORD AND THE PLACEMENT DISAGREED, AND ONLY WHERE IT MATTERED.** A block
naming another as `under` had its relation word drawn off `under`
(`render.tsx`) and its position off the BEAT (P3.j). Same beat, the word sat
over the chart it referred to. Different beats — the common case, because a
point and its explanation are usually two thoughts — the word was drawn anyway,
over a chart whose stem was a screen above. `whatsdown.json`, the live board of
this morning, is exactly that: "WHY" pointing off the edge. It now names the
point in that point's own claim (`relationSaid`), and where the stem has no
claim it says nothing at all — a bare "why" pointing nowhere is the defect, not
a lesser version of the fix.

**HE WAS NEVER TOLD HIS PARAGRAPHS ARE THE PAGE.** Since P3.j the room draws
his prose in the order he wrote it, each paragraph with the reads it cites. He
did not know that: he was writing findings and the room was drawing a path he
did not know he was laying, which is why his answers open on figures the chart
under them already draws. `voice.reading.path` says it, and rides on the
`compose` tool rather than in the prompt — the prompt is at 1,799 of 1,800 and
the budget's own rule is that what it would teach past it belongs on the tool.
Cost: nothing. **Whether it changes what he writes is unmeasured** — it is
behaviour, so only a live run can say, and none was made.

**AND THE FIRST HALF WAS NOT ENOUGH, WHICH HE SAID BEFORE THE SESSION CLOSED:**
*"It looks like ours just a little changed, still some widgets not page."* He
was right, and the design he approved already held the answer in its own
markup: `ops/ideal/bob-ahead-of-me.html` calls a block a **step**, and heads it
with the QUESTION it answers in bold, the answer running on. Read the questions
down the page and you have the investigation. The board had only the answer —
a claim — which is a caption, so four steps of one investigation drew as four
findings. `composition.question` is that field, held exactly as a claim (no
digits: it sits over the same figure), optional, absent everywhere it was never
composed. The bold moves to the question; the claim keeps full ink and full
size, because emphasis adds and never dims.

**A REVAMP WAS OFFERED AND DECLINED, on evidence.** The owner said he was
willing to rebuild the right-hand side outright. Rendered beside it, the
approved design is two columns with the figures on the right — the container
we already have. What differed was one field. The 2026-09-16 review saying the
answer should be one 760px document was written against the SUPERSEDED artifact
and stopped being the target on 09-17; this session cited it before checking,
which is the second time a stale artifact has been quoted as the standard.

**Suites:** pure 2,123 -> 2,127 (+4 cases), vitest 1,099 -> 1,104 (+5),
`tsc -b --force` and `build` clean. Frames `verification/frames/p3o-before`,
`p3o-after` and `p3o-steps` — the last off `ops/frames_fixtures/steps.json`,
the live board with questions **written by the session**, which its own `why`
states, because no model has ever composed one.

---

## 2026-09-19 · P3.j — the unit of the page stopped being the read

The owner, of the live right side: *"it's just kinda like widgets … the page
itself is the composition"*, and, in the same breath, *"keep it generative — do
not replace the current widgets with another rigid layout or template."* Both
halves matter: the fix could not be a second template.

**IT WAS NEVER STYLING.** One call made one block made one card, packed into
whichever column was shortest, so the order you read was column heights. Nothing
on the board knew how any two blocks related, and no restyling can join things
that have no relation. So a block may now name another as `under`, with
`relation: evidence | counter | scale`. The arrangement is derived from that.

**TWO FIELDS, NOT FIVE.** Prominence was already `weight` — *"judgment made
visible"*, set on every block since P1.f — and the room had been writing
`data-lead` into the DOM with no CSS rule reading it. Not-the-answer was already
`ruled_out`; a figure that may be wrong was already a notice. **Rejected:
`because`**, a cause in an enum, which analysis may not invent; **`against`**,
already a block field meaning a gauge's comparison column.

**NO FLOOR, AND I HAD PROPOSED ONE.** I told the owner a read would be lifted
when *"its rows crossed a floor the definitions set"*. `surface.attention` says
`score`, `threshold` and `severity` are `not_supported` — a presentation layer
computing importance is a business definition nobody set. Prominence is Bob's
`weight`, which `ops/STANDARD.md:258` gives him.

**NOTHING REFUSES.** An unresolvable `under`, a second level, a cycle or a bare
`relation` drop with a coercion and the block stands alone — the board exactly as
before. The fallback is the default, not a special case (P1.a's finding: a
layout hint that did not land must not cost a round).

**RECEDING IS SIZE, NEVER STRENGTH.** *"Supporting details recede"* nearly bought
back the fade and the band the owner refused on 2026-09-18. `ink.test.ts` now
fails on any rule giving `[data-under]` or `[data-weight]` an opacity, filter,
ground or colour, and asserts it matched something.

---

## 2026-09-15 — P2.b: a marker is a promise, and so is drawing nothing

An underline already meant "there is something behind this". Nothing meant
either "nothing behind it" or "I have not looked", and the screen chose the
same drawing for both — so a person had to tap a figure to learn whether it
was tappable. A quieter ink for an unplaced figure is not a verdict on his
arithmetic (rule 9 leaves that to the evals); it is the one fact the client
holds. The index after a placed one comes from `readIndexes`, ONE definition
read by the markers and by the trail, because a footnote that counted
differently from the steps would point at the wrong evidence.
**Both scans excuse things they compute, never things on a list**: his words
are excused where they appear in the frames, a machine string where it appears
inside a tool's error sentence. A list would have become the review the scan
replaces. The card's "quiet" is the room's `--flat`; renaming the token would
have been a word changing, not a meaning, so it was read and said, not done.

---

## 2026-09-15 — a costume is not the same app, and he said so

*"it doesnt feel like its from the same app and its beacause its not, so make
it."* Three named things, and his diagnosis is again the right one. Two were
one-liners: `.r-column` never had `margin-inline: auto` where `.r-measure`
always did (Kept, Needs you and Running, all three against the left edge), and
`george-serif` is bridged to `--sans` because the room has no serif. The third
was mine: the colour bridge mapped `george-navy` to the room's INK and a
ranking's bar was filled with it, so the bars went white. A bar is a mark, not
a word; it has its own token.

**What I did NOT do is keep dressing it.** A kept page is a second renderer —
1,623 lines from before the board learned its six marks — and every token I add
is a costume on the wrong body. **P2.k**, written today and pulled ahead of the
Phase 3 card that owned this surface, draws it with `room/marks.tsx` off the
blocks `agent/default_composition` already produces for the board and the
replay, and **deletes** `Instruments.tsx` and `ResultBlocks.tsx`.

**Every new assertion was checked by reintroducing its own defect** — three for
three. After shipping a dead CSS rule this morning, a test I have not seen fail
is a test I do not believe.

## 2026-09-15 — a test that reads CSS as text cannot see whether it applies

The token fix above shipped **dead**. The comment above the block was closed twice,
so three lines of prose ending in a second close marker were parsed as part of
the SELECTOR — `body reported that ... in one commit. */ .room` — which matches
nothing. The declarations were in the file, in the bundle, and inert; the room
looked exactly as it had. The owner asked *"are you sure you fixed it?"* and the
answer was no.

**The test is why it got through.** It asserted `room.css` CONTAINS
`--g-navy:`, and it did. A string search cannot tell a live rule from prose the
parser threw away. It now parses with postcss and asserts the six apply **on a
rule whose selector is exactly `.room`**, plus a general guard that no selector
anywhere in the stylesheet has swallowed a comment. Both were verified by
reintroducing the defect: 7 failures, six of them naming the dark room.

**The rule this is an instance of:** a check on a FILE is not a check on
BEHAVIOUR. `accentUse.test.ts` and `palette.test.ts` read source as text too —
they are scans for a forbidden token, where presence is the whole question, and
that is sound. This one was asserting that something WORKS.

## 2026-09-15 — the kept page: six tokens, not a hundred and sixty-four classes

*"saved pages look really weird i think theyre broken using old ui elemets"* — and
the cause is that `/pages/:id` was never converted. The three LIST screens became
room classes on 09-12 and `RoomShell` says so in its docstring; the page you open
FROM one of them is `PinnedPage` and its tree, 164 old-palette class uses and 0
room classes, rendering fixed navy-on-cream inside a dark chrome. **P2.a made it
visible by making Kept a destination.**

Every colour in that tree comes from **six** `george-*` chrome tokens and there
is not one hardcoded white in it, so the tokens are the lever: CSS variables in
RGB-channel form (which `bg-george-line/40` needs), overridden inside `.room`
per theme. **No component changed**, so a surface still on cream cannot have
moved, and the light room keeps its exact hexes — fixing the theme he was not
looking at would be a second change in one commit.

**`--g-line` is deliberately not `--edge`.** `border-george-line` is written
bare far more often than as `/40`, and white-at-0.07 as a bare channel is pure
white; the value is the hairline that alpha lands on instead.

**This buys legibility and claims nothing else.** They are still the pre-P1.e
widgets. Drawing a kept page with the room's marks is P3.c, and this is the
argument for pulling it forward.

## 2026-09-15 — a green suite on one laptop is not a green suite

P2.0's `test_there_are_recorded_v2_reports_to_reason_about` asserted that
`verification/*-v2.json` exists. That directory is **gitignored** — correctly; a
recorded run carries real rows off the estate — so in CI the glob is empty, the
parametrized scan collapses to one "empty parameter set" SKIP, and the guard
written to catch exactly that failed the build. Red on `main` from `13795bb`
until today, and only visible because this was the next push. Reproduced in a
clone of HEAD (1 failed, 1 skipped), fixed, re-run there green.

The rule is about the FORMAT, so it is now held against **two fixtures the
repository carries**, one of each kind, synthetic — and the local reports are
scanned as well where they exist. **A skip could not be the answer**:
`ops/verify_integration.py` counts any skip in the pure suite as the suite not
having run, so a skip fails just as loudly and says less.

**What this costs: the pure count differs by machine** — 1,700 in CI, 1,704
where the four runs live. Quote the CI one. P2.a's first close-out said 1,701,
which was true nowhere else.

## 2026-09-15 — P2.a: keeping a thread is one write, through the service George uses

`POST /george/pages` grew `analyses` and lost its own create path: BOTH cases now go
through `page_operations.build_page`, so a button and a sentence cannot drift into two
sets of bounds — and a page that came into being with four of five sections is a page
nobody asked for. The route stays `USER`; a page event saying `george` would answer
"who moved this" with the wrong name. **The Page view states the refusals before the
request**, which is why `keeping.ts` sorts argument keys recursively: the service keys on
`json.dumps(sort_keys=True)`, and a shallower prediction is a 422 the person could have
read in advance. A **new `thread_id` scope** on the pins listing is how a thread finds its
page — pins carry a conversation, a thread is a list of them — and two scopes on one
listing is refused rather than one silently winning. **Deliberately not built:** merging a
second keep into the existing page. It says a second keep makes a second page instead.

## 2026-09-15 — P2.0: a verdict is written by the runner, never handed to the recorder

`Report.add` loses its `passed` argument entirely rather than gaining a "write it
later" rule. A record is still written before the first assertion — a failing
scenario is the one worth reading — but at that moment nobody knows the outcome,
so nothing may claim one: `tests/evals/conftest.py` writes it off
`pytest_runtest_makereport` when the test body ends. Three-valued, because a run
that stopped early did not fail what it never ran. **The four v2 reports are not
rewritten**; the score was never recorded, so absence of the new `scoring` block
is the marker and `corpus.py` prints it. The `done`-frame key list is now a
declaration held by AST against `agent/loop.py`, which caught `cache_hit` and
`cache_measured` being dropped by every report so far.

## 2026-09-14 — Fable review of P1.✓: every number holds; the gate's evidence is thinner

Recomputed from `p1close-v2.json`, the ledger, the prompt and schema hashes, the `agent/`
diff and both suites: nothing in the close-out is wrong. Do not trust: **760 ms** is `run_call` timed in-process from a
laptop — no HTTP, no browser, no render, never seen on the live build — so the gate's third
condition is met by a unit timer. **19.0 → 17.1** includes `correction` reading NOTHING at
low effort (0 calls, 5.3 s; was 4 calls, 16.9 s), and low is most turns in a one-thread UI
(≤ 8 words with history). **Effort is unobservable in production**: not persisted, and a
revoked beta pins the process to high under `api_retry`. **Five empty days are vacuous if he
does not use the room.** **Opening a thread appends to the post record** (restore runs
through `/replay`, which records) while the route comment says "transient". Not filed in
the log: none is in his words, and an Open item resets the gate clock.

## 2026-09-14 — P1.✓: three of eight, and a measure that stopped measuring

Phase 1 met three targets and missed five, and four of the five misses are one
fact: a question reaches the model, the model reads, then it thinks about what
came back. 17.1 s and 3.0 round trips are what that costs. **No card left in
this plan can reach < 10 s on a question**, and the honest reading of the
phase's central assumption is that latency was worth attacking — 27.4 → 17.1
— and was never the whole complaint.

**Label share is retired as a target in that form.** It read 36% today against
29% at P1.f while the label calls FELL 13 → 10; total calls fell faster. A
ratio whose denominator is reads goes the wrong way when George reads less,
which is the behaviour the phase was buying. Count it per turn or not at all.

**A report that cannot say whether it passed is not a record.** `passed` is
written `False` before the assertions run, so every v2 report on disk claims
eleven failures over runs pytest scored 11/11 — and "read a recorded eval,
never re-run it" rests on the file being readable. Left as a card, because
changing it changes what four existing reports mean.

## 2026-09-14 — P1.j: the vocabulary is what is on screen

A typed fragment resolves ONLY against the tokens drawn, and that is the whole
safety argument. The alternative was a keyword list, which would be a client
deciding not to consult the model on words nobody can see; this way the
vocabulary is exactly what a person is looking at, typing and tapping are one
mechanism with two doors, and the failure mode is a model turn — what would
have happened anyway. Ambiguity is a question: two tokens answering to one word
goes to George rather than being settled here.

A token may not offer what the call will refuse. `net_sales` declines a product
grouping, so `group_by` alternatives are the METRIC's own `valid_group_by`,
intersected across every read the token moves. "Products" on a sales board
stays George's question — the ladder localizes through a different metric, and
a replay changes one argument of one call and never the measure.

## 2026-09-14 — P1.h: a gate that deletes, and the one gate that must not

Effort belongs to the turn, not to the process, but it cannot ride the request:
a top-level `effort` change invalidates the messages cache and, on some models,
the prefix cache with it — the 9.2k tokens that 139 of 141 turns read back. It
rides a mid-conversation system message instead, so the level moves and every
cache entry keeps matching. The classifier is a branch over the question and
whether a thread is behind it; it chooses one request parameter and can see
nothing George reads, says or is allowed to do, which is why it is a knob and
not the planner rule 5 forbids.

A recited sentence does not need a model to remove it. Deleting is one-way — it
cannot introduce a figure, a claim or a caveat he did not write — so two of the
six gates stopped buying a second answer, and that is where 7 corrective round
trips became 1. It refuses twice: never empty the answer, never take away a
caveat, and where neither deletion fits, the old rewrite still happens.

**The notice gate kept its round trip against the card's own wording, and this
is the decision.** "A model turn only for a false write claim" and "any quality
row moving fails the card" cannot both hold here: `unsurfaced_notice` fired in
2 of the last 3 runs and the model's rewrite fixed it both times, so a
deterministic version forces the caveat in by construction. The Done-when won.
Trading `notice_forced` for a round trip is the owner's call, not a session's.

## 2026-09-14 — P1.f: a menu wider than what it draws, and prose with a shape

Fourteen widget names for six drawings is not a richer vocabulary, it is a
choice at every compose that the renderer then discards. The names are now the
drawings; `subjects`, `form`, `action` and the block-level `note` left with the
widgets they served, and `hero` — the last kind that could not be demoted —
took the last refusal on that path with it. A board outlives a deploy, so
`retired_kinds` keeps the old names drawable and describable while nothing may
compose one.

THE CLAIM IS A HIGHLIGHT, AND THAT IS THE WHOLE SAFETY ARGUMENT. A text slot
that drew a sentence of its own could put words on screen the answer never
carried; one that lights a span of what he actually wrote cannot. So the model
names the few words that are the point, the surface finds them in the answer,
and a claim he did not say draws nothing and is recorded as `claim_not_said`.
Nine of nine landed on the first live run.

THE ROLES WENT BECAUSE NOTHING DREW THEM. primary/driver/breakdown/context
were validated exhaustively on every compose and rendered by no surface the
owner can reach. A channel the screen has stopped speaking is a tax on every
turn, not a guarantee.

And a check that reads its evidence differently on either side of `json` is
worse than no check: `allowed_numbers` could not see a Decimal, so a quantity
quoted exactly read as invented live and clean on replay. Fixed one-way.

---

## 2026-09-14 — P1.d: persisting is what makes it a room, forever is what broke it

A board that never clears is a workspace; a board that never clears is also
four answers to the question before. `travel` compares what the question is
about with what the board is about and clears when they share nothing — and
the clause that actually closes his complaint is the one for the whole estate:
where neither side names a subject there is no intersection to take, so the
BUSINESS decides. Three things would have made it wrong, all caught by the
suite: a default's keys are positional and would have held the board forever;
an edit that only names keys has no topic and would have cleared the board it
was editing; the read identity must be checked before any of it. The fold is
the other half — the board keeps every object, the SCREEN keeps one finding.
"And OPUS?" after Rockwell now clears, which the old P2.b wanted to transform;
left as the log decided, with the reversal written down.

A share of a TOTAL the read states has a receipt; a share of a CHANGE cannot.
The gate could not tell them apart, so it failed a true sentence every run —
which is how a gate stops being read. Told apart by which pattern fired, never
by reading the figure, and verified by replaying a run already paid for.

## 2026-09-14 — P1.c: a reading is not a peer of the things it explains

The reading left the widget vocabulary, and the `prose` MARK went with it —
the grammar would otherwise have drawn the same answer a second time inside a
box, which is the shape the owner said does not work. A `text` block stored
before today is dropped by the board rather than drawn, so old threads read
once. The room's empty test was `board.length === 0`, so a turn that read
nothing and only spoke threw the answer away; it is now "no objects, no words,
no caveats".

`max_restated_sentences: 0 → 1` took cited figures on the gate from 0/4 to
4/4, each answer carrying exactly the one its claim rests on. The lever was
not the number: it was telling the correction what must SURVIVE the rewrite.
Cost: `leads_with_reading` 4/4 → 2/4, because the claim sentence now holds the
figure — the two checks pull against each other by design, and the style one
is left standing rather than relaxed to make the card look clean.

`fmt` guessed money from a column name and `value` was in the pattern. Units
are data the rows already carry; the name is now consulted only where it names
money itself. A gate run made with `-x` costs a third of the price for a fifth
of the signal — four scenarios is the unit.

---

## 2026-09-13 — P1.b: the board was never empty, only shapeless

The card said the board fills when George composes. It does not: `editsFor`
has always drawn a quiet table per read while a turn is in flight, so time to
first visible object is **7.0 s median before and after** — unmoved. What moved
is the first COMPOSED object, 16.8 s → 8.2 s. **The 2 s target is missed 3.5x
and this card cannot reach it**: both numbers are bounded below by the first
model round trip plus the read, and the fastest object in the twelve is 4.3 s.
Only P1.d, which skips the model, can go under 2 s.

The default goes through `compose.validate`, not beside it, so it cannot say
anything George could not; it is kept out of `_drawn_on_the_board`, because a
caveat is discharged by a person choosing to draw the read that raised it.
Superseded BY SEQ, not by key — he never sees the default's keys.

Two runs of the twelve, byte-identical model input: 12/12 then 10/12 with a
forced notice and an ungrounded figure. Both logged, neither explained away.
The trust rows are not as stable as four runs had suggested.

---

## 2026-09-12 — The cut (Phase 0, session 2)

Deleted 100 files, 16,660 lines, from `feature/workspace`. What went: the desk
(`components/desk`, `DeskPage`), the retired `/w2` renderer (`workspace/`), the
shell chrome the room replaced (`GeorgeShell`, `shellNav`, `shellLayout`), the
mark and greeting nothing rendered, the river/auto-follow hooks the room does
not use, and 29 legacy Operations files (older chart, preset and replenishment
components, `services/api.ts`, `types/index.ts`) that no page imported. Two
backend orphans went too: `schema_builder.py` (the old chatbot's, nothing
imported it) and `chart_image.py` (Telegram PNGs, nothing imported it).

Nothing was deleted on judgement. An import graph from `main.tsx` (with the
`@/` alias) decided it: 340 code files, 194 production-reachable. After the cut,
245 files and the same 194 — the proof that only dead code went. Two files the
graph could not see were caught by the suites, because they name source by
string path, not by import (`workUnit.test.ts`, `accentUse.test.ts`).

`workspace/composition.ts` was the one live thing in a dead folder; only
`restoreFromPosts` survives, now `room/restore.ts`, because `room/data.ts`
already duplicated the rest.

**Coverage genuinely lost, not renamed.** 18 backend contract tests and ~200
frontend tests asserted properties of deleted files. Two were repointed where
the same claim holds (`RiverEntry`, and the room for smooth-scrolling). The
rest were dropped rather than aimed at the room, because asserting them of the
room is a new claim about untested code. Notably: the desk's identity-key check
does not transfer — the room identifies a subject by the column its name came
from, never by `store_id`. If the room deserves these guarantees they are a
task, not a rename.

The accent allowlist fell 7 → 4 without a decision being reversed: three
entries named chromes that no longer exist.

## 2026-09-12 — The plan reviewed against its own evidence

Reviewed the three-phase plan before starting it, by checking each card's
premise in the code and in `verification/voice-after.json` rather than
asserting it. Three of my own claims were wrong.

**Parallelism is not a lever.** Reads already dispatch through
`asyncio.gather` and the model already batches them (four `get_sales` in one
iteration). That card is deleted, not deferred.

**The bottleneck is labelling, not reading.** Median 5.5 iterations per turn,
max 8. 28 of 55 tool calls across the twelve are `compose`/`record_findings`,
and `compose` is REFUSED in 8 of the 12 questions — each refusal a whole model
round trip. "What was the foot traffic at Rockwell?" spent 8 iterations and 4
compose calls to answer "I can't see foot traffic". So the first Phase 1 card
is now: coerce the structural refusals (a second `lead`, a stray field on a
`change`, a no-op `change`) instead of refusing them, and keep refusals only
where drawing would put an unbacked figure on screen. The trust boundary is
"the model never authors a figure", never "exactly one lead".

**A latency target must not cost a reading.** "50% of follow-ups with no model
call" would have answered "why?" with figures and no interpretation, which is
the product. Split: navigation fragments take no model call; analytical
fragments draw instantly and the reading follows.

Two things the plan had no answer for, now written into `ops/NOW.md`: a
standing trust gate on every Phase 1 card, because the phase dismantles the
machinery that enforces the guarantees; and the fact that the central
assumption — that latency is what makes George feel like a chatbot — comes
from code and evals, not from the owner using the room, which has never been
dogfooded. The deploy after P0.1 is the test, and the plan re-orders around
whatever complaint actually arrives.

## 2026-09-12 — P0.1, main fast-forwarded (Phase 0, session 3)

`main` is `5354ef6`: a clean fast-forward of 166 commits, 161 ahead of
`origin/main` and 0 behind, so PR #1 was already in the branch and a push stays
a fast-forward. Unpushed by instruction.

The four deterministic suites are exact: **1,326** pure, **774** vitest, `tsc -b`
and `npm run build` clean. Vitest first reported 759 because `node_modules`
predated the branch's `@vercel/functions`; `npm ci` is part of taking the merge.

The twelve ran **11 passed, 1 failed** — `why` tripped the strict
`leads_with_reading` gate by opening "…transactions rose 34% while the average
basket fell 16%". A fresh run of a real-model eval, not a regression: the trust
properties held on all twelve (no forced notice, no ungrounded numeral), and the
figures moved both ways against the recorded baseline — iterations 6.0/10 median/max
(was 5.5/8), label share 52% (was 51%), compose rejected in 6 of 12 (was 8).
**`verification/` is gitignored**, so `voice-after.json` is gone and NOW.md's
table is the only durable baseline.
## 2026-09-12 — P0.2, the rulebook (Phase 0, session 4)

CLAUDE.md is **1,493 words**, from 22,218. Every rule survives; nothing was
repealed. The owner's 26 features went verbatim to `ops/STANDARD.md` because
they are the standard, not a reading of one, and the ~20,000 words of readings,
amendments and milestone records went verbatim to the archive at the foot of
this file. AGENTS.md was a stale copy that had drifted — six vocabulary words to
CLAUDE.md's seven, eight architecture rules to nine — so it is now a four-line
pointer rather than a second source.

**91 prompt-wording assertions went, across 15 files** — 97 removed, 6 written
back — **taking 21 test functions with them** (27 removed, 6 added: four renames
and the two store-scope replacements below). The pure suite is 1,326 -> 1,306;
the extra def is in `golden.py`, which pytest does not collect as a module. **The
card estimated ~33 and the file count was exactly right, so the shortfall is in
the other direction: nearly three times as many assertions were pinning wording
as the plan thought.** The rule they broke is that a phrase in a prompt is not a
guarantee: P1 rewrites that prompt, and a test failing on wording would have read
as a regression. What stayed is everything that holds a VALUE or a SHAPE — the budget (words, rules,
prohibitions), byte-stability for the cache, that a generated section is
included at all, the SENTINEL rebuild proving a section is built from the yaml,
and every tool-schema assertion, because the voice work deliberately moved
mechanics onto tool descriptions.

**The store-scope pair was replaced, not deleted.** It asserted "N active retail
candy stores" verbatim, which pinned wording as a side effect of pinning a
count. The guarantee — the estate is read from `metrics.yaml`, never typed — is
now held by mutating the definitions and rebuilding the sentence, so a hardcoded
count still cannot survive. One more went that the card did not name:
`test_claude_md_records_the_reset` asserted CLAUDE.md's own prose, including a
`### The desk` section describing a surface P0.0 deleted.


## 2026-09-13 — P0.5, reading the gaps (Phase 0, session 5)

The card assumed a week of real use. **There has not been one**: of 193 turns
ever logged, 145 are one scripted `coverage` user on 09-02 and 44 are a person;
the last 7 days hold 4. The sweep header names who asked, because a window is
not use because it has rows in it. The loop writes **20 kinds, not 13** — seven
built at the call site, so a test parses the call sites and kind 21 cannot hide.
One most-recent sample lies: `api_error`'s latest row was a malformed message
history and 54 of 58 were a billing outage, so the commonest detail is shown
beside it, keyed on 200 characters because a provider 400 spends its first
hundred on preamble. **A gap is not a defect until checked against today's
code** — the loudest, 89 × `top_n must be an integer`, was fixed in `0ba0b4e`
the same day it stopped. Two filed, both still live.

## 2026-09-13 — P0.3, the clock (Phase 0, session 6)

**Turn time looked derivable and is not.** `logged_at - asked_at` is the
database's insert clock minus the web process's start clock: across 193 turns
the api_error ones, which die in under a second, derive to a median of **minus
1.68 s**, so the two machines are at least 1.82 s apart. `duration_ms`,
`iteration_ms` and `corrective_turns` (alembic `w7x8y9z0a1b2`) come off one
monotonic clock inside the turn instead. `ops/turn_clock.py` prints both and
labels which is which; it works against an unmigrated database on purpose,
because a report you cannot run until the deploy is fixed is a report nobody
runs. **Corrective turns had never been logged at all** — six gates, six local
variables, and P1.c is measured on them. The first measured median, from the
twelve: **27.4 s against a target of 10**, with 5.5 round trips at 4.8 s each,
which is where the card's own reading says the time is. **The card leaves a
migration on `main` and P0.4 undone, so the next deploy crashloops** — said
here and at the top of NOW.md rather than discovered on Railway.

## 2026-09-13 — P0.4, the deploy migrates itself (Phase 0, session 7)

**A setting promised something and nothing kept the promise.**
`AUTO_MIGRATE_ON_START=false` was documented as "staging migrates as an
explicit release step"; Railway had it off and the release step did not exist,
so the else branch printed a sentence and launched a process that could not
serve — on 09-12, and again waiting for P0.3's migration. The promise is gone:
**the launcher brings the database to head before launching, whatever the
setting says**, and the setting is now a CHECKED claim — at head it says the
claim held, behind it migrates and names the missing release step. Not booting
is never preferred to migrating. Ahead or branched it migrates nothing and says
which: `upgrade head` cannot fix a rollback, and a launcher that tried would
spread one process's outage across the estate. **`/health` now names the build
and re-reads the schema** — the old check ran once at boot, so drift was
invisible until a restart, which is the card's second half. Nothing about the
build is guessed: no source means `"source": "unknown"`, because a plausible
wrong sha is a readout somebody trusts while debugging code that is not
running. `start.sh` was a fourth launch path that skipped migration entirely; a
test now holds all four. **One test was deleted for asserting the defect** —
`test_launcher_does_not_migrate_when_disabled` pinned the behaviour that took
production down.

**And then it took production down itself.** The first deploy carrying P0.4
went to 502 and stayed there ~50 minutes: the migration did not apply, the
container crashlooped, and from outside there was nothing to read. It came up
on a later Railway retry and is healthy on `8b0325a`. **The root cause is not
known** — the deploy log for that build has not been read, and no session
should claim to know without it.

Two lessons, one recorded in code and one in how work is reported.

**`check=True` fails the deploy where the deploy log is** was wrong. A
crashloop hides the deploy log from everyone not already watching Railway, and
refusing to start bought nothing: the migration had not run either. A failed
migration is now loud and NOT fatal (`69b51bd`) — the app starts, the schema
check refuses, and /health answers 503 naming both revisions. Same refusal,
readable from outside. `pg_advisory_lock` became `pg_try_advisory_lock` in a
bounded loop for the same reason: forever inside a launcher looks like a boot
timeout, not a lock.

**"Verified" was claimed for something only reasoned about.** The close-out
said `main` is deployable again, on the strength of a dry run with `_upgrade()`
STUBBED and a migration whose SQL was generated offline. The launcher had never
once executed a migration against a real database. The rule this leaves:
**naming what was exercised is not the same as exercising it — a stubbed dry
run is evidence about a decision, never about the thing it decided to do.**

## 2026-09-13 — the first dogfood fix: denial is not a leak

`transaction_synonyms` fired on the answer it most wanted. Asked for foot
traffic George refused, named what the data is, and said what the substitute
would hide — and was recorded as leaking "people" and "traffic" for saying so.
**A check that fires on the refusal it exists to encourage trains the refusal
out.**

The fix turned on something narrower than it first looked. **Not distance:**
"Rockwell didn't grow, but customers were up" puts the negator exactly as close
to the word as "nobody counts people" does, and the first is a leak while the
second is care. The first attempt used a three-word window and got that case
wrong; the test caught it. What separates them is the comma and the "but", so
the lookback is the **clause**, not the sentence (too wide — it would clear
"footfall through the till, not bigger purchases") and not a word count (too
blunt). A term is cleared only when EVERY use is denied; one bare use is still
a leak, which is what keeps the real hit in the same run reported.

Held by 8 cases carrying both real sentences verbatim, and checked against all
twelve recorded answers rather than against invented ones.

## 2026-09-13 — the second dogfood fix: an exclusion refuses in its own words

`resolve_store` had ONE refusal for TWO mistakes — a typo and a deliberate
exclusion — so ten scoped tools told the owner that AJI BARN, the warehouse,
was not a store. He hit it three times in the middle of the one workflow he was
actually building, and George could only guess at why.

A name that resolves anywhere in the estate is now out of scope, named by
group and by the reason the calling tool declares; a name that resolves nowhere
is still unknown. **Three tools exclude the warehouse for three different
reasons** — dispatch counters, no transactions, ships-from-not-to — so each
passes its own out of metrics.yaml. One shared sentence would have been wrong
for two of them. `dead_stock.barn_excluded_reason` had been sitting in the yaml
unread since the tool was written; the other two were written here.

Scope note: the entry named dead_stock. Fixing only that would have left George
explaining the warehouse for one reading and denying it exists for the next two,
so sales and replenishment went with it — one call site each.

## 2026-09-13 — the third dogfood fix, and Phase 0 closes

A failed write recorded "ProgrammingError" and dropped the exception, so the
defect feed said THAT a write broke and nothing about HOW. Nothing was ever
lost: 23 routes raise `from exc` and `__cause__` had been unread since the
first commit. The cause now travels beside the sanitised sentence and is
stripped before anything the model is sent is built — the sentence stays the
only thing the model sees (UI rule 4), the row gets both, credentials redacted.

**The lesson is about the test, not the fix.** `_truncate` returns the SAME
dict when rows fit, and a refusal has no rows, so the payload the model is sent
IS the one the diagnostic travels on — only the strip separates them. The first
leak test asserted on the SSE frames and **passed against a loop with the strip
deliberately removed**. A mutation check found that; the rule it leaves is
**delete the fix and watch the test fail before believing it**, which is the
same lesson P0.4 taught about stubbed dry runs, arriving from the other
direction.

Open is empty for the first time since the dogfood log was started, and
Phase 0 is closed. Phase 1 opens at P1.a against a measured median of 27.4 s.


---

# Archive — the readings CLAUDE.md carried until 2026-09-12

*P0.2 cut CLAUDE.md from 22,218 words to a rulebook that fits on one screen. The
rules themselves stayed there. Everything below is what came with them: the
readings, the amendments, the decisions recorded "because the code cannot say
why", and the milestone records. It is moved verbatim, not rewritten, and nothing
in it is repealed by the move — a rule in CLAUDE.md and its reasoning here are the
same rule. New session entries go ABOVE this line; this archive is the tail of the
file and stays there.*

*The one section that did NOT come here is the owner's own 26 features, which are
the standard rather than a reading of one: they are `ops/STANDARD.md`, verbatim.*

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

### The plan — how the 26 get built

*Rewritten 2026-09-10, keyed by number to the features at the top of this file.
It supersedes the six-phase plan of 2026-09-09, which was a reading of that
section and began to be used in place of it.*

**Every stage is ONE IDEA, delivers named features, and is usable the day it
lands. No stage may be built as infrastructure for the next. A stage ends when
the person using George says it feels right — never when the architecture is
finished.**

#### What is already true, and is not to be rebuilt

- **Feature 1, in its hardest part.** George composes the screen — `compose`
  (agent/compose.py) — validated so he can never emit a figure, a colour, a
  size or a subject that is not a row of a read that ran. Every previous
  attempt at the interface lacked this, and it is what makes the rest safe.
- **Feature 5.** Thirteen read tools: sales, stock, stock over time,
  replenishment, purchase plans, purchasing, movement, products, vending, dead
  stock, costs, the brief.
- **Feature 8.** `metrics.yaml` as the single source of business meaning, with
  notices, refusals and receipts on every figure.
- **Features 9 and 10, in prose.** He decomposes into drivers unasked and says
  what he would look at first.
- **Features 14, 17, 18 and 19 exist as CAPABILITIES WITH NO SURFACE.**
  `pin_answer`, `create_page`, `edit_page`, `save_workflow`, `run_workflow`,
  the approvals queue and the backtest-and-promote gate are all built. The
  workspace at `/w2` renders none of them and cannot navigate to any of them.
  Much of B and C is therefore connection, not construction.

#### A · The workspace is a place you work inside — 1, 2, 3, 4, 6, 7, 13

The screen is currently a function of the last question: it renders the newest
answer and folds everything before it into one line. That single fact is why 2,
3, 6, 7 and 13 are all partial.

1. **The board persists.** `compose` stops describing a screen and starts
   editing a board — put, change, quiet, drop — keyed by George's own object
   key. The board survives the turn, the thread and the reload. *(2)*
2. **Objects answer to touch immediately.** A closed set of client-side
   manipulations that cannot invent a figure: focus, expand, sort by a column
   the read returned, filter to rows already on the board, close, move.
   Anything needing a new fact is still a read. Today three things respond to
   touch and two of them are toggles. *(3, 7)*
3. **The vocabulary he actually reaches for.** Five of ten widgets have never
   been drawn once; `timeline`, `control` and `recommendation` from feature 1's
   own list do not exist. Add them, and make the choice of FORM part of what he
   is asked to judge. *(1, 4)*
4. **Work you can see.** Evidence lands on the board as each read returns,
   instead of one grey line for forty-five seconds. *(13)*
5. **Fragments resolve against the board, not the thread.** "Why?" "These two."
   "Products." "No, exclude Air." *(6)*

*Feels right when:* you are looking at Rockwell, you say "Products" and it
becomes products; "compare with OPUS" brings OPUS into the same workspace;
"why" reveals the evidence — and the Seikyo draft you opened an hour ago is
still where you left it.

*Stop and rethink if:* after 1 and 2 it still feels like a chatbot. Then the
problem is not layout, and reskinning a fifth time is the wrong move.

#### B · Nothing starts from zero — 11, 14, 21, 10, 22 in part

1. **George records what he believes.** The table, validator, store and schema
   are built and correct as of 2026-09-10; he still does not reach for the
   tool, because the prompt says "a handful a week, not one an answer" and he
   reads that as never. `beliefs held: 0` is the number to move. *(11)*
2. **The board persists across sessions**, so returning to a subject returns to
   the work. *(2, 11)*
3. **"Keep this" makes an object permanent.** Pages become boards of live
   objects rather than a list of tiles — the page capability already exists and
   is simply not connected. *(14, 22)*
4. **The cold open is what he already thinks:** what changed, what is
   unresolved, what he is waiting on. Not a dashboard, and not empty. *(21)*

*Feels right when:* you stop asking questions to find out what is happening,
and something you made last week is still there and still true.

#### C · You build things with him — 15, 16, 22

1. **Decide the three questions below first.** They are decisions, not code,
   and C cannot start honestly without them.
2. **Propose → backtest → approve → permanent.** George proposes a definition,
   metric, system or interface; anything carrying a figure is backtested; a
   person approves; it becomes a real part of the business. This is the
   existing promotion gate generalised beyond workflows.
3. **Change it by describing the change.** "Add supplier lead time." "Managers
   can request this but only I can approve it." "Show warehouse stock here."

*Feels right when:* you described a purchasing system in words and it exists,
and changing it does not mean opening an editor.

#### D · It runs without you — 12, 17, 18, 19, 20

1. **Watch** — a condition George checks on a schedule, which posts only when
   the answer changes. Named in the vocabulary since 2026-09-05 and never
   built. Silence is its normal state. *(12, 17)*
2. **He operates what was built:** prepares the weekly purchase orders, checks
   conditions, follows up, handles routine work, escalates the exceptions.
   *(18)*
3. **Inbox is what genuinely needs you**, and deciding is one action — approve,
   reject, change it, or give a standing instruction. *(19, 20)*

*Feels right when:* he tells you something you did not know to ask, and handles
something without you.

#### E · It reaches your real world — 23, 24, 25, 26

Cross-business, documents and unstructured information, actions in the tools
the businesses actually use, and voice. **E is a set, not a sequence** — each
needs a source or an integration that does not exist in this repo yet, and each
is separate groundwork that can start whenever its source arrives.

#### Three decisions that block C and D

Recorded 2026-09-09, still open, and each needs a deliberate answer rather than
silent erosion:

- **Architecture rule 5 (shallow loop)** forbids planning and decomposition.
  The 2026-09-08 reading bent it once by putting the investigation ladder in
  the prompt; that trick does not extend to Build.
- **Architecture rule 4 (read-only role)** has been extended five times by
  injecting a narrow writer per capability. Build and Run need more writers
  than that pattern comfortably carries. Review the pattern before the sixth.
- **Architecture rule 7 (nothing unattended until backtested and promoted)** is
  the right shape for Run and is the one piece of the future already built. It
  is also how George could safely extend himself. Today it covers workflows
  only.

#### Two things no code fixes

- **Supplier traceability.** Nothing records who supplies what; the map is
  inferred from purchase-order history and approved by the owner. In the live
  Seikyo run, 450 of the 787 products that sold could not be traced to any
  supplier. That bounds feature 18 for purchasing until the source improves.
- **There is no document source at all.** Feature 24 has nothing to read yet.

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

   *Reading of this rule, agreed 2026-09-11, standing questions:* a scheduled
   ASK is unattended execution and it is deliberately **not** put behind this
   gate — because the gate cannot mean anything here. A workflow version is
   gated because it computes: its steps are fixed, so a backtest against a
   closed window proves what it WOULD have said and an administrator approves
   exactly that. A question has no steps to backtest; the answer is whatever
   the morning's data makes true. A promotion ceremony over that would approve
   nothing, and pretending otherwise is worse than having no gate.

   **What stands in its place is capability, which is real.** The scheduled
   turn is given the read tools, `compose`, `view_memory`, `view_automations`
   and `record_belief` — and nothing else. It cannot pin, build or edit a page,
   save a workflow, run one, read a page, or touch a standing question,
   including its own: a question that can move its own slot or switch itself on
   is a thing that gets away from you overnight. The withheld half is enforced
   by ABSENCE, not by refusal — a tool with no injected capability is not in
   the model's schema at all (rule 4) — and by a contract test that asserts the
   offered set is exactly those three injected names.

   **Remembering is deliberately on the given side.** A morning read that
   settles what George thinks and then forgets it is the failure
   `george.beliefs` exists to end, and mornings are when most of his views will
   form. A belief is append-only, carries no figure, and names the calls behind
   it, so the worst an unattended one can do is be wrong in a sentence that is
   dated, attributable, and superseded by the next read.

   **Two properties are kept from the workflow scheduler rather than reinvented**
   (`app/services/slots.py`, extracted before this feature was written so the
   existing tests proved the extraction): the slot is computed each tick rather
   than registered as a cron trigger, so a restart cannot silently drop 06:00;
   and it is CLAIMED in the database before the run, so a failure is recorded
   rather than quietly re-delivered an hour later wearing the 06:00 timestamp.
   `last_thread_id` moves only on success, because the room opens on it: a
   morning that broke must not blank the screen.


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

   *Amended 2026-09-12, projection by definition.* Two of those decisions
   arrived, and each is a **window rule and nothing else**: it `inherits`
   `previous_period` — row fields, statuses, the change arithmetic, the
   ranking, the groupings it allows — and the tool merges the parent under
   the child once, so nothing below the lookup knows which mode it is
   reading. `to_date_same_elapsed` is the pace read: the period so far
   against the same elapsed portion of the period before, Monday 00:00 to
   now against last Monday 00:00 to the same weekday and hour, bound as
   Manila timestamps read in the same transaction, with the elapsed share
   on `meta.comparison.elapsed` so a reader knows how much of the week a
   figure covers. It REQUIRES a window in progress, which is the mirror of
   the rule above, and a day's period before is the same weekday last week
   by reference to what the brief measured, never yesterday.
   `same_weekday_last_week` is the brief's own comparison promoted to a read
   for any closed day or explicit window — the window shifted back by that
   same measured offset — without the brief's noise floor, because the floor
   belongs to the judgement and not to the figure. What stays declined is
   named: `full_period_extrapolation`, "on pace for X this week", divides
   the figure so far by the share elapsed and assumes the afternoon sells
   like the morning; the same-point comparison is a fact and the pace is a
   convention. The arithmetic is `tools/windows.py`, held by
   `tests/test_comparison_contract.py` on fixed clocks. Beside it,
   `get_purchase_plan` rows now carry `run_out_date` — today plus whole days
   of cover, computed in SQL from the Manila date read in the same
   transaction, with what is on order NOT counted because Open does not mean
   received — so "when does it run out" is a date the tool wrote, not a
   number the reader turned into one.

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
  - **Scope belongs to the thread.** *(Reversed 2026-09-22 by W1.4: the
    conversation follows the page — see that date.)* The first page-aware question binds a
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

*Built 2026-09-11, and the reservation held.* Watch was written down on
2026-09-05 with no code behind it, precisely so it could not be built under a
different name in the meantime. What arrived is what was described: a condition
plus a channel, checked on a schedule, posting only when the answer changes.
Five decisions, recorded because the code cannot say why.

  - **A watch is one of the brief's own conditions, plus a scope, plus a slot.**
    `metrics.yaml` `watches.conditions` is a closed set of three —
    `sales_moved`, `stock_crossed_out`, `newly_dead` — and each REFERENCES a
    threshold in `brief:` that was measured against a noise floor with the
    measurement written down beside it. Evaluation is `get_brief` itself, not
    new SQL, so there is exactly one implementation of "Rockwell is down" and
    a watch cannot drift away from the morning it agrees with. **There is no
    threshold column and no threshold argument**: "alert me at 10% instead of
    30%" is a request to change a DEFINITION, and it is refused with the
    current number and the evidence for it, never half-saved.

  - **It posts on CHANGE, never on truth, and recovery is news too.** The state
    is the set of firing subjects with each one's direction; a check speaks only
    when that set differs from the last. A shop down five mornings running is
    one post, because five identical alerts is how a signal stops meaning
    anything. "Rockwell is back to normal" is the half people otherwise never
    get told, and it is what makes the alarming half trustworthy. A direction
    flip counts as new — down 40% yesterday and up 40% today is not more of the
    same. A first check with nothing firing says nothing, or a watch switched
    on during a quiet week would announce its own silence.

  - **"Nothing fired" and "I could not look" are different answers, and every
    check is written down.** `get_brief` says per section whether it `ran`; a
    section that could not run yields NO state rather than an empty one, the
    last thing actually seen is left untouched, and the blindness is said once
    when it starts. Collapsing the two would announce that every shop recovered
    on the morning a source went stale — good news, invented, and
    indistinguishable from the real thing. `george.watch_checks` records the
    quiet checks as well, because from outside, "quiet for eleven days" and
    "broken for eleven days" are otherwise the same observation, and the second
    is the one somebody needs.

  - **The backtest is the gate and it is also the feature.** Architecture rule
    7 applies — a watch computes — but there is no authored logic to promote:
    the condition is one of three and its numbers are the brief's, already
    reviewed. So there is no administrator's approval, and what a person must
    see instead is what the rule WOULD have done. `NOT enabled OR backtest IS
    NOT NULL` is a CHECK constraint, not just a service rule. It paid for
    itself on the first live use: asked to watch every shop for a sales cliff,
    George backtested it, reported **47 of the last 60 mornings**, and said "that
    is not a watch, that's a habit you'd mute by week two" — then narrowed the
    scope to two shops and got 25. The backtest counts POSTS, not firing days,
    walking the days in order and carrying the state, because the number
    somebody decides on is how often they would be interrupted. A backtest
    measured under a different `definitions_version` does not count, and
    **rescoping throws the backtest away and switches the watch off**: a watch
    over one shop is a different watch from one over seven, and 47 becomes 4.

  - **Narrowing the scope is the dial; the threshold is not.** When a backtest
    says a watch would fire too often there is exactly one honest lever, and
    the tool says which. This is the rule most likely to be eroded by a
    reasonable-sounding request, which is why it is written here and held by a
    test.

**No model call, and that is what makes it safe to run unattended** — a check
is one vetted read, a named condition and a comparison with the last result.
George thinks when you REPLY: the post carries the exact `get_brief` call
behind it, so "investigate this" re-runs a fact and he climbs the ordinary
ladder from there. No investigation object, no second path (architecture rule
10). Posts are `org`, like everything George initiates, and go to the river
only — a second delivery channel would be a second thing to keep in step.

**Delivery watches are NOT built, and `metrics.yaml`
`watches.not_available.deliveries` says why and what would end it.** Both
sources are frozen at ~64 days, `received_qty` is sparse and never reconciled
and may legitimately exceed what was ordered, transfers carry no per-line
received quantity, and "Open" does not mean "not received" — 8 of 151 orders
are Open with notes saying the goods arrived. A watch over them would evaluate
identical rows every morning forever. Recorded rather than left as an absence,
because an absence reads as George being bad at something.


*Added 2026-09-11: **Standing question** is the seventh word, and the bar for a
seventh is higher than it was for the fifth.* It is a question George is asked
on a SCHEDULE, answered fresh each time by the ordinary loop, waiting for you
when you open the room. "How are we doing?" every day at 06:00 is one. So is
"anything out of stock at Rockwell?" every Monday.

**Why nothing that already exists can say it.** A *pin* re-runs a call when you
look at it — no model, no judgment. A *workflow* replays fixed steps on a
schedule — no model, by design, and that is the property its promotion gate
rests on. A *watch* checks a condition and stays SILENT unless it fires. A
standing question always speaks, and what it says is not decided in advance: it
is the only one of the four where the model runs unattended, and that is the
entire point of it.

**The word matters because of what it replaces.** The owner asked for a morning
briefing he could steer by talking. The first attempt built the briefing — a
Python composer that read the tables, chose the shops, wrote the sentence and
handed George a finished object. He rejected it in one line: *"why do we need
to build the brief? we're supposed to make George able to make those briefs on
its own"*, and then *"make sure there's nothing else like this — parts where
we're building something instead of building George to build those things."*
So **there is no brief object, no brief table, no brief composer and no brief
renderer.** There is a question, a slot, and whatever George decides that
morning. `brief_board.py` and `make_example_board.py` were deleted the same
day; `tools/brief.py` remains a READ George may call, not a thing that speaks
on its own.

**Steering it is two sentences and two columns.** "Make it 9am instead of 8"
moves `hour`/`minute`. "Show more of Rockwell" appends to `instructions` — the
owner's own words, handed to the model labelled as preferences about ATTENTION,
never as definitions and never as evidence. There is no other numeric column on
the table, so "alert me when Rockwell drops 10% instead of 30%" has physically
nowhere to be written: it is refused, and told which comparison exists. A
schedule is scope; a business threshold is a definition and lives in
`metrics.yaml` where it was measured.

**A standing question is one person's** (unlike a workflow, which is the
company's rule) because its answer is a private post they own. **Answers
outlive the question**: removing it deletes no post, because a thread is a
record of something George actually said.



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

### Objects

*Added 2026-09-11.* A shop, a product, a supplier or an order, opened up:
`get_object(kind, name)` returns every section of one thing in a single call.
Recorded here because each line is a decision the code cannot state.

- **It writes no SQL — not even vetted SQL.** Everything an object view shows
  is already defined somewhere: a shop's week is `get_sales`, its shelf is
  `get_stock`, a product's costs are `get_cost_history`. So the tool CALLS
  those and keeps each result whole. The consequence is the point: there is one
  definition of what a shop's week is, shared by the object view, the morning
  brief, a watch and anything George reasons with. A second implementation
  would be a second definition, and the two would disagree on a Tuesday with
  nobody able to say which was right.

- **Tapping must not cost a model turn.** Asking George to open Rockwell takes
  a model call and ~40 seconds; the same five reads take about a second and
  involve no judgement, so the client calls the tool directly through
  `POST /george/object`. Sections run concurrently (four at a time — the
  read-only role is capped and `connect()` gates at 8 per process), which took
  a shop from 4.8s to ~1.0s over HTTP. **George is given the identical tool**,
  so what a person sees when they tap and what he sees when he thinks cannot
  drift apart.

- **Nothing is joined across sections**, for the reason a workflow may not join
  its steps (architecture rule 6): a combination of two results is a
  definition. One exception is named and bounded — resolving WHICH product
  "Aji Mix" means before reading anything about it, which is identity, not
  arithmetic, and the same act as matching a shop name against the store list.
  Where several products answer to one word, the view says so and refuses to
  pick: showing somebody another product's figures under the name they typed is
  worse than showing nothing.

- **The view carries no `snapshot_timestamp`, deliberately.** An object mixes a
  week of sales with a live stock snapshot; one timestamp over both would be
  the freshest source vouching for the stalest. Each section keeps its own
  receipts and its own call. For the same reason `get_object` is classified
  **partially_reproducible** in `workflows.backtest`: the window rebinds, the
  shelf does not.

- **Five section states, and they are five different facts** (UI rule 8):
  available, empty, **refused**, failed, unresolved. A refusal is the tool
  declining to produce a misleading number and is a real answer with a reason;
  a failure is something going wrong. One word for both would file "AJI BARN is
  a warehouse" beside "the database is down". A section is never dropped for
  being empty — a section that vanished reads as "there is nothing here".

- **A warehouse is never asked for its sales.** AJI BARN holds stock and
  records no transactions, so five refusals in a row read as a broken screen.
  The definitions already separate trading from not, so the tool reads that
  line and says once what a warehouse is, then shows the shelf it does have.

- **What George thinks is NOT a section**, and cannot be: beliefs live in the
  `george` schema, which the read-only role has no access to. That boundary is
  right rather than inconvenient — it means a replayed past morning can never
  show today's opinion. The view is composed on top by the endpoint, on the
  application role, carrying when it was formed, when it was last checked, and
  whether data has landed since. **Null is a real answer**: "he has not formed
  a view" is not "he thinks nothing is wrong".

- **Supplier and order are thin, and say why.** Both sit on frozen CSV imports
  ~64 days old with sparse, unreconciled `received_qty`. They return what the
  record HAS with its age, rather than being dropped — an omitted section reads
  as "nothing happened with this supplier" — and
  `objects.thin_reasons.purchasing_sources_frozen` records what a real source
  would have to provide.

**One shipped bug this uncovered**, fixed here and held by a test:
`get_sales(filters={'sku': ...}, compare_to=...)` raised
`query parameter missing: sku_product_ids` **every time**, for a valid SKU as
much as an unknown one, because `base_params` was snapshotted before the SKU
resolution added its parameter. "How did Aji Mix do against last week" could
not be answered at all, and nothing noticed until an object view made exactly
that call. `base_params` is now built where it is used.

### The board is arranged by moving things

*Added 2026-09-11.* George composes the board because he knows what matters;
the person rearranges it because they know what they want to look at. Three
decisions, recorded because the code cannot say why.

- **Arranging is a property of being ON the board, not of being a shape.**
  The row of controls used to be drawn by the tile, and only two of the
  fourteen kinds called it — so a real board of ten objects had nine that
  could not be moved, kept, resized or set aside, and the one that could was
  whichever happened to be a subject. `render.tsx` draws it once, under every
  object. `compare` and `why` stay conditional, because they are questions
  about a subject and an object with no subject has none to ask. It is quiet
  until the pointer is on the object or something in it has focus, and always
  visible where there is no hover (UI rule 7).

- **Moving is a drag, and the arrows are gone.** A pair of buttons that swap a
  tile with its neighbour is a machine for producing an arrangement, not the
  arrangement — you have to count the presses. [drag.ts](frontend/src/room/drag.ts)
  is pointer events with WINDOW listeners and no `setPointerCapture`, because
  the dragged tile moves between the lead row and the body of the board and a
  captured pointer dies with the element that captured it. It hit-tests with
  `elementFromPoint` rather than modelling the CSS-columns layout, reorders
  live so the board moves out of the way under the hand, and the carried tile
  is `pointer-events: none` so it finds the board and not itself. The arrow
  KEYS survive on the grip: a board that can only be arranged with a pointer
  is a board somebody cannot arrange.

- **`Local.size` gained `normal`, which no button sets.** Dropping a tile in
  the lead row means "this is the point" and dropping it in the body means it
  is not; with only `big` and `small` there was nowhere to record the second,
  so George's lead sprang back to the top the moment it was let go — the
  arrangement losing to the weight, which is the opposite of every other line
  here.

**And the three other screens wear the room's chrome.** What needs a decision,
what you kept and what runs on its own rendered in the shell that existed
BEFORE the room — a wide rail of words, serif display headings, its own type
scale — so following a link off the board landed in what looked like another
application. They are lists, not boards, so they get a column rather than a
packing grid ([RoomShell.tsx](frontend/src/room/RoomShell.tsx)); a run's
notices are drawn through the room's own caveat, whole, and nothing about
which notices surface changed.

### How George talks — the prompt is one screen

*Added 2026-09-12, and corrected the same day.* The system prompt is built
from four things, in this order, and it has a budget the suite enforces.

- **Character, as traits.** WHO YOU ARE: the colleague who has read
  everything and says the one thing; the same voice for good news and bad;
  "I can't" (a fact about the system) kept apart from "I wouldn't" (an
  opinion); acts on nothing alone. Traits generalise to the situation no
  rule anticipated; a rule covers its own case.
- **The shape of an answer.** Reading first, caveats as clauses in the same
  breath, what the figures do not establish, one offer. The morning is one
  line per thing that changed. Figures are spoken only when no shape on
  the board holds them.
- **Nine rules, every one held by code as well.** Numbers from tools,
  notices surfaced, refusals followed, one grouped read, no arithmetic in
  prose, a write only when its tool returned, one volunteered fact, no tool
  vocabulary. Nothing in the rules is a preference.
- **Mechanics live on the tools, not in the prompt.** Which metric breaks
  down by which subject is on `get_sales`; how a board is worked — the
  edits, the weights, one object per read — is on `compose`; the page
  bounds and the remove wording are on `create_page` and `edit_page`
  (`agent/loop.py _tool_addenda`, appended to a tool's description by
  `build_tool_schemas`, generated from the same definitions). The model
  reads a tool's description at the moment of choosing it, which is where
  a sentence about a tool belongs. The sections that remain — SCOPE,
  JUDGMENT, INVESTIGATING, THE SURFACE, THE DESK, THE BOARD — are still
  built from `metrics.yaml` at import, and each is now a paragraph.

**The budget** (`metrics.yaml voice.budget`, held by
`tests/test_voice_contract.py`): at most 1,800 words, 10 numbered rules and
20 prohibitions ("never", "do not", "don't"). The numbers, and why they are
written down:

| | Words | Numbered rules | Prohibitions |
|---|---|---|---|
| Before the voice work | 8,623 | many | 57 "never" alone |
| First carve, reported as done | 4,233 | 18 | 64 |
| Second carve, budget met | 1,793 | 9 | 18 |
| AgentIF average (707 real agent prompts) | 1,723 | 11.9 constraints | |

The research the plan rested on said models already perform poorly at
AgentIF's length and that the thirty-seventh rule competes with the first
thirty-six. The first carve moved the easy 4,000 words and left the
generated sections whole, and the shortfall against the plan's 1,800 went
unsaid until the owner quoted the research back. The budget test exists so
that cannot happen silently again: the target is a definition, the suite
holds it, and anything the prompt would teach past it goes onto the tool it
describes. The behaviours the old sections taught are held by the same
contract tests as before, re-anchored to where the words now live.

**What the evals measured** (`tests/evals/test_voice_evals.py`, opt-in, the
real model on twelve fixed questions, same reads, same database;
`verification/voice-before.json` against the 8,623-word prompt,
`voice-after.json` against 1,793, `voice-after-transcripts.md` the twelve
answers for a person to read). Against the plan's own acceptance numbers:

| Measure | Plan's target | 8,623 words | 1,793 words | 1,793 + gate |
|---|---|---|---|---|
| Strict pass | 12 | 8 | 7 | 12 |
| Median words per answer | ≤ 90 | 109.5 | 93.5 | 87 |
| Sentences restating a drawn figure | 0% | 22% | 19.5% | 0% |
| Reading first (no figure in the first sentence) | ≥ 11 of 12 | 7 | 7 | 12 |
| One paragraph | | 3 of 12 | 12 of 12 | 12 of 12 |
| Ends with at most one offer | 12 | 12 | 12 | 12 |
| Notices surfaced | 100% | 11 | 12 | 12 |
| Refusal kept, internal vocabulary leaked, ungrounded numerals | kept, 0, 0 | kept, 0, 0 | kept, 0, 0 | kept, 0, 0 |
| Tool calls across the twelve | | 58 | 61 | 55 |

Nothing got worse for the cut, and three things got better on the cut
alone: the answer is one paragraph every time, the notices all reach it,
and the median fell. Three targets the cut left open — the median 3.5 words
over, a fifth of sentences restating a figure the board draws, the reading
leading in seven of twelve — were not met by the long prompt either, and
the five that failed reading-first all opened with the reading and put the
figure in the same sentence ("Rockwell had a good week — up nearly 14% on
the week before"). The check was not loosened to make the number; the gate
below was added instead, and **with it every target in the table is met.**
Read with care: one run each, the model varies between runs, and the gate
fired in only three of the twelve — the other nine came in clean on their
own that run. What the gate guarantees is the ceiling: a restated figure
costs one rewrite and the answer stands.

**Restatement is now a gate, not a request** (`metrics.yaml
voice.restatement`, [agent/prose.py](agent/prose.py)). The long prompt
asked for no restated figures in three places and got 22%; the short one
asked once and got 19.5%. Words do not move it, so the loop enforces it the
way it enforces the volunteering cap: when something is drawn and a
sentence carries a figure a drawn row already holds, one corrective turn
names the sentences and asks for the reading instead, then the answer
stands. The check is the evals' own function, moved into `agent/` so the
measure and the gate cannot drift; matched on digits, with dates and small
counts excused. The warning (`restated_figure`) is process, drawn in the
activity and never as a caveat. What it does not do: verify a figure that
is NOT on the board — that stays an eval, and rule 9's statement of what
production enforces is unchanged.

### The board maintains, not accumulates

*Added 2026-09-12.* Measured on George's own record since the 10th: 168 `put`
edits to 3 `change` and 4 `quiet`. Asked the same thing again, he put a twin
beside the object he had, under a fresh key, and every multi-turn board held
1.2–2.0× as many objects as distinct reads — the same net sales per shop
drawn as a table, two bar charts and two sets of solid tiles at once.

- **An object is identified by the read it draws** — tool, arguments and the
  one `subject` it is scoped to — not by the key George chose. A later `put`
  of that read replaces the object where it stands, under its old key, so the
  person's arrangement of it survives; the new key becomes an alias so his
  later edits under it land on the same object
  ([board.ts](frontend/src/room/board.ts) `readIdentity`, `buildBoard`).
  A comparison's `subjects` are a view of the read, not a scope, and are not
  part of identity: one board holds one of a read's views.
- **The server applies the same rule** so the stored composition matches the
  screen: the board travels with the question carrying each object's read,
  and `compose` rewrites a fresh `put` of a read already there into a
  `change` of the existing key — not a refusal; the model meant "show this"
  — and names the rewrite in `meta.rewritten` ([compose.py](agent/compose.py)).
- **A quiet object nobody touched for `composition.expire_after_turns` (6)
  turns leaves on its own**, unless the person kept it. Keeping outranks a
  count.
- The prompt says it in one line: *one object per read; change what is
  there; add only what is new.*
- **Measured on the twelve voice evals** (the plan's target was 1.0 objects
  per distinct read): by the identity rule above, 1.23× on the long prompt
  and 1.07× on the short one, with 15 duplicate `put`s per run rewritten to
  `change` by the server. Counted as raw `put` blocks — the way the plan
  first wrote it — it is 1.77× and 1.63×: George still emits a twin under a
  new key almost every time, and the rule is what makes that harmless.

### The agenda — what deserves attention today

*Added 2026-09-12.* The judgement layer, as one read. The morning used to be
a fixed read at a fixed time; `get_attention` ([tools/attention.py](tools/attention.py))
is the judgement over it, declared in `metrics.yaml attention`.

- **Every floor is a reference, never a number.** Each source names the
  definition it is judged against — the brief's own floors — and
  `tests/test_attention_contract.py` holds that every one resolves. A source
  with no definition of normal is listed under `cannot_notice` with the
  definition that records the gap, so the morning can say "I cannot see
  deliveries" instead of letting silence read as calm.
- **Every survivor ranked, money first, by absolute size against its floor,
  ties by name** — `brief.notability` generalised from the one opening line
  to the whole morning. Each row is a brief row, whole, with its receipts.
- **Every sense is dated.** `meta.senses` carries each source's last
  movement and, when blind, why: frozen, stale, could not run today, or no
  definition of normal.
- **Silence is the normal state.** `meta.silent` when nothing crossed. A
  scheduled question that read a silent morning is recorded with
  `last_status = 'silent'` (migration `u5v6w7x8y9z0`) — not `failed`, and not
  `ok`, which is the only status `latest_answer` offers — so the room does
  not open on a morning with nothing in it and falls through to the thread
  you left (history as context).
- `morning` is a message kind in `investigation.message_kinds`, so SCOPE
  teaches which read it is: one call, one line per thing that changed.

### The decision log — memory that acts

*Added 2026-09-12.* A shop raised every morning and set aside every morning
ranked first every morning, and George could never say "raised Tuesday,
left". `george.decisions` (migration `v6w7x8y9z0a1`,
[decisions.py](backend/app/services/decisions.py)) is what people DID with
what he raised, and the agenda reads it.

- **A decision is a recorded gesture, never an inference.** Five outcomes,
  a closed set held in the yaml, the model and the CHECK together: `kept`,
  `dismissed` (set aside), `opened`, `asked` (why?), `left` (the morning put
  away with it still on the board). The room writes them through
  `POST /george/decisions` from its own gestures on an agenda row
  ([decisions.ts](frontend/src/room/decisions.ts) decides whether an
  object IS one, from the read behind it) and for nothing else. A row
  nobody touched is a row nobody touched; nothing is written for it, and
  nothing decays.
- **Shared, like beliefs.** The agenda is about the business, and what its
  people did with it is one record; `decided_by` is provenance. Nothing is
  ever updated: kept on Tuesday and set aside on Thursday are two rows and
  both count.
- **The read back is injected, and the model never sees the argument.**
  `george_ro` cannot see the schema, so `get_attention` takes `decisions`
  keyword-only — absent from the schema by construction — and the loop
  fills it from a reader bound in the web process or the standing runner
  (`agent/loop.py INJECTED_READS`). A reader that fails hands the tool
  `{"error": …}` rather than nothing, so "no log" and "could not read the
  log" stay distinguishable on the result.
- **Three rules, each a definition, each written on the row it moved**
  (`attention.learning`): set aside three or more times in the window
  ranks below everything not so dismissed, whatever its size; kept, opened
  or asked about within seven days ranks first within its source, so money
  still leads; kept is marked on the row. `learning.reason` says why
  ("ranked lower: set aside 3 times"), every row carries its recent
  decisions newest first, and a log absent or unreadable leaves the order
  exactly as before and says so in `meta.learning`.
- **Proven live** against the dogfood log: three dismissals recorded the
  way the route records them, read back the way the loop reads them, and
  the row ranked last of thirteen with its reason. "Raised Tuesday, left"
  in a live answer waits on the model account having credits — the row
  carries it; whether George says it is the voice eval's to show.

### Levels of automation — the rules of engagement

*Added 2026-09-12, Phase F of the attention plan. A paragraph, no code:
every mechanism it names already exists and is already held by its own
tests. It is written down so that the next capability is built at the
same level and not one higher by accident.*

George's autonomy is not one setting. It is a different level for each of
the four stages of the work, and the levels are Sheridan's, deliberately:

- **Acquisition and analysis: as automatic as the definitions allow.** He
  reads every source on a schedule (standing questions, watches, the
  agenda), notices against floors that already exist, ranks, dates every
  blind sense, and learns from recorded gestures. None of this waits for
  anybody, and none of it invents a threshold, a score or a cause.
- **Decision: level four.** He recommends one course — the closed verbs on
  the recommendation widget, one offer at the end of an answer — and the
  owner decides. He does not choose among alternatives on the owner's
  behalf, and a row that says "leave it" is a recommendation too.
- **Action: never above level five.** Everything that leaves George's hands
  is a veto point for a person: a draft order is a draft; a page is the
  owner's to keep; a workflow version starts ungated and a schedule is born
  switched off; promotion past a backtest is an administrator's act; a
  watch posts and nothing else. No outward channel exists until one is
  attached and approved, and when one is, it enters at the same level.
- **Reasoning shown, every time (Bainbridge).** The receipts, the notices,
  the read behind every object, the reason on every re-ranked row, the
  version that ran and the one the schedule fires. An operator who cannot
  see why the automation did what it did cannot take over from it, and
  taking over is the whole point of a veto.

What would move a level is a decision recorded here first, with the test
that holds the new level, before the mechanism is built.

### The instruments

*Added 2026-09-12, from the design board.* Five marks joined the grammar —
`range`, `bullet`, `ring`, `dots`, `calendar` — and one read joined the
tools: `get_sales(group_by="hour")`. Recorded because each is a line that
could be crossed by accident.

- **An instrument is a second reading of a figure, never a word on it.** A
  range says *where* a day sits on its own thirty; a bullet says *how much
  of* a whole; a ring shows how each of a set stands; dots say *when*; a
  calendar shows the rhythm of the weeks. None takes a value, and none says
  good or bad. "Healthy / danger" bands are thresholds, and a threshold is a
  definition (metrics.yaml) or it does not appear — the same reason the
  fullness bar was declined above. The one word the board carries, "above
  the noise floor", is the one the brief defines.
- **A bullet's whole is a column of the same row.** `against` is a channel,
  checked against the same read, and never a second `seq`: a bar measured
  against another read's row would be a ratio nobody computed (the
  composition-is-adjacency rule below, applied inside a mark).
- **A calendar lights nothing for beating another day.** Each day against
  its own weekday a week earlier is a per-bucket lag, which
  `comparisons.not_supported.per_bucket_lag` records as not built. The
  board's streak calendar therefore does not exist in the grammar; brightness
  is the field, and the rhythm is what it shows. If a per-day same-weekday
  comparison is ever wanted, it arrives as a comparison mode in the
  definitions, not as renderer arithmetic.
- **Hour is a bucket, not a series.** Thirty days grouped by hour is one set
  of twenty-four figures — it orders by the hour, sums across the days, and
  is never compared, for the reason day, week and month are not.
- **A mark with no `colour` channel paints in the tile's own hue.** Until
  this date it drew in the neutral grey, so Rockwell's chart sat on
  Rockwell's violet tile in slate. A line now also names its high and its
  low — both rows the read returned, so both may be written.

### History as context

*Added 2026-09-12.* The one thing the research added to the plan: a Jarvis
infers context from **time**, **place** and **history** before it asks. The
room had the first two — the standing answer opens the morning; opening a
shop opens its object. This is the third.

- **The room reopens where you were.** "/" with nothing in hand opens this
  morning's standing answer *if it is newer than your last look at it*, and
  otherwise the thread you left. Nowhere to go back to and nothing new is a
  real answer, and stays the empty room. Clearing the board forgets the last
  thread on purpose — leaving must not walk straight back in.
- **What arrived since you last looked comes to the centre.** Per thread,
  the browser keeps the time of the newest answer that was on screen while
  you were looking. On return, every object touched by a later answer lands
  with the glow, and one line above the board says how many answers arrived
  — a count of turns with a time after that mark, never a guess (UI rule 8).
  Ask anything and you are no longer "back": the line and the glow stand
  down, and everything is marked seen as it settles.
- **Per viewer, per browser, never sent** — exactly like an arrangement.
  When you last looked is a fact about a person's attention and stays on
  their machine ([history.ts](frontend/src/room/history.ts)). A server-side
  record of attention is a different thing and was not built.

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

## 2026-09-12 — The first deploy in five days, and why it crashlooped

Pushing `main` took production down, and the cause was already there. The
database was at `r2s3t4u5v6w7` (`george.beliefs`, 2026-09-10) — **ahead** of the
build serving since 2026-09-07, which had never heard of that revision.
`schema_check` runs at startup only, so the old container kept serving and
**any** restart since 09-10 would have crashlooped. The push was the restart.

So a rollback would NOT have restored service: the old build hits the same check
by the AHEAD branch. The only way up was forward.

**`AUTO_MIGRATE_ON_START` is false in Railway**, overriding the `True` in
`config.py`. `alembic/env.py` uses the same `settings.DATABASE_URL` as the app,
so this was never a URL mismatch — the migration simply never ran, and the same
thing will happen on the next deploy. Card P0.4.

Four migrations were applied by hand from a local checkout, additive and in one
transaction; the database is at `v6w7x8y9z0a1`, the revision the code expects.
The service still needs a restart: its replica had spent all ten retries.

## 2026-09-12 — George is a page in Supabot BI again

The owner, looking at the deployed app: *"what happened to the other pages of
my supabot bi? this is still supabot, just make george a page."*

Nothing had been deleted. Dashboard, Analytics, AI Chat, Warehouse, Packing,
Settings and Admin were all still routed, still in `role_page_access`, still
rendered by the legacy chrome with their own nav. What had happened is that
the Experience Reset (2026-09-09) made `/` RENDER the room rather than
redirect, and George first in `PAGES` — so `landingPathFor` sent everyone with
George into George, and the room's rail links only to George's own screens.
Every other page was reachable from nowhere a person actually stood.

So the reversal is narrow and it is the owner's call: `/` is a redirect again,
Dashboard leads `PAGES`, George has its own path at `/george`, and the rail
carries a link back to Supabot. The room keeps its full-bleed surface rather
than rendering inside the legacy chrome — it is `100dvh` with a fixed rail, and
nesting it would mean CSS surgery on the one surface that currently works.
Being a page is about being reachable and leavable, not about being in a
frame.

**The rule this leaves behind: a surface you cannot leave is not a page.**
If George is ever made the landing again, that is the reason not to.

Also corrected here: the previous entry claimed the `/api/v1` rewrite existed
only in the Vercel dashboard. It does not — `frontend/middleware.ts` performs
it, `frontend/routing/backend.ts` holds the Railway origin and fails closed on
a preview without staging config, and `routing.test.ts` covers both.
`VERCEL_ENV_SETUP.md` and a comment in `useGeorgeStream.ts` say it is in
`vercel.json`; those two are stale, and the claim I wrote from them was wrong.
Railway itself is healthy: schema `v6w7x8y9z0a1`, code and database agreeing.

## 2026-09-12 — The answer disappeared, and the plan had it filed under speed

The owner, on the deployed build: *"it doesn't even function right — I sent
'how are we doing', stuff came out but it just disappeared."*

**Cause.** `agent/loop.py` emitted `answer_reset(interim_prose)` whenever an
iteration produced text AND any `tool_use`. `compose` is a `tool_use`. The
client's handler for that reason moves the written text into the activity
disclosure and sets `t.text = ''` — deliberately, and without the `superseded`
protection the other reset reasons get, because narration is not meant to
reappear. So every time George arranged the board, the sentence he had just
written was taken off the screen. He composes two to four times in a typical
answer, and `compose` is refused in 8 of the 12 eval questions, each refusal
costing another call. When the final compose landed few blocks, there was
nothing left on screen at all — the board's empty-composition fallback only
fires when NOTHING composed, not when little did.

**Fix.** The reset now fires only when a READ is in the batch. The rule it was
written for is untouched: "Rockwell is down; let me look at the drivers" before
a read is a preamble to work not yet done. A label call reads nothing and
discovers nothing, so prose beside it is the answer. Four cases hold it,
including the exact shape reported (compose, refused, composed again) and the
original guarantee.

**What this says about the plan, which matters more than the bug.** This fix
was already in the plan — as item (c) of a card called "compose stops
round-tripping", filed under Phase 1, *make the one surface fast*. It was
never a speed problem. The plan measured latency and assumed correctness, and
the owner found the defect before the plan would have. Phase 1 is reordered:
**make it work, then make it fast**, the daily dogfood log drives the order,
and no speed card starts while a reported defect is open.

## 2026-09-13 — George is a tab on the main page

The owner: *"can you put george just in the tabs of the main page."* This
finishes the reversal begun yesterday. Yesterday George got its own path and a
link back, but still opened a full-bleed surface with its own fixed rail —
reachable and leavable, yet plainly a second app. It is now drawn inside the
Supabot chrome like Dashboard or Warehouse.

**George owns tabs, which is the app's existing pattern.** Dashboard owns
Stores and Vending; Warehouse owns Replenishment and Barcodes; George owns
Board, Needs you, Kept and Running. Each keeps its own URL, so links,
bookmarks and the back button work. `Rail.tsx` became `GeorgeTabs.tsx`: a
horizontal strip, not a fixed left rail, because a second vertical rail beside
the app's own sidebar is chrome inside chrome.

**Running (`/workflows`) joins the strip.** It was routed but reachable only
from a single link inside Inbox, which is not navigation.

**Two layout facts the CSS could not say.** The room stood on a `100dvh`
floor because it used to own the screen; inside a content area that added a
blank screen under every short answer, so it is `min-height: 100%` now. And
the composer is the one thing fixed to the VIEWPORT rather than laid out in
the page — it escapes the chrome's `lg:ml-64` and carried a 56px offset for
the rail that is gone. A fixed element cannot inherit that offset, so the
chrome states it: Layout puts `chrome-sidebar-open` on the same div it puts
`lg:ml-64` on, and a descendant selector reaches a fixed child regardless of
positioning context. The breakpoint in `room.css` mirrors `lg` exactly.

The accent allowlist keeps its four entries; `Rail.tsx` is replaced in it by
`GeorgeTabs.tsx`, carrying the same needs-you count for the same reason.

## 2026-09-13 — George takes the whole screen, and the rail is the way back

The owner, after using the tabbed version: *"when you open george in supabot
tab it should cover the whole screen, no more supabot, but there should be a
back button on sidebar."*

So `d44249c` is reverted. George opens from the Supabot sidebar and then
replaces it: full-bleed, its own rail, no chrome behind it. **What survives
from the reverted commit is the part that was right** — Running joins the rail,
because it was routed and reachable only from one link inside Inbox, so a
person who had never opened an approval could not find it at all.

**The back arrow is the rail's FIRST item.** Yesterday it sat second, under
the mark, when the chrome was still drawn behind George and the arrow was a
convenience. It is now the only way out of a surface that covers the screen,
and it goes where a person looks for a way back.

**Why the tabbed version was wrong, recorded so it is not retried by
accident.** Putting George in the chrome meant two vertical rails side by
side, and a board that wants the width of the screen squeezed into a content
column. "A page in the app" and "a surface that owns the screen" are both
legitimate, and the deciding fact is the board: it is the product, and it
needs the room. The rule from 09-12 is unchanged and is what makes this safe
— **a surface you cannot leave is not a page** — so the back arrow is not
decoration, it is the condition on which full-screen is allowed.

Kept from the tab work and now dead: nothing. `chrome-sidebar-open` went with
the revert, since the composer no longer sits inside an offset chrome.

## 2026-09-13 — The bill, and the one optimisation that is refused

The owner: *"is optimising api usage also part of the plan like caching etc?
cause it costs a lot."* It was not, and the reason it was not is the same
reason turn time was not: nobody had looked.

`agent/loop.py` has written `input_tokens`, `output_tokens`,
`cache_read_tokens` and `cache_creation_tokens` to `george.conversations`
since the first commit. Nothing had ever read them. `ops/cost_report.py` now
does, and the first run over 30 days says: **193 turns, $44.64, $0.2313 a
turn, 26.2% cache hit rate**, with **76% of the bill in uncached input**.
Caching exists and is saving 20%.

**The likely cause is one word in a comment.** The three breakpoints are
placed correctly — tools, system, and a moving one on the message tail — and
the comment beside them reads "Both TTLs are the default 5m". The stable
prefix is ~9,200 tokens and this usage is bursty, so it expires between
sessions and is rebuilt at full price on most turns. A 1-hour TTL is a
one-line change per breakpoint.

**The distinction that decides which levers are allowed, and it is the real
content of this entry.** *Trustworthiness* is structural: figures come from
tools, notices surface, refusals refuse, held by the loop and the
definitions. No amount of caching or batching can make George invent a
figure. *Reasoning quality* is not structural — it depends on what he can see
and how hard he thinks. So:

- The TTL is **free**. A cache hit and a miss present byte-identical input;
  it changes the bill and cannot change an answer.
- Fewer iterations (P1.a/P1.b) removes round trips spent LABELLING, not
  database reads. Same evidence, fewer trips.
- Effort per turn could genuinely dull him, which is why P1.c already fails
  if a quality check regresses.
- **Cutting `MAX_ROWS_TO_MODEL` from 200 is REFUSED.** It was on my own list
  and came off the same day. It is the only lever that reduces what George
  can SEE, so more answers would land as "this is a sample" instead of a
  reading. Truncation is honest and `meta` aggregates are never truncated —
  that makes it safe, not worth doing. **A lever that only costs money is
  free; a lever that narrows what he reads is the product.**
- Model cascades are refused too: caches are model-scoped, so routing cheap
  turns elsewhere forfeits cache reuse and usually costs more.

At 193 turns a month $45 is nothing. 23 cents a question is the problem,
because it does not survive real use.

## 2026-09-13 · P0.6 — the bill, and the number that measured a dead build

- The 26.2% hit rate P0.6 was written on came from a 30-day window that mostly
  predates `e067ba7` (2026-09-05, the message-tail breakpoint): 90 of 138
  billed turns are one scripted sweep on a build that no longer exists, and
  they carry 85% of the uncached tokens. Since `e067ba7`: 6 turns, **58**
  uncached tokens, **87.3%**. The target was met before the card was written.
- **Rule: a cost or latency number is read per build, not per window.** Added
  `--since` to `ops/cost_report.py`, and said in the report that `--ttl`
  reprices history and cannot move a measured hit rate.
- TTL raised to 1h on the static prefix anyway, as insurance — but on the
  evidence it is worth cents: every gap on this build is under 5 minutes or
  over 7 hours, and the 5–60 minute band it covers has zero turns in it. The
  tail stays 5m; mixed TTLs need longer-before-shorter. 9 cases hold it, where
  nothing had ever asserted `cache_control`.
- The tools array is four arrays, not one — `view_page` enters per QUESTION —
  and the breakpoint sits past the 17-tool shared block. Free to fix, not done.
- **Cost per turn is $0.39 on this build at 6.0 iterations, not the $0.23
  headline. The bill is round trips.** P1.a/P1.b are the cost cards.

## 2026-09-13 · the dogfood fix — imprecision was the way past the figure gate

- "800 grams-worth" over a row drawn as 801. The loop already rewrote an answer
  that quoted a drawn figure EXACTLY (`restated_sentences`, matched at the
  precision written), so quoting it WRONG tripped nothing and shipped. The
  further off George was, the safer he was from the guard.
- `agent/prose.py` gains `misstated_figures`: a prose numeral that is a drawn
  figure rounded off, bounded by how many of that figure's own digits survive
  (`voice.misstatement.min_significant_digits`, 2). Shares the restatement
  gate's single corrective turn — no new round trip — and records kind
  twenty-one, `misstated_figure`. 20 cases, 7 through the real loop.
- **Rule 9's line is intact**: it only ever asks about figures the board DRAWS.
  Whether a figure absent from the board came from a tool stays an eval.
- The catalogue guarantee was weaker than NOW.md claimed: the contract test
  scanned string literals, and a yaml-sourced kind reaches `log.gap` as a
  VARIABLE. `restated_figure` was held by a hand-written test of its own and
  kind twenty-one would have had none. Now the class is held, not each member.
- **The twelve are a sample.** 12/12, 11/12, 10/12, 11/12 over four runs; every
  non-trust failure is `leads_with_reading`, and the trust properties never
  moved. Do not report a style score off one run.

## 2026-09-13 — How often the twelve actually need to run

The owner: *"how many times do we really need to run the 12 question eval
cause i have to pay for it using my api."*

**A full run is ~$5–7** — 61–75 iterations at the production per-iteration
rate — and seven runs were already on disk, comparable to a month of real
traffic. **None of it appears in `ops/cost_report.py`**, because the harness
stubs `ConversationLog` and an eval turn never reaches `george.conversations`.
So the harness now keeps the `usage` the done frame was already carrying, and
prints the run's cost on stdout. The report's top level changed from a bare
list to `{"spend", "cases"}`; nothing in the repository parses it, and the
seven older files are still lists.

**The rule, in `NOW.md` 2b: the default is DON'T.** Docs, ops, tests,
frontend, routing, deploys and anything to do with caching cannot move model
behaviour, so a run buys nothing. Prompt text, tool descriptions, effort,
iteration structure and `compose` validation can, so they need one. And when
one is needed, run three or four that exercise the changed path while
iterating, and the full twelve **once** at the gate.

**A card may not ask for a run it does not need.** My own P0.6 draft said
"report the standing trust gate", which would have spent $6 proving that a
cache lifetime does not change an answer — it cannot, because the model gets
the same bytes either way.

**And a correction I owe this entry.** I recommended the TTL change off a
26.2% hit rate measured over a rolling 30-day window. The window spanned
`e067ba7`, which added the message-tail breakpoint on 09-05, so it averaged
two different builds into a number describing neither. The P0.6 session split
it: **87.3% on the current build**, target already met, and the TTL is worth
cents or less. The lesson is the one `--since` now exists for — a rolling
window across a behavioural change measures nothing.

---

## 2026-09-13 · P1.a — where a refusal earns its round trip

**The card guessed wrong about what was being refused, and the measurement
said so.** It named a second `lead`, a stray field on a `change` and a no-op
`change`; four recorded runs of the twelve contain **one** of those between
them. The real 46: a figure with no subject over a one-row read (15), a spec
node spelling the discriminator `type`/`kind`/`node` while carrying the
grammar's own words as the value (11), a comparison with no subjects (5).
Build the card's list, but measure before believing its reasons.

**The line, in one sentence, and it is the thing to hold:** a coercion may
change which WORD holds a value; it may never change which value is drawn, or
introduce one. A rename is a coercion. A demotion is a coercion. Choosing
which of seven rows a figure draws is not, and is still refused.

**`filters_applied` is evidence, not an argument.** A read scoped to Rockwell
is about Rockwell even when the grouping left no column carrying the word.
Refusing that sent George to re-read an identical figure grouped by store so
the word would appear in a cell — four iterations for a label the tool had
already declared in `meta`.

**One coercion came back off the list**, and this is the precedent: dropping a
block's stray `value`/`colour`/`title` and drawing the rest buys no round trip
(the schema is `additionalProperties: false`; zero occurrences in four runs)
and blunts the boundary the file exists for. A coercion that saves nothing and
costs a guarantee is a bad trade in one direction only.

**Two of three targets were missed and the card is still closed.** Label share
33% against 25%, iterations 4.0 against 2.5. The residue is one `compose` a
turn — so the rest is READS, which is P1.c and P1.d's work, not more
squeezing here. Say the shortfall.

**A failing check was not widened to pass.** `cannot` refused in plain English
and failed on a contraction (`There's no` vs the definitions' `there is no`)
and a verb `_LIMITATION` does not list. Fitting the measure to the result is
what P0.2 deleted 91 assertions for; the phrase list is the owner's to move.


## 2026-09-13 — The bill reconciled against the console, and two wrong calls

The owner filtered the Anthropic console by the `george` API key: **51.6M
tokens in over 30 days**, against the 9.4M `ops/cost_report.py` reports from
`george.conversations`. **The script sees 18% of the traffic.** Every eval
turn is missing, because `tests/evals/harness.py` stubs `ConversationLog`, and
so are retries and turns that died before writing.

**Two conclusions I drew from that 18% were wrong, both stated confidently.**

  1. *"Cache hit rate is 26.2%, raise the TTL."* The window spanned `e067ba7`,
     which added the message-tail breakpoint, so it averaged two builds into a
     number describing neither. P0.6 split it: the live build was at 87.3% and
     the target was met eight days earlier.
  2. *"76% of the bill is uncached input."* The console's token-type breakdown
     for 2026-09-13 ($18.20 in one day) is cache WRITES 44%, reads 32%, output
     23%, uncached input **effectively zero**. The opposite of what I said.

**What the console actually shows, and it closes caching as a topic.** 9.5
cached tokens read per token written; the same day uncached would have been
$69 instead of $18, a 74% saving. **Caching is working. Do not reopen the TTL
or chase the hit rate.**

**And the real finding: the bill is the building, not the product.** 13.2M
tokens on 2026-09-13 — about six full eval runs plus the turns sessions fired
while working — against **193 real turns in the entire month**. At that rate
it is $546/month, and almost none of it is anyone using George. The levers, in
order: run the twelve far less (2b), then P1.b and P1.c, which cut writes,
reads and output together because every iteration writes a new tail and
generates thinking.

`cost_report.py` now says all of this in its own output. A report that reads
like the whole truth while showing a fifth of it is worse than no report —
that is how both wrong calls got made.

## 2026-09-13 — The 26 reviewed against the market, and the split that explains five rebuilds

The owner: *"is this what your research brought you was the best way to go
for what i want? ... do a full research too on functions and basically
everything cause i dont even know if my ideas are good."*

**They are.** Twenty-one of the twenty-six are supported by products people
pay for; sixteen of those are built here. The category he named — an AI
operating system for a business — is where the whole industry moved in 2026
(Salesforce, ServiceNow, Make all repositioned onto "agentic OS"); he is
building the version for a business his size, which none of them are. Full
review: https://claude.ai/code/artifact/1cb5dffa-972c-4988-8f20-7f745be88bd8 ("The 26, Reviewed").

**The finding that reorganises the plan: the 26 describe TWO kinds of screen,
and one surface kept trying to be both.**

  - *Answering* — "how are we doing", "why", "compare", "products". One
    question, one finding, its evidence, what next. Transforms predictably.
    Short-lived.
  - *Operating* — a purchasing system, the approval queue, a kept page, a
    thing George built. Many objects and controls, arranged and STABLE. Does
    not recompose when you ask something. Long-lived.

Hex is built exactly this way (Threads for conversation; Notebooks and Apps
for the thing you operate; a bridge between). The generative-UI field's
production lesson says the same from the other side: *"users need to
understand why the interface changed; if it feels arbitrary, it feels
broken."* A board that recomposes on every question is arbitrary by design.
That sentence explains all five rebuilds.

**So the finding redesign (13 Sep) was right for the complaint and incomplete
for the vision.** It is the answering surface. It is the wrong shape for a
purchasing system or a page, and the operating surface — pages, inbox,
workflows, already half-built — is its own thing, not pinned answers. "Keep
this" is the bridge.

**Feature 4, expressive/tactile/spatial visualisation, is DROPPED.** It is the
one feature the evidence contradicts: tactile-chart research is for blind and
low-vision readers; spatial encodings add cognitive load for value lookup
versus a table; and "i dont really know what im looking at" is what novelty
costs. Explanatory visualisation wins by restraint.

**Feature 1 is narrowed to what is validated:** a fixed catalogue of marks
chosen by what the claim asserts, drawn one way. The binding stays; free
arrangement goes.

**Three warnings from the market, now standing rules:** proactive systems die
of noise (3% of alerts warrant attention — silence-by-default is not to be
loosened); an interface that changes for no visible reason reads as broken;
built-by-AI systems rot without governance, and the promotion gate is the
part to protect as "build it" gets more capable.

**Features 8, 23, 24, 25 are a third of the standard and are blocked on
sources only the owner can supply.** Start them now, in parallel.

## 2026-09-13 — Copy what works: ten patterns borrowed from named products

Artifact: **George, Borrowed** —
https://claude.ai/code/artifact/bdf022de-6279-4e48-8422-d3c078d95810

The owner asked for the design to borrow directly from products that already
solved parts of this, not to be derived from principle alone. Ten patterns,
each drawn as it appears in its source and again in George, with the
features it serves and the one build change it implies:

1. Hex Threads (verified from docs): one object, three views (Agent /
   Notebook / App), "Unlisted → Save as project", cell refs jump to the
   logic. → a thread is already a page: Talk · Behind it · Page, "unkept →
   Keep as page"; Behind it is reads with receipts, never code.
2. ThoughtSpot: the interpreted question as editable tokens; coaching. →
   "Read as" tokens under every ask; a token tap is a replay through
   `POST /george/replay`, no model call. This is P1's 50%-no-model lever
   with a face.
3. Perplexity: sources above the answer, steps behind one plain line. →
   one derived line above the claim: reads, tools, time, caveat count.
4. Manus / Devin: a live step list with a result per step, replay when
   done. → the Working line becomes the ladder's rungs as they happen, each
   tappable, with duration_ms; no planner (rule 5); replay = stored calls
   in order.
5. Canvas / Artifacts / v0: the built thing stays pinned and each turn
   revises it, with version arrows. → shared subject = one pinned object
   with versions, finding column narrows; no shared subject = clear.
6. Cursor / GitHub: a change is a diff you accept. → every proposed write
   (save_workflow, edit_page, standing question) renders as before/after of
   arguments; Keep makes a version; Promote stays in Needs you.
7. Linear Triage: nothing enters until accepted; snooze; per-kind verbs;
   keyboard. → Needs you gains Later and per-kind actions; j/k/e.
8. Things 3 / Superhuman: Today is a list that ends. → three groups
   (George found, Due today, You added) and an end line rendered only from
   a loaded empty result (UI rule 8).
9. Stripe / Mercury home: few figures, sparkline + delta, feed under, every
   figure opens a detail. → a pin draws a sparkline only when the tool gave
   a series; a page keeps its own river; tap = object in ~1s.
10. Hex @ data source / Linear @: → composer @ resolves shops, suppliers,
    products, pages to ids that land in tool arguments.

**Six things deliberately not copied,** each against a rule already written:
Liveboard/Power BI tile grids (the KPI feeling), Manus's second column
(rule 7), Hex's SQL cells (rule 1), Devin's editable plan (rule 5),
Perplexity's generic Related chips (cost), Cursor's accept-all (rule 7 on
promotion).

**Order of adoption:** 3 and 4 are free (frames already carry the data);
2 is P1.b/replay wearing a face; 1, 5, 6, 7, 8, 9, 10 wait for Phase 2.
None of it changes the two-modes split or the finding design.

## 2026-09-13 — Borrowed II: how data is drawn, text written, suggestions offered

Artifact: **George, Borrowed II** — see `ops/NOW.md` §6 for the link.

Fourteen more borrowings, this time for the content inside the finding.
The sources are news graphics desks, health apps and writing tools, not
the AI chat products, which mostly get this wrong.

Data (11–18): the chart's title is the claim and the subtitle is the
measure (FT/Economist); a source line under every chart, not only under
the finding (Datawrapper); drivers as contributor bars with no shares
(Oura/Whoop); "usual" as a baseline, drawn as a band with today's marker
(Google Maps popular times, Google Flights) — REQUIRES a `usual_weekday`
comparison defined in metrics.yaml first; previous period as a dotted
line on one axis (Stripe/Vercel); colour is direction only and digits
are mono tabular (Bloomberg) — extend the accent scan to the four data
colours; bars inside table cells for ranked results (Hex/Notion); one
sentence + one small chart as the unit of evidence (Apple Health
Highlights).

Text (19–21): three fixed slots — claim, caveat, next — with "next" always
one sentence and always last (Axios Smart Brevity); a read-index marker
after every figure in prose, derived by matching numerals to rows, so an
unmatched numeral is visibly marker-less (Perplexity citations); two
voices told apart by type — serif is George's reading, mono is derived
from frames or rows — as a tested rule, no sparkle badge ever (Gmail
Smart Compose / GitHub Copilot labels, inverted).

Suggestions (22–24): a provisional dashed frame with Keep / Discard /
Try again / Not what I meant for every unkept thing (Notion AI); ghost
text completing the question, built deterministically from the board's
rows and offering only replays and object opens, Tab accepts (Copilot,
Gmail); a suggestion carries its reason and sits on the row it's about
(Netflix "Because you watched", Siri Suggestions) — the label tool's
actions gain a target subject and a reason, the reason bound by the
annotation rule.

Not copied: ChatGPT headers/bullets, Apple Health rings (fullness needs a
denominator — already declined), Oura's composite score (a definition
nobody chose; rule 9), Robinhood whole-screen colour, Perplexity's answer
length, Copilot completing anything.

Adoption: the evidence block and the three text slots are P1 finding
work; three new marks and the provisional frame are P2; targeted actions
and ghost completions P2; the "usual" band waits on its definition.

## 2026-09-13 — One page: George, Ideal UI

https://claude.ai/code/artifact/7d69541a-ab54-4cfc-b622-77be5c7679c4

The owner asked for one thing: the ideal UI and UX for all 26 functions,
not more research. This mockup is it. It folds the 24 borrowings into the
working screens and adds what the earlier renders lacked: an estate
switch (23) that is honest about AJI CMG having no feed; a memory view
(11) where every belief can be forgotten; a document scenario (24) where
an invoice is read into a matched delivery, provisional until kept and
labelled as needing a source; a "Send the order" frame (25) as the one
veto point, with no channel connected; a mic in the composer (26);
selection-as-context (7) by tapping a row; ghost completions built from
rows. The "26" rail button is the coverage map: built / designed here /
needs a source, per function, in the owner's order.

Status by that map: 17 built, 6 designed here (4, 7, 16, 20, 21, 26),
4 need a source (8 in part, 23, 24, 25). Nothing on the map is claimed
built that the code does not do today.

## 2026-09-13 — The plan to the Ideal UI, session by session

Artifact: George, The Build Plan (link in NOW.md §6). NOW.md §3 rewritten
from P1.c onward: 31 sessions in four phases, one card each. Phase 1 (11)
puts the three Open complaints first as cards P1.c/d/e/g, then speed (P1.h
effort, P1.i replay endpoint, P1.j tokens and fragments), then visible work
for free (P1.k). Phase 2 (9) brings answering mode to the Ideal UI: thread as
page, markers, taps as context, targeted actions and ghost completions,
investigation replay, memory view, estate switch, voice. Phase 3 (7) is
operating mode: the queue, Today, Kept, the pinned object with versions and
the provisional frame, diffs, the usual_weekday definition. Phase 4 is the
six sources only the owner can supply, each a card the day it exists.
Gates between phases are five days of empty Open plus the phase's numbers.
Every prompt is "Read ops/NOW.md. Do the next card." — cold-session safe by
construction. Honest calendar: eight to ten weeks to the Phase 3 gate.
Old P2.a/b/d absorbed into P2.c, P1.d, P2.h; old P2.c (one expressive form)
dropped with feature 4.

## 2026-09-13 — Model switching (Opus → Sonnet): still no, now with the arithmetic

P0.6 recorded "do not cascade models" in one line. The question came back, so
here is the measurement behind it. Read from `cost_report.py --since
2026-09-05` (the current build, 10 real turns, $2.50 total):

| per turn | tokens | share of turn |
|---|---|---|
| cache read | 138,590 | 27.7% |
| cache write | 20,527 | 51.4% |
| output | 2,084 | 20.9% |
| uncached input | ~9 | 0% |

Four reasons, in order of how much they decide it.

1. **The premise.** Production is $0.25/turn and ~10 turns a week. One eval
   run is $1.59–$1.71 and a heavy build day was $18.20. Zeroing the
   production model bill entirely saves ~$10/month. It is 3% of the bill.
2. **The cache is model-scoped, so the saving is smaller than the price
   ratio and can invert.** The prefix is ~30k tokens (138,590 read over 4.6
   iterations). A turn routed to a second model pays a full cold prefix
   WRITE at that model's write rate, and cache write is already 51% of the
   bill. At a 5x price gap routing still saves ~$0.16/turn; at a 1.7x gap it
   costs ~$0.01/turn MORE. Exact Sonnet 5 rates were not pinned here, so the
   sign of the answer is unknown — which is itself the reason not to build
   on it.
3. **The cheap turns are being DELETED, not routed.** P1.a cut label calls
   50% → 33%; P1.f shrinks compose further; P1.i/P1.j answer navigation
   fragments with **no model call at all**. A turn that costs $0 beats a
   turn that costs 40% less. You cannot route a turn that no longer exists.
4. **What survives that is judgment**, which is rule 9's "the model selects,
   investigates, explains and interprets" — the product. NOW.md's own line
   decides it: a lever that only costs money is free; a lever that narrows
   what he reads or dulls how he thinks is the product. The TTL is the
   first kind. Model choice is the second.

**And it would break the measure.** The twelve measure George's behaviour.
Mixed models make a run a blend, and a flapping style check unattributable.

**Where model switching already happens, correctly:** across SESSIONS, not
turns — Opus 5 builds, Fable 5.1 reviews. Whole task, own context, no shared
cache to forfeit. That is in the working protocol and stays.

**When to revisit, named so it is not re-litigated sooner:** when production
turns exceed build turns in the bill. The design then is a fixed split by
SURFACE, not per-turn routing — unattended watches and standing questions run
hours apart and pay a cold write anyway, so they forfeit no cache. Note even
then that the morning standing question is the highest-judgment turn of the
day and is the worst candidate on the list.

## 2026-09-13 — A source that was never blocked, a tally that was wrong, two cards

**AJI CMG was never blocked, and a session said twice that it was.** It listed
"the vending feed" as S.3, a source the owner had to supply, in both the plan
and the Ideal UI map. Then it checked: `tools/vending.py`, the `get_vending`
tool, `v_vending_order_lines_php` / `v_vending_orders_php` /
`v_vending_goods_php` and a full `vending:` domain in `definitions/metrics.yaml`
all exist and are read today. **George already covers two businesses.**
S.3 withdrawn; feature 23 is designed-not-built (P2.g), not source-blocked.
Two constraints that ARE real and stay: `never_join_to_store_domain: true`
(the domains sit side by side, never joined), and vending profit is computable
but overstated on 72.7% of lines where cost was never entered, with a
mandatory flag. Retail profit stays unsupported —
`store_profit_do_not_reintroduce: true`, because `products.cost` is a single
current scalar with no history and 636 of 3,678 products have none.

**The 26-tally was wrong in the plan's favour.** It read 17 built · 6 designed
· 3 source-blocked; the map's own rows say **16 · 7 · 3** and the old figure
double-counted feature 8. Corrected in the plan page. The honest answer to
"will everything be operational" is 16 of 26 as written, with feature 4
dropped, four narrowed (1, 15, 16, 17), three source-blocked (8 in part, 24,
25) and feature 12 closable only by living with it.

**Two capability cards added (P2.i, P2.j).** Both change what George can SAY,
not how it looks, and neither needs a new source:
- **P2.i same-store year-over-year.** `same_period_last_year` is refused
  because the estate is a different shape a year apart, and the refusal names
  its own fix: define a same-store rule first. For a Chinese-candy retailer
  in the Philippines, Christmas and Chinese New Year ARE the year, and
  `previous_period` cannot see either. Seasonally time-boxed: at one card a
  day it lands ~mid-November, so it is the one card worth pulling ahead.
- **P2.j the watch fires before the stock-out.** Crossing zero reports a lost
  sale. "Will cross zero before it can be restocked" is computable from the
  replenishment and purchase-plan tools plus a units/week rate; lead time
  arrives as a BOUNDED SETTING (architecture rule 6), not as the frozen PO
  export, and a line with no lead time says so rather than defaulting.

**Four candidates parked in NOW.md, not started:** negative stock as a
data-integrity measure, transfers drawn as weighted flow (the one expressive
form CLAUDE.md did NOT decline), delivering the morning brief to Telegram
where `tools/brief.py` and BRIEF_TOKEN already exist, and basket affinity
(lowest confidence, parked behind the rest).

## 2026-09-13 — Reviewing the two pages found four more errors, all mine

Asked to check the artifacts were right. A checker over both pages
(`scratchpad/review.py`: every data-screen, data-go, data-ref, data-pop and
data-open target resolves; the map is 26 rows in order; tag and button
balance; the page's card list against NOW.md §3) found no structural faults
and four content ones:

1. **Feature 8's map row still said "the vending feed" was a source** the
   owner must supply — the same error withdrawn as S.3 an hour earlier, in a
   second place. Now names supplier-per-product, arrivals, documents, people.
2. **P2.g's done-when still said "AJI CMG says it has no feed"**, in the plan
   page AND in NOW.md. Both now say vending is read and the switch is what is
   missing, with the never-join rule and the overstated-profit flag beside it.
3. **Every session count was wrong.** The headline said thirty-three (and
   thirty-one before that) against **28** open cards; Phase 1 said eleven for
   ten; Phase 2 said nine for eleven. Phase 3's seven was right. The calendar
   bands were redrawn and the estimate moved from eight-to-ten weeks to
   **nine to eleven**, which is what 28 cards at four a week plus one fix in
   three actually comes to.
4. **"3 open defects"** should be 3 open REPORTS holding ten defects between
   them.

`review.py` now FAILS on a wrong count rather than printing it, so the next
edit cannot quietly desynchronise the page from §3. **The lesson worth
keeping: every tally stated in prose in this project has been wrong at least
once** — 17/6/3 double-counted a feature, three session counts, and a source
that was never blocked. Derive a count or check it; never restate one.

## 2026-09-13 — A borrowed pattern had no card, and the plan's labels were unreadable

The owner asked what the pills on each card mean, asked to be told when to
switch model, and asked whether the plan really covers the UI work discussed.
Auditing the 24 borrowed patterns against the 28 cards found **one with no
card at all**:

**Borrowing 10, `@` names a thing (Hex's @ data source, Linear's @).** It is
drawn in the Ideal UI's composer and no card had it. P2.c was tap-to-select
and P2.d was ghost-text completion; neither is @-resolution. **Folded into
P2.c** rather than given its own card, because it is one mechanism with two
doors: a tap and an `@` both resolve a subject to an ID FROM THE ROWS,
produce the same chip and travel in the same request field. An `@page` binds
`page_scope`. The other 23 patterns all map to a card; so do the three open
dogfood reports (P1.c, P1.d, P1.e, P1.g) and the hands-free mode discussed
under the Jarvis question (P2.h).

**The card labels were bare numbers with no key** — "2 · 6" next to
"no eval" told the owner nothing. The plan page now carries a legend, and
feature pills read "#2 · #6" so they read as references to his own 26 rather
than as a date or a count.

**Model switching is now stated, not implied.** Opus 5 builds every card;
Fable 5.1 is for exactly two moments, and both are marked on the cards: after
each phase closes (P1.✓, P2.✓, P3.✓ each carry a "switch to Fable after"
pill and a review prompt), and any time a close-out surprises the owner.
Never mid-card.

**One rule kept, at a cost.** The switch-model pill was drawn in the accent
first. Changed: this page is read beside the product, the accent means
"needs you" and nothing else, and teaching a second association on a
planning page is how the rule erodes. It is cream now.

## 2026-09-13 — "Do we always need to eval?" No, and the plan over-prescribed it

The owner said evals have been costing a lot. Checking found a contradiction
and three over-tagged cards.

**The stated price was 3–4x the measured one.** §2b said a full run is
"roughly $5–7", derived from an iteration count. The harness now prints its
own spend and P1.b's two live runs came in at **$1.59 and $1.71**. The
close-out saying so sat 500 lines below the estimate that contradicted it.
Corrected to ~$1.65. **An inflated price is not a safe error** — it makes a
session skip a run that would have caught a trust failure.

**"Subset" was undefined and is now the TRUST GATE: four fixed scenarios,
~$0.55.** Across every recorded run the trust rows are stable and the style
checks flap, so the value is concentrated: `caveats` (a notice unsurfaced or
forced), `why` (a figure no tool returned; attribution), `cannot` (a refusal
that stopped refusing), `morning` (the volunteering cap and the rounded-figure
gate). Picking scenarios by feel is what "subset" used to mean and it is
replaced. The full twelve runs only at the three phase closes and on the two
cards that rewrite the compose grammar or change effort.

**Two runs per card, maximum — this is where the money actually went.** One
to see the problem, one to confirm the fix; a third failure means the card is
wrong, not the code. The $18.20 day was ~6 full runs and none of them was a
gate: it was a live model iterated against a failing check.

**Three cards were tagged for an eval that cannot see them.** P1.j (tokens
render from arguments the loop already accepted, and a fragment SKIPS the
model), P2.j (a scheduled watch makes no model call at all, rule 7), P3.d
(the provisional frame and version arrows render over write proposals that
already exist). All three now say No eval, with the reason.

**The whole plan's eval spend, computed rather than estimated: $12.10** —
7 trust gates at $0.55 plus 5 full runs at $1.65, and under $25 even if every
one of those needs its second run. Over nine to eleven weeks. The bill is
still build sessions, not the gates.

## 2026-09-13 — Are the twelve good? Partly. Three real weaknesses, one serious

The owner asked whether the twelve questions are a good test and why twelve.
Read the suite (`tests/evals/test_voice_evals.py`) and compared it against the
real questions in `george.conversations`.

**Why twelve: it accreted.** They are `test_01` … `test_12` with no coverage
argument written anywhere. As MODE coverage they are reasonable — proactive,
investigation, entity, entity, build, follow-up, correction, refusal, notices,
time-bucket, page write, schedule refusal — but `shop` and `product` are the
same shape, and `by-hour` matches nothing anyone has ever asked.

**1. SERIOUS: nothing checks that the answer is USEFUL.** Every assertion is
about form and honesty — status ok, iterations capped, no forced notice, no
ungrounded numeral, no internal vocabulary, and a refusal only where one is
expected. **A George that replied "I can't establish that from what I can
read" to all twelve would pass almost every assertion.** The suite cannot
distinguish a useful colleague from a maximally cautious one, which is exactly
the failure mode the trust machinery pushes toward. This is the gap that
matters, because the owner's complaint was never "he lied", it was "it doesn't
function right".

**2. The register is wrong, and the real questions are on disk.** The evals
ask well-formed, fully-specified questions. The owner writes fragments:

| the evals ask | he actually asks |
|---|---|
| "How is Rockwell doing?" | "how about rockwell" · "lets focus on rockwell hows it doing?" |
| "What should I look at today?" | "focus on the problems and what we can improve on" |
| "Why was North Edsa up so much last week?" | "how are we doing?" |
| "Keep that as a page called Rockwell weekly." | "pin that" · "can you make it a page?" |

And whole real patterns are untested: a bare **"hi"**; assent (**"ok"**,
**"yes go"**); a preference taught mid-stream (**"add top sellers by sales not
units, i value sales more"** — that is a belief); a question about George
himself (**"so how can i use it>"**); a scope shift that is not a question at
all (**"lets focus on greenhills"**); and asking his opinion (**"what do you
think?"**). **The twelve test an easier George than the one in production.**

**3. One run is a sample, scored as a grade.** Four runs gave 12, 11, 10, 11
with a different scenario failing each time, and `leads_with_reading` is every
non-trust failure. A style check that passes ~90% of the time should be a
REPORTED RATE across runs, not a gate that fails a build. The trust rows are
the only ones meaningful from a single draw, which §2b already says.

**Not changed here.** This is an assessment, not a rebuild; the owner decides.
The shape proposed if he wants it: keep the four-scenario trust gate as is;
rewrite the other eight in his own register drawn from the log; add the one
missing assertion (for a question that asks for a figure, the answer must
carry a figure a tool returned); demote the style checks to reported rates;
and report each run against the previous one rather than as an absolute score.

## 2026-09-13 — P1.m: fix the measure, and where it sits

The eval assessment above became a card rather than a rebuild. **P1.m runs
after P1.e and before P1.f**, not first: the three open dogfood complaints
(P1.c, P1.d, P1.e) are the owner's actual experience of the product being
broken and outrank a measurement fix, and they report through the four trust
scenarios, which this card does not touch. What needs the rewritten suite is
P1.f (the voice rewrite) and P1.✓ (which reports every Phase 1 number).

**The letter is out of sequence on purpose.** Renumbering on 2026-09-13 broke
four cross-references inside closed close-outs. Order is POSITION in §3's
list, which is what "do the next card" already reads; the letter is only a
label. This is now stated in the card itself so the next session does not
"tidy" it.

Plan totals: 29 open cards, Phase 1 eleven. Eval spend $14 for the whole
plan, under $28 if every card needs a second run.

## 2026-09-13 — Six eval gates dropped, because they could not have caught anything

The owner asked whether so many cards really need a run and whether it could
wait until the end. Both halves were right, for a reason better than thrift.

**The rule now, stated once so it is not re-decided per card:** a live run
happens only when a card **changes the trust machinery itself** — the prompt,
the compose grammar and its roles, the figure gate, the notice path, effort
per turn — **or at a phase close.** Everything else rides the close.

**Six gates dropped, and not to save money: the four gate scenarios could not
have seen those changes.** `P2.i` and `P3.f` add a new COMPARISON, and no gate
question asks for one, so a run there proves nothing; their contract tests are
the real check. `P2.c`, `P2.d` and `P2.f` are context and rendering. `P1.c`
breaks or fixes compose refusals, which are its own reported numbers.

**Seven runs across 29 cards, $9.10**, down from ~$14.90 — and after P1.m the
suite is v2, so a full run is $1.15 rather than $1.65. What survives: P1.g
(the gate, because it changes the figure gate), P1.f and P1.h (full, compose
grammar and effort), P1.m (both suites, $2.80), and the three closes.

**What this does not buy back is attribution**, and that is the accepted cost.
A regression landing in a riding card surfaces at the close with up to eight
cards behind it, and the bisect is then the price. Accepted because those six
runs could not have caught it anyway.

**The saving was never the point and the money was never the gates.** $5.80
across ten weeks. The $18.20 day was six full runs in ONE day — a session
iterating a live model against a failing check — which the two-runs-per-card
cap already stopped.

## 2026-09-13 — The eval meter was understating by 40%, and it is now fixed

The owner refused a cost figure he had been given twice and asked for it to be
verified before any run was spent. He was right, and the fault was in the
instrument, not the estimate.

**`Report.spend()` summed only the SCORED scenarios.** A setup turn never
reaches `add`, and the first twelve run four of them: "How is Rockwell doing?"
is re-asked as the setup for follow-up, correction and keep-page, and the
Seikyo draft for run-monday. Measured from `verification/p1b-final.json`:

| | |
|---|---|
| recorded (scored 12) | $1.71 |
| four setup turns, never counted | **$1.19** |
| **true cost of a v1 run** | **$2.90** |

**So the stated price has now been wrong three times** — $5–7 (an iteration
estimate), then $1.65 (the broken meter), now $2.90 (measured). Each
correction was published as fact. `harness.METER` counts at `run_turn`, and
the report prints scored and setup separately, so the gap cannot reopen.

**Measured per-scenario, which is also where the cheap runs are.** The gate is
**$0.63**, not the $0.55 asserted: `why` $0.24 (7 iterations), `caveats`
$0.16, `cannot` $0.12, `morning` $0.11. And **`shop` cost $0.34 over 6
iterations — the most expensive scenario in the suite, dearer than the
investigation** — which is a second reason it is not scored in v2.

**One run cut on the evidence, worth $2.90.** P1.m no longer re-runs v1. The
four gate scenarios are byte-identical between suites, so v2's gate compares
directly against v1's RECORDED gate in `p1b-final.json`; the other seven v1
scenarios are the ones being replaced, and re-running them to watch them be
replaced settles nothing.

**Plan total: ~$11.67, not the $9.10 published an hour ago** — that figure
inherited the broken meter. On v1 at its true price the same seven runs would
be ~$18. v2 at ~$1.84 is still an ESTIMATE derived from v1's per-scenario
costs; P1.m's first duty is to report what it actually cost from the new
meter. P1.h (effort per turn) should cut every later run because cost is round
trips, and it is deliberately NOT counted in the total, because it has not
been measured.

## 2026-09-13 — Where eval money actually goes, and the one lever that is free

"Is there no way to make it cheaper?" Measured from `p1b-final.json` rather
than guessed:

| | | |
|---|---|---|
| cache WRITE | $0.70 | 41% |
| cache READ | $0.54 | 32% |
| output | $0.47 | 27% |
| uncached input | $0.00 | 0% |

**~72% of a run scales with ITERATIONS, not with how many questions are
asked** — 2,231 cache-write tokens per iteration, 50 iterations in that run.
Cutting scenarios is therefore the weakest lever available: the gate's four
questions are $0.63 of a $2.90 run.

**1. The free one, built today: `tests/evals/corpus.py`.** Every trust check
is a pure function of `(answer, results)`, so a card that changes only a CHECK
needs no live turn. Reports now store bounded evidence (30 rows per result)
to make this work. **Proved on the day it was written**: replayed against
`p1b-final.json` it found the `warning_stock` leak in `caveats` unaided, for
$0.00. **P1.g becomes a no-eval card** and its $0.63 comes off the plan —
it changes the figure gate, which is a check.

**2. P1.h is the real discount and it is already a card.** Effort per turn
cuts iterations; iterations are 72% of the bill. At its target (4.0 → 2.5) a
run goes ~$1.84 → ~$1.25. It sits AFTER P1.f and P1.g, so only the three
closes get the cheaper rate. **Moving it to just after P1.m would save ~$2.80**
and put adjacent changes to effort and to the compose grammar in neighbouring
cards, which makes a regression harder to attribute. NOT DONE — a real trade,
and the owner's to make.

**3. Keep a pair of runs inside the hour.** `PREFIX_TTL` is 1h, so the second
run of the two-run cap re-reads the prefix rather than writing it. Free to
obey.

**Refused, so they are not re-proposed.** A cheaper model: caches are
model-scoped and an eval must run what production runs. Cutting more
scenarios: 28% of the cost between all of them.

**Plan total ~$11.04, six live runs.**

## 2026-09-13 — The plan page and NOW.md now check each other

Asked whether both had actually been revised, a cross-check was written rather
than an assurance given (`scratchpad/crosscheck.py`). It reads the eval tag off
every card in BOTH documents, derives the plan's total from the cards, and
compares it with the total each document quotes. It found two real faults:

1. **`P3.✓` never said it ran anything**, while the plan's total counted a run
   for it. The total was right and the card was silent — the final close now
   states its one full run of v2, as the other two closes do.
2. The page priced the gate as "63c" in prose and described the replay without
   naming `tests/evals/corpus.py`, so neither was traceable from the page to
   the repository. Both fixed.

Two more were the checker's fault, not the documents': done Phase 0 cards
exist only in NOW.md, and a retired figure quoted where the page EXPLAINS it
was wrong is history rather than a stale claim.

**The derived total and the quoted total now agree at $11.04** across six live
runs (P1.f, P1.h, P1.m and the three closes at ~$1.84). **No card carries the
gate any more** — P1.g became free through the corpus replay — so $0.63 is now
what an unplanned prompt-touching change costs, which is a dogfood fix rather
than a card, and the page says so.

**Worth keeping:** every figure stated in prose in this project has been wrong
at least once, and the two totals disagreeing by $1.84 was found by a script,
not by reading. Derive a number or check it; never restate one.

## 2026-09-13 — A card described work that was already done

The owner read P1.m on the plan page and asked whether it was still needed. It
was describing four changes as work to do; all four had been built and
committed during the conversation that produced the card. NOW.md had been
updated and **the page had not**, so the two documents disagreed about what
existed — a drift `crosscheck.py` does not catch, because it compares eval
tags and totals, not card bodies.

**P1.m is still needed, and it is now a tail rather than a session.** Built
already: `grounded_numerals` and the `expects_figure` assertion, the eleven-turn
v2 suite, the eight rewritten questions, the byte-identical gate, the demoted
style checks, the `gate` marker, the corrected meter and `corpus.py`.
Remaining: **run v2 once (~$1.84), confirm its gate agrees with the gate
recorded in `p1b-final.json`, delete v1, repoint §2b and the baseline table.**
Do not re-run v1.

**It cannot fold into P1.f**, which was the obvious saving: P1.f reports its
numbers THROUGH the suite, so the suite has to be trusted before P1.f runs.
Circular.

**The general fault, worth naming because it will recur.** Work done inside a
planning conversation leaves the plan describing it as pending. Any session
that builds something a card covers must update the card in BOTH places in the
same commit, and say in the close-out that it did.

## 2026-09-13 — A label invented to fill a slot, and one rendered broken

The owner queried P1.m's pill. Auditing every feature pill on the plan page
against `ops/STANDARD.md` found two faults, both mine:

1. **`#13 · #trust`** — a script that prefixed feature pills with `#` had
   applied it to the word "trust" as well as to the numbers, producing a
   reference to a feature that does not exist.
2. **P1.m claimed `#10`, "judgment and prioritization".** It serves no feature
   on the list; it fixes the eval suite. The number was chosen to fill a slot
   the template expected, which is the failure mode a structural label is
   supposed to prevent — a marker that encodes nothing true.

**Fixed by admitting the exception rather than faking it.** Three cards serve
the plan and not a feature, and now say so in their own words: **trust**
(keeps George honest about figures), **speed** (shorter, cheaper turns), **the
measure** (the suite every other number is reported through). The key on the
page explains the exception, so the absence of a number is a statement rather
than an omission.

**Worth keeping, because it generalises past this page:** a template with a
slot for every card invites a value for every card, and the invented ones look
exactly like the real ones. When a card genuinely has no value for a slot,
the honest output is the exception, not the nearest plausible number.

## 2026-09-13 — P1.m was not a session, and asking twice was right

The owner asked twice whether P1.m was still needed. The first answer — "yes,
but smaller" — was wrong, and repeating the question is what exposed it. **A
card that is thirty minutes plus one command is not a session**, and keeping
it as one inflated the plan by a session and invited it to be skipped.

**Folded into P1.e as its tail.** Not into P1.f, and the reason is the whole
argument: P1.e is RENDERER-ONLY, so nothing model-facing is in flight and v2's
first live run is clean — a gate failure means the suite. On P1.f a gate
failure would be ambiguous between v2 being wrong and the compose rewrite
breaking something, and an ambiguous first run of a new measure is worthless.

**28 cards, not 29. The six live runs are unchanged at ~$11.04** — folding
removed a SESSION, not a run. `P1.m` is retired as a letter and not reused;
§3 says so, because a reused letter is what broke four cross-references
earlier today.

**The pattern behind three of today's faults.** Work done inside a planning
conversation keeps its card alive as though it were pending; a template with a
slot for every card invites an invented value; and a card sized by importance
rather than by hours becomes a session it does not need. All three make the
plan look bigger and truer than it is. **When the owner repeats a question, the
first answer was probably a defence of the artefact rather than an answer.**

## 2026-09-13 — "Do we need to fix it if we're replacing it?" Checked, not assumed

A good question with a real answer, and checking it found a misdiagnosis in
the card.

**The three complaint cards ARE the redesign, not patches before it.** P1.c
removes `text` from the compose vocabulary and makes the reading a region;
P1.d is the clear-or-transform rule; P1.e is the six-mark catalogue. The
owner's complaints are fixed BY the new design. There is no fix-then-replace
to skip.

**The two small display bugs live in shared code the redesign does not
touch.** Both are in `fmt()` in `room/data.ts`, twenty lines:
`PESO.test(key)` guesses money from a COLUMN NAME (and `value` is in the
pattern), and the last line `return String(v)` produces `[object Object]`.
**`fmt` is imported by six modules** — ObjectPanel, Spec, tiles, render, Room,
Working. P1.e replaces the widget KINDS in tiles/render; the formatter
survives, and the object panel is untouched by the whole redesign and would
keep both bugs.

**The card pointed at the wrong file** — it said "the `[object Object]`
header". The header is fine; `fmt` stringifies an object into it through
`constant.push(fmt(k, rows[0][k]))`. Corrected in both documents, because a
card that names the wrong file costs a session.

**And the peso fix is not the obvious one.** Editing the regex to drop `value`
leaves a name-based guess that will be wrong on the next column. The rows
already carry a unit (`tiles.tsx` ~535 checks `r.unit === 'PHP'`), so the fix
is to read it and stop guessing.

**The test worth keeping: a shared helper survives a redesign of the things
that call it.** Before writing off a fix as redundant, check whether the buggy
code is in what is being replaced or in what the replacement will still call.

## 2026-09-13 — arithmetic in prose, twice, and the gate that is a shape

**The enumerated remainder is kind twenty-two.** "and 45 others" over a
returned 48 is the model's subtraction, and both figure gates were blind to it
for the same reason: each asks whether a numeral relates to something ON the
board, and this one relates to nothing. **What fires is the CONSTRUCTION** — a
count beside "others"/"more"/"the other" is by definition what is left once the
writer chose how many to name, so no tool can have returned it. Rows are
consulted only to excuse. **CLAUDE.md rule 9 is not moved**: an ordinary
ungrounded numeral still sails past, and `ungrounded_numerals` stays an eval.

**A fingerprint must never be satisfiable by naming a column.**
`low_stock_not_operational` accepted `warning_stock`, so the one wording that
breaks UI rule 4 was also the cheapest way past the gate; `definitions_drift`
accepted `metrics.yaml` the same way. Both alternatives removed, and the
low-stock group now holds the words a person uses — George's own "warning
level" failed it, which is what forced the caveat and appended a column name to
the answer. **A notice `message` is answer text**: `_forced_caveats` appends it
verbatim, so every yaml value interpolated into one is now checked on one
property — reader prose contains no snake_case. Three leaks were live, not one.

**Held by** `tests/test_enumerated_remainder_contract.py` (31), the new class
tests in `test_prose_contract.py` and `test_notice_fingerprints.py`, and a gate
run of four live turns ($0.64) with `ungrounded_numerals`, `notice_forced` and
`internal_vocabulary` clean on all four.

## 2026-09-13 — Two cards shared one prompt, and it pointed at neither

The owner noticed P1.c and P1.d carrying the same prompt. Three cards did:
`Read ops/NOW.md. Fix the top item in the dogfood log.` Two faults, and the
second is worse than the duplication.

1. **It cannot select between cards.** Three cards, one prompt.
2. **It did not resolve to any of them.** The log's top item is now a finding
   from P1.g's gate run, so the prompt would have sent a session to work that
   is not on any of those three cards.

**Fixed:** every card names itself (`Do card P1.c.`). The generic prompt moved
to the how-to block, where it belongs — it is for a report that has NO card
yet. Once a report has a card, name the card.

**Found while checking: another session closed P1.g, ran the gate live, and
pushed.** Everything is now on `origin/main`. Two things came back from it:

- **The gate cost $0.64 against the $0.63 this file estimated.** The first
  figure in this project to survive contact with a live run.
- **A conflict the gate could only find by running.** All four scenarios
  passed every trust check and then failed `grounded_numerals` — no figure any
  tool returned appears in any of the four answers. `restatement.max_restated_
  sentences: 0` forbids restating a DRAWN figure; everything George reads is
  drawn; so every figure he could cite is corrected out, and the assertion
  added in `bfb168f` can never pass.

**Decided, into P1.c, because it is that card's own question.** A reading may
carry the figure its claim is about. Reciting the board is what needed
forbidding and `0` forbids more than that: "OPUS added ₱130,016, more than the
next two together" is the claim, a second sentence walking the rows is the
recitation. **`max_restated_sentences: 0 → 1`.** P1.c therefore gains the gate
($0.64) — it now changes a correction rule, which it did not when it was only
a vocabulary change.

Totals: **27 open cards, ~$11.67.** The plan page had P1.g open while NOW.md
had it closed, which is the concurrent-session drift the crosscheck exists for.

## 2026-09-13 — The plan page is in the repo now, and a test holds the two together

The owner asked that §3 and the published plan stay aligned, and that a session
closing a card update both. The root cause was not discipline.

**The page lived in a session's scratchpad, which is deleted when that session
ends.** No later session *could* have updated it. It is now
**`ops/plan/plan.html`**, in the repository, and §6 carries the artifact URL
and says to republish with `url` set — publishing without it creates a second
artifact and leaves the owner reading the old one.

**`tests/test_plan_alignment_contract.py` (9 cases) fails if they disagree**
about which cards are open, what each spends, the derived total, a phase's
size, the headline count, or two cards sharing a prompt. It also guards the
page structurally: balanced tags, one title, no skeleton, and no feature pill
reading `#` followed by a word. Named `*_contract.py` because in this repo
that suffix is what makes a test pure — anything else is treated as
database-backed and would have skipped silently.

**It found a real error on its first run**: the totals said $11.67, computed
with the ESTIMATED $0.63 gate, when P1.g had measured $0.64. Both now say
**$11.68**, derived rather than stated.

**§1 gains the rule:** closing a card, adding one, or changing what one costs
updates both files in the same commit, then republishes.

**Why this is worth a test rather than a note.** The two drifted four times on
2026-09-13 — 33 sessions against 28 cards; a card described as pending hours
after it was built; P1.g open on the page while closed in §3 because a
concurrent session finished it; and two different eval totals. A person caught
every one. **A plan the owner's copy and the session's copy disagree about is
worse than no plan**, because both readers are confident and they are reading
different documents.

Suites: 1,544 pure (was 1,535), 30 skipped, 0 failing.

## 2026-09-13 — FULL REVIEW: the $0.64 was true and it was not the day's cost

The owner watched an API balance fall from ~$7 to ~$0.30 against a reported
$0.64 and asked whether all calls can be accounted for. **They cannot.** What
follows is what the logs do and do not contain.

**The $0.64 was correct for the run it described** — `dogfood-remainder-caveats.json`,
4 turns, 23:19. The error was letting one run's price stand as the day's.

**Thirteen eval reports exist for 2026-09-13, 11:48 to 23:19.**

| | |
|---|---|
| 5 reports carry a `spend` block | **$4.59**, 32 scored turns |
| **8 reports carry NO usage at all** | **unrecoverable** |
| estimated for those 8 (6 full runs at the measured $2.90, 2 singles) | **~$17.60** |
| `george.conversations` today (production, not evals) | 7 turns, **$2.01** |
| **floor for the day** | **~$24** |

**And thirteen is a floor, not a count. A run without `GEORGE_EVAL_REPORT`
set wrote NOTHING** — `Report.write()` returned `None` and the process exited
silently. Any run started without that variable is invisible in every record
we have. There are also four `.worktrees/` with their own copies of the
harness.

**What is NOT the cause, checked rather than assumed:** retries. Today's gaps
are `restated_figure` 3 and `no_tool_call` 1 — **zero `api_retry`, zero
`api_error`**. The loop accumulates usage with `+=` across iterations, so
iteration count is not being undercounted either.

**What I cannot see from here, and the owner must check:** whether Claude Code
sessions bill the same credit. If they do, this conversation is also spending
it and appears in none of the figures above. The Anthropic console, filtered
by key and grouped by day, is the only authority. **`ops/cost_report.py` reads
`george.conversations`, which no eval turn ever reaches.**

**FIXED: `harness.Meter.record()` now appends to
`verification/spend_ledger.jsonl` at interpreter exit, always, with no
environment variable required.** One line per process: turns, tokens, USD,
timestamp, argv, and which report it wrote if any. Verified by writing a row.
It is the only complete record that will exist from here.

**The honest summary. Three separate accounting faults, each found only when
the owner pushed:** `spend()` counted scored turns and missed setup turns
(40%); eight reports predate usage being recorded at all; and a run without an
env var recorded nothing whatsoever. **Every one of them understated.** The
lesson is not "estimate better" — it is that a meter nobody can fail to read
must be the default, and every figure quoted before today's ledger existed
should be treated as a floor.

## 2026-09-14 — The ledger's first night, and a trust check that cannot see evidence

**The ledger works.** P1.c's close-out reported $0.75 for two gate runs and
`verification/spend_ledger.jsonl` recorded both without anyone setting
anything: 1 turn/$0.25 at 04:22, 4 turns/$0.50 at 04:26. **First time a run's
cost was written down by default rather than by remembering.**

**And it priced something nobody had measured: the first turn of a run costs
~3x a later one.** $0.25 alone against $0.083 each for turns 2–4 — the cold
prefix write. So a gate stopped by `-x` and rerun pays that write twice:
$0.75 where $0.50 is the price. **Never `-x` the gate**; let it finish and read
all four failures at once. Recorded in §2b as lever 3.

**The plan-alignment test held on its first real use.** P1.c closed and both
§3 and `ops/plan/plan.html` were updated in the same commit; 9 cases pass, 26
open cards, totals derived.

**A TRUST row is failing on a false positive, and it is structural.**
Reproduced: `attribution_claims("Four lines account for 75% of the units the
plan requests.")` fires, and that sentence is `get_replenishment`'s own notice
QUOTED. **Every other trust check takes `(answer, results)`;
`attribution_claims` takes `answer` alone**, so it cannot tell a share George
invented from one a tool handed him. Same class as the hole `grounded_numerals`
filled — a check that cannot see the evidence.

**The fix must not be to stop George quoting notices** — UI rule 4 requires
them surfaced, and a check that punishes compliance is worse than no check.
It should excuse a match appearing verbatim in a returned `meta.notice`,
exactly as `ungrounded_numerals` excuses a figure the tools returned. Filed
in the log by the session that found it; not fixed here, because it is a card.

---

## 2026-09-14 · P1.e — six marks, and the eval swap

**Fourteen widget kinds became six marks, and the vocabulary did not move.**
`composition.widgets` is untouched; `catalogue.ts` maps what George already
says onto figure, dumbbell, ranked, contributors, line, table, and the ROWS
decide the form inside the family he named. Renderer-only was the point: v2's
first run had nothing model-facing in flight to be ambiguous about.

**Four kinds are not marks and keep their tiles** — draft, control, state,
system. A mark draws what a read RETURNED; those are objects you act on, and
mapping the draft onto `table` would have deleted the editable quantities the
purchase arc turns on. `NOT_A_MARK` names them with reasons, held against
`render.tsx` in both directions by the compose contract.

**Colour is direction, which reverses a shipped test.** "Paints each shop in
its own colour" is now "paints by direction, not by which shop it is". The
owner's second failure was seven hues over seven row labels; identity still
earns its hue on the tile's edge and in the object panel, where it is the
point. Four data colours, `palette.test.ts` reads the source.

**The claim-title is `note` or the read's own name, never a new field.** A
title field in the grammar would be a sentence with no receipt. A
recommendation is the exception and leads with George's verb, the one word a
read has not got.

**`grounded_numerals` does not share `presentation_max` with
`ungrounded_numerals`, and the docstring promising it did was wrong.** For
"did he INVENT a figure" a bare 4 must be excused; for "did he CITE one" a 4
the rows account for is a citation. Found because v2 failed a 120-word answer
naming a product and the 1 unit left on it. Verified by replay at $0.00:
`dogfood-remainder-caveats` 4 of 4 → 2 of 4, `p1c-gate-2` 0 of 4 → 0 of 4.

**A full run is $1.51, measured, and the twelve are deleted.** First eval
price in this project to come in under its estimate. `GEORGE_VOICE_STRICT=1`
is §4's old recipe and is wrong for v2, where style is a rate by design — the
run set it and reported 8 style failures over 11 clean trust rows.

**A close-out now ends with what the OWNER has to do, short and numbered.**
2026-09-14: he read P1.e's full close-out and asked *"so what do i need to
do?"* — which is the one question it had not answered. The close-out stays as
the record; it is no longer the last thing on screen. Three lines at most, no
figures, only what is his to decide. "Nothing" is a complete answer. In
NOW.md §1 and on the plan page, both in the same commit.

**The page and the composer sit in one wrapper, on one measure.** 2026-09-14,
from *"theres lots of empty space on the right and its not centered"*: the
board capped itself at 1320px without centring while the composer capped at
the same width and did. `.r-measure` is now the only thing that caps either,
and `--measure` narrows with how many objects are packed below the lead —
680 / 940 / 1040 / 1320 — because three reserved columns holding two things
was most of the empty space. A wrapper rather than a rule on every child: the
reading has a measure of its own, 66ch, because it is prose.

**A tile's body is the one child allowed to give way.** The same report's
other half — a sixteen-row table ending mid-row. `overflow: hidden` and a
560px cap were doing their job; nothing between them and the table had
`min-height: 0`, so no flex child could shrink and nothing could scroll. The
title, subtitle and source line stay put: receipts that scroll out of sight
are UI rule 6 broken. Held by `layout.test.ts`, which reads the stylesheet,
because jsdom does no layout and a dom test could only prove the attributes.

**`min-height: 0` went on every tile child and should have gone on one.**
2026-09-14, an hour after the fix that needed it: a caveat is text with
nowhere to scroll, so letting it shrink hid nothing and ran its words over
the title. Every child holds its size; `.r-tile > .r-mk-body` says otherwise
itself, named with the tile so it wins on specificity rather than file order.
Two more read out of the same screenshots: `comparisons.*.display_name`
already starts with "vs" and P1.e prefixed another, and a table's constant
columns now name themselves, because the frame took the title they leant on.

**A caveat may carry a figure a read returned, and no other.** 2026-09-14,
the dogfood log's one Open item: `caveat` and `next` carried no digit at all,
which refused "44 of 118 products have no figure on one side" — a count the
tool put on `meta` — eight times in one recorded run. It is the question
`max_restated_sentences: 0 → 1` answered a day earlier one slot over: citing a
figure is not reciting the board. `voice.reading.slots` now declares
`figures: returned`, checked with `agent/prose`'s matcher so a slot and a
sentence excuse the same dates and small counts, and the slot's description
tells the model the rule — it never did. Replayed on `p1h-v2.json`: 7 of 8
stand, and "the other 87 products" stays refused, because 87 is arithmetic.
A block's `claim` is untouched: that one is an annotation on a mark.


**A replay names a stored call; it does not carry one.** 2026-09-14, P1.i.
`POST /george/replay` took a whole call list from the request body and ran it,
so a figure could land under a receipts line with no record it was read that
way. It now takes `{post, seq, argument, value}` and reads the arguments off
`payload.calls`. The five scope arguments and where each lands are in
`surface.desk.replay`; `recorded` moved from `transient_until_next_turn` to
`answer_post_payload`, because a window change that lives only in a browser is
a figure with somebody else's receipt. It found `pin_runner._enum_for` taking
the first `oneOf` enum whatever the value's shape was, which made every pin
over an explicit `date_range` unrunnable — the card's own "August".


**The work outlives the turn, and a receipt is not code.** 2026-09-14, P1.k.
The step trail vanished when the answer landed; one derived line above the
claim now carries four counts off the turn's own frames and unfolds the steps,
each with its own `duration_ms`. **Behind it** is a view on the thread, and
its rule is the one thing it may never be: a list of calls with their
arguments. A filter is split on the `#` the tools write — the definition on
the line, the predicate under it, never a guess about which half reads as
English — and 75 of the 79 filters in the eight recorded runs carry one. The
figure link ports `agent/prose`'s matcher to the client (`figures.ts`) rather
than inventing a looser one; the constants are compared by value in
`test_visible_work_contract.py`, and a numeral no read holds gets no
underline. Everything is under `surface.desk.work`, which the prompt does not
read: 1,798 words and the same tool-schema hash before and after.


**A subject is an id, and `@` is the second door onto the same chip.**
2026-09-15, P2.c. The room sent `{id: label, label}`, so every subject reached
George as a word while the rows had carried `store_id` two columns away.
`room/subjects.ts` now reads the identity column the definitions DECLARE
(`selection.identity`, plus a new `label_columns` saying where the name lives),
and the subject records where its id came from — `rows`, `mention`, or `label`
where the identity IS the name, which a category and a supplier both are. A
supplier became a subject dimension, which is the one model-facing change:
`SYSTEM_PROMPT` 1,798 → 1,799 words, sha `28efc756` → `fa166e19`, one word
inside `voice.budget.max_words` 1,800. `GET /george/mentions` resolves five
kinds off the reads that already define them, with no SQL and no model, and
`selection.mentions.kinds[*].binds` — not a component — decides whether one
becomes a subject, a `page_scope` or a name on the question. "Compare these"
is a replay rather than a question, which needed `resolve_store` to accept a
list: the predicate was always `store_id IN (...)`, so one shop was never a
different query, only a shorter list.


**Colour means one thing, and the shell is held to it rather than exempted.**
2026-09-15, P2.l, out of his log: *"what do the colors mean now?"*. The tile's
wash was identity and its brightness magnitude, on top of direction inside the
marks — P1.e's own report one layer out, at the layer `palette.test.ts` wrote
an exemption for. The shell carries neither now; `var(--hue)` reaches one
selector, `.r-obj`, an opened object with nothing beside it; `Spec` paints a
direction or `--flat`, because a hue his COLUMN picked is a claim no tool made.
**Magnitude was not judged, it was found dead**: P1.e deleted the last caller
that fed `--i`, so every tile had rendered at 0 for a day while the log called
it live. Held by a DOM replay, not a source scan: 15 of 18 fail on `51af583`.


**A figure is drawn under its own claim or not at all.** 2026-09-15, the log's
worst item: `marks.Figure` chose `rowFor(...) ?? rows[0]`, so "Greenhills
turned down" wore Rockwell's ₱206,800. `rowUnderClaim` decides on what the ROWS
can contradict — the subject is in them, or nothing names a subject and there
is exactly one row (a filter-scoped read: "Why was North Edsa up?" has no
`store` column), or nothing is drawn. The one-row case is why match-or-nothing
was wrong. Old code fails 7 recorded-run tests, six of them real reads.

**An offer says why, sits on its row, and never says what it costs.** P2.d:
`compose` takes a third statement, `{act, seq, target, reason}`. The target
passes a block subject's own `_backs`; the reason is an annotation and carries
no digit. **Cost is derived** from the act in `metrics.yaml` and the schema has
no property for it, so speed cannot be claimed by a model that cannot measure
it. `replay` is written down as the act NOT offered — it needs a value as well
as an argument, and an un-tappable button is what the control validator already
refuses. Placement is decided ONCE for the screen, not per mark, because the
foot needs the leftovers; the test is that every offer is drawn exactly once
and none nowhere, and it found two objects over one read drawing the same
button. Ghosts complete from the board alone; Tab accepts, Enter still sends
what was typed. Prompt byte-identical at 1,799 words — the catalogue is on the
tool, read at the moment of choosing.

**A finished ladder is walked, and it runs nothing.** P2.e: Replay is the
thread's fourth view — every STEP in order, one at a time, with the rows it
brought back, its receipts and its clock. Not Behind it: that is the reads,
flat, answering *where did these numbers come from*; this is every step, the
compose and the pin included, answering *what did he do and what did he see*.
No planner, no re-read, no model call, held by a test that the component names
no client, no api module and no `fetch`. It is the one work surface that draws
FIGURES, so UI rule 6 bites: rows whose read kept no `snapshot_timestamp` are
withheld and the rung says so. **It found "0 rows" for every read over the
loop's row cap** — `rows: []` with `rows_complete: false` was being counted —
on screen since P1.k. `surface.desk.work.replay` and `surface.desk.replay` are
two things with one name and each now says it is not the other.

**The typecheck in §4 was checking nothing.** `tsc --noEmit -p tsconfig.json`
exits 0 on a solution file with `"files": []`; three "typecheck clean" reports
came off it, and P2.d's duplicate `subjects` member reached origin and failed
the Railway build. `tsc -b --force` is the command. Its runtime half was worse:
JSX takes the later duplicate attribute, so picked subjects never reached the
composer at all.

**"The build failed" says which build.** 2026-09-15: P2.d's duplicate `subjects`
failed `tsc`, and that is **Vercel**, which serves the room — `/health` was
serving `7cb1ea5f` throughout, so Railway had deployed it fine. A session
carried "main is red and nothing has deployed" into NOW.md on a peer's report
and the backend reading contradicted half of it an hour later. The two
platforms fail independently and only one of them runs `tsc`; no session has
ever read a Vercel build status from a terminal, so a green frontend is
confirmed by a hard refresh and by nothing else.

**A person is a second ground for a belief, and the only one for what they
meant.** P2.f: `record_belief` required calls behind every view, so "we means
the shops, not the warehouse" — the one correction nobody but the owner can
settle — was refused as ungrounded and George could not keep it. `judgment`
gains a sixth stance, `means`, and `judgment.taught`: a `means` view names
`told`, their own words, and no calls; every reading stance names calls and
may not name `told`. EXACTLY ONE GROUND PER VIEW, refused in
`agent/beliefs.validate` and again by a `NOT VALID` check on the table. A
taught line in the prompt block says YOU WERE TOLD and is never marked
unconfirmed: no amount of new data makes it less true that this is what they
meant.

**Forget is a person's gesture and there is no tool for it.** George may
revise a view a read contradicts; he may not decide to stop knowing something
because somebody disagreed. `POST /george/beliefs/{id}/forget` stamps
`forgotten_at` and the hand that did it, the row stays, and it leaves the
prompt and `view_memory` in the same breath. The absence from the model's
schema is the guarantee, as it is for every write.

**"How often applied" is a count of ATTACHMENTS, because nothing observes an
answer changing.** `mark_applied` moves the counter for exactly the ids
`in_prompt` put in the block, so the count cannot drift from what was handed
over; the read's note and the tile both say "carried into N questions" rather
than "changed N answers". A figure that implied the second would be the thing
this repo refuses everywhere else, arriving on the one surface that is about
George rather than about the shops.

**`memory` is the fifth kind that is not a mark.** A mark draws what a read
returned; this has a Forget on every row, and a gesture per row is not a
drawing — the same reason `draft` kept its editable quantities.
`default_composition` draws `view_memory` as one by the TOOL and not by the
columns, which is its only such branch: by columns alone a register of beliefs
is a table, and a table draws no Forget.

**The deploy was the migration's first rehearsal, and that is now the standing
shape.** `x8y9z0a1b2c3` shipped in `c87fda5` having been run on no machine:
there is no local Postgres here, no Docker, and `ops/local_postgres.py` wants
PostgreSQL binaries the checkout does not carry. It ran — `/health` reports it
current and expected — and the swap cost two 502s over **66 s, measured rather
than bounded**, because the poller started before the push for the first time.
Thirteen earlier watched swaps carried no migration. **And the log caught its
own control**: the docs-only `183a3aa` deployed 116 s later and cost the same
two 502s, on a commit with no Python, no schema and no frontend in it. Two
swaps two minutes apart, one carrying five columns of DDL and one carrying a
markdown file, cost the same — so the 502s are the platform's restart and
`alembic upgrade head` added nothing measurable. Neither explains the 50-minute
outage on `8b0325a`. **The lesson for the next watched swap is to keep polling
after it lands**: the first monitor stopped the moment the new sha answered and
would have reported "two 502s, done", which was true and half the reading.
Until a rehearsal environment exists, a migration is additive only and any
CHECK over existing rows is `NOT VALID`, so a legacy row cannot fail an upgrade
that nobody has watched succeed.

**Every piece was tested and the gesture between them was not.** The dogfood
log, 2026-09-15: *"i cant click any store cause theres no tap."* He was
describing the code. `subjects.ts` resolved a row's id, `subjectOnBoard` had
its own tests, the composer drew the chip — and `r-mk-name` was a plain span
in all six marks, with `pick` called only by the `compare` button under a
tile. P2.c shipped half-built with every unit green. **The tests that hold it
now drive the ROW through the whole board**, and eight of them fail without
the fix; a unit test of `pick` would have passed for the entire life of the
bug. The second half of the report — *"it just moves or expands the widget"*
— was the tile's own `role="button"` swallowing the click.

**A refusal written for the model is not shown to a person.** Same pass: the
three scope changers "did not work", and the reason was that one of them was
refused and the refusal was `tools/sales.py`'s sentence naming `compare_to`
and a `metrics.yaml` key. That sentence is right where it is — George has to
fix his own call. UI rule 4 is what it broke on the way to the screen.
`refusalForPerson` checks it against `surface.prose.leaks`, the SAME list the
loop already scans an answer with, and reduces it to one line with the tool's
words behind a tap. Two reports, one defect; and the fix is at the surface,
never by softening what the tool says.

**Colour has four jobs and this palette fills three; the owner decided against
the fourth.** 2026-09-15, of the calendar and the hour dots: *"why do these
have no color? there should be color right?"* Two different answers. The
opened object's table was a DEFECT — it ran `fmt` over every cell so a change
had no arrow and no direction there and both everywhere else, in a panel
`vi.mock`ed out of five suites and rendered by none. The calendar is not:
after P2.l colour means direction, those rows carry none, and P2.l came from
his own report. The research (Stripe, Linear and Vercel near-monochrome with
colour reserved for meaning; Datawrapper's grey-for-context) says the
direction is right and should not be undone. The one genuine gap is
SEQUENTIAL magnitude — the calendar already says "brighter is more" in grey
lightness, and a single-hue ramp would make an existing meaning legible
without reopening identity-colour. Offered as a decision with the test that
would hold it; **he said "just fix the panel"**. Written down as taken and
taken against, so it is not rediscovered as an open question.

**The one feature marked built that had never run.** 2026-09-15, asked which
of four Jarvis axes mattered, the owner said *"Initiative is needed"*. Read
from production the same minute: **0 standing questions, 0 watches, 0
schedules**, none ever run or fired, against 359 posts and 6 beliefs held.
Feature 12 is `built` on the Ideal UI's map, the scheduler starts
`standing_tick` and `watch_tick` on every boot, and both have ticked over an
empty table for weeks. Nothing is broken; **nobody ever created one**, because
the only door is asking George in conversation and no surface offers it.
A capability with no way in is not a capability, and a map that calls it built
is measuring the code rather than the business. The lesson generalises past
this feature: **before building more of something, read whether the thing that
exists has ever been used.** Two counts and one query would have said so any
day in the last three weeks.

**The Jarvis direction, in his words and bounded by him.** *"me and my family
run these buisnesses"* — multi-user is real, and S.6 (people and permissions)
stops being an optional source. *"calenders, mail in the future but our main
goal is to make how it works with the buisnesses top"* — the standard stays a
business operating system; the personal scope is recorded as direction and
does not reorder the 26.

**P2.g: a switch, not an enforcement.** 2026-09-15. The estate switch tells
George which business a question is about; it rewrites no call and narrows no
tool schema. Considered and rejected: bounding the store enum per part, which
would enforce it — tool schemas are the 1h-cached block, so every press would
buy a cache write, and rule 5 puts depth in the tools. The enforcement is
already there and older: `get_sales` refuses the warehouse in its own words.
The default travels as NOTHING, so the switch can only narrow and a question
asked without it is byte-identical to yesterday's. **And a list in Python
drifted from the yaml**: `_STORE_GROUPS` lacked `vending_stock_location`, so
AJI CMG — the pill this card draws — answered "Unknown store". `stores.groups`
now.

**AJI CMG is a warehouse; vending is the business.** 2026-09-15, his own
report an hour after P2.g shipped. The switch drew one pill, "AJI CMG ·
vending", scoped to `stores.vending_stock_location` and answered by
`get_vending` — the join metrics.yaml forbids, written into a control. Two
parts now: a warehouse read like the barn, and a business with
`has_no_store_scope: true`, no store list, machines for places. **That is the
shape a new business takes here**, which is what he was asking when he said
"if in the future it can be a whole new buisness then ok". The general lesson:
a yaml comment saying "these must never be conflated" is not a guard, and the
session that wrote the conflation had read the comment and quoted it while
doing it.

**A word nothing reads is still a word.** 2026-09-15. He said "aji barn is
also a warehouse" of a pill that had said `AJI BARN · warehouse` since the
first commit. Nothing on screen was wrong; `domain: retail` on both warehouse
parts was, in a yaml field no code reads at runtime. **That is precisely why
it was wrong for two commits** — a field with no behaviour behind it is never
caught by a test unless somebody writes one, and it is what the next session
reads before writing code. `surface.desk.estate.domains` is declared now and a
part saying `warehouse` must be filed `store`. Twice in one evening he
corrected the same category error at a different depth; both times the yaml
already contained the right distinction in a comment.

**The estate switch is BUSINESSES; a place inside one is the selection's job.**
2026-09-15, his third report on P2.g in one evening and the one that is a
design: "barn and cmg are warehouses so they should be builit into aji ichiban
all stores so they dont need their own pill". Four pills mixed businesses with
places — two were single rows of `stores` — so one job (scope to one place)
lived in two mechanisms with different rules. Three pills now: All · Aji
Ichiban · vending. **The cost was checkable and had to be checked**: with no
pill, `@` is the only door to a warehouse, and `@AJI CMG` completed to nothing
because `mentions.py` held a THIRD copy of the store groups, stale the same
way. Removing the pill first would have made a real place unreachable. Three
copies of one list in three files, all found by one evening of him reading the
screen. `count_places` was deleted with the pill it served.

**A client rule that had never been measured.** 2026-09-15. `@` refused a query
containing a space, on the reasoning written above it: "a name with a space in
it is ambiguous with the next word and this never guesses where a name ends".
Sound, and wrong here — **99.8% of 3,728 product names contain a space**, so
the rule made the product door work for nine of them, and nobody measured that
before or after shipping it. The server had always matched the phrase. The
lesson is not "allow spaces": it is that a bound about the DATA (how long a
name is, how ambiguous a prefix is) is a thing to measure against the data, and
this one was reasoned from first principles in a component. The new bound is 8
words because the 99th percentile is 8.

**A sixth `@` kind, and a read that did not exist.** Categories were asked for
in the same message. `category` was already a selection dimension whose
identity is its own name, so the door was the only missing half — but nothing
READ the set, so `get_product_categories()` was added rather than a list typed
into a client. It is NOT in `TOOL_FUNCTIONS`: a completion list is a person's
menu, and a tool in the schema rewrites the 1h-cached prefix for every request
in the deploy.

**A probe that writes with one toolchain and reads with another.** 2026-09-15.
Two deploy watches reported "200" on every poll and named no build, and the
first close-out blamed "the system python, not the venv's". **Wrong cause.**
`curl` under Git Bash writes `/tmp/h.json` — Git Bash maps that to a real
Windows path — and the venv's Python is a native Windows interpreter, where
`/tmp` is `C:\tmp` and does not exist. Either interpreter fails identically.
The fix is a path both agree on (`$TEMP`). Recorded because the wrong cause was
already written into NOW.md and a later session would have swapped
interpreters and watched it fail again — and because `fe60ce3`'s push-to-live
stays bounded and unmeasured as a result, which is a number the log has now
lost for good.

**A subject chosen by the ORDER BY.** 2026-09-15. Clicking a chart of seven
shops opened Greenhills, because a block's subject fell back to
`subjectOf(rows[0])` when George declared none — and he declares none for a
block about a SET, correctly. So the surface invented a subject from the sort
and opened its whole page. The rule that a subject is an id a row carried and
never a label anything inferred was being broken by a `??` in a renderer, not
by the model. One row is its own subject; many rows open nothing.

**Two bounds in two days, both reasoned against the wrong population.** The `@`
menu refused a query containing a space ("a name with a space is ambiguous with
the next word") — 99.8% of 3,728 product names contain one. The chart's row
label was capped at 13ch — right for the nine shops it was written against,
and it fits 6.8% of products. Both were sound reasoning about a population
nobody had counted, and both shipped with tests that did not know the
population existed. **The rule now: a bound about the DATA is measured against
the data, in the commit that introduces it, and the number goes in the comment.**
Both fixes are shaped so the bound adapts — `max_words` from the definitions,
`fit-content(40%)` from the tile — rather than being a better guess.

**The ladder was gated on a word, and the word was "why".** 2026-09-16, P2.m.
INVESTIGATING opened *"'Why' is an investigation"*, so "analyze tradsnax per
store" climbed none of it: one read against four permitted, one finding against
two to four asked for. The gate is the INTENT now (`investigation.opens_when`),
FOCUSED names its second read the way BROAD already did
(`scope.kinds.focused.taken_apart`, floor 2), and `judgment.a_view_is_owed`
asks for the reading rather than permitting it — his complaint was "products
per store AND WHAT I THINKS", and permission is not a request. **The budget
paid for it**: 1,791 → 1,797 words, with the call mechanics moved onto
get_sales and three duplicated sentences cut. **And the eleven voice scenarios
cannot see this card** — every one of them already carries "why", "which" or
"dig deeper" — so two scenarios that can were added to the investigation evals.

**A page is a frame, and a frame does not move.** 2026-09-16, his third report
of one rule. `--measure` was set from `data-rest`, so the page took 680px of a
1,863px window while "Needs you" took 1,120 — two frames 440px apart, and the
row label capped at 40% of its tile was squeezed by a page that has nothing to
do with labels. **The count sizes the BOARD now and never the page**, and the
room has one frame: `--measure-list` is gone. Under it a second cause no width
could reach — the lead and the pack are two containers, so a two-object board
was vertical at any size; with one thing in the pack they are a row, guarded on
`:has(.r-board-lead)` because a lone unweighted object is `data-rest="1"` too.
**And the reason three reports got past 1,284 tests: nothing in the room can
see a width.** jsdom does no layout and there is no browser in the toolchain,
so `layout.test.ts` asserted the narrowing rules were PRESENT. It now computes
what the rules produce — narrowest `--measure` against `.r-main`'s padding, at
four real viewports, failing under 65% occupied — and reading only the default
on `.room` is how such a check would have passed on the old stylesheet.

**The room has an address, and a build fingerprint.** 2026-09-16, off the
status bar of his own screenshot: `https://thesupabot.vercel.app`. Nine
close-outs said Vercel could not be checked from a terminal. It has no
`/health`, but the entry bundle is content-hashed, so the frontend's build can
be watched the way Railway's is — read it before the push, poll until it
differs. It maps to no commit and says nothing about whether the page LOOKS
right, which is still a hard refresh and a person.

**The catalogue landed; the form did not.** 2026-09-16, Fable review of the
room against the Ideal UI, on the owner's "the ui doesnt feel like what i was
told we were building". The mockup draws an answer as one document — 760px,
evidence blocks stacked inside the finding, each titled by a sentence George
wrote. The room draws a reading over a dashboard of tiles at 1320px. Every
catalogue piece is built; the container is not, and this morning's two layout
fixes moved away from the standard while closing a report. Production says
half the tiles a person sees are `default_blocks` George never composed, with
no sentence on them. **Rule from here: a surface close-out names the Ideal UI
scenario it matches and where it does not.** The fix is one card, recommended
ahead of P2.h/i/j and taken with P2.k; the owner decides.

**A database error is a refusal in words, and the last handler never prints
raw.** 2026-09-16. `_call_tool` caught three refusal classes; a `QueryCanceled`
was none of them and became the owner's entire answer. Any `psycopg.Error` is
now a refusal from `failures.reads`, the raw text on the diagnostic key only,
and both outer handlers speak `failures.turn`. Under it, the purchase plan read
every line a supplier's products ever sold before filtering by date — 133,879
buffers, 25 s cold; window-first and `MATERIALIZED` is 35,059. **And a seeded
history marker that closes every assistant turn will be imitated**: the call
list now opens the following user turn, and an echo is stripped and counted.

**The standard was replaced.** 2026-09-16, the owner: *"this is my final what i
want get rid of the rest and only use this"*. `ops/STANDARD.md` is his FINAL
PRODUCT VISION verbatim; the 26-feature list is superseded, in git history only.
Its centre is the operator, not the interface: notice → investigate → connect
→ form a view → show the situation, before the owner is involved; conclusions,
not homework; known / likely / possible / unknown said apart. Section 20 discards
every visual direction as a constraint, so CLAUDE.md's direction line now says
"deliberately unlocked" and the Ideal UI is no longer the target. The plan in
NOW.md §3 was distilled from the old standard and is not taken further until it
is re-derived from the new one. FACTS DETERMINISTIC, JUDGMENT INTELLIGENT stands.

**Borrowed again, against the new standard.** 2026-09-16, the owner: the first
render "doesnt feel optimal … research find better ways … i dont like the color
scheme". Brought into `ops/ideal/george-ahead-of-me.html`: confidence that opens
into supports / contradicts / silent, and a visible "no read" mark (AYDesign's
2026 citation survey: Consensus, Elicit, scite, Claude); work disclosed in layers
and one step redone or skipped, not approve-all (Zylos, 2025–26 deployments: no
mid-run visibility tripled abandonment; high/low words beat percentages);
authority per action kind as a visible control (Mantlr; Claude tool permissions);
Later and j/k (Linear triage docs); graphite dark-native, translucent borders,
chromatic colour only for meaning (Linear tokens, Geist scales). Fonts: Geist,
Geist Mono, Newsreader — all on Google Fonts, checked. Still a proposal.

## 2026-09-17 — the design is the artifact; the plan is its build order

**The owner declared the beside room of *George, Ahead of Me* the design** — *"everything ive been
leading you to this final artifact is it. except the alive we can workshop the shape color and
everything."* Phase 2S in NOW.md §3 is that page in dependency order; the earlier Ideal UI is
superseded, not deleted. Two closed decisions are reopened on purpose and say so on their cards:
P2.l took identity hue off the room — it returns on the SWATCH only, the mark carries the verdict
(his words: "green or red meaning good or bad not the same color as the stores"); P1.f closed the
catalogue at six — P2S.g opens it to sixteen with a rule for what he reaches for unasked and a
"stays what you asked for" on the pin. Nothing in the phase changes what George reads or writes
except P2S.g, which is why it alone carries an eval.


**Phase 2 merged into Phase 2S — the functions carry, the screens do not.**
2026-09-17, the owner: "could you just merge them together cause i dont know
if the old functions are good to carry thtough". Judged card by card against
the standard, not against the plan the cards came from. P2.k (one renderer for
a kept page) folds into P2S.3 because it would have ported pages onto the six
marks P2S.3 replaces; P2.i (year-over-year) is kept as P2S.4 because it changes
what George can say and the redraw cannot touch it; P2.✓ folds into P2S.✓, one
close with the full run; P2.j (watch before stock-out) moves to Phase 3 as
P3.g; P2.h (voice) is PARKED, not built, because standard §8 asks for voice as
"a first-class way of operating George rather than simply speech-to-chat" and
the card was speech-to-chat. Open cards 16 → 13, eval spend unchanged at $3.66.
The old functions all map to a numbered section of the standard; the old UI
is deleted under the phase's line-count rule.

**"The ideal UI" is fifteen scenes, and Phase 2S finishes eight.** 2026-09-17,
the owner: "so at the end of p2s we will have my ideal ui? make sure we will".
The artifact has one scene per part of his vision; Phase 2S's close walked four.
Every scene now has exactly one close in a ledger in NOW.md §3 — eight at
P2S.✓, five at P3.✓, docs at S.4, team at S.6 — and
`tests/test_plan_alignment_contract.py` fails if a scene has no close or a close
card does not name every scene it owns (mutation-checked both ways). And "frame
for frame" is held by pixels: headless Chrome is installed and rendered the
artifact at 1920x1080 in this session, so every 2S card renders its scenes beside
the artifact's before closing. Look (fixtures) and behaviour (live, the full run,
plus P2.m's two unrun questions) are separate checks, because the artifact's
words are authored and George's are not. The build order was judged right; the
proof was what was weak.

**The Phase 2S audit: the artifact is the look, the rules are not negotiable.**
2026-09-17, the owner asked for every instruction to be checked. Read against the
artifact's code rather than its picture: `buildBeside()` drops each figure's
`details.src` receipt, so the beside room as drawn breaks UI rules 3 and 6 (no
read time, nothing to open) — the port keeps a receipt line under every figure
and caveats above their figures (rule 4). Room functions with no stated place
were given one: read-as tokens become the composer's chips (the artifact's own
device), `@` and Tab stay, set-aside and keep stay on the figure, the work line
goes to the thread header, and **drag/resize/undo are removed** because his rows 6
and 7 ask for automatic flow. The mic is not drawn while voice is parked. The
cards' paraphrases were replaced with the code's exact numbers (column counts,
200/260 ms reveal, wire endpoints and dash, 80% arrows, 820px sidebar default,
≤900px stack). The translation: the chrome, words and grid copy across; the
sixteen shapes are static SVG in the artifact and must become renderers.

**The owner answered the audit: four confirmed, one overruled.** 2026-09-17.
Composer chips, `@` and Tab: *"yes we keep that"*. Drag, resize and undo:
*"yes we can remove that"*. Set aside and keep on the figure: confirmed. **The
mic: overruled** — the merge had parked voice because P2.h described
speech-to-chat, and he said *"we need to make it"*. Recorded as a case of the
rule in NOW.md §1: a session raises the concern once, the owner decides, the
session builds the full request. So voice is **P2S.5**, built to his standard's
own bar (§8: first-class, "language is for intent, direct interaction is for
reference") rather than as dictation: speech carries the selection, a spoken
steer replays like a chip, hands-free reads the claim only and is interruptible,
every state is visible, and the mic is drawn only where the browser can
recognise speech. Chrome sends the audio to Google's speech service, which the
card requires the close-out to say. Open cards 13 → 14; eval spend unchanged.

**Set aside and keep come off the chart.** 2026-09-17, the owner: "remove",
of the per-figure set-aside and keep controls the audit had kept. Set aside is
gone entirely (no list to bring a figure back, `Local.closed` deleted). The keep
BUTTON goes but keeping does not, because standard §12 asks for "keep this" /
"make this a page": it stays by words (George's pin and page tools) and by the
thread header's Keep as page, which is now the one save gesture UI rule 2
requires.

## 2026-09-17 · P2S.1 — the beside room, built; held by pixels

Ported from the artifact, not re-derived: tokens, fonts, composition, words, wires, arrows, sidebar, composer. **The width is decided as if the sidebar were always there**, so opening it slides the composition and never narrows it (his row 4); the cost is that under 1,824px the columns are narrower than 580/940 even with the sidebar closed, by its width. Columns keep 29:47 rather than the artifact's equal-pixel `minmax` shrink.
Figures are ONE grid with 1px rows, each told its column, so a figure changing column never remounts. The claim is the sentence the claim span sits in; exact slices keep "word for word" true over 44 recorded answers; `**` is drawn as weight.
`ops/frames.py` mounts the real Room from a recorded eval (no network) in headless Chrome over CDP and MEASURES: centre offset 0px and 580/940 (1920) · 433/703 (1440) open and closed on 12 frames, no scrollbar, no page scroll. Scenes are recorded turns, not the artifact's words: situation ← follow-up, doing ← vague, nothing ← caveats.
Deleting RiverPreview stranded 32 old river modules, deleted in the card per the phase rule: components/george 10,510 → 5,087 lines. Three Python contracts lost their client half with the client file.
Not built, said here: the ladder line (no turn carries one), the object panel over the figures column (still under its figure), a dom test of the figures area's loading/failed states, watches in the sidebar (no read lists them). Keep/dismiss decisions are no longer written from the room. (b)(c)(h) are one commit: they share Room.tsx and room.css and no split typechecks.

## 2026-09-17 · P2S.2 — the mark alive, identity on the swatch, figures that answer a touch

**The mark's state is read, never timed**: `alive.markStateOf` off the stream and the board's arrival count; need only from a LOADED approvals count; a failed turn changes the drawing (dashed broken ring), not the colour. `AliveMark.tsx` is the accent allowlist's fourth and last slot, as UI rule 5's named exemption. Three forms behind `?form=` so the owner points rather than describes.
**P2.l revisited on purpose, not reversed**: colour still means one thing per channel; identity gets its own channel, the 8px swatch beside a name, and nothing else may wear a slot (`palette.test.ts`, `accentUse.test.ts`, `palette.dom.test.tsx` rewritten to say so). The segment, bar and line stay the verdict (his row 17).
**No store in code**: a slot is the store's index in the served `locations` (retail, active_retail order); `identity.ts` lost its hand-kept `SHOPS`/`KINDS` maps. Products hash into 5–8, so they can share a hue with stores 5–7 — accepted because a figure groups by one dimension and a name is always beside the dot.
**The palette is the dataviz skill's validated eight, re-validated on the room's own grounds** and pinned to `ops/palette/REPORT.md` by a test. The swatch property is `--sw`, not the design's `--c`: `Spec.tsx` and room.css already used `--c` for a direction triple, and one name for two meanings is the P2.l mistake.
Touch: one delegated listener; each mark writes its own `data-v` from formatted tool values. The first draw read `currentTarget` inside a state updater, where React has cleared it — found by the recorded-run test, fixed by measuring first.
Frames gained draw ← "taught" and memory ← a checked-in fixture, because no eval has recorded `view_memory`; said in the fixture's own `why`. The mark is only ever idle in a frame.
Shortfalls are on the card: no pie yet (P2S.3), no multi-series mark, memory is not the design's timeline, tooltip not keyboard, `components/george` did not fall (5,087).

## 2026-09-17 · UI rule 4 changed by the owner — a notice is drawn only when the data may be wrong

The owner, of the caveat boxes over his charts: *"remove them, change the rule we dont need those disclaimers unless it has wrong data"*. It was *"Notices always surface … stays whole and ABOVE the number"*; it is now *"A notice is drawn when it says a figure may be wrong … One that only explains how a figure was measured is not drawn"*.
The split lives in `surface.desk.notices` (`explains_only`, `data_may_be_wrong`), served with the desk; the room hides only `explains_only`, so an unlisted kind and every notice before the definitions load are DRAWN — fail toward showing. `version_divergence` stays drawn (architecture rule 8).
Held by `tests/test_notice_drawing_contract.py` (every raised kind decided, none in both) and `disclaimers.dom.test.tsx` (his exact `comparison_incomplete` hidden, `stale_stock` drawn).
**Not changed, on purpose:** the tools raise every notice, George receives every one, and the loop still requires him to surface them in his own words — that is the trust machinery and needs a live run, so his prose may still say "110 of 173 cannot be compared". Also here: a caveat-slot sentence the answer already says is no longer drawn twice (`Reading.unsaid`).

## 2026-09-17 · Nine owner reports on the live P2S.2 build, fixed the same day

Store dots are `stores.color` from Settings, matched by id and toned in OKLCH per ground; the palette slot is the fallback. His OPUS teal and Shangri-La pink fail colour-blind separation raw and toned — kept (they are his), relieved by the name, recorded in `ops/palette/REPORT.md`.
The figures stopped being an equal grid: the read his claim cites (else his `lead` block) goes first, larger, and spans the area when it has rows to spread; at most two columns (three cut every product name); names wrap to two lines; the area fades at its edge. This departs from the design's `place()` (1/2/3 columns) at his word — *"all charts dont need to be the same size"*.
Words start at the canvas's foot, not -10vh — alive, the mark reaches it — and scroll in their own column. While he works, `Doing` draws the running read, the clock and his narration, which nothing had drawn since P2S.1.
A figure takes no click; focus no longer reorders. The `opened` decision for attention.learning is no longer written from a figure.
Not done: "more text with each chart" (P2S.3, compose grammar + eval); why today's turns took 53–73 s; why a kept page's earlier reads lost their rows (`payload.charted`). The room now says "rows were not kept" there instead of "came back without rows".

## 2026-09-17 · The thread header, its four views and the composer hint removed at the owner's word

*"we also dont need anything of these anymroe"*, of "tap anything above to bring it here, then say what you mean" and the header "KEPT AS Estate Week · Talk · Behind it · Replay · Page" with "2 reads · 4 tools · 2 caveats · behind it". NOW.md's audit had kept the tabs "on trial until the owner points"; he pointed.
Deleted: `ThreadHeader.tsx`, `BehindIt.tsx`, `Replay.tsx` (P2.e), `ThreadPage.tsx` and `keeping.ts` (P2.a's Keep as page), `WorkLine`, their CSS, `listThreadPins`, `surface.desk.work.line/behind_it/replay`, `test_investigation_replay_contract.py` and the Behind-it/line half of `test_visible_work_contract.py` (which now holds that they stay gone).
**What is lost, said plainly:** Replay (walking the steps afterwards), Behind it (every read of a thread in one list), and the Keep-as-page button — keeping is now only by saying "keep this" / "make this a page" to George, whose tools are unchanged, so UI rule 2's one save gesture is the spoken one. Every figure's receipts still open in place; a figure in his words now scrolls to its figure and lights its READ label instead of opening Behind it.
Kept: the live trail while he works, the backend page and pin routes (George's create_page uses them). Suites: pure 1,830, vitest 70 / 1,007.

## 2026-09-17 · A second composition, `speak`, built beside the design's for the owner to point at

Asked *"what do you honestly think about my current layout? is it ideal"*, the session said no: the mark takes the top-left and the headline starts halfway down; the lines cross the words; the charts' stores are in different orders; right-aligned paragraphs read slowly. He: *"okay lets try that but dont make blob too small"*. So `?layout=speak` (remembered per browser) renders him and the headline across the top, the rest of his words left-aligned, each chart's own thought in his serif, sentences citing a read placed on that chart (`beside.thoughtsOf`), lines only on hover, one store order across comparisons. The design's layout stays the default; **the one he does not pick is deleted**, it does not become a setting.
**The honest limit:** his answers today put their figures in the claim sentence, so almost nothing moves onto charts; the fuller per-chart thought he asked for is written into P2S.3, where the compose grammar changes with its subset run. The Shangri-La frames fixture carries real rows and lives in `verification/`, uncommitted.

## 2026-09-17 · Beside kept; charts sized by need; a thought on every chart and questions to tap — the compose grammar grew two fields

The owner: *"i say keep beside but you can make blob slightly smaller, some charts are too big … add more ai thoughts to the charts … and under the blob is the main headline and question suggestions"*. The speak layout is deleted; its sentence-to-chart placement and one store order stay.
**Charts take the size they need**: two columns on a desk; a figure spans only if it needs the width (`beside.needsWidth`: a line over >8 points, a table over 4 columns, a composed shape). The mark is 122% of its column (body two thirds; the 70% floor from his rows 14/24 moved at his word).
**The grammar**: a block may carry `thought` (≤260 chars, `figures: returned`, metrics.yaml `composition.thought`), a reading may carry `asks` (≤3, ≤90 chars, same rule, `voice.reading.asks`). Taught on the compose tool's schema, not in SYSTEM_PROMPT (at its budget). This pulls part of P2S.3 forward at his word.
**Gate run, 4 turns, $0.73** (`verification/thoughts-gate.json`), all four passing; George wrote a thought on every block and asks on every turn unprompted. **What the rule cannot see:** a figure in WORDS — "Rockwell's gain is three times Fairview's loss", "fourteen thousand units" — passes the digit matcher, as it passes in the answer's prose; CLAUDE.md rule 9's eval-only enforcement applies here too.
Under him now: the data-may-be-wrong notices, the headline, the asks, `next`, and "more from George" (his caveat and sentences no chart took).

## 2026-09-17 · P2S.3 — the catalogue reopened on purpose; kept pages drawn by the room

P1.f closed the catalogue at six so George was not choosing between synonyms; the owner asked for the rest. **What keeps seventeen from being that menu is a rule per shape** (`when`, taught on the compose schema), what its rows must carry (`rows`, one implementation each side, held to one recorded matrix), and **pie, treemap and gauge only when asked** — the person's question names it, or the object is already drawn that way, which is how an asked shape stays.
**A shape the rows cannot make is coerced, not refused** (P1.a's line): the drawing changes, no value does, and it is named. A pie of signed values is never drawable.
**Map and funnel declined** (`composition.declined`), with what would change each — the 2026-09-05 rule that a picture with nothing behind it asserts what nobody recorded. So 14 of the design's 16.
**Parts of a whole are steps of one ink** (`markParts.wash` of a DataColour), never a hue per part; no share, stack total or running total is printed.
**A pin's shape rides on its stored calls (`drawn_as`), not a new column**, because no migration can be rehearsed here; a pin run returns the board's own blocks, so a kept page and the board are one renderer. `edit_page draw` is audited like every structural write.
Recorded reads for the golden tests come from the vetted tools with no model (`ops/record_vocab_reads.py`), committed like `recorded-answers.json`. Gate 4/4, $0.72; George chose no new shape unasked on those four questions.

## 2026-09-18 · P2S.6 — the prompt's reading policy restructured for initiative

Asked to diagnose first, the session found "how are we doing" stopping at which shop moved was five instructions agreeing, not one: a persona that says little "and waits", depth chosen by the message's wording (BROAD/LOOKUP buckets), a ladder that STOPPED on a dominant driver before LOCALIZE, a `next` slot defined as "the one thing to check", and findings limited to one grouped read. The owner: *"can we just optimze or system prompt i needs more initiative"*.
**Depth is decided by what the reads find** (`opens_when.what_is_shown_that_moved`): anything shown that moved is investigated before it is shown. A dominant driver is where LOCALIZE starts; time and what-sold go out in ONE round. `next` and `asks` never hold a read he could have made. A lookup that moved is explained (STANDARD §1's Rockwell). Trust rules unchanged in meaning.
**Drift found:** `broad.reads` said "then ONE localization" and never reached the model — the prompt typed its own sentence. It renders the yaml now, held by a sentinel test.
**Cost over speed, at the owner's word** (*"i care more about cost then fast asnwers"*): no fast mode. Each round re-caches the conversation (62% of spend, 7-day report), so rounds are the lever; a broad eval turn is held to $0.50 (`broad.eval_cost_ceiling_usd`), checked in code off the turn. The owner tests `next` himself; no model-graded check was added.
Prompt 1,797 → 1,787 words; the desk's click list and three repeated clauses left it, mechanics moved to `get_sales`. Live gate not run.
**Extended the same day, at the owner's word — understanding, not breadcrumbs.** A CHECK rung tests the explanations the data can test before one is offered (estate or shop; an empty shelf, per line; the baseline's own days as a series — the one second window allowed), MATTERS says whether it is big and local, and the morning takes apart its top item. Simulated on real reads first: it turned North Edsa's −46% into a flattered comparison, flagged OPUS's baseline Monday, and tied two shops' Kiamoy falls to a barn stock-out. A holiday calendar is still missing; the series check sees an odd day, not why.
**Cost never caps function (owner, 2026-09-18).** The $0.50 broad-turn ceiling set that morning is withdrawn; turn cost is recorded on every eval turn and never asserted. Cost work is caching and fewer rounds. Effort is high for every question about the business; only label-only acts are low.
**The runtime was pulling against the prompt**, found by reading it rather than re-wording: the compose schema still defined `next` as "what to look at", effort picked medium for "analyze", one figure-sentence per answer, the call cap counted compose. All changed with tests. Two live runs followed (the card's maximum): each failed one trust row on the broad turn. Next is not more wording — it is the deletion gates (they now orphan sentences in longer answers), category names George cannot see, and share-shaped prose the attribution check misses.

## 2026-09-18 · P2S.7 — the board builds as he goes; two runs, 6/7 on the second, not closed

**A compose folds into the turn's board; it no longer replaces it** (`compose.fold`). Found underneath the card: each compose frame replaced the turn's composition server- and client-side, so a second compose that only changed one key erased the first. Later reads are drawn quiet at the END (`compose_added`) — the P1.b latch existed to stop rearranging, and adding moves nothing. The lead is settled by his first compose; the claim is what settles last.
**Found live: the loop's answer was the last round's text only.** Prose beside a compose stays on screen, but the gates and the stored post judged only the closing line. Now carried (`kept_prose`), with a scripted test.
**Coerced, per P1.a's line, declared in the yaml (`over_length`):** claims, thoughts and action reasons are cut, caveat/next/asks are kept whole, emphasis keeps the first three, and a slot's rounded figure is said exactly when one read figure rounds to it. A figure no read returned is still refused. Refusals not about truth fell 5, 4 → 0, 0.
**`filters_applied` is a list of statements in production**; the scope check read a mapping and every test passed one. The argument now proposes and the tool's statement confirms.
Two runs (the maximum): $2.56 at 2/7, $1.91 at 6/7. The failure was "₱25–45k", a range no read returned, which is eval-only by rule 9. A third run is the owner's call. The move and the orphan in that turn are fixed with tests but have not been seen live.

## 2026-09-18 · The UI is frozen as it is live; the page layout is parked

After a render of the answer as a page under the mark (P2S.8, written the same day), the owner: *"actually no more changing how our ui works i like it right now."* P2S.8 is parked, not deleted; the render stays as the record. The remaining cards (P2S.9 fewer rounds, P2S.10 three tools, P2S.11 what he is told) change how George works underneath, not the screen — where one would touch the screen (P2S.11's memory list), it uses the screen that exists.

## 2026-09-18 · Dogfood: the room runs to the line, shows all his words, your question, and a way back

Four fixes to the room as it is live; the UI freeze covers redesign, not these (`5b40454`).
**All of what he said is drawn**: the one-tap rest (2026-09-17) hid words the column had room for. The rest printed `**` because sentences were cut from raw text; they are cut from the unmarked text, each carrying its share of his emphasis.
**Your question is drawn in your words**, never worded by the room; an answer nobody asked for draws none.
**Going back is a view, not a request**: an earlier answer is redrawn by `buildBoard` over the stored turns up to it, no model call and no read. Asking from there sends the board as drawn and returns to the newest.

## 2026-09-18 · Under him, only what the screen does not already say

Reverses 2026-09-17's "a sentence about a chart with its own thought stays with the rest of his words", at the owner's word (`f13df40`): shown twice is noise. A sentence citing a drawn read goes; a sentence about an undrawn read stays, because nothing else says it (it used to vanish).
**"Already said" is word overlap, not meaning** (≥ 0.6 of a sentence's words in one other on-screen text), measured on the recorded answers: repeats scored 0.6–1.0, new sentences ≤ 0.5. No model reads the screen to decide what to draw. A paraphrase in different words gets through, and that is the known limit.

## 2026-09-18 · Emphasis adds; it never takes away

At the owner's word (`f7335f1`): *"dont desaturate or lower other things to emphsize something else"*. This finishes 2026-09-15's "all stores still matter" (dimming 0.5 → 0.75) by ending dimming: `COOL` is 1, and the grammar's `litness` is a hit test, never an opacity.
**What stands out gains**: weight, a ringed swatch, and a band of `--george`, the colour already meaning "the one he pointed at". Not the accent, which stays "needs you" (UI rule 5).
**All of his prose is `--ink`.** Grey is the frame's (labels, ticks, read-times), and `ink.test.ts` holds the list of his classes.
**Amended the same day: no band.** The `--george` band behind a lit row was refused on sight (*"wtf happend here dont do that"*); it read as grey slabs on the dark ground. Emphasis is weight and a ringed swatch only, and `ink.test.ts` forbids a background or shadow on a lit row.

## 2026-09-18 · Under him, the headline and what to do next; his reading on the charts

At the owner's word (*"that should only be the headline and suggestions what to do next … that should be with those charts"*): the left column is the question, the headline, `next`, the asks and the offers. His analysis sentences and caveat go on the chart the headline rests on (`wordsOnCharts`). They are under him only when the turn drew no chart. This supersedes the morning's "draw the rest under him" (`5b40454`); the chart-repeat filter (`f13df40`) still applies.
**Amended within the hour** (*"no not on top and before of the charts with the charts thats it related to. and if its not related then it can go under the blob"*): `wordsOnCharts` is deleted. A sentence about a chart goes under that chart, and a sentence about no chart goes under him. "About" is still the figures a sentence cites, so a chart sentence with no numeral stays under him. Only George writing into each chart's thought fixes that.

## 2026-09-18 · No card runs its own test; the phase close is the test

The owner: *"revise the plan no more tests ill do it at the end of the phase"*. P2S.9, P2S.10 and P2S.11 lose their subset runs, and the P2S.✓ full run checks everything the phase changed. It names which card any failure came from. Eval spend left: $6.22 → $3.02, the two phase closes.
**P2S.6 and P2S.7 are closed as built.** Both are live, and their only open condition was their own trust run, which is now the close's. The known failure to beat there is the morning's "₱25–45k".
**The trade, said plainly:** a regression surfaces at the close with up to six cards behind it, where a per-card run would have caught it at its own card. The owner chose that knowingly.

## 2026-09-18 · P2S.9: fewer rounds, and a metric set asked as one call

**A round of composes that stood, named the claim and has words beside it is the answer.** The loop no longer sends it back for a closing line. The compose tool says so, since otherwise the closing line ("I'd ship those four lines now…") would be lost. Gates still run, and a rewrite still gets its round.
**`metric_sets` may now be ASKED as one call** (`asked_as_one_call`). This amends 2026-09-07's "nothing executes a set" in how it is asked, not in what runs. The loop expands the call into the set's single-metric reads, each with its own seq, receipts, object and pin. get_sales still refuses a set name, and no row is joined across them. So there is still one calculation path per metric.
**The model's copy of `meta` carries each repeated note once a turn** and a pointer after that. Source, filters, window, read time, notices, errors and truncation go whole every time. The person's receipts are never shortened. Offline it saves −9.9% of result characters, not the card's "most of 59%": the fields the card keeps whole are most of the meta.

## 2026-09-18 · Sonnet 5 tried on the seven questions; staying on Opus 5; the test set rewritten from his questions

At the owner's word, one run of the gate and depth questions on `claude-sonnet-5` ($0.68). Four finished, with clean trust rows and 50–75% cheaper. Three crashed on a George bug (a missing required tool argument, now in the log). On the two digging questions it said *what* where Opus said *why*, and "how are we doing" took 8 rounds and 165 s against Opus's 5 and 85 s. **Staying on Opus 5.** Two answers are a signal, not proof.
**The seven questions were mostly sessions' trust traps**, and one was his. `ops/EVAL_QUESTIONS.md` rebuilds the set from `george.conversations` (about 45 of his own questions since 12 Sep): six tiers, each question with AUTO, RUBRIC and CLOCK checks that hold whatever the week's numbers are. Wiring it is P2S.10's first step.
**Trimmed the same day to five** (*"just keep main questions … just a few will do"*): investigation, judgment, memory, not inventing, and a fast lookup. That is six turns, about $1.25 a run. The 25-question version stays in git at `c7a6112`.

## 2026-09-18 · P2S.10: reads asked as one call, and the budget counts calls

The owner's own 30 days (78 turns that read, 351 calls) asked the same reads piece by piece over two or three rounds. **`get_change` and `get_stock_health` are each one call for the model and a list of EXISTING reads for everything else** (`metrics.yaml one_call_reads`, `agent/one_call.py`). This is P2S.9's metric set widened to several tools: no SQL, no read consumes another's rows, and each read has its own seq, receipts, board object and pin. A pin holds the reads, never the call.
**Two tools, not the card's three.** "Every shop at a glance" has been one call since P2S.9(b). A second name for it would add a choice and save nothing.
**`get_change` takes a category and the morning's comparison.** Otherwise two of the three target questions (the morning, "analyze") could not have used it. With a category the list changes: net sales cannot be cut to a category, and stock history has no category filter.
**The convergence cap, the prompt's budgets and the eval's trust row count CALLS now**, with a call asked as one counting once. A `get_change` is seven reads and one decision. The cap exists to stop a subject being read one call at a time, and a declared list of reads is not that. `executed_calls` still counts the reads.
**The estimate, said plainly:** about 22–31 s a turn on the three target questions. Being "15–25% cheaper" is at risk on the broad turn, because the round it saves costs about what its bigger result adds.

## 2026-09-18 · P2S.11: what he is told to leave out is a setting the reads apply

**A seventh stance, `leave_out`, binds the first `settings.declared` entry (`left_out_categories`).** It is taught like `means` — their words in `told`, no calls — so the table's one-ground check already fits and there is no migration. The category is checked against the catalogue when told.
**Told views are their own list** (up to 24), attached before his newest 12, so "leave per gram out" can no longer slide off behind his re-confirmed views.
**Lists, never totals.** A list of products or categories leaves the category out and its receipt says *"per gram left out at your instruction, <date>"*. A total — a shop, a day, the estate — stays the till's figure, because leaving a category out of it would be a different number under the same name. A read that names the category or one product leaves nothing out and says so.
**The loop hands the value to the reads the declaration names, as a keyword-only argument the model never sees, and drops one he sends.** He records what he was told; only a person binds.
**Not done:** a pin or a workflow step re-runs its stored call without the setting. The prompt is now exactly at its 1,800-word budget.

## 2026-09-18 · P2S.4: same-store year over year, and the sales record's own silence

**`same_store` is a definition, and its wording waits on the owner** (`confirmed_by_owner: false`): a shop counts when its first sale on record is on or before the earlier window's first day, its last sale is on or after the later window's last day, and it sold in each. Every shop left out is named on the receipt with the dates that decided it. When no shop is named, closed shops are judged too, so AJI PINA is named rather than never mentioned.
**`same_period_last_year` uses the same calendar dates a year back, not 52 weeks**, because the question is seasonal and Christmas is dated. A moving holiday (Chinese New Year) is the stated cost. It covers closed windows only; the year-to-date version is recorded as not built.
**A record check was added beyond the card, because the data needed it.** The sales history holds six days between 2024-09-01 and 2024-12-31. Without the check, the tool blamed the shops for December 2024 and read a 5-day September as +567%. A window where no shop sold on any day is refused; one with some silent days gets `sales_record_silent_days`, drawn above the figure. It is not a threshold: one silent day is reported.
**The card's done-when is not met on its own question.** December 2025 against December 2024 refuses, because that December is not in the record. The comparable set by name was proven on August, and the mid-window exclusion on September.

## 2026-09-18 · P2S.5: voice is the line's own send, not a second path

**What is heard goes into the line and is sent by the same `ask` Enter reaches.** So the selection, estate and board travel with it, and a steer resolves through `resolveFragment`. There is no voice branch for George to see: a spoken question reaches him exactly as a typed one does, and nothing but its text is kept.
**Hold and release sends; a tap listens until the next tap and leaves the words to correct.** This settles the card's two clauses, "send on release" and "corrected before sending". With hands-free on, a tap sends once the recogniser settles the phrase.
**Hands-free reads the headline sentence, cut the same way `Reading` cuts it,** and only on a busy→idle edge, so an opened thread is never read aloud at you. The claim is ringed while he speaks (emphasis adds, never the accent), and any pointerdown or keydown cancels him.
**"Read it to me" is a definition (`surface.desk.fragments.read_aloud`)**, like the correction token, and a contract test keeps it from colliding with any steer's spelling.
**Not built: listening while he speaks.** An open mic would hear his own voice, so interrupting him means pressing the mic. **"Last 90 days" is not a defined window**, so, spoken or typed, it goes to George as a question.

## 2026-09-18 · P2S.✓: the close ran, and the run is bigger than its price

**The full run is fourteen questions and $4.79, measured** (`verification/p2sclose-v2.json`); the plan carried eleven and $1.51 from P1.e. The suite grew at P2S.6, P2S.7 and P2S.10 and nobody re-priced it. `FULL_USD` in the alignment contract now says 4.79 and both plan copies quote it. A suite that grows is re-priced the day it grows, not at the next close.
**Three trust rows failed the same way:** a rounded range over day rows written in prose (*"₱28,000–36,700"*) that no tool returned. Logged, not fixed, not bisected; P2S.6's initiative over the rows is the likely source.
**The claim under the mark, not inside its lower edge, is the owner's fix of 2026-09-17** (`6975200`); the frame measure's `claim_starts_inside_mark_lower_edge` is false by decision and is not a defect.
**A ticked close card still names every scene it owns:** the contract reads `[x]` as well as `[ ]`.
**Voice on the live build was not tried** — a headless session has no microphone. It waits on the owner, with "feels right".
**The gate to Phase 3 is not met and the close says so:** 13 Open, median 76.6 s a turn against under 10. Whether Phase 3 starts anyway is the owner's call.

## 2026-09-19 · The speed fix: six changes, one paid run, and where the seconds went

**The regression since 14 September was rounds and writing, not reads.** Output tokens per turn went 897 → 4,160 in four days; the P2S.6 flattening of effort to high on every kind was most of it. Follow-ups and fresh questions are medium again; the ladder, broad questions and a new `build` kind stay high, and "analyze" / "investigate" / "compare" open the ladder.
**A figure in prose that no read returned is now a production gate** (`voice.grounding`), the eval's matcher run by the loop: repair a rounding one read explains, else one rewrite, else the sentence goes. Rule 9's sentence that production does not check prose numerals is now understated, not broken; the owner asked for it.
**Refusing an ask or an action no longer costs a round** (`rounds.settle.stands_without`), and an unknown block field is dropped rather than refused, with `composition.refused_fields` keeping the figure-typing names refused.
**One round for the drivers after the verify** — the ladder's first rung is kept; only what follows it is batched.
**Measured once, $3.50: median 76.6 → 24.3 s, $0.34 → $0.25 a turn, 8 → 11 of 14.** The owner then asked that no further paid runs be spent on it; the two follow-ups (echo repair, the limitation regex) are held by tests and a free replay.
**Not fixed:** a threaded answer that cites no figure at all (a writing flap, not a gate), and the two building/digging turns still over 100 s at high effort.

## 2026-09-19 · George is Bob — the name and the code, not the database

**At the owner's word ("were renaming george to bob everywhere"), scoped by him to name and code.** 345 files' text and 39 files' names: his name in the prompt and the room, identifiers, routes, tests, the plan page, the design page's copy, CLAUDE.md and NOW.md.
**Kept as written:** the Postgres schema `george.*` and its tables, the roles `george_ro` / `george_log` / `george_app`, every `GEORGE_*` environment variable, the SQL role scripts, the alembic history, and this file and the dogfood log up to today — what was said then stays said.
**The old API paths stay as aliases** (`/api/v1/george/...` mounted beside `/bob/...`, out of the schema) so Vercel and Railway can swap minutes apart without a dead front end; remove them one deploy later.
**Suites after:** pure 2,028, vitest 986, `tsc -b --force` clean. No live run — a name is not logic.
**Not renamed online:** the design artifact *George, Ahead of Me* on claude.ai is the owner's record; its file in the repo now says Bob. The plan page was republished under its new title.

## 2026-09-19 · Phase 3 re-cut: nine sessions to six, the screens out, the loop closed once

**At the owner's word ("go and rewrite the plan").** Four screen cards went: P3.a (a queue with keys and a snooze migration for a queue holding nothing), P3.c (page polish), P3.e (merged into P3.d), P3.f (folded into P3.b). The UI is frozen since 2026-09-18; every card left is Bob doing something, and each is checked against the design's own scene.
**Order:** P3.h exports in (unfreezes orders and transfers, 16 and 80 days old), P3.b the morning unasked (the first standing question ON; the attention read as words; notices folded; Aji Ichiban default), P3.g the first watch ON, P3.d build it and keep it (versions, the provisional frame, the diff, Needs you as a figure), P3.i he checks what happened (new: the standard's last step, which no card did), P3.✓.
**Five sources added to Phase 4** that only the owner can supply: the vending aisle feed (stopped 2026-08-05), expenses, customers/promotions/events, the low-stock level in StoreHub, the autumn of 2024.
**Phase 5 is three decisions, not cards:** what "build it" means, what Bob connects to, what happens to the old app. The owner: "dont have an answer and dont need one" — parked, not cut into cards. The room at phone width is owed and unmeasured.
**Note-only pushes redeploy Railway** — seen 2026-09-19 (`1910f428` served after a docs commit) and probably behind the owner's 404. NOW.md's claim that they do not was wrong; notes now ride the next real push.

## 2026-09-19 · P3.h: StoreHub's exports go in from a page, and the API is a source, not a card

**The API question, with its source:** StoreHub publishes no API reference (searched 2026-09-19); its help centre says only that a key is requested from Customer Care by the master email. Unauthenticated, the API answers 403 on `/purchaseOrders`, `/products`, `/transactions`, `/stores`, `/inventory/{id}` and 404 `ResourceNotFound` on every spelling of stock transfers — so orders look readable, transfers do not. No pull was built on a payload nobody has seen; it is source S.12.
**A known wrong file is refused in words a person can act on, and the words live in the yaml** (`storehub.stock_transfers.refused_shapes`): the exact header, and the sentence. The parser raises that sentence and nothing else — an internal shape name on the end of it was a raw diagnostic, seen in the first frame and removed.
**The page has its OWN key, `storehub_imports`, not Bob's:** being allowed to talk to him does not grant writing to the procurement tables. It renders in the room's chrome and is reached from BOB'S rail, under a **Sources · last import** group listing the two records with the date each last arrived — the owner, the same day: *"it should be a page in bob not supabot"*. It was in the Supabot sidebar for one session, which was wrong: the route already rendered in Bob's chrome, so the link was a second door to his room from someone else's. The links are drawn whether or not anything has been imported — the `Group` helper swaps its rows for a quiet line, and the way IN would have vanished on the day nothing was imported, which is the day it is most needed — and only the DATE is loaded: loading, not read, a date, or never. The group is absent, and the ledger is not read at all, for a role without the key.
**A 422 is a refusal and everything else is a failed upload**, and they are worded differently, because only the first means "nothing was written, fetch another file".
**The import just made is not drawn again under "Earlier imports"**, and "no file yet" is claimed from the whole loaded ledger, never the filtered one (UI rule 8).
**`products` gets no upload kind:** a job outside this repo writes it nightly at 15:00 UTC; a second writer on one table needs a rule between them first. Held by a test.
**Closed as built:** the live done-when needs his push, his export and his upload. Pure 2,031 → 2,039, vitest 986 → 993, tsc clean.

## 2026-09-19 · Products come in too, and the rule between two writers is written down

**Asked for by the owner an hour after P3.h closed declining it**, with the real export attached: *"we need a new one for products it needs to update supabases product page cause we have suppliers"*. The card's reason for declining still stands — a job outside this repository fills `products` nightly — so the kind was built on the only thing that makes two writers safe, which is a rule naming what each owns.

**The rule: one writer per column.** The nightly job owns name, SKU, category, barcode, cost, price, tags and the flags. This import writes **no `products` column at all**. It takes the two facts that job does not carry: who supplies a product, and the warning / ideal stock level somebody set for it at a store. `tests/test_storehub_imports_route_contract.py` holds the absence by reading the importer for any write against that table.

**Two tables, not two columns.** A product has several suppliers (SH1 "Aji Mix" has five) and a level is per shop. Either as a delimited string is how "Seikyo SEK001; GZ Cri GZ001" becomes the name of one supplier. `product_suppliers` keeps the export's order in `position`, because the first name is usually the one they actually buy from. `product_stock_levels` has `store_id` NOT NULL — a level with no shop is not a fact about anything — and both levels nullable, because blank means nobody ever set one and 0 means somebody set zero, the same distinction `received_quantity.blank_is_zero` already owed.

**There is no supplier master, so names are not normalised.** Stored as exported, never trimmed into each other, never fuzzy-matched. Inventing a supplier id here would be inventing the thing the estate does not have.

**The column list cannot be fixed, so the middle of the header is read structurally.** StoreHub writes three columns per STORE, named after the store, between a 19-column leading block and an 8-column trailing one: the real export is 84 wide and gains three when a shop opens. The two fixed blocks are matched exactly — a moved column would import a cost as a price with no error — and the middle must be whole triples that each name one store. A renamed, dropped or reordered column is refused rather than read positionally, because a short row shifts every level after it one shop to the left.

**StoreHub's own instruction row is skipped by its first cell, before the field count.** `#Required(Must be unique)` sits under the header and is not a product. Its width is StoreHub's business; refusing a whole good export over the shape of a row nothing reads would be the wrong trade.

**Nothing is invented for what does not resolve.** A Product Id with no catalogue row is counted and said; a level at "Test stoee" (in the export, in no alias) is counted and dropped. No product row and no store row is ever created by an import.

**A re-import converges, scoped to the products the file mentions.** Within that scope the file is the truth, which is the only way "who supplies this" can ever stop being wrong; outside it nothing is touched, by the same rule that leaves documents outside an export's window alone.

**The ledger gained `counters` (JSONB).** Its flat columns were named for documents and lines. Reporting a product count in `documents_seen` would be a lie in a column name, so every import now records its whole counter dict and the page draws products in products — never "0 documents" about a file that has none.

**Three new notice kinds were decided, not left to default:** `unknown_products`, `rows_without_product_id` and `links_removed_on_reimport` all say something the file was meant to carry did not land, so all three are `data_may_be_wrong` and are drawn. The repository's own guard caught them before the suite went green.

**Not run against a database.** `y9z0a1b2c3d4` is the first new DDL since `x8y9z0a1b2c3` and there is no local Postgres, so it first runs on Railway at deploy. The importer is held instead by a recording session that compiles every statement it issues against the Postgres dialect.

**Suites after:** pure 2,039 → 2,063, vitest 997 → 999, `tsc -b --force` clean. Unpushed.

## 2026-09-19 · Three invisible bytes, and the four things the owner asked for after seeing it live

**The owner uploaded all three exports to the live page and said "its not working i think products is the only one working."** He was right, and the cause was not the columns the refusal blamed.

**STOREHUB NOW WRITES ITS EXPORTS WITH A UTF-8 BYTE ORDER MARK.** The first header cell arrived as `﻿P.O ID`, which is not `P.O ID`, so the header check refused both document exports and printed a complaint naming a column that was present all along. The products export happened not to carry one, which is why it alone worked and why the failure looked like a products-only success rather than a decoding bug. **The mark is stripped once, at decode, for every kind** (`storehub.text.strip_byte_order_mark`), not matched inside a column name — the mark is an encoding artifact of the FILE, and fixing it per column leaves the same trap for the next file that carries one. The owner's real `Purchase_Orders_09-19-2026.csv` now parses to 17 documents and 39 lines with the mark and without it, identically.

**THE LINE IS ON EVERY SCREEN.** *"the text bar should be global same spot everypage".* UI rule 1 has said since the start that Bob is on every page and receives that page as context; he was on one. The room shell now renders one line — no chips, no mentions, no voice, because nothing on these screens is picked — inside `.r-line-wrap`, the board composer's own wrapper, so it is the same shape in the same fixed place. Asking names the screen it was asked from and opens the board, because an answer needs somewhere to land.

**ONE TAB IS ONE RECORD.** *"it shouldnt show all imports in all import pages it should be show past imports per tab".* The ledger is read per kind from the server, with the kind in the query key, rather than filtered in the browser: the list is the server's answer to the question the tab asks.

**EARLIER IS FOLDED AWAY, AND WHAT JUST HAPPENED IS LOUD.** *"it can just hide first and then when you upload i new file it needs to be clear its processing with a bar and green if it went through and red if it failed".* History is one line you can open. While a file goes up there is a bar: **sending has a real percentage** because bytes leaving the browser are countable, and **reading does not**, because the server parses, resolves and writes in one transaction and reports nothing — it says "reading" instead of drawing a number nobody computed.

**A THIRD COLOUR FAMILY, BOUNDED LIKE THE OTHER TWO.** Green and red could not come from the accent, which means "needs you" and would stop meaning it, and could not come from `--up` / `--down`, which mean a direction a tool MEASURED — an import landing is not a measurement, and borrowing the rise colour would make "it worked" and "it went up" the same green. `--landed` and `--refused` are their own pair, defined not aliased, and `accentUse.test.ts` now holds them to the two files allowed to name them. The words beside the band say the same thing the colour does, so nothing depends on seeing the hue.

**Suites after:** pure 2,063 → 2,064, vitest 999 → 1,006, `tsc -b --force` clean.

## 2026-09-19 · Bob can read who supplies a product, and there are two answers to that question

**The owner asked whether Bob knew about the two tables the products import had just filled.** He did not, in two separate ways, and both are now closed.

**A GRANT IS NOT PART OF A DEPLOY, and that is a trap worth naming.** `tools/george_ro_role.sql` is run by hand. The migration created `product_suppliers` and `product_stock_levels` and Railway applied it, so the tables existed and held 2,381 links and 40 levels while `george_ro` had no SELECT on either. Any tool that had reached for them would have raised InsufficientPrivilege in production. Granted on the live database 2026-09-19, and the script now says out loud that a new table Bob reads needs a line there AND a hand-run grant.

**A TABLE WITH NO VETTED QUERY IS INVISIBLE TO BOB BY DESIGN.** He writes no SQL, so the grant alone changed nothing. `get_product` now attaches two facts to every row it returns: the supplier names StoreHub records, in the export's own order, and the warning / ideal level per store. Both read through query constants with one bound parameter — the ids of the rows already selected — never a built string.

**ATTACHED TO THE PRODUCT, NOT GIVEN A TOOL OF ITS OWN.** "Who supplies Aji Mix" is a question about a product. A second tool would mean two calls and two results for one answer, and rule 5 keeps depth in the tools rather than in the loop.

**THERE ARE TWO ANSWERS TO "WHO SUPPLIES THIS" AND THEY ANSWER DIFFERENT QUESTIONS.** This is the part that will cause trouble if it is ever forgotten:

- `product_suppliers` — who StoreHub **records** as supplying it. Typed by a person into the system of record, 2,247 products covered.
- `definitions/product_suppliers.yaml` — who we have **bought** it from, inferred from purchase history by `ops/propose_supplier_map.py`, 650 entries, approved by the owner 2026-09-10, and what the purchase plan uses.

The first says who you are meant to buy from; the second says who you did. **They will disagree, and which one wins for a purchasing decision is a business definition nobody has made.** Until somebody does, the purchase plan keeps the inferred map it was built on, and the imported list answers "who supplies this" and nothing else. Every attached result names which of the two it is, by path, and a coverage notice explicitly warns against falling back to the other one in the same breath.

**A LEVEL IS NOT WHAT IS ON HAND**, and the tool says so to the model in its own schema. The export carries a quantity column beside each pair and it is deliberately not imported: two sources for on-hand is how a stock figure becomes a question about which table you read. Null in a pair means nobody set that half; 0 means somebody set zero.

**A WIDE RESULT SAYS IT DID NOT LOOK.** Over 200 rows the lists are not read and come back null, not empty, because an empty list there would be the tool asserting "this product has no supplier" about a question it never asked.

**Verified against the live data, not a fixture.** Aji Mix reads back with its five suppliers in export order; SH1206 carries 10/20 at SM North Edsa and 10/25 at Magnolia; every result names import 18 and the file it came from.

**Suites after:** pure 2,064 → 2,083, vitest 1,006 unchanged, `tsc -b --force` clean.

## 2026-09-19 · A Decimal in a composition block cost the owner a conversation

**The owner: "my most recent chat just disappears after i hard refresh which didnt happen before."** One turn in his data had a conversation row holding the whole answer, a question post, and no answer post. Every other turn he has ever had has both.

**THE CHAIN, AND IT IS SIX LINKS LONG.**

1. `_answer_payload` passed five of its six fields straight to `json.dumps`. Only `charted` had been through `_json_safe`, because it is sanitised where it is collected. A `Decimal` or a `datetime` in a composition block, a reading, an offered action or a page read raised `TypeError`.
2. The raise was outside `_exec`'s swallow **and** outside the turn's own try/except — `log.posts` is called after them — so it escaped and killed the generator.
3. The question post was already written. The answer post never was.
4. No answer post meant no `post` frame.
5. No `post` frame meant the room never called `setStoredThread`, so the url stayed `/bob` instead of becoming `/w/<thread>`.
6. A hard refresh had no address to return to.

**The answer was in `george.conversations` the whole time and unreachable from the room.** It still is reachable from Earlier, because the chat list is built from the conversation log rather than from the timeline — so the prose came back and only that turn's charts are gone.

**"LOGGING MUST NEVER BREAK THE ANSWER" WAS ENFORCED ONE LAYER TOO LOW.** `_exec` has always swallowed a failed *statement*. Nothing swallowed a failure while *building* one, and that is the whole defect. Both are fixed, and either alone would have prevented it:

- **Every field through the sanitiser**, not just the charts. The asymmetry is what made this unpredictable: which field carries a Decimal depends on what Bob read that turn.
- **`posts()` may not raise.** The body moved to `_posts` and the public method guards it, recording into `log.errors` exactly as a failed statement does.

**AND IF SOMETHING STILL WILL NOT SERIALISE, THE POST IS STILL WRITTEN.** A type the sanitiser does not know is a bug to fix, not a reason to lose the thread. Each part is tried alone, whatever survives is kept, what was dropped is named in the payload under `_reduced`, and a gap is logged. A reopened thread then draws the prose and whatever it still has — which is what the method already promised for a post that carried nothing.

**Why it started when it did:** the turn before it saved fine at 00:13; this one was the first after the rename and speed-fix deploy went live at 00:54. Which of that deploy's changes put a Decimal into one of those five fields was not chased, because the hole would have opened on any of them eventually and the fix is the same either way.

**Suites after:** pure 2,083 → 2,098. No frontend change.

## 2026-09-19 · The rename changed a value the database validates, and every post Bob wrote was refused

**The owner, after the previous fix shipped: "it still disappeared after hard refresh and cash remove is that normal?"** It was not normal, and the previous fix — real, and worth keeping — was not the cause.

**THE CAUSE.** `044d3e7` ("George is Bob: the name and the code, not the database") changed the author literal in two INSERT statements from `'george'` to `'bob'`, and updated the models to match. The CHECK constraints in the live database still said `'george'`:

```
ck_posts_author        author = ANY (ARRAY['george', 'user'])
ck_posts_actor         (author='user' AND author_user IS NOT NULL) OR author='george'
ck_page_events_actor   actor = ANY (ARRAY['user', 'george'])
```

So from the moment that deploy went live, **every post Bob authored was rejected by Postgres.** The question post survived, because its author is `'user'`. The answer post did not. That is the entire symptom: a thread with a question, no answer, no `post` frame, no `/w/<thread>` address, and nothing to return to after a refresh.

**IT WAS NOT ONLY THE CHAT.** `river_writer`'s single INSERT carries the brief, watches, approvals, workflow runs and pin confirmations, and spells the author inline. All of them would have failed the same way. `george.page_events` has the identical trap and would have failed the first time Bob created or edited a page, which nobody had tried.

**WHY NOTHING CAUGHT IT.** The suite ran green throughout and would have run green forever. The models agreed with the code, the code agreed with itself, and the only disagreement was with a database no test connects to. A value a CHECK permits is not a column, a type or an index; nothing in this repository compared the literals to the constraints.

**THE FIX MOVES THE VALUE, NOT THE CODE.** The rename's rule is that the database keeps its george NAMES — schema, roles, environment variables, migration ids — and all of that is untouched. `author` is not a name, it is a value the product reads: the frontend's `PostAuthor` has been `'bob' | 'user'` since the rename and `river.py` already defaults a missing author to `'bob'`. Migration `z0a1b2c3d4e5` moves the 175 existing rows to `'bob'` and rewrites the three constraints to permit exactly what the code writes. Nothing is left permitting both spellings: a constraint that accepts either has stopped holding the vocabulary.

**THE GUARD** (`tests/test_post_author_contract.py`) reads the raw SQL literals in both writers, the models' CheckConstraints, and the latest definition of each constraint in the migration scripts, and fails if any of the three disagrees. Upgrade sections only — a downgrade re-creates the rule the migration exists to replace, and scanning whole files reads the old one.

**A NOTE ON THE PREVIOUS FIX.** The Decimal sanitising and the `posts()` guard from earlier today were a genuine hole and stay. They were not this. Diagnosing from the data showed a question with no answer and correctly identified one way that happens; it took the table's own constraint definitions to find the way it actually did.

**THE MIGRATION FAILED THE FIRST TIME AND TOOK PRODUCTION DOWN FOR FOUR MINUTES.** It updated the rows before replacing the constraints, on the reasoning that a constraint should only be created once every row satisfies it. That is backwards here: the OLD constraints are what the rows are being moved out of. `ck_posts_actor` read `(author='user' AND author_user IS NOT NULL) OR author='george'`, so setting `author='bob'` made both branches false and Postgres refused the UPDATE itself with a CheckViolation naming that constraint. Alembic stopped, the schema check found the database one revision behind the code and refused to serve, and the app came up 503 rather than half-working — which is the schema check doing exactly its job.

**An old rule cannot be satisfied by rows on their way to a new one.** Drop, then update, then create, in both directions. Applied by hand to restore service, then pushed; head `z0a1b2c3d4e5`, the three constraints name bob, 176 answer posts moved across, healthy at 05:01:35 UTC on build `2f57a400`.

**Suites after:** pure 2,098 → 2,106. No frontend change.

## 2026-09-19 · The table drew columns most of its rows could not fill, and five other things the owner found in one message

**"what does this chart mean and is it a bug its showed up like this in multiple answers?"** It was a bug, and a general one.

**A READ MAY RETURN ROWS OF MORE THAN ONE SHAPE, AND THE TABLE ASSUMED IT NEVER DID.** `tableShape` took its columns from `rows[0]`. `get_attention` returns three shapes — a shop whose sales moved, a product that went out of stock, one that went dead — sharing only `subject`, `rank` and `size`, so the first row's private fields were advertised for all seventeen and fifteen rows drew an em dash under VALUE, CHANGE PCT and UNIT. Three separate faults, each fixed where it was:

- the keys are the union over every row;
- **once the rows are of more than one shape, the table draws what they have in common.** A column only some rows carry reads as a measurement that came back empty rather than one that was never taken. Where every column is whole, which is nearly every read, nothing changed;
- the tool's machinery — `identity`, `section`, `floor`, `measure`, `source`, `threshold_applied` — is no longer eligible to be a column, and `subject` has a rank so it stops losing the five-column cap to fields nobody can read. Raw diagnostics never reach the answer (UI rule 4), and this is where they were reaching it.

**A UNIT BELONGS TO A MEASUREMENT, NOT TO EVERY NUMBER IN A ROW.** `unitOf(row)` says what the row's VALUE is measured in and was applied to every numeric cell, so the attention table drew its rank as `₱1`. `unitFor` returns none for a position or a count.

**WHAT IS STILL OPEN AND WAS NOT FAKED:** attention now draws `subject · rank · size`, and `size` is the tool's word for how big the thing that crossed its floor is — ₱13,350 on one row and 5 on the next, each correct, the header jargon. Three different measurements in one result want their own drawing rather than a table. Logged as a card rather than papered over with a relabelling nobody chose.

**THE DEFAULT ESTATE IS AJI ICHIBAN, AND THE HARD HALF WAS NOT THE DEFAULT.** "The default" and "the part that narrows nothing" were the same part, and three places read the default to mean "nothing travels": `estateFor` in the room, `_estate_words` in the surface, and the endpoint. Had they kept reading it, the board would have drawn his shops' pill over answers that had counted the vending business — the switch saying one thing and the figures another. The part that means everything now says so (`everything: true`), and the estate tests assert the invariant directly rather than the old proxy for it: the pill and the scope never disagree.

**A WIDE TABLE TAKES THE ROOM INSTEAD OF SCROLLING INSIDE HALF OF IT.** `needsWidth` asked whether a table had more than four columns; the one he found has four and sixty characters of heading. It measures what the columns need now.

**THE WORK TRAIL IS ONE LINE.** Eighteen lines of `read sales · 7 rows · 192ms` is a log, and a log is something you read afterwards. The read happening now, and a count of what is behind it. **A refusal is not part of the log that went** — a read that declined stays on screen however many have gone past it, because it is the tool saying in its own sentence that it will not produce a misleading number.

**A STANCE IS DRAWN AS A WORD.** `judgment.stance_words` names all seven; the memory read carries `stance_said`; the CSS stopped uppercasing it, because the transform was hiding an enum's underscores and uppercasing a word turns it back into a label.

**TWO OR MORE NOTICES FOLD TO ONE LINE.** At his word, and it gives up nothing UI rule 4 is for: the line sits where the notices were and says how many there are, so a person cannot look at the figure without seeing that something qualifies it. One notice stays open.

**THE HOVER TIP HANGS FROM WHICHEVER EDGE IT IS NEAR.** The figures area clips horizontally — it must, or a wide mark would spill into his words — and a tip centred on a mark near the left edge lost its first characters.

**AND FIVE LIVE TESTS THAT HAD BEEN RED SINCE A RENAME.** Four in `golden.py` filtered on the literal `"Shang"` and stopped resolving when the display name became "Shangri-La"; they read it from `stores.active_retail` now. One read `selection.comparison`, deleted with the compare shortcut on 2026-09-15; it asserts the absence and keeps the half still true.

**Suites after:** pure 2,107 → 2,112, vitest 1,019 → 1,026, `tsc -b --force` clean.

## 2026-09-20 — P6.e: the canvas is the design, to the pixel, and only the canvas

**Decision.** When Bob lays the right-hand side out himself (an `arrangement`), every
block is drawn to `ops/ideal/how-are-we-doing-v2.html`'s own sizes and shapes; the packed
board — no arrangement — draws exactly as before. One flag, `TileProps.canvas`, set by the
renderer from `laid`; the differences live in CSS scoped to `.r-board--laid` and in four
marks (figure, line, multiples, contributors).

**Why.** The owner, with the design open on his phone beside P6.b's frame: *"it doesn't
look like this. It still feels like our old just put in a new order ... still kinda a
thread. whyyyyyy."* P6.b was closed as "within measure of v2" and was not. The measure had
been the harness's numbers; the eye saw four things the numbers did not: three-sentence
heads where the design has one line; every block the same shape (head, chart, `read n`
line) where the design's sections differ; a 72px hero where the design has 34; and mini
cards with coloured dots where the design has one strip. "Feels the same" was structural
and the fix is structural.

**What was not taken from the design.** Its ink-3 on the quiet label (his words are ink,
`ink.test.ts`); its `--need` left rule on the callout box (accent is approvals only); its
`-42.7%` per shop (not in the store×week rows, and a figure is never computed — Bob adds a
per-shop read if he wants it said).

**What changed underneath.** `composition.span` takes one label as well as two: on
`multiples` it names the one shop the thought is about, drawn as the callout under it. The
compose addendum (`composition.page_first`) now says a head is ONE line: bold lead is the
`question` if given else the `claim`, the claim runs on in plain weight, a figure's
`thought` sits under its number, a span's on the chart — never three sentences stacked.

**Held by.** `canvas.dom.test.tsx` "on the canvas, the design" (five tests); `page.dom.test.tsx`
"a laid-out board draws no relation line"; `palette.test.ts`, `accentUse.test.ts`,
`ink.test.ts` unchanged and green — each refused one shortcut on the way here.

## 2026-09-20 — P6.f: "what I'd do next" is the last thing on the page, and it may be long

**Decision.** The `next` slot is drawn under the figures, after the board and with the foot
offers, not beside the headline on the left; it keeps his line breaks; its cap is 1,400
characters (was 320, one sentence). The prompt says only "drawn last under the figures ...
at length" (1,800/1,800 words); what depth means — the steps in order, what each needs
from the person, what it touches, what to watch after — is on the slot's own `about`,
which rides on `compose`.

**Why.** The owner, 2026-09-20: *"move what i'd do next to the right side, you can be more
in depth on it, not just a few lines if needed."* The design put it on the left as one
sentence; his reading of the page is figures first, then what to do about them, and a plan
for a real decision is not a tag. Reasoning shown every time (CLAUDE.md, levels of
automation) — the plan is where the owner takes over.

**Held by.** `test_voice_contract` (budget), `test_reading_frame_contract` (the slot, its
figures rule), `keptChrome.test.ts` (`.r-next` 62ch), the frames.

## 2026-09-20 — P6.g: the canvas past reads — a draft, a watch, a memory

**Decision.** A built thing on a laid-out board opens with his claim and thought like a
step and sits unboxed; a `system` block draws every field its row carries — condition,
where, schedule, what the backtest found — and the automations reader returns those
fields for a watch beside `what/state/by`. Three local scenes stand as the proof:
`canvas-order`, `canvas-watch`, `canvas-memory`.

**Why.** The owner: *"it must be ready for everything."* The canvas had been proven on
reads only; a draft order was still a boxed form with no word of his above it, and a watch
drew "ready — not switched on" and a sentence, with its condition and schedule nowhere.

**What is not claimed.** No writer ran: the watch row is the reader's shape, not a stored
watch; the draft is the real plan read, not a sent order. A saved workflow, a page edit and
a standing question use the same shapes and have no fixture yet.

**Held by.** `canvas.dom.test.tsx` "a built thing on the canvas"; the backend suite over
`self_reader`.

## 2026-09-21 — P6.h: one page — the plan is a leaf, the left is quiet, prose is placed

**Decision.** `{"next": true}` is a leaf of the arrangement: the plan is drawn where Bob
places it, last if he does not, and on a packed board last too — one element, one place.
The left of the screen holds the headline and at most 40 words (`voice.body.max_words`,
was 90); every other paragraph of his is a `say` placed on the page beside the figure it
is about. The body gate runs after the figure-integrity sweep, so a count with no receipt
outranks a paragraph that is merely long. A `span` of one label on a dumbbell, ranked or
contributors draws his thought as a callout under that row, said once.

**Why.** The owner, 2026-09-21: *"how are we doing is really good, but the rest are just
kinda bad ... it should feel great in every scenario ... add what i would do next to the
page ... so it feels like ONE PAGE ... still too much text on the left."* A plan bolted on
after the board was a footer; a left column of ninety words was a second essay beside the
page; a thought about one row of a list had nowhere to sit but the head.

**What each page needed, and got.** Stores: callouts on the Monday, OPUS and Greenhills; a
`say` between the shops and the visit. Products: the movers as one section, the categories
whole with the long tail called out, Aji Mix called out on the ranked list, the dead list
with its head (a quiet list keeps its head; only a quiet number wears the label). What's
been down: the estate and the shops side by side, OPUS by day with the Monday called out,
the `say` that turns the page to Greenhills. Order: the twelve lines that need him, the rest
folded. Watch: the weeks as bars of change, not a flat line on 280px. Memory: the plan.

**Held by.** `test_compose_coercion_contract` (the plan placed once), `page.dom.test.tsx`
"the plan on the page" (placed, last, packed), `canvas.dom.test.tsx` "one page, on every
list" (callout under a row, the fold), `test_enumerated_remainder_contract` (integrity
outranks length), `test_voice_contract` (budget).

## 2026-09-21 — P6.i: a compose is the act of finishing; the cap refuses reads, not batches

**Decision.** The convergence cap counts and refuses READS only. A `compose`, a
`record_findings`, a write or a composite never spends the budget and is never refused
by it; when a batch past the cap mixes reads with any of those, the reads are refused and
the rest runs, all answered in one user message. A `to_date_same_elapsed` comparison on a
week or month that began today is refused, naming the closed alternative.

**Why.** The first live page (DOGFOOD_LOG, 2026-09-21 00:25): the cap ate the compose and
the owner saw the machine's board; the headline read a week twenty-five minutes old.

**Held by.** `test_convergence_cap_contract` (6), `test_comparison_contract` (began today).

## 2026-09-21 — P6.j: the page is stored, a chart measures its box, a round is not spent twice

**Decisions.** (1) The arrangement is part of the answer post: `_posts` passes it to
`_answer_payload`, and a reopened thread restores it. Without it the packing came back on
every reopen, which is what the owner saw. (2) The packed board reads its heights in the
layout pass that mounts it, never a frame later. (3) A canvas chart's coordinates are its
own measured width, so it is drawn at the size the column gives it. (4) A body over the cap
is cut at a sentence, never re-asked — a rewrite is a whole model round trip. (5) A
composes-only round that names the claim and writes nothing gets one reminder to finish,
because `rounds.settle` already says that round is the last one.

**Why.** The live turn of 2026-09-21 12:25: a page he composed, drawn as a pile, in 156 s.

**Held by.** `test_answer_post_contract` (the post carries the page), `restore.test.ts`
(reopened laid out; packed when the post carries none), `test_convergence_cap_contract`
(the reminder, once), the frames `live-page` / `live-packed`.

## 2026-09-21 — P6.k: the page is the default, not the reward

**Decision.** A board Bob composed is drawn as a page whether or not he sent an
`arrangement`. `pageOf` builds one from his own blocks: his order, two neighbours of the
same shape side by side (a number beside a number, a ranking beside a ranking), charts,
tables and lists at full width, blocks he drew and never wrote up after the page, the plan
last. Fewer than three blocks he wrote up is not a page and packs, as before. His own tree
always wins. The packing now draws only the board the machine composed — the reads he never
wrote up — and its contract tests say so.

**Why.** The owner, of a reopened thread: *"did we reach our goal?"* It drew as the
two-column packing, because the canvas was conditional on an arrangement he had to
remember to send, and on a post that had never stored one. "It should feel great in every
scenario" cannot rest on that.

**What the change exposed.** A line on the canvas lost its subject's swatch when the legend
replaced the ends line — identity on its one channel (P2S.2(e)), put back. And the relation
word: suppressed on a page HE laid out (P6.e — the placement is his statement), it is kept
on a page the room laid out, except where the point sits immediately after its own stem
and position already says it.

**Held by.** `pageOf.test.ts` (six), `identity.dom.test.tsx`, `room.dom.test.tsx` (the
packer, on the machine's board).

## 2026-09-21 — P7: the page is a document, not a board

**Decision.** The right-hand side is a document Bob writes. The `arrangement` keeps its
four layouts and gains the parts of a page: a `lede`, `head`s, `say` paragraphs, a `note`,
`{caveat: true}`, `tabs`, and on a block leaf `beside`, `size` and `control`. A sentence may
hold a figure BY REFERENCE — `{key}`, `{key.change}`, `{key.was}` — where `key` is a `figure`
block of the same composition; the page draws the row's own value with its receipt in place.
The target is `ops/ideal/the-page-bob-writes.html`.

**Why.** The owner, of the page laid out as blocks in rows: *"it feels like it has to fit
the stuff in columns and rows or a grid but an artifact/page isnt like that. it makes its
own."* A grid leaves holes wherever two neighbours differ in height, and puts every number
in a tile of its own, away from the sentence that says what it means.

**Rule 9 is untouched, and that is the design.** His words still carry no digit — a line
with one is dropped, exactly as a claim is. What lets a number into his sentence is the rule
that kept one out of his prose: he names the block, and the digits are the row's, formatted
by the same `fmt` the block uses. definition → vetted SQL → the row → the sentence.

**What counts as a block.** `max_blocks` (8) bounds what the page DRAWS as a block. A figure
named only inside a sentence, and a control carried on a figure, are parts of something else
and are bounded on their own (`composition.arrangement.refs.max_in_words`, 12). Headings have
their own bound (`max_heads`, 6) and leave `max_says` to the prose. The client agrees: a
control has no read identity (it REPLACED the chart it drives — "this is that" — the first
time a page carried one), and sentence-figures do not count against `MAX_OBJECTS`.

**UI rule 4, read for the caveat.** His caveat is drawn whole, in his ink, and BEFORE the
figures it qualifies: placed with `{caveat: true}` it is the margin note of its section on a
desk and the first thing under that section's head on a phone; unplaced it stands beside his
answer as before. The machine's notices are unchanged — above their figure, everywhere.

**UI rule 6, read for a figure in a sentence.** The page wears one date line (when it was
read, how many reads), every drawing keeps its own source line, and a figure in a sentence
says its read and its time where it is tapped.

**Case by case.** The tool says so in words ("a number that answers outright is a lede and
nothing else … a control goes only where turning it answers the person's next question"),
and the room holds its half: a figure floats only where words follow it; the balance is
judged against the words beside it (`doc.tsx` `FILL`), not pixels alone; a row of positions
becomes a dropdown where its figure is narrow.

**Not done, deliberately.** No new control argument: a store filter would ride the replay
path that exists (`surface.desk.replay.arguments.store`) and is the next control worth
adding, once a live page shows it is wanted. The default page (`pageOf`) is unchanged.

**Held by.** `tests/test_compose_coercion_contract.py` (fourteen on the grammar, the bounds
and the schema), `frontend/src/room/doc.dom.test.tsx` (twenty-two), the frames in
`verification/frames/p7-doc/`.

## 2026-09-21 — P8: one voice on the page

**Decision.** On a page Bob wrote as a document, a block carries a `claim` and nothing else.
Its `question` is never drawn — the section's head is the question. Its `thought` is never
drawn as prose — the paragraph beside it is the thought — and survives only where it POINTS:
a `span` over a stretch of a series, a callout on a row it names. Its claim is not drawn
either where the head above it or the paragraphs of its section already say it (`restated`,
the rule the caveat has used since P2S.1). The caption is 13px, the artifact's `.figh`, not
15px in the same serif as the heads.

**Why.** The owner, of the first page Bob wrote himself: *"it still doesnt look like your
artifact it still looks like a reskin."* The run record says he was right about the cause and
that it was not the grammar: he wrote heads, paragraphs, a placed caveat, rows and a figure
beside its words. What made it a reskin is that every block still talked. "Which shops carry
the fall?" in bold serif, then "Three shops fall, three hold, Rockwell climbs", then the
chart, inside a section headed "Three shops fall, three hold, Rockwell climbs". Four voices
per figure, and the page had no single one.

**And the recipe was telling him to do it.** `composition.page_first.about` still carried the
board-era instruction — "ON THE PAGE A HEAD IS ONE LINE: the bold lead is your `question` if
you give one … a figure's `thought` sits under its number" — which is a caption-the-tiles rule
inside a document. He followed it exactly. It now reads YOU ARE WRITING, NOT CAPTIONING, and
says what a page needs instead: a lede that says the answer again with its figures inside it;
two or three paragraphs a section, so a figure has words to sit beside; `**bold**` where a
paragraph opens with its finding; no `size` unless the figure needs the width.

**His emphasis reaches the page.** `Prose` runs his text through the same `unmark` his answer
goes through, so `**a finding**` is drawn in weight and the markers never appear. The room
does NOT decide which of his sentences is the finding — that would be the room writing.

**Three things his own page exposed, none of them layout.**
- His plan ran as one paragraph with the steps inside it ("Greenhills first. … Magnolia
  second. … Then the exports."), and drew as a wall of italic. `planSteps` breaks on his own
  openings where he left no blank line, and `planSteps(t).join(' ')` is still his text.
- The `span` band filled a third of the chart, which is a selection box's language; the
  bracket under it already said the same stretch. On a document the bracket points alone.
- `get_attention` returns rows measured differently — a shop by its `change`, a crossed-out
  line by what it `was`, a dead line by its `quantity_on_hand` — and each row says which on
  `measure`. The list took the first numeric field it found (the read's own `rank`, for six
  rows) and the first row's unit (so a stock count of 0 drew as "₱0"). Each row now draws the
  measure it names, in its own unit, under the `section` the read put it in. A rank is an
  ordering, not a measurement; a count is not pesos because the row above it was.

**Held by.** `frontend/src/room/doc.dom.test.tsx` (one voice, his emphasis), `plan.test.ts`
(the run-on plan, and that no word changes), `canvas.dom.test.tsx` (the list's measure, unit
and runs). The scene `doc-live` is his own turn, from the run record, and is what the room is
now measured against.

## 2026-09-21 — P10: the room is one page, and the page takes the room

**Decision, and it reverses two of the owner's own.** Asked which of the two structural
causes of *"it still feels like its trying to fill in columns not the one big page"* he
wanted fixed, he said *"ok do both"*.

1. **The page takes the room.** His side stops growing at 360px and the page takes the rest,
   capped at 900 — the artifact's `.room` (`minmax(260px, 360px) minmax(0, 1fr)`, gap 64) and
   `.page` (`max-width: 900px`). It was `29fr:47fr`, the beside design's 580:940
   (P2S.1(b)), of whatever was left after subtracting the sidebar's width **whether or not
   the sidebar was open** — so at 1440 the page had 703px. A 703px page with a figure floated
   into it leaves 36 characters a line, which is not a measure prose is read at, so the
   balance sent every figure to the full width and the page came out as bands. The
   reservation is also gone: opening the sidebar narrows the room now, where before it slid a
   composition that had always been sized for it (*"it SLIDES when the sidebar opens and
   never shrinks"*, his row 4). That property is what cost 232px of every screen.

2. **One page, not a pane.** The room scrolls as one document and his side is `position:
   sticky` beside it. The figures had their own scroller with an up and a down arrow, and his
   words another with a fade at the foot — both asked for directly: *"i dont really ever want
   to see a scroll down on the charts … maybe just up and down arrows"* and *"only charts
   area should be able to be scrolled"* (2026-09-17), then *"add a indicatior … to let people
   know they can scroll down on it"* (2026-09-18). The arrows, `arrowsFor`, `arrowStep`,
   `scrollWords` and `useMoreBelow` are gone with the panes they served. The two owner
   reports they answered are not regressed — they are answered by the layout instead, and
   their tests say so rather than being deleted.

**Why this was the room's half of the complaint.** The page he was looking at was one Bob
wrote, and most of what made it bands is what he wrote (P8's recipe change targets that, and
only a live turn tests it). But two things were the room's: a page too narrow for prose to
sit beside a figure, and a document presented as a pane inside a frame, which is the shape of
an app and not of a page.

**Four smaller things the same render exposed.**
- A `size` was honoured whether or not any words followed, so a `wide` list alone drew at 56%
  with four hundred pixels of nothing beside it. A size is what a figure leaves for the words;
  alone, a figure takes the page.
- `.r-fig-body`'s 760px cap is the packed board's rule (P3.k) and does not belong on a page,
  where the width was already chosen for that figure.
- `.r-mk` is a grid, and `columns: 2` does nothing to a grid container, so a seventeen-row
  list drew as one narrow column with half the page empty beside it.
- The pair that measures a figure against its words has `display: contents`, so the float
  belongs to the section and everything after it wraps up the left side (P9).

**Held by.** `beside.test.ts` (the widths, the formula, that nothing inside scrolls),
`layout.test.ts`, `figuresArea.dom.test.tsx`, `ownerReports.dom.test.tsx` and
`trackBack.dom.test.tsx` — each rewritten to say what the room does now and what it used to,
so the reversal is on the record where the original decision was.

## 2026-09-21 — P12: what he is told he is making is what he makes

**Decision.** The system prompt says the right of the screen is A PAGE HE WRITES, and what a
page is made of. `surface.prose.words_carry` says the PAGE carries the figures and the
reasoning, and that his words on the left are the conclusion.

**Why.** The owner, after two rounds of layout work: *"the way it answers it still doesnt know
it can generate pages."* He was reading it off the answers and he was right. The prompt still
said *"The right of the screen is your reasoning: each block you compose is a STEP — the
question it answered, your claim answering it, the figure"* and *"THE BOARD CARRIES THE
FIGURES; YOUR WORDS CARRY THE UNDERSTANDING"* — the board era, described to him as his own
output. Everything about the page lived in the `compose` tool's description, which he reads at
the moment he composes: after the reads are chosen, after the shape of the answer is settled.

**The general lesson, and it is the second time today.** P8 found the same thing one layer
down: the recipe on the tool was still telling him to caption blocks. A surface can be rebuilt
twice over and the model will keep producing the old one while the words describing it are the
old one's. When the surface changes, the sentences that tell him what he is making change with
it — and they are in three places, not one: the prompt (what he is making), the tool
description (how), and the field descriptions (what each part is).

**Within the budget.** `voice.budget.max_words` is 1,800 and the prompt was at it. The new
passage is shorter than the one it replaced because "a block carries a claim and nothing else"
went to the tool, which is what the budget rule asks for: what the prompt would teach past its
bound belongs on the tool it describes, read at the moment of choosing.

**Held by.** `test_voice_contract.test_the_prompt_says_he_writes_a_page` — that the words are
there, that the STEP sentence is not, and that the prompt names the parts a page has.

## 2026-09-21 — P13: nothing follows the plan, and a place waits for its block

**Decision.** Three rules, all out of one live turn.

1. **Nothing follows the plan.** A block he composed and did not place is still drawn — a
   figure that vanishes because an arrangement forgot it is the one failure this may not have
   — but it is drawn BEFORE what to do. P6.h made this rule and it had only ever been applied
   to a plan the ROOM placed; a plan he placed himself had the leftovers under it.
2. **A place waits for its block.** A `{"block": "key"}` naming a key not on the board is KEPT
   and drawn when the block arrives. Dropping it is right for a key that never exists and
   wrong for the one case that happens: he is told to give the page ONCE when it is settled,
   and a page given before the last compose names keys that have not arrived yet.
3. **He is told before, not after.** The coercion naming unplaced blocks arrives in the result
   of his last call, which he never reads. `composition.arrangement.about` now says EVERY
   BLOCK YOU COMPOSE GOES ON THE PAGE, and the coercion says the count rather than the names:
   one is a slip, eight is a page that forgot its figures.

**Why.** The owner, of the first page written with the new prompt: *"wtf happened here its
just all wrong"*. The run record says he wrote the best page he has written — a lede with its
figures inside it, four headings, nine paragraphs carrying his own emphasis, his caveat placed,
the plan last — and placed one of his nine figures on it. The room then drew the other eight
under the plan, so the page read as an essay with a heap of charts after the conclusion.

**And P8's plan splitter is reverted.** It looked inside a run-on plan for its steps, and on
this turn it broke his sentence in half: *"Third, and this is the one that keeps costing us: a
clean stock count. Until the negative counts are fixed…"* became a step called "a clean stock
count." Requiring a capital only moved the error — "Walk it today." opens nothing either. A
wall of text is his to fix and the tool asks him to (a blank line per step); a wrong split is
the page asserting a structure he did not write, and that is worse than long.

**Caught before it shipped.** The first cut of the leftovers read `drawFigure` as a value
above its declaration — a ReferenceError that rendered the whole page blank. The frame caught
it, and the frontend suite would have. It is a function now.

**Held by.** `test_compose_coercion_contract` (the count, and a place kept for a block not yet
composed), `plan.test.ts` (that his plan is never split where he did not split it, and that
`planSteps(t).join(' ')` is still his text), and the scene `doc-live2` — his own 17:05 turn.

## 2026-09-21 — P14: the page is enforced, not asked for

**Decision.** Four rules the system had asked for and never enforced become measurements.

1. **A disclaimer that only explains how a figure was measured is not forced into the answer.**
   `surface.desk.notices` classifies every kind as `data_may_be_wrong` (drawn, UI rule 4) or
   `explains_only` (not drawn). `notices.<kind>.must_convey` makes the loop REQUIRE the kind in
   his prose and append it verbatim if he leaves it out. **Twenty-three kinds were on both
   lists**, so the loop produced exactly the text the surface is told never to draw. His page of
   17:34 opened with 155 words of caveat whose longest clause was `comparison_incomplete`.
   `_unsurfaced` reads the classification now — one derived place, so they cannot disagree
   again — and prompt rule 3 says which kind reaches the answer. The notice still reaches the
   MODEL with its `guidance`, so nothing he needed to obey is lost.
2. **A page that leaves his own figures off it does not end the turn.** One corrective round
   naming them, then it stands (`composition.arrangement.gate`, gap `page_left_blocks_off`). It
   fires only where he wrote a page AS a page and left two or more off, so a good page never
   costs a round. Measured against his real 17:05 turn: five left off.
3. **The plan is a list of steps.** Twice the page tried to find the steps inside a paragraph
   and twice it was wrong — the second time it split one of his own sentences in half. `next`
   takes a list and stores it as the paragraphs the page already splits on.
4. **A caption is held to 0.45 against its own heading**, the date line stopped counting reads,
   and a section that ends with one figure draws it at the top of its words — text can only sit
   beside a figure that comes BEFORE it, which is why no live page had ever had any.

**Why these and not more instruction.** `agent/prose.py` had already written the lesson down
about the same class of problem: *"The 8,623-word prompt asked for it in three places and got
22%; the 1,793-word prompt asked once and got 19.5%. Words do not move it, so the loop enforces
it."* Four rounds of page instruction had gone the same way.

**The cost that came with the page, measured.** Median turn before the page existed: 37 s, 4
rounds, 2,100 output tokens. Today: 130 s, 5 rounds, 9,444. Rounds barely moved — he writes
4.5x more, and most of the extra was text the owner did not want: the mandated caveat, the same
finding four times, captions restating their headings. The fixes above are the speed work.

**Held by.** `tests/test_page_gate_contract.py` (the measure, the bound, and that the turn may
not settle past it), the rewritten `test_notice_fingerprints` and `test_page_context_contract`
(which held the reversed half and now record what replaced it), `test_reading_frame_contract`,
`doc.dom.test.tsx`.

## 2026-09-21 — P16: DeepSeek's cheap tier is the model Bob runs on

The owner ran out of Anthropic credit mid-session — *"try this deepseek api for abit ... but make
it easy to swap"* — and after it was measured against Opus on his own turns: *"go with the flash
as default."* So the DEFAULT provider in `agent/provider.py` is DeepSeek, and
`BOB_PROVIDER=anthropic` is the one variable that restores claude-opus-5 and the exact request
every number recorded before today was measured on.

**What was measured, from `george.conversations` and the published rates** (Opus at the repo's own
`ops/cost_report.py` figures, DeepSeek at its peak — the worse — half):

| | broad turn | mean of turns run | output tokens | `notice_forced` |
|---|---|---|---|---|
| claude-opus-5 | 136 s, $1.010 | 136 s | 9,732 | 8 of 197 turns (4%) |
| deepseek-chat | 229 s, $0.082 | 130 s | 48,849 | 2 of 3 |
| deepseek-v4-pro | 647 s, $0.289 | 647 s | 53,995 | 1 of 1 |

**The same wall-clock for a twenty-third of the money**, and it is 5x the output tokens but they
are cheap ones. A lookup stayed a lookup: *"how many stores do we have"* was 12 s, two calls,
$0.003.

**And the work is not worse — a blind panel preferred it 5–3.** Eight judges, four lenses
(operator voice, page design, says-it-once, trustworthiness), each run twice with the reading
order reversed for position bias, neither page naming its model. Page design was the only
unanimous lens and it went to DeepSeek. It reads wider (29 net reads to 19) and DECIDES more: it
caught that the replenishment plan's largest requests are the lines whose on-hand count is
recorded below zero — *"the engine adds the negative to the shortfall, so the biggest lines are
the worst records rather than the deepest needs… I would not ship that plan as printed"* — where
Opus had the same rows, quantified them better, and never connected them to the dispatch being
built out of them. One files a qualification; the other stops today's shipment. It also used the
`drop` op to tidy figures off its own page between composes.

**What Opus still does better, and it is one thing weighed three times.** It is the only one that
says it got something wrong — *"I had Greenhills down as busy tills with a shrinking basket. It is
the reverse"* — and all three of its panel wins lean on that move. Against it, on the same turn
Opus never mentions the shop OPUS at all while asserting *"Three shops fall; the rest are fine."*

**The known cost of the decision.** DeepSeek does not write a required notice into its own prose,
so the loop appends it under *"**Caveats** (added automatically)"* — the disclaimer block the
owner asked to be rid of on 2026-09-17 — on 2 of 3 turns against Opus's 4%. It earns more of them
by reading wider (14 required notices against Opus's 7) and then does not carry them. **The figure
to beat is 4%.** Open with it: what gets appended is raw diagnostics reaching the answer
(*"16,430 stock counts are below zero, the lowest -25,641,517"*), which UI rule 4 forbids — but it
is the designed backstop, so changing it is the owner's call and not a session's.

**`deepseek-chat` is an alias for `deepseek-v4-flash`, and pro is not the upgrade.** The API offers
exactly two models. `deepseek-v4-pro` was five times slower, six times the price of flash, and
tripped MORE of this loop's gates — `composition_rejected`, `body_over_length` twice,
`unsurfaced_notice`, `notice_forced`, and `page_left_blocks_off`, which is P14's page gate firing
on a live turn for the first time.

**Why the default is in code and not four Railway variables.** A variable that goes missing would
send Bob silently back to an Anthropic account with no credit. A missing DeepSeek key now fails
loudly and names both the variable and the way back. The cost of that choice landed immediately:
142 tests build a client and none had a key, so `tests/conftest.py` sets a key-shaped string when
the variable is absent — the tests need a constructible configuration, not a key.

**Held by.** `tests/test_provider_contract.py` — the default is DeepSeek, one variable restores
Anthropic byte for byte, an unknown provider raises rather than quietly serving another, the
ceiling only comes down, and `describe()` leaks no key even from a URL containing one.

## 2026-09-21 — a section that cannot exist is explained, not warned about

The owner, asked whether it should go: *"Ok go."*

`low_stock_not_operational` says there is no "newly low on stock" section, because the low-stock
level has never been set on any product. **No figure shown is wrong** — it explains why a section
is ABSENT, which is what `empty_section` already is. It was listed in NEITHER
`surface.desk.notices` list, so the "fail toward showing" default both DREW it and left it
`must_convey`, and it reached his answers twice on 2026-09-21 inside the appended
*"**Caveats** (added automatically)"* block he has asked three times to be rid of. A blind judge
reading the page without knowing what produced it flagged the same bullet unprompted, as
explaining a measurement rather than warning a figure was wrong.

**What did not change.** The tool still raises it, the refusal still says what it refused, and the
model still receives the message as `guidance` — so it still stops him claiming a low-stock
figure he does not have. This is what the room DRAWS and what the loop REQUIRES in his prose,
nothing more.

**Measured, on the three forced turns of that day.** Four forced notices become three: the 10:56
answer loses its 60-word low-stock bullet. The turns are still forced, on `stale_sources` twice
and `negative_on_hand` once, and both of those genuinely say a figure may be wrong — "stale" is
named in UI rule 4 as a kind that IS drawn. **So this does not fix the caveat block; it shortens
it.** What would fix it is scoping `stale_sources` to the sources an answer actually used: it
fired about `vending_aisles`, `stock_transfers` and `purchase_orders` on a question about retail
shops, which read none of them. That is the next one, and it is a bigger change than a list entry.

**Held by.** `test_a_section_that_cannot_exist_is_explained_not_warned_about`, and beside it
`test_stale_data_is_still_warned_about`, so reclassifying the one never drags staleness along.

## 2026-09-21 — P15.b is split, and the left column keeps the answer string

The owner: *"go do as much as you can … you are not stopping until we reach our goal."* So the card
was mapped before it was built — five read-only readers over the answer gates, the compose model,
the left column, the page renderer and the contracts — and the map says the card's plain reading
cannot be built in one pass without breaking the floor.

**What the plain reading would break.**

1. **Seven trust gates read one string.** The restatement, grounding, misstated-figure,
   enumerated-remainder, volunteering, tool-vocabulary-leak and notice gates all take Bob's streamed
   `answer` as their subject (`agent/loop.py` 3886, 3943, 4193, 4253, 5201 and the prose functions
   they share with `tests/evals/checks.py`). That is architecture rule 9's enforcement surface.
   Emptying the left column blinds all seven at once, and each one goes quiet without failing.
2. **The notice gate would get WORSE, not quiet.** Its input loses the prose while `pending` is
   unchanged, so it becomes a false-positive machine — pushing the appended *"(added
   automatically)"* block back up, days after it was brought down. `said_this_turn` deliberately
   refuses to read the page's `lede`/`say` (a `must_convey` fingerprint passes when any alternative
   in a group appears, so 640 words of argument prose would let a real caveat count as conveyed by
   coincidence). Widening it silences notices; not widening it forces duplicates. Neither is free.
3. **A page-only turn would store no answer post.** `ConversationLog.posts` returns early when
   `final_answer` is empty (`agent/loop.py:2782`), so there would be no thread to reply to, no
   parent for the next question and no pin target after a reload. The lede's text also still holds
   unresolved `{key}` references, so it cannot simply become `final_answer`.
4. **The room would go blank for most of a turn.** `<Reading part="claim">` is the only child of
   `.r-words` with no `busy` gate, so it is the one thing on screen carrying his words for the
   47–85 s a compose takes; the page is gated on `!busy` because mid-turn the blocks have not
   landed.
5. **`voice.body.max_words: 40` is the only TOTAL bound on his prose.** The page's leaves are
   bounded individually and never summed, so deleting it without a replacement removes the volume
   cap the card exists to deliver.
6. **Three more that look removable and are not:** the flat `blocks` list is how a key survives a
   turn (so "this is that" and change-by-key ride on it); `default: true` blocks are the machine's
   board and deliberately not his to place, so "a figure not on the page cannot exist" has to be
   scoped to HIS figures; and "give the page once, settled" collides with "compose as you go", which
   cannot both be true of a board derived from the page.

**So the card is split, and the half that needs no decision shipped today.** P15.b's Done-when is
two claims. *"Nothing on screen repeats the headline"* is now true and enforced: where the page's
opening sentence restates the headline, the headline is not drawn and the page keeps it, because the
card says the opening sentence IS the answer. The notices and his caveat stay exactly where they
are — UI rule 4 puts them above the figures and this was never about them.

**The bar is measured, not chosen** (`beside.HEADLINE_RESTATED_AT = 0.45`). On his two live turns of
2026-09-21: DeepSeek's headline against its lede shares about 0.57 — the same finding in nearly the
same words, and at the 0.6 a sentence of prose needs it would have drawn twice. Opus's headline is a
reversal about one shop and its lede is the estate's week; they share far less and BOTH STAY DRAWN.
Suppression is for a repeat, never for a second thing said. It never fires while he is working, and
never when there is no page — a refusal, a one-figure lookup and a conversational turn are carried
entirely by that column.

**What is still open, and it is a decision rather than a task:** whether the streamed `answer`
survives at all, and if it does not, what becomes the subject of those seven gates. That belongs
here, answered, before the second half is built.

**Held by.** `headlineOnPage.test.ts` (both directions, from the two real turns) and the new block in
`Reading.dom.test.tsx` (the headline goes, the notices do not).

## 2026-09-21 — why a broad answer takes minutes, and the plan that follows

The owner: *"its still taking too long on answers … did the page update really make that big of a
differenece or are we just doing it wrong?"* — and then, *"can you search instead whats the most
optimal way to get to our goal?"* Measured from `george.conversations`, then researched (three
read-only agents: generative UI, reasoning-model latency, and a judgement-vs-mechanical map of the
page code).

**It was not the page.** Every broad Opus answer, in order: ~30 s on Sept 14–16 (4 reads, ~2,000
output tokens, no round over 23 s); **~125 s from Sept 18** (still 7 reads, but 4× the tokens and one
round of 65 s); the page arrived on the 21st. The window is 09-17 14:43 → 09-18 06:06, and in it
`c6226ee` (a thought on every chart, asks under the headline) and `eeb7c7d` (six chart types become
seventeen, with a rule for each). The compose tool: **11,705 → 15,028 → 27,413 chars; 11 → 15 → 19
block fields** — with no bound, while the system prompt is held to 1,800 words by a test.

**On DeepSeek, 75–91% of everything generated is thinking** (one turn: 148k chars of thinking, 18k
for the whole page, 662 for his prose). It decodes at roughly 1,000 chars/s, so thinking is most of
the wall-clock. The single page-building round is a median 59 s of a 130 s turn.

**What did not work, and why each result reads as it does:**
- *Effort.* On one prompt it scales cleanly (high 8.9 s → low 3.8 s). In the loop the first reading
  was noise, and it was corrected by the research: **DeepSeek has no `medium`** (it maps to high),
  so "medium 325 s vs high 211 s" was two runs of one setting. Re-read that way, top-level `low`
  averaged **~152 s against ~241 s at high, with half the thinking and 3/3 good pages** — a lean
  from three runs, not proof. And the loop lowers effort per turn only through a per-message
  marker that DeepSeek's compatibility layer does not document, so **in production DeepSeek very
  likely thinks at full strength on every question.**
- *Thinking off.* 24–42 s, and wrong: one answer said the estate was "flat" when it fell 4.5%.
  Thinking is load-bearing.
- *Trimming the compose schema* (`spec`, `question`, `thought` removed for a test). Two of three
  runs produced no page at all. Not shipped.

**What the research changed.** Output and rounds are the levers, not input (OpenAI: halving output
roughly halves latency; halving the prompt saves 1–5%, and ours is cached). A correction returned in
a tool result still costs a round; only a code repair, or a format where the mistake cannot be made,
is free. And the page is repeated work: the data syncs nightly and he asked the broad question seven
times that day against identical data.

**The plan, agreed by the owner** (NOW.md P17.0, P17.a, P17.b, and P3.b):
1. **P17.a — `get_overview`:** one composite read, the Tableau Pulse pattern — code finds the facts
   and writes each as one line with its row and receipts, and he reasons over those.
2. **P3.b — the morning page,** answered at the owner's slot (born off, rule 7) and reused until the
   data changes.
3. **P17.b — sections:** he writes the findings; code derives kind, size, pairing and caveat
   placement into the same arrangement the renderer draws.
4. **P17.0 — the cheap fixes:** DeepSeek effort top-level; delete the self-contradicting text asking
   for undrawn fields; the span that is always thrown away; settle a round on a page that carries
   its answer.

**Estimated, not measured:** a fresh broad question ~40–70 s; the morning and a same-day repeat ~0 s.
The one open decision is the owner's: whether code may place an unsurfaced notice itself, saving the
"rewrite your whole answer" round, which today is his deliberate trade (`agent/loop.py` 3859-3867).

## 2026-09-22 — back to the base: Bob, ready for anything

The owner, after the answer-page work of 09-18..21: *"we focused too much on the page for the answers
to 'how are doing' … thats just kinda of a chat with pages but our original goal for bob was ready
for anything … we strayed too much its time to go back."* He asked for a test of everything he had
said he wanted; then, offered the design choices, *"im not an expert you tell me"* — so the session
decided, per NOW.md §1 (the owner reports what is wrong; the session decides the fix and says why).

**The capability test.** Every save, automation, build and approval in STANDARD.md §9 and §11–§15, in
his own phrases, through the same wiring the web route uses (the eight writers, recall, beliefs, page
references), as the user `bob-capability-test`: 21 turns, $0.76, median 108 s a turn. Works: "make
this a page", "watch this", "check this every morning", "tell me if sales drop more than usual".
Half: "build it" (every change adds a tile rather than changing the thing), "turn this into a
workflow" (a Monday schedule is refused — nowhere to deliver), "remember that…" (right, but 108 s),
"I want this every Monday" (moved the watch, not the report). Fails or absent: **"keep this"** (pins
nothing), **authority thresholds**, **manager requests and approvals**, **the AJI BARN reorder**.
Nothing it created was switched on, scheduled or promoted — rule 7 held everywhere. It ran the
owner's "PO Maker" workflow twice (as the test user), which a cleanup keyed only on the test user's
own workflows would have missed; every one of the 47 rows it made was removed and the counts
returned exactly to their starting values.

**Decided, and what each reverses:**
1. **The answer is the size of the question**, bound by the existing scope kinds (lookup / focused /
   broad) and ENFORCED, with a page OFFERED on a narrow question rather than made. Reverses the
   P12/P14 recipe that every answer is a page. Evidence: his own record (small questions 10–25 s when
   they stay small, 150 s inflated) and the research (unprompted extras lower use; the products that
   are trusted keep proactive output small and steerable).
2. **Checks fix; they do not argue.** An unsurfaced notice is placed by code beside the figure it
   qualifies, in its reader's words, and the "rewrite the full answer" round goes. **Reverses the
   owner's own earlier trade** (`agent/loop.py` 3859–3867, that the caveat be said in Bob's words),
   now at his word. The guarantee is kept and made stronger: the notice is always shown, never
   negotiable, and never lost to a model that did not carry it. What goes is the round in which a
   model writes to the gate — the dashboard turn's headline was the gate's own words.
3. **Authority decides what reaches the owner, not what Bob does alone.** Action stays at level five
   (CLAUDE.md, levels of automation): a threshold routes drafts to a list instead of an
   interruption; nothing leaves Bob without a person's yes. A card that would raise a level is
   recorded here first, with its test, before it is built.
4. **The base before the features:** the actions, the checks and the context are fixed before any
   new capability is added on them.

**Features the owner chose from the market research** (ranked list in the session record): stock
running out per shop, warehouse-to-shop transfers, "what caused most of it" insights, dismiss with a
reason, and photographed delivery receipts. Declined for now: delivery through Messenger, and a
payday/holiday calendar.

**The plan:** NOW.md §3, cards B1–B13 in four phases; the page-speed cards of 09-21 are folded into
B1, B2, B4, B6 and B12.

## 2026-09-22 — the rules that were about Opus's price

The owner, of the planning rules still binding this plan: *"what other things from the old way of
planning are getting in our way? you can kinda forget them like if it says no eval tests we can have
them now cause we using deepseek and its cheaper."*

**What was found, and what it had been doing:**
1. **The eval tooling was still Anthropic's.** `tests/evals/harness.py` skipped without
   `ANTHROPIC_API_KEY` and priced every turn at Opus's rates; `ops/verify_integration.py model`
   required that key; the judge read only it; `ops/cost_report.py` priced every recorded turn at
   Opus's rates. On DeepSeek the suite would have skipped every case, and any cost read ~20x high —
   the reading that made "no live tests" a rule in the first place. All four now read
   `agent/provider.py` (`key_var()`, `rates()`); DeepSeek's rates are its published peak half,
   re-read 2026-09-22. `cost_report.py` reports one provider's turns at a time, split by `model`.
   Held by `test_every_provider_is_priced_so_an_eval_reports_what_it_spent`.
2. **"No per-card test runs; live evals only at the phase close"** (2026-09-18, when a full run was
   $4.79). Reversed: each card agent runs its own eval cases live, and the lead runs the whole suite
   every wave. The plan's cost constants were re-based on DeepSeek's measured $0.036 a turn (the
   capability test: $0.76 for 21 turns) — a card's cases $0.15, the full suite $0.51.
3. **"Read a recorded eval, never re-run it."** Reversed for cost; kept for the part that was never
   about cost — a run is never killed part-way.
4. **Three runs to measure.** Now five: the same question has taken 90–325 s on DeepSeek.
5. **The UI freeze of 2026-09-18.** Lifted for this plan; W1.1, W1.4 and W2.4 need it.
6. **"Never push without the owner saying so in that session"** left four finished commits unpushed.
   The rule stands and the wave prompt now carries the yes: *"… and push when every suite is
   green."* A red suite is never pushed.
7. **The 1,800-word prompt budget "has no room."** The budget stays as a guard; W1.1 owns
   `SYSTEM_PROMPT` and frees room by deleting the board-era text its own decision retires.
8. **Tests that hold a decision reversed today** (the page gate, the caveat in his words, scope
   owned by the thread) are rewritten by the card that reverses them and named in its return —
   not obeyed, and not deleted silently.
9. **Not reversed, flagged:** there is still no way to rehearse a migration. A card that adds one
   runs `alembic upgrade head --sql` offline, the lead reads it before the push, and the health
   check is the proof.
10. **Clarified:** rules 5 and 9 — no planner, no sub-agents — are about Bob's loop. The agents a
    wave runs are how the work is done and never appear in Bob.

Parallel agents share `george_ro`'s cap of 15 connections with production, so an agent's live runs
set `GEORGE_MAX_CONNECTIONS=2`, and `captest.py`, which writes to live tables as one shared test
user, stays the lead's.

## 2026-09-22 — wave 1, the base: what each card decided, and what it measured

Run as one workflow, one agent per card in its own worktree, merged onto `main` in the order
W1.1, W1.2, W1.3, W1.5, W1.4 with every suite after each merge. One conflict (the eval
harness's `run_turn` signature: W1.2's `**injected` against W1.4's `page_context`), resolved by
keeping both.

**W1.1 — the answer is the size of the question, and checks fix instead of argue.**
1. The size ceiling is read by code from the effort table's own kind
   (`composition.size.ceiling_by_effort_kind`): broad → broad, remember → remember, fresh →
   LOOKUP, everything else focused. A deterministic bound, not a planner (rule 5). Fresh → lookup
   bought the fact target: 25 s at a focused ceiling, 6 s at lookup.
2. Bob declares `size` on compose, at or under the ceiling; above it he is brought down.
   Bounds: remember 0 figures / 0 queries / 30 words; lookup 1 / 4 / 40; focused 3 / 12 / 70 plus
   the "Make it a full page" offer; broad the page's own bounds / 30 queries.
3. The read budget counts QUERIES run (set members counted, duplicates not); a batch that would
   cross it is refused before it runs, except a turn's first. The 12-call cap stands on top.
4. A figure refused for size or a count no longer holds the round; truth refusals still do.
5. The notice gate buys no round and appends nothing (`notices.max_corrective_turns: 0`,
   `_forced_caveats` deleted); the room already draws every notice that says a figure may be
   wrong. The page gate's `max_corrective_turns` is 0. Both still log their gap.
6. After a correction or a refused compose, a reply that does not say the claim is replaced by the
   claim; a round settles when a compose names the claim and opens with a lede.
7. DeepSeek's effort goes top-level (`effort.top_level`), no marker; Anthropic keeps the marker.
8. The rest of the card: "below zero" in the negative-on-hand fingerprints, a notice listed once,
   a page resolves only against its own turn's blocks, `get_stock group_by state` sums no
   negative on-hand and draws states as words, the plan list bounded at four steps, the
   single-store `previous_period` comparison no longer refused.

**W1.2 — the action words are enforced, not instructed** (`action_words:` in the yaml).
`record_belief` refuses a data-grounded view for "keep this…" and "what do you remember…";
`set_watch` refuses "…every Monday / every morning" unless the question names a watch;
`create_page` refuses "build it / set up a…" unless it says page or dashboard. Each refusal names
the tool the words mean; nothing forces a write. A workflow schedule is delivered to the room
(`workflows.schedule.delivery: [room, telegram]`) and is still born off. The same rule saved again
is the same version. `edit_page` gained a `change` operation that replaces a pin's calls where it
stands (audited as `change`); an `add` of the same subject is refused and names the change. Reads
asked as one call are kept as the reads they ran as. A day with no time takes 07:00.

**W1.3 — `get_overview`.** Fourteen existing reads run in code, four at a time, returned as ranked
findings of uniform shape, each one line of fact written by code with its receipts in
`meta.parts`. **A concentration finding is a code-computed fact decided by the yaml
(`overview.concentration`: more than half of the estate's change → carried_most / carried_all /
spread), not an attribution share**; rule 10 still binds his prose, and the eval excuses "most of
the fall" only when a read returned such a row. The lead, after the merge, pointed
`investigation.scope.kinds.broad.reads` at it (the agent measured one read in 3 of 3 with that
line) and injected the decisions reader into it as into `get_attention`.

**W1.4 — the conversation follows the page. Reverses 2026-09-08 "scope belongs to the thread"
(line ~1692).** A question asked from a different page than the open thread starts a new thread
there, with nothing carried over; from the same page it continues; from no page (the room's own
composer, an @mention) it keeps the thread and its scope (`pageScope.ts` `askPlan`). One ask line
is mounted above both chromes and answers in place; a screen registers what it is and shows,
never a figure (a subject that looks like one is refused by the route).

**W1.5 — stock cover.** The window is `replenishment.review_period_days` (7) and the speed
`purchasing.plan.demand.lookback_days` (90), so no number was invented. What is left is the newest
`inventory_snapshots` count. Only a line with a level set fires; the level is the draft's target;
a shop gives only what is above max(level, speed × window). `get_replenishment` no longer refuses
AJI BARN, whose counts carry the new `warehouse_count_not_a_shelf_count` notice.
`attention.cannot_notice.cover` is removed: cover is now noticed per shop.

**The evals, first run on DeepSeek.** 50 cases: 20 passed, 26 failed, 3 skipped, 1 xfailed
(37 min, 57 turns, $0.70). Every failing case was run again on the pre-wave commit `6e19473`:
the investigation cases' call caps (written for Opus; `executed_calls` 10–18 against 8),
all seven page-workshop cases, the morning, `analyze`, and the lookup-read case fail there too —
the baseline, not a regression. Three cases passed before and failed after: `gate_1` failed an honest
answer whose grounded figures sat in the caveat, so the voice checks now read every slot the room
draws (and catch an invented figure there too); `no_rows_is_said_as_no_sales` passed on a re-run
(one draw of three), and `thread_3_correction` passed on two re-runs. The kept-page date filter (W1.4) fails because `edit_page` has no operation
that adds a date filter.

**Found, not fixed:** told "you don't need my approval under ₱20,000", Bob said *"I key orders
under his line myself"* — an action he cannot take, said in the third person. W2.2's.

## 2026-09-22 — the overview is drawable, and the broad answer's time is in the writing

After wave 1, at the owner's "ok go". `get_overview` returned one read of mixed findings that no
chart can draw, so four broad turns in five re-read its parts to chart them. It is now a call
asked as one (`agent/one_call.py`, like `get_change`): the findings read, renamed
`get_overview_findings` (registered, pinnable, a backtest classification and the injected
decisions reader move with it), plus the parts `overview.drawn` names — the findings read's own
calls from `overview.reads`, never a second list — each an ordinary drawable read.

**Measured, five broad runs:** median 136.0 s (129–159) against 148.8 s before; no part re-read
for a chart. Per round: reads ~11 s, drill-downs into a flagged shop (`get_change`, 4 of 5 runs)
19–46 s, and **the writing round 84–117 s in every run**. One read and two rounds held in 1 of 5.
The broad target is now the writing round's, not the reads'. (The same run re-measured the fact
question at 6.8 s median and the narrow one at 32.1 s, inside 20–40 — against 53.9 s in the
wave's own set, so the narrow figure is not settled.)

## 2026-09-22 — wave 1 completed: what closed each miss

The owner, when wave 1 closed with three targets missed: *"We don't stop until its fully
completed."* Four changes, each measured live (five runs a question) and live at `ec1a18d`.

1. **A question of a size is answered by one call, then composed**
   (`composition.size.kinds.<size>.answered_by`: broad `get_overview`, focused `get_change`).
   Once it has run, code refuses any further read with `composition.size.answered_refused`; the
   drill-down is the next step he offers. Measured before: 4 of 5 broad turns drilled into a
   flagged shop (19–46 s); every narrow run that read past `get_change` took 41–95 s. A forced
   `tool_choice` was tried first and refused: DeepSeek rejects a named tool with thinking on, and
   thinking off breaks the answer (DECISIONS 2026-09-21).
2. **A round that names its claim settles on it**, with or without words beside it; the claim is
   his words and code puts it where the answer goes (`rounds.settle`). This reverses the P6.j
   reminder round ("write the answer NOW") — three tests held it and were rewritten. And `size`
   left `composition.refused_fields`: W1.1 gave compose its own `size`, and a block carrying it
   is that word misplaced, dropped like any unknown field.
3. **A condition to watch is its own effort kind, `automate`** ("tell me if", "let me know
   when", "alert me", …), level high and told no size. At the close, "Tell me if any shop's
   sales drop more than they usually do" had become `fresh` → a LOOKUP and was answered as one
   fact, not set up as a watch — found by the capability test, fixed, re-run: watch created and
   backtested.
4. **A kept page carries its own date window** (W1.4; migration `a2b3c4d5e6f7`, nullable
   `george.pages.date_window` JSONB with an is-object check). `edit_page` gained `set_window` and
   `remove_window`, audited in `page_events`. The window is substituted into each pin's own
   stored call on the server — the stored calls are never rewritten — so every figure is still
   the pin's own read; a read that takes no date range says so (from the yaml). With the filter
   on and nothing picked, each analysis reads what it was kept with. Options are
   `sales_day.presets`, via `pages.window.options_from`.

**Measured at the close:** fact 6.5 s; narrow 35.8 s median (32.7 s over ten, 8 of 10 inside
20–40; the misses are one long thinking round, not reads); broad one read and two rounds in 5 of
5, 111.2 s median; date filter 6 of 6; capability test median 13.0 s. Evals 27 passed / 19
failed, every failure also failing (or failing at the same rate) on `6e19473`. The broad answer's
remaining time is the writing round (80–124 s), which W2.4 inherits.
