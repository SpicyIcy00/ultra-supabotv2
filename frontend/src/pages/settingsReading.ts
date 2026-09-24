/**
 * THE STORE LIST ON /settings, as three renderings (W4.5).
 *
 * WHAT THIS FILE EXISTS TO PREVENT. Two sections of Settings decided what to
 * draw with `stores.length === 0`, and drew a spinner saying "Loading
 * stores…". So a read that FAILED and a list that is genuinely EMPTY both
 * rendered as loading, and neither ever stopped: the store swallowed the
 * error, and nothing ever asked again. CLAUDE.md UI rule 8 — a claim about
 * state renders from a loaded result, never a literal, and loading, failed
 * and loaded are three renderings, the first two never borrowing the third's.
 *
 * A FAILED READ KEEPS THE SERVER'S WORDS (`storesError`, via
 * services/serverSaid.ts). "Failed to fetch stores" told a person nothing
 * they could act on.
 */
export type StoresRead = 'idle' | 'loading' | 'failed' | 'loaded';

export type StoresKind = 'loading' | 'failed' | 'empty' | 'rows';

export interface StoresReading {
  kind: StoresKind;
  /** The line that stands in for the list. Empty for `rows`. */
  heading: string;
  /** The server's sentence, or a second quiet line. Absent where there is none. */
  detail?: string;
}

/**
 * What to draw, from how the read went and what it returned.
 *
 * `count` is what is on hand — a browser that kept a list from last time has
 * rows to draw while it reads again, and drawing them is not a claim that the
 * read has finished.
 */
export function storesReading(read: StoresRead, count: number,
                              said: string | null): StoresReading {
  if (count > 0) return { kind: 'rows', heading: '' };
  if (read === 'failed') {
    return {
      kind: 'failed',
      heading: 'The stores could not be read.',
      // Never in place of the server's words; only when there are none.
      detail: said ?? 'Reopen this tab to try again.',
    };
  }
  if (read === 'loaded') {
    return {
      kind: 'empty',
      heading: 'No stores are set up yet.',
      detail: 'Nothing here can be chosen until the store list has one.',
    };
  }
  // 'idle' and 'loading' both mean nobody has an answer yet.
  return { kind: 'loading', heading: 'Reading the stores…' };
}
