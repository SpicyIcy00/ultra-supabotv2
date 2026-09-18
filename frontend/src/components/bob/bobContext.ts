/**
 * The context Bob is delivered through. See BobStreamProvider.tsx for
 * what it holds and why it sits above the routes; hooks/useBob.ts reads it.
 * A file of its own so the provider exports only a component.
 */
import { createContext } from 'react';
import type { BobState } from '../../types/bob';
import type { useBobStream } from '../../hooks/useBobStream';
import type { ComposerActivity, LiveActivity } from './presence';

type Stream = ReturnType<typeof useBobStream>;

export interface BobContext extends Stream {
  /** The mark's state: the stream's, or `listening` from the composer. */
  presence: BobState;
  /** What the newest turn is doing, from its frames. */
  live: LiveActivity;
  composer: ComposerActivity;
  setComposer: (activity: ComposerActivity) => void;
}

export const BobCtx = createContext<BobContext | null>(null);
