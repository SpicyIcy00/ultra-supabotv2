/**
 * /inbox — what needs a decision.
 *
 * A DECISION SURFACE, NOT WORKFLOW MANAGEMENT. The queue has one kind of
 * occupant — a workflow version waiting to be promoted past the backtest
 * gate (CLAUDE.md UI rule 5, named 2026-09-03) — and this page offers the
 * one decision that occupant needs: promote it. Versions, schedules,
 * backtests and history belong to /workflows; a row here links there to
 * review, and nothing here edits anything.
 *
 * THE ONLY ACCENT IN THE APP THAT IS AN ACTION. The row's rule and the
 * Promote button wear the approvals colour, because this is what the colour
 * is for. Only a loaded, non-empty queue may wear it (approvalState); a
 * failed lookup and an empty queue are both navy, and the three unknowns
 * each say so in their own words (UI rule 8).
 *
 * Promotion is an administrator's act, and the server enforces that in
 * workflow_writer and again by a CHECK constraint. The button is shown only
 * to administrators so the page does not offer a decision the person cannot
 * make; a refusal from the server is rendered verbatim, because its wording
 * distinguishes "never backtested" from "not an administrator" from "the
 * window has not closed", and those have different fixes.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsView } from '../components/george/approvalState';
import { SHELL_COLUMN } from '../components/shell/shellLayout';
import { errorMessage } from '../services/pinsApi';
import { listApprovals, promoteVersion } from '../services/workflowsApi';
import { useAuthStore } from '../stores/authStore';
import type { Approval } from '../types/workflows';

function manila(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

function ApprovalRow({ approval, admin }: { approval: Approval; admin: boolean }) {
  const qc = useQueryClient();
  const [refused, setRefused] = useState<string | null>(null);
  const promote = useMutation({
    mutationFn: () => promoteVersion(approval.workflow_id, approval.version),
    onSuccess: () => {
      setRefused(null);
      qc.invalidateQueries({ queryKey: ['workflow-approvals'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => setRefused(errorMessage(err)),
  });

  return (
    <li className="border-l-2 border-george-accent py-3 pl-4">
      <p className="text-[15px] leading-snug text-george-navy">
        {approval.name}{' '}
        <span className="tabular-nums text-george-slate">v{approval.version}</span>
      </p>
      {/* The server's words, verbatim. */}
      <p className="mt-1 text-[13px] leading-relaxed text-george-slate">{approval.blocked_on}</p>
      <p className="mt-1.5 text-[11px] text-george-muted">
        saved by {approval.created_by} · {manila(approval.created_at)}
        {' · '}backtested {manila(approval.backtested_at)}
      </p>

      {refused && (
        <p className="mt-2 text-[13px] leading-relaxed text-george-navy">{refused}</p>
      )}

      <div className="mt-2.5 flex items-center gap-4">
        {admin && approval.backtested_at && (
          <button
            type="button"
            onClick={() => promote.mutate()}
            disabled={promote.isPending}
            className="min-h-touch rounded-lg bg-george-accent px-3.5 text-[13px] text-george-cream disabled:opacity-60"
          >
            {promote.isPending ? 'Promoting…' : 'Promote'}
          </button>
        )}
        <Link
          to="/workflows"
          className="min-h-touch text-[13px] leading-[44px] text-george-slate hover:text-george-navy"
        >
          Review in Workflows
        </Link>
        {!admin && (
          <span className="text-[12px] text-george-muted">An administrator promotes.</span>
        )}
      </div>
    </li>
  );
}

export default function InboxPage() {
  const admin = useAuthStore((s) => s.isAdmin());
  const approvals = useQuery({
    queryKey: ['workflow-approvals'],
    queryFn: () => listApprovals(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const view = approvalsView(
    approvals.isPending
      ? { status: 'pending' }
      : approvals.isError
        ? { status: 'error' }
        : { status: 'success', approvals: approvals.data ?? [] },
  );

  return (
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-8 md:px-8 md:pt-12`}>
      <h1 className="font-george-serif text-2xl text-george-navy">Inbox</h1>

      <p
        className={`mt-6 text-[14px] leading-relaxed ${
          view.accent ? 'text-george-accent' : 'text-george-slate'
        }`}
      >
        {view.heading}
      </p>
      {view.detail && (
        <p className="mt-1 text-[13px] leading-relaxed text-george-muted">{view.detail}</p>
      )}

      {view.kind === 'rows' && (
        <ul className="mt-6 space-y-4">
          {view.rows.map((a) => (
            <ApprovalRow key={a.version_id} approval={a} admin={admin} />
          ))}
        </ul>
      )}
    </div>
  );
}
