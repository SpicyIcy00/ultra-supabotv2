/**
 * WHERE AN OFFER GOES, AND WHAT IT SAYS IT COSTS.
 *
 * Pure. The loop validated every offer (agent/actions.py) and derived what each
 * act costs from metrics.yaml; this module only decides WHERE each one is drawn
 * and what the button reads.
 *
 * THE RULE IS ONE SENTENCE: a targeted offer is drawn on its row, and every
 * other one at the foot. It is the Netflix "Because you watched" shape — the
 * suggestion sits on the thing it is about, so it needs no sentence naming
 * which thing it means, and it carries its reason, so a person can disagree
 * with it rather than only obey or ignore it.
 *
 * WHAT THIS MODULE MUST NEVER DO IS WORK OUT A COST. `costs` arrived on the
 * frame because the server read it out of the definitions at the moment the
 * offer was made and stored it on the answer post. Deriving it again here
 * would be a second opinion about a fact, and the two could disagree — a
 * reopened thread would then show a different promise from the one the person
 * was actually shown. It is drawn exactly as it is given.
 */
import type { ActionOffer } from '../types/bob';
import type { BoardObject } from './board';
import { callOf, rowsOf, subjectOf, type AnswerTurn } from './data';
import { markFor, type Mark } from './catalogue';

/** Every offer this turn made, or none. */
export function offersOf(turn: { actions?: ActionOffer[] } | null | undefined): ActionOffer[] {
  return Array.isArray(turn?.actions) ? turn!.actions! : [];
}

/**
 * The offers that belong to one ROW of one read.
 *
 * Matched on the read's seq AND on the target, because a seq alone is not a
 * row: two objects can draw the same read, and an offer about Magnolia belongs
 * on Magnolia's row in both of them and on nobody else's.
 *
 * The comparison is the one every other subject match in the room uses —
 * trimmed, case-folded — so an offer and the row it names cannot fail to meet
 * over a capital letter.
 */
export function onRow(offers: ActionOffer[], seq: number | null | undefined,
                      subject: string | null | undefined): ActionOffer[] {
  if (seq === null || seq === undefined || !subject) return [];
  const want = subject.trim().toLowerCase();
  return offers.filter(
    (a) => a.seq === seq && typeof a.target === 'string'
      && a.target.trim().toLowerCase() === want,
  );
}

/**
 * THE MARKS THAT DRAW A NAMED ROW, and so have somewhere to put an offer.
 *
 * `line` is missing on purpose: its rows are positions on an ordered field —
 * days, weeks, hours — and a button on one of them would be an offer about a
 * Tuesday. `figure` is here because its one row IS the subject.
 */
const NAMES_ITS_ROWS = new Set<Mark>(['figure', 'dumbbell', 'ranked', 'contributors', 'table']);

/**
 * WHICH OFFER GOES WHERE, decided ONCE for the whole screen.
 *
 * The marks could each filter the offers themselves, and then nothing would
 * know what was left over — an offer on a row the board happened to draw as a
 * line chart would vanish, and vanishing is the one thing a suggestion may not
 * do. So the decision is made here, in one pass over the board the person is
 * actually looking at, and both the marks and the foot read the answer.
 *
 * Only the NEWEST turn's objects can carry an offer: the offers came with that
 * turn, and putting one on an object folded up from three questions ago would
 * be an answer to a question nobody is looking at.
 */
export function placement(
  offers: ActionOffer[], board: BoardObject[], answers: AnswerTurn[],
): { onRows: Map<string, ActionOffer[]>; foot: ActionOffer[] } {
  const onRows = new Map<string, ActionOffer[]>();
  const taken = new Set<string>();
  const newest = answers.length - 1;
  const targeted = offers.filter((a) => typeof a.target === 'string' && a.target.trim());

  for (const o of board) {
    if (o.turn !== newest || o.seq === undefined || o.seq === null) continue;
    const turn = answers[o.turn];
    if (!turn) continue;
    const rows = rowsOf(callOf(turn, o.seq));
    if (!rows.length) continue;
    if (!NAMES_ITS_ROWS.has(markFor(o, rows))) continue;
    const names = new Set(rows.map((r) => subjectOf(r)?.trim().toLowerCase()).filter(Boolean));
    // ONE OFFER, ONE PLACE. Two objects may draw the same read — a dumbbell
    // and a ranked list of the same seven shops is an ordinary board — and an
    // offer that landed on both would be the same suggestion twice, which
    // reads as two. The board is already in reading order, so the first object
    // to be able to carry it is the one nearest the top, and it wins.
    const mine = targeted.filter(
      (a) => a.seq === o.seq && !taken.has(key(a))
        && names.has(a.target!.trim().toLowerCase()),
    );
    if (!mine.length) continue;
    onRows.set(o.key, mine);
    for (const a of mine) taken.add(key(a));
  }
  return { onRows, foot: offers.filter((a) => !taken.has(key(a))) };
}

/** One offer's identity, for telling a placed one from an unplaced one. */
export function key(a: ActionOffer): string {
  return `${a.act}|${a.seq}|${(a.target ?? '').trim().toLowerCase()}|${a.argument ?? ''}`;
}

/**
 * WHAT THE BUTTON READS: the act in the person's words, then what it costs.
 *
 * The verb is the surface's own vocabulary and not the model's — "why" is the
 * word on the tile's own button already, and two words for one act is how a
 * reader ends up thinking they are two different things.
 */
const SAYS: Record<string, string> = {
  why: 'why',
  open: 'open',
  replay: 'run it again',
};

export function says(a: ActionOffer): string {
  return SAYS[a.act] ?? a.act;
}

/**
 * The cost, as the definitions worded it, and nothing added.
 *
 * An offer whose act declared no cost draws none rather than a guess: an empty
 * label is honest and "instant" would not be.
 */
export function cost(a: ActionOffer): string | null {
  const said = (a.costs ?? '').trim();
  return said ? said : null;
}
