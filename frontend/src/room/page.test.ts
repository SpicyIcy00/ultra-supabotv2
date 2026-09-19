/**
 * THE PAGE IS HIS ANSWER, held on the answer that made the case.
 *
 * This is the owner's own turn of 2026-09-19 18:36, *"whats been down?"* —
 * the text exactly as Bob wrote it. Read on its own it is a path: shops, then
 * products, then the one thing the week hides, then the caveats. The room drew
 * it as a lead chart, a pile of orphans on the left (*"The other four were
 * up."* — the other four what?) and charts in his COMPOSE order, which ran
 * shops → Greenhills → Fairview → products while this runs shops → products →
 * Fairview. The owner, of the result: *"this doesn't feel like a page with a
 * well thought out path."* The path was here the whole time.
 *
 * The reads are cut down to the numbers the text cites — enough for the same
 * matcher the superscripts use to say which read a paragraph rests on.
 */
import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../types/bob';
import { focusFor, namedIn, pageOf, sectionFor } from './page';

const ANSWER = `Down is **three shops and a handful of named products, and they are separate stories.**

Shops, on the closed week 7–13 Sep: OPUS −₱88,045 (−15.9%), Greenhills −₱16,026 (−5.4%), North Edsa −₱4,901 (−2.8%). The other four were up. OPUS I would still leave alone — it lost both transactions (−9.8%) and basket (−6.8%), but the gap sits on the exceptional Monday in the comparison week, not on the weekend that carries the shop. Greenhills is the real one: 16 more transactions than the week before and ₱33 less in each basket, which is the whole of its fall and the one thing on the estate I cannot yet explain.

Products: bayberry −₱30,049 (−76.3%) is bigger than the next two together, mango −₱12,139, cuttlefish −₱11,186 down to almost nothing. Same conclusion as yesterday — those are empty shelves, not lost appetite.

And one thing the week hides: Fairview was up 2.4% across it, but yesterday, 18 Sep, it took ₱9,631 against ₱22,981 on the same weekday a week earlier — the steepest single day on the estate. That is the newest fall here, and one day is still one day.

**Caveats:** two windows above — the shops and products are 7–13 Sep against 31 Aug–6 Sep; Fairview's fall is yesterday against the same weekday a week earlier. Nothing has a low-stock level set anywhere, so a line only becomes visible the day it hits zero.

I'd leave OPUS alone and look at what came off the Greenhills shelf — shall I pull that?`;

const CLAIM = 'three shops and a handful of named products, and they are separate stories';
const NEXT = "I'd leave OPUS alone and look at what came off the Greenhills shelf — shall I pull that?";

function read(seq: number, rows: Record<string, unknown>[]): ToolCall {
  return { seq, tool: 'get_sales', arguments: {}, result: { rows, meta: {} } } as unknown as ToolCall;
}

const CALLS: ToolCall[] = [
  read(1, [{ store: 'Fairview', value: 9631, baseline: 22981 }]),
  read(2, [{ store: 'OPUS', change: -88045, change_pct: -15.9 },
           { store: 'Greenhills', change: -16026, change_pct: -5.4 },
           { store: 'North Edsa', change: -4901, change_pct: -2.8 }]),
  read(3, [{ store: 'OPUS', value: 999, change_pct: -9.8 }, { store: 'Greenhills', value: 693 },
           { store: 'Shangri-La', value: 525 }, { store: 'Magnolia', value: 490 },
           { store: 'Rockwell', value: 359 }]),
  read(4, [{ store: 'OPUS', value: 467.57, change_pct: -6.8 },
           { store: 'Greenhills', value: 401.54, change: -33.16 },
           { store: 'Shangri-La', value: 424.15 }, { store: 'Magnolia', value: 426.53 },
           { store: 'Rockwell', value: 576.04 }]),
  read(5, [{ product: 'bayberry', change: -30049, change_pct: -76.3 },
           { product: 'mango', change: -12139 }, { product: 'cuttlefish', change: -11186 }]),
];

describe('his answer, as the page', () => {
  const page = pageOf(ANSWER, CLAIM, NEXT, CALLS);

  /**
   * ONE THOUGHT, THEN THE NEXT. The shops paragraph is two: the overview of all
   * seven, and then what he makes of OPUS and Greenhills — which rests on two
   * other reads. It splits exactly there, and nowhere else.
   */
  it('is his thoughts, in his order', () => {
    expect(page.map((s) => s.para.split(/[ :,]/)[0].replace(/\*/g, '')))
      .toEqual(['Shops', 'OPUS', 'Products', 'And', 'Caveats']);
  });

  it('keeps a sentence that cites nothing with the thought it follows', () => {
    expect(page[0].para.endsWith('The other four were up.')).toBe(true);
    expect(page[1].para).toContain('Greenhills is the real one');
  });

  it('knows which beats open one of his paragraphs', () => {
    expect(page.map((s) => s.opens)).toEqual([true, false, true, true, true]);
  });

  it('leaves out the headline, which is drawn as the headline', () => {
    expect(page.some((s) => s.para.includes('separate stories'))).toBe(false);
  });

  it('leaves out what he would do next, which is drawn under him', () => {
    expect(page.some((s) => s.para.includes('shall I pull that'))).toBe(false);
  });

  it('keeps every other sentence he wrote — nothing is an orphan, nothing is dropped', () => {
    const drawn = page.map((s) => s.para).join(' ');
    for (const said of ['The other four were up.',
      'OPUS I would still leave alone',
      'Greenhills is the real one',
      'Same conclusion as yesterday — those are empty shelves, not lost appetite.',
      'one day is still one day',
      'Nothing has a low-stock level set anywhere']) {
      expect(drawn, said).toContain(said);
    }
  });

  it('keeps his own emphasis, and adds none', () => {
    expect(page[4].para.startsWith('**Caveats:**')).toBe(true);
    expect(page[0].para).not.toContain('**');
  });

  it('knows which reads each thought rests on, in the order he cites them', () => {
    expect(page[0].seqs).toEqual([2]);         // the shops, over the week
    expect(page[1].seqs).toEqual([3, 4]);      // OPUS and Greenhills: transactions, then basket
    expect(page[2].seqs).toEqual([5]);         // products
    expect(page[3].seqs).toEqual([1]);         // the one thing the week hides
    expect(page[4].seqs).toEqual([]);          // a caveat cites nothing, and is still on the path
  });

  it('puts a figure with the paragraph that is ABOUT its read', () => {
    const at = (seq: number) => sectionFor(page, CALLS.find((c) => c.seq === seq));
    expect(at(2)).toBe(0);
    expect(at(3)).toBe(1);
    expect(at(4)).toBe(1);
    expect(at(5)).toBe(2);
    expect(at(1)).toBe(3);
    expect(sectionFor(page, read(99, [{ value: 123456 }]))).toBe(-1);   // read, never talked about
    expect(sectionFor(page, undefined)).toBe(-1);
  });

  /**
   * TWO READS OFTEN HOLD THE SAME NUMBER. The attention read holds Fairview's
   * day as well as the read he drew it from; "first read that holds it" — right
   * for a superscript — would send his own figure to the foot of the page.
   */
  it('is not fooled by an earlier read that happens to hold the same figure', () => {
    const attention = read(0, [{ subject: 'Fairview', value: 9631, baseline: 22981 }]);
    const calls = [attention, ...CALLS];
    const paged = pageOf(ANSWER, CLAIM, NEXT, calls);
    expect(sectionFor(paged, CALLS[0])).toBe(3);   // his Fairview read still belongs there
  });

  it('is not pulled into a paragraph by one coincidental number', () => {
    // A products read that happens to hold 5.4 — Greenhills' fall in the shops paragraph.
    const products = read(5, [{ product: 'bayberry', change: -30049, change_pct: -76.3 },
      { product: 'mango', change: -12139 }, { product: 'x', change_pct: 5.4 }]);
    expect(sectionFor(page, products)).toBe(2);
  });
});

/**
 * EVIDENCE SHOWS WHAT THE THOUGHT NAMES.
 *
 * Twenty-one rows were on screen — three charts of seven shops — to say that
 * OPUS fell most and Greenhills' basket shrank. Under "OPUS I would leave alone
 * … Greenhills is the real one" the evidence is OPUS's row and Greenhills' row,
 * and the other five are one tap away.
 */
describe('which rows a thought names', () => {
  const page = pageOf(ANSWER, CLAIM, NEXT, CALLS);
  const call = (seq: number) => CALLS.find((c) => c.seq === seq);

  it('finds a row by its own label in his sentence', () => {
    expect(namedIn(page[1], call(3))).toEqual(['OPUS', 'Greenhills']);
    expect(namedIn(page[0], call(2))).toEqual(['OPUS', 'Greenhills', 'North Edsa']);
  });

  it('finds "bayberry" in a row called something longer — and never by a word every row shares', () => {
    const products = read(5, [{ product: 'aji champoy honey bayberry', change: -30049 },
      { product: 'Aji Mango', change: -12139 }, { product: 'Aji Cuttlefish Japanese', change: -11186 },
      { product: 'Aji Mix', change: -1 }]);
    expect(namedIn(page[2], products))
      .toEqual(['aji champoy honey bayberry', 'Aji Mango', 'Aji Cuttlefish Japanese']);
    // "aji" is in all four labels and names none of them; "Aji Mix" is not in his words.
  });

  it('focuses a figure on one or two named rows', () => {
    expect(focusFor(page[1], call(3))).toEqual(['OPUS', 'Greenhills']);
    expect(focusFor(page[1], call(4))).toEqual(['OPUS', 'Greenhills']);
  });

  it('leaves an overview whole — three names is everyone, and all stores still matter', () => {
    expect(focusFor(page[0], call(2))).toBeNull();
  });

  it('leaves a figure whole when the thought names none of its rows', () => {
    expect(focusFor(page[4], call(2))).toBeNull();
  });

  it('never folds a single row away — that saves nothing and costs a tap', () => {
    const three = read(9, [{ store: 'OPUS', value: 1 }, { store: 'Greenhills', value: 2 },
      { store: 'Rockwell', value: 3 }]);
    expect(focusFor(page[1], three)).toBeNull();
  });
});

describe('the edges', () => {
  it('nothing said is no page, and the room draws as it did', () => {
    expect(pageOf('', null, null, [])).toEqual([]);
    expect(pageOf(null, null, null, [])).toEqual([]);
  });

  it('takes only the headline SENTENCE out of a paragraph that says more', () => {
    const page = pageOf('OPUS is the whole of it. The other six barely moved.', 'the whole of it', null, []);
    expect(page).toHaveLength(1);
    expect(page[0].para).toBe('The other six barely moved.');
  });

  it('an answer that is only its headline has no page', () => {
    expect(pageOf('OPUS is the whole of it.', 'the whole of it', null, [])).toEqual([]);
  });
});
