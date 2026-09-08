/**
 * What the instruments refuse, held without a DOM.
 *
 * The three rules the brief fixed, each one a way a picture could assert
 * something the tool did not compute: a ranking never re-orders by
 * percentage, a driver split never sums, a coverage strip never becomes a
 * gauge. Plus the refusal rule for when a ranking may exist at all.
 */
import { describe, expect, it } from 'vitest';
import type { PinCallResult } from '../../types/pins';
import { inferShape, type ComparisonRow } from './pinShape';
import {
  BASELINE_STATUS_LABEL,
  coverageFromComparison,
  coverageFromReplay,
  driverSplitLayout,
  driverSplitMembers,
  rankingCaption,
  rankingLayout,
} from './instrumentShape';
import { resultBlocks, type ResultSource } from './resultShape';

const META = {
  source_table: 'new_transaction_items',
  filters_applied: [],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  metric_label: 'Product revenue',
  metric_unit: 'PHP',
  window: { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' },
  comparison: {
    kind: 'previous_period',
    display_name: 'vs previous period',
    baseline: { start: '2026-08-24', end: '2026-08-31' },
    baseline_statuses: { ok: 3, no_current: 1, no_baseline: 1 },
  },
};

// Ordered by CHANGE in pesos, as the tool ranks. Note that Mints has the
// largest percentage fall by far and sits LAST — a tiny baseline.
const RANKED = [
  { product: 'CCP', value: 4000, baseline: 6000, change: -2000, change_pct: -33.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
  { product: 'Gummies', value: 3000, baseline: 3500, change: -500, change_pct: -14.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
  { product: 'Mints', value: 20, baseline: 120, change: -100, change_pct: -83.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
];

function result(rows: Record<string, unknown>[], comparison: Record<string, unknown>): PinCallResult {
  return {
    tool: 'get_sales',
    arguments: { metric: 'product_revenue', group_by: ['product'] },
    status: 'ok',
    duration_ms: 1,
    rows,
    meta: { ...META, comparison: { ...META.comparison, ...comparison } },
    notices: [],
  };
}

describe('when a ranking may exist', () => {
  it('is a ranking only when the tool ranked by change', () => {
    expect(inferShape(result(RANKED, { rank_by: 'biggest_drop' }))?.kind).toBe('ranking');
    expect(inferShape(result(RANKED, { rank_by: 'biggest_gain' }))?.kind).toBe('ranking');
  });

  it('is a plain comparison when the tool ranked by value, or did not rank', () => {
    // top_n without rank_by orders by current value; drawing that as "biggest
    // movers" would lie about the ordering.
    expect(inferShape(result(RANKED, { rank_by: 'value' }))?.kind).toBe('comparison');
    expect(inferShape(result(RANKED, { rank_by: null }))?.kind).toBe('comparison');
    expect(inferShape(result(RANKED, {}))?.kind).toBe('comparison');
  });

  it('is a plain comparison for a single row', () => {
    expect(inferShape(result(RANKED.slice(0, 1), { rank_by: 'biggest_drop' }))?.kind).toBe('comparison');
  });

  it('refuses a row with no numeric change, whatever the meta claims', () => {
    const rows = [...RANKED, { product: 'Ghost', value: null, baseline: 50, change: null,
      change_pct: null, direction: null, baseline_status: 'no_current', unit: 'PHP' }];
    expect(inferShape(result(rows, { rank_by: 'biggest_drop' }))?.kind).toBe('comparison');
  });

  it('carries what the tool could not rank', () => {
    const shape = inferShape(result(RANKED, {
      rank_by: 'biggest_drop',
      not_ranked: { counts: { no_current: 1 }, no_current: [{ subject: 'Ghost', baseline: 50, unit: 'PHP' }],
                    no_baseline: [], ranked_subjects: 3 },
    }));
    expect(shape?.kind === 'ranking' && shape.notRanked?.noCurrent[0].subject).toBe('Ghost');
  });

  it('never groups with a figure; it stands alone', () => {
    const sources: ResultSource[] = [
      { seq: 1, tool: 'get_sales', rows: [{ measure: 'net_sales', value: 1, unit: 'PHP' }], meta: META },
      { seq: 2, tool: 'get_sales', rows: RANKED, meta: { ...META, comparison: { ...META.comparison, rank_by: 'biggest_drop' } } },
    ];
    expect(resultBlocks(sources).map((b) => b.kind)).toEqual(['single', 'single']);
  });
});

describe('a ranking never ranks by change_pct', () => {
  const rows = inferShape(result(RANKED, { rank_by: 'biggest_drop' }));
  const layout = rankingLayout(rows?.kind === 'ranking' ? rows.rows : []);

  it('keeps the tool\'s order, even when a later row has a larger percentage', () => {
    expect(layout.bars.map((b) => b.row.subject)).toEqual(['CCP', 'Gummies', 'Mints']);
  });

  it('lengths bars by change in the unit, so the peso fall is the long bar', () => {
    const [ccp, gummies, mints] = layout.bars.map((b) => b.extent);
    expect(ccp).toBe(1);
    expect(gummies).toBeCloseTo(0.25);
    expect(mints).toBeCloseTo(0.05);
    // Mints fell 83% and gets the SHORTEST bar. That is the point.
    expect(mints).toBeLessThan(gummies);
  });

  it('puts the zero line at the right edge for a list of falls', () => {
    expect(layout.zero).toBe(1);
    expect(layout.bars.every((b) => b.negative)).toBe(true);
  });

  it('splits the track when signs are mixed', () => {
    const mixed = rankingLayout([
      { subject: 'A', value: 1, change: -300, changePct: -3, direction: 'down', row: {} },
      { subject: 'B', value: 1, change: 100, changePct: 1, direction: 'up', row: {} },
    ]);
    expect(mixed.zero).toBeCloseTo(0.75);
  });

  it('names itself by the tool\'s mode and the unit', () => {
    const shape = inferShape(result(RANKED, { rank_by: 'biggest_drop' }));
    expect(shape?.kind === 'ranking' && rankingCaption(shape)).toBe('Biggest falls · ranked by change in ₱');
  });
});

describe('a driver split', () => {
  const driver = (label: string, pct: number): import('./resultShape').ShapedResult => ({
    source: { seq: 1, tool: 'get_sales', rows: [], meta: {} },
    shape: { kind: 'comparison', label, rows: [{ subject: '', value: 1, baseline: 1, change: 0,
      changePct: pct, direction: pct < 0 ? 'down' : 'up', row: {} }] },
  });

  it('needs at least two single compared figures, each with a percentage', () => {
    expect(driverSplitMembers([driver('Transactions', -2.1)])).toBeNull();
    expect(driverSplitMembers([driver('Transactions', -2.1), driver('ATP', -10.2)])).not.toBeNull();
  });

  it('refuses when a driver has no delta: the split would drop a caveat', () => {
    const noDelta = driver('ATP', 0);
    (noDelta.shape as { rows: ComparisonRow[] }).rows[0].changePct = null;
    expect(driverSplitMembers([driver('Transactions', -2.1), noDelta])).toBeNull();
  });

  it('puts both on one axis and the larger movement gets the full bar', () => {
    const layout = driverSplitLayout([driver('Transactions', -2.1), driver('ATP', -10.2)]);
    expect(layout.bars.map((b) => b.label)).toEqual(['Transactions', 'ATP']);
    expect(layout.bars[1].extent).toBe(1);
    expect(layout.bars[0].extent).toBeCloseTo(2.1 / 10.2);
  });

  it('never produces a sum or a share', () => {
    const layout = driverSplitLayout([driver('Transactions', -2.1), driver('ATP', -10.2)]);
    const keys = Object.keys(layout).concat(...layout.bars.map((b) => Object.keys(b)));
    expect(keys).not.toContain('share');
    expect(keys).not.toContain('total');
    expect(keys).not.toContain('contribution');
  });
});

describe('a coverage strip', () => {
  it('is nothing when everything was measured', () => {
    expect(coverageFromComparison({ comparison: { baseline_statuses: { ok: 8 } } })).toBeNull();
    expect(coverageFromComparison({})).toBeNull();
  });

  it('names every unmeasured state with its count, in the reader\'s words', () => {
    const c = coverageFromComparison(META);
    expect(c?.segments.map((s) => [s.label, s.count, s.measured])).toEqual([
      [BASELINE_STATUS_LABEL.ok, 3, true],
      [BASELINE_STATUS_LABEL.no_current, 1, false],
      [BASELINE_STATUS_LABEL.no_baseline, 1, false],
    ]);
    expect(c?.total).toBe(5);
    expect(c?.measured).toBe(3);
  });

  it('is counts and never a percentage of anything but its own rows', () => {
    const c = coverageFromComparison(META)!;
    expect(c.segments.reduce((n, s) => n + s.count, 0)).toBe(c.total);
    expect(Object.keys(c)).not.toContain('percent');
    expect(Object.keys(c)).not.toContain('score');
  });

  it('draws a pin\'s replay the same way', () => {
    const r = (status: PinCallResult['status'], rows: number): PinCallResult => ({
      tool: 'get_sales', arguments: {}, status, duration_ms: 1,
      rows: Array.from({ length: rows }, () => ({ value: 1 })), meta: {}, notices: [],
    });
    const c = coverageFromReplay([r('ok', 3), r('ok', 0), r('refused', 0)]);
    expect(c?.segments.map((s) => [s.key, s.count, s.measured])).toEqual([
      ['drawn', 1, true], ['empty', 1, true], ['missing', 1, false],
    ]);
    expect(coverageFromReplay([r('ok', 3), r('ok', 2)])).toBeNull();
  });
});
