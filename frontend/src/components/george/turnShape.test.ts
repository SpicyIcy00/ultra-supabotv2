import { describe, expect, it } from 'vitest';
import type { DoneFrame, GeorgeTurn } from '../../types/george';
import {
  activitySummary,
  emphasisOf,
  hasActivity,
  isOver,
  isRunning,
  pinnableCalls,
  workLine,
} from './turnShape';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

const done: DoneFrame = {
  conversation_id: 'c', iterations: 2, tool_calls: 3, status: 'ok',
  notice_forced: false, usage: { input: 1, output: 1, cache_read: 1 }, cache_hit: true,
};

function george(extra: Partial<AnswerTurn> = {}): AnswerTurn {
  return {
    role: 'george', text: 'Up 4%.', thinking: '', toolCalls: [], notices: [],
    pinned: [], saved: [], at: '', ...extra,
  };
}
const user: GeorgeTurn = { role: 'user', text: 'sales?', at: '' };
const call = (seq: number) => ({ seq, tool: 'get_sales', arguments: {} });

describe('emphasis', () => {
  it('gives the newest George turn the focus and every earlier one less', () => {
    const turns = [user, george(), user, george()];
    expect(emphasisOf(1, turns)).toBe('earlier');
    expect(emphasisOf(3, turns)).toBe('latest');
  });

  it('never marks a person’s turn as latest', () => {
    const turns = [user, george(), user];
    expect(emphasisOf(2, turns)).toBe('earlier');
    expect(emphasisOf(1, turns)).toBe('latest');
  });
});

describe('activity', () => {
  it('is running only while THIS turn is the one streaming', () => {
    expect(isRunning(george({ toolCalls: [call(1)] }), true)).toBe(true);
    expect(isRunning(george({ toolCalls: [call(1)] }), false)).toBe(false);
    expect(isRunning(george({ toolCalls: [call(1)], done }), true)).toBe(false);
    expect(isRunning(george({ cancelled: true }), true)).toBe(false);
    expect(isRunning(george({ error: 'x' }), true)).toBe(false);
  });

  it('is over when done, stopped or failed', () => {
    expect(isOver(george())).toBe(false);
    expect(isOver(george({ done }))).toBe(true);
    expect(isOver(george({ cancelled: true }))).toBe(true);
    expect(isOver(george({ error: 'boom' }))).toBe(true);
  });

  it('summarises with known counts only', () => {
    expect(activitySummary(george({ toolCalls: [call(1), call(2), call(3)], done })))
      .toBe('3 calls · 2 iterations · cache hit');
    expect(activitySummary(george({ toolCalls: [call(1)] }))).toBe('1 call');
    expect(activitySummary(george({ toolCalls: [call(1)], thinking: 'hm' }))).toBe('1 call · reasoning');
  });

  it('says stopped rather than reporting a finished count', () => {
    const s = activitySummary(george({ toolCalls: [call(1)], cancelled: true }));
    expect(s.startsWith('stopped')).toBe(true);
    expect(s).not.toContain('iteration');
  });

  it('knows when there is nothing to disclose', () => {
    expect(hasActivity(george())).toBe(false);
    expect(hasActivity(george({ toolCalls: [call(1)] }))).toBe(true);
    expect(hasActivity(george({ thinking: 'x' }))).toBe(true);
    expect(hasActivity(george({ done }))).toBe(true);
    // Narration — what he said before a read — is activity too, and blank
    // narration is not.
    expect(hasActivity(george({ narration: 'Rockwell is down; checking the drivers.' }))).toBe(true);
    expect(hasActivity(george({ narration: '  ' }))).toBe(false);
  });
});

describe('workLine — what George did, in words', () => {
  const result = (rows: number) => ({
    row_count: rows, source_table: 't', truncated: false, duration_ms: 1, error: null,
  });

  it('is the present tense while the turn runs', () => {
    const turn = george({ toolCalls: [call(1)] });
    expect(workLine(turn, true)).toBe('Reading sales…');
  });

  it('names what is still in flight rather than what already came back', () => {
    const turn = george({
      toolCalls: [
        { ...call(1), result: result(7) },
        { seq: 2, tool: 'get_stock', arguments: {} },
      ],
    });
    expect(workLine(turn, true)).toBe('Counting stock…');
  });

  it('is the past tense with a row count once the turn is over', () => {
    const turn = george({
      toolCalls: [{ ...call(1), result: result(7) }],
      done,
    });
    expect(workLine(turn, false)).toBe('Read sales — 7 rows');
  });

  it('adds the counts of every call that came back, and no others', () => {
    const turn = george({
      toolCalls: [
        { ...call(1), result: result(7) },
        { seq: 2, tool: 'get_stock', arguments: {},
          result: { ...result(999), error: 'refused' } },
      ],
      done,
    });
    // The refused call contributed no rows and must contribute no count.
    expect(workLine(turn, false)).toBe('Read sales and counted stock — 7 rows');
  });

  it('says stopped rather than a finished-sounding sentence', () => {
    const turn = george({ toolCalls: [call(1)], cancelled: true });
    expect(workLine(turn, false)).toBe('Stopped after: read sales');
  });

  it('says so when an answer read nothing at all', () => {
    expect(workLine(george({ done }), false)).toBe('Answered without reading anything');
    expect(workLine(george({ thinking: 'hm', done }), false)).toBe('Thought about it');
  });

  it('names an unknown tool plainly rather than describing it wrongly', () => {
    const turn = george({ toolCalls: [{ seq: 1, tool: 'get_something_new', arguments: {} }], done });
    expect(workLine(turn, false)).toBe('Get_something_new');
  });

  it('never prints a business figure — a row count is a fact about the query', () => {
    const turn = george({ toolCalls: [{ ...call(1), result: result(3) }], done });
    expect(workLine(turn, false)).not.toMatch(/₱/);
  });
});

describe('what a live turn may pin', () => {
  const call = (seq: number, tool: string, pinnable?: boolean) => ({
    seq, tool, arguments: { a: seq },
    result: { row_count: 1, source_table: 't', truncated: false, duration_ms: 1, error: null, pinnable },
  });

  it('keeps the calls the loop marked pinnable and drops the rest', () => {
    const calls = [call(1, 'get_sales', true), call(2, 'view_page', false), call(3, 'run_workflow', false)];
    expect(pinnableCalls(calls)).toEqual([{ tool: 'get_sales', arguments: { a: 1 } }]);
  });

  it('keeps a call from an older backend that carries no flag', () => {
    expect(pinnableCalls([call(1, 'get_stock')])).toEqual([{ tool: 'get_stock', arguments: { a: 1 } }]);
  });

  it('decides from the flag, never from the name', () => {
    // A read tool the loop refused is not pinnable; a name alone says nothing.
    expect(pinnableCalls([call(1, 'get_sales', false)])).toEqual([]);
  });
});

describe('a page read in the work line', () => {
  it('is named as a deed but its pins are not counted as rows', () => {
    const turn = {
      role: 'george' as const, text: 'x', thinking: '', notices: [], pinned: [], saved: [],
      at: '2026-09-07T09:00:00+08:00',
      done: { conversation_id: 'c', iterations: 1, tool_calls: 2, status: 'ok',
        notice_forced: false, usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false },
      toolCalls: [
        { seq: 1, tool: 'view_page', arguments: {},
          result: { row_count: 5, source_table: 'george.pins', truncated: false,
            duration_ms: 1, error: null, pinnable: false } },
        { seq: 2, tool: 'get_sales', arguments: {},
          result: { row_count: 7, source_table: 'new_transactions', truncated: false,
            duration_ms: 1, error: null, pinnable: true } },
      ],
    };
    expect(workLine(turn, false)).toBe('Read the page and read sales — 7 rows');
  });
});

describe('workLine — from the arguments, and duplicates', () => {
  const result = (rows: number) => ({
    row_count: rows, source_table: 't', truncated: false, duration_ms: 1, error: null,
  });
  const compared = (seq: number, metric: string) => ({
    seq, tool: 'get_sales',
    arguments: { metric, compare_to: 'previous_period', filters: { store: 'Rockwell' }, group_by: [] },
  });

  it('describes a running round from the calls it is made of', () => {
    const turn = george({ toolCalls: [compared(1, 'transaction_count'), compared(2, 'average_transaction_value')] });
    expect(workLine(turn, true)).toBe('Comparing transactions and ATP at Rockwell…');
  });

  it('describes a finished round the same way, in the past', () => {
    const turn = george({
      toolCalls: [
        { ...compared(1, 'net_sales'), result: result(1) },
        { ...compared(2, 'transaction_count'), result: result(1) },
      ],
      done,
    });
    expect(workLine(turn, false)).toBe('Compared sales and transactions at Rockwell — 2 rows');
  });

  it('leaves a duplicate out of the line and out of the row count', () => {
    const turn = george({
      toolCalls: [
        { ...compared(1, 'net_sales'), result: result(7) },
        { ...compared(2, 'net_sales'), duplicate_of: 1, result: result(7) },
      ],
      done,
    });
    expect(workLine(turn, false)).toBe('Compared sales at Rockwell — 7 rows');
    expect(activitySummary(turn)).toBe('2 calls · 1 not re-read · 2 iterations · cache hit');
  });
});
