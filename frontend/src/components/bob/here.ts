/**
 * WHERE THE PERSON IS STANDING, as a decision the suite can hold (W1.4,
 * 2026-09-22: "alive on every page").
 *
 * UI rule 1: Bob is on every page, not a page you navigate to, and receives
 * that page as context. Until this card he was on Bob's own screens only; the
 * BI pages (/dashboard, /analytics, /warehouse, /packing, /vending) had no ask
 * line, and asking from anywhere else took you to /bob. Now one line is
 * mounted above both chromes and he answers IN PLACE, beside the page.
 *
 * EACH PAGE REGISTERS WHAT IT IS AND WHAT IT SHOWS. A kept page registers its
 * `page_id` (an identity: it binds view_page and edit_page on the server);
 * a BI page its key, its tab, the subjects it is drawn for and its window —
 * names and dates, never a figure. A page that registers nothing is still
 * named, from its path (`hereForPath`), so nested paths have a name too.
 *
 * THE CONVERSATION FOLLOWS THE PAGE. This reverses DECISIONS 2026-09-08,
 * "scope belongs to the thread": a question asked from a page other than the
 * one the open thread was asked from starts a new thread there
 * (`pageScope.askPlan`). `whereOf` is the identity that comparison uses.
 */
import { PAGES } from '../../constants/pages';
import type { PageScope } from '../../types/bob';
import { pageContextFor, UNGROUPED_NAME } from './pageShape';

/** The dates a screen shows, as its own date control holds them (YYYY-MM-DD). */
export interface HereWindow {
  start: string;
  end: string;
}

/** A page's account of itself. Names and dates, never a figure. */
export interface Here {
  /** The screen's key: its access key, or a room screen's own. */
  key: string;
  /** What it is called. */
  label: string;
  /** The tab it is on, where it has tabs. */
  view?: string | null;
  /** A kept page's identity. Absent on every other screen. */
  page?: PageScope;
  /** The subjects it is drawn for, by name. */
  subjects?: string[];
  /** The dates it is showing. */
  window?: HereWindow | null;
}

/** What the server takes as `screen` — the frame without the kept-page identity. */
export interface ScreenFrame {
  key: string;
  label: string;
  view?: string;
  subjects?: string[];
  window?: HereWindow;
}

/** The subjects a screen may name to Bob: surface.desk.context.max_drawn_subjects. */
export const MAX_SCREEN_SUBJECTS = 12;

/**
 * The screens that are not in PAGES — Bob's own rooms — and what each is
 * called. Longest prefix wins, so `/pages/<id>` is a kept page and not "Pages".
 */
const ROOMS: { path: string; key: string; label: string }[] = [
  { path: '/inbox', key: 'inbox', label: 'Needs you' },
  { path: '/pages', key: 'pages', label: 'Kept pages' },
  { path: '/workflows', key: 'workflows', label: 'Systems' },
  { path: '/watches', key: 'watches', label: 'Watches · standing questions' },
  { path: '/vending', key: 'vending', label: 'Vending' },
];

/**
 * A screen named from its path alone, for a page that registered nothing.
 *
 * NESTED PATHS HAVE A NAME (the bug at RoomShell.tsx:57): the lookup matched
 * a path exactly, so `/pages/<id>` and `/admin/page-access/x` were "this
 * screen". The longest registered prefix names it now.
 */
export function hereForPath(pathname: string): Here {
  const path = pathname.replace(/\/+$/, '') || '/';
  const candidates = [
    ...PAGES.map((p) => ({ path: p.path, key: p.key, label: p.label })),
    ...ROOMS,
  ].filter((c) => path === c.path || path.startsWith(`${c.path}/`));
  candidates.sort((a, b) => b.path.length - a.path.length);
  const hit = candidates[0];
  return hit ? { key: hit.key, label: hit.label } : { key: 'screen', label: 'this screen' };
}

/**
 * The identity the conversation follows. A kept page is its id (Ungrouped is
 * a real place with no row); every other screen is its key. A tab, a subject
 * or a window is what the page SHOWS and not which page it is, so changing
 * one continues the conversation rather than starting another.
 */
export function whereOf(here: Here): string {
  if (here.page) return `page:${here.page.page_id ?? 'ungrouped'}`;
  return `screen:${here.key}`;
}

/** The screen as the server takes it: bounded, names and dates only. */
export function screenFrame(here: Here): ScreenFrame {
  const subjects = (here.subjects ?? [])
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_SCREEN_SUBJECTS);
  return {
    key: here.key,
    label: here.label.slice(0, 60),
    ...(here.view ? { view: here.view.slice(0, 60) } : {}),
    ...(subjects.length ? { subjects } : {}),
    ...(here.window ? { window: here.window } : {}),
  };
}

/**
 * What a question asked from `here` travels with.
 *
 * A kept page sends its identity as `pageScope` (the server injects the page's
 * reader and writer, bound to this caller and this page) and its name as the
 * display string, exactly as the page's own ask used to. Every other screen
 * sends its account of itself as `screen`.
 */
export function askFrom(here: Here): {
  where: string;
  pageContext: string;
  pageScope?: PageScope;
  screen?: ScreenFrame;
} {
  if (here.page) {
    const title = here.page.page_id === null ? null : (here.page.title ?? here.label);
    return { where: whereOf(here), pageContext: pageContextFor(title), pageScope: here.page };
  }
  return { where: whereOf(here), pageContext: here.label.slice(0, 100), screen: screenFrame(here) };
}

/** What the line calls where you are. */
export function placeholderFor(here: Here): string {
  if (here.page) return `ask about ${here.page.page_id === null ? UNGROUPED_NAME : (here.page.title ?? 'this page')}`;
  return `ask about ${(here.view ?? here.label).toLowerCase()}`;
}

/**
 * Where the one line is drawn. Everywhere a person can be, except Bob's own
 * room — whose composer IS the line — the print sheet, which is paper, and the
 * legacy NL→SQL chat, which has a composer of its own and is not Bob.
 */
export function lineShownAt(pathname: string): boolean {
  if (pathname === '/bob' || pathname.startsWith('/w/') || pathname.startsWith('/george')) return false;
  if (pathname.startsWith('/w2') || pathname === '/ask' || pathname.startsWith('/ask/')) return false;
  if (/^\/packing\/[^/]+\/print/.test(pathname)) return false;
  if (pathname === '/ai-chat' || pathname === '/no-access' || pathname === '/login') return false;
  return true;
}

/** Which chrome is under the line: Bob's rooms, or the BI app with its phone tab bar. */
export function chromeAt(pathname: string): 'room' | 'legacy' {
  return ['/inbox', '/pages', '/workflows', '/watches', '/storehub-imports'].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'room' : 'legacy';
}

/** A Date as the YYYY-MM-DD it is in Manila, which is how every window is read. */
export function manilaDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** A kept page's account of itself: its identity, and its name for the line. */
export function hereForKeptPage(pageId: string | null, title: string | null | undefined): Here {
  const name = pageId === null ? UNGROUPED_NAME : (title ?? 'this page');
  return {
    key: 'page',
    label: name,
    page: { page_id: pageId, title: pageId === null ? null : (title ?? null) },
  };
}

/** A date control's range as the window a screen shows, in Manila days. */
export function windowOf(range: { start?: unknown; end?: unknown } | null | undefined): HereWindow | null {
  if (!range || range.start == null || range.end == null) return null;
  const start = new Date(range.start as string | number | Date);
  const end = new Date(range.end as string | number | Date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start: manilaDay(start), end: manilaDay(end) };
}

/** The selected stores by the names the tools read them by, never a figure. */
export function storeNames(ids: string[], stores: { id: string; name: string }[]): string[] {
  const byId = new Map(stores.map((s) => [s.id, s.name]));
  return ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
}
