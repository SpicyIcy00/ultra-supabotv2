// @vitest-environment jsdom
/**
 * W2.2's done-when, on the page a person decides from: a draft over the line
 * arrives as a decision — the approvals colour, Approve · Change · Look into
 * it — and one under it waits in the list quietly, with no accent and no
 * decision's buttons. "Look into it" asks Bob; Approve decides through the
 * server.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AuthorityState, DraftRequest, Viewer } from '../types/authority';
import InboxPage from './InboxPage';

const ask = vi.fn();
vi.mock('../hooks/useBob', () => ({
  useBob: () => ({ ask, reset: vi.fn(), busy: false }),
}));
vi.mock('../room/RoomShell', () => ({
  RoomHead: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('../services/workflowsApi', () => ({
  listApprovals: async () => [],
  promoteVersion: vi.fn(),
}));
const decide = vi.fn();
let requests: DraftRequest[] = [];
let viewer: Viewer;
vi.mock('../services/authorityApi', () => ({
  listRequests: async () => ({ requests, viewer }),
  getAuthority: async (): Promise<AuthorityState> => ({
    line: { rule: 'purchase_drafts', version: 2, mode: 'over_line', line_php: 20000,
            said: "You don't need my approval unless it's above ₱20,000.", set_by: 'Joy',
            set_at: '2026-09-22T01:00:00Z', means: 'Drafts over ₱20,000 are a decision.' },
    line_means: 'Drafts over ₱20,000 are a decision; at or under it they land in the list quietly.',
    history: [], viewer,
    people: [{ person: 'joy', name: 'Joy', role: 'approver', says: 'the final approver',
               businesses: ['aji_ichiban'], linked: true, username: 'joy' }],
    assumption: 'Joy approves.', keyed_into: 'StoreHub',
  }),
  decideRequest: (...a: unknown[]) => decide(...a),
  setLine: vi.fn(), linkPerson: vi.fn(),
}));
vi.mock('../stores/authStore', () => ({
  useAuthStore: (pick: (s: { isAdmin: () => boolean }) => unknown) => pick({ isAdmin: () => false }),
}));
afterEach(() => { cleanup(); ask.mockReset(); decide.mockReset(); });

function draft(over: Partial<DraftRequest>): DraftRequest {
  return {
    id: 'r', title: 'Reorder — AJI BARN', status: 'waiting', routed: 'list',
    routed_because: 'why', value_php: 1, value: '₱1', order_lines: 1, unpriced_lines: 0,
    moves: 0, line_php: 20000, requested_by: 'Daniel', note: null,
    created_at: '2026-09-22T01:00:00Z', snapshot_timestamp: '2026-09-22T01:00:00Z',
    decided_by: null, decided_at: null, decision_note: null, replaces: null,
    source_call: { tool: 'get_stock_cover', arguments: { view: 'draft' } },
    lines: [{ product_id: 'p1', sku: 'A1', product: 'Aji Mix', quantity: 10, unit_cost: 12,
              line_value: 120 }],
    ...over,
  };
}

const JOY: Viewer = { username: 'joy', person: 'joy', name: 'Joy', role: 'approver',
  may_approve: true, may_set_line: true, may_link_people: false, sees_all: true };

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inbox']}><InboxPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Needs you — drafts', () => {
  it('draws the over-the-line draft as a decision and the under-the-line one quietly', async () => {
    viewer = JOY;
    requests = [
      draft({ id: 'over', title: 'Reorder — AJI BARN', routed: 'decision', value: '₱55,342.60',
              routed_because: '9 order lines worth ₱55,342.60 — over the ₱20,000 line (version 2).' }),
      draft({ id: 'under', title: 'Order from Seikyo — 14 days\' cover', routed: 'list', value: '₱8,100',
              routed_because: '4 order lines worth ₱8,100 — at or under the ₱20,000 line (version 2).' }),
    ];
    const { container } = page();
    await screen.findByText(/over the ₱20,000 line/);
    const items = Array.from(container.querySelectorAll('li.r-item'));
    const over = items.find((li) => li.textContent?.includes('₱55,342.60'))!;
    const under = items.find((li) => li.textContent?.includes('₱8,100'))!;

    expect(over.querySelector('.r-chip--needs')).not.toBeNull();
    const o = within(over as HTMLElement);
    expect(o.getByRole('button', { name: 'Approve' }).className).toBe('r-do');
    o.getByRole('button', { name: 'Change' });
    o.getByRole('button', { name: 'Look into it' });

    expect(under.querySelector('.r-chip--needs')).toBeNull();
    expect(under.querySelector('.r-do')).toBeNull();
    expect(within(under as HTMLElement).queryByRole('button', { name: 'Look into it' })).toBeNull();
    expect(within(under as HTMLElement).getByRole('button', { name: 'Approve' }).className).toBe('r-act');
  });

  it('asks Bob to look into it, and approves through the server', async () => {
    viewer = JOY;
    requests = [draft({ id: 'over', routed: 'decision', value: '₱55,342.60' })];
    decide.mockResolvedValue({});
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Look into it' }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(String(ask.mock.calls[0][0])).toContain('Reorder — AJI BARN');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith('over', 'approve', { quantities: undefined }));
  });

  it('shows a person who cannot decide what is waiting and on whom', async () => {
    viewer = { ...JOY, username: 'daniel', person: 'daniel', name: 'Daniel', role: 'requester',
               may_approve: false, may_set_line: false, sees_all: false };
    requests = [draft({ id: 'over', routed: 'decision' })];
    page();
    await screen.findByText('Waiting on Joy.');
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    screen.getByRole('button', { name: 'Look into it' });
  });
});
