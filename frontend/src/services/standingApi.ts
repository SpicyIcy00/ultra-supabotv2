/**
 * Standing questions — questions Bob has been asked to keep asking.
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

const API_BASE = '/api/v1/bob/standing';

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
  /** Null for a morning answered today by a typed question (W2.1). */
  standing_question_id: string | null;
  /** Today's answer to the morning question (W2.1). */
  morning?: boolean;
  /** The earliest read time behind it — the stamp it is shown with. */
  read_at?: string | null;
}

/**
 * The person's morning (W2.1): their standing question for it and today's
 * answer. `enabled` is false until THEY switch it on (rule 7); null only when
 * there is no morning at all.
 */
export interface Morning {
  standing_question_id: string | null;
  question: string | null;
  when: string | null;
  enabled: boolean | null;
  today: StandingLatest | null;
}

/** Make sure the morning exists (born off) and say how it stands. */
export async function openMorning(): Promise<Morning> {
  const { data } = await axios.post<Morning>('/api/v1/bob/morning');
  return data;
}

/** The person's own switch — never Bob's. */
export async function switchMorning(on: boolean): Promise<Morning> {
  const { data } = await axios.post<Morning>('/api/v1/bob/morning/switch', { on });
  return data;
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
