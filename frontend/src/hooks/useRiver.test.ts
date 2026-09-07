import { describe, expect, it } from 'vitest';
import type { Post, RiverPage } from '../types/river';
import { flattenPages } from './useRiver';

function post(id: string): Post {
  return {
    id, thread_id: id, parent_id: null, kind: 'brief', author: 'george',
    author_user: null, owner_user: null, visibility: 'org', mine: false,
    body: id, payload: null, receipts: null, notices: [],
    conversation_id: null, created_at: null,
  };
}

describe('flattenPages', () => {
  it('puts older pages above newer ones and keeps each page in its own order', () => {
    const pages: RiverPage[] = [
      { posts: [post('c'), post('d')], before: 'cursor' }, // newest page
      { posts: [post('a'), post('b')], before: null },     // the page above it
    ];
    expect(flattenPages(pages).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a post that straddles a page boundary exactly once', () => {
    const pages: RiverPage[] = [
      { posts: [post('b'), post('c')], before: 'x' },
      { posts: [post('a'), post('b')], before: null },
    ];
    expect(flattenPages(pages).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('is empty with no pages', () => {
    expect(flattenPages([])).toEqual([]);
  });
});
