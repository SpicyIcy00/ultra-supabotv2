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
export type ImportKind = 'purchase_orders' | 'stock_transfers' | 'products';

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
  /**
   * Every counter that import kept. The flat fields above were named for
   * documents and lines; a products import has neither, so it reports through
   * here. Null for imports recorded before the ledger carried it.
   */
  counters: Record<string, number> | null;
  notices: ImportNotice[];
}

/**
 * Send one export.
 *
 * `onSent` is the bytes that have LEFT THIS BROWSER, as a fraction — the only
 * part of an import a browser can honestly measure. What happens after the
 * last byte (parse, resolve, upsert, converge, all in one transaction) is the
 * server's, and it reports no progress, so the page says "reading" for that
 * part rather than inventing a percentage for it. A transfer export is
 * several megabytes, so the sending half is worth drawing.
 */
export const uploadExport = async (
  kind: ImportKind, file: File, onSent?: (fraction: number) => void,
): Promise<ImportResult> => {
  const body = new FormData();
  body.append('file', file);
  const { data } = await axios.post<ImportResult>(`${API_BASE}/${kind}`, body, {
    onUploadProgress: onSent
      ? (e) => onSent(e.total ? Math.min(1, e.loaded / e.total) : 0)
      : undefined,
  });
  return data;
};

/**
 * The ledger, newest first. With a kind, only that kind's imports.
 *
 * The owner, 2026-09-19: "it shouldnt show all imports in all import pages it
 * should be show past imports per tab". A products import under the orders tab
 * is an answer to a question nobody asked there.
 */
export const listImports = async (kind?: ImportKind): Promise<ImportSummary[]> => {
  const { data } = await axios.get<ImportSummary[]>(
    API_BASE, kind ? { params: { kind } } : undefined,
  );
  return data;
};

/**
 * Was the upload REFUSED (the file cannot be trusted, nothing written) rather
 * than merely failed? The server says so with a 422 and nothing else does.
 */
export const wasRefused = (err: unknown): boolean =>
  axios.isAxiosError(err) && err.response?.status === 422;
