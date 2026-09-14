/**
 * THE ARGUMENTS THE LOOP ACCEPTED, AS THINGS YOU CAN MOVE.
 *
 * A replay has existed since P1.i — one stored call, one changed scope
 * argument, no model — and there was no way to ask for one unless George
 * happened to compose a `control` block. So the scope the work on screen is
 * ALREADY on is drawn under the reading: the window, the shop, the cut, how
 * many rows. Tapping one and typing one are the same act through the same
 * path, which is the whole reason this module is pure and the drawing is not.
 *
 * NOTHING HERE INVENTS A VOCABULARY. The alternatives, the words they answer
 * to and where each argument lands in a call all arrive from
 * `/definitions/desk` — `metrics.yaml` served. This module reads a stored
 * call's value at a served path and compares it against served values; it
 * holds no list of windows, shops or dimensions of its own, and it never
 * stems, guesses or offers a "did you mean".
 *
 * A TOKEN IS TRUE OF THE WHOLE SCREEN OR IT IS NOT DRAWN. If two drawn reads
 * carry the same argument on different values, one token saying "last week"
 * would be a claim about a board half of which is on something else (UI rule
 * 8). So the token is drawn only where every drawn read that HAS the argument
 * agrees, and moving it moves all of them together.
 */
import type { DeskAlternative, DeskDefinitions, DeskToken } from '../services/deskApi';
import { callOf, type AnswerTurn } from './data';
import type { BoardObject } from './board';
import type { ToolCall } from '../types/george';

/** One read a token moves, named the way a replay names one. */
export interface TokenTarget {
  /** The answer post the call was recorded on. A read with none cannot move. */
  post: string;
  turn: number;
  seq: number;
  tool: string;
}

/** A token on screen: an accepted argument, its value, and where it can go. */
export interface DrawnToken {
  argument: string;
  kind: 'navigation' | 'analytical';
  /** The word for the argument itself — "window", "shop", "grouped". */
  label: string;
  /** The value every target is on, as it was stored. */
  value: unknown;
  /** That value said as a person reads it: an alternative's label, or itself. */
  valueLabel: string;
  alternatives: DeskAlternative[];
  targets: TokenTarget[];
}

/** How a typed fragment resolved, or that it did not. */
export type Fragment =
  | { kind: 'navigation' | 'analytical'; token: DrawnToken; alternative: DeskAlternative }
  | { kind: 'correction'; asks: string };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Lower case, one space between words, and no trailing stop or question mark. */
export function normalise(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[?.!,]+$/, '');
}

/**
 * Where this argument lands in THIS tool's own arguments.
 *
 * The same question `replay.target` answers on the server, off the same
 * served map: a `path` for an argument every tool spells the same way, and
 * `per_tool` for the window, because a tool whose window is `lookback_days`
 * has never had a `date_range`. A tool absent from that map has no window,
 * and therefore no window token.
 */
export function pathFor(
  defs: DeskDefinitions, tool: string, argument: string,
): string[] | null {
  const landing = defs.replay?.arguments?.[argument];
  if (!landing) return null;
  if (landing.path) return landing.path;
  if (landing.per_tool) {
    const named = defs.window_arguments?.[tool];
    return named ? [named] : null;
  }
  return null;
}

/** The value a stored call carries at a path, or undefined if it carries none. */
function at(call: ToolCall, path: string[]): unknown {
  let node: unknown = call.arguments;
  for (const part of path) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[part];
    if (node === undefined || node === null) return undefined;
  }
  return node;
}

/** The key a replayed call is remembered under. Per turn, because seq is. */
export const retunedKey = (turn: number, seq: number): string => `${turn}:${seq}`;

export interface TokenInput {
  defs: DeskDefinitions | null | undefined;
  answers: AnswerTurn[];
  /** The objects actually DRAWN — a token for a tile nobody can see is a lie. */
  board: BoardObject[];
  /** Calls already replayed, so a token shows where the person moved it to. */
  retuned: Record<string, ToolCall>;
}

/**
 * The tokens under the reading, in the order the definitions list them.
 *
 * An argument a `control` block on the board already carries for the same
 * call is skipped: two window pickers on one screen disagreeing about which
 * is the control is worse than neither (`tokens.not_when_a_control_carries_it`).
 */
export function tokensFor(input: TokenInput): DrawnToken[] {
  const { defs, answers, board, retuned } = input;
  if (!defs?.tokens?.length) return [];

  const drawn = board.filter((o) => o.seq !== undefined && answers[o.turn]);
  // The calls on screen, once each — several objects commonly draw one read.
  const calls = new Map<string, { call: ToolCall; target: TokenTarget }>();
  for (const o of drawn) {
    const seq = o.seq as number;
    const turn = answers[o.turn];
    const call = retuned[retunedKey(o.turn, seq)] ?? callOf(turn, seq);
    const post = turn.post?.answer_post_id ?? null;
    if (!call || !post) continue;
    calls.set(retunedKey(o.turn, seq),
              { call, target: { post, turn: o.turn, seq, tool: call.tool } });
  }

  // Which arguments a composed control already owns, by the call it names.
  const owned = new Set(
    board
      .filter((o) => o.kind === 'control' && o.seq !== undefined)
      .map((o) => {
        const named = o.argument ?? 'date_range';
        return `${retunedKey(o.turn, o.seq as number)}|${defs.replay?.from_control?.[named] ?? named}`;
      }),
  );

  const out: DrawnToken[] = [];
  for (const token of defs.tokens) {
    const targets: TokenTarget[] = [];
    const moved: ToolCall[] = [];
    let value: unknown;
    let agreed = true;
    for (const [key, { call, target }] of calls) {
      if (owned.has(`${key}|${token.argument}`)) continue;
      const path = pathFor(defs, call.tool, token.argument);
      if (!path) continue;
      const here = at(call, path);
      if (here === undefined) continue;
      if (!targets.length) value = here;
      else if (!same(value, here)) { agreed = false; break; }
      targets.push(target);
      moved.push(call);
    }
    if (!agreed || !targets.length) continue;
    const alternatives = permitted(token, moved);
    // A token with one alternative is the one it is already on: nothing to
    // offer, so nothing to tap, so nothing to draw.
    if (alternatives.length < 2) continue;
    const match = alternatives.find((a) => same(a.value, value));
    out.push({
      argument: token.argument,
      kind: token.kind,
      label: token.label,
      value,
      valueLabel: match?.label ?? said(value),
      alternatives,
      targets,
    });
  }
  return out;
}

/**
 * The alternatives EVERY read this token would move actually permits.
 *
 * A `group_by` over `net_sales` may not be a product grouping — the tool
 * refuses it in its own sentence, because net sales is transaction grain —
 * and a control that offers what will be refused is worse than no control.
 * Which value permits what is served (`permitted_by`, from the metric's own
 * `valid_group_by`); the intersection across the reads is taken here, because
 * one token moves all of them and an alternative one of them refuses would
 * break the board rather than move it.
 */
function permitted(token: DeskToken, calls: ToolCall[]): DeskAlternative[] {
  const permit = token.permitted_by;
  if (!permit) return token.alternatives;
  return token.alternatives.filter((alternative) => {
    if (!alternative.permit_key) return true;
    return calls.every((call) => {
      const by = (call.arguments as Record<string, unknown>)[permit.argument];
      const allowed = permit.permits[String(by)];
      return Boolean(allowed?.includes(alternative.permit_key as string));
    });
  });
}

/**
 * A stored value said as a person reads it — for the one the definitions do
 * not offer as an alternative, which is how an explicit window a replay
 * already moved to ("2026-08-01 → 2026-09-01") gets a word at all.
 */
function said(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(' → ');
  return String(value ?? '').replace(/_/g, ' ');
}

/**
 * What a short thing typed into the composer IS — or nothing, which sends it
 * to George exactly as it always went.
 *
 * IT RESOLVES AGAINST THE TOKENS ON SCREEN AND NOTHING ELSE
 * (`fragments.resolves_against: drawn_tokens`). The vocabulary is therefore
 * not a keyword list somebody wrote: it is the alternatives the person can
 * see. Two tokens answering to the same word is an ambiguity, and an
 * ambiguity is a question — it goes to George rather than being settled here.
 */
export function resolveFragment(
  text: string, tokens: DrawnToken[], defs: DeskDefinitions | null | undefined,
): Fragment | null {
  const typed = normalise(text);
  if (!typed || !defs) return null;

  const correction = defs.fragments?.correction;
  if (correction && normalise(correction.token) === typed) {
    return { kind: 'correction', asks: correction.asks };
  }

  const max = Number(defs.fragments?.max_words ?? 0);
  if (!max || typed.split(' ').length > max) return null;

  const hits: Fragment[] = [];
  for (const token of tokens) {
    for (const alternative of token.alternatives) {
      if (same(alternative.value, token.value)) continue;  // already there
      if (!alternative.spellings.some((s) => normalise(s) === typed)) continue;
      hits.push({ kind: token.kind, token, alternative });
    }
  }
  return hits.length === 1 ? hits[0] : null;
}
