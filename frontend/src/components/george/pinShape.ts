/**
 * How a result gets drawn, and the formatting the renderers share.
 *
 * Separate from the components so the rules are readable on their own — and
 * because a component file that also exports helpers breaks fast refresh.
 *
 * DETECTION IS DETERMINISTIC AND LIVES HERE. The same function decides the
 * shape of a pinned tile and of a figure in an answer, so the two cannot
 * diverge; if they could, a number would look like one thing in chat and
 * another on a page, which is the failure the whole receipts contract exists to
 * prevent. Nothing about the shape comes from the model's prose.
 */
import type { ToolCall } from '../../types/george';
import type { PinCallResult, PinStatus } from '../../types/pins';

/** Row keys that mean "this axis is time", in the order the tools emit them. */
export const TIME_KEYS = ['day', 'week', 'month', 'bucket', 'date', 'snapshot_date'];

/**
 * Rows a comparison needs before it is drawn rather than listed.
 *
 * Two bars read worse than two numbers: the eye compares two lengths no better
 * than it compares two figures, and the chart costs a legend, an axis and a
 * scale to say what "₱13,544 against ₱11,002" already said. Three is where a
 * shape — an outlier, a run, a slope — starts to exist at all.
 */
export const MIN_CHART_ROWS = 3;

/**
 * How many points before a bar chart becomes a line.
 *
 * Bars stop being readable once they are thinner than their gaps; past that a
 * line carries the trend and the individual values stop being the point.
 */
export const LINE_OVER_BAR_ROWS = 12;

/** What the model is allowed to say about drawing. It may narrow, never widen. */
export type RenderHint = 'none' | 'line' | 'bar' | undefined;

export type Mark = 'line' | 'bar';

/**
 * One row of a comparison, exactly as the tool supplied it.
 *
 * `change` and `changePct` are READ OFF THE ROW. Nothing here is computed:
 * a period-over-period delta needs a baseline, and which baseline is a
 * DEFINITION — metrics.yaml settled that deliberately for the brief, rejecting
 * `previous_day` in favour of `same_weekday_last_week` after measuring how
 * badly the first one fires. A renderer picking its own baseline would be
 * inventing a business rule in the presentation layer.
 */
export interface ComparisonRow {
  subject: string;
  /** Null when the tool said no_current: the subject had no figure this period. */
  value: number | null;
  baseline?: number;
  change?: number;
  /**
   * Null when the tool could not compute one — no baseline, a zero baseline,
   * or no current figure — and `baselineStatus` says which. Never computed
   * here from value and baseline; a null delta is drawn as the words for it.
   */
  changePct: number | null;
  /** `flat` is the tool's word for a change of exactly zero. Null with a null delta. */
  direction: 'up' | 'down' | 'flat' | null;
  /** get_sales compare_to: ok | no_baseline | zero_baseline | no_current. */
  baselineStatus?: string;
  unit?: string;
  row: Record<string, unknown>;
}

/** What a change ranking could not rank, as the tool counted and named it. */
export interface NotRanked {
  counts: Record<string, number>;
  noCurrent: { subject: string; baseline: number | null; unit?: string }[];
  noBaseline: { subject: string; value: number | null; unit?: string }[];
  rankedSubjects: number;
}

export type Shape =
  | { kind: 'number'; value: number; unit?: string; label?: string }
  | {
      /**
       * A comparison the TOOL RANKED BY CHANGE (get_sales rank_by =
       * biggest_drop | biggest_gain). Rows are in the tool's order, every one
       * with a numeric `change`; what could not be ranked is in `notRanked`.
       * Drawn as a Delta Ranking. A `rank_by` of 'value' or none is a plain
       * comparison: its order is by current value, and drawing it as movers
       * would lie about the ordering.
       */
      kind: 'ranking';
      rows: ComparisonRow[];
      mode: 'biggest_drop' | 'biggest_gain';
      label?: string;
      unit?: string;
      notRanked?: NotRanked;
    }
  | {
      kind: 'comparison';
      rows: ComparisonRow[];
      /** The metric's name from meta, for a figure whose rows have no subject. */
      label?: string;
    }
  | { kind: 'chart'; x: string; mark: Mark; rows: Record<string, unknown>[] }
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[] };

/**
 * Every row carries a numeric `value` under the same key set.
 *
 * THE BRIEF IS WHY THIS EXISTS. get_brief returns one array holding three
 * different sections — sales_vs_same_weekday rows have `value`, stock_crossed_out
 * rows have `was`/`now`, newly_dead rows have `quantity_on_hand` — so reading
 * `rows[0]` and assuming the rest match produces a bar chart whose later bars
 * are undefined. A heterogeneous result is a list of different facts, and a
 * chart asserts they are one series.
 */
function isHomogeneousSeries(rows: Record<string, unknown>[]): boolean {
  const shape = Object.keys(rows[0]).sort().join('|');
  return rows.every(
    (r) => typeof r.value === 'number' && Object.keys(r).sort().join('|') === shape,
  );
}

/**
 * A comparison the TOOL declared, or nothing.
 *
 * Every row must carry a numeric `value` AND a numeric `change_pct`. That is
 * the tool saying "this figure moved by this much against a baseline I chose";
 * the renderer's whole job is to show what it was handed. If one row lacks the
 * delta the result is not a comparison — it is a list of different facts, and
 * get_brief returns exactly that when several of its sections fire at once.
 * Those fall through to a table, unchanged from before this existed.
 *
 * WHY IT IS HERE AND NOT IN THE COMPOSITION LAYER. One selection function
 * serves the answer, the stored post and the pinned tile (see inferShape), so
 * a comparison that only chat knew about would be a figure that looked like
 * one thing in a thread and another on a page — the divergence the receipts
 * contract exists to prevent.
 */
function comparisonRows(rows: Record<string, unknown>[]): ComparisonRow[] | null {
  const out: ComparisonRow[] = [];
  for (const r of rows) {
    // A row is compared when the tool computed a delta, OR when it declared
    // in `baseline_status` that it tried and could not (get_sales
    // compare_to). A row with neither is a plain figure, and one such row
    // makes the whole result something other than a comparison.
    const declared = typeof r.baseline_status === 'string';
    const pct = typeof r.change_pct === 'number' ? r.change_pct : null;
    if (pct === null && !declared) return null;
    const value = typeof r.value === 'number' ? r.value : r.value === null && declared ? null : undefined;
    if (value === undefined) return null;
    const subject = SUBJECT_KEYS.map((k) => r[k]).find((v) => typeof v === 'string' && v);
    out.push({
      subject: (subject as string) ?? '',
      value,
      baseline: typeof r.baseline === 'number' ? r.baseline : undefined,
      change: typeof r.change === 'number' ? r.change : undefined,
      changePct: pct,
      // The tool's own word for it where there is one. Otherwise the SIGN of
      // the delta it supplied, which is a reading of the number rather than a
      // second calculation of it — and nothing at all when there is no delta.
      direction:
        r.direction === 'up' || r.direction === 'down' || r.direction === 'flat'
          ? r.direction
          : pct === null ? null : pct >= 0 ? 'up' : 'down',
      baselineStatus: declared ? (r.baseline_status as string) : undefined,
      unit: typeof r.unit === 'string' ? r.unit : undefined,
      row: r,
    });
  }
  return out.length > 0 ? out : null;
}

/** Where a comparison row's label comes from, in the order tools emit it. */
const SUBJECT_KEYS = ['subject', 'store', 'product', 'category', 'name', 'label'];

/**
 * The categorical key rows are compared BY — store, product, category.
 *
 * Must be present and a string on every row, and must actually vary: eight rows
 * all labelled "Rockwell" are eight measures of one thing, not a comparison.
 * `_id` columns are skipped because the readable label sits beside them.
 */
function categoricalKey(rows: Record<string, unknown>[]): string | undefined {
  const skip = new Set(['value', 'unit', 'measure', 'section', 'direction']);
  return Object.keys(rows[0]).find((k) => {
    if (skip.has(k) || k.endsWith('_id')) return false;
    if (!rows.every((r) => typeof r[k] === 'string')) return false;
    return new Set(rows.map((r) => r[k])).size === rows.length;
  });
}

/**
 * Infer how to draw a result.
 *
 * Deliberately conservative, and it never invents a series: anything it is not
 * sure about falls through to a table. A wrong chart is more misleading than a
 * boring table, because a chart asserts a shape the data may not have — and
 * these renderers exist to be trustworthy about numbers, not clever with them.
 *
 * @param hint what the model asked for. It can only NARROW: suppress a chart
 *   ('none'), or choose between marks that are already valid for this data. It
 *   can never conjure a chart from data this function would not chart anyway,
 *   so a model that says "bar" about a single row still gets a number.
 * @param rowsComplete whether these are ALL the rows. A chart drawn from a
 *   prefix is a different chart, not a smaller one — see MAX_ROWS_TO_CLIENT in
 *   agent/loop.py. Defaults true because a pin run carries its whole result.
 */
export function inferShape(
  result: PinCallResult,
  hint?: RenderHint,
  rowsComplete = true,
): Shape | null {
  const rows = result.rows ?? [];
  if (rows.length === 0) return null;

  const keys = Object.keys(rows[0]);
  const timeKey = TIME_KEYS.find((k) => keys.includes(k));
  const hasValue = keys.includes('value') && typeof rows[0].value === 'number';

  // FIRST, because a declared delta is the most specific thing a result can
  // be. A single row carrying one is a comparison and not a bare figure, and a
  // series carrying one is a comparison and not a bar chart — drawing either
  // without the baseline would throw away the part the tool went to the
  // trouble of computing.
  const comparison = comparisonRows(rows);
  if (comparison) {
    // The metric's name from meta, so three compared totals abreast — net
    // sales, transactions, ATP — can each say which they are. From meta,
    // never from prose; absent on results from an older backend.
    const label =
      typeof result.meta?.metric_label === 'string' ? result.meta.metric_label : undefined;
    // A ranking, when and only when the tool ranked by change. Two or more
    // rows, every one with the numeric change the tool ranked on; a single
    // row is a figure with its delta, not a ranking of one.
    const mode = result.meta?.comparison?.rank_by;
    if (
      (mode === 'biggest_drop' || mode === 'biggest_gain') &&
      comparison.length >= 2 &&
      comparison.every((r) => typeof r.change === 'number')
    ) {
      const nr = result.meta?.comparison?.not_ranked;
      return {
        kind: 'ranking',
        rows: comparison,
        mode,
        label,
        unit: comparison[0].unit ?? result.meta?.metric_unit,
        notRanked: nr
          ? {
              counts: nr.counts ?? {},
              noCurrent: nr.no_current ?? [],
              noBaseline: nr.no_baseline ?? [],
              rankedSubjects: nr.ranked_subjects ?? comparison.length,
            }
          : undefined,
      };
    }
    return { kind: 'comparison', rows: comparison, label };
  }

  // One row, one figure — the commonest pin, and the one worth making large.
  if (rows.length === 1 && hasValue) {
    const only = rows[0];
    const label = keys.find(
      (k) => k !== 'value' && k !== 'measure' && k !== 'unit' && typeof only[k] === 'string',
    );
    return {
      kind: 'number',
      value: only.value as number,
      unit: (only.unit as string) ?? result.meta?.metric_unit,
      label: label ? String(only[label]) : undefined,
    };
  }

  const chartable =
    hint !== 'none' &&
    rowsComplete &&
    rows.length >= MIN_CHART_ROWS &&
    hasValue &&
    isHomogeneousSeries(rows);

  if (chartable) {
    // Time first: a series with a time axis is a trend whatever else it also
    // has, and drawing it as an unordered comparison throws the ordering away.
    if (timeKey) {
      return { kind: 'chart', x: timeKey, mark: markFor(rows.length, hint), rows };
    }
    const key = categoricalKey(rows);
    if (key) {
      // A categorical comparison has no order of its own, so a line between its
      // points would assert a progression that does not exist. Bar, always —
      // and a hint asking for a line is refused rather than obeyed.
      return { kind: 'chart', x: key, mark: 'bar', rows };
    }
  }

  return { kind: 'table', columns: tableColumns(keys), rows: rows.slice(0, 8) };
}

/**
 * A streamed tool call as the result shape inferShape reads.
 *
 * THIS IS THE JOIN BETWEEN THE TWO RENDERERS. A pin run already returns a
 * PinCallResult; a chat tool_result carries the same two fields under the same
 * names. Adapting here — rather than teaching inferShape a second input —
 * means the tile and the answer reach the drawing code through one function
 * over one shape, so a payload cannot infer a chart on a page and a table in
 * chat. Returns null for anything not chartable in principle: an error, a
 * write, or rows the loop could not send whole.
 */
export function resultFromToolCall(call: ToolCall): PinCallResult | null {
  const r = call.result;
  if (!r || r.error || !r.rows_complete || !r.rows?.length) return null;
  return {
    tool: call.tool,
    arguments: call.arguments,
    status: 'ok',
    duration_ms: r.duration_ms,
    rows: r.rows,
    meta: r.meta ?? {},
    notices: [],
  };
}

/** Bars for a handful of buckets, a line once there are enough to read a trend. */
function markFor(count: number, hint: RenderHint): Mark {
  if (hint === 'line' || hint === 'bar') return hint;
  return count > LINE_OVER_BAR_ROWS ? 'line' : 'bar';
}

/**
 * Which columns a small table shows.
 *
 * Tools return an id ALONGSIDE its label — a grouped sales result carries
 * store_id, store and value — and taking the first few keys puts a 24-character
 * ObjectID in the leading column while the readable name falls off the end.
 * So an `x_id` is dropped whenever `x` is also present: the id is still in the
 * row for anything that needs it, it is just not what a person is shown.
 *
 * The label is pulled to the front for the same reason — a table reads left to
 * right, and the thing being measured should come before the measurement.
 */
export function tableColumns(keys: string[]): string[] {
  const kept = keys.filter((k) => !(k.endsWith('_id') && keys.includes(k.slice(0, -3))));
  const labels = kept.filter((k) => k !== 'value' && !k.endsWith('_id'));
  const rest = kept.filter((k) => !labels.includes(k));
  return [...labels, ...rest].slice(0, 4);
}

export function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString('en-PH')
      : v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v);
}

/** The currency mark for a unit, or nothing. Units come from meta, never from here. */
export function unitPrefix(unit?: string): string {
  return unit === 'PHP' ? '₱' : '';
}

/** The caption under a figure: its label, and its unit when the unit is a word. */
export function metricCaption(label?: string, unit?: string): string {
  return [label, unit && unit !== 'PHP' ? unit : null].filter(Boolean).join(' · ');
}

/**
 * What a pin run reproduced, and what it did not.
 *
 * A pin holds several calls, and they fail independently (pin_runner.run_pin).
 * The tile used to draw the FIRST result only, so a pin of three figures
 * showed one — the same answer reading one way in chat and another on a page,
 * which is the divergence UI rule 3 forbids. This splits a run into the
 * results that can be drawn and the ones that cannot, so the tile can draw
 * every figure that came back AND say which did not.
 *
 * NOTHING IS HIDDEN. A call that was refused, rotted or failed is kept, with
 * the runner's own words, because a tile that quietly draws two of three
 * figures is a tile claiming the pin reproduced whole. An ok call that
 * returned no rows is kept too, as an empty result rather than a zero.
 * Order is call order throughout — the order the pin stores.
 */
export interface ReplayState {
  /** Results that came back with rows, in call order. */
  drawn: PinCallResult[];
  /** Ok results with no rows: empty, not zero, and not a failure. */
  empty: PinCallResult[];
  /** Everything that did not reproduce, with the runner's reason. */
  missing: PinCallResult[];
}

export function replayState(results: PinCallResult[]): ReplayState {
  const state: ReplayState = { drawn: [], empty: [], missing: [] };
  for (const r of results) {
    if (r.status !== 'ok') state.missing.push(r);
    else if ((r.rows ?? []).length === 0) state.empty.push(r);
    else state.drawn.push(r);
  }
  return state;
}

/** The runner's word for a call that did not reproduce, as a reader's. */
export function missingLabel(status: PinStatus): string {
  switch (status) {
    case 'refused':
      return 'declined';
    case 'unrunnable':
      return 'can no longer run';
    case 'failed':
      return 'could not be refreshed';
    default:
      return status;
  }
}

/** Relative age. Renderers never show a figure, or the lack of one, without a time. */
export function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}

/**
 * A chat title: the first question, cut at 40 characters on a word boundary.
 *
 * The backend derives this too (chat_history.title_of) and is the source the
 * rail renders; this exists so the same rule is testable and available to any
 * client-side label built from a question. Both cut at the same place, and
 * both leave the full question intact for the hover.
 */
export const TITLE_MAX = 40;

export function chatTitle(question?: string | null): string {
  const text = (question ?? '').split(/\s+/).filter(Boolean).join(' ');
  if (!text) return 'Untitled chat';
  if (text.length <= TITLE_MAX) return text;
  const cut = text.slice(0, TITLE_MAX).replace(/\s+\S*$/, '') || text.slice(0, TITLE_MAX);
  return cut.replace(/[ ,;:]+$/, '') + '…';
}
