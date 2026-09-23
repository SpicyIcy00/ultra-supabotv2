/**
 * THE PEOPLE, as a decision the suite can hold (W4.5).
 *
 * Kept apart from the component for the reason approvalState.ts is: these
 * rules are testable without a DOM, and a component file exports only
 * components.
 *
 * WHAT THIS FILE EXISTS TO PREVENT, twice over:
 *
 *   1. UI rule 8. "Nobody is here" and "we have not asked yet" are different
 *      claims about the world, and only one of them is safe to make. Four
 *      kinds — loading, failed, nobody, people — and the first two may never
 *      borrow the last two's words.
 *   2. An invented role list. Who Joy is, what an approver may do and which
 *      businesses a person answers for are the yaml's words, carried on the
 *      row by the server (`role_says`, `says`, `businesses_say`). Nothing
 *      here composes a sentence about authority: whether anybody can approve
 *      at all is `state.approval`, which code wrote in
 *      `services/authority.py describe_approval`.
 *
 * A REFUSAL IS THE SERVER'S SENTENCE. "Only an administrator links a person
 * to a login" and "Nobody called that" have different fixes, so the screen
 * renders what came back rather than a wording of its own.
 */
import type { Account, AuthorityState, Person } from '../../types/authority';

/** The three outcomes a fetch can be in. Mirrors what react-query reports. */
export type PeopleQuery =
  | { status: 'pending' }
  | { status: 'error'; said?: string }
  | { status: 'success'; state: AuthorityState };

export type PeopleKind = 'loading' | 'failed' | 'nobody' | 'people';

export interface PeopleView {
  kind: PeopleKind;
  /** The line that stands in for the rows, or introduces them. */
  heading: string;
  /** A second, quieter line. Absent where there is nothing honest to add. */
  detail?: string;
  /** The rows to render, VERBATIM. Empty for every state but `people`. */
  rows: Person[];
  /**
   * The server's sentence on whether anybody can actually approve, or `null`
   * when that is not yet known. Never composed here, and never coalesced to a
   * cheerful default: not knowing is not the same as nobody being blocked.
   */
  approval: string | null;
  /** When the server read all of this, or `null` when nothing has been read. */
  readAt: string | null;
  /**
   * The logins an administrator may link a person to, or `null` when the
   * viewer is not one — in which case the linking controls are not drawn and
   * nobody else's account is on screen.
   */
  accounts: Account[] | null;
  /** True once a loaded result says this viewer may link a person to a login. */
  mayLink: boolean;
}

/**
 * The whole presentation, from the state of the fetch.
 *
 * Deliberately total: every branch returns, so a state added to PeopleQuery
 * without a rendering here is a type error rather than a blank page.
 */
export function peopleView(query: PeopleQuery): PeopleView {
  if (query.status === 'pending') {
    return {
      kind: 'loading',
      // Not "nobody works here yet". We have not asked.
      heading: 'Checking…',
      rows: [],
      approval: null,
      readAt: null,
      accounts: null,
      mayLink: false,
    };
  }

  if (query.status === 'error') {
    return {
      kind: 'failed',
      heading: 'The people could not be read.',
      // The server's own words where there are any; never in place of them.
      detail: query.said,
      rows: [],
      approval: null,
      readAt: null,
      accounts: null,
      mayLink: false,
    };
  }

  const { state } = query;
  const shared = {
    approval: state.approval,
    readAt: state.read_at ?? null,
    accounts: state.accounts ?? null,
    mayLink: state.viewer.may_link_people,
  };

  if (state.people.length === 0) {
    return {
      kind: 'nobody',
      heading: 'Nobody is on the estate yet.',
      detail: 'Until somebody is, no draft has an approver and nothing can be decided.',
      rows: [],
      ...shared,
    };
  }

  return {
    kind: 'people',
    heading: 'Who Bob works for, and what each may do.',
    rows: state.people,
    ...shared,
  };
}

/**
 * Which login is this person's, in one phrase.
 *
 * Not a claim about authority — that is `view.approval`, which the server
 * writes. This only says whether a row is joined to an account.
 */
export function loginSays(person: Person): string {
  return person.username ? `signs in as ${person.username}` : 'no login linked';
}
