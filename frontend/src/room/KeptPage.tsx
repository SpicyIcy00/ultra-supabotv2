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
 * for each analysis; and the page registers itself (W1.4) so the one line at
 * the foot of every screen asks Bob about THIS page, by its id, and he
 * answers beside it — reading and editing it without leaving it. Two
 * acts keep two words — "Remove from page" keeps the analysis in Ungrouped,
 * "Delete" deletes it — for the reason PinnedPage gave when it split them.
 *
 * WHAT A RUN SAYS IS DRAWN AS ITSELF (UI rule 8): reading, could not be read,
 * came back partly, came back empty, and drew — never one borrowing another's
 * words. A call that did not reproduce is named above what did.
 *
 * AND IT READS LIKE WHAT IT IS (W4.1, 2026-09-23). The owner, of the pages in
 * the sidebar: *"next thing we need to do is make how each page style work
 * idealy"*. The page carries a KIND — dashboard, week, list, collection — and
 * the kind decides how the page is DRAWN: nothing else. Two things make that
 * possible here, and both are this file's:
 *
 *   THE RUNS ARE THE PAGE'S. Each analysis used to run itself, so the page
 *   could not know any analysis's SHAPE until it had already drawn it. They are
 *   started here, one read per analysis, and handed down — and each analysis
 *   still draws its own state, so the page never waits for its slowest one.
 *
 *   THE ORDER NEVER MOVES. A dashboard puts a RUN of consecutive single-figure
 *   analyses on one line; that is a partition of the person's list in place
 *   (`pageKind.groupsFor`), never a sort. Move up, Move down, Move, Remove,
 *   Delete, Rename, Purpose and the window control work identically in all
 *   four kinds.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AnswerTurn } from './data';
import { readAt } from './data';
import type { Arrangement } from '../types/bob';
import type {
  Page, PageKind, PageWindow, Pin, PinRun, SimilarPageConflict,
} from '../types/pins';
import { useBob } from '../hooks/useBob';
import {
  deletePage, getPage, removePageWindow, setPageKind, setPageWindow, updatePage,
} from '../services/pagesApi';
import {
  deletePin, errorMessage, listPinPages, listPins, runPin, similarPageConflict, updatePin,
} from '../services/pinsApi';
import { readDeskDefinitions } from '../services/deskApi';
import { readStoreAppearance } from '../services/storesApi';
import { choiceBody, choiceFor, movesPin, type PageChoice } from '../components/bob/pageChoice';
import { UNGROUPED_NAME } from '../components/bob/pageShape';
import { askFrom, hereForKeptPage } from '../components/bob/here';
import { useRegisterHere } from '../hooks/useHere';
import { buildBoard } from './board';
import { Board } from './render';
import { identitiesFrom } from './identity';
import { IdentityContext } from './swatch';
import { ExplainsOnlyContext, explainsOnlyFrom } from './noticeDrawing';
import { asSelection, subjectOnBoard } from './subjects';
import { Caveats, type TileActions } from './tiles';
import { RoomHead } from './RoomShell';
import {
  blockOrderFor, groupsFor, kindOf, kindOptions, shapeOf, wordsFor,
  type AnalysisShape,
} from './pageKind';

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
    role: 'bob', text: '', thinking: '', at: run.ran_at,
    toolCalls: run.results.map((r, seq) => ({
      seq, tool: r.tool, arguments: r.arguments,
      result: r.status === 'ok' ? { rows: r.rows, meta: r.meta } : { error: r.error ?? r.status },
    })),
    notices: run.notices ?? [],
    pinned: [], saved: [], pageChanges: [],
    composition: { blocks: run.blocks ?? [] },
  } as unknown as AnswerTurn;
}

/**
 * ONE ANALYSIS'S RUN, AS A STATE THE PAGE CAN HOLD (W4.1).
 *
 * The three renderings stay three (UI rule 8): `reading` is a read on its way
 * with nothing drawn yet, `failed` is a read that could not be reached, and
 * data present is drawn. `refreshing` is a read on its way over something
 * already on screen — which is the Refresh button's own state and not one of
 * the three.
 *
 * KEYED BY THE PAGE'S WINDOW, so moving the window re-runs every analysis
 * through its own read on the server, exactly as the per-analysis effect did.
 * Nothing is computed here and no figure is cached across a window.
 */
export interface PinRunState {
  data: PinRun | undefined;
  reading: boolean;
  refreshing: boolean;
  failed: boolean;
  error: unknown;
  refresh(): void;
}

/** The query one analysis's run is read by — one shape, page or pin. */
export function pinRunQuery(pinId: string, windowKey: string | null) {
  return {
    queryKey: ['pin-run', pinId, windowKey] as const,
    queryFn: () => runPin(pinId),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  };
}

function stateOf(q: {
  data?: PinRun; isPending: boolean; isFetching: boolean; isError: boolean; error: unknown;
  refetch: () => unknown;
}): PinRunState {
  return {
    data: q.data,
    reading: !q.data && !q.isError,
    refreshing: q.isFetching,
    failed: q.isError && !q.data,
    error: q.error,
    refresh: () => { void q.refetch(); },
  };
}

export function KeptPage({ pageId, onBack, embedded = false }: {
  /** A page's id, or null for the ungrouped pins. */
  pageId: string | null;
  onBack: () => void;
  /**
   * Drawn IN THE ROOM, where the answer that built it would be (W2.4): the
   * way out is to the page's own address, and the room — not this — says
   * what the person is standing on.
   */
  embedded?: boolean;
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

  // ---- the page's runs (W4.1) ----------------------------------------------
  // ONE READ PER ANALYSIS, STARTED HERE. The page needs each analysis's shape
  // to know what sits on one line with what; an analysis that ran itself could
  // only be grouped after it had already been drawn somewhere else.
  const windowKey = page.data?.window?.preset ?? null;
  const runs = useQueries({ queries: list.map((pin) => pinRunQuery(pin.id, windowKey)) });
  const states = runs.map(stateOf);
  const kind = kindOf(page.data);
  // WHAT EACH ANALYSIS DREW — off the blocks its own run returned, never a
  // label anything inferred. An analysis still reading has no shape yet, and
  // the page draws it at the width until it has one.
  const shapes: AnalysisShape[] = states.map((s) => shapeOf(s.data?.blocks));
  const groups = groupsFor(kind, list.map((_, i) => i), (i) => shapes[i]);
  // WHEN THE PAGE WAS READ, at its head, for the kind that reads as a document
  // (UI rule 6). The earliest read on the page and the window every analysis
  // was run over — both off loaded runs, never asserted (UI rule 8).
  const stamps = states
    .flatMap((s) => (s.data?.results ?? []).map((r) => r.meta?.snapshot_timestamp))
    .filter((x): x is string => typeof x === 'string').sort();
  const dateline = [page.data?.window?.label, stamps.length ? readAt(stamps[0]) : null]
    .filter(Boolean).join(' · ');

  const analysisAt = (i: number) => (
    <KeptPin
      key={list[i].id}
      pin={list[i]}
      pageId={pageId}
      title={title ?? null}
      window={page.data?.window ?? null}
      kind={kind}
      shape={shapes[i]}
      run={states[i]}
      actions={
        <>
          {pageId !== null && (
            <>
              <button type="button" className="r-act" disabled={place.isPending || i === 0}
                      aria-label={`Move ${list[i].title} up`}
                      onClick={() => place.mutate({ id: list[i].id, body: { place: { before: list[i - 1].id } } })}>
                Move up
              </button>
              <button type="button" className="r-act"
                      disabled={place.isPending || i === list.length - 1}
                      aria-label={`Move ${list[i].title} down`}
                      onClick={() => place.mutate({ id: list[i].id, body: { place: { after: list[i + 1].id } } })}>
                Move down
              </button>
            </>
          )}
          <MoveControl pin={list[i]} onMoved={invalidate} />
          {pageId !== null && (
            <button type="button" className="r-act" disabled={place.isPending}
                    aria-label={`Remove ${list[i].title} from page`}
                    onClick={() => place.mutate({ id: list[i].id, body: { page_id: null } })}>
              Remove from page
            </button>
          )}
          <button type="button" className="r-act" aria-label={`Delete ${list[i].title}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${list[i].title}”? This deletes the saved analysis itself, not just its place on this page.`)) {
                      remove.mutate(list[i].id);
                    }
                  }}>
            Delete
          </button>
        </>
      }
    />
  );
  // WHAT THIS PAGE IS, for the line (W1.4): its id, so view_page and
  // edit_page bind to it, and its title for the words. Registered from the
  // first paint — the id is known before the title is.
  useRegisterHere(embedded ? null : hereForKeptPage(pageId, pageId === null ? null : page.data?.title));

  return (
    <IdentityContext.Provider value={identities}>
      <ExplainsOnlyContext.Provider value={explainsOnly}>
        <div className="r-kept" data-page-kind={kind}
             data-embedded={embedded ? 'yes' : undefined}>
          <div className="r-row-acts" style={{ marginTop: 0 }}>
            <button type="button" className="r-act" onClick={onBack}>
              {embedded ? 'Open this page on its own' : '← All pages'}
            </button>
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
                  <KindControl page={page.data} onDone={invalidate} />
                  <DeletePageControl page={page.data} pinCount={list.length}
                                     onDeleted={() => { invalidate(); navigate('/pages', { replace: true }); }} />
                </span>
              ) : undefined}
            />
          )}
          {page.data && <PurposeControl page={page.data} onDone={invalidate} />}
          {page.data && <WindowControl page={page.data} onDone={invalidate} />}

          {/* WHEN THIS PAGE WAS READ, at its head, where the page reads as a
              document (UI rule 6). Drawn from loaded runs and from the page's
              own window — never asserted before either has arrived. Every
              figure below still wears its own read time, in every kind. */}
          {kind === 'week' && dateline && (
            <p className="r-doc-dateline r-kept-dateline">{dateline}</p>
          )}

          {pins.isPending && <p className="r-note">Reading…</p>}
          {pins.isError && <p className="r-say">Could not load this page.</p>}
          {pins.isSuccess && list.length === 0 && (
            <div className="r-empty">
              <p className="r-say">Nothing here yet.</p>
              <p className="r-note">
                {pageId === null
                  ? 'Pins taken off a page land here. Nothing is ungrouped at the moment.'
                  : 'Ask Bob to build this page below, or keep an answer from the board and name this page.'}
              </p>
            </div>
          )}

          {/* THE PAGE, DRAWN BY ITS KIND (W4.1). A dashboard puts a RUN of
              consecutive single-figure analyses on one line; every other kind,
              and every other analysis, stands where it stands. The order is
              the person's in all four — these groups flatten back to `list`. */}
          {groups.map((g) => (g.row && g.items.length > 1
            ? (
              <div key={`row-${list[g.at].id}`} className="r-kept-row"
                   data-tiles={g.items.length}
                   style={{ '--tiles': g.items.length } as CSSProperties}>
                {g.items.map(analysisAt)}
              </div>
            )
            : analysisAt(g.items[0])))}

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
export function KeptPin({ pin, pageId, title, window: pageWindow = null,
                          kind = 'collection', shape = 'none', run: given, actions }: {
  pin: Pin; pageId: string | null; title: string | null;
  /** The page's date window (W1.4): a change re-runs this analysis over it. */
  window?: PageWindow | null;
  /** How the page it sits on is drawn (W4.1). Presentation, nothing else. */
  kind?: PageKind;
  /** What this analysis drew, read off its own run by the page. */
  shape?: AnalysisShape;
  /**
   * ITS RUN, FROM THE PAGE (W4.1) — so the page knows every analysis's shape
   * before it draws any of them. Absent, the analysis reads for itself, which
   * is what it did before this card and is what keeps it usable alone.
   */
  run?: PinRunState;
  actions?: React.ReactNode;
}) {
  const bob = useBob();
  // RE-RUN WHEN THE PAGE'S WINDOW MOVES. The server reads the window off the
  // page and runs this pin's own calls over it; nothing is computed here. The
  // key carries the window, so a window that moves is a different read.
  const windowKey = pageWindow?.preset ?? null;
  const own = useQuery({ ...pinRunQuery(pin.id, windowKey), enabled: given === undefined });
  const run = given ?? stateOf(own);
  const data = run.data;

  const answers = useMemo(() => (data ? [turnFromRun(data)] : []), [data]);
  const board = useMemo(() => buildBoard(answers), [answers]);
  /**
   * HOW THIS ANALYSIS IS LAID OUT, BY THE PAGE'S KIND (W4.1) — an arrangement
   * over the blocks its OWN run returned, drawn by the room's own renderer
   * rather than a second one. `collection` sends none, which is the packing a
   * kept page has always drawn with.
   *
   * IT NAMES NO VALUE, COLOUR OR WIDTH — the same bound Bob's own arrangement
   * carries. The only thing a kind may reorder is the blocks WITHIN one
   * analysis, on a week, so comparisons come before lists; the analyses
   * themselves never move.
   */
  const arrangement = useMemo<Arrangement | null>(() => {
    if (!data || kind === 'collection') return null;
    const blocks = blockOrderFor(kind, (data.blocks ?? []).filter((b) => b.op !== 'drop'));
    if (!blocks.length) return null;
    return { layout: 'stack', children: blocks.map((b) => ({ block: b.key })) };
  }, [data, kind]);
  const missing = (data?.results ?? []).filter((r) => r.status !== 'ok');
  // A read the page's window could not move says so, in the definitions' words.
  const unmoved = (data?.results ?? []).flatMap((r) => (r.window && r.window.applied === null && r.window.says ? [r.window.says] : []));
  const empty = (data?.results ?? []).filter((r) => r.status === 'ok' && !r.rows?.length);

  // A TAP ON A ROW ASKS BOB ABOUT IT, from this page — the room's `why`,
  // with the id the row carried and the page as scope — and he answers
  // BESIDE the page (W1.4), in the thread this page's questions share, rather
  // than taking you to /bob. Nothing here is a control that does nothing.
  const on: TileActions = useMemo(() => {
    const about = (label: string, dimension: Parameters<TileActions['why']>[1]) => {
      if (bob.busy) return;
      const subject = subjectOnBoard({ answers, board, retuned: {}, defs: null }, label, dimension ?? 'store');
      const selection = asSelection([subject]);
      void bob.ask('why?', {
        ...(selection ? { desk: { selection } } : {}),
        ...askFrom(hereForKeptPage(pageId, title)),
      });
    };
    return { open: () => {}, patch: () => {}, pick: about, why: about };
  }, [answers, board, bob, pageId, title]);

  return (
    <section className="r-kept-pin" data-pin={pin.id} data-shape={shape}
             data-tile={kind === 'dashboard' && shape === 'stat' ? 'yes' : undefined}>
      <div className="r-kept-pin-head">
        <h2 className="r-kept-pin-title">{pin.title}</h2>
        {/* WHAT I CAN DO WITH THIS ANALYSIS, ASKED FOR (the lead, 2026-09-23).
            Six text links over every analysis — Refresh, Move up, Move down,
            Move, Remove, Delete — were the loudest thing on all four kinds,
            louder than the figures they sat over. They are one quiet gesture
            now, and a disclosure rather than a hover, because the phone layout
            is the real one and a hover does not exist there. Nothing is
            removed: every control still works in every kind. */}
        <details className="r-kept-acts">
          <summary className="r-act" aria-label={`What I can do with “${pin.title}”`}>⋯</summary>
          <span className="r-row-acts" style={{ marginTop: 0 }}>
            <button type="button" className="r-act" disabled={run.refreshing} onClick={run.refresh}>
              {run.refreshing ? 'Reading…' : 'Refresh'}
            </button>
            {actions}
          </span>
        </details>
      </div>

      {/* NOT YET STARTED IS READING TOO: the run starts on mount, and a first
          paint that said nothing would be a fourth state (UI rule 8). */}
      {run.reading && !data && <p className="r-note">Reading…</p>}
      {run.failed && !data && (
        <p className="r-say" data-state="failed">
          Could not reach Bob. {errorMessage(run.error)} <span className="r-src">Last worked {ago(pin.last_ok_at)}</span>
        </p>
      )}
      {data && (
        <>
          <Caveats notices={data.notices} />
          {data.window && (
            <p className="r-src" data-window={data.window.preset}>
              Read over {data.window.label} · {ago(data.ran_at)}
            </p>
          )}
          {[...new Set(unmoved)].map((says) => (
            <p key={says} className="r-src" data-window-unmoved="true">{says}</p>
          ))}
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
                   live={false} retuned={{}} on={on} arrangement={arrangement} />
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

/**
 * WHAT KIND OF PAGE THIS IS, AND CHANGING IT (W4.1).
 *
 * Beside Rename and shaped like it — one gesture, one Save — because it is the
 * same act: saying what this page is. It says the kind in the ROOM'S WORDS
 * (`pageKind.wordsFor`, the definitions' own where the server serves them),
 * never the enum, and it says when Bob or the server worked the kind out
 * rather than letting a derived kind look like a choice somebody made.
 *
 * IT CHANGES ONLY THE DRAWING. No figure moves, no analysis moves, and the
 * page's own order is untouched — which is why this sits with Rename and not
 * with the window, whose change re-reads every analysis.
 */
function KindControl({ page, onDone }: { page: Page; onDone: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kind = kindOf(page);
  const [picked, setPicked] = useState<PageKind>(kind);
  const save = useMutation({
    mutationFn: (next: PageKind) => setPageKind(page.id, next),
    onSuccess: (next) => {
      setEditing(false); setError(null);
      qc.setQueryData(['page', page.id], next);
      onDone();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const words = wordsFor(page, kind);
  const cancel = () => { setEditing(false); setPicked(kind); setError(null); };
  if (!editing) {
    return (
      <button type="button" className="r-act" aria-label="What this page is"
              onClick={() => { setPicked(kind); setEditing(true); }}>
        {words.label}
      </button>
    );
  }
  return (
    <form className="r-newpage r-kept-kind" onSubmit={(e) => {
      e.preventDefault();
      if (picked !== kind) save.mutate(picked); else cancel();
    }}>
      <label>
        This page is{' '}
        <select className="r-field" autoFocus aria-label="What this page is"
                value={picked} disabled={save.isPending}
                onChange={(e) => setPicked(e.target.value as PageKind)}>
          {kindOptions(page).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <button type="submit" className="r-act" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="r-act" onClick={cancel}>Cancel</button>
      <span className="r-src" data-kind-says="yes">
        {wordsFor(page, picked).says}
        {/* HOW IT GOT THIS KIND — a derived kind is not a decision anybody
            made, and saying so is what lets the owner know it is his to set. */}
        {picked === kind && page.kind_set_by === 'derived'
          && ' Worked out from what is on this page; nobody has set it.'}
        {picked === kind && page.kind_set_by === 'bob' && ' Set by Bob.'}
      </span>
      {error && <span className="r-note" data-state="failed">{error}</span>}
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

/**
 * THE PAGE'S DATE WINDOW (W1.4) — "add date filters to this". One control for
 * the whole page; picking a window stores it on the page (audited) and every
 * analysis re-runs over it through its own read. The options are the page's
 * own, served from the definitions (sales_day.presets); none is held here.
 * A page with no window offers to add one; adding it moves nothing until a
 * window is picked.
 */
export function WindowControl({ page, onDone }: { page: Page; onDone: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const done = (next: Page) => {
    setError(null);
    qc.setQueryData(['page', page.id], next);
    onDone();
  };
  const pick = useMutation({
    mutationFn: (preset: string | null) => setPageWindow(page.id, preset),
    onSuccess: done, onError: (err) => setError(errorMessage(err)),
  });
  const off = useMutation({
    mutationFn: () => removePageWindow(page.id),
    onSuccess: done, onError: (err) => setError(errorMessage(err)),
  });
  const busy = pick.isPending || off.isPending;
  const w = page.window ?? null;
  if (!w) {
    return (
      <p className="r-note r-kept-window">
        <button type="button" className="r-act" disabled={busy} onClick={() => pick.mutate(null)}>
          {pick.isPending ? 'Adding…' : 'Add date filter'}
        </button>
        {error && <span className="r-note" data-state="failed"> {error}</span>}
      </p>
    );
  }
  return (
    <p className="r-note r-kept-window" data-window={w.preset ?? ''}>
      <label>
        Dates{' '}
        <select className="r-field" aria-label="Dates for every analysis on this page"
                value={w.preset ?? ''} disabled={busy}
                onChange={(e) => pick.mutate(e.target.value === '' ? null : e.target.value)}>
          {w.options.map((o) => (
            <option key={o.value ?? ''} value={o.value ?? ''}>{o.label}</option>
          ))}
        </select>
      </label>{' '}
      <button type="button" className="r-act" disabled={busy} onClick={() => off.mutate()}>
        {off.isPending ? 'Removing…' : 'Remove date filter'}
      </button>{' '}
      {busy ? <span className="r-src">Changing…</span>
        : w.set_at && <span className="r-src">set {ago(w.set_at)}{w.set_by === 'bob' ? ' by Bob' : ''}</span>}
      {error && <span className="r-note" data-state="failed"> {error}</span>}
    </p>
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
