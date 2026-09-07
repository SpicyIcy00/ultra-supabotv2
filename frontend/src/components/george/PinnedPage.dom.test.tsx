/**
 * A page, as rendered output.
 *
 * THE PROPERTIES UNDER TEST: the page is a document with quiet controls —
 * Rename beside the title, Move and Remove beside each section — and a
 * composer at its foot that hands the question to George with the page's
 * NAME and nothing else. A move sends the label only; a rename goes through
 * the one rename call; nothing here re-runs a pin because its membership
 * changed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageRenameResult, Pin, PinPage, PinRun, UpdatePinRequest } from '../../types/pins';

const api = {
  listPins: vi.fn<(page?: string | null) => Promise<Pin[]>>(),
  listPinPages: vi.fn<() => Promise<PinPage[]>>(),
  updatePin: vi.fn<(id: string, body: UpdatePinRequest) => Promise<Pin>>(),
  renamePage: vi.fn<(page: string, name: string, allow?: boolean) => Promise<PageRenameResult>>(),
  deletePin: vi.fn<(id: string) => Promise<void>>(),
  runPin: vi.fn<(id: string) => Promise<PinRun>>(),
};
vi.mock('../../services/pinsApi', () => ({
  listPins: (p?: string | null) => api.listPins(p),
  listPinPages: () => api.listPinPages(),
  updatePin: (id: string, b: UpdatePinRequest) => api.updatePin(id, b),
  renamePage: (p: string, n: string, a?: boolean) => api.renamePage(p, n, a),
  deletePin: (id: string) => api.deletePin(id),
  runPin: (id: string) => api.runPin(id),
  similarPageConflict: () => null,
  errorMessage: (e: unknown) => String(e),
}));

const george = {
  ask: vi.fn<(q: string, o?: { pageContext?: string | null; pageScope?: { name: string | null } | null }) => Promise<void>>(),
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
  george.ask.mockReset();
  george.reset.mockReset();
});

const pin = (id: string, title: string, page: string | null): Pin => ({
  id,
  title,
  question: title,
  page,
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

const PINS = [pin('p1', 'Sales', 'FFR Overview'), pin('p2', 'Drink Mix', 'FFR Overview')];

function mount(page: string | null = 'FFR Overview', pins: Pin[] = PINS) {
  api.listPins.mockResolvedValue(pins.filter((p) => p.page === page));
  api.listPinPages.mockResolvedValue([
    { page: 'FFR Overview', pins: 2 },
    { page: 'Purchasing', pins: 1 },
  ]);
  api.runPin.mockImplementation(async (id) => okRun(PINS.find((p) => p.id === id) as Pin));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/pages?p=FFR%20Overview']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/pages" element={<PinnedPage page={page} onBack={() => {}} />} />
          <Route path="/ask" element={<p>Ask, with the question on its way</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('the document', () => {
  it('reads as a page: a title, quiet controls, then each pin as a section', async () => {
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'FFR Overview' })).toBeTruthy();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    expect(screen.getByRole('heading', { level: 3, name: 'Drink Mix' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Move / })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Refresh' })).toHaveLength(2);
  });

  it('offers no Rename for the ungrouped pins, which are not a page anyone named', async () => {
    mount(null, [pin('p3', 'Loose', null)]);
    await screen.findByRole('heading', { level: 3, name: 'Loose' });
    expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
  });

  it('wears no approvals colour', async () => {
    const { container } = mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });
});

describe('moving a pin', () => {
  it('sends only the new page, and null for “No page”', async () => {
    api.updatePin.mockImplementation(async (id, body) => ({
      ...(PINS.find((p) => p.id === id) as Pin),
      page: body.page ?? null,
    }));
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });

    fireEvent.click(screen.getByRole('button', { name: 'Move Sales' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move Sales' });
    await within(dialog).findByLabelText('Purchasing');

    // Where it already is: nothing to do, and the control says so.
    const move = within(dialog).getByRole('button', { name: /^Move$/ }) as HTMLButtonElement;
    expect((within(dialog).getByLabelText('FFR Overview') as HTMLInputElement).checked).toBe(true);
    expect(move.disabled).toBe(true);

    fireEvent.click(within(dialog).getByLabelText('No page'));
    expect(move.disabled).toBe(false);
    fireEvent.click(move);

    await waitFor(() => expect(api.updatePin).toHaveBeenCalledTimes(1));
    expect(api.updatePin.mock.calls[0]).toEqual(['p1', { page: null, allow_similar_page: false }]);
    // A move is not a refresh: the pin ran once, on mount, and not again.
    expect(api.runPin.mock.calls.filter(([id]) => id === 'p1')).toHaveLength(1);
  });

  it('can move a pin to a page that does not exist yet', async () => {
    api.updatePin.mockImplementation(async (id, body) => ({
      ...(PINS.find((p) => p.id === id) as Pin),
      page: body.page ?? null,
    }));
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
    expect(api.updatePin.mock.calls[0][1].page).toBe('Beverages');
  });
});

describe('renaming the page', () => {
  it('goes through the one rename call with the page and the new name', async () => {
    api.renamePage.mockResolvedValue({ page: 'Fame', pins_moved: 2 });
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Page name') as HTMLInputElement;
    expect(input.value).toBe('FFR Overview');
    fireEvent.change(input, { target: { value: 'Fame' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.renamePage).toHaveBeenCalledTimes(1));
    expect(api.renamePage.mock.calls[0]).toEqual(['FFR Overview', 'Fame', false]);
  });

  it('does nothing when the name is unchanged', async () => {
    mount();
    await screen.findByRole('heading', { level: 3, name: 'Sales' });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.renamePage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Rename' })).toBeTruthy();
  });
});

describe('asking George from the page', () => {
  it('sits at the foot, and asks about the page rather than claiming to have read it', async () => {
    mount();
    const last = await screen.findByRole('heading', { level: 3, name: 'Drink Mix' });
    const box = screen.getByLabelText('Ask George about this page…');
    expect(last.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends the question with the page’s identity as context, and moves to Ask', async () => {
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
    // The context names the page. It carries none of what is on it.
    expect(options?.pageContext).not.toMatch(/Sales|Drink Mix|118|pin|result/);
    // The scope is the page's identity, which is what lets George read it —
    // and it, too, carries nothing of what is on the page.
    expect(options?.pageScope).toEqual({ name: 'FFR Overview' });
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
    expect(options?.pageScope).toEqual({ name: null });
    expect(options?.pageContext).toBe('Pages / Ungrouped');
  });
});
