/**
 * THE BOARD — what makes this a room rather than a screen.
 *
 * A composition is a set of EDITS — put, change, quiet, drop — and this folds
 * every turn's edits into one board that persists. An object George does not
 * mention stays exactly as it was: same read, same rows, same receipts, same
 * read time. He adds, changes, pushes aside and removes; he never redraws what
 * he has not touched. Ask about a supplier, then about a shop, and the draft
 * order is still there.
 *
 * THE BOARD IS DERIVED, NEVER STORED SEPARATELY. It is a fold over the turns,
 * so restoring the turns restores the board and there is no second copy of the
 * truth to drift. Each object remembers WHICH TURN it draws from, so an object
 * made an hour ago still renders that hour-old read with that hour-old
 * timestamp — never this turn's rows under an old label.
 *
 * What the person does to the board — focus something, set it aside, sort a
 * table — is not here. That is theirs, it lives in the page, and it is applied
 * on top. Mixing the two would let a click look like something George decided.
 */
import type { AnswerTurn, Block } from './data';

/** metrics.yaml composition.max_objects. A bound on attention, not on memory. */
export const MAX_OBJECTS = 12;

export interface BoardObject {
  key: string;
  /**
   * A composed shape has no widget kind; it is `spec`. Until this was said,
   * a block with only a `spec` fell through `edit.kind ?? 'text'` and the
   * board took George's leading shape for his prose — which is why the
   * turn's caveats were drawn on every text tile on the board, including
   * three from earlier turns, the moment a spec led.
   */
  kind: NonNullable<Block['kind']> | 'spec';
  weight: NonNullable<Block['weight']>;
  seq?: number;
  tool?: string;
  subject?: string;
  subjects?: string[];
  form?: Block['form'];
  label?: Block['label'];
  action?: Block['action'];
  argument?: Block['argument'];
  /** A shape George composed, when no named widget fit. */
  spec?: Block['spec'];
  seqs?: Block['seqs'];
  emphasise?: Block['emphasise'];
  note?: Block['note'];
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
  /**
   * WHERE YOU PUT IT. George composes an order; this overrides it for you.
   * Lower comes first. Absent means "wherever he put it".
   */
  at?: number;
  /**
   * HOW BIG YOU WANT IT, over his weight. He says what matters; you say what
   * you want to look at, and those are different questions.
   *
   * `normal` is the one a button never sets and a DRAG does: it is what
   * dragging his lead down into the body of the board means. Without it that
   * gesture had nowhere to be recorded, so the tile sprang back to the top
   * the moment you let go of it — the arrangement lost to the weight, which
   * is the opposite of what every other line here says.
   */
  size?: 'big' | 'normal' | 'small';
  /**
   * KEEP IT. A kept object survives clearing the room, because it is
   * something you decided to hold on to rather than something this
   * conversation happened to produce.
   */
  kept?: boolean;
}

const FIELDS = ['kind', 'weight', 'seq', 'tool', 'subject', 'subjects', 'form',
                'label', 'action', 'argument', 'spec', 'seqs',
                'emphasise', 'note'] as const;

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
 * prose, and each successful read as a quiet table, keyed to the turn because
 * a turn that composed nothing chose no keys.
 *
 * NO OBJECT FOR A THOUGHT HE HAS NOT HAD YET: while a turn is still running
 * there is no prose, and an empty text tile leading the board is a blank sheet
 * above the work.
 */
function editsFor(turn: AnswerTurn, i: number): Block[] {
  const composed = turn.composition?.blocks;
  if (composed?.length) return composed;
  const out: Block[] = turn.text
    ? [{ op: 'put', kind: 'text', key: `t${i}-reading`, weight: 'lead' }]
    : [];
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
        // An edit naming nothing on the board changes nothing. Not an error —
        // George may be editing an object the person has since set aside.
        if (at < 0) continue;
        const prev = board[at];
        board[at] = {
          ...prev,
          ...carried(edit),
          // Only a change that names a READ re-points the object at this turn.
          turn: edit.seq !== undefined ? i : prev.turn,
          touched: i,
        };
        continue;
      }

      const object: BoardObject = {
        key: edit.key,
        kind: edit.kind ?? (edit.spec ? 'spec' : 'text'),
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
 * `focused` is a click, not a judgment — it makes one object lead for as long
 * as they are looking at it, and demotes George's lead rather than deleting
 * it, so clearing the focus puts his back.
 */
export function inOrder(
  board: BoardObject[],
  local: Record<string, Local>,
  focused: string | null,
): BoardObject[] {
  // IF YOU HAVE MADE SOMETHING BIG, HIS LEAD STANDS DOWN. Otherwise "bigger"
  // would add a second lead rather than choosing one, and the board would
  // have two things claiming to be the point — which is the arrangement
  // neither of you asked for.
  const yoursLeads = Object.values(local).some((l) => l?.size === 'big');

  const shown = board
    .filter((o) => !local[o.key]?.closed)
    .map((o) => {
      // YOUR SIZE BEATS HIS WEIGHT. He is saying what matters; you are saying
      // what you want to look at. Both are legitimate and they are not the
      // same question, so yours wins on your screen — and his survives
      // underneath, so an object he later leads with still leads.
      const size = local[o.key]?.size;
      const weight = size === 'big' ? 'lead' as const
        : size === 'small' ? 'quiet' as const
        : size === 'normal' ? 'supporting' as const
        : (yoursLeads && o.weight === 'lead') ? 'supporting' as const
        : o.weight;
      if (!focused) return { ...o, weight };
      if (o.key === focused) return { ...o, weight: 'lead' as const };
      return weight === 'lead' ? { ...o, weight: 'supporting' as const } : { ...o, weight };
    });

  // WHERE YOU PUT THINGS, over where he put them. An object you have never
  // moved keeps his position exactly; one you have moved goes where you left
  // it, and the two interleave rather than one list following the other.
  const placed = shown
    .map((o, n) => ({ o, at: local[o.key]?.at ?? n + shown.length }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.o);

  const lead = placed.filter((o) => o.weight === 'lead');
  return [...lead, ...placed.filter((o) => o.weight !== 'lead')];
}

/**
 * WHAT IS ON THE BOARD, as it travels with the next question — so "why?",
 * "products" and "these two" land on the thing being LOOKED at rather than the
 * last thing said. Carries the key George gave each object, because without it
 * a follow-up could only ever add a second object beside the one meant.
 *
 * Nothing here is a figure: every field is a name off a row, a label from the
 * definitions, or a word George already chose.
 */
export interface BoardContextObject {
  key: string;
  kind: string;
  weight: string;
  about?: string;
  measure?: string;
  window?: string;
}

export function boardContext(
  answers: AnswerTurn[],
  board: BoardObject[],
  local: Record<string, Local>,
  focused: string | null,
): BoardContextObject[] {
  return inOrder(board, local, focused).map((o) => {
    const call = o.seq === undefined ? null
      : answers[o.turn]?.toolCalls.find((c) => c.seq === o.seq) ?? null;
    const meta = call?.result?.meta;
    const about = o.subject ?? (o.subjects?.length ? o.subjects.join(' and ') : undefined);
    const win = meta?.window?.name ?? undefined;
    return {
      key: o.key,
      kind: o.kind,
      weight: o.weight,
      ...(about ? { about } : {}),
      ...(meta?.metric_label ? { measure: meta.metric_label } : {}),
      ...(win ? { window: win.replace(/_/g, ' ') } : {}),
    };
  });
}

/**
 * WHERE A DRAG LEAVES THE BOARD.
 *
 * Pure, and separate from the pointer, because the pointer is the part that
 * cannot be tested and this is the part that can be wrong. Given the order on
 * screen, the thing being carried and the thing it is over, this returns the
 * position for EVERY object — dense, 0..n-1 — or null when the drag would
 * change nothing.
 *
 * It renumbers everything rather than only what moved. A drag is the person
 * saying where things go, and half an arrangement (some placed, some still
 * wherever George put them) reads as the board fighting the cursor.
 */
export function dropped(
  order: BoardObject[],
  key: string,
  target: string,
  after: boolean,
): Record<string, number> | null {
  if (key === target) return null;
  const from = order.findIndex((o) => o.key === key);
  const onto = order.findIndex((o) => o.key === target);
  if (from < 0 || onto < 0) return null;

  const next = order.slice();
  const [moved] = next.splice(from, 1);
  const at = next.findIndex((o) => o.key === target);
  next.splice(after ? at + 1 : at, 0, moved);

  // Landing where it already was is not a move, and writing positions for it
  // would put an arrangement in the undo stack that nobody made.
  if (next.every((o, n) => o.key === order[n].key)) return null;

  const out: Record<string, number> = {};
  next.forEach((o, n) => { out[o.key] = n; });
  return out;
}
