/**
 * THE BOARD — what makes this a place rather than a screen.
 *
 * Until 2026-09-10 a composition WAS the screen: whatever George composed this
 * turn was drawn and everything before it disappeared. Ask about Seikyo, then
 * ask about North Edsa, and the draft order was gone. The workspace was a
 * function of the last question, which is why half the features it was meant
 * to have were only half there.
 *
 * Now a composition is a set of EDITS — put, change, quiet, drop — and this
 * module folds every turn's edits into one board that persists. An object
 * George does not mention stays exactly as it was: same read, same rows, same
 * receipts, same read time. He adds, changes, pushes aside and removes; he
 * never redraws what he has not touched.
 *
 * THE BOARD IS DERIVED, NEVER STORED SEPARATELY. It is a fold over the turns,
 * so a reload that restores the turns restores the board, and there is no
 * second copy of the truth to drift. Each object remembers WHICH TURN it draws
 * from, so an object made an hour ago still renders that hour-old read with
 * that hour-old timestamp — never this turn's rows under an old label.
 *
 * What the person does to the board — focus something, set it aside, sort a
 * table — is NOT here. That is theirs, it lives in the page, and it is applied
 * on top (see `Local`). Mixing the two would let a click look like a thing
 * George decided.
 */
import type { AnswerTurn, Block } from './composition';

/** metrics.yaml composition.max_objects. A bound on attention, not on memory. */
export const MAX_OBJECTS = 12;

export interface BoardObject {
  key: string;
  kind: NonNullable<Block['kind']>;
  weight: NonNullable<Block['weight']>;
  seq?: number;
  tool?: string;
  subject?: string;
  subjects?: string[];
  form?: Block['form'];
  label?: Block['label'];
  /** The turn whose reads and prose this object draws. Never re-pointed silently. */
  turn: number;
  /** The turn that last touched it, so "from earlier" can be said honestly. */
  touched: number;
}

/** What the PERSON has done to an object. Never George's, never a figure. */
export interface Local {
  closed?: boolean;
  sort?: { column: string; desc: boolean };
  open?: boolean;
}

const FIELDS = ['kind', 'weight', 'seq', 'tool', 'subject', 'subjects', 'form', 'label'] as const;

function carried(edit: Block): Partial<BoardObject> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const v = (edit as unknown as Record<string, unknown>)[f];
    if (v !== undefined) out[f] = v;
  }
  return out as Partial<BoardObject>;
}

/**
 * The edits a turn contributes.
 *
 * A turn George composed contributes his. A turn from before compose existed —
 * or one where every edit was refused — contributes a plain fallback: the
 * prose, and each successful read as a quiet table. Its keys are scoped to the
 * turn, because a turn that composed nothing chose no keys and must not
 * collide with another turn that also chose none.
 */
function editsFor(turn: AnswerTurn, i: number): Block[] {
  const composed = turn.composition?.blocks;
  if (composed?.length) return composed;
  const out: Block[] = [{ op: 'put', kind: 'text', key: `t${i}-reading`, weight: 'lead' }];
  for (const c of turn.toolCalls) {
    if (!c.result || c.result.error || !c.result.rows?.length || c.duplicate_of !== undefined) continue;
    if (c.tool.startsWith('record_') || c.tool === 'compose') continue;
    out.push({ op: 'put', kind: 'table', key: `t${i}-read-${c.seq}`, weight: 'quiet', seq: c.seq, tool: c.tool });
  }
  return out;
}

/** One lead, and it is the one most recently made lead. */
function oneLead(board: BoardObject[]): BoardObject[] {
  const leads = board.filter((o) => o.weight === 'lead');
  if (leads.length < 2) return board;
  const keep = leads.reduce((a, b) => (b.touched >= a.touched ? b : a));
  return board.map((o) => (o.weight === 'lead' && o !== keep ? { ...o, weight: 'supporting' } : o));
}

/**
 * A bounded board. What leaves first is the object pushed aside longest ago —
 * what was made quiet and never returned to is what nobody is coming back for.
 */
function bounded(board: BoardObject[]): BoardObject[] {
  if (board.length <= MAX_OBJECTS) return board;
  const out = board.slice();
  while (out.length > MAX_OBJECTS) {
    const pool = out.some((o) => o.weight === 'quiet') ? out.filter((o) => o.weight === 'quiet') : out;
    const oldest = pool.reduce((a, b) => (b.touched < a.touched ? b : a));
    out.splice(out.indexOf(oldest), 1);
  }
  return out;
}

export function buildBoard(answers: AnswerTurn[]): BoardObject[] {
  let board: BoardObject[] = [];
  answers.forEach((turn, i) => {
    for (const edit of editsFor(turn, i)) {
      const at = board.findIndex((o) => o.key === edit.key);
      const op = edit.op ?? 'put';

      if (op === 'drop') {
        if (at >= 0) board.splice(at, 1);
        continue;
      }
      if (op === 'quiet') {
        if (at >= 0) board[at] = { ...board[at], weight: 'quiet', touched: i };
        continue;
      }
      if (op === 'change') {
        // An edit naming nothing on the board changes nothing. It is not an
        // error — George may be editing an object the person has since closed.
        if (at < 0) continue;
        const prev = board[at];
        board[at] = {
          ...prev,
          ...carried(edit),
          // Only a change that names a READ re-points the object at this turn.
          // Otherwise it keeps drawing the rows it has always drawn.
          turn: edit.seq !== undefined ? i : prev.turn,
          touched: i,
        };
        continue;
      }

      const object: BoardObject = {
        key: edit.key,
        kind: edit.kind ?? 'text',
        weight: edit.weight ?? 'supporting',
        ...carried(edit),
        turn: i,
        touched: i,
      } as BoardObject;
      if (at >= 0) board[at] = object;
      else board.unshift(object);
    }
    board = oneLead(board);
    board = bounded(board);
  });
  return board;
}

/**
 * The board as it should be drawn: the person's own view applied on top.
 *
 * `focused` is a click, not a judgment — it makes one object the lead for as
 * long as they are looking at it, and demotes George's lead rather than
 * deleting it, so clearing the focus puts his back.
 */
export function inOrder(
  board: BoardObject[],
  local: Record<string, Local>,
  focused: string | null,
): BoardObject[] {
  const shown = board
    .filter((o) => !local[o.key]?.closed)
    .map((o) => {
      if (!focused) return o;
      if (o.key === focused) return { ...o, weight: 'lead' as const };
      return o.weight === 'lead' ? { ...o, weight: 'supporting' as const } : o;
    });
  const lead = shown.filter((o) => o.weight === 'lead');
  return [...lead, ...shown.filter((o) => o.weight !== 'lead')];
}

/** Rows in the order the person asked for. Reordering is not computing. */
export function sorted(
  rows: Record<string, unknown>[],
  sort: Local['sort'],
): Record<string, unknown>[] {
  if (!sort) return rows;
  const { column, desc } = sort;
  const out = rows.slice().sort((a, b) => {
    const x = a[column];
    const y = b[column];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y), 'en');
  });
  return desc ? out.reverse() : out;
}
