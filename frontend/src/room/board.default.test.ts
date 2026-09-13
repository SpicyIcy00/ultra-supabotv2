/**
 * The board fills when the data lands, and George's composition transforms it
 * rather than replacing it (P1.b, 2026-09-13).
 *
 * The loop composes a default the moment the reads return
 * (agent/default_composition.py) and sends it on the `compose` frame with
 * `default: true`. What the fold has to do with it is the whole of this file:
 *
 *   - draw it, so an object is on screen a round trip earlier than before;
 *   - apply his blocks ON TOP of it when they arrive, so the board transforms
 *     instead of being swapped out from under the person;
 *   - drop the default over any read he composed over himself — BY SEQ,
 *     because he never sees the default's keys and cannot name one;
 *   - keep the default over a read he did not mention, exactly as any object
 *     he does not mention stays.
 *
 * And one thing it must not do: a default must never outrank what he decided.
 */
import { describe, expect, it } from 'vitest';
import type { CompositionBlock, GeorgeTurn, ToolCall } from '../types/george';
import { buildBoard } from './board';
import type { AnswerTurn } from './data';

const call = (seq: number, tool = 'get_sales', args: Record<string, unknown> = {}): ToolCall => ({
  seq, tool, arguments: args,
  result: {
    row_count: 1, source_table: 'sales', truncated: false, duration_ms: 1, error: null,
    rows: [{ store: 'Rockwell', value: 412884 }], rows_complete: true, meta: {},
  },
} as unknown as ToolCall);

const turn = (over: Partial<AnswerTurn>): AnswerTurn => ({
  role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
  pinned: [], saved: [], pageChanges: [], at: '2026-09-13T00:00:00Z',
  ...over,
} as unknown as GeorgeTurn as AnswerTurn);

const frame = (blocks: CompositionBlock[], isDefault = false) =>
  ({ seq: -1, blocks, rejected: [], ...(isDefault ? { default: true } : {}) });

const seeded: CompositionBlock[] = [
  { op: 'put', kind: 'figure', key: 'read-0', weight: 'lead', seq: 0, subject: 'Rockwell' },
  { op: 'put', kind: 'table', key: 'read-1', weight: 'quiet', seq: 1 },
];

describe('the board before George has spoken', () => {
  it('holds the default the loop composed, in the shape it named', () => {
    const board = buildBoard([turn({
      toolCalls: [call(0), call(1, 'get_stock')],
      defaultComposition: frame(seeded, true),
    })]);
    expect(board.map((o) => [o.key, o.kind, o.weight])).toEqual([
      ['read-1', 'table', 'quiet'],
      ['read-0', 'figure', 'lead'],
    ]);
  });

  it('is what the room draws instead of a pile of quiet tables', () => {
    // Without a default, a turn mid-flight falls back to one quiet table per
    // read and nothing leads. That fallback is still there for a turn stored
    // before this existed; it is no longer what a live turn shows.
    const plain = buildBoard([turn({ toolCalls: [call(0)] })]);
    expect(plain.map((o) => [o.kind, o.weight])).toEqual([['table', 'quiet']]);
  });
});

describe('when George composes', () => {
  it('his block replaces the default over the same read, and his leads', () => {
    const board = buildBoard([turn({
      toolCalls: [call(0), call(1, 'get_stock')],
      defaultComposition: frame(seeded, true),
      composition: frame([
        { op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 0, subject: 'Rockwell' },
      ]),
    })]);
    expect(board.map((o) => o.key)).not.toContain('read-0');
    const lead = board.filter((o) => o.weight === 'lead');
    expect(lead.map((o) => [o.key, o.kind])).toEqual([['rockwell', 'hero']]);
  });

  it('keeps the default over a read he did not mention', () => {
    const board = buildBoard([turn({
      toolCalls: [call(0), call(1, 'get_stock')],
      defaultComposition: frame(seeded, true),
      composition: frame([
        { op: 'put', kind: 'hero', key: 'rockwell', weight: 'lead', seq: 0, subject: 'Rockwell' },
      ]),
    })]);
    expect(board.find((o) => o.key === 'read-1')?.weight).toBe('quiet');
  });

  it('supersedes by seq through a composed shape too', () => {
    // A spec names its reads in `seqs`, not `seq`. A default left standing
    // under a shape that already draws that read is the same object twice.
    const board = buildBoard([turn({
      toolCalls: [call(0), call(1, 'get_stock')],
      defaultComposition: frame(seeded, true),
      composition: frame([{
        op: 'put', key: 'shape', weight: 'lead', seqs: [0, 1],
        spec: { layout: 'stack', children: [{ mark: 'value', seq: 0, field: 'value' }] },
      }]),
    })]);
    expect(board.map((o) => o.key)).toEqual(['shape']);
  });

  it('a default never outranks him: only one thing leads, and it is his', () => {
    const board = buildBoard([turn({
      toolCalls: [call(0), call(1, 'get_stock')],
      defaultComposition: frame(seeded, true),
      composition: frame([
        { op: 'put', kind: 'table', key: 'stock', weight: 'lead', seq: 1 },
      ]),
    })]);
    expect(board.filter((o) => o.weight === 'lead').map((o) => o.key)).toEqual(['stock']);
  });
});
