/**
 * How a pinned result gets drawn, and the formatting the tiles share.
 *
 * Separate from PinTile so the rules are readable on their own — and because a
 * component file that also exports helpers breaks fast refresh.
 */
import type { PinCallResult } from '../../types/pins';

/** Row keys that mean "this axis is time", in the order the tools emit them. */
export const TIME_KEYS = ['day', 'week', 'month', 'bucket', 'date', 'snapshot_date'];

export type Shape =
  | { kind: 'number'; value: number; unit?: string; label?: string }
  | { kind: 'chart'; x: string; rows: Record<string, unknown>[] }
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[] };

/**
 * Infer how to draw a result.
 *
 * Deliberately conservative, and it never invents a series: anything it is not
 * sure about falls through to a table. A wrong chart is more misleading than a
 * boring table, because a chart asserts a shape the data may not have — and
 * these tiles exist to be trustworthy about numbers, not clever with them.
 */
export function inferShape(result: PinCallResult): Shape | null {
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

  // A time series with enough points to have a shape worth drawing.
  if (timeKey && hasValue && rows.length > 3) {
    return { kind: 'chart', x: timeKey, rows };
  }

  return { kind: 'table', columns: tableColumns(keys), rows: rows.slice(0, 8) };
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

/** Relative age. Tiles never show a figure, or the lack of one, without a time. */
export function ago(iso?: string | null): string {
  if (!iso) return 'never';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h ago`;
  return `${Math.floor(secs / 86400)} d ago`;
}
