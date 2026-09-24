// @vitest-environment jsdom
/**
 * THE ROOM YOU CAN READ (D1, 2026-09-23).
 *
 * The owner, testing the live build after wave 2, in four sentences:
 *
 *   *"sometimes i cant scroll down in the page."*
 *   *"i couldnt scroll down the left but there was more"*
 *   *"it doesnt say what product data its showing untill i hover which is bad."*
 *   *"it hung there i had to refresh."*   (its own test, useBobStream.cutoff)
 *
 * TWO THINGS WERE WRONG AND BOTH ARE HELD HERE.
 *
 * 1. HIS SIDE COULD NOT BE READ TO ITS END. `.r-aside` was `position: sticky`
 *    under `max-height: calc(100vh - max(5vh,64px) - 150px)` with
 *    `overflow: visible`, so words past that height were DRAWN and could not
 *    be reached — the page scroll moves the page and a pinned column is the
 *    thing that does not move. Measured in a browser on his own turns
 *    (`ops/frames.py --scenes gh-why gh-pattern`, `measure.json`): 784px and
 *    862px of content in a 686px box at 1440x900, and on `gh-pattern` 26px of
 *    it still below the window with the page scrolled to its very end.
 *
 *    The fix is where it pins, not whether: `beside.stickyTop`. Fits — the
 *    composition's head, as P10 decided. Taller — a negative offset, so its
 *    FOOT pins and the end of his words comes to rest above the line. Still
 *    sticky, still one page, still no second scroller: P10 stands.
 *
 * 2. A FIGURE DID NOT SAY WHAT IT WAS. A single-figure block read
 *    `₱1,393 ▼ −88.1% · this week · was ₱11,741`, and only `data-v` — a
 *    tooltip — said *Aji Kiamoy White · Product revenue*.
 *
 * The pixels are `ops/frames.py`'s; jsdom does no layout. What is held here is
 * the rule, the stylesheet and the drawing.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ASIDE_FOOT, ASIDE_TOP, asideWindow, stickyTop, travels } from './beside';
import { Board } from './render';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const CSS = readFileSync(join(__dirname, 'room.css'), 'utf8');
const SHEET = postcss.parse(CSS);
const ROOM = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');

function base(selector: string): Record<string, string> {
  const decls: Record<string, string> = {};
  let found = false;
  SHEET.walkRules((r) => {
    const parent = r.parent as postcss.AtRule | undefined;
    if (r.selector.trim() !== selector || parent?.type === 'atrule') return;
    found = true;
    r.walkDecls((d) => { decls[d.prop] = d.value.trim(); });
  });
  expect(found, `no base rule for ${selector}`).toBe(true);
  return decls;
}

/* ------------------------------------------------ his side, read to its end */

describe('his side can be read to its end at any height', () => {
  it('pins under the head while it fits the window it sticks in (P10)', () => {
    // 900 tall: 900 − 64 − 130 = 706px to itself.
    expect(asideWindow(900)).toBe(706);
    expect(travels(500, 900)).toBe(true);
    expect(stickyTop(500, 900)).toBe(ASIDE_TOP);
    // 5vh passes 64px past a 1280-tall window, and the head follows it.
    expect(stickyTop(300, 1400)).toBe(70);
  });

  it('pins by its FOOT once it is taller, so the end of his words is reachable', () => {
    // His own turn of 06:40, measured in Chrome: 862px of content at 1440x900.
    expect(travels(862, 900)).toBe(false);
    expect(stickyTop(862, 900)).toBe(900 - ASIDE_FOOT - 862); // −92
    // Its foot rests exactly ASIDE_FOOT above the bottom of the window.
    expect(stickyTop(862, 900) + 862).toBe(900 - ASIDE_FOOT);
  });

  it('never pins lower than the head, whatever it is handed', () => {
    for (const [content, height] of [[0, 900], [10, 900], [706, 900], [4000, 640]] as const) {
      expect(stickyTop(content, height)).toBeLessThanOrEqual(
        Math.max(height * 0.05, ASIDE_TOP));
    }
  });

  it('has no max-height on his side, and pins at the measured offset', () => {
    const aside = base('.r-aside');
    // THE MAX-HEIGHT IS THE DEFECT. With `overflow: visible` it drew what it
    // could not reach; with `overflow: auto` it would be the pane P10 removed.
    expect(aside['max-height']).toBeUndefined();
    expect(aside.position).toBe('sticky');
    expect(aside.top).toBe('var(--aside-top, max(5vh, 64px))');
    // AND NOTHING INSIDE THE ROOM SCROLLS ON ITS OWN, still (P10).
    expect(aside['overflow-y']).toBeUndefined();
    expect(aside.overflow).toBe('visible');
  });

  it('measures the offset in the room rather than guessing it', () => {
    expect(ROOM).toMatch(/stickyTop\(el\.scrollHeight, window\.innerHeight\)/);
    expect(ROOM).toMatch(/--aside-top/);
    // Re-taken when the window moves AND when the column grows mid-turn.
    expect(ROOM).toMatch(/addEventListener\('resize', look\)/);
    expect(ROOM).toMatch(/new ResizeObserver\(look\)/);
  });
});

/* ------------------------------------------- a figure says what it is of */

const on: TileActions = { open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn() };

/** His read of 06:35: Aji Kiamoy White's week at Greenhills, as recorded. */
const ROWS = [{
  product: 'Aji Kiamoy White', store: 'Greenhills', value: 1393, baseline: 11741,
  change: -10348, change_pct: -88.1,
}];
const META = {
  source_table: 'new_transactions', filters_applied: ['store = Greenhills'],
  snapshot_timestamp: '2026-09-23T14:34:00+08:00', metric_label: 'Product revenue',
  unit: 'PHP', window: { name: 'last_week', start: '2026-09-14', end: '2026-09-21' },
};

function figure(extra: Partial<BoardObject> = {},
                rows: Record<string, unknown>[] = ROWS,
                meta: Record<string, unknown> = META) {
  const turn = {
    role: 'bob', text: 'A reading.', thinking: '', at: '2026-09-23T06:35:14Z',
    toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta } }],
  } as unknown as AnswerTurn;
  const object = {
    key: 'kw-drop', kind: 'figure', weight: 'lead', seq: 1, tool: 'get_sales',
    turn: 0, touched: 0, subject: 'Aji Kiamoy White', ...extra,
  } as unknown as BoardObject;
  return render(
    <Board answers={[turn]} board={[object]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('a figure says what it is of without being hovered', () => {
  it('draws the row\'s own subject and the read\'s measure above the number', () => {
    const { container } = figure();
    const of = container.querySelector('.r-mk-of') as HTMLElement;
    expect(of, 'the block says nothing about what it is').not.toBeNull();
    expect(of.textContent).toContain('Aji Kiamoy White');
    expect(of.textContent).toContain('Product revenue');
    // AND IT IS DRAWN, not a title: the complaint was the hover.
    expect(of.querySelector('[title]')?.textContent).toBe('Aji Kiamoy White');
    expect(of.getAttribute('title')).toBeNull();
    // The number is still the number, and still says its figure on a touch.
    expect(container.querySelector('.r-mk-num')?.textContent).toMatch(/1,393/);
    // UI rule 6: the read time is under it, as it always was — WITH ITS DATE
    // when the read was not today (data.readAt: "an hour with no day on it is
    // a claim about this morning that may be about last week"). Written
    // `read HH:MM` only, this passed on 2026-09-23 and failed on the 24th, the
    // same clock trap that took two doc.dom tests on 2026-09-22; the line it
    // read was "Product revenue · last week · read Sep 23 14:34".
    expect(container.querySelector('.r-src')?.textContent)
      .toMatch(/read (?:[A-Z][a-z]{2} \d{1,2} )?\d{1,2}:\d{2}/);
  });

  it('is the row\'s own spelling, never the block\'s subject word', () => {
    // `subject` is a word the model wrote; what is drawn is the string the row
    // carries, so a lower-cased or differently spaced subject cannot put the
    // model's spelling on screen (CLAUDE.md, Selection).
    const { container } = figure({ subject: 'aji kiamoy white ' });
    expect(container.querySelector('.r-mk-of')?.textContent).toContain('Aji Kiamoy White');
    expect(container.querySelector('.r-mk-of')?.textContent).not.toContain('aji kiamoy white');
  });

  it('names the product, not the shop, on a row that carries both', () => {
    // `subjectOf` reads `store` before `product`, which is right for a row
    // ABOUT a shop and wrong for this one: the figure is the product's.
    const { container } = figure();
    expect(container.querySelector('.r-mk-of')?.textContent).not.toContain('Greenhills');
  });

  it('says it once: a head that already names it is not repeated', () => {
    const { container } = figure({
      question: 'How far did Aji Kiamoy White fall at Greenhills?',
      claim: 'Greenhills all but stopped selling the line',
    });
    const of = container.querySelector('.r-mk-of');
    expect(of?.textContent).not.toContain('Aji Kiamoy White');
    // …but the measure, which the head does not say, is still drawn.
    expect(of?.textContent).toContain('Product revenue');
  });

  it('draws nothing where the head already says both', () => {
    const { container } = figure({
      claim: 'Aji Kiamoy White is down on Product revenue',
    });
    expect(container.querySelector('.r-mk-of')).toBeNull();
  });

  it('names the measure alone where the rows carry no subject', () => {
    const { container } = figure({ subject: undefined },
      [{ value: 1075722, change_pct: -54.3 }],
      { ...META, metric_label: 'Net sales' });
    const of = container.querySelector('.r-mk-of');
    expect(of?.textContent).toBe('Net sales');
  });
});
