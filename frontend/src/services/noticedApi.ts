/**
 * What George noticed — the posts a watch wrote.
 *
 * Only `watch` posts. A brief, a workflow run and an approval are also things
 * George initiated and each has its own home; putting them here would make
 * this the river under a different name.
 */
import axios from 'axios';

export interface NoticedItem {
  post_id: string;
  thread_id: string;
  body: string;
  created_at: string;
  watch_id?: string | null;
  /** True when the read behind it travelled with the post. */
  has_calls: boolean;
}

export async function listNoticed(): Promise<NoticedItem[]> {
  const { data } = await axios.get<NoticedItem[]>('/api/v1/george/noticed');
  return data;
}
