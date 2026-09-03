/**
 * A page of pins, rendered in the centre column.
 *
 * Tiles live here rather than inside the 256px left rail because UI rule 4 is
 * explicit: "if a tile cannot show the caveat, the tile is the wrong shape." A
 * notice banner and a receipts line do not fit in a rail, and a tile that
 * dropped them to fit would be discarding the very data the tool went out of
 * its way to return.
 *
 * The rail names the pages; this is where they open.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { deletePin, listPins } from '../../services/pinsApi';
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-george-slate hover:bg-george-line/40 min-h-touch"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Conversation
        </button>
      </div>

      <div>
        <h2 className="font-george-serif text-2xl text-george-navy">
          {page ?? 'Ungrouped'}
        </h2>
        <p className="mt-1 text-[13px] text-george-slate">
          Every tile re-runs its tools when this page loads, so these are current
          figures rather than saved ones.
        </p>
      </div>

      {pins.isPending && <p className="text-[13px] text-george-muted">Loading pins…</p>}

      {pins.data?.length === 0 && (
        <p className="text-[13px] text-george-slate">
          This page has no pins. Pin an answer from a conversation to add one.
        </p>
      )}

      {/* One column on a phone — the centre column IS the screen (UI rule 7). */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(pins.data ?? []).map((pin) => (
          <PinTile key={pin.id} pin={pin} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
