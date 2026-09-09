/**
 * What George's prose may not say — as a lint the suite can hold.
 *
 * THREE SCANS, ALL DETERMINISTIC, NONE OF THEM PRODUCTION FILTERS. The loop
 * records the first two as gaps and warning frames (agent/surface.py) and the
 * prompt forbids all three; nothing here rewrites an answer, because rule 17
 * has a legitimate exception — being asked how a figure was got — that a scan
 * cannot tell from a leak. These exist so fixtures and golden answers can be
 * held to the rule mechanically.
 *
 *   leakedTerms          tool names, argument names, field names and the
 *                        implementation narration metrics.yaml lists
 *   transactionSynonyms  words no definition establishes as "transaction",
 *                        read only when the text is about transactions
 *   coveredFigures       numerals in prose that a drawn result already shows:
 *                        the repetition Part 9 asks George to avoid. A figure
 *                        the surface does not draw is not counted — prose may
 *                        state what nothing on screen states.
 *
 * The vocabulary is a copy of metrics.yaml `surface.prose`; the backend
 * contract test holds the two lists to each other.
 */
import type { ResultSource } from './resultShape';

export const LEAKS: readonly string[] = [
  'get_sales', 'get_stock', 'get_product', 'get_movement', 'get_vending', 'get_vending_stock',
  'get_dead_stock', 'get_purchasing', 'get_cost_history', 'get_brief', 'view_page', 'record_findings',
  'group_by', 'rank_by', 'compare_to', 'top_n', 'date_range', 'change_pct', 'baseline_status',
  'call_seq', 'metrics.yaml', 'biggest_drop', 'biggest_gain', 'previous_period',
  'unchanged from a moment ago', 'regardless of capitalisation', 'regardless of capitalization',
];

export const TRANSACTION_SYNONYMS: readonly string[] = [
  'customers', 'people', 'visits', 'visitors', 'traffic', 'footfall', 'shoppers',
];

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeWords(terms: readonly string[], text: string): string[] {
  const low = text.toLowerCase();
  return terms.filter((t) => new RegExp(`(?<![\\w.])${escape(t.toLowerCase())}(?![\\w])`).test(low));
}

export function leakedTerms(text: string): string[] {
  return wholeWords(LEAKS, text);
}

export function transactionSynonyms(text: string): string[] {
  if (!/\btransactions?\b/i.test(text)) return [];
  return wholeWords(TRANSACTION_SYNONYMS, text);
}

/** Every numeral a drawn result carries, formatted the ways prose might print it. */
function drawnNumerals(sources: ResultSource[]): Set<string> {
  const out = new Set<string>();
  const add = (n: number) => {
    out.add(String(n));
    out.add(n.toLocaleString('en-PH'));
    out.add(Math.abs(n).toLocaleString('en-PH'));
    out.add(Math.round(n).toLocaleString('en-PH'));
  };
  for (const s of sources) {
    for (const row of s.rows) {
      for (const v of Object.values(row)) if (typeof v === 'number' && Number.isFinite(v)) add(v);
    }
  }
  return out;
}

export function coveredFigures(text: string, sources: ResultSource[]): string[] {
  const drawn = drawnNumerals(sources);
  return (text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? []).filter((n) => drawn.has(n) || drawn.has(n.replace(/,/g, '')));
}
