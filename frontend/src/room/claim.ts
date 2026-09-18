/**
 * THE CLAIM IS A HIGHLIGHT, AND THIS IS WHAT MAKES IT ONE.
 *
 * P1.f gave the reading three slots — claim, caveat, next. Two of them are
 * lines Bob writes; the CLAIM is not. It is the few words of his answer
 * that ARE the point, and the surface lights them where he said them.
 *
 * That is the whole of why a text channel is safe here. A slot that drew a
 * sentence of its own could put words on screen the answer never carried;
 * this one can only ever emphasise a span of text that is already there, and
 * where the words are not there it draws nothing and the reading stands whole.
 *
 * The match is forgiving about case and whitespace and about nothing else — a
 * claim that PARAPHRASES what he said is not a highlight of it, and lighting
 * the nearest sentence would be the surface deciding what he meant. Mirrored
 * in agent/reading.py `was_said`, which records the miss so the rate is a
 * measured number (`claim_not_said` in the gap log) rather than an assumption.
 */

/** Case off, runs of whitespace to one space. The only normalising there is. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface Claimed {
  before: string;
  hit: string;
  after: string;
}

/**
 * The answer split around the claim — or null when he did not say it.
 *
 * `hit` is the ORIGINAL text of the span, never the claim as submitted, so
 * what is drawn is his own words with his own punctuation and capitals.
 */
export function splitClaim(text: string | null | undefined,
                           claim: string | null | undefined): Claimed | null {
  const said = text ?? '';
  if (!said.trim() || !claim || !claim.trim()) return null;

  // Walk the answer once, keeping a map from each flattened character back to
  // where it came from, so the span found in flattened space can be cut out of
  // the original. A regex over the raw text cannot do this: the claim arrives
  // already flattened by the validator, and the answer may wrap anywhere.
  let flat = '';
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < said.length; i += 1) {
    const ch = said[i];
    if (/\s/.test(ch)) {
      if (flat && !space) { flat += ' '; at.push(i); space = true; }
      continue;
    }
    space = false;
    flat += ch.toLowerCase();
    at.push(i);
  }
  const want = flatten(claim);
  const found = flat.indexOf(want);
  if (found < 0 || !want) return null;

  const start = at[found];
  const last = at[Math.min(found + want.length - 1, at.length - 1)];
  return {
    before: said.slice(0, start),
    hit: said.slice(start, last + 1),
    after: said.slice(last + 1),
  };
}
