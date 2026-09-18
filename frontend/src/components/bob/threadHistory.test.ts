import { describe, expect, it } from 'vitest';
import type { ChatDetail } from '../../types/chats';
import type { Post } from '../../types/river';
import { toHistory } from '../../hooks/useBobStream';
import { threadHistory } from './threadHistory';

const T = 'thread-1';

function post(over: Partial<Post> & { id: string; body: string }): Post {
  return {
    thread_id: T, parent_id: null, kind: 'answer', author: 'bob', author_user: null,
    owner_user: null, visibility: 'org', mine: false, payload: null, receipts: null,
    notices: [], conversation_id: null, created_at: '2026-09-07T06:00:00+08:00', ...over,
  };
}

const brief = post({
  id: 'b', body: 'Fairview was 41% below the same Saturday.', kind: 'brief',
  receipts: { source_table: 'new_transactions' },
  notices: [{ kind: 'snapshot_gaps', message: 'Gaps.' }],
  payload: { charted: [{ seq: 1, tool: 'get_brief', rows: [{ value: 1 }], meta: {} }] },
});
const q1 = post({ id: 'q1', body: 'Which categories?', kind: 'question', author: 'user',
  author_user: 'ice', owner_user: 'ice', visibility: 'private', mine: true,
  conversation_id: 'c1', created_at: '2026-09-07T09:00:00+08:00' });
const a1 = post({ id: 'a1', body: 'Confectionery.', owner_user: 'ice', visibility: 'private',
  mine: true, conversation_id: 'c1', created_at: '2026-09-07T09:00:05+08:00' });

const chat: ChatDetail = {
  thread_id: T, title: 'Which categories?', turns: [
    { role: 'user', text: 'Which categories?', at: '2026-09-07T09:00:00+08:00' },
    { role: 'bob', text: 'Confectionery.', at: '2026-09-07T09:00:05+08:00', thinking: null,
      tool_calls: [{ seq: 1, tool: 'get_sales', arguments: { store: 'Fairview' },
        result: { row_count: 3, source_table: 't', truncated: false, duration_ms: 1, error: null } }],
      notices: null, pinned: null, receipts: null, error: null,
      done: { conversation_id: 'c1', iterations: 1, tool_calls: 1, status: 'ok',
        notice_forced: false, usage: { input: 0, output: 0, cache_read: 0 }, cache_hit: false } },
  ],
};

describe('a Bob post', () => {
  it('becomes a text-only turn with no tool calls', () => {
    const [turn] = threadHistory([brief], null, T);
    expect(turn.role).toBe('bob');
    if (turn.role !== 'bob') return;
    expect(turn.text).toBe(brief.body);
    expect(turn.toolCalls).toEqual([]);
    expect(turn.notices).toEqual(brief.notices);
    expect(turn.receipts).toEqual(brief.receipts);
    // And so sends no calls as history — nothing to pin, nothing invented.
    expect(toHistory([turn])).toEqual([{ role: 'bob', text: brief.body, tool_calls: [] }]);
  });

  it('names the post it came from, so it is never drawn twice', () => {
    const [turn] = threadHistory([brief], null, T);
    if (turn.role !== 'bob') throw new Error('expected bob');
    expect(turn.post?.answer_post_id).toBe(brief.id);
  });
});

describe('the caller’s own chat', () => {
  it('supplies the calls behind its answers, and names its posts', () => {
    const turns = threadHistory([brief, q1, a1], chat, T);
    expect(turns.map((t) => t.role)).toEqual(['bob', 'user', 'bob']);
    const answer = turns[2];
    if (answer.role !== 'bob') throw new Error('expected bob');
    expect(answer.toolCalls[0].arguments).toEqual({ store: 'Fairview' });
    expect(answer.post).toMatchObject({ question_post_id: 'q1', answer_post_id: 'a1', stored: true });
    // Only calls that succeeded travel, with their arguments.
    expect(toHistory(turns)[2].tool_calls).toEqual([{ tool: 'get_sales', arguments: { store: 'Fairview' } }]);
  });

  it('is not duplicated by the posts of the same exchange', () => {
    const turns = threadHistory([brief, q1, a1], chat, T);
    expect(turns).toHaveLength(3);
  });
});

describe('somebody else’s shared exchange', () => {
  it('travels as text, without their tool calls', () => {
    const q2 = post({ ...q1, id: 'q2', conversation_id: 'c2', author_user: 'kim', owner_user: 'kim',
      mine: false, body: 'And Rockwell?', created_at: '2026-09-07T10:00:00+08:00' });
    const a2 = post({ ...a1, id: 'a2', conversation_id: 'c2', owner_user: 'kim', mine: false,
      body: 'Up.', created_at: '2026-09-07T10:00:05+08:00' });
    const turns = threadHistory([brief, q2, a2], null, T);
    expect(turns.map((t) => t.text)).toEqual([brief.body, 'And Rockwell?', 'Up.']);
    const answer = turns[2];
    if (answer.role !== 'bob') throw new Error('expected bob');
    expect(answer.toolCalls).toEqual([]);
    expect(answer.post).toMatchObject({ question_post_id: 'q2', answer_post_id: 'a2' });
  });
});

describe('order', () => {
  it('is by time across both sources', () => {
    const late = post({ id: 'n', body: 'Later.', kind: 'notice', created_at: '2026-09-07T12:00:00+08:00' });
    const turns = threadHistory([brief, q1, a1, late], chat, T);
    expect(turns.map((t) => t.text)).toEqual([brief.body, 'Which categories?', 'Confectionery.', 'Later.']);
  });
});
