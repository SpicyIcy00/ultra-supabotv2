/**
 * The page a thread is about, as a decision the suite can hold.
 *
 * Kept apart from the components and the stream hook for the same reason
 * pageShape.ts and riverMerge.ts are: who a thread is scoped to is a rule,
 * and the rule is testable without a DOM.
 *
 * SCOPE IS AN IDENTITY, NOT A LABEL. `pageContextFor` (pageShape.ts) makes
 * the display string George reads out — "Pages / AJI BARN Reorder" — and it
 * is never parsed back. A scope is `{ name }`, exactly what the server's
 * page_scope takes: the page's own name, or null for the ungrouped pins,
 * which are a real scope with no name. The word "Ungrouped" is how the UI
 * says null; it is never how null is stored or sent.
 *
 * SCOPE BELONGS TO THE THREAD. The first page-aware question binds the
 * thread to that page; every follow-up in it carries the same scope whether
 * or not the person is still standing on the page; a fresh Ask has none;
 * and a thread reopened after a reload gets its scope back from what George
 * recorded on its answers, not from anything guessed. Page A can therefore
 * never leak into a Page B thread or an ordinary one: the scope is decided
 * when a thread starts and is immutable after.
 */
import type { PageContextFrame, PageScope } from '../../types/george';
import type { Post } from '../../types/river';
import { UNGROUPED_NAME } from './pageShape';

/** A page as a scope: its name, or null for the ungrouped pins. */
export function pageScopeFor(page: string | null): PageScope {
  return { name: page };
}

/** What the indicator says for a scope. The only place null becomes a word. */
export function scopeLabel(scope: PageScope): string {
  return scope.name ?? UNGROUPED_NAME;
}

export function sameScope(a: PageScope | null, b: PageScope | null): boolean {
  if (a === null || b === null) return a === b;
  return a.name === b.name;
}

/**
 * The scope a question is sent with.
 *
 * Inside a thread it is the thread's, whatever the caller asked for — scope
 * is immutable once a thread has begun. Outside one it is what was asked
 * for, and that is what the new thread is bound to.
 */
export function scopeForAsk(
  openThread: string | null,
  bound: PageScope | null,
  requested: PageScope | null | undefined,
): PageScope | null {
  return openThread ? bound : (requested ?? null);
}

/**
 * The page context a stored answer post carries, if it carries one.
 *
 * Read from the payload the loop wrote (agent/loop.py, _answer_payload) and
 * nothing else — never from the prose, never from a pin list.
 */
export function storedPageContext(post: Post): PageContextFrame | null {
  if (post.author !== 'george') return null;
  const raw = (post.payload as { page_context?: unknown } | null)?.page_context;
  if (!raw || typeof raw !== 'object' || !('page' in raw)) return null;
  const page = (raw as { page: unknown }).page;
  if (page !== null && typeof page !== 'string') return null;
  return raw as PageContextFrame;
}

/**
 * A stored thread's scope: the page its newest page-aware answer read.
 *
 * Null when no answer in the thread read a page — an ordinary thread, or
 * one whose questions never needed the page. `posts` is oldest-first as
 * the thread read returns it; the newest wins so a thread that read twice
 * reports what it read last, which is the same page by construction.
 */
export function threadScope(posts: Post[]): PageScope | null {
  for (let i = posts.length - 1; i >= 0; i--) {
    const ctx = storedPageContext(posts[i]);
    if (ctx) return { name: ctx.page };
  }
  return null;
}
