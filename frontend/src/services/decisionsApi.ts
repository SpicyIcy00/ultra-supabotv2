/**
 * Decisions — what you did with what Bob raised.
 *
 * One write, made by the room's own gestures (keep, set aside, open, ask why,
 * put the morning away) on an object drawn from the agenda. Nothing here
 * infers a decision from what you did not do, and nothing here reads them
 * back: Bob reads them himself when he ranks the morning, and says on the
 * row why it is where it is.
 *
 * Bare axios, matching standingApi and the rest.
 */
import axios from 'axios';

export type Outcome = 'kept' | 'dismissed' | 'opened' | 'asked' | 'left';

export interface Decision {
  /** The attention row's identity, as the tool wrote it. */
  what: string;
  source: string;
  subject: string;
  outcome: Outcome;
  /** When the row was raised — the read's own timestamp, never the screen's clock. */
  raised_at: string | null;
  thread_id: string | null;
}

export async function recordDecision(d: Decision): Promise<void> {
  await axios.post('/api/v1/bob/decisions', d);
}
