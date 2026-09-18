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
