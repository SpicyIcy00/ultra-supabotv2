/**
 * WHICH GESTURES ARE DECISIONS, and about what.
 *
 * A keep, a set-aside, an open or a "why?" on any object is just arranging
 * the board — except when the object is a row of the agenda. Then it is the
 * one thing Bob can learn from: what you did with what he raised. This
 * module decides, from the read behind an object and nothing else, whether a
 * gesture is such a decision, and what it is about.
 *
 * NOTHING IS INFERRED FROM SILENCE. `leftBehind` names the agenda rows you
 * put away without touching — and that is a gesture too (you closed the
 * morning), recorded as `left`, never as dismissed. A row on a board you
 * simply navigated away from is recorded as nothing at all.
 *
 * Pure: the write is decisionsApi's; the room decides when to call it.
 */
import type { Decision, Outcome } from '../services/decisionsApi';
import type { BoardObject } from './board';
import { callOf, rowsOf, type AnswerTurn } from './data';

export const ATTENTION_TOOL = 'get_attention';

/** The agenda row an object is scoped to, or null when it is not one. */
export function attentionRow(
  answers: AnswerTurn[], o: BoardObject,
): { row: Record<string, unknown>; raisedAt: string | null } | null {
  const turn = answers[o.turn];
  if (!turn || !o.subject) return null;
  const call = callOf(turn, o.seq);
  if (!call || call.tool !== ATTENTION_TOOL) return null;
  const row = rowsOf(call).find((r) => r.subject === o.subject && typeof r.identity === 'string');
  if (!row) return null;
  const meta = call.result?.meta as { snapshot_timestamp?: string } | undefined;
  return { row, raisedAt: meta?.snapshot_timestamp ?? null };
}

/** The decision a gesture on this object is, or null when it is only arranging. */
export function decisionFor(
  answers: AnswerTurn[], o: BoardObject, outcome: Outcome, threadId: string | null,
): Decision | null {
  const found = attentionRow(answers, o);
  if (!found) return null;
  const { row, raisedAt } = found;
  return {
    what: String(row.identity),
    source: String(row.source ?? ''),
    subject: String(row.subject ?? ''),
    outcome,
    raised_at: raisedAt,
    thread_id: threadId,
  };
}

/**
 * The agenda rows still on the board that nobody touched, as `left` — for
 * the moment the morning is put away. `decided` is what this session already
 * recorded, keyed by identity, so a row you kept is not also left.
 */
export function leftBehind(
  answers: AnswerTurn[], board: BoardObject[], decided: ReadonlySet<string>, threadId: string | null,
): Decision[] {
  const out: Decision[] = [];
  const seen = new Set<string>();
  for (const o of board) {
    const d = decisionFor(answers, o, 'left', threadId);
    if (!d || decided.has(d.what) || seen.has(d.what)) continue;
    seen.add(d.what);
    out.push(d);
  }
  return out;
}
