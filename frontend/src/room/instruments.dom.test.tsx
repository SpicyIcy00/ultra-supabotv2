// @vitest-environment jsdom
/**
 * THE INSTRUMENTS DRAW WHAT THEY CLAIM TO DRAW.
 *
 * Five marks arrived from the design board — range, bullet, ring, dots,
 * calendar — each a second reading of a figure. What these hold is not
 * their looks but their honesty: every figure on screen is a row's value,
 * the marker of a range is the row that was named, a bullet's whole is the
 * same row's column, a calendar lights nothing for beating another day.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { TileActions } from './tiles';
import { Board, turnNotices } from './render';
import { Reading } from './Reading';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
afterEach(cleanup);

const DAYS = [
  { day: '2026-09-07', value: 21244, store: 'Rockwell' },
  { day: '2026-09-08', value: 12258, store: 'Rockwell' },
  { day: '2026-09-09', value: 24020, store: 'Rockwell' },
  { day: '2026-09-10', value: 34124, store: 'Rockwell' },
  { day: '2026-09-11', value: 60108, store: 'Rockwell' },
];
const HOURS = [
  { hour: 10, value: 9732 }, { hour: 15, value: 114928 }, { hour: 20, value: 93419 },
];
const COMPARED = [
  { store: 'OPUS', value: 555147, baseline: 425000, change_pct: 30.6, direction: 'up' },
  { store: 'Rockwell', value: 203717, baseline: 179000, change_pct: 13.8, direction: 'up' },
];
const meta = { source_table: 'new_transactions', snapshot_timestamp: '2026-09-11T08:00:00Z', filters_applied: [] };
const TURN = {
  role: 'george', text: 'A reading.', thinking: '', at: '2026-09-11T08:00:00Z',
  toolCalls: [
    { seq: 1, tool: 'get_sales', arguments: {}, result: { rows: DAYS, meta } },
    { seq: 2, tool: 'get_sales', arguments: {}, result: { rows: HOURS, meta } },
    { seq: 3, tool: 'get_sales', arguments: {}, result: { rows: COMPARED, meta } },
  ],
} as unknown as AnswerTurn;

const on: TileActions = {
  open: vi.fn(), pick: vi.fn(), why: vi.fn(), patch: vi.fn(),
  retune: vi.fn(),
};

function draw(spec: BoardObject['spec']) {
  const o = { key: 'k', kind: 'table', weight: 'supporting', turn: 0, touched: 0, spec } as BoardObject;
  return render(
    <Board answers={[TURN]} board={[o]} local={{}} focused={null}
           selection={[]} live={false} retuned={{}} on={on} />,
  );
}

describe('range', () => {
  it('marks the named row with its own figure, and names the read\'s extremes', () => {
    const { container } = draw({ mark: 'range', seq: 1, field: 'value', by: 'day', emphasise: '2026-09-10' });
    expect(container.querySelector('.r-spec-range-head')?.textContent).toContain('34,124');
    expect(container.querySelectorAll('.r-spec-range-dot')).toHaveLength(5);
    const ends = container.querySelector('.r-spec-range-ends')?.textContent ?? '';
    expect(ends).toContain('12,258');
    expect(ends).toContain('60,108');
  });

  it('marks the last row when none is named', () => {
    const { container } = draw({ mark: 'range', seq: 1, field: 'value', by: 'day' });
    expect(container.querySelector('.r-spec-range-head')?.textContent).toContain('60,108');
  });
});

describe('bullet', () => {
  it('fills each row\'s field against the same row\'s whole, and prints both', () => {
    const { container } = draw({ mark: 'bullet', seq: 3, field: 'value', against: 'baseline', by: 'store' });
    const rows = container.querySelectorAll('.r-spec-bullet');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('555,147');
    expect(rows[0].textContent).toContain('425,000');
    // The fill never exceeds its own track: a value past its baseline is full.
    const fill = rows[0].querySelector('.r-spec-bullet-whole i') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });
});

describe('ring', () => {
  it('draws one tick per row, and draws a zero short and dim rather than red', () => {
    const rows = [...DAYS, { day: '2026-09-12', value: 0, store: 'Rockwell' }];
    const turn = { ...TURN, toolCalls: [{ seq: 1, tool: 'get_sales', arguments: {}, result: { rows, meta } }] } as unknown as AnswerTurn;
    const o = { key: 'k', kind: 'table', weight: 'supporting', turn: 0, touched: 0,
                spec: { mark: 'ring', seq: 1, field: 'value', label: 'day' } } as BoardObject;
    const { container } = render(
      <Board answers={[turn]} board={[o]} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />,
    );
    const ticks = container.querySelectorAll('.r-spec-ring line');
    expect(ticks).toHaveLength(6);
    const zero = ticks[5];
    expect(Number(zero.getAttribute('opacity'))).toBeLessThan(0.5);
    // IT IS SHORT AND DIM, AND IT IS FLAT. The stroke was the tile's own hue
    // until P2.l — a shop's identity inside a drawing, which is what the same
    // card took off the shell — so a ring of one shop's days was drawn in that
    // shop's colour. A row that declared no direction is drawn in the colour
    // of no direction.
    expect(zero.getAttribute('stroke')).toContain('var(--flat)');
    expect(zero.getAttribute('stroke')).not.toContain('var(--hue)');
  });
});

describe('dots', () => {
  it('sizes each dot by its value along the hour axis', () => {
    const { container } = draw({ mark: 'dots', seq: 2, field: 'value', by: 'hour' });
    const dots = [...container.querySelectorAll('.r-spec-dot i')] as HTMLElement[];
    expect(dots).toHaveLength(3);
    const size = (el: HTMLElement) => parseFloat(el.style.width);
    expect(size(dots[1])).toBeGreaterThan(size(dots[0]));
    expect(size(dots[1])).toBeGreaterThan(size(dots[2]));
    expect(container.textContent).toContain('15');
  });
});

describe('calendar', () => {
  it('lays the days out under their weekdays and lights by value only', () => {
    const { container } = draw({ mark: 'calendar', seq: 1, field: 'value', by: 'day' });
    // 7 Sep 2026 is a Monday: no padding, five cells.
    const cells = [...container.querySelectorAll('.r-spec-cal-day')] as HTMLElement[];
    expect(cells).toHaveLength(5);
    expect(cells[0].textContent).toBe('7');
    const alpha = (el: HTMLElement) => parseFloat(el.style.background.split(',').pop() ?? '0');
    expect(alpha(cells[4])).toBeGreaterThan(alpha(cells[1]));
    // Nothing on a cell says "beat last week": no lit class, no comparison.
    expect(container.querySelector('.lit')).toBeNull();
  });
});

describe('a line names its extremes', () => {
  it('labels the high and the low with the rows\' own figures', () => {
    const { container } = draw({ mark: 'line', seq: 1, field: 'value', by: 'day' });
    const labels = [...container.querySelectorAll('.r-spec-extreme')].map((e) => e.textContent);
    expect(labels).toHaveLength(2);
    expect(labels.join(' ')).toContain('60,108');
    expect(labels.join(' ')).toContain('12,258');
  });
});

describe('a composed shape is an object of its own kind', () => {
  // THE BUG THIS HOLDS. A block with only a spec fell through `kind ?? 'text'`,
  // so a leading shape counted as leading prose and the turn's caveats were
  // drawn on every text tile on the board — three of them from earlier turns.
  //
  // AND THE READING IS NO LONGER AN OBJECT AT ALL (P1.c). A `text` block can
  // now only come from a turn stored before the vocabulary lost the kind, and
  // the board drops it rather than drawing the answer twice — once in a tile
  // and once in the region above.
  it('is `spec`, and a stored text block is no object at all', async () => {
    const { buildBoard } = await import('./board');
    const turn = { ...TURN, composition: { blocks: [
      { op: 'put', key: 'hours', weight: 'lead', seqs: [2],
        spec: { mark: 'dots', seq: 2, field: 'value', by: 'hour' } },
      { op: 'put', key: 'reading', kind: 'text', weight: 'supporting' },
    ] } } as unknown as AnswerTurn;
    const board = buildBoard([turn]);
    expect(board.find((o) => o.key === 'hours')?.kind).toBe('spec');
    expect(board.find((o) => o.key === 'reading')).toBeUndefined();
  });

  it('names itself from the read: the measure, and the shop it was filtered to', () => {
    const turn = { ...TURN, toolCalls: [{ seq: 2, tool: 'get_sales',
      arguments: { group_by: 'hour', filters: { store: 'Rockwell' } },
      result: { rows: HOURS, meta: { ...meta, metric_label: 'Net sales' } } }] } as unknown as AnswerTurn;
    const o = { key: 'k', kind: 'spec', weight: 'lead', turn: 0, touched: 0, seqs: [2],
                spec: { mark: 'dots', seq: 2, field: 'value', by: 'hour' } } as BoardObject;
    const { container } = render(
      <Board answers={[turn]} board={[o]} local={{}} focused={null} selection={[]} live={false} retuned={{}} on={on} />,
    );
    expect(container.querySelector('.r-label')?.textContent).toBe('Rockwell · Net sales');
  });

  it("never surfaces the loop's warning about a refused edit as a caveat", () => {
    const turn = { ...TURN, notices: [
      { kind: 'composition_rejected', message: 'hours: a block carries a kind or a spec, never both', source: 'loop' },
      { kind: 'dead_stock_share', message: '1802 of 3397 products recorded no sale', source: 'tool' },
    ] } as unknown as AnswerTurn;
    const objects = [
      { key: 'hours', kind: 'spec', weight: 'lead', turn: 0, touched: 0, seqs: [2],
        spec: { mark: 'dots', seq: 2, field: 'value', by: 'hour' } },
    ] as BoardObject[];
    // The caveats belong to the turn and are drawn above the READING now, so
    // this is a question about `turnNotices` and that region, not the board.
    const notices = turnNotices({ answers: [turn], board: objects, local: {}, focused: null });
    const { container } = render(<Reading text={turn.text} notices={notices} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('never both');
    // A tool's notice still surfaces, always.
    expect(text).toContain('recorded no sale');
  });
});
