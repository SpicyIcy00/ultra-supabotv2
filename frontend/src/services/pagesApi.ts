/**
 * Pages API — the page as a thing of its own.
 *
 * A page is a row: it can be created empty, renamed without anything bound
 * to it moving, given a one-line purpose, and deleted — which moves its pins
 * to Ungrouped and deletes none of them. Every rule lives in the backend
 * service (app/services/page_writer.py), which is also what Bob's
 * create_page and edit_page call, so a button and a sentence cannot drift.
 *
 * Bare axios, as pinsApi.ts.
 */
import axios from 'axios';
import type {
  CreatePageRequest,
  Page,
  PageDeleted,
  PageEvent,
  UpdatePageRequest,
} from '../types/pins';

const API_BASE = '/api/v1/bob/pages';

/** The caller's pages, most recently changed first, empty ones included. */
export const listPages = async (): Promise<Page[]> => {
  const { data } = await axios.get<Page[]>(API_BASE);
  return data;
};

export const getPage = async (id: string): Promise<Page> => {
  const { data } = await axios.get<Page>(`${API_BASE}/${id}`);
  return data;
};

/** A new, empty page. */
export const createPage = async (body: CreatePageRequest): Promise<Page> => {
  const { data } = await axios.post<Page>(API_BASE, body);
  return data;
};

/** Rename, or change the purpose. The id stays. */
export const updatePage = async (id: string, body: UpdatePageRequest): Promise<Page> => {
  const { data } = await axios.patch<Page>(`${API_BASE}/${id}`, body);
  return data;
};

/**
 * Pick the page's date window (W1.4): a preset from the page's own options,
 * or null for each analysis as it was kept. Every analysis re-runs over it —
 * on the server, through its own read; the client only changes the choice.
 */
export const setPageWindow = async (id: string, preset: string | null): Promise<Page> => {
  const { data } = await axios.put<Page>(`${API_BASE}/${id}/window`, { preset });
  return data;
};

/** Take the page's date window off. */
export const removePageWindow = async (id: string): Promise<Page> => {
  const { data } = await axios.delete<Page>(`${API_BASE}/${id}/window`);
  return data;
};

/** Delete the page row. Its pins move to Ungrouped; none is deleted. */
export const deletePage = async (id: string): Promise<PageDeleted> => {
  const { data } = await axios.delete<PageDeleted>(`${API_BASE}/${id}`);
  return data;
};

/** What happened to the page, newest first. */
export const pageEvents = async (id: string): Promise<PageEvent[]> => {
  const { data } = await axios.get<PageEvent[]>(`${API_BASE}/${id}/events`);
  return data;
};
