/**
 * The context George is delivered through. See GeorgeStreamProvider.tsx for
 * what it holds and why it sits above the routes; hooks/useGeorge.ts reads it.
 * A file of its own so the provider exports only a component.
 */
import { createContext } from 'react';
import type { GeorgeState } from '../../types/george';
import type { useGeorgeStream } from '../../hooks/useGeorgeStream';
import type { ComposerActivity, LiveActivity } from './presence';

type Stream = ReturnType<typeof useGeorgeStream>;

export interface GeorgeContext extends Stream {
  /** The mark's state: the stream's, or `listening` from the composer. */
  presence: GeorgeState;
  /** What the newest turn is doing, from its frames. */
  live: LiveActivity;
  composer: ComposerActivity;
  setComposer: (activity: ComposerActivity) => void;
}

export const GeorgeCtx = createContext<GeorgeContext | null>(null);
