/**
 * Which page a pin goes on — the decision behind the picker.
 *
 * ONE PICKER, TWO MOMENTS. The same choice is made when an answer is pinned
 * and when a pin is moved, and it is the same choice: an existing page, a
 * new one, or none. Holding it as one type means the Pin dialog and the
 * Move control cannot offer different vocabularies for the same act (UI
 * rule 2 — one save gesture, everywhere).
 *
 * A NEW PAGE IS A NAME AND NOTHING ELSE. There is no page to create first:
 * a page is derived from its pins, so the first pin carrying the name IS the
 * page existing. The picker therefore never "creates" anything; it sends a
 * name, and the backend applies the same normalisation and the same
 * case-collision refusal it applies on every other route.
 */

export type PageChoice =
  | { kind: 'none' }
  | { kind: 'existing'; page: string }
  | { kind: 'new'; name: string };

/**
 * The page the choice resolves to, as the API takes it.
 *
 * `null` is ungrouped; a string is a page. `undefined` means the choice is
 * not yet a page — a new page with no name — and nothing should be sent.
 * Whitespace is trimmed here only to decide emptiness; the backend owns the
 * real normalisation, and sending the raw text keeps one rule in one place.
 */
export function chosenPage(choice: PageChoice): string | null | undefined {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'existing':
      return choice.page;
    case 'new':
      return choice.name.trim() ? choice.name : undefined;
  }
}

/** Whether the choice can be sent. */
export function isChoiceReady(choice: PageChoice): boolean {
  return chosenPage(choice) !== undefined;
}

/**
 * The choice a pin is currently making, from where it sits.
 *
 * A pin on a page that is in the list is `existing`; a pin with no page is
 * `none`. A pin on a page the list does not carry — the list is still
 * loading, or the page was just renamed — is still `existing`, because the
 * pin's own row is the fact and the list is a courtesy.
 */
export function choiceFor(page: string | null): PageChoice {
  return page === null ? { kind: 'none' } : { kind: 'existing', page };
}

/**
 * Whether a move to this choice would change anything.
 *
 * A no-op move is refused client-side so the Move control cannot be used as
 * a Refresh in disguise: moving a pin to the page it is on would look like
 * it did something and would do nothing, which is the kind of gap a person
 * fills in with a guess.
 */
export function movesPin(current: string | null, choice: PageChoice): boolean {
  const target = chosenPage(choice);
  if (target === undefined) return false;
  return target !== current;
}
