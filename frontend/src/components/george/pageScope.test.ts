import { describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import {
  pageScopeFor,
  sameScope,
  scopeForAsk,
  scopeLabel,
  storedPageContext,
  threadScope,
} from './pageScope';
import { UNGROUPED_NAME } from './pageShape';

function post(over: Partial<Post> & { id: string }): Post {
  return {
    thread_id: 't', parent_id: null, kind: 'answer', author: 'george', author_user: null,
    owner_user: 'ice', visibility: 'private', mine: true, body: 'x', payload: null,
    receipts: null, notices: [], conversation_id: null,
    created_at: '2026-09-07T09:00:00+08:00', ...over,
  };
}

const read = (page: string | null) => ({
  page, read_at: '2026-09-07T09:00:00+08:00', figures: true, pins_total: 2,
  pins_inspected: 2, pins_reproduced: 2, pins: [], not_inspected: [], unavailable: [],
  partial: false, truncated: false, rows_dropped: 0, notice_kinds: [],
});

describe('a scope is an identity', () => {
  it('is the page name, or null for the ungrouped pins', () => {
    expect(pageScopeFor('AJI BARN Reorder')).toEqual({ name: 'AJI BARN Reorder' });
    expect(pageScopeFor(null)).toEqual({ name: null });
  });

  it('never carries the word Ungrouped as an identity', () => {
    expect(JSON.stringify(pageScopeFor(null))).not.toContain(UNGROUPED_NAME);
    // The word is how the UI SAYS null, and nothing else.
    expect(scopeLabel({ name: null })).toBe(UNGROUPED_NAME);
    expect(scopeLabel({ name: 'Ungrouped' })).toBe('Ungrouped');
    expect(sameScope({ name: null }, { name: 'Ungrouped' })).toBe(false);
  });

  it('compares by name and treats null as its own scope', () => {
    expect(sameScope({ name: 'A' }, { name: 'A' })).toBe(true);
    expect(sameScope({ name: 'A' }, { name: 'a' })).toBe(false);
    expect(sameScope({ name: null }, { name: null })).toBe(true);
    expect(sameScope(null, { name: null })).toBe(false);
    expect(sameScope(null, null)).toBe(true);
  });
});

describe('the scope a question is sent with', () => {
  it('binds a new thread to what was asked for', () => {
    expect(scopeForAsk(null, null, { name: 'A' })).toEqual({ name: 'A' });
    expect(scopeForAsk(null, null, { name: null })).toEqual({ name: null });
  });

  it('is nothing on a fresh Ask that asked for nothing', () => {
    expect(scopeForAsk(null, null, undefined)).toBeNull();
    expect(scopeForAsk(null, null, null)).toBeNull();
  });

  it('is the thread’s inside a thread, whatever was asked for', () => {
    expect(scopeForAsk('t1', { name: 'A' }, undefined)).toEqual({ name: 'A' });
    expect(scopeForAsk('t1', { name: 'A' }, { name: 'B' })).toEqual({ name: 'A' });
    // A thread that never had a page does not acquire one mid-way.
    expect(scopeForAsk('t1', null, { name: 'B' })).toBeNull();
  });
});

describe('recovering a thread’s scope from its stored answers', () => {
  it('reads the page George recorded on his answer, and nothing else', () => {
    const a = post({ id: 'a', payload: { page_context: read('AJI BARN Reorder') } });
    expect(storedPageContext(a)?.page).toBe('AJI BARN Reorder');
    expect(threadScope([a])).toEqual({ name: 'AJI BARN Reorder' });
  });

  it('recovers the ungrouped scope as null, not as a word', () => {
    const a = post({ id: 'a', payload: { page_context: read(null) } });
    expect(threadScope([a])).toEqual({ name: null });
  });

  it('is nothing for a thread whose answers read no page', () => {
    const plain = post({ id: 'a', payload: { charted: [], calls: [] } });
    const older = post({ id: 'b', payload: null });
    expect(threadScope([older, plain])).toBeNull();
  });

  it('takes the newest page-aware answer', () => {
    const first = post({ id: 'a', payload: { page_context: read('A') } });
    const later = post({ id: 'b', payload: { page_context: read('A') },
      created_at: '2026-09-07T10:00:00+08:00' });
    const plain = post({ id: 'c', payload: null, created_at: '2026-09-07T11:00:00+08:00' });
    expect(threadScope([first, later, plain])).toEqual({ name: 'A' });
  });

  it('ignores a question post and a malformed payload', () => {
    const q = post({ id: 'q', author: 'user', kind: 'question',
      payload: { page_context: read('A') } });
    const bad = post({ id: 'b', payload: { page_context: { page: 7 } } });
    const noPage = post({ id: 'n', payload: { page_context: { pins: [] } } });
    expect(threadScope([q, bad, noPage])).toBeNull();
  });

  it('never parses the display string', () => {
    // A payload that only knows the context label yields no scope: the label
    // is not an identity, and "Pages / Ungrouped" is not a page called that.
    const labelled = post({ id: 'l', payload: { page_context_label: 'Pages / Ungrouped' } });
    expect(threadScope([labelled])).toBeNull();
  });
});
