/**
 * Opening an object — a shop, a product, a supplier, an order.
 *
 * THE WHOLE POINT IS THAT THIS IS NOT A QUESTION. Asking Bob to open
 * Rockwell costs a model turn and roughly forty seconds; the figures are the
 * same five reads every time and choosing them involves no judgement, so
 * tapping calls this directly and gets them in about a second.
 *
 * The server runs the identical tool Bob is given, so what you see when you
 * tap and what he sees when he reasons cannot drift apart.
 */
import axios from 'axios';

const API_BASE = '/api/v1/bob/object';

/**
 * available | empty | refused | failed | unresolved — and they are five
 * different facts, never interchangeable.
 *
 * `refused` is the tool declining to produce a misleading number (asking a
 * warehouse for its net sales); `failed` is something going wrong. Putting
 * both under one word would file "AJI BARN is a warehouse" beside "the
 * database is down".
 */
export type SectionState =
  | 'available' | 'empty' | 'refused' | 'failed' | 'unresolved';

export interface ObjectSection {
  section: string;
  /** What this section is, in words, from the definitions. */
  says: string;
  state: SectionState;
  /** Why, when the state is failed or unresolved. */
  reason?: string | null;
  /** The call behind it, so a tile can re-run or pin exactly this. */
  call?: { tool: string; arguments: Record<string, unknown> } | null;
  rows: Record<string, unknown>[];
  /** The SECTION's receipts. The view as a whole deliberately has none. */
  meta?: Record<string, unknown> | null;
}

export interface ObjectView {
  kind: string;
  name: string;
  sections: ObjectSection[];
  meta: Record<string, unknown>;
  /**
   * What Bob currently thinks about this thing, or null.
   *
   * NULL IS A REAL ANSWER and must render as one: "he has not formed a view"
   * is a different fact from "he thinks nothing is wrong" (UI rule 8).
   */
  view: {
    claim?: string;
    stance?: string;
    held_since?: string;
    last_checked?: string;
    unconfirmed?: boolean;
    state?: string;
    reason?: string;
  } | null;
}

export async function openObject(
  kind: string,
  name: string,
  dateRange?: string,
): Promise<ObjectView> {
  const { data } = await axios.post<ObjectView>(API_BASE, {
    kind,
    name,
    ...(dateRange ? { date_range: dateRange } : {}),
  });
  return data;
}
