/**
 * What a page IS, from the pins that make it up.
 *
 * Kept apart from the component for the same reason postShape.ts and
 * workflowShape.ts are: these are decisions the suite can hold without a DOM.
 *
 * WHAT THIS FILE EXISTS TO FIX. The Pages list described each page by
 * counting it — "AJI BARN Reorder · 5 pins" — which tells a reader the one
 * thing about the page that does not matter. A page is a piece of software
 * George made with somebody: what it is FOR is the questions on it, and what
 * makes it worth opening is that the figures are read fresh when it opens.
 * Both of those are already in the pins list; neither was being shown.
 *
 * PURPOSE COMES FROM THE TITLES, NOT FROM A GUESS. A pin's title is the
 * question somebody asked, in their words. Listing the first few says what
 * the page is about more precisely than any description this file could
 * derive, and it cannot be wrong, because it is quoting rather than
 * summarising.
 *
 * FRESHNESS IS THE LAST SUCCESSFUL RUN, and it is provenance rather than a
 * figure: it says when these tiles last came back with something, not what
 * they said. A page whose pins have never run says so — "never" is a fact,
 * and rendering it as a blank would be the page claiming to be current.
 *
 * ORDER IS THE NEWEST PIN FIRST, so a page somebody is building sits above
 * one nobody has touched in a month. Ties keep the order the server sent.
 */
import type { Pin } from '../../types/pins';

/** How many pin titles stand in for the page's purpose before "and N more". */
export const CONTENTS_SHOWN = 3;

/** The name for the pins that belong to no page. It is a real page. */
export const UNGROUPED_NAME = 'Ungrouped';

export interface PageView {
  /** The page's key: its name, or null for the ungrouped pins. */
  page: string | null;
  name: string;
  /** Every pin on it, in the order given. */
  pins: Pin[];
  /** The first few titles, as the page's purpose in somebody's own words. */
  contents: string[];
  /** How many titles `contents` left out. */
  more: number;
  /** When any pin on it last came back with something, or null for never. */
  lastOk: string | null;
  /** The newest pin on it, which is what orders the list. */
  newest: string | null;
}

function maxIso(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

/**
 * Every page these pins belong to, newest first.
 *
 * Deliberately total over the list: a pin with no page joins the Ungrouped
 * page rather than being dropped, because "Ungrouped" holds the pins with no
 * page and that is exactly what it is for (CLAUDE.md).
 */
export function pagesOf(pins: Pin[]): PageView[] {
  const byPage = new Map<string | null, Pin[]>();
  for (const pin of pins) {
    const key = pin.page ?? null;
    const list = byPage.get(key);
    if (list) list.push(pin);
    else byPage.set(key, [pin]);
  }

  const views: PageView[] = [];
  for (const [page, group] of byPage) {
    let lastOk: string | null = null;
    let newest: string | null = null;
    for (const pin of group) {
      lastOk = maxIso(lastOk, pin.last_ok_at);
      newest = maxIso(newest, pin.created_at);
    }
    views.push({
      page,
      name: page ?? UNGROUPED_NAME,
      pins: group,
      contents: group.slice(0, CONTENTS_SHOWN).map((p) => p.title),
      more: Math.max(0, group.length - CONTENTS_SHOWN),
      lastOk,
      newest,
    });
  }

  // Newest pin first. A page with no timestamps at all sinks rather than
  // sorting arbitrarily against one that has them.
  return views.sort((a, b) => (b.newest ?? '').localeCompare(a.newest ?? ''));
}

/**
 * What the page says about its own freshness.
 *
 * PROVENANCE, NOT A FIGURE: when the tiles last came back, never what they
 * came back with. The `null` case says "never read" rather than going blank,
 * because a page with no time on it reads as a page that is up to date.
 */
export function freshness(lastOk: string | null, ago: (iso: string) => string): string {
  return lastOk ? `last read ${ago(lastOk)}` : 'never read';
}

/* ------------------------------------------------------------- the URL -- */

/** The `?p=` value that means the ungrouped pins. A real page, a real value. */
export const UNGROUPED_PARAM = '~';

/** Where a page lives, so a pin can link to the page it landed on. */
export function pagePath(page: string | null): string {
  return `/pages?p=${encodeURIComponent(page ?? UNGROUPED_PARAM)}`;
}

/* -------------------------------------------------------- page context -- */

/**
 * What Ask is told when a question starts from a page.
 *
 * THE PAGE'S IDENTITY AND NOTHING MORE. The loop renders this as "[The user
 * is on the … page.]", and that sentence must stay true: George is told
 * WHERE the person is, not WHAT is on the page. He cannot read a page's
 * pins — they live in a schema his read role cannot see — so a context that
 * named their figures, or implied he had looked, would be the app claiming
 * knowledge George does not have. Page-aware George is a later capability,
 * through an injected reader, and it is not manufactured here with words.
 *
 * Capped at the length the backend accepts (george.py: page_context
 * max_length=100), cut rather than rejected, because a long page name is
 * still a page name.
 */
export const PAGE_CONTEXT_MAX = 100;

export function pageContextFor(page: string | null): string {
  const name = page ?? UNGROUPED_NAME;
  return `Pages / ${name}`.slice(0, PAGE_CONTEXT_MAX);
}
