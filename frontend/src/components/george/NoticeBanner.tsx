/**
 * A caveat that qualifies a number.
 *
 * UI rule 4: notices surface identically in chat, on tiles, on posts and in the
 * approval queue — so this file is the ONLY place a notice is rendered, and
 * every surface imports from it.
 *
 * TWO FORMS, AND THE LINE BETWEEN THEM IS SURFACING vs SPELLING OUT.
 *
 *   NoticeBanner     the caveat whole, ABOVE the figure it qualifies, never
 *                    collapsible. Everywhere a number is being ANSWERED.
 *   CompactNotices   one line per caveat, naming it, with the explanation on
 *                    tap. The greeting only.
 *
 * Neither hides a notice: in both, the reader is told which caveat applies
 * without doing anything. What the compact form defers is the sentence, and
 * only where the caveat arrives BEFORE the thing it qualifies rather than
 * after — see CompactNotice for why the greeting is that case and a turn is
 * not.
 *
 * What remains forbidden is what the rule was written against: a caveat behind
 * a disclosure that gives no hint it is there, and a card that shows a number
 * with the caveat dropped for want of room.
 *
 * NO ACCENT HERE, AND THAT IS THE POINT (UI rule 5, corrected 2026-09-05).
 * This component wore the approvals colour from its first commit, which
 * predates the rule and was carried forward unexamined — so every notice in
 * the app, on every surface, was spending the one colour reserved for "needs
 * you". A notice needs nobody: it is informational, it qualifies a number that
 * is already on screen, and there is nothing to go and do about it.
 *
 * The prominence a caveat needs comes from POSITION and STRUCTURE, not hue: it
 * sits above the number it qualifies, it cannot be collapsed, and it carries a
 * rule down its left edge. That is the same treatment the approval row uses,
 * in slate rather than accent — deliberately, so the two read as the same
 * KIND of thing at a glance and differ only in whether they are asking for
 * anything.
 */
import { useState } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { GeorgeNotice } from '../../types/george';

/** Human labels for the kinds emitted by the tools; unknown kinds pass through. */
const KIND_LABEL: Record<string, string> = {
  low_stock_not_operational: 'Thresholds not configured',
  snapshot_coverage_gap: 'Outside snapshot coverage',
  snapshot_gaps: 'Gaps in the snapshot series',
  sku_not_found: 'Unknown SKU',
  ambiguous_sku: 'SKU matches several products',
  duplicate_skus_in_result: 'Duplicate SKUs in result',
  metric_redefined: 'Metric means something different here',
  reconciliation_failed: 'Measures disagree',
  orphan_line_items: 'Line items with no product',
  profit_overstated: 'Profit overstated',
  low_category_coverage: 'Low category coverage',
  stale_stock: 'Stock data is stale',
  no_recorded_dispatch: 'No recorded dispatch',
  notice_forced: 'Caveat added automatically',
  unsurfaced_notice: 'Caveat was missing',
  logging_failed: 'Logging failed',
};

/**
 * One notice, one line, with the detail on tap.
 *
 * FOR THE GREETING ONLY, and the distinction that makes it allowable is
 * between SURFACING a caveat and SPELLING IT OUT. The line is always visible
 * and always says which caveat applies — "Thresholds not configured" is on
 * screen whether or not anybody taps. What moves behind the tap is the
 * sentence explaining it.
 *
 * The greeting needs this and a turn does not. A turn is an answer to a
 * question somebody just asked, so a caveat above the number is read on the
 * way to the number. The greeting is the first thing on the page, unasked for:
 * two full notice cards above it meant George opened by qualifying something
 * the reader had not yet been told, and the sentence — the whole point of the
 * greeting — started below the fold on a phone.
 *
 * So the sentence leads and the caveats sit under it, one line each. Anywhere
 * a figure is being ANSWERED, the full banner still goes above it.
 */
function CompactNotice({ notice }: { notice: GeorgeNotice }) {
  const [open, setOpen] = useState(false);
  const label = KIND_LABEL[notice.kind] ?? notice.kind.replace(/_/g, ' ');
  return (
    <div className="border-l-2 border-george-slate pl-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-touch w-full items-center gap-1.5 text-left text-[12px] text-george-navy"
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-george-slate" aria-hidden />
        <span className="flex-1 truncate">{label}</span>
        <ChevronRight
          className={`h-3 w-3 shrink-0 text-george-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="pb-1.5">
          <p className="text-[12px] leading-relaxed text-george-navy">{notice.message}</p>
          {notice.source && (
            <p className="mt-1 text-[11px] text-george-muted break-words">{notice.source}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Every notice as its own one-line row. See CompactNotice for why. */
export function CompactNotices({ notices }: { notices: GeorgeNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-1">
      {notices.map((n, i) => (
        <CompactNotice key={`${n.kind}-${i}`} notice={n} />
      ))}
    </div>
  );
}

export function NoticeBanner({ notices }: { notices: GeorgeNotice[] }) {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((n, i) => (
        <div
          key={`${n.kind}-${i}`}
          role="note"
          className="flex gap-2.5 border-l-2 border-george-slate bg-george-paper px-3 py-2.5"
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0 mt-0.5 text-george-slate"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-george-navy">
              {KIND_LABEL[n.kind] ?? n.kind.replace(/_/g, ' ')}
            </p>
            <p className="text-[13px] leading-relaxed text-george-navy break-words">
              {n.message}
            </p>
            {n.source && (
              <p className="mt-1 text-[11px] text-george-muted break-words">{n.source}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
