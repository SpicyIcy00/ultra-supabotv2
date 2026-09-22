/**
 * The approver's queue (W2.2), as decisions the suite can hold without a DOM.
 *
 * TWO PLACES A DRAFT CAN LAND, AND ONLY ONE OF THEM INTERRUPTS. A draft over
 * the approver's line — or with no line set, or with a line that has no cost
 * on file — arrives as a DECISION: it wears the approvals colour (UI rule 5,
 * this is exactly its use), counts toward "needs you", and carries Approve ·
 * Change · Look into it. A draft at or under the line lands in the LIST
 * quietly: no accent, no count, still waiting for a yes. Where each went is
 * the server's `routed`, never a comparison the client makes.
 *
 * NOT-YET-LOADED IS ITS OWN STATE (UI rule 8), exactly as approvalState.ts
 * holds it: loading and failed never borrow the loaded words, and the count is
 * `undefined` rather than 0 until a result says so.
 */
import type { DraftRequest, RequestsResult } from '../../types/authority';

export type RequestsQuery =
  | { status: 'pending' }
  | { status: 'error' }
  | { status: 'success'; result: RequestsResult };

/**
 * The decision's actions, in the order drawn — metrics.yaml
 * authority.decision_actions and authority.actions.*.label, held equal by
 * tests/test_authority_contract.py.
 */
export const DECISION_LABELS = { approve: 'Approve', change: 'Change', look_into: 'Look into it' } as const;
export const LIST_LABELS = { approve: 'Approve', reject: 'Reject' } as const;
export const REJECT_LABEL = 'Reject';

export interface RequestsView {
  kind: 'loading' | 'failed' | 'loaded';
  /** Waiting drafts that arrived as decisions, newest first, verbatim. */
  decisions: DraftRequest[];
  /** Waiting drafts that landed in the list quietly. */
  list: DraftRequest[];
  decisionsHeading: string;
  listHeading: string;
  detail?: string;
  /** Loaded, and at least one decision waits. The list never wears it. */
  accent: boolean;
  /** Whether this person may approve, reject or change. */
  mayDecide: boolean;
  /**
   * Decisions that need THIS person: the decisions, for an approver; zero for
   * anyone else (a request waiting on Joy does not need Daniel); undefined
   * until loaded. Never coalesce it to 0.
   */
  needsYou: number | undefined;
}

export function requestsView(query: RequestsQuery): RequestsView {
  if (query.status === 'pending') {
    return {
      kind: 'loading', decisions: [], list: [], accent: false, mayDecide: false,
      decisionsHeading: 'Checking…', listHeading: 'Checking…', needsYou: undefined,
    };
  }
  if (query.status === 'error') {
    return {
      kind: 'failed', decisions: [], list: [], accent: false, mayDecide: false,
      decisionsHeading: 'Could not load the drafts waiting on approval.',
      listHeading: 'Could not load the list.',
      detail: 'Something may be waiting. Reopen this page to try again.',
      needsYou: undefined,
    };
  }
  // A body without the shape (an older backend, a proxy page) is not a
  // result, and is drawn as the failure it is rather than as "nothing waits".
  const got = query.result as Partial<RequestsResult> | undefined;
  if (!got || !Array.isArray(got.requests) || !got.viewer) {
    return requestsView({ status: 'error' });
  }
  const waiting = got.requests.filter((r) => r.status === 'waiting');
  const decisions = waiting.filter((r) => r.routed === 'decision');
  const list = waiting.filter((r) => r.routed === 'list');
  const mayDecide = Boolean(got.viewer.may_approve);
  return {
    kind: 'loaded',
    decisions,
    list,
    accent: decisions.length > 0,
    mayDecide,
    decisionsHeading: decisions.length === 0
      ? 'No draft is waiting on a decision.'
      : decisions.length === 1 ? '1 draft needs a decision' : `${decisions.length} drafts need a decision`,
    listHeading: list.length === 0
      ? 'Nothing under the line is waiting.'
      : list.length === 1 ? '1 draft under the line' : `${list.length} drafts under the line`,
    needsYou: mayDecide ? decisions.length : 0,
  };
}

/**
 * The rail's one count: workflow versions waiting AND decisions waiting on
 * this person. Unknown if either is unknown — a sum with a hole in it would
 * be a claim about the world made without looking.
 */
export function needsYouTotal(versions: number | undefined, decisions: number | undefined): number | undefined {
  if (versions === undefined || decisions === undefined) return undefined;
  return versions + decisions;
}

/** "Look into it": a question for Bob, carrying no figure of its own. */
export function lookIntoQuestion(r: DraftRequest): string {
  return `Look into the draft "${r.title}" that ${r.requested_by} put up for approval — what is behind it, and should it be approved as it is?`;
}

/** A change: product_id -> the new whole quantity, only for lines that moved. */
export function changedQuantities(
  lines: { product_id: string; quantity: number }[],
  edits: Record<string, string>,
): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const ln of lines) {
    const raw = edits[ln.product_id];
    if (raw === undefined || raw.trim() === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n !== ln.quantity) out[ln.product_id] = n;
  }
  return Object.keys(out).length ? out : null;
}
