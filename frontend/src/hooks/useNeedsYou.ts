/**
 * "Needs you", as one count from two loaded results (W2.2).
 *
 * The rail and his mark counted workflow versions waiting on promotion. A
 * draft that arrived as a DECISION needs the approver too, so it counts — for
 * an approver only, and a draft that landed in the list quietly never does.
 * `undefined` until both have loaded (UI rule 8): a count with a hole in it
 * is a claim nobody looked for.
 */
import { useQuery } from '@tanstack/react-query';
import { requestsView, needsYouTotal } from '../components/bob/requestsState';
import { listRequests } from '../services/authorityApi';
import { listApprovals } from '../services/workflowsApi';

export const REQUESTS_KEY = ['authority-requests'] as const;

export function useNeedsYou(): number | undefined {
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
    retry: false,
  });
  const requests = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => listRequests('waiting'),
    staleTime: 30_000,
    retry: false,
  });
  const decisions = requestsView(
    requests.isPending ? { status: 'pending' }
      : requests.isError ? { status: 'error' }
        : { status: 'success', result: requests.data },
  ).needsYou;
  return needsYouTotal(approvals.data?.length, decisions);
}
