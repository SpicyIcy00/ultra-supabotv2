import { describe, expect, it } from 'vitest';
import type { Post } from '../../types/river';
import {
  pageScopeFor,
  retitled,
  sameScope,
  scopeForAsk,
  scopeForRequest,
  scopeLabel,
  storedPageContext,
  threadScope,
} from './pageScope';
import { UNGROUPED_NAME } from './pageShape';

function post(over: Partial<Post> & { id: string }): Post {
  return {
    thread_id: 't', parent_id: null, kind: 'answer', author: 'bob', author_user: null,
    owner_user: 'ice', visibility: 'private', mine: true, body: 'x', payload: null,
    receipts: null, notices: [], conversation_id: null,
    created_at: '2026-09-07T09:00:00+08:00', ...over,
  };
}

/** An answer's page_context as written SINCE 2026-09-08: identity beside title. */
const read = (pageId: string | null, page: string | null) => ({
  page_id: pageId, page, read_at: '2026-09-07T09:00:00+08:00', figures: true, pins_total: 2,
  pins_inspected: 2, pins_reproduced: 2, pins: [], not_inspected: [], unavailable: [],
  partial: false, truncated: false, rows_dropped: 0, notice_kinds: [],
});

/** An answer's page_context as written BEFORE 2026-09-08: title only. */
const legacyRead = (page: string | null) => {
  const { page_id: _omitted, ...rest } = read(null, page);
  void _omitted;
  return rest;
};

const PAGES = [{ id: 'p-reorder', title: 'AJI BARN Reorder' }, { id: 'p-fame', title: 'Fame' }];

describe('a scope is an identity', () => {
  it('is the page id with its title beside it, or a null id for the ungrouped pins', () => {
    expect(pageScopeFor('p-reorder', 'AJI BARN Reorder'))
      .toEqual({ page_id: 'p-reorder', title: 'AJI BARN Reorder' });
    expect(pageScopeFor(null, null)).toEqual({ page_id: null, title: null });
    // Ungrouped never carries a title, whatever it was handed.
    expect(pageScopeFor(null, 'Ungrouped')).toEqual({ page_id: null, title: null });
  });

  it('never carries the word Ungrouped as an identity', () => {
    expect(JSON.stringify(pageScopeFor(null, null))).not.toContain(UNGROUPED_NAME);
    expect(scopeLabel({ page_id: null, title: null })).toBe(UNGROUPED_NAME);
    // A page genuinely CALLED Ungrouped is a page, by id.
    expect(scopeLabel({ page_id: 'p-u', title: 'Ungrouped' })).toBe('Ungrouped');
    expect(sameScope({ page_id: null, title: null }, { page_id: 'p-u', title: 'Ungrouped' })).toBe(false);
  });

  it('compares by id — a title is presentation and is not compared', () => {
    expect(sameScope({ page_id: 'a', title: 'A' }, { page_id: 'a', title: 'A renamed' })).toBe(true);
    expect(sameScope({ page_id: 'a', title: 'A' }, { page_id: 'b', title: 'A' })).toBe(false);
    expect(sameScope({ page_id: null, title: null }, { page_id: null, title: null })).toBe(true);
    expect(sameScope(null, { page_id: null, title: null })).toBe(false);
    expect(sameScope(null, null)).toBe(true);
  });

  it('is sent to the server as the identity and nothing else', () => {
    expect(scopeForRequest({ page_id: 'a', title: 'A' })).toEqual({ page_id: 'a' });
    expect(scopeForRequest({ page_id: null, title: null })).toEqual({ page_id: null });
    expect(scopeForRequest(null)).toBeNull();
  });
});

describe('a rename', () => {
  it('changes the title on the bound scope and nothing else', () => {
    const bound = { page_id: 'a', title: 'Rockwell' };
    expect(retitled(bound, 'a', 'Rockwell Weekly')).toEqual({ page_id: 'a', title: 'Rockwell Weekly' });
  });

  it('leaves a scope bound to another page, or to nothing, alone', () => {
    const other = { page_id: 'b', title: 'B' };
    expect(retitled(other, 'a', 'Rockwell Weekly')).toBe(other);
    expect(retitled(null, 'a', 'Rockwell Weekly')).toBeNull();
    const ungrouped = { page_id: null, title: null };
    expect(retitled(ungrouped, 'a', 'X')).toBe(ungrouped);
  });
});

describe('the scope a question is sent with', () => {
  const A = { page_id: 'a', title: 'A' };
  const B = { page_id: 'b', title: 'B' };
  const U = { page_id: null, title: null };

  it('binds a new thread to what was asked for', () => {
    expect(scopeForAsk(null, null, A)).toEqual(A);
    expect(scopeForAsk(null, null, U)).toEqual(U);
  });

  it('is nothing on a fresh Ask that asked for nothing', () => {
    expect(scopeForAsk(null, null, undefined)).toBeNull();
    expect(scopeForAsk(null, null, null)).toBeNull();
  });

  it('is the thread’s inside a thread, whatever was asked for', () => {
    expect(scopeForAsk('t1', A, undefined)).toEqual(A);
    expect(scopeForAsk('t1', A, B)).toEqual(A);
    // A thread that never had a page does not acquire one mid-way.
    expect(scopeForAsk('t1', null, B)).toBeNull();
  });
});

describe('recovering a thread’s scope from its stored answers', () => {
  it('reads the page id Bob recorded on his answer, and nothing else', () => {
    const a = post({ id: 'a', payload: { page_context: read('p-reorder', 'AJI BARN Reorder') } });
    expect(storedPageContext(a)?.page_id).toBe('p-reorder');
    expect(threadScope([a])).toEqual({ page_id: 'p-reorder', title: 'AJI BARN Reorder' });
  });

  it('prefers the stored id over any title lookup, even when the title has changed', () => {
    // The page was renamed since the answer: the id still binds, the pages
    // list's current title is not consulted, and the indicator shows the
    // title as it was recorded (the live frame retitles it later).
    const a = post({ id: 'a', payload: { page_context: read('p-reorder', 'Old Name') } });
    expect(threadScope([a], PAGES)).toEqual({ page_id: 'p-reorder', title: 'Old Name' });
  });

  it('recovers the ungrouped scope as a null id, not as a word', () => {
    const a = post({ id: 'a', payload: { page_context: read(null, null) } });
    expect(threadScope([a])).toEqual({ page_id: null, title: null });
  });

  it('resolves a pre-2026-09-08 answer by exact title against the current pages', () => {
    const old = post({ id: 'o', payload: { page_context: legacyRead('Fame') } });
    expect(threadScope([old], PAGES)).toEqual({ page_id: 'p-fame', title: 'Fame' });
  });

  it('recovers NO scope from an old title nobody has any more — it does not guess', () => {
    const renamed = post({ id: 'o', payload: { page_context: legacyRead('Fame Old') } });
    expect(threadScope([renamed], PAGES)).toBeNull();
    const caseVariant = post({ id: 'c', payload: { page_context: legacyRead('fame') } });
    expect(threadScope([caseVariant], PAGES)).toBeNull();
    // Without the pages to check against, an old title is unresolvable.
    const unchecked = post({ id: 'u', payload: { page_context: legacyRead('Fame') } });
    expect(threadScope([unchecked])).toBeNull();
  });

  it('recovers an old ungrouped answer without any lookup', () => {
    const old = post({ id: 'o', payload: { page_context: legacyRead(null) } });
    expect(threadScope([old])).toEqual({ page_id: null, title: null });
  });

  it('is nothing for a thread whose answers read no page', () => {
    const plain = post({ id: 'a', payload: { charted: [], calls: [] } });
    const older = post({ id: 'b', payload: null });
    expect(threadScope([older, plain])).toBeNull();
  });

  it('takes the newest page-aware answer', () => {
    const first = post({ id: 'a', payload: { page_context: read('a', 'A') } });
    const later = post({ id: 'b', payload: { page_context: read('a', 'A') },
      created_at: '2026-09-07T10:00:00+08:00' });
    const plain = post({ id: 'c', payload: null, created_at: '2026-09-07T11:00:00+08:00' });
    expect(threadScope([first, later, plain])).toEqual({ page_id: 'a', title: 'A' });
  });

  it('ignores a question post and a malformed payload', () => {
    const q = post({ id: 'q', author: 'user', kind: 'question',
      payload: { page_context: read('a', 'A') } });
    const bad = post({ id: 'b', payload: { page_context: { page: 7 } } });
    const badId = post({ id: 'i', payload: { page_context: { page: 'A', page_id: 7 } } });
    const noPage = post({ id: 'n', payload: { page_context: { pins: [] } } });
    expect(threadScope([q, bad, badId, noPage], PAGES)).toBeNull();
  });

  it('never parses the display string', () => {
    const labelled = post({ id: 'l', payload: { page_context_label: 'Pages / Ungrouped' } });
    expect(threadScope([labelled], PAGES)).toBeNull();
  });
});
