/**
 * What a result lets you do next — and only what the definitions permit.
 *
 * OPERABLE OUTPUT WITHOUT A SECOND DATA PATH. An action here is a pre-typed
 * QUESTION in business words, asked through the ordinary loop, so its answer
 * arrives with receipts, notices and a pin like any other. Nothing runs a
 * tool directly and nothing bypasses validation.
 *
 * VALID BY DEFINITIONS, OR ABSENT. get_sales puts `valid_group_by` and
 * `drivers` on its meta, read from metrics.yaml. "By store" is offered only
 * when the metric may be grouped by store; "Why?" only when the metric
 * declares drivers and was compared. A follow-up the definitions would refuse
 * is not offered — absent, not present-and-refusing. Nothing here is decided
 * from a name, a guess, or prose.
 *
 * RESTRAINED. At most four, the most useful first. Pin is not here: it is the
 * one save gesture and keeps its own control (ResultActions).
 */
import type { ToolMeta } from '../../types/george';
import type { ShapedResult } from './resultShape';
import { windowLabel } from './resultShape';

export interface ContextAction {
  label: string;
  question: string;
}

const DIMENSION_WORD: Record<string, string> = {
  store: 'store',
  product: 'product',
  category: 'category',
};

function storeOf(result: ShapedResult): string | undefined {
  const f = result.source.arguments?.filters;
  const store = f && typeof f === 'object' ? (f as Record<string, unknown>).store : undefined;
  return typeof store === 'string' && store ? store : undefined;
}

function groups(result: ShapedResult): string[] {
  const g = result.source.arguments?.group_by;
  if (Array.isArray(g)) return g.map(String);
  if (typeof g === 'string') return [g];
  return [];
}

/** The scope in words, for the question: "at Rockwell last week". */
function scopeWords(meta: ToolMeta, store?: string): string {
  const parts: string[] = [];
  if (store) parts.push(`at ${store}`);
  const w = windowLabel(meta);
  if (w) parts.push(w.toLowerCase());
  return parts.join(' ');
}

/**
 * The actions for one PRIMARY result.
 *
 * `compared` is whether the result carried a comparison — "why?" needs a
 * change to explain, and the definitions' drivers to explain it with.
 */
export function actionsFor(result: ShapedResult): ContextAction[] {
  const meta = result.source.meta;
  const label = (meta.metric_label ?? 'this').toLowerCase();
  const store = storeOf(result);
  const scope = scopeWords(meta, store);
  const grouped = groups(result);
  const compared = result.shape.kind === 'comparison' || result.shape.kind === 'ranking';
  const out: ContextAction[] = [];

  if (compared && (meta.drivers?.length ?? 0) > 0 && grouped.length === 0) {
    out.push({ label: 'Why?', question: `Why did ${label} change ${scope}?`.replace(/\s+/g, ' ').trim() });
  }
  for (const dim of ['store', 'product', 'category']) {
    if (!meta.valid_group_by?.includes(dim) || grouped.includes(dim)) continue;
    if (dim === 'store' && store) continue; // already one store
    const word = DIMENSION_WORD[dim];
    out.push({
      label: `By ${word}`,
      question: `Show ${label} by ${word} ${scope}${compared ? ', compared with the previous period' : ''}`.replace(/\s+/g, ' ').trim(),
    });
  }
  return out.slice(0, 4);
}

/** A row's own action: the same question, narrowed to that subject. */
export function subjectAction(result: ShapedResult, subject: string): ContextAction | null {
  const meta = result.source.meta;
  const dims = groups(result).filter((g) => g in DIMENSION_WORD);
  if (!subject || dims.length === 0) return null;
  const label = (meta.metric_label ?? 'this').toLowerCase();
  const w = windowLabel(meta);
  const dim = dims[0];
  if (dim !== 'store') return null; // a product or category has no scope filter in the definitions
  return {
    label: `Focus on ${subject}`,
    question: `How did ${subject} do ${w ? w.toLowerCase() : ''}? Show ${label} compared with the previous period.`.replace(/\s+/g, ' ').trim(),
  };
}
