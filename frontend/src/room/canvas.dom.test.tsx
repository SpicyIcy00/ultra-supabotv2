/**
 * THE CANVAS (P6.a, 2026-09-20) — what the target page needed that the room
 * could not draw, held in the room.
 *
 * The owner: *"one perfectly engineered page for its answer … the right side
 * is a canvas, fill it."* The target is ops/ideal/how-are-we-doing-v2.html.
 * Every element of it is now a thing a block can be, under the same rules as
 * every other mark: a value drawn is a value a read returned, an annotation
 * points and characterises and names no figure, no colour but direction.
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarkBlock } from './marks';
import { DraftTile, SystemTile } from './tiles';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';

afterEach(cleanup);

const ACTIONS = (): TileActions => ({
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(), retune: vi.fn(),
});

const META = { source_table: 'new_transactions', metric_label: 'Net sales', metric_unit: 'PHP',
               snapshot_timestamp: '2026-09-20T09:50:00Z', filters_applied: [],
               window: { name: 'last_30_days' } };

function turnWith(rows: Record<string, unknown>[], seq = 0): AnswerTurn {
  return {
    role: 'bob', text: '', thinking: '', at: '2026-09-20T09:50:00Z',
    toolCalls: [{ seq, tool: 'get_sales', arguments: {}, result: { rows, meta: META } }],
  } as unknown as AnswerTurn;
}

function draw(o: Partial<BoardObject>, rows: Record<string, unknown>[], canvas = false) {
  const turn = turnWith(rows);
  const block = { key: 'k', weight: 'supporting', seq: 0, tool: 'get_sales', turn: 0, touched: 0,
                  ...o } as BoardObject;
  return render(
    <MarkBlock o={block} turn={turn} local={{}} landing={false} delay={0} focused={false}
               selected={false} selection={[]} earlier={false} retuned={null} on={ACTIONS()}
               order={undefined} chrome="read 1" told={false} canvas={canvas} />,
  );
}

const DAYS = Array.from({ length: 10 }, (_, i) => ({
  day: `2026-09-${String(i + 1).padStart(2, '0')}`, value: 100 + i * 10, baseline: 120,
}));

describe('a pointed annotation on a series (span)', () => {
  it('draws a band over the stretch and his thought pointing at it', () => {
    const { container } = draw({ kind: 'line', span: ['2026-09-02', '2026-09-05'],
                                 thought: 'two weeks under last month' }, DAYS);
    expect(container.querySelector('.r-mk-span-band')).not.toBeNull();
    expect(container.querySelector('.r-mk-annotation')?.textContent).toBe('two weeks under last month');
    // Said on the chart, not under the head as well: once.
    expect(container.querySelector('.r-mk-thought')).toBeNull();
  });

  it('draws no band when a label is not a row of the read', () => {
    const { container } = draw({ kind: 'line', span: ['2026-09-02', '2026-10-30'],
                                 thought: 'nothing here' }, DAYS);
    expect(container.querySelector('.r-mk-span-band')).toBeNull();
    expect(container.querySelector('.r-mk-annotation')).toBeNull();
    // The thought falls back to where a thought always goes.
    expect(container.querySelector('.r-mk-thought')?.textContent).toBe('nothing here');
  });
});

describe('the rows as a list', () => {
  const CROSSED = [
    { subject: 'Aji Kiamoy White', store: 'OPUS', size: 7 },
    { subject: 'Aji Ezo Squid', store: 'OPUS', size: 6 },
    { subject: 'aji plum - k plum', store: 'Magnolia', size: 4 },
  ];

  it('names each row by what it is, and says where it is', () => {
    const { container } = draw({ kind: 'list' }, CROSSED);
    const rows = Array.from(container.querySelectorAll('.r-mk-list-row'));
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Aji Kiamoy White');
    expect(rows[0].querySelector('.r-mk-list-where')?.textContent).toBe('OPUS');
    // Not the open defect of 2026-09-17: a row is never named after its shop
    // when it carries its own name.
    expect(rows[0].textContent?.startsWith('OPUS')).toBe(false);
  });
});

describe('the lead figure is the size of the answer', () => {
  it('draws larger when it leads', () => {
    const one = [{ value: 7281692, baseline: 8060342, change: -778650, direction: 'down' }];
    const lead = draw({ kind: 'figure', weight: 'lead' }, one);
    const size = (lead.container.querySelector('.r-mk-num') as HTMLElement).style.getPropertyValue('--size');
    cleanup();
    const supporting = draw({ kind: 'figure', weight: 'supporting' }, one);
    const smaller = (supporting.container.querySelector('.r-mk-num') as HTMLElement).style.getPropertyValue('--size');
    expect(parseInt(size, 10)).toBeGreaterThan(parseInt(smaller, 10));
    expect(parseInt(size, 10)).toBeGreaterThanOrEqual(72);
  });
});

describe('small multiples of change', () => {
  const WEEKS = ['2026-08-17', '2026-08-24', '2026-08-31'];
  const ROWS = ['Rockwell', 'OPUS'].flatMap((store) => WEEKS.map((week, i) => ({
    store, week, value: 1000 + i, change: store === 'Rockwell' ? -300 + i * 10 : 5 + i,
  })));

  it('draws the change about a zero line when the rows carry one', () => {
    const { container } = draw({ kind: 'multiples' }, ROWS);
    expect(container.querySelectorAll('.r-mk-multiple')).toHaveLength(2);
    expect(container.querySelectorAll('.r-mk-zero').length).toBe(2);
  });
});

/**
 * THE CANVAS IS THE DESIGN (P6.e, 2026-09-20).
 *
 * The owner, of the second pass, over the design on his phone: *"it doesn't
 * look like this. It still feels like our old just put in a new order ...
 * still kinda a thread."* He was right: every block on his arrangement wore
 * the packed board's head (three sentences), its sizes and its shape. Laid out
 * by him (`canvas`), a block is now drawn to ops/ideal/how-are-we-doing-v2.html:
 * the head one line, the number at 34 with its `was` beside it and its thought
 * under it, the line with an axis, its dates and a legend in words, multiples
 * as one strip with the named one lit, a drop growing in from its own edge.
 */
describe('on the canvas, the design', () => {
  const ONE = [{ value: 7281692, baseline: 8060342, change: -778650, change_pct: -9.7,
                 direction: 'down', unit: 'PHP', baseline_status: 'ok' }];

  it("sets a figure at the design's size, its was beside it, its thought under it", () => {
    const { container } = draw({ kind: 'figure', weight: 'lead', claim: 'Down on the month',
                                 thought: 'Most of it is already over.' }, ONE, true);
    expect((container.querySelector('.r-mk-num') as HTMLElement).style.getPropertyValue('--size')).toBe('34px');
    expect(container.querySelector('.r-mk-was')?.textContent).toBe('this 30 days · was ₱8,060,342');
    expect(container.querySelector('.r-mk-verdict')?.textContent).toBe('Most of it is already over.');
    // One line above the number: the thought is not on the head as well.
    expect(container.querySelector('.r-mk-say .r-mk-thought')).toBeNull();
    // And no dumbbell saying the same two figures a third time.
    expect(container.querySelector('.r-mk-dot--was')).toBeNull();
  });

  it('draws the line with an axis, its dates, the note bracketed, and a legend in words', () => {
    const { container } = draw({ kind: 'line', span: ['2026-09-02', '2026-09-05'],
                                 thought: 'two weeks under last month' }, DAYS, true);
    expect(container.querySelector('.r-mk-axis')).not.toBeNull();
    expect(container.querySelectorAll('.r-mk-tick').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.r-mk-tick')?.textContent).toMatch(/1 Sep/);
    expect(container.querySelector('.r-mk-note-l')).not.toBeNull();
    expect(container.querySelector('.r-mk-legend-line')?.textContent)
      .toBe('this 30 daysthe 30 days before, day for day');
    // The packed board's ends line is replaced, not added to.
    expect(container.querySelector('.r-mk-ends')).toBeNull();
    // The svg sizes by its own aspect; a fixed height letterboxed it.
    expect(container.querySelector('svg')?.getAttribute('height')).toBeNull();
  });

  it('colours the band by the direction of the rows in it, through paint', () => {
    const down = DAYS.map((r) => ({ ...r, direction: 'down' }));
    const { container } = draw({ kind: 'line', span: ['2026-09-02', '2026-09-05'],
                                 thought: 'the fall' }, down, true);
    const band = container.querySelector('.r-mk-span-band') as SVGElement;
    expect(band.getAttribute('data-dir')).toBe('down');
    expect(band.style.color).toBe('rgb(var(--down))');
  });

  const WEEKS = ['2026-08-17', '2026-08-24', '2026-08-31'];
  const SHOPS = ['Rockwell', 'OPUS'].flatMap((store) => WEEKS.map((week, i) => ({
    store, week, value: 1000 + i, change: store === 'Rockwell' ? -300 + i * 10 : 5 + i,
    direction: store === 'Rockwell' ? 'down' : 'up',
  })));

  it('draws multiples as one strip, the one his span names lit with his thought under it', () => {
    const { container } = draw({ kind: 'multiples', span: ['Rockwell'],
                                 thought: 'the one that did not come back' }, SHOPS, true);
    expect(container.querySelectorAll('.r-mk-shop')).toHaveLength(2);
    const lit = container.querySelectorAll('.r-mk-shop[data-lit="yes"]');
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toContain('Rockwell');
    expect(lit[0].querySelector('.r-mk-callout')?.textContent).toBe('the one that did not come back');
    expect(container.querySelectorAll('.r-mk-callout')).toHaveLength(1);
    // Said under the shop, not on the head as well.
    expect(container.querySelector('.r-mk-say .r-mk-thought')).toBeNull();
    // The name is the label: no swatch, and nothing dimmed.
    expect(container.querySelector('.r-sw')).toBeNull();
    expect(container.querySelectorAll('.r-mk-shop-bar')).toHaveLength(6);
  });

  it('grows a drop in from the right edge of its track, a gain from the left', () => {
    const rows = [{ subject: 'Aji Mix', change: -100260, direction: 'down' },
                  { subject: 'Aji Mango', change: 34626, direction: 'up' }];
    const { container } = draw({ kind: 'contributors' }, rows, true);
    const bars = container.querySelectorAll('.r-mk-bar i') as NodeListOf<HTMLElement>;
    expect(bars[0].style.right).toBe('0px');
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.left).toBe('0px');
    expect(container.querySelector('.r-sw')).toBeNull();
  });
});

/**
 * BUILD TALKS ON THE CANVAS (P6.g, 2026-09-20). The owner: "how about other
 * types of talks? to test all the other features like building stuff. it must
 * be ready for everything." A draft, a system and a memory drew a label and a
 * box, and nothing of what he said about them. Laid out by him they open the
 * way a step does and sit on the page unboxed.
 */
describe('a built thing on the canvas', () => {
  const PLAN = [{ product: 'Kameda Orange Big Pack', units_per_day: '2.878', on_hand: 0,
                  days_of_cover: '0.0', suggested_order_qty: 86, days_with_nothing: 90 }];
  const planTurn = () => ({
    role: 'bob', text: '', thinking: '', at: '2026-09-20T15:20:00Z',
    toolCalls: [{ seq: 0, tool: 'get_purchase_plan', arguments: { supplier: 'Seikyo SEK001' },
                  result: { rows: PLAN, meta: { source_table: 'purchase_orders', supplier: 'Seikyo SEK001',
                                                 snapshot_timestamp: '2026-09-20T15:20:00Z', filters_applied: [] } } }],
  } as unknown as AnswerTurn);
  const tile = (o: Partial<BoardObject>) => ({
    key: 'k', weight: 'lead', seq: 0, tool: 'get_purchase_plan', turn: 0, touched: 0, ...o,
  } as BoardObject);
  const props = (canvas: boolean) => ({
    local: {}, landing: false, delay: 0, focused: false, selected: false, selection: [],
    earlier: false, retuned: null, on: ACTIONS(), order: undefined, chrome: 'read 1', told: false, canvas,
  });

  it('opens a draft with his claim and thought, unboxed, on the canvas', () => {
    const o = tile({ kind: 'draft', claim: 'Seikyo, for the next month',
                     thought: 'Change any line before it goes.' });
    const { container } = render(<DraftTile o={o} turn={planTurn()} {...props(true)} />);
    expect(container.querySelector('.r-mk-say')?.textContent)
      .toBe('Seikyo, for the next month. Change any line before it goes.');
    expect(container.querySelector('.r-tile--boxed')).toBeNull();
    expect(container.querySelector('.r-rows')).not.toBeNull();
  });

  it('keeps the draft in its box, without the head, on the packed board', () => {
    const o = tile({ kind: 'draft', claim: 'Seikyo, for the next month' });
    const { container } = render(<DraftTile o={o} turn={planTurn()} {...props(false)} />);
    expect(container.querySelector('.r-mk-say')).toBeNull();
    expect(container.querySelector('.r-tile--boxed')).not.toBeNull();
  });

  it("draws what a watch says about itself, each field the row carries, once", () => {
    const WHAT = 'watching down: average transaction value — Greenhills';
    const turn = {
      role: 'bob', text: '', thinking: '', at: '2026-09-20T15:20:00Z',
      toolCalls: [{ seq: 1, tool: 'view_automations', arguments: {}, result: { rows: [{
        what: WHAT, state: 'ready — not switched on', when: null, by: 'would have fired 3 of the last 30 days',
        condition: 'average transaction value against the same week before', where: 'Greenhills',
        schedule: 'every day at 06:00', would_have_fired: '3 of the last 30 days', id: 'w1',
      }], meta: { source_table: 'george.watches', snapshot_timestamp: '2026-09-20T15:20:00Z', filters_applied: [] } } }],
    } as unknown as AnswerTurn;
    const o = { key: 'w', kind: 'system', weight: 'supporting', seq: 1, tool: 'view_automations',
                turn: 0, touched: 0, subject: WHAT, claim: 'The watch, as it stands' } as BoardObject;
    const { container } = render(<SystemTile o={o} turn={turn} {...props(true)} />);
    expect(container.querySelector('.r-mk-say')?.textContent).toBe('The watch, as it stands');
    const dl = container.querySelector('.r-system');
    expect(dl?.textContent).toContain('average transaction value against the same week before');
    expect(dl?.textContent).toContain('every day at 06:00');
    expect(dl?.textContent).toContain('would have fired 3 of the last 30 days');
    // The backtest is said once: the dl says it, so the `by` line does not.
    expect(container.textContent?.match(/would have fired/g)).toHaveLength(1);
    expect(container.textContent).toContain('ready — not switched on');
  });
});

/**
 * A CALLOUT UNDER ONE NAMED ROW, AND A FOLD ON THE DRAFT (P6.h). His thought
 * about one row of a list sits under that row, said once; a long draft shows
 * the lines that need him first and folds the rest.
 */
describe('one page, on every list', () => {
  it('draws the thought under the one row the span names, and not on the head', () => {
    const rows = [{ subject: 'Aji Mix', change: -100260, direction: 'down' },
                  { subject: 'Aji Mango', change: 34626, direction: 'up' }];
    const { container } = draw({ kind: 'contributors', claim: 'What moved', span: ['Aji Mango'],
                                 thought: 'the one that took off' }, rows, true);
    const callouts = container.querySelectorAll('.r-mk-callout--row');
    expect(callouts).toHaveLength(1);
    expect(callouts[0].textContent).toBe('the one that took off');
    expect(callouts[0].parentElement?.textContent).toContain('Aji Mango');
    expect(container.querySelector('.r-mk-say .r-mk-thought')).toBeNull();
  });

  it('folds a long draft to the lines that need him first', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      product: `Line ${i + 1}`, units_per_day: '1', on_hand: 0, days_of_cover: '0.0', suggested_order_qty: 5,
    }));
    const turn = {
      role: 'bob', text: '', thinking: '', at: '2026-09-21T09:00:00Z',
      toolCalls: [{ seq: 0, tool: 'get_purchase_plan', arguments: {},
                    result: { rows, meta: { source_table: 'purchase_orders', snapshot_timestamp: '2026-09-21T09:00:00Z', filters_applied: [] } } }],
    } as unknown as AnswerTurn;
    const o = { key: 'k', kind: 'draft', weight: 'lead', seq: 0, tool: 'get_purchase_plan', turn: 0, touched: 0 } as BoardObject;
    const { container } = render(
      <DraftTile o={o} turn={turn} local={{}} landing={false} delay={0} focused={false} selected={false}
                 selection={[]} earlier={false} retuned={null} on={ACTIONS()} order={undefined} chrome="read 1"
                 told={false} canvas />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(12);
    expect(container.querySelector('.r-mk-more')?.textContent).toBe('8 more lines · show');
  });
});
