/**
 * THE WORK, READ OFF THE FRAMES THAT ALREADY ARRIVED.
 *
 * The owner's feature 13: *feel him working — checking data, bringing evidence
 * in, updating what we look at — with no fake thinking animation and no
 * chain-of-thought.* Everything in this module is derived from frames the loop
 * already sends and nothing in it is new information: a call that started, a
 * result that landed with its `duration_ms`, a notice that was raised, the
 * turn's own clock on the `done` frame. That is why P1.k is free — there was
 * never anything to ask for, only something to draw.
 *
 * THREE READINGS OF ONE RECORD, and they must agree because they are one
 * function each over the same turn:
 *
 *   STEPS      what he is doing, as it happens, one line per call with its
 *              result and how long it took (`stepsOf`).
 *   THE LINE   what the whole turn cost, once it is over — reads, tools, time,
 *              caveats — above the claim, where Perplexity puts its sources
 *              (`summaryOf`).
 *   BEHIND IT  every read of the whole thread with its receipts (`readsOf`).
 *
 * NOTHING HERE IS A FIGURE, and that is structural rather than careful: the
 * only numbers this module produces are counts of calls, counts of rows and
 * milliseconds off a clock. It never opens a row.
 */
import type { ToolCall, ToolMeta } from '../types/george';
import { PROCESS, type AnswerTurn } from './data';

/**
 * What each tool is, in words: what it looks like happening, and what it looks
 * like having happened.
 *
 * EVERY TOOL GEORGE CAN CALL HAS AN ENTRY, and a contract test fails when one
 * does not — a tool with no words is a tool whose work is invisible, and the
 * screen says "thinking…" while something quite specific is going on.
 *
 * IT IS IN WORDS, NOT IN TOOL NAMES. `get_sales {"group_by":["store"]}` is
 * implementation detail dressed as progress; "reading sales" is what he is
 * doing. The shell learned this in 2026-09-07 and the room had a thinner
 * version of the same idea that had stopped keeping up: thirteen tools —
 * every one added in the last week, and every write — had no words at all,
 * so opening a shop or saving a rule both appeared as "thinking…".
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
  record_belief: ['keeping what he now thinks', 'kept what he now thinks'],
  // ---- the writes
  pin_answer: ['pinning it', 'pinned it'],
  save_workflow: ['saving the rule', 'saved the rule'],
  create_page: ['building the page', 'built the page'],
  edit_page: ['changing the page', 'changed the page'],
  set_standing_question: ['keeping the question', 'kept the question'],
  set_watch: ['setting the watch', 'set the watch'],
  // ---- RETIRED, and still narrated. record_findings was folded into compose
  // on 2026-09-13 (P1.a) and George cannot call it any more, but conversations
  // recorded before that hold real calls to it, and a stored turn whose work
  // reads "thinking…" has lost the thing this line exists to show. A name
  // leaves this map when no stored turn can carry it, which is never.
  record_findings: ['marking what matters', 'marked what matters'],
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
export function counts(tool: string): boolean {
  return tool.startsWith('get_') || tool.startsWith('view_') || tool === 'run_workflow';
}

/* ------------------------------------------------------------------ steps */

export type StepState = 'running' | 'landed' | 'declined';

/** One rung of the work: a call, what it is in words, and what came back. */
export interface Step {
  /** `turn:seq` — seq restarts every turn, so a bare seq is not an identity. */
  key: string;
  turn: number;
  seq: number;
  tool: string;
  /**
   * WHICH READ THIS IS, 1-BASED, over the reads of this turn that LANDED.
   *
   * It is what a marker in the claim points at (P2.b): a figure wearing a
   * small `2` and the second step wearing the same `2` are the same read, and
   * a person can see which evidence a number came out of without tapping
   * anything. Null for a label call, for a call still running and for a read
   * that was refused — none of those is a read a figure can have come from,
   * and numbering them would make the markers count something else.
   */
  index: number | null;
  /** What it IS, in words. Never the tool name unless the map has no entry. */
  words: string;
  state: StepState;
  /** How many rows a read brought back. Null for anything that is not a read. */
  rows: number | null;
  /** The call's own clock, from the tool_result frame. Null when unrecorded. */
  ms: number | null;
  meta: ToolMeta | null;
  /** The tool's own sentence when it declined. Never a stack trace. */
  declined: string | null;
}

/**
 * THE READS OF ONE TURN, NUMBERED, seq → 1-based index.
 *
 * One definition of "which read is this", read by the steps, by Behind it and
 * by the markers on the figures. A second one would drift, and a marker that
 * counted differently from the trail would be a number pointing at the wrong
 * evidence — worse than no number.
 *
 * A read that LANDED, only. A duplicate is served out of the turn's own
 * record and is not work anybody did; a label call read nothing; a refusal
 * returned no rows, so no figure can have come out of it.
 */
export function readIndexes(calls: ToolCall[]): Map<number, number> {
  const out = new Map<number, number>();
  let n = 0;
  for (const call of calls) {
    if (call.duplicate_of !== undefined) continue;
    if (!counts(call.tool)) continue;
    if (!call.result || call.result.error) continue;
    n += 1;
    out.set(call.seq, n);
  }
  return out;
}

function stepOf(call: ToolCall, turn: number, index: number | null): Step {
  const [doing, done] = WORDS[call.tool] ?? [call.tool, call.tool];
  const result = call.result;
  const failed = Boolean(result?.error);
  const landed = Boolean(result) && !failed;
  return {
    key: `${turn}:${call.seq}`,
    turn,
    seq: call.seq,
    tool: call.tool,
    index,
    words: landed || failed ? done : doing,
    state: failed ? 'declined' : landed ? 'landed' : 'running',
    rows: landed && counts(call.tool) ? rows(result) : null,
    // A RESTORED CALL CARRIES A ZERO IT NEVER MEASURED. `restoreFromPosts`
    // rebuilds a call the chat history did not keep and has no clock to put
    // on it, so zero is "not recorded" rather than "instant" — and a read
    // that took no time at all is not a thing a database does.
    ms: result && result.duration_ms > 0 ? result.duration_ms : null,
    meta: result?.meta ?? null,
    declined: failed ? String(result?.error) : null,
  };
}

/**
 * The rungs of one turn, in the order they happened.
 *
 * A DUPLICATE IS NOT A STEP. The loop serves a repeated read out of the turn's
 * own record instead of running it again (`duplicate_of`); drawing it would
 * put work on the screen that nobody did and a duration that was never spent.
 */
export function stepsOf(turn: AnswerTurn | null | undefined, index = 0): Step[] {
  if (!turn) return [];
  const numbered = readIndexes(turn.toolCalls);
  return turn.toolCalls
    .filter((c) => c.duplicate_of === undefined)
    .map((c) => stepOf(c, index, numbered.get(c.seq) ?? null));
}

/* ------------------------------------------------------------------- line */

/** What the turn cost, counted off its frames. Every field is a count or a clock. */
export interface WorkSummary {
  /** Reads that landed — the evidence the answer stands on. */
  reads: number;
  /** Every call he made, reads included: what the turn actually did. */
  tools: number;
  /** The turn's own clock (`done.duration_ms`). Null on a turn that has none. */
  ms: number | null;
  /** Caveats this turn raised, the loop's warnings about his own edits apart. */
  caveats: number;
}

export function summaryOf(turn: AnswerTurn | null | undefined): WorkSummary {
  const steps = stepsOf(turn);
  return {
    reads: steps.filter((s) => s.state === 'landed' && counts(s.tool)).length,
    tools: steps.length,
    ms: turn?.done?.duration_ms ?? null,
    caveats: (turn?.notices ?? []).filter((n) => !PROCESS.has(n.kind)).length,
  };
}

/* -------------------------------------------------------------- behind it */

/** One read of the thread, with the call it was and the receipts it carried. */
export interface Read extends Step {
  /** When the turn it belongs to was asked — for ordering and for the header. */
  at: string;
}

/**
 * EVERY READ OF THE THREAD, oldest first.
 *
 * Reads only: this is what the answers stand on, and a compose or a pin is
 * something he did to the screen rather than something he looked at. A
 * declined read stays in the list — a read that was refused is part of the
 * account of the work, and leaving it out would make the list say he never
 * tried.
 */
export function readsOf(answers: AnswerTurn[]): Read[] {
  const out: Read[] = [];
  answers.forEach((turn, index) => {
    for (const step of stepsOf(turn, index)) {
      if (!counts(step.tool)) continue;
      out.push({ ...step, at: turn.at });
    }
  });
  return out;
}

/* ------------------------------------------------------------- formatting */

/**
 * A duration, as a person reads it. Under a second in milliseconds, because
 * "0.0s" is not how fast something was; over a minute in minutes, because
 * "84.0s" is not how long something took.
 */
export function durationWords(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const s = Math.round(ms / 1_000);
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** `4 reads · 6 tools · 19.0s · 1 caveat`, with nothing said that is not known. */
export function summaryWords(s: WorkSummary): string[] {
  const out = [
    `${s.reads} ${s.reads === 1 ? 'read' : 'reads'}`,
    `${s.tools} ${s.tools === 1 ? 'tool' : 'tools'}`,
  ];
  // THE TIME IS OMITTED RATHER THAN ZEROED when the turn carries no clock —
  // a turn stored before P0.3 has no `duration_ms`, and "0.0s" would be a
  // measurement nobody made (UI rule 8).
  if (s.ms !== null) out.push(durationWords(s.ms));
  out.push(s.caveats === 0 ? 'no caveats'
    : `${s.caveats} ${s.caveats === 1 ? 'caveat' : 'caveats'}`);
  return out;
}

/**
 * ONE FILTER, AS A PERSON READS IT AND AS THE TOOL WROTE IT.
 *
 * Every `filters_applied` entry is a predicate the tool applied and, after a
 * `#`, the definition it came from: `t.store_id IN (…)   # metrics.yaml:
 * stores.active_retail`. Behind it is "reads with receipts, never code", so
 * the DEFINITION is the line — "stores · active retail" — and the predicate is
 * under it, quiet, for whoever wants it. Neither is dropped: the definition
 * alone does not say which shops, and the predicate alone does not say which
 * rule put them there.
 *
 * No heuristic decides which half is readable. The split is on the `#` the
 * tools write, and an entry without one is drawn whole.
 */
export interface Filter {
  /** The definition, in words — or the predicate, when there is no `#`. */
  label: string;
  /** The predicate, when the definition took the line. Never the only thing. */
  detail: string | null;
}

export function filtersOf(meta: ToolMeta | null | undefined): Filter[] {
  return (meta?.filters_applied ?? []).map((raw) => {
    const text = String(raw);
    const cut = text.indexOf('#');
    if (cut < 0) return { label: text.trim(), detail: null };
    const predicate = text.slice(0, cut).trim();
    const source = text.slice(cut + 1).trim();
    if (!source) return { label: predicate, detail: null };
    return { label: source.replace(/^metrics\.yaml:\s*/, '').replace(/[._]/g, ' '), detail: predicate };
  });
}
