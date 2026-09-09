/**
 * What a person has done to the desk, as a decision the suite can hold.
 *
 * TRANSIENT BY DESIGN. Selection, focus, the window a replay moved to, the
 * inspector and the trail step are view state over rows already on screen.
 * None of it is a source of truth: a reload rebuilds the work from its posts
 * and restores focus from what the newest question CARRIED (its stored desk),
 * never from anything the client kept. No localStorage, no route state.
 *
 * FOCUS IS ONE SELECTION. A click selects one subject and that is the focus;
 * a second selection makes a comparison; clearing makes nothing focused. One
 * value, so the two can never disagree about which subject is in the centre.
 *
 * NONE OF THESE CONSULT THE MODEL. Every action here is a change of view or a
 * request for a deterministic replay (metrics.yaml surface.desk
 * direct_manipulation); the page asks George for interpretation, and the
 * selection travels with the question as context (deskContextFor).
 */
import type { DeskContext, DeskDrawn, DeskWindow } from '../../types/george';
import type { DeskLayout } from './deskCompose';
import type { Surface } from '../george/surfaceCompose';
import { sameSubject, subjectFromLabel, type Dimension, type Subject } from './subject';

export type Inspect =
  | { kind: 'receipts'; seq: number }
  | { kind: 'subject'; subject: Subject }
  | { kind: 'notices' };

export interface DeskState {
  /** The subjects selected, in the order chosen. One is the focus. */
  selection: Subject[];
  /** The window a replay moved the work to, or null for the work's own. */
  window: DeskWindow | null;
  inspector: Inspect | null;
  /** An earlier step of the trail being looked at, or null for the latest. */
  stepIndex: number | null;
  /** The field drawn as its list equivalent. */
  listView: boolean;
}

export type DeskAction =
  | { type: 'focus'; subject: Subject }
  | { type: 'toggle'; subject: Subject }
  | { type: 'select'; subjects: Subject[] }
  | { type: 'clear' }
  | { type: 'back' }
  | { type: 'window'; window: DeskWindow | null }
  | { type: 'inspect'; target: Inspect | null }
  | { type: 'step'; index: number | null }
  | { type: 'list'; on: boolean }
  | { type: 'reset'; state?: Partial<DeskState> };

export const INITIAL_DESK: DeskState = {
  selection: [],
  window: null,
  inspector: null,
  stepIndex: null,
  listView: false,
};

/** The subject in the centre: exactly one selected, else none. */
export function focusOf(state: DeskState): Subject | null {
  return state.selection.length === 1 ? state.selection[0] : null;
}

export function isSelected(state: DeskState, subject: Subject): boolean {
  return state.selection.some((s) => sameSubject(s, subject));
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case 'focus':
      return { ...state, selection: [action.subject], inspector: null };
    case 'toggle': {
      // A selection is one dimension: choosing a product while stores are
      // selected starts a product selection rather than mixing the two.
      const same = state.selection.filter((s) => s.dimension === action.subject.dimension);
      const already = same.some((s) => sameSubject(s, action.subject));
      const selection = already
        ? same.filter((s) => !sameSubject(s, action.subject))
        : [...same, action.subject];
      return { ...state, selection, inspector: null };
    }
    case 'select':
      return { ...state, selection: action.subjects, inspector: null };
    case 'clear':
      return { ...state, selection: [], inspector: null };
    case 'back':
      // One level out. Anything open closes first; then the selection goes.
      if (state.inspector) return { ...state, inspector: null };
      if (state.selection.length > 0) return { ...state, selection: [] };
      if (state.window) return { ...state, window: null };
      return state;
    case 'window':
      return { ...state, window: action.window };
    case 'inspect':
      return { ...state, inspector: action.target };
    case 'step':
      return { ...state, stepIndex: action.index, inspector: null };
    case 'list':
      return { ...state, listView: action.on };
    case 'reset':
      return { ...INITIAL_DESK, ...(action.state ?? {}) };
  }
}

/**
 * The desk as the next question is sent with — or null for an empty desk.
 *
 * Ids and labels the rows carried, and the window. Nothing else: not what is
 * open, not which step is being looked at, and never a figure.
 */
export function deskContextFor(
  state: DeskState,
  layout?: DeskLayout | null,
  recommendation?: { ground: string; action: { question: string | null } } | null,
): DeskContext | null {
  const out: DeskContext = {};
  if (state.selection.length > 0) {
    out.selection = {
      dimension: state.selection[0].dimension,
      subjects: state.selection.map((s) => ({ id: s.id, label: s.label })),
    };
  }
  if (state.window) out.window = state.window;

  // WHAT IS ON SCREEN, WHETHER OR NOT ANYTHING IS SELECTED.
  //
  // A selection used to be the only thing on this channel, so a full
  // workspace with nothing clicked told George nothing at all — and the
  // short steers that matter most ("show me", "is that actually bad?")
  // refer to the workspace, not to the transcript. Read off the layout the
  // composer produced, capped by the definitions' own bound, and never a
  // figure: a representation, a dimension, subject NAMES, the metric's
  // display label, and whether the figures carry a comparison.
  if (layout) {
    const drawn = drawnFrom(layout);
    if (drawn) out.drawn = drawn;
    const marks = layout.attention
      .slice(0, MAX_ATTENTION)
      .map((a) => ({ subject: a.subject, reason: a.reason }));
    if (marks.length > 0) out.attention = marks;
  }
  if (recommendation) {
    out.recommendation = {
      ground: recommendation.ground,
      question: recommendation.action.question,
    };
  }

  return out.selection || out.window || out.drawn || out.attention || out.recommendation
    ? out
    : null;
}

/** The definitions cap this at 6; the server refuses past its own copy. */
const MAX_ATTENTION = 6;
/** And this at 12 — the same bound a selection has. */
const MAX_DRAWN = 12;

/**
 * The layout as the four facts George needs to know what he is looking at.
 *
 * Names only. The subjects are the labels already drawn on screen, which came
 * off rows the tools returned; the metric label is the tool's own
 * `metric_label`; the representation is the one the composer chose. Nothing
 * is parsed out of prose and nothing is a value.
 */
function drawnFrom(layout: DeskLayout): DeskDrawn | null {
  const stage = layout.stage;
  const field =
    stage.kind === 'field' ? stage.field
      : stage.kind === 'anatomy' ? stage.breakdown
        : stage.kind === 'compare' ? stage.fields[0] ?? null
          : null;

  const subjects =
    stage.kind === 'anatomy'
      ? [stage.anatomy.subject.label, ...(stage.breakdown?.objects.map((o) => o.subject.label) ?? [])]
      : stage.kind === 'compare'
        ? stage.subjects.map((s) => s.subject.label)
        : field
          ? field.objects.map((o) => o.subject.label)
          : [];

  const representation =
    stage.kind === 'field' ? stage.field.representation
      : stage.kind === 'anatomy' ? stage.breakdown?.representation ?? 'anatomy'
        : stage.kind === 'compare' ? stage.fields[0]?.representation ?? 'compare'
          : stage.kind;

  const meta = layout.headlineMeta;
  const metricLabel = typeof meta?.metric_label === 'string' ? meta.metric_label : null;
  const compared = Boolean(meta?.comparison?.baseline);

  if (stage.kind === 'statement' && subjects.length === 0 && !metricLabel) return null;

  const subjectDimension =
    stage.kind === 'anatomy' ? stage.anatomy.subject.dimension
      : stage.kind === 'compare' ? stage.subjects[0]?.subject.dimension ?? null
        : null;

  return {
    representation,
    dimension: field?.dimension ?? subjectDimension,
    subjects: [...new Set(subjects)].slice(0, MAX_DRAWN),
    metric_label: metricLabel,
    compared,
  };
}

/**
 * The state a piece of work is opened in, from what its questions carried.
 *
 * The newest question with a selection decides: one subject focuses it, more
 * compare them. Nothing is guessed from prose and nothing is remembered on
 * the client — this is the stored desk of a stored post, so a reload lands
 * on the same focus a person had when they last asked.
 */
export function restoreDeskState(surface: Surface | null): DeskState {
  if (!surface) return INITIAL_DESK;
  for (let i = surface.steps.length - 1; i >= 0; i--) {
    const sel = surface.steps[i].intent?.desk?.selection;
    if (sel && sel.subjects.length > 0) {
      return {
        ...INITIAL_DESK,
        selection: sel.subjects.map((s) => ({ dimension: sel.dimension as Dimension, id: s.id, label: s.label })),
      };
    }
  }
  return INITIAL_DESK;
}

/** The selection in a few words, for the line and the trail. */
export function selectionWords(state: DeskState): string | null {
  const n = state.selection.length;
  if (n === 0) return null;
  if (n === 1) return state.selection[0].label;
  if (n <= 3) return state.selection.map((s) => s.label).join(', ');
  const noun = state.selection[0].dimension === 'category' ? 'categories' : `${state.selection[0].dimension}s`;
  return `${n} ${noun}`;
}

/** A subject from a stored selection entry, for tests and the trail. */
export function subjectOf(dimension: Dimension, id: string, label?: string): Subject {
  return label ? { dimension, id, label } : subjectFromLabel(dimension, id);
}
