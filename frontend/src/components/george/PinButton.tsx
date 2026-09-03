/**
 * Pin an answer.
 *
 * What gets stored is the TOOL CALLS behind the answer, never the answer text —
 * the tile re-runs them, so it stays current instead of freezing a sentence
 * written against last month's numbers.
 *
 * There is deliberately no Save button beside this one. CLAUDE.md keeps pin and
 * save as different words ("a pin re-runs; a save is the rule it re-runs"), and
 * there is no rule versioning server-side yet. A disabled Save control would be
 * a promise the backend cannot keep, so the row is simply built to take one.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Pin as PinIcon } from 'lucide-react';
import type { GeorgeTurn } from '../../types/george';
import type { SimilarPageConflict } from '../../types/pins';
import {
  createPin,
  errorMessage,
  listPinPages,
  similarPageConflict,
} from '../../services/pinsApi';

/** The backend caps a pin at 8 calls; say so rather than failing on submit. */
const MAX_CALLS = 8;

export function PinButton({ turn, question }: { turn: GeorgeTurn; question?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState('');
  const [conflict, setConflict] = useState<SimilarPageConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);

  const pages = useQuery({
    queryKey: ['pin-pages'],
    queryFn: listPinPages,
    enabled: open,
  });

  const calls =
    turn.role === 'george'
      ? turn.toolCalls.map((c) => ({ tool: c.tool, arguments: c.arguments }))
      : [];

  const create = useMutation({
    mutationFn: (allowSimilar: boolean) =>
      createPin({
        title: question?.slice(0, 200) || undefined,
        question,
        conversation_id: turn.role === 'george' ? turn.done?.conversation_id : undefined,
        page: page.trim() || undefined,
        tool_calls: calls,
        allow_similar_page: allowSimilar,
      }),
    onSuccess: () => {
      setPinned(true);
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
        Pinned
      </span>
    );
  }

  const tooMany = calls.length > MAX_CALLS;

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
              <label className="mt-2.5 block text-[12px] text-george-slate" htmlFor="pin-page">
                Page <span className="text-george-muted">(optional)</span>
              </label>
              <input
                id="pin-page"
                list="pin-page-options"
                value={page}
                onChange={(e) => { setPage(e.target.value); setConflict(null); }}
                placeholder="Replenishment"
                className="mt-1 w-full rounded-lg border border-george-line bg-george-paper px-2.5 py-1.5 text-[13px] text-george-navy outline-none focus:border-george-slate"
              />
              <datalist id="pin-page-options">
                {(pages.data ?? [])
                  .filter((p) => p.page)
                  .map((p) => <option key={p.page} value={p.page as string} />)}
              </datalist>

              {conflict && (
                <div className="mt-2 rounded-lg border border-george-line bg-george-paper p-2">
                  <p className="text-[12px] leading-relaxed text-george-navy">{conflict.message}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setPage(conflict.existing_page); setConflict(null); }}
                      className="rounded-md border border-george-line px-2 py-1 text-[12px] text-george-navy"
                    >
                      Use “{conflict.existing_page}”
                    </button>
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
                  onClick={() => { setOpen(false); setConflict(null); setError(null); }}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] text-george-slate min-h-touch"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => create.mutate(false)}
                  disabled={create.isPending}
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
