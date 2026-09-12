/**
 * The single source of truth mapping a role_page_access.page_key to its route.
 *
 * page_key values must stay in sync with PAGE_KEYS in
 * backend/app/models/role_page_access.py.
 *
 * ORDER IS THE LANDING. `landingPathFor` takes the first allowed page, so the
 * dashboard comes first and a person lands in the BI app.
 *
 * GEORGE IS A PAGE AGAIN, AT `/george` (2026-09-12, the owner's decision).
 *
 * From 2026-09-09 to 2026-09-12 George had no path of its own: "/" RENDERED
 * the room, on the reading that George is the environment rather than a
 * destination. What that produced in practice was an app whose front door was
 * George and whose other pages — Dashboard, Analytics, Warehouse, Packing —
 * were still routed, still allowed, and reachable from nowhere a person
 * actually stood. The room's rail offers George's own screens and nothing
 * else, so landing there was a one-way door.
 *
 * The owner's words: "this is still supabot, just make george a page." The
 * product is Supabot BI; George is one page in it, in the same nav as the
 * rest, and "/" goes back to being a redirect to the first page a person is
 * allowed to see.
 */
export interface PageDef {
  key: string;
  path: string;
  label: string;
}

export const PAGES: PageDef[] = [
  // The dashboard leads, so "/" lands in the BI app. George sits beside it as
  // a page with its own path, which is what makes it reachable AND leavable.
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard' },
  { key: 'george', path: '/george', label: 'George' },
  { key: 'analytics', path: '/analytics', label: 'Analytics' },
  { key: 'ai_chat', path: '/ai-chat', label: 'AI Chat' },
  { key: 'warehouse', path: '/warehouse', label: 'Warehouse' },
  { key: 'packing', path: '/packing', label: 'Packing' },
  { key: 'settings', path: '/settings', label: 'Settings' },
  { key: 'admin', path: '/admin/page-access', label: 'Admin' },
];

// DELIBERATELY ABSENT: 'storehub_imports'.
//
// This array maps a page_key to a ROUTE, and no React route renders at
// /storehub-imports — only the API endpoint exists
// (POST /api/v1/storehub-imports/{kind}). An entry here would give
// landingPathFor and pathForPage a path that does not resolve.
//
// The page_key itself still exists in PAGE_KEYS (backend
// app/models/role_page_access.py) and is granted in role_page_access, because
// require_page("storehub_imports") reads that table directly and never consults
// this file. The endpoint stays reachable; it is simply not somewhere a person
// can click to. Add the entry when the page is built.

export const pathForPage = (key: string): string =>
  PAGES.find((p) => p.key === key)?.path ?? '/no-access';

/**
 * Where to send a user who has landed somewhere they cannot see.
 * Follows PAGES order, so a warehouse_staff user with only 'packing' lands on
 * /packing rather than a dashboard they are not allowed to open.
 */
export const landingPathFor = (allowedPages: string[]): string => {
  const first = PAGES.find((p) => allowedPages.includes(p.key));
  return first?.path ?? '/no-access';
};
