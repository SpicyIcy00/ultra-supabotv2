/**
 * The band above the river: what is known about the estate, right now.
 *
 * THIN, AND THEREFORE DANGEROUS. A few words in a strip is the easiest place
 * in the app to state something nobody checked, so every claim here comes from
 * statusBand.ts, where the suite holds it. Three things can be unknown
 * independently — the stores, the freshness, the needs-you count — and each
 * renders its own unknown state rather than a calm default.
 *
 * ONE LINE ON A PHONE, and that is a constraint rather than a preference: the
 * band sits above the newest post, and anything taller pushes what George just
 * said off the first screen (UI rule 7).
 *
 * THE ONLY ACCENT IN THE RIVER IS HERE, on a needs-you count that came back
 * non-zero. No post kind wears it (postShape.ACCENT_KINDS is empty) precisely
 * so this one place keeps meaning something.
 */
import { attentionAccent, attentionLabel } from './approvalState';
import { freshnessView, storesView, type StatusQuery } from './statusState';

export function StatusBand({
  query,
  needsYou,
  onOpenApprovals,
}: {
  query: StatusQuery;
  /** null while unknown — never coalesce to 0. */
  needsYou: number | null;
  onOpenApprovals: () => void;
}) {
  const stores = storesView(query);
  const fresh = freshnessView(query);
  const accent = attentionAccent(needsYou);

  return (
    <div className="flex items-center gap-2.5 border-b border-george-line px-3 py-2 md:px-6">
      {/* One dot per active retail store. Hollow while nothing is known about
          them, because a row of filled quiet dots reads as "all fine". */}
      <div className="flex shrink-0 items-center gap-1" title={stores.label}>
        {stores.stores.map((s) => (
          <span
            key={s.name}
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${
              stores.kind === 'unknown'
                ? 'border border-george-muted/60'
                : s.flagged
                  ? 'bg-george-navy'
                  : 'bg-george-slate/40'
            }`}
          />
        ))}
      </div>

      <span className="truncate text-[11px] text-george-slate">{stores.label}</span>
      <span className="hidden truncate text-[11px] text-george-muted sm:inline">
        · {fresh.label}
      </span>

      <span className="flex-1" />

      <button
        type="button"
        onClick={onOpenApprovals}
        aria-label={attentionLabel(needsYou)}
        className={`flex min-h-touch shrink-0 items-center gap-1 rounded-full px-2 text-[11px] ${
          accent ? 'text-george-accent' : 'text-george-muted'
        }`}
      >
        {accent && (
          <span className="h-1.5 w-1.5 rounded-full bg-george-accent" aria-hidden />
        )}
        {needsYou === null
          ? 'Checking…'
          : needsYou === 0
            ? 'Nothing needs you'
            : `${needsYou} needs you`}
      </button>
    </div>
  );
}
