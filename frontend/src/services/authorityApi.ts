/**
 * What reaches the approver (W2.2): the line, the people, and the queue.
 *
 * Bare axios, as workflowsApi is. A refusal is a 4xx whose detail is the
 * server's sentence ("Only Joy can approve a request."), rendered verbatim by
 * the caller — the wording distinguishes refusals with different fixes.
 * Nothing here sends anything: an approved draft is keyed into StoreHub by a
 * person.
 */
import axios from 'axios';
import type { AuthorityState, DraftRequest, RequestsResult } from '../types/authority';

const API_BASE = '/api/v1/bob/authority';

export const getAuthority = async (): Promise<AuthorityState> => {
  const { data } = await axios.get<AuthorityState>(API_BASE);
  return data;
};

export const listRequests = async (status = 'waiting'): Promise<RequestsResult> => {
  const { data } = await axios.get<RequestsResult>(`${API_BASE}/requests`, { params: { status } });
  return data;
};

export type DecisionAction = 'approve' | 'reject' | 'change';

export const decideRequest = async (
  id: string,
  action: DecisionAction,
  opts: { note?: string; quantities?: Record<string, number> } = {},
): Promise<DraftRequest> => {
  const { data } = await axios.post<DraftRequest>(`${API_BASE}/requests/${id}/decide`, {
    action, note: opts.note, quantities: opts.quantities,
  });
  return data;
};

export const setLine = async (body: {
  mode?: string; line_php?: number | null; said: string;
}): Promise<AuthorityState> => {
  const { data } = await axios.put<AuthorityState>(`${API_BASE}/line`, body);
  return data;
};

export const linkPerson = async (person: string, username: string | null): Promise<AuthorityState> => {
  const { data } = await axios.put<AuthorityState>(`${API_BASE}/people/${person}`, { username });
  return data;
};
