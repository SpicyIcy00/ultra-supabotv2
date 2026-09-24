/**
 * /workflows/:workflowId — ONE SYSTEM, AND THE FOUR ACTS (W4.3).
 *
 * THE COMPLAINT. The owner, 2026-09-23, of a screen saying "Morning Runout is
 * switched off and not mine to switch on": *"how do i turn it on and what its
 * telling me to do?"* — and he is the only administrator there is. Two defects
 * under that one sentence: Bob named the office instead of the person (fixed
 * behind view_automations), and the screen that NAMED the act had no way to
 * perform it. Every rail row linked to the list; the list carried one button,
 * "Ask Bob to run it", and it navigated to a redirect. Promote lived in Needs
 * you and only for a version already backtested, so Morning Runout v1 —
 * `backtested_at` and `promoted_at` both null — had a path forward from
 * nowhere in the app.
 *
 * So: a system has its own page, and the four acts are on it.
 *
 *   RUN IT NOW        POST /run              what a manual run uses: the newest
 *   BACKTEST          POST /run with as_of   a window that has CLOSED
 *   PROMOTE           POST /promote          an administrator, against that record
 *   SWITCH ON / OFF   PATCH /schedules/:id   and it says which version it fires
 *
 * RULE 7 IS NOT SOMETHING THIS PAGE ROUTES AROUND — IT IS THE THING IT DRAWS.
 * Nothing here runs unattended until it has been backtested and promoted. The
 * backtest must be of a closed window (the date field will not offer today).
 * Promotion is an administrator's act against a RECORDED backtest, and the
 * control says which backtest it rests on, by its date, so "promoted" is never
 * a claim with nothing under it. A schedule pins a VERSION ID, never "whatever
 * is current", and every switch says which one it fires. Building the control
 * is not skipping the gate; it is giving the gate a surface. The server
 * enforces all of it — these buttons only say, before the click, which gate is
 * in the way.
 *
 * RULE 8 IS DRAWN, NOT FOLDED INTO A SENTENCE. `workflowShape.divergence`
 * names the version a manual run uses, the version each enabled schedule
 * fires and why the two may differ. It is drawn ABOVE the versions it
 * qualifies (UI rule 4) and never wears the accent (UI rule 5): a caveat takes
 * prominence from position. Promoting never repoints a schedule — repointing
 * is its own act, on the schedule.
 *
 * NO FIGURE IS COMPUTED HERE (rules 9 and 10). Every count and every time on
 * this page is a field of a record: the version number, the run's status, the
 * schedule's `last_run_at`. Nothing is summed, averaged or inferred, and every
 * time is stamped in Manila beside what it belongs to (UI rule 6).
 *
 * THREE RENDERINGS, NEVER TWO (UI rule 8). Loading, could-not-be-read and
 * loaded are separate throughout — "no runs yet" is said only from a loaded,
 * empty result, and a count is never drawn from an unresolved query.
 *
 * MOBILE FIRST. One column of sections at phone width; the acts wrap onto
 * their own lines rather than being pushed off the side. Desktop is the same
 * page with room beside it.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoomHead } from '../room/RoomShell';
import { Caveats } from '../room/tiles';
import { useRegisterHere } from '../hooks/useHere';
import { useAuthStore } from '../stores/authStore';
import { errorMessage } from '../services/pinsApi';
import {
  blocksPromotion, divergence, lastRunLine, scheduleLine, workflowView,
} from '../components/bob/workflowShape';
import {
  getRun, getWorkflow, listRuns, listSchedules, listVersions,
  promoteVersion, runWorkflow, updateSchedule,
} from '../services/workflowsApi';
import type { WorkflowRun, WorkflowSchedule, WorkflowVersion } from '../types/workflows';

/** A time as it reads in Manila. Every one on this page is a record's own. */
function manila(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-PH', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Manila',
  });
}

/** A Manila day, YYYY-MM-DD — the form every window on this surface takes. */
function manilaDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * The latest day a backtest may be of: YESTERDAY in Manila.
 *
 * `workflows.promotion.backtest_must_be_past` — a backtest of today
 * reproduces nothing and proves nothing, and the server refuses it. The field
 * will not offer it, so nobody discovers the rule from a 409.
 */
export function lastClosedDay(now = new Date()): string {
  return manilaDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// One section, with its heading
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="r-sys-sec">
      <h2 className="r-side-h" style={{ marginTop: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

/** Loading, failed and loaded, as three renderings and never as two. */
function State({ q, empty, children }: {
  q: { isPending: boolean; isError: boolean };
  empty?: string;
  children: React.ReactNode;
}) {
  if (q.isPending) return <p className="r-side-quiet">loading</p>;
  if (q.isError) return <p className="r-side-quiet">could not be read</p>;
  if (empty) return <p className="r-say">{empty}</p>;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// A version, and what stands between it and running unattended
// ---------------------------------------------------------------------------

function VersionRow({ v, newest, firedBy, mayPromote, onPromote, promoting, refused }: {
  v: WorkflowVersion;
  newest: boolean;
  firedBy: WorkflowSchedule[];
  mayPromote: boolean;
  onPromote(): void;
  promoting: boolean;
  refused: string | null;
}) {
  const [open, setOpen] = useState(false);
  // WHAT IS IN THE WAY, in the order the gate applies it. The button is drawn
  // disabled with the reason beside it rather than live and refused by a 403.
  const blocked = blocksPromotion(v, { mayPromote });

  return (
    <li className="r-item" data-version={v.version}>
      <h3 className="r-item-name">
        v{v.version}
        {/* Emphasis ADDS: the newest and the fired versions are said in words,
            never by dimming the rest (the owner, 2026-09-18). */}
        {newest && <span className="r-sys-tag">newest — what a manual run uses</span>}
        {firedBy.length > 0 && (
          <span className="r-sys-tag">
            fired by {firedBy.length === 1 ? 'the schedule' : `${firedBy.length} schedules`}
          </span>
        )}
      </h3>

      {v.intent && <p className="r-say" style={{ marginTop: 8, fontSize: 15 }}>{v.intent}</p>}
      {v.change_note && <p className="r-note" style={{ marginTop: 8 }}>{v.change_note}</p>}

      <p className="r-src" style={{ marginTop: 10 }}>
        saved {manila(v.created_at)} · {v.created_by}
        {v.definitions_version != null && ` · definitions v${v.definitions_version}`}
        {' · '}
        {v.backtested_at
          ? `backtested ${manila(v.backtested_at)}`
          : 'never backtested'}
        {' · '}
        {v.promoted_at
          ? `promoted ${manila(v.promoted_at)} by ${v.promoted_by ?? 'an administrator'}`
          : 'not promoted'}
      </p>

      <div className="r-row-acts">
        <button type="button" className="r-act" aria-expanded={open}
                onClick={() => setOpen(!open)}>
          {open ? 'hide the steps' : `${v.steps.length} steps`}
        </button>
        {!v.promoted_at && (
          <button type="button" className="r-act r-act--do"
                  disabled={Boolean(blocked) || promoting}
                  title={blocked ?? undefined}
                  onClick={onPromote}>
            {promoting ? 'Promoting…' : 'Promote'}
          </button>
        )}
        {/* WHICH BACKTEST IT RESTS ON, on the control itself. "Promoted" with
            nothing under it is the claim rule 7 exists to prevent. */}
        {!v.promoted_at && !blocked && (
          <span className="r-src">on the backtest of {manila(v.backtested_at)}</span>
        )}
        {!v.promoted_at && blocked && <span className="r-note">{blocked}</span>}
      </div>

      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}

      {open && (
        <ol className="r-sys-steps">
          {v.steps.map((s, i) => (
            <li key={`${s.name ?? i}`}>
              <span className="r-sys-step-name">{s.name ?? `step ${i + 1}`}</span>
              <span className="r-src"> {s.tool}</span>
              {s.why && <p className="r-note" style={{ marginTop: 4 }}>{s.why}</p>}
            </li>
          ))}
          {v.parameters.length > 0 && (
            <li>
              <span className="r-sys-step-name">parameters</span>
              <span className="r-src"> {v.parameters.map((p) => p.name).join(', ')}</span>
            </li>
          )}
        </ol>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// A run, openable
// ---------------------------------------------------------------------------

function RunRow({ run, workflowId, versionOf }: {
  run: WorkflowRun; workflowId: string; versionOf(id: string): string;
}) {
  const [open, setOpen] = useState(false);
  const detail = useQuery({
    queryKey: ['workflows', workflowId, 'runs', run.id],
    queryFn: () => getRun(workflowId, run.id),
    enabled: open,
    staleTime: 300_000,
  });
  const steps = (detail.data?.steps as { name?: string; status?: string; tool?: string }[])
    ?? [];

  return (
    <li className="r-item">
      <h3 className="r-item-name">
        {run.mode === 'backtest' ? 'Backtest' : 'Run'} {run.status}
        {run.as_of && <span className="r-sys-tag">as of {run.as_of}</span>}
      </h3>

      {/* A run's notices ride the run, through the room's own caveat, above
          anything this row says about it (UI rule 4). */}
      {run.notices.length > 0 && (
        <div style={{ marginTop: 12 }}><Caveats notices={run.notices} /></div>
      )}

      <p className="r-src" style={{ marginTop: 10 }}>
        {versionOf(run.version_id)} · started {manila(run.started_at)}
        {run.finished_at && ` · finished ${manila(run.finished_at)}`}
        {' · '}{run.requested_by}
      </p>

      <div className="r-row-acts">
        <button type="button" className="r-act" aria-expanded={open}
                onClick={() => setOpen(!open)}>
          {open ? 'close the receipts' : 'open the receipts'}
        </button>
      </div>

      {open && (
        <State q={detail}>
          <ol className="r-sys-steps">
            {steps.map((s, i) => (
              <li key={`${s.name ?? i}`}>
                <span className="r-sys-step-name">{s.name ?? `step ${i + 1}`}</span>
                <span className="r-src"> {s.tool} · {s.status}</span>
              </li>
            ))}
            {steps.length === 0 && <li className="r-note">This run stored no steps.</li>}
          </ol>
        </State>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// A schedule, and its switch
// ---------------------------------------------------------------------------

function ScheduleRow({ s, workflowId, versionOf, promoted }: {
  s: WorkflowSchedule; workflowId: string;
  versionOf(id: string): string; promoted(id: string): boolean;
}) {
  const qc = useQueryClient();
  const [refused, setRefused] = useState<string | null>(null);
  const flip = useMutation({
    mutationFn: (enabled: boolean) => updateSchedule(workflowId, s.id, { enabled }),
    onSuccess: () => {
      setRefused(null);
      qc.invalidateQueries({ queryKey: ['workflows', workflowId] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => setRefused(errorMessage(err)),
  });

  // Switching ON is the moment unattended execution begins, so the pinned
  // version must be promoted. Switching OFF is always allowed — stopping
  // something is never the dangerous direction.
  const armable = promoted(s.version_id);

  return (
    <li className="r-item">
      <h3 className="r-item-name">
        {scheduleLine(s)}
        <span className="r-sys-tag">{s.enabled ? 'on' : 'off'}</span>
      </h3>

      {/* WHICH VERSION IT FIRES — a schedule pins a version id, never
          "whatever is current" (rule 7), so the switch says what it starts. */}
      <p className="r-say" style={{ marginTop: 8, fontSize: 15 }}>
        Fires {versionOf(s.version_id)}.
      </p>

      <p className="r-src" style={{ marginTop: 10 }}>
        {s.last_run_at ? `last ran ${manila(s.last_run_at)}` : 'has never run'}
        {s.last_status && ` · ${s.last_status}`}
        {s.telegram_chat_ids.length > 0 && ` · telegram ${s.telegram_chat_ids.length}`}
      </p>
      {s.last_error && <p className="r-note" style={{ marginTop: 8 }}>{s.last_error}</p>}

      <div className="r-row-acts">
        <button type="button" className="r-act r-act--do"
                disabled={flip.isPending || (!s.enabled && !armable)}
                title={!s.enabled && !armable
                  ? 'The version this fires has not been promoted, so it cannot be switched on.'
                  : undefined}
                onClick={() => flip.mutate(!s.enabled)}>
          {flip.isPending ? 'Saving…' : s.enabled ? 'Switch off' : 'Switch on'}
        </button>
        {!s.enabled && !armable && (
          <span className="r-note">
            The version it fires has not been promoted. Backtest it and promote it
            first — that is the gate, not this switch.
          </span>
        )}
      </div>

      {refused && <p className="r-note" style={{ marginTop: 10 }}>{refused}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export default function SystemPage() {
  const { workflowId = '' } = useParams();
  const qc = useQueryClient();
  const admin = useAuthStore((s) => s.isAdmin());
  const [asOf, setAsOf] = useState(() => lastClosedDay());
  const [ran, setRan] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  const workflow = useQuery({
    queryKey: ['workflows', workflowId, 'one'],
    queryFn: () => getWorkflow(workflowId),
    staleTime: 30_000,
  });
  const versions = useQuery({
    queryKey: ['workflows', workflowId, 'versions'],
    queryFn: () => listVersions(workflowId),
    staleTime: 30_000,
  });
  const schedules = useQuery({
    queryKey: ['workflows', workflowId, 'schedules'],
    queryFn: () => listSchedules(workflowId),
    staleTime: 30_000,
  });
  const runs = useQuery({
    queryKey: ['workflows', workflowId, 'runs'],
    queryFn: () => listRuns(workflowId, 20),
    staleTime: 30_000,
  });

  const name = workflow.data?.name ?? '';

  // WHAT THIS PAGE IS, SO "SWITCH THIS ON" HAS A REFERENT (UI rule 1). None of
  // the sidebar destinations told Bob what it was before this card; a question
  // asked here travelled as "this screen".
  useRegisterHere(name
    ? { key: 'workflows', label: name, subjects: [name] }
    : null);

  const versionOf = (id: string) => {
    const v = (versions.data ?? []).find((x) => x.id === id);
    return v ? `v${v.version}` : 'a version this page has not read';
  };
  const promotedById = (id: string) =>
    Boolean((versions.data ?? []).find((x) => x.id === id)?.promoted_at);

  const runNow = useMutation({
    mutationFn: (opts: { asOf?: string }) => runWorkflow(workflowId, opts),
    onSuccess: (d, vars) => {
      setRefused(null);
      setRan(vars.asOf
        ? `Backtested as of ${vars.asOf} — ${String(d.status ?? 'finished')}.`
        : `Ran — ${String(d.status ?? 'finished')}.`);
      qc.invalidateQueries({ queryKey: ['workflows', workflowId] });
    },
    onError: (err) => { setRan(null); setRefused(errorMessage(err)); },
  });

  const promote = useMutation({
    mutationFn: (version: number) => promoteVersion(workflowId, version),
    onSuccess: () => {
      setRefused(null);
      qc.invalidateQueries({ queryKey: ['workflows', workflowId] });
      qc.invalidateQueries({ queryKey: ['workflow-approvals'] });
      qc.invalidateQueries({ queryKey: ['workflows'] });
    },
    onError: (err) => setRefused(errorMessage(err)),
  });

  if (workflow.isPending || workflow.isError) {
    return (
      <>
        <RoomHead title="System" />
        <div className="r-empty">
          {workflow.isPending
            ? <p className="r-note">Checking…</p>
            : <p className="r-say">This system could not be read.</p>}
          <p className="r-src" style={{ marginTop: 12 }}>
            <Link to="/workflows" className="r-link">All systems</Link>
          </p>
        </div>
      </>
    );
  }

  const view = workflowView(workflow.data, schedules.data);
  const diverged = divergence(workflow.data, schedules.data);
  const newest = workflow.data.current_version;
  const firedByOf = (versionId: string) =>
    (schedules.data ?? []).filter((s) => s.enabled && s.version_id === versionId);

  return (
    <>
      <RoomHead title={name} says={view.state} />

      {/* RULE 8, DRAWN. Above everything it qualifies, in ink, with no hue:
          which version a manual run uses, which each schedule fires, and why
          the two are allowed to differ. */}
      {diverged && (
        <div className="r-sys-diverge">
          <p className="r-label">version divergence</p>
          <p className="r-say" style={{ marginTop: 6, fontSize: 15 }}>
            A run you start here uses v{diverged.ran}.{' '}
            {diverged.fires.map((f) => `${scheduleLineOf(f.when)} fires ${versionOf(f.version)}`)
              .join('; ')}.
          </p>
          <p className="r-note" style={{ marginTop: 8 }}>{diverged.why}</p>
        </div>
      )}

      <Section title="Do">
        <p className="r-say">
          {view.next || 'Nothing — it runs unattended.'}
        </p>

        <div className="r-row-acts">
          <button type="button" className="r-act r-act--do"
                  disabled={!newest || runNow.isPending}
                  onClick={() => runNow.mutate({})}>
            {runNow.isPending ? 'Running…' : 'Run it now'}
          </button>
          <span className="r-src">uses v{newest?.version ?? '—'}</span>
        </div>

        {/* THE BACKTEST — the act rule 7 puts before everything else, and the
            one this app could not perform. A window that has CLOSED: the field
            offers yesterday at the latest. */}
        <div className="r-row-acts">
          <label className="r-src" htmlFor="asof">backtest as of</label>
          <input id="asof" type="date" className="r-field" style={{ width: 160 }}
                 value={asOf} max={lastClosedDay()}
                 onChange={(e) => setAsOf(e.target.value)} />
          <button type="button" className="r-act r-act--do"
                  disabled={!newest || !asOf || runNow.isPending}
                  onClick={() => runNow.mutate({ asOf })}>
            {runNow.isPending ? 'Backtesting…' : 'Backtest'}
          </button>
          <span className="r-src">
            a window that has closed — a backtest of today reproduces nothing
          </span>
        </div>

        {ran && <p className="r-say" style={{ marginTop: 12, fontSize: 15 }}>{ran}</p>}
        {refused && <p className="r-note" style={{ marginTop: 12 }}>{refused}</p>}
      </Section>

      <Section title="Versions">
        <State q={versions}
               empty={versions.data?.length === 0 ? 'No version saved yet. Agree the logic with Bob and ask him to save it.' : undefined}>
          <ul className="r-sys-list">
            {(versions.data ?? []).map((v) => (
              <VersionRow key={v.id} v={v}
                          newest={v.id === newest?.id}
                          firedBy={firedByOf(v.id)}
                          mayPromote={admin}
                          promoting={promote.isPending && promote.variables === v.version}
                          refused={promote.variables === v.version ? refused : null}
                          onPromote={() => promote.mutate(v.version)} />
            ))}
          </ul>
        </State>
      </Section>

      <Section title="Schedules">
        <State q={schedules}
               empty={schedules.data?.length === 0
                 ? 'No schedule. Tell Bob when it should run — the schedule is created switched off.'
                 : undefined}>
          <ul className="r-sys-list">
            {(schedules.data ?? []).map((s) => (
              <ScheduleRow key={s.id} s={s} workflowId={workflowId}
                           versionOf={versionOf} promoted={promotedById} />
            ))}
          </ul>
        </State>
      </Section>

      <Section title="Runs">
        <State q={runs}
               empty={runs.data?.length === 0 ? 'Never run.' : undefined}>
          <p className="r-src">{lastRunLine(runs.data)}</p>
          <ul className="r-sys-list">
            {(runs.data ?? []).map((r) => (
              <RunRow key={r.id} run={r} workflowId={workflowId} versionOf={versionOf} />
            ))}
          </ul>
        </State>
      </Section>

      <p className="r-src" style={{ marginTop: 24 }}>
        <Link to="/workflows" className="r-link">All systems</Link>
      </p>
    </>
  );
}

/** The schedule's own words, already built by `scheduleLine`. */
function scheduleLineOf(when: string): string {
  return when.charAt(0).toUpperCase() + when.slice(1);
}
