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
  // NO ROUTE EXISTS FOR THIS YET. The import endpoint
  // (POST /api/v1/storehub-imports/{kind}) is built and the page key is granted
  // through the admin screen, but no React page renders at this path.
  //
  // It is placed LATE deliberately. landingPathFor returns the first page in
  // this array the user is allowed, so a user who also has any real page lands
  // there instead. Only someone granted storehub_imports and NOTHING ELSE would
  // be sent to a route that does not resolve — which is not a grant that makes
  // sense on its own. Move this up once the page exists.
  { key: 'storehub_imports', path: '/storehub-imports', label: 'StoreHub Imports' },
  { key: 'admin', path: '/admin/page-access', label: 'Admin' },
];

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
