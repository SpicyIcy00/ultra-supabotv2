/**
 * The approval queue's presentation, held to UI rules 5 and 8.
 *
 * These are the assertions that keep the bug from coming back. The rail once
 * said "Nothing needs you" from a literal while one version genuinely waited
 * in production, so the cases below are written against that failure directly:
 * an unloaded state may never claim an empty one, and the approvals colour may
 * only be worn by rows that actually came back.
 */
import { describe, expect, it } from 'vitest';
import type { Approval } from '../../types/workflows';
import {
  approvalsView,
  attentionAccent,
  attentionLabel,
  type ApprovalQuery,
} from './approvalState';

function approval(over: Partial<Approval> = {}): Approval {
  return {
    workflow_id: '11111111-1111-1111-1111-111111111111',
    name: 'Monday replenishment',
    version: 2,
    version_id: '22222222-2222-2222-2222-222222222222',
    created_by: 'ice',
    created_at: '2026-09-03T09:00:00+00:00',
    backtested_at: null,
    blocked_on:
      'Never backtested. Run it against a past window and look at what it would have produced.',
    ...over,
  };
}

/**
 * Everything the rail could say when it has nothing to show. The empty state's
 * own wording is excluded — that is the phrase the other states must not use.
 */
const EMPTY_CLAIMS = ['nothing needs you', 'no workflow version is waiting'];

describe('approvalsView — not-yet-loaded is its own state (UI rule 8)', () => {
  it('while pending, does not claim the queue is empty', () => {
    const view = approvalsView({ status: 'pending' });
    expect(view.kind).toBe('loading');
    for (const claim of EMPTY_CLAIMS) {
      expect(view.heading.toLowerCase()).not.toContain(claim);
      expect((view.detail ?? '').toLowerCase()).not.toContain(claim);
    }
  });

  it('while pending, reports an UNKNOWN count rather than zero', () => {
    // The heart of it: 0 is a fact about the world, and we do not have one.
    expect(approvalsView({ status: 'pending' }).count).toBeNull();
  });

  it('on failure, says the lookup failed and does not claim the queue is empty', () => {
    const view = approvalsView({ status: 'error' });
    expect(view.kind).toBe('failed');
    expect(view.heading.toLowerCase()).toContain('could not load');
    for (const claim of EMPTY_CLAIMS) {
      expect(view.heading.toLowerCase()).not.toContain(claim);
      expect((view.detail ?? '').toLowerCase()).not.toContain(claim);
    }
  });

  it('on failure, reports an UNKNOWN count rather than zero', () => {
    expect(approvalsView({ status: 'error' }).count).toBeNull();
  });

  it('claims an empty queue ONLY after a successful, empty load', () => {
    const view = approvalsView({ status: 'success', approvals: [] });
    expect(view.kind).toBe('empty');
    expect(view.heading).toBe('Nothing needs you.');
    expect(view.count).toBe(0);
  });
});

describe('approvalsView — one colour means "needs you" (UI rule 5)', () => {
  it('does not wear the accent while loading', () => {
    expect(approvalsView({ status: 'pending' }).accent).toBe(false);
  });

  it('does not wear the accent on failure — a failed lookup is not an approval', () => {
    expect(approvalsView({ status: 'error' }).accent).toBe(false);
  });

  it('does not wear the accent on an empty queue', () => {
    expect(approvalsView({ status: 'success', approvals: [] }).accent).toBe(false);
  });

  it('wears the accent only for rows that came back from the server', () => {
    const view = approvalsView({ status: 'success', approvals: [approval()] });
    expect(view.kind).toBe('rows');
    expect(view.accent).toBe(true);
  });

  it('is the ONLY state that may wear it', () => {
    const every: ApprovalQuery[] = [
      { status: 'pending' },
      { status: 'error' },
      { status: 'success', approvals: [] },
      { status: 'success', approvals: [approval()] },
    ];
    const wearing = every
      .map((q) => approvalsView(q))
      .filter((v) => v.accent)
      .map((v) => v.kind);
    expect(wearing).toEqual(['rows']);
  });
});

describe('approvalsView — the rows', () => {
  it('counts what came back', () => {
    const rows = [approval(), approval({ version: 3 }), approval({ version: 4 })];
    const view = approvalsView({ status: 'success', approvals: rows });
    expect(view.count).toBe(3);
    expect(view.rows).toHaveLength(3);
  });

  it('passes blocked_on through VERBATIM and never rewrites it', () => {
    // The server distinguishes "never backtested" from "waiting on an admin",
    // and those have different fixes. Summarising both would destroy it.
    const waiting = 'Backtested and waiting for an administrator to promote it.';
    const rows = [approval(), approval({ backtested_at: '2026-09-04T01:00:00+00:00', blocked_on: waiting })];
    const view = approvalsView({ status: 'success', approvals: rows });
    expect(view.rows.map((r) => r.blocked_on)).toEqual([rows[0].blocked_on, waiting]);
  });

  it('keeps the two blocking reasons distinct', () => {
    const view = approvalsView({ status: 'success', approvals: [approval()] });
    expect(view.rows[0].blocked_on).toContain('Never backtested');
    expect(view.rows[0].backtested_at).toBeNull();
  });

  it('reads singular for one and plural for more', () => {
    expect(approvalsView({ status: 'success', approvals: [approval()] }).heading)
      .toBe('1 version needs you');
    expect(approvalsView({ status: 'success', approvals: [approval(), approval()] }).heading)
      .toBe('2 versions need you');
  });
});

describe('attentionLabel — the button announces the same three states', () => {
  it('an unknown count never announces as "nothing"', () => {
    expect(attentionLabel(null)).toBe('Checking whether anything needs you');
    expect(attentionLabel(null).toLowerCase()).not.toContain('nothing needs you');
  });

  it('a known empty queue announces as nothing', () => {
    expect(attentionLabel(0)).toBe('Nothing needs you');
  });

  it('counts, singular and plural', () => {
    expect(attentionLabel(1)).toBe('1 version needs you');
    expect(attentionLabel(4)).toBe('4 versions need you');
  });
});

describe('attentionAccent — the badge', () => {
  it('is absent while the count is unknown', () => {
    expect(attentionAccent(null)).toBe(false);
  });

  it('is absent on a known empty queue', () => {
    expect(attentionAccent(0)).toBe(false);
  });

  it('appears only for a known, positive count', () => {
    expect(attentionAccent(1)).toBe(true);
    expect(attentionAccent(9)).toBe(true);
  });
});
