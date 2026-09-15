/**
 * SIX MARKS, DRAWN ONE WAY EACH.
 *
 * The owner, on the board he was handed: "with the widgets i dont really know
 * what im looking at, what visual language is better". The diagnosis in the
 * dogfood log is that the board draws EXPLORATORY — every series equal weight,
 * colour for identity, nothing annotated — while George is explanatory by
 * definition, because he has already done the analysis. Fourteen widget kinds,
 * six of which were ways to show a measurement, is a menu a reader has to
 * decode before they can read anything.
 *
 * So the renderer's catalogue is six:
 *
 *   figure        one number, its change, what it is in
 *   dumbbell      before → after per row, two dots joined
 *   ranked        bars in cells, one row each, the figure beside it
 *   contributors  a signed change per row — what moved the thing that moved
 *   line          a series over an ordered field, its baseline dotted
 *   table         the rows, when precision beats shape
 *
 * AND SINCE P1.f THE VOCABULARY IS THIS LIST. `composition.widgets` held
 * fourteen names for these six drawings until 2026-09-14, which was a choice
 * at every compose that bought nothing on screen; it now holds the six, plus
 * the four below. `markFor` still maps the retired names — `hero`,
 * `comparison`, `chart`, `distribution`, `timeline`, `recommendation`,
 * `subject` — because a board persists between turns and across a deploy, and
 * a thread stored before the change still has to draw. A kind that draws a
 * read maps by what the ROWS are: a compared set of shops with a baseline
 * each is a dumbbell, the same set without one is a ranking, because the rows
 * are what a reader is actually looking at.
 *
 * FOUR KINDS ARE NOT READINGS AND KEEP THEIR OWN TILES: `draft` (an order you
 * edit, with a total that follows your edits), `control` (a handle on a read),
 * `state` and `system` (where something stands). A mark is a way of drawing
 * what a read RETURNED; those four are objects you do something to. Mapping
 * them onto `table` would have deleted the draft's editable quantities, which
 * is the one gesture the purchase arc turns on. This is the card's one
 * deviation and it is recorded in ops/DECISIONS.md.
 */
import type { BoardObject } from './board';
import type { ToolMeta } from '../types/george';
import { changeOf, unitOf, valueOf, windowLabel, type Change } from './data';

/** The catalogue. Closed — a seventh is a decision, not an addition. */
export const MARKS = ['figure', 'dumbbell', 'ranked', 'contributors', 'line', 'table'] as const;
export type Mark = (typeof MARKS)[number];

/** The kinds that are not readings of a read, and why each keeps its tile. */
export const NOT_A_MARK: Record<string, string> = {
  draft: 'an order you edit — the quantities are yours and the total follows them',
  control: 'a handle on a read, not a drawing of one',
  state: 'where a process stands; it has a label, not rows',
  system: 'something that RUNS, with three states a mark cannot hold apart',
};

const TIME_KEYS = ['day', 'week', 'month', 'bucket', 'date', 'snapshot_date', 'hour', 'period'];

type Row = Record<string, unknown>;

function isNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function numeric(v: unknown): boolean {
  return isNumber(v) || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v));
}

/** The column the rows are ordered along, when they have one. */
export function timeKeyOf(rows: Row[]): string | null {
  if (!rows.length) return null;
  return TIME_KEYS.find((k) => rows.every((r) => r[k] !== null && r[k] !== undefined)) ?? null;
}

/** Every row carries the tool's own BEFORE, so a before→after is drawable. */
export function hasBaseline(rows: Row[]): boolean {
  return rows.length > 0 && rows.every((r) => numeric(r.baseline));
}

/**
 * Every row carries a signed change IN THE METRIC'S OWN UNIT.
 *
 * `change_pct` deliberately does not count. A percentage is a second reading
 * of a figure the row already carries, so a read with a value and a percentage
 * is a ranking with a delta on it; only a change in units is a decomposition —
 * an amount that went missing, which is what a contributors mark is for.
 */
export function hasChange(rows: Row[]): boolean {
  return rows.length > 0 && rows.every((r) => isNumber(r.change));
}

/**
 * WHICH OF THE SIX A BLOCK DRAWS AS.
 *
 * The kind George named decides the FAMILY — a figure is not a series however
 * many rows come back — and the rows decide the form inside it. Nothing here
 * reads a threshold, a formula or a figure; it reads which columns exist,
 * which is the same rule `default_composition.shape_for` uses on the way out
 * and `inferShape` used before that.
 */
export function markFor(o: Pick<BoardObject, 'kind' | 'form' | 'subject' | 'subjects'>,
                        rows: Row[]): Mark {
  switch (o.kind) {
    // ---- the six, said by name (P1.f) -----------------------------------
    // ONE NUMBER. Its change and what it is in sit with it; more rows than one
    // do not make it a series, because he asked for a figure.
    case 'figure':
      return 'figure';
    case 'dumbbell':
      return hasBaseline(rows) ? 'dumbbell' : ranking(rows);
    case 'contributors':
      return hasChange(rows) ? 'contributors' : ranking(rows);
    case 'ranked':
      return 'ranked';
    case 'line':
      return 'line';
    case 'table':
      return 'table';

    // ---- retired names a stored board still carries ----------------------
    case 'hero': case 'subject': case 'recommendation':
      return 'figure';
    // WHEN is the point, so the order is the axis.
    case 'timeline':
      return 'line';
    case 'chart':
      return o.form === 'line' ? 'line' : ranking(rows);
    case 'distribution':
      return timeKeyOf(rows) ? 'line' : ranking(rows);
    case 'comparison':
      return rows.length === 1 ? 'figure' : ranking(rows);
    default:
      // A shape George composed, or a kind this renderer does not draw as a
      // mark. `Piece` never asks about those; a caller that does gets the
      // honest answer, which is the rows'.
      return rows.length === 1 ? 'figure' : ranking(rows);
  }
}

/**
 * A SET OF NAMED ROWS, DRAWN AS WHAT THE TOOL MEASURED ABOUT THEM.
 *
 * A before on every row is a movement with two ends, and a dumbbell is the
 * standard form for that — the dogfood log's own words, against the caption
 * that used to decode the old one ("the track is the period before · the fill
 * is this one"; an encoding that needs a sentence is not working). A signed
 * change with no before is a decomposition: what moved. Neither is a bar of
 * values, so neither is drawn as one.
 */
function ranking(rows: Row[]): Mark {
  if (hasBaseline(rows)) return 'dumbbell';
  if (hasChange(rows)) return 'contributors';
  return 'ranked';
}

/* --------------------------------------------------------------- the frame */

/**
 * `composition.recommendation_actions`, in words. George chooses WHICH verb,
 * never invents one, and never supplies the figure that justifies it.
 */
const ACTIONS: Record<string, string> = {
  order: 'Order', investigate: 'Look into', check: 'Check',
  hold: 'Hold off on', switch_on: 'Switch on', leave_it: 'Leave',
};

/**
 * THE CLAIM-TITLE OVER A BLOCK — George's few words where he gave them, the
 * read's own where he did not.
 *
 * P1.e drew it from `note`, a characterisation borrowed for a job it was not
 * named for, on the reasoning that "the grammar has no field for a title and
 * must not get one — a claim typed into a block is a sentence with no
 * receipt". P1.f gave it its own name and kept the guarantee where it
 * belongs: the receipt is the block, whose source line, window and read time
 * are drawn under the title, and a `claim` carries NO DIGITS at all, checked
 * server-side exactly as a note is. So the title may say what the block says
 * and may never say a number.
 */
export function titleFor(o: Pick<BoardObject, 'claim' | 'note' | 'subject' | 'subjects' | 'tool' | 'action'>,
                         meta: ToolMeta | null | undefined): string {
  if (o.claim && o.claim.trim()) return o.claim.trim();
  // A STORED RECOMMENDATION'S VERB, from before P1.f. It was George's word
  // off a closed list and the one thing the block carried that no read did;
  // a board composed today says the same thing in the `next` slot, where
  // every answer has one.
  if (o.action && ACTIONS[o.action]) {
    return [ACTIONS[o.action], o.subject].filter(Boolean).join(' ');
  }
  if (o.note && o.note.trim()) return o.note.trim();
  const of = o.subject ?? (o.subjects && o.subjects.length ? o.subjects.join(', ') : null);
  const measure = meta?.metric_label
    ?? o.tool?.replace(/^get_/, '').replace(/_/g, ' ')
    ?? 'the rows';
  return of ? `${measure} · ${of}` : measure;
}

/**
 * THE LINE UNDER THE TITLE: metric, window, unit — all three off `meta`, none
 * of them a figure. It is what a reader needs to know before the number means
 * anything, and it is the answer to "₱556.6 / ₱545.91", two numbers with a
 * slash and nothing saying what either one was.
 */
export function subtitleFor(meta: ToolMeta | null | undefined, rows: Row[]): string {
  const parts: (string | null)[] = [];
  if (meta?.metric_label) parts.push(meta.metric_label);
  parts.push(windowLabel(meta));
  // WHAT IT WAS MEASURED AGAINST, in the definitions' own words — and they
  // already start with "vs" (`comparisons.*.display_name`), so prefixing one
  // here produced "vs vs previous period". Say it as the yaml says it.
  const against = meta?.comparison?.display_name ?? null;
  if (against) parts.push(against);
  const unit = unitOf(rows[0]) ?? unitOf(meta);
  if (unit) parts.push(unit.toUpperCase() === 'PHP' ? '₱' : unit);
  if (rows.length > 1) parts.push(`${rows.length} rows`);
  return parts.filter(Boolean).join(' · ');
}

/* ------------------------------------------------------------- the palette */

/**
 * FOUR DATA COLOURS, AND COLOUR IS DIRECTION.
 *
 * The board used to spend a hue per shop — seven shops, seven hues, over a row
 * label already saying which shop it was. Two named anti-patterns at once, and
 * colour buying nothing. Identity keeps its hues where identity is the point
 * (the object panel, a tile's own field); inside a MARK, colour says which way
 * a thing moved and nothing else, and the row that matters is lit while the
 * rest cool.
 *
 * `george` is the fourth and it is not a direction: it is the emphasised row
 * of a read that declared none — "this is the one", where nothing rose or
 * fell. A FIFTH fails `palette.test.ts`, which reads this list.
 */
export const DATA_COLOURS = ['up', 'down', 'flat', 'george'] as const;
export type DataColour = (typeof DATA_COLOURS)[number];

/**
 * The colour one row of a mark burns in. A row nobody emphasised in a read
 * with no direction is `flat`; the emphasised one is `george`.
 */
export function colourOf(change: Change | null, lit: boolean): DataColour {
  // A ROW KEEPS THE DIRECTION ITS OWN TOOL MEASURED, LIT OR NOT (2026-09-15).
  //
  // It used to return `flat` for every row but the emphasised one — his
  // report, of the board P2.l put live an hour before: *"why are the other
  // names not highlighted? the other charts not colored? ... all stores still
  // matter not full focus on one"*. Six shops whose fall was in the same read
  // that coloured OPUS were drawn in the colour of no direction, and a reader
  // could not tell "fell, but not the point" from "did not move".
  //
  // Emphasis is WEIGHT now and nothing else (`COOL` in marks.tsx): the row he
  // named is fully lit, the rest are quieter and keep their colour. `lit` is
  // still read, for one case only — a row with no direction at all. There,
  // being the one he pointed at is the only thing to say about it, and that is
  // his own mark; a row nobody pointed at that declared nothing is flat,
  // because flat is the colour of exactly that.
  if (change && change.pct !== null && change.direction && change.direction !== 'flat') {
    return change.direction;
  }
  return lit ? 'george' : 'flat';
}

/** The change a row declares, for `colourOf`. Null where it declares none. */
export function changeIfAny(row: Row): Change | null {
  const change = changeOf(row);
  return change.pct === null && !change.direction ? null : change;
}

/** The row's headline figure and the unit it is in — both the tool's. */
export function figureOf(row: Row, meta: ToolMeta | null | undefined) {
  const v = valueOf(row);
  return v ? { ...v, unit: unitOf(row) ?? unitOf(meta) } : null;
}
