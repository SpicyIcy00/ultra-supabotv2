/**
 * A pinned tile, as rendered output.
 *
 * THE PROPERTY UNDER TEST: a pin draws EVERYTHING its run brought back, in
 * call order, through the same surface an answer uses — and what did not come
 * back is named rather than dropped. Until 2026-09-07 the tile drew its first
 * result only, so a pin of three figures showed one; a tile that quietly
 * draws two of three is the same failure in a smaller form.
 *
 * Notices and receipts are asserted in every case, because a tile is only
 * allowed to show a number at all by showing where it came from and when
 * (UI rules 3, 4 and 6).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pin, PinCallResult, PinRun } from '../../types/pins';
import type { ToolMeta } from '../../types/george';

const runPin = vi.fn<(id: string) => Promise<PinRun>>();
vi.mock('../../services/pinsApi', () => ({
  runPin: (id: string) => runPin(id),
  errorMessage: (e: unknown) => String(e),
}));

// Loaded after the mock is registered, so the tile calls the fake.
const { PinTile } = await import('./PinTile');

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  runPin.mockReset();
});

const META: ToolMeta = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-07T09:00:00+08:00',
  window: { kind: 'preset', name: 'this_week', start: '2026-09-01', end: '2026-09-08' },
  metric_unit: 'PHP',
};

const PIN: Pin = {
  id: 'pin-1',
  title: 'Fame this week',
  question: 'How is Fame doing this week?',
  page: 'Fame',
  conversation_id: null,
  tool_calls: [
    { tool: 'get_sales', arguments: { metric: 'net_sales' } },
    { tool: 'get_sales', arguments: { metric: 'transactions' } },
    { tool: 'get_sales', arguments: { metric: 'drinks' } },
  ],
  created_at: '2026-09-07T08:00:00+08:00',
  last_run_at: null,
  last_ok_at: '2026-09-06T08:00:00+08:00',
  last_status: 'ok',
};

const ok = (measure: string, value: number, unit = 'PHP'): PinCallResult => ({
  tool: 'get_sales',
  arguments: { metric: measure, filters: { store: 'Fame' } },
  status: 'ok',
  duration_ms: 8,
  rows: [{ measure, value, unit }],
  meta: { ...META, metric_unit: unit },
  notices: [],
});

const notOk = (
  tool: string,
  status: PinCallResult['status'],
  error: string,
): PinCallResult => ({
  tool,
  arguments: {},
  status,
  duration_ms: 3,
  rows: [],
  meta: {},
  notices: [],
  error,
});

function runOf(results: PinCallResult[], over: Partial<PinRun> = {}): PinRun {
  const worst = results.some((r) => r.status === 'unrunnable')
    ? 'unrunnable'
    : results.some((r) => r.status === 'failed')
      ? 'failed'
      : results.some((r) => r.status === 'refused')
        ? 'refused'
        : 'ok';
  return {
    id: PIN.id,
    title: PIN.title,
    status: worst,
    results,
    notices: results.flatMap((r) => r.notices),
    last_ok_at: PIN.last_ok_at,
    ran_at: '2026-09-07T09:00:05+08:00',
    ...over,
  };
}

function tile(run: PinRun) {
  runPin.mockResolvedValue(run);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PinTile pin={PIN} onDelete={() => {}} lead />
    </QueryClientProvider>,
  );
}

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('a pin of several successful calls', () => {
  it('draws every figure, in call order, not just the first', async () => {
    tile(runOf([ok('net_sales', 118420), ok('transactions', 241, 'count'), ok('drinks', 86, 'count')]));
    const first = await screen.findByText('₱118,420');
    const second = screen.getByText('241');
    const third = screen.getByText('86');
    // Document order is call order.
    expect(follows(first, second)).toBe(true);
    expect(follows(second, third)).toBe(true);
  });

  it('carries receipts for what it drew', async () => {
    tile(runOf([ok('net_sales', 118420), ok('transactions', 241, 'count')]));
    await screen.findByText('₱118,420');
    expect(screen.getAllByText(/new_transactions/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/read /).length).toBeGreaterThanOrEqual(1);
  });

  it('says nothing about a partial replay when nothing was partial', async () => {
    tile(runOf([ok('net_sales', 118420), ok('transactions', 241, 'count')]));
    await screen.findByText('₱118,420');
    expect(screen.queryByRole('note', { name: 'Partly reproduced' })).toBeNull();
  });
});

describe('a pin in which some calls did not come back', () => {
  it('draws what came back and names what did not, above it', async () => {
    tile(
      runOf([
        ok('net_sales', 118420),
        notOk('get_stock', 'refused', 'That SKU is three products.'),
        ok('drinks', 86, 'count'),
      ]),
    );
    const figure = await screen.findByText('₱118,420');
    expect(screen.getByText('86')).toBeTruthy();

    const note = screen.getByRole('note', { name: 'Partly reproduced' });
    expect(within(note).getByText(/1 of 3 calls did not reproduce/)).toBeTruthy();
    expect(within(note).getByText('get_stock')).toBeTruthy();
    // The runner's own words, not a generic error.
    expect(within(note).getByText(/That SKU is three products\./)).toBeTruthy();
    // A caveat sits above the number it qualifies.
    expect(follows(note, figure)).toBe(true);
  });

  it('carries a time on the partial note (no claim without an expiry)', async () => {
    tile(runOf([ok('net_sales', 1), notOk('get_stock', 'failed', 'Timed out after 25s.')]));
    const note = await screen.findByRole('note', { name: 'Partly reproduced' });
    expect(within(note).getByText(/Checked/)).toBeTruthy();
  });

  it('wears no approvals colour — a rotted call needs nobody', async () => {
    const { container } = tile(
      runOf([ok('net_sales', 1), notOk('get_stock', 'unrunnable', 'gone')]),
    );
    await screen.findByRole('note', { name: 'Partly reproduced' });
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });
});

describe('a pin in which nothing came back', () => {
  it('states the worst state plainly, with when it last worked', async () => {
    tile(runOf([notOk('get_sales', 'unrunnable', 'metrik is not an argument.')]));
    expect(await screen.findByText('This pin can no longer run.')).toBeTruthy();
    expect(screen.getByText(/metrik is not an argument\./)).toBeTruthy();
    expect(screen.getByText(/Last worked/)).toBeTruthy();
  });

  it('treats a refusal as an answer, checked now', async () => {
    tile(runOf([notOk('get_sales', 'refused', 'Vending and store sales cannot be added.')]));
    expect(await screen.findByText('George declined to answer this.')).toBeTruthy();
    expect(screen.getByText(/Checked/)).toBeTruthy();
  });
});

describe('notices and empties', () => {
  it('surfaces a notice above the figures through the shared banner', async () => {
    const withNotice = ok('net_sales', 118420);
    withNotice.notices = [
      { kind: 'low_stock_not_operational', message: 'Thresholds not configured.', source: 'get_stock' },
    ];
    tile(runOf([withNotice, ok('transactions', 241, 'count')]));
    const figure = await screen.findByText('₱118,420');
    const notice = screen.getByText('Thresholds not configured.');
    expect(follows(notice, figure)).toBe(true);
  });

  it('shows an ok call with no rows as an empty result with its receipts, not a zero', async () => {
    tile(runOf([ok('net_sales', 118420), { ...ok('drinks', 0, 'count'), rows: [] }]));
    await screen.findByText('₱118,420');
    expect(screen.getByText(/empty result, not a zero/)).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});
