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
vi.mock('../services/pagesApi', () => ({ listPages: () => pages() }));
vi.mock('../services/workflowsApi', () => ({ listWorkflows: () => workflows() }));
vi.mock('../services/standingApi', () => ({ listStanding: () => standing() }));

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
  standing.mockResolvedValue([{ id: 's1', question: 'Morning question', instructions: [], when: 'every day at 06:00',
                                state: 'switched off', last_asked: null, last_status: null }]);
  useAuthStore.setState({ user: { id: 'u', username: 'owner', display_name: 'You', role: 'owner', allowed_pages: [] } });
});
afterEach(cleanup);

const href = (name: RegExp | string) => screen.getByRole('link', { name }).getAttribute('href');

describe('every item opens what it names', () => {
  it('links pages, systems, automations, people, needs you and the way out', async () => {
    mount({ needsYou: 2 });
    await screen.findByText('Seikyo Purchasing');
    expect(href(/Seikyo Purchasing/)).toBe('/pages/p1');
    expect(href(/Seikyo PO/)).toBe('/workflows');
    expect(href(/Morning question/)).toBe('/workflows');
    expect(href(/You/)).toBe('/settings');
    expect(href('Needs you, 2 waiting')).toBe('/inbox');
    expect(href('Back to Supabot BI')).toBe('/dashboard');
  });

  it('says a system\'s version and state, and a switched-off automation is off', async () => {
    mount();
    expect((await screen.findByText('Seikyo PO')).parentElement?.textContent).toContain('v2 · active');
    expect((await screen.findByText('Morning question')).parentElement?.textContent).toContain('off');
  });

  it('draws no console switch and no status line (row 22)', () => {
    const { container } = mount();
    expect(container.querySelector('.consw, .r-status, [data-con]')).toBeNull();
  });
});

describe('three renderings, never two (UI rule 8)', () => {
  it('says loading, then what came back — and "could not be read" is not "nothing"', async () => {
    let resolve!: (v: unknown) => void;
    pages.mockReturnValue(new Promise((r) => { resolve = r; }));
    workflows.mockRejectedValue(new Error('down'));
    standing.mockResolvedValue([]);
    mount();
    expect(screen.getAllByText('loading').length).toBeGreaterThan(0);
    expect(await screen.findByText('could not be read')).toBeTruthy();
    expect(await screen.findByText('none switched on')).toBeTruthy();
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
