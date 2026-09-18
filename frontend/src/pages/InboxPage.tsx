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
import { approvalsView } from '../components/bob/approvalState';
import { RoomHead } from '../room/RoomShell';
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
    <li className="r-item">
      <h2 className="r-item-name">
        {approval.name}{' '}
        <span style={{ color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
          v{approval.version}
        </span>
      </h2>

      {/* The server's words, verbatim: it distinguishes reasons that have
          different fixes, and a client that paraphrased would lose that. */}
      <p className="r-note" style={{ marginTop: 8 }}>{approval.blocked_on}</p>

      <p className="r-src" style={{ marginTop: 10 }}>
        saved {manila(approval.created_at)} · {approval.created_by}
        {' · '}backtested {manila(approval.backtested_at)}
      </p>

      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}

      <div className="r-row-acts">
        {admin && approval.backtested_at && (
          <button type="button" className="r-do" onClick={() => promote.mutate()}
                  disabled={promote.isPending}>
            {promote.isPending ? 'Promoting…' : 'Promote'}
          </button>
        )}
        <Link to="/workflows" className="r-act">Review in Workflows</Link>
        {!admin && <span className="r-src">An administrator promotes.</span>}
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
    <>
      <RoomHead
        title="Needs you"
        says="Decisions waiting on a person. A version that has been backtested can be promoted here; everything else about a workflow lives under Running."
      />

      {/* Loading, failed and empty are three renderings, and the first two
          may never borrow the third's words (UI rule 8). approvalsView
          decides which; this places it. The heading wears the approvals
          colour only when the queue is loaded and something is in it. */}
      <div className="r-empty">
        {view.accent
          ? <span className="r-chip r-chip--needs">{view.heading}</span>
          : <p className="r-say">{view.heading}</p>}
        {view.detail && <p className="r-note" style={{ marginTop: 10 }}>{view.detail}</p>}
      </div>

      {view.kind === 'rows' && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {view.rows.map((a) => (
            <ApprovalRow key={a.version_id} approval={a} admin={admin} />
          ))}
        </ul>
      )}
    </>
  );
}
