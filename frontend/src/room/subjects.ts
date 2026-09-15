/**
 * A SUBJECT IS AN ID, NOT A WORD (P2.c).
 *
 * The surface has always known which thing a person tapped: they tapped a row,
 * and the row carried `store_id`. What travelled to George was the LABEL —
 * `{id: label, label}` — so "Rockwell" reached him as a string with two
 * meanings in this estate, a shop and every product sold in it, and he had to
 * decide which. The id was two columns away the whole time.
 *
 * WHICH COLUMN IS THE IDENTITY IS THE DEFINITIONS' TO SAY, and it is served:
 * `surface.desk.selection.identity` names the id column per dimension and
 * `label_columns` names where the label lives. Nothing here holds a list of
 * columns of its own, and nothing here guesses: a row that does not carry the
 * declared id column yields a subject that says so (`from: 'label'`) rather
 * than one that pretends.
 *
 * NOTHING HERE READS A FIGURE. Every function below finds a row, reads two
 * string columns out of it, and stops.
 */
import type { DeskDefinitions } from '../services/deskApi';
import { callOf, rowsOf, type AnswerTurn, type Dimension } from './data';
import type { BoardObject } from './board';
import { retunedKey } from './tokenShape';
import type { ToolCall } from '../types/george';

/** One thing the person is talking about, as it travels. */
export interface Subject {
  dimension: Dimension;
  /** What goes in `desk.selection.subjects[].id`. */
  id: string;
  label: string;
  /**
   * WHERE THE ID CAME FROM, kept because the difference matters and because
   * a test on the resolution has to be able to see it:
   *   `rows`    — the declared identity column of a row a tool returned.
   *   `mention` — a completion that resolved against a vetted read.
   *   `label`   — no id column anywhere; the label is all there is. True by
   *               definition for a category and a supplier, and a fallback
   *               everywhere else.
   */
  from: 'rows' | 'mention' | 'label';
}

type Defs = DeskDefinitions | null | undefined;

const clean = (v: unknown): string | null => (
  typeof v === 'string' && v.trim() ? v.trim()
    : typeof v === 'number' && Number.isFinite(v) ? String(v) : null
);

/** The column holding this dimension's id, as the definitions declare it. */
export function identityColumn(defs: Defs, dimension: Dimension): string | null {
  const named = defs?.selection?.identity?.[dimension];
  return typeof named === 'string' && named ? named : null;
}

/** The columns a row may carry this dimension's LABEL in, in order. */
export function labelColumns(defs: Defs, dimension: Dimension): string[] {
  const named = defs?.selection?.label_columns?.[dimension];
  return Array.isArray(named) ? named.map(String) : [dimension];
}

/**
 * The subject one row is about for this dimension, or null.
 *
 * Matched on the LABEL columns only. A row whose `store` is "OPUS" is about
 * OPUS; a row that merely happens to contain the string somewhere else is not,
 * which is the bug `rowFor` — a scan of every value in the row — would walk
 * into the moment a product were called after a shop.
 */
export function subjectInRow(
  row: Record<string, unknown>, label: string, dimension: Dimension, defs: Defs,
): Subject | null {
  const want = label.trim().toLowerCase();
  const holds = labelColumns(defs, dimension)
    .some((c) => clean(row[c])?.toLowerCase() === want);
  if (!holds) return null;
  const column = identityColumn(defs, dimension);
  const id = column ? clean(row[column]) : null;
  return { dimension, label: label.trim(), id: id ?? label.trim(),
           from: id ? 'rows' : 'label' };
}

/** The same, over a read's whole result. The first row that is about it wins. */
export function subjectInRows(
  rows: Record<string, unknown>[], label: string, dimension: Dimension, defs: Defs,
): Subject | null {
  for (const row of rows) {
    const found = subjectInRow(row, label, dimension, defs);
    if (found) return found;
  }
  return null;
}

export interface BoardRows {
  answers: AnswerTurn[];
  board: BoardObject[];
  retuned: Record<string, ToolCall>;
  defs: Defs;
}

/**
 * THE SUBJECT A TAP MEANS, resolved against the reads actually on the board.
 *
 * Every drawn read is searched, not only the object that was tapped: a shop
 * named on a ranking tile may carry its id on the headline read beside it, and
 * an id found anywhere on screen is still an id the rows carried. The first
 * one found wins, and a label with no id column anywhere still becomes a
 * subject — it travels as the label, saying so.
 */
export function subjectOnBoard(
  input: BoardRows, label: string, dimension: Dimension,
): Subject {
  const { answers, board, retuned, defs } = input;
  let fallback: Subject | null = null;
  for (const o of board) {
    if (o.seq === undefined || !answers[o.turn]) continue;
    const call = retuned[retunedKey(o.turn, o.seq)] ?? callOf(answers[o.turn], o.seq);
    const found = subjectInRows(rowsOf(call), label, dimension, defs);
    if (found?.from === 'rows') return found;
    fallback = fallback ?? found;
  }
  return fallback ?? { dimension, label: label.trim(), id: label.trim(), from: 'label' };
}

/* ----------------------------------------------------------------- holding */

/** How many subjects may be held at once, as the definitions bound it. */
export function maxSubjects(defs: Defs): number {
  const n = Number(defs?.selection?.max_subjects ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

const sameSubject = (a: Subject, b: Subject) =>
  a.dimension === b.dimension && a.id === b.id;

/**
 * Pick it up, or put it down. One gesture, because the chip and the row are
 * the same act — and a subject already held is removed by tapping either.
 *
 * AT THE CAP, THE OLDEST GOES. Refusing the newest tap would make the control
 * silently dead, which is the failure mode the room's own rules keep naming:
 * a gesture that did nothing is worse than one that did something visible.
 */
export function toggleSubject(held: Subject[], next: Subject, cap: number): Subject[] {
  if (held.some((s) => sameSubject(s, next))) {
    return held.filter((s) => !sameSubject(s, next));
  }
  return [...held, next].slice(-Math.max(1, cap));
}

/** Only one dimension travels — the first one picked (`DeskSelection`). */
export function travelling(held: Subject[]): Subject[] {
  if (!held.length) return [];
  return held.filter((s) => s.dimension === held[0].dimension);
}

/** What goes on the request: ids, and the labels the rows carried beside them. */
export function asSelection(held: Subject[]):
  { dimension: Dimension; subjects: { id: string; label: string }[] } | null {
  const mine = travelling(held);
  if (!mine.length) return null;
  return {
    dimension: mine[0].dimension,
    subjects: mine.map((s) => ({ id: s.id, label: s.label })),
  };
}

/* -------------------------------------------------------------- comparison */

