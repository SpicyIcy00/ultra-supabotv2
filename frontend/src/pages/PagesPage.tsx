/**
 * /pages — the workspaces George has made with people.
 *
 * A page is a row now (2026-09-08): a title, a one-line purpose, an ordered
 * set of pins, and a time it last changed. What makes it worth opening is
 * still that every figure is read again when it opens, and what says what it
 * is FOR is still the questions on it, quoted rather than described — plus,
 * now, the purpose its owner wrote. See pageShape.ts, where the suite holds
 * the decisions.
 *
 * THE OPEN PAGE IS IN THE URL BY IDENTITY: `/pages/<id>`, and
 * `/pages/ungrouped` for the pins with no page. A page is a thing you can
 * send somebody, and the link survives a rename. The old `/pages?p=<name>`
 * is resolved against the person's current pages and redirected, or told
 * plainly that no page has that name any more.
 *
 * THERE IS A "NEW PAGE" NOW, because an empty page is a real thing: a name
 * and a purpose, opened, and handed to George to fill from its foot. Nothing
 * is put on it unasked.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PinnedPage } from '../components/george/PinnedPage';
import {
  freshness,
  legacyPagePath,
  pageIdFromSegment,
  pagePath,
  pageViews,
} from '../components/george/pageShape';
import { ago } from '../components/george/pinShape';
import { PageHeader } from '../components/shell/PageHeader';
import { SHELL_COLUMN } from '../components/shell/shellLayout';
import type { SimilarPageConflict } from '../types/pins';
import { createPage, listPages } from '../services/pagesApi';
import { errorMessage, listPins, similarPageConflict } from '../services/pinsApi';

export default function PagesPage() {
  const { pageId: segment } = useParams<{ pageId?: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const legacy = params.get('p');

  const pages = useQuery({ queryKey: ['pages'], queryFn: listPages, staleTime: 30_000 });
  const pins = useQuery({ queryKey: ['pins'], queryFn: () => listPins(), staleTime: 30_000 });
  const views = useMemo(() => pageViews(pages.data ?? [], pins.data ?? []), [pages.data, pins.data]);

  if (segment !== undefined) {
    return (
      <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
        <PinnedPage pageId={pageIdFromSegment(segment)} onBack={() => navigate('/pages')} />
      </div>
    );
  }

  // A pre-2026-09-08 link. Resolved by exact title against the pages that
  // exist now, once they are known; a name nobody has is said, not guessed.
  if (legacy !== null) {
    if (pages.isPending) {
      return <div className={`${SHELL_COLUMN} px-4 pt-10 md:px-8 md:pt-14`}><p className="text-[13px] text-george-muted">Finding that page…</p></div>;
    }
    const target = pages.data ? legacyPagePath(legacy, pages.data) : null;
    if (target) return <Navigate to={target} replace />;
    return (
      <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
        <PageHeader title="Pages" />
        <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">
          {pages.isError
            ? 'Could not load pages.'
            : `No page is called “${legacy}” any more. It may have been renamed or deleted.`}
        </p>
        <button
          type="button"
          onClick={() => navigate('/pages', { replace: true })}
          className="mt-4 text-[13px] text-george-navy hover:underline"
        >
          All pages
        </button>
      </div>
    );
  }

  return (
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
      <PageHeader
        title="Pages"
        meta="Each page re-runs its questions when you open it, so what you read is what the data says now — not what it said when the page was made."
      >
        <NewPageControl onCreated={(id) => navigate(pagePath(id))} />
      </PageHeader>

      {/* Three states; the first two never borrow the third's words. */}
      {(pages.isPending || pins.isPending) && (
        <p className="text-[13px] text-george-muted">Loading pages…</p>
      )}
      {(pages.isError || pins.isError) && (
        <p className="text-[13px] leading-relaxed text-george-slate">Could not load pages.</p>
      )}
      {pages.isSuccess && pins.isSuccess && views.length === 0 && (
        <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">
          No pages yet. Make one here and ask George to build it, or pin an answer in Ask
          and name a page for it.
        </p>
      )}

      <ul>
        {views.map((p) => (
          <li key={p.pageId ?? 'ungrouped'} className="border-t border-george-line first:border-t-0">
            <button
              type="button"
              onClick={() => navigate(pagePath(p.pageId))}
              className="group block w-full py-7 text-left first:pt-0"
            >
              <h2 className="font-george-serif text-[22px] leading-snug text-george-navy group-hover:underline group-hover:underline-offset-4">
                {p.name}
              </h2>

              {p.purpose && (
                <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-george-slate">
                  {p.purpose}
                </p>
              )}

              {/* What the page is for, quoted rather than described. */}
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-george-slate">
                {p.pins.length === 0 ? (
                  <span className="text-george-muted">Nothing here yet.</span>
                ) : (
                  <>
                    {p.contents.join(' · ')}
                    {p.more > 0 && (
                      <span className="text-george-muted">
                        {' '}· and {p.more} more
                      </span>
                    )}
                  </>
                )}
              </p>

              <p className="mt-2.5 text-[12px] text-george-muted">
                {p.pins.length === 0 ? 'nothing to read yet' : freshness(p.lastOk, ago)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- new page -- */

/**
 * A new, empty page: a title, an optional purpose, and then the page itself,
 * open and waiting. The case-collision refusal is the same one the Pin
 * dialog surfaces, because it is the same rule.
 */
function NewPageControl({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      createPage({ title, purpose: purpose.trim() || undefined, allow_similar_page: allowSimilar }),
    onSuccess: (page) => {
      qc.invalidateQueries({ queryKey: ['pages'] });
      qc.invalidateQueries({ queryKey: ['pin-pages'] });
      setOpen(false);
      setTitle('');
      setPurpose('');
      setConflict(null);
      setError(null);
      onCreated(page.id);
    },
    onError: (err) => {
      const similar = similarPageConflict(err);
      setConflict(similar);
      setError(similar ? null : errorMessage(err));
    },
  });

  const close = () => { setOpen(false); setConflict(null); setError(null); };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-[13px] text-george-slate hover:text-george-navy"
      >
        New page
      </button>
    );
  }

  return (
    <form
      className="flex shrink-0 flex-col items-end gap-1.5"
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) create.mutate(false); }}
    >
      <input
        type="text"
        autoFocus
        value={title}
        onChange={(e) => { setTitle(e.target.value); setConflict(null); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        aria-label="New page title"
        placeholder="Rockwell Weekly"
        maxLength={100}
        className="w-56 rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
      />
      <input
        type="text"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        aria-label="New page purpose"
        placeholder="What it is for, in one line (optional)"
        maxLength={200}
        className="w-56 rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
      />
      <div className="flex items-center gap-2 text-[12px]">
        <button type="submit" disabled={create.isPending || !title.trim()} className="text-george-navy disabled:opacity-40">
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" onClick={close} className="text-george-muted">Cancel</button>
      </div>
      {conflict && (
        <div className="w-72 rounded-lg border border-george-line bg-george-paper p-2 text-left">
          <p className="text-[12px] leading-relaxed text-george-navy">{conflict.message}</p>
          <button
            type="button"
            onClick={() => create.mutate(true)}
            className="mt-2 rounded-md border border-george-line px-2 py-1 text-[12px] text-george-slate"
          >
            Keep both
          </button>
        </div>
      )}
      {error && <p className="text-[12px] text-george-navy">{error}</p>}
    </form>
  );
}
