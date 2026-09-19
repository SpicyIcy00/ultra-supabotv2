/**
 * StoreHub imports API — upload one export, read the ledger of earlier ones.
 *
 * Bare axios and a relative base, as pinsApi and workflowsApi are: the auth
 * interceptors sit on global axios (httpAuth.ts) and every call goes
 * same-origin through the proxy.
 *
 * Behind require_page("storehub_imports") on the server — its OWN page key,
 * not Bob's. A person who may talk to Bob may not thereby write to the
 * procurement tables; that grant is made by name in the admin screen.
 *
 * NOTHING HERE INTERPRETS THE RESULT. The server returns counters and
 * notices; the page draws them. A refusal is a 422 whose `detail` is the
 * parser's own sentence, and it is rendered verbatim because its wording is
 * what tells a person which file to fetch instead.
 */
import axios from 'axios';

const API_BASE = '/api/v1/storehub-imports';

/** The export kinds the server accepts — the same names the yaml uses. */
export type ImportKind = 'purchase_orders' | 'stock_transfers';

export interface ImportNotice {
  kind: string;
  message: string;
  source?: string;
}

/** What one upload returns. `counters` is keyed by the ledger's column names. */
export interface ImportResult {
  import_id: number;
  kind: ImportKind;
  filename: string;
  sha256: string;
  counters: Record<string, number>;
  notices: ImportNotice[];
}

/** One row of the ledger, most recent first. */
export interface ImportSummary {
  id: number;
  kind: ImportKind;
  filename: string;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string | null;
  documents_seen: number;
  lines_seen: number;
  documents_inserted: number;
  documents_updated: number;
  lines_inserted: number;
  lines_updated: number;
  lines_deleted: number;
  unresolved_locations: number;
  unmatched_skus: number;
  ambiguous_skus: number;
  subtotal_mismatches: number;
  header_total_mismatches: number;
  mojibake_names: number;
  notices: ImportNotice[];
}

export const uploadExport = async (kind: ImportKind, file: File): Promise<ImportResult> => {
  const body = new FormData();
  body.append('file', file);
  const { data } = await axios.post<ImportResult>(`${API_BASE}/${kind}`, body);
  return data;
};

export const listImports = async (): Promise<ImportSummary[]> => {
  const { data } = await axios.get<ImportSummary[]>(API_BASE);
  return data;
};

/**
 * Was the upload REFUSED (the file cannot be trusted, nothing written) rather
 * than merely failed? The server says so with a 422 and nothing else does.
 */
export const wasRefused = (err: unknown): boolean =>
  axios.isAxiosError(err) && err.response?.status === 422;
