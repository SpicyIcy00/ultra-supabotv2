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
import type { ToolMeta } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import type { Post } from '../../types/river';
import { GeorgeChart } from './GeorgeChart';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptsBlock } from './ReceiptsBlock';
import { MARK_PATH } from './markState';
import { postView } from './postShape';
import { inferShape } from './pinShape';

/** Whether this post draws its own charts, each with its own receipts. */
function hasCharts(post: Post): boolean {
  const raw = (post.payload as { charted?: unknown } | null)?.charted;
  return Array.isArray(raw) && raw.length > 0;
}

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
 * The figures a stored post describes, drawn through the SAME component a live
 * turn and a tile draw them with.
 *
 * A SNAPSHOT, AND IT SAYS SO. The rows were stored when the answer was
 * written, not re-fetched now — see ConversationLog.posts for why re-running
 * would put a fresh chart beside prose that still states the old figure. What
 * makes that honest is the receipts underneath: `snapshot_timestamp` is when
 * the data was READ, not when this rendered, so the chart carries its own age
 * (UI rule 6).
 *
 * Per result rather than per post, because an answer that read two sources
 * read them at two moments, and one timestamp over both would describe data it
 * does not cover.
 *
 * The loop only ever stored results it could send whole, so `rowsComplete` is
 * true by construction here; passing it explicitly keeps inferShape's refusal
 * to chart a prefix in the picture rather than relying on that invariant
 * holding forever.
 */
function ChartedResults({ post }: { post: Post }) {
  const raw = (post.payload as { charted?: unknown } | null)?.charted;
  const results = Array.isArray(raw) ? raw : [];
  const charts = results.flatMap((r) => {
    const entry = r as { seq?: number; tool?: string; rows?: unknown; meta?: unknown };
    const rows = Array.isArray(entry.rows) ? (entry.rows as Record<string, unknown>[]) : [];
    if (rows.length === 0) return [];
    // inferShape reads only `rows` and `meta`; the rest of PinCallResult is a
    // tile's run state, which a stored post has no equivalent of. Filled with
    // what is true rather than left undefined: the call succeeded, or the loop
    // would not have stored its rows.
    const result: PinCallResult = {
      tool: entry.tool ?? '',
      arguments: {},
      status: 'ok',
      duration_ms: 0,
      rows,
      meta: (entry.meta ?? {}) as ToolMeta,
      notices: [],
    };
    const shape = inferShape(result, undefined, true);
    return shape?.kind === 'chart' ? [{ seq: entry.seq ?? 0, result, shape }] : [];
  });
  if (charts.length === 0) return null;
  return (
    <div className="space-y-3">
      {charts.map(({ seq, result, shape }) => (
        <div key={seq} className="rounded-xl border border-george-line bg-george-paper p-3">
          <GeorgeChart shape={shape} meta={result.meta} />
          <ReceiptsBlock meta={result.meta} />
        </div>
      ))}
    </div>
  );
}

export function PostCard({
  post,
  grouped = false,
  onAsk,
  onOpenThread,
  onShare,
  sharing = false,
}: {
  post: Post;
  grouped?: boolean;
  /** Absent where there is nowhere to ask; chips are then not offered. */
  onAsk?: (question: string) => void;
  /** Absent inside a thread, where there is nowhere further to go. */
  onOpenThread?: (threadId: string) => void;
  onShare?: (postId: string) => void;
  sharing?: boolean;
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

        {/* Below the prose because the answer leads with the number. Each
            chart carries its OWN receipts, so the post-level block below would
            only repeat one of them under a different heading. */}
        <ChartedResults post={post} />

        {!hasCharts(post) && view.showReceipts && (
          <ReceiptsBlock meta={post.receipts ?? undefined} />
        )}

        {/* Below the receipts: the chips are about what to do next, and the
            receipts are about the body above them. */}
        {onAsk && <FollowUpChips post={post} onAsk={onAsk} />}

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
