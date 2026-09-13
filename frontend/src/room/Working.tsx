/**
 * FEELING HIM WORK.
 *
 * The owner's feature 13: *feel him working — checking data, bringing evidence
 * in, updating what we look at — with no fake thinking animation and no
 * chain-of-thought.* Both halves of that are constraints:
 *
 *   NOTHING HERE IS INVENTED. Every line comes from a frame the loop sent —
 *   a call that started, a result that landed, a refusal. There is no
 *   progress bar counting to a number nobody knows, no spinner standing in
 *   for a step, and no reasoning text. If George is doing nothing, this shows
 *   nothing.
 *
 *   IT IS IN WORDS, NOT IN TOOL NAMES. `get_sales {"group_by":["store"]}` is
 *   implementation detail dressed as progress; "reading sales" is what he is
 *   doing. The shell learned this in 2026-09-07 and the room had a thinner
 *   version of the same idea that had stopped keeping up: thirteen tools —
 *   every one added in the last week, and every write — had no words at all,
 *   so opening a shop or saving a rule both appeared as "thinking…".
 *
 * A LANDED READ SAYS HOW MUCH IT BROUGHT BACK, because that is the difference
 * between a read that found the business and one that found nothing, and it is
 * knowable from the frame rather than from the prose.
 */
import { useEffect, useState } from 'react';

import type { AnswerTurn } from './data';

/**
 * HOW LONG HE HAS BEEN AT IT (P0.3).
 *
 * The one number on this line that does not come from a frame, and it is
 * allowed for the reason the rest are not: nothing has arrived yet. A person
 * waiting has no way to tell a turn that is working from one that has stalled,
 * and Phase 1's targets are seconds — first visible change under 2 s, median
 * answer under 10 s — so the wait is the thing being worked on. Showing it is
 * showing the subject.
 *
 * It is a measurement, not an estimate: the turn's own start time, which the
 * client set when it asked, against the clock now. There is no progress bar,
 * no predicted finish and no percentage — none of those is knowable, and
 * inventing one is what the header of this file forbids.
 *
 * The server measures the same wait properly (`duration_ms` on the `done`
 * frame and in george.conversations, off one monotonic clock inside the
 * turn). That is the figure the clock report reads. This is what the person
 * sees while it is still running.
 */
function useElapsed(startedAt: string | undefined, live: boolean): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    // Re-read immediately so a turn that starts does not carry the stale
    // `now` from whenever this component last rendered.
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [live, startedAt]);
  const started = startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(started)) return null;
  // Never negative: a client clock nudged backwards mid-turn would otherwise
  // count down, which reads as a bug in George rather than in the clock.
  return Math.max(0, Math.round((now - started) / 1000));
}

/** Seconds as a person reads them: `8s`, then `1m 04s` once a minute is up. */
export function elapsedWords(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(seconds - m * 60).padStart(2, '0')}s`;
}

/**
 * What each tool is, in words: what it looks like happening, and what it looks
 * like having happened.
 *
 * EVERY TOOL GEORGE CAN CALL HAS AN ENTRY, and a contract test fails when one
 * does not — a tool with no words is a tool whose work is invisible, and the
 * screen says "thinking…" while something quite specific is going on.
 */
export const WORDS: Record<string, [string, string]> = {
  // ---- the reads
  get_sales: ['reading sales', 'read sales'],
  get_stock: ['counting stock', 'counted stock'],
  get_stock_history: ['reading stock over time', 'read stock over time'],
  get_product: ['looking up a product', 'looked up a product'],
  get_object: ['opening it up', 'opened it up'],
  get_movement: ['reading transfers', 'read transfers'],
  get_vending: ['reading vending', 'read vending'],
  get_vending_stock: ['reading vending stock', 'read vending stock'],
  get_dead_stock: ['finding dead stock', 'found dead stock'],
  get_purchasing: ['reading purchase orders', 'read purchase orders'],
  get_replenishment: ['reading the replenishment plan', 'read the replenishment plan'],
  get_purchase_plan: ['drafting the order', 'drafted the order'],
  get_cost_history: ['reading costs', 'read costs'],
  get_brief: ['reading the morning brief', 'read the morning brief'],
  get_attention: ['looking at what deserves attention', 'looked at what deserves attention'],
  // ---- the things only he can see
  view_page: ['reading the page', 'read the page'],
  view_memory: ['checking what he thinks', 'checked what he thinks'],
  view_automations: ['checking what is running', 'checked what is running'],
  run_workflow: ['running the saved rule', 'ran the saved rule'],
  // ---- what he says about what he read
  compose: ['arranging the workspace', 'arranged the workspace'],
  record_findings: ['marking what matters', 'marked what matters'],
  record_belief: ['keeping what he now thinks', 'kept what he now thinks'],
  // ---- the writes
  pin_answer: ['pinning it', 'pinned it'],
  save_workflow: ['saving the rule', 'saved the rule'],
  create_page: ['building the page', 'built the page'],
  edit_page: ['changing the page', 'changed the page'],
  set_standing_question: ['keeping the question', 'kept the question'],
  set_watch: ['setting the watch', 'set the watch'],
};

function rows(result: unknown): number | null {
  const r = (result as { rows?: unknown[] } | null | undefined)?.rows;
  return Array.isArray(r) ? r.length : null;
}

/**
 * A row count belongs to a READ and to nothing else.
 *
 * compose and record_findings return no rows because they read nothing — they
 * are statements about calls that already happened — so "arranged the
 * workspace · 0 rows" reported an emptiness that was never a finding. A count
 * of nothing looks like a failure when it is a category error.
 */
function counts(tool: string): boolean {
  return tool.startsWith('get_') || tool.startsWith('view_') || tool === 'run_workflow';
}

export function Working({ turn, live }: { turn: AnswerTurn | null; live: boolean }) {
  // Before the early return: a hook cannot be called conditionally, and the
  // turn is the only thing it needs.
  const elapsed = useElapsed(turn?.at, live);
  // The board is the result. While he is finished, this has nothing to add,
  // and a trail that lingered would be a second account of the same thing.
  if (!live || !turn) return null;
  const clock = elapsed === null ? null : (
    <span className="r-work-clock">{elapsedWords(elapsed)}</span>
  );
  const calls = turn.toolCalls.filter((c) => c.duplicate_of === undefined);
  if (!calls.length) {
    // Real, and the only honest thing to say before the first call returns.
    return <p className="r-work">thinking…{clock}</p>;
  }

  return (
    <div className="r-work-trail">
      {calls.map((call) => {
        const words = WORDS[call.tool];
        // A tool with no entry is named plainly rather than hidden: silence
        // would be the bug pretending to be quiet.
        const [doing, done] = words ?? [call.tool, call.tool];
        const result = call.result as { error?: unknown } | null | undefined;
        const landed = Boolean(result) && !result?.error;
        const refused = Boolean(result?.error);
        const n = landed ? rows(call.result) : null;
        return (
          <p key={call.seq} className={`r-work${landed || refused ? ' r-work--done' : ''}`}>
            {refused ? `${done} — declined` : landed ? done : `${doing}…`}
            {landed && counts(call.tool) && n !== null && (
              <span className="r-work-n">{n === 1 ? '1 row' : `${n} rows`}</span>
            )}
          </p>
        );
      })}
      {/* At the FOOT of the trail, not beside the running line: a call that
          lands moves that line's words, and a number that jumped with it
          would read as part of the call rather than as the wait. */}
      {clock && <p className="r-work r-work--clock">{clock}</p>}
    </div>
  );
}
