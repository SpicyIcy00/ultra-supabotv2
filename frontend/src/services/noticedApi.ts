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
  /** Empty for a `stuck` — nothing was posted, so there is nothing to reply to. */
  thread_id: string;
  /**
   * `watch` — something true about the business changed.
   * `stuck` — something about GEORGE stopped working: a rule that failed on
   * its schedule, a question that could not be asked, a watch that is no
   * longer watching. That kind matters precisely because it is otherwise
   * invisible: a watch's normal state is silence, so a broken one and a quiet
   * fortnight look the same from outside.
   */
  kind: 'watch' | 'stuck';
  body: string;
  created_at: string | null;
  /** For a `stuck`: what the system itself said went wrong. */
  why?: string | null;
  /** For a `stuck`: the one thing that would unstick it. */
  fix?: string | null;
  watch_id?: string | null;
  /** True when the read behind it travelled with the post. */
  has_calls: boolean;
}

export async function listNoticed(): Promise<NoticedItem[]> {
  const { data } = await axios.get<NoticedItem[]>('/api/v1/george/noticed');
  return data;
}
