/**
 * The river, as one continuous timeline.
 *
 * ONE LIST THAT GROWS UPWARD. "Earlier" used to swap the newest page out for
 * an older one — the query was keyed on the cursor, so reading history meant
 * losing the present. An infinite query keeps every page fetched so far and
 * the timeline is their concatenation: older pages above, the newest page at
 * the bottom, in the order the server gave each page.
 *
 * THE SERVER'S CURSOR IS THE ONLY SOURCE OF "IS THERE MORE". `before` is null
 * when the beginning of the river has been read — a real end, which the feed
 * states rather than spinning on (UI rule 8). Nothing here guesses from page
 * size.
 *
 * DETERMINISTIC IDENTITY. A post that lands on a page boundary while two pages
 * are refetched could appear twice; it is kept once, by id, first occurrence
 * in reading order. Order within and across pages is the server's — nothing
 * is re-sorted on the client.
 *
 * Refetched on focus because the river is shared: George posts into it while
 * nobody is looking, and other people post into it too.
 */
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { readRiver } from '../services/riverApi';
import type { Post, RiverPage } from '../types/river';

export const RIVER_KEY = ['river'] as const;

/** Pages arrive newest-first; reading order is oldest-first. Once, by id. */
export function flattenPages(pages: RiverPage[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (let i = pages.length - 1; i >= 0; i--) {
    for (const post of pages[i].posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      out.push(post);
    }
  }
  return out;
}

export function useRiver() {
  const query = useInfiniteQuery({
    queryKey: RIVER_KEY,
    queryFn: ({ pageParam }) => readRiver(pageParam),
    initialPageParam: null as string | null,
    // "Next" is OLDER: the cursor names the page above this one.
    getNextPageParam: (last) => last.before ?? undefined,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const posts = useMemo(() => flattenPages(query.data?.pages ?? []), [query.data]);

  return {
    posts,
    /** True while the FIRST page is in flight. Never rendered as emptiness. */
    loading: query.isPending,
    error: query.isError,
    /** From the server's cursor, not a guess. */
    hasOlder: Boolean(query.hasNextPage),
    loadOlder: () => {
      if (!query.isFetchingNextPage) void query.fetchNextPage();
    },
    loadingOlder: query.isFetchingNextPage,
  };
}
