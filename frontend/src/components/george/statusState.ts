/**
 * What the band above the river may claim, as a decision the suite can hold.
 *
 * Named statusState.ts rather than statusBand.ts because StatusBand.tsx is the
 * component beside it, and on a case-insensitive filesystem those are one file.
 *
 * Same pattern as approvalState.ts and postShape.ts, and here for the same
 * reason: this band makes assertions about the world in very little space, and
 * a compact assertion is the easiest place to state something nobody checked.
 *
 * UI RULE 8 IS THE WHOLE FILE. Three separate things can be unknown
 * independently — the stores, the freshness, the needs-you count — and each
 * has to say so rather than borrowing a calm default:
 *
 *   stores      unknown until a brief has been posted today. A row of quiet
 *               dots with nothing behind it reads as "all fine", which is a
 *               claim about seven shops nobody has looked at.
 *   sources     unknown until at least one post carries receipts.
 *   needs you   unknown while the approvals query is in flight or failed —
 *               `null`, never 0. approvalState already draws that line and
 *               this reuses it rather than drawing a second one.
 *
 * A FLAGGED STORE IS NOT AN UNHEALTHY ONE. It means the brief had something to
 * say about it this morning. The band says "3 flagged", never "3 problems" —
 * George reporting a 41% drop and George reporting a 41% rise both flag.
 */

/** One store, as the band draws it. Mirrors StoreHealth in routes/george.py. */
export interface StoreHealth {
  name: string;
  flagged: boolean;
}

export interface SourceFreshness {
  table: string;
  read_at: string;
}

export interface StatusBandData {
  stores: StoreHealth[];
  stores_known: boolean;
  sources: SourceFreshness[];
  as_of: string;
}

export type StatusQuery =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; data: StatusBandData };

export interface StoresView {
  /** 'unknown' is a rendering, not an absence — see the file header. */
  kind: 'unknown' | 'known';
  stores: StoreHealth[];
  flagged: number;
  /** What the band says about the stores, in words, for a screen reader. */
  label: string;
}

export interface FreshnessView {
  kind: 'unknown' | 'known';
  /** The OLDEST source, because a band showing one age is showing the best case. */
  oldest: SourceFreshness | null;
  sources: SourceFreshness[];
  label: string;
}

export function storesView(query: StatusQuery): StoresView {
  if (query.status !== 'success') {
    return { kind: 'unknown', stores: [], flagged: 0, label: 'Checking the stores…' };
  }
  const { stores, stores_known } = query.data;
  if (!stores_known) {
    // The list is known; what is NOT known is anything about them. Drawing
    // them as unflagged would say seven shops are fine on no evidence.
    return {
      kind: 'unknown',
      stores,
      flagged: 0,
      label: `${stores.length} stores · no brief yet today`,
    };
  }
  const flagged = stores.filter((s) => s.flagged).length;
  return {
    kind: 'known',
    stores,
    flagged,
    label:
      flagged === 0
        ? `${stores.length} stores · nothing flagged`
        : `${stores.length} stores · ${flagged} flagged`,
  };
}

/**
 * Freshness, reported from the OLDEST source rather than the newest.
 *
 * A band that shows one timestamp is showing a single number for data of
 * several ages, and the newest is the flattering one. The oldest is the honest
 * one: it is the age at which every figure on screen is at least as fresh.
 * Same reason the greeting uses the ITEM's receipts and not the brief's.
 */
export function freshnessView(query: StatusQuery): FreshnessView {
  if (query.status !== 'success') {
    return { kind: 'unknown', oldest: null, sources: [], label: 'Checking freshness…' };
  }
  const sources = query.data.sources ?? [];
  if (sources.length === 0) {
    return { kind: 'unknown', oldest: null, sources: [], label: 'Nothing read yet' };
  }
  const oldest = sources.reduce((a, b) => (b.read_at < a.read_at ? b : a));
  return { kind: 'known', oldest, sources, label: `oldest read ${ago(oldest.read_at)}` };
}

/** "4m ago". Shared with the tiles' own wording so the two never disagree. */
export function ago(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'at an unknown time';
  // FLOOR, not round. "5m ago" has to mean at least five minutes have passed;
  // rounding turned 30 seconds into "1m ago", which is a small lie of exactly
  // the kind this app spends its time not telling.
  const mins = Math.max(0, Math.floor((Date.now() - then) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
