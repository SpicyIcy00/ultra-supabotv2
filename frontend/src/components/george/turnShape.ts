/**
 * How an answer is disclosed, as a decision the suite can hold.
 *
 * THREE LEVELS, BY POSITION AND NOT BY HIDING.
 *
 *   Level 1  the notices, the answer, the figures it describes, and the one
 *            line of receipts under each — always visible, in that order.
 *   Level 2  the follow-ups the answer offers, and the prose itself.
 *   Level 3  the activity: tool rows, the full reasoning, the counts. Shown
 *            in full WHILE the turn runs, because real execution is worth
 *            watching; collapsed to one line once it is over, because the
 *            answer is then the point and the machinery is not.
 *
 * WHAT NEVER MOVES BEHIND A DISCLOSURE. A notice (UI rule 4), the receipts
 * line (rules 3 and 6), the stopped note, and a pin or save confirmation.
 * Each is a fact about the answer, not about how it was made.
 *
 * THE LATEST ANSWER LEADS. Earlier turns in a thread go quieter — slate prose
 * rather than navy, charts behind a one-line disclosure that names them —
 * so the newest answer is what the eye lands on. Quieter is not smaller:
 * an earlier turn's notices stay whole and above its body, and its receipts
 * stay where they were. Nothing is summarised, because a summary is a
 * number somebody did not check.
 */
import type { GeorgeTurn } from '../../types/george';

type AnswerTurn = Extract<GeorgeTurn, { role: 'george' }>;

export type Emphasis = 'latest' | 'earlier';

/** The newest George turn is `latest`; every earlier one is `earlier`. */
export function emphasisOf(index: number, turns: GeorgeTurn[]): Emphasis {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'george') return i === index ? 'latest' : 'earlier';
  }
  return 'earlier';
}

/** Whether a turn is over — done, stopped, or failed — as opposed to running. */
export function isOver(turn: AnswerTurn): boolean {
  return Boolean(turn.done || turn.cancelled || turn.error);
}

/**
 * Whether the activity is shown in full.
 *
 * In full while the turn runs; behind one line once it is over. `live` is
 * whether THIS turn is the one streaming — a finished turn is over whatever
 * the stream is doing for another.
 */
export function showsActivity(turn: AnswerTurn, live: boolean): boolean {
  return live && !isOver(turn);
}

/**
 * The one line that stands for the activity once it is collapsed.
 *
 * Counts only, and only counts that are known: calls from the frames that
 * arrived, iterations from `done`. A stopped turn says so rather than
 * reporting a finished count for work that did not finish.
 */
export function activitySummary(turn: AnswerTurn): string {
  const calls = turn.toolCalls.length;
  const parts: string[] = [];
  if (turn.cancelled) parts.push('stopped');
  parts.push(`${calls} ${calls === 1 ? 'call' : 'calls'}`);
  if (turn.done) {
    parts.push(`${turn.done.iterations} ${turn.done.iterations === 1 ? 'iteration' : 'iterations'}`);
    if (turn.done.cache_hit) parts.push('cache hit');
  }
  if (turn.thinking.trim()) parts.push('reasoning');
  return parts.join(' · ');
}

/** Whether there is any activity to disclose at all. */
export function hasActivity(turn: AnswerTurn): boolean {
  return turn.toolCalls.length > 0 || turn.thinking.trim().length > 0 || Boolean(turn.done);
}
