/**
 * WHAT THIS THREAD WOULD KEEP, AND WHAT IT WOULD NOT.
 *
 * A thread is already a page (P2.a): the questions asked, in order, each
 * standing on reads that can be run again. "Keep as page" does not BUILD
 * anything — it names the draft that was already there, so this module's whole
 * job is to say, before the gesture, exactly what would land and exactly what
 * would be left off.
 *
 * NOTHING IS GUESSED AND NOTHING IS FILLED IN. A section's calls are the calls
 * the LOOP marked pinnable on its own `tool_result` frame — never a name this
 * module recognises, never a call rebuilt from rows or prose. A turn with
 * nothing pinnable is not quietly dropped: it is listed with the reason, in
 * words, because a page that silently lost half a conversation is worse than a
 * page that says what it could not take.
 *
 * EVERY BOUND HERE IS THE SERVICE'S BOUND. Six sections a build, eight calls a
 * section, no read twice in one build — page_operations.MAX_ANALYSES_PER_BUILD,
 * pin_writer.MAX_TOOL_CALLS_PER_PIN and `_unique_calls`. They are stated here
 * so the reason is on screen BEFORE the request, and `keeping.test.ts` holds
 * them equal to the numbers the backend refuses on. This module never relaxes
 * one: a plan that breaks a bound would be a 422 the person could have read in
 * advance.
 *
 * NOTHING HERE IS A FIGURE. The only numbers it produces are counts of reads
 * and counts of sections.
 */
import type { GeorgeTurn, ToolCall } from '../types/george';
import type { PinToolCall } from '../types/pins';
// ONE PAIRING OF ANSWERS TO QUESTIONS (P2.e). A section of the page this
// thread would be is named by the question its turn answered, and a rung of
// the walk is headed by the same one — so they are the same function.
import { asked } from './work';

/**
 * How many sections one create may carry
 * (backend/app/services/page_operations.py MAX_ANALYSES_PER_BUILD, and
 * `pages.workshop.max_analyses_per_build` in definitions/metrics.yaml).
 */
export const MAX_SECTIONS = 6;

/**
 * How many calls one section may hold
 * (backend/app/services/pin_writer.py MAX_TOOL_CALLS_PER_PIN).
 */
export const MAX_CALLS_PER_SECTION = 8;

/** A title the service will accept: it trims, and caps at 200. */
const MAX_TITLE = 200;

/** One section of the page this thread would become. */
export interface Section {
  /** The index into the thread's answers — the same key the board uses. */
  turn: number;
  /** The question it answers, which is the section's name. */
  title: string;
  /** What it re-runs, in the order it ran. */
  calls: PinToolCall[];
  /**
   * Reads left out of THIS section because an earlier one already keeps them.
   * Drawn, not hidden: a section that reads fewer things than the turn did has
   * to say so, or the page quietly claims less evidence than it has.
   */
  alreadyKept: number;
}

/** A turn the page would not take, and the reason, in words. */
export interface LeftOff {
  turn: number;
  title: string;
  why: string;
}

export interface KeepPlan {
  sections: Section[];
  leftOff: LeftOff[];
}

/**
 * The calls of one turn that MAY become a pin.
 *
 * `pinnable` is the loop's word on its own frame: a read tool that ran without
 * error and is not a duplicate served out of the turn's record. Absent means a
 * frame from a backend that predates the flag, which the client reads as
 * pinnable exactly as postShape does — the server re-validates every call and
 * refuses anything that is not, so the optimism costs a refusal and never a
 * wrong pin.
 */
function pinnableCalls(calls: ToolCall[]): PinToolCall[] {
  return calls
    .filter((c) => c.duplicate_of === undefined
      && c.result !== undefined
      && !c.result.error
      && c.result.pinnable !== false)
    .map((c) => ({ tool: c.tool, arguments: c.arguments }));
}

/**
 * The identity of a call for the no-read-twice rule.
 *
 * `json.dumps(..., sort_keys=True)` is what the service keys on
 * (page_operations._unique_calls), and it sorts EVERY level, so this does too.
 * A shallow sort would let a call with a nested argument object — a date range
 * pair, a settings block — read as new here and as a duplicate there, which is
 * the one failure this prediction exists to prevent: a 422 the person could
 * have read before they pressed anything.
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

function callKey(call: PinToolCall): string {
  return JSON.stringify(stable({ arguments: call.arguments, tool: call.tool }));
}

/**
 * A section's name: the question, as it was asked.
 *
 * THE PERSON'S WORDS, NEVER GEORGE'S. A title taken from the answer would be
 * model prose presented as the name of a thing that re-runs — and the answer it
 * came from will be different the next time the page opens. A turn whose
 * question is not in the thread (a morning brief, a workflow's answer) has no
 * question to quote and is named by what it read, which is what the service
 * itself falls back to.
 */
function titleFor(question: string | null, calls: PinToolCall[]): string {
  const words = (question ?? '').replace(/\s+/g, ' ').trim();
  if (words) return words.slice(0, MAX_TITLE);
  return (calls[0]?.tool ?? '').slice(0, MAX_TITLE);
}

/**
 * THE PLAN, in the order the page would read.
 *
 * The newest six survive the cap, because the newest is what is on the board
 * and what the thread is about by the time anybody keeps it — and they stay in
 * the order they were asked, because a page is read top to bottom and a
 * conversation reversed is not the same conversation.
 *
 * A turn dropped for the cap says so by name. That is the difference between a
 * bound and a loss: the person can keep this page and then ask George for the
 * rest, and they can only do that if they know what is missing.
 */
export function keepPlan(turns: GeorgeTurn[]): KeepPlan {
  const all = asked(turns);
  const sections: Section[] = [];
  const leftOff: LeftOff[] = [];
  const seen = new Set<string>();

  // WHICH TURNS THE CAP ADMITS is decided before the first section is built,
  // over every turn that has anything to keep at all — otherwise a thread of
  // ten turns where four read nothing would drop four good ones for a bound it
  // never reached.
  const candidates = all
    .map(({ question, turn }, i) => ({ i, question, calls: pinnableCalls(turn.toolCalls) }))
    .filter((c) => c.calls.length > 0 && c.calls.length <= MAX_CALLS_PER_SECTION);
  const admitted = new Set(candidates.slice(-MAX_SECTIONS).map((c) => c.i));

  all.forEach(({ question, turn }, i) => {
    const calls = pinnableCalls(turn.toolCalls);
    const title = titleFor(question, calls);
    if (calls.length === 0) {
      leftOff.push({
        turn: i, title: title || 'a turn with no question',
        why: 'it read nothing there is anything to run again',
      });
      return;
    }
    if (calls.length > MAX_CALLS_PER_SECTION) {
      leftOff.push({
        turn: i, title,
        why: `it took ${calls.length} reads, and one section holds ${MAX_CALLS_PER_SECTION}`,
      });
      return;
    }
    if (!admitted.has(i)) {
      leftOff.push({
        turn: i, title,
        why: `a page is kept ${MAX_SECTIONS} sections at a time, and this is older than the ${MAX_SECTIONS} below`,
      });
      return;
    }
    const fresh = calls.filter((c) => !seen.has(callKey(c)));
    if (fresh.length === 0) {
      leftOff.push({
        turn: i, title,
        why: 'every read behind it is already kept in a section above',
      });
      return;
    }
    for (const c of fresh) seen.add(callKey(c));
    sections.push({ turn: i, title, calls: fresh, alreadyKept: calls.length - fresh.length });
  });

  return { sections, leftOff };
}

/**
 * The page's name, offered — the first question of the thread, trimmed.
 *
 * A DEFAULT, NOT A DECISION. The field is editable and the person renames it
 * without anything moving, because the title is presentation and the id is
 * identity. What this must never do is invent a name from what George
 * concluded: "Rockwell is down 12%" would be a page called after a figure that
 * the next run may contradict.
 */
export function offeredTitle(turns: GeorgeTurn[], fallback = 'Kept from a conversation'): string {
  const first = turns.find((t) => t.role === 'user' && t.text.trim());
  const words = first && first.role === 'user' ? first.text.replace(/\s+/g, ' ').trim() : '';
  // The page title's own bound (page_writer.MAX_TITLE_LEN), stated where the
  // default is made so a long question is cut here rather than refused there.
  return words ? words.slice(0, 100) : fallback;
}
