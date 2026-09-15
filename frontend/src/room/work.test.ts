/**
 * THE WORK, READ OFF THE FRAMES — and nothing else read off anything else.
 *
 * P1.k draws three readings of one record: the steps as they happen, the line
 * above the claim once the turn is over, and every read of the thread behind
 * it. They must agree, because disagreeing accounts of the same work are
 * worse than one account: the person cannot tell which is the record.
 *
 * What is held here is that each one is a function of frames that already
 * arrived. Nothing counts a call that did not run, nothing draws a clock
 * nobody started, and nothing in any of it is a business figure.
 */
import { describe, expect, it } from 'vitest';

import type { AnswerTurn } from './data';
import { durationWords, filtersOf, readsOf, stepsOf, summaryOf, summaryWords } from './work';
import { figuresIn, placeFigures } from './figures';
import type { ToolCall } from '../types/george';

const META = {
  source_table: 'new_transactions',
  metric_label: 'Net sales',
  group_by: ['store'],
  snapshot_timestamp: '2026-09-14T08:00:00Z',
  filters_applied: [
    "t.status <> 'cancelled'   # metrics.yaml: filters.cancelled",
    'owner = the signed-in user',
  ],
  window: { name: 'last_week' },
};

function call(over: Partial<ToolCall> & { seq: number; tool: string }): ToolCall {
  return { arguments: {}, ...over } as ToolCall;
}

const LANDED = call({
  seq: 0,
  tool: 'get_sales',
  result: {
    row_count: 2, source_table: 'new_transactions', truncated: false,
    duration_ms: 412, error: null, meta: META,
    rows: [{ store: 'Rockwell', value: 203717 }, { store: 'OPUS', value: 555147 }],
  },
});

function turn(over: Partial<AnswerTurn> = {}): AnswerTurn {
  return {
    role: 'george', text: '', thinking: '', at: '2026-09-14T08:00:00Z',
    toolCalls: [], notices: [], pinned: [], saved: [], pageChanges: [],
    ...over,
  } as AnswerTurn;
}

describe('the steps', () => {
  it('says what each call is in words, with its rows and its own clock', () => {
    const [step] = stepsOf(turn({ toolCalls: [LANDED] }));
    expect(step.words).toBe('read sales');
    expect(step.rows).toBe(2);
    expect(step.ms).toBe(412);
    expect(step.state).toBe('landed');
  });

  it('is keyed by the turn as well as the seq', () => {
    // seq restarts every turn, so a bare seq is not an identity — the same
    // mistake that redrew turn one's object with turn three's rows (P1.j).
    expect(stepsOf(turn({ toolCalls: [LANDED] }), 3)[0].key).toBe('3:0');
  });

  it('draws a call that is still running without a result it does not have', () => {
    const [step] = stepsOf(turn({ toolCalls: [call({ seq: 0, tool: 'get_stock' })] }));
    expect(step.state).toBe('running');
    expect(step.words).toBe('counting stock');
    expect(step.rows).toBeNull();
    expect(step.ms).toBeNull();
  });

  it('never counts a duplicate the loop served from the record', () => {
    const steps = stepsOf(turn({
      toolCalls: [LANDED, call({ seq: 1, tool: 'get_sales', duplicate_of: 0 })],
    }));
    expect(steps).toHaveLength(1);
  });

  it('reads a restored zero as unrecorded rather than as instant', () => {
    // restoreFromPosts rebuilds a call the chat history did not keep and has
    // no clock to put on it. A database read does not take no time at all.
    const restored = call({
      seq: 0, tool: 'get_sales',
      result: { row_count: 1, source_table: 't', truncated: false, duration_ms: 0, error: null },
    });
    expect(stepsOf(turn({ toolCalls: [restored] }))[0].ms).toBeNull();
  });

  it('keeps the tool\'s own sentence when it declined, and claims no rows', () => {
    const refused = call({
      seq: 0, tool: 'get_sales',
      result: {
        row_count: null, source_table: null, truncated: false, duration_ms: 3,
        error: 'this_month is still running; compare last_month instead.',
      },
    });
    const [step] = stepsOf(turn({ toolCalls: [refused] }));
    expect(step.state).toBe('declined');
    expect(step.rows).toBeNull();
    expect(step.declined).toContain('last_month');
  });

  it('counts no rows for a call that reads nothing', () => {
    // "arranged the workspace · 0 rows" reported an emptiness that was never
    // a finding: compose is a statement about calls, not a read.
    const composed = call({
      seq: 1, tool: 'compose',
      result: { row_count: 0, source_table: null, truncated: false, duration_ms: 8, error: null, rows: [] },
    });
    expect(stepsOf(turn({ toolCalls: [composed] }))[0].rows).toBeNull();
  });
});

describe('the line above the claim', () => {
  it('counts reads, tools, the turn\'s clock and its caveats', () => {
    const t = turn({
      toolCalls: [LANDED, call({
        seq: 1, tool: 'compose',
        result: { row_count: 0, source_table: null, truncated: false, duration_ms: 5, error: null },
      })],
      notices: [{ kind: 'partial_window', message: 'this week is not over' }],
      done: { duration_ms: 19_000 } as AnswerTurn['done'],
    });
    expect(summaryOf(t)).toEqual({ reads: 1, tools: 2, ms: 19_000, caveats: 1 });
    expect(summaryWords(summaryOf(t))).toEqual(['1 read', '2 tools', '19.0s', '1 caveat']);
  });

  it('leaves out the loop\'s warnings about his own edits', () => {
    // "a block carries a kind or a spec, never both" is process, not a caveat
    // on a figure — and the count has to leave out exactly what the region
    // above the board leaves out.
    const t = turn({ notices: [{ kind: 'composition_rejected', message: 'x' }] });
    expect(summaryOf(t).caveats).toBe(0);
  });

  it('omits the time rather than drawing a zero nobody measured', () => {
    const words = summaryWords(summaryOf(turn({ toolCalls: [LANDED] })));
    expect(words).toEqual(['1 read', '1 tool', 'no caveats']);
    expect(words.join(' ')).not.toContain('0.0s');
  });

  it('says there were no caveats rather than falling silent about them', () => {
    // The turn is loaded, so this is a claim from a result and not a guess
    // (UI rule 8) — and a turn with a caveat and a turn with none must not
    // draw the same line.
    expect(summaryWords(summaryOf(turn({ toolCalls: [LANDED] })))).toContain('no caveats');
  });
});

describe('durations', () => {
  it('reads in milliseconds under a second and seconds above it', () => {
    expect(durationWords(412)).toBe('412ms');
    expect(durationWords(1_240)).toBe('1.2s');
    expect(durationWords(19_000)).toBe('19.0s');
    expect(durationWords(84_000)).toBe('1m 24s');
  });
});

describe('behind it', () => {
  const thread = [
    turn({ toolCalls: [LANDED], at: '2026-09-14T08:00:00Z' }),
    turn({
      toolCalls: [call({
        seq: 0, tool: 'compose',
        result: { row_count: 0, source_table: null, truncated: false, duration_ms: 4, error: null },
      }), { ...LANDED, seq: 1 }],
      at: '2026-09-14T08:04:00Z',
    }),
  ];

  it('is every read of the thread, and only the reads', () => {
    const reads = readsOf(thread);
    expect(reads.map((r) => r.key)).toEqual(['0:0', '1:1']);
    expect(reads.every((r) => r.tool.startsWith('get_'))).toBe(true);
  });

  it('carries the receipts each read came back with', () => {
    const [read] = readsOf(thread);
    expect(read.meta?.source_table).toBe('new_transactions');
    expect(read.at).toBe('2026-09-14T08:00:00Z');
  });

  it('splits a filter into the definition and the predicate under it', () => {
    const [defined, plain] = filtersOf(META as never);
    expect(defined.label).toBe('filters cancelled');
    expect(defined.detail).toBe("t.status <> 'cancelled'");
    // An entry the tool wrote as words has no second half to hide.
    expect(plain.label).toBe('owner = the signed-in user');
    expect(plain.detail).toBeNull();
  });
});

describe('a figure in the claim', () => {
  it('finds the read that returned it', () => {
    const pieces = placeFigures('Rockwell did ₱203,717 last week.', [LANDED]);
    expect(pieces.find((p) => p.seq === 0)?.text).toContain('203,717');
  });

  it('hands back a numeral no read returned as a piece of its own', () => {
    // It used to be folded into the prose and drawn identically to the words
    // around it, so nothing on screen told the two kinds apart (P2.b). It is
    // his text either way — the piece carries no `seq`, so there is still no
    // door on it and no underline.
    const pieces = placeFigures('Rockwell did ₱999,999 last week.', [LANDED]);
    expect(pieces.map((p) => p.text)).toEqual(['Rockwell did ', '₱999,999', ' last week.']);
    expect(pieces[1].unplaced).toBe(true);
    expect(pieces[1].seq).toBeUndefined();
    expect(pieces[1].index).toBeUndefined();
  });

  it('numbers a placed figure by which read of the turn it was', () => {
    const pieces = placeFigures('Rockwell did ₱203,717 last week.', [LANDED]);
    const figure = pieces.find((p) => p.seq === 0);
    expect(figure?.index).toBe(1);
    expect(figure?.unplaced).toBeUndefined();
  });

  it('leaves a sentence with no figure in it whole', () => {
    expect(placeFigures('Nothing here needs you today.', [LANDED]))
      .toEqual([{ text: 'Nothing here needs you today.' }]);
  });

  it('matches a figure rounded to the precision written', () => {
    // 203,717.4 written as ₱203,717 is a correct rounding, not a new number.
    const rounded = call({
      seq: 0, tool: 'get_sales',
      result: { row_count: 1, source_table: 't', truncated: false, duration_ms: 5,
                error: null, rows: [{ value: 203717.4 }] },
    });
    expect(placeFigures('₱203,717 this week', [rounded]).some((p) => p.seq === 0)).toBe(true);
  });

  it('does not treat dates, years and small counts as figures', () => {
    expect(figuresIn('3 of 7 shops moved on 12 Sep 2026')).toEqual([]);
  });

  it('never places a figure on a call that failed', () => {
    const refused = call({
      seq: 0, tool: 'get_sales',
      result: { row_count: null, source_table: null, truncated: false, duration_ms: 2,
                error: 'declined', rows: [{ value: 203717 }] },
    });
    expect(placeFigures('₱203,717', [refused])[0].seq).toBeUndefined();
  });
});
