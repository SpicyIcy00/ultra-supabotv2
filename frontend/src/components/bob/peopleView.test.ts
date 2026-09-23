/**
 * THE PEOPLE, as four renderings (W4.5).
 *
 * UI rule 8: a claim about state renders from a loaded result, never a
 * literal. "Nobody is on the estate yet" is a claim about the world; so is a
 * sentence saying who may approve. Neither may be made before the read comes
 * back, and neither may be made by a failed one.
 */
import { describe, expect, it } from 'vitest';
import { loginSays, peopleView } from './peopleView';
import type { AuthorityState, Person } from '../../types/authority';

function person(over: Partial<Person> = {}): Person {
  return {
    person: 'joy', name: 'Joy', role: 'approver', says: 'the boss — the final approver',
    businesses: ['aji_ichiban'], role_says: 'approves or rejects drafts and changes them',
    may: ['submit', 'approve', 'reject', 'change', 'set_line'],
    businesses_say: ['Aji Ichiban — the candy stores, AJI BARN and AJI CMG'],
    linked: false, username: null, ...over,
  };
}

function state(over: Partial<AuthorityState> = {}): AuthorityState {
  return {
    line: null, line_means: 'No line is set, so every draft is a decision.', history: [],
    people: [person()],
    approval: 'Nobody can approve anything yet: Joy approves, and no login is linked to that person.',
    viewer: { username: 'isaiah', person: 'isaiah', name: 'Isaiah', role: 'builder',
              may_approve: false, may_set_line: false, may_link_people: false, sees_all: false },
    accounts: null, read_at: '2026-09-23T01:00:00Z',
    assumption: 'Joy approves; Isaiah builds.', keyed_into: 'StoreHub', ...over,
  };
}

describe('four renderings, never two', () => {
  it('says nothing about who may approve until something has been read', () => {
    const view = peopleView({ status: 'pending' });
    expect(view.kind).toBe('loading');
    expect(view.rows).toEqual([]);
    // Not knowing is not "nobody is blocked", and it is not a read time either.
    expect(view.approval).toBeNull();
    expect(view.readAt).toBeNull();
    expect(view.mayLink).toBe(false);
  });

  it('a failed read says so, and never borrows the empty state’s words', () => {
    const view = peopleView({ status: 'error', said: 'george.people is not readable.' });
    expect(view.kind).toBe('failed');
    expect(view.heading).not.toContain('Nobody is on the estate');
    // The server's own words, kept.
    expect(view.detail).toBe('george.people is not readable.');
    expect(view.approval).toBeNull();
  });

  it('a loaded, empty estate is its own thing', () => {
    const view = peopleView({ status: 'success', state: state({ people: [] }) });
    expect(view.kind).toBe('nobody');
    expect(view.rows).toEqual([]);
    // The approval sentence is still the server's, even with nobody on it.
    expect(view.approval).toContain('Nobody can approve anything yet');
    expect(view.readAt).toBe('2026-09-23T01:00:00Z');
  });

  it('carries the rows and the server’s sentence verbatim', () => {
    const view = peopleView({ status: 'success', state: state() });
    expect(view.kind).toBe('people');
    expect(view.rows[0].role_says).toBe('approves or rejects drafts and changes them');
    expect(view.approval).toBe(state().approval);
  });
});

describe('the linking control belongs to an administrator', () => {
  it('sends no accounts and no permission to anybody else', () => {
    const view = peopleView({ status: 'success', state: state() });
    expect(view.accounts).toBeNull();
    expect(view.mayLink).toBe(false);
  });

  it('carries the logins when the server says this viewer may link one', () => {
    const view = peopleView({ status: 'success', state: state({
      viewer: { ...state().viewer, may_link_people: true },
      accounts: [{ username: 'joy', display_name: 'Joy', role: 'admin', active: true,
                   can_sign_in: true }],
    }) });
    expect(view.mayLink).toBe(true);
    expect(view.accounts?.[0].username).toBe('joy');
    // Never a hash, in any shape.
    expect(JSON.stringify(view.accounts)).not.toContain('hash');
  });
});

describe('which login is whose', () => {
  it('says the login, or that there is none', () => {
    expect(loginSays(person({ username: 'joy', linked: true }))).toBe('signs in as joy');
    expect(loginSays(person())).toBe('no login linked');
  });
});
