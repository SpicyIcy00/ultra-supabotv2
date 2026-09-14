/**
 * WHAT CAME BEFORE THIS FINDING — one quiet line, and it opens.
 *
 * The owner, 2026-09-13: *"when i ask to look for problems all the rest of the
 * widgets still stayed."* Half of that is answered by clearing the board when
 * a question shares nothing with it (board.ts `travel`). This is the other
 * half: when the question DOES share a subject the board rightly keeps what
 * was there, and four turns in the finding is one tile among nine.
 *
 * So the objects the newest turn did not touch collapse to this line and the
 * board draws the finding. They are not gone — the board still holds them,
 * they still travel with the next question, and the line opens.
 *
 * THE COUNT IS DERIVED, NEVER WRITTEN (UI rule 8). It is the length of a list
 * the caller folded out of a board it has; there is no state here to be wrong
 * about. Nothing here is an accent colour either: this is navigation, and the
 * one colour means "needs you".
 */
export function Earlier({ count, open, onToggle }: {
  /** How many objects the newest turn did not touch. Nothing draws at zero. */
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (count <= 0) return null;
  return (
    <p className="r-label r-earlier">
      <button type="button" className="r-earlier-line" onClick={onToggle}
              aria-expanded={open}>
        {count} {count === 1 ? 'thing' : 'things'} from earlier · {open ? 'fold' : 'show'}
      </button>
    </p>
  );
}
