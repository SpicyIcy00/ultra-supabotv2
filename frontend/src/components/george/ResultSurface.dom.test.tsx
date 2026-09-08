/**
 * The result primitives, as rendered output.
 *
 * WHY THESE ONES GET A DOM. Everywhere else in this suite the thing worth
 * testing is a decision, and a decision is a pure function. Here the claims
 * are about what actually reaches the screen — a figure carries its receipts,
 * a table survives a phone, a delta shows the baseline it was measured
 * against — and asserting those against a data structure would assert the
 * test's model of the component rather than the component.
 *
 * THE PROPERTY UNDER TEST THROUGHOUT: no number appears that did not come off
 * a row, and no figure appears without its provenance and its time.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ToolMeta } from '../../types/george';
import { ResultSurface } from './ResultSurface';
import { blocksFromCharted } from './resultShape';

const META: ToolMeta = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-07T09:00:00+08:00',
  window: { kind: 'preset', name: 'this_week', start: '2026-09-01', end: '2026-09-08' },
  metric_unit: 'PHP',
  row_count: 7,
};

const stored = (rows: Record<string, unknown>[], meta: ToolMeta = META, seq = 1) => [
  { seq, tool: 'get_sales', rows, meta },
];

/**
 * jsdom has no ResizeObserver and recharts measures its container with one.
 * A stub that never fires is the honest shim: the chart renders its container
 * and its SVG scaffolding, which is what these tests assert. What a chart
 * LOOKS like at a given width is not something a headless DOM can tell us, and
 * pretending otherwise would be a test that passes for the wrong reason.
 */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

// Explicit rather than automatic: this config does not enable vitest globals,
// so testing-library never registers its own afterEach and one test's DOM
// would otherwise still be on screen during the next.
afterEach(cleanup);

function surface(charted: unknown) {
  return render(<ResultSurface blocks={blocksFromCharted(charted)} />);
}

describe('Metric', () => {
  it('prints the figure with its currency and its label', () => {
    surface(stored([{ measure: 'net_sales', store: 'Rockwell', value: 482300, unit: 'PHP' }]));
    expect(screen.getByText('₱482,300')).toBeTruthy();
    expect(screen.getByText(/Rockwell/)).toBeTruthy();
  });

  it('names a unit that is a word, and does not print PHP as one', () => {
    surface(stored([{ measure: 'transaction_count', store: 'Rockwell', value: 1204,
      unit: 'transactions' }]));
    expect(screen.getByText('1,204')).toBeTruthy();
    // Exact: `new_transactions` in the receipts contains the word too, and a
    // loose match here would pass on the provenance line rather than the unit.
    expect(screen.getByText('Rockwell · transactions')).toBeTruthy();
  });

  it('shows nothing at all rather than a zero when there are no rows', () => {
    const { container } = surface(stored([]));
    expect(container.textContent).toBe('');
  });
});

describe('MetricGroup', () => {
  const group = [
    { seq: 1, tool: 'get_sales', rows: [{ measure: 'net_sales', value: 482300, unit: 'PHP' }],
      meta: META },
    { seq: 2, tool: 'get_sales',
      rows: [{ measure: 'transaction_count', value: 1204, unit: 'transactions' }], meta: META },
  ];

  it('puts both figures under one heading taken from the window', () => {
    surface(group);
    expect(screen.getByText('This week')).toBeTruthy();
    expect(screen.getByText('₱482,300')).toBeTruthy();
    expect(screen.getByText('1,204')).toBeTruthy();
  });

  it('carries ONE receipts line when both were read the same way', () => {
    surface(group);
    expect(screen.getAllByRole('button', { name: /read/ })).toHaveLength(1);
  });

  it('does not repeat the scope the heading already states', () => {
    // The heading is built from the window and the store argument; a receipts
    // line under it saying "This week" again is the duplication Stage 2 exists
    // to remove. The read TIME is not duplicated and always stays (UI rule 6).
    surface(group);
    expect(screen.getAllByText('This week')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /read/ })).toBeTruthy();
  });

  it('gives each figure its own receipts when they were not', () => {
    surface([
      group[0],
      { ...group[1], meta: { ...META, source_table: 'new_transaction_items + new_transactions' } },
    ]);
    // Different tables, so one line over both would name a source that
    // produced half of what is on screen.
    expect(screen.getAllByText(/read/).length).toBeGreaterThanOrEqual(2);
  });

  it('stacks to one column on a phone', () => {
    const { container } = surface(group);
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-1');
  });
});

describe('Comparison', () => {
  const brief = [
    {
      seq: 1,
      tool: 'get_brief',
      rows: [
        { section: 'sales_vs_same_weekday', subject: 'Rockwell', value: 100, baseline: 120,
          change: -20, change_pct: -16.7, direction: 'down', unit: 'PHP' },
      ],
      meta: META,
    },
  ];

  it('shows the figure, the direction and the delta the tool supplied', () => {
    surface(brief);
    expect(screen.getByText('₱100')).toBeTruthy();
    expect(screen.getByText('16.7%')).toBeTruthy();
    expect(screen.getByText(/↓/)).toBeTruthy();
  });

  it('names the baseline, so the percentage is not a figure on its own', () => {
    surface(brief);
    expect(screen.getByText(/from/)).toBeTruthy();
    expect(screen.getByText(/₱120/)).toBeTruthy();
  });

  it('never colours the direction — this app has one meaningful colour', () => {
    const { container } = surface(brief);
    expect(container.innerHTML).not.toMatch(/george-accent|text-red|text-green/);
  });
});

describe('ResultTable', () => {
  const rows = [
    { store: 'Rockwell', value: 482300, units: 12, baskets: 1204, rank: 1 },
    { store: 'Shang', value: 331200, units: 9, baskets: 980, rank: 2 },
  ];

  it('renders every row it was given', () => {
    surface(stored(rows, { ...META, row_count: 2 }));
    expect(screen.getByText('Rockwell')).toBeTruthy();
    expect(screen.getByText('Shang')).toBeTruthy();
  });

  it('labels every cell with its column, so a phone loses no figure', () => {
    // The header row is hidden below `sm`; the label travels with the cell.
    const { container } = surface(stored(rows, { ...META, row_count: 2 }));
    const firstCell = container.querySelector('td');
    expect(within(firstCell as HTMLElement).getByText('store')).toBeTruthy();
    expect((firstCell as HTMLElement).querySelector('.sm\\:hidden')).toBeTruthy();
  });

  it('never lets a partial list read as a total', () => {
    surface(stored(rows, { ...META, row_count: 41 }));
    expect(screen.getByText('2 of 41 rows')).toBeTruthy();
  });
});

describe('Chart', () => {
  const series = Array.from({ length: 5 }, (_, i) => ({
    day: `2026-09-0${i + 1}`,
    value: (i + 1) * 100,
  }));

  it('draws a chart rather than a table for a series over time', () => {
    const { container } = surface(stored(series));
    expect(container.querySelector('.recharts-responsive-container')).toBeTruthy();
  });

  it('keeps its receipts beside it', () => {
    surface(stored(series));
    expect(openReceipts()).toMatch(/new_transactions/);
  });
});

/**
 * Open the receipts and return what they say.
 *
 * Levels 3 and 4 of the disclosure (metrics.yaml notices.contract records the
 * same four for caveats): the method, then the raw receipt. Nothing here is
 * hidden — the button names itself and the always-visible line above it
 * carries the scope and the read time.
 */
function openReceipts(): string {
  const button = screen.getAllByRole('button', { name: /read/ })[0];
  fireEvent.click(button);
  return (button.closest('div')?.parentElement ?? document.body).textContent ?? '';
}

describe('provenance survives every primitive', () => {
  const cases: [string, Record<string, unknown>[]][] = [
    ['a figure', [{ measure: 'net_sales', value: 1, unit: 'PHP' }]],
    ['a comparison', [{ subject: 'Rockwell', value: 1, change_pct: -3, direction: 'down' }]],
    ['a table', [{ store: 'Rockwell', value: 1, units: 2, baskets: 3, rank: 4 }]],
    ['a chart', [
      { day: '2026-09-01', value: 1 },
      { day: '2026-09-02', value: 2 },
      { day: '2026-09-03', value: 3 },
    ]],
  ];

  it.each(cases)('shows the scope and the time under %s', (_name, rows) => {
    surface(stored(rows));
    // UI rule 6: no number displays without when it was read. Always visible,
    // never behind anything, on every primitive.
    expect(screen.getByText(/read /)).toBeTruthy();
    // Level 2: what was measured, in the language of the question. The table
    // name used to lead this line; it is provenance and is now one tap down.
    expect(screen.getByText(/This week/)).toBeTruthy();
  });

  it.each(cases)('shows the source one tap away under %s', (_name, rows) => {
    surface(stored(rows));
    // UI rule 3: every number is inspectable, in the SAME panel, one click
    // away. Level 4 — the table, the filters and their citations.
    expect(openReceipts()).toMatch(/new_transactions/);
  });
});

describe('the surface draws no caveat of its own', () => {
  it('renders no notice, because a notice belongs above the answer', () => {
    // UI rule 4. The turn and the post each place notices before they reach
    // here; a caveat rendered beside a figure would sit below the sentence it
    // qualifies.
    const { container } = surface(stored([{ measure: 'net_sales', value: 1, unit: 'PHP' }]));
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});

describe('Comparison, when the tool could not compare', () => {
  const compared = (over: Record<string, unknown>) =>
    stored(
      [{ store: 'Shang', value: 41242, baseline: 215567, change: -174325, change_pct: -80.9,
         direction: 'down', unit: 'PHP', baseline_status: 'ok', ...over }],
      { ...META, comparison: { kind: 'previous_period', display_name: 'vs previous period',
                               baseline: { start: '2026-03-23', end: '2026-03-30' } } },
    );

  it('says "no baseline" in words rather than drawing a zero', () => {
    surface(compared({ baseline: null, change: null, change_pct: null, direction: null,
                       baseline_status: 'no_baseline' }));
    expect(screen.getByText('₱41,242')).toBeTruthy();
    expect(screen.getByText(/no baseline/)).toBeTruthy();
    expect(screen.queryByText(/0%/)).toBeNull();
    expect(screen.queryByText(/↓/)).toBeNull();
  });

  it('keeps the baseline figure when only the percentage is undefined', () => {
    surface(compared({ value: 93, baseline: 0, change: 93, change_pct: null, direction: 'up',
                       unit: 'transactions', baseline_status: 'zero_baseline' }));
    expect(screen.getByText(/previous period was zero/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('draws no figure this period as a dash with the previous period beside it', () => {
    surface(compared({ value: null, change: null, change_pct: null, direction: null,
                       baseline_status: 'no_current' }));
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText(/no figure this period/)).toBeTruthy();
    expect(screen.getByText(/₱215,567/)).toBeTruthy();
  });

  it('renders flat as "no change", not as up 0%', () => {
    surface(compared({ value: 215567, change: 0, change_pct: 0, direction: 'flat' }));
    expect(screen.getByText(/no change/)).toBeTruthy();
    expect(screen.queryByText(/↑/)).toBeNull();
  });

  it('puts the baseline window on the receipts', () => {
    const { container } = surface(compared({}));
    fireEvent.click(container.querySelector('button') as HTMLElement);
    expect(screen.getByText(/2026-03-23 → 2026-03-30/)).toBeTruthy();
  });

  it('names its metric from meta when its rows have no subject', () => {
    surface(stored(
      [{ value: 179058.5, baseline: 215567, change: -36508.5, change_pct: -16.9,
         direction: 'down', unit: 'PHP', baseline_status: 'ok' }],
      { ...META, metric_label: 'Net sales' },
    ));
    expect(screen.getByText('Net sales')).toBeTruthy();
    expect(screen.getByText('16.9%')).toBeTruthy();
  });
});
