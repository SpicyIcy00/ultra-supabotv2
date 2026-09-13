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

*Nothing open.*

---

## Fixed

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
