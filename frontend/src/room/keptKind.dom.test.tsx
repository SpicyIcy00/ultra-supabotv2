// @vitest-environment jsdom
/**
 * EACH OF THE FOUR KINDS DRAWS DIFFERENTLY, FROM THE SAME PINS (W4.1).
 *
 * The owner, of the pages in the room's sidebar — Estate Dashboard, Store
 * Dashboard, Estate Week, AJI BARN Reorder: *"next thing we need to do is make
 * how each page style work idealy"*.
 *
 * The fixtures here are those four pages' SHAPES over recorded reads
 * (`__fixtures__/vocab-reads.json`): four single-metric analyses for the two
 * dashboards and the week, five list-shaped ones for the reorder page. The
 * card's done-when, held one test each:
 *
 *   a dashboard groups a RUN of consecutive single figures into ONE row of
 *   tiles, and an analysis that is not one breaks the run where it stands;
 *   a week draws one column with a dateline and the titles as heads;
 *   a list gives its rows the width and hands the block's own kind to the box
 *   that has it;
 *   a collection is exactly what a kept page drew before this card;
 *   the person's ORDER is the same in all four;
 *   an analysis that failed says so while its neighbours draw;
 *   no kind wears the accent, and every kind keeps every figure's read time
 *   and every one of the analysis's controls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { CompositionBlock } from '../types/bob';
import type { Page, PageKind, Pin, PinRun } from '../types/pins';
import { KeptPage } from './KeptPage';
import reads from './__fixtures__/vocab-reads.json';

vi.mock('./ObjectPanel', () => ({ ObjectPanel: () => null, kindOf: () => null }));
vi.mock('../hooks/useBob', () => ({
  useBob: () => ({ ask: vi.fn(), reset: vi.fn(), busy: false }),
}));
vi.mock('../services/deskApi', () => ({ readDeskDefinitions: () => Promise.reject(new Error('no')) }));
vi.mock('../services/storesApi', () => ({ readStoreAppearance: () => Promise.reject(new Error('no')) }));

const runPin = vi.fn();
vi.mock('../services/pinsApi', async (original) => ({
  ...(await original<typeof import('../services/pinsApi')>()),
  runPin: (id: string) => runPin(id),
  listPins: () => Promise.resolve(PINS),
  listPinPages: () => Promise.resolve([]),
}));
const setPageKind = vi.fn();
vi.mock('../services/pagesApi', async (original) => ({
  ...(await original<typeof import('../services/pagesApi')>()),
  getPage: () => Promise.resolve(PAGE),
  setPageKind: (id: string, kind: PageKind) => setPageKind(id, kind),
}));

type Read = { tool: string; arguments: Record<string, unknown>; rows: Record<string, unknown>[];
              meta: Record<string, unknown> };
const R = reads as unknown as Record<string, Read>;

/** The four pages' analyses, by the shape each one draws. */
const DASHBOARD: [string, CompositionBlock['kind'], string][] = [
  ['Estate net sales', 'figure', 'figure'],
  ['Transactions', 'figure', 'figure'],
  ['Average ticket', 'figure', 'figure'],
  ['Stock cover', 'figure', 'figure'],
];
const STORE: [string, CompositionBlock['kind'], string][] = [
  ['Rockwell net sales', 'figure', 'figure'],
  ['Transactions', 'figure', 'figure'],
  ['By day', 'line', 'line'],
  ['Average ticket', 'figure', 'figure'],
];
const REORDER: [string, CompositionBlock['kind'], string][] = [
  ['Lines at zero', 'list', 'table'],
  ['Below cover', 'list', 'table'],
  ['Orders waiting', 'table', 'table'],
  ['Slow movers', 'list', 'table'],
  ['To visit', 'list', 'table'],
];

let ANALYSES = DASHBOARD;
let PAGE: Page = { id: 'page-1', title: 'Estate Dashboard', purpose: null, pins: 4,
                   created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z' };
let PINS: Pin[] = [];
/** Ids of the analyses whose run must fail, to prove a neighbour still draws. */
let BROKEN = new Set<string>();

function build(kind: PageKind | undefined, analyses = ANALYSES) {
  ANALYSES = analyses;
  PAGE = { ...PAGE, kind, pins: analyses.length };
  PINS = analyses.map(([title], i) => ({
    id: `pin-${i}`, title, question: null, page: PAGE.title, page_id: PAGE.id, position: i,
    conversation_id: null, tool_calls: [], created_at: '2026-09-23T00:00:00Z',
    last_run_at: null, last_ok_at: '2026-09-23T00:00:00Z', last_status: 'ok',
  }));
  runPin.mockImplementation((id: string) => {
    if (BROKEN.has(id)) return Promise.reject(new Error('the read timed out'));
    const i = Number(id.split('-')[1]);
    const [, mark, read] = analyses[i];
    const run: PinRun = {
      id, title: analyses[i][0], status: 'ok', notices: [], last_ok_at: null,
      ran_at: '2026-09-23T08:00:00Z',
      blocks: [{ op: 'put', kind: mark, key: `pin-0`, weight: 'lead', seq: 0, tool: R[read].tool }],
      results: [{ tool: R[read].tool, arguments: R[read].arguments, status: 'ok', duration_ms: 9,
                  rows: R[read].rows, meta: R[read].meta as never, notices: [] }],
    };
    return Promise.resolve(run);
  });
}

function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <KeptPage pageId="page-1" onBack={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function drawn(kind: PageKind | undefined, analyses = ANALYSES) {
  build(kind, analyses);
  const { container } = open();
  await waitFor(() => expect(container.querySelectorAll('.r-kept-pin'))
    .toHaveLength(analyses.length));
  await waitFor(() => expect(container.querySelector('.r-kept-pin[data-shape]:not([data-shape="none"])'))
    .not.toBeNull());
  return container;
}

const order = (c: HTMLElement) => Array.from(c.querySelectorAll('.r-kept-pin'))
  .map((s) => s.getAttribute('data-pin'));

afterEach(() => { cleanup(); runPin.mockReset(); setPageKind.mockReset(); BROKEN = new Set(); });

describe('a dashboard is numbers you check', () => {
  it('puts a run of consecutive single figures in ONE row of tiles', async () => {
    const c = await drawn('dashboard', DASHBOARD);
    expect(c.querySelector('.r-kept')?.getAttribute('data-page-kind')).toBe('dashboard');
    const rows = c.querySelectorAll('.r-kept-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-tiles')).toBe('4');
    expect(rows[0].querySelectorAll('.r-kept-pin[data-tile="yes"]')).toHaveLength(4);
  });

  it('breaks the run where an analysis is not a single figure, in place', async () => {
    const c = await drawn('dashboard', STORE);
    const rows = Array.from(c.querySelectorAll('.r-kept-row'));
    // Two figures, then the chart at the width, then one figure — which is a
    // row of one and therefore not a row at all.
    expect(rows.map((r) => r.getAttribute('data-tiles'))).toEqual(['2']);
    const chart = c.querySelector('.r-kept-pin[data-pin="pin-2"]');
    expect(chart?.getAttribute('data-tile')).toBeNull();
    expect(chart?.closest('.r-kept-row')).toBeNull();
    expect(order(c)).toEqual(['pin-0', 'pin-1', 'pin-2', 'pin-3']);
  });

  it('keeps every tile’s read time and every one of its controls', async () => {
    const c = await drawn('dashboard', DASHBOARD);
    for (const tile of Array.from(c.querySelectorAll('.r-kept-pin[data-tile="yes"]'))) {
      expect(tile.querySelector('.r-src'), tile.getAttribute('data-pin') ?? '').not.toBeNull();
    }
    expect(screen.getByLabelText('Move Transactions up')).toBeTruthy();
    expect(screen.getByLabelText('Move Transactions down')).toBeTruthy();
    expect(screen.getByLabelText('Remove Transactions from page')).toBeTruthy();
    expect(screen.getByLabelText('Delete Transactions')).toBeTruthy();
  });
});

describe('a week is how it went over a window', () => {
  it('draws a dateline at the top and never puts two analyses on one line', async () => {
    const c = await drawn('week', DASHBOARD);
    expect(c.querySelector('.r-kept')?.getAttribute('data-page-kind')).toBe('week');
    await waitFor(() => expect(c.querySelector('.r-doc-dateline')).not.toBeNull());
    expect(c.querySelector('.r-doc-dateline')?.textContent).toMatch(/read/);
    expect(c.querySelectorAll('.r-kept-row')).toHaveLength(0);
    expect(c.querySelectorAll('.r-kept-pin[data-tile]')).toHaveLength(0);
  });

  it('lays each analysis out as a section rather than packing it', async () => {
    const c = await drawn('week', DASHBOARD);
    expect(c.querySelectorAll('.r-board--laid').length).toBe(4);
    expect(c.querySelectorAll('.r-doc-fig').length).toBe(4);
    // Its title is the head of the section — one heading per analysis, in order.
    expect(Array.from(c.querySelectorAll('.r-kept-pin-title')).map((h) => h.textContent))
      .toEqual(DASHBOARD.map(([t]) => t));
  });
});

describe('a list is a working page', () => {
  it('hands each block’s own kind to the box that has the width', async () => {
    const c = await drawn('list', REORDER);
    expect(c.querySelector('.r-kept')?.getAttribute('data-page-kind')).toBe('list');
    const figs = Array.from(c.querySelectorAll('.r-doc-fig'));
    expect(figs).toHaveLength(5);
    expect(figs.map((f) => f.getAttribute('data-kind')))
      .toEqual(['list', 'list', 'table', 'list', 'list']);
    expect(c.querySelectorAll('.r-kept-row')).toHaveLength(0);
  });
});

describe('a collection is what a kept page has always been', () => {
  it('draws no row, no dateline and no laid-out board', async () => {
    const c = await drawn('collection', DASHBOARD);
    expect(c.querySelectorAll('.r-kept-row')).toHaveLength(0);
    expect(c.querySelector('.r-doc-dateline')).toBeNull();
    expect(c.querySelectorAll('.r-board--laid')).toHaveLength(0);
    expect(c.querySelectorAll('.r-board.r-flow')).toHaveLength(4);
  });

  it('is what a response carrying no kind at all reads as', async () => {
    const c = await drawn(undefined, DASHBOARD);
    expect(c.querySelector('.r-kept')?.getAttribute('data-page-kind')).toBe('collection');
    expect(c.querySelectorAll('.r-kept-row')).toHaveLength(0);
  });
});

describe('what every kind must do', () => {
  it('keeps the person’s order, in all four', async () => {
    for (const kind of ['dashboard', 'week', 'list', 'collection'] as PageKind[]) {
      const c = await drawn(kind, STORE);
      expect(order(c), kind).toEqual(['pin-0', 'pin-1', 'pin-2', 'pin-3']);
      cleanup();
    }
  });

  it('never wears the accent', async () => {
    for (const kind of ['dashboard', 'week', 'list', 'collection'] as PageKind[]) {
      const c = await drawn(kind, STORE);
      expect(c.querySelectorAll('.r-do'), kind).toHaveLength(0);
      expect(c.querySelectorAll('[data-accent]'), kind).toHaveLength(0);
      cleanup();
    }
  });

  it('lets an analysis that failed say so while its neighbours draw', async () => {
    BROKEN = new Set(['pin-1']);
    const c = await drawn('dashboard', DASHBOARD);
    await waitFor(() => expect(c.querySelector('[data-state="failed"]')).not.toBeNull());
    const failed = c.querySelector('.r-kept-pin[data-pin="pin-1"]');
    expect(failed?.querySelector('[data-state="failed"]')?.textContent).toContain('Could not reach Bob');
    // It is not a tile — nothing came back to make one — and the other three
    // still drew their figures.
    expect(c.querySelectorAll('.r-kept-pin[data-tile="yes"]')).toHaveLength(3);
    expect(order(c)).toEqual(['pin-0', 'pin-1', 'pin-2', 'pin-3']);
  });
});

describe('the owner says what the page is', () => {
  it('names the kind in the room’s words and stores the one picked', async () => {
    const c = await drawn('collection', DASHBOARD);
    const opener = screen.getByLabelText('What this page is');
    expect(opener.textContent).toBe('Saved answers');
    setPageKind.mockResolvedValue({ ...PAGE, kind: 'week', kind_set_by: 'user' });
    fireEvent.click(opener);
    const select = screen.getByLabelText('What this page is') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value))
      .toEqual(['dashboard', 'week', 'list', 'collection']);
    expect(Array.from(select.options).every((o) => o.textContent !== o.value)).toBe(true);
    fireEvent.change(select, { target: { value: 'week' } });
    fireEvent.submit(select.closest('form') as HTMLFormElement);
    await waitFor(() => expect(setPageKind).toHaveBeenCalledWith('page-1', 'week'));
    expect(c.querySelector('.r-kept')).not.toBeNull();
  });

  it('says a derived kind was worked out rather than chosen', async () => {
    build('dashboard', DASHBOARD);
    PAGE = { ...PAGE, kind_set_by: 'derived' };
    const { container } = open();
    await waitFor(() => expect(container.querySelector('.r-kept-pin')).not.toBeNull());
    fireEvent.click(screen.getByLabelText('What this page is'));
    expect(container.querySelector('[data-kind-says]')?.textContent)
      .toContain('nobody has set it');
  });
});
