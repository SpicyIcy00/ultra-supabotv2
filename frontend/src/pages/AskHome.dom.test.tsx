/**
 * Ask is the home of the work, and Today is not — held against the pages.
 *
 * The API is mocked at the service boundary and nothing else: the pages, the
 * hooks, the merge, the work-unit builders and the renderer all run for real.
 * What is asserted is what the brief's acceptance tests ask for: the root of
 * Ask REQUESTS persisted work and draws it through the one renderer; a remount
 * (navigating away and back) draws it again from the same request, not from
 * anything the client kept; the deep link folds the focused thread in; and
 * Today reads the other stream, invents nothing, and has no composer.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../types/river';
import { GeorgeStreamProvider } from '../components/george/GeorgeStreamProvider';

const readRiver = vi.fn();
const readThread = vi.fn();
vi.mock('../services/riverApi', () => ({
  readRiver: (...a: unknown[]) => readRiver(...a),
  readThread: (...a: unknown[]) => readThread(...a),
  sharePost: vi.fn(),
}));
vi.mock('../services/chatsApi', () => ({
  getChat: vi.fn(async () => { throw Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }); }),
  listChats: vi.fn(async () => []),
}));
vi.mock('../services/pagesApi', () => ({ listPages: vi.fn(async () => []) }));
vi.mock('../services/statusApi', () => ({ readStatus: vi.fn(async () => ({ sources: [] })) }));
// The status band is its own component with its own suite; here it would
// only need a full status payload it is not the point of these tests to shape.
vi.mock('../components/george/StatusBand', () => ({ StatusBand: () => null }));
vi.mock('../services/workflowsApi', () => ({ listApprovals: vi.fn(async () => []) }));
vi.mock('axios', async (orig) => {
  const actual = await orig<typeof import('axios')>();
  return { ...actual, default: actual.default, isAxiosError: (e: unknown) => Boolean((e as { isAxiosError?: boolean })?.isAxiosError) };
});

import AskPage from './AskPage';
import TodayPage from './TodayPage';

afterEach(cleanup);
beforeEach(() => {
  readRiver.mockReset();
  readThread.mockReset();
});

const META = { source_table: 'new_transactions', filters_applied: [], snapshot_timestamp: '2026-09-08T02:00:00+08:00',
  window: { kind: 'preset', name: 'last_week', start: '2026-08-31', end: '2026-09-07' } };
const post = (id: string, over: Partial<Post>): Post => ({
  id, thread_id: 't-opus', parent_id: null, kind: 'answer', author: 'george', author_user: null, visibility: 'private',
  owner_user: 'ice', mine: true, body: 'OPUS took ₱555,147 last week.', conversation_id: id,
  created_at: '2026-09-08T02:00:01+08:00', notices: [], receipts: META, payload: null, ...over,
} as Post);
const OPUS = [
  post('q1', { kind: 'question', author: 'user', author_user: 'ice', body: 'How did OPUS do last week?', receipts: null, created_at: '2026-09-08T02:00:00+08:00' }),
  post('a1', {}),
];

function mount(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter initialEntries={[path]}><GeorgeStreamProvider>
      <Routes>
        <Route path="/ask" element={<AskPage />} />
        <Route path="/ask/:threadId" element={<AskPage />} />
        <Route path="/today" element={<TodayPage />} />
      </Routes>
    </GeorgeStreamProvider></MemoryRouter></QueryClientProvider>,
  );
}

describe('/ask is the home of the work', () => {
  it('requests the persisted work stream and draws it through the one renderer', async () => {
    readRiver.mockResolvedValue({ posts: OPUS, before: null });
    readThread.mockResolvedValue(OPUS);
    const { container } = mount('/ask');
    await screen.findByText('OPUS took ₱555,147 last week.');
    expect(readRiver).toHaveBeenCalledWith(null, undefined, 'work');
    expect(container.querySelector('[data-intent]')!.textContent).toContain('How did OPUS do last week?');
    expect(container.querySelectorAll('[data-work]')).toHaveLength(1);
  });

  it('reconstructs the same work after a remount — navigating away and back keeps nothing', async () => {
    readRiver.mockResolvedValue({ posts: OPUS, before: null });
    readThread.mockResolvedValue(OPUS);
    const first = mount('/ask');
    await screen.findByText('OPUS took ₱555,147 last week.');
    first.unmount();
    expect(screen.queryByText('OPUS took ₱555,147 last week.')).toBeNull();
    mount('/ask');
    await screen.findByText('OPUS took ₱555,147 last week.');
    // A second, independent request — nothing on the client was the source.
    expect(readRiver.mock.calls.filter((c) => c[2] === 'work').length).toBeGreaterThanOrEqual(2);
  });

  it('says so, truthfully, when there is no work yet — and offers no thread list', async () => {
    readRiver.mockResolvedValue({ posts: [], before: null });
    const { container } = mount('/ask');
    await screen.findByText('Ask anything.');
    expect(container.textContent).not.toContain('Recent');
    expect(screen.getByLabelText('What do you want to work on?')).toBeTruthy();
  });

  it('folds a focused thread into the river and marks nothing else', async () => {
    const older = [
      post('q0', { thread_id: 't-old', kind: 'question', author: 'user', body: 'How did Shang do?', receipts: null, created_at: '2026-09-01T02:00:00+08:00' }),
      post('a0', { thread_id: 't-old', body: 'Shang took ₱41,242.', created_at: '2026-09-01T02:00:01+08:00' }),
    ];
    readRiver.mockResolvedValue({ posts: OPUS, before: null });
    readThread.mockImplementation(async (id: string) => (id === 't-old' ? older : OPUS));
    const { container } = mount('/ask/t-old');
    await screen.findByText('Shang took ₱41,242.');
    // The rest of the permitted river is still there, in time order.
    expect(screen.getByText('OPUS took ₱555,147 last week.')).toBeTruthy();
    const ids = [...container.querySelectorAll('[data-entry-id]')].map((e) => e.getAttribute('data-entry-id'));
    expect(ids).toEqual(['q0', 'a0', 'q1', 'a1']);
    expect(readThread).toHaveBeenCalledWith('t-old');
  });

  it('keeps a foreign thread a 404 and still shows the viewer their own work', async () => {
    readRiver.mockResolvedValue({ posts: OPUS, before: null });
    readThread.mockImplementation(async (id: string) => {
      if (id === 't-theirs') throw Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } });
      return OPUS;
    });
    mount('/ask/t-theirs');
    await screen.findByText('That work isn’t available.');
    expect(screen.getByText('OPUS took ₱555,147 last week.')).toBeTruthy();
    // Nothing from the foreign thread, because nothing came back for it.
    expect(readThread).toHaveBeenCalledWith('t-theirs');
  });
});

describe('/today is where George comes to you', () => {
  it('reads the attention stream, never the work, and offers no composer', async () => {
    readRiver.mockResolvedValue({ posts: [], before: null });
    const { container } = mount('/today');
    await screen.findByText('Good morning.');
    expect(readRiver).toHaveBeenCalledWith(null, undefined, 'attention');
    expect(readRiver.mock.calls.some((c) => c[2] === 'work')).toBe(false);
    expect(container.querySelector('textarea')).toBeNull();
    expect(screen.getByText('Ask George')).toBeTruthy();
  });

  it('fabricates nothing when the record is empty', async () => {
    readRiver.mockResolvedValue({ posts: [], before: null });
    const { container } = mount('/today');
    await screen.findByText('Good morning.');
    expect(container.textContent).not.toMatch(/OPUS|Rockwell|₱/);
  });
});
