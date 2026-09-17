/**
 * Workspace V2 decisions: comparison as the atom. The other four describes
 * here (one fact one representation, caveats as data states, actions only
 * where valid, continuity) tested the old river surface and went with it in
 * P2S.1 (2026-09-17). What is left tests the kept-page renderer, which
 * P2S.3(g) deletes.
 */
import { describe, expect, it } from 'vitest';
import { levelCaption, levelLayout, majorityDirection, performanceMembers } from './instrumentShape';
import type { ComparisonRow } from './pinShape';
import { resultBlocks, type ResultSource, type ShapedResult } from './resultShape';

const WINDOW = { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' };
const META = {
  source_table: 'new_transactions', filters_applied: [], snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  window: WINDOW, comparison: { kind: 'previous_period', display_name: 'vs previous period', baseline: { start: '2026-08-24', end: '2026-08-31' } },
};
const cmp = (value: number, baseline: number, extra: Record<string, unknown> = {}) => ({
  value, baseline, change: value - baseline, change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value >= baseline ? 'up' : 'down', baseline_status: 'ok', ...extra,
});
const atom = (seq: number, metric: string, label: string, v: number, b: number): ResultSource => ({
  seq, tool: 'get_sales',
  arguments: { metric, date_range: 'last_week', filters: { store: 'Rockwell' }, compare_to: 'previous_period', group_by: [] },
  rows: [cmp(v, b, { unit: 'PHP' })],
  meta: { ...META, metric, metric_label: label, valid_group_by: ['store', 'day'], drivers: metric === 'net_sales' ? ['transaction_count', 'average_transaction_value'] : [] },
});
const ATOMS = [atom(1, 'net_sales', 'Net sales', 203717, 179000), atom(2, 'transaction_count', 'Transactions', 366, 328), atom(3, 'average_transaction_value', 'Basket', 556.6, 545.7)];
describe('comparison as the atom', () => {
  const rows: ComparisonRow[] = [
    { subject: 'OPUS', value: 555147, baseline: 425000, change: 130147, changePct: 30.6, direction: 'up', row: {} },
    { subject: 'Greenhills', value: 294291, baseline: 238000, change: 56291, changePct: 23.5, direction: 'up', row: {} },
    { subject: 'Rockwell', value: 203717, baseline: 179000, change: 24717, changePct: 13.8, direction: 'up', row: {} },
    { subject: 'Shang', value: 41242, baseline: 60000, change: -18758, changePct: -31.3, direction: 'down', row: {} },
  ];

  it('lengths level bars by value against the largest', () => {
    const l = levelLayout(rows);
    expect(l.bars[0].level).toBe(1);
    expect(l.bars[2].level).toBeCloseTo(203717 / 555147);
  });

  it('marks the exception the data establishes: the one that moved against the majority', () => {
    expect(majorityDirection(rows)).toBe('up');
    expect(levelLayout(rows).bars.map((b) => b.exception)).toEqual([false, false, false, true]);
  });

  it('marks nothing when there is no majority', () => {
    const mixed = rows.slice(0, 2).map((r, i) => ({ ...r, direction: i ? 'down' as const : 'up' as const }));
    expect(levelLayout(mixed).bars.every((b) => !b.exception)).toBe(true);
  });

  it('never captions a level comparison as ranked by change', () => {
    expect(levelCaption(levelLayout(rows), 'Net sales')).toBe("Net sales · in the tool's order");
    expect(levelCaption(levelLayout(rows, { top_n: 5 }), 'Net sales')).toBe('Net sales · largest first');
    expect(levelCaption(levelLayout(rows))).not.toMatch(/change/);
  });

  it('accepts a performance set only when every member is one compared metric with a delta', () => {
    const shaped = resultBlocks(ATOMS);
    expect(shaped[0].kind).toBe('group');
    const members = shaped[0].kind === 'group' ? shaped[0].members : [];
    expect(performanceMembers(members)).not.toBeNull();
    const broken = members.map((m, i) => (i ? m : { ...m, shape: { ...m.shape, rows: [{ ...(m.shape as { rows: ComparisonRow[] }).rows[0], changePct: null }] } } as ShapedResult));
    expect(performanceMembers(broken)).toBeNull();
  });
});
