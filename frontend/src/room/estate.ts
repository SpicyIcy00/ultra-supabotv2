/**
 * WHICH BUSINESS THE NEXT QUESTION IS ABOUT (P2.g).
 *
 * The owner's feature 23 — "George works across all my businesses and
 * understands which business/store/system I'm referring to". Both businesses
 * have been READ since long before this card: `get_vending` and the `_php`
 * views are live and the warehouse has been a place in the store list all
 * along. What was missing was the switch, so "how are we doing" always meant
 * the shops and the other two were reachable only by naming them in a
 * sentence and hoping.
 *
 * NOTHING HERE IS A DEFINITION. Every part, its words, and the places behind
 * it are served from `metrics.yaml surface.desk.estate` — this module decides
 * only what is ON and what travels. A client that held its own list of the
 * businesses would be holding a copy of the store list, which is the one
 * thing CLAUDE.md says lives in metrics.yaml and nowhere else.
 *
 * THE DEFAULT TRAVELS AS NOTHING. `all` is what every question has meant until
 * today, so a question asked with the switch untouched is byte-identical to
 * one asked before this existed: the switch can only narrow, never change what
 * was already right.
 */
import type { DeskDefinitions, DeskEstatePart } from '../services/deskApi';

/** What a pill reads: its own word, and the smaller one under it. */
export interface Pill {
  key: string;
  label: string;
  says: string | null;
  /** True for the part a question is currently on. */
  on: boolean;
}

function estateOf(defs: DeskDefinitions | null | undefined) {
  return defs?.estate ?? null;
}

/** The parts, in the definitions' order. Empty until they are served. */
export function partsOf(defs: DeskDefinitions | null | undefined): DeskEstatePart[] {
  return estateOf(defs)?.parts ?? [];
}

/**
 * Which part is on — what was picked, or the definitions' own default.
 *
 * A picked key the definitions do not declare is not on: it is dropped, and
 * the default stands. That can only happen across a deploy that removed a
 * part, and a pill lit for something the server will refuse is worse than the
 * switch appearing to reset.
 */
export function partOn(defs: DeskDefinitions | null | undefined,
                       picked: string | null): DeskEstatePart | null {
  const estate = estateOf(defs);
  if (!estate) return null;
  const want = picked && estate.parts.some((p) => p.key === picked) ? picked : estate.default;
  return estate.parts.find((p) => p.key === want) ?? null;
}

/**
 * THE PILLS, drawn from what was served and from nothing else.
 *
 * `count_places` is the definitions' own call on whether the number of places
 * belongs in front of the label: "7 shops" says something, "1 AJI BARN" does
 * not, and which is which is declared rather than guessed from the word.
 */
export function pillsFor(defs: DeskDefinitions | null | undefined,
                         picked: string | null): Pill[] {
  const current = partOn(defs, picked);
  return partsOf(defs).map((part) => ({
    key: part.key,
    label: part.count_places && part.places.length > 1
      ? `${part.places.length} ${part.label}`
      : part.label,
    says: part.says ?? null,
    on: part.key === current?.key,
  }));
}

/**
 * WHAT TRAVELS ON THE QUESTION. The part's key, or nothing at all on the
 * default — which is the whole guarantee that this feature cannot change an
 * answer nobody asked it to change.
 */
export function estateFor(defs: DeskDefinitions | null | undefined,
                          picked: string | null): string | undefined {
  const estate = estateOf(defs);
  const part = partOn(defs, picked);
  if (!estate || !part || part.key === estate.default) return undefined;
  return part.key;
}

/**
 * The chip above the line, when the question is carrying a scope — the same
 * thing the pill says, where the rest of what travels is drawn. Null on the
 * default, because nothing is travelling.
 */
export function scopeChip(defs: DeskDefinitions | null | undefined,
                          picked: string | null): { key: string; label: string } | null {
  const key = estateFor(defs, picked);
  if (!key) return null;
  const part = partsOf(defs).find((p) => p.key === key);
  return part ? { key: part.key, label: part.label } : null;
}
