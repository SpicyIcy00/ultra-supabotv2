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
 *   "waiting for the user"    (again, under its other name) an approval
 *                             pausing a run. Nothing pauses: see below.
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
  /**
   * Complete tool results already landed in the newest turn.
   *
   * This is what makes `building` a real state rather than a flattering one:
   * George is writing an answer AND there are rows on the way to the screen
   * that the surface will draw. Zero here means the answer is prose over
   * nothing, and the state stays `answering` — because that is all that is
   * happening.
   */
  figures?: number;
}

/** States a person typing may interrupt. A turn in flight is a louder fact. */
const AT_REST = new Set<GeorgeState>(['idle', 'error', 'complete']);

/** The mark's state. Same union the CSS classes are keyed on — no new hue. */
export function presenceState({ state, composer, figures = 0 }: PresenceInput): GeorgeState {
  if (composer !== 'idle' && AT_REST.has(state)) return 'listening';
  // The answer is being assembled over results that exist. Not a longer
  // `answering`: the figures are what the reader is waiting for, and they are
  // the part that arrives last.
  if (state === 'answering' && figures > 0) return 'building';
  return state;
}

export interface LiveActivity {
  /**
   * Calls in flight in the newest turn — tool and the arguments the loop
   * dispatched — for the narration line, which is built from them.
   */
  running: { tool: string; arguments: Record<string, unknown> }[];
  /** The newest completed call, so the line can say what came back. */
  lastResult: LastResult | null;
  /**
   * Every call that has COMPLETED in the newest turn, in the order the loop
   * dispatched them, with the arguments it sent. The desk's work line reads
   * these to say what George has done so far, in the same vocabulary
   * `describeCall` uses for what he is doing now — so watching a turn is one
   * sentence of business language and never a list of calls.
   */
  completed: { tool: string; arguments: Record<string, unknown> }[];
  /** The reasoning arriving now, raw; the components take the last clause. */
  thinking: string;
  /** How many results have landed in the newest turn — one beat each. */
  toolResults: number;
  /**
   * Of those, how many came back WHOLE and so will be drawn.
   *
   * A refused call and a result the loop could not send entire both land as
   * `toolResults` and neither reaches the surface, so counting them would
   * claim a result was being built out of nothing.
   */
  figures: number;
}

/**
 * What the newest turn is doing, derived from its frames and nothing else.
 *
 * Empty when the newest turn is not George's, or is finished: once a turn is
 * done the answer is the narration, and a stopped turn narrates nothing.
 */
export function liveActivity(turns: GeorgeTurn[]): LiveActivity {
  const none: LiveActivity = {
    running: [], lastResult: null, completed: [], thinking: '', toolResults: 0, figures: 0,
  };
  const last = turns[turns.length - 1];
  if (last?.role !== 'george' || last.done || last.cancelled) return none;

  const done = last.toolCalls.filter((c) => c.result);
  const newest = done.length ? done.reduce((a, b) => (b.seq > a.seq ? b : a)) : null;
  return {
    running: last.toolCalls
      .filter((c) => !c.result)
      .map((c) => ({ tool: c.tool, arguments: c.arguments })),
    lastResult: newest
      ? {
          tool: newest.tool,
          rowCount: newest.result?.row_count ?? null,
          error: newest.result?.error ?? null,
        }
      : null,
    completed: [...done]
      .sort((a, b) => a.seq - b.seq)
      .map((c) => ({ tool: c.tool, arguments: c.arguments })),
    thinking: last.thinking,
    toolResults: done.length,
    figures: done.filter(
      (c) => !c.result?.error && c.result?.rows_complete && (c.result?.rows?.length ?? 0) > 0,
    ).length,
  };
}
