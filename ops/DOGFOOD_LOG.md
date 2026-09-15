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

**Nothing.**

---

## Fixed

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

`frontend/src/room/keptChrome.test.ts`, 25 cases — and every new assertion was
checked by reintroducing its own defect, six for six.


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
