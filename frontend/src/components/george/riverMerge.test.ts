/**
 * riverMerge: a persisted exchange renders exactly once, and identity is the
 * post id and nothing else.
 */
import { describe, expect, it } from 'vitest';
import type { GeorgeTurn, PostFrame } from '../../types/george';
import type { Post } from '../../types/river';
import { isStoredIn, riverMerge, storedIds } from './riverMerge';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

function post(id: string, body: string, kind: Post['kind'] = 'answer'): Post {
  return {
    id,
    thread_id: 't1',
    parent_id: null,
    kind,
    author: kind === 'question' ? 'user' : 'george',
    author_user: kind === 'question' ? 'ice' : null,
    owner_user: 'ice',
    visibility: 'private',
    mine: true,
    body,
    payload: null,
    receipts: null,
    notices: [],
    conversation_id: 'c1',
    created_at: '2026-09-07T09:00:00+08:00',
  };
}

function question(text: string): GeorgeTurn {
  return { role: 'user', text, at: '2026-09-07T09:00:00+08:00' };
}

function answer(text: string, extra: Partial<AnswerTurn> = {}): AnswerTurn {
  return {
    role: 'george',
    text,
    thinking: '',
    toolCalls: [],
    notices: [],
    pinned: [],
    saved: [],
    at: '2026-09-07T09:00:01+08:00',
    ...extra,
  };
}

function frame(q: string, a: string | null, stored = true): PostFrame {
  return {
    question_post_id: q,
    answer_post_id: a,
    thread_id: 't1',
    conversation_id: 'c1',
    visibility: 'private',
    stored,
  };
}

describe('storedIds', () => {
  it('is empty until a post frame arrives', () => {
    expect(storedIds(answer('…'))).toEqual([]);
  });

  it('is empty when the frame says nothing was stored', () => {
    expect(storedIds(answer('x', { post: frame('q1', 'a1', false) }))).toEqual([]);
  });

  it('names both posts, or only the question when there was no answer', () => {
    expect(storedIds(answer('x', { post: frame('q1', 'a1') }))).toEqual(['q1', 'a1']);
    expect(storedIds(answer('', { post: frame('q1', null) }))).toEqual(['q1']);
  });
});

describe('riverMerge — the invariant', () => {
  it('keeps a turn that is still streaming', () => {
    const turns = [question('sales?'), answer('Net sales were')];
    const { pending } = riverMerge([post('q1', 'sales?', 'question')], turns);
    expect(pending).toEqual(turns);
  });

  it('drops the pair once the river holds the stored copy', () => {
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q1', 'a1') })];
    const posts = [post('q1', 'sales?', 'question'), post('a1', 'Up 4%.')];
    expect(riverMerge(posts, turns).pending).toEqual([]);
  });

  it('drops the pair when only one of the two ids has been fetched', () => {
    // A page boundary can split a pair. The exchange is stored; that is what
    // matters, and the other half arrives with the next page.
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q1', 'a1') })];
    expect(riverMerge([post('a1', 'Up 4%.')], turns).pending).toEqual([]);
  });

  it('keeps the pair until the refetch returns its ids', () => {
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q1', 'a1') })];
    const posts = [post('older', 'something else')];
    expect(riverMerge(posts, turns).pending).toEqual(turns);
  });

  it('keeps a turn whose frame says it was not stored, whatever the river holds', () => {
    // Logging was off or failed. There is no stored copy to defer to, so the
    // live copy is the only record there is.
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q1', 'a1', false) })];
    const posts = [post('q1', 'sales?', 'question'), post('a1', 'Up 4%.')];
    expect(riverMerge(posts, turns).pending).toEqual(turns);
  });

  it('keeps a stopped turn, which will never get a frame', () => {
    const turns = [question('sales?'), answer('Net sales', { cancelled: true })];
    const posts = [post('q1', 'sales?', 'question'), post('a1', 'Net sales')];
    expect(riverMerge(posts, turns).pending).toEqual(turns);
  });

  it('drops a question-only turn when the question post is stored', () => {
    const turns = [question('sales?'), answer('', { post: frame('q1', null), error: 'boom' })];
    expect(riverMerge([post('q1', 'sales?', 'question')], turns).pending).toEqual([]);
  });
});

describe('riverMerge — identity is the id and nothing else', () => {
  it('never matches on text', () => {
    // Same words, different ids: two exchanges, and the live one is not the
    // stored one.
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q9', 'a9') })];
    const posts = [post('q1', 'sales?', 'question'), post('a1', 'Up 4%.')];
    expect(riverMerge(posts, turns).pending).toEqual(turns);
  });

  it('never matches on time', () => {
    const turns = [question('sales?'), answer('Up 4%.', { post: frame('q9', 'a9') })];
    const same = { ...post('a1', 'different words'), created_at: turns[1].at };
    expect(riverMerge([same], turns).pending).toEqual(turns);
  });

  it('isStoredIn is false for a turn with no frame even when a post exists', () => {
    expect(isStoredIn(answer('Up 4%.'), new Set(['a1']))).toBe(false);
  });
});

describe('riverMerge — pairs go together', () => {
  it('keeps a trailing question that has no answer turn yet', () => {
    const turns = [question('sales?')];
    expect(riverMerge([post('q1', 'sales?', 'question')], turns).pending).toEqual(turns);
  });

  it('drops only the stored pair and keeps the rest in order', () => {
    const a = answer('one', { post: frame('q1', 'a1') });
    const b = answer('two');
    const turns = [question('first'), a, question('second'), b];
    const posts = [post('q1', 'first', 'question'), post('a1', 'one')];
    expect(riverMerge(posts, turns).pending).toEqual([question('second'), b]);
  });

  it('returns the posts untouched and in the order given', () => {
    const posts = [post('b', 'later'), post('a', 'earlier')];
    expect(riverMerge(posts, []).posts).toBe(posts);
  });
});
