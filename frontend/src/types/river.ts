/**
 * Types for the river.
 *
 * These mirror RiverPost / RiverPage in
 * backend/app/api/v1/routes/george.py one-for-one, the same discipline
 * types/pins.ts and types/workflows.ts set. No runtime validation, so drift
 * shows up as an undefined field in the UI rather than an error —
 * tests/test_river_contract.py holds the field names to that.
 */
import type { GeorgeNotice, ToolMeta } from './george';

/**
 * The eight kinds a post can be. Mirrors POST_KINDS in
 * backend/app/models/george_post.py and the CHECK constraint in migration
 * n8o9p0q1r2s3 — a kind in one place and not the others must fail loudly
 * rather than render as a blank card.
 */
export type PostKind =
  | 'brief'
  | 'notice'
  | 'answer'
  | 'question'
  | 'approval'
  | 'workflow_run'
  | 'pin_confirmation'
  | 'system';

export type PostAuthor = 'george' | 'user';
export type PostVisibility = 'org' | 'private';

/**
 * One utterance in the river.
 *
 * EVERY GEORGE POST CARRIES ITS RECEIPTS AND ITS NOTICES. UI rules 3, 4 and 6
 * apply to all eight kinds without exception (CLAUDE.md vocabulary, "Post"). A
 * card that cannot show a caveat is the wrong shape for the post — it is never
 * a reason to drop the caveat.
 */
export interface Post {
  id: string;
  /** The root post's id. A root post is its own thread. */
  thread_id: string;
  /** The post being replied to. Null for a root. */
  parent_id: string | null;
  kind: PostKind;
  /** Which side of the thread this is drawn on. George has no account. */
  author: PostAuthor;
  author_user: string | null;
  visibility: PostVisibility;
  /**
   * True when the viewer wrote it — decides whether a share action is offered,
   * and nothing else. Visibility was already applied in SQL.
   */
  mine: boolean;
  /**
   * The standalone prose. A voice layer speaks exactly this, so it never
   * depends on `payload` to make sense.
   */
  body: string;
  /** Kind-specific structure: rows, chips, buttons, ids. */
  payload: Record<string, unknown> | null;
  receipts: ToolMeta | null;
  notices: GeorgeNotice[];
  /** Back-reference into george.conversations. */
  conversation_id: string | null;
  created_at: string | null;
}

/**
 * A page of the river, oldest-first.
 *
 * `before` is the cursor for the page ABOVE this one. Null means the river has
 * been read to its beginning — a real end, which the UI states rather than
 * spinning on (UI rule 8).
 */
export interface RiverPage {
  posts: Post[];
  before: string | null;
}
