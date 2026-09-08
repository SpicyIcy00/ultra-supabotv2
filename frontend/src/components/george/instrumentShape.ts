/**
 * The decisions behind the three V2 instruments, held apart from their drawing.
 *
 * Same reason pinShape.ts is separate from ResultBlocks.tsx: these are rules
 * the suite can hold without a DOM, and a component file that also exports
 * helpers breaks fast refresh. Every function here reads rows and meta the
 * tools supplied and computes LAYOUT — where a zero line sits, how long a bar
 * is relative to its neighbours, which segment of a strip is which. None of
 * them computes a business figure: a bar's length is a ratio of two changes
 * the tool already returned, which is geometry, not a metric.
 *
 * THE THREE INSTRUMENTS, AND THE QUESTION EACH ANSWERS.
 *
 *   Delta Ranking   "Where is the change concentrated?"  — bars diverging from
 *                   a zero line, ordered exactly as the tool ranked them, long
 *                   in proportion to `change` IN THE METRIC'S UNIT. Never
 *                   `change_pct`: a tiny baseline makes a percentage enormous,
 *                   which is why the tool itself ranks in unit
 *                   (metrics.yaml comparisons.previous_period.rank_by).
 *   Driver Split    "Which driver moved more?" — the declared drivers of a
 *                   metric, each with its own change_pct, on ONE shared
 *                   percentage axis. Never stacked and never summed:
 *                   `attribution_math: not_supported`, and a stacked bar is
 *                   attribution drawn instead of written.
 *   Coverage Strip  "How much of this was actually measured?" — a segmented
 *                   bar of counts by state, the measured solid, the unmeasured
 *                   hatched and NAMED. Never a gauge: it has no denominator
 *                   but the row count, and it says so by naming every segment.
 */
import type { ToolMeta } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import type { ComparisonRow, Shape } from './pinShape';
import type { ShapedResult } from './resultShape';

/* ------------------------------------------------------------ ranking -- */

export interface RankedBar {
  row: ComparisonRow;
  /** 0..1, |change| against the largest |change| in the list. */
  extent: number;
  negative: boolean;
}

export interface RankingLayout {
  /** Where the zero line sits across the track, 0..1 from the left. */
  zero: number;
  bars: RankedBar[];
}

/**
 * Geometry for a ranked list of changes.
 *
 * The zero line sits where the negative and positive extents meet, so a list
 * of drops puts zero at the right edge and grows left, a list of gains puts it
 * at the left and grows right, and a mixed list splits the track. Extent is
 * against the largest |change| so the longest bar always fills its side.
 *
 * ORDER IS THE TOOL'S. Nothing here sorts. The tool ranked by change after
 * matching both windows per subject, and a re-sort by percentage here would
 * be exactly the ranking it refused to make.
 */
export function rankingLayout(rows: ComparisonRow[]): RankingLayout {
  const changes = rows.map((r) => (typeof r.change === 'number' ? r.change : 0));
  const negMax = Math.max(0, ...changes.filter((c) => c < 0).map((c) => -c));
  const posMax = Math.max(0, ...changes.filter((c) => c > 0));
  const span = negMax + posMax;
  const zero = span === 0 ? 0 : negMax / span;
  const scale = Math.max(negMax, posMax);
  return {
    zero,
    bars: rows.map((row, i) => ({
      row,
      extent: scale === 0 ? 0 : Math.abs(changes[i]) / scale,
      negative: changes[i] < 0,
    })),
  };
}

/** How a ranking names itself: the mode the tool applied, in words. */
export function rankingCaption(shape: Extract<Shape, { kind: 'ranking' }>): string {
  const what = shape.mode === 'biggest_drop' ? 'Biggest falls' : 'Biggest rises';
  const unit = shape.unit === 'PHP' ? '₱' : shape.unit;
  return unit ? `${what} · ranked by change in ${unit}` : `${what} · ranked by change`;
}

/* ------------------------------------------------------- driver split -- */

export interface DriverBar {
  label: string;
  row: ComparisonRow;
  /** 0..1, |change_pct| against the largest |change_pct| among the drivers. */
  extent: number;
  negative: boolean;
}

export interface DriverSplitLayout {
  zero: number;
  bars: DriverBar[];
}

/**
 * Whether a set of results is drawable as a driver split.
 *
 * Every member must be a single compared figure with a numeric change_pct
 * and a label to stand under. A driver whose comparison the tool could not
 * make (no baseline, a zero baseline) has no bar to draw, and drawing the
 * others as though the split were whole would be the caveat dropped for want
 * of room — the failure UI rule 4 names. The caller then draws the group as
 * the figures it is, each carrying its own words for the missing delta.
 */
export function driverSplitMembers(members: ShapedResult[]): ShapedResult[] | null {
  if (members.length < 2) return null;
  for (const m of members) {
    if (m.shape.kind !== 'comparison' || m.shape.rows.length !== 1) return null;
    if (typeof m.shape.rows[0].changePct !== 'number') return null;
    if (!m.shape.label) return null;
  }
  return members;
}

export function driverSplitLayout(members: ShapedResult[]): DriverSplitLayout {
  const rows = members.map((m) => (m.shape.kind === 'comparison' ? m.shape.rows[0] : null));
  const pcts = rows.map((r) => (r && typeof r.changePct === 'number' ? r.changePct : 0));
  const negMax = Math.max(0, ...pcts.filter((p) => p < 0).map((p) => -p));
  const posMax = Math.max(0, ...pcts.filter((p) => p > 0));
  const span = negMax + posMax;
  const scale = Math.max(negMax, posMax);
  return {
    zero: span === 0 ? 0 : negMax / span,
    bars: members.map((m, i) => ({
      label: m.shape.kind === 'comparison' ? (m.shape.label ?? '') : '',
      row: rows[i]!,
      extent: scale === 0 ? 0 : Math.abs(pcts[i]) / scale,
      negative: pcts[i] < 0,
    })),
  };
}

/* ----------------------------------------------------------- coverage -- */

export interface CoverageSegment {
  key: string;
  /** The reader's word for the state. */
  label: string;
  count: number;
  /** Solid when measured; hatched, and named, when not. */
  measured: boolean;
}

export interface Coverage {
  segments: CoverageSegment[];
  total: number;
  /** How many of the total are measured. Counts, never a percentage of health. */
  measured: number;
}

/** The tool's baseline statuses, in the reader's words. */
export const BASELINE_STATUS_LABEL: Record<string, string> = {
  ok: 'compared',
  no_baseline: 'nothing in the earlier period',
  zero_baseline: 'earlier period was zero',
  no_current: 'nothing this period',
};

/**
 * Coverage of a comparison, from `meta.comparison.baseline_statuses`.
 *
 * Null when every subject compared, or when the tool recorded no statuses:
 * a strip that says "all measured" is a strip that says nothing, and a strip
 * with no counts behind it would be the app inventing a partition.
 */
export function coverageFromComparison(meta: ToolMeta | undefined): Coverage | null {
  const statuses = meta?.comparison?.baseline_statuses;
  if (!statuses) return null;
  const keys = Object.keys(statuses).filter((k) => (statuses[k] ?? 0) > 0);
  if (keys.length === 0 || keys.every((k) => k === 'ok')) return null;
  // `ok` first, then the tool's order for the rest.
  const ordered = ['ok', ...keys.filter((k) => k !== 'ok')].filter((k) => keys.includes(k));
  const segments = ordered.map((k) => ({
    key: k,
    label: BASELINE_STATUS_LABEL[k] ?? k.replace(/_/g, ' '),
    count: statuses[k] ?? 0,
    measured: k === 'ok',
  }));
  const total = segments.reduce((n, s) => n + s.count, 0);
  return { segments, total, measured: statuses.ok ?? 0 };
}

/**
 * Coverage of a pin's replay: what came back, what came back empty, what did
 * not come back at all. The runner's own words for the missing states are the
 * segment labels (pinShape.missingLabel), so a refusal is not drawn as a fault.
 */
export function coverageFromReplay(results: PinCallResult[]): Coverage | null {
  if (results.length === 0) return null;
  const drawn = results.filter((r) => r.status === 'ok' && (r.rows ?? []).length > 0).length;
  const empty = results.filter((r) => r.status === 'ok' && (r.rows ?? []).length === 0).length;
  const missing = results.length - drawn - empty;
  if (missing === 0 && empty === 0) return null;
  const segments: CoverageSegment[] = [];
  if (drawn) segments.push({ key: 'drawn', label: 'came back', count: drawn, measured: true });
  if (empty) segments.push({ key: 'empty', label: 'came back empty', count: empty, measured: true });
  if (missing) segments.push({ key: 'missing', label: 'did not come back', count: missing, measured: false });
  return { segments, total: results.length, measured: drawn + empty };
}
