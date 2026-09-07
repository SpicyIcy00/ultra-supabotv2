/**
 * /workflows — the company's rules, each as a living thing.
 *
 * READ-ORIENTED, NOT A TABLE. Every workflow is shown by where it is in its
 * life and the one thing that would move it on (workflowShape.ts): saved but
 * never backtested; backtested and waiting in Inbox; promoted and running
 * daily at 06:00; promoted and manual. The schedule, the promoted version,
 * the last run and its notices are all read from the records, and the
 * unknown cases say so while they load (UI rule 8).
 *
 * NO BUILDER. Saving is George's (`save_workflow`, in conversation), promoting
 * is Inbox's, and running is George's too — so the one action here is a
 * draft dropped into Ask, for the person to read and send. Versions, runs and
 * backtests keep their existing semantics; this page only reads them.
 *
 * A run's notices are drawn through NoticeBanner like every other caveat in
 * the app — a `version_divergence` notice is the record that the number on
 * Monday was not the number in chat, and it travels with the run (CLAUDE.md
 * rule 8).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { NoticeBanner } from '../components/george/NoticeBanner';
import { lastRunLine, workflowView } from '../components/george/workflowShape';
import { SHELL_COLUMN } from '../components/shell/shellLayout';
import { listRuns, listSchedules, listWorkflows } from '../services/workflowsApi';
import type { Workflow } from '../types/workflows';

function manila(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
  });
}

function WorkflowRow({ workflow }: { workflow: Workflow }) {
  const navigate = useNavigate();
  const schedules = useQuery({
    queryKey: ['workflows', workflow.id, 'schedules'],
    queryFn: () => listSchedules(workflow.id),
    staleTime: 60_000,
  });
  const runs = useQuery({
    queryKey: ['workflows', workflow.id, 'runs'],
    queryFn: () => listRuns(workflow.id, 1),
    staleTime: 60_000,
  });

  const view = workflowView(workflow, schedules.data);
  const last = runs.data?.[0];

  return (
    <li className="py-6">
      <h2 className="font-george-serif text-[19px] leading-snug text-george-navy">{workflow.name}</h2>
      <p className="mt-1.5 text-[14px] leading-relaxed text-george-navy">{view.state}</p>

      <p className="mt-1 text-[13px] leading-relaxed text-george-slate">
        {runs.isError ? 'Could not read its runs.' : lastRunLine(runs.data)}
        {last && ` · ${manila(last.started_at)} · by ${last.requested_by}`}
      </p>
      {schedules.isError && (
        <p className="mt-1 text-[13px] text-george-slate">Could not read its schedules.</p>
      )}

      {/* The last run's caveats, whole, through the one notice component. */}
      {last && last.notices.length > 0 && (
        <div className="mt-3">
          <NoticeBanner notices={last.notices} />
        </div>
      )}

      {view.next && (
        <p className="mt-3 text-[13px] leading-relaxed text-george-slate">
          <span className="text-george-muted">Next · </span>
          {view.nextTo ? (
            <Link to={view.nextTo} className="text-george-navy underline-offset-2 hover:underline">
              {view.next}
            </Link>
          ) : (
            view.next
          )}
        </p>
      )}

      {workflow.current_version && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-george-muted">
          <span>
            v{workflow.current_version.version} saved by {workflow.current_version.created_by}
            {' · '}{manila(workflow.current_version.created_at)}
          </span>
          {workflow.current_version.promoted_at && (
            <span>promoted {manila(workflow.current_version.promoted_at)}</span>
          )}
          <button
            type="button"
            onClick={() =>
              navigate('/ask', { state: { draft: `Run the "${workflow.name}" workflow` } })
            }
            className="min-h-touch text-george-slate hover:text-george-navy"
          >
            Ask George to run it
          </button>
        </div>
      )}
    </li>
  );
}

export default function WorkflowsPage() {
  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: listWorkflows,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-8 md:px-8 md:pt-12`}>
      <h1 className="font-george-serif text-2xl text-george-navy">Workflows</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-george-slate">
        The company's rules. A save makes a version; a schedule pins one; nothing runs
        unattended until an administrator promotes it.
      </p>

      {workflows.isPending && <p className="mt-8 text-[13px] text-george-muted">Loading workflows…</p>}
      {workflows.isError && (
        <p className="mt-8 text-[13px] leading-relaxed text-george-slate">Could not load workflows.</p>
      )}
      {workflows.data?.length === 0 && (
        <p className="mt-8 text-[13px] leading-relaxed text-george-slate">
          No workflows yet. Agree a rule with George in Ask and ask him to save it.
        </p>
      )}

      <ul className="mt-4 divide-y divide-george-line">
        {(workflows.data ?? []).map((w) => (
          <WorkflowRow key={w.id} workflow={w} />
        ))}
      </ul>
    </div>
  );
}
