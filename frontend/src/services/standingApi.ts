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

/* ------------------------------------------------------------------ W4.4 --
 *
 * WHAT IS WATCHING: the standing questions AND the watches, on one page.
 *
 * Until this card `listStanding` above was called in exactly one place — the
 * sidebar — so `last_asked`, `last_status` and `instructions[]` came back on
 * every row and were drawn nowhere, and watches were not read here at all.
 *
 * TWO FAMILIES, ONE READING SHAPE. A standing question always speaks and a
 * watch speaks only on a change, so they are two lists and not one — but both
 * answer the same four things, and `WatchingRow` is those four. `when` is a
 * time whether the thing is on or off; `on` is the switch.
 */

/** One standing question or one watch, as the page reads it. */
export interface WatchingRow {
  id: string;
  family: 'question' | 'watch';
  /** What it asks, or what it watches. */
  asks: string;
  /** Its slot, in words. ALWAYS a time — never "off". */
  when: string;
  on: boolean;
  /** Where it stands, in the service's own words. */
  state: string;
  /** What it was told: a question's instructions, a watch's condition. */
  told: string[];
  told_by: 'instructions' | 'condition';
  /** The slot as the service holds it, so a reschedule keeps what it does not change. */
  slot: { kind: string; hour: number; minute: number; days_of_week: number[] | null };
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  /** What it last said, in its own words, with the read behind it. */
  last_said: {
    said: string;
    at: string | null;
    read_at: string | null;
    thread_id: string | null;
    post_id: string;
  } | null;
  thread_id: string | null;
  /** A watch's checks and how many of those it spoke on. Null on a question. */
  checks: number | null;
  spoke: number | null;
  /** "9 of the last 60 days", where a backtest was recorded. */
  backtest: string | null;
  /** When that was measured, and over which closed window (UI rule 6). */
  backtest_at: string | null;
  backtest_window: string | null;
  /** Rule 7's own sentence, when it cannot be switched on yet. */
  switch_on_refusal: string | null;
  may: { switch: boolean; reschedule: boolean; rewrite: boolean; remove: boolean };
}

export interface Watching {
  questions: WatchingRow[];
  watches: WatchingRow[];
}

const WATCHING = '/api/v1/bob/watching';

export async function getWatching(): Promise<Watching> {
  const { data } = await axios.get<Watching>(WATCHING);
  return data;
}

/**
 * One flat list for the sidebar, questions first, in the page's own order.
 *
 * A `select` over the SAME query, never a second one: the rail and the page
 * share the cache key `['watching']`, so switching something on from the page
 * moves the pip on the rail, and one shape is read two ways rather than two
 * shapes being written under one key. (Two query functions under one key was
 * this card's own bug: the rail's array overwrote the page's object and the
 * page drew "none yet" beside a rail listing five.)
 */
export function railRows(w: Watching): WatchingRow[] {
  return [...w.questions, ...w.watches];
}

/** Where a row of `family` lives on the page. The rail deep-links to it. */
export function anchorOf(row: { family: string; id: string }): string {
  return `${row.family}-${row.id}`;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The same slot in the rail's width: "08:00 daily", "Mon, Thu 07:00".
 *
 * Built from the slot the service holds, never from the sentence — so it says
 * exactly what `when` says and cannot drift from it. The rail's column is
 * about eleven characters wide beside a name, and "every day at 08:00" ate
 * the name down to "Ho…"; every other row there carries a short fact.
 */
export function slotShort(row: WatchingRow): string {
  const at = `${String(row.slot?.hour ?? 0).padStart(2, '0')}:${String(row.slot?.minute ?? 0).padStart(2, '0')}`;
  const days = row.slot?.days_of_week;
  if (row.slot?.kind === 'weekly' && days?.length) {
    return `${days.map((d) => DAYS[d]).filter(Boolean).join(', ')} ${at}`;
  }
  return `${at} daily`;
}

function of(row: { family: string; id: string }): string {
  return `${WATCHING}/${row.family === 'watch' ? 'watches' : 'questions'}/${row.id}`;
}

/**
 * Switch one on or off — the person's act, never Bob's (rule 7).
 *
 * A watch with no recorded backtest is REFUSED by the server, and the page has
 * already said so beside the switch. The refusal's sentence comes back as the
 * response detail and is shown verbatim.
 */
export async function switchWatching(row: WatchingRow, on: boolean): Promise<WatchingRow> {
  const { data } = await axios.post<WatchingRow>(`${of(row)}/switch`, { on });
  return data;
}

export async function rescheduleWatching(
  row: WatchingRow,
  slot: { hour: number; minute?: number; kind?: string | null; days_of_week?: number[] | null },
): Promise<WatchingRow> {
  const { data } = await axios.post<WatchingRow>(`${of(row)}/reschedule`, slot);
  return data;
}

/** Change what a standing question asks. A watch has no name to rewrite. */
export async function rewriteWatching(row: WatchingRow, question: string): Promise<WatchingRow> {
  const { data } = await axios.post<WatchingRow>(`${of(row)}/rewrite`, { question });
  return data;
}

/** Forget it. What it already said stays — those are posts. */
export async function removeWatching(row: WatchingRow): Promise<void> {
  await axios.delete(of(row));
}

/** The sentence a refused call came back with, or a plain one if it had none. */
export function refusalOf(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : 'That could not be done.';
}
