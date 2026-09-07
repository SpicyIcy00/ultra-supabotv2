import { describe, expect, it } from 'vitest';
import type { DoneFrame, GeorgeTurn } from '../../types/george';
import { activitySummary, emphasisOf, hasActivity, isOver, showsActivity } from './turnShape';

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
  it('is shown in full only while THIS turn is running', () => {
    expect(showsActivity(george({ toolCalls: [call(1)] }), true)).toBe(true);
    expect(showsActivity(george({ toolCalls: [call(1)] }), false)).toBe(false);
    expect(showsActivity(george({ toolCalls: [call(1)], done }), true)).toBe(false);
    expect(showsActivity(george({ cancelled: true }), true)).toBe(false);
    expect(showsActivity(george({ error: 'x' }), true)).toBe(false);
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
  });
});
