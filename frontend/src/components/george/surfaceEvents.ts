/**
 * The seam a UI event crosses to become a George instruction.
 *
 * WHY IT IS A SEAM AND NOT A STRING. Today a chip on a result carries a
 * pre-typed question and hands it to the composer (actionShape.ts). That works
 * and it does not generalise: a click on a row, a selection in a table, a
 * filter control and — later — a spoken phrase all have to arrive as the SAME
 * kind of thing, or each one grows its own way of turning pixels back into
 * language. So an event becomes a `SurfaceInstruction` first — an operation
 * and an argument, both taken from trusted state — and the instruction becomes
 * a question in exactly one place, here.
 *
 * NO DOM IS EVER READ. An instruction's subject is a value a tool returned, not
 * text scraped out of a cell; its dimension is one the definitions permit, not
 * a column header. The renderer passes ids and values it already holds
 * (`ResultSource`, `SurfaceAnchor`), which is why a voice layer can produce the
 * same instructions later without any of this changing.
 *
 * WHAT AN INSTRUCTION MAY NOT DO. It does not call a tool, choose a metric
 * formula, set a threshold, or reach the renderer. It is asked through the
 * ordinary loop, so its answer arrives with receipts, notices and a pin like
 * every other answer, and George remains free to refuse it.
 *
 * WHAT IS OFFERED IS WHAT THE DEFINITIONS ALLOW. `metrics.yaml` puts
 * `valid_group_by` and `drivers` on the result's meta; a refinement the
 * definitions would refuse is absent, not present-and-refusing. That is
 * actionShape's rule, and this keeps it — `actionShape` now delegates the
 * wording here so a chip and a row action cannot drift apart.
 */
import type { ToolMeta } from '../../types/george';
import type { ShapedResult } from './resultShape';
import { windowLabel } from './resultShape';
import type { SurfaceAnchor, SurfaceInstruction, SurfaceRefinement } from './surfaceModel';

/** The dimensions a person can be offered, in the words they are offered in. */
export const DIMENSION_WORD: Record<string, string> = {
  store: 'store',
  product: 'product',
  category: 'category',
};

/** A stable id for an instruction, so a refinement can be keyed and tested. */
export function instructionId(instruction: SurfaceInstruction): string {
  switch (instruction.op) {
    case 'explain':
      return 'explain';
    case 'break_down':
      return `break_down:${instruction.dimension}`;
    case 'compare_subject':
      return `compare_subject:${instruction.subject}`;
    case 'focus_subject':
      return `focus_subject:${instruction.subject}`;
    case 'compare_selection':
      return `compare_selection:${instruction.subjects.join('|')}`;
    case 'explain_selection':
      return `explain_selection:${instruction.subjects.join('|')}`;
  }
}

/** "A, B and C" — names copied verbatim from rows, joined for a sentence. */
export function joinSubjects(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The scope in business words, from trusted state only. */
export function scopeWords(meta: ToolMeta, subject?: string): string {
  const parts: string[] = [];
  if (subject) parts.push(`at ${subject}`);
  const w = windowLabel(meta);
  if (w) parts.push(w.toLowerCase());
  return parts.join(' ');
}

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The question an instruction becomes.
 *
 * BUSINESS WORDS, ALWAYS. No tool name, no argument name, no field name —
 * prompt rule 17 applies to what we put in the person's mouth as much as to
 * what George says back. The metric label and the window come off the meta the
 * tool returned; the subject is a value a row carried.
 */
export function instructionQuestion(
  instruction: SurfaceInstruction,
  meta: ToolMeta,
  anchor?: SurfaceAnchor,
): string {
  const label = (meta.metric_label ?? 'this').toLowerCase();
  const only = anchor && anchor.subjects.length === 1 ? anchor.subjects[0] : undefined;
  const scope = scopeWords(meta, only);
  const window = windowLabel(meta)?.toLowerCase() ?? '';

  switch (instruction.op) {
    case 'explain':
      return tidy(`Why did ${label} change ${scope}?`);
    case 'break_down':
      return tidy(
        `Show ${label} by ${DIMENSION_WORD[instruction.dimension] ?? instruction.dimension} ` +
          `${scope}, compared with the previous period`,
      );
    case 'compare_subject':
      return tidy(
        `Compare ${instruction.subject} with ${only ? only : 'the other stores'} ${window}, ` +
          `${label} against the previous period`,
      );
    case 'focus_subject':
      return tidy(
        `How did ${instruction.subject} do ${window}? Show ${label} compared with the previous period.`,
      );
    case 'compare_selection':
      // The selected subjects, named; the store they sit in when the work is
      // scoped to one, so a product comparison says where it is.
      return tidy(
        `Compare ${joinSubjects(instruction.subjects)} ${only ? `at ${only} ` : ''}${window}, ` +
          `${label} against the previous period`,
      );
    case 'explain_selection':
      return tidy(
        `Why did ${label} change for ${joinSubjects(instruction.subjects)} ${scope}?`,
      );
  }
}

/** The label a refinement wears. A closed vocabulary plus a trusted subject. */
export function instructionLabel(instruction: SurfaceInstruction): string {
  switch (instruction.op) {
    case 'explain':
      return 'Why?';
    case 'break_down':
      return `By ${DIMENSION_WORD[instruction.dimension] ?? instruction.dimension}`;
    case 'compare_subject':
      return `Compare ${instruction.subject}`;
    case 'focus_subject':
      return `Focus on ${instruction.subject}`;
    case 'compare_selection':
      return 'Compare these';
    case 'explain_selection':
      return 'Why these?';
  }
}

export function refinement(
  instruction: SurfaceInstruction,
  meta: ToolMeta,
  anchor?: SurfaceAnchor,
): SurfaceRefinement {
  return {
    id: instructionId(instruction),
    label: instructionLabel(instruction),
    instruction,
    question: instructionQuestion(instruction, meta, anchor),
  };
}

/** Refinements are restrained: the most useful first, and no more than this. */
export const MAX_REFINEMENTS = 4;

/**
 * What may be asked next of ONE primary result.
 *
 * `explain` needs a change to explain and the definitions' drivers to explain
 * it with; a breakdown needs the metric to permit that grouping. Both facts are
 * on the meta, put there by the tool from metrics.yaml. Nothing is decided from
 * a name, a guess, or prose.
 */
export function refinementsFor(
  result: ShapedResult,
  anchor?: SurfaceAnchor,
): SurfaceRefinement[] {
  const meta = result.source.meta;
  const compared = result.shape.kind === 'comparison' || result.shape.kind === 'ranking';
  const grouped = groupsOf(result);
  const scopedToOne = (anchor?.subjects.length ?? 0) === 1;
  const out: SurfaceInstruction[] = [];

  if (compared && (meta.drivers?.length ?? 0) > 0 && grouped.length === 0) {
    out.push({ op: 'explain' });
  }
  for (const dimension of ['store', 'product', 'category']) {
    if (!meta.valid_group_by?.includes(dimension) || grouped.includes(dimension)) continue;
    if (dimension === 'store' && scopedToOne) continue; // already one shop
    out.push({ op: 'break_down', dimension });
  }
  return out.slice(0, MAX_REFINEMENTS).map((i) => refinement(i, meta, anchor));
}

/** A row's own refinement: the same work, narrowed to that subject. */
export function subjectRefinement(
  result: ShapedResult,
  subject: string,
  anchor?: SurfaceAnchor,
): SurfaceRefinement | null {
  const dims = groupsOf(result).filter((g) => g in DIMENSION_WORD);
  if (!subject || dims.length === 0) return null;
  // A product or category has no scope filter in the definitions, so there is
  // nothing to narrow to; only a store can be focused.
  if (dims[0] !== 'store') return null;
  return refinement({ op: 'focus_subject', subject }, result.source.meta, anchor);
}

function groupsOf(result: ShapedResult): string[] {
  const g = result.source.arguments?.group_by;
  if (Array.isArray(g)) return g.map(String);
  if (typeof g === 'string' && g) return [g];
  return [];
}
