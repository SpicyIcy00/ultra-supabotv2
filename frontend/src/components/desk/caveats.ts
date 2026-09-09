/**
 * A caveat costs the reader something. How much decides where it goes.
 *
 * THE FAILURE THIS ANSWERS. The primary workspace opened with
 *
 *   "105 of 256 compare row(s) could not be compared... 56 no_baseline... NULL"
 *
 * drawn at full size above the answer. Every word of it is true and none of it
 * is a sentence: it is a diagnostic, in tool vocabulary, competing with the
 * finding for the most prominent place on the screen. A reader learns nothing
 * from `no_baseline` that "these products are new this week" does not tell
 * them better.
 *
 * UI RULE 4 IS UNCHANGED AND IS WHAT MAKES THIS ALLOWED. The rule requires a
 * caveat to be SURFACED, and its 2026-09-05 amendment already draws the line
 * between surfacing and spelling out: a caveat may be reduced to a line that
 * NAMES it, with the explanation one tap away, as long as the reader is told
 * which caveat applies without doing anything. Nothing here drops a notice,
 * and the tool's own sentence survives verbatim in the inspector.
 *
 * THREE LEVELS, BY CONSEQUENCE AND NOT BY KIND (metrics.yaml
 * surface.desk.caveats):
 *
 *   answer_limiting  nothing could be compared. There is no finding for the
 *                    caveat to qualify, only the caveat — so it takes the
 *                    reader's attention, and George offers what he CAN answer.
 *   relevant         some subjects were excluded and the finding stands. Said
 *                    in business words, beside the thing it qualifies.
 *   non_material     everything else. One quiet mark; the detail is in the
 *                    inspector, where the raw statuses belong.
 *
 * NO RAW DIAGNOSTIC EVER REACHES THE ANSWER. `never_in_the_answer` lists the
 * vocabulary — baseline_status, no_baseline, no_current, zero_baseline, NULL,
 * row_count — and a test scans the rendered caveat text for it.
 */
import type { GeorgeNotice, ToolMeta } from '../../types/george';
import { coverageFromComparison, coverageInvalidates, type Coverage } from '../george/instrumentShape';
import { KIND_LABEL } from '../george/noticeLabel';
import { windowLabel } from '../george/resultShape';
import type { Dimension } from './subject';

export type CaveatLevel = 'non_material' | 'relevant' | 'answer_limiting';

export interface Caveat {
  level: CaveatLevel;
  /** The reader's name for it — one or two words, always visible. */
  label: string;
  /**
   * What it COSTS them, in business words. Null for a non-material caveat,
   * which is named and not explained until asked.
   */
  consequence: string | null;
  /** The tool's own sentence, kept whole for the inspector. Never truncated. */
  detail: string;
  source?: string;
  kind: string;
}

/** What a subject of each dimension is called, in the plural, for a reader. */
const NOUN: Record<Dimension, string> = {
  store: 'stores',
  product: 'products',
  category: 'categories',
};

function subjectNoun(dimension: Dimension | null): string {
  return dimension ? NOUN[dimension] : 'subjects';
}

/**
 * "56 products are new this period, so they are left out of the comparison."
 *
 * Built from `meta.comparison.baseline_statuses` — the tool's own counts — and
 * said in the words the reader uses. The statuses themselves never appear:
 * `no_baseline` means the subject did not exist to compare against, which is
 * "new this period", and that is what a person needs to know.
 */
export function excludedWords(meta: ToolMeta, dimension: Dimension | null): string | null {
  const statuses = meta.comparison?.baseline_statuses;
  if (!statuses) return null;
  const noun = subjectNoun(dimension);
  const window = windowLabel(meta)?.toLowerCase();
  const period = window ? `this ${window.replace(/^last /, '').replace(/^this /, '')}` : 'this period';

  const parts: string[] = [];
  const isNew = statuses.no_baseline ?? 0;
  const gone = statuses.no_current ?? 0;
  const fromZero = statuses.zero_baseline ?? 0;
  if (isNew > 0) parts.push(`${isNew.toLocaleString('en-PH')} ${noun} are new ${period}`);
  if (gone > 0) parts.push(`${gone.toLocaleString('en-PH')} sold nothing ${period}`);
  if (fromZero > 0) parts.push(`${fromZero.toLocaleString('en-PH')} sold nothing in the period before`);
  if (parts.length === 0) return null;

  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${list[0].toUpperCase()}${list.slice(1)}, so they are left out of the growth comparison.`;
}

/** The coverage across every compared result on screen, summed. */
export function coverageOf(metas: ToolMeta[]): Coverage | null {
  const parts = metas.map(coverageFromComparison).filter((c): c is Coverage => c !== null);
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

/**
 * Every notice on the work, levelled by what it costs the reader.
 *
 * A comparison notice is read against the coverage the meta carries: nothing
 * comparable makes it answer-limiting, some subjects excluded makes it
 * relevant, and anything else is non-material. A notice the meta says nothing
 * about keeps its own words and is relevant — unknown consequence is not the
 * same as none, and quietening something we cannot read would be guessing.
 */
export function levelCaveats(
  notices: GeorgeNotice[],
  metas: ToolMeta[],
  dimension: Dimension | null,
): Caveat[] {
  const coverage = coverageOf(metas);
  const compared = metas.find((m) => m.comparison?.baseline_statuses);

  return notices.map((notice): Caveat => {
    const label = KIND_LABEL[notice.kind] ?? notice.kind.replace(/_/g, ' ');
    const base = { label, detail: notice.message, source: notice.source, kind: notice.kind };

    if (notice.kind === 'comparison_incomplete') {
      if (coverage && coverageInvalidates(coverage)) {
        return {
          ...base,
          level: 'answer_limiting',
          label: 'Nothing to compare against',
          consequence: `None of these ${subjectNoun(dimension)} has figures for both periods, `
            + `so there is no growth to report. The current period's figures still stand on their own.`,
        };
      }
      const words = compared ? excludedWords(compared, dimension) : null;
      if (words) return { ...base, level: 'relevant', label: 'Some left out', consequence: words };
      return { ...base, level: 'non_material', consequence: null };
    }

    // A ratio nobody could compute is the figure itself failing.
    if (notice.kind === 'ratio_undefined') {
      return { ...base, level: 'answer_limiting', consequence: notice.message };
    }

    // Everything else: the tool's own sentence, at relevant, because we
    // cannot read its consequence and must not decide it is small.
    return { ...base, level: 'relevant', consequence: notice.message };
  });
}

/** The words that must never reach the answer (metrics.yaml never_in_the_answer). */
export const RAW_DIAGNOSTIC = /\b(baseline_status|no_baseline|no_current|zero_baseline|row_count|NULL)\b/;

/** Whether a string is safe to draw in the primary answer. */
export function isReaderSafe(text: string): boolean {
  return !RAW_DIAGNOSTIC.test(text);
}
