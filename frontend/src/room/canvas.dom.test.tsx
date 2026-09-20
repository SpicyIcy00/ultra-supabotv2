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

function draw(o: Partial<BoardObject>, rows: Record<string, unknown>[]) {
  const turn = turnWith(rows);
  const block = { key: 'k', weight: 'supporting', seq: 0, tool: 'get_sales', turn: 0, touched: 0,
                  ...o } as BoardObject;
  return render(
    <MarkBlock o={block} turn={turn} local={{}} landing={false} delay={0} focused={false}
               selected={false} selection={[]} earlier={false} retuned={null} on={ACTIONS()}
               order={undefined} chrome="read 1" told={false} />,
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
