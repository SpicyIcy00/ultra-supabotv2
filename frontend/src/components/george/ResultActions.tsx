/**
 * What you can do with a finished result.
 *
 * ONE CONTROL, AND IT IS THE ONE THAT EXISTS. A result that is worth keeping
 * becomes a tile that re-runs, and that is Pin. There is no toolbar, no row of
 * icons, no export, no duplicate and no share-sheet: every one of those would
 * be either a promise the backend cannot keep or a second way to do something
 * there is already one way to do (UI rule 2 — one save gesture, everywhere).
 *
 * WHY IT IS NOT LABELLED "Save". CLAUDE.md fixes six words with six meanings
 * and forbids synonyms: a PIN re-runs an answer as a tile; a SAVE turns logic
 * into a versioned rule, which is a workflow with steps, parameters and a
 * promotion gate. This control creates a pin. Calling it Save would make the
 * two words mean one thing on the surface where a person first meets both,
 * and the vocabulary is load-bearing — Workflows, Inbox and the approval queue
 * are all built on the distinction.
 *
 * A workflow is still saved the way it always was: by asking George, in the
 * thread, which routes through the injected writer and the promotion gate.
 * There is no button here that could bypass either.
 *
 * STEPPED BACK UNTIL WANTED. Right-aligned, slate, no border, no fill — the
 * figures are the answer and the control is not. Nothing here may wear the
 * approvals colour (UI rule 5): pinning is something you chose to do, not
 * something waiting on you.
 */
import type { PinToolCall } from '../../types/pins';
import { PinButton } from './PinButton';

/**
 * ONE ROW FOR A LIVE TURN AND FOR A STORED POST. The turn hands over the
 * calls from its frames; the post hands over the calls the loop persisted
 * beside its snapshot (postShape.storedCalls), and a post that has none —
 * every post written before 2026-09-07 — hands over nothing and gets no row.
 * Nothing here builds a call from anything else.
 */
export function ResultActions({
  calls,
  question,
  conversationId,
}: {
  calls: PinToolCall[];
  question?: string;
  conversationId?: string | null;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <PinButton calls={calls} question={question} conversationId={conversationId} />
    </div>
  );
}
