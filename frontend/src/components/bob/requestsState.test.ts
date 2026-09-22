/**
 * W2.2's done-when, held without a DOM: a draft under the line lands in the
 * list quietly, and one over it arrives as a decision with Approve · Change ·
 * Look into it — the only one of the two that wears the approvals colour or
 * counts toward "needs you".
 */
import { describe, expect, it } from 'vitest';
import type { DraftRequest, Viewer } from '../../types/authority';
import {
  DECISION_LABELS, changedQuantities, lookIntoQuestion, needsYouTotal, requestsView,
} from './requestsState';

function draft(over: Partial<DraftRequest>): DraftRequest {
  return {
    id: 'r1', title: 'Reorder — AJI BARN', status: 'waiting', routed: 'list',
    routed_because: '3 order lines worth ₱12,400 — at or under the ₱20,000 line (version 2).',
    value_php: 12400, value: '₱12,400', order_lines: 3, unpriced_lines: 0, moves: 2,
    line_php: 20000, requested_by: 'Daniel', note: null, created_at: '2026-09-22T00:00:00Z',
    snapshot_timestamp: '2026-09-22T00:00:00Z', decided_by: null, decided_at: null,
    decision_note: null, replaces: null,
    source_call: { tool: 'get_stock_cover', arguments: { view: 'draft' } }, ...over,
  };
}

const joy: Viewer = {
  username: 'joy', person: 'joy', name: 'Joy', role: 'approver', may_approve: true,
  may_set_line: true, may_link_people: false, sees_all: true,
};
const daniel: Viewer = { ...joy, username: 'daniel', person: 'daniel', name: 'Daniel',
  role: 'requester', may_approve: false, may_set_line: false, sees_all: false };

describe('where a draft lands', () => {
  const under = draft({ id: 'u', routed: 'list' });
  const over = draft({ id: 'o', routed: 'decision', value: '₱31,000', value_php: 31000,
    routed_because: '5 order lines worth ₱31,000 — over the ₱20,000 line (version 2).' });

  it('puts an under-the-line draft in the quiet list and an over-the-line one in decisions', () => {
    const v = requestsView({ status: 'success', result: { requests: [under, over], viewer: joy } });
    expect(v.list.map((r) => r.id)).toEqual(['u']);
    expect(v.decisions.map((r) => r.id)).toEqual(['o']);
    expect(v.accent).toBe(true);
    expect(v.needsYou).toBe(1);
  });

  it('never lets the quiet list wear the accent or raise the count', () => {
    const v = requestsView({ status: 'success', result: { requests: [under], viewer: joy } });
    expect(v.accent).toBe(false);
    expect(v.needsYou).toBe(0);
    expect(v.listHeading).toBe('1 draft under the line');
    expect(v.decisionsHeading).toBe('No draft is waiting on a decision.');
  });

  it('counts a decision only for the person who can make it', () => {
    const v = requestsView({ status: 'success', result: { requests: [over], viewer: daniel } });
    expect(v.mayDecide).toBe(false);
    expect(v.needsYou).toBe(0);
    expect(v.decisions).toHaveLength(1);
  });

  it('draws only waiting drafts', () => {
    const done = draft({ id: 'd', routed: 'decision', status: 'approved' });
    const v = requestsView({ status: 'success', result: { requests: [done], viewer: joy } });
    expect(v.decisions).toEqual([]);
  });

  it('offers Approve · Change · Look into it on a decision', () => {
    expect(Object.values(DECISION_LABELS)).toEqual(['Approve', 'Change', 'Look into it']);
  });
});

describe('not yet loaded is its own state (UI rule 8)', () => {
  it('never says nothing is waiting while loading or after a failure', () => {
    for (const q of [{ status: 'pending' as const }, { status: 'error' as const }]) {
      const v = requestsView(q);
      expect(v.needsYou).toBeUndefined();
      expect(v.accent).toBe(false);
      expect(v.decisionsHeading).not.toMatch(/No draft/);
    }
  });

  it('draws a body without the shape as a failure, never as nothing waiting', () => {
    const v = requestsView({ status: 'success', result: {} as never });
    expect(v.kind).toBe('failed');
    expect(v.needsYou).toBeUndefined();
  });

  it('sums the rail count only when both halves are known', () => {
    expect(needsYouTotal(2, 1)).toBe(3);
    expect(needsYouTotal(undefined, 1)).toBeUndefined();
    expect(needsYouTotal(2, undefined)).toBeUndefined();
    expect(needsYouTotal(0, 0)).toBe(0);
  });
});

describe('the approver changes a draft', () => {
  const lines = [{ product_id: 'p1', quantity: 10 }, { product_id: 'p2', quantity: 3 }];
  it('sends only the lines that moved, as whole numbers', () => {
    expect(changedQuantities(lines, { p1: '6', p2: '3' })).toEqual({ p1: 6 });
    expect(changedQuantities(lines, { p1: '10' })).toBeNull();
    expect(changedQuantities(lines, { p1: '2.5' })).toBeNull();
    expect(changedQuantities(lines, { p2: '0' })).toEqual({ p2: 0 });
  });

  it('asks Bob to look into it without writing a figure of its own', () => {
    const q = lookIntoQuestion(draft({}));
    expect(q).toContain('Reorder — AJI BARN');
    expect(q).not.toMatch(/₱|\d/);
  });
});
