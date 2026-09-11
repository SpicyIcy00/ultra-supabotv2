import { describe, expect, it } from 'vitest';
import { attentionRow, decisionFor, leftBehind } from './decisions';
import type { BoardObject } from './board';
import type { AnswerTurn } from './data';

// A GESTURE ON AN AGENDA ROW IS A DECISION; the same gesture on any other
// object is arranging the board. The difference is decided from the read
// behind the object, never from its key or its kind.
const attention = {
  seq: 0, tool: 'get_attention', arguments: {},
  result: {
    rows: [
      { identity: 'sales_vs_same_weekday|OPUS|', source: 'sales_vs_same_weekday', subject: 'OPUS', change: -30000 },
      { identity: 'stock_crossed_out|Aji Mix|OPUS', source: 'stock_crossed_out', subject: 'Aji Mix', store: 'OPUS', was: 40 },
    ],
    meta: { snapshot_timestamp: '2026-09-12T06:00:00+08:00' },
  },
};
const sales = { seq: 1, tool: 'get_sales', arguments: { group_by: ['store'] },
                result: { rows: [{ store: 'OPUS', value: 1 }], meta: {} } };
const answers = [{ toolCalls: [attention, sales] }] as unknown as AnswerTurn[];
const obj = (key: string, seq: number, subject?: string) =>
  ({ key, kind: 'subject', weight: 'lead', seq, turn: 0, subject, touched: 0 }) as unknown as BoardObject;

describe('what a gesture is about', () => {
  it('finds the agenda row an object is scoped to, with when it was raised', () => {
    const found = attentionRow(answers, obj('opus', 0, 'OPUS'));
    expect(found?.row.identity).toBe('sales_vs_same_weekday|OPUS|');
    expect(found?.raisedAt).toBe('2026-09-12T06:00:00+08:00');
  });

  it('is nothing for an object on any other read, or one with no subject', () => {
    expect(attentionRow(answers, obj('shops', 1, 'OPUS'))).toBeNull();
    expect(attentionRow(answers, obj('all', 0))).toBeNull();
    expect(attentionRow(answers, obj('ghost', 0, 'Rockwell'))).toBeNull();
  });

  it('makes a decision carry the identity the tool wrote and the thread it happened in', () => {
    expect(decisionFor(answers, obj('mix', 0, 'Aji Mix'), 'kept', 't1')).toEqual({
      what: 'stock_crossed_out|Aji Mix|OPUS', source: 'stock_crossed_out', subject: 'Aji Mix',
      outcome: 'kept', raised_at: '2026-09-12T06:00:00+08:00', thread_id: 't1',
    });
    expect(decisionFor(answers, obj('shops', 1, 'OPUS'), 'kept', 't1')).toBeNull();
  });

  it('names what was put away untouched as left, once each, and never what was already decided', () => {
    const board = [obj('opus', 0, 'OPUS'), obj('opus-again', 0, 'OPUS'), obj('mix', 0, 'Aji Mix'), obj('shops', 1, 'OPUS')];
    const left = leftBehind(answers, board, new Set(['stock_crossed_out|Aji Mix|OPUS']), 't1');
    expect(left.map((d) => [d.what, d.outcome])).toEqual([['sales_vs_same_weekday|OPUS|', 'left']]);
  });
});
