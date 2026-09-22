// @vitest-environment jsdom
/**
 * THE LINE IS ON EVERY PAGE, AND HE ANSWERS THERE (W1.4, 2026-09-22).
 *
 * REWRITTEN 2026-09-22. This file held the line of 2026-09-19 as it was then:
 * mounted in RoomShell only (Bob's own screens), and "asking opens the board"
 * — every question navigated to /bob. W1.4 reverses the second half at the
 * owner's word ("alive on every page"): he answers IN PLACE, beside the page,
 * with "Open in Bob"; and the line is mounted once above both chromes, so the
 * BI pages have it too. What still holds from the old file: the same spot on
 * every screen (the room composer's own wrapper), the screen named in the
 * placeholder and sent as context, and an empty line asks nothing.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));
vi.mock('../services/deskApi', () => ({ readDeskDefinitions: () => Promise.resolve(null) }));
vi.mock('../services/storesApi', () => ({ readStoreAppearance: () => Promise.resolve([]) }));

const ask = vi.fn();
const bobState: Record<string, unknown> = {};
vi.mock('../hooks/useBob', () => ({
  useBob: () => ({ ask, busy: false, presence: 'idle', turns: [], where: null,
                   storedThreadId: null, ...bobState }),
}));

import { BobHere } from './BobHere';
import { useAuthStore } from '../stores/authStore';
import { useRegisterHere } from '../hooks/useHere';
import { hereForKeptPage, type Here } from '../components/bob/here';

function Registers({ here }: { here: Here }) {
  useRegisterHere(here);
  return <p>a page</p>;
}

function mount(path: string, page: ReactNode = <p>a page</p>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="*" element={page} /></Routes>
        <BobHere />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const typeAndSend = (text: string) => {
  const line = screen.getByLabelText('Ask Bob') as HTMLInputElement;
  fireEvent.change(line, { target: { value: text } });
  fireEvent.keyDown(line, { key: 'Enter' });
  return line;
};

beforeEach(() => {
  useAuthStore.setState({
    user: { username: 'ice', display_name: 'Ice', role: 'admin', allowed_pages: ['bob', 'warehouse'] } as never,
  });
});
afterEach(() => {
  cleanup(); ask.mockReset(); navigate.mockReset();
  for (const k of Object.keys(bobState)) delete bobState[k];
});

describe('the line, on every page', () => {
  it('is on a BI page and on one of Bob’s screens, in the composer place', () => {
    for (const path of ['/warehouse', '/dashboard', '/analytics', '/packing', '/vending', '/storehub-imports']) {
      const { container, unmount } = mount(path);
      // THE SAME SPOT: `.r-line-wrap` is the fixed bottom strip the room's
      // composer lives in. Same wrapper, same position, no second geometry.
      expect(container.querySelector('.r-line-wrap .r-compose .r-line'), path).toBeTruthy();
      unmount();
    }
  });

  it('is not drawn where it has no place: the room, the print sheet, the legacy chat, or without Bob', () => {
    for (const path of ['/bob', '/w/t-1', '/packing/abc/print', '/ai-chat']) {
      const { unmount } = mount(path);
      expect(screen.queryByLabelText('Ask Bob'), path).toBeNull();
      unmount();
    }
    useAuthStore.setState({ user: { username: 'staff', role: 'staff', allowed_pages: ['packing'] } as never });
    mount('/packing');
    expect(screen.queryByLabelText('Ask Bob')).toBeNull();
  });

  it('names a nested path, not "this screen"', () => {
    mount('/pages/p-1');
    expect(screen.getByLabelText('Ask Bob').getAttribute('placeholder')).toBe('ask about kept pages');
    cleanup();
    mount('/admin/page-access/x');
    expect(screen.getByLabelText('Ask Bob').getAttribute('placeholder')).toBe('ask about admin');
  });

  it('asks from the warehouse ON the warehouse: the screen travels, nothing navigates', () => {
    mount('/warehouse', <Registers here={{ key: 'warehouse', label: 'Warehouse', view: 'Replenishment Reports' }} />);
    const line = typeAndSend('which shops are short this week?');
    expect(ask).toHaveBeenCalledWith('which shops are short this week?', {
      where: 'screen:warehouse',
      pageContext: 'Warehouse',
      screen: { key: 'warehouse', label: 'Warehouse', view: 'Replenishment Reports' },
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(line.value).toBe('');
  });

  it('asks from a kept page with its identity, so view_page and edit_page bind to it', () => {
    mount('/pages/p-reorder', <Registers here={hereForKeptPage('p-reorder', 'AJI BARN Reorder')} />);
    expect(screen.getByLabelText('Ask Bob').getAttribute('placeholder')).toBe('ask about AJI BARN Reorder');
    typeAndSend('add date filters to this');
    expect(ask).toHaveBeenCalledWith('add date filters to this', {
      where: 'page:p-reorder',
      pageContext: 'Pages / AJI BARN Reorder',
      pageScope: { page_id: 'p-reorder', title: 'AJI BARN Reorder' },
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('never sends a figure as what a page shows', () => {
    mount('/dashboard', <Registers here={{ key: 'dashboard', label: 'Dashboard', view: 'Stores',
      subjects: ['Rockwell', 'Greenhills'], window: { start: '2026-09-15', end: '2026-09-21' } }} />);
    typeAndSend('why is this one down?');
    const sent = ask.mock.calls[0][1] as { screen: Record<string, unknown> };
    expect(sent.screen).toEqual({ key: 'dashboard', label: 'Dashboard', view: 'Stores',
      subjects: ['Rockwell', 'Greenhills'], window: { start: '2026-09-15', end: '2026-09-21' } });
    expect(Object.keys(sent.screen).sort()).toEqual(['key', 'label', 'subjects', 'view', 'window']);
  });

  it('asks nothing on an empty line', () => {
    mount('/inbox');
    typeAndSend('   ');
    expect(ask).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('the answer, beside the page', () => {
  const turns = [
    { role: 'user', text: 'which shops are short?', at: '2026-09-22T09:00:00+08:00' },
    { role: 'bob', text: 'Rockwell is the one to look at.', thinking: '', toolCalls: [], notices: [],
      pinned: [], saved: [], pageChanges: [], at: '2026-09-22T09:00:01+08:00',
      done: { status: 'ok' } },
  ];

  it('opens beside the page it was asked from, with Open in Bob, and never elsewhere', async () => {
    Object.assign(bobState, { turns, where: 'screen:warehouse', storedThreadId: 't-9' });
    mount('/warehouse', <Registers here={{ key: 'warehouse', label: 'Warehouse' }} />);
    expect(await screen.findByText('Rockwell is the one to look at.')).toBeTruthy();
    expect(screen.getByText('which shops are short?')).toBeTruthy();
    fireEvent.click(screen.getByText('Open in Bob'));
    expect(navigate).toHaveBeenCalledWith('/w/t-9');
    cleanup();

    // The same thread, seen from the dashboard: not drawn — it is about the warehouse.
    mount('/dashboard', <Registers here={{ key: 'dashboard', label: 'Dashboard' }} />);
    expect(screen.queryByText('Rockwell is the one to look at.')).toBeNull();
  });

  it('closes, and says where the answer went so it can be shown again', async () => {
    Object.assign(bobState, { turns, where: 'screen:warehouse', storedThreadId: null });
    mount('/warehouse', <Registers here={{ key: 'warehouse', label: 'Warehouse' }} />);
    await screen.findByText('Rockwell is the one to look at.');
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Rockwell is the one to look at.')).toBeNull();
    fireEvent.click(screen.getByText('Show answer'));
    expect(await screen.findByText('Rockwell is the one to look at.')).toBeTruthy();
    // Not stored yet: the room, which is already drawing this stream.
    fireEvent.click(screen.getByText('Open in Bob'));
    expect(navigate).toHaveBeenCalledWith('/bob');
  });

  it('says it could not answer, in its own words, rather than drawing an answer', async () => {
    Object.assign(bobState, {
      where: 'screen:warehouse',
      turns: [turns[0], { ...turns[1], text: '', done: undefined, error: 'Bob returned 503' }],
    });
    mount('/warehouse', <Registers here={{ key: 'warehouse', label: 'Warehouse' }} />);
    expect(await screen.findByText('Bob could not answer this.', { exact: false })).toBeTruthy();
    expect(screen.getByText('Bob returned 503')).toBeTruthy();
  });
});
