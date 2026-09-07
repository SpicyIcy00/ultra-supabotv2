/**
 * A page of pins, read as a document.
 *
 * NOT A GRID OF CARDS. Five bordered boxes two-up is the shape of an admin
 * dashboard: every figure the same size, none of them leading, and the chrome
 * competing with the numbers. This is one column of sections separated by
 * hairlines, the first set larger — the page's own order, which is the order
 * somebody pinned things in, rather than this component ranking them.
 *
 * The tiles still do exactly what they did: each re-runs its own vetted calls
 * on mount and carries its own notices and receipts, which is what makes a
 * tile allowed to show a number at all (UI rules 3, 4, 6).
 *
 * WHAT A PAGE CAN DO TO ITSELF (Persistence V1, 2026-09-07): be renamed, and
 * have a pin moved on or off it. Both are quiet text links — Rename beside the
 * title, Move beside Refresh and Remove — and both are a label changing on a
 * row. Nothing is re-run, and nothing is created: a page is its pins, so a
 * rename is every pin of the reader's on it changing its label together, and
 * "Move → No page" is how a pin leaves without being deleted. Remove still
 * deletes, as it always did; there is no second removal verb.
 *
 * THE COMPOSER AT THE FOOT hands a question to Ask with the page's NAME as
 * context — its identity, not its contents. George cannot read a page's pins
 * from a name (pageShape.pageContextFor), and the placeholder says "about",
 * not "using", so it promises nothing the loop cannot keep.
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
import type { Pin, SimilarPageConflict } from '../../types/pins';
import { useGeorge } from '../../hooks/useGeorge';
import {
  deletePin,
  errorMessage,
  listPinPages,
  listPins,
  renamePage,
  similarPageConflict,
  updatePin,
} from '../../services/pinsApi';
import { PageHeader } from '../shell/PageHeader';
import { AskComposer } from './AskComposer';
import { choiceFor, chosenPage, movesPin, type PageChoice } from './pageChoice';
import { pageContextFor, pagePath, UNGROUPED_NAME } from './pageShape';
import { PagePicker } from './PagePicker';
import { PinTile } from './PinTile';

export function PinnedPage({
  page,
  onBack,
}: {
  /** A page name, or null for the ungrouped pins. */
  page: string | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();

  const pins = useQuery({
    queryKey: ['pins', page],
    queryFn: () => listPins(page),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pins'] });
    qc.invalidateQueries({ queryKey: ['pin-pages'] });
  };

  const remove = useMutation({ mutationFn: deletePin, onSuccess: invalidate });

  const onDelete = (id: string) => {
    const pin = pins.data?.find((p) => p.id === id);
    // Deleting a pin throws away a saved question, not data — a plain confirm
    // is proportionate, and the pin can simply be made again.
    if (window.confirm(`Remove “${pin?.title ?? 'this pin'}” from this page?`)) {
      remove.mutate(id);
    }
  };

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

      <PageHeader
        title={page ?? UNGROUPED_NAME}
        meta="Every question on this page was asked again when it opened, so these are current figures rather than saved ones."
      >
        {page !== null && <RenameControl page={page} onRenamed={invalidate} />}
      </PageHeader>

      {pins.isPending && <p className="text-[13px] text-george-muted">Reading…</p>}
      {pins.isError && (
        <p className="text-[13px] leading-relaxed text-george-slate">
          Could not load this page.
        </p>
      )}
      {pins.data?.length === 0 && (
        <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">
          This page has no pins. Pin an answer from a conversation to add one.
        </p>
      )}

      <div className="space-y-7">
        {(pins.data ?? []).map((pin, i) => (
          <PinTile
            key={pin.id}
            pin={pin}
            onDelete={onDelete}
            lead={i === 0}
            actions={<MoveControl pin={pin} onMoved={invalidate} />}
          />
        ))}
      </div>

      <PageComposer page={page} />
    </div>
  );
}

/* ------------------------------------------------------------------ rename -- */

/**
 * Rename the page, in place.
 *
 * A text link until wanted, then one input where the name is. Enter saves,
 * Escape cancels. The near-duplicate refusal is surfaced exactly as the Pin
 * dialog surfaces it, because it is the same refusal from the same rule.
 */
function RenameControl({ page, onRenamed }: { page: string; onRenamed: () => void }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(page);
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rename = useMutation({
    mutationFn: (allowSimilar: boolean) => renamePage(page, name, allowSimilar),
    onSuccess: (result) => {
      setEditing(false);
      setConflict(null);
      setError(null);
      onRenamed();
      // The page is in the URL, so the URL follows the name.
      navigate(pagePath(result.page), { replace: true });
    },
    onError: (err) => {
      const similar = similarPageConflict(err);
      setConflict(similar);
      setError(similar ? null : errorMessage(err));
    },
  });

  const cancel = () => {
    setEditing(false);
    setName(page);
    setConflict(null);
    setError(null);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setName(page); setEditing(true); }}
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
        if (name.trim() && name.trim() !== page) rename.mutate(false);
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

/* -------------------------------------------------------------------- move -- */

/**
 * Move one pin to another page, off this one, or onto a new one.
 *
 * The same picker the Pin dialog uses, opened from a text link beside
 * Refresh and Remove. "No page" is how a pin leaves a page without being
 * deleted. A move to where the pin already is does nothing and is not
 * offered as if it would (pageChoice.movesPin).
 */
function MoveControl({ pin, onMoved }: { pin: Pin; onMoved: () => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PageChoice>(() => choiceFor(pin.page));
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pages = useQuery({
    queryKey: ['pin-pages'],
    queryFn: listPinPages,
    enabled: open,
  });

  const move = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      updatePin(pin.id, { page: chosenPage(choice) ?? null, allow_similar_page: allowSimilar }),
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
    setChoice(choiceFor(pin.page));
    setConflict(null);
    setError(null);
  };

  const existing = (pages.data ?? []).flatMap((p) => (p.page ? [p.page] : []));

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
                <button
                  type="button"
                  onClick={() => {
                    setChoice({ kind: 'existing', page: conflict.existing_page });
                    setConflict(null);
                  }}
                  className="rounded-md border border-george-line px-2 py-1 text-[12px] text-george-navy"
                >
                  Use “{conflict.existing_page}”
                </button>
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
              disabled={move.isPending || !movesPin(pin.page, choice)}
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
 * WHAT GEORGE IS TOLD is the page's name and nothing else. See
 * pageShape.pageContextFor for why that is the whole of it.
 */
function PageComposer({ page }: { page: string | null }) {
  const { ask, reset, cancel, busy } = useGeorge();
  const navigate = useNavigate();

  const onAsk = (question: string) => {
    reset();
    void ask(question, { pageContext: pageContextFor(page) });
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
