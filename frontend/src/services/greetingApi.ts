/**
 * George's opening line.
 *
 * Bare axios, matching chatsApi and pinsApi: the auth interceptors are
 * installed on both the shared instance and global axios (see httpAuth.ts).
 * Relative base for the same reason as everywhere else — same-origin through
 * the proxy.
 *
 * NOT /api/v1/brief. That endpoint is gated by BRIEF_TOKEN, a shared secret
 * scoped so a leak costs the morning brief and nothing else; shipping it to
 * every browser would destroy that scoping. This route reads the same brief
 * tool behind the ordinary user gate.
 */
import axios from 'axios';
import type { Greeting } from '../types/george';

const API_BASE = '/api/v1/george/greeting';

/**
 * @param asOf Manila date the brief is written ON. Only used to reproduce a
 *   past morning — the app never sends it.
 */
export const getGreeting = async (asOf?: string): Promise<Greeting> => {
  const { data } = await axios.get<Greeting>(API_BASE, {
    params: asOf ? { as_of: asOf } : undefined,
  });
  return data;
};
