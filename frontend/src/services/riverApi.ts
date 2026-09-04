/**
 * River API — the one timeline.
 *
 * Bare axios, matching pinsApi, chatsApi, greetingApi and workflowsApi: the
 * auth interceptors are installed on both the shared instance and global axios
 * (see httpAuth.ts). Relative base for the same reason as everywhere else —
 * same-origin through the proxy, so no CORS preflight in production.
 *
 * Read-only for now. The write path (asking, replying, sharing) arrives in C.2;
 * until then the river renders the history backfilled from
 * george.conversations, which is real content and not a placeholder.
 */
import axios from 'axios';
import type { Post, RiverPage } from '../types/river';

const API_BASE = '/api/v1/george/river';

/**
 * A page of the river, newest first.
 *
 * @param before Cursor from a previous page's `before`. Omit for the newest
 *   page. A null `before` in the response means the beginning of the river has
 *   been reached — an end, not a failure to load.
 */
export const readRiver = async (
  before?: string | null,
  limit?: number,
): Promise<RiverPage> => {
  const { data } = await axios.get<RiverPage>(API_BASE, {
    params: {
      ...(before ? { before } : {}),
      ...(limit ? { limit } : {}),
    },
  });
  return data;
};

/** One thread, oldest first. 404s rather than returning an empty thread. */
export const readThread = async (threadId: string): Promise<Post[]> => {
  const { data } = await axios.get<Post[]>(`${API_BASE}/threads/${threadId}`);
  return data;
};
