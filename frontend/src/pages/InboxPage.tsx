/**
 * /inbox — what needs a decision.
 *
 * A DECISION SURFACE, NOT WORKFLOW MANAGEMENT. It has two kinds of occupant:
 *
 *   1. DRAFTS (W2.2, STANDARD §15). A reorder or a supplier order put through
 *      the approver's line. One over the line — or with no line, or with a
 *      line that has no cost on file — ARRIVES AS A DECISION with Approve ·
 *      Change · Look into it. One at or under it LANDS IN THE LIST quietly:
 *      no accent, no count, still waiting for a yes. Where each went is the
 *      server's `routed`; the value and the sentence saying why are the
 *      server's words, drawn verbatim. NOTHING IS SENT from here: an approved
 *      draft is keyed into StoreHub by a person.
 *   2. WORKFLOW VERSIONS waiting to be promoted past the backtest gate.
 *
 * THE ONLY ACCENT IN THE APP THAT IS AN ACTION. A decision's chip and its
 * Approve wear the approvals colour, and so do Promote and the queue's
 * heading — because this is what the colour is for. The list never does, and
 * only a loaded, non-empty result may (approvalState, requestsState); a
 * failed lookup and an empty queue are both navy, and the three unknowns each
 * say so in their own words (UI rule 8).
 *
 * Who may decide is the server's: an approver approves, rejects and changes
 * (Joy, by the recorded assumption); anyone else sees what is waiting and on
 * whom. A refusal from the server is rendered verbatim.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approvalsView } from '../components/bob/approvalState';
import {
  DECISION_LABELS, LIST_LABELS, REJECT_LABEL, changedQuantities, lookIntoQuestion, requestsView,
} from '../components/bob/requestsState';
import { askFrom } from '../components/bob/here';
import { useBob } from '../hooks/useBob';
import { useHere } from '../hooks/useHere';
import { REQUESTS_KEY } from '../hooks/useNeedsYou';
import { RoomHead } from '../room/RoomShell';
import {
  decideRequest, getAuthority, linkPerson, listRequests, setLine, type DecisionAction,
} from '../services/authorityApi';
import { errorMessage } from '../services/pinsApi';
import { listApprovals, promoteVersion } from '../services/workflowsApi';
import { useAuthStore } from '../stores/authStore';
import type { AuthorityState, DraftRequest } from '../types/authority';
import type { Approval } from '../types/workflows';

function manila(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

function useDecide(id: string, onDone: () => void) {
  const qc = useQueryClient();
  const [refused, setRefused] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (v: { action: DecisionAction; quantities?: Record<string, number> }) =>
      decideRequest(id, v.action, { quantities: v.quantities }),
    onSuccess: () => {
      setRefused(null);
      onDone();
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
    },
    onError: (err) => setRefused(errorMessage(err)),
  });
  return { m, refused };
}

/** Provenance and time, so no figure on the row stands without one (UI rule 6). */
function DraftSource({ r }: { r: DraftRequest }) {
  return (
    <p className="r-src" style={{ marginTop: 10 }}>
      asked by {r.requested_by} · {manila(r.created_at)} · read {manila(r.snapshot_timestamp)}
      {r.moves > 0 && ` · ${r.moves} move${r.moves === 1 ? '' : 's'} beside the orders`}
    </p>
  );
}

function ChangeLines({ r, onApprove, onCancel, pending }: {
  r: DraftRequest; pending: boolean;
  onApprove: (q: Record<string, number>) => void; onCancel: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const lines = r.lines ?? [];
  const changed = changedQuantities(lines, edits);
  return (
    <div style={{ marginTop: 14 }}>
      <p className="r-note">Set the quantities you want; the value is worked out again when you approve.</p>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
        {lines.map((ln) => (
          <li key={ln.product_id} className="r-row-acts" style={{ marginTop: 6 }}>
            <label className="r-item-of" style={{ flex: 1 }} htmlFor={`q-${r.id}-${ln.product_id}`}>
              {ln.product ?? ln.sku ?? ln.product_id}
            </label>
            <input id={`q-${r.id}-${ln.product_id}`} className="r-field" style={{ width: 90 }}
                   inputMode="numeric" defaultValue={String(ln.quantity)}
                   onChange={(e) => setEdits({ ...edits, [ln.product_id]: e.target.value })} />
          </li>
        ))}
      </ul>
      <div className="r-row-acts">
        <button type="button" className="r-do" disabled={!changed || pending}
                onClick={() => changed && onApprove(changed)}>
          {pending ? 'Approving…' : 'Approve with these'}
        </button>
        <button type="button" className="r-act" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function DecisionRow({ r, mayDecide, approver }: { r: DraftRequest; mayDecide: boolean; approver: string }) {
  const bob = useBob();
  const here = useHere();
  const [changing, setChanging] = useState(false);
  const { m, refused } = useDecide(r.id, () => setChanging(false));
  return (
    <li className="r-item">
      <span className="r-chip r-chip--needs">Needs a decision</span>
      <h2 className="r-item-name" style={{ marginTop: 10 }}>
        {r.title}{' '}
        <span style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
      </h2>
      {/* The server's sentence, verbatim: it names the line and the version. */}
      <p className="r-note" style={{ marginTop: 8 }}>{r.routed_because}</p>
      {r.note && <p className="r-note" style={{ marginTop: 6 }}>“{r.note}”</p>}
      <DraftSource r={r} />
      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}
      {changing && mayDecide ? (
        <ChangeLines r={r} pending={m.isPending} onCancel={() => setChanging(false)}
                     onApprove={(q) => m.mutate({ action: 'change', quantities: q })} />
      ) : (
        <div className="r-row-acts">
          {mayDecide && (
            <button type="button" className="r-do" disabled={m.isPending}
                    onClick={() => m.mutate({ action: 'approve' })}>
              {m.isPending ? 'Approving…' : DECISION_LABELS.approve}
            </button>
          )}
          {mayDecide && (
            <button type="button" className="r-act" disabled={m.isPending || !(r.lines ?? []).length}
                    onClick={() => setChanging(true)}>{DECISION_LABELS.change}</button>
          )}
          <button type="button" className="r-act" disabled={bob.busy}
                  onClick={() => void bob.ask(lookIntoQuestion(r), askFrom(here))}>
            {DECISION_LABELS.look_into}
          </button>
          {mayDecide && (
            <button type="button" className="r-act" disabled={m.isPending}
                    onClick={() => m.mutate({ action: 'reject' })}>{REJECT_LABEL}</button>
          )}
          {!mayDecide && <span className="r-src">Waiting on {approver}.</span>}
        </div>
      )}
    </li>
  );
}

function ListRow({ r, mayDecide, approver }: { r: DraftRequest; mayDecide: boolean; approver: string }) {
  const { m, refused } = useDecide(r.id, () => undefined);
  return (
    <li className="r-item">
      <h2 className="r-item-name">
        {r.title}{' '}
        <span style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
      </h2>
      <p className="r-note" style={{ marginTop: 8 }}>{r.routed_because}</p>
      {r.note && <p className="r-note" style={{ marginTop: 6 }}>“{r.note}”</p>}
      <DraftSource r={r} />
      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}
      <div className="r-row-acts">
        {/* Quiet: an under-the-line draft is not an interruption, so its
            yes is a text action and never the approvals colour. */}
        {mayDecide ? (
          <>
            <button type="button" className="r-act" disabled={m.isPending}
                    onClick={() => m.mutate({ action: 'approve' })}>{LIST_LABELS.approve}</button>
            <button type="button" className="r-act" disabled={m.isPending}
                    onClick={() => m.mutate({ action: 'reject' })}>{LIST_LABELS.reject}</button>
          </>
        ) : <span className="r-src">Waiting quietly for {approver}.</span>}
      </div>
    </li>
  );
}

function approverOf(auth: AuthorityState | undefined): string {
  const names = (auth?.people ?? []).filter((p) => p.role === 'approver').map((p) => p.name);
  return names.length ? names.join(' or ') : 'the approver';
}

function Drafts({ auth }: { auth: AuthorityState | undefined }) {
  const requests = useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => listRequests('waiting'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const view = requestsView(
    requests.isPending ? { status: 'pending' }
      : requests.isError ? { status: 'error' }
        : { status: 'success', result: requests.data },
  );
  const approver = approverOf(auth);
  return (
    <>
      <div className="r-empty">
        {view.accent
          ? <span className="r-chip r-chip--needs">{view.decisionsHeading}</span>
          : <p className="r-say">{view.decisionsHeading}</p>}
        {view.detail && <p className="r-note" style={{ marginTop: 10 }}>{view.detail}</p>}
      </div>
      {view.decisions.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {view.decisions.map((r) => (
            <DecisionRow key={r.id} r={r} mayDecide={view.mayDecide} approver={approver} />
          ))}
        </ul>
      )}
      {view.kind !== 'failed' && (
        <div className="r-empty" style={{ paddingTop: 12 }}>
          <p className="r-say">{view.listHeading}</p>
          {view.kind === 'loaded' && (
            <p className="r-note" style={{ marginTop: 6 }}>
              Under the line: these did not interrupt anyone, and each still waits for a yes.
            </p>
          )}
        </div>
      )}
      {view.list.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {view.list.map((r) => (
            <ListRow key={r.id} r={r} mayDecide={view.mayDecide} approver={approver} />
          ))}
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The line and the people
// ---------------------------------------------------------------------------

function LineAndPeople({ auth, failed }: { auth: AuthorityState | undefined; failed: boolean }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [link, setLink] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<string | null>(null);
  const done = (next: AuthorityState) => {
    setRefused(null);
    qc.setQueryData(['authority'], next);
  };
  const line = useMutation({
    mutationFn: () => setLine({
      mode: 'over_line', line_php: Number(amount),
      said: `Set on the Needs you page: drafts over ₱${Number(amount).toLocaleString('en-PH')} need a decision.`,
    }),
    onSuccess: (next) => { setAmount(''); done(next); },
    onError: (err) => setRefused(errorMessage(err)),
  });
  const linker = useMutation({
    mutationFn: (v: { person: string; username: string | null }) => linkPerson(v.person, v.username),
    onSuccess: done,
    onError: (err) => setRefused(errorMessage(err)),
  });

  if (failed) return <p className="r-note">Could not load the line or who approves.</p>;
  if (!auth) return <p className="r-note">Checking…</p>;
  const v = auth.line;
  return (
    <section style={{ marginTop: 34 }}>
      <h2 className="r-item-name">The line</h2>
      <p className="r-note" style={{ marginTop: 8 }}>{auth.line_means}</p>
      {v && (
        <p className="r-src" style={{ marginTop: 8 }}>
          version {v.version} · “{v.said}” · {v.set_by} · {manila(v.set_at)}
        </p>
      )}
      {auth.history.length > 1 && (
        <details style={{ marginTop: 8 }}>
          <summary className="r-act">Every version</summary>
          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0 }}>
            {auth.history.map((h) => (
              <li key={h.version} className="r-src">
                version {h.version} · {h.means} · “{h.said}” · {h.set_by} · {manila(h.set_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {auth.viewer.may_set_line && (
        <div className="r-row-acts">
          <input className="r-field" style={{ width: 140 }} inputMode="numeric" value={amount}
                 placeholder="₱ amount" aria-label="The line, in pesos"
                 onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} />
          <button type="button" className="r-act" disabled={!amount || line.isPending}
                  onClick={() => line.mutate()}>Set the line</button>
        </div>
      )}
      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}

      <h2 className="r-item-name" style={{ marginTop: 30 }}>Who decides</h2>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {auth.people.map((p) => (
          <li key={p.person} className="r-row-acts" style={{ marginTop: 6 }}>
            <span className="r-item-of" style={{ flex: 1 }}>
              <b>{p.name}</b> — {p.says ?? p.role}
              <span className="r-src"> · {p.linked ? `signs in as ${p.username}` : 'not linked to a login'}</span>
            </span>
            {auth.viewer.may_link_people && (
              <>
                <input className="r-field" style={{ width: 130 }} aria-label={`Login for ${p.name}`}
                       placeholder="username" value={link[p.person] ?? ''}
                       onChange={(e) => setLink({ ...link, [p.person]: e.target.value })} />
                <button type="button" className="r-act" disabled={linker.isPending}
                        onClick={() => linker.mutate({ person: p.person, username: (link[p.person] ?? '').trim() || null })}>
                  {(link[p.person] ?? '').trim() ? 'Link' : 'Unlink'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="r-src" style={{ marginTop: 10 }}>{auth.assumption}</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Workflow versions
// ---------------------------------------------------------------------------

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
  const auth = useQuery({
    queryKey: ['authority'],
    queryFn: getAuthority,
    staleTime: 60_000,
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
        says="Drafts over the line arrive here as decisions; drafts under it wait in the list without interrupting anyone. Nothing is sent from here — an approved draft is keyed into StoreHub by a person."
      />

      <Drafts auth={auth.data} />

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

      <LineAndPeople auth={auth.data} failed={auth.isError} />
    </>
  );
}
