/**
 * What a turn's results become when they are placed together.
 *
 * The property under test throughout is that the composition layer ADDS NO
 * FIGURE. It may put two numbers side by side and it may title them from the
 * query that produced them; it may never produce a third number, and it may
 * never put a heading over figures that heading is not true of.
 */
import { describe, expect, it } from 'vitest';
import type { ToolCall, ToolMeta } from '../../types/george';
import type { PinCallResult } from '../../types/pins';
import {
  blockResults,
  groupHeading,
  quietLabel,
  resultBlocks,
  scopeKey,
  sharedMeta,
  sourcesFromCalls,
  sourcesFromCharted,
  sourcesFromPinRun,
  storeArgument,
  windowLabel,
  MAX_GROUP_MEMBERS,
} from './resultShape';

const META: ToolMeta = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-07T09:00:00+08:00',
  window: { kind: 'preset', name: 'this_week', start: '2026-09-01', end: '2026-09-08' },
  metric_unit: 'PHP',
};

function call(
  seq: number,
  rows: Record<string, unknown>[],
  opts: { meta?: ToolMeta; args?: Record<string, unknown>; error?: string; complete?: boolean } = {},
): ToolCall {
  return {
    seq,
    tool: 'get_sales',
    arguments: opts.args ?? {},
    result: {
      row_count: rows.length,
      source_table: 'new_transactions',
      truncated: false,
      duration_ms: 12,
      error: opts.error ?? null,
      rows,
      rows_complete: opts.complete ?? true,
      meta: opts.meta ?? META,
    },
  };
}

const metricRow = (value: number, measure = 'net_sales') => [{ measure, value, unit: 'PHP' }];

describe('sourcesFromCalls', () => {
  it('keeps a completed call with rows', () => {
    expect(sourcesFromCalls([call(1, metricRow(100))])).toHaveLength(1);
  });

  it('drops a refused call, an incomplete one, and an empty one', () => {
    const sources = sourcesFromCalls([
      call(1, metricRow(100), { error: 'refused' }),
      call(2, metricRow(100), { complete: false }),
      call(3, []),
    ]);
    expect(sources).toEqual([]);
  });

  it('carries the arguments the model passed, for the heading', () => {
    const [source] = sourcesFromCalls([
      call(1, metricRow(100), { args: { filters: { store: 'Rockwell' } } }),
    ]);
    expect(storeArgument(source)).toBe('Rockwell');
  });
});

describe('sourcesFromCharted', () => {
  it('is empty for anything that is not an array', () => {
    expect(sourcesFromCharted(undefined)).toEqual([]);
    expect(sourcesFromCharted(null)).toEqual([]);
    expect(sourcesFromCharted({ rows: [] })).toEqual([]);
  });

  it('drops an entry with no rows rather than drawing an empty result', () => {
    // An empty result is not a zero. PinTile draws that distinction too.
    expect(sourcesFromCharted([{ seq: 1, tool: 'get_sales', rows: [], meta: META }])).toEqual([]);
  });

  it('reads a stored result and keeps its meta', () => {
    const [source] = sourcesFromCharted([
      { seq: 4, tool: 'get_sales', rows: metricRow(100), meta: META },
    ]);
    expect(source.seq).toBe(4);
    expect(source.meta.snapshot_timestamp).toBe(META.snapshot_timestamp);
    // A stored post carries no arguments, so it can carry no store heading.
    expect(storeArgument(source)).toBeUndefined();
  });
});

describe('windowLabel', () => {
  it('opens out a preset name', () => {
    expect(windowLabel(META)).toBe('This week');
  });

  it('prints an explicit window as its bounds', () => {
    expect(
      windowLabel({ window: { kind: 'explicit', start: '2026-09-01', end: '2026-09-08' } }),
    ).toBe('2026-09-01 → 2026-09-08');
  });

  it('says nothing when there is no window rather than guessing one', () => {
    expect(windowLabel({})).toBeUndefined();
  });
});

describe('scopeKey', () => {
  const base = sourcesFromCalls([call(1, metricRow(1), { args: { filters: { store: 'Rockwell' } } })])[0];

  it('matches two calls over the same window, filters and store', () => {
    const other = sourcesFromCalls([
      call(2, metricRow(2), { args: { filters: { store: 'Rockwell' } } }),
    ])[0];
    expect(scopeKey(other)).toBe(scopeKey(base));
  });

  it('differs when the store differs', () => {
    const other = sourcesFromCalls([
      call(2, metricRow(2), { args: { filters: { store: 'Shang' } } }),
    ])[0];
    expect(scopeKey(other)).not.toBe(scopeKey(base));
  });

  it('differs when a filter differs', () => {
    const other = sourcesFromCalls([
      call(2, metricRow(2), {
        args: { filters: { store: 'Rockwell' } },
        meta: { ...META, filters_applied: [...(META.filters_applied ?? []), 'extra'] },
      }),
    ])[0];
    expect(scopeKey(other)).not.toBe(scopeKey(base));
  });

  it('differs when the window differs', () => {
    const other = sourcesFromCalls([
      call(2, metricRow(2), {
        args: { filters: { store: 'Rockwell' } },
        meta: { ...META, window: { kind: 'preset', name: 'last_week' } },
      }),
    ])[0];
    expect(scopeKey(other)).not.toBe(scopeKey(base));
  });
});

describe('resultBlocks', () => {
  const args = { filters: { store: 'Rockwell' } };

  it('groups figures of one scope under one heading', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(482_300), { args }),
        call(2, [{ measure: 'transaction_count', value: 1_204, unit: 'transactions' }], { args }),
      ]),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('group');
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    expect(blocks[0].heading).toBe('Rockwell · This week');
    expect(blocks[0].members).toHaveLength(2);
  });

  it('never groups figures whose scopes differ', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(1), { args }),
        call(2, metricRow(2), { args: { filters: { store: 'Shang' } } }),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['single', 'single']);
  });

  it('leaves a lone figure alone', () => {
    const blocks = resultBlocks(sourcesFromCalls([call(1, metricRow(1), { args })]));
    expect(blocks.map((b) => b.kind)).toEqual(['single']);
  });

  it('breaks a run when something that is not a figure comes between', () => {
    const series = [
      { day: '2026-09-01', value: 1 },
      { day: '2026-09-02', value: 2 },
      { day: '2026-09-03', value: 3 },
    ];
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(1), { args }),
        call(2, series, { args }),
        call(3, metricRow(3), { args }),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['single', 'single', 'single']);
  });

  it('caps a group and starts another rather than running figures off the row', () => {
    const calls = Array.from({ length: MAX_GROUP_MEMBERS + 1 }, (_, i) =>
      call(i + 1, [{ measure: `m${i}`, value: i + 1, unit: 'PHP' }], { args }),
    );
    const blocks = resultBlocks(sourcesFromCalls(calls));
    expect(blocks).toHaveLength(2);
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    expect(blocks[0].members).toHaveLength(MAX_GROUP_MEMBERS);
    expect(blocks[1].kind).toBe('single');
  });

  it('invents no figure: every value on the surface came off a row', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(482_300), { args }),
        call(2, [{ measure: 'transaction_count', value: 1_204, unit: 'transactions' }], { args }),
      ]),
    );
    const values = blockResults(blocks).map((r) =>
      r.shape.kind === 'number' ? r.shape.value : null,
    );
    expect(values).toEqual([482_300, 1_204]);
  });

  it('keeps a comparison whole rather than splitting it into figures', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, [
          { subject: 'Rockwell', value: 100, baseline: 120, change: -20, change_pct: -16.7,
            direction: 'down', unit: 'PHP' },
        ]),
      ]),
    );
    expect(blocks).toHaveLength(1);
    if (blocks[0].kind !== 'single') throw new Error('expected a single');
    expect(blocks[0].result.shape.kind).toBe('comparison');
  });
});

describe('groupHeading', () => {
  it('is undefined when there is neither a store nor a window to name', () => {
    const members = resultBlocks(sourcesFromCalls([call(1, metricRow(1), { meta: {} })]));
    if (members[0].kind !== 'single') throw new Error('expected a single');
    expect(groupHeading([members[0].result])).toBeUndefined();
  });

  it('names the window alone when no store was passed', () => {
    const blocks = resultBlocks(sourcesFromCalls([call(1, metricRow(1))]));
    if (blocks[0].kind !== 'single') throw new Error('expected a single');
    expect(groupHeading([blocks[0].result])).toBe('This week');
  });
});

describe('sharedMeta', () => {
  const args = { filters: { store: 'Rockwell' } };

  it('is the one meta when every member was read the same way', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([call(1, metricRow(1), { args }), call(2, metricRow(2), { args })]),
    );
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    expect(blocks[0].sharedMeta?.source_table).toBe('new_transactions');
  });

  it('is undefined when the members came from different tables', () => {
    const other = { ...META, source_table: 'new_transaction_items + new_transactions' };
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(1), { args }),
        call(2, metricRow(2), { args, meta: other }),
      ]),
    );
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    // Two tables, two receipts lines. One line over both would name a source
    // that produced half of what is on screen.
    expect(blocks[0].sharedMeta).toBeUndefined();
  });

  it('is undefined when the members were read at different moments', () => {
    const later = { ...META, snapshot_timestamp: '2026-09-07T09:05:00+08:00' };
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, metricRow(1), { args }),
        call(2, metricRow(2), { args, meta: later }),
      ]),
    );
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    expect(blocks[0].sharedMeta).toBeUndefined();
  });

  it('is undefined for no members at all', () => {
    expect(sharedMeta([])).toBeUndefined();
  });
});

describe('quietLabel', () => {
  const series = [
    { day: '2026-09-01', value: 1 },
    { day: '2026-09-02', value: 2 },
    { day: '2026-09-03', value: 3 },
  ];

  it('says charts when that is all there is', () => {
    expect(quietLabel(resultBlocks(sourcesFromCalls([call(1, series)])))).toBe('Chart');
    expect(quietLabel(resultBlocks(sourcesFromCalls([call(1, series), call(2, series)])))).toBe(
      '2 charts',
    );
  });

  it('says figures for a mixed surface', () => {
    const blocks = resultBlocks(sourcesFromCalls([call(1, series), call(2, metricRow(5))]));
    expect(quietLabel(blocks)).toBe('2 figures');
  });
});

/* ----------------------------------------------------------- from a pin run -- */

const ran = (over: Partial<PinCallResult>): PinCallResult => ({
  tool: 'get_sales',
  arguments: {},
  status: 'ok',
  duration_ms: 5,
  rows: [{ value: 1 }],
  meta: { source_table: 'new_transactions' },
  notices: [],
  ...over,
});

describe('sourcesFromPinRun', () => {
  it('keeps every ok result with rows, in the order the pin stores them', () => {
    const sources = sourcesFromPinRun([
      ran({ rows: [{ measure: 'net_sales', value: 118420 }] }),
      ran({ rows: [{ measure: 'transactions', value: 241 }] }),
      ran({ rows: [{ measure: 'drinks', value: 86 }] }),
    ]);
    expect(sources.map((s) => s.seq)).toEqual([0, 1, 2]);
    expect(sources.map((s) => s.rows[0].measure)).toEqual(['net_sales', 'transactions', 'drinks']);
  });

  it('drops a refused, rotted, failed or empty result rather than drawing over it', () => {
    const sources = sourcesFromPinRun([
      ran({ status: 'refused', rows: [] }),
      ran({ status: 'unrunnable', rows: [] }),
      ran({ status: 'failed', rows: [] }),
      ran({ rows: [] }),
      ran({ rows: [{ value: 7 }] }),
    ]);
    expect(sources).toHaveLength(1);
    expect(sources[0].seq).toBe(4);
  });

  it('carries the stored arguments, so a group heading can read the store scope', () => {
    const [s] = sourcesFromPinRun([ran({ arguments: { filters: { store: 'Rockwell' } } })]);
    expect(s.arguments).toEqual({ filters: { store: 'Rockwell' } });
    expect(s.meta.source_table).toBe('new_transactions');
  });
});

describe('compared figures compose', () => {
  const window = { kind: 'explicit', start: '2026-08-24', end: '2026-08-31' };
  const filters = [
    't.is_cancelled = false   # metrics.yaml: filters.cancelled',
    'baseline: transaction_time >= 2026-08-17 AND < 2026-08-24   # metrics.yaml: comparisons.previous_period',
  ];
  const comparedMeta = (metric_label: string, metric_unit: string) => ({
    source_table: 'new_transactions',
    snapshot_timestamp: '2026-09-07T09:00:00+08:00',
    window,
    filters_applied: filters,
    metric_label,
    metric_unit,
    comparison: { kind: 'previous_period', baseline: { start: '2026-08-17', end: '2026-08-24' } },
  });
  const total = (value: number, baseline: number, change_pct: number, unit: string) => [
    { value, baseline, change: value - baseline, change_pct, direction: 'down', unit,
      baseline_status: 'ok' },
  ];
  const args = { filters: { store: 'Rockwell' }, compare_to: 'previous_period' };

  it('three compared totals of one scope read across under one heading', () => {
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, total(179058.5, 215567, -16.9, 'PHP'), { args, meta: comparedMeta('Net sales', 'PHP') }),
        call(2, total(328, 366, -10.4, 'transactions'), { args, meta: comparedMeta('Transactions', 'transactions') }),
        call(3, total(545.91, 588.98, -7.3, 'PHP'), { args, meta: comparedMeta('Average transaction value', 'PHP') }),
      ]),
    );
    expect(blocks).toHaveLength(1);
    if (blocks[0].kind !== 'group') throw new Error('expected a group');
    expect(blocks[0].members).toHaveLength(3);
    expect(blocks[0].members.every((m) => m.shape.kind === 'comparison')).toBe(true);
    expect(blocks[0].heading).toBe('Rockwell · 2026-08-24 → 2026-08-31');
  });

  it('a compared figure never groups with an uncompared one', () => {
    // The baseline window is on filters_applied, so the scopes differ and a
    // heading over both would be true of only one.
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, total(179058.5, 215567, -16.9, 'PHP'), { args, meta: comparedMeta('Net sales', 'PHP') }),
        call(2, [{ measure: 'transaction_count', value: 328, unit: 'transactions' }], {
          args: { filters: { store: 'Rockwell' } },
          meta: { ...comparedMeta('Transactions', 'transactions'), filters_applied: [filters[0]], comparison: undefined },
        }),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['single', 'single']);
  });

  it('a comparison of several subjects stays whole', () => {
    const rows = ['Rockwell', 'OPUS', 'Shang'].map((store) => ({
      store, value: 1, baseline: 2, change: -1, change_pct: -50, direction: 'down', unit: 'PHP',
      baseline_status: 'ok',
    }));
    const blocks = resultBlocks(
      sourcesFromCalls([
        call(1, rows, { meta: comparedMeta('Net sales', 'PHP') }),
        call(2, total(1, 2, -50, 'PHP'), { meta: comparedMeta('Net sales', 'PHP') }),
      ]),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['single', 'single']);
  });
});
