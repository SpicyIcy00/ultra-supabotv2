/**
 * Reading a row.
 *
 * Everything here answers a question about data a tool already returned: what
 * is this row about, what is its figure, which way did it move. None of it
 * computes a business figure.
 */
import type { CompositionBlock, BobTurn, ToolCall, ToolMeta } from '../types/bob';

export type Block = CompositionBlock;
export type AnswerTurn = Extract<BobTurn, { role: 'bob' }>;
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
 * product, and asking Bob why a *shop* of that name moved would send him
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

/**
 * THE ROW A CLAIM ABOUT `subject` MAY BE DRAWN FROM, or null for none.
 *
 * A mark that draws ONE number has to choose one row, and until 2026-09-15 it
 * chose `rowFor(...) ?? rows[0]` — the first row of the read whenever the
 * subject was not in it. On the owner's board that drew Rockwell's ₱206,800,
 * a green +1.5% and a row labelled Rockwell under the sentence "Greenhills
 * turned down on a smaller basket". Nothing was invented; a real figure was
 * attached to a claim that is not about it, which is the one thing CLAUDE.md
 * rule 9 exists to prevent.
 *
 * The rule is about what the ROWS can contradict, not about matching text:
 *
 *   - the subject is in the rows          → that row, and never another.
 *   - the rows name no subject of their own and there is exactly ONE of them
 *                                         → that row. The read is already
 *                                           scoped to the subject by its
 *                                           filters — "Why was North Edsa up?"
 *                                           returns one row with no `store`
 *                                           column — so there is nothing in it
 *                                           that could disagree with the claim.
 *   - anything else                       → null, and the mark draws no
 *                                           number. Rows that name subjects
 *                                           and do not name this one say the
 *                                           block is about something the read
 *                                           does not hold; several unnamed
 *                                           rows say the read is not about one
 *                                           thing at all.
 */
export function rowUnderClaim(
  rows: Record<string, unknown>[], subject: string,
): Record<string, unknown> | null {
  const found = rowFor(rows, subject);
  if (found) return found;
  const named = rows.some((r) => subjectOf(r) !== null);
  return !named && rows.length === 1 ? rows[0] : null;
}

/** The columns a row RUNS ALONG — where it sits, never how much it holds. */
export const ORDER_KEYS = ['day', 'week', 'month', 'hour', 'date', 'bucket', 'snapshot_date', 'period'];

/**
 * THE ROW'S HEADLINE FIGURE: the tool's own `value` where it has one, else the
 * first numeric column that is not a change, an id or an ORDER. The order rule
 * arrived with P2S.3's reads grouped by hour: `{hour: 9, value: 354}` drew its
 * hour as its figure. `agent/vocabulary.value_of` is the same rule.
 */
export function valueOf(row: Record<string, unknown>): { key: string; value: number } | null {
  const skip = new Set(['change', 'change_pct', 'baseline', 'seq', 'call_seq', 'row_count']);
  const own = row.value;
  if (typeof own === 'number' && Number.isFinite(own)) return { key: 'value', value: own };
  if (typeof own === 'string' && /^-?\d+(\.\d+)?$/.test(own)) return { key: 'value', value: Number(own) };
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k) || k.endsWith('_id') || ORDER_KEYS.includes(k)) continue;
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

/*
 * HOW BRIGHTLY A TILE BURNS was here — |change| against a 30% cap — and it is
 * gone with P2.l. It fed the tile's wash: magnitude, with no direction in it,
 * as a second meaning on top of identity. THE EVIDENCE THAT IT COST NOTHING is
 * that it was already dead: P1.e deleted the last tile that passed a `change`
 * to `Shell` on 2026-09-14, so every tile has burnt at 0 since, and the
 * dogfood log still described the brightness as a live meaning. A channel
 * whose absence nobody can see is not a channel.
 */

export function tone(change: Change): Direction {
  return change.direction ?? 'flat';
}

/* ------------------------------------------------------------------ table */

/**
 * WHICH COLUMNS A TABLE OF ROWS DRAWS, AND WHICH FOLD TO A CAPTION.
 *
 * ONE DEFINITION, TWO READERS. The board draws a read as a table (marks.tsx
 * `Rows`) and the replay draws the same read at the rung that fetched it
 * (Replay.tsx). Two column pickers would mean the same read read two ways on
 * one screen — the shop that was a caption on the board back as a column of
 * seven identical cells in the walk — so the choice is made here and both call
 * it. P2.e, 2026-09-15.
 *
 * A COLUMN WHOSE VALUE IS THE SAME ON EVERY ROW IS NOT A COLUMN. It is a fact
 * about the whole read — "store Greenhills" — and it is named rather than
 * printed seven times. Never a money column, whatever its values: a table of
 * three rows that happen to share a total is still a table of figures, and
 * folding one into a caption would put a business figure somewhere with no
 * row under it.
 *
 * NOTHING HERE COMPUTES. It counts distinct strings and orders names.
 */
export interface TableShape {
  /** The single-valued columns, already in words: `store Greenhills`. */
  constant: string[];
  /** The columns drawn, in reading order — subject first, figures after. */
  columns: string[];
}

/** Never a column: an id nobody reads, and the machinery of a comparison. */
const NOT_A_COLUMN = [
  'seq', 'call_seq', 'direction', 'baseline_status',
  // TOOL INTERNALS, NEVER COLUMNS (prompt rule 17, UI rule 4: raw diagnostics
  // never reach the answer). The attention read carries the machinery it used
  // to judge a row — which source, which floor definition, which section, the
  // identity string it keys on — and the owner was shown a table of it:
  // "what does this report mean i dont understand is there something wrong?"
  'identity', 'section', 'floor', 'measure', 'source', 'threshold_applied',
];

/** Subject first, then the figure, then what it moved against. */
const COLUMN_RANK: Record<string, number> = {
  product: 0, store: 0, category: 0, name: 0, supplier: 0, label: 0, day: 0, week: 0, month: 0,
  // `subject` is what the attention read calls the thing a row is about, and
  // it had no rank at all — so it lost the five-column cap to `value` and
  // `change_pct`, which fifteen of seventeen rows could not fill. The table
  // named nothing and measured nothing.
  subject: 0,
  rank: 1, sku: 1, value: 2, change_pct: 3, change: 6, baseline: 7,
};

/** How many columns a table draws. Past this it is a spreadsheet, not a mark. */
const COLUMNS_MAX = 5;

/**
 * Columns a read's unit does not describe.
 *
 * `unitOf(row)` says what the row's VALUE is measured in. It was applied to
 * every numeric cell, so the attention table drew its rank column as `₱1`,
 * `₱2` — a position in a list, in pesos. A unit belongs to a measurement.
 */
const UNITLESS = /^(rank|position|seq|count|rows?|n|line_count|[a-z_]+_count|days?|days_[a-z_]+)$/;

/** The unit to format one column's cells in, or none. */
export function unitFor(
  column: string,
  row: Record<string, unknown>,
  meta?: ToolMeta | null,
): string | null {
  if (UNITLESS.test(column)) return null;
  return unitOf(row) ?? unitOf(meta) ?? null;
}

export function tableShape(
  rows: Record<string, unknown>[],
  meta: ToolMeta | null | undefined,
): TableShape {
  if (!rows.length) return { constant: [], columns: [] };
  // EVERY ROW'S KEYS, NOT THE FIRST ROW'S.
  //
  // A read can return rows of more than one shape — the attention read returns
  // a shop whose sales moved beside a product that went out of stock, and they
  // share almost nothing. Reading the columns off `rows[0]` advertised the
  // first shape's columns for all of them, so fifteen of seventeen rows drew
  // an em dash under VALUE, CHANGE PCT and UNIT. The owner saw it in several
  // answers and asked whether it was a bug. It was.
  const keys: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!keys.includes(k) && !k.endsWith('_id') && !NOT_A_COLUMN.includes(k)) keys.push(k);
    }
  }
  const readable = (v: unknown) => v === null || v === undefined || typeof v !== 'object';
  const filled = (v: unknown) => v !== null && v !== undefined && v !== '';
  const coverage = new Map<string, number>(
    keys.map((k) => [k, rows.filter((r) => filled(r[k])).length]));
  const constant: string[] = [];
  const cols: string[] = [];
  for (const k of keys) {
    const distinct = new Set(rows.map((r) => String(r[k] ?? '')));
    if (rows.length >= 3 && distinct.size === 1 && String(rows[0][k] ?? '').length <= 24
        && readable(rows[0][k])
        && !/sales|revenue|value|total|cost|price/i.test(k)) {
      // NAMED, because the caption now stands on its own. It used to be
      // joined to the title and the row count, which gave a bare `0` or `7`
      // something to lean on; since the frame took those it read as a row of
      // loose digits.
      constant.push(`${k.replace(/_/g, ' ')} ${fmt(k, rows[0][k], unitOf(rows[0]) ?? unitOf(meta))}`);
    } else {
      cols.push(k);
    }
  }
  // A COLUMN EVERY ROW CAN FILL COMES FIRST, and one no row can fill is not a
  // column at all. Where the rows are all one shape — which is nearly every
  // read — this changes nothing, because every column is full. Where they are
  // not, the table draws what the rows have in common instead of spending its
  // five columns on the first row's private fields.
  const whole = (k: string) => (coverage.get(k) ?? 0) === rows.length;
  // A column nobody can fill is not a column, and one whose every value is a
  // nested object is where `[object Object]` came from.
  let drawable = cols.filter((k) => (coverage.get(k) ?? 0) > 0
    && rows.some((r) => filled(r[k]) && readable(r[k])));

  // A MIXED TABLE DRAWS WHAT ITS ROWS HAVE IN COMMON.
  //
  // Once the rows are of more than one shape, a column only some of them carry
  // is a promise the table cannot keep: it reads as a measurement that came
  // back empty rather than one that was never taken. The attention read drew
  // three such columns over fifteen rows. Where every column is whole — nearly
  // every read — this does nothing.
  const wholes = drawable.filter(whole);
  if (wholes.length >= 2 && wholes.length < drawable.length) drawable = wholes;

  const ranked = drawable
    .sort((a, b) => Number(whole(b)) - Number(whole(a))
      || (COLUMN_RANK[a] ?? 4) - (COLUMN_RANK[b] ?? 4)
      || cols.indexOf(a) - cols.indexOf(b));

  // COLUMNS THAT SAY THE SAME THING AS EACH OTHER (P3.k).
  //
  // The fold above catches a column that says ONE thing all the way down. It
  // does not catch two columns that say the same thing as each other on every
  // row, and the owner's stockout read was exactly that: `days out of stock`,
  // `current stockout run` and `longest stockout run`, printing 21 · 21 · 21,
  // 20 · 20 · 20, 19 · 19 · 19 — the same number three times for every shop,
  // and the reason that table also claimed it needed the whole width.
  //
  // Three genuinely different measures that HAPPEN to coincide on this data,
  // so this is a drawing decision and not the tool's: suppressing a column in
  // SQL would change what Bob sees and make a tool's contract depend on its
  // rows. Here the first one drawn keeps its place and the rest are NAMED in
  // the caption, because a reader is entitled to know the column was there.
  const mirrors = new Map<string, string>();
  for (let i = 0; i < ranked.length; i += 1) {
    const a = ranked[i];
    if (mirrors.has(a) || /sales|revenue|value|total|cost|price/i.test(a)) continue;
    for (let j = i + 1; j < ranked.length; j += 1) {
      const b = ranked[j];
      if (mirrors.has(b) || /sales|revenue|value|total|cost|price/i.test(b)) continue;
      if (rows.every((r) => String(r[a] ?? '') === String(r[b] ?? ''))) mirrors.set(b, a);
    }
  }
  if (rows.length >= 3 && mirrors.size) {
    for (const [b, a] of mirrors) {
      constant.push(`${b.replace(/_/g, ' ')} is the same as ${a.replace(/_/g, ' ')}`);
    }
  }
  const columns = (rows.length >= 3 ? ranked.filter((k) => !mirrors.has(k)) : ranked)
    .slice(0, COLUMNS_MAX);
  return { constant, columns };
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
 * one word. The split is at a punctuation boundary in Bob's own text; this
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
export function receiptsLine(meta: ToolMeta | null | undefined, now: Date = new Date(),
                             omitWindow = false): string {
  if (!meta) return '';
  const when = readAt(meta.snapshot_timestamp, now);
  // THE PERIOD LEAVES THIS LINE WHEN IT IS DRAWN ABOVE THE FIGURE INSTEAD
  // (P3.q). An answer over one period says it once, here. An answer over
  // several says it at the head of each figure, where it is read BEFORE the
  // number rather than after it — and then saying it again down here would be
  // the thing voice.plain exists to stop.
  return [meta.metric_label ?? null, groupingLabel(meta),
          omitWindow ? null : windowLabel(meta), when]
    .filter(Boolean).join(' · ');
}

/**
 * `read HH:MM` — WHEN THE ROWS WERE READ, in Manila (P2S.1(c), UI rule 6).
 *
 * The design's own words under every figure: *"read 07:49"*. A read from
 * another day carries its date as well, because an hour with no day on it is
 * a claim about this morning that may be about last week.
 */
export function readAt(stamp: string | null | undefined, now: Date = new Date()): string | null {
  if (!stamp) return null;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return null;
  const zone = 'Asia/Manila';
  const hm = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zone });
  if (day(at) === day(now)) return `read ${hm}`;
  const date = at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: zone });
  return `read ${date} ${hm}`;
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
 * WARNINGS THE LOOP RAISES ABOUT BOB'S OWN EDITS — never a tool's notice.
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
