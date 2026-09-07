/**
 * What the shell's navigation offers, as a decision the suite can hold.
 *
 * Kept apart from GeorgeShell.tsx for the same reason approvalState.ts is kept
 * apart from the panel that draws it: which links a person sees is a claim
 * about their access, and a claim is tested here without a DOM.
 *
 * TWO GROUPS, AND THE ORDER IS THE PRODUCT. The primary five are George's
 * environment — Today, Ask, Inbox, Pages, Workflows — and all five sit behind
 * the one `george` page key, so a person either has George or does not.
 * Operations is the migration boundary: the dashboards and the operational
 * tools that already exist, reachable, secondary, and not going anywhere.
 * Warehouse, Packing, Barcodes and the rest are business applications, not
 * pages to be retired; George may one day orchestrate them, and they will
 * still be here.
 *
 * Every item carries its `role_page_access` key and is filtered by the
 * caller's allowed pages, so nobody sees a link they cannot open. The server
 * re-checks every request regardless (app/core/deps.py); this is courtesy.
 */

export interface NavItem {
  label: string;
  path: string;
  /** The role_page_access.page_key that shows this item. */
  page: string;
  /** Whether a location belongs to this item. */
  matches: (pathname: string) => boolean;
}

const under = (root: string) => (p: string) => p === root || p.startsWith(`${root}/`);

/** George's environment. One page key for all five. */
export const PRIMARY: NavItem[] = [
  { label: 'Today', path: '/today', page: 'george', matches: under('/today') },
  { label: 'Ask', path: '/ask', page: 'george', matches: under('/ask') },
  { label: 'Inbox', path: '/inbox', page: 'george', matches: under('/inbox') },
  { label: 'Pages', path: '/pages', page: 'george', matches: under('/pages') },
  { label: 'Workflows', path: '/workflows', page: 'george', matches: under('/workflows') },
];

/**
 * The existing application, kept whole. Same keys the legacy sidebar uses.
 *
 * AI CHAT IS NOT HERE, AND ITS ROUTE STILL IS. The legacy NL->SQL chatbot
 * generates freehand SQL from a schema prompt — the exact pattern George's
 * architecture rules forbid — and offering it inside George's own environment
 * would put two answering machines a word apart, one of which cannot show a
 * receipt. Nothing in George reads it: no store, no service and no component
 * outside AIChatPage itself touches it.
 *
 * So it is removed from THIS list only. /ai-chat still resolves, the page
 * still works, the `ai_chat` page key still grants it, and the legacy chrome
 * still links to it under its own name. Anyone who relies on it keeps it;
 * George simply does not offer it as one of his own.
 */
export const OPERATIONS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', page: 'dashboard',
    matches: (p) => p === '/dashboard' || p === '/vending' },
  { label: 'Analytics', path: '/analytics', page: 'analytics', matches: under('/analytics') },
  { label: 'Warehouse', path: '/warehouse', page: 'warehouse', matches: under('/warehouse') },
  { label: 'Packing', path: '/packing', page: 'packing', matches: under('/packing') },
  { label: 'Settings', path: '/settings', page: 'settings', matches: under('/settings') },
  { label: 'Admin', path: '/admin/page-access', page: 'admin', matches: under('/admin') },
];

/** The three that fit a phone's bottom bar; the rest live behind More. */
export const PHONE_TABS = ['/today', '/ask', '/inbox'];

export function primaryFor(allowedPages: string[]): NavItem[] {
  return PRIMARY.filter((i) => allowedPages.includes(i.page));
}

export function operationsFor(allowedPages: string[]): NavItem[] {
  return OPERATIONS.filter((i) => allowedPages.includes(i.page));
}

export function phoneTabs(allowedPages: string[]): NavItem[] {
  return primaryFor(allowedPages).filter((i) => PHONE_TABS.includes(i.path));
}

/** The primary items that do NOT fit the bottom bar, for the More sheet. */
export function phoneMore(allowedPages: string[]): NavItem[] {
  return primaryFor(allowedPages).filter((i) => !PHONE_TABS.includes(i.path));
}

export function isActive(item: NavItem, pathname: string): boolean {
  return item.matches(pathname);
}
