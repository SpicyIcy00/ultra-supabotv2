/**
 * A KEPT PAGE, DRAWN BY THE ROOM (P2S.3(g), was P2.k).
 *
 * His words, 2026-09-15, of a page drawn by `PinnedPage` → `PinTile` → the
 * pre-P1.e renderer: *"it doesnt feel like its from the same app and its
 * beacause its not, so make it."* Now it is the same app: each pin re-runs its
 * calls, the run returns the SAME blocks the board is drawn from
 * (`agent/default_composition.pin_blocks`), and those blocks are drawn by the
 * room's own `Board` — the same marks, receipts, swatches and touch. A pie kept
 * from the board is a pie here, and "make that one a pie" on this page makes a
 * pie that stays one.
 *
 * THE PAGE'S CONTROLS SURVIVE, as room controls: rename, purpose and delete
 * for the page; refresh, move up, move down, move, remove from page and delete
 * for each analysis; and a line at the foot to ask George about the page. Two
 * acts keep two words — "Remove from page" keeps the analysis in Ungrouped,
 * "Delete" deletes it — for the reason PinnedPage gave when it split them.
 *
 * WHAT A RUN SAYS IS DRAWN AS ITSELF (UI rule 8): reading, could not be read,
 * came back partly, came back empty, and drew — never one borrowing another's
 * words. A call that did not reproduce is named above what did.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AnswerTurn } from './data';
import type { Page, Pin, PinRun, SimilarPageConflict } from '../types/pins';
import { useGeorge } from '../hooks/useGeorge';
import { deletePage, getPage, updatePage } from '../services/pagesApi';
import {
  deletePin, errorMessage, listPinPages, listPins, runPin, similarPageConflict, updatePin,
} from '../services/pinsApi';
import { readDeskDefinitions } from '../services/deskApi';
import { readStoreAppearance } from '../services/storesApi';
import { choiceBody, choiceFor, movesPin, type PageChoice } from '../components/george/pageChoice';
import { pageScopeFor } from '../components/george/pageScope';
import { pageContextFor, UNGROUPED_NAME } from '../components/george/pageShape';
import { buildBoard } from './board';
import { Board } from './render';
import { identitiesFrom } from './identity';
import { IdentityContext } from './swatch';
import { ExplainsOnlyContext, explainsOnlyFrom } from './noticeDrawing';
import { asSelection, subjectOnBoard } from './subjects';
import { Caveats, type TileActions } from './tiles';
import { RoomHead } from './RoomShell';

/** How long ago, in words — a figure's age is a claim with an expiry (UI rule 6). */
export function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

/**
 * A PIN RUN AS A TURN — the shape the board is folded from. Each call is a
 * read at its index; the run's blocks are the composition. Nothing is added:
 * no words (a pin has no reading of its own), no figure the run did not return.
 */
export function turnFromRun(run: PinRun): AnswerTurn {
  return {
    role: 'george', text: '', thinking: '', at: run.ran_at,
    toolCalls: run.results.map((r, seq) => ({
      seq, tool: r.tool, arguments: r.arguments,
      result: r.status === 'ok' ? { rows: r.rows, meta: r.meta } : { error: r.error ?? r.status },
    })),
    notices: run.notices ?? [],
    pinned: [], saved: [], pageChanges: [],
    composition: { blocks: run.blocks ?? [] },
  } as unknown as AnswerTurn;
}

export function KeptPage({ pageId, onBack }: {
  /** A page's id, or null for the ungrouped pins. */
  pageId: string | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const page = useQuery({
    queryKey: ['page', pageId], queryFn: () => getPage(pageId as string), enabled: pageId !== null,
  });
  const pins = useQuery({ queryKey: ['pins', pageId], queryFn: () => listPins(pageId) });
  // THE SAME IDENTITIES AND NOTICE RULE THE ROOM DRAWS WITH, from the same reads.
  const desk = useQuery({ queryKey: ['desk-definitions'], queryFn: readDeskDefinitions,
                          staleTime: Infinity, retry: false });
  const stores = useQuery({ queryKey: ['store-appearance'], queryFn: readStoreAppearance,
                            staleTime: 5 * 60_000, retry: false });
  const identities = useMemo(() => identitiesFrom(desk.data, stores.data), [desk.data, stores.data]);
  const explainsOnly = useMemo(() => explainsOnlyFrom(desk.data), [desk.data]);

  const invalidate = () => {
    for (const key of [['pins'], ['pin-pages'], ['pages'], ['page', pageId]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
  const remove = useMutation({ mutationFn: deletePin, onSuccess: invalidate });
  const place = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updatePin>[1] }) => updatePin(id, body),
    onSuccess: invalidate,
  });

  const title = pageId === null ? UNGROUPED_NAME : page.data?.title;
  const list = pins.data ?? [];

  return (
    <IdentityContext.Provider value={identities}>
      <ExplainsOnlyContext.Provider value={explainsOnly}>
        <div className="r-kept">
          <div className="r-row-acts" style={{ marginTop: 0 }}>
            <button type="button" className="r-act" onClick={onBack}>← All pages</button>
          </div>

          {pageId !== null && page.isPending && <p className="r-note">Reading…</p>}
          {pageId !== null && page.isError && (
            <p className="r-say">Could not load this page. It may have been deleted, or it may be somebody else’s.</p>
          )}
          {title !== undefined && (
            <RoomHead
              title={title}
              says={pageId === null
                ? 'Pins with no page. Every question here was asked again when this opened, so these are current figures rather than saved ones.'
                : 'Every question on this page was asked again when it opened, so these are current figures rather than saved ones.'}
              aside={page.data ? (
                <span className="r-row-acts" style={{ marginTop: 0 }}>
                  <RenameControl page={page.data} onDone={invalidate} />
                  <DeletePageControl page={page.data} pinCount={list.length}
                                     onDeleted={() => { invalidate(); navigate('/pages', { replace: true }); }} />
                </span>
              ) : undefined}
            />
          )}
          {page.data && <PurposeControl page={page.data} onDone={invalidate} />}

          {pins.isPending && <p className="r-note">Reading…</p>}
          {pins.isError && <p className="r-say">Could not load this page.</p>}
          {pins.isSuccess && list.length === 0 && (
            <div className="r-empty">
              <p className="r-say">Nothing here yet.</p>
              <p className="r-note">
                {pageId === null
                  ? 'Pins taken off a page land here. Nothing is ungrouped at the moment.'
                  : 'Ask George to build this page below, or keep an answer from the board and name this page.'}
              </p>
            </div>
          )}

          {list.map((pin, i) => (
            <KeptPin
              key={pin.id}
              pin={pin}
              pageId={pageId}
              title={title ?? null}
              actions={
                <>
                  {pageId !== null && (
                    <>
                      <button type="button" className="r-act" disabled={place.isPending || i === 0}
                              aria-label={`Move ${pin.title} up`}
                              onClick={() => place.mutate({ id: pin.id, body: { place: { before: list[i - 1].id } } })}>
                        Move up
                      </button>
                      <button type="button" className="r-act" disabled={place.isPending || i === list.length - 1}
                              aria-label={`Move ${pin.title} down`}
                              onClick={() => place.mutate({ id: pin.id, body: { place: { after: list[i + 1].id } } })}>
                        Move down
                      </button>
                    </>
                  )}
                  <MoveControl pin={pin} onMoved={invalidate} />
                  {pageId !== null && (
                    <button type="button" className="r-act" disabled={place.isPending}
                            aria-label={`Remove ${pin.title} from page`}
                            onClick={() => place.mutate({ id: pin.id, body: { page_id: null } })}>
                      Remove from page
                    </button>
                  )}
                  <button type="button" className="r-act" aria-label={`Delete ${pin.title}`}
                          onClick={() => {
                            if (window.confirm(`Delete “${pin.title}”? This deletes the saved analysis itself, not just its place on this page.`)) {
                              remove.mutate(pin.id);
                            }
                          }}>
                    Delete
                  </button>
                </>
              }
            />
          ))}

          <PageAsk pageId={pageId} title={title ?? null} />
        </div>
      </ExplainsOnlyContext.Provider>
    </IdentityContext.Provider>
  );
}

/* -------------------------------------------------------------------- pin -- */

/**
 * ONE ANALYSIS: its title, its controls, and its figures — re-run on open and
 * drawn by the board. No polling: the receipt under each figure carries its
 * read time, which is the honest alternative to churning the warehouse.
 */
export function KeptPin({ pin, pageId, title, actions }: {
  pin: Pin; pageId: string | null; title: string | null; actions?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const george = useGeorge();
  const navigate = useNavigate();
  const run = useMutation<PinRun, unknown, void>({
    mutationFn: () => runPin(pin.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pins'] }); },
  });
  const { mutate } = run;
  useEffect(() => { mutate(); }, [mutate]);
  const data = run.data;

  const answers = useMemo(() => (data ? [turnFromRun(data)] : []), [data]);
  const board = useMemo(() => buildBoard(answers), [answers]);
  const missing = (data?.results ?? []).filter((r) => r.status !== 'ok');
  const empty = (data?.results ?? []).filter((r) => r.status === 'ok' && !r.rows?.length);

  // A TAP ON A ROW ASKS GEORGE ABOUT IT, from this page — the room's `why`,
  // with the id the row carried and the page as scope. Nothing here is a
  // control that does nothing.
  const on: TileActions = useMemo(() => {
    const about = (label: string, dimension: Parameters<TileActions['why']>[1]) => {
      const subject = subjectOnBoard({ answers, board, retuned: {}, defs: null }, label, dimension ?? 'store');
      const selection = asSelection([subject]);
      george.reset();
      void george.ask('why?', {
        ...(selection ? { desk: { selection } } : {}),
        pageContext: pageContextFor(pageId === null ? null : title),
        pageScope: pageScopeFor(pageId, title),
      });
      navigate('/george');
    };
    return { open: () => {}, patch: () => {}, pick: about, why: about };
  }, [answers, board, george, navigate, pageId, title]);

  return (
    <section className="r-kept-pin" data-pin={pin.id}>
      <div className="r-kept-pin-head">
        <h2 className="r-kept-pin-title">{pin.title}</h2>
        <span className="r-row-acts" style={{ marginTop: 0 }}>
          <button type="button" className="r-act" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? 'Reading…' : 'Refresh'}
          </button>
          {actions}
        </span>
      </div>

      {/* NOT YET STARTED IS READING TOO: the run starts on mount, and a first
          paint that said nothing would be a fourth state (UI rule 8). */}
      {(run.isPending || run.isIdle) && !data && <p className="r-note">Reading…</p>}
      {run.isError && !data && (
        <p className="r-say" data-state="failed">
          Could not reach George. {errorMessage(run.error)} <span className="r-src">Last worked {ago(pin.last_ok_at)}</span>
        </p>
      )}
      {data && (
        <>
          <Caveats notices={data.notices} />
          {missing.length > 0 && (
            <div className="r-caveats" data-missing={missing.length} role="note">
              <p className="r-caveat">
                Only part of this came back: {missing.length} of {data.results.length}{' '}
                {data.results.length === 1 ? 'read' : 'reads'} did not reproduce.
              </p>
              {missing.map((r, i) => (
                <p key={`${r.tool}-${i}`} className="r-src">
                  {r.tool} {r.status === 'refused' ? 'declined' : r.status === 'unrunnable' ? 'can no longer run' : 'failed'}
                  {r.error ? `: ${r.error}` : '.'} Checked {ago(data.ran_at)}.
                </p>
              ))}
            </div>
          )}
          {board.length > 0 ? (
            <Board answers={answers} board={board} local={{}} focused={null} selection={[]}
                   live={false} retuned={{}} on={on} />
          ) : missing.length === data.results.length ? null : (
            <p className="r-say" data-state="empty">
              No rows matched. That is an empty result, not a zero.{' '}
              <span className="r-src">read {ago(data.ran_at)}</span>
            </p>
          )}
          {board.length > 0 && empty.length > 0 && (
            <p className="r-src">{empty.length} of its reads matched no rows — empty, not zero.</p>
          )}
        </>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- controls -- */

function RenameControl({ page, onDone }: { page: Page; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page.title);
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rename = useMutation({
    mutationFn: (allowSimilar: boolean) => updatePage(page.id, { title: name, allow_similar_page: allowSimilar }),
    onSuccess: () => { setEditing(false); setConflict(null); setError(null); onDone(); },
    onError: (err) => { const similar = similarPageConflict(err); setConflict(similar); setError(similar ? null : errorMessage(err)); },
  });
  const cancel = () => { setEditing(false); setName(page.title); setConflict(null); setError(null); };
  if (!editing) {
    return <button type="button" className="r-act" onClick={() => { setName(page.title); setEditing(true); }}>Rename</button>;
  }
  return (
    <form className="r-newpage" onSubmit={(e) => {
      e.preventDefault();
      if (name.trim() && name.trim() !== page.title) rename.mutate(false); else cancel();
    }}>
      <input type="text" autoFocus value={name} maxLength={100} aria-label="Page name" className="r-field"
             onChange={(e) => { setName(e.target.value); setConflict(null); }}
             onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }} />
      <button type="submit" className="r-act" disabled={rename.isPending}>{rename.isPending ? 'Saving…' : 'Save'}</button>
      <button type="button" className="r-act" onClick={cancel}>Cancel</button>
      {conflict && (
        <p className="r-note">{conflict.message}{' '}
          <button type="button" className="r-act" onClick={() => rename.mutate(true)}>Keep both</button>
        </p>
      )}
      {error && <p className="r-note">{error}</p>}
    </form>
  );
}

function PurposeControl({ page, onDone }: { page: Page; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(page.purpose ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => updatePage(page.id, { purpose: text.trim() ? text : null }),
    onSuccess: () => { setEditing(false); setError(null); onDone(); },
    onError: (err) => setError(errorMessage(err)),
  });
  const cancel = () => { setEditing(false); setText(page.purpose ?? ''); setError(null); };
  if (!editing) {
    return (
      <p className="r-note r-kept-purpose">
        {page.purpose ?? 'No purpose written yet.'}{' '}
        <button type="button" className="r-act" onClick={() => { setText(page.purpose ?? ''); setEditing(true); }}>
          {page.purpose ? 'Edit purpose' : 'Add purpose'}
        </button>
      </p>
    );
  }
  return (
    <form className="r-newpage" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <input type="text" autoFocus value={text} maxLength={200} aria-label="Page purpose" className="r-field"
             placeholder="What this page is for, in one line"
             onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }} />
      <button type="submit" className="r-act" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      <button type="button" className="r-act" onClick={cancel}>Cancel</button>
      {error && <p className="r-note">{error}</p>}
    </form>
  );
}

function DeletePageControl({ page, pinCount, onDeleted }: { page: Page; pinCount: number; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const del = useMutation({ mutationFn: () => deletePage(page.id), onSuccess: onDeleted,
                            onError: (err) => setError(errorMessage(err)) });
  const kept = pinCount === 0 ? 'It is empty.'
    : `Its ${pinCount === 1 ? 'analysis moves' : `${pinCount} analyses move`} to Ungrouped; nothing is deleted.`;
  return (
    <>
      <button type="button" className="r-act" disabled={del.isPending}
              onClick={() => { if (window.confirm(`Delete the page “${page.title}”? ${kept}`)) del.mutate(); }}>
        Delete page
      </button>
      {error && <span className="r-note">{error}</span>}
    </>
  );
}

/**
 * MOVE ONE ANALYSIS — to another page, off pages, or onto a new one by name.
 * The same choice the old picker made (`pageChoice`), drawn in the room's own
 * controls; a move to where it already is is not offered as if it would do
 * something (`movesPin`).
 */
function MoveControl({ pin, onMoved }: { pin: Pin; onMoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PageChoice>(() => choiceFor(pin));
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pages = useQuery({ queryKey: ['pin-pages'], queryFn: listPinPages, enabled: open });
  const move = useMutation({
    mutationFn: (allowSimilar: boolean) => updatePin(pin.id, { ...(choiceBody(choice) ?? {}), allow_similar_page: allowSimilar }),
    onSuccess: () => { setOpen(false); setConflict(null); setError(null); onMoved(); },
    onError: (err) => { const similar = similarPageConflict(err); setConflict(similar); setError(similar ? null : errorMessage(err)); },
  });
  const close = () => { setOpen(false); setChoice(choiceFor(pin)); setConflict(null); setError(null); };
  if (!open) {
    return <button type="button" className="r-act" aria-label={`Move ${pin.title}`} onClick={() => setOpen(true)}>Move</button>;
  }
  const existing = (pages.data ?? []).flatMap((p) => (p.page_id && p.page ? [{ id: p.page_id, title: p.page }] : []));
  const value = choice.kind === 'existing' ? choice.pageId : choice.kind;
  return (
    <span className="r-newpage" role="dialog" aria-label={`Move ${pin.title}`}>
      <select className="r-field" value={value} aria-label="Move to"
              onChange={(e) => {
                const v = e.target.value;
                setConflict(null);
                if (v === 'none') setChoice({ kind: 'none' });
                else if (v === 'new') setChoice({ kind: 'new', name: '' });
                else setChoice({ kind: 'existing', pageId: v, title: existing.find((p) => p.id === v)?.title ?? '' });
              }}>
        <option value="none">{UNGROUPED_NAME}</option>
        {pages.isPending && <option disabled>Reading pages…</option>}
        {existing.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        <option value="new">A new page…</option>
      </select>
      {choice.kind === 'new' && (
        <input type="text" className="r-field" autoFocus maxLength={100} aria-label="New page name"
               value={choice.name} onChange={(e) => setChoice({ kind: 'new', name: e.target.value })} />
      )}
      <button type="button" className="r-act" disabled={move.isPending || !movesPin(pin.page_id, choice)}
              onClick={() => move.mutate(false)}>
        {move.isPending ? 'Moving…' : 'Move'}
      </button>
      <button type="button" className="r-act" onClick={close}>Cancel</button>
      {pages.isError && <span className="r-note">The pages could not be read.</span>}
      {conflict && (
        <span className="r-note">{conflict.message}{' '}
          <button type="button" className="r-act" onClick={() => move.mutate(true)}>Keep both</button>
        </span>
      )}
      {error && <span className="r-note">{error}</span>}
    </span>
  );
}

/**
 * ASK GEORGE ABOUT THIS PAGE. Sent, not drafted: the question goes now, bound
 * to this page's identity as its scope, and the room is where the answer
 * arrives. Nothing on the page travels with it but the page itself.
 */
function PageAsk({ pageId, title }: { pageId: string | null; title: string | null }) {
  const george = useGeorge();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form className="r-kept-ask" onSubmit={(e) => {
      e.preventDefault();
      const text = q.trim();
      if (!text || george.busy) return;
      george.reset();
      void george.ask(text, {
        pageContext: pageContextFor(pageId === null ? null : title),
        pageScope: pageScopeFor(pageId, title),
      });
      navigate('/george');
    }}>
      <input type="text" className="r-field" value={q} onChange={(e) => setQ(e.target.value)}
             placeholder="Ask George about this page…" aria-label="Ask George about this page" />
      <button type="submit" className="r-act" disabled={!q.trim() || george.busy}>Ask</button>
    </form>
  );
}
