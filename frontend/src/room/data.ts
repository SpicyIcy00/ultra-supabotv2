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
export type Dimension = 'store' | 'product' | 'category' | 'supplier';

/* ----------------------------------------------------------------- figures */

/**
 * A COLUMN NAME THAT SAYS MONEY ITSELF — and nothing that merely could be.
 *
 * This used to carry `value`, `total` and `amount`, and that is how a count of
 * transactions was drawn as `₱1,187`: every compared row names its number
 * `value`, so every metric's figure was money to the formatter. The unit is a
 * fact the rows and the read already carry (`unit`, `meta.metric_unit`), so
 * `unitOf` is what decides, and this is only the last resort for a figure that
 * arrives with no unit beside it. A generic magnitude word is not evidence of
 * a currency; `net_sales` and `unit_cost` name one.
 */
const PESO = /sales|revenue|subtotal|cost|price|_php$|peso/i;

/** A peso figure in the hundreds of thousands does not need centavos. */
function digits(n: number): number {
  if (Number.isInteger(n)) return 0;
  return Math.abs(n) >= 1000 ? 0 : 2;
}

/**
 * THE UNIT A FIGURE IS IN, READ RATHER THAN GUESSED.
 *
 * Every compared row carries `unit` (tools/sales.py) and every metric read
 * carries `meta.metric_unit`, so a formatter has no business inferring the
 * currency from a column name. Pass whichever is to hand: the row, the meta,
 * or a bare unit string.
 */
export function unitOf(
  from: Record<string, unknown> | ToolMeta | null | undefined,
): string | null {
  if (!from) return null;
  const row = from as Record<string, unknown>;
  const unit = row.unit ?? (from as ToolMeta).metric_unit;
  return typeof unit === 'string' && unit.trim() ? unit.trim() : null;
}

/**
 * A value, as a person reads it.
 *
 * `unit` is the measure the rows or the read declared — pass it wherever it
 * exists, and the formatting stops guessing. Absent, the column name decides,
 * and only where the name itself names money.
 */
export function fmt(key: string, v: unknown, unit?: string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) {
    const n = Number(v);
    // A PERCENTAGE IS NOT IN THE METRIC'S UNIT, and it is asked first for
    // that reason: `change_pct` beside a peso figure is still a percentage,
    // and a read's unit says what the VALUE is measured in, never the change
    // against it. This much is read from the column name because the column
    // is what carries the dimension — every tool names these the same way.
    if (/pct|percent|share/i.test(key)) return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
    // THE SIGN GOES OUTSIDE THE SYMBOL. `₱-18,400` is what came out before,
    // because the minus rode along inside `toLocaleString` — readable, but not
    // how anybody writes money, and a contributors mark is a column of them.
    if (unit ? unit.toUpperCase() === 'PHP' : PESO.test(key)) {
      const amount = Math.abs(n).toLocaleString('en-PH', { maximumFractionDigits: digits(n) });
      return `${n < 0 ? '-' : ''}₱${amount}`;
    }
    return n.toLocaleString('en-PH', { maximumFractionDigits: digits(n) });
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === 'string') return v;
  // A list of plain values still reads as one. `String([])` was '', which is
  // the empty field in `ATTENTION · 16 ROWS · [object Object] · · NO`.
  if (Array.isArray(v)) {
    const parts = v.filter((x) => x !== null && typeof x !== 'object').map(String);
    return parts.length ? parts.join(', ') : '—';
  }
  // NOT `String(v)`, which is where `[object Object]` came from — it reached a
  // table's caption through a column whose value was a nested object (a row's
  // `receipts`, its `threshold_applied`), and a reader was shown the words
  // "object Object" as though they were data. A value with no reading for a
  // person is drawn as one that has none.
  return '—';
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
    ['supplier', 'supplier'],
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
// Day then month, three-letter month, deterministic — not the locale's
// idea of it, which put the month first and spelt "Sept" elsewhere.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const timed = (s: string) => /[T ]\d\d:\d\d/.test(s);
const parseBound = (s: string) => new Date(timed(s) ? s.replace(' ', 'T') : `${s}T00:00:00`);

export function windowLabel(meta: ToolMeta | null | undefined): string | null {
  const w = meta?.window;
  if (!w) return null;
  // A period so far, bound to the hour: "this week so far, to 12 Sep 14:32".
  // The end is the read's own bound, never the clock on the screen.
  if (w.end && timed(String(w.end))) {
    const end = parseBound(String(w.end));
    const hhmm = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    const name = w.name ? `${String(w.name).replace(/_/g, ' ')} so far` : dayOf(parseBound(String(w.start)));
    return `${name}, to ${dayOf(end)} ${hhmm}`;
  }
  if (w.name) return String(w.name).replace(/_/g, ' ');
  if (!w.start) return null;
  const start = parseBound(String(w.start));
  const rawEnd = w.end ? parseBound(String(w.end)) : null;
  if (rawEnd && /half-open/.test(String((w as { convention?: string }).convention ?? 'half-open'))) {
    rawEnd.setDate(rawEnd.getDate() - 1);
  }
  const day = dayOf;
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

/**
 * WARNINGS THE LOOP RAISES ABOUT GEORGE'S OWN EDITS — never a tool's notice.
 *
 * "rockwell-hours: a block carries a kind or a spec, never both" is process,
 * not a caveat on a figure: the refusal is already enforced and already
 * conveyed to him, and drawing it above the answer made three readings wear a
 * sentence about a shape he learnt to compose on the third try.
 *
 * Here rather than beside its first reader since P1.k, because the count of
 * caveats on the work line has to leave out exactly the same ones the region
 * above the board leaves out — two lists would be two answers to "how many
 * caveats does this turn carry".
 */
export const PROCESS = new Set(['composition_rejected', 'findings_rejected',
                                'restated_figure', 'misstated_figure',
                                'enumerated_remainder']);
