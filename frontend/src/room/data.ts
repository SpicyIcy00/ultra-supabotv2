/**
 * Reading a row.
 *
 * Everything here answers a question about data a tool already returned: what
 * is this row about, what is its figure, which way did it move, how hard. None
 * of it computes a business figure — the closest it comes is turning a
 * percentage into an intensity between 0 and 1, which is a brightness, not a
 * number anybody reads.
 */
import type { CompositionBlock, GeorgeTurn, ToolCall, ToolMeta } from '../types/george';

export type Block = CompositionBlock;
export type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;
export type Direction = 'up' | 'down' | 'flat';
export type Dimension = 'store' | 'product' | 'category';

/* ----------------------------------------------------------------- figures */

const PESO = /sales|revenue|value|subtotal|total|cost|price|amount|_php$|peso/i;

/** A peso figure in the hundreds of thousands does not need centavos. */
function digits(n: number): number {
  if (Number.isInteger(n)) return 0;
  return Math.abs(n) >= 1000 ? 0 : 2;
}

export function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) {
    const n = Number(v);
    if (PESO.test(key)) return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: digits(n) })}`;
    if (/pct|percent|share/i.test(key)) return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
    return n.toLocaleString('en-PH', { maximumFractionDigits: digits(n) });
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

export function pct(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}%`;
}

/* ----------------------------------------------------------------- rows */

/** What a row is about, by the conventions the tools use. */
export function subjectOf(row: Record<string, unknown>): string | null {
  for (const k of ['store', 'label', 'product', 'name', 'subject', 'supplier', 'category',
                   'day', 'week', 'month', 'date', 'period', 'bucket', 'snapshot_date', 'sku']) {
    const v = row[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

/**
 * What KIND of thing a subject is, from the column its name came out of.
 * Never guessed from the text — a product called "Rockwell Crackers" is a
 * product, and asking George why a *shop* of that name moved would send him
 * looking for something that does not exist.
 */
export function dimensionOf(rows: Record<string, unknown>[], subject: string): Dimension | null {
  const want = subject.trim().toLowerCase();
  const columns: [string, Dimension][] = [
    ['store', 'store'], ['product', 'product'], ['sku', 'product'], ['category', 'category'],
  ];
  for (const row of rows) {
    for (const [column, dimension] of columns) {
      const v = row[column];
      if (typeof v === 'string' && v.trim().toLowerCase() === want) return dimension;
    }
  }
  return null;
}

export function rowFor(rows: Record<string, unknown>[], subject: string): Record<string, unknown> | null {
  const want = subject.trim().toLowerCase();
  return rows.find((r) => Object.values(r).some(
    (v) => typeof v === 'string' && v.trim().toLowerCase() === want)) ?? null;
}

/** The first numeric column that is not a change — the row's headline figure. */
export function valueOf(row: Record<string, unknown>): { key: string; value: number } | null {
  const skip = new Set(['change', 'change_pct', 'baseline', 'seq', 'call_seq', 'row_count']);
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k) || k.endsWith('_id')) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return { key: k, value: v };
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return { key: k, value: Number(v) };
  }
  return null;
}

export interface Change {
  pct: number | null;
  direction: Direction | null;
  /** The tool's own word when it tried to compare and could not. */
  status?: string;
}

export function changeOf(row: Record<string, unknown>): Change {
  const raw = typeof row.change_pct === 'number' ? row.change_pct
    : typeof row.change_pct === 'string' && row.change_pct !== '' ? Number(row.change_pct) : null;
  const value = Number.isFinite(raw as number) ? raw : null;
  const direction = (row.direction as Direction | undefined)
    ?? (value === null ? null : value > 0 ? 'up' : value < 0 ? 'down' : 'flat');
  return { pct: value, direction, status: row.baseline_status as string | undefined };
}

/**
 * HOW BRIGHTLY A TILE BURNS. |change| against a cap, so a shop up 30% is at
 * full and a shop up 2% barely lights.
 *
 * The cap is a brightness ceiling, not a business threshold — nothing is
 * classified by it, nothing is hidden below it, and no answer changes if it
 * moves. It exists so one extraordinary week cannot make every other tile
 * look dead.
 */
export const INTENSITY_CAP_PCT = 30;

export function intensity(change: Change): number {
  if (change.pct === null) return 0;
  return Math.min(1, Math.abs(change.pct) / INTENSITY_CAP_PCT);
}

export function tone(change: Change): Direction {
  return change.direction ?? 'flat';
}

/* ----------------------------------------------------------------- sorting */

/** Rows in the order the person asked for. Reordering is not computing. */
export function sorted(
  rows: Record<string, unknown>[],
  sort?: { column: string; desc: boolean },
): Record<string, unknown>[] {
  if (!sort) return rows;
  const out = rows.slice().sort((a, b) => {
    const x = a[sort.column];
    const y = b[sort.column];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y), 'en');
  });
  return sort.desc ? out.reverse() : out;
}

/* ----------------------------------------------------------------- caveats */

/**
 * A caveat stays above the figure it qualifies and is never hidden behind a
 * disclosure that gives no hint it is there. What it may not do is push the
 * answer off the screen — an earlier build opened with forty product names and
 * the word NULL. Where the message goes on to ENUMERATE, the list sits behind
 * one word. The split is at a punctuation boundary in George's own text; this
 * never rewrites or summarises him.
 */
const CAVEAT_HEAD_MAX = 200;

export function splitCaveat(message: string): { head: string; detail: string | null } {
  // An enumeration — "…: this; that; and 40 more." The list is the long half.
  const firstItem = message.indexOf(';');
  if (firstItem >= 0) {
    const cut = message.lastIndexOf(':', firstItem);
    if (cut >= 0) {
      const detail = message.slice(cut + 1).trim();
      if (detail.length >= 90) {
        return { head: message.slice(0, cut).trim().replace(/[:,]$/, '') + '.', detail };
      }
    }
  }
  // A paragraph. Its FIRST SENTENCE carries the count and the reason — which
  // is the whole of what a caveat has to say up front — and the elaboration
  // goes behind a word. Six unsplit caveats put four hundred pixels of grey
  // text above the work, which is how a caveat stops being read at all.
  if (message.length <= CAVEAT_HEAD_MAX) return { head: message, detail: null };
  let end = -1;
  const boundary = /[.!?](\s|$)/g;
  for (let m = boundary.exec(message); m; m = boundary.exec(message)) {
    if (m.index + 1 > CAVEAT_HEAD_MAX) break;
    end = m.index + 1;
  }
  if (end <= 0) return { head: message, detail: null };
  const detail = message.slice(end).trim();
  if (detail.length < 40) return { head: message, detail: null };
  return { head: message.slice(0, end).trim(), detail };
}

/* ----------------------------------------------------------------- misc */

/** The measure a figure is IN, and never the bare column name "value". */
export function measureOf(meta: ToolMeta | null | undefined, key: string): string {
  if (meta?.metric_label) return meta.metric_label;
  return /^(value|amount|total|n|count)$/.test(key) ? '' : key.replace(/_/g, ' ');
}

/**
 * THE WINDOW, FOR A PERSON. A preset by its name; explicit dates as dates —
 * and the half-open end shown as the last day it covers, because "12 Aug to
 * 12 Sep" over a read that stops at midnight on the 11th is a claim of a day
 * it never read.
 */
export function windowLabel(meta: ToolMeta | null | undefined): string | null {
  const w = meta?.window;
  if (!w) return null;
  if (w.name) return String(w.name).replace(/_/g, ' ');
  if (!w.start) return null;
  const start = new Date(`${w.start}T00:00:00`);
  const rawEnd = w.end ? new Date(`${w.end}T00:00:00`) : null;
  if (rawEnd && /half-open/.test(String((w as { convention?: string }).convention ?? 'half-open'))) {
    rawEnd.setDate(rawEnd.getDate() - 1);
  }
  // Day then month, three-letter month, deterministic — not the locale's
  // idea of it, which put the month first and spelt "Sept" elsewhere.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const year = (d: Date) => d.getFullYear();
  if (!rawEnd || rawEnd.getTime() <= start.getTime()) return `${day(start)} ${year(start)}`;
  const sameYear = year(start) === year(rawEnd);
  return `${day(start)}${sameYear ? '' : ` ${year(start)}`} → ${day(rawEnd)} ${year(rawEnd)}`;
}

/** How the rows were grouped, in words. Never the column name. */
function groupingLabel(meta: ToolMeta | null | undefined): string | null {
  const raw = (meta as { group_by?: unknown } | null | undefined)?.group_by;
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
  const words: Record<string, string> = {
    store: 'per shop', product: 'per product', category: 'per category',
    day: 'by day', week: 'by week', month: 'by month', hour: 'by hour of the day',
    machine: 'per machine', supplier: 'per supplier', status: 'by status',
  };
  const named = groups.map((g) => words[g]).filter(Boolean);
  return named.length ? named.join(', ') : null;
}

/**
 * THE RECEIPTS, AS A LINE A PERSON READS: what was measured, how it was cut,
 * which days, and when it was read. The table it came from is still the
 * receipt — it is in the detail behind this line, on hover — but
 * "new_transactions" at the foot of every tile told the reader where the
 * figures lived and not what they were.
 */
export function receiptsLine(meta: ToolMeta | null | undefined): string {
  if (!meta) return '';
  const when = meta.snapshot_timestamp
    ? new Date(meta.snapshot_timestamp).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null;
  return [meta.metric_label ?? null, groupingLabel(meta), windowLabel(meta), when ? `read ${when}` : null]
    .filter(Boolean).join(' · ');
}

/** The rest of the receipt: the source and every filter, for the hover. */
export function receiptsDetail(meta: ToolMeta | null | undefined): string {
  if (!meta) return '';
  const filters = (meta.filters_applied ?? []).map((f) => String(f).split('#')[0].trim()).filter(Boolean);
  return [meta.source_table ? `from ${meta.source_table}` : null, ...filters].filter(Boolean).join('\n');
}

export function callOf(turn: AnswerTurn, seq: number | undefined): ToolCall | null {
  if (seq === undefined) return null;
  return turn.toolCalls.find((c) => c.seq === seq) ?? null;
}

export function rowsOf(call: ToolCall | null): Record<string, unknown>[] {
  return call?.result?.rows ?? [];
}
