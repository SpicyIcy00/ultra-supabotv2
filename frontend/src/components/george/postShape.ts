/**
 * How one post is presented, as a decision the suite can hold.
 *
 * Kept apart from the components for the same reason markState.ts,
 * cognition.ts and approvalState.ts are: these rules are testable without a
 * DOM, and a component file exports only components.
 *
 * THE THREE RULES THIS FILE EXISTS TO ENFORCE, on all eight kinds at once.
 *
 *   UI rule 4   a post carrying notices ALWAYS surfaces them, above the body.
 *               There is no kind, and no card size, that is allowed to drop a
 *               caveat — "if a tile cannot show the caveat, the tile is the
 *               wrong shape".
 *   UI rule 6   no figure displays without a timestamp. A post whose time is
 *               missing says so; it never renders a card with no time on it,
 *               because a number with no time is a claim with no expiry.
 *   UI rule 5   one colour means "needs you", and NO post kind wears it. The
 *               rail's approval queue is where that colour lives; a post is
 *               the record that something happened, never the summons.
 *
 * The temptation this guards against is per-kind exceptions. A brief is long,
 * a pin confirmation is trivial, a system post has no data — and each is an
 * argument for treating that kind specially. The moment one kind is allowed to
 * skip receipts or swallow a notice, the guarantee is gone for all of them,
 * because a reader cannot know which kind they are looking at before they read
 * it.
 */
import type { Post, PostKind } from '../../types/river';

/**
 * The eyebrow above a card: what KIND of thing this is, in a person's words.
 *
 * Null where the body already says it. An answer and a question need no label
 * — the side of the thread and the prose are the whole message, and a
 * "Question" caption over a question is furniture.
 */
export const KIND_LABEL: Record<PostKind, string | null> = {
  brief: 'This morning',
  notice: 'I noticed',
  answer: null,
  question: null,
  approval: 'Needs you',
  workflow_run: 'Workflow ran',
  pin_confirmation: 'Pinned',
  system: null,
};

/**
 * The post kinds that may wear the approvals colour: NONE.
 *
 * `approval` was here until 2026-09-05, and removing it is deliberate. The
 * approval QUEUE in the rail is where "needs you" lives and where the reserved
 * colour belongs. An approval POST is the historical record that a version
 * entered the queue — the same fact, in the timeline, at the moment it
 * happened. Wearing the colour in both places is one fact shouting twice, and
 * a signal that fires from two directions stops locating anything.
 *
 * Kept as a list rather than deleted, because the pressure to add a kind is
 * constant — a failed run feels urgent, a stale brief feels urgent — and UI
 * rule 5 is that the colour dies from a second USE, not a second feeling. An
 * empty list makes any addition a visible edit with a test to answer to.
 */
export const ACCENT_KINDS: PostKind[] = [];

/** When a post has no time, what the card says instead of nothing. */
export const TIME_UNKNOWN = 'Time not recorded';

export type PostTime = { known: true; iso: string } | { known: false; label: string };

export interface PostView {
  kind: PostKind;
  /** Which side of the thread the card is drawn on. */
  side: 'george' | 'user';
  /** The eyebrow, or null where the body speaks for itself. */
  label: string | null;
  /** Whether this card may use the approvals colour. */
  accent: boolean;
  /** Whether a receipts block is rendered. */
  showReceipts: boolean;
  /** Whether a notice banner is rendered, ABOVE the body. */
  showNotices: boolean;
  /** Never absent — see TIME_UNKNOWN and UI rule 6. */
  time: PostTime;
  /** Whether to offer a share action: the viewer's own, still private. */
  canShare: boolean;
}

/**
 * How to draw one post.
 *
 * Deliberately total over `Post`: every field of the view is decided here, so
 * a component cannot quietly introduce a per-kind exception by omitting a
 * prop.
 */
export function postView(post: Post): PostView {
  const notices = post.notices ?? [];
  return {
    kind: post.kind,
    side: post.author === 'user' ? 'user' : 'george',
    label: KIND_LABEL[post.kind] ?? null,
    accent: ACCENT_KINDS.includes(post.kind),

    // Receipts wherever there are receipts — no kind is exempt, and a kind
    // that happens never to carry them simply never shows the block.
    showReceipts: post.receipts != null,

    // Notices wherever there are notices. This is the one that must never
    // acquire a condition: not "unless the card is small", not "unless the
    // kind is trivial".
    showNotices: notices.length > 0,

    time: post.created_at
      ? { known: true, iso: post.created_at }
      : { known: false, label: TIME_UNKNOWN },

    // A post is shareable when it is the viewer's own and still private.
    // George's posts are already org-level and there is nothing to share.
    canShare: post.mine && post.visibility === 'private',
  };
}

/**
 * Whether two adjacent posts belong to the same visual run.
 *
 * Consecutive posts by the same author within a few minutes are drawn as one
 * block rather than repeating the avatar and the time. Grouping is presentation
 * only — it never merges bodies, and each post keeps its own receipts and its
 * own notices, because those belong to the post and not to the run.
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function groupsWith(previous: Post | undefined, post: Post): boolean {
  if (!previous) return false;
  if (previous.author !== post.author) return false;
  if (previous.author_user !== post.author_user) return false;
  // A labelled kind always starts its own block: "Workflow ran" under a run
  // that is visually part of the previous answer would attach the label to
  // the wrong thing.
  if (KIND_LABEL[post.kind] !== null) return false;
  if (!previous.created_at || !post.created_at) return false;
  const gap = Date.parse(post.created_at) - Date.parse(previous.created_at);
  return Number.isFinite(gap) && gap >= 0 && gap < GROUP_WINDOW_MS;
}
