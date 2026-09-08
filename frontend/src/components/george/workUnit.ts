/**
 * A piece of work, as one thing.
 *
 * George has a rigorous vocabulary for what a NUMBER is — inferShape decides
 * what a result may be drawn as, resultShape decides how several results
 * compose, and every figure carries the meta of the call behind it. He has had
 * no vocabulary at all for what a piece of WORK is: a question, everything he
 * did about it, and the answer, as a single object with internal structure.
 * This file is that vocabulary.
 *
 * It starts with one function, because Stage 0 needs one function. The
 * normalisation of a live turn and a stored post into a single `WorkUnit` —
 * so the live-to-stored handoff changes a FIELD rather than swapping one
 * component subtree for another — arrives here next.
 */
import type { GeorgeTurn } from '../../types/george';

/**
 * How much of this work has arrived, as a value that changes when it grows.
 *
 * WHAT IT IS FOR. useAutoFollow keeps the viewport with content that is
 * growing, and it needs to know when the content grew. The obvious signal is
 * the turns array itself, which is referentially new on every streamed delta —
 * but it is also referentially new on renders that changed nothing a reader
 * can see, and each of those would move the page.
 *
 * SO IT MEASURES WHAT IS ON SCREEN, NOT WHAT WAS RECEIVED. Characters written,
 * results landed, notices raised, confirmations made. `thinking` is
 * deliberately absent: it streams into a fixed-height line inside the activity
 * disclosure and does not change the height of anything, so following it would
 * scroll the page for content that did not move.
 */
export function streamSignal(turns: GeorgeTurn[]): string {
  let chars = 0;
  let results = 0;
  let notes = 0;
  for (const turn of turns) {
    if (turn.role === 'user') {
      chars += turn.text.length;
      continue;
    }
    chars += turn.text.length + (turn.superseded?.length ?? 0);
    results += turn.toolCalls.length;
    for (const call of turn.toolCalls) if (call.result) results += 1;
    notes +=
      turn.notices.length +
      turn.pinned.length +
      turn.saved.length +
      turn.pageChanges.length +
      (turn.done ? 1 : 0) +
      (turn.error ? 1 : 0) +
      (turn.cancelled ? 1 : 0) +
      (turn.pageContext ? 1 : 0);
  }
  return `${turns.length}:${chars}:${results}:${notes}`;
}
