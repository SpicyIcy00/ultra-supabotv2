/**
 * THE BESIDE ROOM'S RULES, HELD ON THE NUMBERS (P2S.1(b)(c)).
 *
 * jsdom does no layout, so a dom test cannot see a centre, a column or a
 * drawn body. The rules are pure functions in `beside.ts`, and the numbers
 * the stylesheet uses are read back out of room.css here, so the arithmetic
 * and the CSS cannot drift onto two different rooms. The pixels themselves are
 * checked by `ops/frames.py`, in a real browser.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMP_GAP, COMP_MAX, FIGS_W, HIM_W, SIDE_W, arrowStep, arrowsFor, claimAndStanding,
  columnsFor, composition, markGeometry, needsWidth, placeFigures, revealAt, wireEnds, type Box,
} from './beside';

const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');

function px(token: string): number {
  const m = new RegExp(`--${token}:\\s*(\\d+)px`).exec(CSS);
  expect(m, `room.css declares no --${token}`).toBeTruthy();
  return Number(m![1]);
}

describe('the composition is the design\'s, and it stays centred', () => {
  it('declares the design\'s own widths in the stylesheet', () => {
    expect(px('him-w')).toBe(HIM_W);
    expect(px('figs-w')).toBe(FIGS_W);
    expect(px('comp-gap')).toBe(COMP_GAP);
    expect(px('comp-max')).toBe(COMP_MAX);
    expect(px('side-w')).toBe(SIDE_W);
    expect(HIM_W + COMP_GAP + FIGS_W).toBe(1560);
  });

  it.each([1440, 1920])('centres it in the room at %ipx, sidebar open and closed', (vw) => {
    for (const open of [true, false]) {
      const c = composition(vw, open);
      expect(Math.abs(c.centre - c.roomCentre), `${vw} ${open ? 'open' : 'closed'}`).toBeLessThan(0.5);
      // Nothing under the sidebar and nothing off the right edge.
      expect(c.left).toBeGreaterThanOrEqual(c.roomLeft);
      expect(c.left + c.width).toBeLessThanOrEqual(vw);
    }
  });

  it('SLIDES when the sidebar opens and never shrinks — his row 4', () => {
    for (const vw of [1100, 1440, 1663, 1863, 1920, 2560]) {
      const open = composition(vw, true);
      const closed = composition(vw, false);
      expect(open.width, `${vw}px`).toBe(closed.width);
      expect(open.him).toBe(closed.him);
      expect(open.figures).toBe(closed.figures);
      expect(open.left - closed.left).toBeCloseTo(SIDE_W / 2, 5);
    }
  });

  it('is exactly 580 and 940 at 1920, which is room for the whole design', () => {
    const c = composition(1920, true);
    expect(c.width).toBe(1560);
    expect(c.him).toBeCloseTo(580, 5);
    expect(c.figures).toBeCloseTo(940, 5);
  });

  it('keeps the design\'s proportion at 1440 rather than squeezing one column', () => {
    const c = composition(1440, true);
    expect(c.him / c.figures).toBeCloseTo(580 / 940, 5);
  });

  it('uses the same formula in the stylesheet', () => {
    // The width is decided as though the sidebar were always there.
    expect(CSS).toMatch(/width:\s*min\(var\(--comp-max\),\s*100vw - var\(--side-w\) - 32px\)/);
    expect(CSS).toMatch(/grid-template-columns:\s*minmax\(0,\s*29fr\)\s*minmax\(0,\s*47fr\)/);
  });
});

describe('the figures flow into columns — his rows 6 and 7', () => {
  /**
   * ONE COLUMN, EVERYWHERE, SINCE 2026-09-19.
   *
   * This test asserted two until today. The owner, of the live board: *"it
   * still feels like the widgets, it's not the page style"* — and two columns
   * is what makes it a dashboard rather than a page. The eye reads across, the
   * order you see is the packer's rather than his, and every item has to carry
   * a label to say what it is. Three went in September for cutting names; two
   * go for the same reason one level up.
   */
  it('uses one column, on a desk as on a phone, whatever the count', () => {
    expect(columnsFor(1, 1920)).toBe(1);
    expect(columnsFor(1, 1920, true)).toBe(1);
    for (const n of [2, 3, 4, 5, 6, 9]) expect(columnsFor(n, 1920)).toBe(1);
  });

  it('knows which figures need the width, from what they draw', () => {
    expect(needsWidth('ranked', 8, 3)).toBe(false);
    expect(needsWidth('contributors', 10, 3)).toBe(false);
    expect(needsWidth('dumbbell', 7, 3)).toBe(false);
    expect(needsWidth('figure', 1, 3)).toBe(false);
    expect(needsWidth('line', 30, 2)).toBe(true);
    expect(needsWidth('line', 5, 2)).toBe(false);
    expect(needsWidth('table', 12, 6)).toBe(true);
    expect(needsWidth('table', 12, 3)).toBe(false);
    // FOUR LONG HEADINGS NEED THE WIDTH TOO, which a count alone never saw.
    // The owner's stockout read, 2026-09-19: four columns, sixty characters
    // of heading, drawn in half the area and scrolling sideways with the
    // other half empty.
    expect(needsWidth('table', 5, 4, ['store', 'days_out_of_stock',
                                      'current_stockout_run', 'longest_stockout_run'])).toBe(true);
    // And four short ones still sit in a column, as they always did.
    expect(needsWidth('table', 5, 4, ['store', 'value', 'change_pct', 'rank'])).toBe(false);
    expect(needsWidth('spec', 0, 0)).toBe(true);
    // P2S.3: bars past four names, an area like a line, a grid of many cells.
    expect(needsWidth('bar', 7, 3)).toBe(true);
    expect(needsWidth('bar', 4, 3)).toBe(false);
    expect(needsWidth('area', 31, 2)).toBe(true);
    expect(needsWidth('heatmap', 91, 4)).toBe(true);
    expect(needsWidth('pie', 7, 2)).toBe(false);
  });

  it('puts a spanning figure under the tallest column and raises both to its foot', () => {
    // The lead first: it takes the whole width, then the rest flow beneath it.
    expect(placeFigures([300, 120, 120, 120], 2, [true])).toEqual([0, 0, 1, 0]);
    // A spanning figure later in the order lands under both columns.
    expect(placeFigures([400, 100, 200, 100], 2, [false, false, true, false])).toEqual([0, 1, 0, 0]);
  });

  it('takes one column at 900px and under, and now above it too', () => {
    for (const n of [1, 3, 7]) expect(columnsFor(n, 900)).toBe(1);
    expect(columnsFor(3, 901)).toBe(1);
  });

  it.each([[2], [3], [4], [5]])('places %i figures down one flow, in his order', (n) => {
    const heights = new Array(n as number).fill(200);
    const want = new Array(n as number).fill(0);
    expect(placeFigures(heights, columnsFor(n as number, 1920))).toEqual(want);
  });

  /**
   * THE PACKER STILL PACKS. `columnsFor` stopped asking for two columns; it
   * did not stop being able to place them, and `placeFamilies` still leans on
   * exactly this arithmetic. Held so that a second column is a decision to
   * make again, not a capability to rebuild.
   */
  it('still packs two columns when it is asked for two', () => {
    expect(placeFigures([200, 200, 200], 2)).toEqual([0, 1, 0]);
  });

  it('sends each figure to the SHORTEST column, so nothing leaves a hole', () => {
    // A tall table, then three short figures: all three go beside the table.
    expect(placeFigures([900, 120, 120, 120], 2)).toEqual([0, 1, 1, 1]);
    // And the fourth, once the short ones stand taller than the table, goes back.
    // (120 + 34 + 120 = 274 stands taller than 250.)
    expect(placeFigures([250, 120, 120, 120], 2)).toEqual([0, 1, 1, 0]);
  });

  it('breaks a tie on height by how many figures a column holds', () => {
    // Heights zero everywhere (jsdom, or nothing measured yet) still reads in order.
    expect(placeFigures([0, 0, 0, 0, 0, 0], 3)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

describe('the figures arrive, and are not narrated — his row 13', () => {
  it('lands the first at 200ms and one every 260ms after', () => {
    expect([0, 1, 2, 3].map((k) => revealAt(k, false))).toEqual([200, 460, 720, 980]);
  });

  it('shows everything at once when less motion was asked for', () => {
    expect([0, 1, 5].map((k) => revealAt(k, true))).toEqual([0, 0, 0]);
  });
});

describe('only the figures move, by arrows — his row 9', () => {
  it('hides up at the top and down at the bottom, within 2px', () => {
    expect(arrowsFor(0, 500, 1400)).toEqual({ up: false, down: true });
    expect(arrowsFor(2, 500, 1400)).toEqual({ up: false, down: true });
    expect(arrowsFor(450, 500, 1400)).toEqual({ up: true, down: true });
    expect(arrowsFor(898, 500, 1400)).toEqual({ up: true, down: false });
    // Nothing more to see: no arrows at all.
    expect(arrowsFor(0, 500, 500)).toEqual({ up: false, down: false });
  });

  it('moves 80% of the area per press', () => {
    expect(arrowStep(500)).toBe(400);
  });
});

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe('the leading lines come from him — his rows 10 and 12', () => {
  const frame = box(100, 0, 1600, 1000);
  const mark = box(100, 50, 580, 360);
  const claim = box(200, 400, 480, 60);
  const area = box(720, 64, 940, 700);

  it('runs one line to the claim and one to every figure inside the area', () => {
    const wires = wireEnds({ frame, mark, claim, area, figures: [
      { key: 'a', box: box(720, 64, 450, 300) },
      { key: 'b', box: box(1210, 64, 450, 300) },
    ] });
    expect(wires.map((w) => w.to)).toEqual(['claim', 'a', 'b']);
    // From the mark's centre.
    for (const w of wires) { expect(w.x1).toBe(290); expect(w.y1).toBe(230); }
    // To the claim's top-right corner, 6 in and 2 down.
    expect(wires[0]).toMatchObject({ x2: 200 + 480 - 100 - 6, y2: 402 });
    // To each figure's top-left, +18 and +8.
    expect(wires[1]).toMatchObject({ x2: 720 - 100 + 18, y2: 72 });
    expect(wires[2].last).toBe(true);
  });

  it('draws no line to a figure scrolled out of the area, and clamps a half-seen one', () => {
    const wires = wireEnds({ frame, mark, claim: null, area, figures: [
      { key: 'gone', box: box(720, -500, 450, 300) },
      { key: 'half', box: box(720, -100, 450, 300) },
      { key: 'below', box: box(720, 900, 450, 300) },
    ] });
    expect(wires.map((w) => w.to)).toEqual(['half']);
    expect(wires[0].y2).toBe(64 + 8);
  });

  it('draws nothing without the mark to come from', () => {
    expect(wireEnds({ frame, mark: null, claim, area, figures: [] })).toEqual([]);
  });
});

describe('the mark is big — his rows 14 and 24', () => {
  it('draws a body at least 65% of its column', () => {
    // It was 70%, his rows 14 and 24 ("alive is too small"). On 2026-09-17,
    // keeping this layout, he asked for it "slightly smaller": 136% → 122% of
    // the column, and the body is still two thirds of it.
    const g = markGeometry();
    expect(g.bodyShareOfColumn).toBeGreaterThanOrEqual(0.65);
    // 680×420, at 122% of the column since 2026-09-17 ("slightly smaller").
    expect(CSS).toMatch(/\.r-him canvas \{[^}]*width:\s*122%/);
    expect(CSS).toMatch(/\.r-him canvas \{[^}]*aspect-ratio:\s*680\s*\/\s*420/);
  });

  it('starts the words where he stops moving, and lets them scroll (the log, 2026-09-17)', () => {
    // Row 12 was "almost directly under the blob"; alive, the blob reaches the
    // canvas's foot, and -10vh put a caveat on top of him.
    expect(CSS).toMatch(/\.r-words \{[^}]*margin-top:\s*0;/);
    expect(CSS).toMatch(/\.r-words \{[^}]*overflow-y:\s*auto/);
    expect(CSS).toMatch(/\.r-him canvas \{[^}]*margin:\s*-5vh -11% 0/);
  });
});

describe('the claim is a sentence of its own', () => {
  it('takes the sentence the claim span sits in, and keeps every other character', () => {
    const text = 'Rockwell is down on July. It is the basket, not the door. Stock is next.';
    const got = claimAndStanding(text, 'the basket');
    expect(got.claim).toBe('It is the basket, not the door.');
    expect(got.standing).toBe('Rockwell is down on July. Stock is next.');
  });

  it('takes the first sentence when no span was given, or it is not there', () => {
    const text = 'Estate held. Two shops fell.';
    expect(claimAndStanding(text, null)).toMatchObject({ claim: 'Estate held.', standing: 'Two shops fell.' });
    expect(claimAndStanding(text, 'not in it')).toMatchObject({ claim: 'Estate held.', standing: 'Two shops fell.' });
  });

  it('does not break a number like 4.8% into two sentences', () => {
    const got = claimAndStanding('Basket fell 4.8% in August. Footfall held.', null);
    expect(got.claim).toBe('Basket fell 4.8% in August.');
  });

  it('says nothing about nothing', () => {
    expect(claimAndStanding('', 'x')).toMatchObject({ claim: '', standing: '' });
  });
});
