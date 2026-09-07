/**
 * /pages — the pinned figures, by page.
 *
 * A page is a collection of pins and has no existence apart from them
 * (CLAUDE.md vocabulary). This lists the pages, and opens one into the same
 * PinnedPage the drawer used to open — tiles that re-run their calls, each
 * with its own notices and receipts, which is what makes a tile allowed to
 * show a number at all (UI rules 3, 4, 6).
 *
 * The open page is in the URL, so a page is a thing you can send somebody.
 * "Ungrouped" is a real page — the pins with no page — and gets a real
 * parameter value rather than an absent one.
 */
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PinnedPage } from '../components/george/PinnedPage';
import { SHELL_COLUMN } from '../components/shell/shellLayout';
import { listPinPages } from '../services/pinsApi';

const UNGROUPED = '~';

export default function PagesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('p');
  // undefined: the list. null: Ungrouped. string: a named page.
  const open: string | null | undefined =
    raw === null ? undefined : raw === UNGROUPED ? null : raw;

  const pages = useQuery({ queryKey: ['pin-pages'], queryFn: listPinPages });

  if (open !== undefined) {
    return (
      <div className={`${SHELL_COLUMN} px-4 pb-24 pt-8 md:px-8 md:pt-12`}>
        <PinnedPage page={open} onBack={() => setParams({})} />
      </div>
    );
  }

  return (
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-8 md:px-8 md:pt-12`}>
      <h1 className="font-george-serif text-2xl text-george-navy">Pages</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-george-slate">
        Every tile re-runs its calls when a page opens, so these are current figures
        rather than saved ones.
      </p>

      {/* Three states; the first two never borrow the third's words. */}
      {pages.isPending && <p className="mt-8 text-[13px] text-george-muted">Loading pages…</p>}
      {pages.isError && (
        <p className="mt-8 text-[13px] leading-relaxed text-george-slate">Could not load pages.</p>
      )}
      {pages.data?.length === 0 && (
        <p className="mt-8 text-[13px] leading-relaxed text-george-slate">
          No pages yet. Pin an answer to start one.
        </p>
      )}

      <ul className="mt-8 space-y-1">
        {(pages.data ?? []).map((p) => (
          <li key={p.page ?? UNGROUPED}>
            <button
              type="button"
              onClick={() => setParams({ p: p.page ?? UNGROUPED })}
              className="flex min-h-touch w-full items-baseline justify-between gap-4 text-left"
            >
              <span className="font-george-serif text-[17px] text-george-navy">
                {p.page ?? 'Ungrouped'}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-george-muted">
                {p.pins} {p.pins === 1 ? 'pin' : 'pins'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
