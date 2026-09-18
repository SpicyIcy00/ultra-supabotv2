/**
 * WHERE YOU WERE, AND WHEN YOU LAST LOOKED.
 *
 * The research said it plainly (Victor, Magic Ink): information software
 * should infer context from the environment and from HISTORY, and ask as a
 * last resort. The room already infers from time — the standing answer opens
 * the morning — and from place. This is the history half: the thread you
 * left is the thread you return to, and what arrived while you were away is
 * what comes to the centre.
 *
 * PER VIEWER, PER BROWSER, NEVER SENT — exactly like an arrangement. That
 * "you last looked on Thursday" is a fact about a person's attention, and it
 * stays on their machine. It is a convenience, not a record: a browser that
 * refuses storage loses it, never the room.
 *
 * TWO FACTS AND NO MORE. The last thread opened, and per thread the time of
 * the newest answer that was on screen while the person was looking. From
 * those the room derives "since you last looked · 2 answers arrived" — a
 * count of turns with a time after that mark, never a guess.
 */

const KEY = 'george.room.history';
const THREADS = 12;

interface Saved {
  last: string | null;
  seen: Record<string, string>;
}

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return { last: parsed.last ?? null, seen: parsed.seen ?? {} };
  } catch {
    return { last: null, seen: {} };
  }
}

function write(saved: Saved): void {
  try {
    const keys = Object.keys(saved.seen);
    for (const stale of keys.slice(0, Math.max(0, keys.length - THREADS))) {
      delete saved.seen[stale];
    }
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* a browser that refuses storage loses the history, not the room */
  }
}

/** The thread you were in last, or null if you have never been anywhere. */
export function lastThread(): string | null {
  return read().last;
}

/** Clearing the board is leaving on purpose; "/" must not walk back in. */
export function forgetLast(): void {
  const saved = read();
  saved.last = null;
  write(saved);
}

/** When you last looked at this thread — the time of the newest answer that was on screen. */
export function lastSeen(threadId?: string | null): string | null {
  if (!threadId) return null;
  return read().seen[threadId] ?? null;
}

/**
 * You are here. With `newestAt`, you have also seen everything up to that
 * answer — recorded only forwards, so a reload cannot un-see anything.
 */
export function remember(threadId: string, newestAt?: string | null): void {
  const saved = read();
  saved.last = threadId;
  if (newestAt) {
    const had = saved.seen[threadId];
    if (!had || Date.parse(newestAt) > Date.parse(had)) {
      // Re-insert so the entry is newest in key order and outlives older ones.
      delete saved.seen[threadId];
      saved.seen[threadId] = newestAt;
    }
  }
  write(saved);
}

/** Strictly later than the mark. A turn with no time is never "new". */
function after(at: string | undefined, seen: string): boolean {
  if (!at) return false;
  const a = Date.parse(at);
  const s = Date.parse(seen);
  return Number.isFinite(a) && Number.isFinite(s) && a > s;
}

/** How many answers arrived after you last looked. Zero when you never had. */
export function arrivedSince(answers: readonly { at?: string }[], seen: string | null): number {
  if (!seen) return 0;
  return answers.filter((a) => after(a.at, seen)).length;
}

/**
 * The index of the first answer you have not seen; `answers.length` when you
 * have seen them all, or never looked (nothing is "new" on a first visit —
 * everything is).
 */
export function firstUnseen(answers: readonly { at?: string }[], seen: string | null): number {
  if (!seen) return answers.length;
  const i = answers.findIndex((a) => after(a.at, seen));
  return i < 0 ? answers.length : i;
}

/**
 * WHAT EACH ANSWER WAS ASKED (the log, 2026-09-18: "i should see what i ask
 * too"), one entry per answer, in order. An answer's question is the person's
 * line nearest before it and after the answer before it — their words, as they
 * sent them. An answer nobody asked for (a standing question's, a watch's) has
 * none, and none is drawn: the room never words a question for them.
 */
export function questionsOf(turns: readonly { role: string; text?: string }[]): (string | null)[] {
  const out: (string | null)[] = [];
  let pending: string | null = null;
  for (const t of turns) {
    if (t.role === 'user') pending = (t.text ?? '').trim() || null;
    else if (t.role === 'george') { out.push(pending); pending = null; }
  }
  return out;
}
