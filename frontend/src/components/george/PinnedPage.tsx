/**
 * A page of pins, read as a document.
 *
 * NOT A GRID OF CARDS. Five bordered boxes two-up is the shape of an admin
 * dashboard: every figure the same size, none of them leading, and the chrome
 * competing with the numbers. This is one column of sections separated by
 * hairlines, the first set larger — the page's own order, which is now the
 * order somebody put things in, rather than this component ranking them.
 *
 * The tiles still do exactly what they did: each re-runs its own vetted calls
 * on mount and carries its own notices and receipts, which is what makes a
 * tile allowed to show a number at all (UI rules 3, 4, 6).
 *
 * WHAT A PAGE CAN DO TO ITSELF (Page Workshop V1, 2026-09-08): be renamed,
 * be given a one-line purpose, have a pin moved on or off it, have a pin
 * moved up or down, and be deleted — which moves its pins to Ungrouped and
 * deletes none of them. All quiet text links, all through the same service
 * George's edit_page calls, so a button and a sentence cannot drift.
 *
 * TWO WORDS FOR TWO ACTS. "Remove from page" takes a pin off this page and
 * keeps it in Ungrouped; "Delete" deletes the saved analysis itself, after a
 * confirmation that says so. Until this date one word did both, and a person
 * pressing Remove could not know which they were about to get.
 *
 * AN EMPTY PAGE IS A PAGE. It exists, it has a name, and the composer at its
 * foot is how it gets its first analysis — by asking George, whose edit_page
 * lands on this page because the scope is bound to its id. Nothing is put on
 * an empty page unasked.
 *
 * One column at every width. The centre column is already the reading measure
 * on a desktop, and a second column of figures would halve it for no gain —
 * "if a tile cannot show the caveat, the tile is the wrong shape" (UI rule 4),
 * and a caveat needs the width.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { Page, Pin, SimilarPageConflict } from '../../types/pins';
import { useGeorge } from '../../hooks/useGeorge';
import { deletePage, getPage, updatePage } from '../../services/pagesApi';
import {
  deletePin,
  errorMessage,
  listPinPages,
  listPins,
  similarPageConflict,
  updatePin,
} from '../../services/pinsApi';
import { PageHeader } from '../shell/PageHeader';
import { AskComposer } from './AskComposer';
import { choiceBody, choiceFor, movesPin, type PageChoice } from './pageChoice';
import { pageScopeFor } from './pageScope';
import { pageContextFor, UNGROUPED_NAME } from './pageShape';
import { PagePicker } from './PagePicker';
import { PinTile } from './PinTile';

export function PinnedPage({
  pageId,
  onBack,
}: {
  /** A page's id, or null for the ungrouped pins. */
  pageId: string | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const page = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => getPage(pageId as string),
    enabled: pageId !== null,
  });
  const pins = useQuery({
    queryKey: ['pins', pageId],
    queryFn: () => listPins(pageId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pins'] });
    qc.invalidateQueries({ queryKey: ['pin-pages'] });
    qc.invalidateQueries({ queryKey: ['pages'] });
    qc.invalidateQueries({ queryKey: ['page', pageId] });
  };

  const remove = useMutation({ mutationFn: deletePin, onSuccess: invalidate });
  const place = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updatePin>[1] }) =>
      updatePin(id, body),
    onSuccess: invalidate,
  });

  const onDelete = (id: string) => {
    const pin = pins.data?.find((p) => p.id === id);
    // Deleting a pin throws away the saved analysis itself, and the wording
    // says so; taking it off the page is the other link.
    if (window.confirm(`Delete “${pin?.title ?? 'this analysis'}”? This deletes the saved analysis itself, not just its place on this page.`)) {
      remove.mutate(id);
    }
  };

  const title = pageId === null ? UNGROUPED_NAME : page.data?.title;
  const list = pins.data ?? [];

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-6 flex min-h-touch items-center gap-1.5 text-[13px] text-george-slate hover:text-george-navy"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All pages
      </button>

      {pageId !== null && page.isPending && (
        <p className="text-[13px] text-george-muted">Reading…</p>
      )}
      {pageId !== null && page.isError && (
        <p className="text-[13px] leading-relaxed text-george-slate">
          Could not load this page. It may have been deleted, or it may be somebody else’s.
        </p>
      )}

      {title !== undefined && (
        <PageHeader
          title={title}
          meta={
            pageId === null
              ? 'Pins with no page. Every question here was asked again when this opened, so these are current figures rather than saved ones.'
              : 'Every question on this page was asked again when it opened, so these are current figures rather than saved ones.'
          }
        >
          {page.data && (
            <div className="flex shrink-0 items-baseline gap-4">
              <RenameControl page={page.data} onRenamed={invalidate} />
              <DeletePageControl
                page={page.data}
                pinCount={list.length}
                onDeleted={() => { invalidate(); navigate('/pages', { replace: true }); }}
              />
            </div>
          )}
        </PageHeader>
      )}

      {page.data && <PurposeControl page={page.data} onSaved={invalidate} />}

      {pins.isPending && <p className="text-[13px] text-george-muted">Reading…</p>}
      {pins.isError && (
        <p className="text-[13px] leading-relaxed text-george-slate">
          Could not load this page.
        </p>
      )}
      {pins.isSuccess && list.length === 0 && (
        <div className="max-w-xl">
          <p className="text-[15px] leading-relaxed text-george-slate">Nothing here yet.</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-george-muted">
            {pageId === null
              ? 'Pins taken off a page land here. Nothing is ungrouped at the moment.'
              : 'Ask George to build this page below, or pin an answer from Ask and choose it.'}
          </p>
        </div>
      )}

      <div className="space-y-7">
        {list.map((pin, i) => (
          <PinTile
            key={pin.id}
            pin={pin}
            onDelete={onDelete}
            lead={i === 0}
            actions={
              <>
                {pageId !== null && (
                  <OrderControls
                    pin={pin}
                    prev={list[i - 1]}
                    next={list[i + 1]}
                    busy={place.isPending}
                    onPlace={(body) => place.mutate({ id: pin.id, body })}
                  />
                )}
                <MoveControl pin={pin} onMoved={invalidate} />
                {pageId !== null && (
                  <button
                    type="button"
                    onClick={() => place.mutate({ id: pin.id, body: { page_id: null } })}
                    disabled={place.isPending}
                    aria-label={`Remove ${pin.title} from page`}
                    className="text-george-muted hover:text-george-navy disabled:opacity-40"
                  >
                    Remove from page
                  </button>
                )}
              </>
            }
          />
        ))}
      </div>

      <PageComposer pageId={pageId} title={title ?? null} />
    </div>
  );
}

/* ------------------------------------------------------------------ order -- */

/**
 * Move up / Move down. Relational placement — before the previous pin, after
 * the next — through the same API George's `place` uses, so the backend
 * keeps positions dense and drag-and-drop can arrive later without a new
 * data model. At the ends the link is disabled rather than hidden, so the
 * row keeps its shape.
 */
function OrderControls({
  pin,
  prev,
  next,
  busy,
  onPlace,
}: {
  pin: Pin;
  prev?: Pin;
  next?: Pin;
  busy: boolean;
  onPlace: (body: Parameters<typeof updatePin>[1]) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => prev && onPlace({ place: { before: prev.id } })}
        disabled={busy || !prev}
        aria-label={`Move ${pin.title} up`}
        className="text-george-muted hover:text-george-navy disabled:opacity-40"
      >
        Move up
      </button>
      <button
        type="button"
        onClick={() => next && onPlace({ place: { after: next.id } })}
        disabled={busy || !next}
        aria-label={`Move ${pin.title} down`}
        className="text-george-muted hover:text-george-navy disabled:opacity-40"
      >
        Move down
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ rename -- */

/**
 * Rename the page, in place.
 *
 * A text link until wanted, then one input where the name is. Enter saves,
 * Escape cancels. The near-duplicate refusal is surfaced exactly as the Pin
 * dialog surfaces it, because it is the same refusal from the same rule. The
 * URL does not change: the page is its id.
 */
function RenameControl({ page, onRenamed }: { page: Page; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page.title);
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      updatePage(page.id, { title: name, allow_similar_page: allowSimilar }),
    onSuccess: () => {
      setEditing(false);
      setConflict(null);
      setError(null);
      onRenamed();
    },
    onError: (err) => {
      const similar = similarPageConflict(err);
      setConflict(similar);
      setError(similar ? null : errorMessage(err));
    },
  });

  const cancel = () => {
    setEditing(false);
    setName(page.title);
    setConflict(null);
    setError(null);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setName(page.title); setEditing(true); }}
        className="shrink-0 text-[12px] text-george-muted hover:text-george-navy"
      >
        Rename
      </button>
    );
  }

  return (
    <form
      className="flex shrink-0 flex-col items-end gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && name.trim() !== page.title) rename.mutate(false);
        else cancel();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          value={name}
          onChange={(e) => { setName(e.target.value); setConflict(null); }}
          onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
          aria-label="Page name"
          maxLength={100}
          className="w-48 rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
        />
        <button
          type="submit"
          disabled={rename.isPending}
          className="text-[12px] text-george-navy disabled:opacity-40"
        >
          {rename.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} className="text-[12px] text-george-muted">
          Cancel
        </button>
      </div>
      {conflict && (
        <div className="w-72 rounded-lg border border-george-line bg-george-paper p-2 text-left">
          <p className="text-[12px] leading-relaxed text-george-navy">{conflict.message}</p>
          <button
            type="button"
            onClick={() => rename.mutate(true)}
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

/* ----------------------------------------------------------------- purpose -- */

/**
 * The page's purpose: one line under the title, in the owner's words.
 *
 * Shown as text, edited in place, cleared by saving it empty. Descriptive
 * metadata — what the page is for — and George is handed it labelled as
 * exactly that when he reads the page. It is not an instruction to anyone.
 */
function PurposeControl({ page, onSaved }: { page: Page; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(page.purpose ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updatePage(page.id, { purpose: text.trim() ? text : null }),
    onSuccess: () => { setEditing(false); setError(null); onSaved(); },
    onError: (err) => setError(errorMessage(err)),
  });

  const cancel = () => { setEditing(false); setText(page.purpose ?? ''); setError(null); };

  if (!editing) {
    return (
      <div className="-mt-4 mb-8 flex items-baseline gap-3">
        {page.purpose ? (
          <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">{page.purpose}</p>
        ) : (
          <p className="text-[13px] text-george-muted">No purpose written yet.</p>
        )}
        <button
          type="button"
          onClick={() => { setText(page.purpose ?? ''); setEditing(true); }}
          className="shrink-0 text-[12px] text-george-muted hover:text-george-navy"
        >
          {page.purpose ? 'Edit purpose' : 'Add purpose'}
        </button>
      </div>
    );
  }

  return (
    <form
      className="-mt-4 mb-8 flex max-w-xl flex-col gap-1.5"
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
    >
      <input
        type="text"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
        aria-label="Page purpose"
        maxLength={200}
        placeholder="What this page is for, in one line"
        className="w-full rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
      />
      <div className="flex items-center gap-3 text-[12px]">
        <button type="submit" disabled={save.isPending} className="text-george-navy disabled:opacity-40">
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={cancel} className="text-george-muted">Cancel</button>
        {error && <span className="text-george-navy">{error}</span>}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- delete page -- */

/**
 * Delete the page. Its pins move to Ungrouped; none is deleted, and the
 * confirmation says so in as many words. This exists because an empty page
 * has no other way out: removing pins never removes a page any more.
 */
function DeletePageControl({
  page,
  pinCount,
  onDeleted,
}: {
  page: Page;
  pinCount: number;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: () => deletePage(page.id),
    onSuccess: onDeleted,
    onError: (err) => setError(errorMessage(err)),
  });
  const kept = pinCount === 0
    ? 'It is empty.'
    : `Its ${pinCount === 1 ? 'analysis moves' : `${pinCount} analyses move`} to Ungrouped; nothing is deleted.`;
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Delete the page “${page.title}”? ${kept}`)) del.mutate();
        }}
        disabled={del.isPending}
        className="shrink-0 text-[12px] text-george-muted hover:text-george-navy disabled:opacity-40"
      >
        Delete page
      </button>
      {error && <span className="text-[12px] text-george-navy">{error}</span>}
    </span>
  );
}

/* -------------------------------------------------------------------- move -- */

/**
 * Move one pin to another page, off this one, or onto a new one.
 *
 * The same picker the Pin dialog uses, opened from a text link beside
 * Refresh. An existing page is chosen by id; "No page" is Ungrouped; a new
 * name brings a page into being. A move to where the pin already is does
 * nothing and is not offered as if it would (pageChoice.movesPin).
 */
function MoveControl({ pin, onMoved }: { pin: Pin; onMoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PageChoice>(() => choiceFor(pin));
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pages = useQuery({
    queryKey: ['pin-pages'],
    queryFn: listPinPages,
    enabled: open,
  });

  const move = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      updatePin(pin.id, { ...(choiceBody(choice) ?? {}), allow_similar_page: allowSimilar }),
    onSuccess: () => {
      setOpen(false);
      setConflict(null);
      setError(null);
      onMoved();
    },
    onError: (err) => {
      const similar = similarPageConflict(err);
      setConflict(similar);
      setError(similar ? null : errorMessage(err));
    },
  });

  const close = () => {
    setOpen(false);
    setChoice(choiceFor(pin));
    setConflict(null);
    setError(null);
  };

  const existing = (pages.data ?? []).flatMap((p) =>
    p.page_id && p.page ? [{ page_id: p.page_id, title: p.page }] : [],
  );

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={`Move ${pin.title}`}
        className="text-george-muted hover:text-george-navy"
      >
        Move
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Move ${pin.title}`}
          className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-george-line bg-george-cream p-3 text-left shadow-lg"
        >
          <p className="text-[12px] leading-relaxed text-george-slate">
            Moving changes where this pin sits. Its calls and its history stay as they are.
          </p>

          <PagePicker
            pages={existing}
            loading={pages.isPending}
            failed={pages.isError}
            value={choice}
            onChange={(c) => { setChoice(c); setConflict(null); }}
          />

          {conflict && (
            <div className="mt-2 rounded-lg border border-george-line bg-george-paper p-2">
              <p className="text-[12px] leading-relaxed text-george-navy">{conflict.message}</p>
              <div className="mt-2 flex gap-2">
                {(() => {
                  const match = existing.find((p) => p.title === conflict.existing_page);
                  return match ? (
                    <button
                      type="button"
                      onClick={() => {
                        setChoice({ kind: 'existing', pageId: match.page_id, title: match.title });
                        setConflict(null);
                      }}
                      className="rounded-md border border-george-line px-2 py-1 text-[12px] text-george-navy"
                    >
                      Use “{conflict.existing_page}”
                    </button>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => move.mutate(true)}
                  className="rounded-md border border-george-line px-2 py-1 text-[12px] text-george-slate"
                >
                  Keep both
                </button>
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-[12px] leading-relaxed text-george-navy">{error}</p>}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-2.5 py-1.5 text-[12px] text-george-slate min-h-touch"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => move.mutate(false)}
              disabled={move.isPending || !movesPin(pin.page_id, choice)}
              className="rounded-lg bg-george-navy px-3 py-1.5 text-[12px] text-george-cream disabled:opacity-60 min-h-touch"
            >
              {move.isPending ? 'Moving…' : 'Move'}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- composer -- */

/**
 * Ask George, from the foot of the page.
 *
 * SENT, NOT DRAFTED. The person pressed send here, so the question goes to
 * George now — through the one stream the shell owns — and the page moves to
 * Ask, where the answer is already arriving. Making them send twice would be
 * a handoff that lost the gesture.
 *
 * WHAT GEORGE IS TOLD is the page's title, as context, and its IDENTITY, as
 * the scope the new thread is bound to. The scope is what lets him read the
 * page and change it — view_page and edit_page both land on this id, and
 * keep landing on it after a rename. Nothing on the page travels with the
 * question.
 */
function PageComposer({ pageId, title }: { pageId: string | null; title: string | null }) {
  const { ask, reset, cancel, busy } = useGeorge();
  const navigate = useNavigate();

  const onAsk = (question: string) => {
    reset();
    void ask(question, {
      pageContext: pageContextFor(pageId === null ? null : title),
      pageScope: pageScopeFor(pageId, title),
    });
    navigate('/ask');
  };

  return (
    <div className="mt-12 border-t border-george-line pt-6">
      <AskComposer
        bare
        column="w-full"
        placeholder="Ask George about this page…"
        onAsk={onAsk}
        onCancel={cancel}
        busy={busy}
      />
    </div>
  );
}
