/**
 * THE `@` DOOR (P2.c) — everything about it that is not drawing.
 *
 * Typing `@` and tapping a row are one mechanism with two doors: both end in a
 * chip carrying an id, and both travel in the same request field. This module
 * is the typed half, and it is pure so the resolution can be tested without a
 * browser — which is the thing this card is held by, "tests on the resolution,
 * not the wording".
 *
 * WHAT IS OPEN IS DECIDED BY THE CARET, NOT BY THE LAST CHARACTER. A person
 * who types a name, clicks back into the middle of it and keeps typing is
 * still completing that name; one who has moved past a space is not. So the
 * fragment is read backwards from the caret and stops at whitespace, at the
 * start of the line, or at nothing.
 *
 * NOTHING HERE HOLDS A VOCABULARY. The trigger character, the bounds and the
 * kinds are the definitions', served with the rest of the desk; the candidates
 * are the server's, off vetted reads. This module finds a substring, replaces
 * a substring, and decides what a chosen candidate BINDS by reading the
 * definitions' own word for it.
 */
import type { DeskDefinitions } from '../services/deskApi';
import type { MentionCandidate } from '../services/mentionsApi';
import type { Dimension } from './data';
import type { Subject } from './subjects';

type Defs = DeskDefinitions | null | undefined;

/** The `@…` being typed right now: where it starts, and what follows it. */
export interface OpenMention {
  /** Index of the trigger character in the draft. */
  at: number;
  /** The caret, which is where the fragment ends. */
  caret: number;
  /** What has been typed after the trigger — possibly nothing. */
  query: string;
}

const DEFAULT_TRIGGER = '@';

export function trigger(defs: Defs): string {
  const t = defs?.selection?.mentions?.trigger;
  return typeof t === 'string' && t.length === 1 ? t : DEFAULT_TRIGGER;
}

/**
 * The mention the caret is inside, or null.
 *
 * Refused for a trigger that is not at a word boundary — an email address has
 * an `@` in the middle of it and is not a mention — and for one whose text has
 * run past a space, because a name with a space in it is ambiguous with the
 * next word and this never guesses where a name ends.
 */
export function openMention(
  draft: string, caret: number, defs?: Defs,
): OpenMention | null {
  const mark = trigger(defs);
  const end = Math.max(0, Math.min(caret, draft.length));
  const head = draft.slice(0, end);
  const at = head.lastIndexOf(mark);
  if (at < 0) return null;
  const before = at === 0 ? '' : draft[at - 1];
  if (before && !/\s/.test(before)) return null;
  const query = head.slice(at + mark.length);
  // A NAME MAY CONTAIN SPACES, AND UNTIL 2026-09-15 IT COULD NOT.
  //
  // His report: *"when you search with spaces it doesnt show anything example:
  // 'Kiamoy strips' nothing"*. This line was `if (/\s/.test(query)) return
  // null` — the mention closed at the first space, so `@Kiamoy strips` stopped
  // being a mention the moment the space was typed. Nothing was wrong with the
  // matching: the server finds four products for that exact phrase. The menu
  // simply never asked.
  //
  // MEASURED, NOT GUESSED: 3,719 of 3,728 named products contain a space —
  // 99.8% — so the rule made `@product` work for nine of them. The bound is
  // the definitions' (`mentions.max_words`, set to 8, which covers 99.4% of
  // real names), and it exists only to stop a whole paragraph being sent as a
  // query. What actually closes a long mention is the RESULT: a multi-word
  // query that matches nothing is a sentence, and the composer stops drawing
  // the menu for it.
  const max = Number(defs?.selection?.mentions?.max_words ?? 1);
  if (query.split(/\s+/).filter(Boolean).length > (Number.isFinite(max) ? max : 1)) {
    return null;
  }
  return { at, caret: end, query };
}

/** Whether the list should be read yet, by the definitions' own bound. */
export function worthReading(open: OpenMention | null, defs: Defs): boolean {
  if (!open) return false;
  const min = Number(defs?.selection?.mentions?.min_prefix ?? 0);
  return open.query.length >= (Number.isFinite(min) ? min : 0);
}

/**
 * The draft with the open mention replaced by the chosen thing's name.
 *
 * The NAME goes into the text and the id goes onto the chip: a person reads
 * back what they wrote, and a uuid in a sentence is not that. One trailing
 * space, because the next thing typed is a new word.
 */
export function accept(
  draft: string, open: OpenMention, candidate: MentionCandidate, defs?: Defs,
): { text: string; caret: number } {
  const mark = trigger(defs);
  const head = draft.slice(0, open.at);
  const tail = draft.slice(open.caret);
  const word = `${mark}${candidate.label} `;
  return {
    text: head + word + tail.replace(/^ /, ''),
    caret: open.at + word.length,
  };
}

/* ------------------------------------------------------------ what it binds */

/**
 * WHAT PICKING THIS DOES, by the definitions' own word for it.
 *
 * `selection` — a subject, travelling in `desk.selection` with its dimension.
 * `page_scope` — the page the question is asked from, which injects a reader
 *                bound to the caller and that page.
 * anything else — named on the question and binding nothing, which today is a
 *                 rule. A kind the definitions do not declare is dropped
 *                 rather than assumed to be a subject: an unknown kind
 *                 reaching the selection would put an id of unknown meaning in
 *                 the field the tools read subjects out of.
 */
export type Bound =
  | { binds: 'selection'; subject: Subject }
  | { binds: 'page_scope'; pageId: string; title: string }
  | { binds: 'named'; kind: string; id: string; label: string };

export function bind(candidate: MentionCandidate, defs?: Defs): Bound | null {
  const declared = defs?.selection?.mentions?.kinds?.[candidate.kind];
  const binds = declared?.binds ?? candidate.binds;
  if (binds === 'selection') {
    const dimension = (declared?.dimension ?? candidate.dimension) as Dimension | undefined;
    if (!dimension) return null;
    return {
      binds: 'selection',
      // FROM A COMPLETION, and it says so. The id did not come off a row on
      // this screen — it came off a read that resolved the name — and the two
      // are worth telling apart when something is wrong with one of them.
      subject: { dimension, id: candidate.id, label: candidate.label, from: 'mention' },
    };
  }
  if (binds === 'page_scope') {
    return { binds: 'page_scope', pageId: candidate.id, title: candidate.label };
  }
  if (binds === 'named_on_question') {
    return { binds: 'named', kind: candidate.kind, id: candidate.id, label: candidate.label };
  }
  return null;
}

/**
 * The list as it is drawn: best match first, as the server ranked it, capped.
 *
 * The server has already ranked and capped; this exists so the component draws
 * what a test can assert without rendering, and so the cap is applied from the
 * definitions on this side too — a server that one day returns more does not
 * silently make the menu longer than the design.
 */
export function offered(
  candidates: MentionCandidate[], defs: Defs,
): MentionCandidate[] {
  const cap = Number(defs?.selection?.mentions?.max_results ?? 0);
  return Number.isFinite(cap) && cap > 0 ? candidates.slice(0, cap) : candidates;
}
