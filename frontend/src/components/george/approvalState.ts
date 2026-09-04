/**
 * The approval queue, as a decision the suite can hold.
 *
 * Kept apart from the components for the same reason markState.ts and
 * cognition.ts are: these rules are testable without a DOM, and a component
 * file exports only components.
 *
 * WHAT THIS FILE EXISTS TO PREVENT. The right rail used to say "Nothing needs
 * you" as a literal, beside a count hardcoded to 0, while
 * GET /george/workflows/approvals had been live for a day and one version was
 * genuinely waiting on somebody in production. The screen was not stale — it
 * had never asked. CLAUDE.md UI rule 8 came out of that: a claim about state
 * renders from a loaded result, never a literal.
 *
 * SO NOT-YET-LOADED IS ITS OWN STATE. Four kinds, and the first two may never
 * borrow the last one's words:
 *
 *   loading   we have not asked yet, or the answer has not come back
 *   failed    we asked and could not find out
 *   empty     we asked, and nothing needs anybody
 *   rows      we asked, and these do
 *
 * `count` is `null` rather than 0 for loading and failed, and that is the whole
 * point of the type: 0 is a fact about the world, and neither of those states
 * knows one. A component that renders `count ?? 0` has reintroduced exactly the
 * bug this module was written to kill.
 *
 * COLOUR. UI rule 5 reserves one colour for "needs you", and here it means a
 * workflow version waiting to be promoted past the backtest gate — nothing
 * else. `accent` is true only for `rows`. A queue that failed to load is not an
 * approval, and an empty one is not either, so both are navy.
 */
import type { Approval } from '../../types/workflows';

/** The three outcomes a fetch can be in. Mirrors what react-query reports. */
export type ApprovalQuery =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; approvals: Approval[] };

export type ApprovalsKind = 'loading' | 'failed' | 'empty' | 'rows';

export interface ApprovalsView {
  kind: ApprovalsKind;
  /** The line that stands in for the rows, or introduces them. */
  heading: string;
  /** A second, quieter line. Absent where there is nothing honest to add. */
  detail?: string;
  /** The rows to render, VERBATIM. Empty for every state but `rows`. */
  rows: Approval[];
  /**
   * Whether the approvals colour may be worn. Loaded, non-empty results only —
   * see the file header.
   */
  accent: boolean;
  /**
   * How many things need you, or `null` when that is not yet known.
   *
   * Never coalesce this to 0. "We have not looked" and "we looked and found
   * nothing" are different claims, and only one of them is safe to make.
   */
  count: number | null;
}

/**
 * The rail's whole presentation, from the state of the fetch.
 *
 * Deliberately total: every branch returns, so a state added to ApprovalQuery
 * without a rendering here is a type error rather than a blank panel.
 */
export function approvalsView(query: ApprovalQuery): ApprovalsView {
  if (query.status === 'pending') {
    return {
      kind: 'loading',
      // Not "Nothing needs you". We do not know that yet.
      heading: 'Checking…',
      rows: [],
      accent: false,
      count: null,
    };
  }

  if (query.status === 'error') {
    return {
      kind: 'failed',
      heading: 'Could not load the approval queue.',
      // Says what is unknown, rather than implying the queue is empty.
      detail: 'Something may be waiting. Reopen this panel to try again.',
      rows: [],
      accent: false,
      count: null,
    };
  }

  const rows = query.approvals;
  if (rows.length === 0) {
    return {
      kind: 'empty',
      heading: 'Nothing needs you.',
      // The queue's one occupant, named — so an empty state says what it is
      // empty OF rather than just being blank.
      detail: 'No workflow version is waiting to be promoted.',
      rows: [],
      accent: false,
      count: 0,
    };
  }

  return {
    kind: 'rows',
    heading: rows.length === 1 ? '1 version needs you' : `${rows.length} versions need you`,
    rows,
    accent: true,
    count: rows.length,
  };
}

/**
 * The attention button's accessible name.
 *
 * Three readings for three states, because a screen reader hitting this button
 * gets the same guarantee the sighted rail does: an unknown count never
 * announces as "nothing".
 */
export function attentionLabel(count: number | null): string {
  if (count === null) return 'Checking whether anything needs you';
  if (count === 0) return 'Nothing needs you';
  return count === 1 ? '1 version needs you' : `${count} versions need you`;
}

/**
 * Whether the button wears the badge.
 *
 * A known, positive count and nothing else. Unknown does not get a badge — a
 * dot that appeared while loading and vanished on an empty result would be the
 * literal-0 bug wearing the opposite sign.
 */
export function attentionAccent(count: number | null): boolean {
  return count !== null && count > 0;
}
