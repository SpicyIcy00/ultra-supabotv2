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

---

## Fixed

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
