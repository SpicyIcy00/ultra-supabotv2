/**
 * The arguments the loop accepted, as tokens — and what a short thing typed
 * into the composer IS (P1.j, 2026-09-14).
 *
 * FIVE THINGS UNDER TEST, and they are all about not lying.
 *
 *   A token is drawn from a stored call's own arguments, through the map the
 *   definitions serve — never from a path this module knows by heart.
 *
 *   A token is true of the WHOLE screen or it is not drawn. Two reads on
 *   different windows make one window token a claim about a board half of
 *   which is somewhere else (UI rule 8), so nothing is drawn.
 *
 *   A read with no answer post cannot move. The call is named, not sent
 *   (P1.i), and a turn that was never logged has no call to name.
 *
 *   A fragment resolves only against what is ON SCREEN, and an ambiguity is
 *   a question: two tokens answering to one word goes to Bob.
 *
 *   The correction is the one thing here that costs a turn, and it is
 *   recognised by the word the definitions gave it.
 */
import { describe, expect, it } from 'vitest';
import type { DeskDefinitions } from '../services/deskApi';
import type { BobTurn, ToolCall } from '../types/bob';
import type { BoardObject } from './board';
import type { AnswerTurn } from './data';
import { pathFor, resolveFragment, retunedKey, tokensFor } from './tokenShape';

const call = (seq: number, args: Record<string, unknown>, tool = 'get_sales'): ToolCall => ({
  seq, tool, arguments: args,
  result: {
    row_count: 1, source_table: 'sales', truncated: false, duration_ms: 1, error: null,
    rows: [{ store: 'Rockwell', value: 1 }], rows_complete: true, meta: {},
  },
} as unknown as ToolCall);

const turn = (calls: ToolCall[], post: string | null = 'p1'): AnswerTurn => ({
  role: 'bob', text: '', thinking: '', toolCalls: calls, notices: [],
  pinned: [], saved: [], pageChanges: [], at: '2026-09-14T00:00:00Z',
  ...(post ? { post: { answer_post_id: post } } : {}),
} as unknown as BobTurn as AnswerTurn);

const object = (over: Partial<BoardObject>): BoardObject => ({
  key: 'read-0', kind: 'table', weight: 'quiet', turn: 0, touched: 0, ...over,
} as BoardObject);

/** The definitions as the route serves them, trimmed to what is read here. */
const DEFS = {
  window_arguments: { get_sales: 'date_range', get_purchase_plan: 'lookback_days' },
  replay: {
    arguments: {
      window: { per_tool: 'workflows.backtest.window_arguments' },
      store: { path: ['filters', 'store'] },
      group_by: { path: ['group_by'] },
      top_n: { path: ['top_n'] },
    },
    from_control: { date_range: 'window', top_n: 'top_n' },
    changes_shape: ['group_by'],
    max_restored_per_open: 4,
  },
  fragments: {
    max_words: 4,
    correction: { token: 'not what I meant', asks: 'Say what you understood.' },
  },
  tokens: [
    {
      argument: 'window', kind: 'navigation', label: 'window',
      alternatives: [
        { value: 'last_week', label: 'last week', spellings: ['last_week', 'last week'] },
        { value: 'last_month', label: 'last month', spellings: ['last_month', 'last month'] },
      ],
    },
    {
      argument: 'group_by', kind: 'analytical', label: 'grouped',
      alternatives: [
        { value: ['store'], label: 'by store', permit_key: 'store',
          spellings: ['by store', 'stores'] },
        { value: ['product'], label: 'by product', permit_key: 'product',
          spellings: ['by product', 'products'] },
      ],
      permitted_by: {
        argument: 'metric',
        permits: { net_sales: ['store'], product_revenue: ['store', 'product'] },
      },
    },
  ],
} as unknown as DeskDefinitions;

describe('a token is read off the stored call, through the served map', () => {
  it('finds the window under each tool\'s own name for it', () => {
    expect(pathFor(DEFS, 'get_sales', 'window')).toEqual(['date_range']);
    expect(pathFor(DEFS, 'get_purchase_plan', 'window')).toEqual(['lookback_days']);
    // A tool the backtest's map has never heard of has no window to change.
    expect(pathFor(DEFS, 'get_stock', 'window')).toBeNull();
    expect(pathFor(DEFS, 'get_sales', 'store')).toEqual(['filters', 'store']);
  });

  it('draws the value the call carried, said as the alternatives say it', () => {
    const answers = [turn([call(0, { metric: 'product_revenue', date_range: 'last_week', group_by: ['store'] })])];
    const tokens = tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })], retuned: {},
    });
    expect(tokens.map((t) => [t.argument, t.valueLabel]))
      .toEqual([['window', 'last week'], ['group_by', 'by store']]);
    expect(tokens[0].targets).toEqual([{ post: 'p1', turn: 0, seq: 0, tool: 'get_sales' }]);
  });

  it('draws nothing for an argument the call never carried', () => {
    const answers = [turn([call(0, { date_range: 'last_week' })])];
    const tokens = tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })], retuned: {},
    });
    expect(tokens.map((t) => t.argument)).toEqual(['window']);
  });

  it('shows where a replay moved it, not where it started', () => {
    const answers = [turn([call(0, { date_range: 'last_week' })])];
    const tokens = tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })],
      retuned: { [retunedKey(0, 0)]: call(0, { date_range: 'last_month' }) },
    });
    expect(tokens[0].valueLabel).toBe('last month');
  });

  it('says an explicit window in its own terms when no alternative is it', () => {
    const answers = [turn([call(0, { date_range: ['2026-08-01', '2026-09-01'] })])];
    const tokens = tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })], retuned: {},
    });
    expect(tokens[0].valueLabel).toBe('2026-08-01 → 2026-09-01');
  });
});

describe('a token is true of the whole screen or it is not drawn', () => {
  it('moves every read that is on that value, together', () => {
    const answers = [turn([
      call(0, { date_range: 'last_week' }),
      call(1, { date_range: 'last_week' }),
    ])];
    const board = [object({ key: 'a', seq: 0 }), object({ key: 'b', seq: 1 })];
    const tokens = tokensFor({ defs: DEFS, answers, board, retuned: {} });
    expect(tokens[0].targets.map((t) => t.seq)).toEqual([0, 1]);
  });

  it('draws nothing when two drawn reads disagree about the value', () => {
    const answers = [turn([
      call(0, { date_range: 'last_week' }),
      call(1, { date_range: 'yesterday' }),
    ])];
    const board = [object({ key: 'a', seq: 0 }), object({ key: 'b', seq: 1 })];
    expect(tokensFor({ defs: DEFS, answers, board, retuned: {} })).toEqual([]);
  });

  it('ignores a read that is on screen but carries no post to name it by', () => {
    const answers = [turn([call(0, { date_range: 'last_week' })], null)];
    expect(tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })], retuned: {},
    })).toEqual([]);
  });

  it('never offers a cut the metric refuses, and vanishes when none is left', () => {
    // `net_sales` is transaction grain: it declines a product grouping in its
    // own sentence, so the only grouping left is the one it is already on —
    // and a token with nowhere to go is not a control.
    const answers = [turn([call(0, { metric: 'net_sales', date_range: 'last_week',
                                     group_by: ['store'] })])];
    const tokens = tokensFor({
      defs: DEFS, answers, board: [object({ seq: 0 })], retuned: {},
    });
    expect(tokens.map((t) => t.argument)).toEqual(['window']);
  });

  it('offers only what EVERY read it would move permits', () => {
    const answers = [turn([
      call(0, { metric: 'product_revenue', date_range: 'last_week', group_by: ['store'] }),
      call(1, { metric: 'net_sales', date_range: 'last_week', group_by: ['store'] }),
    ])];
    const board = [object({ key: 'a', seq: 0 }), object({ key: 'b', seq: 1 })];
    expect(tokensFor({ defs: DEFS, answers, board, retuned: {} })
      .map((t) => t.argument)).toEqual(['window']);
  });

  it('leaves an argument alone when a control Bob composed carries it', () => {
    const answers = [turn([call(0, { metric: 'product_revenue', date_range: 'last_week', group_by: ['store'] })])];
    const board = [
      object({ key: 'read-0', seq: 0 }),
      object({ key: 'ctl', kind: 'control', seq: 0, argument: 'date_range' }),
    ];
    const tokens = tokensFor({ defs: DEFS, answers, board, retuned: {} });
    expect(tokens.map((t) => t.argument)).toEqual(['group_by']);
  });
});

describe('a fragment resolves against the tokens on screen, or it is a question', () => {
  const tokens = () => tokensFor({
    defs: DEFS,
    answers: [turn([call(0, { metric: 'product_revenue', date_range: 'last_week', group_by: ['store'] })])],
    board: [object({ seq: 0 })],
    retuned: {},
  });

  it('reads a window a person typed as a navigation change', () => {
    const got = resolveFragment('last month', tokens(), DEFS);
    expect(got).toMatchObject({ kind: 'navigation' });
    expect(got && 'alternative' in got && got.alternative.value).toBe('last_month');
  });

  it('reads a grouping as an analytical one, which still costs a turn', () => {
    const got = resolveFragment('products', tokens(), DEFS);
    expect(got).toMatchObject({ kind: 'analytical' });
    expect(got && 'alternative' in got && got.alternative.value).toEqual(['product']);
  });

  it('is not fussy about case, spacing or a question mark', () => {
    expect(resolveFragment('  Last  Month? ', tokens(), DEFS)).toMatchObject(
      { kind: 'navigation' });
  });

  it('does not resolve the value it is already on', () => {
    expect(resolveFragment('last week', tokens(), DEFS)).toBeNull();
  });

  it('does not resolve a word no token on screen answers to', () => {
    expect(resolveFragment('suppliers', tokens(), DEFS)).toBeNull();
    expect(resolveFragment('why', tokens(), DEFS)).toBeNull();
  });

  it('sends anything longer than a fragment to Bob', () => {
    expect(resolveFragment('show me last month for Rockwell please',
                           tokens(), DEFS)).toBeNull();
  });

  it('resolves nothing at all when no token is on screen', () => {
    expect(resolveFragment('last month', [], DEFS)).toBeNull();
  });

  it('knows the one token that costs a turn by the word the yaml gave it', () => {
    expect(resolveFragment('not what i meant', tokens(), DEFS))
      .toEqual({ kind: 'correction', asks: 'Say what you understood.' });
  });
});

/* ---------------------------------------------------------------------------
 * WHAT A REFUSAL SAYS TO A PERSON (the dogfood log, 2026-09-15)
 *
 * The tool's sentence names the argument and the yaml key, because the model
 * reading it has to fix its own call. It was also on the owner's screen.
 * ------------------------------------------------------------------------ */

import { refusalForPerson } from './tokenShape';       // eslint-disable-line

const REPLAY = {
  leaks: ['group_by', 'compare_to', 'metrics.yaml', 'get_sales', 'change_pct'],
  refused_leaks_says: 'That change cannot be made to this read. The figures have not moved.',
};

const LEAKED = "compare_to='previous_period' cannot be grouped by hour: each bucket "
  + 'against its own predecessor is a lag series, which is not built (metrics.yaml '
  + 'comparisons.not_supported.per_bucket_lag). Group by category, product, store.';

describe('a refusal a person may see', () => {
  it('shows a readable refusal whole, exactly as before', () => {
    const said = 'this_month is still in progress; last_month is the closed one.';
    expect(refusalForPerson(said, REPLAY)).toEqual({ head: said, detail: null });
  });

  it('keeps every leaked word out of the line that is drawn', () => {
    const out = refusalForPerson(LEAKED, REPLAY)!;
    for (const word of REPLAY.leaks) {
      expect(out.head.toLowerCase(), `${word} reached the reader`).not.toContain(word);
    }
    expect(out.head).toBe(REPLAY.refused_leaks_says);
  });

  it('does not throw the tool\'s words away — they go behind the tap', () => {
    expect(refusalForPerson(LEAKED, REPLAY)!.detail).toBe(LEAKED);
  });

  it('withholds the machinery even when the definitions supplied no sentence', () => {
    // No sentence to replace it with is not a licence to show the raw one.
    const out = refusalForPerson(LEAKED, { leaks: REPLAY.leaks })!;
    expect(out.head).not.toContain('metrics.yaml');
    expect(out.detail).toBe(LEAKED);
  });

  it('is nothing at all when nothing was refused', () => {
    expect(refusalForPerson(null, REPLAY)).toBeNull();
    expect(refusalForPerson('   ', REPLAY)).toBeNull();
  });

  it('reads the list it is given and keeps no copy of its own', () => {
    // A word that is a leak only because the definitions say so.
    expect(refusalForPerson('rank_by is not accepted here', { leaks: ['rank_by'] })!.detail)
      .toBe('rank_by is not accepted here');
    expect(refusalForPerson('rank_by is not accepted here', { leaks: [] })!.detail).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * A REFUSAL BELONGS TO THE GESTURE THAT CAUSED IT (the dogfood log, 2026-09-15)
 *
 * It was cleared only when the next replay STARTED, so a refused move left its
 * sentence under every turn after it. The owner's screenshots show one caveat
 * under two different boards with different tokens above them — which on its
 * own makes every later gesture look like it failed, and is most of *"nothing
 * happens when i say compare"*.
 *
 * THIS IS A SOURCE ASSERTION AND THEREFORE THE WEAKER KIND. The room has no
 * mount harness — `room.dom.test.tsx` renders the Board, not the Room — so
 * there is nowhere to drive an ask and watch the caveat go. It is written down
 * as a weaker guarantee rather than left uncovered, and the real check is a
 * person asking a second question and seeing the line disappear.
 * ------------------------------------------------------------------------ */

import { readFileSync } from 'node:fs';                     // eslint-disable-line
import { join } from 'node:path';                           // eslint-disable-line

describe('a refusal does not outlive its gesture', () => {
  const ROOM = readFileSync(join(__dirname, 'Room.tsx'), 'utf8');

  it('clears it when a question is asked, not only when a replay starts', () => {
    const ask = ROOM.slice(ROOM.indexOf('const askBob = useCallback'));
    const body = ask.slice(0, ask.indexOf('}, ['));
    expect(body, 'askBob does not clear the refusal').toContain('setRefusal(null)');
  });

  it('still clears it when the room is cleared, and when a replay begins', () => {
    // Both were already true and neither may quietly go: clearing the room
    // and starting a replay are the other two ends of the same gesture.
    expect(ROOM.split('setRefusal(null)').length - 1).toBeGreaterThanOrEqual(3);
  });
});


/* ---------------------------------------------------------------------------
 * A TOKEN NEVER DRAWS AN ID (the dogfood log, 2026-09-15)
 *
 * *"when i click 2 stores and say compare it just puts them in the store
 * filterer"* — and what it put there was
 * `67612230a740d90007464e26 → 668a43f60fa9990007cfa158`. A store alternative
 * is keyed by id with the name as its label, so ONE shop resolved to
 * "Magnolia" and the LIST that "compare these" sets matched no single
 * alternative and fell through to the raw join.
 *
 * P2.c's rule is that a subject travels as an id and is SHOWN as a label. The
 * showing half was missing for every list value, and these hold it for scalars
 * and lists alike — including the general guarantee that an id is never drawn
 * whatever argument it arrives on.
 * ------------------------------------------------------------------------ */

const SHOPS = [
  { value: '67612230a740d90007464e26', label: 'Magnolia', spellings: ['magnolia'] },
  { value: '668a43f60fa9990007cfa158', label: 'Greenhills', spellings: ['greenhills'] },
  { value: '5f2b1c9e7a440d0007aa1111', label: 'OPUS', spellings: ['opus'] },
];

function shopToken(value: unknown) {
  const defs = {
    tokens: [{ argument: 'store', kind: 'navigation', label: 'shop',
               alternatives: SHOPS }],
    replay: { arguments: { store: { path: ['filters', 'store'] } } },
  } as unknown as DeskDefinitions;
  const turn = {
    post: { answer_post_id: 'p1' },
    toolCalls: [{ seq: 1, tool: 'get_sales', arguments: { filters: { store: value } },
                  result: { rows: [], meta: {} } }],
  } as unknown as AnswerTurn;
  const board = [{ key: 'k', kind: 'ranked', weight: 'lead', seq: 1,
                   tool: 'get_sales', turn: 0, touched: 0 }] as unknown as BoardObject[];
  return tokensFor({ defs, answers: [turn], board, retuned: {} })
    .find((t) => t.argument === 'store') ?? null;
}

describe('what a token calls its value', () => {
  it('names two picked shops, rather than joining their ids', () => {
    const t = shopToken(['67612230a740d90007464e26', '668a43f60fa9990007cfa158']);
    expect(t?.valueLabel).toBe('Magnolia, Greenhills');
  });

  it('still names a single shop the way it always did', () => {
    expect(shopToken('67612230a740d90007464e26')?.valueLabel).toBe('Magnolia');
  });

  it('draws no id anywhere, whatever the value is', () => {
    /** The general guarantee, so this cannot come back through another argument. */
    for (const value of [
      ['67612230a740d90007464e26', '668a43f60fa9990007cfa158'],
      ['67612230a740d90007464e26', 'deadbeefdeadbeefdeadbeef'],
      'deadbeefdeadbeefdeadbeef',
      ['67612230a740d90007464e26'],
    ]) {
      const drawn = shopToken(value)?.valueLabel ?? '';
      expect(drawn, `${JSON.stringify(value)} leaked an id`).not.toMatch(/[0-9a-f]{16}/i);
    }
  });

  it('says how many when it cannot name them all', () => {
    // An id no alternative carries — a closed shop, say. Honest, and not an id.
    const t = shopToken(['67612230a740d90007464e26', 'deadbeefdeadbeefdeadbeef']);
    expect(t?.valueLabel).toBe('2 shops');
  });

  it('leaves a word-shaped value alone', () => {
    /** `last_week` and `7` are readable; only opaque identifiers are withheld. */
    const defs = {
      tokens: [{ argument: 'top_n', kind: 'navigation', label: 'how many',
                 alternatives: [{ value: 5, label: 'top 5', spellings: ['5'] },
                                { value: 10, label: 'top 10', spellings: ['10'] }] }],
      replay: { arguments: { top_n: { path: ['top_n'] } } },
    } as unknown as DeskDefinitions;
    const turn = {
      post: { answer_post_id: 'p1' },
      toolCalls: [{ seq: 1, tool: 'get_sales', arguments: { top_n: 7 },
                    result: { rows: [], meta: {} } }],
    } as unknown as AnswerTurn;
    const board = [{ key: 'k', kind: 'ranked', weight: 'lead', seq: 1,
                     tool: 'get_sales', turn: 0, touched: 0 }] as unknown as BoardObject[];
    const t = tokensFor({ defs, answers: [turn], board, retuned: {} })
      .find((x) => x.argument === 'top_n');
    expect(t?.valueLabel).toBe('7');
  });
});
