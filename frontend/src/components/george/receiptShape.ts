/**
 * What a figure covers, said in the language of the question that asked for it.
 *
 * Separate from ReceiptsBlock for the reason pinShape.ts is separate from the
 * components that draw with it: this is a DECISION the suite can hold without
 * a DOM, and a component file that also exports helpers breaks fast refresh.
 *
 * LEVEL 2 OF FOUR. Provenance descends — the business caveat, then the scope,
 * then the method, then the raw receipt (metrics.yaml notices.contract records
 * the same split for caveats). This is the scope, and it is the line that is
 * ALWAYS VISIBLE under a figure.
 *
 * WHAT IT REPLACED. That line used to begin with `meta.source_table` — a
 * database table name, under every figure in the app, shown to somebody who
 * asked how a store did. The table is real and auditable and is now one tap
 * down with the filters that cite it; what leads is the thing the reader
 * actually asked about.
 *
 * BUILT FROM meta, NEVER FROM PROSE. Every part comes from a structured value
 * the tool supplied, so the line above a figure is the query that produced it.
 * A result with no window gets no window rather than a guessed one.
 */
import type { ToolMeta } from '../../types/george';

/** When the tool recorded no window at all. Never a guess, never blank. */
export const SCOPE_UNKNOWN = 'Scope not recorded';

/**
 * A preset window's name, opened out.
 *
 * The name is what metrics.yaml defines and what the filters cite, so it is
 * what a scope line should say. Same rule as resultShape.windowLabel, which
 * does this for a group's heading.
 */
function windowWords(meta: ToolMeta): string | undefined {
  const w = meta.window;
  if (!w) return undefined;
  if (w.kind === 'preset' && w.name) {
    const words = w.name.replace(/_/g, ' ').trim();
    return words ? words[0].toUpperCase() + words.slice(1) : undefined;
  }
  if (w.start && w.end) return `${w.start} → ${w.end}`;
  return undefined;
}

export function scopeLine(meta: ToolMeta): string {
  const parts: string[] = [];
  if (meta.metric_label) parts.push(meta.metric_label);

  const window = windowWords(meta);
  if (window) parts.push(window);

  // A comparison is part of the scope, not a detail of it: a figure measured
  // against another period covers two windows, and saying so is the difference
  // between "up 12%" meaning something and meaning nothing.
  if (meta.comparison?.baseline) {
    // THE DEFINITIONS' OWN WORDS, NOT A "vs" PREFIXED ON TOP OF THEIRS. Every
    // `comparisons.*.display_name` already begins with one, which is how "vs vs
    // previous period" reached a kept page — reported 2026-09-15 and visible in
    // his own screenshot. The room fixed this in `room/catalogue.ts` on 09-14
    // and this copy did not hear about it. Only the fallback, which is this
    // module's own sentence, carries the word.
    parts.push(meta.comparison.display_name ?? 'vs the previous period');
  }

  return parts.length ? parts.join(' · ') : SCOPE_UNKNOWN;
}
