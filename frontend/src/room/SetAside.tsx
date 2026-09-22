/**
 * SET IT ASIDE, WITH ONE TAP FOR WHY (W2.3).
 *
 * Three words — known, not important, wrong — and the tap on one IS the
 * dismissal: there is no second step asking why, because the button you
 * pressed said it. The reason is kept as a view you told Bob, so the next
 * time that kind of item about that thing comes round he leaves it out and
 * says so; the memory view shows it, and its Forget undoes it.
 *
 * "WRONG" IS NOT QUIETER. It says the figure may be wrong, so the item stays
 * and is marked, where everyone who sees it can see the doubt too.
 *
 * NEVER THE ACCENT (UI rule 5): setting something aside is not an approval.
 * Plain text actions, in the room's own quiet style.
 *
 * THREE RENDERINGS, NOT ONE (UI rule 8): the words while nothing is sent, the
 * words disabled while it is on its way, and what was kept once the server
 * said so — a confirmation drawn from the answer, never from the tap alone.
 * A failure puts the words back and says it did not take.
 */
import { useState } from 'react';
import { REASONS, dismiss, type Dismissable, type Dismissed, type Reason } from '../services/dismissalsApi';

type State =
  | { at: 'idle' }
  | { at: 'sending'; reason: Reason }
  | { at: 'kept'; result: Dismissed }
  | { at: 'failed' };

export function SetAside({ what, threadId, onKept, send = dismiss }: {
  what: Dismissable;
  threadId?: string | null;
  /** Told once the server kept it, so a list can fold the item away. */
  onKept?(result: Dismissed): void;
  /** The write; the route by default, a stub in a test. */
  send?(what: Dismissable, reason: Reason, threadId?: string | null): Promise<Dismissed>;
}) {
  const [state, setState] = useState<State>({ at: 'idle' });

  if (state.at === 'kept') {
    const r = state.result;
    return (
      <p className="r-setaside r-setaside--kept" data-reason={r.reason} role="status">
        {r.quiets
          ? <>Set aside as {r.reason === 'known' ? 'known' : 'not important'}. He will not raise this again; undo it in what he remembers.</>
          : <>Marked as maybe wrong. It stays, marked, until it is re-checked or undone in what he remembers.</>}
      </p>
    );
  }

  const take = (reason: Reason) => {
    setState({ at: 'sending', reason });
    void send(what, reason, threadId)
      .then((result) => { setState({ at: 'kept', result }); onKept?.(result); })
      .catch(() => setState({ at: 'failed' }));
  };

  return (
    <span className="r-setaside" data-state={state.at}>
      <span className="r-label">set aside:</span>
      {REASONS.map(({ reason, says }) => (
        <button
          key={reason}
          type="button"
          className="r-act"
          disabled={state.at === 'sending'}
          data-reason={reason}
          onClick={(e) => { e.stopPropagation(); take(reason); }}
        >
          {says}
        </button>
      ))}
      {state.at === 'failed' && (
        <span className="r-label" role="status">did not take — try again</span>
      )}
    </span>
  );
}
