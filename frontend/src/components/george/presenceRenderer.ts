/**
 * The seam between George's STATE and George's LOOK.
 *
 * The state model is settled and truthful: presence.ts turns the stream's
 * frames and the composer's activity into one GeorgeState, and refuses to
 * invent any state that has no frame behind it. That model is stable.
 *
 * The RENDERER is not. Today the state is drawn as the plum-blossom mark
 * (ReactiveMark). It may later be drawn as a morphing form, an orb, or another
 * identity altogether — and none of that may touch what the states ARE or when
 * they occur. So the contract a renderer must meet is named here, once, and the
 * shell and the workspace mount a renderer through it rather than importing a
 * drawing by name. Swapping the look is then a change to one file
 * (PresenceMark.tsx), held by a test that the shell and the pages never reach
 * past the seam.
 *
 * WHAT A RENDERER RECEIVES: the state, and the live facts a label may be built
 * from — the calls in flight, the newest result, how many results have landed,
 * the reasoning so far. WHAT IT MAY NOT DO: derive a state of its own. It draws
 * the one it is given.
 */
import type { ReactNode } from 'react';
import type { GeorgeState } from '../../types/george';
import type { CallLike, LastResult } from './cognition';

export interface PresenceProps {
  state: GeorgeState;
  running?: CallLike[];
  toolResults?: number;
  thinking?: string;
  lastResult?: LastResult | null;
  /** Size, for a renderer that takes one. */
  className?: string;
}

export type PresenceRenderer = (props: PresenceProps) => ReactNode;
