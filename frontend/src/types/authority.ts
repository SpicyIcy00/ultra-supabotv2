/**
 * What reaches the approver (W2.2) — the shapes GET /bob/authority and
 * /bob/authority/requests return. Every figure here was written by the server
 * (backend/app/services/authority.py), never worked out in the client.
 */

export type Routed = 'list' | 'decision';
export type RequestStatus = 'waiting' | 'approved' | 'rejected' | 'changed';

export interface RequestLine {
  product_id: string;
  sku: string | null;
  product: string | null;
  quantity: number;
  unit_cost: number | null;
  line_value: number | null;
  reason?: string | null;
}

export interface DraftRequest {
  id: string;
  title: string;
  status: RequestStatus;
  routed: Routed;
  /** The server's sentence saying why it went where it went — verbatim. */
  routed_because: string;
  value_php: number;
  /** The value as the server wrote it ("₱12,400"). Drawn verbatim. */
  value: string;
  order_lines: number;
  unpriced_lines: number;
  moves: number;
  line_php: number | null;
  requested_by: string;
  note: string | null;
  created_at: string | null;
  snapshot_timestamp: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  replaces: string | null;
  source_call: { tool: string; arguments: Record<string, unknown> };
  lines?: RequestLine[];
}

export interface Viewer {
  username: string;
  person: string | null;
  name: string | null;
  role: string;
  may_approve: boolean;
  may_set_line: boolean;
  may_link_people: boolean;
  sees_all: boolean;
}

export interface LineVersion {
  rule: string;
  version: number;
  mode: 'over_line' | 'every_draft' | 'never';
  line_php: number | null;
  said: string;
  set_by: string;
  set_at: string | null;
  means: string;
}

export interface Person {
  person: string;
  name: string;
  role: string;
  says: string | null;
  businesses: string[];
  /** What this role may do, in the yaml's words. Drawn verbatim (W4.5). */
  role_says: string;
  /** The acts the declaration grants: submit, approve, reject, change, set_line. */
  may: string[];
  /** The businesses this person answers for, in the yaml's words. */
  businesses_say: string[];
  linked: boolean;
  username: string | null;
}

/** A login. Only an administrator is sent these; never a hash (W4.5). */
export interface Account {
  username: string;
  display_name: string | null;
  role: string;
  active: boolean;
  can_sign_in: boolean;
}

export interface AuthorityState {
  line: LineVersion | null;
  line_means: string;
  history: LineVersion[];
  people: Person[];
  /** Whether anybody can actually approve — the server's sentence, verbatim. */
  approval: string;
  viewer: Viewer;
  /** The logins an administrator may link, or null for everybody else. */
  accounts: Account[] | null;
  /** When the server read all of this. */
  read_at: string;
  assumption: string;
  keyed_into: string;
}

export interface RequestsResult {
  requests: DraftRequest[];
  viewer: Viewer;
}
