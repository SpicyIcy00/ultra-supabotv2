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
 *   a question: two tokens answering to one word goes to George.
 *
 *   The correction is the one thing here that costs a turn, and it is
 *   recognised by the word the definitions gave it.
 */
import { describe, expect, it } from 'vitest';
import type { DeskDefinitions } from '../services/deskApi';
import type { GeorgeTurn, ToolCall } from '../types/george';
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
  role: 'george', text: '', thinking: '', toolCalls: calls, notices: [],
  pinned: [], saved: [], pageChanges: [], at: '2026-09-14T00:00:00Z',
  ...(post ? { post: { answer_post_id: post } } : {}),
} as unknown as GeorgeTurn as AnswerTurn);

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

  it('leaves an argument alone when a control George composed carries it', () => {
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

  it('sends anything longer than a fragment to George', () => {
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
