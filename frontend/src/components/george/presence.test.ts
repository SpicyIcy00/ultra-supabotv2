/**
 * presence: the mark shows real states only, and the queue never touches it.
 */
import { describe, expect, it } from 'vitest';
import type { GeorgeState, GeorgeTurn } from '../../types/george';
import { attentionAccent } from './approvalState';
import { MARK_LABEL, markClass, markPath, MARK_PATH } from './markState';
import { liveActivity, presenceState } from './presence';

const STATES: GeorgeState[] = ['idle', 'listening', 'thinking', 'running', 'answering', 'error'];

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

  it('returns only states the mark already has a drawing and a label for', () => {
    for (const state of STATES) {
      for (const composer of ['idle', 'focused', 'drafting'] as const) {
        const out = presenceState({ state, composer });
        expect(STATES).toContain(out);
        expect(MARK_LABEL[out]).toBeTruthy();
        expect(markClass(out)).toBe(`george-mark george-mark--${out}`);
      }
    }
  });

  it('has no input from the approval queue at all', () => {
    // The queue is a badge beside the mark. A count of any size changes
    // nothing here, and the mark's drawing changes only for an error.
    for (const count of [null, 0, 1, 7]) {
      expect(attentionAccent(count)).toBe(count !== null && count > 0);
      expect(presenceState({ state: 'idle', composer: 'idle' })).toBe('idle');
    }
    expect(markPath('idle')).toBe(MARK_PATH);
    expect(markPath('listening')).toBe(MARK_PATH);
  });
});

function george(extra: Partial<Extract<GeorgeTurn, { role: 'george' }>> = {}): GeorgeTurn {
  return {
    role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
    pinned: [], saved: [], at: '2026-09-07T09:00:00+08:00', ...extra,
  };
}

describe('liveActivity', () => {
  it('is empty when there is no turn, or the newest is the person’s', () => {
    expect(liveActivity([])).toEqual({ running: [], lastResult: null, thinking: '', toolResults: 0 });
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
    expect(live.running).toEqual(['get_stock']);
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
