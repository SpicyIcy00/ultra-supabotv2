import { describe, expect, it } from 'vitest';
import type { Workflow, WorkflowRun, WorkflowSchedule, WorkflowVersion } from '../../types/workflows';
import {
  blocksPromotion, divergence, lastRunLine, listOf, scheduleLine, workflowView,
} from './workflowShape';

function version(over: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'v3', version: 3, created_by: 'ice', created_at: '2026-09-01T00:00:00Z',
    steps: [], parameters: [], intent: null, change_note: null, definitions_version: 4,
    backtested_at: null, backtest_run_id: null, promoted_at: null, promoted_by: null, ...over,
  };
}
function workflow(v: WorkflowVersion | null): Workflow {
  return { id: 'w', name: 'Low stock check', created_by: 'ice', created_at: '', status: 'active', current_version: v };
}
function schedule(over: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: 's', workflow_id: 'w', version_id: 'v3', kind: 'daily', hour: 6, minute: 0,
    days_of_week: [], day_of_month: null, bindings: {}, telegram_chat_ids: [], enabled: true,
    last_slot: null, last_run_at: null, last_status: null, last_error: null, ...over,
  };
}

describe('the stages', () => {
  it('has nothing to say about a workflow with no version except what to do', () => {
    const v = workflowView(workflow(null), []);
    expect(v.stage).toBe('no_version');
    expect(v.nextTo).toBeNull();
  });

  it('names a never-backtested version and points at a backtest', () => {
    const v = workflowView(workflow(version()), []);
    expect(v.stage).toBe('never_backtested');
    expect(v.state).toContain('v3');
    // W4.3 reverses "ask Bob to run it as of a past date": backtesting is a
    // control on the system's own page now, so the line points at the control.
    expect(v.next).toMatch(/Backtest it against a window that has closed/);
  });

  it('sends a backtested, unpromoted version to Inbox', () => {
    const v = workflowView(workflow(version({ backtested_at: '2026-09-02T00:00:00Z' })), []);
    expect(v.stage).toBe('awaiting_promotion');
    expect(v.nextTo).toBe('/inbox');
  });

  it('does not call a promoted workflow manual before its schedules are known', () => {
    const promoted = version({ backtested_at: 'x', promoted_at: 'y' });
    const v = workflowView(workflow(promoted), undefined);
    expect(v.state).toMatch(/Checking/);
    expect(v.state).not.toMatch(/Manual/);
  });

  it('is manual when promoted with no enabled schedule', () => {
    const promoted = version({ backtested_at: 'x', promoted_at: 'y' });
    expect(workflowView(workflow(promoted), []).stage).toBe('manual');
    expect(workflowView(workflow(promoted), [schedule({ enabled: false })]).stage).toBe('manual');
  });

  it('says when and which version it runs, and that nothing is needed', () => {
    const promoted = version({ backtested_at: 'x', promoted_at: 'y' });
    const v = workflowView(workflow(promoted), [schedule()]);
    expect(v.stage).toBe('scheduled');
    expect(v.state).toBe('Runs daily at 06:00 · v3 promoted.');
    expect(v.diverges).toBe(false);
  });

  it('never lets a schedule diverge from the newest version silently', () => {
    const promoted = version({ backtested_at: 'x', promoted_at: 'y' });
    const v = workflowView(workflow(promoted), [schedule({ version_id: 'v2' })]);
    expect(v.diverges).toBe(true);
    expect(v.next).toMatch(/older version/);
  });
});

describe('the words', () => {
  it('describes each schedule kind', () => {
    expect(scheduleLine(schedule())).toBe('daily at 06:00');
    expect(scheduleLine(schedule({ kind: 'weekly', days_of_week: [1], hour: 18, minute: 30 }))).toBe('Mon at 18:30');
    expect(scheduleLine(schedule({ kind: 'weekly', days_of_week: [1, 4] }))).toBe('Mon and Thu at 06:00');
    expect(scheduleLine(schedule({ kind: 'monthly', day_of_month: 1, hour: 7 }))).toBe('the 1st at 07:00');
    expect(scheduleLine(schedule({ kind: 'monthly', day_of_month: 22 }))).toBe('the 22nd at 06:00');
  });

  it('says a run is unknown, absent, or what it was', () => {
    expect(lastRunLine(undefined)).toBe('Checking runs…');
    expect(lastRunLine([])).toBe('Never run.');
    const run: WorkflowRun = { id: 'r', workflow_id: 'w', version_id: 'v3', mode: 'manual', requested_by: 'ice',
      as_of: null, status: 'ok', started_at: '2026-09-07T01:00:00Z', finished_at: null, notices: [] };
    expect(lastRunLine([run])).toBe('Last run ok');
    expect(lastRunLine([{ ...run, mode: 'backtest', status: 'failed' }])).toBe('Last backtest failed');
  });
});

/**
 * W4.3 — divergence with weight, and what stands in front of a promotion.
 *
 * `diverges` had been computed since this file was written and every surface
 * dropped it, so rule 8's notice had no weight anywhere. These two functions
 * are what a page draws instead of folding it into a sentence.
 */
describe('a version divergence, as something to draw', () => {
  const promoted = version({ id: 'v3', backtested_at: 'x', backtest_run_id: 'r', promoted_at: 'y' });

  it('is nothing when the schedules are not known yet, and says so by being null', () => {
    // Not "no divergence" — not yet known. The caller renders that state
    // itself rather than borrowing the loaded one (UI rule 8).
    expect(divergence(workflow(promoted), undefined)).toBeNull();
  });

  it('is nothing when an enabled schedule fires the newest version', () => {
    expect(divergence(workflow(promoted), [schedule({ version_id: 'v3' })])).toBeNull();
  });

  it('ignores a schedule that is switched off, because it fires nothing', () => {
    expect(divergence(workflow(promoted), [schedule({ version_id: 'v1', enabled: false })])).toBeNull();
  });

  it('names which version a run uses, which the schedule fires and why', () => {
    const d = divergence(workflow(promoted), [schedule({ version_id: 'v1' })]);
    expect(d?.ran).toBe(3);
    expect(d?.fires).toEqual([{ scheduleId: 's', version: 'v1', when: 'daily at 06:00' }]);
    expect(d?.why).toMatch(/promoting never repoints one/);
  });

  it('carries every enabled schedule that fires something else', () => {
    const d = divergence(workflow(promoted), [
      schedule({ id: 'a', version_id: 'v1' }),
      schedule({ id: 'b', version_id: 'v2', kind: 'weekly', days_of_week: [1] }),
      schedule({ id: 'c', version_id: 'v3' }),
    ]);
    expect(d?.fires.map((f) => f.scheduleId)).toEqual(['a', 'b']);
  });
});

describe('what stands between a version and running unattended', () => {
  it('names the backtest first, because that is the order the gate applies', () => {
    expect(blocksPromotion(version(), { mayPromote: true })).toMatch(/Never backtested/);
  });

  it('does not let a backtest be enough on its own for somebody who may not promote', () => {
    const v = version({ backtested_at: 'x', backtest_run_id: 'r' });
    expect(blocksPromotion(v, { mayPromote: false, administrators: ['Isaiah'] }))
      .toBe('Only Isaiah can promote a version.');
  });

  it('sends a person to Bob rather than to an office nobody is attached to', () => {
    const v = version({ backtested_at: 'x', backtest_run_id: 'r' });
    const said = blocksPromotion(v, { mayPromote: false }) ?? '';
    expect(said).toMatch(/Ask Bob who/);
    expect(said).not.toMatch(/^Only an administrator/);
  });

  it('lets a backtested version be promoted by somebody who holds it', () => {
    const v = version({ backtested_at: 'x', backtest_run_id: 'r' });
    expect(blocksPromotion(v, { mayPromote: true })).toBeNull();
  });

  it('says nothing is left to do about one already promoted', () => {
    const v = version({ backtested_at: 'x', backtest_run_id: 'r', promoted_at: 'y' });
    expect(blocksPromotion(v, { mayPromote: true })).toBe('Already promoted.');
  });

  it('does not decide before it knows who is asking', () => {
    const v = version({ backtested_at: 'x', backtest_run_id: 'r' });
    expect(blocksPromotion(v, undefined)).toMatch(/Checking/);
  });

  it('names people the way a person would', () => {
    expect(listOf(['Isaiah'])).toBe('Isaiah');
    expect(listOf(['Isaiah', 'Joy'])).toBe('Isaiah and Joy');
    expect(listOf(['Isaiah', 'Joy', 'Daniel'])).toBe('Isaiah, Joy and Daniel');
  });
});

describe('what to do about a divergence', () => {
  const promotedNewest = version({ id: 'v3', backtested_at: 'x', backtest_run_id: 'r', promoted_at: 'y' });

  it('does not offer "promote the newest" when the newest is already promoted', () => {
    // W4.3, seen in a frame: v2 promoted, the schedule still firing v1, and
    // the page offering an act nobody could perform. Promoting never repoints
    // a schedule (rule 8), so repointing is the only thing that ends it.
    const v = workflowView(workflow(promotedNewest), [schedule({ version_id: 'v1' })]);
    expect(v.diverges).toBe(true);
    expect(v.next).toMatch(/Repoint it/);
    expect(v.next).not.toMatch(/Promote the newest/);
  });

  it('is at the promotion gate, not the divergence, when the newest was never promoted', () => {
    const newer = version({ id: 'v3', backtested_at: 'x', backtest_run_id: 'r' });
    const v = workflowView(workflow(newer), [schedule({ version_id: 'v1' })]);
    expect(v.stage).toBe('awaiting_promotion');
  });
});
