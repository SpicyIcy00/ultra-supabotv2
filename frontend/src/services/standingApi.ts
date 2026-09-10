/**
 * Standing questions — questions George has been asked to keep asking.
 *
 * There is no "briefing" endpoint here, and there will not be one. What the
 * room opens on is the newest ANSWER to a standing question, drawn by the
 * board that draws every other answer. The briefing is a question, not a
 * feature.
 *
 * Bare axios, matching riverApi, pinsApi and the rest: the auth interceptors
 * are installed on global axios too (httpAuth.ts), and a relative base keeps
 * it same-origin through the proxy.
 */
import axios from 'axios';

const API_BASE = '/api/v1/george/standing';

export interface StandingQuestion {
  id: string;
  question: string;
  instructions: string[];
  /** The slot in words: "every day at 06:00", "Mon, Thu at 09:00". */
  when: string;
  /** "asked on schedule" or "switched off". */
  state: string;
  last_asked: string | null;
  last_status: string | null;
}

export interface StandingLatest {
  thread_id: string;
  question: string;
  answered_at: string | null;
  standing_question_id: string;
}

export async function listStanding(): Promise<StandingQuestion[]> {
  const { data } = await axios.get<StandingQuestion[]>(API_BASE);
  return data;
}

/**
 * The newest standing answer waiting, or null.
 *
 * NULL IS A REAL ANSWER: somebody with no standing question, or one that has
 * never run, has nothing waiting. The caller must render that as its own state
 * rather than inventing an opening (UI rule 8).
 */
export async function latestStanding(): Promise<StandingLatest | null> {
  const { data } = await axios.get<StandingLatest | null>(`${API_BASE}/latest`);
  return data ?? null;
}
