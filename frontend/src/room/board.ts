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
 * THAT HOLDS WITHIN ONE PIECE OF WORK, AND NOT ACROSS TWO (P1.d, 2026-09-14).
 * Persisting is what makes this a room; persisting FOREVER is what made the
 * owner ask for problems and get four answers to the question before it. So a
 * question that shares nothing with the board clears it (`travel`), and one
 * that shares a subject transforms it while everything the newest turn did not
 * touch folds to a line (`folded`). Between them: nothing stacks.
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
/**
 * metrics.yaml composition.expire_after_turns. A quiet object nobody has
 * touched for this many turns leaves the board on its own — unless the
 * person KEPT it. Six turns of being pushed aside is nobody coming back.
 */
export const EXPIRE_AFTER_TURNS = 6;

export interface BoardObject {
  key: string;
  /**
   * A composed shape has no widget kind; it is `spec`. Until this was said,
   * a block with only a `spec` fell through `edit.kind ?? 'text'` and the
   * board took George's leading shape for his prose — which is why the
   * turn's caveats were drawn on every text tile on the board, including
   * three from earlier turns, the moment a spec led. `text` has since left
   * the vocabulary entirely (P1.c); it survives in the type for stored turns.
   */
  kind: NonNullable<Block['kind']> | 'spec';
  weight: NonNullable<Block['weight']>;
  seq?: number;
  tool?: string;
  subject?: string;
  subjects?: string[];
  /** The few words titling it — George's claim about what it says. */
  claim?: Block['claim'];
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
                'label', 'action', 'argument', 'spec', 'seqs', 'claim',
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
 * WHAT A READ IS, for the purpose of "this is that".
 *
 * Measured 2026-09-12: 168 `put` edits to 3 `change`. George almost never
 * changes the object he already has; asked the same thing again he puts a
 * twin beside it under a fresh key, and the board ends up holding the same
 * read drawn five ways. The key is his memory and he does not keep it. So
 * the board keeps its own: an object is identified by the READ it draws —
 * tool, arguments, and the subject it is scoped to — and a later `put` of
 * the same read REPLACES the object rather than joining it.
 *
 * Not a hash of the rows: the same read run again with new rows is the same
 * object updated, which is exactly what "replace" should mean. And not the
 * kind: a table of last week's shops and a comparison of last week's shops
 * are the same thing shown two ways, and one board holds one of them.
 */
export function readIdentity(answers: AnswerTurn[], turn: number, edit: {
  seq?: number; seqs?: number[]; subject?: string;
}): string | null {
  const seq = edit.seq ?? edit.seqs?.[0];
  if (seq === undefined) return null;
  const call = answers[turn]?.toolCalls.find((c) => c.seq === seq);
  if (!call) return null;
  const args = JSON.stringify(call.arguments ?? {}, Object.keys(call.arguments ?? {}).sort());
  // A single `subject` SCOPES the object to one row, so two subjects of one
  // read are two objects. `subjects` (a comparison) is the read shown another
  // way, and one board holds one of those — so it is not part of identity.
  return `${call.tool}|${args}|${edit.subject ?? ''}`;
}

/**
 * The seqs a composition's blocks draw from.
 *
 * Both channels: `seq` on a named widget, `seqs` on a composed shape, which is
 * every read its marks reach into.
 */
function drawnSeqs(blocks: readonly Block[]): Set<number> {
  const out = new Set<number>();
  for (const b of blocks) {
    if (typeof b.seq === 'number') out.add(b.seq);
    for (const s of b.seqs ?? []) if (typeof s === 'number') out.add(s);
  }
  return out;
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
 *
 * THE DEFAULT COMES FIRST, AND IS SUPERSEDED BY SEQ (P1.b, 2026-09-13). The
 * loop composes a board the moment the reads land, so an object is on screen a
 * round trip before George has said anything about it
 * (agent/default_composition.py). When his composition arrives it is applied
 * ON TOP of the default's edits rather than in place of them, so the board
 * TRANSFORMS instead of being swapped out — and every default over a read he
 * composed over drops out, because he has now said what that read is.
 *
 * BY SEQ, NOT BY KEY, and the difference is the whole of why this is written
 * down. George never sees the default's keys, so he cannot compose the same
 * one; what he does name is the READ, which is the identity the board already
 * uses (readIdentity). A default over a read he did NOT mention stays, quiet,
 * exactly as any object he does not mention stays.
 */
function editsFor(turn: AnswerTurn, i: number): Block[] {
  // THE READING IS NOT AN OBJECT (P1.c, 2026-09-14). It is drawn above the
  // board from the turn's own words, so a `text` block is nothing the board
  // can hold — and one can only reach here from a turn stored before the
  // vocabulary lost the kind. Dropping it is what keeps an old thread
  // readable without drawing the answer twice.
  const kept = (blocks: readonly Block[]) => blocks.filter((b) => b.kind !== 'text');
  const composed = kept(turn.composition?.blocks ?? []);
  const seeded = kept(turn.defaultComposition?.blocks ?? []);
  if (composed?.length) {
    const his = drawnSeqs(composed);
    return [
      ...seeded
        .filter((b) => !(typeof b.seq === 'number' && his.has(b.seq)))
        // A DEFAULT NEVER OUTRANKS HIM. What survives is a read he did not
        // mention, and weight is judgement made visible — so once he has
        // composed, the machine's guess at what leads is quiet whatever it
        // said. `oneLead` cannot settle this: both edits land in the same
        // turn, so `touched` is equal and which one wins comes down to the
        // order objects happen to sit in the array.
        .map((b) => (b.weight === 'lead' ? { ...b, weight: 'quiet' as const } : b)),
      ...composed,
    ];
  }
  if (seeded.length) return seeded;
  // No fallback tile for his prose: there is nowhere for it to go and nowhere
  // it needs to. A turn that composed nothing contributes its reads, quiet,
  // and the reading above them is drawn whether anything was composed or not.
  const out: Block[] = [];
  for (const c of turn.toolCalls) {
    if (!c.result || c.result.error || !c.result.rows?.length || c.duplicate_of !== undefined) continue;
    if (c.tool.startsWith('record_') || c.tool === 'compose') continue;
    out.push({ op: 'put', kind: 'table', key: `t${i}-read-${c.seq}`, weight: 'quiet', seq: c.seq, tool: c.tool });
  }
  return out;
}

/* ---------------------------------------------- how the board travels */

/**
 * metrics.yaml composition.board_travel.subject_filters. An argument that
 * names WHICH thing a read is about, rather than narrowing the population it
 * measures over: `store: "OPUS"` says the read is about OPUS; `state:
 * "low_stock"` says it is about less of everything.
 */
const SUBJECT_FILTERS = ['store', 'product', 'product_id', 'sku', 'category',
                         'supplier'] as const;

/**
 * WHAT SOMETHING IS ABOUT — the two facts the travel rule compares.
 *
 * `subjects` are names: off a block George composed, or off the scope its read
 * was filtered to. Lowercased, because "OPUS" and "Opus" are one shop.
 * `businesses` is what the read belongs to — the metric's own domain where it
 * declares one, and otherwise the tool, which names the business by
 * construction (a vending read is vending; there is no other table it could
 * have read). Two tools over one business — `get_stock` and `get_dead_stock`
 * — therefore read as two, and two estate-wide questions across them clear
 * rather than transform. Deliberate while it is only a fallback: erring
 * toward clearing is the safer error the log names, and a tool-to-business
 * map is a definition, which is where it would have to live.
 *
 * NOTHING HERE IS A FIGURE. Every value is a name off an argument, a label a
 * block carried, or a word the definitions declared.
 */
export interface Topic {
  subjects: Set<string>;
  businesses: Set<string>;
}

function scopeSubjects(args: unknown, into: Set<string>): void {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return;
  const bag = args as Record<string, unknown>;
  for (const k of SUBJECT_FILTERS) {
    const v = bag[k];
    for (const one of Array.isArray(v) ? v : [v]) {
      if (typeof one === 'string' && one.trim()) into.add(one.trim().toLowerCase());
    }
  }
  scopeSubjects(bag.filters, into);
}

function topicOf(
  answers: AnswerTurn[],
  turn: number,
  seqs: Iterable<number>,
  named: Iterable<string | undefined>,
): Topic {
  const subjects = new Set<string>();
  const businesses = new Set<string>();
  for (const s of named) if (s && s.trim()) subjects.add(s.trim().toLowerCase());
  for (const seq of seqs) {
    const call = answers[turn]?.toolCalls.find((c) => c.seq === seq);
    if (!call) continue;
    scopeSubjects(call.arguments, subjects);
    const domain = call.result?.meta?.metric_domain;
    businesses.add(typeof domain === 'string' && domain ? domain : call.tool);
  }
  return { subjects, businesses };
}

/** What the board as a whole is about — every object, each from its own turn. */
export function boardTopic(answers: AnswerTurn[], board: readonly BoardObject[]): Topic {
  const subjects = new Set<string>();
  const businesses = new Set<string>();
  for (const o of board) {
    const seqs = [...(o.seq === undefined ? [] : [o.seq]), ...(o.seqs ?? [])];
    const one = topicOf(answers, o.turn, seqs, [o.subject, ...(o.subjects ?? [])]);
    one.subjects.forEach((s) => subjects.add(s));
    one.businesses.forEach((b) => businesses.add(b));
  }
  return { subjects, businesses };
}

function editsTopic(answers: AnswerTurn[], turn: number, edits: readonly Block[]): Topic {
  const named: (string | undefined)[] = [];
  for (const e of edits) {
    named.push(e.subject);
    for (const s of e.subjects ?? []) named.push(s);
  }
  return topicOf(answers, turn, drawnSeqs(edits), named);
}

function meet(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/**
 * WHAT A NEW QUESTION DOES TO THE BOARD — the rule the dogfood log decided on
 * 2026-09-13, and this is the whole of it.
 *
 *   "i asked how are we doing ... and then i asked for problems ... and also
 *    when i ask to look for problems all the rest of the widgets still stayed"
 *
 * A question that shares a subject with the board TRANSFORMS it; a question
 * that shares nothing CLEARS it. That way round, and not the other, because
 * the only evidence anyone has is his complaint and his complaint was that
 * stale objects STAYED — so defaulting to what he observed as wrong is the
 * safer error. If clearing turns out to feel abrupt, the fix is to let cleared
 * objects fade rather than vanish, never to go back to keeping them.
 *
 * FOUR WAYS TO BE ABOUT WHAT IS ALREADY THERE, in the order they are cheapest
 * to be sure of:
 *
 *   HE NAMED IT      an edit HE composed under a key the board already holds
 *                    is him transforming that object by name, which is what
 *                    the keys are for. Only his: a default's keys are
 *                    positional (`read-0`), so every turn's default would
 *                    collide with the one before it and nothing would ever
 *                    clear.
 *   IT IS THAT       a put of a read the board already draws, by the identity
 *                    the board already uses (readIdentity) — the same read run
 *                    again is the same object.
 *   SHARED SUBJECT   the names intersect. "Compare with OPUS" while looking at
 *                    OPUS keeps the board; swapping OPUS for Magnolia does
 *                    not, because that is a different question about a
 *                    different shop.
 *   THE WHOLE ESTATE where one side names no subject at all it is about
 *                    everything, and there is no intersection to take — so the
 *                    BUSINESS decides. Widening from one shop to the estate on
 *                    the same measure is one piece of work; "look for problems"
 *                    after "how are we doing" is not, and that is the pair he
 *                    reported.
 *
 * A turn contributing no edits changes nothing, and an empty board has nothing
 * to clear: both stand still rather than guessing.
 */
export function travel(
  answers: AnswerTurn[],
  board: readonly BoardObject[],
  turn: number,
  edits: readonly Block[],
  hisKeys: ReadonlySet<string>,
): 'transforms' | 'clears' {
  if (!board.length || !edits.length) return 'transforms';

  const keys = new Set(board.map((o) => o.key));
  const identities = new Set(
    board.map((o) => readIdentity(answers, o.turn, o)).filter((x): x is string => Boolean(x)),
  );
  for (const e of edits) {
    if (hisKeys.has(e.key) && keys.has(e.key)) return 'transforms';
    const id = readIdentity(answers, turn, e);
    if (id && identities.has(id)) return 'transforms';
  }

  const was = boardTopic(answers, board);
  const now = editsTopic(answers, turn, edits);
  // A TURN THAT IS ABOUT NOTHING NEW IS NOT A NEW QUESTION. Edits that only
  // name keys — quiet this, drop that, lead with the other — read nothing and
  // name no subject, so there is nothing to compare and nothing to clear:
  // they ARE the board being transformed.
  if (now.subjects.size === 0 && now.businesses.size === 0) return 'transforms';
  if (was.subjects.size > 0 && now.subjects.size > 0) {
    return meet(was.subjects, now.subjects) ? 'transforms' : 'clears';
  }
  return meet(was.businesses, now.businesses) ? 'transforms' : 'clears';
}

/**
 * EARLIER TURNS FOLD; THEY DO NOT STACK.
 *
 * Clearing handles the question that shares nothing. This is the other half of
 * the same complaint: a question that DOES share a subject keeps what came
 * before it, and four turns in the finding is one tile among nine.
 *
 * So what the newest turn did not touch is not drawn — it is one quiet line
 * above the finding, which opens. The board still HOLDS it: this folds the
 * SCREEN, not the board, so "why?" three turns later still resolves against
 * everything (boardContext is taken from the whole board) and nothing George
 * put down has been thrown away.
 *
 * TWO THINGS NEVER FOLD. What the person KEPT — keeping is them saying "this
 * stays", and it outranks a turn count exactly as it outranks expiry — and
 * what they are looking at right now. What they set aside is not here at all:
 * it is in the set-aside row already.
 */
export function folded(
  board: readonly BoardObject[],
  newest: number,
  local: Record<string, Local>,
  focused: string | null,
): { shown: BoardObject[]; earlier: BoardObject[] } {
  const shown: BoardObject[] = [];
  const earlier: BoardObject[] = [];
  for (const o of board) {
    const mine = local[o.key];
    if (o.touched < newest && !mine?.kept && !mine?.closed && o.key !== focused) earlier.push(o);
    else shown.push(o);
  }
  return { shown, earlier };
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

export function buildBoard(answers: AnswerTurn[], kept: ReadonlySet<string> = new Set()): BoardObject[] {
  let board: BoardObject[] = [];
  // A key George chose for a twin, mapped to the key of the object it
  // replaced — so his later edits under the new name land on the old object.
  const aliases = new Map<string, string>();
  answers.forEach((turn, i) => {
    const edits = editsFor(turn, i);

    // THE BOARD TRANSFORMS; IT NEVER ACCUMULATES (P1.d, 2026-09-14). A
    // question that shares nothing with what is on the board clears it, and
    // what the person KEPT is the one thing that survives — the same
    // exemption keeping has from expiry, for the same reason. The aliases go
    // with the objects they pointed at: a name for something that is no
    // longer there would land his next edit on nothing.
    if (travel(answers, board, i, edits,
               new Set((turn.composition?.blocks ?? []).map((b) => b.key))) === 'clears') {
      board = board.filter((o) => kept.has(o.key));
      const left = new Set(board.map((o) => o.key));
      for (const [from, to] of [...aliases]) if (!left.has(to)) aliases.delete(from);
    }

    for (const edit of edits) {
      const key = aliases.get(edit.key) ?? edit.key;
      let at = board.findIndex((o) => o.key === key);
      const op = edit.op ?? 'put';

      // THIS IS THAT. A put under a new key whose read is already on the
      // board replaces that object where it stands, keeping its key and so
      // the person's arrangement of it. The new key becomes an alias.
      if (op === 'put' && at < 0) {
        const identity = readIdentity(answers, i, edit);
        if (identity) {
          const twin = board.findIndex((o) => readIdentity(answers, o.turn, o) === identity);
          if (twin >= 0) {
            aliases.set(edit.key, board[twin].key);
            at = twin;
          }
        }
      }

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
        key: at >= 0 ? board[at].key : edit.key,
        // A validated block carries a kind or a spec and never neither, so
        // the fallback is the shape, not his prose — which is no longer a
        // kind at all. An object that ends up here with no spec either draws
        // nothing, which is the truth about it.
        kind: edit.kind ?? 'spec',
        weight: edit.weight ?? 'supporting',
        ...carried(edit),
        turn: i,
        touched: i,
      } as BoardObject;
      if (at >= 0) board[at] = object;
      else board.unshift(object);
    }
    board = oneLead(board);
    board = expired(board, i, kept);
    board = bounded(board);
  });
  return board;
}

/**
 * WHAT LEAVES ON ITS OWN. A quiet object nobody has touched for
 * EXPIRE_AFTER_TURNS turns — pushed aside and never returned to — leaves
 * without waiting for the board to fill. A kept object never does: keeping
 * is the person saying "this stays", and it outranks a count.
 */
function expired(board: BoardObject[], now: number, kept: ReadonlySet<string>): BoardObject[] {
  return board.filter((o) => (
    o.weight !== 'quiet' || kept.has(o.key) || now - o.touched < EXPIRE_AFTER_TURNS
  ));
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
  /**
   * The read behind the object — tool and arguments, never rows — so the
   * server can recognise a repeat of it and turn a `put` into a `change`
   * (agent/compose.py). The same identity the client applies.
   */
  read?: { tool: string; arguments: Record<string, unknown> };
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
      ...(call ? { read: { tool: call.tool, arguments: (call.arguments ?? {}) as Record<string, unknown> } } : {}),
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
