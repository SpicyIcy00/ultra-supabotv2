/**
 * UNDERSTAND, on screen: the four dogfood failures that only a mounted desk
 * can prove closed.
 *
 *   continuity   the desk OPENS the thread, so George has a memory of it
 *   presence     the instruction shows at once and the workspace never blanks
 *   composer     a question is never refused because a turn is running
 *   time         a window label never appears over figures read for another
 *
 * The stream is a mutable fake rather than a fixed object, because three of
 * these are about what the desk does WHILE a turn is in flight, and a hook
 * that can only be at rest cannot express that.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '../../types/river';

const readRiver = vi.fn();
const readThread = vi.fn();
const getChat = vi.fn();
const replayCalls = vi.fn();
const asked: { question: string; options: Record<string, unknown> }[] = [];
const opened: { turns: unknown[]; thread: string | null }[] = [];

/** The live stream, as a test may set it turn by turn. */
const stream = {
  turns: [] as Record<string, unknown>[],
  busy: false,
  threadId: null as string | null,
  running: [] as { tool: string; arguments: Record<string, unknown> }[],
  completed: [] as { tool: string; arguments: Record<string, unknown> }[],
};

vi.mock('../../services/riverApi', () => ({
  readRiver: (...a: unknown[]) => readRiver(...a),
  readThread: (...a: unknown[]) => readThread(...a),
  sharePost: vi.fn(),
}));
vi.mock('../../services/chatsApi', () => ({
  getChat: (...a: unknown[]) => getChat(...a),
  listChats: vi.fn(async () => []),
}));
vi.mock('../../services/workflowsApi', () => ({
  listApprovals: vi.fn(async () => []), listWorkflows: vi.fn(async () => []),
}));
vi.mock('../../services/pinsApi', () => ({ listPins: vi.fn(async () => []), errorMessage: String }));
vi.mock('../../services/greetingApi', () => ({
  getGreeting: vi.fn(async () => ({
    kind: 'item', headline: 'Good morning.', item: null, notices: [],
    meta: {}, blind_sections: [], follow_ups: [],
  })),
}));
vi.mock('../../services/deskApi', () => ({
  readDeskDefinitions: vi.fn(async () => ({
    business: { name: 'Aji Ichiban', short: 'AJI' },
    windows: [
      { name: 'last_week', includes_partial_day: false, closed_alternative: null, relative: {} },
      { name: 'last_month', includes_partial_day: false, closed_alternative: null, relative: {} },
    ],
    window_arguments: { get_sales: 'date_range' },
    rest_reads: [{ tool: 'get_sales', arguments: { group_by: ['store'], date_range: 'last_7_days', compare_to: 'previous_period', metric: 'net_sales' } }],
    selection: { dimensions: ['store', 'product', 'category'], max_subjects: 12, identity: { store: 'store_id', product: 'product_id', category: 'category' } },
    breakdown_dimensions: ['store', 'product', 'category'],
    direct_manipulation: ['select', 'focus', 'clear', 'back', 'change_window', 'sort', 'show_as_list', 'inspect', 'trail'],
    locations: [],
  })),
  replayCalls: (...a: unknown[]) => replayCalls(...a),
}));
vi.mock('../../hooks/useGeorge', () => ({
  useGeorge: () => ({
    turns: stream.turns, state: stream.busy ? 'running' : 'idle',
    presence: stream.busy ? 'running' : 'idle', busy: stream.busy,
    live: {
      running: stream.running, completed: stream.completed,
      lastResult: null, thinking: '', toolResults: stream.completed.length, figures: 0,
    },
    composer: 'idle', setComposer: vi.fn(),
    ask: (question: string, options: Record<string, unknown>) => {
      asked.push({ question, options });
      return Promise.resolve();
    },
    cancel: vi.fn(), reset: vi.fn(),
    open: (turns: unknown[], thread: string | null) => { opened.push({ turns, thread }); },
    threadId: stream.threadId, storedThreadId: null, pageScope: null,
  }),
}));

import DeskPage from '../../pages/DeskPage';
import { chain, headlineSet, PERF, post, question, replayResults } from './deskFixture';

function mount(path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<DeskPage />} />
          <Route path="/w/:threadId" element={<DeskPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const REST = {
  status: 'ok', notices: [], ran_at: '2026-09-09T09:00:00+08:00',
  results: replayResults([chain(0)], { name: 'last_7_days', start: '2026-09-01', end: '2026-09-08' }),
};

function storesWork(): Post[] {
  return [question('q1', 'What’s going on with the stores?', null), post('a1', headlineSet(), PERF())];
}

afterEach(cleanup);
beforeEach(() => {
  readRiver.mockReset(); readThread.mockReset(); getChat.mockReset(); replayCalls.mockReset();
  asked.length = 0; opened.length = 0;
  stream.turns = []; stream.busy = false; stream.threadId = null;
  stream.running = []; stream.completed = [];
  readRiver.mockResolvedValue({ posts: [], before: null });
  readThread.mockResolvedValue([]);
  getChat.mockRejectedValue(Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }));
  replayCalls.mockResolvedValue(REST);
  window.localStorage.clear();
});

/* ------------------------------------------------------------ continuity -- */

describe('1. the desk opens the thread it is on', () => {
  it('loads the stored turns into the stream, so a follow-up has a history', async () => {
    // THE FAILURE: nothing in the desk ever called `open`, so after a reload
    // `ask` sent an empty history, no thread_id and no parent_id — every
    // follow-up silently began a new thread with no memory of the work.
    readThread.mockResolvedValue(storesWork());
    getChat.mockResolvedValue({
      thread_id: 't1', title: 'Stores', question: 'What’s going on with the stores?',
      turns: [
        { role: 'user', text: 'What’s going on with the stores?', at: '2026-09-09T09:00:00+08:00' },
        {
          role: 'george', text: 'Transactions rose across most of the estate.',
          at: '2026-09-09T09:00:05+08:00', tool_calls: [], notices: [], pinned: [],
          done: { thread_id: 't1', conversation_id: 'c1' },
        },
      ],
    });
    mount('/w/t1');
    await waitFor(() => expect(opened).toHaveLength(1));
    expect(opened[0].thread).toBe('t1');
    expect(opened[0].turns.length).toBeGreaterThan(0);
  });

  it('does not open a thread the stream is already on', async () => {
    readThread.mockResolvedValue(storesWork());
    stream.threadId = 't1';
    mount('/w/t1');
    await waitFor(() => expect(readThread).toHaveBeenCalled());
    expect(opened).toHaveLength(0);
  });

  it('never opens while a turn is running — opening cancels one', async () => {
    readThread.mockResolvedValue(storesWork());
    stream.busy = true;
    mount('/w/t1');
    await waitFor(() => expect(readThread).toHaveBeenCalled());
    expect(opened).toHaveLength(0);
  });
});

/* -------------------------------------------------------------- presence -- */

describe('2. the instruction shows at once, and the workspace never blanks', () => {
  it('draws what was just asked before any result has arrived', async () => {
    // THE FAILURE: asking at rest made the live turn the work in focus with
    // no evidence, which composed to `statement` and drew nothing — the whole
    // screen emptied at the moment a person most needs to know they were heard.
    stream.busy = true;
    stream.turns = [
      { role: 'user', text: 'How are we doing?', at: '2026-09-09T10:00:00+08:00' },
      {
        role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
        pinned: [], saved: [], pageChanges: [], at: '2026-09-09T10:00:00+08:00',
      },
    ];
    const { container } = mount('/');
    await waitFor(() => expect(container.querySelector('[data-asked]')).toBeTruthy());
    expect(container.querySelector('[data-asked]')!.textContent).toBe('How are we doing?');
  });

  it('keeps the business on screen while George reads, rather than emptying it', async () => {
    stream.busy = true;
    stream.running = [{ tool: 'get_sales', arguments: { metric: 'net_sales', group_by: ['store'], compare_to: 'previous_period' } }];
    stream.turns = [
      { role: 'user', text: 'How are we doing?', at: '2026-09-09T10:00:00+08:00' },
      {
        role: 'george', text: '', thinking: '', toolCalls: [], notices: [],
        pinned: [], saved: [], pageChanges: [], at: '2026-09-09T10:00:00+08:00',
      },
    ];
    const { container } = mount('/');
    await waitFor(() => expect(container.querySelector('[data-asked]')).toBeTruthy());
    // The resting estate is still drawn: the figures a person was looking at
    // do not vanish because a question was asked about them.
    await waitFor(() =>
      expect(container.querySelectorAll('[data-object], [data-subject]').length).toBeGreaterThan(0));
    // And the work line says what he is doing, in business words.
    const work = container.querySelector('[data-work-line]');
    expect(work).toBeTruthy();
    expect(work!.textContent).not.toMatch(/get_sales|group_by|compare_to/);
  });
});

/* -------------------------------------------------------------- composer -- */

describe('3. a question is never refused because George is busy', () => {
  it('sends while a turn is running', async () => {
    readRiver.mockResolvedValue({ posts: [], before: null });
    stream.busy = true;
    const { container } = mount('/');
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    const box = container.querySelector('textarea')!;
    fireEvent.change(box, { target: { value: 'What about OPUS?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    // THE FAILURE: `submit` returned early while busy and the button became
    // Stop, so a turn that never finished left the composer dead until reload.
    expect(asked).toHaveLength(1);
    expect(asked[0].question).toBe('What about OPUS?');
  });

  it('still offers Stop while a turn runs and nothing has been typed', async () => {
    stream.busy = true;
    const { container } = mount('/');
    await waitFor(() => expect(container.querySelector('textarea')).toBeTruthy());
    expect(container.querySelector('[aria-label="Stop"]')).toBeTruthy();
    fireEvent.change(container.querySelector('textarea')!, { target: { value: 'Products.' } });
    // The moment there is something to send, the button sends it.
    expect(container.querySelector('[aria-label="Send"]')).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ time -- */

describe('4. a window label never sits over figures read for another window', () => {
  it('moves the ribbon only when the new rows arrive', async () => {
    readRiver.mockResolvedValue({ posts: storesWork(), before: null });
    let resolve: ((v: unknown) => void) | null = null;
    replayCalls.mockImplementation((calls: unknown) => {
      // The resting read still answers immediately; only the window change waits.
      if (Array.isArray(calls) && calls.length === 1) return Promise.resolve(REST);
      return new Promise((r) => { resolve = r as (v: unknown) => void; });
    });

    const { container } = mount('/w/t1');
    await waitFor(() => expect(container.querySelector('[data-ribbon]')).toBeTruthy());
    const before = container.querySelector('[data-window][aria-current="true"]')?.getAttribute('data-window');

    fireEvent.click(container.querySelector('[data-window="last_month"]')!);
    // In flight: the chip has NOT moved, and the pending one says it is reading.
    await waitFor(() => expect(container.querySelector('[data-reading="true"]')).toBeTruthy());
    expect(container.querySelector('[data-window][aria-current="true"]')?.getAttribute('data-window'))
      .toBe(before);
    expect(container.querySelector('[data-ribbon]')!.textContent)
      .toContain('still the earlier window');

    resolve!({
      status: 'ok', notices: [], ran_at: '2026-09-09T10:00:00+08:00',
      results: replayResults(headlineSet(), { name: 'last_month', start: '2026-08-01', end: '2026-09-01' }),
    });
    await waitFor(() =>
      expect(container.querySelector('[data-window][aria-current="true"]')?.getAttribute('data-window'))
        .toBe('last_month'));
  });
});
