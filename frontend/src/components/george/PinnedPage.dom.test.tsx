/**
 * A page, as rendered output.
 *
 * THE PROPERTIES UNDER TEST: the page is a document with quiet controls —
 * Rename, purpose and Delete page beside the title; Move, Move up / Move
 * down, Remove from page and Delete beside each section — and a composer at
 * its foot that hands the question to George with the page's IDENTITY as
 * scope and its title as words. A move sends a page id; a reorder sends a
 * relational place; a rename goes through the page's own route and leaves
 * the URL alone; "Remove from page" ungroups and "Delete" deletes, and the
 * two are never one word. An empty page is a page.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page, PageDeleted, Pin, PinPage, PinRun, UpdatePageRequest, UpdatePinRequest } from '../../types/pins';

const api = {
  listPins: vi.fn<(pageId?: string | null) => Promise<Pin[]>>(),
  listPinPages: vi.fn<() => Promise<PinPage[]>>(),
  updatePin: vi.fn<(id: string, body: UpdatePinRequest) => Promise<Pin>>(),
  deletePin: vi.fn<(id: string) => Promise<void>>(),
  runPin: vi.fn<(id: string) => Promise<PinRun>>(),
};
vi.mock('../../services/pinsApi', () => ({
  listPins: (p?: string | null) => api.listPins(p),
  listPinPages: () => api.listPinPages(),
  updatePin: (id: string, b: UpdatePinRequest) => api.updatePin(id, b),
  deletePin: (id: string) => api.deletePin(id),
  runPin: (id: string) => api.runPin(id),
  similarPageConflict: () => null,
  errorMessage: (e: unknown) => String(e),
}));

const pagesApi = {
  getPage: vi.fn<(id: string) => Promise<Page>>(),
  updatePage: vi.fn<(id: string, body: UpdatePageRequest) => Promise<Page>>(),
  deletePage: vi.fn<(id: string) => Promise<PageDeleted>>(),
};
vi.mock('../../services/pagesApi', () => ({
  getPage: (id: string) => pagesApi.getPage(id),
  updatePage: (id: string, b: UpdatePageRequest) => pagesApi.updatePage(id, b),
  deletePage: (id: string) => pagesApi.deletePage(id),
}));

const george = {
  ask: vi.fn<(q: string, o?: { pageContext?: string | null; pageScope?: { page_id: string | null; title: string | null } | null }) => Promise<void>>(),
  reset: vi.fn(),
  cancel: vi.fn(),
  busy: false,
  setComposer: vi.fn(),
};
vi.mock('../../hooks/useGeorge', () => ({ useGeorge: () => george }));

const { PinnedPage } = await import('./PinnedPage');

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  for (const fn of Object.values(api)) fn.mockReset();
  for (const fn of Object.values(pagesApi)) fn.mockReset();
  george.ask.mockReset();
  george.reset.mockReset();
  vi.restoreAllMocks();
});

const FFR: Page = {
  id: 'p-ffr', title: 'FFR Overview', purpose: 'Watch the fast-food range.',
  created_at: '2026-09-07T08:00:00+08:00', updated_at: '2026-09-07T08:00:00+08:00', pins: 2,
};

const pin = (id: string, title: string, page: Page | null, position = 0): Pin => ({
  id,
  title,
  question: title,
  page: page?.title ?? null,
  page_id: page?.id ?? null,
  position,
  conversation_id: null,
  tool_calls: [{ tool: 'get_sales', arguments: { metric: 'net_sales' } }],
  created_at: '2026-09-07T08:00:00+08:00',
  last_run_at: null,
  last_ok_at: null,
  last_status: null,
});

const okRun = (p: Pin): PinRun => ({
  id: p.id,
  title: p.title,
  status: 'ok',
  results: [
    {
      tool: 'get_sales',
      arguments: { metric: 'net_sales' },
      status: 'ok',
      duration_ms: 4,
      rows: [{ measure: 'net_sales', value: 118420, unit: 'PHP' }],
      meta: { source_table: 'new_transactions', snapshot_timestamp: '2026-09-07T09:00:00+08:00' },
      notices: [],
    },
  ],
  notices: [],
  last_ok_at: null,
  ran_at: '2026-09-07T09:00:05+08:00',
});

const PINS = [pin('p1', 'Sales', FFR, 0), pin('p2', 'Drink Mix', FFR, 1)];

function mount(pageId: string | null = 'p-ffr', pins: Pin[] = PINS, page: Page = FFR) {
  api.listPins.mockResolvedValue(pins.filter((p) => p.page_id === pageId));
  api.listPinPages.mockResolvedValue([
    { page: 'FFR Overview', page_id: 'p-ffr', pins: 2 },
    { page: 'Purchasing', page_id: 'p-purch', pins: 1 },
    { page: 'Empty One', page_id: 'p-empty', pins: 0 },
  ]);
  api.runPin.mockImplementation(async (id) => okRun(pins.find((p) => p.id === id) as Pin));
  pagesApi.getPage.mockResolvedValue(page);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/pages/${pageId ?? 'ungrouped'}`]}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/pages/:pageId" element={<PinnedPage pageId={pageId} onBack={() => {}} />} />
          <Route path="/pages" element={<p>All pages, listed</p>} />
          <Route path="/ask" element={<p>Ask, with the question on its way</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('the document', () => {
  it('reads as a page: a title, its purpose, quiet controls, then each pin as a section', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'FFR Overview' })).toBeTruthy();
    expect(screen.getByText('Watch the fast-food range.')).toBeTruthy();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    expect(screen.getByRole('heading', { level: 3, name: 'Drink Mix' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit purpose' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete page' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Move (Sales|Drink Mix)$/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Delete (Sales|Drink Mix)$/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /from page$/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(2);
  });

  it('offers no Rename, purpose or Delete page for the ungrouped pins, which are not a page', async () => {
    mount(null, [pin('p3', 'Loose', null)]);
    await screen.findByRole('heading', { level: 3, name: 'Loose' });
    expect(screen.getByRole('heading', { level: 1, name: 'Ungrouped' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
    expect(screen.queryByRole('button', { name: /purpose/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete page' })).toBeNull();
    // Nor a reorder or a "Remove from page": Ungrouped keeps no order and is not a page.
    expect(screen.queryByRole('button', { name: /Move Loose (up|down)/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /from page$/ })).toBeNull();
    expect(pagesApi.getPage).not.toHaveBeenCalled();
  });

  it('renders an EMPTY page as a page, with the composer to fill it', async () => {
    const empty: Page = { ...FFR, id: 'p-empty', title: 'Rockwell Weekly', purpose: null, pins: 0 };
    mount('p-empty', [], empty);
    expect(await screen.findByRole('heading', { level: 1, name: 'Rockwell Weekly' })).toBeTruthy();
    expect(await screen.findByText('Nothing here yet.')).toBeTruthy();
    expect(screen.getByText(/Ask George to build this page/)).toBeTruthy();
    expect(screen.getByLabelText('Ask George about this page…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add purpose' })).toBeTruthy();
  });

  it('wears no approvals colour', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });
});

describe('moving a pin', () => {
  it('sends the chosen page’s id, and a null id for “No page”', async () => {
    api.updatePin.mockImplementation(async (id, body) => ({
      ...(PINS.find((p) => p.id === id) as Pin),
      page_id: body.page_id ?? null,
    }));
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });

    fireEvent.click(screen.getByRole('button', { name: 'Move Sales' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move Sales' });
    await within(dialog).findByLabelText('Purchasing');
    // An empty page is offered too: it is exactly where a pin goes next.
    expect(within(dialog).getByLabelText('Empty One')).toBeTruthy();

    // Where it already is: nothing to do, and the control says so.
    const move = within(dialog).getByRole('button', { name: /^Move$/ }) as HTMLButtonElement;
    expect((within(dialog).getByLabelText('FFR Overview') as HTMLInputElement).checked).toBe(true);
    expect(move.disabled).toBe(true);

    fireEvent.click(within(dialog).getByLabelText('Purchasing'));
    expect(move.disabled).toBe(false);
    fireEvent.click(move);

    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(1));
    expect(api.updatePin.mock.calls[0]).toEqual(['p1', { page_id: 'p-purch', allow_similar_page: false }]);
    // Never the title.
    expect(JSON.stringify(api.updatePin.mock.calls[0][1])).not.toContain('Purchasing');
    // A move is not a refresh: the pin ran once, on mount, and not again.
    expect(api.runPin.mock.calls.filter(([id]) => id === 'p1')).toHaveLength(1);
  });

  it('can move a pin to a page that does not exist yet, by name', async () => {
    api.updatePin.mockImplementation(async (id) => PINS.find((p) => p.id === id) as Pin);
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Drink Mix' });
    fireEvent.click(screen.getByRole('button', { name: 'Move Drink Mix' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move Drink Mix' });
    fireEvent.click(within(dialog).getByLabelText('New page'));
    fireEvent.change(within(dialog).getByLabelText('New page name'), {
      target: { value: 'Beverages' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Move$/ }));
    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(1));
    expect(api.updatePin.mock.calls[0][1]).toEqual({ page: 'Beverages', allow_similar_page: false });
  });

  it('takes a pin off the page without deleting it — a null page id, no confirmation', async () => {
    api.updatePin.mockImplementation(async (id) => ({ ...(PINS.find((p) => p.id === id) as Pin), page_id: null }));
    const confirm = vi.spyOn(window, 'confirm');
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sales from page' }));
    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(1));
    expect(api.updatePin.mock.calls[0]).toEqual(['p1', { page_id: null }]);
    expect(api.deletePin).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('ordering', () => {
  it('moves a pin up or down relationally, and disables the ends', async () => {
    api.updatePin.mockImplementation(async (id) => PINS.find((p) => p.id === id) as Pin);
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Drink Mix' });

    const salesUp = screen.getByRole('button', { name: 'Move Sales up' }) as HTMLButtonElement;
    const salesDown = screen.getByRole('button', { name: 'Move Sales down' }) as HTMLButtonElement;
    const mixDown = screen.getByRole('button', { name: 'Move Drink Mix down' }) as HTMLButtonElement;
    expect(salesUp.disabled).toBe(true);        // already first
    expect(mixDown.disabled).toBe(true);        // already last
    expect(salesDown.disabled).toBe(false);

    fireEvent.click(salesDown);
    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(1));
    // "after the next one": a relation, never a number.
    expect(api.updatePin.mock.calls[0]).toEqual(['p1', { place: { after: 'p2' } }]);
    expect(JSON.stringify(api.updatePin.mock.calls[0][1])).not.toMatch(/position/);

    fireEvent.click(screen.getByRole('button', { name: 'Move Drink Mix up' }));
    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(2));
    expect(api.updatePin.mock.calls[1]).toEqual(['p2', { place: { before: 'p1' } }]);
  });
});

describe('deleting', () => {
  it('deletes a pin only after a confirmation that says it is the analysis itself', async () => {
    api.deletePin.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Sales' }));
    expect(confirm.mock.calls[0][0]).toMatch(/Delete “Sales”\?/);
    expect(confirm.mock.calls[0][0]).toMatch(/deletes the saved analysis itself/);
    await waitFor(() => expect(api.deletePin).toHaveBeenCalledWith('p1'));
  });

  it('deletes the PAGE only after saying its pins move to Ungrouped, then goes to the list', async () => {
    pagesApi.deletePage.mockResolvedValue({ id: 'p-ffr', title: 'FFR Overview', pins_ungrouped: 2 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }));
    expect(confirm.mock.calls[0][0]).toMatch(/Delete the page “FFR Overview”\?/);
    expect(confirm.mock.calls[0][0]).toMatch(/2 analyses move to Ungrouped; nothing is deleted/);
    await waitFor(() => expect(pagesApi.deletePage).toHaveBeenCalledWith('p-ffr'));
    expect(await screen.findByText('All pages, listed')).toBeTruthy();
    expect(api.deletePin).not.toHaveBeenCalled();
  });
});

describe('renaming the page', () => {
  it('goes through the page’s own route, by id, and leaves the URL alone', async () => {
    pagesApi.updatePage.mockResolvedValue({ ...FFR, title: 'Fame' });
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Page name') as HTMLInputElement;
    expect(input.value).toBe('FFR Overview');
    fireEvent.change(input, { target: { value: 'Fame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(pagesApi.updatePage).toHaveBeenCalledTimes(1));
    expect(pagesApi.updatePage.mock.calls[0]).toEqual(['p-ffr', { title: 'Fame', allow_similar_page: false }]);
    // Still the same page: the pins are not re-listed under a name.
    expect(api.listPins.mock.calls.every(([p]) => p === 'p-ffr')).toBe(true);
  });

  it('does nothing when the name is unchanged', async () => {
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(pagesApi.updatePage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
  });

  it('edits the purpose in place, and clears it by saving it empty', async () => {
    pagesApi.updatePage.mockResolvedValue({ ...FFR, purpose: null });
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Edit purpose' }));
    const input = screen.getByLabelText('Page purpose') as HTMLInputElement;
    expect(input.value).toBe('Watch the fast-food range.');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(pagesApi.updatePage).toHaveBeenCalledTimes(1));
    expect(pagesApi.updatePage.mock.calls[0]).toEqual(['p-ffr', { purpose: null }]);
  });
});

describe('asking George from the page', () => {
  it('sits at the foot, and asks about the page rather than claiming to have read it', async () => {
    mount();
    const last = await screen.findByRole('heading', { level: 3, name: 'Drink Mix' });
    const box = screen.getByLabelText('Ask George about this page…');
    expect(last.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends the question with the page’s identity as scope and its title as words, and moves to Ask', async () => {
    george.ask.mockResolvedValue(undefined);
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });

    const box = screen.getByLabelText('Ask George about this page…');
    fireEvent.change(box, { target: { value: 'Which of these is falling?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(george.reset).toHaveBeenCalledTimes(1);
    expect(george.ask).toHaveBeenCalledTimes(1);
    const [question, options] = george.ask.mock.calls[0];
    expect(question).toBe('Which of these is falling?');
    expect(options?.pageContext).toBe('Pages / FFR Overview');
    expect(options?.pageContext).not.toMatch(/Sales|Drink Mix|118|pin|result/);
    // The scope is the page's IDENTITY, with the title beside it for the
    // indicator — and it, too, carries nothing of what is on the page.
    expect(options?.pageScope).toEqual({ page_id: 'p-ffr', title: 'FFR Overview' });
    expect(JSON.stringify(options)).not.toMatch(/Sales|Drink Mix|118|result/);

    expect(await screen.findByText('Ask, with the question on its way')).toBeTruthy();
  });

  it('sends the ungrouped page as the null scope, never as a name', async () => {
    george.ask.mockResolvedValue(undefined);
    mount(null, [pin('p9', 'Loose', null)]);
    await screen.findByRole('heading', { level: 3, name: 'Loose' });

    const box = screen.getByLabelText('Ask George about this page…');
    fireEvent.change(box, { target: { value: 'What is here?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    const [, options] = george.ask.mock.calls[0];
    expect(options?.pageScope).toEqual({ page_id: null, title: null });
    expect(options?.pageContext).toBe('Pages / Ungrouped');
  });
});
