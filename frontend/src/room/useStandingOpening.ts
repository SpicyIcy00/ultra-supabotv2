/**
 * WHAT THE ROOM OPENS ON.
 *
 * You arrive in the morning and George has already said something. Not because
 * a "briefing" was rendered for you — nothing in this app renders one — but
 * because a question you asked him to keep asking came round at 06:00, he
 * answered it with the same tools and the same board as any other answer, and
 * it has been waiting since.
 *
 * So this hook does one thing: it finds the newest such answer and hands back
 * its thread. Everything else — what is on it, which shops lead, what he
 * thinks — is his, decided in that turn.
 *
 * THREE STATES, AND NULL IS ONE OF THEM (UI rule 8). Nobody with no standing
 * question has an opening, and a room that invented one would be asserting
 * something it never checked. While the lookup is in flight the answer is also
 * null — the room stays as it is and nothing flashes.
 *
 * DISMISSAL IS PER SESSION AND PER THREAD. Closing this morning's answer means
 * "put that away", and it has to survive the navigate back to "/" or the room
 * reopens what was just closed. It is deliberately NOT remembered past the tab:
 * tomorrow's answer is a different thread and opens on its own, and yesterday's
 * dismissal should not silence it.
 */
import { useQuery } from '@tanstack/react-query';
import { latestStanding, type StandingLatest } from '../services/standingApi';

const DISMISSED = 'george.standing.dismissed';

function dismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    // A browser that refuses session storage loses the dismissal, not the room.
    return [];
  }
}

/** Remember that this thread has been put away for the rest of the session. */
export function dismissStanding(threadId?: string): void {
  if (!threadId) return;
  try {
    const kept = dismissed();
    if (!kept.includes(threadId)) {
      sessionStorage.setItem(DISMISSED, JSON.stringify([...kept, threadId].slice(-20)));
    }
  } catch {
    /* see above */
  }
}

/**
 * The standing answer to open on, or null.
 *
 * @param when False whenever the room already has something to draw — a thread
 *   in the address bar, a stored thread, a turn in flight. The lookup does not
 *   run at all then: opening on this morning's answer over the top of what
 *   somebody is doing is the opposite of helpful.
 */
export function useStandingOpening(when: boolean): StandingLatest | null {
  const query = useQuery({
    queryKey: ['standing', 'latest'],
    queryFn: latestStanding,
    enabled: when,
    // A standing answer arrives once a day. Refetching it on every focus is
    // noise; the room is reopened far more often than the question is asked.
    staleTime: 5 * 60_000,
    retry: false,
  });

  const found = query.data ?? null;
  if (!when || !found) return null;
  return dismissed().includes(found.thread_id) ? null : found;
}
