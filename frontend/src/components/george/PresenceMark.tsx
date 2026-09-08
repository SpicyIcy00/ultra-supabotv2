/**
 * The current renderer of George's presence: the plum-blossom mark.
 *
 * This is the ONE place the shell and the workspace get their drawing of
 * George from, and the one file to change to give him another look
 * (presenceRenderer.ts). It draws the state it is handed and derives nothing;
 * the mark's own rules — form over hue in error, the sway rather than the
 * spin, the beat on a landing result — live in ReactiveMark and markState and
 * are untouched.
 */
import { ReactiveMark } from './ReactiveMark';
import type { PresenceProps, PresenceRenderer } from './presenceRenderer';

export const PresenceMark: PresenceRenderer = ({
  state,
  running,
  toolResults,
  thinking,
  lastResult,
  className,
}: PresenceProps) => (
  <ReactiveMark
    variant="mark"
    state={state}
    running={running}
    toolResults={toolResults}
    thinking={thinking}
    lastResult={lastResult}
    className={className}
  />
);
