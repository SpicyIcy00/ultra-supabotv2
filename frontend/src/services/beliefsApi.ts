/**
 * Forgetting a view — the one write the memory has, and it is a person's.
 *
 * WHY THERE IS NO `forget_belief` TOOL. Bob may revise a view when a read
 * contradicts it, and he does: `record_belief` against the id, with the
 * reason. He may not decide to stop knowing something because somebody
 * disagreed with him. So Forget sits on the row, in the room, and goes
 * straight to the route on the person's own authority.
 *
 * THE ROW IS NOT DELETED. The server stamps who forgot it and when; it stops
 * being current, which takes it out of the next question and out of
 * `view_memory` in the same moment. What Bob used to think is still
 * answerable.
 *
 * Bare axios, matching decisionsApi and the rest.
 */
import axios from 'axios';

export interface Forgotten {
  id: string;
  subject: string;
  stance: string;
  claim: string;
  forgotten_at: string;
}

export async function forgetBelief(id: string): Promise<Forgotten> {
  const { data } = await axios.post<Forgotten>(
    `/api/v1/bob/beliefs/${encodeURIComponent(id)}/forget`);
  return data;
}
