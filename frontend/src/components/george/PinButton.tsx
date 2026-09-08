/**
 * Pin an answer.
 *
 * What gets stored is the TOOL CALLS behind the answer, never the answer text —
 * the tile re-runs them, so it stays current instead of freezing a sentence
 * written against last month's numbers.
 *
 * THE PAGE IS CHOSEN HERE, and this is where a page is made. A page is derived
 * from its pins, so "New page" is not a create step — it is a name on this
 * pin, and the page exists the moment the pin does. The picker is the same one
 * the Move control uses (PagePicker), so a person who has put a pin somewhere
 * once knows how to put every pin anywhere.
 *
 * THE CONFIRMATION SAYS WHERE IT WENT, and links there. "Pinned" alone left a
 * person to go and find their tile; "Pinned to Fame · Open" is the write
 * reported as a fact with the way to it beside it.
 *
 * There is deliberately no Save button beside this one. CLAUDE.md keeps pin and
 * save as different words ("a pin re-runs; a save is the rule it re-runs"), and
 * a workflow is still saved by asking George in the thread, through the
 * injected writer and the promotion gate.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Pin as PinIcon } from 'lucide-react';
import type { Pin, PinToolCall, SimilarPageConflict } from '../../types/pins';
import {
  createPin,
  errorMessage,
  listPinPages,
  similarPageConflict,
} from '../../services/pinsApi';
import { choiceBody, isChoiceReady, type PageChoice } from './pageChoice';
import { pagePath } from './pageShape';
import { PagePicker } from './PagePicker';

/** The backend caps a pin at 8 calls; say so rather than failing on submit. */
const MAX_CALLS = 8;

export function PinButton({
  calls,
  question,
  conversationId,
}: {
  /**
   * The calls to store, exactly as they ran. From a live turn these are its
   * tool_call frames; from a stored post they are the `calls` the loop
   * persisted beside the snapshot (postShape.storedCalls). Either way the
   * backend re-validates every one against the live tool surface before it
   * stores anything.
   */
  calls: PinToolCall[];
  question?: string;
  conversationId?: string | null;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PageChoice>({ kind: 'none' });
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<Pin | null>(null);

  const pages = useQuery({
    queryKey: ['pin-pages'],
    queryFn: listPinPages,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      createPin({
        title: question?.slice(0, 200) || undefined,
        question,
        conversation_id: conversationId ?? undefined,
        ...(() => {
          const body = choiceBody(choice);
          if (!body) return {};
          if ('page' in body) return { page: body.page };
          return body.page_id ? { page_id: body.page_id } : {};
        })(),
        tool_calls: calls,
        allow_similar_page: allowSimilar,
      }),
    onSuccess: (pin) => {
      setPinned(pin);
      setOpen(false);
      setConflict(null);
      setError(null);
      qc.invalidateQueries({ queryKey: ['pin-pages'] });
      qc.invalidateQueries({ queryKey: ['pins'] });
    },
    onError: (err) => {
      // The near-duplicate refusal is not an error to swallow — it exists so a
      // typo does not silently fork "Replenishment" into two pages. Surface it
      // and let the person choose.
      const similar = similarPageConflict(err);
      if (similar) {
        setConflict(similar);
        setError(null);
      } else {
        setConflict(null);
        setError(errorMessage(err));
      }
    },
  });

  // Nothing to re-run means nothing to pin: an answer with no tool call has no
  // numbers behind it, and a tile of prose would be exactly the frozen sentence
  // pins exist to avoid.
  if (calls.length === 0) return null;

  if (pinned) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-george-slate">
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span>
          Pinned{' '}
          {pinned.page ? (
            <>
              to <span className="text-george-navy">{pinned.page}</span>
            </>
          ) : (
            'with no page'
          )}
        </span>
        <span className="text-george-muted" aria-hidden>·</span>
        <Link to={pagePath(pinned.page_id)} className="text-george-navy hover:underline">
          Open
        </Link>
      </span>
    );
  }

  const tooMany = calls.length > MAX_CALLS;
  const existing = (pages.data ?? []).flatMap((p) =>
    p.page_id && p.page ? [{ page_id: p.page_id, title: p.page }] : [],
  );

  const close = () => {
    setOpen(false);
    setConflict(null);
    setError(null);
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-george-slate hover:bg-george-line/40 min-h-touch"
      >
        <PinIcon className="h-3.5 w-3.5" aria-hidden />
        Pin
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pin this answer"
          className="absolute bottom-full left-0 z-20 mb-1.5 w-72 rounded-xl border border-george-line bg-george-cream p-3 shadow-lg"
        >
          <p className="text-[12px] leading-relaxed text-george-slate">
            The tile re-runs {calls.length === 1 ? 'this call' : `these ${calls.length} calls`} each
            time it loads, so it stays current.
          </p>

          {tooMany ? (
            <p className="mt-2 text-[12px] leading-relaxed text-george-navy">
              This answer used {calls.length} tool calls — more than the {MAX_CALLS} a single tile
              can hold. It is probably several tiles.
            </p>
          ) : (
            <>
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
                      onClick={() => create.mutate(true)}
                      className="rounded-md border border-george-line px-2 py-1 text-[12px] text-george-slate"
                    >
                      Keep both
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-2 text-[12px] leading-relaxed text-george-navy">{error}</p>
              )}

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
                  onClick={() => create.mutate(false)}
                  disabled={create.isPending || !isChoiceReady(choice)}
                  className="rounded-lg bg-george-navy px-3 py-1.5 text-[12px] text-george-cream disabled:opacity-60 min-h-touch"
                >
                  {create.isPending ? 'Pinning…' : 'Pin'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
