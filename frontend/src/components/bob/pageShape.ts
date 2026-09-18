/**
 * What a page IS, and where it lives.
 *
 * Kept apart from the components for the same reason postShape.ts and
 * workflowShape.ts are: these are decisions the suite can hold without a DOM.
 *
 * A PAGE IS A ROW NOW (2026-09-08, Page Workshop V1). Until then the Pages
 * list was derived by grouping the pins, and a page was its name. Both
 * changed together: a page has an id, a title, a purpose and a time it last
 * changed, and it can be EMPTY — which is a real state a list has to show,
 * not a grouping that happens to have no members. The pins still say what a
 * page is FOR: the first few titles, quoted rather than summarised, because
 * quoting cannot be wrong.
 *
 * IDENTITY IS THE ID. The route is `/pages/<id>`, the scope Ask binds to is
 * the id, and the title is presentation — rename a page and every link to it
 * still works. Ungrouped is `/pages/ungrouped`: a real place with no row,
 * because "the pins with no page" is a real thing and not a page anyone
 * named. The word "Ungrouped" is how the UI says null, and never an identity.
 *
 * FRESHNESS IS THE LAST SUCCESSFUL RUN, and it is provenance rather than a
 * figure: it says when these tiles last came back with something, not what
 * they said. A page whose pins have never run says so — "never" is a fact,
 * and rendering it as a blank would be the page claiming to be current.
 */
import type { Page, Pin } from '../../types/pins';

/** How many pin titles stand in for the page's purpose before "and N more". */
export const CONTENTS_SHOWN = 3;

/** The name for the pins that belong to no page. It is a real place, not a page. */
export const UNGROUPED_NAME = 'Ungrouped';

/** The route segment for the ungrouped pins. A real path, a real value. */
export const UNGROUPED_SEGMENT = 'ungrouped';

/** The `?p=` value the pre-2026-09-08 URL used for the ungrouped pins. */
export const LEGACY_UNGROUPED_PARAM = '~';

export interface PageView {
  /** The page's identity, or null for the ungrouped pins. */
  pageId: string | null;
  name: string;
  /** What the owner wrote about it, or null. Never for Ungrouped. */
  purpose: string | null;
  /** Every pin on it, in the page's order. */
  pins: Pin[];
  /** The first few titles, as the page's contents in somebody's own words. */
  contents: string[];
  /** How many titles `contents` left out. */
  more: number;
  /** When any pin on it last came back with something, or null for never. */
  lastOk: string | null;
  /** When the page itself last changed (a real page), or the newest pin (Ungrouped). */
  changedAt: string | null;
}

function maxIso(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return b > a ? b : a;
}

function view(pageId: string | null, name: string, purpose: string | null,
              pins: Pin[], changedAt: string | null): PageView {
  let lastOk: string | null = null;
  for (const pin of pins) lastOk = maxIso(lastOk, pin.last_ok_at);
  return {
    pageId, name, purpose, pins,
    contents: pins.slice(0, CONTENTS_SHOWN).map((p) => p.title),
    more: Math.max(0, pins.length - CONTENTS_SHOWN),
    lastOk,
    changedAt,
  };
}

/**
 * The Pages list: every real page in the order the server gave (most recently
 * changed first), empty ones included, then Ungrouped when there is anything
 * in it. Pins are attached by page_id; a pin whose page is not in the list
 * (the list is stale, or the page was just deleted) still counts as
 * ungrouped rather than being dropped — total over the pins, always.
 */
export function pageViews(pages: Page[], pins: Pin[]): PageView[] {
  const byPage = new Map<string, Pin[]>();
  const known = new Set(pages.map((p) => p.id));
  const loose: Pin[] = [];
  for (const pin of pins) {
    if (pin.page_id && known.has(pin.page_id)) {
      const list = byPage.get(pin.page_id);
      if (list) list.push(pin);
      else byPage.set(pin.page_id, [pin]);
    } else {
      loose.push(pin);
    }
  }
  const sortedByPosition = (list: Pin[]) =>
    [...list].sort((a, b) => a.position - b.position || (b.created_at > a.created_at ? 1 : -1));

  const views = pages.map((p) =>
    view(p.id, p.title, p.purpose, sortedByPosition(byPage.get(p.id) ?? []), p.updated_at),
  );
  if (loose.length > 0) {
    const newestFirst = [...loose].sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
    views.push(view(null, UNGROUPED_NAME, null, newestFirst, newestFirst[0]?.created_at ?? null));
  }
  return views;
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

/** Where a page lives, by identity. Ungrouped by its segment. */
export function pagePath(pageId: string | null): string {
  return `/pages/${pageId ?? UNGROUPED_SEGMENT}`;
}

/** The page a route segment names: null for Ungrouped, the id otherwise. */
export function pageIdFromSegment(segment: string): string | null {
  return segment === UNGROUPED_SEGMENT ? null : segment;
}

/**
 * Where a pre-2026-09-08 link (`/pages?p=<name>`, `/pages?p=~`) goes now.
 *
 * Resolved against the caller's CURRENT pages by exact title, as the server
 * resolves a legacy thread scope: a match is that page's path; the marker is
 * Ungrouped; a title nobody has any more is null, and the caller says so
 * rather than guessing.
 */
export function legacyPagePath(param: string, pages: Page[]): string | null {
  if (param === LEGACY_UNGROUPED_PARAM) return pagePath(null);
  const match = pages.find((p) => p.title === param);
  return match ? pagePath(match.id) : null;
}

/* -------------------------------------------------------- page context -- */

/**
 * What Ask is told, in words, when a question starts from a page.
 *
 * THE PAGE'S NAME AND NOTHING MORE. The loop reads this out as context, and
 * the identity travels separately as the scope (pageScope.ts) — a name is
 * never parsed back into an identity. Capped at the length the backend
 * accepts (bob.py: page_context max_length=100), cut rather than rejected,
 * because a long page name is still a page name.
 */
export const PAGE_CONTEXT_MAX = 100;

export function pageContextFor(title: string | null): string {
  const name = title ?? UNGROUPED_NAME;
  return `Pages / ${name}`.slice(0, PAGE_CONTEXT_MAX);
}
