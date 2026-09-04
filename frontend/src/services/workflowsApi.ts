/**
 * Workflows API — for now, the approval queue.
 *
 * Bare axios, matching pinsApi, chatsApi and greetingApi: the auth interceptors
 * are installed on both the shared instance and global axios (see httpAuth.ts).
 * Relative base for the same reason as everywhere else — same-origin through
 * the proxy, so no CORS preflight in production.
 *
 * Behind the same require_page("george") gate as every other George route, so
 * this needs no credential the app is not already carrying.
 */
import axios from 'axios';
import type { Approval } from '../types/workflows';

const API_BASE = '/api/v1/george/workflows';

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
