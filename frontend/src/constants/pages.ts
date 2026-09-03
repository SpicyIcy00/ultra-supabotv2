/**
 * The single source of truth mapping a role_page_access.page_key to its route.
 *
 * page_key values must stay in sync with PAGE_KEYS in
 * backend/app/models/role_page_access.py.
 */
export interface PageDef {
  key: string;
  path: string;
  label: string;
}

export const PAGES: PageDef[] = [
  { key: 'dashboard', path: '/', label: 'Dashboard' },
  { key: 'analytics', path: '/analytics', label: 'Analytics' },
  { key: 'ai_chat', path: '/ai-chat', label: 'AI Chat' },
  { key: 'george', path: '/george', label: 'George' },
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
  PAGES.find((p) => p.key === key)?.path ?? '/';

/**
 * Where to send a user who has landed somewhere they cannot see.
 * Follows PAGES order, so a warehouse_staff user with only 'packing' lands on
 * /packing rather than a dashboard they are not allowed to open.
 */
export const landingPathFor = (allowedPages: string[]): string => {
  const first = PAGES.find((p) => allowedPages.includes(p.key));
  return first?.path ?? '/no-access';
};
