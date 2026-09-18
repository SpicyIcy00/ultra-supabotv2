/**
 * `@` — what a typed name could mean, resolved by the server.
 *
 * One read, five kinds: shops from the store list, products through
 * `get_product`, suppliers through `get_purchasing`, the caller's own pages
 * and the company's saved rules. No model is consulted and nothing here is a
 * figure — see backend/app/services/mentions.py.
 *
 * Bare axios, matching deskApi and pinsApi.
 */
import axios from 'axios';

const API_BASE = '/api/v1/bob';

/** One thing an `@` could mean, and what picking it would do. */
export interface MentionCandidate {
  kind: string;
  /** What travels: a store id, a product id, a supplier's exact name, a uuid. */
  id: string;
  label: string;
  /** The one word that tells three things of the same name apart. */
  says: string;
  /** `selection`, `page_scope` or `named_on_question` — the definitions'. */
  binds: string;
  dimension?: string | null;
  /** A SKU, a purpose, a status. Never a figure. */
  hint?: string | null;
}

export interface Mentions {
  query: string;
  candidates: MentionCandidate[];
  /**
   * The kinds that could not be read, by name and in the source's own words.
   * A kind that failed and a kind with nothing in it are different facts and
   * are drawn differently (UI rule 8).
   */
  unavailable: Record<string, string>;
}

export const readMentions = async (
  q: string, signal?: AbortSignal,
): Promise<Mentions> => {
  const { data } = await axios.get<Mentions>(`${API_BASE}/mentions`, {
    params: { q }, signal,
  });
  return data;
};
