/**
 * /pages — the software George has made with people.
 *
 * A page is a collection of pins and has no existence apart from them
 * (CLAUDE.md vocabulary). What it is FOR, though, is the questions on it,
 * and what makes it worth opening is that every figure is read again when it
 * opens. This list used to say neither: it named the page and counted it,
 * which is the one fact about a page that does not matter.
 *
 * So each page reads as a thing: its name, the questions it answers in the
 * words somebody asked them, and when its figures were last read. All of it
 * comes from the pins list, which already carried titles and run times —
 * see pageShape.ts, where the suite holds the decisions.
 *
 * The open page is in the URL, so a page is a thing you can send somebody.
 * "Ungrouped" is a real page — the pins with no page — and gets a real
 * parameter value rather than an absent one.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PinnedPage } from '../components/george/PinnedPage';
import { freshness, pagesOf } from '../components/george/pageShape';
import { ago } from '../components/george/pinShape';
import { PageHeader } from '../components/shell/PageHeader';
import { SHELL_COLUMN } from '../components/shell/shellLayout';
import { listPins } from '../services/pinsApi';

const UNGROUPED = '~';

export default function PagesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('p');
  // undefined: the list. null: Ungrouped. string: a named page.
  const open: string | null | undefined =
    raw === null ? undefined : raw === UNGROUPED ? null : raw;

  // Every pin in one request; the pages are a grouping of them, which is
  // exactly what a page is.
  const pins = useQuery({ queryKey: ['pins'], queryFn: () => listPins(), staleTime: 30_000 });
  const pages = useMemo(() => pagesOf(pins.data ?? []), [pins.data]);

  if (open !== undefined) {
    return (
      <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
        <PinnedPage page={open} onBack={() => setParams({})} />
      </div>
    );
  }

  return (
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
      <PageHeader
        title="Pages"
        meta="Each page re-runs its questions when you open it, so what you read is what the data says now — not what it said when the page was made."
      />

      {/* Three states; the first two never borrow the third's words. */}
      {pins.isPending && <p className="text-[13px] text-george-muted">Loading pages…</p>}
      {pins.isError && (
        <p className="text-[13px] leading-relaxed text-george-slate">Could not load pages.</p>
      )}
      {pins.isSuccess && pages.length === 0 && (
        <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">
          No pages yet. Pin an answer in Ask and it becomes the first thing on one.
        </p>
      )}

      <ul>
        {pages.map((p) => (
          <li key={p.page ?? UNGROUPED} className="border-t border-george-line first:border-t-0">
            <button
              type="button"
              onClick={() => setParams({ p: p.page ?? UNGROUPED })}
              className="group block w-full py-7 text-left first:pt-0"
            >
              <h2 className="font-george-serif text-[22px] leading-snug text-george-navy group-hover:underline group-hover:underline-offset-4">
                {p.name}
              </h2>

              {/* What the page is for, quoted rather than described. */}
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-george-slate">
                {p.contents.join(' · ')}
                {p.more > 0 && (
                  <span className="text-george-muted">
                    {' '}· and {p.more} more
                  </span>
                )}
              </p>

              <p className="mt-2.5 text-[12px] text-george-muted">
                {freshness(p.lastOk, ago)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
