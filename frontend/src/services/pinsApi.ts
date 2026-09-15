/**
 * Pins API.
 *
 * A pin stores the tool calls behind an answer and re-runs them, so nothing
 * here caches a figure — `runPin` is the only source of a number, and every
 * number it returns arrives with its own meta.
 *
 * PAGES ARE ADDRESSED BY ID (2026-09-08). A listing is scoped by page_id, or
 * `null` for Ungrouped; a move names a page_id, or a title only when it is a
 * NEW page being brought into being. pagesApi.ts is the page's own surface.
 *
 * Bare axios, matching dashboardDefaultsApi: the auth interceptors are
 * installed on both the shared instance and global axios (see httpAuth.ts).
 */
import axios from 'axios';
import type {
  CreatePinRequest,
  PageRenameResult,
  Pin,
  PinPage,
  PinRun,
  SimilarPageConflict,
  UpdatePinRequest,
} from '../types/pins';

const API_BASE = '/api/v1/george/pins';

/**
 * The caller's pins. `undefined` is every pin, newest first; `null` is the
 * ungrouped pins; a string is one page by id, in the page's own order.
 */
export const listPins = async (pageId?: string | null): Promise<Pin[]> => {
  const params =
    pageId === null ? { ungrouped: true } : pageId ? { page_id: pageId } : undefined;
  const { data } = await axios.get<Pin[]>(API_BASE, { params });
  return data;
};

/**
 * The pins made in one thread, whatever page each sits on — which is how a
 * thread says whether it has been kept (P2.a). A pin records the conversation
 * it was made in and a thread is a list of conversations, so the backend does
 * that join; nothing is inferred from a title. An empty array is a real
 * answer: this thread is kept nowhere.
 */
export const listThreadPins = async (threadId: string): Promise<Pin[]> => {
  const { data } = await axios.get<Pin[]>(API_BASE, { params: { thread_id: threadId } });
  return data;
};

/** The legacy listing, for the picker: every real page with its id, and Ungrouped. */
export const listPinPages = async (): Promise<PinPage[]> => {
  const { data } = await axios.get<PinPage[]>(`${API_BASE}/pages`);
  return data;
};

export const createPin = async (body: CreatePinRequest): Promise<Pin> => {
  const { data } = await axios.post<Pin>(API_BASE, body);
  return data;
};

/** Delete the pin itself — the saved analysis, not just its place on a page. */
export const deletePin = async (id: string): Promise<void> => {
  await axios.delete(`${API_BASE}/${id}`);
};

/**
 * Move a pin to a page (by id, or by a NEW title), off a page (`page_id:
 * null`), place it on its page, or retitle it. The calls and the run history
 * are untouched and nothing is re-run: membership is not a figure.
 */
export const updatePin = async (id: string, body: UpdatePinRequest): Promise<Pin> => {
  const { data } = await axios.patch<Pin>(`${API_BASE}/${id}`, body);
  return data;
};

/** Rename one of the caller's pages by its current exact title (legacy; pagesApi.updatePage is the one by id). */
export const renamePage = async (
  page: string,
  name: string,
  allowSimilar = false,
): Promise<PageRenameResult> => {
  const { data } = await axios.patch<PageRenameResult>(
    `${API_BASE}/pages/${encodeURIComponent(page)}`,
    { name, allow_similar_page: allowSimilar },
  );
  return data;
};

/** Re-run a pin. Refusals and rotted pins come back as a 200 with a status. */
export const runPin = async (id: string): Promise<PinRun> => {
  const { data } = await axios.post<PinRun>(`${API_BASE}/${id}/run`);
  return data;
};

/**
 * Pull the near-duplicate-page conflict out of a 409, if that is what it is.
 *
 * The backend refuses "replenishment" when "Replenishment" already exists,
 * rather than silently forking the page or silently merging into it. That
 * refusal exists to be read, so the caller has to be able to recognise it and
 * offer the choice — swallowing it would undo the point of it.
 */
export function similarPageConflict(err: unknown): SimilarPageConflict | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return null;
  const detail = err.response.data?.detail;
  if (detail && typeof detail === 'object' && 'existing_page' in detail) {
    return detail as SimilarPageConflict;
  }
  return null;
}

/** The human-readable reason behind any other failed request. */
export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message: unknown }).message);
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
