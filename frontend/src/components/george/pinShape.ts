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
import type { PinCallResult } from '../../types/pins';

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

export type Shape =
  | { kind: 'number'; value: number; unit?: string; label?: string }
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
