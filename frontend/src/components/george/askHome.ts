/**
 * Ask is the home of the work — the decisions that make it one, held pure.
 *
 * THE PRODUCT MODEL, LOCKED 2026-09-09. Ask: I go to George. Today: George
 * comes to me. So /ask is the canonical, persisted river of user-directed
 * work — every question asked and every answer given, from authoritative
 * persistence, whoever navigated where in between — and /ask/:threadId is a
 * FOCUS into that river, not a separate chat. There is no "new chat", no
 * thread picker, no history to find. Threads stay underneath as model
 * context, continuation, provenance, page scope, ownership and audit.
 *
 * ONE AUTHORITATIVE SOURCE. The work stream of the river (routes/george.py
 * RIVER_STREAMS: kind in question, answer), read with the same visibility
 * clause everything else uses. Nothing here remembers a route, a thread or a
 * list on the client; a reload reconstructs the same river from the same
 * read.
 */
import type { Post } from '../../types/river';

/** A post that is somebody's work: a question, or the answer to one. */
export function isWork(post: Post): boolean {
  return post.kind === 'question' || post.kind === 'answer';
}

/**
 * The thread the composer continues at the ROOT: the newest piece of the
 * viewer's own work. Continuing it is what makes "Why?" after a reload mean
 * the same thing it meant before one — the history the loop is shown is that
 * thread's, loaded through threadHistory as it always was.
 *
 * Own, because a shared exchange of somebody else's is visible here and is
 * not the viewer's to continue as their own conversation (thread_access
 * decides who may reply at all; this only decides which thread the box
 * defaults to). Null when the river holds no own work yet: the first
 * question starts a thread.
 */
export function newestOwnThread(posts: Post[]): string | null {
  for (let i = posts.length - 1; i >= 0; i--) {
    const p = posts[i];
    if (isWork(p) && p.mine) return p.thread_id;
  }
  return null;
}

/** The last post of a thread in the list — what a reply names as its parent. */
export function lastPostOf(posts: Post[], threadId: string | null): Post | undefined {
  if (!threadId) return undefined;
  for (let i = posts.length - 1; i >= 0; i--) {
    if (posts[i].thread_id === threadId) return posts[i];
  }
  return undefined;
}

/**
 * The river with a focused thread's posts folded in.
 *
 * A deep link may point at work older than the loaded page of the river. The
 * thread read (`GET /river/threads/{id}`) is filtered by the SAME visibility
 * clause as the river, so folding its posts in exposes nothing the river read
 * would not; it only guarantees the focused work is on screen. Merged by id
 * — never twice — and ordered by time, which is the river's own order.
 */
export function withFocus(river: Post[], focused: Post[]): Post[] {
  const seen = new Set(river.map((p) => p.id));
  const extra = focused.filter((p) => !seen.has(p.id));
  if (extra.length === 0) return river;
  return [...river, ...extra].sort(
    (a, b) => Date.parse(a.created_at ?? '') - Date.parse(b.created_at ?? ''),
  );
}

/** The entry a focus lands on: the first post of the thread, in order. */
export function focusTarget(posts: Post[], threadId: string): string | null {
  return posts.find((p) => p.thread_id === threadId)?.id ?? null;
}
