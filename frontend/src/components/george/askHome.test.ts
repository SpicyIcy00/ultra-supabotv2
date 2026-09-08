/**
 * Ask as the home of the work: the decisions, held pure.
 */
import { describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import { focusTarget, isWork, lastPostOf, newestOwnThread, withFocus } from './askHome';

const post = (id: string, over: Partial<Post> = {}): Post =>
  ({
    id, thread_id: 't1', parent_id: null, kind: 'answer', author: 'george', author_user: null,
    visibility: 'private', owner_user: 'ice', mine: true, body: 'x', conversation_id: id,
    created_at: `2026-09-08T0${id.length}:00:00+08:00`, notices: [], receipts: null, payload: null, ...over,
  }) as Post;

describe('what is work', () => {
  it('is a question or an answer, and nothing George initiated', () => {
    expect(isWork(post('a', { kind: 'question' }))).toBe(true);
    expect(isWork(post('a', { kind: 'answer' }))).toBe(true);
    for (const kind of ['brief', 'notice', 'workflow_run', 'approval', 'pin_confirmation', 'system'] as const) {
      expect(isWork(post('a', { kind }))).toBe(false);
    }
  });
});

describe('the thread the box continues', () => {
  it('is the newest of the viewer\'s own work', () => {
    const posts = [post('q1', { kind: 'question', thread_id: 't1' }), post('a1', { thread_id: 't1' }),
                   post('q2', { kind: 'question', thread_id: 't2' }), post('a2', { thread_id: 't2' })];
    expect(newestOwnThread(posts)).toBe('t2');
  });

  it('is never a shared exchange of somebody else\'s', () => {
    const posts = [post('a1', { thread_id: 't1' }), post('a9', { thread_id: 'theirs', mine: false, owner_user: 'bob' })];
    expect(newestOwnThread(posts)).toBe('t1');
  });

  it('is null when there is no own work yet, so the first question starts a thread', () => {
    expect(newestOwnThread([])).toBeNull();
    expect(newestOwnThread([post('b', { kind: 'brief', mine: false })])).toBeNull();
  });

  it('names the last post of that thread as the reply\'s parent', () => {
    const posts = [post('q1', { kind: 'question' }), post('a1'), post('q2', { kind: 'question', thread_id: 't2' })];
    expect(lastPostOf(posts, 't1')?.id).toBe('a1');
    expect(lastPostOf(posts, null)).toBeUndefined();
  });
});

describe('a focus into the river', () => {
  it('folds a thread older than the loaded page into the river, once, in time order', () => {
    const river = [post('q5', { created_at: '2026-09-08T05:00:00+08:00' }), post('a5', { created_at: '2026-09-08T06:00:00+08:00' })];
    const older = [post('q1', { thread_id: 'old', created_at: '2026-09-08T01:00:00+08:00' }), post('a1', { thread_id: 'old', created_at: '2026-09-08T02:00:00+08:00' })];
    const merged = withFocus(river, older);
    expect(merged.map((p) => p.id)).toEqual(['q1', 'a1', 'q5', 'a5']);
  });

  it('adds nothing when the thread is already in the river', () => {
    const river = [post('q1'), post('a1')];
    expect(withFocus(river, [post('q1'), post('a1')])).toBe(river);
  });

  it('lands on the first post of the thread', () => {
    const posts = [post('q1', { thread_id: 'x' }), post('a1', { thread_id: 'x' })];
    expect(focusTarget(posts, 'x')).toBe('q1');
    expect(focusTarget(posts, 'nope')).toBeNull();
  });
});
