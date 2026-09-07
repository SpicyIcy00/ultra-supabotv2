/**
 * The shape rules — the first test suite in this frontend.
 *
 * These are pure functions over tool payloads, so the suite needs no DOM and
 * no React: what is under test is the DECISION to draw a chart, which is the
 * part that can be wrong in a way nobody notices. A wrong chart asserts a
 * shape the data does not have, and it does it silently.
 *
 * The payloads below are the real ones. get_sales grouped by day, get_sales
 * grouped by store, and — the case this suite exists for — get_brief, whose
 * rows are three different sections in one array.
 */
import { describe, expect, it } from 'vitest';
import type { ToolCall } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import {
  MIN_CHART_ROWS,
  chatTitle,
  inferShape,
  missingLabel,
  replayState,
  resultFromToolCall,
  tableColumns,
} from './pinShape';

function result(rows: Record<string, unknown>[], meta: Record<string, unknown> = {}): PinCallResult {
  return {
    tool: 'get_sales',
    arguments: {},
    status: 'ok',
    duration_ms: 12,
    rows,
    meta: { source_table: 'new_transactions', metric_unit: 'PHP', ...meta },
    notices: [],
  };
}

const day = (d: string, value: number) => ({ day: d, value });
const store = (name: string, value: number) => ({ store_id: `id-${name}`, store: name, value });

/* ------------------------------------------------------------------ number -- */

describe('one row', () => {
  it('is a number, not a one-bar chart', () => {
    const shape = inferShape(result([{ store: 'Rockwell', value: 13544, unit: 'PHP' }]));
    expect(shape).toMatchObject({ kind: 'number', value: 13544, label: 'Rockwell' });
  });
});

/* ------------------------------------------------------- the chart threshold -- */

describe('MIN_CHART_ROWS', () => {
  it('is 3, because two bars read worse than two numbers', () => {
    expect(MIN_CHART_ROWS).toBe(3);
  });

  it('refuses to chart two rows', () => {
    const shape = inferShape(result([day('2026-09-01', 10), day('2026-09-02', 12)]));
    expect(shape?.kind).toBe('table');
  });

  it('charts at exactly three', () => {
    const shape = inferShape(
      result([day('2026-09-01', 10), day('2026-09-02', 12), day('2026-09-03', 9)]),
    );
    expect(shape).toMatchObject({ kind: 'chart', x: 'day', mark: 'bar' });
  });

  it('becomes a line once bars stop being readable', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      day(`2026-09-${String(i + 1).padStart(2, '0')}`, 100 + i),
    );
    expect(inferShape(result(rows))).toMatchObject({ kind: 'chart', mark: 'line' });
  });
});

/* ------------------------------------------------------------- categorical -- */

describe('categorical comparison', () => {
  it('draws stores as bars', () => {
    const shape = inferShape(result([store('Rockwell', 4), store('Opus', 9), store('Fairview', 2)]));
    expect(shape).toMatchObject({ kind: 'chart', x: 'store', mark: 'bar' });
  });

  it('never draws a line between categories, even when asked', () => {
    // A line asserts a progression from Rockwell to Opus, which does not exist.
    const shape = inferShape(
      result([store('Rockwell', 4), store('Opus', 9), store('Fairview', 2)]),
      'line',
    );
    expect(shape).toMatchObject({ kind: 'chart', mark: 'bar' });
  });

  it('will not compare a label against itself', () => {
    // Eight measures of one store are not a comparison of eight things.
    const rows = [store('Rockwell', 4), store('Rockwell', 9), store('Rockwell', 2)];
    expect(inferShape(result(rows))?.kind).toBe('table');
  });
});

/* ------------------------------------------------------------- render_hint -- */

describe('render_hint can only narrow', () => {
  it('suppresses a chart it would otherwise draw', () => {
    const rows = [day('2026-09-01', 10), day('2026-09-02', 12), day('2026-09-03', 9)];
    expect(inferShape(result(rows), 'none')?.kind).toBe('table');
  });

  it('picks between marks that are already valid', () => {
    const rows = [day('2026-09-01', 10), day('2026-09-02', 12), day('2026-09-03', 9)];
    expect(inferShape(result(rows), 'line')).toMatchObject({ mark: 'line' });
  });

  it('cannot conjure a chart from data that has none', () => {
    // One row is a number whatever the model says about it.
    expect(inferShape(result([{ store: 'Rockwell', value: 1 }]), 'bar')?.kind).toBe('number');
  });
});

/* ---------------------------------------------------------- partial series -- */

describe('incomplete rows', () => {
  it('never charts a prefix', () => {
    // The loop sends all rows or none; false here means it sent none, and a
    // chart from part of a series is a different chart, not a smaller one.
    const rows = [day('2026-09-01', 10), day('2026-09-02', 12), day('2026-09-03', 9)];
    expect(inferShape(result(rows), undefined, false)?.kind).toBe('table');
  });
});

/* -------------------------------------------------- THE PINNED BRIEF TILE -- */

/**
 * get_brief returns THREE SECTIONS IN ONE ARRAY. The first has `value`; the
 * others do not have it at all. Reading rows[0] and assuming the rest match is
 * how this becomes a bar chart with two real bars and three undefined ones.
 *
 * It also carries per-row `receipts`, because a brief mixes sources of
 * different ages — one timestamp over the lot would be a lie about most of it.
 */
const BRIEF_ROWS = [
  {
    section: 'sales_vs_same_weekday',
    subject: 'Rockwell',
    store_id: '6639efd54694700008d7ccc6',
    value: 13544.0,
    baseline: 11002.5,
    change: 2541.5,
    change_pct: 23.1,
    direction: 'up',
    unit: 'PHP',
    threshold_applied: { pct_threshold: 0.3, absolute_floor: 2750.63 },
    receipts: { source_table: 'new_transactions', snapshot_timestamp: '2026-09-04T06:00:00Z' },
  },
  {
    section: 'sales_vs_same_weekday',
    subject: 'Opus',
    store_id: '68c5bb269da1d500073690c2',
    value: 8110.0,
    baseline: 12400.0,
    change: -4290.0,
    change_pct: -34.6,
    direction: 'down',
    unit: 'PHP',
    threshold_applied: { pct_threshold: 0.3, absolute_floor: 3100.0 },
    receipts: { source_table: 'new_transactions', snapshot_timestamp: '2026-09-04T06:00:00Z' },
  },
  {
    section: 'stock_crossed_out',
    subject: 'Hello Panda Chocolate 35g',
    sku: 'HP-CHOC-35',
    store: 'AJI BARN',
    was: 14.0,
    now: 0.0,
    receipts: { source_table: 'inventory_snapshots', snapshot_timestamp: '2026-09-03T22:00:00Z' },
  },
  {
    section: 'newly_dead',
    subject: 'White Rabbit Creamy Candy 108g',
    sku: 'WR-CREAM-108',
    store: 'Rockwell',
    quantity_on_hand: 41.0,
    last_sold: '2026-08-04',
    receipts: { source_table: 'new_transaction_items', snapshot_timestamp: '2026-09-04T06:00:00Z' },
  },
];

describe('the pinned brief tile', () => {
  const brief = { ...result(BRIEF_ROWS), tool: 'get_brief' };

  it('is a table, never a chart', () => {
    // Four rows, rows[0] has a numeric `value`, and there is a `subject` on
    // every row — everything a naive check would need to draw a bar chart
    // whose last two bars are undefined.
    expect(inferShape(brief)?.kind).toBe('table');
  });

  it('is a table even when the model asks for a bar', () => {
    expect(inferShape(brief, 'bar')?.kind).toBe('table');
  });

  it('renders identically from a tile and from an answer', () => {
    // THE CONTRACT: one detection path. The tile reads a pin run; the answer
    // reads a streamed tool_result adapted by resultFromToolCall. Same
    // payload in, same shape out — or a figure looks like one thing in chat
    // and another on a page.
    const streamed: ToolCall = {
      seq: 0,
      tool: 'get_brief',
      arguments: {},
      result: {
        row_count: BRIEF_ROWS.length,
        source_table: 'new_transactions',
        truncated: false,
        duration_ms: 12,
        error: null,
        rows: BRIEF_ROWS,
        rows_complete: true,
        meta: brief.meta,
      },
    };
    const fromAnswer = resultFromToolCall(streamed);
    expect(fromAnswer).not.toBeNull();
    expect(inferShape(fromAnswer as PinCallResult)).toEqual(inferShape(brief));
  });

  it('charts nothing at all when the loop could not send every row', () => {
    const streamed: ToolCall = {
      seq: 0,
      tool: 'get_brief',
      arguments: {},
      result: {
        row_count: 900,
        source_table: 'new_transactions',
        truncated: true,
        duration_ms: 12,
        error: null,
        rows: [],
        rows_complete: false,
      },
    };
    expect(resultFromToolCall(streamed)).toBeNull();
  });
});

/* -------------------------------------------------------------- the table -- */

describe('tableColumns', () => {
  it('drops an id when its label is present', () => {
    expect(tableColumns(['store_id', 'store', 'value'])).toEqual(['store', 'value']);
  });
});

/* ------------------------------------------------------------ chat titles -- */

describe('chatTitle', () => {
  it('passes a short question through whole', () => {
    expect(chatTitle('How did Rockwell do?')).toBe('How did Rockwell do?');
  });

  it('cuts at 40 characters on a word boundary', () => {
    const t = chatTitle(
      'How much did Rockwell sell last week compared with the same week last year?',
    );
    expect(t).toBe('How much did Rockwell sell last week…');
    expect(t.length).toBeLessThanOrEqual(41); // 40 plus the ellipsis
    expect(t).not.toMatch(/\s…$/); // never a dangling space before the cut
  });

  it('hard-cuts a single word with no boundary to find', () => {
    expect(chatTitle('x'.repeat(60))).toBe(`${'x'.repeat(40)}…`);
  });

  it('collapses whitespace, so a pasted question is still one line', () => {
    expect(chatTitle('  How   did\n\nRockwell do?  ')).toBe('How did Rockwell do?');
  });

  it('names an empty chat rather than showing nothing', () => {
    expect(chatTitle('')).toBe('Untitled chat');
    expect(chatTitle(null)).toBe('Untitled chat');
  });
});

/* -------------------------------------------------------------- comparison -- */

/** A get_brief sales row, exactly as tools/brief.py builds it. */
const briefSales = (subject: string, value: number, baseline: number, pct: number) => ({
  section: 'sales_vs_same_weekday',
  subject,
  store_id: `id-${subject}`,
  value,
  baseline,
  change: value - baseline,
  change_pct: pct,
  direction: pct >= 0 ? 'up' : 'down',
  unit: 'PHP',
});

describe('comparison', () => {
  it('is chosen when every row carries a delta the tool computed', () => {
    const shape = inferShape(result([briefSales('Rockwell', 100, 120, -16.7)]));
    expect(shape?.kind).toBe('comparison');
  });

  it('beats the single-figure shape, so the baseline is not thrown away', () => {
    // One row with a value would otherwise be a bare number, and the whole
    // point of the row is the movement.
    const shape = inferShape(result([briefSales('Rockwell', 100, 120, -16.7)]));
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].baseline).toBe(120);
    expect(shape.rows[0].changePct).toBe(-16.7);
  });

  it('beats the chart, so a series of deltas is not drawn as bare bars', () => {
    const shape = inferShape(
      result([
        briefSales('Rockwell', 100, 120, -16.7),
        briefSales('Shang', 90, 80, 12.5),
        briefSales('Fairview', 70, 75, -6.7),
      ]),
    );
    expect(shape?.kind).toBe('comparison');
  });

  it('reads the direction the tool declared rather than deciding one', () => {
    const row = { ...briefSales('Rockwell', 100, 120, -16.7), direction: 'up' };
    const shape = inferShape(result([row]));
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].direction).toBe('up');
  });

  it('falls back to the sign of the delta it was given, never to a computation', () => {
    const noDirection: Record<string, unknown> = { ...briefSales('Rockwell', 100, 120, -16.7) };
    delete noDirection.direction;
    const shape = inferShape(result([noDirection]));
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].direction).toBe('down');
  });

  it('refuses a comparison when one row lacks a delta', () => {
    // A mixed brief is a list of DIFFERENT FACTS, not one comparison — the
    // same heterogeneity the chart rules were written for. It stays a table.
    const shape = inferShape(
      result([
        briefSales('Rockwell', 100, 120, -16.7),
        { section: 'newly_dead', subject: 'SKU-1', quantity_on_hand: 40 },
      ]),
    );
    expect(shape?.kind).toBe('table');
  });

  it('never computes a delta from rows that did not carry one', () => {
    // Two weeks of sales is not a comparison: which baseline is a DEFINITION,
    // and metrics.yaml settled that deliberately for the brief.
    const shape = inferShape(
      result([
        { week: '2026-08-31', value: 120 },
        { week: '2026-09-07', value: 100 },
      ]),
    );
    expect(shape?.kind).toBe('table');
  });

  it('takes the subject from the first label key the tool used', () => {
    const shape = inferShape(
      result([{ store: 'Rockwell', value: 100, change_pct: -16.7, unit: 'PHP' }]),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].subject).toBe('Rockwell');
  });
});

/* ------------------------------------------------------------------ replay -- */

const okResult = (tool: string, rows: Record<string, unknown>[]): PinCallResult => ({
  ...result(rows),
  tool,
});
const notOk = (tool: string, status: PinCallResult['status'], error: string): PinCallResult => ({
  ...result([]),
  tool,
  status,
  error,
});

describe('replayState', () => {
  it('draws every successful call, in call order', () => {
    const state = replayState([
      okResult('get_sales', [{ measure: 'net_sales', value: 118420 }]),
      okResult('get_sales', [{ measure: 'transactions', value: 241 }]),
      okResult('get_sales', [{ measure: 'drinks', value: 86 }]),
    ]);
    expect(state.drawn.map((r) => r.rows[0].measure)).toEqual([
      'net_sales',
      'transactions',
      'drinks',
    ]);
    expect(state.missing).toEqual([]);
    expect(state.empty).toEqual([]);
  });

  it('keeps what did not reproduce beside what did, rather than dropping it', () => {
    const state = replayState([
      okResult('get_sales', [{ value: 1 }]),
      notOk('get_stock', 'refused', 'That SKU is three products.'),
      notOk('get_movement', 'unrunnable', 'get_movement is no longer one of the tools.'),
    ]);
    expect(state.drawn).toHaveLength(1);
    expect(state.missing.map((r) => [r.tool, r.status])).toEqual([
      ['get_stock', 'refused'],
      ['get_movement', 'unrunnable'],
    ]);
    // The runner's own words survive: a refusal is an answer, not a fault.
    expect(state.missing[0].error).toBe('That SKU is three products.');
  });

  it('keeps an ok call with no rows as empty, which is neither drawn nor missing', () => {
    const state = replayState([okResult('get_sales', [])]);
    expect(state.drawn).toEqual([]);
    expect(state.missing).toEqual([]);
    expect(state.empty).toHaveLength(1);
  });

  it('names each state as a reader would, never as a fault', () => {
    expect(missingLabel('refused')).toBe('declined');
    expect(missingLabel('unrunnable')).toBe('can no longer run');
    expect(missingLabel('failed')).toBe('could not be refreshed');
  });
});

/* --------------------------------------------- comparisons that could not be -- */

/** A get_sales compare_to row, exactly as tools/sales.py _compare_row builds it. */
const compared = (over: Record<string, unknown>) => ({
  store_id: 'id-Shang',
  store: 'Shang',
  value: 41242.0,
  baseline: 215567.0,
  change: -174325.0,
  change_pct: -80.9,
  direction: 'down',
  unit: 'PHP',
  baseline_status: 'ok',
  ...over,
});

describe('a comparison the tool declared but could not compute', () => {
  it('is still a comparison when change_pct is null and baseline_status says why', () => {
    const shape = inferShape(
      result([compared({ baseline: null, change: null, change_pct: null, direction: null,
                         baseline_status: 'no_baseline' })]),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].changePct).toBeNull();
    expect(shape.rows[0].direction).toBeNull();
    expect(shape.rows[0].baselineStatus).toBe('no_baseline');
    expect(shape.rows[0].value).toBe(41242.0);
  });

  it('never fills a null delta in from value and baseline', () => {
    const shape = inferShape(
      result([compared({ baseline: 0, change: 93, change_pct: null, direction: 'up',
                         baseline_status: 'zero_baseline' })]),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].changePct).toBeNull();
    expect(shape.rows[0].baseline).toBe(0);
  });

  it('keeps a subject with no current figure, as null and not as zero', () => {
    const shape = inferShape(
      result([compared({ value: null, change: null, change_pct: null, direction: null,
                         baseline_status: 'no_current' })]),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].value).toBeNull();
    expect(shape.rows[0].baselineStatus).toBe('no_current');
  });

  it('reads flat as the tool said it, not as up', () => {
    const shape = inferShape(
      result([compared({ change: 0, change_pct: 0, direction: 'flat' })]),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.rows[0].direction).toBe('flat');
  });

  it('a row with a null value and no declaration is not a comparison', () => {
    // Nothing said "I tried"; a null value with no status is just a missing figure.
    const shape = inferShape(result([{ store: 'Shang', value: null, change_pct: null }]));
    expect(shape?.kind).toBe('table');
  });

  it('names the metric from meta, never from prose', () => {
    const shape = inferShape(
      result([compared({ store: undefined, store_id: undefined })],
             { metric_label: 'Net sales', metric: 'net_sales' }),
    );
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.label).toBe('Net sales');
    expect(shape.rows[0].subject).toBe('');
  });

  it('has no label on a result from an older backend', () => {
    const shape = inferShape(result([compared({})]));
    if (shape?.kind !== 'comparison') throw new Error('expected a comparison');
    expect(shape.label).toBeUndefined();
  });
});
