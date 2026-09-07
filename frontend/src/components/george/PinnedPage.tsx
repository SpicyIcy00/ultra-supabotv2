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
 * One column at every width. The centre column is already the reading measure
 * on a desktop, and a second column of figures would halve it for no gain —
 * "if a tile cannot show the caveat, the tile is the wrong shape" (UI rule 4),
 * and a caveat needs the width.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { deletePin, listPins } from '../../services/pinsApi';
import { PageHeader } from '../shell/PageHeader';
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

  const remove = useMutation({
    mutationFn: deletePin,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pins'] });
      qc.invalidateQueries({ queryKey: ['pin-pages'] });
    },
  });

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
        title={page ?? 'Ungrouped'}
        meta="Every question on this page was asked again when it opened, so these are current figures rather than saved ones."
      />

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
          <PinTile key={pin.id} pin={pin} onDelete={onDelete} lead={i === 0} />
        ))}
      </div>
    </div>
  );
}
