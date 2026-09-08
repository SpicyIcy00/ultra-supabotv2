/**
 * Roles into sections — and, with no roles, the V1 surface exactly.
 *
 * The one claim the suite has to hold above all others is the last one: a turn
 * with no findings composes byte-for-byte as it did before findings existed.
 * Every answer stored before 2026-09-08, and every plain question after it, goes
 * through that branch, and a regression there is a regression on everything.
 */
import { describe, expect, it } from 'vitest';
import type { Finding } from '../../types/george';
import {
  SECTION_LABEL,
  SECTION_ORDER,
  canStructure,
  composeWork,
  compositionBlocks,
} from './composeWork';
import { resultBlocks, type ResultSource } from './resultShape';

const META = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  window: { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' },
  comparison: { kind: 'previous_period', baseline: { start: '2026-08-24', end: '2026-08-31' } },
};

const compared = (value: number, baseline: number, extra: Record<string, unknown> = {}) => ({
  value,
  baseline,
  change: value - baseline,
  change_pct: Math.round(((value - baseline) / baseline) * 1000) / 10,
  direction: value >= baseline ? 'up' : 'down',
  baseline_status: 'ok',
  ...extra,
});

/** An investigation's four reads, as the loop charts them. */
const SOURCES: ResultSource[] = [
  { seq: 1, tool: 'get_sales', arguments: { metric: 'net_sales' },
    rows: [compared(42000, 48000, { unit: 'PHP' })], meta: { ...META, metric_label: 'Net sales' } },
  { seq: 2, tool: 'get_sales', arguments: { metric: 'transaction_count' },
    rows: [compared(1180, 1204, { unit: 'transactions' })], meta: { ...META, metric_label: 'Transactions' } },
  { seq: 3, tool: 'get_sales', arguments: { metric: 'average_transaction_value' },
    rows: [compared(35.6, 39.9, { unit: 'PHP' })], meta: { ...META, metric_label: 'ATP' } },
  { seq: 4, tool: 'get_sales', arguments: { metric: 'product_revenue', group_by: ['product'] },
    rows: [
      { product: 'CCP', ...compared(4000, 6000, { unit: 'PHP' }) },
      { product: 'Gummies', ...compared(3000, 3500, { unit: 'PHP' }) },
      { product: 'Mints', ...compared(2200, 2100, { unit: 'PHP' }) },
    ],
    meta: { ...META, metric_label: 'Product revenue' } },
];

const FINDINGS: Finding[] = [
  { seq: 1, role: 'primary', of: null, tool: 'get_sales' },
  { seq: 2, role: 'driver', of: 1, tool: 'get_sales' },
  { seq: 3, role: 'driver', of: 1, tool: 'get_sales' },
  { seq: 4, role: 'breakdown', of: 1, tool: 'get_sales' },
];

describe('with no findings', () => {
  it('composes as adjacency, exactly as before findings existed', () => {
    const c = composeWork(SOURCES, undefined);
    expect(c.kind).toBe('adjacent');
    expect(c.kind === 'adjacent' && c.blocks).toEqual(resultBlocks(SOURCES));
  });

  it('treats an empty list the same as none', () => {
    expect(composeWork(SOURCES, [])).toEqual(composeWork(SOURCES, undefined));
  });

  it('cannot structure', () => {
    expect(canStructure(SOURCES, undefined)).toBe(false);
    expect(canStructure(SOURCES, [])).toBe(false);
  });
});

describe('with a whole investigation', () => {
  const c = composeWork(SOURCES, FINDINGS);

  it('is structured', () => {
    expect(c.kind).toBe('structured');
  });

  it('climbs the ladder in the definitions\' order', () => {
    expect(c.kind === 'structured' && c.sections.map((s) => s.role)).toEqual([
      'primary', 'driver', 'breakdown',
    ]);
  });

  it('labels each rung with the definitions\' word, never the model\'s', () => {
    expect(c.kind === 'structured' && c.sections.map((s) => s.label)).toEqual([
      SECTION_LABEL.primary, SECTION_LABEL.driver, SECTION_LABEL.breakdown,
    ]);
  });

  it('puts both drivers abreast under one heading, as resultShape would', () => {
    // The two drivers share a scope, so they group — the same rule that
    // grouped them before roles existed. A role decides where, not what.
    const drivers = c.kind === 'structured' ? c.sections[1].blocks : [];
    expect(drivers).toHaveLength(1);
    expect(drivers[0].kind).toBe('group');
  });

  it('loses nothing: every block is still on the surface', () => {
    const flat = compositionBlocks(c);
    const seqs = flat.flatMap((b) =>
      b.kind === 'group' ? b.members.map((m) => m.source.seq) : [b.result.source.seq],
    );
    expect(seqs.sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('what a role cannot reach', () => {
  it('never draws a section for a role whose result was not charted', () => {
    // A role on seq 9, which the loop never sent whole. It points at nothing,
    // and a section with nothing in it is not drawn.
    const c = composeWork(SOURCES, [
      ...FINDINGS,
      { seq: 9, role: 'context', of: null, tool: 'get_stock' },
    ]);
    expect(c.kind === 'structured' && c.sections.map((s) => s.role)).toEqual([
      'primary', 'driver', 'breakdown',
    ]);
  });

  it('falls back to adjacency when the primary itself was never drawn', () => {
    // A driver of nothing is not a driver. Adjacency is never wrong, only less.
    const c = composeWork(SOURCES.slice(1), FINDINGS);
    expect(c.kind).toBe('adjacent');
  });

  it('puts a drawn result with no role under "also read" rather than dropping it', () => {
    const c = composeWork(SOURCES, FINDINGS.slice(0, 1));
    expect(c.kind === 'structured' && c.sections.map((s) => s.role)).toEqual([
      'primary', 'context',
    ]);
  });

  it('orders within a section by call order and never by role submission order', () => {
    const c = composeWork(SOURCES, [FINDINGS[3], FINDINGS[2], FINDINGS[1], FINDINGS[0]]);
    const drivers = c.kind === 'structured' ? c.sections[1].blocks[0] : null;
    expect(drivers && drivers.kind === 'group' && drivers.members.map((m) => m.source.seq)).toEqual([2, 3]);
  });
});

describe('the vocabulary', () => {
  it('is the four roles in ladder order, and only those', () => {
    expect(SECTION_ORDER).toEqual(['primary', 'driver', 'breakdown', 'context']);
    expect(Object.keys(SECTION_LABEL).sort()).toEqual([...SECTION_ORDER].sort());
  });
});
