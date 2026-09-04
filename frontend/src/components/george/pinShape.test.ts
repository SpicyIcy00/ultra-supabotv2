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
