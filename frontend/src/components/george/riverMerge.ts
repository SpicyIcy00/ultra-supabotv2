/**
 * Which live turns still need drawing once the stored posts are on screen.
 *
 * Kept apart from the components for the same reason postShape.ts and
 * approvalState.ts are: this is a decision the suite can hold without a DOM,
 * and it is the decision that keeps an exchange from appearing twice.
 *
 * THE INVARIANT. A persisted exchange renders exactly once. The live turn is
 * the pending post — the same exchange, still being written — and the moment
 * the river returns the stored copy, the live copy has to go. Until then the
 * live copy is the only rendering there is, and it stays.
 *
 * IDENTITY IS THE POST ID AND NOTHING ELSE. The loop emits a `post` frame
 * naming the two posts it wrote, and the hook keeps it on the turn. A turn is
 * dropped here when one of THOSE ids is among the fetched posts. Never the
 * question text (two people can ask the same thing), never the answer text
 * (George can give the same answer twice), never a timestamp (the client's
 * clock and the server's are different clocks). Matching on any of those would
 * either drop a turn that is not stored or keep one that is, and both are the
 * same failure: the screen disagreeing with the record.
 *
 * WHAT IS NEVER DROPPED:
 *   - a turn still streaming, which has no `post` yet;
 *   - a turn that was stopped, which will never get one;
 *   - a turn whose frame says `stored: false` — logging was off or failed, so
 *     there is no stored copy to defer to and the live one is the only record;
 *   - a turn whose ids the river has not returned yet, because a refetch is
 *     still in flight or paged past it.
 *
 * Turns come in pairs — the question, then George's answer — and a pair goes
 * together: the person's question is dropped exactly when the answer turn
 * that follows it is, so a question is never left orphaned above the stored
 * copy of its own exchange.
 */
import type { GeorgeTurn } from '../../types/george';
import type { Post } from '../../types/river';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

/** The ids under which a stored copy of this turn would appear, if any. */
export function storedIds(turn: AnswerTurn): string[] {
  const frame = turn.post;
  if (!frame || !frame.stored) return [];
  return [frame.question_post_id, frame.answer_post_id].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
}

/** Whether the river already holds this turn, by id. */
export function isStoredIn(turn: AnswerTurn, postIds: ReadonlySet<string>): boolean {
  return storedIds(turn).some((id) => postIds.has(id));
}

export interface MergedRiver {
  /** The stored posts, untouched and in the order given. */
  posts: Post[];
  /** The live turns that still have to be drawn beneath them. */
  pending: GeorgeTurn[];
}

/**
 * The stored posts as they are, and the live turns the river does not yet
 * hold.
 */
export function riverMerge(posts: Post[], turns: GeorgeTurn[]): MergedRiver {
  const ids = new Set(posts.map((p) => p.id));
  const pending: GeorgeTurn[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.role === 'user') {
      // A question goes with the answer that follows it. If that answer is
      // already stored, the question is too — the loop wrote both.
      const next = turns[i + 1];
      if (next?.role === 'george' && isStoredIn(next, ids)) continue;
      pending.push(turn);
      continue;
    }
    if (isStoredIn(turn, ids)) continue;
    pending.push(turn);
  }

  return { posts, pending };
}
