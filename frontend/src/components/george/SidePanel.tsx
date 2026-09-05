/**
 * Pages, workflows and what needs you — reached for, not always present.
 *
 * A DRAWER OF REFERENCE, not a navigation rail. The river is the surface; this
 * holds the things you go and look up: live pinned figures, the company's
 * rules, and the approval queue. On a phone it is an overlay over the whole
 * screen; on desktop it opens beside the river rather than taking width from
 * it permanently (UI rule 7).
 *
 * It carries no chat list, because there are no chats. Threads emerge in the
 * river and are found by scrolling or searching it (CLAUDE.md, amended
 * 2026-09-05).
 *
 * THE APPROVAL QUEUE IS THE ONLY THING HERE THAT MAY WEAR THE ACCENT, and only
 * when its count came back non-zero. approvalState decides that; this file
 * places it.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronRight, X } from 'lucide-react';
import type { ApprovalsView } from './approvalState';
import { PinnedPage } from './PinnedPage';
import { listPinPages } from '../../services/pinsApi';

export function SidePanel({
  open,
  onClose,
  approvals,
}: {
  open: boolean;
  onClose: () => void;
  approvals: ApprovalsView;
}) {
  const [tab, setTab] = useState<'needs' | 'pages'>('needs');
  /**
   * The page whose TILES are open, or undefined for the list of pages.
   *
   * `null` is a real value here — it is the "Ungrouped" page, the pins with no
   * page — so the closed state has to be `undefined` rather than null. Using
   * null for both would make Ungrouped unopenable.
   */
  const [openPage, setOpenPage] = useState<string | null | undefined>(undefined);
  const pages = useQuery({ queryKey: ['pin-pages'], queryFn: listPinPages, enabled: open });

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fixed inset-0 z-30 bg-george-navy/20"
      />
      <aside
        className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col border-l border-george-line bg-george-cream"
        aria-label="Pages and workflows"
      >
        <div className="flex items-center gap-1 border-b border-george-line px-3 py-2">
          {(['needs', 'pages'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? 'true' : undefined}
              className={`min-h-touch rounded-lg px-2.5 text-[13px] ${
                tab === t ? 'text-george-navy' : 'text-george-muted'
              }`}
            >
              {t === 'needs' ? 'Needs you' : 'Pages'}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 min-h-touch min-w-touch items-center justify-center text-george-slate"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {tab === 'needs' ? (
            approvals.kind === 'rows' ? (
              <>
                <p className="mb-2 text-[12px] text-george-accent">{approvals.heading}</p>
                <ul className="space-y-2">
                  {approvals.rows.map((a) => (
                    <li
                      key={a.version_id}
                      className="border-l-2 border-george-accent bg-george-paper py-2 pl-2.5 pr-2"
                    >
                      <p className="text-[13px] leading-snug text-george-navy">
                        {a.name}{' '}
                        <span className="tabular-nums text-george-slate">v{a.version}</span>
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-george-slate">
                        {a.blocked_on}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-george-slate">
                  {approvals.heading}
                </p>
                {approvals.detail && (
                  <p className="mt-1 text-[12px] leading-relaxed text-george-muted">
                    {approvals.detail}
                  </p>
                )}
              </>
            )
          ) : (
            openPage !== undefined ? (
              /* THE DRAWER SHOWS FIGURES, NOT NAMES. PinTile re-runs its calls
                 on mount, so these are current rather than remembered — and it
                 carries its own NoticeBanner and ReceiptsBlock, which is what
                 makes a tile allowed to show a number at all (UI rules 3, 4,
                 6). At this width a long caveat is tall; that is the tile
                 being the right shape, not the wrong one. */
              <div>
                <button
                  type="button"
                  onClick={() => setOpenPage(undefined)}
                  className="mb-2 flex min-h-touch items-center gap-1.5 text-[12px] text-george-slate hover:text-george-navy"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  All pages
                </button>
                <PinnedPage page={openPage} onBack={() => setOpenPage(undefined)} />
              </div>
            ) : (
            <>
              {pages.isPending && (
                <p className="text-[13px] text-george-muted">Loading pages…</p>
              )}
              {pages.isError && (
                <p className="text-[13px] leading-relaxed text-george-slate">
                  Could not load pages.
                </p>
              )}
              {pages.data?.length === 0 && (
                <p className="text-[13px] leading-relaxed text-george-slate">
                  No pages yet. Pin an answer to start one.
                </p>
              )}
              <ul className="space-y-0.5">
                {(pages.data ?? []).map((p) => (
                  <li key={p.page ?? '__ungrouped__'}>
                    <button
                      type="button"
                      onClick={() => setOpenPage(p.page)}
                      className="flex min-h-touch w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-george-navy hover:bg-george-line/40"
                    >
                      <span className="truncate">{p.page ?? 'Ungrouped'}</span>
                      <span className="shrink-0 tabular-nums text-[11px] text-george-muted">
                        {p.pins}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-george-muted" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </>
            )
          )}
        </div>
      </aside>
    </>
  );
}
