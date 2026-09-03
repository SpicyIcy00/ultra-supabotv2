/**
 * The two rails.
 *
 * The LEFT rail is now real: it lists the caller's pages from GET /pins/pages
 * and expands each to its pins. It names them; the tiles themselves open in the
 * centre column (see PinnedPage) because a notice banner and a receipts line do
 * not fit in 256px, and UI rule 4 says a tile that cannot show its caveat is
 * the wrong shape.
 *
 * The RIGHT rail is still an honest placeholder: there is no approval queue
 * endpoint, so it carries its real shape and an empty state that says what is
 * missing rather than showing fake rows.
 *
 * Responsive contract (UI rule 7 — the centre column is the whole screen on a
 * phone): below lg both rails are OVERLAYS. They never take width from the
 * conversation, they cover it and dismiss.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, ChevronRight, PanelLeft, X } from 'lucide-react';
import { listPinPages, listPins } from '../../services/pinsApi';

interface RailProps {
  open: boolean;
  onClose: () => void;
}

interface LeftRailProps extends RailProps {
  /** Which page the centre column is showing, if any. */
  selected?: string | null;
  hasSelection?: boolean;
  onSelectPage: (page: string | null) => void;
}

/* ---------------------------------------------------------------- left ---- */

export function LeftRail({
  open,
  onClose,
  selected,
  hasSelection,
  onSelectPage,
}: LeftRailProps) {
  const pages = useQuery({ queryKey: ['pin-pages'], queryFn: listPinPages });
  const total = (pages.data ?? []).reduce((n, p) => n + p.pins, 0);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close pages"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-george-navy/20 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-george-line bg-george-cream
          transition-transform lg:static lg:z-auto lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full lg:hidden'}`}
        aria-label="Saved pages"
      >
        <div className="flex items-center justify-between px-3 py-3">
          <h2 className="font-george-serif text-[15px] text-george-navy">Pages</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pages"
            className="flex h-8 w-8 min-h-touch min-w-touch items-center justify-center text-george-slate lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {pages.isPending && (
            <p className="text-[13px] text-george-muted">Loading pages…</p>
          )}

          {pages.isError && (
            <p className="text-[13px] leading-relaxed text-george-slate">
              Could not load pages.
            </p>
          )}

          {/* The empty state that has been waiting for this endpoint. */}
          {pages.data && total === 0 && (
            <>
              <p className="text-[13px] leading-relaxed text-george-slate">
                No saved pages yet.
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
                Pin an answer to start one. A pin re-runs; the page collects them.
              </p>
            </>
          )}

          {hasSelection && (
            <button
              type="button"
              onClick={() => onSelectPage(null)}
              className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-george-slate hover:bg-george-line/40"
            >
              ← Back to conversation
            </button>
          )}

          <ul className="space-y-0.5">
            {(pages.data ?? []).map((p) => (
              <PageRow
                key={p.page ?? '__ungrouped__'}
                page={p.page}
                count={p.pins}
                active={hasSelection === true && selected === p.page}
                onOpen={() => onSelectPage(p.page)}
              />
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}

/**
 * One page: a row that opens it in the centre, and a disclosure listing the pin
 * titles it holds. The titles are navigation, not tiles — see the file header.
 */
function PageRow({
  page,
  count,
  active,
  onOpen,
}: {
  page: string | null;
  count: number;
  active: boolean;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pins = useQuery({
    queryKey: ['pins', page],
    queryFn: () => listPins(page),
    enabled: expanded,
  });

  return (
    <li>
      <div
        className={`flex items-center gap-0.5 rounded-lg ${active ? 'bg-george-line/50' : ''}`}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${page ?? 'Ungrouped'}` : `Expand ${page ?? 'Ungrouped'}`}
          className="flex h-8 w-6 items-center justify-center text-george-muted"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="flex min-h-touch flex-1 items-center justify-between gap-2 rounded-lg py-1.5 pr-2 text-left text-[13px] text-george-navy hover:bg-george-line/40"
        >
          <span className="truncate">{page ?? 'Ungrouped'}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-george-muted">{count}</span>
        </button>
      </div>

      {expanded && (
        <ul className="mb-1 ml-6 space-y-0.5 border-l border-george-line pl-2">
          {pins.isPending && <li className="py-1 text-[12px] text-george-muted">Loading…</li>}
          {(pins.data ?? []).map((pin) => (
            <li key={pin.id}>
              <button
                type="button"
                onClick={onOpen}
                className="w-full truncate rounded py-1 text-left text-[12px] text-george-slate hover:text-george-navy"
                title={pin.title}
              >
                {pin.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Desktop-only strip shown when the left rail is collapsed (its default). */
export function LeftRailStub({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open pages"
      className="hidden lg:flex w-11 shrink-0 flex-col items-center border-r border-george-line bg-george-cream pt-3 text-george-slate"
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

/* --------------------------------------------------------------- right ---- */

export function RightRail({ open, onClose }: RailProps) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close attention"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-george-navy/20 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 w-80 shrink-0 border-l border-george-line bg-george-cream
          transition-transform lg:static lg:z-auto lg:translate-x-0
          ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
        aria-label="Needs you"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-george-serif text-[15px] text-george-navy">Needs you</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 min-h-touch min-w-touch items-center justify-center text-george-slate lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4">
          {/* Empty state is navy, not orange. Orange means something actually
              needs you (UI rule 5) — an empty queue must not wear it. */}
          <p className="text-[13px] leading-relaxed text-george-slate">Nothing needs you.</p>
          <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
            Approvals will appear here when the queue exists.
          </p>
        </div>
      </aside>
    </>
  );
}

/** Header button for the right rail. Wears orange only when count > 0. */
export function AttentionButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${count} need you` : 'Nothing needs you'}
      className="relative flex h-9 w-9 min-h-touch min-w-touch items-center justify-center rounded-lg text-george-slate lg:hidden"
    >
      <Bell className={`h-4 w-4 ${count > 0 ? 'text-george-accent' : ''}`} />
      {count > 0 && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-george-accent" />
      )}
    </button>
  );
}
