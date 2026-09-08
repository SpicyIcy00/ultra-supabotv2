/**
 * The decisions behind the instruments, held apart from their drawing.
 *
 * Same reason pinShape.ts is separate from ResultBlocks.tsx: these are rules
 * the suite can hold without a DOM, and a component file that also exports
 * helpers breaks fast refresh. Every function here reads rows and meta the
 * tools supplied and computes LAYOUT — where a zero line sits, how long a bar
 * is relative to its neighbours, which segment of a strip is which, which row
 * the eye should land on. None of them computes a business figure: a bar's
 * length is a ratio of two numbers the tool already returned, which is
 * geometry, not a metric.
 *
 * THE INSTRUMENTS, AND THE QUESTION EACH ANSWERS.
 *
 *   Subject Comparison   "How do these compare?" — one row per subject:
 *                        a LEVEL bar (length ∝ value) so the eye sees who is
 *                        biggest, the value, and the delta the tool supplied.
 *                        Ordered as the tool returned them. This is a level
 *                        ranking and says so; it never claims a change ranking.
 *   Delta Ranking        "Where is the change concentrated?" — the same row
 *                        form with bars diverging from a zero line, long in
 *                        proportion to `change` IN THE UNIT, in the order the
 *                        tool ranked. Never change_pct: a tiny baseline makes
 *                        a percentage enormous, which is why the tool ranks in
 *                        unit (metrics.yaml comparisons.previous_period.rank_by).
 *   Performance          "How did it do?" — the declared headline metrics for
 *                        ONE subject and ONE scope (metrics.yaml
 *                        metric_sets.sales_headline), each with its delta on a
 *                        shared percentage axis, so traffic-led and basket-led
 *                        are visible without a share being computed.
 *   Driver Split         "Which driver moved more?" — the same, restricted to
 *                        the drivers the definitions declare. Never stacked,
 *                        never summed: attribution_math: not_supported.
 *   Coverage             "How much was measured?" — counts by state, measured
 *                        solid, unmeasured hatched and named. Never a gauge.
 *
 * SALIENCE IS DETERMINISTIC OR ABSENT. A row is marked as the exception only
 * when the data itself establishes it: it moved against the direction the
 * majority moved in. No score, no threshold anybody invented; a mixed list
 * with no majority marks nothing.
 */
import type { ToolMeta } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import type { ComparisonRow, Shape } from './pinShape';
import type { ShapedResult } from './resultShape';

/* -------------------------------------------------------- diverging bars -- */

export interface DivergingLayout {
  /** Where the zero line sits across the track, 0..1 from the left. */
  zero: number;
  extents: { extent: number; negative: boolean }[];
}

/**
 * Geometry for bars that diverge from zero.
 *
 * The zero line sits where the negative and positive extents meet, so a list
 * of falls puts zero at the right edge and grows left, a list of rises puts it
 * at the left and grows right, and a mixed list splits the track. Extent is
 * against the largest |value| so the longest bar always fills its side.
 */
export function divergingLayout(values: (number | null | undefined)[]): DivergingLayout {
  const vs = values.map((v) => (typeof v === 'number' ? v : 0));
  const negMax = Math.max(0, ...vs.filter((v) => v < 0).map((v) => -v));
  const posMax = Math.max(0, ...vs.filter((v) => v > 0));
  const span = negMax + posMax;
  const scale = Math.max(negMax, posMax);
  return {
    zero: span === 0 ? 0 : negMax / span,
    extents: vs.map((v) => ({ extent: scale === 0 ? 0 : Math.abs(v) / scale, negative: v < 0 })),
  };
}

/* ------------------------------------------------------------ ranking -- */

export interface RankedBar {
  row: ComparisonRow;
  /** 0..1, |change| against the largest |change| in the list. */
  extent: number;
  negative: boolean;
  /** The data establishes this row as the one to look at. */
  exception: boolean;
}

export interface RankingLayout {
  zero: number;
  bars: RankedBar[];
}

/**
 * Geometry for a ranked list of changes. ORDER IS THE TOOL'S: nothing here
 * sorts, and a re-sort by percentage would be exactly the ranking the tool
 * refused to make. The first bar is the exception by definition of the mode
 * — the biggest fall in a list of falls — and is marked so.
 */
export function rankingLayout(rows: ComparisonRow[]): RankingLayout {
  const d = divergingLayout(rows.map((r) => r.change));
  return {
    zero: d.zero,
    bars: rows.map((row, i) => ({ row, ...d.extents[i], exception: i === 0 && rows.length > 1 })),
  };
}

/** How a ranking names itself: the mode the tool applied, in words. */
export function rankingCaption(shape: Extract<Shape, { kind: 'ranking' }>): string {
  const what = shape.mode === 'biggest_drop' ? 'Biggest falls' : 'Biggest rises';
  const unit = shape.unit === 'PHP' ? '₱' : shape.unit;
  return unit ? `${what} · ranked by change in ${unit}` : `${what} · ranked by change`;
}

/* ------------------------------------------------- subject comparison -- */

export interface LevelBar {
  row: ComparisonRow;
  /** 0..1, value against the largest value in the list. */
  level: number;
  /** 0..1 within the delta track, sign separately; null when no delta. */
  delta: { extent: number; negative: boolean } | null;
  exception: boolean;
}

export interface LevelLayout {
  bars: LevelBar[];
  /** Zero line for the delta track. */
  deltaZero: number;
  /** Whether the list is ordered by value (top_n) or as the tool returned it. */
  orderedByValue: boolean;
}

/**
 * Whether the majority moved one way, and which. Null when there is no
 * majority — then nothing is an exception, because nothing established one.
 */
export function majorityDirection(rows: ComparisonRow[]): 'up' | 'down' | null {
  const up = rows.filter((r) => r.direction === 'up').length;
  const down = rows.filter((r) => r.direction === 'down').length;
  if (up === down) return null;
  const major = up > down ? up : down;
  return major * 2 > rows.length ? (up > down ? 'up' : 'down') : null;
}

/**
 * Geometry for subjects compared by LEVEL.
 *
 * The level bar is the value against the largest value, so the eye sees who
 * is biggest. The delta is drawn on its own small diverging track beside the
 * printed percentage. The exception is the row that moved against the
 * majority: seven stores up and two with a fall marks the two.
 */
export function levelLayout(rows: ComparisonRow[], meta?: ToolMeta): LevelLayout {
  const values = rows.map((r) => (typeof r.value === 'number' ? r.value : 0));
  const max = Math.max(0, ...values.map(Math.abs));
  const d = divergingLayout(rows.map((r) => r.changePct));
  const majority = majorityDirection(rows);
  return {
    // top_n ranks the current period in SQL (metrics.yaml ranking); the tool
    // says so on the meta, and only then may the caption say "largest first".
    orderedByValue: Boolean(meta?.comparison?.ranked_by_current) || typeof meta?.top_n === 'number',
    deltaZero: d.zero,
    bars: rows.map((row, i) => ({
      row,
      level: max === 0 ? 0 : Math.abs(values[i]) / max,
      delta: typeof row.changePct === 'number' ? d.extents[i] : null,
      exception: majority !== null && row.direction !== null && row.direction !== majority && row.direction !== 'flat',
    })),
  };
}

/** How a level comparison names its order. Never "ranked by change". */
export function levelCaption(layout: LevelLayout, label?: string): string {
  const order = layout.orderedByValue ? 'largest first' : "in the tool's order";
  return label ? `${label} · ${order}` : order;
}

/* --------------------------------------------------------- performance -- */

export interface PerformanceBar {
  label: string;
  row: ComparisonRow;
  extent: number;
  negative: boolean;
  /** The metric the definitions call the headline of the set. */
  headline: boolean;
}

export interface PerformanceLayout {
  zero: number;
  bars: PerformanceBar[];
}

/**
 * Whether a set of results is one subject's performance.
 *
 * Every member must be a single compared figure with a numeric change_pct and
 * a label. They already share a scope — resultShape grouped them by scopeKey,
 * and the caller passes a group — so what this adds is that each is one
 * metric, so the set reads as "how did it do" rather than "what did it do".
 * A member whose comparison the tool could not make refuses the instrument;
 * the group then draws as the figures it is, each with its own words for the
 * missing delta (UI rule 4 — a caveat dropped for want of room).
 */
export function performanceMembers(members: ShapedResult[]): ShapedResult[] | null {
  if (members.length < 2) return null;
  for (const m of members) {
    if (m.shape.kind !== 'comparison' || m.shape.rows.length !== 1) return null;
    if (typeof m.shape.rows[0].changePct !== 'number') return null;
    if (!m.shape.label) return null;
  }
  return members;
}

/** The drivers, in the definitions' sense, are a performance set too. */
export const driverSplitMembers = performanceMembers;

export function performanceLayout(members: ShapedResult[]): PerformanceLayout {
  const rows = members.map((m) => (m.shape.kind === 'comparison' ? m.shape.rows[0] : null));
  const d = divergingLayout(rows.map((r) => r?.changePct));
  return {
    zero: d.zero,
    bars: members.map((m, i) => ({
      label: m.shape.kind === 'comparison' ? (m.shape.label ?? '') : '',
      row: rows[i]!,
      ...d.extents[i],
      headline: i === 0,
    })),
  };
}

export const driverSplitLayout = performanceLayout;

/* ----------------------------------------------------------- coverage -- */

export interface CoverageSegment {
  key: string;
  label: string;
  count: number;
  measured: boolean;
}

export interface Coverage {
  segments: CoverageSegment[];
  total: number;
  measured: number;
}

export const BASELINE_STATUS_LABEL: Record<string, string> = {
  ok: 'compared',
  no_baseline: 'new this period',
  zero_baseline: 'earlier period was zero',
  no_current: 'nothing this period',
};

export function coverageFromComparison(meta: ToolMeta | undefined): Coverage | null {
  const statuses = meta?.comparison?.baseline_statuses;
  if (!statuses) return null;
  const keys = Object.keys(statuses).filter((k) => (statuses[k] ?? 0) > 0);
  if (keys.length === 0 || keys.every((k) => k === 'ok')) return null;
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

/**
 * The compact line a coverage reads as: "78 / 116 comparable · 38 excluded".
 * Counts reconcile to the segments by construction.
 */
export function coverageLine(c: Coverage): string {
  const excluded = c.total - c.measured;
  return `${c.measured} / ${c.total} comparable · ${excluded} excluded`;
}

/**
 * Whether incomplete coverage INVALIDATES what is shown, deterministically.
 *
 * Nothing compared at all: there is no finding to caveat, only a caveat.
 * That escalates to the full notice above the figure. Anything short of that
 * is a compact state beside the figure with the full text one tap down — the
 * caveat is still surfaced, still above the number it qualifies, and still
 * uncollapsible; what moved is its LENGTH, not its presence.
 */
export function coverageInvalidates(c: Coverage | null): boolean {
  return c !== null && c.measured === 0;
}
