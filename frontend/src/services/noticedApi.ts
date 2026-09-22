/**
 * What Bob noticed — the posts a watch wrote.
 *
 * Only `watch` posts. A brief, a workflow run and an approval are also things
 * Bob initiated and each has its own home; putting them here would make
 * this the river under a different name.
 */
import axios from 'axios';

export interface NoticedItem {
  post_id: string;
  /** Empty for a `stuck` — nothing was posted, so there is nothing to reply to. */
  thread_id: string;
  /**
   * `watch` — something true about the business changed.
   * `stuck` — something about BOB stopped working: a rule that failed on
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
  /**
   * Someone called this kind of item about this subject wrong (W2.3): who and
   * when, in the notice's words. It is still listed, and this is drawn above it.
   */
  disputed?: string | null;
}

export async function listNoticed(): Promise<NoticedItem[]> {
  const { data } = await axios.get<NoticedItem[]>('/api/v1/bob/noticed');
  return data;
}
