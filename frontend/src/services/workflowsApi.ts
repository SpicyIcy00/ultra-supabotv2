/**
 * Workflows API — the approval queue, and the reads the Workflows page needs.
 *
 * Bare axios, matching pinsApi, chatsApi and greetingApi: the auth interceptors
 * are installed on both the shared instance and global axios (see httpAuth.ts).
 * Relative base for the same reason as everywhere else — same-origin through
 * the proxy, so no CORS preflight in production.
 *
 * Behind the same require_page("bob") gate as every other Bob route, so
 * this needs no credential the app is not already carrying.
 */
import axios from 'axios';
import type {
  Approval,
  Workflow,
  WorkflowRun,
  WorkflowSchedule,
  WorkflowVersion,
} from '../types/workflows';

const API_BASE = '/api/v1/bob/workflows';

/**
 * The versions waiting on a person.
 *
 * A version with no backtest is IN this list, not absent from it — the thing
 * waiting on somebody is the same either way, and the server says which in
 * `blocked_on`.
 */
export const listApprovals = async (): Promise<Approval[]> => {
  const { data } = await axios.get<Approval[]>(`${API_BASE}/approvals`);
  return data;
};

/**
 * Promote one version past the backtest gate — the approval queue's action.
 *
 * Administrators only, and only after a backtest of a window that has closed;
 * the server enforces both (workflow_writer) and a CHECK constraint enforces
 * them again. A refusal arrives as a 4xx whose detail says which, and the
 * caller renders it verbatim.
 */
export const promoteVersion = async (workflowId: string, version: number): Promise<void> => {
  await axios.post(`${API_BASE}/${workflowId}/promote`, null, { params: { version } });
};

/** Every workflow, newest first. Org-level: not scoped to the caller. */
export const listWorkflows = async (): Promise<Workflow[]> => {
  const { data } = await axios.get<Workflow[]>(API_BASE);
  return data;
};

export const listSchedules = async (workflowId: string): Promise<WorkflowSchedule[]> => {
  const { data } = await axios.get<WorkflowSchedule[]>(`${API_BASE}/${workflowId}/schedules`);
  return data;
};

/** Run history, newest first, without step results. */
export const listRuns = async (workflowId: string, limit = 3): Promise<WorkflowRun[]> => {
  const { data } = await axios.get<WorkflowRun[]>(`${API_BASE}/${workflowId}/runs`, {
    params: { limit },
  });
  return data;
};

/* ---------------------------------------------------------------------------
 * ONE SYSTEM, AND THE FOUR ACTS (W4.3)
 *
 * Every endpoint below has existed on the server since the workflows feature
 * landed; none of them had a client, so `promoteVersion` above was the only
 * write in the whole frontend and it was reachable from one place. That is
 * how the owner came to be told an administrator must promote Morning Runout
 * on a screen with no way to promote anything.
 *
 * RULE 7 IS ENFORCED ON THE SERVER AND NOWHERE ELSE. These are clients: a
 * refusal arrives as a 4xx whose detail says which gate refused, and the
 * caller renders it verbatim rather than guessing ahead of it.
 * ------------------------------------------------------------------------- */

/** One system, with its newest version. */
export const getWorkflow = async (workflowId: string): Promise<Workflow> => {
  const { data } = await axios.get<Workflow>(`${API_BASE}/${workflowId}`);
  return data;
};

/** Every version, newest first. Versions are immutable, so this is a history. */
export const listVersions = async (workflowId: string): Promise<WorkflowVersion[]> => {
  const { data } = await axios.get<WorkflowVersion[]>(`${API_BASE}/${workflowId}/versions`);
  return data;
};

/**
 * Run a version now, or BACKTEST it against a past Manila date.
 *
 * `asOf` is what makes it a backtest: the server records it against the
 * version, and that record is what a promotion later rests on. A date that is
 * not past is refused there, not here — `backtest_must_be_past`.
 */
export const runWorkflow = async (
  workflowId: string,
  opts: { version?: number; asOf?: string | null } = {},
): Promise<{ run_id?: string; status?: string; [k: string]: unknown }> => {
  const { data } = await axios.post(`${API_BASE}/${workflowId}/run`, {
    bindings: {},
    ...(opts.version ? { version: opts.version } : {}),
    ...(opts.asOf ? { as_of: opts.asOf } : {}),
  });
  return data;
};

/** One run in full: every step, its receipts and its notices. */
export const getRun = async (
  workflowId: string, runId: string,
): Promise<Record<string, unknown>> => {
  const { data } = await axios.get(`${API_BASE}/${workflowId}/runs/${runId}`);
  return data;
};

/**
 * Switch a schedule on or off, or point it at a different version.
 *
 * Switching one ON is the moment unattended execution begins, so the server
 * requires the pinned version to be promoted. Repointing is the act that ENDS
 * a divergence, and it is separate from promoting on purpose: approving a
 * version must never silently change what a schedule fires (CLAUDE.md rule 8).
 */
export const updateSchedule = async (
  workflowId: string, scheduleId: string,
  change: { enabled?: boolean; version?: number },
): Promise<WorkflowSchedule> => {
  const { data } = await axios.patch<WorkflowSchedule>(
    `${API_BASE}/${workflowId}/schedules/${scheduleId}`, change,
  );
  return data;
};
