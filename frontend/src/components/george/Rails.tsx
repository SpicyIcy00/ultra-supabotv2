/**
 * The two rails.
 *
 * Both are honest placeholders: there is no `george.pins` table and no approval
 * queue endpoint yet, so neither rail invents a schema or shows fake rows. They
 * carry their real shape and an empty state that says what is missing, which is
 * more useful than a panel that looks populated.
 *
 * Responsive contract (UI rule 7 — the centre column is the whole screen on a
 * phone): below lg both rails are OVERLAYS. They never take width from the
 * conversation, they cover it and dismiss.
 */
import { Bell, PanelLeft, Plus, X } from 'lucide-react';

interface RailProps {
  open: boolean;
  onClose: () => void;
}

/* ---------------------------------------------------------------- left ---- */

export function LeftRail({ open, onClose }: RailProps) {
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
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-george-line bg-george-cream
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

        <div className="px-3">
          <p className="text-[13px] leading-relaxed text-george-slate">
            No saved pages yet.
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
            Pin an answer to start one. A pin re-runs; the page collects them.
          </p>
          <button
            type="button"
            disabled
            className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-george-line px-3 py-2 text-[13px] text-george-muted opacity-60"
            title="Pinning needs the pins endpoint"
          >
            <Plus className="h-3.5 w-3.5" />
            New page
          </button>
        </div>
      </aside>
    </>
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
