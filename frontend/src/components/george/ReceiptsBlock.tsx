/**
 * The receipts under an answer.
 *
 * UI rule 3: every number is inspectable, in the SAME panel — no new route, no
 * modal. So this expands in place beneath the answer it belongs to.
 * UI rule 6: no number displays without a timestamp, which is why the collapsed
 * summary leads with when the data was read rather than hiding it inside.
 *
 * Everything here comes from the tool's `meta`. Nothing is computed in the UI.
 */
import { useState } from 'react';
import { ChevronRight, Clock } from 'lucide-react';
import type { ToolMeta } from '../../types/george';
import { scopeLine } from './receiptShape';

/** "read 4 min ago" — relative, paired with the absolute time, never alone. */
function ago(iso?: string): string {
  if (!iso) return 'time unknown';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

function manila(iso?: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

/** filters_applied entries are "<sql>   # metrics.yaml: <key>" */
function splitFilter(line: string): { sql: string; cite?: string } {
  const i = line.indexOf('#');
  return i === -1
    ? { sql: line.trim() }
    : { sql: line.slice(0, i).trim(), cite: line.slice(i + 1).trim() };
}

export function ReceiptsBlock({
  meta,
  scopeInHeading = false,
}: {
  meta?: ToolMeta;
  /**
   * True when the block above already states the scope — a group's heading is
   * built from the same window and store argument (resultShape.groupHeading).
   * Saying "This week" twice, once as a heading and once under it, is the
   * duplication this stage exists to remove; the read time is not duplicated
   * and always stays.
   */
  scopeInHeading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!meta) return null;

  const rec = meta.reconciliation;

  return (
    <div className="mt-3 rounded-lg border border-george-line bg-george-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left min-h-touch"
        aria-expanded={open}
      >
        <Clock className="h-3.5 w-3.5 shrink-0 text-george-muted" aria-hidden />
        {/* LEVEL 2: what was measured, in words. This line used to lead with
            `new_transaction_items` — a table name, on the always-visible line
            under every figure in the app, for a reader who asked how a store
            did. The window and the scope are the same fact in the language of
            the question; the table is provenance and is one tap down with the
            filters that cite it. Nothing was removed. */}
        <span className="text-[12px] text-george-slate flex-1 min-w-0 truncate">
          {!scopeInHeading && (
            <>
              <span className="text-george-navy">{scopeLine(meta)}</span>
              {' · '}
            </>
          )}
          {'read '}
          {ago(meta.snapshot_timestamp)}
        </span>
        <span className="hidden xs:inline text-[11px] text-george-muted shrink-0">receipts</span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-george-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-george-line px-3 py-3">
          <Row label="Source">{meta.source_table ?? '—'}</Row>

          <Row label="Read at">
            <span className="tabular-nums">{manila(meta.snapshot_timestamp)}</span>{' '}
            <span className="text-george-muted">Manila · {ago(meta.snapshot_timestamp)}</span>
          </Row>

          {meta.window && (
            <Row label="Window">
              {meta.window.kind === 'preset'
                ? `${meta.window.name} (${meta.window.start} → ${meta.window.end})`
                : `${meta.window.start} → ${meta.window.end}`}
              <span className="text-george-muted"> · half-open, Manila</span>
            </Row>
          )}

          {meta.comparison?.baseline && (
            <Row label="Baseline">
              {meta.comparison.baseline.start} → {meta.comparison.baseline.end}
              <span className="text-george-muted">
                {' '}· {meta.comparison.display_name ?? meta.comparison.kind}
                {meta.comparison.baseline_statuses &&
                  Object.entries(meta.comparison.baseline_statuses).some(([k]) => k !== 'ok') &&
                  ' · ' +
                    Object.entries(meta.comparison.baseline_statuses)
                      .filter(([k]) => k !== 'ok')
                      .map(([k, n]) => `${n} ${k.replace(/_/g, ' ')}`)
                      .join(', ')}
              </span>
            </Row>
          )}

          {meta.filters_applied?.length ? (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-george-muted">
                Filters applied
              </p>
              <ul className="space-y-1">
                {meta.filters_applied.map((f, i) => {
                  const { sql, cite } = splitFilter(f);
                  return (
                    <li key={i} className="text-[12px] leading-relaxed">
                      <code className="text-george-navy break-words">{sql}</code>
                      {cite && (
                        <span className="ml-1.5 text-[11px] text-george-muted break-words">
                          {cite}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {meta.truncated_for_model && (
            <Row label="Sampled">
              {meta.rows_omitted} of {meta.row_count} rows withheld from the model. Totals above
              cover all rows.
            </Row>
          )}

          {rec && (
            <Row label="Reconciliation">
              {!rec.applicable ? (
                <span className="text-george-muted">not applicable — {rec.reason}</span>
              ) : rec.holds ? (
                <span>
                  net_sales and product_revenue agree
                  <span className="text-george-muted"> · gap 0.00</span>
                </span>
              ) : (
                // Navy, not accent: measures disagreeing is a fact about the
                // figure, not something waiting on a person (UI rule 5).
                <span className="font-medium text-george-navy">
                  measures disagree by {rec.gap?.toLocaleString()} ({rec.gap_pct}%)
                </span>
              )}
            </Row>
          )}

          {meta.definitions_version !== undefined && (
            <p className="pt-1 text-[11px] text-george-muted">
              definitions v{meta.definitions_version} · metrics.yaml
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-george-muted">{label}</p>
      <p className="text-[12px] leading-relaxed text-george-navy break-words">{children}</p>
    </div>
  );
}
