/**
 * What George considered of the page, under an answer that read it.
 *
 * The same shape as ReceiptsBlock, because it is the same kind of thing:
 * evidence about the answer, one line always visible, the detail in place
 * beneath it (UI rule 3 — no new route, no modal). The line says how much
 * of the page was read and what did not come back; the disclosure names
 * each pin with its state and when its figures were read, the pins that were
 * not inspected, and any requested ids that were not on the page.
 *
 * No figure lives here. The figures a page read produced went to the model
 * and are in the tool-call log; this block exists so a reader can tell what
 * George looked at — and, when the answer is a stored post opened a week
 * later, what he looked at THEN. Navy and slate only: nothing here needs
 * anyone (UI rule 5).
 */
import { useState } from 'react';
import { ChevronRight, LayoutList } from 'lucide-react';
import type { PageContextFrame } from '../../types/george';
import { pageContextLine, pageName, pinStatusLabel } from './pageContextShape';

function ago(iso?: string | null): string {
  if (!iso) return 'time unknown';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

function manila(iso?: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

export function PageContextBlock({ context }: { context?: PageContextFrame | null }) {
  const [open, setOpen] = useState(false);
  if (!context) return null;

  return (
    <div className="rounded-lg border border-george-line bg-george-paper">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left min-h-touch"
        aria-expanded={open}
      >
        <LayoutList className="h-3.5 w-3.5 shrink-0 text-george-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[12px] text-george-slate">
          <span className="text-george-navy">{pageContextLine(context)}</span>
          {' · '}
          {ago(context.read_at)}
        </span>
        <span className="hidden xs:inline shrink-0 text-[11px] text-george-muted">page context</span>
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-george-muted transition-transform ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-george-line px-3 py-3">
          <div className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-[12px] leading-relaxed">
            <span className="text-george-muted">Page</span>
            <span className="text-george-navy">{pageName(context)}</span>
            <span className="text-george-muted">Read at</span>
            <span>
              <span className="tabular-nums">{manila(context.read_at)}</span>{' '}
              <span className="text-george-muted">Manila · {ago(context.read_at)}</span>
            </span>
          </div>

          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-george-muted">
              Considered
            </p>
            <ul className="space-y-1">
              {context.pins.map((pin) => (
                <li key={pin.pin_id} className="text-[12px] leading-relaxed">
                  <span className="text-george-navy">{pin.title}</span>
                  <span className="text-george-muted"> · {pinStatusLabel(pin)}</span>
                  {pin.snapshot_timestamp && (
                    <span className="text-george-muted">
                      {' · read '}
                      <span className="tabular-nums">{manila(pin.snapshot_timestamp)}</span>
                    </span>
                  )}
                  {pin.notice_kinds.length > 0 && (
                    <span className="text-george-muted">
                      {' · '}
                      {pin.notice_kinds.length === 1
                        ? '1 notice'
                        : `${pin.notice_kinds.length} notices`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {context.not_inspected.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-george-muted">
                Not inspected
              </p>
              <ul className="space-y-1">
                {context.not_inspected.map((pin) => (
                  <li key={pin.pin_id} className="text-[12px] leading-relaxed text-george-slate">
                    {pin.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {context.unavailable.length > 0 && (
            <p className="text-[12px] leading-relaxed text-george-slate">
              Not on this page: {context.unavailable.join(', ')}
            </p>
          )}

          {context.rows_dropped > 0 && (
            <p className="text-[11px] text-george-muted">
              Some figures were left out of what George read to keep the page read within
              its size limit; their receipts were kept.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
