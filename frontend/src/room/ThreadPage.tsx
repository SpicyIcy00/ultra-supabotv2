/**
 * THE PAGE THIS THREAD ALREADY IS.
 *
 * The third view of a thread (P2.a). Nothing here is built and nothing is
 * stored until somebody presses Keep as page: what is drawn is the draft that
 * was already lying there — the questions asked, in the order they were asked,
 * each standing on reads that can be run again.
 *
 * IT SAYS WHAT IT WOULD LEAVE OFF, and that is the half a confirmation dialog
 * would have skipped. A turn that read nothing, a turn whose reads are already
 * kept above it, a turn past the bound on one build: each is named with its
 * reason in words, because a page that silently took four of six sections is a
 * page that quietly lost a conversation. The reasons come from `keepPlan`,
 * where every bound is the service's own.
 *
 * WHAT IT DRAWS IS NEVER A FIGURE. A section's line carries the question, in
 * the person's own words, and a count of reads — a count, off frames that
 * already arrived, exactly as the work line's counts are. No section shows a
 * number the page would produce, because the page has not been opened yet and
 * a figure with no time on it is a claim with no expiry (UI rule 6).
 *
 * THE REFUSAL IS THE SERVICE'S SENTENCE. A title already used, a quota, a call
 * that no longer validates — each arrives as a line written to be read, and is
 * drawn as it came. Nothing is paraphrased and nothing is retried silently.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { createPage } from '../services/pagesApi';
import { errorMessage, similarPageConflict } from '../services/pinsApi';
import type { Page, SimilarPageConflict } from '../types/pins';
import type { GeorgeTurn } from '../types/george';
import { MAX_SECTIONS, keepPlan, offeredTitle } from './keeping';
import { WORDS } from './work';
import type { KeptAs } from './ThreadHeader';

/** What a section reads, in words rather than in tool names — the same map the work line uses. */
function readsWords(tools: string[]): string {
  const said = tools.map((t) => (WORDS[t] ?? [t, t])[1]);
  const unique = said.filter((w, i) => said.indexOf(w) === i);
  return unique.join(', ');
}

export function ThreadPage({ turns, kept, threadId, onKept }: {
  /** The whole thread, questions included: a section is named by its question. */
  turns: GeorgeTurn[];
  /** The pages it is already kept as, newest first. */
  kept: KeptAs[];
  /** The conversation the sections' calls ran in. Provenance, never a decision. */
  threadId: string | null;
  /** Called with the page that now exists, so the header can name it at once. */
  onKept: (page: Page) => void;
}) {
  const qc = useQueryClient();
  const plan = keepPlan(turns);
  const opening = turns.find((t) => t.role === 'user' && t.text.trim());
  const asked = opening?.role === 'user' ? opening.text : undefined;
  const [title, setTitle] = useState(() => offeredTitle(turns));
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<Page | null>(null);

  const keep = useMutation({
    mutationFn: (allowSimilar: boolean) => createPage({
      title: title.trim(),
      allow_similar_page: allowSimilar,
      analyses: plan.sections.map((s) => ({ title: s.title, tool_calls: s.calls })),
      // Provenance on each pin the build makes: the question the thread opened
      // with, and the thread itself. Neither decides anything — together they
      // are what lets this thread find this page again afterwards.
      question: asked,
      conversation_id: threadId ?? undefined,
    }),
    onSuccess: (page) => {
      setMade(page);
      setConflict(null);
      setError(null);
      // The page and the pins both moved. A listing that still said the old
      // count would make the thing just created look like it had not been.
      qc.invalidateQueries({ queryKey: ['pages'] });
      qc.invalidateQueries({ queryKey: ['pins'] });
      qc.invalidateQueries({ queryKey: ['pin-pages'] });
      qc.invalidateQueries({ queryKey: ['thread-pins'] });
      onKept(page);
    },
    onError: (err) => {
      // The near-duplicate refusal exists to be read: it is what stops a typo
      // forking "Replenishment" into two pages. Surfaced, never swallowed.
      const similar = similarPageConflict(err);
      if (similar) { setConflict(similar); setError(null); }
      else { setConflict(null); setError(errorMessage(err)); }
    },
  });

  return (
    <section className="r-page">
      {kept.length > 0 && (
        <p className="r-note r-page-already">
          This thread is kept as{' '}
          {kept.map((k, i) => (
            <span key={k.pageId}>
              {i > 0 && ', '}
              <Link to={`/pages/${k.pageId}`} className="r-thead-page">{k.title}</Link>
            </span>
          ))}
          . Keeping it again makes a second page; nothing on the first one moves.
        </p>
      )}

      {plan.sections.length === 0 ? (
        // A LOADED EMPTINESS, and a real one: this thread has answers and none
        // of them stands on a read that could run again. Drawn from the plan,
        // never from a guess that something has not arrived yet (UI rule 8).
        <p className="r-say">
          There is nothing here to keep yet. A page re-runs the reads behind an
          answer, and nothing in this conversation has read anything that can be
          run again.
        </p>
      ) : (
        <>
          <p className="r-label">what would be kept</p>
          <ol className="r-page-list">
            {plan.sections.map((s) => (
              <li key={s.turn} className="r-page-sec">
                <p className="r-page-q">{s.title}</p>
                <p className="r-src">
                  {s.calls.length === 1 ? '1 read' : `${s.calls.length} reads`}
                  {' · '}
                  {readsWords(s.calls.map((c) => c.tool))}
                  {/* A SECTION THAT READS FEWER THINGS THAN ITS TURN DID SAYS
                      SO. One read is kept once on a page; a section quietly
                      shorter than the answer it came from would claim less
                      evidence than the answer had. */}
                  {s.alreadyKept > 0 && ` · ${s.alreadyKept} already above`}
                </p>
              </li>
            ))}
          </ol>

          {plan.leftOff.length > 0 && (
            <>
              <p className="r-label r-page-off-head">what would not be, and why</p>
              <ul className="r-page-list">
                {plan.leftOff.map((l) => (
                  <li key={l.turn} className="r-page-sec r-page-sec--off">
                    <p className="r-page-q">{l.title}</p>
                    <p className="r-src">{l.why}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {made ? (
            // THE WRITE REPORTED AS A FACT, WITH THE WAY TO IT. "Kept" alone
            // leaves a person to go and find the thing they just made.
            <p className="r-say r-page-made">
              Kept as <Link to={`/pages/${made.id}`} className="r-thead-page">{made.title}</Link>.
              It re-runs every read when it opens.
            </p>
          ) : (
            <div className="r-page-keep">
              <label className="r-page-name">
                <span className="r-label">the page is called</span>
                <input
                  className="r-page-input"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setConflict(null); setError(null); }}
                  placeholder="a name you would recognise"
                  aria-label="The page's name"
                />
              </label>
              <button
                type="button"
                className="r-chip"
                disabled={keep.isPending || !title.trim()}
                onClick={() => keep.mutate(false)}
              >
                {keep.isPending ? 'keeping…' : 'Keep as page'}
              </button>
              <p className="r-src">
                {plan.sections.length === 1 ? '1 section' : `${plan.sections.length} sections`}
                {plan.sections.length === MAX_SECTIONS && ', which is the most one page is kept at a time'}
              </p>
            </div>
          )}

          {conflict && (
            // THE NEAR-DUPLICATE REFUSAL, AND THE TWO REAL ANSWERS TO IT.
            // There is deliberately no "use the existing page" here: a create
            // makes a page, it does not join one, so a button offering that
            // would be refused the moment it was pressed. Rename, or say you
            // meant a second page — the choice the refusal exists to give.
            <div className="r-page-refused">
              <p className="r-caveat">{conflict.message}</p>
              <div className="r-row-acts">
                <button type="button" className="r-chip" onClick={() => keep.mutate(true)}>
                  keep both anyway
                </button>
                <span className="r-src">or change the name above</span>
              </div>
            </div>
          )}
          {error && (
            <div className="r-page-refused">
              <p className="r-caveat">{error}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
