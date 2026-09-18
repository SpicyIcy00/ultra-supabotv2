/**
 * One Bob, above the routes.
 *
 * The stream hook is mounted HERE, once, so an answer keeps arriving while
 * the person moves from Ask to Inbox and back. Until 2026-09-07 it was
 * mounted inside the river page, and leaving the page aborted the request:
 * Bob stopped existing whenever you looked elsewhere.
 *
 * WHAT THIS IS AND IS NOT. It is persistent ownership of one live HTTP
 * response in the browser, and nothing more. The backend has no background
 * job: if this provider unmounts, the request is aborted like any other.
 * Logout does exactly that — SessionGuard keys its subtree on the session
 * revision, so a new session gets a new provider with nothing in it, and the
 * old request dies with the old one. Nothing here survives a reload either,
 * and nothing pretends to.
 *
 * THE COMPOSER TELLS THE MARK. Whether the person is addressing Bob —
 * focused on the box, or holding an unsent draft — is a real fact, and the
 * presence model turns it into `listening` only while Bob is otherwise
 * at rest. The composer reports; presence.ts decides.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useBobStream } from '../../hooks/useBobStream';
import { BobCtx, type BobContext } from './bobContext';
import { liveActivity, presenceState, type ComposerActivity } from './presence';

export function BobStreamProvider({ children }: { children: ReactNode }) {
  const stream = useBobStream();
  const [composer, setComposer] = useState<ComposerActivity>('idle');

  const live = useMemo(() => liveActivity(stream.turns), [stream.turns]);
  const presence = presenceState({ state: stream.state, composer, figures: live.figures });

  const value = useMemo<BobContext>(
    () => ({ ...stream, presence, live, composer, setComposer }),
    [stream, presence, live, composer],
  );

  return <BobCtx.Provider value={value}>{children}</BobCtx.Provider>;
}
