/**
 * A stored answer, as rendered output — and what it may offer.
 *
 * THE PROPERTY UNDER TEST: a Pin appears on a stored answer only when the
 * post carries the calls behind it exactly as they ran, and pinning it sends
 * those calls and nothing else. A post from before the calls were stored
 * still draws its figures with their receipts, and offers no Pin — never a
 * Pin built from the rows, the meta or the prose.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreatePinRequest, Pin, PinPage } from '../../types/pins';
import type { Post } from '../../types/river';

const listPinPages = vi.fn<() => Promise<PinPage[]>>();
const createPin = vi.fn<(body: CreatePinRequest) => Promise<Pin>>();
vi.mock('../../services/pinsApi', () => ({
  listPinPages: () => listPinPages(),
  createPin: (body: CreatePinRequest) => createPin(body),
  similarPageConflict: () => null,
  errorMessage: (e: unknown) => String(e),
}));

const { PostCard } = await import('./PostCard');

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= StubResizeObserver as unknown as typeof ResizeObserver;

afterEach(() => {
  cleanup();
  listPinPages.mockReset();
  createPin.mockReset();
});

const META = {
  source_table: 'new_transactions',
  filters_applied: ['t.is_cancelled = false   # metrics.yaml: filters.cancelled'],
  snapshot_timestamp: '2026-09-07T09:00:00+08:00',
  metric_unit: 'PHP',
};

const ARGS = { metric: 'net_sales', group_by: 'store', date_range: 'last_7_days' };

const CHARTED = [
  { seq: 3, tool: 'get_sales', arguments: ARGS, rows: [{ store: 'Fame', value: 118420 }], meta: META },
];

function answer(payload: Record<string, unknown> | null): Post {
  return {
    id: 'a-1',
    thread_id: 't-1',
    parent_id: 'q-1',
    kind: 'answer',
    author: 'george',
    author_user: null,
    owner_user: 'ice',
    visibility: 'private',
    mine: true,
    body: 'Fame took ₱118,420 this week.',
    payload,
    receipts: META,
    notices: [],
    conversation_id: 'conv-1',
    created_at: '2026-09-07T09:00:05+08:00',
  } as Post;
}

function mount(post: Post, question?: string) {
  listPinPages.mockResolvedValue([]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <PostCard post={post} question={question} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('a stored answer that kept its calls', () => {
  it('offers Pin', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales', arguments: ARGS }] }));
    expect(screen.getByRole('button', { name: /^Pin$/ })).toBeTruthy();
  });

  it('pins exactly the stored calls, with the question as the title', async () => {
    createPin.mockResolvedValue({
      id: 'pin-1', title: 'How is Fame doing?', question: 'How is Fame doing?', page: null,
      page_id: null, position: 0, conversation_id: 'conv-1', tool_calls: [{ tool: 'get_sales', arguments: ARGS }],
      created_at: '2026-09-07T09:01:00+08:00', last_run_at: null, last_ok_at: null,
      last_status: null,
    });
    mount(
      answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales', arguments: ARGS }] }),
      'How is Fame doing?',
    );
    fireEvent.click(screen.getByRole('button', { name: /^Pin$/ }));
    await screen.findByRole('dialog', { name: 'Pin this answer' });
    fireEvent.click(screen.getAllByRole('button', { name: /^Pin$/ }).at(-1) as HTMLElement);

    await waitFor(() => expect(createPin).toHaveBeenCalledTimes(1));
    const body = createPin.mock.calls[0][0];
    expect(body.tool_calls).toEqual([{ tool: 'get_sales', arguments: ARGS }]);
    expect(body.question).toBe('How is Fame doing?');
    expect(body.conversation_id).toBe('conv-1');
  });
});

describe('a legacy post, from before the calls were stored', () => {
  it('still draws its figures with their receipts', () => {
    mount(answer({ charted: [{ seq: 3, tool: 'get_sales', rows: CHARTED[0].rows, meta: META }] }));
    expect(screen.getByText('₱118,420')).toBeTruthy();
    // The read time is always visible (UI rule 6); the source table is one tap
    // down with the filters that cite it (UI rule 3), since 2026-09-08.
    expect(screen.getByText(/read /)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /read/ })[0]);
    expect(document.body.textContent).toMatch(/new_transactions/);
  });

  it('offers no Pin — a call rebuilt from the rows would be invented', () => {
    mount(answer({ charted: [{ seq: 3, tool: 'get_sales', rows: CHARTED[0].rows, meta: META }] }));
    expect(screen.queryByRole('button', { name: /^Pin$/ })).toBeNull();
  });

  it('offers no Pin when the payload is empty', () => {
    mount(answer(null));
    expect(screen.queryByRole('button', { name: /^Pin$/ })).toBeNull();
  });
});

describe('a post whose calls are incomplete', () => {
  it('offers no Pin when a call has no arguments', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales' }] }));
    expect(screen.queryByRole('button', { name: /^Pin$/ })).toBeNull();
    // The figure itself is still there; only the action is withheld.
    expect(screen.getByText('₱118,420')).toBeTruthy();
  });

  it('offers no Pin when a drawn result has no call behind it', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 9, tool: 'get_sales', arguments: ARGS }] }));
    expect(screen.queryByRole('button', { name: /^Pin$/ })).toBeNull();
  });
});

describe('a stored answer that read a page', () => {
  const PAGE_CONTEXT = {
    page: 'AJI BARN Reorder', read_at: '2026-09-07T09:00:00+08:00', figures: true,
    pins_total: 6, pins_inspected: 5, pins_reproduced: 5,
    pins: [{ pin_id: 'p1', title: 'Dead at retail', status: 'ok', reason: null,
      calls: [{ tool: 'get_dead_stock', arguments: {} }],
      snapshot_timestamp: '2026-09-07T08:55:00+08:00', notice_kinds: [] }],
    not_inspected: [{ pin_id: 'p6', title: 'Cost history' }], unavailable: [],
    partial: false, truncated: true, rows_dropped: 0, notice_kinds: ['page_context_truncated'],
  };

  it('says what George considered, from what he recorded', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales', arguments: ARGS }],
      page_context: PAGE_CONTEXT }));
    expect(screen.getByText('Read 5 of 6 saved analyses · 1 not inspected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Read 5 of 6/ }));
    expect(screen.getByText('Dead at retail')).toBeTruthy();
    expect(screen.getByText('Cost history')).toBeTruthy();
  });

  it('still offers Pin for the figures it charted, and never for the page read', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales', arguments: ARGS }],
      page_context: PAGE_CONTEXT }));
    expect(screen.getByRole('button', { name: /^Pin$/ })).toBeTruthy();
  });

  it('shows no page context on an answer that read no page', () => {
    mount(answer({ charted: CHARTED, calls: [{ seq: 3, tool: 'get_sales', arguments: ARGS }] }));
    expect(screen.queryByText(/saved analys/)).toBeNull();
  });
});
