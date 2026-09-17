/**
 * THE SWATCH — the one place a store's colour is drawn (P2S.2(e)).
 *
 * The design's `.sw`: an 8px dot before a name. It sits beside words that say
 * the same thing, so identity is never colour alone, and it is the ONLY
 * element in the room that wears a categorical hue — a segment, a dot, a bar
 * and a line carry the verdict instead. `identity.ts` says why.
 *
 * The identities come from the definitions through `IdentityContext`, which
 * `Room` fills from `/definitions/desk`. Outside it, or before they load,
 * there is no swatch — never a guessed one.
 */
import { createContext, useContext, type CSSProperties } from 'react';
import type { Dimension } from './data';
import { NO_IDENTITIES, hueFor, slotColour, slotFor, type Identities } from './identity';

export const IdentityContext = createContext<Identities>(NO_IDENTITIES);

export function useIdentities(): Identities {
  return useContext(IdentityContext);
}

export function Swatch({ name, dimension }: {
  name: string | null | undefined;
  dimension?: Dimension | null;
}) {
  const ids = useIdentities();
  const slot = slotFor(ids, name, dimension);
  if (!slot) return null;
  return (
    <i className="r-sw" aria-hidden="true" data-slot={slot} data-identity={name ?? ''}
       style={{ '--sw': slotColour(slot) } as CSSProperties} />
  );
}

/** The opened object's rule, in the same hue as its swatch. */
export function useHueFor(): (subject?: string | null, dimension?: Dimension | null) => string {
  const ids = useIdentities();
  return (subject, dimension) => hueFor(ids, subject, dimension);
}
