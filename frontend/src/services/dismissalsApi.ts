/**
 * Setting a thing aside with a reason (W2.3) — one write, and it is a person's.
 *
 * WHY THERE IS NO TOOL. Bob may form a view and revise one; he may not decide
 * what you already know or what does not matter to you. So the tap sits on
 * the item, in the room, and goes straight to the route on the person's own
 * authority. The reason is kept as a view you told him, which is why the
 * memory view shows it and its Forget undoes it.
 *
 * WHAT IS SENT IS WHAT THE ROW SAID. A warning-list row or a morning finding
 * carries its own `dismiss` key, written by code from its fields; a watch post
 * or a stuck item is named by its id and the server reads the key off the
 * stored post. Nothing here is a label the room made up.
 *
 * Bare axios, matching beliefsApi and the rest.
 */
import axios from 'axios';

export type Reason = 'known' | 'not_important' | 'wrong';

/** The three, in the order they are offered — metrics.yaml dismissal.order. */
export const REASONS: { reason: Reason; says: string }[] = [
  { reason: 'known', says: 'known' },
  { reason: 'not_important', says: 'not important' },
  { reason: 'wrong', says: 'wrong' },
];

/** What a row of a read carries when it may be set aside (tools/dismissal.key_of). */
export interface DismissKey {
  item: 'attention' | 'finding';
  kind: string;
  subject: string;
}

/** Either a row's own key, or a post Bob noticed, by its id. */
export type Dismissable =
  | DismissKey
  | { item: 'watch' | 'stuck'; post_id: string };

export interface Dismissed {
  item: string;
  kind: string;
  reason: Reason;
  /** False for "wrong": it stays, marked, rather than going quiet. */
  quiets: boolean;
  kept: { id: string; subject: string; outcome: string }[];
}

export async function dismiss(what: Dismissable, reason: Reason,
                              threadId?: string | null): Promise<Dismissed> {
  const { data } = await axios.post<Dismissed>('/api/v1/bob/dismissals', {
    ...what, reason, thread_id: threadId ?? null,
  });
  return data;
}

/** Whether a row's `dismiss` field is a key the room can send back. */
export function keyOf(value: unknown): DismissKey | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if ((v.item !== 'attention' && v.item !== 'finding')
      || typeof v.kind !== 'string' || typeof v.subject !== 'string') return null;
  return { item: v.item, kind: v.kind, subject: v.subject };
}
