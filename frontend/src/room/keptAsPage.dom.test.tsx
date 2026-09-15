// @vitest-environment jsdom
/**
 * A THREAD IS ALREADY A PAGE (P2.a), as rendered output.
 *
 * THE PROPERTIES UNDER TEST:
 *
 *   - The header offers three views of one thread — Talk, Behind it, Page —
 *     and says what the thread is kept as, or that it is not, or that it does
 *     not yet know. Four renderings, and the two that know nothing never
 *     borrow the words of the two that do (UI rule 8).
 *   - The Page view lists what would be kept AND what would not, with the
 *     reason, before anything is written.
 *   - Keep as page sends ONE create carrying the page and its sections
 *     together, made of the calls the loop marked pinnable, and then names the
 *     page with the way to it — `/pages/<id>`, which is Kept, where every
 *     section re-runs its own reads on mount (PinTile, held by
 *     PinnedPage.dom.test.tsx).
 *   - A thread already kept shows its page's name, off the pins it produced.
 *   - The near-duplicate refusal is drawn as the service wrote it, with the
 *     two answers that actually exist, and never offers to join a page a
 *     create cannot join.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CreatePageRequest, Page, Pin, SimilarPageConflict } from '../types/pins';
import type { GeorgeTurn, ToolCall } from '../types/george';

const api = {
  createPage: vi.fn<(body: CreatePageRequest) => Promise<Page>>(),
};
vi.mock('../services/pagesApi', () => ({
  createPage: (b: CreatePageRequest) => api.createPage(b),
}));

let conflictOf: (err: unknown) => SimilarPageConflict | null = () => null;
vi.mock('../services/pinsApi', () => ({
  similarPageConflict: (e: unknown) => conflictOf(e),
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

const { ThreadHeader, keptPages } = await import('./ThreadHeader');
const { ThreadPage } = await import('./ThreadPage');

afterEach(() => {
  cleanup();
  api.createPage.mockReset();
  conflictOf = () => null;
});

/* ------------------------------------------------------------------ fixtures */

function call(seq: number, tool: string, args: Record<string, unknown> = {},
              over: Partial<NonNullable<ToolCall['result']>> = {}): ToolCall {
  return {
    seq, tool, arguments: args,
    result: {
      row_count: 7, source_table: 'mart.sales_daily', truncated: false,
      duration_ms: 240, error: null, pinnable: true, ...over,
    },
  };
}

/** "how are we doing", answered off one read, and a follow-up that read nothing. */
const THREAD: GeorgeTurn[] = [
  { role: 'user', text: 'how are we doing', at: '2026-09-15T09:00:00+08:00' },
  {
    role: 'george', text: 'Sales are up on last week.', thinking: '',
    toolCalls: [call(1, 'get_sales', { window: 'last_week', group_by: ['store'] })],
    notices: [], pinned: [], saved: [], pageChanges: [], at: '2026-09-15T09:00:04+08:00',
  },
  { role: 'user', text: 'what do you make of it', at: '2026-09-15T09:01:00+08:00' },
  {
    role: 'george', text: 'Rockwell is carrying it.', thinking: '',
    toolCalls: [], notices: [], pinned: [], saved: [], pageChanges: [],
    at: '2026-09-15T09:01:03+08:00',
  },
];

const PAGE: Page = {
  id: 'pg-1', title: 'how are we doing', purpose: null,
  created_at: '2026-09-15T09:02:00+08:00', updated_at: '2026-09-15T09:02:00+08:00', pins: 1,
};

function pin(over: Partial<Pin> = {}): Pin {
  return {
    id: 'p1', title: 'how are we doing', question: 'how are we doing',
    page: 'Monday morning', page_id: 'pg-9', position: 0,
    conversation_id: 'c1', tool_calls: [{ tool: 'get_sales', arguments: {} }],
    created_at: '2026-09-15T09:02:00+08:00', last_run_at: null, last_ok_at: null,
    last_status: null, ...over,
  };
}

function drawPage(over: Partial<Parameters<typeof ThreadPage>[0]> = {}) {
  const onKept = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/w/t1']}>
      <QueryClientProvider client={qc}>
        <ThreadPage turns={THREAD} kept={[]} threadId="t1" onKept={onKept} {...over} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { onKept };
}

/* -------------------------------------------------------------------- header */

describe('the thread header', () => {
  const draw = (over: Partial<Parameters<typeof ThreadHeader>[0]> = {}) => {
    const onView = vi.fn();
    render(
      <MemoryRouter>
        <ThreadHeader view="talk" onView={onView} kept={[]} state="loaded" {...over} />
      </MemoryRouter>,
    );
    return { onView };
  };

  it('offers the three views, with the one you are in marked', () => {
    draw({ view: 'behind' });
    expect(screen.getByRole('tab', { name: 'Talk' }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: 'Behind it' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Page' }).getAttribute('aria-selected')).toBe('false');
  });

  it('moves to a view when you ask for it', () => {
    const { onView } = draw();
    fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    expect(onView).toHaveBeenCalledWith('page');
  });

  it('says a thread is not kept only once it has been read', () => {
    draw({ state: 'loading' });
    expect(screen.queryByText('not kept')).toBeNull();
    expect(screen.getByText(/checking what this is kept as/)).toBeTruthy();
    cleanup();
    draw({ state: 'failed' });
    expect(screen.queryByText('not kept')).toBeNull();
    expect(screen.getByText(/could not be read/)).toBeTruthy();
    cleanup();
    draw({ state: 'loaded' });
    expect(screen.getByText('not kept')).toBeTruthy();
  });

  it('names the page a kept thread is kept as, and links to Kept', () => {
    draw({ kept: [{ pageId: 'pg-9', title: 'Monday morning' }] });
    const link = screen.getByRole('link', { name: 'Monday morning' });
    expect(link.getAttribute('href')).toBe('/pages/pg-9');
    expect(screen.queryByText('not kept')).toBeNull();
  });
});

describe('which page a thread was kept as', () => {
  it('is read off the pins the thread produced, newest first', () => {
    expect(keptPages([
      pin({ id: 'p2', page: 'Monday morning', page_id: 'pg-9' }),
      pin({ id: 'p1', page: 'Rockwell', page_id: 'pg-3' }),
    ])).toEqual([
      { pageId: 'pg-9', title: 'Monday morning' },
      { pageId: 'pg-3', title: 'Rockwell' },
    ]);
  });

  it('is nothing at all before the read has answered', () => {
    expect(keptPages(undefined)).toEqual([]);
  });

  it('never calls Ungrouped a page', () => {
    // A pin with no page is a kept ANALYSIS. Saying the thread was kept would
    // send somebody to a conversation that is not there.
    expect(keptPages([pin({ page: null, page_id: null })])).toEqual([]);
  });
});

/* ---------------------------------------------------------------- page view */

describe('the page view of a thread', () => {
  it('lists what would be kept, in the questions own words', () => {
    drawPage();
    expect(screen.getByText('what would be kept')).toBeTruthy();
    expect(screen.getByText('how are we doing')).toBeTruthy();
    expect(screen.getByText(/1 read · read sales/)).toBeTruthy();
  });

  it('lists what would not be kept, and why, before anything is written', () => {
    drawPage();
    expect(screen.getByText('what would not be, and why')).toBeTruthy();
    expect(screen.getByText('what do you make of it')).toBeTruthy();
    expect(screen.getByText(/read nothing/)).toBeTruthy();
  });

  it('keeps the thread as one create carrying the page and its sections together', async () => {
    api.createPage.mockResolvedValue(PAGE);
    const { onKept } = drawPage();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as page' }));
    await waitFor(() => expect(api.createPage).toHaveBeenCalledTimes(1));
    const body = api.createPage.mock.calls[0][0];
    expect(body.title).toBe('how are we doing');
    expect(body.conversation_id).toBe('t1');
    expect(body.analyses).toEqual([{
      title: 'how are we doing',
      tool_calls: [{ tool: 'get_sales', arguments: { window: 'last_week', group_by: ['store'] } }],
    }]);
    await waitFor(() => expect(onKept).toHaveBeenCalledWith(PAGE));
  });

  it('says where the page went, with the way to it', async () => {
    api.createPage.mockResolvedValue(PAGE);
    drawPage();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as page' }));
    const link = await screen.findByRole('link', { name: 'how are we doing' });
    // /pages/<id> is Kept, and every section there re-runs its own reads when
    // it mounts — which is the whole reason the page stores calls and not
    // numbers.
    expect(link.getAttribute('href')).toBe('/pages/pg-1');
    expect(screen.getByText(/re-runs every read when it opens/)).toBeTruthy();
  });

  it('will not keep a page with no name', () => {
    drawPage();
    fireEvent.change(screen.getByLabelText("The page's name"), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Keep as page' }).hasAttribute('disabled')).toBe(true);
  });

  it('draws the near-duplicate refusal as the service wrote it, and offers the two real answers', async () => {
    conflictOf = () => ({
      message: 'You already have a page called "Monday Morning".',
      existing_page: 'Monday Morning', submitted_page: 'monday morning',
    });
    api.createPage.mockRejectedValueOnce(new Error('409'));
    drawPage();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as page' }));
    await screen.findByText('You already have a page called "Monday Morning".');
    // Renaming, or a second page on purpose. There is deliberately no "use the
    // existing page": a create makes a page, it does not join one.
    expect(screen.getByRole('button', { name: 'keep both anyway' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /use /i })).toBeNull();

    api.createPage.mockResolvedValueOnce(PAGE);
    fireEvent.click(screen.getByRole('button', { name: 'keep both anyway' }));
    await waitFor(() => expect(api.createPage).toHaveBeenCalledTimes(2));
    expect(api.createPage.mock.calls[1][0].allow_similar_page).toBe(true);
  });

  it('shows any other refusal in the sentence the service wrote', async () => {
    api.createPage.mockRejectedValue(new Error('You already have 50 pages, the maximum.'));
    drawPage();
    fireEvent.click(screen.getByRole('button', { name: 'Keep as page' }));
    await screen.findByText('You already have 50 pages, the maximum.');
  });

  it('says a thread with nothing to run again has nothing to keep', () => {
    drawPage({ turns: [
      { role: 'user', text: 'hello', at: '2026-09-15T09:00:00+08:00' },
      { role: 'george', text: 'Hello.', thinking: '', toolCalls: [], notices: [],
        pinned: [], saved: [], pageChanges: [], at: '2026-09-15T09:00:01+08:00' },
    ] });
    expect(screen.getByText(/nothing here to keep yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Keep as page' })).toBeNull();
  });

  it('names the page an already-kept thread sits on, and says a second keep makes a second page', () => {
    drawPage({ kept: [{ pageId: 'pg-9', title: 'Monday morning' }] });
    expect(screen.getByRole('link', { name: 'Monday morning' }).getAttribute('href'))
      .toBe('/pages/pg-9');
    expect(screen.getByText(/makes a second page/)).toBeTruthy();
  });
});
