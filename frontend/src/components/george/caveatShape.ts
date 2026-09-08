/**
 * How a caveat is presented: whole, or as the data state it describes.
 *
 * THE FAILURE THIS ANSWERS. An investigation opened with a notice box listing
 * dozens of products and their comparison states before the finding. Every
 * word was true; the attention hierarchy was upside down — the caveat was
 * shouting about the 38 subjects it could not compare while the reader wanted
 * the 78 it could.
 *
 * WHAT CHANGES AND WHAT DOES NOT. The caveat is still surfaced, still ABOVE
 * the figure it qualifies, still never collapsible: UI rule 4's amendment
 * draws the line between SURFACING a caveat and SPELLING IT OUT, and this is
 * that line applied to a comparison. A notice whose substance is a structured
 * data state the meta already carries — comparison_incomplete against
 * baseline_statuses — is presented as that state: "78 / 116 comparable · 38
 * excluded", the coverage strip, and the tool's full sentence one tap down.
 * A notice with no such state, or one that INVALIDATES the figure, stays the
 * whole banner.
 *
 * SEVERITY IS DETERMINISTIC. Invalidating means nothing compared at all
 * (coverageInvalidates): then there is no finding for the caveat to sit
 * beside, only the caveat. No threshold below that is chosen here, because a
 * threshold for "too many excluded" is a business definition nobody has set,
 * and choosing one would be arithmetic in the presentation layer. The model
 * decides nothing about severity — it has no channel to.
 */
import type { GeorgeNotice } from '../../types/george';
import type { ResultSource } from './resultShape';
import { coverageFromComparison, coverageInvalidates, type Coverage } from './instrumentShape';

/** Notice kinds whose substance is a data state the meta carries. */
const STATE_BACKED: Record<string, 'comparison'> = {
  comparison_incomplete: 'comparison',
};

export type CaveatPlan =
  | { kind: 'banner'; notice: GeorgeNotice }
  | { kind: 'coverage'; notice: GeorgeNotice; coverage: Coverage };

/**
 * A plan per notice: which are drawn whole, which as their data state.
 *
 * The coverage used is the one on the unit's compared results, summed when
 * several results carry one — a breakdown over products and a breakdown over
 * categories each excluded some subjects, and one line should say so for the
 * whole unit. If no compared result carries statuses, the notice cannot be
 * presented as a state and stays a banner.
 */
export function caveatPlans(notices: GeorgeNotice[], sources: ResultSource[]): CaveatPlan[] {
  const coverage = unitCoverage(sources);
  return notices.map((notice) => {
    if (STATE_BACKED[notice.kind] && coverage && !coverageInvalidates(coverage)) {
      return { kind: 'coverage', notice, coverage };
    }
    return { kind: 'banner', notice };
  });
}

/** The unit's compared coverage, summed across its compared results. */
export function unitCoverage(sources: ResultSource[]): Coverage | null {
  const parts = sources.map((s) => coverageFromComparison(s.meta)).filter((c): c is Coverage => c !== null);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const byKey = new Map<string, Coverage['segments'][number]>();
  for (const c of parts) {
    for (const seg of c.segments) {
      const cur = byKey.get(seg.key);
      byKey.set(seg.key, cur ? { ...cur, count: cur.count + seg.count } : { ...seg });
    }
  }
  const segments = [...byKey.values()];
  const total = segments.reduce((n, s) => n + s.count, 0);
  const measured = segments.filter((s) => s.measured).reduce((n, s) => n + s.count, 0);
  return { segments, total, measured };
}
