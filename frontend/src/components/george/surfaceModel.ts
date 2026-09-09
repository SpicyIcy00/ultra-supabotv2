/**
 * The Surface Model — George's vocabulary for the WORK IN FRONT OF YOU.
 *
 * WHY THIS EXISTS. George has a rigorous vocabulary for what a NUMBER is
 * (inferShape), for how several numbers COMPOSE (resultShape), for what each
 * read WAS (composeWork, from the validated `finding` frame) and for what one
 * exchange is (workUnit). He has had none for the thing a person is actually
 * looking at: a piece of work with a subject, a period, a goal, and a history
 * of refinements. Without it, "Why?" could only ever produce a second answer
 * beneath the first, because there was no object for it to change.
 *
 * WHAT A SURFACE PLAN IS, AND WHAT IT CAN NEVER BE. A plan is a DECLARATION of
 * meaning composed out of results that already ran: which trusted result is the
 * primary fact, which support it, which are merely context, what the work is
 * anchored to, and what may be asked next. It is data, and it is deliberately
 * incapable of carrying presentation:
 *
 *   - no JSX, no HTML, no CSS, no SVG, no component names, no colours, no
 *     dimensions — `surfaceViolations` fails a plan that contains any of them;
 *   - no figure of its own. Every number on screen comes from a `ResultSource`
 *     the tools returned, referenced by seq. The composer authors only labels,
 *     and every label it authors is either a closed-vocabulary word or a token
 *     copied verbatim from trusted meta (a subject name, a metric label, a
 *     window label). `surfaceViolations` proves that too.
 *
 * NOTHING HERE COMES FROM THE MODEL, and nothing here comes from prose. The
 * model's only channel into composition is the `finding` frame — an integer
 * and one of four words, validated server-side against the executed set and
 * metrics.yaml (agent/findings.py). Everything else on a plan is derived from
 * the arguments a tool accepted and the meta it returned.
 *
 * WHY IT IS NOT AN EXTERNAL PROTOCOL. See ops/GENERATIVE_WORKSPACE_V3.md for
 * the AG-UI / A2UI / CopilotKit evaluation. The short version: A2UI's
 * declarative-UI idea is right and its implementation is the wrong shape here,
 * because a component tree authored by the model is exactly the reach this
 * file forbids. What is adopted is the CONCEPT — a typed, validated surface
 * declaration — over trusted primitives we already own.
 */
import type { GeorgeNotice, ToolMeta } from '../../types/george';
import type { SectionRole } from './composeWork';
import type { ResultBlock, ResultSource } from './resultShape';

/* ------------------------------------------------------------------ anchor -- */

/**
 * What a piece of work IS ABOUT — its identity, not its shape.
 *
 * Two reads with the same anchor are the same work seen differently; two with
 * different anchors are different work. The split matters because refinement
 * changes shape constantly ("why", "compare", "by product") and almost never
 * changes identity, and until this existed every change of shape started a new
 * answer (workUnit.continuesWork, which compared the whole scope at once).
 *
 * `subjects` is deliberately NOT identity on its own — see surfaceAnchor.ts.
 * An empty list means the whole estate in scope, which is a real value and not
 * a missing one.
 */
export interface SurfaceAnchor {
  /** The business the figures belong to. Never inferred from a name. */
  business: string;
  /** The subjects the work is scoped to, sorted. Empty = the whole estate. */
  subjects: string[];
  /** Which dimension those subjects are, when they came from a grouping. */
  subjectDimension: string | null;
  /** The measured window, from meta.window — never worked out here. */
  window: { kind?: string; name?: string; start?: string; end?: string } | null;
  /** Every filter that is not the subject filter, as the tool accepted it. */
  filters: Record<string, unknown>;
}

/** What the work is trying to do. Derived from roles and shapes, never prose. */
export type SurfaceGoal =
  | 'performance'
  | 'investigation'
  | 'comparison'
  | 'breakdown'
  | 'listing'
  | 'statement';

export const SURFACE_GOALS: readonly SurfaceGoal[] = [
  'performance', 'investigation', 'comparison', 'breakdown', 'listing', 'statement',
];

/** What a goal is CALLED. A closed vocabulary; never the model's words. */
export const GOAL_LABEL: Record<SurfaceGoal, string> = {
  performance: 'Performance',
  investigation: 'Why it moved',
  comparison: 'Compared',
  breakdown: 'Broken down',
  listing: 'The figures',
  statement: 'The answer',
};

/* ----------------------------------------------------------------- sections -- */

/**
 * How much of the screen a section has earned.
 *
 * `primary` is the answer. `supporting` is evidence the answer rests on and is
 * drawn in full beneath it. `context` was read, is true, and is not what was
 * asked — it is named and folded, never dropped, because dropping a read the
 * receipts record would be hiding work that happened.
 */
export type SurfaceRank = 'primary' | 'supporting' | 'context';

export const SURFACE_RANKS: readonly SurfaceRank[] = ['primary', 'supporting', 'context'];

/** The instruments a section may be drawn with. A CLOSED set. */
export type SurfaceInstrument = 'driver_split' | 'performance';

export interface SurfaceSectionPlan {
  role: SectionRole;
  rank: SurfaceRank;
  /** The definitions' word for the rung. Closed vocabulary (composeWork). */
  label: string;
  blocks: ResultBlock[];
  instrument?: SurfaceInstrument;
  /** The definitions' identity sentence for the drivers, when there is one. */
  identity?: string | null;
  /**
   * Folded behind a line that names it. True only for `context` that is
   * broader than the anchor — the unnecessary chain comparison case.
   */
  folded: boolean;
}

/* ---------------------------------------------------------------- attention -- */

/**
 * A row the DATA singles out. No score, no threshold, no severity.
 *
 * The only two things that can put a subject here are facts the tools
 * established: it moved against the direction the majority moved in
 * (instrumentShape.majorityDirection), or the tool itself ranked it first
 * under a change ranking it performed. Nothing is computed here and nothing is
 * invented; `reason` is one of two fixed words.
 */
export interface SurfaceAttention {
  subject: string;
  reason: 'against_the_majority' | 'ranked_first';
  direction: 'up' | 'down' | 'flat' | null;
  /** Which section it was found in, so the renderer never has to search. */
  role: SectionRole;
}

/* -------------------------------------------------------------- refinements -- */

/**
 * A semantic instruction — the seam a click, a row selection or (later) a
 * spoken phrase becomes.
 *
 * IDS AND TRUSTED STATE, NEVER THE DOM. Each carries values taken from the
 * anchor and from tool meta, so nothing is ever recovered by reading pixels or
 * by re-parsing prose. `surfaceEvents.instructionQuestion` turns one into the
 * business-language question George is actually asked, deterministically.
 */
export type SurfaceInstruction =
  | { op: 'explain' }
  | { op: 'break_down'; dimension: string }
  | { op: 'compare_subject'; subject: string }
  | { op: 'focus_subject'; subject: string };

export const SURFACE_OPS: readonly SurfaceInstruction['op'][] = [
  'explain', 'break_down', 'compare_subject', 'focus_subject',
];

export interface SurfaceRefinement {
  /** Stable within a plan: the op plus its argument. */
  id: string;
  label: string;
  instruction: SurfaceInstruction;
  /** The question the instruction becomes. Business words, no tool vocabulary. */
  question: string;
}

/* ---------------------------------------------------------------- the plan -- */

/**
 * A source, renumbered so seqs are unique ACROSS the surface's steps.
 *
 * The loop numbers calls from zero within one `run()`, so a surface of three
 * turns holds three call 1s. Everything downstream — the dedupe, the role map,
 * the block builder — keys on `seq`, so the union is renumbered before any of
 * it runs. `unitId` and `localSeq` keep the way back for the receipts and for
 * the pin, neither of which may be told a number the loop did not assign.
 */
export interface SurfaceSource extends ResultSource {
  unitId: string;
  localSeq: number;
}

export interface SurfacePlan {
  /** The surface's identity: the id of the work unit that opened it. */
  id: string;
  anchor: SurfaceAnchor;
  goal: SurfaceGoal;
  /** Closed vocabulary plus trusted tokens. Never a sentence the model wrote. */
  title: string;
  sections: SurfaceSectionPlan[];
  attention: SurfaceAttention[];
  refinements: SurfaceRefinement[];
  notices: GeorgeNotice[];
  /** Every source drawn on this surface, after cross-step deduplication. */
  evidence: SurfaceSource[];
  /** What was read and is already shown elsewhere, with what shows it. */
  suppressed: { seq: number; coveredBy: number[] }[];
  /** The fallback receipts, used only when nothing at all was drawn. */
  receipts?: ToolMeta;
}

/* --------------------------------------------------------------- validation -- */

/**
 * Markup, style and geometry, in every form a string could smuggle them.
 *
 * The composer has no reason to produce any of these, which is the point: the
 * check is cheap and it fails loudly the day somebody decides a label would
 * read better with a span in it.
 */
const FORBIDDEN: RegExp[] = [
  /<\/?[a-z][\s\S]*>/i,                   // a tag
  /&lt;|&gt;/,                            // an escaped tag
  /\bstyle\s*=/i,
  /\bclassName\b|\bclass\s*=/,
  /#[0-9a-fA-F]{3,8}\b/,                  // a hex colour
  /\brgba?\(|\bhsla?\(/i,                 // a functional colour
  /\b\d+(\.\d+)?(px|rem|em|vh|vw)\b/i,    // a dimension
  /javascript:/i,
  /\bReact\b|\buseState\b|=>/,
];

/** Which fields of a plan the COMPOSER authored, as opposed to copied whole. */
export function authoredStrings(plan: SurfacePlan): string[] {
  const out: string[] = [plan.title, plan.goal, plan.anchor.business];
  for (const s of plan.sections) out.push(s.label, s.role, s.rank, s.instrument ?? '');
  for (const a of plan.attention) out.push(a.subject, a.reason);
  for (const r of plan.refinements) out.push(r.id, r.label, r.question);
  return out.filter((s) => typeof s === 'string' && s.length > 0);
}

/**
 * The tokens a plan is allowed to have copied: subject names, metric labels,
 * window labels and the anchor's own values. Anything else in an authored
 * string must come from a closed vocabulary.
 */
export interface TrustedVocabulary {
  subjects: Set<string>;
  labels: Set<string>;
  windows: Set<string>;
}

const SUBJECT_ROW_KEYS = ['subject', 'store', 'product', 'category', 'name'];

export function trustedVocabulary(plan: SurfacePlan): TrustedVocabulary {
  const subjects = new Set<string>(plan.anchor.subjects);
  const labels = new Set<string>();
  const windows = new Set<string>();
  if (plan.anchor.window?.name) windows.add(plan.anchor.window.name);
  for (const source of plan.evidence) {
    if (source.meta.metric_label) labels.add(source.meta.metric_label);
    if (source.meta.metric) labels.add(source.meta.metric);
    const w = source.meta.window;
    if (w?.name) windows.add(w.name);
    if (w?.start) windows.add(w.start);
    if (w?.end) windows.add(w.end);
    for (const row of source.rows) {
      for (const key of SUBJECT_ROW_KEYS) {
        const v = row[key];
        if (typeof v === 'string' && v) subjects.add(v);
      }
    }
  }
  return { subjects, labels, windows };
}

/**
 * Every digit run in a string the trusted vocabulary does not account for.
 *
 * THE RULE THIS HOLDS. The composer may not put a business figure on screen.
 * It has no arithmetic in it at all, so the honest check is the strict one: an
 * authored string may carry a numeral only when that exact numeral is part of
 * a trusted token it copied — a window date, or a subject named "Store 3".
 */
export function unaccountedNumerals(text: string, vocab: TrustedVocabulary): string[] {
  const accounted = [...vocab.subjects, ...vocab.labels, ...vocab.windows].join(' ');
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).filter((n) => !accounted.includes(n));
}

/**
 * What is wrong with a plan, as a list of sentences. Empty means it is sound.
 *
 * Held by the suite rather than by review, for the same reason accentUse.test
 * scans the source: the failure mode here is a small convenience added months
 * later that nobody reads as a violation.
 */
export function surfaceViolations(plan: SurfacePlan): string[] {
  const out: string[] = [];
  const vocab = trustedVocabulary(plan);
  const drawn = new Set(plan.evidence.map((s) => s.seq));

  for (const text of authoredStrings(plan)) {
    for (const pattern of FORBIDDEN) {
      if (pattern.test(text)) out.push(`markup, style or geometry in an authored string: ${text}`);
    }
    for (const n of unaccountedNumerals(text, vocab)) {
      out.push(`a figure the evidence does not carry: ${n} in "${text}"`);
    }
  }

  if (!SURFACE_GOALS.includes(plan.goal)) out.push(`${plan.goal} is not a goal`);
  for (const s of plan.sections) {
    if (!SURFACE_RANKS.includes(s.rank)) out.push(`${s.rank} is not a rank`);
    if (s.instrument && s.instrument !== 'driver_split' && s.instrument !== 'performance') {
      out.push(`${s.instrument} is not an instrument`);
    }
    if (s.blocks.length === 0) out.push(`section ${s.role} was planned with nothing in it`);
    for (const block of s.blocks) {
      const members = block.kind === 'group' ? block.members : [block.result];
      for (const m of members) {
        if (!drawn.has(m.source.seq)) {
          out.push(`a block draws call ${m.source.seq}, which is not evidence`);
        }
      }
    }
  }
  for (const a of plan.attention) {
    if (!vocab.subjects.has(a.subject)) {
      out.push(`attention names ${a.subject}, which no result returned`);
    }
  }
  for (const r of plan.refinements) {
    if (!SURFACE_OPS.includes(r.instruction.op)) {
      out.push(`${r.instruction.op} is not an operation`);
    }
  }
  return out;
}
