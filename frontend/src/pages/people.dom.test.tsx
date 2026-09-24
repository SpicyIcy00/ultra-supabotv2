// @vitest-environment jsdom
/**
 * /people — PEOPLE opens the people (W4.5).
 *
 * Held here: the four of W2.2 are drawn with the yaml's words for what each
 * may do; which login is whose is on every row; the page says plainly when
 * nobody is linked, because until an approver has a login nobody can approve
 * anything; the linking control is an administrator's only and its refusal is
 * the server's sentence; no number is drawn without the time it was read; and
 * the accounts screen is linked only for a role that may open it.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorityState, Person } from '../types/authority';

vi.mock('../room/RoomShell', () => ({
  RoomHead: ({ title, says }: { title: string; says?: string }) => (
    <header><h1>{title}</h1>{says && <p>{says}</p>}</header>
  ),
}));

const authority = vi.fn();
const link = vi.fn();
vi.mock('../services/authorityApi', () => ({
  getAuthority: () => authority(),
  linkPerson: (...a: unknown[]) => link(...a),
}));

import PeoplePage from './PeoplePage';
import { useAuthStore } from '../stores/authStore';

function person(over: Partial<Person> = {}): Person {
  return {
    person: 'joy', name: 'Joy', role: 'approver', says: 'the boss — the final approver',
    businesses: ['aji_ichiban'], role_says: 'approves or rejects drafts and changes them',
    may: ['submit', 'approve'], businesses_say: ['Aji Ichiban — the candy stores'],
    linked: false, username: null, ...over,
  };
}

const ISAIAH = person({
  person: 'isaiah', name: 'Isaiah', role: 'builder', says: 'the builder',
  role_says: 'builds Bob with him; does not approve purchases', may: ['submit'],
  businesses_say: ['Aji Ichiban — the candy stores'],
});

function state(over: Partial<AuthorityState> = {}): AuthorityState {
  return {
    line: null, line_means: 'No line is set.', history: [],
    people: [person(), ISAIAH],
    approval: 'Nobody can approve anything yet: Joy approves, and no login is linked to '
      + 'that person. An administrator links a login to a person.',
    viewer: { username: 'isaiah', person: 'isaiah', name: 'Isaiah', role: 'builder',
              may_approve: false, may_set_line: false, may_link_people: false, sees_all: false },
    accounts: null, read_at: '2026-09-23T01:00:00Z',
    assumption: 'Joy approves; Isaiah builds and administers.', keyed_into: 'StoreHub', ...over,
  };
}

function page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PeoplePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authority.mockReset();
  link.mockReset();
  authority.mockResolvedValue(state());
  useAuthStore.setState({ user: { id: 'u', username: 'isaiah', display_name: 'Isaiah',
                                  role: 'warehouse_staff', allowed_pages: ['bob'] } });
});
afterEach(cleanup);

describe('PEOPLE opens the people', () => {
  it('draws each person with the yaml’s words and the login that is theirs', async () => {
    page();
    expect(await screen.findByText('Joy')).toBeTruthy();
    expect(screen.getByText('the boss — the final approver')).toBeTruthy();
    expect(screen.getByText(/approves or rejects drafts and changes them/)).toBeTruthy();
    expect(screen.getByText('Isaiah')).toBeTruthy();
    expect(screen.getByText(/builds Bob with him; does not approve purchases/)).toBeTruthy();
    expect(screen.getAllByText('no login linked').length).toBe(2);
  });

  it('says plainly that nobody can approve, in the server’s own sentence', async () => {
    page();
    expect(await screen.findByText(/Nobody can approve anything yet/)).toBeTruthy();
  });

  it('says a linked login rather than inventing an account', async () => {
    authority.mockResolvedValue(state({
      people: [person({ linked: true, username: 'joy' }), ISAIAH],
      approval: 'Joy approves — Joy signs in as joy.',
    }));
    page();
    expect(await screen.findByText('signs in as joy')).toBeTruthy();
    expect(screen.getByText('Joy approves — Joy signs in as joy.')).toBeTruthy();
  });

  it('carries the time it was read (UI rule 6)', async () => {
    page();
    expect(await screen.findByText(/^Read /)).toBeTruthy();
  });
});

describe('three renderings, never two (UI rule 8)', () => {
  it('checking is not an empty estate', () => {
    authority.mockReturnValue(new Promise(() => {}));
    page();
    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(screen.queryByText(/Nobody is on the estate/)).toBeNull();
    expect(screen.queryByText(/Read /)).toBeNull();
  });

  it('a failed read says so and keeps the server’s words', async () => {
    authority.mockRejectedValue(new Error('george.people is not readable.'));
    page();
    expect(await screen.findByText('The people could not be read.')).toBeTruthy();
    expect(screen.getByText('george.people is not readable.')).toBeTruthy();
    expect(screen.queryByText(/Nobody is on the estate/)).toBeNull();
  });

  it('a loaded, empty estate is its own rendering', async () => {
    authority.mockResolvedValue(state({ people: [], approval: 'Nobody here may approve.' }));
    page();
    expect(await screen.findByText('Nobody is on the estate yet.')).toBeTruthy();
  });
});

describe('linking a login stays an administrator’s act', () => {
  const admin = (accounts: AuthorityState['accounts']) => {
    authority.mockResolvedValue(state({
      viewer: { username: 'isaiah', person: 'isaiah', name: 'Isaiah', role: 'builder',
                may_approve: false, may_set_line: false, may_link_people: true, sees_all: true },
      accounts,
    }));
    useAuthStore.setState({ user: { id: 'u', username: 'isaiah', display_name: 'Isaiah',
                                    role: 'admin', allowed_pages: ['bob', 'admin'] } });
  };

  it('is not drawn for somebody the server says may not', async () => {
    page();
    await screen.findByText('Joy');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
  });

  it('picks from the logins the server sent, and never a typed name', async () => {
    admin([{ username: 'joy', display_name: 'Joy', role: 'admin', active: true, can_sign_in: true }]);
    link.mockResolvedValue(state({ people: [person({ linked: true, username: 'joy' }), ISAIAH] }));
    page();
    const select = await screen.findByLabelText('Login for Joy');
    fireEvent.change(select, { target: { value: 'joy' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Link' })[0]);
    await waitFor(() => expect(link).toHaveBeenCalledWith('joy', 'joy'));
  });

  it('renders the server’s refusal verbatim', async () => {
    admin([{ username: 'joy', display_name: 'Joy', role: 'admin', active: true, can_sign_in: true }]);
    link.mockRejectedValue(new Error('Only an administrator links a person to a login.'));
    page();
    const select = await screen.findByLabelText('Login for Joy');
    fireEvent.change(select, { target: { value: 'joy' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Link' })[0]);
    expect(await screen.findByText('Only an administrator links a person to a login.')).toBeTruthy();
  });

  it('links the accounts screen only for a role that may open it', async () => {
    page();
    await screen.findByText('Joy');
    expect(screen.queryByRole('link', { name: 'Accounts and page access' })).toBeNull();
    cleanup();
    admin(null);
    page();
    const way = await screen.findByRole('link', { name: 'Accounts and page access' });
    expect(way.getAttribute('href')).toBe('/admin/page-access');
  });
});

describe('the accent is for approvals and nothing else (UI rule 5)', () => {
  it('draws no accent anywhere on this page', async () => {
    const { container } = page();
    await screen.findByText('Joy');
    expect(container.querySelector('.r-do, .r-chip--needs, .r-pip--need')).toBeNull();
  });
});
