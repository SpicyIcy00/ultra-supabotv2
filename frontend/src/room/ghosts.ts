/**
 * GREY TEXT THAT FINISHES THE QUESTION.
 *
 * Built from what is already on the screen. NOTHING HERE CONSULTS A MODEL: a
 * completion is a sentence assembled out of the board's own tokens, the
 * board's own subjects and the pages that name them. That is the rule the plan
 * sets — *"none ever needs a model call"* — and it is what makes the feature
 * free enough to fire on every keystroke.
 *
 * Every function that BUILDS a completion is pure. The one exception is at the
 * bottom of the file and is marked: `usePagesForGhosts` reads the caller's
 * pages through the `@` door P2.c opened — one cached request of things that
 * exist, no SQL in the service and no model on the path — because a page title
 * is the one of the three sources the screen does not already hold.
 *
 * IT OFFERS ONLY WHAT THE ROOM CAN ALREADY DO WITHOUT ASKING BOB. Three
 * kinds, and each one lands somewhere that exists:
 *
 *   replay   the spoken word for one alternative of a token drawn under the
 *            reading — "last month", "top 25". Typing it is already a replay
 *            (room/tokenShape.resolveFragment): about half a second, the same
 *            reads re-run on a different scope, no model turn. The ghost is
 *            not a new capability; it is the existing one, findable by people
 *            who did not know the words.
 *   subject  a shop, product or supplier the board is drawing, completed as an
 *            `@mention` — which the composer already binds to a selection.
 *   page     one of the caller's pages that NAMES a subject on the board, also
 *            as an `@mention`, which binds page scope.
 *
 * WHY IT COMPLETES THE WHOLE LINE AND NOT THE LAST WORD. A completion that
 * matched the word under the caret would fire constantly and be wrong most
 * times — the person is mid-sentence, and the thing they are typing is not
 * usually a shop. Matching the WHOLE draft means a ghost appears only when
 * everything typed so far is the start of something the room can do, which is
 * rare, obvious, and never in the way.
 *
 * NOTHING HERE IS A FIGURE, and nothing here is a word Bob wrote: every
 * candidate is a label the server served (`tokens.spoken`, a store name off a
 * row, a page title), so a ghost cannot put a number or a claim on the line.
 */
import { useQuery } from '@tanstack/react-query';
import { readMentions } from '../services/mentionsApi';
import type { DrawnToken } from './tokenShape';

/** One completion, and what taking it would do. */
export interface Ghost {
  /** The whole line, if it is accepted. */
  text: string;
  /** What is drawn grey: the part beyond what has been typed. */
  rest: string;
  /** Which of the three it is. */
  does: 'replay' | 'subject' | 'page';
  /**
   * What it costs, in the same words an action's button uses. Fixed per kind
   * rather than measured: a replay is the desk's own round trip (P1.j measured
   * 0.46–0.73 s) and a mention binds without leaving the page at all.
   */
  costs: string;
}

export interface GhostInput {
  /** What has been typed, exactly as it is in the line. */
  draft: string;
  /** The tokens drawn under the reading — the scope this work is on. */
  tokens: DrawnToken[];
  /** Subjects the board is drawing, in the order it draws them. */
  subjects: string[];
  /** The caller's pages, as the mentions read returned them. */
  pages: { id: string; title: string }[];
}

/**
 * Below this, everything matches and the line is never quiet. Two characters
 * is where a prefix starts meaning something.
 */
export const MIN_TYPED = 2;

/** As many as anything downstream could want; the composer draws the first. */
const MOST = 6;

const fold = (s: string) => s.trim().toLowerCase();

/**
 * Whether `candidate` is what the draft is the beginning of.
 *
 * Case-folded, so typing "green" finds "Greenhills"; and never an exact match,
 * because a ghost with nothing left to add is a ghost that only flickers.
 */
function begins(draft: string, candidate: string): boolean {
  const a = fold(draft);
  const b = fold(candidate);
  return a.length >= MIN_TYPED && b.startsWith(a) && b.length > a.length;
}

/** The completion, in the CANDIDATE's own spelling from the caret onward. */
function restOf(draft: string, candidate: string): string {
  return candidate.slice(draft.trim().length);
}

export function ghostsFor(input: GhostInput): Ghost[] {
  const draft = input.draft;
  if (fold(draft).length < MIN_TYPED) return [];
  const out: Ghost[] = [];
  const seen = new Set<string>();

  const offer = (candidate: string, does: Ghost['does'], costs: string) => {
    if (!begins(draft, candidate) || seen.has(fold(candidate))) return;
    seen.add(fold(candidate));
    out.push({ text: candidate, rest: restOf(draft, candidate), does, costs });
  };

  // 1. THE SAME READS, ON A DIFFERENT SCOPE. Only alternatives the token is
  //    not already on: completing "last week" while the board is on last week
  //    would offer to change nothing.
  for (const token of input.tokens) {
    for (const alternative of token.alternatives) {
      const words = [alternative.label, ...(alternative.spellings ?? [])];
      if (words.some((w) => typeof w === 'string' && fold(w) === fold(token.valueLabel))) continue;
      for (const word of words) {
        if (typeof word === 'string' && word.trim()) offer(word.trim(), 'replay', '~1s');
      }
    }
  }

  // 2. WHAT IS ON THE BOARD, as the `@` the composer already binds. The word
  //    the person is typing is the name itself, so the mention is built around
  //    it rather than expecting them to have typed the `@`.
  for (const subject of input.subjects) {
    if (subject && subject.trim()) offer(subject.trim(), 'subject', 'no turn');
  }

  // 3. AND A PAGE THAT NAMES ONE OF THEM. Not every page — a list of every
  //    page the person owns is a menu, and this is a completion. A page whose
  //    title names something on the board is the one they are plausibly about
  //    to ask about, and it binds that page as the question's scope.
  const named = input.subjects.map(fold).filter(Boolean);
  for (const page of input.pages) {
    const title = (page.title ?? '').trim();
    if (!title) continue;
    if (!named.some((s) => fold(title).includes(s))) continue;
    offer(title, 'page', 'no turn');
  }

  return out.slice(0, MOST);
}

/** The one that is drawn. First is best: replays before names. */
export function ghostFor(input: GhostInput): Ghost | null {
  return ghostsFor(input)[0] ?? null;
}

/**
 * The line after Tab.
 *
 * A subject and a page become an `@mention`, because that is what binds them
 * — the composer's own menu opens on the `@` and resolves the name against the
 * server, so the completion hands the person the thing they were typing
 * towards rather than a bare word that binds nothing. A replay is left plain:
 * a fragment IS the plain words, and `resolveFragment` reads them.
 */
export function accepted(ghost: Ghost): string {
  return ghost.does === 'replay' ? ghost.text : `@${ghost.text}`;
}

/**
 * THE PAGES A COMPLETION MAY NAME, through the `@` door P2.c opened.
 *
 * One read of things that exist — no SQL in the service, no model on the path
 * (backend/app/services/mentions.py) — cached for a minute, because a page
 * list does not change while somebody is typing a sentence. An empty query
 * returns what the server ranks first, which is what a completion wants: the
 * pages the person actually uses.
 *
 * A FAILED READ IS NO PAGES, not an error on the line. This is a convenience;
 * a completion that could not be built is simply not offered, and the person
 * types the four extra characters they were going to type anyway.
 */
export function usePagesForGhosts(): { id: string; title: string }[] {
  const { data } = useQuery({
    queryKey: ['mentions', ''],
    queryFn: ({ signal }) => readMentions('', signal),
    staleTime: 60_000,
    retry: false,
  });
  return (data?.candidates ?? [])
    .filter((c) => c.kind === 'page')
    .map((c) => ({ id: c.id, title: c.label }));
}
