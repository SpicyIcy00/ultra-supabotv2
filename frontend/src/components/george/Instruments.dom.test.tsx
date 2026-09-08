/**
 * The instruments, as rendered.
 *
 * The decisions are held in instrumentShape.test.ts; these are claims about
 * OUTPUT — a bar that is drawn, an unranked subject that is not, a hatched
 * segment, a caveat that precedes the figure in document order — which can
 * only be checked against the DOM.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CoverageStrip, DeltaRanking, DriverSplit } from './Instruments';
import { coverageFromComparison } from './instrumentShape';
import { inferShape } from './pinShape';
import { ResultSurface } from './ResultSurface';
import { resultBlocks } from './resultShape';
import type { ShapedResult } from './resultShape';

afterEach(cleanup);

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
    baseline_statuses: { ok: 3, no_current: 1 },
    rank_by: 'biggest_drop',
    not_ranked: {
      counts: { no_current: 1 },
      no_current: [{ subject: 'Ghost', baseline: 50, unit: 'PHP' }],
      no_baseline: [],
      ranked_subjects: 3,
    },
  },
};

const RANKED = [
  { product: 'CCP', value: 4000, baseline: 6000, change: -2000, change_pct: -33.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
  { product: 'Gummies', value: 3000, baseline: 3500, change: -500, change_pct: -14.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
  { product: 'Mints', value: 20, baseline: 120, change: -100, change_pct: -83.3, direction: 'down', baseline_status: 'ok', unit: 'PHP' },
];

function ranking() {
  const shape = inferShape({ tool: 'get_sales', arguments: {}, status: 'ok', duration_ms: 1,
    rows: RANKED, meta: META, notices: [] });
  if (shape?.kind !== 'ranking') throw new Error('fixture is not a ranking');
  return shape;
}

describe('Delta Ranking', () => {
  it('draws one bar per ranked row, in the tool\'s order', () => {
    const { container } = render(<DeltaRanking shape={ranking()} />);
    const bars = container.querySelectorAll('[data-bar]');
    expect(bars).toHaveLength(3);
    const labels = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(labels[0]).toContain('CCP');
    expect(labels[2]).toContain('Mints');
  });

  it('lengths bars by change in pesos, not by percentage', () => {
    const { container } = render(<DeltaRanking shape={ranking()} />);
    const widths = [...container.querySelectorAll<HTMLElement>('[data-bar]')].map((b) =>
      parseFloat(b.style.width),
    );
    // CCP fell ₱2,000 and Mints ₱100: Mints' bar is a twentieth of CCP's,
    // although its percentage fall is the largest by far.
    expect(widths[2]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[0]);
  });

  it('prints the change and its percentage beside each bar', () => {
    render(<DeltaRanking shape={ranking()} />);
    expect(screen.getByText(/−₱2,000/)).toBeTruthy();
    expect(screen.getByText(/33.3%/)).toBeTruthy();
  });

  it('names an unranked subject and gives it no bar', () => {
    const { container } = render(<DeltaRanking shape={ranking()} />);
    // One compact line — "1 not ranked — 1 none now" — with the names one
    // tap down. No giant paragraph under the graphic.
    expect(container.textContent).toContain('1 not ranked');
    expect(container.querySelector('details')!.textContent).toContain('Ghost');
    expect(container.querySelector('details')!.textContent).toContain('was ₱50');
    // Three bars for three ranked rows; nothing drawn for Ghost.
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(3);
  });

  it('says which way it ranked and in what', () => {
    render(<DeltaRanking shape={ranking()} />);
    expect(screen.getByText(/Biggest falls · ranked by change in ₱/)).toBeTruthy();
  });

  it('is one system with the surface: coverage sits under it, then receipts', () => {
    const blocks = resultBlocks([{ seq: 1, tool: 'get_sales', rows: RANKED, meta: META }]);
    const { container } = render(<ResultSurface blocks={blocks} />);
    const strip = container.querySelector('[data-instrument="coverage"]');
    expect(strip).toBeTruthy();
    expect(strip!.textContent).toContain('nothing this period');
    expect(container.textContent).toMatch(/read /);
  });
});

describe('Driver Split', () => {
  const driver = (label: string, value: number, baseline: number, pct: number): ShapedResult => ({
    source: { seq: 1, tool: 'get_sales', rows: [], meta: META },
    shape: { kind: 'comparison', label, rows: [{ subject: '', value, baseline, change: value - baseline,
      changePct: pct, direction: pct < 0 ? 'down' : 'up', unit: label === 'ATP' ? 'PHP' : 'transactions', row: {} }] },
  });
  const members = [driver('Transactions', 1180, 1204, -2.1), driver('ATP', 35.6, 39.9, -10.2)];

  it('draws each driver as its own bar on one axis', () => {
    const { container } = render(<DriverSplit members={members} />);
    const bars = container.querySelectorAll('[data-bar]');
    expect(bars).toHaveLength(2);
    // Two rows, each with one bar, on ONE zero line: never one stacked bar.
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelectorAll('[data-zero-line]')).toHaveLength(1);
  });

  it('never prints a share or a total', () => {
    const { container } = render(<DriverSplit members={members} />);
    expect(container.textContent).not.toMatch(/share|total|contribut|account/i);
    // The only percentages are the two the tool returned.
    expect(container.textContent).toContain('−2.1%');
    expect(container.textContent).toContain('−10.2%');
  });

  it('prints the identity as the definitions\' and not as a split', () => {
    const { container } = render(
      <DriverSplit members={members} identity="net_sales = transaction_count x average_transaction_value" />,
    );
    expect(container.textContent).toContain('not a split of the change');
  });
});

describe('Coverage Strip', () => {
  const coverage = coverageFromComparison(META)!;

  it('draws the measured solid and the unmeasured hatched', () => {
    const { container } = render(<CoverageStrip coverage={coverage} />);
    const solid = container.querySelector('rect[data-measured="true"]')!;
    const hatched = container.querySelector('rect[data-measured="false"]')!;
    expect(solid.getAttribute('fill')).toBe('currentColor');
    expect(hatched.getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('names every segment with its count', () => {
    const { container } = render(<CoverageStrip coverage={coverage} />);
    expect(container.textContent).toContain('3');
    expect(container.textContent).toContain('compared');
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('nothing this period');
  });

  it('is never a gauge', () => {
    const { container } = render(<CoverageStrip coverage={coverage} />);
    expect(container.textContent).not.toMatch(/full|health|score|%/);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('3 of 4 measured');
  });
});
