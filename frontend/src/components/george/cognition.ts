/**
 * What George is doing, in words, while he does it.
 *
 * Kept apart from the components for the same reason markState.ts and
 * pinShape.ts are: the suite tests these decisions without a DOM, and a
 * component file exports only components.
 *
 * TWO THINGS LIVE HERE, AND THEY ARE DIFFERENT.
 *
 *   actName / actLine   what he is doing        — derived from the TOOL
 *   cognitionTail       what he is thinking     — derived from the MODEL
 *
 * The first is ours and is always true: a tool_call frame arrived, so that
 * tool is running. The second is the model's own summarized reasoning, which
 * is worth showing but is not evidence of anything — no number is ever read
 * out of it, and it is never stored.
 *
 * ONE MAP, SO A VOICE LAYER CANNOT DRIFT. A spoken "checking purchasing" and a
 * printed one have to be the same words; when they come from two places they
 * eventually stop matching. This is the one place.
 */
import type { GeorgeState } from '../../types/george';

/**
 * Tool -> the act, as George would say it out loud.
 *
 * Present participle throughout, because it is appended to a mark that is
 * visibly working: "checking purchasing…", not "Check purchasing" and not
 * "get_purchasing". Every tool in agent/loop.py TOOL_FUNCTIONS is here, plus
 * the three injected surfaces from agent/write_tools.py and
 * agent/composite_tools.py — those only appear when a writer or runner was
 * injected, but when they do appear they are the most interesting thing on
 * screen and must not be the only rows still reading as identifiers.
 */
const ACTS: Record<string, string> = {
  // Reads — the figures.
  get_sales: 'reading sales',
  get_stock: 'counting stock',
  get_product: 'looking up the product',
  get_movement: 'tracing movement',
  get_vending: 'reading vending',
  get_vending_stock: 'checking the machines',
  get_dead_stock: 'looking for dead stock',
  get_purchasing: 'checking purchasing',
  get_cost_history: 'reading cost history',
  get_brief: 'reading the morning brief',

  // Injected — present only when the web process passed a writer or a runner.
  pin_answer: 'pinning this',
  save_workflow: 'saving the rule',
  run_workflow: 'running the workflow',
};

/**
 * The act a tool is performing.
 *
 * An unknown tool falls back to its own name rather than to a generic phrase.
 * A tool added tomorrow then reads exactly as it does today — plainly, as an
 * identifier — instead of being described wrongly by a catch-all like
 * "reading the data", which would claim a read of something that might write.
 */
export function actName(tool: string): string {
  return ACTS[tool] ?? tool;
}

/**
 * Everything in flight, as one line.
 *
 * Two names at most. Parallel dispatch can put five calls in the air at once,
 * and five acts is a log line rather than a sentence — past two, the count
 * says more than the names would.
 */
export function actLine(tools: string[]): string {
  const acts = tools.map(actName);
  if (acts.length === 0) return '';
  if (acts.length === 1) return `${acts[0]}…`;
  if (acts.length === 2) return `${acts[0]} and ${acts[1]}…`;
  return `${acts[0]} and ${acts.length - 1} other things…`;
}

/**
 * The live thinking line: the last thing he has got as far as saying.
 *
 * A HELD THOUGHT, NOT A SCROLLING LOG. Thinking deltas arrive faster than
 * anyone reads, and rendering the whole accumulation turns the mark into a
 * teleprompter that pushes the page around. So this shows the LAST clause only
 * — sentences already finished have been superseded by the one being written.
 *
 * Trailing ellipsis always, because the line is by definition unfinished: the
 * next delta may extend it, and a clause that looked complete for one frame is
 * not a sentence George chose to end.
 *
 * Markdown is stripped rather than rendered. This is a single dimmed line
 * under a mark; a heading or a bullet in it would be furniture, and the
 * complete reasoning is still reachable in the turn's own disclosure once the
 * turn is done.
 */
export function cognitionTail(text: string, max = 140): string {
  const flat = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')   // fenced code, closed or still open
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flat) return '';

  // The last clause: everything after the final sentence end that is followed
  // by more text. A trailing terminator is not a boundary — it is the end of
  // the clause we want to show.
  const boundary = /[.!?](?=\s+\S)/g;
  let start = 0;
  for (let m = boundary.exec(flat); m !== null; m = boundary.exec(flat)) {
    start = m.index + 1;
  }
  let clause = flat.slice(start).trim();

  // A clause longer than the line keeps its END, not its beginning: the words
  // arriving now are the ones that have not been read yet.
  if (clause.length > max) {
    clause = `…${clause.slice(clause.length - max).replace(/^\S*\s/, '')}`;
  }

  // An ellipsis is in the strip set too: the model writes them, and this
  // always appends one.
  return `${clause.replace(/[.,;:…\s]+$/, '')}…`;
}


/**
 * The cognition line for a state — empty unless he is actually working.
 *
 * Shown while thinking and while tools run, and dropped the moment the answer
 * begins. Once there are words in the thread the reasoning behind them is no
 * longer the most useful thing on screen, and the turn's own disclosure still
 * holds all of it.
 *
 * Never shown in `error`, which is the case that matters: the last thing the
 * model was thinking before something broke is not an explanation of what
 * broke, and leaving it under a dimmed mark invites it to be read as one.
 */
export function liveCognition(state: GeorgeState, thinking: string): string {
  return state === 'thinking' || state === 'running' ? cognitionTail(thinking) : '';
}
