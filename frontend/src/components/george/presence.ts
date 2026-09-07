/**
 * What the mark is allowed to show, from what is actually happening.
 *
 * Kept apart from the components for the same reason markState.ts and
 * approvalState.ts are: the suite holds these decisions without a DOM, and
 * the mark is the one place in the app where a state could be invented and
 * look convincing.
 *
 * REAL STATES ONLY. Every value returned here is backed by a signal that
 * exists: a frame the loop emitted, a request the browser sent, or a thing
 * the person is doing in the composer. The states the design imagined and
 * this file refuses to draw are as important as the ones it draws:
 *
 *   "waiting for the user"    the loop never pauses for input; there is no
 *                             frame for it, so there is no state for it.
 *   "waiting for approval"    a fact about the QUEUE, not about George's
 *                             execution. It is the badge beside the mark
 *                             (approvalState), and it never touches the mark
 *                             — UI rule 5, amended 2026-09-04: the mark's
 *                             error state must never add orange, and neither
 *                             may anything else.
 *
 * LISTENING IS A FRONTEND FACT. The person has the composer focused, or has
 * typed something they have not sent. That is real: George is being addressed.
 * It shows only when he is otherwise at rest — a turn in flight is a louder
 * fact than a cursor in a box — and it lifts an error, because starting to
 * type is the person moving on from it.
 */
import type { GeorgeState, GeorgeTurn } from '../../types/george';
import type { LastResult } from './cognition';

export type ComposerActivity = 'idle' | 'focused' | 'drafting';

export interface PresenceInput {
  /** The stream's own state, from useGeorgeStream. */
  state: GeorgeState;
  composer: ComposerActivity;
}

/** The mark's state. Same union the CSS classes are keyed on — no new hue. */
export function presenceState({ state, composer }: PresenceInput): GeorgeState {
  if (composer !== 'idle' && (state === 'idle' || state === 'error')) return 'listening';
  return state;
}

export interface LiveActivity {
  /** Tools in flight in the newest turn, for the narration line. */
  running: string[];
  /** The newest completed call, so the line can say what came back. */
  lastResult: LastResult | null;
  /** The reasoning arriving now, raw; the components take the last clause. */
  thinking: string;
  /** How many results have landed in the newest turn — one beat each. */
  toolResults: number;
}

/**
 * What the newest turn is doing, derived from its frames and nothing else.
 *
 * Empty when the newest turn is not George's, or is finished: once a turn is
 * done the answer is the narration, and a stopped turn narrates nothing.
 */
export function liveActivity(turns: GeorgeTurn[]): LiveActivity {
  const none: LiveActivity = { running: [], lastResult: null, thinking: '', toolResults: 0 };
  const last = turns[turns.length - 1];
  if (last?.role !== 'george' || last.done || last.cancelled) return none;

  const done = last.toolCalls.filter((c) => c.result);
  const newest = done.length ? done.reduce((a, b) => (b.seq > a.seq ? b : a)) : null;
  return {
    running: last.toolCalls.filter((c) => !c.result).map((c) => c.tool),
    lastResult: newest
      ? {
          tool: newest.tool,
          rowCount: newest.result?.row_count ?? null,
          error: newest.result?.error ?? null,
        }
      : null,
    thinking: last.thinking,
    toolResults: done.length,
  };
}
