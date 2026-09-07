/**
 * The Pin dialog, as rendered output.
 *
 * THE PROPERTIES UNDER TEST: the page is chosen from the person's real pages
 * plus a new name plus none; a pin goes where it was told; the confirmation
 * says where it went and links there; and a case-only collision is a choice
 * the person makes, never a silent merge or fork.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatePinRequest, Pin, PinPage, PinToolCall } from '../../types/pins';

const listPinPages = vi.fn<() => Promise<PinPage[]>>();
const createPin = vi.fn<(body: CreatePinRequest) => Promise<Pin>>();
vi.mock('../../services/pinsApi', () => ({
  listPinPages: () => listPinPages(),
  createPin: (body: CreatePinRequest) => createPin(body),
  similarPageConflict: (err: unknown) =>
    (err as { conflict?: unknown } | null)?.conflict ?? null,
  errorMessage: (err: unknown) => String((err as { message?: unknown })?.message ?? err),
}));

const { PinButton } = await import('./PinButton');

afterEach(() => {
  cleanup();
  listPinPages.mockReset();
  createPin.mockReset();
});

const CALLS: PinToolCall[] = [{ tool: 'get_sales', arguments: { metric: 'net_sales' } }];

const stored = (page: string | null): Pin => ({
  id: 'pin-1',
  title: 'How is Fame doing?',
  question: 'How is Fame doing?',
  page,
  conversation_id: 'conv-1',
  tool_calls: [{ tool: 'get_sales', arguments: { metric: 'net_sales' } }],
  created_at: '2026-09-07T09:00:00+08:00',
  last_run_at: null,
  last_ok_at: null,
  last_status: null,
});

function mount() {
  listPinPages.mockResolvedValue([
    { page: 'Fame', pins: 2 },
    { page: 'Purchasing', pins: 1 },
    { page: null, pins: 3 },
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PinButton calls={CALLS} question="How is Fame doing?" conversationId="conv-1" />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /^Pin$/ }));
  await screen.findByRole('dialog', { name: 'Pin this answer' });
  await screen.findByLabelText('Fame');
}

describe('choosing a page', () => {
  it('offers the person’s real pages, a new page, and none — not the ungrouped marker', async () => {
    mount();
    await openDialog();
    expect(screen.getByLabelText('No page')).toBeTruthy();
    expect(screen.getByLabelText('Fame')).toBeTruthy();
    expect(screen.getByLabelText('Purchasing')).toBeTruthy();
    expect(screen.getByLabelText('New page')).toBeTruthy();
    expect(screen.queryByLabelText('Ungrouped')).toBeNull();
  });

  it('says it is checking before the pages have loaded, not that there are none', async () => {
    listPinPages.mockReturnValue(new Promise(() => {}));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <PinButton calls={CALLS} question="q" conversationId="conv-1" />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Pin$/ }));
    expect(await screen.findByText('Checking your pages…')).toBeTruthy();
  });

  it('will not pin to a new page with no name', async () => {
    mount();
    await openDialog();
    fireEvent.click(screen.getByLabelText('New page'));
    const pinButton = screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLButtonElement;
    expect(pinButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('New page name'), { target: { value: 'Drink Mix' } });
    expect(pinButton.disabled).toBe(false);
  });
});

describe('pinning', () => {
  it('sends the chosen page and reports where the pin went, with a way there', async () => {
    createPin.mockResolvedValue(stored('Fame'));
    mount();
    await openDialog();
    fireEvent.click(screen.getByLabelText('Fame'));
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);

    await screen.findByText(/Pinned/);
    expect(createPin).toHaveBeenCalledTimes(1);
    const body = createPin.mock.calls[0][0];
    expect(body.page).toBe('Fame');
    expect(body.tool_calls).toEqual([{ tool: 'get_sales', arguments: { metric: 'net_sales' } }]);
    expect(body.conversation_id).toBe('conv-1');

    expect(screen.getByText('Fame')).toBeTruthy();
    const open = screen.getByRole('link', { name: 'Open' }) as HTMLAnchorElement;
    expect(open.getAttribute('href')).toBe('/pages?p=Fame');
  });

  it('sends a new page as a name — the page exists because the pin does', async () => {
    createPin.mockResolvedValue(stored('Drink Mix'));
    mount();
    await openDialog();
    fireEvent.click(screen.getByLabelText('New page'));
    fireEvent.change(screen.getByLabelText('New page name'), { target: { value: 'Drink Mix' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);
    await screen.findByText(/Pinned/);
    expect(createPin.mock.calls[0][0].page).toBe('Drink Mix');
  });

  it('sends no page for none, and says so', async () => {
    createPin.mockResolvedValue(stored(null));
    mount();
    await openDialog();
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);
    await screen.findByText(/with no page/);
    expect(createPin.mock.calls[0][0].page).toBeUndefined();
    expect((screen.getByRole('link', { name: 'Open' }) as HTMLAnchorElement).getAttribute('href'))
      .toBe('/pages?p=~');
  });

  it('turns a case-only collision into a choice rather than deciding it', async () => {
    createPin.mockRejectedValueOnce({
      conflict: {
        message: 'You already have a page called Fame.',
        existing_page: 'Fame',
        submitted_page: 'fame',
      },
    });
    createPin.mockResolvedValueOnce(stored('Fame'));
    mount();
    await openDialog();
    fireEvent.click(screen.getByLabelText('New page'));
    fireEvent.change(screen.getByLabelText('New page name'), { target: { value: 'fame' } });
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);

    await screen.findByText('You already have a page called Fame.');
    expect(screen.getByRole('button', { name: /Keep both/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Use “Fame”/ }));
    await waitFor(() => expect((screen.getByLabelText('Fame') as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);
    await screen.findByText(/Pinned/);
    expect(createPin.mock.calls[1][0].page).toBe('Fame');
    expect(createPin.mock.calls[1][0].allow_similar_page).toBe(false);
  });

  it('wears no approvals colour anywhere in the dialog', async () => {
    const { container } = mount();
    await openDialog();
    expect(container.innerHTML).not.toMatch(/george-accent/);
  });
});
