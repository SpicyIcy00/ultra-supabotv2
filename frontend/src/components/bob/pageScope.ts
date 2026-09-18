/**
 * The page a thread is about, as a decision the suite can hold.
 *
 * Kept apart from the components and the stream hook for the same reason
 * pageShape.ts and riverMerge.ts are: who a thread is scoped to is a rule,
 * and the rule is testable without a DOM.
 *
 * SCOPE IS AN IDENTITY, NOT A LABEL. Since 2026-09-08 a scope is
 * `{ page_id, title }`: the page's id — null for the ungrouped pins, which
 * are a real scope with no row — and the title as it read when the scope was
 * taken, carried for the indicator only. Two scopes are the same when their
 * ids are; a title is never compared, never parsed, never sent as the
 * identity. `pageContextFor` (pageShape.ts) makes the display string Bob
 * reads out, and it is never parsed back.
 *
 * SCOPE BELONGS TO THE THREAD. The first page-aware question binds the
 * thread to that page; every follow-up in it carries the same scope whether
 * or not the person is still standing on the page; a fresh Ask has none;
 * and a thread reopened after a reload gets its scope back from what Bob
 * recorded on its answers, not from anything guessed. A rename changes the
 * title on the indicator and nothing else: the thread stays bound to the
 * same id, and so do view_page and edit_page.
 *
 * A PRE-2026-09-08 THREAD stored only a title. It is resolved against the
 * caller's CURRENT pages by exact title when the thread is opened; a title
 * nobody has any more recovers no scope, and the thread says so rather than
 * binding a guess. Historical posts are never rewritten to repair this.
 */
import type { PageContextFrame, PageScope } from '../../types/bob';
import type { Post } from '../../types/river';
import { UNGROUPED_NAME } from './pageShape';

/** A page as a scope: its id (null for Ungrouped) and the title it has now. */
export function pageScopeFor(pageId: string | null, title: string | null): PageScope {
  return { page_id: pageId, title: pageId === null ? null : title };
}

/** What the indicator says for a scope. The only place null becomes a word. */
export function scopeLabel(scope: PageScope): string {
  return scope.page_id === null ? UNGROUPED_NAME : (scope.title ?? UNGROUPED_NAME);
}

/** Same page: same id. The title is presentation and is not compared. */
export function sameScope(a: PageScope | null, b: PageScope | null): boolean {
  if (a === null || b === null) return a === b;
  return a.page_id === b.page_id;
}

/** The scope with a new title, after a rename. The identity does not move. */
export function retitled(scope: PageScope | null, pageId: string, title: string): PageScope | null {
  if (scope === null || scope.page_id !== pageId) return scope;
  return { page_id: scope.page_id, title };
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

/** The scope as the server takes it: the identity, and nothing else. */
export function scopeForRequest(scope: PageScope | null): { page_id: string | null } | null {
  return scope ? { page_id: scope.page_id } : null;
}

/**
 * The page context a stored answer post carries, if it carries one.
 *
 * Read from the payload the loop wrote (agent/loop.py, _answer_payload) and
 * nothing else — never from the prose, never from a pin list.
 */
export function storedPageContext(post: Post): PageContextFrame | null {
  if (post.author !== 'bob') return null;
  const raw = (post.payload as { page_context?: unknown } | null)?.page_context;
  if (!raw || typeof raw !== 'object' || !('page' in raw)) return null;
  const page = (raw as { page: unknown }).page;
  if (page !== null && typeof page !== 'string') return null;
  const pageId = (raw as { page_id?: unknown }).page_id;
  if (pageId !== undefined && pageId !== null && typeof pageId !== 'string') return null;
  return raw as PageContextFrame;
}

/**
 * A stored thread's scope: the page its newest page-aware answer read.
 *
 * Null when no answer in the thread read a page — an ordinary thread, or
 * one whose questions never needed the page. `posts` is oldest-first as
 * the thread read returns it; the newest wins so a thread that read twice
 * reports what it read last, which is the same page by construction.
 *
 * An answer written since 2026-09-08 carries the id and is taken as is. An
 * older one carries a title only: with `pages` supplied it resolves to the
 * caller's page of exactly that title, or to nothing; without `pages` it is
 * unresolvable and yields nothing. Ungrouped (page null) needs no lookup.
 */
export function threadScope(
  posts: Post[],
  pages?: { id: string; title: string }[],
): PageScope | null {
  for (let i = posts.length - 1; i >= 0; i--) {
    const ctx = storedPageContext(posts[i]);
    if (!ctx) continue;
    if (ctx.page_id !== undefined) {
      return { page_id: ctx.page_id, title: ctx.page_id === null ? null : ctx.page };
    }
    if (ctx.page === null) return { page_id: null, title: null };
    const match = pages?.find((p) => p.title === ctx.page);
    return match ? { page_id: match.id, title: match.title } : null;
  }
  return null;
}
