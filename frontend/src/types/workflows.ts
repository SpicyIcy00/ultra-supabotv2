/**
 * Types for the workflows API.
 *
 * These mirror the Pydantic models in
 * backend/app/api/v1/routes/bob_workflows.py one-for-one, the same
 * discipline types/pins.ts and types/chats.ts set. There is no runtime
 * validation, so drift shows up as an undefined field in the UI rather than an
 * error — tests/test_approvals_contract.py holds the field names to that.
 *
 * The queue came first, because it is the part UI rule 5 reserves a colour
 * for. The workflow, its versions, its schedules and its runs followed on
 * 2026-09-07 for the Workflows page — read-oriented, and modelled only as far
 * as that page reads.
 */
import type { BobNotice } from './bob';

/**
 * One row of the approval queue: a version that cannot yet run unattended.
 *
 * Mirrors ApprovalOut. This is NOT a figure — it carries no number from a
 * tool, so it needs no receipts and no snapshot timestamp (the receipts rules
 * govern numbers, and an approval states none). Its times are its own:
 * `created_at` is when the version was saved, `backtested_at` when it was last
 * run against a past window, or null if it never has been.
 */
export interface Approval {
  workflow_id: string;
  name: string;
  version: number;
  version_id: string;
  created_by: string;
  created_at: string;
  backtested_at: string | null;
  /**
   * What is actually blocking it, in the words a person needs to act on.
   *
   * Rendered VERBATIM and never rewritten in the client. The server
   * distinguishes "never backtested" from "backtested and waiting for an
   * administrator", and those have different fixes — a client that summarised
   * both as "waiting" would destroy the distinction the endpoint exists to
   * draw.
   */
  blocked_on: string;
}

/** One immutable version of a rule. Mirrors VersionOut. */
export interface WorkflowVersion {
  id: string;
  version: number;
  created_by: string;
  created_at: string;
  steps: { name?: string; tool?: string; arguments?: Record<string, unknown>; why?: string | null }[];
  parameters: { name?: string; type?: string; default?: unknown; description?: string | null }[];
  intent: string | null;
  change_note: string | null;
  definitions_version: number | null;
  backtested_at: string | null;
  backtest_run_id: string | null;
  promoted_at: string | null;
  promoted_by: string | null;
}

/** The company's rule. Mirrors WorkflowOut; `current_version` is the newest. */
export interface Workflow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  status: string;
  current_version: WorkflowVersion | null;
}

/** A schedule pins a VERSION, never "whatever is current". Mirrors ScheduleOut. */
export interface WorkflowSchedule {
  id: string;
  workflow_id: string;
  version_id: string;
  kind: 'daily' | 'weekly' | 'monthly' | string;
  hour: number;
  minute: number;
  days_of_week: number[];
  day_of_month: number | null;
  bindings: Record<string, unknown>;
  telegram_chat_ids: string[];
  enabled: boolean;
  last_slot: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

/** One execution of one version, without its step results. Mirrors RunOut. */
export interface WorkflowRun {
  id: string;
  workflow_id: string;
  version_id: string;
  mode: string;
  requested_by: string;
  as_of: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  notices: BobNotice[];
}
