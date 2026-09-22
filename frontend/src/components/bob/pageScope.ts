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
 * THE CONVERSATION FOLLOWS THE PAGE (W1.4, 2026-09-22 — reverses
 * 2026-09-08's "scope belongs to the thread"). A question asked from a page
 * binds the thread it starts to that page. A follow-up from the SAME page
 * continues it under the same scope; a question asked from ANOTHER page starts
 * a new thread there, bound to that page, because Bob now answers beside the
 * page you are on and an answer about the Reorder page drawn beside the
 * warehouse would be about the wrong thing. A question that names no page (the
 * room's own line, where you are standing in the conversation itself) keeps
 * the thread and its scope. A fresh Ask has none; a thread reopened after a
 * reload gets its scope back from what Bob recorded on its answers, not from
 * anything guessed. A rename changes the title on the indicator and nothing
 * else: the thread stays bound to the same id, and so do view_page and
 * edit_page.
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

/** The thread a question is asked into, and the page it was asked from. */
export interface OpenThread {
  thread: string | null;
  scope: PageScope | null;
  /** `here.whereOf` of the page the thread was asked from; null for none. */
  where: string | null;
}

/**
 * THE THREAD AND SCOPE A QUESTION IS SENT WITH.
 *
 * `asked.where` is the page the person is standing on (`here.whereOf`), sent
 * by the line that is on every page; the room's own composer sends none.
 *
 *   no thread open            a new one, bound to what was asked for
 *   asked from another page   a NEW thread, bound to that page (fresh)
 *   asked from the same page  the thread's own scope
 *   asked from no page        the thread's own scope — a scope offered
 *                             mid-thread without a page (an @page in the
 *                             room) still binds nothing
 */
export function askPlan(
  open: OpenThread,
  asked: { scope?: PageScope | null; where?: string | null },
): { fresh: boolean; scope: PageScope | null; where: string | null } {
  const fresh = open.thread !== null && asked.where != null && asked.where !== open.where;
  if (open.thread === null || fresh) {
    return { fresh, scope: asked.scope ?? null, where: asked.where ?? null };
  }
  return { fresh: false, scope: open.scope, where: open.where };
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
