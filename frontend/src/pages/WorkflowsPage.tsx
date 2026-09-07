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
 * HIERARCHY, RATHER THAN FOUR STACKED SENTENCES. The name is the heading;
 * where it stands is set as prose, because it is the one line somebody
 * reading down the page is looking for; what would move it on is a labelled
 * line beneath; version, author and last run are metadata in a row and read
 * as such. A hairline separates one rule from the next. No card is needed to
 * say where one workflow ends.
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
import { PageHeader } from '../components/shell/PageHeader';
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

/** One labelled metadata pair. The only structure the footer row has. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-george-muted">{label}</dt>
      <dd className="text-george-slate">{children}</dd>
    </div>
  );
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
  const version = workflow.current_version;

  return (
    <li className="border-t border-george-line py-8 first:border-t-0 first:pt-0">
      <h2 className="font-george-serif text-[22px] leading-snug text-george-navy">
        {workflow.name}
      </h2>

      {/* Where it stands: the line somebody reading down the page wants. */}
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-george-navy">{view.state}</p>

      {view.next && (
        <p className="mt-2.5 max-w-xl text-[13px] leading-relaxed text-george-slate">
          <span className="text-george-muted">Next&nbsp;&nbsp;</span>
          {view.nextTo ? (
            <Link to={view.nextTo} className="text-george-navy underline-offset-2 hover:underline">
              {view.next}
            </Link>
          ) : (
            view.next
          )}
        </p>
      )}

      {/* The last run's caveats, whole, through the one notice component. */}
      {last && last.notices.length > 0 && (
        <div className="mt-4">
          <NoticeBanner notices={last.notices} />
        </div>
      )}

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-[12px]">
        {version && (
          <Fact label="version">
            v{version.version} · {version.created_by} · {manila(version.created_at)}
          </Fact>
        )}
        <Fact label="run">
          {runs.isError ? 'could not be read' : lastRunLine(runs.data).replace(/^Last /, '')}
          {last && ` · ${manila(last.started_at)}`}
        </Fact>
        {schedules.isError && <Fact label="schedule">could not be read</Fact>}
      </dl>

      {version && (
        <button
          type="button"
          onClick={() =>
            navigate('/ask', { state: { draft: `Run the "${workflow.name}" workflow` } })
          }
          className="mt-3 min-h-touch text-[13px] text-george-slate hover:text-george-navy"
        >
          Ask George to run it
        </button>
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
    <div className={`${SHELL_COLUMN} px-4 pb-24 pt-10 md:px-8 md:pt-14`}>
      <PageHeader
        title="Workflows"
        meta="The company's rules. Nothing runs unattended until an administrator promotes it."
      />

      {workflows.isPending && <p className="text-[13px] text-george-muted">Loading workflows…</p>}
      {workflows.isError && (
        <p className="text-[13px] leading-relaxed text-george-slate">Could not load workflows.</p>
      )}
      {workflows.data?.length === 0 && (
        <p className="max-w-xl text-[15px] leading-relaxed text-george-slate">
          No workflows yet. Agree a rule with George in Ask and ask him to save it.
        </p>
      )}

      <ul>
        {(workflows.data ?? []).map((w) => (
          <WorkflowRow key={w.id} workflow={w} />
        ))}
      </ul>
    </div>
  );
}
