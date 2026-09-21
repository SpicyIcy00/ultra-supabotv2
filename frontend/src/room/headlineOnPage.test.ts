/**
 * NOTHING ON SCREEN REPEATS THE HEADLINE (P15.b's first half, 2026-09-21).
 *
 * Two places own the answer: the left column's headline and the page's opening
 * sentence. The owner, of his own live pages: *"theres alot of text i think alot
 * of it is useless"*, and the card's own Done-when is "nothing on screen repeats
 * the headline".
 *
 * WHY THIS AND NOT THE WHOLE CARD. A read-only map of P15.b (five areas, 2026-09-21)
 * found that emptying the left column blinds SEVEN trust gates at once — the
 * restatement, grounding, misstated-figure, enumerated-remainder, volunteering,
 * tool-leak and notice gates all read that one `answer` string, which is
 * architecture rule 9's enforcement surface — and that `loop.py`'s
 * `ConversationLog.posts` returns early on an empty answer, so a page-only turn
 * would store no answer post at all: no thread to reply to, no pin target after a
 * reload. It also found that the headline is the ONLY thing on screen while the
 * 47-85 s compose runs, so deleting it leaves the room blank for most of a turn.
 *
 * So the duplication goes now and the structure waits for those decisions. The
 * page wins, because the card says the opening sentence IS the answer.
 *
 * THE BAR IS MEASURED, not chosen: see `beside.HEADLINE_RESTATED_AT`.
 */
import { describe, expect, it } from 'vitest';
import { HEADLINE_RESTATED_AT, claimAndStanding, restated, unmark } from './beside';
import { ledeOf } from './board';
import type { Arrangement } from '../types/bob';

/** Exactly what Room computes, so the test and the room cannot drift. */
function headlineOnPage(text: string, claim: string | undefined,
                        tree: Arrangement | null, busy = false): boolean {
  if (busy) return false;
  const lede = ledeOf(tree);
  if (!lede) return false;
  const said = claimAndStanding(unmark((text ?? '').trim()).plain, claim).claimRaw;
  return Boolean(said) && restated(said, [lede], HEADLINE_RESTATED_AT);
}

const page = (lede: string): Arrangement => ({
  layout: 'stack',
  children: [{ lede }, { head: 'The shops' }, { block: 'shops' }],
}) as Arrangement;

// His two real turns of 2026-09-21, from george.conversations.
const DEEPSEEK = {
  text: 'Fewer transactions, not smaller baskets — and Greenhills is the shop that fell hardest. '
    + 'Greenhills lost traffic with its basket untouched; Magnolia lost basket value with its '
    + 'traffic nearly level.',
  claim: 'Fewer transactions, not smaller baskets',
  lede: 'Seven shops took {estate} for the week, {estate.change} on the week before — and the '
    + 'fall is fewer transactions, not smaller baskets.',
};
const OPUS = {
  text: '**Greenhills is losing transactions, not basket — the reverse of what I had.** The estate '
    + 'is down 4.5% on the closed week, all of it fewer transactions; Greenhills carries the '
    + 'largest fall, Magnolia falls on basket instead, and Rockwell, North Edsa and Fairview hold.',
  claim: 'Greenhills is losing transactions, not basket',
  lede: 'The shops finished the closed week at {est}, {est.change} on the week before, and every '
    + 'peso of it is fewer transactions — {txn.change} — with the average basket unmoved.',
};

describe('the headline the page already said', () => {
  it('is not drawn twice when the lede says it again', () => {
    expect(headlineOnPage(DEEPSEEK.text, DEEPSEEK.claim, page(DEEPSEEK.lede))).toBe(true);
  });

  it('stays when the lede says something else', () => {
    // Opus's lede is the estate's week; its headline is a reversal about one
    // shop. Two things said, not one thing repeated.
    expect(headlineOnPage(OPUS.text, OPUS.claim, page(OPUS.lede))).toBe(false);
  });

  it('stays while he is still working, because it is all there is on screen', () => {
    // Mid-turn the page is not drawn at all; suppressing this too would leave
    // the room blank for the 47-85 s a compose takes.
    expect(headlineOnPage(DEEPSEEK.text, DEEPSEEK.claim, page(DEEPSEEK.lede), true)).toBe(false);
  });

  it('stays when there is no page at all', () => {
    // A refusal, a one-figure lookup and a conversational turn have no
    // arrangement, and `pageOf` declines below three written-up blocks. Those
    // turns are carried entirely by this column.
    expect(headlineOnPage(DEEPSEEK.text, DEEPSEEK.claim, null)).toBe(false);
    const noLede = { layout: 'stack', children: [{ block: 'shops' }] } as Arrangement;
    expect(headlineOnPage(DEEPSEEK.text, DEEPSEEK.claim, noLede)).toBe(false);
  });

  it('stays when he said nothing, rather than reporting an absence', () => {
    expect(headlineOnPage('', undefined, page(DEEPSEEK.lede))).toBe(false);
  });
});

describe('the page opening sentence itself', () => {
  it('is found wherever on the page it sits', () => {
    expect(ledeOf(page('We took less.'))).toBe('We took less.');
    expect(ledeOf({
      layout: 'stack',
      children: [{ layout: 'row', children: [{ lede: 'Nested.' }] }],
    } as Arrangement)).toBe('Nested.');
  });

  it('is the FIRST one, and nothing when there is none', () => {
    expect(ledeOf({
      layout: 'stack', children: [{ lede: 'First.' }, { lede: 'Second.' }],
    } as Arrangement)).toBe('First.');
    expect(ledeOf(null)).toBe('');
    expect(ledeOf({ layout: 'stack', children: [] } as Arrangement)).toBe('');
    expect(ledeOf({ head: 'Just a heading' } as Arrangement)).toBe('');
  });
});
