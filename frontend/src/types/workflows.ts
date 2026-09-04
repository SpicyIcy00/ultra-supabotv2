/**
 * Types for the workflows API.
 *
 * These mirror the Pydantic models in
 * backend/app/api/v1/routes/george_workflows.py one-for-one, the same
 * discipline types/pins.ts and types/chats.ts set. There is no runtime
 * validation, so drift shows up as an undefined field in the UI rather than an
 * error — tests/test_approvals_contract.py holds the field names to that.
 *
 * Only the approval queue is modelled so far. A workflow is the company's rule
 * and has a great deal more shape than this; the queue is the part UI rule 5
 * reserves a colour for, so it is the part the frontend needed first.
 */

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
