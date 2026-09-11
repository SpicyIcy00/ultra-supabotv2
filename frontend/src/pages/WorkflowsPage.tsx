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
 * is Needs you's, and running is George's too — so the one action here is a
 * draft dropped into Ask, for the person to read and send. Versions, runs and
 * backtests keep their existing semantics; this page only reads them.
 *
 * A run's notices are drawn through the room's Caveat like every other
 * caveat on this surface — a `version_divergence` notice is the record that the number on
 * Monday was not the number in chat, and it travels with the run (CLAUDE.md
 * rule 8).
 */
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Caveats } from '../room/tiles';
import { lastRunLine, workflowView } from '../components/george/workflowShape';
import { RoomHead } from '../room/RoomShell';
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
  const version = workflow.current_version;

  return (
    <li className="r-item">
      <h2 className="r-item-name">{workflow.name}</h2>

      {/* Where it stands: the line somebody reading down the page wants. */}
      <p className="r-say" style={{ marginTop: 8, fontSize: 15 }}>{view.state}</p>

      {view.next && (
        <p className="r-note" style={{ marginTop: 10 }}>
          <span className="r-label" style={{ display: 'inline', marginRight: 8 }}>next</span>
          {view.nextTo ? <Link to={view.nextTo} className="r-link">{view.next}</Link> : view.next}
        </p>
      )}

      {/* The last run's caveats, whole — through the ROOM's caveat, which is
          the one this surface renders a notice through now. A
          `version_divergence` notice is the record that Monday's number was
          not chat's number, and it travels with the run (CLAUDE.md rule 8).
          Nothing is dropped and nothing is collapsed; only the drawing
          changed, and it changed to the one already on the board. */}
      {last && last.notices.length > 0 && (
        <div style={{ marginTop: 14 }}><Caveats notices={last.notices} /></div>
      )}

      <p className="r-src" style={{ marginTop: 12 }}>
        {version && `v${version.version} · ${version.created_by} · ${manila(version.created_at)} · `}
        {/* "Last run ok" reads as a sentence at the head of a line and as a
            stutter in the middle of one; the row already says these are the
            last facts about this rule. */}
        {runs.isError ? 'run could not be read' : lastRunLine(runs.data).replace(/^Last /, '').toLowerCase()}
        {last && ` · ${manila(last.started_at)}`}
        {schedules.isError && ' · schedule could not be read'}
      </p>

      {version && (
        // STRAIGHT TO THE BOARD WITH THE QUESTION ALREADY ASKED. This used to
        // navigate to `/ask` with a draft in the route state — and `/ask` has
        // been a redirect to `/` since the room landed, which carries no
        // state, so the button went to an empty board and lost the sentence.
        <div className="r-row-acts">
          <button type="button" className="r-act"
                  onClick={() => navigate('/', {
                    state: { ask: `Run the "${workflow.name}" workflow` },
                  })}>
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
    <>
      <RoomHead
        title="Running"
        says="The company's rules. Nothing runs unattended until an administrator promotes it."
      />

      {/* Three states, three renderings, and the first two may never borrow
          the third's words (UI rule 8). */}
      {(workflows.isPending || workflows.isError || workflows.data?.length === 0) && (
        <div className="r-empty">
          {workflows.isPending && <p className="r-note">Checking…</p>}
          {workflows.isError && <p className="r-say">The rules could not be read.</p>}
          {workflows.data?.length === 0 && (
            <p className="r-say">
              Nothing runs yet. Agree a rule with George and ask him to save it.
            </p>
          )}
        </div>
      )}

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {(workflows.data ?? []).map((w) => (
          <WorkflowRow key={w.id} workflow={w} />
        ))}
      </ul>
    </>
  );
}
