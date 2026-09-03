/**
 * Pins API.
 *
 * A pin stores the tool calls behind an answer and re-runs them, so nothing
 * here caches a figure — `runPin` is the only source of a number, and every
 * number it returns arrives with its own meta.
 *
 * Bare axios, matching dashboardDefaultsApi: the auth interceptors are
 * installed on both the shared instance and global axios (see httpAuth.ts).
 */
import axios from 'axios';
import type {
  CreatePinRequest,
  Pin,
  PinPage,
  PinRun,
  SimilarPageConflict,
} from '../types/pins';

const API_BASE = '/api/v1/george/pins';

export const listPins = async (page?: string | null): Promise<Pin[]> => {
  const params =
    page === null ? { ungrouped: true } : page ? { page } : undefined;
  const { data } = await axios.get<Pin[]>(API_BASE, { params });
  return data;
};

export const listPinPages = async (): Promise<PinPage[]> => {
  const { data } = await axios.get<PinPage[]>(`${API_BASE}/pages`);
  return data;
};

export const createPin = async (body: CreatePinRequest): Promise<Pin> => {
  const { data } = await axios.post<Pin>(API_BASE, body);
  return data;
};

export const deletePin = async (id: string): Promise<void> => {
  await axios.delete(`${API_BASE}/${id}`);
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
