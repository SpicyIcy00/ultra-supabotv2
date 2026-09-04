/**
 * The river: one continuous timeline, read top to bottom.
 *
 * NO BLANK PAGE, EVER. There is no "new chat" and nothing to start — the river
 * is already running when you arrive. The nearest thing to an empty state is a
 * database with no posts in it at all, which says so plainly rather than
 * inviting you to begin something.
 *
 * FOUR STATES, AND THE FIRST TWO MAY NOT BORROW THE THIRD'S WORDS (UI rule 8).
 * Loading is not emptiness, and a failed read is not emptiness either. This is
 * the same discipline approvalState.ts holds for the approval queue, applied to
 * the feed: the app may only claim the river is empty while holding a result
 * that says so.
 *
 * OLDEST-FIRST WITHIN A PAGE, newest page first. The server reads newest-first
 * so paging backwards never counts from the beginning of history, and reverses
 * for rendering — see app/services/river.py. Nothing here re-sorts.
 */
import type { Post } from '../../types/river';
import { PostCard } from './PostCard';
import { groupsWith } from './postShape';

interface Props {
  posts: Post[];
  /** True while the first page is in flight. Never rendered as emptiness. */
  loading?: boolean;
  /** Set when the read failed. Never rendered as emptiness either. */
  error?: string | null;
  /** Whether an older page exists — from the server's cursor, not a guess. */
  hasOlder?: boolean;
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
}

export function RiverFeed({
  posts,
  loading = false,
  error = null,
  hasOlder = false,
  onLoadOlder,
  loadingOlder = false,
}: Props) {
  if (loading && posts.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-george-muted">
        Catching up…
      </p>
    );
  }

  if (error && posts.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-[14px] text-george-navy">Couldn’t read the river.</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-george-slate">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* The top of the page: older history, or the true beginning. */}
      {posts.length > 0 && (
        hasOlder ? (
          <div className="text-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:text-george-navy disabled:opacity-50"
            >
              {loadingOlder ? 'Reading…' : 'Earlier'}
            </button>
          </div>
        ) : (
          // A real end, stated. Not a spinner that never resolves.
          <p className="text-center text-[11px] text-george-muted">
            The beginning of the river
          </p>
        )
      )}

      {posts.length === 0 && (
        <p className="py-10 text-center text-[13px] leading-relaxed text-george-slate">
          Nothing here yet. George posts the morning brief, anything he notices,
          and every answer he gives.
        </p>
      )}

      {posts.map((post, i) => (
        <PostCard key={post.id} post={post} grouped={groupsWith(posts[i - 1], post)} />
      ))}

      {/* A failure that arrives after some posts are on screen must not replace
          them — the posts are still true. */}
      {error && posts.length > 0 && (
        <p className="text-center text-[11px] text-george-muted">
          Couldn’t read further: {error}
        </p>
      )}
    </div>
  );
}
