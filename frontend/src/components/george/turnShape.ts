/**
 * How an answer is disclosed, as a decision the suite can hold.
 *
 * THREE LEVELS, BY POSITION AND NOT BY HIDING.
 *
 *   Level 1  the notices, the answer, the figures it describes, and the one
 *            line of receipts under each — always visible, in that order.
 *   Level 2  the follow-ups the answer offers, and the prose itself.
 *   Level 3  the activity: tool rows, the full reasoning, the counts. Behind
 *            ONE LINE THAT SAYS WHAT GEORGE DID, in both phases.
 *
 * WHY THE ROWS NO LONGER STAND OPEN WHILE A TURN RUNS. They did, deliberately,
 * because watching real execution is worth something. But a person waiting for
 * an answer was being shown `get_sales {"group_by":["store"]}` — tool names and
 * JSON arguments — as the most prominent thing on the screen, and that is
 * implementation detail dressed as progress. What they actually need to know is
 * that George is working and roughly on what, and workLine says exactly that in
 * words while it happens. The rows are one tap away and nothing was removed:
 * simple surface, then explanation, then technical evidence — not technical
 * evidence first.
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
import { actLine, deedLine } from './cognition';

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
 * Whether THIS turn is the one still streaming.
 *
 * A finished turn is over whatever the stream is doing for another, so a
 * thread's earlier answers never narrate in the present tense while the newest
 * one runs.
 */
export function isRunning(turn: AnswerTurn, live: boolean): boolean {
  return live && !isOver(turn);
}

/**
 * The one line the activity waits behind: what George did, in words.
 *
 * DERIVED FROM THE TOOLS, THEREFORE TRUE. Which tools were called and how many
 * rows came back are facts from the frames — never the model's account of its
 * own work, which is what the reasoning inside the disclosure is and is
 * labelled as. Nothing here is a business figure: a row count is a fact about
 * the query, and it is never presented as a measurement of anything.
 *
 * PRESENT WHILE IT HAPPENS, PAST ONCE IT IS OVER, and stopped work says
 * stopped rather than reporting a finished-sounding sentence for work that did
 * not finish.
 */
export function workLine(turn: AnswerTurn, live: boolean): string {
  const tools = turn.toolCalls.map((c) => c.tool);
  if (isRunning(turn, live)) {
    const running = turn.toolCalls.filter((c) => !c.result).map((c) => c.tool);
    const line = actLine(running.length > 0 ? running : tools);
    return line ? line[0].toUpperCase() + line.slice(1) : 'Working…';
  }

  const deeds = deedLine(tools);
  const rows = turn.toolCalls.reduce(
    (n, c) => n + (c.result && !c.result.error ? (c.result.row_count ?? 0) : 0),
    0,
  );
  const counted = rows > 0 ? ` — ${rows.toLocaleString('en-PH')} ${rows === 1 ? 'row' : 'rows'}` : '';

  if (turn.cancelled) return deeds ? `Stopped after: ${deeds.toLowerCase()}` : 'Stopped';
  if (!deeds) return turn.thinking.trim() ? 'Thought about it' : 'Answered without reading anything';
  return `${deeds}${counted}`;
}

/**
 * The counts, for the panel behind the line.
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
