/**
 * The work trail: the states of one investigation, in the order they happened.
 *
 *   The business → North Edsa → Why? → Products
 *
 * WHAT A STEP IS. A question somebody asked and the desk they asked it from —
 * both of which are on the question's own post, because the loop stores the
 * desk in its payload. So a step is SERVER TRUTH: reconstructed from the
 * river, restorable by recomposing, and identical after a reload. Nothing is
 * remembered on the client and nothing is a snapshot.
 *
 * THE ONE STEP THAT IS NOT STORED is the one being made now: a focus or a
 * selection the person has changed since they last asked anything. It is
 * marked `current`, it is never presented as history, and it becomes server
 * truth the moment they ask — which is exactly when it stops being current.
 *
 * WHY THIS IS NOT A TRANSCRIPT. A step carries the QUESTION and the SCOPE it
 * was asked in, not the answer; clicking one recomposes the workspace at that
 * state rather than scrolling to an old message. The current step dominates;
 * the rest are quieter and to the left of it. Nobody is reading messages.
 */
import type { DeskSelection } from '../../types/george';
import type { Surface } from '../george/surfaceCompose';
import type { DeskState } from './deskState';
import { selectionWords } from './deskState';
import { sameSubject, type Subject } from './subject';

export interface TrailStep {
  /** Stable: the unit's id for a stored step, a constant for the current one. */
  id: string;
  /** What was asked. Never a label invented for a step nobody named. */
  label: string;
  /** The subjects that step was scoped to, from its stored desk. */
  scope: string[];
  kind: 'stored' | 'current';
  /** Which step of the surface this is; null for the one being made now. */
  index: number | null;
  /** The selection to restore. Null restores nothing and clears. */
  selection: Subject[] | null;
}

/** The subjects a stored selection names, as the desk's own type. */
export function subjectsOfSelection(selection: DeskSelection | null | undefined): Subject[] {
  if (!selection || selection.subjects.length === 0) return [];
  return selection.subjects.map((s) => ({ dimension: selection.dimension, id: s.id, label: s.label }));
}

/** Whether two selections name the same subjects, in any order. */
export function sameSelection(a: Subject[], b: Subject[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => b.some((y) => sameSubject(x, y)));
}

/** The first step's name when nobody asked anything — the business itself. */
export const AT_REST_LABEL = 'The business';

/**
 * The trail of one piece of work, plus the state being made now.
 *
 * @param surface the work, composed from its posts. Null at rest.
 * @param state   what the person has done since they last asked.
 */
export function workTrail(surface: Surface | null, state: DeskState): TrailStep[] {
  const steps: TrailStep[] = [];

  if (!surface) {
    steps.push({ id: 'rest', label: AT_REST_LABEL, scope: [], kind: 'stored', index: null, selection: [] });
  } else {
    surface.steps.forEach((step, index) => {
      const selection = subjectsOfSelection(step.intent?.desk?.selection);
      steps.push({
        id: step.unit.id,
        label: step.intent?.text?.trim() || AT_REST_LABEL,
        scope: selection.map((s) => s.label),
        kind: 'stored',
        index,
        selection,
      });
    });
  }

  // What the person has changed since. Only when it differs from the newest
  // stored step, and only while they are looking at that newest step — a
  // selection made while browsing an EARLIER step is that step's, not a new
  // one, and would otherwise read as a step that came after it.
  const newest = steps[steps.length - 1];
  const looking = state.stepIndex === null || state.stepIndex === (newest?.index ?? null);
  const current = state.selection;
  if (looking && current.length > 0 && !sameSelection(current, newest?.selection ?? [])) {
    steps.push({
      id: 'current',
      label: selectionWords(state) ?? current[0].label,
      scope: current.map((s) => s.label),
      kind: 'current',
      index: null,
      selection: current,
    });
  }

  return steps;
}

/** Which step is being looked at: the one asked for, or the newest. */
export function activeStep(trail: TrailStep[], state: DeskState): TrailStep | undefined {
  if (state.stepIndex !== null) {
    const found = trail.find((s) => s.index === state.stepIndex);
    if (found) return found;
  }
  return trail[trail.length - 1];
}

/** A step's label, shortened for a breadcrumb without losing its sense. */
export const LABEL_MAX = 42;

export function shortLabel(step: TrailStep): string {
  const text = step.label.replace(/\s+/g, ' ').trim();
  if (text.length <= LABEL_MAX) return text;
  const cut = text.slice(0, LABEL_MAX).replace(/\s+\S*$/, '') || text.slice(0, LABEL_MAX);
  return `${cut.replace(/[ ,;:]+$/, '')}…`;
}
