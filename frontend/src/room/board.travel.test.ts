/**
 * THE BOARD TRANSFORMS; IT NEVER ACCUMULATES (P1.d, 2026-09-14).
 *
 * The owner, 2026-09-13, after one sitting:
 *
 *   "i asked how are doing like and those 4 widgets are all the poped up, and
 *    then i asked for problems and what we can fix and only this one widget
 *    popped up ... and also when i ask to look for problems all the rest of
 *    the widgets still stayed"
 *
 * Two halves, and both are held here. A question that shares nothing with the
 * board CLEARS it, so "any problems" after "how are we doing" leaves one
 * finding. A question that shares a subject TRANSFORMS it, so "why?" changes
 * the OPUS finding where it stands instead of drawing a second one beneath —
 * and everything the newest turn did not touch folds to a line, so a fourth
 * follow-up is still a finding and not a pile.
 *
 * The fixtures are the reads those questions actually make, taken from the
 * recorded gate runs in `verification/`: "how are we doing" is estate-wide
 * `get_sales` with no store filter; "any problems" is `get_attention`, whose
 * rows name shops; "why?" is `get_sales` scoped to one shop with its drivers.
 */
import { describe, expect, it } from 'vitest';
import type { CompositionBlock, GeorgeTurn, ToolCall } from '../types/george';
import { buildBoard, folded, travel } from './board';
import type { AnswerTurn } from './data';

const call = (
  seq: number,
  tool: string,
  args: Record<string, unknown>,
  rows: Record<string, unknown>[],
  meta: Record<string, unknown> = {},
): ToolCall => ({
  seq, tool, arguments: args,
  result: {
    row_count: rows.length, source_table: 't', truncated: false, duration_ms: 1,
    error: null, rows, rows_complete: true, meta,
  },
} as unknown as ToolCall);

const turn = (toolCalls: ToolCall[], blocks: CompositionBlock[]): AnswerTurn => ({
  role: 'george', text: 'x', thinking: '', toolCalls, notices: [],
  pinned: [], saved: [], pageChanges: [], at: '2026-09-14T00:00:00Z',
  composition: { seq: -1, blocks, rejected: [] },
} as unknown as GeorgeTurn as AnswerTurn);

/** "How are we doing?" — three estate-wide measures, nothing scoped to a shop. */
const HOW_ARE_WE_DOING = turn(
  [
    call(0, 'get_sales', { metric: 'net_sales', date_range: 'last_week', group_by: [] },
         [{ value: 1_000_000, change_pct: 4.2, unit: 'PHP' }], { metric_domain: 'retail_sales' }),
    call(1, 'get_sales', { metric: 'transaction_count', date_range: 'last_week', group_by: [] },
         [{ value: 1187, change_pct: 1.1 }], { metric_domain: 'retail_sales' }),
    call(2, 'get_sales', { metric: 'average_transaction_value', date_range: 'last_week', group_by: [] },
         [{ value: 556.6, change_pct: 2.0, unit: 'PHP' }], { metric_domain: 'retail_sales' }),
  ],
  [
    { op: 'put', kind: 'figure', key: 'net-sales', weight: 'lead', seq: 0 },
    { op: 'put', kind: 'figure', key: 'txns', weight: 'supporting', seq: 1 },
    { op: 'put', kind: 'figure', key: 'basket', weight: 'quiet', seq: 2 },
  ],
);

/** "Any problems?" — a different read of a different business, about shops. */
const ANY_PROBLEMS = turn(
  [call(0, 'get_attention', {},
        [{ store: 'Rockwell', value: 203717, change_pct: -13.8 },
         { store: 'North Edsa', value: 88120, change_pct: -9.3 }])],
  [{ op: 'put', kind: 'table', key: 'needs-looking-at', weight: 'lead', seq: 0 }],
);

describe('a question that shares nothing with the board clears it', () => {
  it('leaves one finding after "how are we doing" then "any problems"', () => {
    const board = buildBoard([HOW_ARE_WE_DOING, ANY_PROBLEMS]);
    expect(board.map((o) => o.key)).toEqual(['needs-looking-at']);
  });

  it('is the whole of the complaint: the first question alone drew four', () => {
    expect(buildBoard([HOW_ARE_WE_DOING])).toHaveLength(3);
  });

  it('spares what the person kept, because keeping outranks a question', () => {
    const board = buildBoard([HOW_ARE_WE_DOING, ANY_PROBLEMS], new Set(['net-sales']));
    expect(board.map((o) => o.key).sort()).toEqual(['needs-looking-at', 'net-sales']);
  });

  it('clears on a different shop, not only on a different business', () => {
    const opus = turn(
      [call(0, 'get_sales', { metric: 'net_sales', filters: { store: 'OPUS' }, group_by: [] },
            [{ value: 555147, change_pct: 30.6 }], { metric_domain: 'retail_sales' })],
      [{ op: 'put', kind: 'hero', key: 'opus', weight: 'lead', seq: 0, subject: 'OPUS' }],
    );
    const magnolia = turn(
      [call(0, 'get_sales', { metric: 'net_sales', filters: { store: 'Magnolia' }, group_by: [] },
            [{ value: 91_000, change_pct: -2.1 }], { metric_domain: 'retail_sales' })],
      [{ op: 'put', kind: 'hero', key: 'magnolia', weight: 'lead', seq: 0, subject: 'Magnolia' }],
    );
    expect(buildBoard([opus, magnolia]).map((o) => o.key)).toEqual(['magnolia']);
  });
});

describe('a question that shares a subject transforms the board in place', () => {
  // "Why?" asked with OPUS on the board. The ladder verifies the primary fact
  // first, so the same read runs again — and that is the object being looked
  // at, changed where it stands rather than drawn a second time beneath.
  const OPUS = turn(
    [call(0, 'get_sales',
          { metric: 'net_sales', date_range: 'last_week', filters: { store: 'OPUS' }, group_by: [] },
          [{ store: 'OPUS', value: 555147, change_pct: 30.6 }], { metric_domain: 'retail_sales' })],
    [{ op: 'put', kind: 'hero', key: 'opus', weight: 'lead', seq: 0, subject: 'OPUS' }],
  );
  const WHY = turn(
    [
      call(0, 'get_sales',
           { metric: 'net_sales', date_range: 'last_week', filters: { store: 'OPUS' }, group_by: [] },
           [{ store: 'OPUS', value: 555147, change_pct: 30.6 }], { metric_domain: 'retail_sales' }),
      call(1, 'get_sales',
           { metric: 'transaction_count', date_range: 'last_week', filters: { store: 'OPUS' }, group_by: [] },
           [{ store: 'OPUS', value: 980, change_pct: 21.0 }], { metric_domain: 'retail_sales' }),
    ],
    [
      { op: 'put', kind: 'hero', key: 'opus', weight: 'lead', seq: 0, subject: 'OPUS',
        note: 'up against the week before' },
      { op: 'put', kind: 'figure', key: 'opus-txns', weight: 'supporting', seq: 1, subject: 'OPUS' },
    ],
  );

  it('changes the OPUS finding rather than adding one under it', () => {
    const board = buildBoard([OPUS, WHY]);
    expect(board.filter((o) => o.subject === 'OPUS' && o.kind === 'hero')).toHaveLength(1);
    expect(board.find((o) => o.key === 'opus')?.turn).toBe(1);
    expect(board.map((o) => o.key).sort()).toEqual(['opus', 'opus-txns']);
  });

  it('keeps the board when the question widens to the estate on the same business', () => {
    const board = buildBoard([OPUS, HOW_ARE_WE_DOING]);
    expect(board.map((o) => o.key)).toContain('opus');
  });

  it('keeps the board when an edit only names keys and reads nothing', () => {
    const quieten = turn([], [{ op: 'quiet', key: 'opus' }]);
    expect(buildBoard([OPUS, quieten]).map((o) => o.key)).toEqual(['opus']);
  });
});

describe('the rule itself', () => {
  it('stands still on an empty board and on a turn with no edits', () => {
    expect(travel([HOW_ARE_WE_DOING], [], 0, [{ op: 'put', key: 'a' }], new Set())).toBe('transforms');
    expect(travel([HOW_ARE_WE_DOING], [{ key: 'a' } as never], 0, [], new Set())).toBe('transforms');
  });

  it('does not let a default composition\'s positional keys hold the board', () => {
    // Both defaults key their first read `read-0`. If a key match counted for
    // anything but HIS composition, nothing would ever clear.
    const seeded = (calls: ToolCall[]): AnswerTurn => ({
      ...turn(calls, []),
      composition: undefined,
      defaultComposition: {
        seq: -1, default: true, rejected: [],
        blocks: [{ op: 'put', kind: 'table', key: 'read-0', weight: 'lead', seq: 0 }],
      },
    } as unknown as AnswerTurn);
    const a = seeded([call(0, 'get_sales', { filters: { store: 'OPUS' }, group_by: [] },
                           [{ store: 'OPUS', value: 1 }], { metric_domain: 'retail_sales' })]);
    const b = seeded([call(0, 'get_vending', { machine: 'CMG-1' }, [{ label: 'CMG-1', value: 2 }])]);
    expect(buildBoard([a, b])).toHaveLength(1);
  });
});

describe('earlier turns fold; they do not stack', () => {
  const o = (key: string, touched: number) => ({
    key, kind: 'figure' as const, weight: 'supporting' as const, turn: touched, touched,
  });

  it('folds out what the newest turn did not touch', () => {
    const { shown, earlier } = folded([o('a', 0), o('b', 1), o('c', 1)], 1, {}, null);
    expect(shown.map((x) => x.key)).toEqual(['b', 'c']);
    expect(earlier.map((x) => x.key)).toEqual(['a']);
  });

  it('never folds what was kept, or what is being looked at', () => {
    const board = [o('a', 0), o('b', 0), o('c', 1)];
    const { shown, earlier } = folded(board, 1, { a: { kept: true } }, 'b');
    expect(shown.map((x) => x.key).sort()).toEqual(['a', 'b', 'c']);
    expect(earlier).toHaveLength(0);
  });

  it('does not count what is already set aside — that row says it once', () => {
    const { earlier } = folded([o('a', 0), o('b', 1)], 1, { a: { closed: true } }, null);
    expect(earlier).toHaveLength(0);
  });
});
