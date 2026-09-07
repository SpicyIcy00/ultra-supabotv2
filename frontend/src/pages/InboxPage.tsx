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
 * HIERARCHY IS THE NAME, THEN THE BLOCK, THEN THE PROVENANCE. The version's
 * name is set as a heading because it is the thing being decided about; what
 * is blocking it is prose, because it is a sentence the server wrote and the
 * reader has to act on; who saved it and when is metadata and reads as such.
 * Three levels, no card around them.
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
import { PageHeader } from '../components/shell/PageHeader';
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
    <li className="border-l-2 border-george-accent py-1 pl-5">
      <h2 className="font-george-serif text-[20px] leading-snug text-george-navy">
        {approval.name}{' '}
        <span className="text-[15px] tabular-nums text-george-slate">v{approval.version}</span>
      </h2>

      {/* The server's words, verbatim: it distinguishes reasons that have
          different fixes, and a client that paraphrased would lose that. */}
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-george-navy">
        {approval.blocked_on}
      </p>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[12px] text-george-muted">
        <div className="flex gap-1.5">
          <dt>saved</dt>
          <dd className="text-george-slate">{manila(approval.created_at)} · {approval.created_by}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>backtested</dt>
          <dd className="text-george-slate">{manila(approval.backtested_at)}</dd>
        </div>
      </dl>

      {refused && (
        <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-george-navy">{refused}</p>
      )}

      <div className="mt-4 flex items-center gap-5">
        {admin && approval.backtested_at && (
          <button
            type="button"
            onClick={() => promote.mutate()}
            disabled={promote.isPending}
            className="min-h-touch rounded-lg bg-george-accent px-4 text-[13px] text-george-cream disabled:opacity-60"
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
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
      <PageHeader
        title="Inbox"
        meta="Decisions waiting on a person. A version that has been backtested can be promoted here; everything else about a workflow lives in Workflows."
      />

      {/* Loading, failed and empty are three renderings, and the first two
          may never borrow the third's words (UI rule 8). approvalsView
          decides which; this places it. */}
      <p
        className={`text-[15px] leading-relaxed ${
          view.accent ? 'text-george-accent' : 'text-george-slate'
        }`}
      >
        {view.heading}
      </p>
      {view.detail && (
        <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-george-muted">
          {view.detail}
        </p>
      )}

      {view.kind === 'rows' && (
        <ul className="mt-8 space-y-10">
          {view.rows.map((a) => (
            <ApprovalRow key={a.version_id} approval={a} admin={admin} />
          ))}
        </ul>
      )}
    </div>
  );
}
