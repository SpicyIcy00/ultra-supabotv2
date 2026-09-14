/**
 * WHICH READ A FIGURE IN HIS CLAIM CAME OUT OF.
 *
 * Hex lets you click a number in a cell and land on the logic behind it. This
 * is that, and the whole of it: a numeral in the claim that some read's rows
 * already hold is drawn underlined, and touching it opens that read. Nothing
 * here decides what a figure MEANS and nothing here computes one — it is a
 * lookup, from a numeral George wrote to a number a tool returned.
 *
 * A MIRROR OF agent/prose.py, DELIBERATELY. The server matches prose numerals
 * against returned rows in three places already — the restatement gate, the
 * caveat slot, the evals — and a second, looser matcher on the client would
 * underline figures the server calls ungrounded, or leave grounded ones bare.
 * So the rules are the same rules: a numeral matches a returned number when it
 * is that number rounded to the precision written; dates, years and small
 * counts are not figures. `test_visible_work_contract.py` compares the two
 * files' constants so the pair cannot drift apart in silence.
 *
 * WHAT IT MAY NOT DO. It never underlines a numeral no read returned — an
 * underline is a promise that there is something behind it, and a link to
 * nowhere is worse than no link. CLAUDE.md rule 9 stands: production does not
 * check the answer's numerals against the rows, and this does not either. It
 * answers a different question — which read holds this one — and a numeral it
 * cannot place is drawn exactly as George wrote it.
 */
import type { ToolCall } from '../types/george';

/**
 * A numeral, with the currency and the magnitude suffix it may wear.
 * The lookbehind keeps `v2` and `1.2.3` out of it, as the Python does.
 */
const NUMERAL = /(?<![\w.])[₱$]?\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kKmM]\b|%)?/g;

/** Dates and iso timestamps are struck out before the scan, never matched. */
const DATE_PARTS = new RegExp(
  '\\b(?:19|20)\\d{2}-\\d{2}-\\d{2}\\b'
  + '|\\b\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w*\\s+(?:19|20)\\d{2}\\b'
  + '|\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\w*\\s+\\d{1,2}(?:,\\s*(?:19|20)\\d{2})?\\b'
  + '|\\b(?:19|20)\\d{2}\\b',
  'g',
);

/** Integers to here, with no decimals and no %, are counts and day numbers. */
export const PRESENTATION_MAX = 31;

/** Years a business figure is never mistaken for. */
const YEARS = new Set([2024, 2025, 2026, 2027]);

function isBusinessFigure(n: number, decimals: number, percent: boolean): boolean {
  if (!percent && decimals === 0 && Number.isInteger(n) && n >= 0 && n <= PRESENTATION_MAX) {
    return false;
  }
  return !YEARS.has(n);
}

export interface Numeral {
  /** Where it sits in the text handed in, so the span can be cut out of it. */
  start: number;
  end: number;
  value: number;
  decimals: number;
}

/**
 * Every business figure in `text`, with the span it occupies.
 *
 * The date sweep BLANKS rather than deletes — the Python substitutes a space
 * and only needs the values, while this needs the offsets to stay true to the
 * original string.
 */
export function figuresIn(text: string): Numeral[] {
  const masked = text.replace(DATE_PARTS, (d) => ' '.repeat(d.length));
  const out: Numeral[] = [];
  NUMERAL.lastIndex = 0;
  for (let m = NUMERAL.exec(masked); m; m = NUMERAL.exec(masked)) {
    const raw = m[1];
    const suffix = (m[2] ?? '').toLowerCase();
    let value = Number(raw.replace(/,/g, ''));
    let decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    if (suffix === 'k' || suffix === 'm') {
      value *= suffix === 'k' ? 1_000 : 1_000_000;
      decimals -= suffix === 'k' ? 3 : 6;
    }
    if (!isBusinessFigure(value, decimals, suffix === '%')) continue;
    out.push({ start: m.index, end: m.index + m[0].length, value, decimals });
  }
  return out;
}

/** Every number in one value, however deeply it is nested. */
function walk(value: unknown, out: Set<number>): void {
  if (value === null || value === undefined || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.add(value);
    return;
  }
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
      const n = Number(m[0].replace(/,/g, ''));
      if (Number.isFinite(n)) out.add(n);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walk(v, out);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walk(v, out);
  }
}

/** Every number one call returned — its rows and its meta, as the server does. */
export function numbersOf(call: ToolCall): Set<number> {
  const out = new Set<number>();
  walk(call.result?.rows ?? [], out);
  walk(call.result?.meta ?? {}, out);
  return out;
}

/**
 * A numeral matches a returned number when it is that number rounded to the
 * precision written: within half a unit of the last digit.
 */
function matches(n: number, decimals: number, numbers: Set<number>): boolean {
  const tolerance = 0.5 * 10 ** -decimals + 1e-9;
  for (const v of numbers) {
    if (Math.abs(Math.abs(v) - n) <= tolerance) return true;
  }
  return false;
}

/**
 * The read a figure came out of, or null.
 *
 * THE FIRST CALL THAT HOLDS IT, in the order they ran. Two reads of the same
 * window hold the same number and there is nothing in the text saying which he
 * meant; the earlier one is the one he had when he wrote the sentence, and
 * picking it is at least deterministic — a link that lands somewhere true is
 * the promise, not a guess at which of two true places he had in mind.
 */
export function readBehind(figure: Numeral, calls: ToolCall[]): ToolCall | null {
  for (const call of calls) {
    if (call.duplicate_of !== undefined) continue;
    if (!call.result || call.result.error) continue;
    if (matches(figure.value, figure.decimals, numbersOf(call))) return call;
  }
  return null;
}

/** One piece of a claim: plain text, or a figure with the read behind it. */
export interface ClaimPiece {
  text: string;
  seq?: number;
}

/**
 * A claim cut into pieces, the placeable figures separated out.
 *
 * Returns one piece when nothing is placeable, so a caller can draw the string
 * it was given without asking whether anything was found.
 */
export function placeFigures(text: string, calls: ToolCall[]): ClaimPiece[] {
  if (!text) return [{ text }];
  const pieces: ClaimPiece[] = [];
  let at = 0;
  for (const figure of figuresIn(text)) {
    const call = readBehind(figure, calls);
    if (!call) continue;
    if (figure.start > at) pieces.push({ text: text.slice(at, figure.start) });
    pieces.push({ text: text.slice(figure.start, figure.end), seq: call.seq });
    at = figure.end;
  }
  if (!pieces.length) return [{ text }];
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}
