/**
 * What a workflow's row may say about it, as a decision the suite can hold.
 *
 * A LIVING OBJECT, NOT A TABLE ROW. Each workflow is described by where it is
 * in its life — no version yet, saved but never backtested, backtested and
 * waiting, promoted and running unattended, promoted and manual — and by the
 * one thing that would move it on. Every word here is derived from loaded
 * records: the newest version's timestamps, the schedules' enabled flags and
 * pinned versions, the last run's status. Nothing is inferred from a name or
 * assumed from silence, and the unknown cases say so (UI rule 8).
 *
 * DIVERGENCE IS ALLOWED, SILENT DIVERGENCE IS NOT (CLAUDE.md rule 8). A
 * schedule pins a version id; when an enabled schedule fires a version other
 * than the newest, the row says so, because the number in chat and the
 * number on Monday are then different numbers.
 */
import type { Workflow, WorkflowRun, WorkflowSchedule } from '../../types/workflows';

export type Stage =
  | 'no_version'
  | 'never_backtested'
  | 'awaiting_promotion'
  | 'scheduled'
  | 'manual';

export interface WorkflowView {
  stage: Stage;
  /** Where it is, in one line. */
  state: string;
  /** The one thing that would move it on, or that it is fine as it is. */
  next: string;
  /** Where the next action lives, if it is a page. */
  nextTo: '/inbox' | null;
  /** True when an enabled schedule fires a version other than the newest. */
  diverges: boolean;
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "daily at 06:00", "Mon and Thu at 18:30", "the 1st at 07:00". */
export function scheduleLine(s: WorkflowSchedule): string {
  const hh = String(s.hour).padStart(2, '0');
  const mm = String(s.minute).padStart(2, '0');
  const at = `at ${hh}:${mm}`;
  if (s.kind === 'weekly') {
    const days = s.days_of_week.map((d) => DAY[d] ?? String(d));
    const list = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
    return `${list || 'weekly'} ${at}`;
  }
  if (s.kind === 'monthly') {
    return `the ${ordinal(s.day_of_month ?? 1)} ${at}`;
  }
  return `daily ${at}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * The row, from the records.
 *
 * @param schedules undefined while unknown — the view then says so rather
 *   than calling the workflow manual.
 */
export function workflowView(
  w: Workflow,
  schedules: WorkflowSchedule[] | undefined,
): WorkflowView {
  const v = w.current_version;
  if (!v) {
    return {
      stage: 'no_version',
      state: 'No version saved yet.',
      next: 'Ask George to save one.',
      nextTo: null,
      diverges: false,
    };
  }
  if (!v.backtested_at) {
    return {
      stage: 'never_backtested',
      state: `v${v.version}, never backtested.`,
      next: 'Ask George to run it as of a past date, and read what it would have produced.',
      nextTo: null,
      diverges: false,
    };
  }
  if (!v.promoted_at) {
    return {
      stage: 'awaiting_promotion',
      state: `v${v.version} backtested, waiting to be promoted.`,
      next: 'Promote it in Inbox.',
      nextTo: '/inbox',
      diverges: false,
    };
  }

  if (schedules === undefined) {
    return {
      stage: 'manual',
      state: `v${v.version} promoted. Checking its schedules…`,
      next: '',
      nextTo: null,
      diverges: false,
    };
  }

  const enabled = schedules.filter((s) => s.enabled);
  const diverges = enabled.some((s) => s.version_id !== v.id);
  if (enabled.length > 0) {
    return {
      stage: 'scheduled',
      state: `Runs ${enabled.map(scheduleLine).join('; ')} · v${v.version} promoted.`,
      next: diverges
        ? 'An enabled schedule fires an older version than the newest. Promote the newest, or repoint the schedule.'
        : 'Nothing — it runs unattended.',
      nextTo: null,
      diverges,
    };
  }
  return {
    stage: 'manual',
    state: `Manual · v${v.version} promoted.`,
    next: 'Ask George to run it, or to run it every Monday at 6 — the schedule is created switched off.',
    nextTo: null,
    diverges: false,
  };
}

/** The newest run, in words, or the honest absence of one. */
export function lastRunLine(runs: WorkflowRun[] | undefined): string {
  if (runs === undefined) return 'Checking runs…';
  const r = runs[0];
  if (!r) return 'Never run.';
  return `Last ${r.mode === 'backtest' ? 'backtest' : 'run'} ${r.status}`;
}
