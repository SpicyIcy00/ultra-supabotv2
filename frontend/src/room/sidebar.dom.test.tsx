// @vitest-environment jsdom
/**
 * THE SIDEBAR (P2S.1(h)) — the owner's rows 2, 3 and 22:
 * *"should be space of the sides for a sidebar for pages workflows,
 * automations etc"*, *"make the sidebar to the left edge and collapseable"*,
 * and no console switch or status line.
 *
 * Held here: every item opens what it names; `[` toggles it (not while
 * typing); the choice is remembered; it is open by default only on a window
 * wider than 820px; each group draws loading, failed and loaded as three
 * things (UI rule 8); the accent appears only on a loaded, non-zero needs-you.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pages = vi.fn();
const workflows = vi.fn();
const standing = vi.fn();
const imports = vi.fn();
vi.mock('../services/pagesApi', () => ({ listPages: () => pages() }));
vi.mock('../services/workflowsApi', () => ({ listWorkflows: () => workflows() }));
vi.mock('../services/standingApi', () => ({
  // One query, two readings: the rail selects a flat list out of the shape the
  // watches page reads, so they share a cache key and never fight over it.
  getWatching: () => standing(),
  railRows: (w: { questions: unknown[]; watches: unknown[] }) => [...w.questions, ...w.watches],
  anchorOf: (r: { family: string; id: string }) => `${r.family}-${r.id}`,
  // The slot in the rail's width, built from the slot the service holds.
  slotShort: (r: { slot?: { hour: number; minute: number } }) =>
    `${String(r.slot?.hour ?? 0).padStart(2, '0')}:${String(r.slot?.minute ?? 0).padStart(2, '0')} daily`,
}));
vi.mock('../services/storehubImportsApi', () => ({ listImports: () => imports() }));

import { Rail, restoreSide } from './Rail';
import { useAuthStore } from '../stores/authStore';

function mount(props: Partial<Parameters<typeof Rail>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Rail busy={false} onNew={() => {}} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-side');
  pages.mockResolvedValue([{ id: 'p1', title: 'Seikyo Purchasing', purpose: null, pins: 3, created_at: '', updated_at: '' }]);
  workflows.mockResolvedValue([{ id: 'w1', name: 'Seikyo PO', status: 'active', created_by: '', created_at: '',
                                 current_version: { version: 2 } }]);
  // W4.4: one row shape for both families, and the SLOT is there whether
  // the thing is on or off.
  standing.mockResolvedValue({ questions: [{ id: 's1', family: 'question',
                                 asks: 'Morning question', when: 'every day at 06:00',
                                 on: false, state: 'switched off',
                                 slot: { kind: 'daily', hour: 6, minute: 0, days_of_week: null } }],
                               watches: [] });
  imports.mockReset();
  imports.mockResolvedValue([
    { id: 14, kind: 'purchase_orders', uploaded_at: '2026-09-03T14:57:42+00:00' },
    { id: 12, kind: 'stock_transfers', uploaded_at: '2026-09-02T09:50:27+00:00' },
  ]);
  useAuthStore.setState({ user: { id: 'u', username: 'owner', display_name: 'You', role: 'owner',
                                  allowed_pages: ['bob', 'dashboard'] } });
});
afterEach(cleanup);

const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href');

describe('every item opens what it names', () => {
  it('links pages, systems, automations, people, needs you and the way out', async () => {
    mount({ needsYou: 2 });
    await screen.findByText('Seikyo Purchasing');
    expect(href(/Seikyo Purchasing/)).toBe('/pages/p1');
    // EVERY ROW OPENS WHAT IT NAMES (W4.3 and W4.4, 2026-09-23). A system row
    // used to open the list — the one group where that was not true — and the
    // page it landed on could not run, backtest, promote or switch on the thing
    // the row named. A watch row opened that same list, which does not contain
    // watches at all.
    expect(href(/Seikyo PO/)).toBe('/workflows/w1');
    expect(href(/Morning question/)).toBe('/watches#question-s1');
    // PEOPLE opens the people, not the settings screen (W4.5).
    expect(href(/The people/)).toBe('/people');
    expect(href('Needs you, 2 waiting')).toBe('/inbox');
    expect(href('Back to Supabot BI')).toBe('/dashboard');
  });

  // REWRITTEN BY W4.4 (2026-09-23). It used to hold that a switched-off
  // standing question says "off" WHERE ITS SLOT GOES, which meant an off
  // row and an on row in one group carried different kinds of fact and
  // could not be read down. The pip already says on or off; the slot is
  // the thing only the row knows.
  it('says a system\'s version and state, and an off watch still says when it runs', async () => {
    mount();
    expect((await screen.findByText('Seikyo PO')).parentElement?.textContent).toContain('v2 · active');
    const row = (await screen.findByText('Morning question')).parentElement;
    expect(row?.textContent).toContain('06:00');
    expect(row?.querySelector('.r-pip--off')).toBeTruthy();
  });

  it('draws no console switch and no status line (row 22)', () => {
    const { container } = mount();
    expect(container.querySelector('.consw, .r-status, [data-con]')).toBeNull();
  });
});

/**
 * NO ROW LEADS SOMEWHERE THE PERSON CANNOT GO (W4.5).
 *
 * The People row used to open `/settings`, drawn to everybody while the route
 * is `RequirePage pageKey="settings"` — so a role without that key got a link
 * that bounced straight back, the exact failure the Sources group takes care
 * to avoid. Every destination in the rail is now either behind Bob's own key,
 * which everybody who can see the rail holds, or guarded like Sources.
 */
describe('no row bounces', () => {
  /** Which page key each destination the rail draws sits behind (App.tsx). */
  const KEY_OF: Record<string, string> = {
    '/dashboard': 'dashboard', '/inbox': 'bob', '/pages/p1': 'bob',
    '/workflows': 'bob', '/people': 'bob', '/storehub-imports': 'storehub_imports',
    // W4.3 and W4.4: a row opens the thing it names, so a system row carries
    // its id, and a watch row the anchor of its own row on the watches page.
    '/workflows/w1': 'bob', '/watches': 'bob',
  };

  const hrefs = () => screen.getAllByRole('link')
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h.startsWith('/'));

  it('draws only destinations the signed-in role may open', async () => {
    for (const allowed of [['bob'], ['bob', 'dashboard'], ['bob', 'storehub_imports'],
                           ['bob', 'dashboard', 'storehub_imports']]) {
      useAuthStore.setState({ user: { id: 'u', username: 'owner', display_name: 'You',
                                      role: 'owner', allowed_pages: allowed } });
      mount();
      await screen.findByText('Seikyo Purchasing');
      for (const href of hrefs()) {
        const key = KEY_OF[href.split('#')[0]];
        expect(key, `${href} is not a destination this test knows`).toBeTruthy();
        expect(allowed, `${href} is drawn to a role without ${key}`).toContain(key);
      }
      cleanup();
    }
  });

  it('no row opens the settings screen any more', async () => {
    mount();
    await screen.findByText('Seikyo Purchasing');
    expect(hrefs()).not.toContain('/settings');
  });

  it('is absent for a role that cannot open Bob at all', async () => {
    useAuthStore.setState({ user: { id: 'u', username: 'staff', display_name: 'Staff',
                                    role: 'warehouse_staff', allowed_pages: ['dashboard'] } });
    mount();
    await screen.findByText('Seikyo Purchasing');
    expect(screen.queryByRole('link', { name: /The people/ })).toBeNull();
  });
});

describe('three renderings, never two (UI rule 8)', () => {
  it('says loading, then what came back — and "could not be read" is not "nothing"', async () => {
    let resolve!: (v: unknown) => void;
    pages.mockReturnValue(new Promise((r) => { resolve = r; }));
    workflows.mockRejectedValue(new Error('down'));
    standing.mockResolvedValue({ questions: [], watches: [] });
    mount();
    expect(screen.getAllByText('loading').length).toBeGreaterThan(0);
    expect(await screen.findByText('could not be read')).toBeTruthy();
    expect(await screen.findByText('none set up yet')).toBeTruthy();
    await act(async () => { resolve([]); });
    expect(await screen.findByText('nothing kept yet')).toBeTruthy();
  });

  it('draws the accent only on a loaded, non-zero needs-you', () => {
    const { container, unmount } = mount({ needsYou: undefined });
    expect(container.querySelector('.r-pip--need, .r-side-count')).toBeNull();
    unmount();
    const zero = mount({ needsYou: 0 });
    expect(zero.container.querySelector('.r-pip--need, .r-side-count')).toBeNull();
    zero.unmount();
    const some = mount({ needsYou: 3 });
    expect(some.container.querySelector('.r-side-count')?.textContent).toBe('3');
  });
});

describe('collapsible, from the left edge (row 3)', () => {
  it('is open by default above 820px and closed at or under it', () => {
    expect(restoreSide(1440)).toBe(true);
    expect(restoreSide(821)).toBe(true);
    expect(restoreSide(820)).toBe(false);
  });

  it('toggles with [, and remembers', async () => {
    mount();
    const root = document.documentElement;
    const was = root.getAttribute('data-side');
    fireEvent.keyDown(document, { key: '[' });
    await waitFor(() => expect(root.getAttribute('data-side')).not.toBe(was));
    expect(localStorage.getItem('bob.side')).toBe(root.getAttribute('data-side'));
    fireEvent.keyDown(document, { key: '[' });
    await waitFor(() => expect(root.getAttribute('data-side')).toBe(was));
  });

  it('does not toggle while somebody is typing', () => {
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const was = document.documentElement.getAttribute('data-side');
    fireEvent.keyDown(input, { key: '[' });
    expect(document.documentElement.getAttribute('data-side')).toBe(was);
    input.remove();
  });

  it('collapses from its own button and reopens from the edge', async () => {
    localStorage.setItem('bob.side', 'open');
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse the sidebar' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-side')).toBe('closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Open the sidebar' }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-side')).toBe('open'));
    expect(localStorage.getItem('bob.side')).toBe('open');
  });
});

/**
 * SOURCES — the upload page is one of BOB'S screens (P3.h, the owner
 * 2026-09-19: *"it should be a page in bob not supabot"*). It sat in the
 * Supabot sidebar for one session; the rail is where it belongs, and the
 * rail's own shape is a thing you own with the state it is in.
 */
describe('sources — what arrives as a file, and when it last did', () => {
  const granted = () => useAuthStore.setState({
    user: { id: 'u', username: 'owner', display_name: 'You', role: 'owner',
            allowed_pages: ['bob', 'storehub_imports'] },
  });

  it('lists both records, each opening the upload page, dated by its newest import', async () => {
    granted();
    mount();
    const orders = await screen.findByRole('link', { name: /Purchase orders/ });
    expect(orders.getAttribute('href')).toBe('/storehub-imports');
    await waitFor(() => expect(orders.textContent).toContain('3 Sep'));
    const transfers = screen.getByRole('link', { name: /Stock transfers/ });
    expect(transfers.getAttribute('href')).toBe('/storehub-imports');
    expect(transfers.textContent).toContain('2 Sep');
    // The heading says what the date is the date OF, so the date itself can be short.
    expect(screen.getByText('Sources · last import')).toBeTruthy();
  });

  it('is absent, and is not even read, for a role without the page', async () => {
    useAuthStore.setState({
      user: { id: 'u', username: 'staff', display_name: 'Staff', role: 'warehouse_staff',
              allowed_pages: ['bob'] },
    });
    mount();
    await screen.findByText('Seikyo Purchasing');
    expect(screen.queryByText('Sources · last import')).toBeNull();
    expect(screen.queryByRole('link', { name: /Purchase orders/ })).toBeNull();
    // A role that cannot open the ledger does not collect a 403 for opening the room.
    expect(imports).not.toHaveBeenCalled();
  });

  it('keeps the way in when nothing has been imported, and says never', async () => {
    granted();
    imports.mockResolvedValue([]);
    mount();
    const orders = await screen.findByRole('link', { name: /Purchase orders/ });
    // The day nothing is imported is the day the upload page is most needed.
    expect(orders.getAttribute('href')).toBe('/storehub-imports');
    await waitFor(() => expect(orders.textContent).toContain('never'));
  });

  it('draws loading, could not be read, and a date as three different things', async () => {
    granted();
    let settle!: (rows: unknown[]) => void;
    imports.mockReturnValue(new Promise((r) => { settle = r as (rows: unknown[]) => void; }));
    mount();
    const orders = await screen.findByRole('link', { name: /Purchase orders/ });
    expect(orders.textContent).toContain('loading');
    expect(orders.textContent).not.toContain('never');
    settle([{ id: 1, kind: 'purchase_orders', uploaded_at: '2026-09-03T14:57:42+00:00' }]);
    await waitFor(() => expect(orders.textContent).toContain('3 Sep'));
    cleanup();

    imports.mockRejectedValue(new Error('down'));
    granted();
    mount();
    const again = await screen.findByRole('link', { name: /Purchase orders/ });
    await waitFor(() => expect(again.textContent).toContain('not read'));
    expect(again.textContent).not.toContain('never');
    expect(again.getAttribute('href')).toBe('/storehub-imports');
  });
});
