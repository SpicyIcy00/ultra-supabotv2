/**
 * /george/t/:threadId — one thread, on its own.
 *
 * A ROUTE, NOT AN OVERLAY, and the reason is that a thread is a thing you send
 * somebody: "look at this exchange". A modal has no URL. UI rule 3's "no new
 * route" governs RECEIPTS — an inspection of a figure already on screen — and
 * this is navigation, which is a different act.
 *
 * The same visibility filter the river uses applies here, so a thread cannot be
 * a way around it: a private post somebody else owns is simply not returned,
 * and a thread with nothing visible 404s rather than rendering blank — an empty
 * thread would imply something was hidden, which is a claim about content
 * nobody can see (UI rule 8).
 *
 * No composer. Replying into a thread is not built yet, and an input that
 * posted to the river instead would put the reply somewhere the reader did not
 * expect.
 */
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PostCard } from '../components/george/PostCard';
import { groupsWith } from '../components/george/postShape';
import { readThread, sharePost } from '../services/riverApi';

export default function ThreadPage() {
  const { threadId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sharingId, setSharingId] = useState<string | null>(null);

  const thread = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => readThread(threadId),
    enabled: Boolean(threadId),
    staleTime: 20_000,
  });

  const onShare = useCallback(
    async (postId: string) => {
      setSharingId(postId);
      try {
        await sharePost(postId);
        await qc.invalidateQueries({ queryKey: ['thread', threadId] });
        qc.invalidateQueries({ queryKey: ['river'] });
      } finally {
        setSharingId(null);
      }
    },
    [qc, threadId],
  );

  const posts = thread.data ?? [];

  return (
    <div className="-m-3 sm:-m-4 lg:-m-6 flex h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)] flex-col bg-george-cream font-sans text-george-navy">
      <div className="flex items-center gap-2 border-b border-george-line px-3 py-2 md:px-6">
        <button
          type="button"
          onClick={() => navigate('/george')}
          aria-label="Back to the river"
          className="flex min-h-touch items-center gap-1.5 rounded-lg text-[13px] text-george-slate hover:text-george-navy"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          The river
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 md:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Three states, and the first two may not borrow the third's
              words — the same discipline the feed keeps (UI rule 8). */}
          {thread.isPending && (
            <p className="py-10 text-center text-[13px] text-george-muted">Opening…</p>
          )}
          {thread.isError && (
            <div className="py-10 text-center">
              <p className="text-[14px] text-george-navy">That thread isn’t available.</p>
              <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-george-slate">
                It may have been deleted, or it may be somebody else’s.
              </p>
            </div>
          )}
          {posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              grouped={groupsWith(posts[i - 1], post)}
              onShare={onShare}
              sharing={sharingId === post.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
