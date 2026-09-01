/**
 * A caveat that qualifies a number.
 *
 * UI rule 4: notices surface identically in chat, on tiles, and in the approval
 * queue — so this component is the ONLY place a notice is rendered, and all
 * three surfaces import it. It is deliberately not collapsible: a notice means
 * the result is not what it appears, and hiding it behind a disclosure is the
 * failure this rule exists to prevent.
 *
 * Orange here is the reserved "needs you" colour (UI rule 5).
 */
import { AlertTriangle } from 'lucide-react';
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

export function NoticeBanner({ notices }: { notices: GeorgeNotice[] }) {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((n, i) => (
        <div
          key={`${n.kind}-${i}`}
          role="note"
          className="flex gap-2.5 rounded-lg border border-george-accent/35 bg-george-accent-soft px-3 py-2.5"
        >
          <AlertTriangle
            className="h-4 w-4 shrink-0 mt-0.5 text-george-accent"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-george-accent">
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
