/**
 * WHAT YOU DID TO THE BOARD, kept between visits.
 *
 * George arranges the board because he knows what matters. You rearrange it
 * because you know what you want to look at — and an arrangement that
 * evaporated on reload would teach you not to bother making one.
 *
 * PER VIEWER, PER THREAD, AND NEVER SENT BACK. None of this reaches George: a
 * position you chose is not a judgement he made, and feeding it back would let
 * your habit of dragging something to the top read to him as importance.
 *
 * Bounded, and failure-tolerant: a browser that refuses storage loses the
 * arrangement, never the room.
 */
import type { Local } from './board';

const KEY = 'george.room.arrangement';
const THREADS = 12;

type Saved = Record<string, Record<string, Local>>;

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : {};
  } catch {
    return {};
  }
}

export function restoreLocal(threadId?: string): Record<string, Local> {
  if (!threadId) return {};
  return read()[threadId] ?? {};
}

export function keepLocal(threadId: string | undefined,
                          local: Record<string, Local>): void {
  if (!threadId) return;
  try {
    const all = read();
    // Nothing worth keeping is still worth forgetting, so an empty
    // arrangement removes the entry rather than storing {}.
    if (Object.keys(local).length === 0) delete all[threadId];
    else all[threadId] = local;
    // Oldest threads fall off: this is a convenience, not a record.
    const keys = Object.keys(all);
    for (const stale of keys.slice(0, Math.max(0, keys.length - THREADS))) {
      delete all[stale];
    }
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* a browser that refuses storage loses the arrangement, not the room */
  }
}
