import { describe, expect, it } from 'vitest';
import type { Workflow, WorkflowRun, WorkflowSchedule, WorkflowVersion } from '../../types/workflows';
import { lastRunLine, scheduleLine, workflowView } from './workflowShape';

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
    expect(v.next).toMatch(/past date/);
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
