/**
 * Which page a pin goes on — the decision behind the picker.
 *
 * ONE PICKER, TWO MOMENTS. The same choice is made when an answer is pinned
 * and when a pin is moved, and it is the same choice: an existing page, a
 * new one, or none. Holding it as one type means the Pin dialog and the
 * Move control cannot offer different vocabularies for the same act (UI
 * rule 2 — one save gesture, everywhere).
 *
 * AN EXISTING PAGE IS ITS ID. The title rides along for the label and for
 * nothing else; a rename between opening the picker and pressing Move
 * cannot send a pin to the wrong page. A NEW PAGE IS A NAME: there is no
 * page to create first, because the first pin carrying the name brings the
 * page into being, under the same normalisation and the same case-collision
 * refusal the backend applies on every other route.
 */
import type { UpdatePinRequest } from '../../types/pins';

export type PageChoice =
  | { kind: 'none' }
  | { kind: 'existing'; pageId: string; title: string }
  | { kind: 'new'; name: string };

/**
 * The choice as the API takes it: `page_id` for an identity (null is
 * Ungrouped), `page` for a new title. `undefined` means the choice is not yet
 * a page — a new page with no name — and nothing should be sent. Whitespace
 * is trimmed here only to decide emptiness; the backend owns the real
 * normalisation, and sending the raw text keeps one rule in one place.
 */
export function choiceBody(choice: PageChoice): Pick<UpdatePinRequest, 'page_id' | 'page'> | undefined {
  switch (choice.kind) {
    case 'none':
      return { page_id: null };
    case 'existing':
      return { page_id: choice.pageId };
    case 'new':
      return choice.name.trim() ? { page: choice.name } : undefined;
  }
}

/** Whether the choice can be sent. */
export function isChoiceReady(choice: PageChoice): boolean {
  return choiceBody(choice) !== undefined;
}

/**
 * The choice a pin is currently making, from where it sits.
 *
 * A pin on a page is `existing` by that page's id, whether or not the
 * picker's list has loaded — the pin's own row is the fact and the list is
 * a courtesy. A pin with no page is `none`.
 */
export function choiceFor(pin: { page_id: string | null; page: string | null }): PageChoice {
  return pin.page_id === null
    ? { kind: 'none' }
    : { kind: 'existing', pageId: pin.page_id, title: pin.page ?? '' };
}

/**
 * Whether a move to this choice would change anything.
 *
 * A no-op move is refused client-side so the Move control cannot be used as
 * a Refresh in disguise: moving a pin to the page it is on would look like
 * it did something and would do nothing, which is the kind of gap a person
 * fills in with a guess.
 */
export function movesPin(currentPageId: string | null, choice: PageChoice): boolean {
  const body = choiceBody(choice);
  if (body === undefined) return false;
  if ('page' in body) return true;               // a new page is always elsewhere
  return body.page_id !== currentPageId;
}
