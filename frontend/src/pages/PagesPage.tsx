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
import { KeptPage, ago } from '../room/KeptPage';
import {
  freshness,
  legacyPagePath,
  pageIdFromSegment,
  pagePath,
  pageViews,
} from '../components/george/pageShape';
import { RoomHead } from '../room/RoomShell';
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
      <KeptPage pageId={pageIdFromSegment(segment)} onBack={() => navigate('/pages')} />
    );
  }

  // A pre-2026-09-08 link. Resolved by exact title against the pages that
  // exist now, once they are known; a name nobody has is said, not guessed.
  if (legacy !== null) {
    if (pages.isPending) {
      return <p className="r-note">Finding that page…</p>;
    }
    const target = pages.data ? legacyPagePath(legacy, pages.data) : null;
    if (target) return <Navigate to={target} replace />;
    return (
      <>
        <RoomHead title="Kept" />
        <p className="r-say" style={{ marginTop: 20 }}>
          {pages.isError
            ? 'The pages could not be read.'
            : `No page is called “${legacy}” any more. It may have been renamed or deleted.`}
        </p>
        <div className="r-row-acts">
          <button type="button" className="r-act"
                  onClick={() => navigate('/pages', { replace: true })}>All pages</button>
        </div>
      </>
    );
  }

  return (
    <>
      <RoomHead
        title="Kept"
        says="Each page re-runs its questions when you open it, so what you read is what the data says now — not what it said when the page was made."
        aside={<NewPageControl onCreated={(id) => navigate(pagePath(id))} />}
      />

      {/* Three states; the first two never borrow the third's words. */}
      {(pages.isPending || pins.isPending || pages.isError || pins.isError
        || (pages.isSuccess && pins.isSuccess && views.length === 0)) && (
        <div className="r-empty">
          {(pages.isPending || pins.isPending) && <p className="r-note">Checking…</p>}
          {(pages.isError || pins.isError) && <p className="r-say">The pages could not be read.</p>}
          {pages.isSuccess && pins.isSuccess && views.length === 0 && (
            <p className="r-say">
              Nothing kept yet. Make a page here and ask George to build it, or keep an
              answer from the board and name a page for it.
            </p>
          )}
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {views.map((p) => (
          <li key={p.pageId ?? 'ungrouped'} className="r-item">
            <button type="button" className="r-item-link"
                    onClick={() => navigate(pagePath(p.pageId))}>
              <h2 className="r-item-name">{p.name}</h2>

              {p.purpose && <p className="r-note" style={{ marginTop: 6 }}>{p.purpose}</p>}

              {/* What the page is for, quoted rather than described. A LIST of
                  question names, so it is not on a prose measure: `.r-note`
                  capped it at 62ch and broke it mid-item. */}
              <p className="r-item-of" style={{ marginTop: 8 }}>
                {p.pins.length === 0 ? (
                  <span style={{ color: 'var(--ink-3)' }}>Nothing here yet.</span>
                ) : (
                  <>
                    {p.contents.join(' · ')}
                    {p.more > 0 && (
                      <span style={{ color: 'var(--ink-3)' }}> · and {p.more} more</span>
                    )}
                  </>
                )}
              </p>

              <p className="r-src" style={{ marginTop: 10 }}>
                {p.pins.length === 0 ? 'nothing to read yet' : freshness(p.lastOk, ago)}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
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
      <button type="button" className="r-act" onClick={() => setOpen(true)}>New page</button>
    );
  }

  return (
    <form
      className="r-newpage"
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
        className="r-field"
      />
      <input
        type="text"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        aria-label="New page purpose"
        placeholder="What it is for, in one line (optional)"
        maxLength={200}
        className="r-field"
      />
      <div className="r-row-acts" style={{ marginTop: 0, justifyContent: 'flex-end' }}>
        <button type="submit" className="r-act" disabled={create.isPending || !title.trim()}>
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="r-act" onClick={close}>Cancel</button>
      </div>
      {conflict && (
        <div className="r-tile r-tile--quiet" style={{ padding: 12 }}>
          <p className="r-note">{conflict.message}</p>
          <div className="r-row-acts" style={{ marginTop: 10 }}>
            <button type="button" className="r-act" onClick={() => create.mutate(true)}>
              Keep both
            </button>
          </div>
        </div>
      )}
      {error && <p className="r-note">{error}</p>}
    </form>
  );
}
