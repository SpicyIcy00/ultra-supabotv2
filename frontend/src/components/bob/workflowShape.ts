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
import type {
  Workflow, WorkflowRun, WorkflowSchedule, WorkflowVersion,
} from '../../types/workflows';

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
      next: 'Ask Bob to save one.',
      nextTo: null,
      diverges: false,
    };
  }
  if (!v.backtested_at) {
    return {
      stage: 'never_backtested',
      state: `v${v.version}, never backtested.`,
      next: 'Ask Bob to run it as of a past date, and read what it would have produced.',
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
    next: 'Ask Bob to run it, or to run it every Monday at 6 — the schedule is created switched off.',
    nextTo: null,
    diverges: false,
  };
}

/**
 * DIVERGENCE, AS SOMETHING WITH WEIGHT (W4.3, CLAUDE.md rule 8).
 *
 * `workflowView` has computed `diverges` since the Workflows page was
 * written, and every surface threw it away — folded, at most, into the tail of
 * a sentence about what to do next. A version divergence is the record that
 * the number in chat is not the number the schedule sends on Monday, so it is
 * a NOTICE: it names which version a manual run uses, which each enabled
 * schedule fires, and why the two are allowed to differ.
 *
 * It is never the accent (UI rule 5): a caveat takes its prominence from
 * position — above the figures it qualifies — and never from hue.
 */
export interface Divergence {
  /** The version a manual run uses: the newest. */
  ran: number;
  /** One line per enabled schedule firing something else. */
  fires: { scheduleId: string; version: string; when: string }[];
  /** Why this is allowed, and what ends it. */
  why: string;
}

/**
 * The divergence between what a manual run uses and what the schedules fire,
 * or null when there is none to draw.
 *
 * `schedules === undefined` is NOT "no divergence" — it is not yet known, and
 * the caller must render that as its own state rather than as silence.
 */
export function divergence(
  w: Workflow,
  schedules: WorkflowSchedule[] | undefined,
): Divergence | null {
  const v = w.current_version;
  if (!v || schedules === undefined) return null;
  const off = schedules.filter((s) => s.enabled && s.version_id !== v.id);
  if (off.length === 0) return null;
  return {
    ran: v.version,
    fires: off.map((s) => ({
      scheduleId: s.id,
      version: s.version_id,
      when: scheduleLine(s),
    })),
    why: 'A manual run uses the newest version; a schedule fires the version it '
      + 'was pinned to, and promoting never repoints one. Repoint the schedule, '
      + 'or leave it — but the two are different numbers until you do.',
  };
}

/**
 * WHAT STANDS BETWEEN THIS VERSION AND RUNNING UNATTENDED, in the order the
 * gate applies it, or null when it may be promoted now.
 *
 * Rule 7, said on the page that holds the button rather than discovered from a
 * refusal: promotion is an administrator's act against a RECORDED backtest of
 * a closed window. The server enforces all three; this only says which one is
 * in the way, so the control can be disabled with its reason beside it instead
 * of throwing the person at a 403.
 */
export function blocksPromotion(
  v: WorkflowVersion | null,
  who: { mayPromote: boolean; administrators?: string[] } | undefined,
): string | null {
  if (!v) return 'There is no version to promote.';
  if (v.promoted_at) return 'Already promoted.';
  if (!v.backtest_run_id) {
    return 'Never backtested. Run it against a window that has closed and read '
      + 'what it would have produced — that record is what a promotion rests on.';
  }
  if (who === undefined) return 'Checking who may promote…';
  if (!who.mayPromote) {
    // WHO, NOT WHICH OFFICE — and when this surface has not read the names,
    // it says that rather than inventing an absence. Bob has the names
    // (view_automations, meta.promotion) and this line sends the person to
    // him instead of to a role nobody is attached to.
    return who.administrators?.length
      ? `Only ${listOf(who.administrators)} can promote a version.`
      : 'You are not an administrator, so you cannot promote this. Ask Bob who '
        + 'can — he names them.';
  }
  return null;
}

/** "Isaiah", "Isaiah and Joy", "Isaiah, Joy and Daniel". */
export function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The newest run, in words, or the honest absence of one. */
export function lastRunLine(runs: WorkflowRun[] | undefined): string {
  if (runs === undefined) return 'Checking runs…';
  const r = runs[0];
  if (!r) return 'Never run.';
  return `Last ${r.mode === 'backtest' ? 'backtest' : 'run'} ${r.status}`;
}
