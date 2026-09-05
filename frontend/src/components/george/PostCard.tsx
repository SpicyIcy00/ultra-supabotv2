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
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Post } from '../../types/river';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';
import { MARK_PATH } from './markState';
import { postView } from './postShape';

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

export function PostCard({
  post,
  grouped = false,
  onAsk,
}: {
  post: Post;
  grouped?: boolean;
  /** Absent where there is nowhere to ask; chips are then not offered. */
  onAsk?: (question: string) => void;
}) {
  const view = postView(post);

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
          <p
            className={`text-[11px] uppercase tracking-wide ${
              // The ONLY place a post may wear the approvals colour, and
              // postShape decides it — never this component.
              view.accent ? 'text-george-accent' : 'text-george-muted'
            }`}
          >
            {view.label}
          </p>
        )}

        {/* Above the body, always, on every kind. */}
        {view.showNotices && <NoticeBanner notices={post.notices} />}

        {post.body && (
          <div className="george-prose text-[15px] leading-relaxed text-george-navy">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
          </div>
        )}

        {view.showReceipts && <ReceiptsBlock meta={post.receipts ?? undefined} />}

        {/* Below the receipts: the chips are about what to do next, and the
            receipts are about the body above them. */}
        {onAsk && <FollowUpChips post={post} onAsk={onAsk} />}

        <PostTime post={post} />
      </div>
    </article>
  );
}
