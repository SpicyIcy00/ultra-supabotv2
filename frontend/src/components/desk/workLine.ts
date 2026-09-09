/**
 * What George is doing to the business right now, in one line.
 *
 * WATCHING HIM WORK IS NOT WATCHING HIM THINK. Every word here is derived
 * from frames that actually arrived — a `tool_call` the loop dispatched and a
 * `tool_result` that came back — through the same vocabulary the mark's
 * narration uses (cognition.describeCall). The model's reasoning never
 * reaches this line, and neither does a plan, a stage or a checklist: there
 * is no such thing on the wire, and inventing one would be narrating work
 * that is not happening.
 *
 * IT IS A SENTENCE, NOT A LOG. Two clauses at most — what he has read so far,
 * and what he is reading now — because a list of calls is a developer tool
 * and this is a person watching their business be investigated. The reads
 * themselves are already visible: they become the workspace, which forms
 * underneath this line as each result lands.
 *
 * The tool identifiers, the arguments and the row counts stay in the
 * inspector and the receipts, where a number belongs.
 */
import { actLine, deedLine, type CallLike } from '../george/cognition';

export interface WorkLine {
  /** What George has read so far in this turn, in the past tense. */
  done: string | null;
  /** What he is reading at this moment. */
  now: string | null;
}

export interface WorkInput {
  running: CallLike[];
  completed: CallLike[];
}

/**
 * The line, or nothing.
 *
 * `record_findings` is dropped from BOTH halves. It reads nothing — it labels
 * calls that already ran — so "noted what each read was" describes
 * bookkeeping rather than an investigation, and it lands last in every turn,
 * which is precisely when the line is most read.
 *
 * Null when George is not working. There is no idle state for this line: a
 * caption under a resting workspace saying "Ready" is the app talking about
 * itself.
 */
export function workLine(input: WorkInput, busy: boolean): WorkLine {
  if (!busy) return { done: null, now: null };
  const reads = (calls: CallLike[]) =>
    calls.filter((c) => (typeof c === 'string' ? c : c.tool) !== 'record_findings');

  const now = actLine(reads(input.running));
  const done = deedLine(reads(input.completed));
  return {
    done: done || null,
    now: now || null,
  };
}

/**
 * The two clauses as one sentence, for a surface that has room for one line.
 *
 * "Compared sales, transactions and ATP by store · looking at product changes
 * at Rockwell…" — the separator is a middot rather than a comma so the two
 * tenses stay legible as two different facts.
 */
export function workSentence(line: WorkLine): string | null {
  const parts = [line.done, line.now].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(' · ') : null;
}
