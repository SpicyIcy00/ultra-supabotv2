/**
 * One post in the river.
 *
 * ORDER WITHIN A POST IS THE SAME ORDER A TURN USES, and for the same reason:
 *
 *   label  ->  NOTICES  ->  body  ->  charts  ->  receipts  ->  time
 *
 * Notices sit ABOVE the body (UI rule 4). A caveat that qualifies a number has
 * to be read before the number, not found afterwards — and that holds for all
 * eight kinds, not just answers. The decision about what this card shows lives
 * in postShape.ts, where the suite holds it; this file only places it.
 *
 * THE MARK IS THE AVATAR, and it is the one place orange is not a summons
 * (CLAUDE.md UI rule 5, amended). Here it is drawn cream-on-navy from the same
 * single path the hero mark uses — see markState.ts on why the stamens are
 * knocked out rather than painted: it is exactly so this chip and the
 * accent-on-cream mark can be one drawing.
 *
 * EVERY POST SHOWS A TIME, including one whose time was never recorded. A card
 * with no time on it is a claim with no expiry (UI rule 6), so the missing case
 * says so in words rather than rendering an empty slot.
 */
import { useMemo, useState } from 'react';
import type { Post } from '../../types/river';
import { ChevronRight } from 'lucide-react';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';
import { Prose } from './Prose';
import { ResultSurface } from './ResultSurface';
import { MARK_PATH } from './markState';
import { postView, storedCalls } from './postShape';
import { ResultActions } from './ResultActions';
import { blocksFromCharted, quietLabel, type ResultBlock } from './resultShape';

/** George's mark as an avatar chip: cream on navy, one shared path. */
export function MarkAvatar({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <span
      className={`flex ${className} shrink-0 items-center justify-center rounded-full bg-george-navy`}
      aria-hidden
    >
      <svg viewBox="0 0 100 100" className="h-4 w-4 text-george-cream">
        <path d={MARK_PATH} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}

/**
 * The time under a post.
 *
 * Manila is the app's clock, as everywhere else. The unknown case is a real
 * rendering rather than an omission.
 */
function PostTime({ post }: { post: Post }) {
  const view = postView(post);
  if (!view.time.known) {
    return <span className="text-[11px] text-george-muted">{view.time.label}</span>;
  }
  const d = new Date(view.time.iso);
  const label = Number.isNaN(d.getTime())
    ? view.time.iso
    : d.toLocaleString('en-PH', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Manila',
      });
  return (
    <time dateTime={view.time.iso} className="text-[11px] tabular-nums text-george-muted">
      {label}
    </time>
  );
}

/**
 * The obvious next questions a post offers.
 *
 * A brief post carries these in its payload (river_writer.post_brief), derived
 * from the brief's own rows. They are what "ask and I'll run it" has been
 * promising: a chip is a QUESTION, and clicking one asks George in the
 * ordinary way, so the reply arrives as its own posts with their own receipts.
 *
 * Nothing here may use the approvals colour — a question George is offering to
 * answer needs nobody.
 */
function FollowUpChips({
  post,
  onAsk,
}: {
  post: Post;
  onAsk: (question: string) => void;
}) {
  const raw = (post.payload as { follow_ups?: unknown } | null)?.follow_ups;
  const chips = Array.isArray(raw)
    ? (raw as { label?: unknown; question?: unknown }[]).filter(
        (c) => typeof c?.label === 'string' && typeof c?.question === 'string',
      )
    : [];
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <button
          key={String(c.question)}
          type="button"
          onClick={() => onAsk(String(c.question))}
          title={String(c.question)}
          className="min-h-touch rounded-full border border-george-line bg-george-paper px-3 py-1.5 text-[12px] text-george-slate hover:border-george-slate hover:text-george-navy"
        >
          {String(c.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * The figures a stored post describes, drawn through the SAME surface a live
 * turn draws them with.
 *
 * A SNAPSHOT, AND IT SAYS SO. The rows were stored when the answer was
 * written, not re-fetched now — see ConversationLog.posts for why re-running
 * would put a fresh chart beside prose that still states the old figure. What
 * makes that honest is the receipts underneath: `snapshot_timestamp` is when
 * the data was READ, not when this rendered, so every figure carries its own
 * age (UI rule 6).
 *
 * ONE SELECTION PATH. Until now this filtered the stored results down to
 * charts and dropped everything else, while a live turn drew the same payload
 * through inferShape. So an answer whose figures were a table and two metrics
 * showed them while it streamed and lost them on reload — the same answer
 * reading two ways, which is the divergence UI rule 3 exists to prevent. Both
 * now go through resultShape.
 */
function ChartedResults({ blocks, quiet = false }: { blocks: ResultBlock[]; quiet?: boolean }) {
  const [shown, setShown] = useState(false);
  if (blocks.length === 0) return null;
  // An earlier post's figures wait behind one line that NAMES them. The
  // receipts under each come with them, so a figure is never on screen without
  // its time; the notices above the body were never here to hide.
  if (quiet && !shown) {
    return (
      <button
        type="button"
        onClick={() => setShown(true)}
        aria-expanded={false}
        className="flex min-h-touch items-center gap-1.5 text-[12px] text-george-muted"
      >
        <ChevronRight className="h-3 w-3" aria-hidden />
        {quietLabel(blocks)}
      </button>
    );
  }
  return <ResultSurface blocks={blocks} />;
}

export function PostCard({
  post,
  grouped = false,
  onAsk,
  onOpenThread,
  onShare,
  sharing = false,
  question,
  quiet = false,
}: {
  post: Post;
  grouped?: boolean;
  /** Absent where there is nowhere to ask; chips are then not offered. */
  onAsk?: (question: string) => void;
  /** Absent inside a thread, where there is nowhere further to go. */
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharing?: boolean;
  /**
   * The question this answer replied to, when the caller has it. A pin's
   * title defaults to it. Never derived from the answer's own prose.
   */
  question?: string;
  /**
   * An earlier post in a thread whose newest answer should lead: slate
   * prose, charts behind a line that names them. Notices and receipts are
   * untouched — quieter is never a licence to drop a caveat (turnShape.ts).
   */
  quiet?: boolean;
}) {
  const view = postView(post);
  // One selection path, shared with the live turn and the pinned tile.
  const blocks = useMemo(
    () => blocksFromCharted((post.payload as { charted?: unknown } | null)?.charted),
    [post.payload],
  );
  // The calls behind this answer as they ran, or null — and null means no
  // Pin, not a Pin that guesses. A post from before the calls were stored
  // still draws its snapshot; it simply cannot be re-run from here.
  const calls = useMemo(() => storedCalls(post), [post]);

  if (view.side === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-george-navy px-3.5 py-2.5 text-[15px] leading-relaxed text-george-cream">
          {post.body}
        </p>
        <div className="flex items-center gap-2">
          {post.author_user && (
            <span className="text-[11px] text-george-muted">{post.author_user}</span>
          )}
          <PostTime post={post} />
          {view.canShare && onShare && (
            <button
              type="button"
              onClick={() => onShare(post.id)}
              disabled={sharing}
              className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50"
            >
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          )}
          {onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(post.thread_id)}
              className="text-[11px] text-george-slate hover:text-george-navy"
            >
              Thread
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <article className="flex gap-2.5">
      {/* The avatar slot is held even in a grouped run, so bodies stay aligned
          down the column rather than stepping left under the first of a pair. */}
      <div className="w-7 shrink-0">{!grouped && <MarkAvatar />}</div>

      <div className="min-w-0 flex-1 space-y-2">
        {view.label && (
          // Muted, always. postShape.ACCENT_KINDS is empty and the branch
          // that read it was removed on 2026-09-07 so the shell's needs-you
          // count could take its place on the accent exemption list. If a
          // kind ever earns the colour, this is where it comes back — with
          // the argument made in postShape first.
          <p className="text-[11px] uppercase tracking-wide text-george-muted">
            {view.label}
          </p>
        )}

        {/* Above the body, always, on every kind. */}
        {view.showNotices && <NoticeBanner notices={post.notices} />}

        {post.body && <Prose text={post.body} lede={view.kind === 'answer'} quiet={quiet} />}

        {/* Below the prose because the answer leads with the number. Each
            chart carries its OWN receipts, so the post-level block below would
            only repeat one of them under a different heading. */}
        <ChartedResults blocks={blocks} quiet={quiet} />

        {/* The post-level receipts are the fallback only. When the surface
            drew anything, every block already carries the meta of the call
            behind it, and this line would repeat one of them under a heading
            that covers all of them. */}
        {blocks.length === 0 && view.showReceipts && (
          <ReceiptsBlock meta={post.receipts ?? undefined} />
        )}

        {/* Below the receipts: the chips are about what to do next, and the
            receipts are about the body above them. */}
        {onAsk && <FollowUpChips post={post} onAsk={onAsk} />}

        {/* The same row a live turn ends with, fed by the stored calls. */}
        {calls && (
          <ResultActions calls={calls} question={question} conversationId={post.conversation_id} />
        )}

        <div className="flex items-center gap-2">
          <PostTime post={post} />
          {/* Only on the viewer's own still-private post. postShape decides;
              this places it. */}
          {view.canShare && onShare && (
            <button
              type="button"
              onClick={() => onShare(post.id)}
              disabled={sharing}
              className="text-[11px] text-george-slate hover:text-george-navy disabled:opacity-50"
            >
              {sharing ? 'Sharing…' : 'Share to the river'}
            </button>
          )}
          {onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(post.thread_id)}
              className="text-[11px] text-george-slate hover:text-george-navy"
            >
              Thread
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
