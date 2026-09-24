// @vitest-environment jsdom
/**
 * W4.3's done-when, on the page it is about.
 *
 * The owner, 2026-09-23, of a screen saying "Morning Runout is switched off
 * and not mine to switch on": *"how do i turn it on and what its telling me to
 * do?"* From one system's own page he must be able to read its versions and
 * its runs, backtest a version, promote it if he may, and switch a schedule
 * on — each act honouring rule 7, which is the thing this page DRAWS rather
 * than the thing it routes around.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Workflow, WorkflowRun, WorkflowSchedule, WorkflowVersion } from '../types/workflows';
import SystemPage, { lastClosedDay } from './SystemPage';

vi.mock('../room/RoomShell', () => ({
  RoomHead: ({ title, says }: { title: string; says?: string }) => (
    <header><h1>{title}</h1>{says && <p>{says}</p>}</header>
  ),
}));
vi.mock('../hooks/useHere', () => ({ useRegisterHere: (h: unknown) => { here = h; } }));

let here: unknown = null;
let admin = true;
vi.mock('../stores/authStore', () => ({
  useAuthStore: (pick: (s: { isAdmin: () => boolean }) => unknown) => pick({ isAdmin: () => admin }),
}));

const run = vi.fn(async () => ({ status: 'ok' }));
const promote = vi.fn(async () => undefined);
const patch = vi.fn(async () => schedules[0]);
let versions: WorkflowVersion[] = [];
let schedules: WorkflowSchedule[] = [];
let runs: WorkflowRun[] = [];
let workflow: Workflow;

vi.mock('../services/workflowsApi', () => ({
  getWorkflow: async () => workflow,
  listVersions: async () => versions,
  listSchedules: async () => schedules,
  listRuns: async () => runs,
  getRun: async () => ({ steps: [{ name: 'the levels', tool: 'get_stock_cover', status: 'ok' }] }),
  runWorkflow: (...a: unknown[]) => run(...(a as [])),
  promoteVersion: (...a: unknown[]) => promote(...(a as [])),
  updateSchedule: (...a: unknown[]) => patch(...(a as [])),
}));

function version(over: Partial<WorkflowVersion> = {}): WorkflowVersion {
  return {
    id: 'v1id', version: 1, created_by: 'admin', created_at: '2026-09-20T01:00:00Z',
    steps: [{ name: 'the levels', tool: 'get_stock_cover', arguments: {}, why: null }],
    parameters: [], intent: 'What runs out tomorrow.', change_note: null,
    definitions_version: 4, backtested_at: null, backtest_run_id: null,
    promoted_at: null, promoted_by: null, ...over,
  };
}
function schedule(over: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: 's1', workflow_id: 'w1', version_id: 'v1id', kind: 'daily', hour: 7, minute: 0,
    days_of_week: [], day_of_month: null, bindings: {}, telegram_chat_ids: [],
    enabled: false, last_slot: null, last_run_at: null, last_status: null,
    last_error: null, ...over,
  };
}

beforeEach(() => {
  admin = true;
  here = null;
  const v = version();
  versions = [v];
  workflow = { id: 'w1', name: 'Morning Runout', created_by: 'admin', created_at: '',
               status: 'active', current_version: v };
  schedules = [schedule()];
  runs = [];
});
afterEach(() => { cleanup(); run.mockClear(); promote.mockClear(); patch.mockClear(); });

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/workflows/w1']}>
        <Routes><Route path="/workflows/:workflowId" element={<SystemPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// The four acts
// ---------------------------------------------------------------------------

describe('the four acts are on the system\'s own page', () => {
  it('runs it now against the newest version', async () => {
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'Run it now' }));
    await waitFor(() => expect(run).toHaveBeenCalledWith('w1', {}));
    expect(await screen.findByText(/Ran — ok\./)).toBeTruthy();
  });

  it('backtests a version as of a day that has CLOSED', async () => {
    page();
    const field = await screen.findByLabelText('backtest as of') as HTMLInputElement;
    // Rule 7: `backtest_must_be_past`. The field will not offer today, so
    // nobody discovers the rule from a 409.
    expect(field.max).toBe(lastClosedDay());
    expect(field.value).toBe(lastClosedDay());
    fireEvent.click(screen.getByRole('button', { name: 'Backtest' }));
    await waitFor(() => expect(run).toHaveBeenCalledWith('w1', { asOf: lastClosedDay() }));
  });

  it('switches a schedule on, and says which version it fires', async () => {
    versions = [version({ backtested_at: 'x', backtest_run_id: 'r', promoted_at: 'y' })];
    workflow = { ...workflow, current_version: versions[0] };
    page();
    expect(await screen.findByText('Fires v1.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Switch on' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('w1', 's1', { enabled: true }));
  });
});

// ---------------------------------------------------------------------------
// Rule 7: the gate, given a surface
// ---------------------------------------------------------------------------

describe('rule 7 is what the page draws', () => {
  it('will not promote a version that has never been backtested', async () => {
    page();
    const button = await screen.findByRole('button', { name: 'Promote' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Never backtested/)).toBeTruthy();
    fireEvent.click(button);
    expect(promote).not.toHaveBeenCalled();
  });

  it('promotes a backtested version and says which backtest it rests on', async () => {
    versions = [version({ backtested_at: '2026-09-21T01:00:00Z', backtest_run_id: 'r1' })];
    workflow = { ...workflow, current_version: versions[0] };
    page();
    const button = await screen.findByRole('button', { name: 'Promote' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/on the backtest of /)).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(promote).toHaveBeenCalledWith('w1', 1));
  });

  it('does not offer promotion to somebody who does not hold it, and does not send them to an office', async () => {
    admin = false;
    versions = [version({ backtested_at: '2026-09-21T01:00:00Z', backtest_run_id: 'r1' })];
    workflow = { ...workflow, current_version: versions[0] };
    page();
    const button = await screen.findByRole('button', { name: 'Promote' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // The old screen said "an administrator" with nobody attached. This one
    // sends the person to Bob, who has the names.
    expect(screen.getByText(/Ask Bob who/)).toBeTruthy();
  });

  it('cannot switch on a schedule whose pinned version is not promoted', async () => {
    page();
    const button = await screen.findByRole('button', { name: 'Switch on' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/that is the gate, not this switch/)).toBeTruthy();
    fireEvent.click(button);
    expect(patch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rule 8: divergence has weight
// ---------------------------------------------------------------------------

describe('a version divergence is drawn', () => {
  it('names which version ran, which the schedule fires and why', async () => {
    const older = version({ id: 'v1id', version: 1, backtested_at: 'x',
                            backtest_run_id: 'r', promoted_at: 'y' });
    const newer = version({ id: 'v2id', version: 2, backtested_at: 'x',
                            backtest_run_id: 'r2', promoted_at: 'z' });
    versions = [newer, older];
    workflow = { ...workflow, current_version: newer };
    schedules = [schedule({ enabled: true, version_id: 'v1id' })];
    page();
    expect(await screen.findByText('version divergence')).toBeTruthy();
    expect(screen.getByText(/A run you start here uses v2\./)).toBeTruthy();
    expect(screen.getByText(/Daily at 07:00 fires v1/)).toBeTruthy();
    expect(screen.getByText(/promoting never repoints one/)).toBeTruthy();
  });

  it('says nothing when the schedule fires the newest version', async () => {
    versions = [version({ backtested_at: 'x', backtest_run_id: 'r', promoted_at: 'y' })];
    workflow = { ...workflow, current_version: versions[0] };
    schedules = [schedule({ enabled: true })];
    page();
    await screen.findByText('Morning Runout');
    expect(screen.queryByText('version divergence')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// What the page reads, and what it says about what it has not read
// ---------------------------------------------------------------------------

describe('the records, and the three renderings', () => {
  it('opens a run and shows its steps', async () => {
    runs = [{ id: 'run1', workflow_id: 'w1', version_id: 'v1id', mode: 'run',
              requested_by: 'admin', as_of: null, status: 'ok',
              started_at: '2026-09-22T01:00:00Z', finished_at: '2026-09-22T01:01:00Z',
              notices: [] }];
    page();
    fireEvent.click(await screen.findByRole('button', { name: 'open the receipts' }));
    expect(await screen.findByText('the levels')).toBeTruthy();
  });

  it('says "never run" only from a loaded, empty result', async () => {
    page();
    expect(await screen.findByText('Never run.')).toBeTruthy();
  });

  it('stamps every record with its own time', async () => {
    // UI rule 6: no number displays without a timestamp. The version number
    // carries when it was saved; the schedule carries when it last ran.
    const { container } = page();
    await screen.findByText('What runs out tomorrow.');
    const stamps = () => [...container.querySelectorAll('.r-src')]
      .map((n) => n.textContent ?? '');
    await waitFor(() => expect(stamps().some((s) => /saved Sep 20/.test(s))).toBe(true));
    expect(stamps().some((s) => /has never run/.test(s))).toBe(true);
  });

  it('tells Bob what the page is, so "switch this on" has a referent', async () => {
    page();
    await screen.findByText('Morning Runout');
    await waitFor(() => expect(here).toEqual({
      key: 'workflows', label: 'Morning Runout', subjects: ['Morning Runout'],
    }));
  });

  it('never wears the approvals colour', async () => {
    const { container } = page();
    await screen.findByText('Morning Runout');
    // UI rule 5: one colour means "needs you". Promote here is an act on the
    // company's rule, not an approval — `accentUse.test.ts` holds the source,
    // this holds the rendering.
    expect(container.querySelector('.r-do')).toBeNull();
    expect(container.querySelector('.r-chip--needs')).toBeNull();
  });
});
