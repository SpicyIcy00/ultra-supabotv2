// @vitest-environment jsdom
/**
 * VISIBLE WORK, AS RENDERED (P1.k).
 *
 * The card's own done-when, three claims, each one a test below:
 *
 *   "why is Rockwell down" shows four steps with times and a finding after;
 *   every read in Behind it has source, filters and time;
 *   nothing model-written appears in a mono line.
 *
 * THE LAST ONE IS A SCAN, not a review — and it left this file on 2026-09-15
 * (P2.b) for `voices.dom.test.tsx`, where it sits beside its mirror: nothing
 * model-written in a receipt line, nothing frame-derived in a prose line. The
 * claim is unchanged and still enforced; what changed is that there are two
 * of them now and they are read together.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnswerTurn } from './data';
import { Reading } from './Reading';
import { Working } from './Working';

afterEach(cleanup);

const FILTERS = [
  "t.status <> 'cancelled'   # metrics.yaml: filters.cancelled",
  "t.store_id IN (1: Rockwell)   # metrics.yaml: stores.active_retail",
];

function meta(over: Record<string, unknown> = {}) {
  return {
    source_table: 'new_transactions',
    metric_label: 'Net sales',
    group_by: ['store'],
    window: { name: 'last_week' },
    snapshot_timestamp: '2026-09-14T08:00:00Z',
    filters_applied: FILTERS,
    ...over,
  };
}

function read(seq: number, tool: string, ms: number, rows: Record<string, unknown>[]) {
  return {
    seq, tool, arguments: { date_range: 'last_week' },
    result: {
      row_count: rows.length, source_table: 'new_transactions', truncated: false,
      duration_ms: ms, error: null, rows, rows_complete: true, meta: meta(),
    },
  };
}

/** "why is Rockwell down": the primary, its two drivers, the breakdown, the board. */
const WHY: AnswerTurn = {
  role: 'bob',
  text: 'Rockwell is down ₱18,400 on last week, and it is basket size rather than footfall.',
  thinking: '',
  at: '2026-09-14T08:00:00Z',
  toolCalls: [
    read(0, 'get_sales', 412, [{ store: 'Rockwell', value: 203717, change_pct: -8.3 }]),
    read(1, 'get_sales', 260, [{ store: 'Rockwell', value: 1187 }]),
    read(2, 'get_sales', 318, [{ store: 'Rockwell', value: 171.6 }]),
    read(3, 'get_stock', 155, [{ product: 'Aji Mix', quantity_on_hand: 0 }]),
    {
      seq: 4, tool: 'compose', arguments: {},
      result: { row_count: 0, source_table: null, truncated: false, duration_ms: 9, error: null },
    },
  ],
  notices: [{ kind: 'partial_window', message: 'this week is not over yet' }],
  pinned: [], saved: [], pageChanges: [],
  reading: { claim: 'down ₱18,400 on last week', next: 'check the basket at the till' },
  done: { duration_ms: 19_000 } as AnswerTurn['done'],
} as AnswerTurn;

describe('the steps, while he works', () => {
  it('shows the one call happening now, with what it is and how long it took', () => {
    // ONE LINE, NOT A LOG (the owner, 2026-09-19: "i dont need to see it
    // reading maybe a more cleaner way like 1 reading sales with progess and
    // secounds and then done and then another"). Eighteen lines of
    // "read sales 7 rows 192ms" is something you read afterwards; what a
    // person waiting needs is what is happening now.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'));
    const { container } = render(<Working turn={WHY} live />);
    const lines = Array.from(container.querySelectorAll('.r-work'))
      .map((e) => e.textContent ?? '');
    // The last step of this turn, and its own clock off its own frame.
    expect(lines[0]).toContain('arranged the workspace');
    expect(lines[0]).toContain('9ms');
    // The reads behind it are counted, not listed.
    expect(lines.join(' ')).toMatch(/\d+ reads done/);
    expect(lines.filter((l) => /\d+ms/.test(l))).toHaveLength(1);
    vi.useRealTimers();
  });

  it('shows the call still running in preference to one that landed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'));
    const mid = {
      ...WHY,
      toolCalls: [...WHY.toolCalls.slice(0, 2),
                  { ...WHY.toolCalls[2], result: undefined }],
    } as AnswerTurn;
    const { container } = render(<Working turn={mid} live />);
    const first = container.querySelector('.r-work')?.textContent ?? '';
    // A running call ends in an ellipsis and carries no duration of its own.
    expect(first).toMatch(/…/);
    expect(first).not.toMatch(/\d+ms/);
    vi.useRealTimers();
  });

  it('opens the line on its own receipts, and closes it again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T08:00:00Z'));
    const one = { ...WHY, toolCalls: WHY.toolCalls.slice(0, 1) } as AnswerTurn;
    const { container } = render(<Working turn={one} live />);
    const step = container.querySelectorAll('.r-work--step')[0];
    fireEvent.click(step);
    expect(container.querySelector('.r-work-receipts')?.textContent)
      .toContain('new_transactions');
    fireEvent.click(step);
    expect(container.querySelector('.r-work-receipts')).toBeNull();
    vi.useRealTimers();
  });
});

describe('a figure in the claim jumps to its read', () => {
  it('does not underline a figure of his that no read returned', () => {
    // ₱18,400 is the difference he worked out; no row of this turn holds it,
    // and an underline is a promise that there is something behind it.
    const { container } = render(
      <Reading text={WHY.text} reading={WHY.reading}
               calls={WHY.toolCalls} onFigure={() => {}} />);
    expect(container.querySelector('.r-figure')).toBeNull();
    expect(container.textContent).toContain('₱18,400');
  });

  it('places a figure on the read that returned it', () => {
    const jumped: number[] = [];
    const turn = {
      ...WHY,
      text: 'Rockwell did ₱203,717, and the basket is ₱171.60.',
      reading: { claim: 'Rockwell did ₱203,717, and the basket is ₱171.60.' },
    } as AnswerTurn;
    const { container } = render(
      <Reading text={turn.text} reading={turn.reading}
               calls={turn.toolCalls} onFigure={(seq) => jumped.push(seq)} />);
    const figures = Array.from(container.querySelectorAll('.r-figure'));
    expect(figures.map((f) => f.textContent)).toEqual(['₱203,717', '₱171.60']);
    fireEvent.click(figures[1]);
    // The basket came out of the third read, not the first.
    expect(jumped).toEqual([2]);
  });

  it('leaves the claim a sentence when nothing in it can be placed', () => {
    const { container } = render(
      <Reading text="Nothing here needs you today."
               reading={{ claim: 'Nothing here needs you today.' }}
               calls={WHY.toolCalls} onFigure={() => {}} />);
    expect(container.querySelector('.r-figure')).toBeNull();
    expect(container.textContent).toContain('Nothing here needs you today.');
  });
});

/**
 * THE RECORDED RUNS — the same eight the marks were replayed through (P1.e),
 * and the reason they are here rather than a fixture of my own: every filter
 * line, every source table and every snapshot in them is a real read Bob
 * really made, and a view that holds over invented meta is a view that holds
 * over what I imagined a tool returns.
 */
