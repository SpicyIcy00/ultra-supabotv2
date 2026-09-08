/**
 * One fact, one representation.
 *
 * THE FAILURE THIS ANSWERS. A piece of work drew the same figures twice: a
 * result listing net sales, transactions and basket value with their deltas,
 * and then the same three as large figures. Both were real results of real
 * calls, both were correct, and together they said one thing twice while
 * looking like two things. Within a Work Unit a trusted fact gets ONE primary
 * representation.
 *
 * WHAT A FACT IS, DETERMINISTICALLY. A fact key is what a row measures:
 * the metric, the subject it is about, and the scope it was measured over
 * (window, filters, comparison). Two results overlap when their fact keys
 * overlap. Nothing here reads prose, and nothing here compares figures —
 * two results that measured the same fact are duplicates whether or not they
 * agree, and if they disagree that is a reconciliation for the receipts, not
 * a reason to draw both.
 *
 * WHICH ONE STAYS. The one with the finer grain. A result of ONE metric for
 * ONE scope is the atom the instruments are built from — three such atoms
 * become a performance instrument — so when a coarser result (several
 * metrics in one table) is wholly covered by atoms, the coarse one goes. When
 * two results have the same grain and the same keys, the earlier call stays:
 * the loop's duplicate guard already prevents identical calls, so this is the
 * rarer case of two different calls landing on one fact.
 *
 * WHAT IS NEVER DROPPED. A result with any fact nobody else shows. A result
 * whose keys cannot be read (no metric, no window) — it is kept, because
 * dropping what you cannot identify is dropping blind.
 */
import type { ResultSource } from './resultShape';

const SUBJECT_KEYS = ['subject', 'store', 'product', 'category', 'name', 'label', 'measure'];

/** The scope part of a fact key: what the row was measured over. */
function scopePart(source: ResultSource): string | null {
  const w = source.meta.window;
  if (!w) return null;
  const filters = source.arguments?.filters;
  const compare = source.arguments?.compare_to ?? (source.meta.comparison ? 'compared' : null);
  return JSON.stringify([
    w.kind ?? '', w.name ?? '', w.start ?? '', w.end ?? '',
    filters && typeof filters === 'object' ? filters : null,
    compare ?? null,
  ]);
}

/** The metric a source measured, from its own meta or its arguments. */
function metricOf(source: ResultSource, row: Record<string, unknown>): string | null {
  if (typeof row.measure === 'string' && row.measure) return row.measure;
  if (typeof source.meta.metric === 'string' && source.meta.metric) return source.meta.metric;
  const arg = source.arguments?.metric;
  return typeof arg === 'string' && arg ? arg : null;
}

function subjectOf(row: Record<string, unknown>): string {
  for (const k of SUBJECT_KEYS) {
    if (k === 'measure') continue;
    const v = row[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

/**
 * Every fact a result shows, or null when they cannot be read.
 */
export function factKeys(source: ResultSource): Set<string> | null {
  const scope = scopePart(source);
  if (!scope) return null;
  const keys = new Set<string>();
  for (const row of source.rows) {
    const metric = metricOf(source, row);
    if (!metric) return null;
    keys.add(JSON.stringify([metric, subjectOf(row), scope]));
  }
  return keys.size ? keys : null;
}

/** A result of exactly one metric — the atom instruments are built from. */
function isAtom(source: ResultSource, keys: Set<string>): boolean {
  const metrics = new Set([...keys].map((k) => (JSON.parse(k) as string[])[0]));
  return metrics.size === 1 && source.rows.length >= 1;
}

export interface Deduped {
  kept: ResultSource[];
  /** What was suppressed and by which seqs it is already shown. */
  suppressed: { seq: number; coveredBy: number[] }[];
}

export function dedupeSources(sources: ResultSource[]): Deduped {
  const keyed = sources.map((s) => ({ source: s, keys: factKeys(s) }));
  const suppressed: Deduped['suppressed'] = [];
  const dropped = new Set<number>();

  // 1. A coarse result wholly covered by atoms elsewhere goes.
  for (const { source, keys } of keyed) {
    if (!keys || isAtom(source, keys)) continue;
    const coverers: number[] = [];
    const covered = new Set<string>();
    for (const other of keyed) {
      if (other.source.seq === source.seq || !other.keys || !isAtom(other.source, other.keys)) continue;
      let hit = false;
      for (const k of other.keys) if (keys.has(k)) { covered.add(k); hit = true; }
      if (hit) coverers.push(other.source.seq);
    }
    if (covered.size === keys.size) {
      dropped.add(source.seq);
      suppressed.push({ seq: source.seq, coveredBy: coverers });
    }
  }

  // 2. Same keys twice, same grain: the earlier call stays.
  const seen = new Map<string, number>();
  for (const { source, keys } of keyed) {
    if (dropped.has(source.seq) || !keys) continue;
    const signature = [...keys].sort().join('|');
    const first = seen.get(signature);
    if (first !== undefined) {
      dropped.add(source.seq);
      suppressed.push({ seq: source.seq, coveredBy: [first] });
    } else {
      seen.set(signature, source.seq);
    }
  }

  return { kept: sources.filter((s) => !dropped.has(s.seq)), suppressed };
}
