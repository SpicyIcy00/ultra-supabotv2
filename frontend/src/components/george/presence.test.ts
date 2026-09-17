/**
 * presence: the mark shows real states only, and the queue never touches it.
 */
import { describe, expect, it } from 'vitest';
import type { GeorgeState, GeorgeTurn } from '../../types/george';
import { attentionAccent } from './approvalState';
import { liveActivity, presenceState } from './presence';

const STATES: GeorgeState[] = [
  'idle', 'listening', 'thinking', 'running', 'answering', 'building', 'complete', 'error',
];

describe('presenceState', () => {
  it('is the stream state whenever a turn is in flight', () => {
    for (const state of ['thinking', 'running', 'answering'] as GeorgeState[]) {
      expect(presenceState({ state, composer: 'idle' })).toBe(state);
      expect(presenceState({ state, composer: 'focused' })).toBe(state);
      expect(presenceState({ state, composer: 'drafting' })).toBe(state);
    }
  });

  it('listens when the person addresses the composer and George is at rest', () => {
    expect(presenceState({ state: 'idle', composer: 'focused' })).toBe('listening');
    expect(presenceState({ state: 'idle', composer: 'drafting' })).toBe('listening');
    expect(presenceState({ state: 'idle', composer: 'idle' })).toBe('idle');
  });

  it('lifts an error when the person starts to type', () => {
    expect(presenceState({ state: 'error', composer: 'idle' })).toBe('error');
    expect(presenceState({ state: 'error', composer: 'drafting' })).toBe('listening');
  });

  it('returns only states the presence knows', () => {
    for (const state of STATES) {
      for (const composer of ['idle', 'focused', 'drafting'] as const) {
        const out = presenceState({ state, composer });
        expect(STATES).toContain(out);
      }
    }
  });

  it('builds only when whole results have already landed', () => {
    // The signal is rows on their way to the screen, not a flattering word for
    // a longer `answering`.
    expect(presenceState({ state: 'answering', composer: 'idle', figures: 0 })).toBe('answering');
    expect(presenceState({ state: 'answering', composer: 'idle', figures: 2 })).toBe('building');
  });

  it('never builds out of a state that is not answering', () => {
    for (const state of ['thinking', 'running', 'complete', 'idle'] as GeorgeState[]) {
      expect(presenceState({ state, composer: 'idle', figures: 3 })).not.toBe('building');
    }
  });

  it('keeps building while the person types — a turn in flight is the louder fact', () => {
    expect(presenceState({ state: 'answering', composer: 'drafting', figures: 2 })).toBe('building');
  });

  it('lets a person interrupt the settle after a finished turn', () => {
    expect(presenceState({ state: 'complete', composer: 'idle' })).toBe('complete');
    expect(presenceState({ state: 'complete', composer: 'drafting' })).toBe('listening');
  });

  it('has no input from the approval queue at all', () => {
    // The queue is a badge beside the mark. A count of any size changes
    // nothing here, and the mark's drawing changes only for an error.
    for (const count of [null, 0, 1, 7]) {
      expect(attentionAccent(count)).toBe(count !== null && count > 0);
      expect(presenceState({ state: 'idle', composer: 'idle' })).toBe('idle');
    }
  });
});

function george(extra: Partial<Extract<GeorgeTurn, { role: 'george' }>> = {}): GeorgeTurn {
  return {
    role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
    pinned: [], saved: [], pageChanges: [], at: '2026-09-07T09:00:00+08:00', ...extra,
  };
}

describe('liveActivity', () => {
  it('is empty when there is no turn, or the newest is the person’s', () => {
    expect(liveActivity([])).toEqual({
      running: [], lastResult: null, completed: [], thinking: '', toolResults: 0, figures: 0,
    });
    expect(liveActivity([{ role: 'user', text: 'x', at: '' }]).running).toEqual([]);
  });

  it('names the calls in flight and the newest result, from the frames', () => {
    const turn = george({
      thinking: 'Looking at last week.',
      toolCalls: [
        { seq: 1, tool: 'get_sales', arguments: {}, result: { row_count: 7, source_table: 't', truncated: false, duration_ms: 3, error: null } },
        { seq: 2, tool: 'get_stock', arguments: {} },
        { seq: 3, tool: 'get_purchasing', arguments: {}, result: { row_count: 0, source_table: 'p', truncated: false, duration_ms: 3, error: null } },
      ],
    });
    const live = liveActivity([turn]);
    expect(live.running).toEqual([{ tool: 'get_stock', arguments: {} }]);
    expect(live.lastResult).toEqual({ tool: 'get_purchasing', rowCount: 0, error: null });
    expect(live.thinking).toBe('Looking at last week.');
    expect(live.toolResults).toBe(2);
  });

  it('goes quiet once the turn is done or was stopped', () => {
    const calls = [{ seq: 1, tool: 'get_sales', arguments: {} }];
    expect(liveActivity([george({ toolCalls: calls, done: { conversation_id: 'c', iterations: 1, tool_calls: 1, status: 'ok', notice_forced: false, usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false } })]).running).toEqual([]);
    expect(liveActivity([george({ toolCalls: calls, cancelled: true })]).running).toEqual([]);
  });
});

describe('liveActivity.figures', () => {
  const call = (seq: number, over: Record<string, unknown>) => ({
    seq,
    tool: 'get_sales',
    arguments: {},
    result: {
      row_count: 1, source_table: 't', truncated: false, duration_ms: 3, error: null,
      rows: [{ value: 1 }], rows_complete: true, ...over,
    },
  });

  it('counts only results that will actually be drawn', () => {
    const turn = george({
      toolCalls: [
        call(1, {}),                                   // whole, drawn
        call(2, { error: 'refused' }),                 // refused, never drawn
        call(3, { rows: [], rows_complete: true }),    // empty, not a zero
        call(4, { rows_complete: false, rows: [] }),   // could not be sent whole
      ] as never,
    });
    const live = liveActivity([turn]);
    expect(live.toolResults).toBe(4);
    expect(live.figures).toBe(1);
  });

  it('is zero for a turn whose calls all failed, so nothing claims to be building', () => {
    const turn = george({ toolCalls: [call(1, { error: 'refused' })] as never });
    expect(liveActivity([turn]).figures).toBe(0);
  });
});
