// @vitest-environment jsdom
/**
 * A KEPT PAGE'S DATE WINDOW (W1.4) — "add date filters to this".
 *
 *   - the page offers one window control; its options are the page's own,
 *     served from the definitions, and none is held here;
 *   - picking a window stores it on the page (the server runs every analysis
 *     over it), and each analysis re-runs when the window moves — the figures
 *     are the run's, never recomputed in the browser;
 *   - an analysis whose read takes no date range says so, in the server's
 *     words, rather than being drawn under a window it ignored;
 *   - changing, failed and loaded are three renderings (UI rule 8).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Page, PageWindow, Pin, PinRun } from '../types/pins';
import { KeptPin, WindowControl } from './KeptPage';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
vi.mock('../hooks/useBob', () => ({
  useBob: () => ({ ask: vi.fn(), reset: vi.fn(), busy: false }),
}));
const runPin = vi.fn();
vi.mock('../services/pinsApi', async (original) => ({
  ...(await original<typeof import('../services/pinsApi')>()),
  runPin: (id: string) => runPin(id),
}));
const setPageWindow = vi.fn();
const removePageWindow = vi.fn();
vi.mock('../services/pagesApi', async (original) => ({
  ...(await original<typeof import('../services/pagesApi')>()),
  setPageWindow: (id: string, preset: string | null) => setPageWindow(id, preset),
  removePageWindow: (id: string) => removePageWindow(id),
}));
afterEach(() => {
  cleanup(); runPin.mockReset(); setPageWindow.mockReset(); removePageWindow.mockReset();
});

const OPTIONS: PageWindow['options'] = [
  { value: null, label: 'As each was kept', includes_partial_day: false },
  { value: 'last_week', label: 'last week', includes_partial_day: false },
  { value: 'last_month', label: 'last month', includes_partial_day: false },
];

const PAGE: Page = {
  id: 'page-1', title: 'Rockwell', purpose: null, created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z', pins: 2, window: null,
};

const PIN: Pin = {
  id: 'pin-1', title: 'Net sales', question: null, page: 'Rockwell', page_id: 'page-1',
  position: 0, conversation_id: null, created_at: '2026-09-17T00:00:00Z',
  tool_calls: [], last_run_at: null, last_ok_at: '2026-09-17T00:00:00Z', last_status: 'ok',
};

function windowOf(preset: string | null): PageWindow {
  return { preset, label: OPTIONS.find((o) => o.value === preset)?.label ?? '',
           set_at: new Date().toISOString(), set_by: 'bob', options: OPTIONS };
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrap(node: React.ReactNode, qc: QueryClient = client()) {
  return (
    <QueryClientProvider client={qc}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>
  );
}

describe('the page offers one date window', () => {
  it('a page with none offers to add one, and adding it moves nothing', async () => {
    setPageWindow.mockResolvedValue({ ...PAGE, window: windowOf(null) });
    const onDone = vi.fn();
    render(wrap(<WindowControl page={PAGE} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Add date filter' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setPageWindow).toHaveBeenCalledWith('page-1', null);
  });

  it('offers the page’s own options and stores the one picked', async () => {
    setPageWindow.mockResolvedValue({ ...PAGE, window: windowOf('last_month') });
    const onDone = vi.fn();
    render(wrap(<WindowControl page={{ ...PAGE, window: windowOf(null) }} onDone={onDone} />));
    const select = screen.getByLabelText('Dates for every analysis on this page') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent))
      .toEqual(['As each was kept', 'last week', 'last month']);
    expect(screen.getByText(/by Bob/)).toBeTruthy();   // who set it, and when
    fireEvent.change(select, { target: { value: 'last_month' } });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(setPageWindow).toHaveBeenCalledWith('page-1', 'last_month');
  });

  it('takes the filter off', async () => {
    removePageWindow.mockResolvedValue({ ...PAGE, window: null });
    const onDone = vi.fn();
    render(wrap(<WindowControl page={{ ...PAGE, window: windowOf('last_week') }} onDone={onDone} />));
    fireEvent.click(screen.getByRole('button', { name: 'Remove date filter' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(removePageWindow).toHaveBeenCalledWith('page-1');
  });

  it('says it failed, in the server’s words, and does not claim the change', async () => {
    setPageWindow.mockRejectedValue(new Error("'fortnight' is not a date window"));
    const onDone = vi.fn();
    const { container } = render(wrap(<WindowControl page={{ ...PAGE, window: windowOf(null) }} onDone={onDone} />));
    fireEvent.change(screen.getByLabelText('Dates for every analysis on this page'),
                     { target: { value: 'last_week' } });
    await waitFor(() => expect(container.querySelector('[data-state="failed"]')).not.toBeNull());
    expect(onDone).not.toHaveBeenCalled();
  });
});

function runOver(preset: string | null): PinRun {
  return {
    id: PIN.id, title: PIN.title, status: 'ok', notices: [], last_ok_at: null,
    ran_at: new Date().toISOString(), blocks: [],
    window: preset ? { preset, label: preset.replace('_', ' ') } : null,
    results: [
      { tool: 'get_sales', arguments: { date_range: preset }, status: 'ok', duration_ms: 5,
        rows: [], meta: {} as never, notices: [],
        window: preset ? { applied: preset, argument: 'date_range', was: 'last_7_days' } : null },
      { tool: 'get_dead_stock', arguments: {}, status: 'ok', duration_ms: 5,
        rows: [], meta: {} as never, notices: [],
        window: preset ? { applied: null, preset, says: 'Net sales (get_dead_stock) reads no date range, so the page’s dates do not change it; it shows what it was kept with.' } : null },
    ],
  };
}

describe('each analysis re-runs over the page’s window', () => {
  it('runs again when the window moves, and draws what the run says', async () => {
    runPin.mockImplementation(() => Promise.resolve(runOver(null)));
    const qc = client();
    const view = render(wrap(<KeptPin pin={PIN} pageId="page-1" title="Rockwell" window={windowOf(null)} />, qc));
    await waitFor(() => expect(runPin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.container.querySelector('[data-state="empty"]')).not.toBeNull());
    expect(view.container.querySelector('[data-window]')).toBeNull();

    runPin.mockImplementation(() => Promise.resolve(runOver('last_month')));
    view.rerender(wrap(<KeptPin pin={PIN} pageId="page-1" title="Rockwell" window={windowOf('last_month')} />, qc));
    await waitFor(() => expect(view.container.querySelector('[data-window="last_month"]')).not.toBeNull());
    expect(runPin).toHaveBeenCalledTimes(2);
    expect(view.container.textContent).toContain('Read over last month');
    // The read the window could not move says so — never drawn as if it had.
    const unmoved = view.container.querySelector('[data-window-unmoved]');
    expect(unmoved?.textContent).toContain('reads no date range');
  });
});
